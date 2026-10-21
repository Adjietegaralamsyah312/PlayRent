# FE-001 — Report: `VITE_API_BASE_URL` untuk Frontend PlayRent

> Agent: @frontend-react · Task: FE-001 · Mode: balanced
> Kontrak acuan: `specs/deploy-contract.md` (baca langsung dari disk, tidak diminta via Leader).

---

## 1. File yang diubah + ringkasan

| File                                | Status | Ringkasan                                                                                             |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `web/src/lib/api.ts`                | modif  | Tambah konstanta `API_BASE_URL` + helper `apiUrl()`. `request()`, `transactions.receiptUrl()`, `reports.exportCsvUrl()` sekarang memakai base tersebut. |
| `web/src/vite-env.d.ts`             | modif  | Tambah augmentasi `interface ImportMetaEnv { readonly VITE_API_BASE_URL?: string }` → env ter-typed, bukan `any`. |
| `web/tsconfig.json`                 | —      | Tidak perlu diubah. `vite-env.d.ts` sudah ada di `src/` dan sudah ikut ter-*include* oleh `"include": ["src", "vite.config.ts"]`. |

### Detail implementasi (`web/src/lib/api.ts`)

```ts
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

/** URL untuk path API (tanpa prefix `/api`). Absolut bila origin API diset, relatif bila tidak. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}/api${suffix}`;
}
```

- **Normalisasi**: `trim()` lalu buang trailing `/` berulang (`/\/+$/`). `https://host/`, `https://host//` → `https://host`.
- **Base kosong** → `API_BASE_URL === ''` → hasil `/api/...` relatif → proxy dev Vite (`web/vite.config.ts` → `http://127.0.0.1:4000`). Perilaku dev **tidak berubah**.
- **Base terisi** → hasil absolut `https://<tunnel-host>/api/...`.
- **Perbaikan bug produksi**: `receiptUrl()` dan `exportCsvUrl()` sebelumnya mengembalikan path relatif hardcoded `/api/...`; dari GitHub Pages itu menunjuk ke domain `github.io` dan 404. Sekarang keduanya lewat `apiUrl()` yang sama → konsisten dengan `request()`.
- `credentials: 'include'` tetap di setiap request (terverifikasi masih ada di bundle: `credentials:"include"`).
- **Tidak ada perubahan lain**: struktur envelope `{success,data,error,meta}`, kelas `ApiError`, handler 401 (`onUnauthorized` / `skipAuthRedirect`), `buildQuery()`, dan seluruh signature fungsi yang dipakai halaman lain tetap sama. Hanya isi URL yang berubah.
- Helper baru diekspor dengan nama `apiUrl` — sudah dicek, **tidak bentrok** dengan simbol lain (`grep -rn "apiUrl" web/src/` → 0 hit sebelum perubahan).

### Yang TIDAK disentuh (sesuai scope)

`web/src/lib/receipt.ts` (`transactions.receiptUrl()`) dan `web/src/pages/Reports.tsx` (`reports.exportCsvUrl()`) tidak diedit — keduanya otomatis mendapat URL benar karena pemanggilnya berubah di dalam `api.ts`.

---

## 2. Output verifikasi + bukti bundling env

### 2.1 Typecheck

```
$ cd web && npm run typecheck
> playrent-web@1.0.0 typecheck
> node node_modules/typescript/bin/tsc --noEmit
EXIT=0
```

✅ Tidak ada error TS.

### 2.2 Build produksi

```
$ cd web && npx vite build --base=/PlayRent/
sh: 1: vite: not found
```

⚠️ `npx` di environment Termux ini tidak me-resolve binary lokal. Diganti perintah yang **sama persis** dengan script `build` di `package.json` (`node node_modules/vite/bin/vite.js build`), yang menunjuk binary vite yang sama:

```
$ cd web && node node_modules/vite/bin/vite.js build --base=/PlayRent/
vite v6.4.4 building for production...
✓ 1647 modules transformed.
dist/index.html                   0.91 kB │ gzip:   0.48 kB
dist/assets/index-BuQklcga.css   33.61 kB │ gzip:   7.30 kB
dist/assets/index-DO3Hgrm7.js   486.40 kB │ gzip: 137.76 kB
✓ built in 15.62s
```

✅ Build sukses, 0 error.

### 2.3 Bukti env ikut ter-bundle (build dengan env fake)

```
$ cd web && VITE_API_BASE_URL=https://api.contoh.test node node_modules/vite/bin/vite.js build
✓ 1647 modules transformed.
dist/assets/index-9uMyh1ZP.js   486.41 kB │ gzip: 137.77 kB
✓ built in 14.17s

$ grep -c "https://api.contoh.test" dist/assets/*.js
dist/assets/index-9uMyh1ZP.js:1        ← 1 hit

$ grep -o '.\{40\}https://api.contoh.test.\{60\}' dist/assets/*.js
oString();return o?`?${o}`:""}const k2="https://api.contoh.test".trim().replace(/\/+$/,"");function yf(s){const u=s.startsW
```

✅ Terbukti: `VITE_API_BASE_URL` **di-inline ke bundle** oleh Vite saat build, lalu dinormalisasi saat runtime (`.trim().replace(/\/+$/,"")`).

### 2.4 Build ulang TANPA env (agar `web/dist` tidak berisi URL fake)

```
$ cd web && rm -rf dist && node node_modules/vite/bin/vite.js build --base=/PlayRent/
✓ built in 12.87s

$ grep -c "api.contoh.test" dist/assets/*.js
0        ← 0 matches (good)
```

✅ `web/dist` sekarang bersih (juga sudah gitignored, tidak di-commit).

### 2.5 Bukti perilaku relatif (bundle tanpa env)

```
$ grep -o '.\{60\}/api.\{40\}' dist/assets/*.js
ction yf(s){const u=s.startsWith("/")?s:`/${s}`;return`${k2}/api${u}`}async function xe(s,u={}){var g,m,
```

→ `k2` = `API_BASE_URL` = `""` (empty) → URL relatif `/api/...`. Tidak ada origin hardcoded di bundle.

### 2.6 Cek runtime tambahan (modul asli, di luar repo)

Bundle `web/src/lib/api.ts` **apa adanya** dengan esbuild (2 varian: base kosong & base `https://api.contoh.test//`), lalu `fetch` di-stub untuk menangkap URL:

```
$ node check.mjs
ok  - dev (no base): request() -> /api/auth/login
ok  - dev (no base): request()+query -> /api/transactions?from=2026-01-01&page=2
ok  - dev (no base): receiptUrl -> /api/transactions/7/receipt?format=html&print=1
ok  - dev (no base): exportCsvUrl -> /api/reports/export.csv?type=daily&from=2026-01-01
ok  - dev (no base): apiUrl('/x') -> /api/x
ok  - dev (no base): apiUrl('x') (no leading slash) -> /api/x
ok  - prod (base, trailing //): request() -> https://api.contoh.test/api/auth/login
ok  - prod (base, trailing //): request()+query -> https://api.contoh.test/api/transactions?from=2026-01-01&page=2
ok  - prod (base, trailing //): receiptUrl -> https://api.contoh.test/api/transactions/7/receipt?format=html&print=1
ok  - prod (base, trailing //): exportCsvUrl -> https://api.contoh.test/api/reports/export.csv?type=daily&from=2026-01-01
ok  - prod (base, trailing //): apiUrl('/x') -> https://api.contoh.test/api/x
ok  - prod (base, trailing //): apiUrl('x') (no leading slash) -> https://api.contoh.test/api/x
RESULT: PASS
```

Catatan: varian base memakai trailing `//` untuk membuktikan normalisasi (tetap `https://api.contoh.test`, bukan `.../api`).
Script ini berada di luar repo (`/data/data/com.termux/files/usr/tmp/opencode/fe001/`) — tidak melanggar scope file.

---

## 3. Status verifikasi

**`verified`** — typecheck ✅, build ✅ (2×: dengan & tanpa env), bukti bundling env ✅, bukti runtime ✅, diff bersih ✅, tidak ada `console.log` baru ✅, tidak ada import tak terpakai ✅.

Perilaku `VITE_API_BASE_URL`:

| Situasi                                | `API_BASE_URL` | Request ke API                                      | Yang dipakai di browser             |
| -------------------------------------- | --------------- | ---------------------------------------------------- | ------------------------------------ |
| Tidak diset / kosong (dev)             | `''`            | `/api/auth/login` (relatif)                         | Proxy Vite dev → `127.0.0.1:4000`    |
| `https://api.contoh.test` (produksi)   | `https://api.contoh.test` | `https://api.contoh.test/api/auth/login` (absolut) | Tunnel Cloudflare → `127.0.0.1:4000` |

`receiptUrl()` dan `exportCsvUrl()` mengikuti tabel yang sama persis (keduanya sebelumnya hardcoded relatif → bug 404 di Pages, sekarang ikut base).

---

## 4. Yang TIDAK bisa diverifikasi tanpa backend sungguhan

Semua item berikut berada di luar kendali frontend dan **wajib** diverifikasi manual setelah backend + tunnel + Pages aktif:

1. **Cookie lintas situs** — butuh `SameSite=None; Secure` dari server (`COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`). HEADER cookie harus `Secure` bersamaan dengan `SameSite=None` (kontrak §2). Bukan urusan frontend.
2. **Kebijakan cookie pihak ketiga browser** — Safari ITP, mode privasi, dan perubahan cookie 3P di Chrome bisa memblokir `pr_session` meski header sudah benar. **Build sukses ≠ login pasti berhasil** (kontrak §5).
3. **CORS + CSRF** — `Access-Control-Allow-Origin` harus mengembalikan origin Pages yang cocok (`https://adjietegaralamsyah312.github.io`, tanpa path `/PlayRent`), bukan `*`; `csrfGuard` harus menerima origin tersebut pada request tulis. Perlu request OPTIONS nyata untuk membuktikan.
4. **Ketersediaan tunnel** — hostname tunnel benar, TLS valid, dan `127.0.0.1:4000` hidup di mesin yang sama dengan tunnel. Tidak bisa dibuktikan dari sisi frontend.
5. **Isi `vars.VITE_API_BASE_URL` di GitHub Actions** — repository variable harus diisi dengan origin API (tanpa trailing slash, tanpa `/api`). Implementasi CI ada di luar scope FE-001 (milik DO-001); yang perlu dipastikan: nilainya **tanpa** trailing `/` dan **tanpa** `/api` (kalau trailing slash ada, normalisasi di atas tetap menanganinya; kalau `/api` ikut ter-set, hasilnya jadi `/api/api/...`).
6. **Rendering receipt & CSV di origin API** — `receiptUrl()` kini membuka tab baru lintas situs; `window.open` bisa diblokir popup-blocker bila tidak dipicu klik pengguna. Perlu cek manual di browser sungguhan.
7. **Akses via `localhost:5173` sebagai alamat publik** — dilarang (kontrak §6); dev tetap memakai proxy lokal seperti biasa.

### Perintah verifikasi manual yang disarankan (setelah backend aktif)

```sh
# 1. Pastikan env ter-bundle di artifact Pages
grep -c "<origin-api>" dist/assets/*.js     # harus >= 1

# 2. Cek header cookie dari origin API (harus HttpOnly; SameSite=None; Secure)
curl -i -X POST https://<origin-api>/api/auth/login \
  -H 'Content-Type: application/json' -H 'Origin: https://adjietegaralamsyah312.github.io' \
  -d '{"username":"...","password":"..."}' | grep -i set-cookie

# 3. CORS preflight dari origin Pages
curl -i -X OPTIONS https://<origin-api>/api/auth/login \
  -H 'Origin: https://adjietegaralamsyah312.github.io' \
  -H 'Access-Control-Request-Method: POST' | grep -i 'access-control'
```
