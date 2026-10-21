# BE-001 — Laporan Implementasi Kontrak Deploy Lintas-Situs

> ⚠️ **DOKUMEN INI DISUPERSEDE SEBAGIAN.** Temuan review RV-001 (HIGH-1) memperbaiki
> `TRUST_PROXY`: sekarang **jumlah hop** (angka), bukan boolean — `TRUST_PROXY=1` di belakang
> Cloudflare Tunnel, **jangan** `true`. Semua menyebut `TRUST_PROXY=true` di bawah ini (risiko 2,
> tabel env §5, contoh `.env`) **usang**. Sumber kebenaran: `specs/be002-report.md` +
> `specs/deployment-guide.md` §3.2.

> Agen: @node-developer · Task: BE-001 · Mode: thorough
> Kontrak acuan: `specs/deploy-contract.md` (single source of truth — dibaca langsung dari disk)
> Tanggal: 2026-10-21

---

## 1. File yang diubah + ringkasan per file

| File | Perubahan |
| --- | --- |
| `server/src/config.js` | Env reader jadi **runtime** (bukan konstanta beku saat import): `corsOrigins()`, `cookieSameSite()`, `cookieSecure()`, `trustProxy()`. Default produksi `corsOrigins()` = `['https://adjietegaralamsyah312.github.io']` (tanpa path `/PlayRent`); default dev = `['http://localhost:5173','http://127.0.0.1:5173']`. `COOKIE_SAME_SITE` menerima `lax\|strict\|none` (case-insensitive), nilai tak dikenal → fallback default (prod `none`, selain itu `lax`), tidak pernah error. `COOKIE_SECURE` tetap `true/false/kosong → ikut NODE_ENV`. `TRUST_PROXY` tetap default `false` (alasan anti-spoof XFF dipertahankan). `export const isProd` dipertahankan sebagai snapshot import-time karena `server/tools/security-probe.mjs` membacanya dari child process (di luar scope BE-001). |
| `server/src/lib/auth.js` | `sessionCookieOptions()` = satu-satunya sumber atribut cookie sesi: `httpOnly` selalu `true`, `path=/`, tanpa `Domain`, `sameSite` dari `cookieSameSite()`, `secure` dari `cookieSecure()`. **Invarian**: `sameSite='none'` tanpa `secure=true` → turun ke `'lax'` (browser membuang `SameSite=None` tanpa `Secure`). `setSessionCookie` **dan** `clearSessionCookie` memakai helper yang sama → atribut identik (kalau tidak, cookie lama tidak terhapus saat logout). `csrfGuard` sekarang memakai `corsOrigins()` + origin API sendiri (`${req.protocol}://${host}`); hardcode `'http://127.0.0.1:5173'` dan hardcode `corsOrigin` tunggal dihapus. Tidak ada env yang bisa mematikan CSRF. |
| `server/src/app.js` | CORS jadi allowlist, **tanpa `*`**: `cors((req, cb) => cb(null, { origin: corsOrigins(), credentials: true }))` — allowlist dievaluasi ulang per request. `Access-Control-Allow-Origin` hanya muncul bila origin cocok (nilai spesifiknya, bukan wildcard) dan `Access-Control-Allow-Credentials: true` tetap. `app.set('trust proxy', trustProxy())` (dibaca saat `createApp`). |
| `server/package.json` | **BUG FIX**: `start` → `node --env-file-if-exists=.env src/index.js`, `dev` → `node --env-file-if-exists=.env --watch src/index.js`. Sebelumnya `server/.env` **tidak pernah dimuat** (dokumentasi di README tapi tidak ada dotenv/flag) → semua env operator tidak berefek. Tanpa dependency baru. `npm test` (`node --test`) sengaja **tidak** memuat `.env` agar env test tidak tercemar. |
| `server/.env.example` | Tambah `COOKIE_SAME_SITE` (nilai + default + perilaku nilai tak dikenal), komentar `CORS_ORIGIN` comma-separated + contoh produksi, dan catatan kombinasi lintas-situs (`SameSite=None` **wajib** berpasangan dengan `Secure`). Tidak ada secret. |
| `server/test/deploy.test.js` (baru) | 13 test `node:test` + `node:assert/strict` memakai `withServer` dari `./helpers.js` (helpers tidak diubah). Env tiap kasus disetel & dipulihkan di `finally` (tidak bocor ke test lain). |
| `server/test/auth.test.js` | Assertion `SameSite=Lax` yang hardcoded diganti **config-aware**: bandingkan dengan `sessionCookieOptions()` (nilai efektif dari `config.js`) + cek `Secure`/`Path`/`HttpOnly`/tanpa `Domain`. Default saat ini tetap `Lax` (dev), jadi hasil test tidak berubah — hanya jadi tahan perubahan default. |

Tidak disentuh (sesuai scope): `web/**`, `.github/**`, `README.md`, `docs/**`, `server/src/schema.sql`, `server/data/**`, `server/src/seed.js`, `admin-bootstrap.js`, `restore.js`, `backup.js`, `server/tools/**`, `server/test/helpers.js`.

---

## 2. Hasil test

```
$ cd server && npm test
ℹ tests 109
ℹ suites 0
ℹ pass 109
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~32–43s
```

- Baseline sebelum perubahan: **96 pass / 0 fail**.
- Setelah perubahan: **109 pass / 0 fail** (= 96 + 13 test baru `deploy.test.js`).
- Tidak ada test lama yang gagal; tidak ada test yang di-skip.

Verifikasi tambahan (di luar `npm test`):

| Cek | Hasil |
| --- | --- |
| `node tools/security-probe.mjs` (regression CORS/CSRF/cookie) | `blockers=0 majors=0 minors=0 total=69` → **VERDICT: PASS** |
| Boot nyata `npm start` dengan `server/.env` sementara (NODE_ENV=production, DB ke scratch dir, lalu `.env` dihapus) | `[playrent] listening … env=production`; preflight `OPTIONS /api/auth/login` dengan `Origin: https://adjietegaralamsyah312.github.io` → `204`, `Access-Control-Allow-Origin: https://adjietegaralamsyah312.github.io` (bukan `*`), `Access-Control-Allow-Credentials: true` |
| `--env-file-if-exists` | file terbaca ✓; env process **menang** atas file ✓; file tidak ada → lanjut tanpa error ✓ |
| `git status` | hanya file di scope BE-001 yang berubah (perubahan `web/*` yang ada sebelumnya milik FE-001, tidak disentuh) |

Cakupan `server/test/deploy.test.js` (13 kasus):

1. Login cross-site → `200`, `Set-Cookie` memuat `HttpOnly`, `SameSite=None`, `Secure`, `Path=/`, **tanpa** `Domain`.
2. `/api/auth/me` dengan cookie tersebut → `200` + user yang benar (alur lintas situs utuh).
3. `/api/auth/logout` → `200` + clear cookie dengan atribut identik (`SameSite`/`Secure`/`Path`) dan `Expires` di masa lalu.
4. `/api/auth/register` → `201`, role `user` (ditentukan server), **tanpa** cookie sesi.
5. Origin asing pada request tulis → `403` + `CSRF_ORIGIN_MISMATCH`.
6. Preflight `OPTIONS /api/auth/login` origin yang diizinkan → `Access-Control-Allow-Origin` = origin itu (bukan `*`) + `Access-Control-Allow-Credentials: true`.
7. Origin asing → **tanpa** header `Access-Control-Allow-Origin`.
8. Default produksi: `corsOrigins()` persis `['https://adjietegaralamsyah312.github.io']`, tanpa `/PlayRent`; default dev memuat kedua origin Vite.
9. Invarian: `COOKIE_SECURE=false` + `COOKIE_SAME_SITE=none` → cookie jadi `SameSite=Lax` (tanpa `Secure`).
10. `COOKIE_SAME_SITE` tak dikenal → fallback default, login tetap jalan (tidak crash).
11. Kedua origin dev (`localhost:5173`, `127.0.0.1:5173`) diterima tanpa hardcoded host.
12. Origin API sendiri selalu boleh untuk CSRF.
13. `sessionCookieOptions()` = sumber tunggal atribut cookie.

---

## 3. Status verifikasi

**`verified`**

Semua requirement A–F terimplementasi dan terbukti lewat `npm test` (109/109 hijau) + probe keamanan + boot nyata. Tidak ada bagian yang hanya "diasumsikan benar".

---

## 4. Risiko / limitasi yang tersisa

1. **Cookie pihak ketiga tetap bisa diblokir browser.** `SameSite=None; Secure` *hanya* dikirim bila browser mengizinkan cookie 3P. Safari ITP memblokir cookie 3P di banyak konteks; mode privasi/ekstensi browser dan kebijakan 3P Chrome yang sedang berubah juga interferes. **Build sukses ≠ login pasti berhasil** → wajib verifikasi manual dari URL publik (kontrak §5). Fallback: sajikan SPA dari origin yang sama lewat tunnel (cookie jadi first-party, `SameSite=Lax` cukup).
2. **`TRUST_PROXY=true` wajib di belakang Cloudflare Tunnel.** Default tetap `false` (anti-spoof XFF untuk rate-limit login, AUTH-10). Kalau tidak di-set: `req.ip` = IP tunnel (semua klien berbagi satu bucket rate-limit) dan `req.protocol` = `http` sehingga origin API yang dihitung CSRF jadi `http://<host>` (bukan `https://`) — request dari frontend tetap lolos karena `https://adjietegaralamsyah312.github.io` ada di allowlist, tapi rate-limit jadi kasar. Set `TRUST_PROXY=true` **hanya** kalau server benar-benar di belakang reverse proxy tepercaya.
3. **`NODE_ENV=production` wajib** di `server/.env`: default `SameSite=None` dan `Secure=true` hanya aktif di production. Kalau `NODE_ENV` dibiarkan `development` di server produksi, cookie jadi `SameSite=Lax` → lintas situs **tidak** terkirim → login 401 setelah 200 (gejala yang persis mau dihindari).
4. **`.env` sekarang benar-benar dibaca — ini mengubah perilaku operasional.** `npm start`/`npm dev` memuat `server/.env` (dulu tidak). Env yang sudah ada di process environment tetap menang. Pastikan `server/.env` tidak berisi nilai yang mengejutkan (mis. `NODE_ENV=development` tertinggal dari template).
5. **`npm test` sengaja tidak memuat `.env`** — konsekuensinya test selalu berjalan dengan default dev (`SameSite=Lax`, `Secure=false`); test produksi harus menyetel env-nya secara eksplisit (dilakukan di `deploy.test.js`).
6. **`isProd` adalah snapshot import-time** (khusus untuk `tools/security-probe.mjs` yang dibaca dari child process). Semua path runtime (cookie/CORS) memakai reader runtime, jadi tidak ada drift fungsional; hanya `isProd` yang bisa basi bila `NODE_ENV` diubah setelah import — tidak ada kode produksi yang memakainya.
7. **Nilai `SameSite` hasil fallback tidak bisa "ditebak"** — nilai tak dikenal (`bogus`) diam-diam jatuh ke default. Ini disengaja (tidak error saat boot), tapi berarti typo di `.env` tidak ketahuan; verifikasi cepat: `Set-Cookie` harus memuat `SameSite=None` saat production.
8. **Tidak ada pengujian di browser sungguhan** dalam scope BE-001 (test berbasis header HTTP). Perilaku penolakan cookie 3P hanya bisa dibuktikan manual di browser (poin 1).
9. Cookie sesi tetap `path=/` dan host-only (tanpa `Domain`) — kalau nanti API dan SPA di domain berbeda tapi *sibling* (mis. `api.example.com` + `app.example.com`), `Domain` attribute **tidak** akan pernah ikut; itu disengaja (host-only lebih aman). Butuh penyesuaian hanya kalau itu memang diminta.

---

## 5. Daftar env var final (server)

| Variabel | Default | Nilai produksi yang direkomendasikan | Catatan |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | Mengaktifkan default `SameSite=None` + `Secure=true` |
| `CORS_ORIGIN` | prod: `https://adjietegaralamsyah312.github.io`<br>dev: `http://localhost:5173,http://127.0.0.1:5173` | `https://adjietegaralamsyah312.github.io` | Comma-separated, trim, tanpa path. Wajib include origin frontend |
| `COOKIE_SAME_SITE` | prod: `none`<br>dev: `lax` | `none` | `lax\|strict\|none`; nilai tak dikenal → default. Wajib `none` untuk lintas situs |
| `COOKIE_SECURE` | ikut `NODE_ENV` (prod → `true`) | `true` | `false` **wajib** menurunkan `SameSite` ke `lax` (invarian). Hanya untuk deploy HTTP LAN |
| `TRUST_PROXY` | `false` | `true` (di belakang Cloudflare Tunnel) | Hanya kalau benar-benar di belakang reverse proxy tepercaya (rate-limit IP + `req.protocol`) |
| `PORT` | `4000` | `4000` | Tidak berubah |
| `DB_PATH` | `./data/playrent.db` | default | Tidak berubah |
| `SESSION_TTL_HOURS` | `12` | `12` | Tidak berubah |

Nama env di atas **identik** dengan `specs/deploy-contract.md` §1.2 — tidak ada env baru yang diperkenalkan.

### Contoh `server/.env` produksi

```env
NODE_ENV=production
PORT=4000
DB_PATH=./data/playrent.db
SESSION_TTL_HOURS=12
CORS_ORIGIN=https://adjietegaralamsyah312.github.io
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
TRUST_PROXY=true
```

### Checklist deploy (untuk DO-001 / operator)

1. `server/.env` dibuat dari `.env.example` dengan nilai di atas (file `.env` **tidak** masuk repo — sudah di-ignore).
2. `npm start` → pastikan log `[playrent] listening … env=production`.
3. Verifikasi cookie dari browser (DevTools → Network → `Set-Cookie` pada `POST /api/auth/login`): harus ada `HttpOnly; Secure; SameSite=None; Path=/`.
4. Uji manual login dari `https://adjietegaralamsyah312.github.io/PlayRent/` → 200 lalu `/api/auth/me` → 200 (bukan 401).
5. Kalau browser memblokir cookie 3P (Safari ITP dll.) → aktifkan fallback "sajikan SPA dari origin API yang sama".
