# PlayRent — Sistem Manajemen Rental PlayStation

> **EN TL;DR.** PlayRent is an operational web app for Indonesian PS4/PS5 rental shops:
> consoles, live rental sessions with a reload-safe countdown timer, bookings, payments,
> printable receipts, reports and business settings. Backend is Express 5 + the built-in
> `node:sqlite` module (no native modules), frontend is React 19 + TypeScript + Vite.
> It manages rental *operations data* — it does **not** control a PlayStation console.
> All UI copy is Bahasa Indonesia. Built and verified on Android/Termux (Node 26.4.0).

> **Dua peran saja.** `superadmin` (pemilik/operator — akses penuh ke seluruh modul) dan
> `user` (pelanggan — mendaftar sendiri di `/daftar`, hanya melihat unit, info rental, dan
> booking miliknya sendiri). Role `cashier` **sudah dihapus** dari kode dan skema; akun lama
> dinonaktifkan, bukan dihapus, sehingga histori transaksi tetap utuh.

## Apa itu PlayRent

PlayRent mencatat dan mengelola operasional harian rental PlayStation: unit PS, sesi sewa
dengan hitung mundur, booking, pembayaran, struk, laporan, dan pengaturan usaha. Super Admin
(pemilik/operator) memakainya di HP di depan pelanggan maupun di laptop untuk memantau
pendapatan dan mengelola data; pelanggan mendaftar sendiri dan memakai area pelanggan
(unit, info rental, booking miliknya, profil).

**Satu paragraf jujur.** Aplikasi ini mengelola **data operasional** rental — siapa menyewa
unit mana, berapa lama, berapa tagihannya, sudah dibayar atau belum. Aplikasi **tidak**
mengontrol konsol PlayStation secara langsung, **tidak** terhubung ke mesin pembayaran/QRIS,
dan **tidak** menagih uang secara otomatis. Pembayaran (tunai, transfer, QRIS) **dicatat
secara manual oleh Super Admin**; status "terbayar" adalah catatan manusia, bukan konfirmasi dari
gateway. Struk dibuat sebagai HTML yang bisa dicetak lewat fitur print browser, bukan file PDF
yang dihasilkan server.


## Arsitektur sistem

Pemisahan tegas tiga lapisan:

- **Frontend** — SPA React 19 (TypeScript) yang di-serve Vite. Tidak menyimpan data
  transaksi di browser; hanya preferensi UI. Semua panggilan ke `/api`.
- **Backend** — Express 5 (JavaScript ESM, tanpa langkah kompilasi). Autentikasi cookie
  `httpOnly`, otorisasi per-role di server, validasi `zod` di server.
- **Data layer** — SQLite via modul bawaan **`node:sqlite`** (`DatabaseSync`), file
  `server/data/playrent.db`, 12 tabel, mode WAL. Semua operasi bisnis atomik memakai
  transaksi `BEGIN IMMEDIATE … COMMIT`.

**Aturan kunci:** seluruh perhitungan uang dan durasi terjadi **di server**. Frontend hanya
mem-preview harga lewat `POST /api/sessions/quote`; nilai final selalu dihitung ulang server
saat `finish`. Server tidak pernah mempercayai total yang dikirim klien.

### Alur request (ASCII)

```
        Browser (HP / laptop)
        ┌─────────────────────────────────┐
        │  React SPA  (web/src)           │
        │  state: React + fetch           │
        └─────────────┬───────────────────┘
                      │  HTTP + cookie  pr_session (httpOnly, SameSite=Lax)
                      │  JSON envelope: {success, data|error}
                      ▼
        ┌─────────────────────────────────┐
        │  Express 5 API  (server)        │
        │  /api/* → routes/*              │
        │  requireAuth → requireSuperAdmin│
        │  zod validate → lib/* logic     │
        └─────────────┬───────────────────┘
                      │  node:sqlite  (synchronous, prepared statements)
                      │  withTx(): BEGIN IMMEDIATE … COMMIT
                      ▼
        ┌─────────────────────────────────┐
        │  SQLite  playrent.db (WAL)      │
        │  12 tabel + indeks              │
        └─────────────────────────────────┘

  Dev  : Browser ── :5173 (Vite) ──proxy /api──▶ :4000 (API)
  Prod : Browser ───────────────── /api + SPA ─▶ :4000 (API serve web/dist)
```

---

## Teknologi

| Lapisan | Dipakai | Alternatif yang ditolak & alasan |
| --- | --- | --- |
| Runtime | **Node.js ≥ 22.5** (terverifikasi 26.4.0) | — |
| Driver DB | **`node:sqlite`** (bawaan Node) | `better-sqlite3`, `sqlite3` → butuh node-gyp + NDK Android; kompilasi native adalah penyebab gagal #1 di Termux |
| Hashing sandi | **`node:crypto` `scrypt`** (bawaan) | `bcrypt`, `argon2` → kompilasi native |
| Sesi | Token acak opaque di tabel `auth_sessions` + cookie `httpOnly` | `express-session` (leak saat restart, dependensi ekstra); JWT (tidak bisa dicabut) |
| Backend | **Express 5, JavaScript ESM** | TypeScript backend → butuh langkah kompilasi/`tsx`; JS polos lebih cepat diiterasi |
| Frontend | **React 19 + TypeScript + Vite** | Sesuai rencana |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite` | PostCSS config terpisah tidak diperlukan |
| Ikon | **`lucide-react`** | Perlu library ikon yang terawat |
| Grafik | **SVG buatan sendiri** | `recharts` ~500 kB hanya untuk 2 jenis grafik |
| Validasi | **`zod`** di server **dan** klien | Sesuai rencana |
| Testing | **`node:test` + `node:assert/strict` + `fetch` global** | Jest/Vitest menambah dependensi tanpa manfaat di backend |
| Python | **tidak dipakai** (3.14 tersedia) | Proyek ini murni Node |

**Tanpa dependensi native.** Dependensi server persis: `express@5`, `cookie-parser`, `cors`,
`zod`. Tidak ada modul yang perlu dikompilasi.

---

## Persyaratan runtime

| Kebutuhan | Versi / catatan |
| --- | --- |
| Node.js | **≥ 22.5** (dibutuhkan oleh `node:sqlite`). Terverifikasi di **v26.4.0** |
| npm | Terverifikasi di **11.21.1** |
| git | Opsional, terverifikasi di **2.56.0** |
| SQLite | Bawaan Node (**3.53.4**), tidak perlu instalasi terpisah |
| Build tools (`make`, `clang`, NDK) | **Tidak diperlukan** — tidak ada modul native |

Cek cepat:

```sh
node -v    # harus >= v22.5.0
npm -v
```

---

## Instalasi di Termux

```sh
# 1. Perbarui paket Termux
pkg update && pkg upgrade

# 2. Pasang Node (LTS atau versi terbaru sama-sama cukup)
pkg install nodejs-lts
#    Alternatif: pkg install nodejs

# 3. Pastikan Node memenuhi syarat minimum
node -v            # contoh keluaran: v26.4.0

# 4. Letakkan proyek (clone atau salin) lalu masuk ke direktorinya
git clone <url-repo> PlayRent    # atau salin folder PlayRent yang sudah ada
cd PlayRent

# 5. Pasang dependensi backend
cd server && npm install

# 6. Pasang dependensi frontend
cd ../web && npm install

# 7. Siapkan database + akun Super Admin (sekali saja)
cd ../server
npm run seed:schema      # buat DB + katalog (TIDAK menyuntik data demo)
npm run admin:bootstrap   # buat Super Admin pertama (prompt sandi, tanpa echo)
```

> **Pilih `seed:schema`, bukan `seed`, untuk instalasi produksi.** `seed:schema`
> hanya menulis baris pengaturan usaha + katalog (unit, game, paket) — tanpa transaksi
> fiktif dan tanpa sesi demo yang memblokir unit. `seed` (demo) menambah 44 hari
> transaksi fiktif + 1 sesi aktif + 2 booking; **jangan** dipakai di pembukuan asli.

> **Tidak perlu `pkg install` alat build apa pun.** Karena tidak ada modul native
> (`better-sqlite3`, `bcrypt`, `argon2` semuanya dihindari), `npm install` tidak akan
> memanggil `node-gyp` atau NDK. Ini disengaja — kompilasi native adalah kegagalan paling
> umum di Termux.

---

## Konfigurasi environment

```sh
cd server
cp .env.example .env
```

Isi `.env` (semuanya punya default yang aman; `.env.example` hanya berisi placeholder):

| Variabel | Default | Arti |
| --- | --- | --- |
| `PORT` | `4000` | Port HTTP API backend |
| `DB_PATH` | `./data/playrent.db` | Lokasi file SQLite (relatif ke folder `server/`) |
| `SESSION_TTL_HOURS` | `12` | Masa berlaku sesi login (sliding — tiap request memperpanjang) |
| `NODE_ENV` | `development` | `production` → flag `Secure` aktif **dan** default `COOKIE_SAME_SITE` jadi `none` |
| `CORS_ORIGIN` | prod: `https://adjietegaralamsyah312.github.io`<br>dev: `http://localhost:5173,http://127.0.0.1:5173` | Allowlist origin browser, **comma-separated**, tanpa path. Di production wajib memuat origin frontend |
| `COOKIE_SAME_SITE` | prod: `none`<br>lainnya: `lax` | `lax` \| `strict` \| `none`. `none` wajib saat frontend & API di origin berbeda (lintas situs). Nilai tak dikenal → default |
| `TRUST_PROXY` | `0` (tidak dipercaya) | **Jumlah hop** proxy yang dipercaya — bukan boolean. `1` di belakang Cloudflare Tunnel. Lihat di bawah |
| `COOKIE_SECURE` | ikut `NODE_ENV` | `true`/`false`. Kosongkan untuk deploy HTTPS; `false` hanya untuk LAN HTTP |
| `HOST` | kosong → bind semua interface (`0.0.0.0`) | Alamat bind server. `127.0.0.1` = API hanya bisa diakses lokal (aman di belakang Cloudflare Tunnel: klien LAN tak bisa menyamar sebagai proxy lewat `X-Forwarded-For` palsu). Kosongkan kalau memang butuh API terjangkau dari LAN |

> **Perubahan perilaku (penting).** `server/.env` **sekarang benar-benar dibaca** oleh
> `npm start` / `npm run dev` (via `node --env-file-if-exists=.env`). Sebelumnya file itu
> hanya didokumentasikan tapi tidak pernah dimuat, sehingga semua env di tabel ini tidak
> berefek. Env yang sudah ada di process environment tetap menang atas isi file — dan
> `npm test` sengaja **tidak** memuat `.env` agar test tidak tercemar.
>
> **Invarian cookie:** `SameSite=None` **wajib** berpasangan dengan `Secure=true`. Kalau
> `COOKIE_SECURE=false` eksplisit, `SameSite` otomatis turun ke `lax` (browser membuang
> cookie `SameSite=None` tanpa `Secure`).

**`TRUST_PROXY` = jumlah hop, bukan boolean.** Nilainya menyatakan **berapa banyak proxy
tepercaya** yang ada di depan server: `1` = satu proxy (Cloudflare Tunnel),
`2` = dua proxy (mis. nginx + cloudflared), `0`/tidak di-set = tidak percaya proxy apa pun
(default, aman).

> **Jangan pakai nilai boolean `true` untuk `TRUST_PROXY`.** Nilai boolean adalah konsep lama:
> ia membuat Express mempercayai **seluruh** rantai `X-Forwarded-For`, padahal Cloudflare
> **menambah** (bukan mengganti) header itu — entri paling kiri adalah nilai kiriman
> penyerang yang bebas dipalsukan. Akibatnya `req.ip` bisa diganti tiap percobaan dan
> **pembatas percobaan login** (5 gagal / 15 menit per username+IP) bisa dilewati dengan
> brute-force tanpa batas. Pakai angka eksplisit (`1`).

Kalau `TRUST_PROXY` tidak di-set: semua klien terlihat **satu IP** (rate-limit jadi satu
bucket bersama — satu orang yang salah password bisa mengunci login semua orang) dan
`req.protocol` jadi `http`, sehingga origin API yang dihitung guard CSRF tidak persis
`https`. Aktifkan **hanya** kalau API benar-benar berada di belakang reverse proxy te—you
kendalikan. Detail + cara memverifikasi: runbook
[`specs/deployment-guide.md`](specs/deployment-guide.md) §3.2.

> **`npm start` harus dijalankan dari folder `server/`.** Flag `--env-file-if-exists=.env`
> bersifat **relatif terhadap direktori kerja**; dijalankan dari root repo, `.env` di
> `server/` tidak terbaca dan semua pengaturan operator diabaikan diam-diam.

---

## Inisialisasi database

```sh
cd server
npm run seed:schema   # = node src/seed-schema.js → buat + migrasi + katalog (produksi)
npm run seed          # = node src/seed.js → buat + migrasi + data demo (dev/demo saja)
```

`npm run seed:schema` membuat file `server/data/playrent.db`, menjalankan `migrate()`,
lalu mengisi **baris pengaturan usaha + katalog** (10 unit, 14 game, 4 paket). **Tidak ada
transaksi, sesi, booking, atau akun** yang dibuat. `npm run seed` melakukan semuanya itu
plus data demo (lihat bagian "Data demo"). Keduanya **idempotent** — jalankan dua kali,
hasilnya sama.

> **Penting: tidak ada satu pun skrip yang membuat akun login.** Tidak ada akun admin demo,
> tidak ada akun kasir. Satu-satunya akun Super Admin dibuat lewat CLI bootstrap (lihat di
> bawah). Ini disengaja: password yang di-hardcode di dalam source tree adalah lubang
> keamanan, dan tidak ada satu pun password yang tersimpan di repo ini.
>
> Baris `business_settings` (id = 1) sendiri dibuat oleh **migrasi v4**, jadi database
> produksi tetap punya aturan harga walau `seed`/`seed:schema` belum pernah dijalankan.
> Nama, alamat, dan nomor telepon di baris itu adalah placeholder — ganti lewat
> **Pengaturan** di aplikasi.

**Cara kerja `migrate()`.** `migrate()` memakai `PRAGMA user_version` sebagai penghitung.
Setiap langkah di array `MIGRATIONS` dijalankan berurutan, dibungkus
`BEGIN IMMEDIATE … COMMIT` (rollback jika error). Langkah pertama adalah `schema.sql` yang
seluruhnya memakai `IF NOT EXISTS`, sehingga dijalankan ulang menjadi no-op. `migrate()`
dipanggil sekali saat boot dan aman dijalankan setiap kali.

Empat langkah migrasi yang sudah berjalan (`user_version` = 4):

| Versi | Yang dikerjakan |
| --- | --- |
| v1 | `schema.sql` — 12 tabel + indeks |
| v2 | Bangun ulang tabel `users`: `role` jadi `CHECK ('superadmin','user')`, tambah kolom `phone`, tambah `bookings.customer_user_id` + indeksnya. Role lama `admin` → `superadmin`; role lama `cashier` → `user` + `is_active = 0` |
| v3 | Cabut seluruh `auth_sessions` milik akun yang `is_active = 0` (mencegah "kebangkitan" sesi saat akun diaktifkan kembali) |
| v4 | Buat baris `business_settings` (id = 1) bila belum ada — tanpa ini seluruh jalur uang (`/settings`, `/sessions/quote`, `/sessions`, `/bookings`) balas 500 di database yang belum di-seed |

### Reset database (khusus pengembangan — **berbahaya**)

> **Peringatan.** Perintah di bawah **menghapus seluruh data** (akun, transaksi, sesi,
> laporan). Jalankan **hanya** pada instalasi lokal/dev yang belum dipakai, atau setelah
> `npm run backup` dan Anda benar-benar ingin mulai dari nol. **Jangan pernah** menjalankannya
> pada database produksi — jalur deploy ([runbook](specs/deployment-guide.md)) **tidak pernah**
> me-reset, mengganti password, atau menghapus data. Untuk memulihkan data yang tidak sengaja
> terhapus, pakai **restore** dari backup (bagian "Backup dan restore"), bukan reset.

```sh
cd server
rm -f data/playrent.db data/playrent.db-wal data/playrent.db-shm
npm run seed:schema    # atau: npm run seed  (kalau memang mau data demo)
npm run admin:bootstrap   # akun Super Admin kembali perlu dibuat
```

Mode WAL menyimpan sidecar `-wal` dan `-shm`; keduanya **harus** ikut dihapus, kalau tidak
data lama bisa ikut terbaca. Path file: `server/data/playrent.db`.

---

## Dua peran & hak akses

Aplikasi ini punya **dua** peran. Penegakan hak akses terjadi **di backend**
(`requireAuth` → `requireSuperAdmin`), bukan dengan menyembunyikan tombol di frontend.

| Modul / endpoint | Super Admin | Pelanggan (`user`) | Anonim |
| --- | --- | --- | --- |
| Dashboard operasional (`/api/dashboard/*`) | ✅ | ❌ `403` | ❌ `401` |
| Laporan + ekspor CSV (`/api/reports/*`) | ✅ | ❌ `403` | ❌ `401` |
| Transaksi, void, struk (`/api/transactions/*`) | ✅ | ❌ `403` | ❌ `401` |
| Sesi rental & kalkulasi harga (`/api/sessions/*`) | ✅ | ❌ `403` | ❌ `401` |
| Manajemen pengguna (`/api/users/*`) | ✅ | ❌ `403` | ❌ `401` |
| Unit konsol — tulis (`POST/PATCH/DELETE /api/consoles`) | ✅ | ❌ `403` | ❌ `401` |
| Pengaturan usaha — tulis (`PUT /api/settings`) | ✅ | ❌ `403` | ❌ `401` |
| Katalog game — tulis (`POST/PATCH/DELETE /api/games`) | ✅ | ❌ `403` | ❌ `401` |
| Paket durasi — tulis (`POST/PATCH/DELETE /api/packages`) | ✅ | ❌ `403` | ❌ `401` |
| **Check-in** booking → sesi (`POST /api/bookings/:id/check-in`) | ✅ | ❌ `403` | ❌ `401` |
| Daftar unit tersanitasi (`GET /api/consoles`) | ✅ (lengkap) | ✅ (tanpa catatan kondisi) | ❌ `401` |
| Detail unit (`GET /api/consoles/:id`) | ✅ (+ `currentSession`) | ✅ (hanya `isBusy`) | ❌ `401` |
| Info rental: game & paket (`GET /api/games`, `GET /api/packages`) | ✅ | ✅ | ❌ `401` |
| Pengaturan usaha — baca (`GET /api/settings`) | ✅ (lengkap) | ✅ (tanpa metode bayar & tarif overtime) | ❌ `401` |
| **Booking milik sendiri** (buat / lihat / ubah / batal) | ✅ (semua booking) | ✅ (hanya miliknya) | ❌ `401` |
| Booking milik orang lain | ✅ | ❌ **`404`** (bukan 403 — keberadaannya tidak dikonfirmasi) | ❌ `401` |
| Profil sendiri (`GET /api/auth/me`, `PATCH /api/auth/profile`) | ✅ | ✅ | ❌ `401` |
| Ganti sandi sendiri (`POST /api/auth/change-password`) | ✅ | ✅ | ❌ `401` |
| Daftar akun baru (`POST /api/auth/register`) | ✅ | ✅ | ✅ |
| Login / logout (`POST /api/auth/login`, `/logout`) | ✅ | ✅ | ✅ |
| Health (`GET /api/health`) | ✅ | ✅ | ✅ |

Ringkasnya: **Super Admin memegang seluruh modul**; pelanggan hanya boleh melihat info rental
dan mengelola **booking miliknya sendiri**. Upaya naik privileges lewat body request ditolak
server (mis. mengirim `role` saat registrasi → `400`; mengirim `customer_user_id` saat membuat
booking → `400`).

**Yang dikendalikan Super Admin:** unit PS (kode, jenis, ruangan, controller, tarif, status,
catatan), sesi rental (mulai/perpanjang/selesaikan/void), booking (buat, ubah, konfirmasi,
check-in, batal), transaksi & pembayaran (catat, void, cetak struk), laporan & ekspor CSV,
katalog game, paket durasi, pengaturan usaha (identitas, tarif, durasi minimum, pembulatan,
overtime, ambang peringatan, metode pembayaran), serta manajemen pengguna (buat, ubah peran,
nonaktifkan, atur ulang sandi).

---

## Cara membuat akun Super Admin pertama

Akun Super Admin **tidak pernah** dibuat otomatis. Satu-satunya cara membuatnya adalah CLI
lokal — tidak ada endpoint HTTP untuk ini, jadi tidak bisa dipanggil pengguna anonim.

```sh
cd server
npm run admin:bootstrap
```

- Mode **interaktif** (TTY): prompted username (default `admin`) dan kata sandi **dua kali**,
  tanpa echo di layar.
- Mode **non-interaktif** (CI/script): isi environment variable
  `ADMIN_USERNAME` (opsional, default `admin`) dan `ADMIN_PASSWORD` (wajib).
- Kata sandi minimal **8 karakter**, di-hash dengan `scrypt` (`node:crypto`).
- **Password dan hash-nya tidak pernah dicetak** ke terminal maupun ditulis ke log.
- Perintah ini **menolak** berjalan kalau sudah ada Super Admin; tidak pernah membuat akun
  ganda.
- Setiap eksekusi menulis audit: `admin_bootstrap` (akun pertama dibuat) atau
  `admin_password_reset` (sandi direset lewat `--force`).

### Kalau sandi Super Admin lupa

```sh
cd server
npm run admin:bootstrap -- --force
```

`--force` **tidak** membuat akun baru — ia **reset kata sandi Super Admin yang sudah ada**
(dan mengaktifkan kembali bila sebelumnya nonaktif), lalu **mencabut seluruh sesi** akun itu.
Targetnya: username yang kamu ketik jika cocok dengan Super Admin yang ada, kalau tidak maka
Super Admin pertama. Akun lain tidak tersentuh.

### Kalau belum ada Super Admin sama sekali (fresh install)

```sh
cd server
npm install
npm run seed:schema        # buat DB + katalog (TIDAK menyuntik data demo) — TIDAK membuat akun login
npm run admin:bootstrap     # buat Super Admin pertama ( prompted sandi)
cd ../web && npm install
```

### Mengganti kata sandi sendiri

- **Lewat UI:** masuk sebagai Super Admin → **ikon kunci di header** (atau halaman **Profil**
  untuk pelanggan) → dialog **Ubah sandi**. Endpoint di baliknya
  `POST /api/auth/change-password` dengan body
  `{ "currentPassword": "...", "newPassword": "..." }`. Sesi lain milik akun tersebut ikut
  dicabut.
- **Lewat CLI:** `npm run admin:bootstrap -- --force` (lihat di atas).

Sistem mencegah Super Admin terakhir dinonaktifkan atau diturunkan perannya
(`409 LAST_ADMIN`), dan mencegah Super Admin mencabut akses dirinya sendiri
(`409 CANNOT_DELETE_SELF`).

---

## Cara login

| Peran | Alur | Halaman tujuan setelah login |
| --- | --- | --- |
| **Super Admin** | Buka `/masuk`, masukkan username + kata sandi yang kamu buat saat bootstrap. | `/dashboard` |
| **Pelanggan** | Buka `/daftar`, buat akun sendiri, lalu masuk di `/masuk` dengan akun itu. | `/beranda` |

Pelanggan yang belum punya akun bisa mendaftar sendiri lewat **`/daftar`** (tautan "Daftar"
di halaman login). Tidak ada persetujuan admin yang dibutuhkan.

---

## Registrasi publik pelanggan

`POST /api/auth/register` — **publik**, tanpa sesi, tanpa cookie.

```json
{ "username": "budi", "fullName": "Budi Santoso", "phone": "0812-3456-7890", "password": "rahasia123" }
```

- Aturan body: `username` (huruf kecil/angka/titik/underscore, 3–32), `fullName` (2–80),
  `phone` (opsional, ≤ 40), `password` (≥ 8). Body **harus** strict — field lain ditolak.
- Peran **selalu** `'user'` — ditentukan server, tidak pernah oleh body. Body yang membawa
  `role` (atau field asing lain) → **`400`**.
- Respons `201` **tidak** melakukan auto-login: pemanggil harus POST `/api/auth/login`.
- `409 DUPLICATE_USERNAME` bila username sudah dipakai; `429 RATE_LIMITED` setelah
  **10 pendaftaran / 15 menit / IP** (bucket khusus `__register__`).
- Akun hasil registrasi langsung **aktif** (`is_active = 1`) dan tercatat di audit sebagai
  `user_registered`.
- **Tidak ada registrasi publik Super Admin.** Satu-satunya jalan promosi ke Super Admin
  adalah Super Admin yang ada (menu **Pengguna**), atau CLI `admin:bootstrap`.

Profil pelanggan bisa diperbarui sendiri lewat `PATCH /api/auth/profile` dengan
`{ "fullName": "...", "phone": "..." }` — hanya dua field itu, hanya untuk akun yang sedang
login.

---

## Status penghapusan akun Kasir

**Role `cashier` sudah dihapus — dari kode maupun dari skema.** Yang tersisa hanyalah
*baris database* milik akun lama.

| Aspek | Status |
| --- | --- |
| Role `cashier` di kode | **Hilang.** `requireRole('cashier')` tidak ada lagi; penaganya `requireSuperAdmin` (hanya `superadmin`) |
| Role `cashier` di skema | **Hilang.** `users.role` sekarang `CHECK (role IN ('superadmin','user'))` |
| Akun kasir lama di database dev | **Ada, tapi dinonaktifkan** — `role='user'`, `is_active=0` → **tidak bisa login** (respons `401 INVALID_CREDENTIALS`, sama persis dengan password salah; tidak ada enumerasi username) |
| Baris di tabel `users` | **Tetap ada** (soft delete, bukan `DELETE`) |
| Sesi lama | **Dicabut** oleh migrasi v3 (semua `auth_sessions` milik akun nonaktif dihapus) |
| Histori transaksi | **Utuh.** 46 transaksi di database dev, semuanya masih punya `cashier_id` yang menunjuk baris `users` yang benar-benar ada |
| Histori booking / sesi rental / audit | **Utuh.** Baris historis tidak pernah dihapus |

**Kenapa tidak dihapus fisik.** `transactions.cashier_id`, `rental_sessions.created_by`, dan
`audit_logs.actor_id` menunjuk ke `users.id`. Menghapus baris itu akan merusak integritas data
historis — hilangnya jejak siapa yang bertransaksi. Soft delete (baris tetap,
`is_active = 0`) + pencabutan sesi mencapai hal yang sama tanpa mengorbankan satu baris pun.

> **Nama kolom historis tetap dipakai.** `transactions.cashier_id` dan `transactions.cashier_name`
> masih ada di skema — itu **nama kolom bawaan** (snapshot nama kasir), bukan role aktif.
> Tidak ada lagi akun dengan role `cashier`.

### Perlakuan terhadap sesi & riwayat akun kasir lama

1. **Sesi dicabut, bukan dibiarkan kedaluwarsa.** Migrasi v3 menghapus baris `auth_sessions`
   milik setiap akun `is_active = 0`. Alasannya: kalau akun hanya dinonaktifkan tanpa
   menghapus baris sesi, sesi itu akan "hidup kembali" begitu akun diaktifkan kembali.
2. **Token lama mati seketika.** Selain baris dihapus, `resolveSession()` juga menolak sesi
   apa pun yang pemiliknya `is_active = 0` — jadi token yang bocor ke mana pun tetap tidak
   berguna.
3. **Riwayat tetap menunjuk baris yang ada.** `cashier_id`, `created_by`, `actor_id` tidak
   pernah jadi `NULL` dan tidak pernah menunjuk ke baris hilang. Laporan dan audit tetap
   bisa dibaca utuh.
4. **Audit tetap append-only.** `lib/audit.js` menyanitasi `meta_json` (password/token/
   secret/salt/hash → `[redacted]`) sebelum ditulis, jadi tidak ada kredensial yang bocor
   ke jejak audit.

---

## Backup & pemulihan database

Kedua perintah ini **CLI lokal** (`server/`). Tidak ada endpoint HTTP untuk backup maupun
restore — restore lewat HTTP sengaja tidak ada demi keamanan.

### Membuat backup

```sh
cd server
npm run backup
```

- Snapshot konsisten diambil dengan API `node:sqlite backup()` (bukan `cp` — file mentah
  akan melewatkan semua yang masih ada di `-wal`).
- Hasilnya: `server/data/backups/playrent-YYYYMMDD-HHMMSS-mmm-xxxxxx.db` (milidetik + 6
  hex acak, jadi dua backup dalam detik yang sama tidak pernah saling menimpa).
- Snapshot **divalidasi** sebelum dianggap berhasil: `integrity_check` harus `ok`,
  `foreign_key_check` harus kosong, dan tabel `users` + `business_settings` harus ada.
  Snapshot yang gagal validasi **dihapus** dan CLI keluar dengan kode ≠ 0 — backup rusak
  lebih berbahaya daripada tidak ada backup.
- **Backup lama tidak pernah dihapus otomatis** — bersihkan sendiri sesuai kebijakan retensi.
- Tercatat di audit sebagai `db_backup` (hanya nama file, ukuran, dan jumlah baris — bukan
  nama/nomor/hashes).

### Memulihkan (restore)

```sh
# 1. HENTIKAN server API dulu (Ctrl-C di terminal yang menjalankan npm start)
cd server
npm run restore -- ./data/backups/playrent-20261019-222330-481-3f9c2a.db
```

Urutannya — **tidak ada yang ditimpa sebelum semua lolos pemeriksaan**:

1. **Validasi file sumber** — `integrity_check`, `foreign_key_check`, tabel wajib, kolom wajib, dan
   `user_version` harus ≤ versi skema build ini (4). File yang tidak valid → **ditolak**,
   database tidak disentuh.
2. **Backup pra-restore otomatis** — snapshot database saat ini disimpan sebagai
   `server/data/backups/pre-restore-YYYYMMDD-HHMMSS-mmm-xxxxxx.db`. Ini safety net: kalau file yang
   dipulihkan ternyata salah, database lama masih ada utuh.
3. **Konfirmasi eksplisit** — kamu harus mengetik persis `RESTORE` (huruf kapital).
   Kata lain → dibatalkan, database tidak berubah.
4. **Penggantian atomik** — file disalin ke `.tmp` lalu `rename` (atomic di filesystem yang
   sama), lalu file `-wal` / `-shm` yang basi dihapus.
5. **Audit** — tercatat sebagai `db_restore` (file sumber, target, backup pra-restore).

> ⚠️ **Peringatan: hentikan server API sebelum restore.** `npm start` yang masih berjalan
> memegang koneksi ke file database; mengganti file di bawahnya bisa membuat proses menulis
> ke file lama yang sudah tidak lagi jadi database aktif. CLI restore memang memberi
> peringatan bila database terdeteksi terkunci, tapi itu hanya petunjuk — **hentikan
> server-nya**. Restore juga menulis ke database yang baru aktif, jadi audit `db_restore`
> baru terlihat setelah server dijalankan lagi.

> Restore **tidak pernah** dijalankan otomatis dan **tidak pernah** menghapus data tanpa
> persetujuan eksplisit. Exit code: `0` = berhasil (atau dibatalkan operator), `1` = ditolak
> (file tidak valid/tidak ditemukan/error I/O) — dan pada kasus `1` database asli utuh.

---

## Data demo

> **Data demo hanya untuk development.** Untuk instalasi produksi gunakan
> `npm run seed:schema` (katalog saja) — bukan `npm run seed`.

`npm run seed` mengisi:

- **Tanpa akun login.** Seed sengaja tidak membuat pengguna apa pun. Pada database **baru**,
  baris demo pun **tidak** merujuk `users.id` (`created_by` / `cashier_id` / `actor_id` =
  `NULL`), sementara snapshot yang terbaca manusia tetap terisi
  (`transactions.cashier_name = 'Pemilik'`). Baris lama di database dev (yang dibuat
  sebelum peran lama dihapus) tetap menunjuk `users.id` seperti semula — tidak ada baris
  historis yang diubah.
- **10 unit:** `PS-01` … `PS-10` (PS4/PS5, Reguler/VIP, 8.000–25.000 IDR/jam).
  `PS-10` berstatus **Perawatan**.
- **14 judul game**, **4 paket durasi**, **1 baris pengaturan usaha**.
- **Sesi selesai + transaksi** tersebar di 44 hari terakhir (puncak 16:00–23:00, metode
  pembayaran bervariasi) — database dev saat ini berisi **46 transaksi**.
- **1 sesi aktif di `PS-03`** yang sengaja dibiarkan berjalan agar timer langsung terlihat
  saat pertama kali dibuka.
- **2 booking:** satu `confirmed` besok 19:00 di `PS-01`, satu `pending` hari ini 21:00 di
  `PS-08` (tanpa tumpang-tindih).

Data demo mudah dikenali: barisnya bertanda `notes = 'seed-demo'` (histori) dan
`notes = 'seed-demo-live'` (sesi hidup di PS-03).

`npm run seed:schema` mengisi **hanya** 10 unit + 14 game + 4 paket + 1 baris pengaturan
usaha — **tanpa** transaksi, sesi, booking, atau akun. Itu yang dipakai instalasi produksi.

---

## Menjalankan aplikasi

> **Sebelum login pertama:** pastikan akun Super Admin sudah ada. Kalau baru
> `npm run seed:schema` (atau `npm run seed`) dan belum pernah `npm run admin:bootstrap`,
> tidak ada akun yang bisa masuk — seed sengaja tidak membuat akun. Buat dulu lewat
> `npm run admin:bootstrap` (lihat bagian "Cara membuat akun Super Admin pertama").

### Mode pengembangan (dua terminal)

```sh
# Terminal 1 — backend
cd server
npm start          # atau: npm run dev  (mode --watch, auto-restart saat file berubah)

# Terminal 2 — frontend
cd web
npm run dev
```

Lalu buka **http://localhost:5173**. Vite mem-proxy `/api` ke `127.0.0.1:4000`, jadi cukup
buka satu alamat. Port: API `4000`, Vite `5173`.

### Mode produksi (satu proses)

```sh
cd web && npm run build      # menghasilkan web/dist
cd ../server && npm start    # backend menyajikan web/dist + SPA fallback
```

> **Jalankan `npm start` dari folder `server/`.** Flag `--env-file-if-exists=.env` mencari
> file relatif terhadap direktori kerja; dijalankan dari root repo, `server/.env` **tidak**
> terbaca dan semua pengaturan (`NODE_ENV`, `CORS_ORIGIN`, `TRUST_PROXY`, …) diam-diam
> diabaikan.

Saat folder `web/dist` ada, backend menyajikan aset statis dan mengarahkan semua rute non-`/api`
ke `index.html` (SPA fallback). Jadi mode produksi cukup satu proses di port `4000`.

### Deploy produksi (GitHub Pages + Cloudflare Tunnel)

Arsitektur produksi: frontend statis (React/Vite) dipublikasikan ke **GitHub Pages**, backend
Node/Express + SQLite tetap jalan di **Termux** dan diekspos lewat **Cloudflare Tunnel**
(HTTPS). `localhost:5173` **tidak pernah** menjadi alamat publik.

| Komponen | Alamat |
| --- | --- |
| Origin frontend | `https://adjietegaralamsyah312.github.io` — halamannya di `https://adjietegaralamsyah312.github.io/PlayRent/` |
| Origin API | `https://<host-tunnel>` — hostname dari Cloudflare Tunnel (mis. `https://xyz.trycloudflare.com`) |

Env server (`server/.env`) untuk produksi:

```env
NODE_ENV=production
PORT=4000
DB_PATH=./data/playrent.db
SESSION_TTL_HOURS=12
CORS_ORIGIN=https://adjietegaralamsyah312.github.io
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
TRUST_PROXY=1
HOST=127.0.0.1
```

`TRUST_PROXY=1` dipakai karena ada **satu** reverse proxy tepercaya (Cloudflare Tunnel) di
depan server — nilainya **jumlah hop**, bukan boolean, dan nilai boolean `true` **tidak boleh
dipakai** (Cloudflare *menambah* `X-Forwarded-For`, jadi trust-all memakai entri paling kiri
yang bisa dipalsukan penyerang → rate-limit login bisa dilewati). Lihat catatan env di atas
dan runbook §3.2.

`HOST=127.0.0.1` dipakai karena API produksi **hanya** diakses lewat Cloudflare Tunnel yang
jalan **di mesin yang sama** — `cloudflared` tetap bisa menjangkau `http://127.0.0.1:4000`.
gunanya: port `4000` jadi **tidak terjangkau dari LAN**, sehingga tidak ada klien jaringan
lokal yang bisa langsung menyamar sebagai proxy dan memalsukan `X-Forwarded-For` (padahal
`TRUST_PROXY=1` mempercayai satu hop). Konsekuensinya, **HP di Wi-Fi yang sama tidak lagi
bisa membuka API secara langsung** — memang itu yang diinginkan di mode produksi tunnel
(aksesnya lewat `https://<host-tunnel>`). Detail + cara membalikkannya: runbook §3.1.

Saat server start, ia mencetak konfigurasi efektifnya di log — periksa baris ini sebelum
menganggap deploy selesai:

```
[playrent] listening on http://127.0.0.1:4000 · host=127.0.0.1 · env=production · db=.../server/data/playrent.db
[playrent] env=production cors=["https://adjietegaralamsyah312.github.io"] sameSite=none secure=true trustProxy=1
```

`env=production` + `sameSite=none` + `secure=true` + `trustProxy=1` = konfigurasi yang
benar. Kalau `trustProxy=false`, ada **dua** sebab berbeda dan dibedakan oleh baris
`PERINGATAN` di log:

- **Tidak ada** `PERINGATAN: TRUST_PROXY="…" tidak dikenal` → nilai `TRUST_PROXY` tidak
  diaktifkan (barisnya tidak ada di `.env`, atau masih `0`) **atau** `.env` tidak terbaca
  sama sekali (jarak `--env-file-if-exists` relatif ke cwd → jalankan dari folder `server/`).
- **Ada** `PERINGATAN: TRUST_PROXY="one" tidak dikenal` → nilai env **salah ketik**
  (`ture`, `yes`, `on`, `1.5`, …). Set persis `TRUST_PROXY=1`.

Tabel diagnosa lengkap ada di runbook §3.3.

Repository variable GitHub yang **wajib** dibuat (Settings → Secrets and variables → Actions →
tab **Variables** → New repository variable):

| Nama | Nilai |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<host-tunnel>` — origin saja, tanpa trailing slash dan tanpa `/api` |

Nilainya di-inline ke bundle Vite **saat build**, jadi workflow GitHub Actions gagal dengan
pesan jelas kalau variable itu belum diisi (build lama yang tetap utuh, bukan situs rusak).
Workflow juga **memverifikasi bahwa origin itu benar-benar ter-inline** ke dalam
`web/dist/assets` sebelum artifact di-upload — kalau tidak, deploy ditolak.
Setelah menambah/mengubah variable, jalankan ulang workflow (push ke `main` atau tombol
**Run workflow**).

### Batasan dukungan browser (login lintas situs)

Frontend produksi berada di `github.io`, API di origin tunnel → cookie sesi harus
lintas-situs (`SameSite=None; Secure`). Kebijakan cookie pihak ketiga **berbeda per
browser**, jadi **build sukses tidak menjamin login pasti berhasil**:

- **Chrome / Edge** — phase-out cookie pihak ketiga **dibatalkan** (April 2025), jadi cookie
  3P masih dikirim; tetapi **Incognito memblokir cookie 3P** dan pengguna bisa mematikannya
  lewat Settings. Login lintas situs **seharusnya** berhasil (perlu diuji).
- **Firefox** — cookie 3P **dipartisi** per situs top-level (Total Cookie Protection v102,
  State Partitioning v103), bukan diblokir. Kemungkinan besar cookie tetap terkirim (perlu
  diuji).
- **Safari / WebKit** — memblokir **semua** cookie pihak ketiga (ITP sejak 13.1) tanpa
  pengecualian, dan Storage Access API tidak berlaku untuk SPA top-level → **login lintas
  situs diperkirakan GAGAL**. Jalur yang andal: **fallback same-origin** (sajikan SPA dari
  origin API yang sama) — ini **bukan pelengkap**, tapi jalur andal di Safari.

Audit lengkap (mana yang fakta dan mana yang masih harus diuji), diagnosis cepat, dan
fallback same-origin ada di runbook §7–§8.

### Akses dari HP di Wi-Fi yang sama

Cari IP kotak Termux: `ifconfig` atau `ip addr` (alamat pada `wlan0`), mis. `192.168.1.23`.
Lalu buka:

- **Dev:** `http://192.168.1.23:5173` — Vite di-bind ke `0.0.0.0`, jadi bisa diakses dari HP.
- **Mode satu proses:** `http://192.168.1.23:4000` — backend juga listen di semua interface
  **asal `HOST` tidak di-set**.

> **Produksi (tunnel) tidak memakai cara ini.** Di produksi `server/.env` sebaiknya berisi
> `HOST=127.0.0.1` → backend hanya bind loopback, jadi **`http://192.168.1.23:4000` tidak
> bisa dibuka dari HP**. Itu konsekuensi yang memang diinginkan: dengan `TRUST_PROXY=1`,
> port yang terbuka ke LAN bisa dipakai memalsukan `X-Forwarded-For`. Di produksi, HP
> memakai alamat tunnel `https://<host-tunnel>` seperti pengguna lain.

**Jebakan cookie `Secure`.** Di `NODE_ENV=production` cookie sesi diberi flag `Secure`, dan
browser **membuang** cookie itu bila dikirim lewat HTTP biasa. Gejalanya: login balas `200`,
tapi semua request berikutnya `401`. Untuk deploy LAN HTTP, set `COOKIE_SECURE=false` di
`server/.env` lalu restart server. Konsekuensinya: cookie sesi ikut terkirim tanpa enkripsi di
jaringan lokal — hanya untuk jaringan privat yang Anda percayai.

---

## Testing

```sh
# Backend — unit + integration (node:test)
cd server
npm test                      # seluruh test; terverifikasi 72/72 PASS, 0 gagal
npm run test:smoke            # skrip smoke manual; terverifikasi 110/110 checks OK
node tools/security-probe.mjs # probe keamanan adversarial; 69 checks, verdict PASS

# Frontend
cd web
npm run typecheck             # tsc --noEmit; terverifikasi 0 error
npm run build                 # type-check + build produksi
```

Status terakhir yang terverifikasi di lingkungan ini:

| Pemeriksaan | Perintah | Hasil |
| --- | --- | --- |
| Test backend | `server: npm test` | **83 lulus / 0 gagal** (72 lama + 11 regresi Batch 1; di dalamnya skrip smoke: 110/110 checks) |
| Probe keamanan | `server: node tools/security-probe.mjs` | **PASS** — 0 blocker, 0 major, 0 minor, 69 cek |
| Typecheck frontend | `web: tsc --noEmit` | **0 error** |
| Build produksi | `web: npm run build` | **Sukses** — JS ≈ 482,77 kB (gzip 136,71 kB), CSS ≈ 33,59 kB (gzip 7,28 kB) |

### Peta file test (plan.md bagian O)

Disalin dari `server/test/README.md`:

| Item plan.md O | File |
| --- | --- |
| O1 login valid/invalid | `auth.test.js` |
| O2 hak akses Super Admin vs pelanggan | `auth.test.js` |
| O3 buat/ubah unit + persistensi | `consoles.test.js` |
| O4 snapshot sesi + `in_use` | `sessions.test.js` |
| O5 cegah sesi ganda (sekuensial / konkuren / setelah finish) | `sessions.test.js` |
| O6 harga + snapshot tarif | `pricing.test.js` |
| O7 perpanjang sesi | `sessions.test.js` |
| O8 grace overtime + tarif | `pricing.test.js` |
| O9 timer tetap benar setelah reload | `timer.test.js` |
| O10 booking tumpang-tindih / batal / checked-in | `bookings.test.js` |
| O10 finish membebaskan unit | `sessions.test.js` |
| O11 void (Super Admin only, bebaskan unit, audit) | `sessions.test.js` |
| O12 transaksi: kembalian, penomoran, kurang bayar, finish sekali, total server | `transactions.test.js` |
| O13 laporan: batas Jakarta, paid/unpaid/void, byte CSV | `reports.test.js` |
| O14 validasi / JSON rusak / 404 / 500 generik | `validation.test.js` |
| N keamanan: SQLi + mass assignment | `security.test.js` |
| Registrasi publik + batas peran pelanggan | `auth.test.js`, `be006-rv003.test.js` |
| Backup/restore + kriteria file backup | `be005-backup.test.js`, `be005-criteria.test.js` |

> **Catatan Node 26:** `node --test test/` (argumen direktori telanjang) gagal karena
> dianggap modul. Gunakan `node --test` (auto-discovery) atau sebut file/glob eksplisit,
> mis. `node --test test/pricing.test.js`.

---

## Build

```sh
cd web
npm run build
```

Perintah ini menjalankan `tsc --noEmit` lalu `vite build`. Keluarannya ada di **`web/dist/`**
(`index.html` + folder `assets/` berisi JS/CSS ter-hash). Backend otomatis menyajikan folder
ini saat ada (lihat mode produksi di atas). Hasil build terakhir: JS ≈ 482,77 kB
(gzip 136,71 kB), CSS ≈ 33,59 kB (gzip 7,28 kB).

---

## Struktur folder

```
PlayRent/
├── README.md                ← dokumen ini
├── ARCHITECTURE.md          ← kontrak arsitektur (frozen)
├── api-contract.md          ← kontrak endpoint (frozen)
├── plan.md                  ← mandat pemilik + status implementasi
├── DESIGN.md  PRODUCT.md
├── specs/                   ← spesifikasi per-layar + laporan review/QA
├── docs/
│   └── CARA-PAKAI.md        ← panduan singkat operasional (masih memakai istilah "kasir" — baca sebagai panduan Super Admin)
├── server/
│   ├── package.json  .env.example
│   ├── data/                ← playrent.db (dibuat oleh seed:schema / seed) + backups/
│   ├── tools/security-probe.mjs
│   ├── src/
│   │   ├── index.js  app.js  config.js  db.js  schema.sql  seed.js
│   │   ├── seed-schema.js    ← CLI katalog saja (produksi): tanpa transaksi/sesi demo
│   │   ├── admin-bootstrap.js ← CLI buat/reset Super Admin
│   │   ├── backup.js          ← CLI snapshot & validasi backup
│   │   ├── restore.js         ← CLI pemulihan (validasi + konfirmasi)
│   │   ├── lib/
│   │   │   ├── auth.js      ← hash/verify, sesi, middleware
│   │   │   ├── errors.js    ← AppError, error handler
│   │   │   ├── time.js      ← nowIso, formatJakarta, dayRange
│   │   │   ├── pricing.js   ← quote/overtime/rounding (sumber kebenaran tunggal)
│   │   │   ├── validate.js  ← helper zod
│   │   │   ├── csv.js  settings.js  audit.js  mappers.js  db-backup.js
│   │   │   └── routes/
│   │   │       ├── index.js  auth.js  users.js  consoles.js  sessions.js
│   │   │       ├── bookings.js  transactions.js  games.js
│   │   │       └── reports.js  settings.js  dashboard.js
│   └── test/
│       ├── README.md  helpers.js  smoke-manual.mjs
│       └── *.test.js        ← node:test (lihat peta O di atas)
└── web/
    ├── package.json  vite.config.ts  tsconfig.json  index.html
    ├── dist/                ← hasil build (dibuat oleh npm run build)
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── lib/             ← api.ts, auth.tsx, format.ts, useCountdown.ts, status.ts, …
        ├── components/      ← AppShell, DataTable, Modal, Badge, Chart, Timer, …
        └── pages/           ← Login, Register, Dashboard, Units, Sessions, SessionDetail,
                                SessionStart, Bookings, BookingNew, Transactions,
                                TransactionDetail, Receipt, Games, Reports, Settings,
                                Users, Beranda, BookingSaya, InfoRental, Akun, NotFound
```

---

## Fitur yang sudah selesai

Dipetakan ke modul plan.md:

- [x] **D — Autentikasi & hak akses.** Login cookie `httpOnly`, scrypt, **dua peran**
      (`superadmin` & `user`), otorisasi per-route di server, logout, sesi kedaluwarsa,
      pembatas percobaan login, registrasi publik pelanggan.
- [x] **E — Dashboard operasional.** Angka unit, sesi hari ini, pendapatan, sesi mendekati
      selesai, aktivitas terbaru, grafik pendapatan, jam ramai — semua dari `SELECT` DB.
- [x] **F — Manajemen unit PS.** CRUD unit (kode, jenis konsol, tipe ruangan, controller,
      tarif, status, catatan). Unit yang aktif/disewa tidak bisa di-set tersedia (`409`).
- [x] **G — Sesi rental & timer.** Mulai / perpanjang / selesaikan / void. Timer **diturunkan
      dari `ends_at`** yang tersimpan (aman reload). Peringatan 10/5/1 menit. Cegah sesi ganda
      lewat indeks unik parsial di DB.
- [x] **H — Booking.** Buat/ubah/batalkan, cek konflik di SQL (tanpa tumpang-tindih), alur
      check-in menjadi sesi tanpa penyewaan ganda. Pelanggan hanya boleh booking miliknya
      (booking milik orang lain dijawab `404`).
- [x] **I — Transaksi, pembayaran, struk.** Nomor `TRX-YYYYMMDD-####`, kembalian tunai,
      diskon/extra, void dengan alasan + audit, struk HTML ramah printer (`GET
      /api/transactions/:id/receipt`).
- [x] **J — Katalog game.** CRUD katalog game (judul, platform, genre, controller, catatan,
      aktif/nonaktif).
- [x] **K — Laporan & riwayat.** Filter tanggal, rekap harian/mingguan/bulanan, performa unit,
      riwayat pembayaran, ekspor CSV (BOM UTF-8 untuk Excel), tampilan cetak.
- [x] **L — Pengaturan usaha.** Nama/alamat/kontak, tarif, durasi minimum, pembulatan,
      kebijakan overtime, ambang peringatan, pengaturan struk, metode pembayaran. Perubahan
      hanya berlaku untuk transaksi berikutnya.
- [x] **M — Database.** 12 tabel dengan PK/FK, `CHECK`, indeks, transaksi atomik, migrasi
      idempotent (v1 skema → v2 peran → v3 pencabutan sesi akun nonaktif), data demo realistis.
- [x] **N — Keamanan.** Query parameterized, scrypt, cookie `httpOnly` + token ter-hash,
      otorisasi server-side, uang dihitung server, rate limit, tanpa secret di repo.
      Hasil audit: `specs/review-report.md` (verdict PASS, 0 blocker).
- [x] **O — Operasional data.** CLI bootstrap Super Admin, CLI backup & restore tervalidasi,
      audit ter-sanitasi (`meta_json` → `[redacted]` untuk password/token/secret/salt/hash).

---

## Fitur terbatas / belum diverifikasi

Sikap jujur tentang batas lingkungan ini:

- **Tidak ada browser atau otomasi E2E** di lingkungan build ini. Jadi hal berikut **belum
  diverifikasi di browser nyata**: tampilan visual terkomposit, kontras ter-hitung, ukuran
  area sentuh yang sesungguhnya, perilaku overflow pada layar **360 px**, dan hasil cetak
  struk 80 mm. Verifikasi yang dilakukan hanya lewat `tsc`, build, test backend, dan probe
  keamanan.
- **Review desain (Design QA) masih FAIL** dengan 3 blocker yang sedang diperbaiki di task
  paralel (label status `Perawatan` berbahasa Inggris, drift warna status, kelas warna yang
  tidak ada di `@theme`). UI di sini dideskripsikan **sebagaimana diimplementasikan**, bukan
  sebagai "sudah diverifikasi visual".
- **`aria-controls` menggantung di 5 halaman admin** (`Sesi`, `Konsol`, `Booking`, `Laporan`,
  `Pengaturan`): komponen `Tabs` menunjuk `*-panel-*` yang belum punya elemen pasangannya.
  Sedang diperbaiki.
- **`Form.tsx` belum punya legend per-form.** Komponen `RadioGroup` sudah menyediakan
  `<fieldset>/<legend>`, tapi belum dipakai di halaman mana pun — form masih menumpuk field
  individual tanpa pengelompokan semantik.
- **Grafik memakai SVG buatan sendiri** (bukan library grafik). Beberapa klaim geometri
  grafik belum bisa dicek tanpa browser.
- **Struk adalah HTML yang di-render server** dan dibuka di jendela/iframe baru, bukan PDF
  yang dihasilkan generator PDF.
- **Pembayaran dicatat manual** oleh Super Admin. Tidak ada integrasi gateway, sehingga tidak
  ada pembayaran digital yang tervalidasi otomatis.
- **`docs/CARA-PAKAI.md` masih memakai istilah "kasir"** (belum disinkronkan ke model dua peran).
  Baca sebagai panduan operasional untuk Super Admin.
- **Probe keamanan punya satu bug self-assertion** pada pemeriksaan `AUTH-10` (pembatas
  percobaan login). Perbaikannya diverifikasi lewat test regresi, bukan lewat probe itu
  sendiri. Lihat `specs/review-report.md` untuk hasil audit lengkap.

---

## Checklist pengujian manual di browser HP

Ikuti berurutan di HP. Setiap langkah menyertakan **hasil yang diharapkan**.

1. **Daftar akun pelanggan (publik).** Buka `http://<ip-server>:5173/daftar`, isi username,
   nama lengkap, nomor HP, dan kata sandi (min. 8 karakter).
   *Harapan:* konfirmasi akun berhasil dibuat + tombol untuk lanjut ke halaman masuk —
   **tidak** ada auto-login. Daftar lagi dengan username yang sama → pesan "username
   sudah dipakai". Body dengan `role: "superadmin"` → **`400`**.
2. **Login sebagai pelanggan.** Masuk di `/masuk` dengan akun yang baru dibuat.
   *Harapan:* masuk ke **Beranda**. Navigasi hanya berisi **Beranda · Booking Saya · Info
   Rental · Profil** — tidak ada Dashboard, Sesi, Konsol, Transaksi, Laporan, Game,
   Pengaturan, atau Pengguna. Ketik `/dashboard` manual di address bar → tampil **"Akses
   terbatas"**, bukan halaman operator.
3. **Buat booking sebagai pelanggan.** Dari **Info Rental** / **Booking Saya**, buat booking
   di unit yang tersedia.
   *Harapan:* booking tersimpan dengan status `pending` dan **milik akun ini**; unit yang
   sudah dipakai/dinonaktifkan tidak bisa dipilih.
4. **Booking milik orang lain.** Pakai akun pelanggan kedua, buka `GET /api/bookings/<id>`
   milik pelanggan pertama.
   *Harapan:* **`404`** — bukan `403`. Keberadaan booking milik orang lain tidak pernah
   dikonfirmasi.
5. **Login sebagai Super Admin.** Logout dari akun pelanggan, masuk di `/masuk` dengan
   username + sandi Super Admin.
   *Harapan:* masuk ke **Dashboard**; seluruh menu operator terlihat (Sesi, Konsol, Booking,
   Transaksi, Laporan, Game, Pengaturan, Pengguna).
6. **Buka unit & mulai sesi.** Pilih **Konsol**, buka unit `PS-01` yang tersedia, isi nama
   pelanggan dan durasi (mis. 60 menit), lalu **Mulai**.
   *Harapan:* muncul konfirmasi tarif/estimasi sebelum mulai; setelah mulai, unit berubah status
   menjadi **Sedang Bermain** dan kartu menampilkan hitung mundur.
7. **Hitung mundur setelah reload.** Tunggu beberapa detik, lalu **reload halaman**.
   *Harapan:* hitung mundur **melanjutkan** dari sisa waktu sebenarnya (tidak reset, tidak
   melompat) — timer dihitung dari waktu selesai yang tersimpan.
8. **Peringatan waktu.** Perhatikan saat sisa waktu melewati ambang **10 / 5 / 1 menit**.
   *Harapan:* muncul peringatan visual (dan nada opsional yang hanya berbunyi setelah ada
   interaksi pengguna).
9. **Perpanjang sesi.** Di detail sesi, tambahkan durasi (mis. +30 menit).
   *Harapan:* waktu selesai bergeser maju; riwayat perpanjangan tercatat.
10. **Selesaikan + bayar tunai (lebih bayar).** Tekan **Selesaikan**, pilih metode **Tunai**,
    masukkan uang lebih dari total.
    *Harapan:* sistem menghitung total **di server** dan menampilkan **kembalian** = uang − total.
11. **Cetak / buka struk.** Dari detail transaksi, buka struk, lalu tekan **Cetak**.
    *Harapan:* terbuka tampilan struk ramah printer (lebar 80 mm) dengan identitas usaha, nomor
    transaksi, rincian, total, dan kembalian; dialog cetak browser muncul (tidak dapat
    diverifikasi otomatis tanpa printer HP nyata).
12. **Booking + uji bentrok.** Buat booking pada unit & slot waktu tertentu. Lalu coba buat booking
    lain yang **tumpang-tindih** di unit yang sama.
    *Harapan:* booking kedua ditolak dengan pesan konflik jadwal (`409 BOOKING_CONFLICT`).
13. **Laporan + ekspor CSV.** Buka **Laporan**, pilih rentang tanggal, jalankan laporan, ekspor CSV.
    *Harapan:* angka sesuai transaksi asli; file CSV terunduh dan terbaca benar (UTF-8).
14. **Perlindungan akun Super Admin.** Di **Pengguna**, coba nonaktifkan atau turunkan peran
    satu-satunya Super Admin aktif.
    *Harapan:* ditolak dengan pesan "minimal satu admin aktif" (`409 LAST_ADMIN`). Coba
    hapus/nonaktifkan akun sendiri → ditolak (`409 CANNOT_DELETE_SELF`).
15. **Rotasi ke landscape.** Putar HP ke posisi mendatar pada halaman tabel (mis. Konsol/Laporan).
    *Harapan:* tidak ada elemen yang meluber keluar layar; tabel tetap terbaca.

16. **Viewport 360 px.** Buka Booking di layar sempit (sekitar 360 px lebar).
    *Harapan:* timeline **disembunyikan** (tidak disusutkan), tampilan berupa daftar kartu;
    tidak ada elemen yang meluber keluar layar.

17. **Navigasi timeline (Jadwal).** Buka Booking di layar lebar (≥ 768 px, mis. tablet/laptop),
    pastikan view default adalah **Jadwal**; lihat garis grid 30 menit dan blok booking per unit.
    *Harapan:* sumbu 08:00–24:00 terlihat penuh, blok booking diposisikan sesuai waktu, label jam
    rata dengan garis grid.

18. **Booking kedaluwarsa.** Di Booking, buka tab **Kedaluwarsa**.
    *Harapan:* hanya booking yang statusnya kedaluwarsa yang ditampilkan; tidak ada tombol
    **Check-in**, hanya **Selesaikan** dan **Batalkan**.

19. **Check-in dari booking.** Buat booking baru, konfirmasi, lalu buka detail dan tekan
    **Check-in**.
    *Harapan:* booking berubah menjadi sesi aktif, unit berstatus **Sedang Bermain**, hitung
    mundur dimulai.

20. **Banner at-risk + tombol "Tampilkan".** Jika ada booking kedaluwarsa, lihat banner merah
    di atas daftar booking, lalu tekan **Tampilkan**.
    *Harapan:* layar beralih ke tab **Kedaluwarsa** dan menampilkan booking terkait, dengan
    notifikasi toast.

21. **Cetak struk (verifikasi manual).** Dari detail transaksi yang selesai, tekan **Cetak**.
    *Harapan:* dialog cetak browser muncul dan tampilan struk lebar 80 mm. **(Tidak dapat
    diverifikasi otomatis — perlu printer HP nyata atau preview cetak browser.)**

### Verifikasi tambahan setelah perbaikan UX HP & laptop

Rincian temuan & spek ada di `specs/ux-mobile-laptop.md`; hasil QA di `specs/design-qa-report.md`
(bagian **DS-008** dan **DS-009**). Semua item berikut **belum pernah dilihat di browser** —
wajib dicek manual sebelum rilis.

22. **Bottom nav.** Masuk sebagai Super Admin, lihat navigasi bawah; lalu masuk sebagai
    pelanggan dan cek lagi.
    *Harapan:* Super Admin → 4 item (**Dashboard · Sesi · Konsol · Transaksi**) + tombol
    **Lainnya** (Dashboard sudah jadi item utama, sisanya — Booking, Transaksi… — ada di
    sheet "Lainnya"); pelanggan → 4 item (**Beranda · Booking Saya · Info Rental · Profil**)
    **tanpa** tombol "Lainnya" (semua menu pelanggan sudah di bar bawah). Label tidak
    terpotong di 360 px.
23. **Simpan pengaturan di laptop.** Masuk sebagai Super Admin di layar ≥ 1024 px, ubah satu
    nilai (mis. tarif default), lalu scroll ke bawah.
    *Harapan:* tombol **"Simpan perubahan"** terlihat (sticky di bawah konten) dan mengubah
    data. Di HP (<1024) tombolnya muncul sebagai bar lengket di atas nav bawah.
24. **Kartu di HP — target sentuh & hierarki.** Buka Sesi / Transaksi / Konsol di 360 px.
    *Harapan:* judul kartu (nama / kode unit) bisa diketuk dengan nyaman (tinggi sentuh ≥ 44 px);
    nominal besar tampil di sudut kanan atas kartu; tombol aksi ada di kaki kartu; **tidak ada**
    scroll horizontal.
25. **Konsol "Mulai sesi".** Buka Sesi → Mulai sesi di 360 px.
    *Harapan:* ketuk **kode unit** (mis. `PS-01`) untuk memilih — bukan "Mulai Sesi" mati;
    tidak ada tombol yang tampak hidup tetapi tidak bekerja.
26. **Timeline di HP.** Buka Booking di 360 px dan di ≥ 768 px.
    *Harapan:* di 360 px timeline **tidak tampil** (dan ada catatan yang mengarahkan ke tampilan
    ≥ 768 px); di ≥ 768 px tampil sebagai "Jadwal" dengan sumbu 08:00–24:00, dan blok booking
    bisa diketuk.
27. **Tabel laptop — header lengket.** Masuk sebagai Super Admin, buka Laporan → Transaksi di
    ≥ 1024 px, lalu scroll ke bawah.
    *Harapan:* **header kolom tetap terlihat** saat menggulir, tabel tidak melebar melebihi
    1280 px, dan panel tabel tidak keluar dari layar.
28. **Laporan — nominal di HP.** Buka Laporan → Pembayaran dan → Per Unit di 360 px.
    *Harapan:* nominal (total / pendapatan) **tampil di kartu**, tidak terpotong.
29. **Dashboard.** Masuk sebagai Super Admin di HP dan di laptop.
    *Harapan:* di HP blok **"Segera berakhir"** tampil paling atas; strip metrik 5 sel rapi;
    grafik pendapatan 2/3 vs jam tersibuk 1/3 di ≥ 1024 px.

---

## Troubleshooting

1. **`sh: 1: tsc: not found` / `vite: not found`.** Di setup Termux ini **tidak ada
   `/usr/bin/env`**, sehingga shebang `#!/usr/bin/env node` tidak jalan dan memanggil paket
   lewat nama (`npx tsc`) gagal. Karena itu skrip di `web/package.json` memanggil
   `node node_modules/<paket>/bin/<bin>.js` secara langsung. **Jangan ubah skrip itu;**
   jalankan lewat `npm run <script>`.
2. **`/tmp` tidak bisa ditulis.** `/tmp` tidak dapat diandalkan (tidak writable). Untuk kerja
   sementara gunakan `$PREFIX/tmp/opencode` = `/data/data/com.termux/files/usr/tmp/opencode`.
   Test helper yang membuat DB sementara perlu memperhatikan ini.
3. **`node --test test/` error di Node 26.** Argumen direktori telanjang dianggap modul dan
   gagal. Pakai `node --test` atau sebut file eksplisit, mis. `node --test test/pricing.test.js`.
4. **Python 3.14 terpasang tetapi tidak dipakai.** Jangan andalkan Python untuk apa pun di
   proyek ini.
5. **Port sudah dipakai.** Lihat prosesnya: `ss -ltnp | grep 4000` (atau ganti `PORT` di
   `server/.env`, dan sesuaikan proxy Vite bila perlu).
6. **`database is locked`.** Muncul bila ada dua proses menulis DB yang sama. Pastikan hanya
   satu instance server berjalan, dan tidak ada proses lain yang memegang `playrent.db`.
   Tutup proses ganda, lalu coba lagi.
7. **401 setelah login.** Biasanya karena cookie. Gunakan **satu origin yang konsisten**
   (`localhost` **atau** `127.0.0.1`, jangan bergantian — cookie terikat ke host), pastikan
   cookie `pr_session` tidak diblokir, dan `CORS_ORIGIN` cocok dengan origin yang Anda buka.
   Jika diakses lewat `http://<IP-LAN>` dan login sukses tetapi semua request `401`, set
   `COOKIE_SECURE=false` di `server/.env` lalu restart — flag `Secure` dibuang browser pada
   HTTP biasa.
8. **HP tidak bisa membuka `http://<IP>:5173`.** Pastikan HP dan kotak Termux di Wi-Fi yang
   sama, dan Vite menampilkan baris `Network:` saat start. Jika tidak, pastikan
   `server.host: true` masih ada di `web/vite.config.ts`.
9. **Deploy produksi: login `200` lalu semua request berikutnya `401`.** Cookie sesi lintas
   situs tidak terkirim. Cek header `Set-Cookie` pada `POST /api/auth/login` — harus memuat
   `SameSite=None; Secure`. Kalau yang muncul `SameSite=Lax`, berarti `NODE_ENV` belum
   `production` atau `COOKIE_SECURE` terbaca `false` (nilai `SameSite=None` tanpa `Secure`
   otomatis diturunkan ke `lax`). Perbaiki `server/.env`, lalu restart server.
10. **Error CORS di console (deploy produksi).** `CORS_ORIGIN` harus persis
    `https://adjietegaralamsyah312.github.io` — **tanpa** `/PlayRent`, karena path bukan
    bagian dari origin — dan respons server harus membawa `Access-Control-Allow-Origin` yang
    **spesifik** (bukan `*`). Server memang tidak pernah mengirim wildcard; kalau melihat
    `*`, allowlist-nya tidak cocok dengan origin yang Anda buka.
11. **Semua request diarahkan ke `github.io/api/...` dan 404.** Repository variable
    `VITE_API_BASE_URL` belum ter-set, sehingga build memakai path relatif. Set variable-nya
    (Settings → Secrets and variables → Actions → tab **Variables**), lalu jalankan ulang
    workflow (push ke `main` atau tombol **Run workflow**) — nilai baru hanya berlaku pada
    build berikutnya. Workflow sekarang berhenti dengan pesan jelas kalau variable kosong,
    jadi kalau deploy sempat jalan, itu build lama.
12. **Workflow gagal: "must be the ORIGIN only" / "must not contain userinfo" / "contains
    whitespace".** Nilai `VITE_API_BASE_URL` bukan origin murni — masih ada path
    (`https://host/app`), query (`?x=1`), fragment (`#/x`), userinfo (`https://user@host`),
    atau spasi/newline. Isi **hanya** `https://<host-tunnel>` (tanpa path, tanpa query, tanpa
    fragment, tanpa spasi), lalu jalankan ulang workflow.
13. **`trustProxy=false` di log start.** Dua sebab, dibedakan baris `PERINGATAN`: **tidak ada**
    `PERINGATAN: TRUST_PROXY="…" tidak dikenal` → nilai `TRUST_PROXY` tidak diaktifkan
    (baris tidak ada, atau masih `0`) / `.env` tidak terbaca (dijalankan dari luar folder
    `server/`); **ada** `PERINGATAN: TRUST_PROXY="one" tidak dikenal` → nilai env salah ketik
    (`ture`, `yes`, `on`, `1.5`). Tabel diagnosa lengkap ada di runbook §3.3. Fix yang umum:
    `cd server && npm start` dengan `TRUST_PROXY=1` di `server/.env`.
14. **HP tidak bisa membuka `http://<IP-LAN>:4000`.** `server/.env` berisi `HOST=127.0.0.1`
    (rekomendasi produksi) → server hanya bind loopback. Itu **memang** yang diinginkan di
    mode tunnel: port yang terbuka ke LAN bisa dipakai memalsukan `X-Forwarded-For` selama
    `TRUST_PROXY=1`. Di produksi, HP harus memakai alamat tunnel `https://<host-tunnel>`.

---

## Catatan keamanan

- **SQL parameterized di semua tempat.** Tidak ada string pengguna yang masuk ke
  `prepare`/`exec` sebagai SQL.
- **Sandi di-hash dengan `scrypt`** (`node:crypto`, N=16384, r=8, p=1, keylen=64, salt 16 byte
  hex). Teks polos tidak pernah disimpan.
- **Tidak ada password hardcoded di repo.** `npm run seed` tidak membuat akun; satu-satunya
  jalan membuat Super Admin adalah CLI `npm run admin:bootstrap` (sandinya diinput pemilik,
  tidak pernah dicetak, tidak pernah di-log).
- **Sesi = cookie `httpOnly`** dengan `SameSite` **environment-driven**
  (`COOKIE_SAME_SITE` = `lax` | `strict` | `none`; default `none` di production untuk skenario
  lintas situs HTTPS, `lax` selain itu) dan flag `Secure` mengikuti `NODE_ENV`
  (`COOKIE_SECURE=false` hanya untuk LAN HTTP). Token disimpan di DB sebagai `sha256` dan
  dicari lewat hash — **token sesi tidak pernah keluar di JSON**; satu-satunya pembawa sesi
  adalah cookie `HttpOnly`. **Pemeriksaan origin CSRF tetap aktif** dan tidak bisa dimatikan
  lewat env: request tulis dari origin yang tidak diizinkan dijawab `403
  CSRF_ORIGIN_MISMATCH`.
- **Otorisasi ditegakkan di server pada setiap route** (`requireAuth` + `requireSuperAdmin`).
  Frontend hanya menyembunyikan UI.
- **Role hanya dua** (`superadmin` | `user`) dan ditentukan server. Body registrasi yang
  membawa `role` → `400`. Booking milik orang lain → `404`, bukan `403`.
- **Uang selalu dihitung di server**; total dari klien ditolak, bukan dipercaya.
- **Rate limit login** 5 gagal / 15 menit per username+IP; **rate limit registrasi** 10 / 15
  menit per IP. Kunci bucket login dinormalisasi (case-insensitive).
- **Audit log disanitasi.** `lib/audit.js` mengganti nilai `meta` yang kuncinya
  password/token/secret/salt/hash dengan `[redacted]` sebelum ditulis, jadi tidak ada
  kredensial yang bisa bocor ke jejak audit.
- **Backup & restore hanya lewat CLI lokal**, restore butuh konfirmasi ketik `RESTORE` dan
  selalu membuat backup pra-restore lebih dulu. Tidak ada endpoint HTTP untuk restore.
- **Tidak ada secret di repo.** `.env.example` hanya placeholder; DB, `node_modules`, dan
  `dist` diabaikan oleh `.gitignore`.
- **Error tidak membocorkan stack trace**; error tak terduga → 500 generik, detail hanya di log
  server. `GET /api/health` tidak pernah mengirim path absolut database ke luar server
  (`db: {ok}` saja).

Hasil audit lengkap (termasuk matriks route→guard dan temuan yang masih terbuka) ada di
**`specs/review-report.md`**.
