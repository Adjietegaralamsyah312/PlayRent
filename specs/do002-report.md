# DO-002 — Perbaikan Temuan Review RV-001 (Dokumentasi + Workflow)

> Agen: @devops · Task: DO-002 · Mode: balanced · Tanggal: 2026-10-21
> Input: `specs/deploy-contract.md` (sudah direvisi), `specs/review-deploy-report.md` (RV-001)
> Output: `specs/deployment-guide.md` (revisi), `README.md`, `docs/CARA-PAKAI.md`,
> `.github/workflows/deploy.yml`
> Nature of work: **dokumentasi + workflow** — tidak ada kode aplikasi yang disentuh.

---

## 1. File yang diubah + ringkasan

| File | Perubahan | Temuan RV-001 yang ditutup |
| --- | --- | --- |
| `specs/deployment-guide.md` | §3.1 env `TRUST_PROXY=1` + tabel env; §3.2 ditulis ulang (hop count, XFF, konsekuensi, probe, default `0`); §3.3 catatan cwd-relative `.env` + tabel "konfigurasi efektif" dari log; §5.2 dua fail-fast; §6.3 verifikasi inlining otomatis; §7 dirombak total (7.1–7.8) dengan penanda **[FAKTA]**/**[PERKIRAAN]**; §8 fallback (wajib build ulang, `TRUST_PROXY=1` tetap aktif); §10.1 tabel env; §11 checklist 11→14 item; tabel troubleshooting | **HIGH-1**, **MEDIUM-1**, **LOW-1**, **LOW-2**, **LOW-3**, **LOW-4** |
| `README.md` | Tabel env (`TRUST_PROXY` = hop count); blok "Kenapa default"; blok env produksi `TRUST_PROXY=1` + baris log konfigurasi efektif; bagian baru **"Batasan dukungan browser (login lintas situs)"**; catatan cwd `.env` di mode produksi; blok "Reset database" diberi peringatan eksplisit (tidak destruktif di jalur deploy) | **HIGH-1**, **MEDIUM-1**, **LOW-1**, **LOW-2** |
| `docs/CARA-PAKAI.md` | Catatan operator atas diperluas + konsisten (Chrome/Firefox vs Safari); baris troubleshooting "login berhasil tapi diminta login lagi"; baris "laporan berisi pendapatan fiktif" tidak lagi menyuruh hapus DB + backup; catatan reset sandi Super Admin (data transaksi tidak ikut terhapus) | **MEDIUM-1**, plus pencegahan instruksi destruktif |
| `.github/workflows/deploy.yml` | Step baru **"Verify API origin is inlined"** (setelah build, sebelum upload artifact) + guard env kosong | **LOW-1** |
| `server/tools/security-probe.mjs` | **Tidak disentuh** — baris `AUTH-14` sudah diperbaiki oleh agent backend (BE-002) sebelum saya mulai (lihat §5) | **LOW-5** (selesai oleh pihak lain) |

Tidak ada file di luar scope yang diubah. `server/src/**`, `server/test/**`, `server/package.json`,
`web/**`, `server/data/**`, dan `specs/{deploy-contract,be001-report,be002-report,fe001-report,review-deploy-report}.md`
**tidak disentuh**.

---

## 2. Hasil grep & validasi

### 2.1 `TRUST_PROXY=true` (literal)

```
$ grep -rn "TRUST_PROXY=true" README.md docs/CARA-PAKAI.md specs/deployment-guide.md \
    .github/workflows/deploy.yml server/tools/security-probe.mjs
(kosong)
```

→ **bersih di seluruh file yang saya ubah.** Saya sengaja tidak menulis literal
`TRUST_PROXY=true` bahkan di kalimat "jangan pakai" — penjelasannya memakai frasa
"nilai boolean `true`", sehingga grep repo tetap bersih untuk file saya.

> Satu-satunya hit literal di file saya ada di **laporan ini sendiri** (polanya dikutip
> sebagai istilah pencarian + deskripsi sisa hit di file milik agent lain) — semuanya teks
> analitis/negatif, **bukan resep**.

**Sisa hit di repo (di luar scope saya — tidak saya sentuh):**

| File | Konteks hit | Kenapa tidak diubah |
| --- | --- | --- |
| `specs/review-deploy-report.md` (7 hit) | Laporan review RV-001 yang **mengutip** keadaan lama | Dilarang diubah (memang harus tetap mencatat temuan) |
| `specs/be001-report.md` (3 hit) | **Resep env produksi lama** (`TRUST_PROXY=true` di §5 + contoh `.env`) — usang, sudah kalah benar oleh `TRUST_PROXY=1` | Dilarang diubah |
| `specs/review-report.md` (2 hit) | Review lama (batch sebelumnya) | Di luar scope |
| `server/src/config.js:95` | **Teks peringatan** yang dicetak server: "`TRUST_PROXY=true` kini berarti 1 hop…" | `server/src/**` di luar scope; perilakunya justru benar (nilai boolean → 1 hop + warning) |
| `server/src/routes/auth.js:15` | Komentar lama "off unless TRUST_PROXY=true" | `server/src/**` di luar scope |

> **Tindak lanjut untuk Leader:** `specs/be001-report.md` masih memuat **resep produksi**
> `TRUST_PROXY=true` (§5 + contoh `.env`). Reverinya perlu di-*supersede* oleh
> `specs/deploy-contract.md` §1.2 + `specs/deployment-guide.md` §3.2 — file itu milik
> @node-developer, jadi saya tidak menyentuhnya.

### 2.2 `localhost:5173` sebagai alamat produksi

```
$ grep -n "localhost:5173" README.md docs/CARA-PAKAI.md specs/deployment-guide.md
README.md:177   → dev default CORS_ORIGIN (konteks dev)
README.md:566   → mode pengembangan (Vite dev server)
README.md:588   → "tidak pernah menjadi alamat publik"
docs/CARA-PAKAI.md:6 → "selama masih developing"
specs/deployment-guide.md:12  → "tidak pernah menjadi alamat publik"
specs/deployment-guide.md:139 → sisa template yang harus dibersihkan
specs/deployment-guide.md:712 → dev default CORS_ORIGIN
```

→ **tidak ada** `localhost:5173` yang dipakai sebagai alamat produksi.

### 2.3 Instruksi destruktif

| Cek | Hasil |
| --- | --- |
| Jalur deploy (runbook + README bagian deploy) | Tidak ada reset DB / ganti password / hapus data. Runbook §9.3 eksplisit: "Jangan menghapus `server/data/playrent.db`". |
| `README.md` §"Reset database" | Bagian ini sudah ada sebelumnya (konteks dev). Kini diberi **peringatan tegas** (khusus pengembangan, setelah backup) + pointer ke restore, bukan dihapus — menghapus dokumentasi dev yang sah adalah scope creep. |
| `docs/CARA-PAKAI.md` | Baris yang menyuruh **hapus DB + hapus backup** diganti: simpan salinan, minta pemilik siapkan DB bersih. Bagian "reset sandi Super Admin" (fitur produk yang sah) diberi clarifikasi bahwa data transaksi tidak ikut terhapus. |
| Perintah di `deploy.yml` | Tidak ada perintah yang menyentuh server/DB. |

### 2.4 Validasi YAML workflow

```
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"
YAML OK
jobs: ['build', 'deploy', 'server-test']
build steps:
 - Checkout | wd: -
 - Setup Node.js | wd: -
 - Install dependencies | wd: web
 - Check TypeScript | wd: web
 - Check VITE_API_BASE_URL repository variable | wd: -
 - Build website | wd: web
 - Verify API origin is inlined | wd: web      ← baru
 - SPA fallback | wd: -
 - Configure Pages | wd: -
 - Upload website | wd: -
server-test needs: []                          ← job server-test tidak berubah
```

→ **YAML valid**, step verifikasi **setelah build** dan **sebelum upload artifact**, job
`server-test` **tidak tersentuh** (`needs: []`, jalan paralel seperti sebelumnya).

### 2.5 Simulasi logika step verifikasi (diuji, bukan diasumsikan)

Build Vite nyata dengan `VITE_API_BASE_URL=https://tunnel.example.test` → `grep -c` = **1**
(string origin benar-benar ter-inline ke `dist/assets/*.js`). Bundle dibangun ke
`--outDir dist-verify` lalu dihapus, sehingga `web/dist` milik operator **tidak berubah**.

Script yang diuji = **teks persis** step workflow:

| Kasus | Keluaran | Exit |
| --- | --- | --- |
| Positif (origin ada di bundle) | `API origin inlined: https://tunnel.example.test` | `0` ✅ |
| Negatif (origin tidak ada di bundle) | `::error::VITE_API_BASE_URL was not inlined into the bundle — the deployed site would call github.io/api/... and 404.` | `1` ✅ |
| Env kosong (guard tambahan) | `::error::VITE_API_BASE_URL is empty — cannot verify the bundle. Nothing was deployed.` | `1` ✅ |

Guard env kosong penting: tanpa itu, `grep -rqF ""` akan mencocokkan **file apa pun** dan
step jadi false-pass.

### 2.6 Anchor markdown

```
specs/deployment-guide.md -> broken anchors: NONE
README.md                  -> broken anchors: NONE
docs/CARA-PAKAI.md         -> broken anchors: NONE
```

---

## 3. Env yang dipakai di dokumentasi + status verifikasi

Semua nama env di bawah **diverifikasi ada di implementasi nyata** (`server/src/config.js`,
`server/.env.example`, `web/src/lib/api.ts`, `specs/be001-report.md` §5). **Tidak ada env
yang dikarang.**

| Env | Default kode | Nilai produksi di dokumen | Sumber implementasi | Status |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `server/src/config.js` (`nodeEnv()`) | ✅ verified |
| `PORT` | `4000` | `4000` | `server/src/config.js` (`port`) | ✅ verified |
| `DB_PATH` | `./data/playrent.db` | `./data/playrent.db` | `server/src/config.js` (`dbPath`, relatif ke package root) | ✅ verified |
| `SESSION_TTL_HOURS` | `12` | `12` | `server/src/config.js` (`sessionTtlHours`) | ✅ verified |
| `CORS_ORIGIN` | prod `https://adjietegaralamsyah312.github.io` / dev `http://localhost:5173,http://127.0.0.1:5173` | `https://adjietegaralamsyah312.github.io` | `server/src/config.js` (`corsOrigins()`) | ✅ verified |
| `COOKIE_SAME_SITE` | prod `none`, selain itu `lax` | `none` | `server/src/config.js` (`cookieSameSite()`) | ✅ verified |
| `COOKIE_SECURE` | ikut `NODE_ENV` | `true` | `server/src/config.js` (`cookieSecure()`) | ✅ verified |
| `TRUST_PROXY` | `0`/unset → `false` (XFF diabaikan) | `1` (jumlah hop) | `server/src/config.js` (`trustProxy()` → `parseTrustProxy()`) | ✅ verified (kode sudah hop-count) |
| `VITE_API_BASE_URL` | kosong → path relatif `/api/...` | `https://<host-tunnel>` (origin saja) | `web/src/lib/api.ts` (`import.meta.env.VITE_API_BASE_URL`) | ✅ verified |

> `TRUST_PROXY` sudah diimplementasikan sebagai **hop count** oleh agent backend
> (`server/src/config.js: parseTrustProxy()`): `unset|false|0` → `false`, `1|2|…` → jumlah
> hop, `true` → `1` (+ peringatan), nilai tak dikenal → `false` (+ peringatan). Dokumentasi
> saya **sejalan** dengan implementasi itu, termasuk menyebut bahwa nilai boolean kini
> hanya berarti 1 hop.

---

## 4. Klaim audit browser versi final (siap disalin Leader)

> **Dukungan cookie lintas situs (`SameSite=None; Secure`) — status 2026**
>
> 1. **Dukungan *atribut*** (bukan jaminan pengiriman): Chrome 80+, Edge 80+ (Chromium),
>    Firefox 96+, Safari/WebKit 13+ — semuanya **wajib `Secure`**. Di bawah versi itu,
>    cookie tidak pernah dikirim (gejala: login `200`, lalu semua request `401`).
> 2. **Chrome/Edge** — phase-out cookie pihak ketiga **dibatalkan** (Apr 2025), jadi cookie 3P
>    **tidak** dihapus otomatis; tetapi **Incognito memblokir 3P** dan pengguna bisa
>    mematikannya lewat Settings. Login lintas situs **seharusnya** berhasil (perlu diuji).
> 3. **Firefox** — cookie 3P **dipartisi** per situs top-level (Total Cookie Protection v102,
>    State Partitioning v103), **bukan** diblokir. Kemungkinan besar tetap terkirim
>    (perkiraan — wajib diuji).
> 4. **Safari/WebKit** — ITP memblokir **semua** cookie pihak ketiga (Full Third-Party Cookie
>    Blocking, 13.1) **tanpa pengecualian**; Storage Access API hanya berlaku untuk iframe
>    lintas situs, **tidak** untuk SPA top-level → **login lintas situs diperkirakan GAGAL**.
> 5. **Konsekuensi:** **fallback same-origin bukan pelengkap — itu jalur andal di Safari.**
>    Cookies jadi first-party → `SameSite=Lax` cukup → semua browser bisa login.
> 6. Faktor lain: mode privasi/Incognito, ekstensi pemblokir, policy perusahaan
>    (`BlockThirdPartyCookies`), WebView Android, dan kebijakan 3P yang masih bisa berubah.
> 7. **Build sukses ≠ login pasti berhasil.** Yang terbukti baru *konfigurasi benar*;
>    yang belum terbukti adalah *perilaku browser* → verifikasi manual wajib (§6.2 runbook).

---

## 5. LOW-5 — sudah selesai oleh agent lain (terverifikasi, bukan oleh saya)

`server/tools/security-probe.mjs` **tidak saya ubah**. Saat saya mulai pekerjaan, agent backend
(BE-002) sudah memperbaiki baris tersebut:

```diff
- record('AUTH-14', 'major', isProd === true, 'server/src/lib/auth.js:88',
-   'cookie.secure = isProd (config.isProd true when NODE_ENV=production)',
-   `child isProd=${isProd}; cookieOpts sets secure:isProd`, 'ok')
+ record('AUTH-14', 'major', isProd === true,
+   'server/src/config.js:cookieSecure() + server/src/lib/auth.js:sessionCookieOptions()',
+   'cookie.secure = cookieSecure() (config.isProd true when NODE_ENV=production)',
+   `child isProd=${isProd}; sessionCookieOptions() sets secure:cookieSecure()`, 'ok')
```

Referensi basi `auth.js:88` / "cookieOpts sets secure:isProd" → **hilang**. Teks remediation
`AUTH-10` juga sudah diubah ke bahasa hop count. **Tidak ada baris kode lain yang saya
sentuh** di file itu.

---

## 6. Status verifikasi

# `partially_verified`

**Terverifikasi (bukti konkret, di lingkungan ini):**

- YAML workflow valid; urutan step benar (verify setelah build, sebelum upload); job
  `server-test` utuh (`needs: []`).
- Logika step "Verify API origin is inlined" **dijalankan** pada 3 kasus (positif / negatif /
  env kosong) → exit `0` / `1` / `1` dengan pesan yang benar.
- **Build Vite nyata** dengan `VITE_API_BASE_URL` terisi → origin **memang** ter-inline
  (`grep -c` = 1) → pendekatan `grep` terbukti bekerja pada bundle asli.
- `grep TRUST_PROXY=true` → **kosong** di semua file yang saya ubah.
- Anchor markdown internal → **tidak ada** yang rusak di 3 file.
- Semua nama env di dokumen **terverifikasi ada** di implementasi (`config.js`,
  `.env.example`, `api.ts`) — tidak ada env karangan.
- Tidak ada `localhost:5173` sebagai alamat produksi; tidak ada instruksi destruktif di jalur
  deploy.

**Belum terverifikasi (di luar kendali lingkungan ini):**

1. **Perilaku browser nyata** — tidak ada browser/Playwright di lingkungan ini. Klaim
   "login lintas situs" **tetap tidak boleh** dinyatakan pasti berhasil; itu memang isi
  -findings MEDIUM-1/MEDIUM-2 RV-001. Uji wajib oleh operator (runbook §6.2 + checklist 11–14).
2. **Eksekusi workflow di GitHub Actions** — step baru belum pernah jalan di CI asli.
   Bukti lokal: simulasi identik (lihat §2.5) + build Vite nyata.
3. **Runtime server di Termux** — log "konfigurasi efektif" dan probe `TRUST_PROXY`
   (runbook §3.2/§3.3) belum dijalankan di perangkat operator.

**Risiko residual yang perlu diperhatikan Leader:**

- `specs/be001-report.md` masih memuat **resep produksi** `TRUST_PROXY=true` (di luar scope
  saya → lihat §2.1). Nilai itu kini berarti 1 hop (aman) tapi tidak sesuai kontrak §1.2.
- `server/src/routes/auth.js:15` masih berkomentar "off unless TRUST_PROXY=true" (kosmetik,
  di luar scope `server/src/**`).
- **Mode fallback same-origin wajib build ulang** `web/dist` **tanpa** `VITE_API_BASE_URL` dan
  dengan base `/`. Kalau operator hanya mengganti `COOKIE_SAME_SITE` tanpa build ulang, aset
  `/PlayRent/assets/...` 404 dan request tetap lintas situs → login tetap gagal. Runbook §8.1
  sudah menyorot ini.
- `TRUST_PROXY=1` **wajib tetap aktif** di mode fallback, kalau tidak `req.protocol` = `http`
  → semua request tulis kena `403 CSRF_ORIGIN_MISMATCH`.

---

## 7. Ringkasan "skipped"

- Tidak menulis ulang runbook dari nol — revisi Surgical atas bagian yang salah
  (Ponytail: diff terkecil yang benar).
- Tidak menyentuh `server/src/**` (implementasi hop count + `Sec-Fetch-Site` = urusan
  @node-developer), `web/**`, `server/test/**`, `server/package.json`.
- Tidak menghapus bagian "Reset database" di README (dokumentasi dev yang sah) — hanya
  diberi peringatan + diarahkan ke restore.
