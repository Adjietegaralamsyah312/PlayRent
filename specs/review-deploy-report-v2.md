# RV-002 — Review Verifikasi Akhir Pasca-Perbaikan (Deploy Lintas-Situs)

> Agen: @reviewer · Task: RV-002 · Mode: thorough · Tanggal: 2026-10-21
> Kontrak acuan: `specs/deploy-contract.md` · Review sebelumnya: `specs/review-deploy-report.md` (RV-001)
> Input: `specs/be001-report.md`, `specs/be002-report.md`, `specs/do002-report.md`, `specs/fe001-report.md`, `plan.md`
> Objek: `git diff` (BE-001/BE-002/FE-001/DO-001/DO-002) + `server/test/deploy.test.js` + `specs/deployment-guide.md`
>
> **Tidak ada file implementasi, kontrak, atau laporan agent lain yang saya ubah.**
> Satu-satunya file baru: `specs/review-deploy-report-v2.md` (laporan ini).
> Semua probe dijalankan dari skrip di luar repo (`/data/data/com.termux/files/usr/tmp/opencode/rv002/`).

---

## 0. Ringkasan eksekusi

**Tidak ada temuan Critical. Tidak ada temuan High tersisa.**

Temuan lama RV-001 yang tersisa: **8 dari 9 tertutup** (bukti eksekusi di bawah).
Satu item **tidak bisa ditutup dan memang tidak bisa ditutup di review ini** (MEDIUM-2 —
perilaku browser nyata): runbook sudah mewajibkan verifikasi manual dengan benar, tetapi
**hasilnya belum ada** → login lintas situs **tidak boleh** diklaim pasti berhasil.

**3 temuan baru**, semuanya **Low**, tidak memblokir deploy:

| # | Sev | Lokasi | Temuan |
| --- | --- | --- | --- |
| NEW-1 | Low | `.github/workflows/deploy.yml:50-70` | Fail-fast "Check VITE_API_BASE_URL" **menerima URL ber-path / ber-query / ber-hash** (`https://host/app`, `https://host?x=1`) → bundle terbit dengan `https://host/app/api/...` → **404 di setiap panggilan**. Step "Verify API origin is inlined" **tidak** menangkapnya (string-nya memang ter-inline) |
| NEW-2 | Low | `server/src/index.js:13-15` + `specs/deployment-guide.md:182-184` | `TRUST_PROXY=1` + server bind `0.0.0.0:4000` (bisa dijangkau dari LAN) → klien LAN boleh memalsukan `X-Forwarded-For` dan membuat bucket rate-limit baru. Peringatan runbook hanya menyebut "dibuka langsung ke internet" |
| NEW-3 | Low | `specs/deployment-guide.md:225-231` | Tabel "konfigurasi efektif" cuma membedakan `trustProxy=false` ("tidak terbaca"); kasus **nilai tidak dikenal** (`TRUST_PROXY=one` → `false` + warning "tidak dikenal") punya **diagnosis & perbaikan berbeda** (salah ketik di `.env`, bukan cwd) |

---

## 1. Status temuan review pertama (RV-001) — tertutup / belum / regresi

| # | Sev | Temuan | Status RV-002 | Bukti (eksekusi / file) |
| --- | --- | --- | --- | --- |
| **HIGH-1** | High | Rate-limit bypass lewat `X-Forwarded-For` karena `TRUST_PROXY=true` (trust-all) | ✅ **TERTUTUP** | `server/src/config.js:89-108` → `parseTrustProxy()` = hop count; `server/src/app.js:21` → `app.set('trust proxy', trustProxy())`. **Probe runtime (§3.1)**: `TRUST_PROXY=1` → `req.ip = 9.9.9.9` (entri **paling kanan**), entri paling kiri `1.2.3.4` **diabaikan**; `TRUST_PROXY=0`/unset/`false` → `req.ip = ::ffff:127.0.0.1` (XFF diabaikan); `X-Forwarded-Proto: https` → `req.protocol = https`. **End-to-end (§3.2)**: 5 gagal login dengan XFF-kiri berbeda → percobaan ke-6 dengan XFF-kiri **berbeda** → `429 RATE_LIMITED`, `login_attempts.ip = ["9.9.9.9"]` (satu bucket) |
| **MEDIUM-1** | Medium | Audit dukungan browser tidak akurat untuk 2026 (Chrome/Firefox/Safari) | ✅ **TERTUTUP** | `specs/deployment-guide.md:467-520` (§7.2-7.4) + `README.md:639-657`. **Cross-check sumber otoritatif (§5)**: Chrome phase-out dibatalkan (Google 22-Apr-2025, CMA 17-Okt-2025), Incognito memblokir 3P (Chrome Help), 3P **tidak** diblokir by default di browsing normal (MDN); Firefox **mempartisi** (TCP v102 / State Partitioning v103, Mozilla+MDN), cookie non-tracker tetap terkirim; WebKit **memblokir semua** 3P sejak 13.1 + Storage Access API hanya untuk iframe lintas situs (webkit.org/blog/10218). Semua klaim runbook **akurat & bertanda [FAKTA]/[PERKIRAAN]** |
| **MEDIUM-2** | Medium | Tidak ada bukti browser nyata bahwa login lintas situs bekerja | ⚠️ **TERTUTUP SEBAGAI PROSES, belum terbukti secara empiris** | Runbook §6.2 `:412-422` "Cek dari browser (wajib)", §7.6 `:532-541` "Build sukses ≠ login pasti berhasil", §7.7 diagnosis DevTools, checklist operator `:749-752` (item 11-14), tabel troubleshooting `:771-772`. **Tidak ada klaim "pasti berhasil"** di mana pun. Yang tersisa adalah **eksekusi manual oleh operator** — mustahil ditutup dengan test HTTP |
| **MEDIUM-3** | Medium | `csrfGuard` lolos bila `Origin` absen (bypass "Origin absen") | ✅ **TERTUTUP** | `server/src/lib/auth.js:166-170`. **Probe (§3.3)**: tanpa `Origin` + `Sec-Fetch-Site: cross-site` → **403 `CSRF_ORIGIN_MISMATCH`**; `CROSS-SITE` (kapital) → 403 (normalisasi lowercase ✅); `same-origin`/`same-site`/`none`/tanpa header → lolos (klien non-browser) ✅; `Origin` asing → 403 ✅; `Origin` allowed → lolos ✅. Test ada di `server/test/deploy.test.js:411-441` |
| **LOW-1** | Low | Fail-fast tidak memverifikasi nilai benar-benar ter-inline | ✅ **TERTUTUP** | `.github/workflows/deploy.yml:83-96`. Step **setelah** "Build website" (idx 6) dan **sebelum** "Upload website" (idx 9) — diverifikasi dari YAML. **Simulasi 4 kasus (§3.6)**: positif → exit 0; origin tidak ada → exit 1; **env kosong → exit 1** (guard; tanpa guard `grep -rqF ""` → exit 0 = false-pass, sudah dibuktikan); `dist/assets` hilang → exit 1 (gagal aman) |
| **LOW-2** | Low | `web/dist` = artefak build verifikasi (base `/PlayRent/`) | ✅ **TERTUTUP** (dokumentasi) | `web/dist/` **gitignored** (`.gitignore:13`) → bukan artefak repo. Risiko ditutup oleh `specs/deployment-guide.md:582-602` §8.1 "**Wajib build ulang**" + `README.md:569-583`. `web/package.json` `build` = `tsc --noEmit && vite build` (base default `/`) ✅ konsisten dengan §8.1 |
| **LOW-3** | Low | `--env-file-if-exists=.env` relatif terhadap cwd | ✅ **TERTUTUP** | `specs/deployment-guide.md:202-214` §3.3 + `README.md:211-213` + `README.md:576-579` ("Jalankan `npm start` dari folder `server/`"). Diverifikasi juga oleh baris log konfigurasi efektif (§3.5) yang membuat cwd salah **terdeteksi** |
| **LOW-4** | Low | Fallback same-origin diam-diam butuh `TRUST_PROXY` aktif | ✅ **TERTUTUP** | `specs/deployment-guide.md:623-627` §8.2 — callout eksplisit "`TRUST_PROXY=1` tetap dipakai di mode fallback … Jangan mematikan `TRUST_PROXY` saat berpindah ke mode fallback". Troubleshooting `:774` juga menyebutnya |
| **LOW-5** | Low | Referensi AUTH-14 basi di `security-probe.mjs:159` | ✅ **TERTUTUP** | `server/tools/security-probe.mjs:159` kini menunjuk `server/src/config.js:cookieSecure()` + `server/src/lib/auth.js:sessionCookieOptions()`; teks AUTH-10 juga sudah bahasa hop count (`:140`). Probe tetap **PASS 69/69** |
| **LOW-6** | Low (tidak diminta, tapi ikut diverifikasi) | Dua sumber kebenaran "apakah production" | ✅ **TERTUTUP** | `server/src/config.js:29-38`: `nodeEnv()` (runtime, sumber tunggal), `prodEnv()` (internal), `isProd` = snapshot import-time **khusus** probe, dengan komentar jelas. Semua pemakai memakai `nodeEnv()` (`grep`: tidak ada sisa `nodeEnv` tanpa `()`) |

### Regresi baru?
**Tidak ada.** `git diff` terhadap `HEAD` menunjukkan perubahan yang **semua** memperketat
atau menetralkan: CORS allowlist tanpa `*`, `clearCookie` memakai atribut identik, CSRF ikut
allowlist + `Sec-Fetch-Site`, `TRUST_PROXY` jadi hop count, cookie env-driven + invarian
`None⇔Secure`. Yang **tidak** berubah: `requireAuth`, `requireSuperAdmin`,
`checkLoginRateLimit`, `recordLoginAttempt`, `hashPassword`, `verifyPassword`,
`app.disable('x-powered-by')`, `express.json({limit:'1mb'})`, `cookieParser()`, urutan
middleware, `app.use(csrfGuard)` tanpa kondisi (**tidak ada env untuk mematikan CSRF**).

---

## 2. Regresi & konsistensi

### 2.1 `TRUST_PROXY=true` — grep seluruh repo

```
$ grep -rn "TRUST_PROXY=true" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
```

| File | Konteks | Status |
| --- | --- | --- |
| `server/src/config.js:95` | **Teks peringatan** yang dicetak server ("`TRUST_PROXY=true` kini berarti 1 hop…") | ✅ sesuai |
| `specs/review-deploy-report.md` (7 hit) | Laporan RV-001 yang **mengutip** keadaan lama | ✅ historis (tidak ditimpa) |
| `specs/be001-report.md` (3 hit) | **Resep produksi lama** — §4 risiko 2, §5 tabel env, contoh `.env`. **Ada banner supersede** di baris 3-7 yang secara eksplisit menyebut "risiko 2, tabel env §5, contoh `.env`" sebagai usang | ✅ sesuai (ditandai) |
| `specs/be002-report.md`, `specs/do002-report.md`, `specs/review-report.md` | Laporan / kutipan historis | ✅ sesuai |
| `README.md`, `docs/CARA-PAKAI.md`, `specs/deployment-guide.md`, `.github/workflows/deploy.yml`, `server/.env.example`, `server/src/routes/auth.js` | **TIDAK ADA hit literal** | ✅ bersih |

**Kesimpulan:** tidak ada resep/konfigurasi produksi yang menyuruh `true`. Semua jalur
produksi memakai `TRUST_PROXY=1` (runbook `:117`, README `:605`) dan `.env.example` memakai
`TRUST_PROXY=0` (default aman, `server/.env.example:13-17`).

### 2.2 Env karangan — cross-check nama env

Semua nama env yang dipakai di `README.md`, `specs/deployment-guide.md`, `docs/CARA-PAKAI.md`,
`server/.env.example` **terverifikasi ada** di implementasi:

| Env | Implementasi | Default di kode | Nilai produksi di dokumen |
| --- | --- | --- | --- |
| `NODE_ENV` | `config.js:30` | `development` | `production` ✅ |
| `PORT` | `config.js:20` | `4000` | `4000` ✅ |
| `DB_PATH` | `config.js:16-17` | `./data/playrent.db` | `./data/playrent.db` ✅ |
| `SESSION_TTL_HOURS` | `config.js:21` | `12` | `12` ✅ |
| `CORS_ORIGIN` | `config.js:44-55` | prod `https://adjietegaralamsyah312.github.io` | sama ✅ |
| `COOKIE_SAME_SITE` | `config.js:58-62` | prod `none`, selain itu `lax` | `none` ✅ |
| `COOKIE_SECURE` | `config.js:68-73` | ikut `NODE_ENV` | `true` ✅ |
| `TRUST_PROXY` | `config.js:89-108` | `0`/unset → `false` | `1` (hop count) ✅ |
| `VITE_API_BASE_URL` | `web/src/lib/api.ts:61` | kosong → path relatif | `https://<host-tunnel>` ✅ |

Scan otomatis atas semua token `[A-Z][A-Z0-9_]{3,}` di 4 file dokumentasi → **tidak ada
env karangan** (sisanya bahasa Indonesia, metode HTTP, atau kode error). `ADMIN_USERNAME` /
`ADMIN_PASSWORD` juga nyata (`server/src/admin-bootstrap.js`).

### 2.3 Instruksi destruktif di jalur deploy

- `git status --porcelain -- server/data server/src/seed.js server/src/seed-schema.js server/src/admin-bootstrap.js server/src/restore.js server/src/backup.js server/src/schema.sql` → **kosong**.
- `grep -E "rm -[rf]|DROP TABLE|TRUNCATE|DELETE FROM|unlink |shred "` di README/runbook/CARA-PAKAI/workflow → **tidak ada di jalur deploy**.
  - `README.md:256-273` "Reset database" = dokumentasi **khusus pengembangan**, kini diberi peringatan tegas + pointer ke restore (bukan dihapus).
  - `docs/CARA-PAKAI.md:228` baris "hapus DB + **hapus backup lama**" → diganti "**Jangan hapus datanya** … simpan salinan … minta pemilik siapkan DB bersih".
  - `specs/deployment-guide.md:87-91` `npm run seed:schema` / `admin:bootstrap` hanya sebagai **prasyarat instalasi awal**, dengan catatan eksplisit "Jalur deploy di sini **tidak pernah** menyentuh, me-reset, atau menghapus data".
  - `specs/deployment-guide.md:691-692` "**Jangan** menghapus `server/data/playrent.db` atau file `-wal`/`-shm`".
- **Bukti DB utuh**: md5 + mtime + size `server/data/playrent.db` **identik** sebelum/sesudah `npm test`:
  `7520e190ccc23c999cf9dd8c72b5cfd3 · mtime=1792506903 · size=229376` → `7520e190ccc23c999cf9dd8c72b5cfd3 · mtime=1792506903 · size=229376` ✅

### 2.4 Kontrak §2 / §3 / §6 setelah BE-002 — diverifikasi runtime (probe `createApp()` asli)

| Kontrak | Hasil |
| --- | --- |
| §2 `HttpOnly` selalu true | ✅ `Set-Cookie: pr_session=…; Max-Age=43199; Path=/; Expires=…; HttpOnly; Secure; SameSite=None` |
| §2 tanpa atribut `Domain` | ✅ `domain absent` |
| §2 `path=/` | ✅ |
| §2 invarian `SameSite=None` ⇔ `Secure=true` | ✅ `COOKIE_SECURE=false` → cookie jadi `SameSite=Lax` (tanpa `Secure`) |
| §2 `clearCookie` atribut identik | ✅ logout → `pr_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None` |
| §2 token tidak keluar di JSON | ✅ body login hanya berisi `id/username/fullName/role/isActive/phone/createdAt` |
| §3 CORS `credentials:true`, tanpa `*` | ✅ origin diizinkan → `ACAO: https://adjietegaralamsyah312.github.io`, `ACAC: true`; origin asing → **tanpa** header ACAO |
| §3 CSRF origin asing → 403 | ✅ `403 CSRF_ORIGIN_MISMATCH` |
| §3 CSRF tidak bisa dimatikan via env | ✅ `app.use(csrfGuard)` tanpa kondisi; tidak ada env/konstanta untuk itu |
| §3 `Sec-Fetch-Site` | ✅ lihat §3.3 |
| §3 origin Pages diterima | ✅ |
| §6 larangan reset DB / ganti password / hapus data | ✅ lihat §2.3 |

---

## 3. Hasil eksekusi (output apa adanya)

### 3.1 Probe `req.ip` / `req.protocol` (matriks `TRUST_PROXY` × XFF)

Script: `node /data/data/com.termux/files/usr/tmp/opencode/rv002/probe.mjs` (di luar repo).
Bagian 1 memakai **setelan trust-proxy yang sama persis** dengan `server/src/app.js:21`.

```
A. 1 hop, spoofed LEFT + cloudflare RIGHT          TRUST_PROXY=1         ip=9.9.9.9                protocol=http
B. 1 hop, DIFFERENT spoofed LEFT, SAME RIGHT       TRUST_PROXY=1         ip=9.9.9.9                protocol=http
C. 1 hop, single spoofed entry only                TRUST_PROXY=1         ip=1.2.3.4                protocol=http
D. 1 hop + X-Forwarded-Proto: https                TRUST_PROXY=1         ip=9.9.9.9                protocol=https
E. 0 hops, XFF present                             TRUST_PROXY=0         ip=::ffff:127.0.0.1       protocol=http
F. unset, XFF present                              TRUST_PROXY=undefined ip=::ffff:127.0.0.1       protocol=http
G. false, XFF present                              TRUST_PROXY=false     ip=::ffff:127.0.0.1       protocol=http
H. legacy boolean true, XFF present                TRUST_PROXY=true      ip=9.9.9.9                protocol=http
I. bogus value, XFF present                        TRUST_PROXY=bogus     ip=::ffff:127.0.0.1       protocol=http
J. 2 hops, 2-entry XFF                             TRUST_PROXY=2         ip=1.2.3.4                protocol=http
```

Bacaan:
- **A vs B** → entri XFF paling kiri **tidak pernah** dipakai saat `TRUST_PROXY=1`; `req.ip` = entri **paling kanan** (yang ditambahkan proxy tepercaya). ✅ HIGH-1 tertutup.
- **C** → kalau hanya ada 1 entri, itu entri paling kanan → dipakai. Benar (Cloudflare selalu menambahkan ≥1 entri).
- **E/F/G** → `TRUST_PROXY=0`/unset/`false` → XFF **diabaikan** penuh (`req.ip` = alamat socket). ✅
- **H** → nilai boolean lama kini berarti **1 hop**, bukan trust-all. Tidak ada jalur yang lagi memakai entri paling kiri.
- **I** → nilai tak dikenal → `false` + peringatan (aman).
- **J** → `TRUST_PROXY=2` dengan 2 entri XFF → entri paling kiri dipakai lagi. Konsekuensi yang **sudah didokumentasikan** di `specs/deployment-guide.md:149-151` ("`2` = dua proxy … Express ← nginx ← cloudflared"). Jumlah hop **harus** sama dengan jumlah proxy nyata.
- **D** → `req.protocol` = `https` dari `X-Forwarded-Proto` ✅ (req A kontrak §1.2 terpenuhi).

### 3.2 End-to-end lewat `createApp()` asli — bucket rate-limit = `req.ip`

```
5 gagal login dengan XFF berbeda di entri KIRI, entri KANAN sama:
  attempt 1 XFF="1.2.3.1, 9.9.9.9" -> 401
  attempt 2 XFF="1.2.3.2, 9.9.9.9" -> 401
  attempt 3 XFF="1.2.3.3, 9.9.9.9" -> 401
  attempt 4 XFF="1.2.3.4, 9.9.9.9" -> 401
  attempt 5 XFF="1.2.3.5, 9.9.9.9" -> 401
percobaan ke-6 dengan entri KIRI yang BERUBAH, entri KANAN sama:
  attempt 6 XFF="5.6.7.8, 9.9.9.9" -> 429 {"code":"RATE_LIMITED","message":"Terlalu banyak percobaan masuk. Coba lagi nanti"}

IP tersimpan di login_attempts: ["9.9.9.9"]
=> TERBUKTI: req.ip = entri XFF paling KANAN (entri paling kiri yang dipalsukan DIABAIKAN)
```

Rotasi XFF **tidak lagi** membuat bucket baru → brute-force tanpa batas **tertutup**.

### 3.3 `Sec-Fetch-Site` (lewat `createApp()` asli, `POST /api/auth/login`)

```
no Origin, no Sec-Fetch-Site (curl-like)         -> 401 {"success":false,"error":{"code":"INVALID_CREDENTIALS",...
no Origin + Sec-Fetch-Site: cross-site           -> 403 {"success":false,"error":{"code":"CSRF_ORIGIN_MISMATCH",...
no Origin + Sec-Fetch-Site: CROSS-SITE (caps)    -> 403 {"success":false,"error":{"code":"CSRF_ORIGIN_MISMATCH",...
no Origin + Sec-Fetch-Site: same-origin          -> 401 ... (lolos guard)
no Origin + Sec-Fetch-Site: same-site            -> 401 ... (lolos guard)
no Origin + Sec-Fetch-Site: none                 -> 401 ... (lolos guard)
Origin=Pages (allowed)                           -> 401 ... (lolos guard)
Origin=asing (foreign)                           -> 403 {"code":"CSRF_ORIGIN_MISMATCH",...
Origin=Pages + Sec-Fetch-Site: cross-site        -> 429 ... (guard lolos → rate-limit; sesuai kontrak §3)
```

Bypass "Origin absen" **tertutup** ✅. Perilaku `same-origin`/`same-site`/tanpa header tetap
mengizinkan klien non-browser ✅ — persis kontrak §3.

### 3.4 Simulasi step workflow "Verify API origin is inlined" (teks YAML asli, 4 kasus)

```
KASUS 1: origin ADA di bundle            -> "API origin inlined: https://tunnel.example.test"            EXIT=0
KASUS 2: origin TIDAK ada di bundle     -> "::error::VITE_API_BASE_URL was not inlined into the bundle" EXIT=1
KASUS 3: env KOSONG                     -> "::error::VITE_API_BASE_URL is empty — cannot verify..."       EXIT=1
KASUS 3b: grep -rqF "" tanpa guard      -> EXIT=0   (akan match semua file -> butuh guard; guard ADA ✅)
KASUS 4: dist/assets tidak ada          -> "::error::... was not inlined ..."                             EXIT=1
```

`grep` dengan **pattern kosong** **tidak** bisa lolos karena guard `[ -z "$VITE_API_BASE_URL" ]`
ada ✅. Urutan step: **setelah build (idx 5), sebelum upload artifact (idx 9)** ✅.

### 3.5 Boot nyata — log konfigurasi efektif + peringatan

```
$ DB_PATH=<tmp> NODE_ENV=production TRUST_PROXY=true CORS_ORIGIN=… COOKIE_SAME_SITE=none COOKIE_SECURE=true PORT=4123 node src/index.js
[playrent] listening on http://0.0.0.0:4123 · env=production · db=/…/rv002/boot.db
[playrent] env=production cors=["https://adjietegaralamsyah312.github.io"] sameSite=none secure=true trustProxy=1
[playrent] PERINGATAN: TRUST_PROXY=true kini berarti 1 hop. Set angka eksplisit (mis. 2) bila ada lebih dari satu proxy di depan server.
[playrent] tidak ada pengguna — jalankan: npm run seed
```

Cocok **persis** dengan yang diharapkan runbook `:218-221` dan README `:617-619` ✅. Tidak ada
secret yang tercetak ✅.

### 3.6 Tiga perintah wajib

```
$ cd server && npm test
ℹ tests 114
ℹ suites 0
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36006.588684
```

> **Catatan jujur:** pada eksekusi **pertama**, suite ini keluar `pass 113 / fail 1` —
> `O9 reload keeps endsAt and remainingSeconds counts down` (`server/test/timer.test.js:32`,
> `~1s elapsed (4)` — batas atas 3 detik terlampaui karena beban paralel di Termux).
> `server/test/timer.test.js` **tidak diubah** oleh BE-001/BE-002/DO-001/DO-002
> (`git diff HEAD -- server/test/timer.test.js` → kosong), dan **lolos saat dijalankan
> sendirian** (`node --test test/timer.test.js` → `pass 1 / fail 0`). Jadi ini **flake
> timing pre-existing**, bukan regresi deploy. Eksekusi ulang (di atas) → 114/0 ✅.

```
$ cd web && npm run typecheck
> playrent-web@1.0.0 typecheck
> node node_modules/typescript/bin/tsc --noEmit
TYPECHECK_EXIT=0
```

```
$ cd web && node node_modules/vite/bin/vite.js build --base=/PlayRent/
vite v6.4.4 building for production...
✓ 1647 modules transformed.
dist/index.html                   0.91 kB │ gzip:  0.48 kB
dist/assets/index-BuQklcga.css   33.61 kB │ gzip:  7.30 kB
dist/assets/index-DO3Hgrm7.js   486.40 kB │ gzip:137.76 kB
✓ built in 15.57s
BUILD_EXIT=0
```

Verifikasi tambahan:

```
$ node server/tools/security-probe.mjs
…
blockers=0  majors=0  minors=0  total=69
VERDICT: PASS
```

- Build dengan `VITE_API_BASE_URL=https://tunnel.example.test` → `grep -c` di `dist/assets/*.js` = **1** (ter-inline ✅).
- Bundle **tanpa** env → `const k2=""` → URL relatif `/api/...` ✅ (jalur fallback same-origin terbukti).
- `server/data/playrent.db` md5/mtime/size **identik** sebelum–sesudah test ✅.

---

## 4. Temuan baru

### NEW-1 (Low) — Fail-fast menerima URL ber-path / ber-query → deploy terbit dengan 404 di semua panggilan

**Lokasi:** `.github/workflows/deploy.yml:50-70` (step "Check VITE_API_BASE_URL repository variable").

**Bukti (step YAML asli dijalankan dengan 10 nilai):**

```
value='https://host.example'           exit=0   ← benar
value='https://host.example/api'       exit=1   ← ditolak (suffix /api) ✅
value='https://host.example/api/'      exit=1   ← ditolak ✅
value='https://host.example/app'       exit=0   ← SEHARUSNYA ditolak ✗
value='https://host.example/app/api'   exit=1   ← ditolak ✅
value='https://host.example?x=1'       exit=0   ← SEHARUSNYA ditolak ✗
value='https://host.example/#/x'       exit=0   ← SEHARUSNYA ditolak ✗
value='http://host.example'            exit=0   ← http diterima (minor)
value='ftp://host.example'             exit=1   ← ditolak ✅
value='' / '   '                      exit=1   ← ditolak ✅
```

**Dampak:** `VITE_API_BASE_URL=https://host/app` lolos → `apiUrl()` menghasilkan
`https://host/app/api/...` → **404 di setiap panggilan** — persis kegagalan yang
step "Verify API origin is inlined" yuktu aimkan. Tapi step itu **hanya membuktikan
keberadaan string**, dan string-nya memang ada → **lolos** → bundle rusak ter-publish.
Kontrak §1.1 mensyaratkan "Origin API … **tanpa** trailing slash, **tanpa** `/api`" dan pesan
error workflow sudah menulis "origin only: no trailing slash, no /api" — jadi **pemeriksaan
nya belum sesuai pesannya sendiri**.

**Usulan perbaikan (satu blok bash, minimal):**

```bash
# reject anything that is not scheme://host[:port]  (no path / query / hash)
rest="${value#*://}"
case "$rest" in
  */*|*'?'*|*'#'*)
    echo "::error::VITE_API_BASE_URL='$value' must be the ORIGIN only — no path, query or fragment (example: 'https://<tunnel-host>')."
    exit 1
    ;;
esac
```

> Deliverable: **@devops** (DO-003). Prioritas rendah — bukan blocker, karena operator tetap
> punya checklist §5 runbook yang menyebut "origin saja". Tapi memperbaiki ini menutup
> kelas kegagalan yang justru diklaim workflow sudah cegah.

### NEW-2 (Low) — `TRUST_PROXY=1` + port 4000 bind `0.0.0.0` → klien LAN bisa memalsukan XFF

**Lokasi:** `server/src/index.js:13` (`app.listen(port)` tanpa host → bind ke semua interface;
komentar di `:14` menyatakannya: *"No host argument => Node binds all interfaces (0.0.0.0),
reachable from the LAN"*), `specs/deployment-guide.md:182-184`.

**Analisis:** `TRUST_PROXY=1` berarti Express mempercayai 1 hop ⇒ `req.ip` = entri XFF
**paling kanan**. Bila klien lain di jaringan yang sama unforesee menjangkau `http://<IP-LAN>:4000`
langsung (tunnel dilewati), klien itu **berkontrol penuh** atas header XFF-nya ⇒ bisa
membuat bucket rate-limit baru tiap percobaan persis seperti skenario HIGH-1.

**Mengapa Low, bukan High:**
- Rate-limit login kunci **username + IP** (`auth.js:186-193`) → penyerang LAN tetap harus
  menebak username; itu bukan bypass tanpa batas seperti sebelumnya (yang juga butuh username).
- Runbook **sudah** memperingatkan: "Aktifkan hanya kalau server benar-benar berada di
  belakang reverse proxy tepercaya" (`:182`) — hanya redaksinya menyebut "dibuka langsung ke
  internet", padahal faktanya `0.0.0.0` = **LAN** juga terjangkau.
- Tidak ada perubahan terhadap `HEAD` yang memperburuk ini: sebelumnya `TRUST_PROXY` default
  `false` → XFF diabaikan; sekarang operator **wajib** menyetel `1` untuk deploy produksi.

**Usulan perbaikan (pilih salah satu, deliverable @node-developer / @devops):**
1. **Tighten binding di produksi** — `app.listen(port, process.env.HOST || '0.0.0.0')` dan
   set `HOST=127.0.0.1` di `server/.env` produksi (hanya `cloudflared` yang perlu). ⚠️
  -perlu dicek: README `:659-671` mendokumentasikan akses dari HP via Wi-Fi ke
   `http://192.168.x.x:4000` — fitur **dev**; kalau binding diubah jadi loopback, fitur itu
   ikut mati dan README harus diperbarui.
2. **Atau** perjelas peringatan di runbook §3.2 + `.env.example`: "port 4000 ter-bind
   `0.0.0.0` ⇒ terjangkau dari jaringan lokal; pastikan jaringan lokal tepercaya, atau
   batasi aksesnya (firewall Termux / `iptables`)."

### NEW-3 (Low) — Tabel "konfigurasi efektif" tidak membedakan "tidak terbaca" vs "nilai tidak dikenal"

**Lokasi:** `specs/deployment-guide.md:225-231`.

Tabel itu hanya punya satu baris untuk kasus gagal:

```
| `trustProxy=1` | `1` (jumlah hop) | `false` → `TRUST_PROXY` tidak terbaca; aktifkan dengan `TRUST_PROXY=1`. |
```

 Schwarzen  ada **dua** sebab berbeda dengan gejala identik (`trustProxy=false`):
1. `.env` tidak terbaca (cwd salah / file salah nama) → perbaikannya: jalankan dari `server/`.
2. Nilai **salah ketik** (`TRUST_PROXY=one`, `TRUST_PROXY=yes`, `TRUST_PROXY=1.5`) →
   `parseTrustProxy()` mengembalikan `false` **+** peringatan startup
   `TRUST_PROXY="one" tidak dikenal — X-Forwarded-For diabaikan. Set jumlah hop (mis. 1) bila server di belakang proxy.`
   (`config.js:100-102`) → perbaikannya: edit `.env`.

Kalau operator mengikuti tabel itu, dia akaniagnosis "tidak terbaca" dan mengejar masalah cwd
yang sebenarnya salah. **Usulan:** tambah satu baris tabel + rujukan ke pesan peringatan,
contoh:

```
| `trustProxy=false` + ada baris `PERINGATAN: TRUST_PROXY="…" tidak dikenal` | — | Nilai env **salah ketik** → perbaiki nilainya di `server/.env` (bukan masalah cwd). |
```

---

## 5. Cross-check audit dukungan browser terhadap sumber (MEDIUM-1)

| Klaim runbook §7 | Sumber | Putusan |
| --- | --- | --- |
| §7.2 Chrome: phase-out cookie 3P **dibatalkan** (Apr 2025), dikonfirmasi CMA | Google 22-Apr-2025 (tanpa prompt global baru); CMA 17-Okt-2025 "Decision to release the commitments"; reversal 22-Jul-2024 | ✅ **akurat** |
| §7.2 Chrome: cookie 3P **tetap tersedia** di browsing normal | MDN "Third-party cookies": *"Google Chrome doesn't block third-party cookies by default, only in Incognito mode, or when users explicitly set it"* | ✅ **akurat** |
| §7.2 Chrome: **Incognito memblokir cookie 3P** | Chrome Help: *"In Incognito mode, third-party cookies are blocked by default"* | ✅ **akurat** |
| §7.2 Chrome: pengguna bisa mematikan lewat Settings → Privacy and security → Third-party cookies | Chrome Help (Allow/Block third-party cookies + exception list) | ✅ **akurat** |
| §7.2 Edge = Chromium; Tracking Prevention "Balanced" membatasi tracker, **tidak** memblokir semua 3P | MDN: *"Edge blocks trackers from unvisited sites, and blocks known harmful trackers by default"* | ✅ **akurat** |
| §7.3 Firefox: **TCP** default sejak v102 (rollout global 14-Jun-2022) | blog.mozilla.org 14-Jun-2022 | ✅ **akurat** |
| §7.3 Firefox: **State Partitioning** default sejak v103 | MDN State Partitioning: *"From Firefox 103, State Partitioning is turned on by default"* | ✅ **akurat** |
| §7.3 Firefox **mempartisi**, bukan memblokir | MDN: *"Our current default cookie policy blocks access in a third-party context only for domains classified as trackers"* + TCP *"separate cookie jar per site"* | ✅ **akurat** (dan runbook sudah mengoreksi kalimat lamanya "masih diizinkan") |
| §7.4 WebKit: pihak ketiga tidak boleh **menetapkan** cookie baru kecuali sudah punya cookie | webkit.org/blog/9661: *"Safari's original cookie policy restricts third-parties from setting cookies unless they already have set cookies as first-party"* | ✅ **akurat** |
| §7.4 **Full Third-Party Cookie Blocking** (Safari 13.1, 2020-03): memblokir **semua** 3P tanpa pengecualian | webkit.org/blog/10218: *"Cookies for cross-site resources are now blocked by default across the board"* | ✅ **akurat** |
| §7.4 Storage Access API **hanya** dari iframe lintas situs | MDN `requestStorageAccess()` + webkit.org/blog/11545: *"The API is called from inside cross-site, or third-party, iframes"* | ✅ **akurat** → login lintas situs di Safari **diproyesikan gagal** = klaim runbook |
| §7.4 Cookie Blocking Latch Mode | webkit.org/blog/10218 ("with full third-party cookie blocking in place, latch mode is back") | ✅ **akurat** |
| §7.6 "Build sukses ≠ login pasti berhasil" | — | ✅ **akurat & penting** (inti item 5 plan.md) |

**Tidak ada klaim yang masih terlalu optimis.** Revisi DO-002 mengganti klaim lama
("Safari … bisa gagal", "Firefox masih diizinkan", "kebijakan 3P Chrome sedang berubah")
dengan yang akurat **dan** jujur. Satu-satunya hal yang masih berupa inferensi ditandai
eksplisit sebagai **[PERKIRAAN]** (Chrome "seharusnya berhasil", Firefox "secara teoritis",
Safari "diproyesikan gagal") — itu memang tidak bisa diklaim sebagai fakta tanpa uji browser.

---

## 6. Status requirement `plan.md` (1–8) + blok penutup

| # | Requirement | Status | Bukti |
| --- | --- | --- | --- |
| 1 | `VITE_API_BASE_URL` di `web/src/lib/api.ts`; semua request `/api/...` ke origin API bila ada, tetap proxy lokal bila kosong | ✅ **terpenuhi** | `web/src/lib/api.ts:61` (`API_BASE_URL`), `:65-68` (`apiUrl()`), dipakai `request()` (`:76`), `transactions.receiptUrl()` (`:222`), `reports.exportCsvUrl()` (`:272`). Grep `web/src/` → **tidak ada** `/api/...` hardcoded di luar `api.ts`. Bundle tanpa env → `const k2=""` → `/api/...` relatif ✅ |
| 2 | Workflow memakai **repository variable** `VITE_API_BASE_URL` saat build | ✅ **terpenuhi** | `.github/workflows/deploy.yml:47-76` (`vars.VITE_API_BASE_URL` di env step check **dan** build) + `:83-96` verifikasi inlining. Bukti: build dengan env → `grep -c` = **1**. ⚠️ residual NEW-1 (nilai ber-path lolos) |
| 3 | Origin produksi CORS + CSRF = `https://adjietegaralamsyah312.github.io` **tanpa** `/PlayRent` | ✅ **terpenuhi** | `server/src/config.js:52-54` (default prod), `server/src/lib/auth.js:171-174` (CSRF allowlist = CORS allowlist + origin API sendiri), probe runtime: `ACAO: https://adjietegaralamsyah312.github.io` (tanpa path) ✅ |
| 4 | Cookie `httpOnly` dipertahankan; SameSite/Secure env-driven; **jangan** matikan CSRF; **jangan** ekspos token | ✅ **terpenuhi** | `server/src/lib/auth.js:105-125` (`sessionCookieOptions()` — `httpOnly` hardcode `true`, tanpa `Domain`, invarian `None⇔Secure`, `clearCookie` identik). Probe: `Set-Cookie … HttpOnly; Secure; SameSite=None; Path=/`; body JSON tidak memuat token ✅; `app.use(csrfGuard)` tanpa kondisi/env ✅ |
| 5 | Audit dukungan browser cookie lintas situs; laporkan batasan; **jangan** menyatakan login pasti berhasil hanya karena build sukses | ✅ **terpenuhi** | `specs/deployment-guide.md:438-571` §7.1-§7.8 (penanda [FAKTA]/[PERKIRAAN], §7.6 tegas "Build sukses ≠ login pasti berhasil") + `README.md:639-657` + `docs/CARA-PAKAI.md:12-27`. Akurasi diverifikasi silang terhadap sumber (§5 di atas) ✅ |
| 6 | Periksa endpoint login / logout / `/api/auth/me` / register; tambah atau perbarui test | ✅ **terpenuhi** | `server/test/deploy.test.js` (18 test: 13 BE-001 + 5 BE-002) + `server/test/auth.test.js` (dipertahankan, jadi config-aware). Cakupan: login sukses/gagal, `/me` 200/401, logout + atribut identik, register 201 tanpa cookie sesi, register `role` di body → 400, CORS preflight allowed/asing, CSRF asing/without-Origin+`Sec-Fetch-Site`, invarian `None⇔Secure`, `req.ip` saat `TRUST_PROXY` on/off, `req.protocol` dari `X-Forwarded-Proto`, parser hop count |
| 7 | Jalankan typecheck, tes backend, build frontend | ✅ **terpenuhi** | `npm test` → **114 pass / 0 fail**; `npm run typecheck` → **0 error**; `vite build --base=/PlayRent/` → **sukses**; `security-probe.mjs` → **69/69, VERDICT: PASS** (§3.6) |
| 8 | **Jangan** reset database / ganti password pengguna / hapus data | ✅ **terpenuhi** | `git status -- server/data …` → kosong; md5/mtime/size DB **identik** sebelum–sesudah test; tidak ada perintah destruktif di jalur deploy; bagian "Reset database" di README diberi peringatan; baris "hapus DB + hapus backup" di CARA-PAKAI diganti "jangan hapus datanya" (§2.3) |
| **akhir** | Berikan **langkah pengaturan repository variable** + **cara memastikan login berfungsi dari alamat GitHub Pages publik** | ✅ **terpenuhi** | **Variable**: `specs/deployment-guide.md:331-380` §5 (6 langkah: Settings → Secrets and variables → Actions → tab **Variables** → New repository variable → name `VITE_API_BASE_URL` → value origin saja → Scope Repository) + §5.1 (variable tidak retroaktif → push/`Run workflow`) + §5.2 (dua fail-fast) + `README.md:625-637`. **Verifikasi login**: §6.1 (curl: HEAD Pages, `/api/health`, preflight CORS) + **§6.2 "Cek dari browser (WAJIB)"** (DevTools → Network → `POST /api/auth/login` 200 + `Set-Cookie` `HttpOnly; SameSite=None; Secure; Path=/` → `GET /api/auth/me` **200** bukan 401 → Application → Cookies → `pr_session` → cek atribut → halaman berdata terisi) + §6.3 (bundle) + §7.7 (diagnosis cepat) + checklist operator 14 item `:737-760` (item 11-14 wajib di browser, item 14 wajib tes Safari juga) + tabel troubleshooting |

---

## 7. Keputusan jujur — apakah login lintas situs bisa dinyatakan berhasil?

> ### **Belum bisa dipastikan tanpa uji browser manual.**
>
> Yang **terbukti** (dengan bukti konkret, bukan asumsi):
> 1. Konfigurasi server benar: cookie `pr_session` keluar sebagai `HttpOnly; Secure; SameSite=None; Path=/`,
>    tanpa `Domain`, token tidak pernah ada di JSON body, `clearCookie` memakai atribut identik.
> 2. CORS meng-echo origin yang cocok (bukan `*`) dengan `credentials: true`.
> 3. CSRF menerima origin Pages, menolak origin asing (403) **dan** menolak request tulis tanpa
>    `Origin` tetapi dengan `Sec-Fetch-Site: cross-site` (403).
> 4. Bundle frontend benar-benar meng-inline origin API (`grep` = 1) dan **relatif** bila env kosong.
> 5. Rate-limit tidak lagi bisa dilewati dengan merotasi `X-Forwarded-For`.
>
> Yang **belum terbukti**:
> 1. **Tidak ada satu pun bukti level browser** bahwa cookie 3P benar-benar dikirim kembali.
>    114 test + 69 probe semuanya level header HTTP. Yang dibuktikan adalah *konfigurasi benar*,
>    bukan *alur kerja jalan*.
> 2. **Safari/WebKit hampir pasti gagal** dengan arsitektur ini (ITP memblokir semua cookie 3P
>    tanpa pengecualian; Storage Access API tidak berlaku untuk SPA top-level). Fallback
>    same-origin bukan pelengkap — itu **jalur andal** di Safari.
> 3. **Chrome/Edge kemungkinan besar jalan**, tapi bergantung pada setelan pengguna
>    (Incognito, "Block third-party cookies", ekstensi, policy perusahaan).
> 4. **Firefox kemungkinan besar terkirim**, tapi partisi harus tetap stabil antara login dan reload.
> 5. Uji manual operator (§6.2 runbook) **belum dijalankan** — tidak bisa dilakukan dalam review ini.
>
> **Klaim yang BOLEH** dibuat: *"konfigurasi server dan bundle sudah benar dan terverifikasi;
> perilaku browser masih harus dibuktikan manual."*
> **Klaim yang TIDAK BOLEH** dibuat: *"login lintas situs pasti berhasil."*

---

## 8. Status verifikasi keseluruhan

# `partially_verified`

**Terverifikasi dengan bukti eksekusi:**
- `npm test` → **114 pass / 0 fail** (1 flake timing pre-existing pada `timer.test.js` di run pertama — file tidak diubah, lolos saat run sendiri) ✅
- `npm run typecheck` → **0 error** ✅
- `vite build --base=/PlayRent/` → **sukses** ✅
- `tools/security-probe.mjs` → **69/69, 0 blocker/major/minor, VERDICT: PASS** ✅
- **HIGH-1** tertutup dan **terbukti** (matriks `req.ip` + end-to-end bucket rate-limit) ✅
- **MEDIUM-3** tertutup dan **terbukti** (matriks `Sec-Fetch-Site`) ✅
- **MEDIUM-1** tertutup — klaim audit browser akurat terhadap sumber vendor/MDN ✅
- Kontrak §2 / §3 / §6 tetap terpenuhi setelah BE-002 (probe `createApp()` asli) ✅
- Item 8 plan.md terpenuhi (md5/mtime/size DB identik; `git status` bersih) ✅
- **Tidak ada temuan Critical dan tidak ada temuan High tersisa.** ✅
- Tidak ada regresi keamanan terhadap `HEAD` ✅

**Belum terverifikasi (tidak bisa diverifikasi di lingkungan review):**
- **Perilaku browser nyata** (cookie benar-benar dikirim lintas situs) → wajib uji manual
  operator di runbook §6.2. Karena itu **login lintas situs tidak boleh diklaim "pasti berhasil"**.
- **Eksekusi workflow di GitHub Actions** — step "Verify API origin is inlined" belum pernah
  jalan di CI asli. Bukti lokal: simulasi 4 kasus dengan **teks YAML yang sama persis** +
  build Vite nyata ✅ (cukup, tapi bukan CI).
- **Runtime server di Termux milik operator** (log konfigurasi efektif, probe `TRUST_PROXY`
  runbook §3.2) — sudah saya buktikan di perangkat ini dengan env produksi, tapi belum di
  perangkat operator.

---

## 9. Rekomendasi (prioritas, untuk Leader)

| Prioritas | Temuan | Deliverable | Fix yang disarankan |
| --- | --- | --- | --- |
| 1 | NEW-1 | @devops (DO-003) | Tambahkan cek "origin only" di step "Check VITE_API_BASE_URL" (lihat §4 NEW-1) → tolak nilai ber-path/query/hash |
| 2 | NEW-2 | @node-developer / @devops | Bind loopback di produksi (`HOST=127.0.0.1`) **atau** perjelas peringatan LAN di runbook §3.2 + `.env.example` (kalau binding diubah, README §"Akses dari HP di Wi-Fi yang sama" harus diperbarui) |
| 3 | NEW-3 | @devops | Tambah baris tabel "konfigurasi efektif" untuk kasus "nilai env tidak dikenal" + rujukan ke pesan peringatan startup |
| 4 | (operator) | — | Jalankan checklist runbook §11 item 1-14, **khususnya item 11-14** (uji browser di minimal Chrome **dan** Safari), lalu catat hasilnya. Sampai langkah itu dilakukan, deploy **tidak** boleh dinyatakan "login lintas situs berhasil" |
| 5 | (operator) | — | Kalau audiens banyak Safari → aktifkan **fallback same-origin** (§8) sekarang juga, jangan menunggu gejala |

---

*Laporan ini hanya berisi temuan dan bukti. Tidak ada kode implementasi, kontrak, atau
laporan agent lain yang saya ubah.*
