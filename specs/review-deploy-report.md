# RV-001 — Review Deploy Lintas-Situs (Pages + Cloudflare Tunnel)

> Agen: @reviewer · Task: RV-001 · Mode: thorough · Tanggal: 2026-10-21
> Kontrak acuan: `specs/deploy-contract.md` · Input: `specs/be001-report.md`, `specs/fe001-report.md`,
> `specs/deployment-guide.md`, `plan.md`
> Objek review: `git diff` (BE-001 + FE-001 + DO-001) + file baru
> `server/test/deploy.test.js`, `specs/deployment-guide.md`.
>
> **Tidak ada file yang saya ubah.** Semua temuan di bawah adalah laporan; tidak ada fix
> yang saya terapkan (kecuali artefak `web/dist` lokal, lihat LOW-2).

---

## 0. Ringkasan eksekusi

**Tidak ada temuan Critical.**
**Ada 1 temuan High** (HIGH-1) dan **3 temuan Medium** (MEDIUM-1..3).
Semua temuan lain Low.

Kode yang di-review **patuh kontrak §2, §3, §6** dan **tidak melemahkan kontrol keamanan
yang sudah ada** (regresi diverifikasi lewat `git show HEAD:server/src/lib/auth.js`).
Yang bermasalah adalah **2 artefak non-kode**: (a) runbook produksi mengaktifkan
`TRUST_PROXY=true` yang mematikan proteksi rate-limit, dan (b) audit dukungan browser di
runbook memuat beberapa klaim yang tidak akurat untuk kondisi 2026.

---

## 1. Ringkasan temuan per severity

| # | Sev | Lokasi | Temuan | Dampak nyata |
| --- | --- | --- | --- | --- |
| HIGH-1 | High | `specs/deployment-guide.md:115,129,137-152` · `README.md:576,579` · `server/src/config.js:71-73` · `server/src/app.js:17` | Runbook menyuruh `TRUST_PROXY=true`; Express `trust proxy: true` mempercayai **seluruh** rantai XFF, dan Cloudflare **menambah** (bukan mengganti) XFF kiriman klien → `req.ip` = entri paling kiri = **dikendalikan penyerang** | Rate-limit login (5 gagal/15 mnt per username+IP) dan rate-limit register (10/15 mnt per IP) **bisa dilewati** dengan mengganti `X-Forwarded-For` tiap percobaan → brute-force/credential-stuffing tanpa batas. Persis kontrol yang README sendiri dokumentasikan bisa dilewati (`README.md:190-196`) |
| MEDIUM-1 | Medium | `specs/deployment-guide.md:369-374,379-395` | Audit dukungan browser **tidak akurat** untuk 2026: Chrome (phase-out 3P dibatalkan Apr 2025, Incognito memblokir 3P), Firefox (bukan "diizinkan" tapi dipartisi sejak v102/v103), Safari (ITP memblokir **semua** cookie 3P tanpa pengecualian → login lintas situs **dipastikan gagal**, bukan "bisa gagal") | Runbook dan hasil audit (item 5 plan.md) dan keputusan fallback salah arah: operator Safari akan mengira ini "kena aturan browser", padahal arsitektur cross-site memang tidak kompatibel dengan WebKit |
| MEDIUM-2 | Medium | `server/test/deploy.test.js` (13 test, semua level header HTTP) · `specs/deployment-guide.md:337-347` | **Tidak ada bukti positif** bahwa login lintas situs bekerja di browser sungguhan. Semua test asserting header, tidak ada browser/Playwright | Klaim "deploy siap" tidak dapat dibuktikan dari CI. Runbook §6.2 sudah mewajibkan verifikasi manual → prosesnya benar, tapi status verifikasi tetap *belum* |
| MEDIUM-3 | Medium | `server/src/lib/auth.js:160` (`if (!origin) return next()`) | Dengan `SameSite=None` + `Secure`, cookie **tetap dikirim** lintas situs → `csrfGuard` jadi satu-satunya pertahanan CSRF di browser. Cabang "tanpa header `Origin`" melewati guard sepenuhnya | Permintaan tulis lintas situs tanpa header `Origin` (browser/ekstensi privacy yang strip `Origin`, klien non-browser) lolos. Pre-existing, tapi profil risikonya berubah karena `SameSite=Lax` → `None` dicabut |
| LOW-1 | Low | `.github/workflows/deploy.yml:47-76` | Fail-fast hanya memvalidasi **bentuk** variable; tidak memverifikasi nilainya benar-benar ter-inline ke bundle | Kalau `web/src/lib/api.ts` suatu saat berhenti memakai `import.meta.env`, check tetap hijau tapi bundle rusak. Fix: tambah 1 step `grep -qF` setelah build. Also: check hanya menolak suffix `/api`, path lain (`https://host/x`) lolos |
| LOW-2 | Low | `web/dist/` (artefak lokal, gitignored) | `web/dist` sekarang berisi hasil build verifikasi (base `/PlayRent/`, tanpa `VITE_API_BASE_URL`). Server menyajikan `web/dist` sebagai SPA | Kalau operator menjalankan mode same-origin lokal (runbook §8.1) tanpa rebuild, asset `/PlayRent/assets/...` 404. Rebuild: `cd web && npm run build` |
| LOW-3 | Low | `server/package.json:8-9` | `--env-file-if-exists=.env` **relatif terhadap cwd** | `node server/src/index.js` dari root repo diam-diam mengabaikan `server/.env` → `NODE_ENV=development` → `SameSite=Lax` → login diam-diam rusak. Jalur terdokumentasi (`cd server && npm start`) aman dan log `env=production` menangkapnya → cukup ditegaskan di runbook |
| LOW-4 | Low | `specs/deployment-guide.md:452-466` (§8.2) | Fallback same-origin diam-diam bergantung pada `TRUST_PROXY=true` tetap aktif | Kalau operator mematikan `TRUST_PROXY` saat pindah ke same-origin, `req.protocol` = `http` → origin API sendiri jadi `http://<host>` → semua request tulis kena `403 CSRF_ORIGIN_MISMATCH` |
| LOW-5 | Low | `server/tools/security-probe.mjs:159` | Referensi AUTH-14 basi (`server/src/lib/auth.js:88`, "cookieOpts sets secure:isProd") — kodenya sudah `cookieSecure()` | Probe tetap **PASS** (69/69, 0 blocker) → kosmetik saja |
| LOW-6 | Low | `server/src/config.js:22,29,32` | Dua sumber kebenaran "apakah production": `nodeEnv` (import-time), `runtimeIsProd()` (call-time), `isProd` (import-time, hanya dipakai probe) | Risiko drift saat ada kode baru memakai `isProd`. Tidak ada bug sekarang |

### Tidak ditemukan (sudah diverifikasi, bukan asumsi)

- **Tidak ada wildcard CORS.** Paket `cors` menerima `origin` berupa array → `isOriginAllowed()` mencocokkan exact → header `Access-Control-Allow-Origin` hanya muncul untuk origin yang cocok. Terverifikasi lewat test (`deploy.test.js:179-213`) **dan** lewat pembacaan kode `node_modules/cors`.
- **Token sesi tidak pernah di body JSON.** `mapUser()` (`server/src/lib/mappers.js:7-15`) hanya mengembalikan id/username/fullName/role/isActive/phone/createdAt.
- **`HttpOnly` selalu `true`**, tidak ada atribut `Domain`, `path=/` tetap.
- **Invarian `SameSite=None` ⇔ `Secure=true` uphold** di `session/src/lib/auth.js:104-116` (`sessionCookieOptions()`), termasuk downgrade otomatis ke `lax` bila `Secure=false`.
- **`clearCookie` memakai atribut identik** dengan `setCookie` (keduanya `sessionCookieOptions()`) → cookie lama benar-benar terhapus saat logout. Terverifikasi lewat test (`deploy.test.js:102-136`).
- **CSRF guard tidak bisa dimatikan lewat env** — tidak ada env/konstanta yang mengaktifkannya; `app.use(csrfGuard)` tanpa kondisi (`server/src/app.js:28`).
- **Tidak ada regresi keamanan** dibanding `git show HEAD:server/src/lib/auth.js` dan `HEAD:server/src/app.js`:
  `requireAuth` / `requireSuperAdmin` / `checkLoginRateLimit` / `recordLoginAttempt` / `hashPassword` / `verifyPassword` tidak berubah; `app.disable('x-powered-by')`, `express.json({limit:'1mb'})`, `cookieParser()` tetap ada; urutan middleware tidak berubah.
  Catatan: CSRF allowlist kini **tebal** (ikut `CORS_ORIGIN` persis) — `http://127.0.0.1:5173` tidak lagi otomatis boleh kalau `CORS_ORIGIN` di-override. Ini pengetatan, bukan pelemahan.
- **Tidak ada kebocoran secret dari `--env-file-if-exists`.** `server/.env` gitignored **dan** tidak ter-track (`git ls-files server` → hanya `.env.example`); env shell yang sudah ada **menang** atas isi file (diverifikasi empiris: `FOO=fromshell` + file `FOO=fromfile` → hasil `fromshell`); tidak ada endpoint yang men-dump `process.env` (hanya `admin-bootstrap.js` yang membacanya).
- **`npm test` tidak memuat `.env`** (script = `node --test`, tanpa flag env-file) → test tidak tercemar setting operator. `server/test/helpers.js:30-31` mengarahkan `DB_PATH` ke temp dir **sebelum** `src/db.js` di-import.

---

## 2. Status requirement `plan.md` (1–8) + permintaan akhir

| # | Requirement plan.md | Status | Bukti |
| --- | --- | --- | --- |
| 1 | `VITE_API_BASE_URL` di `web/src/lib/api.ts`; semua request `/api/...` ke origin API bila ada, tetap proxy lokal bila kosong | **terpenuhi** | `web/src/lib/api.ts:58-70` (`apiUrl()`), dipakai `request()` (`:76`), `transactions.receiptUrl()` (`:222`), `reports.exportCsvUrl()` (`:272`). Grep `src/` → **tidak ada** `/api/...` hardcoded di luar `api.ts` |
| 2 | Workflow memakai repository variable `VITE_API_BASE_URL` saat build | **terpenuhi** | `.github/workflows/deploy.yml:47-76` (check + build step punya `env: VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}`). Verifikasi empiris: build dengan env → `grep -c "https://tunnel.example.test" dist/assets/*.js` = **1** (ter-inline) |
| 3 | Origin produksi CORS + CSRF = `https://adjietegaralamsyah312.github.io` tanpa `/PlayRent` | **terpenuhi** | `server/src/config.js:38-49` (default prod), `server/src/lib/auth.js:161-163`, test `deploy.test.js:215-225` |
| 4 | Cookie `httpOnly` dipertahankan; SameSite/Secure env-driven; CSRF tidak dimatikan; token tidak diekspos | **terpenuhi** | `server/src/lib/auth.js:104-125`; test `deploy.test.js:51-76,102-136,227-247,314-320`; `auth.test.js:20-33` |
| 5 | Audit dukungan browser cookie lintas situs; laporkan batasan; jangan menyatakan login pasti berhasil hanya karena build sukses | **terpenuhi sebagian** | Runbook §7 (`:360-427`) ada dan **sopan hati** (tidak mengklaim pasti berhasil); §7.4 menyatakan tegas "Build sukses ≠ login pasti berhasil" ✅. **Tapi** isi audit punya klaim yang tidak akurat → MEDIUM-1 |
| 6 | Periksa endpoint login / logout / `/api/auth/me` / register; tambah atau perbarui test | **terpenuhi** | Lihat §5 di bawah |
| 7 | Jalankan typecheck, tes backend, build frontend | **terpenuhi** | 109 pass / 0 fail; typecheck exit 0; build sukses (§4) |
| 8 | Jangan reset database / ganti password / hapus data | **terpenuhi** | Bukti di §7 |
| akhir | Berikan langkah pengaturan repository variable + cara memastikan login berfungsi dari URL Pages publik | **terpenuhi** | `specs/deployment-guide.md:265-306` (§5 + §5.2) dan `:309-357` (§6), checklist operator `:568-585`, plus `README.md:552-598` |

---

## 3. Audit dukungan browser cookie lintas situs

> Penanda: **[FAKTA]** = terdokumentasi vendor/spec. **[PERKIRAAN]** = belum diuji di browser
> sungguhan, wajib dibuktikan manual.

### 3.1 Dukungan atribut `SameSite=None` + `Secure`

**[FAKTA]**

| Browser | Versi minimal untuk *atribut* `SameSite=None` | Syarat tambahan |
| --- | --- | --- |
| Chrome | 80 | `Secure` wajib |
| Edge | 80 (Chromium; EdgeHTML **tidak** mendukung) | `Secure` wajib |
| Firefox | 96 | `Secure` wajib |
| Safari / WebKit | 13 | `Secure` **wajib**; WebKit menolak `SameSite=None` tanpa `Secure` (perilaku yang diperbaiki di Safari 13.1) |

**[FAKTA]** Rumah bawah ini: browser yang tidak paham `SameSite=None` memperlakukan cookie
sebagai `SameSite=Strict` → cookie tidak pernah dikirim lintas situs → gejala khas
"login `200`, lalu semua request `401`". Gejala ini sudah didokumentasikan runbook
(`:376-377`) ✅.

### 3.2 Chrome — **[FAKTA]**

- Google **membatalkan** phase-out cookie pihak ketiga (pengumuman 2025-04-22; dikonfirmasi
  CMA 2025). Cookie 3P **tidak** dihapus, dan tidak ada prompt global baru.
- Cookie 3P **tetap tersedia** di browsing normal; pengguna bisa menonaktifkannya sendiri
  lewat **Settings → Privacy and security → Third-party cookies → Block third-party cookies**.
- **Chrome Incognito memblokir cookie pihak ketiga secara default.**
- Chrome 118+ menampilkan peringatan di DevTools → Issues:
  *"Cookie sent in cross-site context will be blocked in future Chrome versions."*

Dampak untuk runbook: di Chrome, login lintas situs **seharusnya** berhasil — kecuali
pengguna mematikan "Block third-party cookies", memakai Incognito, atau kebijakan
perusahaan memaksa setting itu. Dua hal ini **harus** masuk runbook sebagai gejala yang
spesifik (khususnya: "cek di jendela normal, bukan Incognito").

### 3.3 Firefox — **[FAKTA]**

- **Total Cookie Protection (TCP) aktif default sejak Firefox 102** (di-rollout global
  2022-06-14); **State Partitioning default sejak Firefox 103**.
- Firefox **tidak** memblokir cookie 3P secara blanket — ia **mempartisi** per top-level site.
- Pengecualian "first-party isolation" diberikan untuk provider login pihak ketiga
  (cookie storage bersama), diberikan setelah interaksi pengguna.

Dampak untuk runbook: **login lintas situs di Firefox Working secara teoritis** — partisi
di-key oleh top-level site `github.io`, yang stabil untuk aplikasi ini. **PERKIRAAN** yang
wajib diuji: apakah partisi tetap stabil antara langkah "login" dan "reload" di browser yang
sama.

> ⚠️ Runbook §7.1 menulis "Party-party cookie masih diizinkan secara default" — **SALAH**.
> Firefox mempartisi, bukan "mengizinkan". Kesimpulannya (login jalan) tetap benar, tapi
> alasannya salah → MEDIUM-1.

### 3.4 Safari / WebKit — **[FAKTA], dan ini yang paling serius**

- Kebijakan default WebKit (sejak Safari 1.0, masih berlaku): ** pihak ketiga tidak boleh
  MENETAPKAN cookie baru kecuali domain itu sudah punya cookie** → cookie `pr_session`
  hasil login **tidak akan tersimpan sama sekali** saat(origin frontend ≠ origin API).
- "**Full Third-Party Cookie Blocking**" (Safari 13.1, 2020-03): **ITP memblokir semua cookie
  pihak ketiga, tanpa pengecualian.** Akses hanya bisa diberikan lewat **Storage Access API**
  dan fix kompatibilitas popup.
- **Storage Access API hanya bisa dipanggil dari iframe lintas situs.** Aplikasi ini adalah
  SPA **top-level** → **API itu tidak tersedia** untuk kasus ini.
- "**Cookie Blocking Latch Mode**": begitu satu request diblokir, seluruh redirect-nya juga.

Dampak untuk runbook: di Safari, login lintas situs **tidak akan berhasil** — bukan
"mungkin gagal". Jalur yang andal hanya **fallback same-origin (§8)**.

> ⚠️ Runbook §7.2 menulis "login lintas situs **bisa gagal** meskipun seluruh konfigurasi
> sudah benar" — **terlalu optimis**. Dan §8 memposisikan fallback sebagai "kalau cookie
> pihak ketiga diblokir (paling sering di Safari)" → secara faktual **fallback itu adalah
> satu-satunya jalur andal di Safari**, bukan pelengkap → MEDIUM-1.

### 3.5 Edge, mode privasi, ekstensi, jaringan — **[FAKTA] + [PERKIRAAN]**

- **Edge** = Chromium → mengikuti Chrome; "Tracking Prevention: Balanced" (default)
  membatasi tracker tertentu, **tidak** memblokir semua cookie 3P.
- **Mode privasi**: Safari Private Browsing = cookie 3P diblokir (ITP juga berlaku di
  private mode, dengan `_storage_access` sementara). Chrome Incognito = 3P diblokir default.
  **[FAKTA]**
- **Ekstensi pemblokir** (ad blocker, privacy guard) bisa memblokir `Set-Cookie` — **[FAKTA]**
  (mekanisme umum), **[PERKIRAAN]** seberapa luas dampaknya.
- **Jaringan warnet sekolah/kantor** sering memaksa "block third-party cookies" via policy →
  **[FAKTA]** untuk Edge/Chrome Enterprise (policy `BlockThirdPartyCookies`).
- **WebView Android / in-app browser** sering memblokir cookie 3P → **[PERKIRAAN]**, relevan
  kalau operator memakai app dalam WebView.

### 3.6 Klaim runbook: akurasi

| Klaim di `specs/deployment-guide.md` | Putusan | Catatan |
| --- | --- | --- |
| §7.1 "Chrome 80+ · Cookie 3P masih diizinkan, **kebijakan masih berubah**" | **Tidak akurat** | Phase-out dibatalkan Apr 2025. Ganti: "3P masih diizinkan default; pengguna bisa mematikan lewat Settings; Incognito memblokir 3P" |
| §7.1 "Firefox 96+ · Party-party cookie **masih diizinkan** secara default" | **Tidak akurat** | Firefox mempartisi (TCP default v102, State Partitioning v103). Kesimpulan: login jalan |
| §7.1 "Safari 13+ · Wajib `Secure`" | **Akurat** tapi menyesatkan | "13+" = dukungan *atribut*, bukan jaminan cookie benar-benar terkirim. Tambahkan baris "pengiriman aktual: ITP memblokir 3P sejak 13.1" |
| §7.2 "Safari memblokir cookie 3P di banyak konteks … login bisa gagal" | **Terlalu optimis** | WebKit: blokir **semua** 3P, tanpa pengecualian, Storage Access API tidak tersedia untuk top-level SPA → di Safari login lintas situs **dipastikan gagal**. Fallback same-origin = jalur andal |
| §7.3 "Kebijakan cookie pihak ketiga di Chrome sedang berubah" | **Basi** | Lihat 3.2 |
| §7.4 "Build sukses ≠ login pasti berhasil" | **Akurat & penting** ✅ | Pertahankan. Ini inti item 5 plan.md |
| §6.2 "Cek dari browser (wajib)" | **Akurat ✅** | DevTools: `Set-Cookie` (`pr_session=…; HttpOnly; SameSite=None; Secure; Path=/`) lalu `GET /api/auth/me` → **200**. Runbook menyuruh persis ini (§6.2 langkah 2-4) + checklist operator #9/#10 + troubleshooting `:591-600` |
| §8 "Fallback same-origin" | **Akurat secara teknis ✅** | Server memang menyajikan `web/dist` + SPA fallback (`server/src/app.js:32-39`), `apiUrl()` mengembalikan path relatif bila `VITE_API_BASE_URL` kosong → SPA + API satu origin → cookie first-party → `SameSite=Lax` cukup. **Catatan**: fallback diam-diam butuh `TRUST_PROXY=true` tetap aktif (LOW-4) |
| README "batasan dukungan cookie pihak ketiga per browser" | **Hanya pointer** ✅ | README tidak mengklaim sendiri, jadi tidak perlu diubah; cukup fix runbook |

### 3.7 Keputusan: **apakah login lintas situs bisa dinyatakan berhasil?**

> **Belum bisa dipastikan. Jawaban jujur: TIDAK.**
>
> Alasan:
> 1. **Bukti yang ada hanya level header HTTP.** 13 test baru (`server/test/deploy.test.js`)
>    membuktikan bahwa server *mengirim* `Set-Cookie: …; SameSite=None; Secure; HttpOnly`,
>    bahwa CORS meng-echo origin, dan bahwa CSRF menolak origin asing. Tidak ada satu pun
>    test yang membuktikan **browser benar-benar mengirim** cookie itu kembali. Yang
>    dibuktikan adalah *konfigurasi benar*, bukan *alur kerja jalan*.
> 2. **Safari/WebKit hampir pasti gagal** dengan arsitektur ini (ITP memblokir 3P sepenuhnya,
>    Storage Access API tidak berlaku untuk top-level SPA). Diperlukan fallback same-origin
>    — bukan "opsional".
> 3. **Chrome/Firefox kemungkinan besar jalan**, tapi bergantung pada setelan pengguna
>    (Incognito, "Block third-party cookies", ekstensi, policy perusahaan).
> 4. Satu uji browser manual (§6.2 runbook) **wajib** dijalankan oleh operator dari URL
>    publik, dan hasilnya **belum ada** — tidak bisa dilakukan dalam review ini.
>
> Yang **boleh** diklaim: "konfigurasi server dan bundle sudah benar dan terverifikasi;
> perilaku browser masih harus dibuktikan manual." Yang **tidak boleh** diklaim: "login
> lintas situs sudah pasti berhasil."

---

## 4. Hasil 3 perintah verifikasi (output apa adanya)

```
$ cd server && npm test
ℹ tests 109
ℹ suites 0
ℹ pass 109
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 33371.673425
```
→ 109 pass / 0 fail (baseline 96 + 13 test baru `server/test/deploy.test.js`) ✅ **sesuai target**

```
$ cd web && npm run typecheck
> playrent-web@1.0.0 typecheck
> node node_modules/typescript/bin/tsc --noEmit
TYPECHECK_EXIT=0
```
→ 0 error ✅

```
$ cd web && node node_modules/vite/bin/vite.js build --base=/PlayRent/
vite v6.4.4 building for production...
✓ 1647 modules transformed.
dist/index.html                   0.91 kB │ gzip: 0.48 kB
dist/assets/index-BuQklcga.css   33.61 kB │ gzip:  7.30 kB
dist/assets/index-DO3Hgrm7.js   486.40 kB │ gzip:137.76 kB
✓ built in 19.02s
BUILD_EXIT=0
```
→ build sukses ✅

Verifikasi tambahan (di luar 3 perintah):
- `node tools/security-probe.mjs` → `blockers=0 majors=0 minors=0 total=69 / VERDICT: PASS` ✅
- Build dengan `VITE_API_BASE_URL=https://tunnel.example.test` → `grep -c "https://tunnel.example.test" dist/assets/*.js` = **1** (ter-inline ✅); `grep -c 'credentials:"include"'` = 1 ✅
- `node --env-file-if-exists=...` → env shell **menang** atas isi file ✅ (sesuai klaim README `:181-185`)

---

## 5. Cakupan test endpoint auth (item 6 plan.md)

### Yang **sudah** tercover

| Endpoint / kasus | Test | Lokasi |
| --- | --- | --- |
| Login sukses → 200, cookie HttpOnly + SameSite + Secure + Path, tanpa Domain, tanpa password di body | ✅ | `auth.test.js:6-36` (dipertahankan), `deploy.test.js:51-76` |
| Login gagal → 401 generik, **tanpa enumerasi user** (user tak dikenal == password salah) | ✅ | `auth.test.js:10-17` |
| **Rate limit login** → percobaan ke-6 = 429 `RATE_LIMITED` | ✅ | `auth.test.js:38-48` |
| Rate limit tidak bisa dipalsukan lewat `X-Forwarded-For` (saat `TRUST_PROXY=false`) | ✅ | `auth.test.js:117-127` |
| Normalisasi bucket (case/whitespace) | ✅ | `auth.test.js:129+` |
| **Logout** → 200, cookie di-clear dengan atribut identik + `Expires` di masa lalu | ✅ | `deploy.test.js:102-136` |
| Logout benar-benar mencabut sesi di server (cookie lama → `/me` = 401) | ✅ | `smoke-manual.mjs:329-334` |
| **`/api/auth/me`** dengan cookie → 200 + user benar | ✅ | `deploy.test.js:78-100`, `be005-criteria.test.js:401` |
| `/api/auth/me` tanpa cookie → 401 | ✅ | `smoke-manual.mjs` |
| Cookie lama mati setelah deaktivasi / reaktivasi akun | ✅ | `be006-rv003.test.js` |
| **Register** → 201, role `user` ditentukan server, **tanpa** cookie sesi, tanpa hash di body | ✅ | `deploy.test.js:138-158`, `be005-criteria.test.js:446-458` |
| **Register dengan `role` di body → 400 `VALIDATION_ERROR` + akun tidak dibuat** | ✅ | `be005-criteria.test.js:379-385, 469-476` |
| Register duplikat → 409 | ✅ | `be005-criteria.test.js:479-487` |
| Register rate limit → ke-11 = 429 | ✅ | `be005-criteria.test.js:489-502` |
| CSRF: origin asing pada request tulis → 403 `CSRF_ORIGIN_MISMATCH` | ✅ (baru) | `deploy.test.js:160-177` |
| CORS: origin diizinkan di-echo + `credentials:true`; origin asing **tanpa** ACAO | ✅ (baru) | `deploy.test.js:179-213` |
| Invarian `None` tanpa `Secure` → turun ke `Lax` | ✅ (baru) | `deploy.test.js:227-247` |
| Nilai env tak dikenal → fallback default, tidak crash | ✅ (baru) | `deploy.test.js:249-273` |

### Yang **tidak** tercover — penilaian gap (tidak lebay)

| Gap | Severity | Penilaian |
| --- | --- | --- |
| **Tidak ada test browser end-to-end** untuk alur lintas situs (cookie benar-benar dikirim) | **Medium** | Ini gap nyata dan memang MUSTAHIL ditutup dengan test HTTP. Mitigasi: runbook §6.2 + checklist operator. Closed form-nya "verifikasi manual", bukan unit test. MEDIUM-2 |
| `csrfGuard` dengan **tanpa** header `Origin` → lolos (tidak diuji, dan memang lolos) | **Medium** | Gap nyata; ditutup MEDIUM-3 (tambahkan `Sec-Fetch-Site`) |
| Login dengan body tidak valid (missing field / field tambahan) → 400 `VALIDATION_ERROR` | **Low** | Sudah ada test validasi umum (`O14 malformed bodies`) dan `loginSchema` `.strict()`. Tidak perlu test khusus lagi |
| `/api/auth/me` dengan cookie **kedaluwarsa** → 401 `SESSION_EXPIRED` | **Low** | `be006-rv003.test.js` sudah menguji cookie mati. Ditambah test TTL eksplisit = nice-to-have |
| `change-password` & `profile` | **Low / di luar scope** | Endpoint ini tidak disentuh perubahan ini dan sudah punya test di suite lama (`be005-criteria.test.js`). Tidak perlu diperluas untuk task deploy |
| **Login di balik `TRUST_PROXY=true` dengan XFF dipalsukan** | **Medium** | Tidak tercover karena `trust proxy` selalu false saat test. Justru itu **akibat** HIGH-1. Closed form: perbaiki HIGH-1 (`TRUST_PROXY=1`) + tambah test `req.ip` |
| Register: `phone` opsional/null, `fullName` terlalu pendek, username tidak valid | **Low** | Sudah ada validasi zod + test validasi umum |

**Kesimpulan item 6:** coverage endpoint auth **memadai** untuk perubahan ini. Tidak ada
gap Critical/High pada cakupan test. Yang tersisa: (a) verifikasi browser manual,
(b) `Sec-Fetch-Site`, (c) test `req.ip` setelah HIGH-1 diperbaiki.

---

## 6. Regresi keamanan (comparasi `git show HEAD:`)

| Aspek | HEAD (sebelum) | Sekarang | Verdict |
| --- | --- | --- | --- |
| `csrfGuard` | `new Set([corsOrigin, 'http://127.0.0.1:5173'])` | `new Set(corsOrigins())` + origin API sendiri | ✅change). Tidak ada env untuk men-disable |
| CSRF bisa dimatikan via env? | tidak | tidak | ✅ |
| Rate limit (`checkLoginRateLimit`/`recordLoginAttempt`) | ada | ada, tidak berubah | ✅ |
| `requireAuth` / `requireSuperAdmin` | ada | tidak berubah | ✅ |
| `app.disable('x-powered-by')` | ada | ada | ✅ |
| `express.json({ limit: '1mb' })` | ada | ada | ✅ |
| `cookieParser()` | ada | ada | ✅ |
| `trust proxy` default | `false` | `false` (hanya bentuknya berubah ke fungsi) | ✅ default tidak berubah |
| `x-powered-by` / body limit / urutan middleware | — | — | ✅ tidak berubah |
| Atribut cookie | hardcoded `SameSite=Lax` | env-driven + invarian `None⇔Secure` | ✅ lebih baik |
| `clearCookie` vs `setCookie` | sama-sama `Lax` | sama-sama `sessionCookieOptions()` | ✅ lebih baik |
| CORS | `origin: corsOrigin` (string) | allowlist array, tanpa `*` | ✅ lebih baik |

**Tidak ada regresi keamanan yang ditemukan.** Yang berubah justru memperketat
(CORS allowlist, `clearCookie` konsisten, CSRF ikut allowlist).

---

## 7. Bukti jaminan "jangan reset database / ganti password / hapus data" (item 8)

### 7.1 `git status` — tidak ada perubahan di jalur data

```
$ git status --porcelain -- server/data server/src/seed.js server/src/seed-schema.js \
      server/src/admin-bootstrap.js server/src/restore.js server/src/backup.js server/src/schema.sql
(kosong = tidak ada perubahan)
```

`git status --porcelain` keseluruhan (16 entri) **hanya** berisi:
`.github/workflows/deploy.yml`, `README.md`, `docs/CARA-PAKAI.md`, `server/.env.example`,
`server/package.json`, `server/src/app.js`, `server/src/config.js`, `server/src/lib/auth.js`,
`server/test/auth.test.js`, `web/src/lib/api.ts`, `web/src/vite-env.d.ts` (M) +
`plan.md`, `server/test/deploy.test.js`, `specs/*.md` (??).
**Tidak ada** `server/data/**`, seed, bootstrap, restore, backup, atau `schema.sql`.

### 7.2 `server/data/playrent.db` — tidak berubah saat test

```
BEFORE: 7520e190ccc23c999cf9dd8c72b5cfd3  mtime=1792506903 size=229376
$ cd server && npm test   →  ℹ tests 109 / ℹ pass 109 / ℹ fail 0
AFTER : 7520e190ccc23c999cf9dd8c72b5cfd3  mtime=1792506903 size=229376
```
→ **hash identik, mtime identik, ukuran identik** → DB produksi tidak dibuka/tulis oleh test.

Mengapa aman: `server/test/helpers.js:30-31` menyetel `process.env.DB_PATH` ke temp dir
**sebelum** `await import('../src/db.js')`, dan `openDatabase()` hanya dipanggil dengan path
temp (`helpers.js:132`). `src/db.js` sendiri **tidak** membuka DB saat import.

### 7.3 Tidak ada perintah destruktif yang ditambahkan

- Grep pada diff (`.github/workflows/deploy.yml`, `README.md`, `docs/CARA-PAKAI.md`,
  `server/**`, `web/**`) untuk `rm -`, `DROP `, `DELETE FROM`, `TRUNCATE`, `reset`,
  `admin:bootstrap`, `seed`, `restore`, `unlink`, `shred` → **0 temuan** (satu-satunya
  hit adalah teks pesan error `Drop the trailing '/api'` — bukan perintah).
- `specs/deployment-guide.md` → satu-satunya hit `npm run seed:schema` / `npm run
  admin:bootstrap` ada di **tabel prasyarat** (`:85`) sebagai konteks "sudah dilakukan,
  di luar runbook ini", dengan catatan eksplisit: *"Jalur deploy di sini **tidak pernah**
  menyentuh, me-reset, atau menghapus data."* (`:87-89`).
- §9.3 (`:530-531`) tegas: *"**Jangan** menghapus `server/data/playrent.db` atau file
  `-wal`/`-shm`."*
- Workflow GitHub Actions tidak menyentuh server sama sekali (hanya checkout + build
  frontend + `npm test` yang memakai DB temp) → tidak ada jalur yang bisa menulis ke
  `server/data/playrent.db` dari CI.

**Kesimpulan item 8: terpenuhi.** Tidak ada reset DB, tidak ada penggantian password
pengguna, tidak ada penghapusan data. Perintah `admin:bootstrap`/`seed` tidak pernah
dipanggil oleh jalur yang di-review.

---

## 8. Rekomendasi perbaikan (prioritas)

| Prioritas | Temuan | Fix yang disarankan (Delegasi: @node-developer / @devops) |
| --- | --- | --- |
| 1 | HIGH-1 | Ubah `trustProxy()` (`server/src/config.js:71-73`) agar menerima **jumlah hop**: `TRUST_PROXY=1` → `app.set('trust proxy', 1)` (Express ambil entri XFF paling kanan = IP asli yang ditambahkan Cloudflare), `TRUST_PROXY=true` tetap berarti "trust semua" (lindungi dengan warning). Update `specs/deployment-guide.md:115,129,137-152,599` + `README.md:576,579` → pakai `TRUST_PROXY=1` + satu paragraf: "jangan pakai `true`; Cloudflare **menambah** XFF, bukan mengganti, jadi entri paling kiri bisa dipalsukan". Tambahkan test: `req.ip` = entri XFF paling kanan saat trust=1. |
| 2 | MEDIUM-1 | Perbarui `specs/deployment-guide.md` §7.1/§7.2/§7.3 dengan status 2026 (Chrome: phase-out dibatalkan, Incognito memblokir 3P, Settings bisa mematikan; Firefox: dipartisi sejak 102/103 bukan "diizinkan"; Safari: ITP memblokir **semua** 3P tanpa pengecualian → **fallback §8 adalah jalur andal di Safari**, bukan pelengkap). |
| 3 | MEDIUM-3 | Tambahkan `Sec-Fetch-Site` ke `csrfGuard` (`server/src/lib/auth.js:156-166`): `Sec-Fetch-Site: cross-site` → 403 apa pun header `Origin`-nya. Tambahkan test. |
| 4 | LOW-1 | Tambah 1 step workflow setelah build: `grep -qF "$VITE_API_BASE_URL" web/dist/assets/*.js` (gagalkan deploy kalau tidak ter-inline). |
| 5 | LOW-4/LOW-3 | Tambahkan 1 kalimat di runbook §8.2 ("fallback ini tetap butuh `TRUST_PROXY=1`/`true`") dan §3.3 ("jalankan dari folder `server/`; `--env-file` relatif terhadap cwd"). |
| 6 | LOW-5/LOW-6 | Perbarui teks/line-ref AUTH-14 di `server/tools/security-probe.mjs:159`; hapus `isProd`/`nodeEnv` yang duplikat atau beri komentar "khusus probe". |

---

## 9. Status verifikasi keseluruhan

# `partially_verified`

**Terverifikasi (bukti konkret):**
- `npm test` → 109/109 pass, 0 fail ✅
- `npm run typecheck` → 0 error ✅
- `vite build --base=/PlayRent/` → sukses ✅
- `tools/security-probe.mjs` → 69/69, 0 blocker/major/minor ✅
- Kontrak §2 (atribut cookie, invarian `None⇔Secure`, `clearCookie` identik, tanpa `Domain`,
  token tak pernah di JSON) — **terpenuhi** ✅
- Kontrak §3 (CORS allowlist tanpa `*`, `credentials:true`, CSRF aktif & tak bisa dimatikan,
  origin Pages diterima, origin asing → 403) — **terpenuhi** ✅
- Kontrak §6 + item 8 plan.md (tidak ada reset DB / ganti password / hapus data) — **terpenuhi
  dengan bukti hash+mtime DB sebelum/sesudah** ✅
- Inlining `VITE_API_BASE_URL` ke bundle — **terbukti** (grep = 1) ✅

**Belum terverifikasi:**
- **Perilaku browser nyata** (cookie benar-benar dikirim lintas situs). Tidak ada uji
  browser; `SameSite=None` hanya *dikonfigurasi* benar, bukan *terbukti jalan*.
  → Wajib: uji manual operator di §6.2 runbook. **Karena itu login lintas situs tidak
  boleh diklaim "pasti berhasil".**
- **`TRUST_PROXY=true` di produksi** → rate-limit dapat dilewati (HIGH-1). Belum ada
  pengujian; diperbaiki sebelum deploy produksi.
