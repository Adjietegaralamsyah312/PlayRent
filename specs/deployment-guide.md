# Runbook Deploy Produksi — PlayRent (GitHub Pages + Cloudflare Tunnel)

> Task: DO-001 · Agen: @devops · Tanggal: 2026-10-21
> Revisi: **DO-002** (perbaikan temuan review RV-001 — HIGH-1 `TRUST_PROXY`, MEDIUM-1 audit
> browser, LOW-1 verifikasi inlining bundle, LOW-2/LOW-3/LOW-5 catatan operator).
> Kontrak acuan: `specs/deploy-contract.md` (single source of truth), `specs/be001-report.md`,
> `specs/fe001-report.md`.
> Panduan ini untuk **operator** (pemilik usaha), ditulis dalam bahasa Indonesia.
>
> Ringkas: frontend (React/Vite) dikirim ke **GitHub Pages**, backend (Node/Express + SQLite)
> tetap jalan di **Termux** dan diekspos lewat **Cloudflare Tunnel** (HTTPS).
> `localhost:5173` **tidak pernah** menjadi alamat publik.

---

## Daftar Isi

1. [Arsitektur](#1-arsitektur)
2. [Prasyarat](#2-prasyarat)
3. [Langkah A — Jalankan backend di Termux](#3-langkah-a--jalankan-backend-di-termux)
4. [Langkah B — Cloudflare Tunnel](#4-langkah-b--cloudflare-tunnel)
5. [Langkah C — Repository variable GitHub](#5-langkah-c--repository-variable-github)
6. [Langkah D — Verifikasi dari URL publik](#6-langkah-d--verifikasi-dari-url-publik)
7. [Batasan dukungan browser](#7-batasan-dukungan-browser-wajib-dibaca-operator)
8. [Fallback: sajikan SPA dari origin yang sama](#8-fallback-sajikan-spa-dari-origin-yang-sama)
9. [Rollback](#9-rollback)
10. [Ringkasan env yang dipakai](#10-ringkasan-env-yang-dipakai)
11. [Checklist operator](#11-checklist-operator)

---

## 1. Arsitektur

```
 Browser (user)
      │
      │  https://adjietegaralamsyah312.github.io/PlayRent/     ← frontend statis (GitHub Pages)
      ▼
┌───────────────────────────┐
│  GitHub Pages (CDN)       │   build dari .github/workflows/deploy.yml
│  web/dist (SPA statis)    │   VITE_API_BASE_URL di-inline saat build
└───────────────────────────┘
      │
      │  XHR/fetch ke https://<host-tunnel>/api/...
      │  (SameSite=None; Secure → cookie ikut lintas situs)
      ▼
┌───────────────────────────┐
│  Cloudflare Tunnel        │   HTTPS keluar, TLS/cloudflared
│  <host-tunnel>            │   contoh: https://xyz.trycloudflare.com
└───────────────────────────┘
      │
      │  http://127.0.0.1:4000  (loopback, tidak pernah terbuka ke internet)
      ▼
┌───────────────────────────┐
│  Termux — Node/Express    │   server/: npm start  (PORT=4000)
│  127.0.0.1:4000           │
└───────────────────────────┘
      │
      ▼
┌───────────────────────────┐
│  SQLite                   │   server/data/playrent.db
│  (file lokal di Termux)   │   tidak pernah diekspos ke browser
└───────────────────────────┘
```

Poin penting:

- **GitHub Pages hanya menyajikan file statis.** Tidak ada proses server di sana.
- **API hidup di Termux**, diikat ke `127.0.0.1:4000` (loopback — lihat `HOST` di
  [3.1](#31-buat-serverenv)), jadi **hanya** `cloudflared` di mesin yang sama yang bisa
  menjangkau port itu. Yang menghadap internet hanya Cloudflare Tunnel. Jangan pernah
  mengekspos port `4000` ke publik.
- **Aset `web/dist` dibangun di GitHub Actions**, bukan di Termux. Nilai
  `VITE_API_BASE_URL` **di-inline ke dalam bundle** saat build (Vite hanya mengabadikan
  variabel `VITE_*` yang ada pada saat itu) — makanya env wajib dipasang di step build.
- **Database tidak pernah menyentuh Pages maupun tunnel.** Hanya lewat API.

---

## 2. Prasyarat

| Kebutuhan | Detail |
| --- | --- |
| Repository GitHub | Sudah ada, dengan **GitHub Pages aktif** (branch `main`, folder `/PlayRent`) dan workflow `.github/workflows/deploy.yml`. |
| Akun GitHub | Hak **admin repository** (untuk membuat repository variable). |
| Akun Cloudflare | Wajib untuk *named tunnel* (DNS record). *Quick tunnel* tidak butuh akun, tapi URL-nya acak dan berubah tiap restart. |
| Termux | Node.js **22+** (`node -v`), sudah `npm ci` di folder `server/`. |
| `cloudflared` | Binari untuk Termux (lihat [Langkah B](#4-langkah-b--cloudflare-tunnel)). |
| Database siap | `server/data/playrent.db` sudah ada (dibuat lewat `npm run seed:schema`), dan akun Super Admin sudah ada (`npm run admin:bootstrap`). |

> Persiapan database & akun **tidak** bagian dari runbook ini — itu urusan instalasi awal
> (lihat README bagian "Inisialisasi database"). Jalur deploy di sini **tidak pernah**
> menyentuh, me-reset, atau menghapus data.

---

## 3. Langkah A — Jalankan backend di Termux

### 3.1 Buat `server/.env`

`server/.env` **tidak** ada di repo (di-ignore). Buat sekali dari `.env.example`, lalu isi
persis seperti ini:

```sh
cd server
cp .env.example .env
```

Isi `server/.env` (nilai produksi):

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

> `server/.env.example` (template) berisi `TRUST_PROXY=0` — itu **default yang aman**
> (proxy tidak dipercaya) — dan `HOST=` kosong (bind semua interface). Untuk produksi di
> belakang Cloudflare Tunnel, **ubah `TRUST_PROXY` jadi `1`** dan **isi `HOST=127.0.0.1`**.

Penjelasan tiap baris:

| Variabel | Nilai produksi | Kenapa |
| --- | --- | --- |
| `NODE_ENV` | `production` | Mengaktifkan default `SameSite=None` **dan** `Secure=true` untuk cookie sesi. Kalau tertinggal `development`, cookie jadi `SameSite=Lax` → **lintas situs tidak terkirim** → login `200` lalu semua request `401`. |
| `PORT` | `4000` | Port lokal API. Tunnel mengarah ke port ini. |
| `DB_PATH` | `./data/playrent.db` | Lokasi SQLite (relatif ke folder `server/`). |
| `SESSION_TTL_HOURS` | `12` | Masa berlaku sesi login (sliding). |
| `CORS_ORIGIN` | `https://adjietegaralamsyah312.github.io` | Allowlist origin browser, comma-separated, **tanpa path**. `/PlayRent` bukan bagian dari origin. |
| `COOKIE_SAME_SITE` | `none` | Cookie sesi harus dikirim lintas situs (Pages → tunnel). Wajib berpasangan dengan `Secure=true`. |
| `COOKIE_SECURE` | `true` | Cookie hanya lewat HTTPS. Kalau diisi `false`, sistem otomatis menurunkan `SameSite` ke `lax` → auth lintas situs rusak. |
| `TRUST_PROXY` | `1` | **Jumlah hop** yang dipercaya, bukan boolean. `1` = satu proxy tepercaya (Cloudflare Tunnel). Lihat [3.2](#32-trust_proxy--jumlah-hop-yang-dipercaya-bukan-boolean). |
| `HOST` | `127.0.0.1` | Alamat bind server. Kosong/tidak di-set → bind semua interface (`0.0.0.0`) → port `4000` **terjangkau dari LAN**. `127.0.0.1` → API hanya bisa diakses dari mesin ini — cukup untuk `cloudflared` yang jalan di mesin yang sama. |

#### Kenapa `HOST=127.0.0.1` direkomendasikan di produksi

Server produksi **hanya** diakses lewat Cloudflare Tunnel yang berjalan **di mesin yang sama**.
Dengan `HOST=127.0.0.1`:

- `cloudflared` (yang berjalan lokal) tetap bisa menjangkau `http://127.0.0.1:4000` → **tidak
  ada yang berubah** dari sisi tunnel dan situs publik.
- Klien LAN **tidak** bisa membuka `http://<IP-KBOX>:4000` langsung. Ini penting karena
  `TRUST_PROXY=1` membuat Express mempercayai **satu** hop: kalau ada yang menjangkau port
  `4000` langsung dari LAN, ia **mengendalikan** header `X-Forwarded-For` sepenuhnya dan
  bisa membuat bucket rate-limit baru tiap percobaan (persis kelas serangan yang ditutup
  `TRUST_PROXY` hop-count). Dengan bind loopback, jalur bypass itu **tidak ada**.
  Server juga mencetak peringatan `PERINGATAN: TRUST_PROXY=1 mempercayai X-Forwarded-For …`
  saat start — itu pengingat untuk hal ini.

> **Konsekuensi yang harus jujur dicatat:** dengan `HOST=127.0.0.1`, **HP di Wi-Fi yang sama
> tidak lagi bisa membuka API secara langsung** (fitur "akses dari HP" via
> `http://<IP-KBOX>:4000` **mati**). Ini memang yang **diinginkan** pada mode produksi
> tunnel — pada mode itu aksesnya lewat `https://<host-tunnel>`, bukan lewat IP LAN.
> Kalau justru butuh fitur "buka API langsung dari HP" (mis. saat tunnel mati), **hapus/
>   kosongkan `HOST`** (kembali ke `0.0.0.0`) — dan pahami konsekuensinya: dengan
> `TRUST_PROXY=1` yang masih menyala, port yang terbuka ke LAN itu bisa dipakai untuk
> memalsukan `X-Forwarded-For`. Trade-off: **keamanan** vs **kemudahan akses lokal**.

> **Penting — `server/.env` sekarang benar-benar dibaca.** `npm start` memakai
> `node --env-file-if-exists=.env`, jadi isi file itu **berpengaruh** (sebelumnya env itu
> tidak pernah dimuat, dan semua pengaturan operator jadi tidak berefek). Pastikan tidak ada
> nilai sisa `NODE_ENV=development` atau `CORS_ORIGIN=http://localhost:5173` yang tertinggal
> dari template.

### 3.2 `TRUST_PROXY` — jumlah hop yang dipercaya, bukan boolean

`TRUST_PROXY` dibaca sebagai **jumlah proxy yang boleh dipercaya** (hop count), **bukan**
boolean. Nilainya:

| Nilai | Arti | Kapan dipakai |
| --- | --- | --- |
| `1` | Percaya **satu** proxy: `req.ip` diambil dari entri `X-Forwarded-For` **paling kanan** (yang ditambahkan proxy tepercaya). | **Kasus PlayRent**: Express ← cloudflared (Cloudflare Tunnel) ← internet. |
| `2` | Percaya dua proxy. | Express ← nginx ← cloudflared ← internet. |
| `0` / tidak di-set | Tidak percaya proxy apa pun; `req.ip` = IP socket, `req.protocol` = `http`. | Server diakses langsung (default, aman). |

> **Jangan pernah pakai nilai boolean `true` untuk `TRUST_PROXY`.** Nilai boolean adalah
> konsep lama: ia membuat Express mempercayai **seluruh** rantai `X-Forwarded-For`, padahal
> Cloudflare **menambah** (bukan mengganti) header itu — sehingga entri paling kiri adalah
> **nilai kiriman penyerang** yang bebas dipalsukan. Akibatnya `req.ip` bisa diganti tiap
> percobaan dan **rate-limit login/register bisa dilewati** (brute-force tanpa batas).
> Sekarang nilai boolean itu hanya berarti "1 hop", jadi tetap angka eksplisit (`1`) yang dipakai:
> lebih aman dan jauh lebih jelas dibaca.

**Kenapa Cloudflare Tunnel butuh `1`.** Cloudflare Termination berada **di depan** server.
Saat request melewati tunnel, Express menerima `X-Forwarded-For` seperti:

```
X-Forwarded-For: <dipalsukan-penyerang>, <IP-asli-dari-Cloudflare>
```

Cloudflare **menambah** entri, tidak menggantinya. Dengan `TRUST_PROXY=1`, Express mengambil
entri **paling kanan** (milik Cloudflare) → `req.ip` = IP asli klien, dan nilai kiriman
penyerang diabaikan. Dengan trust-all, entri paling kiri dipakai → dikendalikan penyerang.

Kalau `TRUST_PROXY` **tidak** di-set (default `0`):

- `req.ip` menjadi IP tunnel → **semua pengguna berbagi satu bucket rate-limit login**
  (5 gagal / 15 menit per username+IP). Satu orang yang salah password bisa mengunci login
  seluruh pengguna.
- `req.protocol` jadi `http` (bukan `https`) → origin API yang dihitung oleh CSRF guard
  menjadi `http://<host>` dan tidak cocok dengan allowlist HTTPS. Efeknya paling jelas di
  [mode fallback same-origin](#82-set-cookie-jadi-first-party): request tulis dari browser
  kena `403 CSRF_ORIGIN_MISMATCH`.

> **Aktifkan hanya kalau server benar-benar berada di belakang reverse proxy tepercaya.**
> Jangan di-set kalau port `4000` dibuka langsung ke internet — tanpa proxy,
> `X-Forwarded-For` bisa datang langsung dari penyerang.

**Cek cepat bahwa `TRUST_PROXY` benar-benar aktif** (probe ini membaca `req.protocol`):

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host-tunnel>/api/auth/login \
  -H 'Origin: https://<host-tunnel>' \
  -H 'Content-Type: application/json' \
  -d '{"username":"__trustproxy_probe__","password":"probe"}'
```

| Hasil | Arti |
| --- | --- |
| `401` | `TRUST_PROXY` aktif → `req.protocol` = `https`, origin API sendiri diterima CSRF guard. Bagus. |
| `403` | `TRUST_PROXY` **tidak** aktif → `req.protocol` = `http`, origin `https://<host>` tidak dikenali. Perbaiki `.env`, restart server, ulangi probe. |

(Probe ini memakai nama user sekali pakai, tidak membuat akun, dan tidak menyentuh data.)

### 3.3 Jalankan server

> **Selalu jalankan dari folder `server/`.** `npm start` memakai
> `node --env-file-if-exists=.env`, dan nama file itu **relatif terhadap direktori kerja
> (cwd)**. Kalau server dijalankan dari root repo (`node server/src/index.js`), `.env` yang
> dibaca adalah `./.env` di root — file itu **tidak ada**, sehingga seluruh pengaturan
> operator **diam-diam diabaikan** (`NODE_ENV` jadi `development` → `SameSite=Lax` → login
> lintas situs rusak tanpa error yang jelas). Selalu `cd server` dulu.

```sh
cd server
npm start
```

Log yang diharapkan (contoh: `.env` produksi dengan `HOST=127.0.0.1`):

```
[playrent] listening on http://127.0.0.1:4000 · host=127.0.0.1 · env=production · db=.../server/data/playrent.db
[playrent] env=production cors=["https://adjietegaralamsyah312.github.io"] sameSite=none secure=true trustProxy=1
[playrent] PERINGATAN: TRUST_PROXY=1 mempercayai X-Forwarded-For. Permintaan yang datang langsung dari LAN (melewati tunnel) bisa memalsukan X-Forwarded-For sehingga rate limit login bisa dilewati. Set HOST=127.0.0.1 di server/.env kalau API hanya diakses lewat Cloudflare Tunnel (tunnel berjalan di mesin yang sama → cukup akses lokal).
```

> Baris `PERINGATAN` terakhir itu **cetak terus** selama `TRUST_PROXY` menyala, bahkan kalau
> `HOST=127.0.0.1` sudah diset (server hanya memeriksa `TRUST_PROXY`, bukan `HOST`). Jadi kalau
> `host=127.0.0.1` sudah tampil di baris pertama, peringatan itu **sudah tidak berlaku lagi** —
> port `4000` memang tidak terjangkau dari LAN.

**Periksa baris konfigurasi efektif itu** — di situ terlihat semua yang penting:

| Yang tampil di log | Seharusnya | Kalau beda |
| --- | --- | --- |
| `env=production` | `production` | `development` → `.env` tidak terbaca (cwd salah) atau `NODE_ENV` ditimpa shell. |
| `sameSite=none` | `none` | `lax` → `COOKIE_SAME_SITE` tidak terbaca → cookie lintas situs tidak terkirim. |
| `secure=true` | `true` | `false` → `COOKIE_SECURE=false` → `SameSite` otomatis turun ke `lax`. |
| `trustProxy=1` | `1` (jumlah hop) | `false` → **dua sebab berbeda**; diagnosa lewat tabel [Dua sebab `trustProxy=false`](#dua-sebab-trustproxyfalse-gejala-sama). |
| `cors=["https://adjietegaralamsyah312.github.io"]` | origin Pages (tanpa path) | origin dev → `CORS_ORIGIN` tidak terbaca. |
| `host=127.0.0.1` | `127.0.0.1` | `0.0.0.0` → `HOST` tidak terbaca → port `4000` terjangkau dari LAN (lihat peringatan NEW-2 di [3.1](#31-buat-serverenv)). |

Kalau `TRUST_PROXY` diisi dengan **nilai boolean** (`true`), server mencetak **PERINGATAN** di
log bahwa nilai itu kini diartikan sebagai 1 hop — itu pengingat untuk memakai angka
eksplisit.

#### Dua sebab `trustProxy=false` (gejala sama)

`trustProxy=false` di baris konfigurasi efektif punya **dua** sebab dengan **gejala identik**.
Bedanya hanya terlihat dari baris `PERINGATAN` dan dari baris `env=` yang lain:

| Gejala | Penyebab | Perbaikan |
| --- | --- | --- |
| `trustProxy=false` **dan** baris lain juga salah (`env=development`, `sameSite=lax`, `cors` dev) | `.env` **tidak terbaca** — `npm start` dijalankan dari luar folder `server/`, jadi `--env-file-if-exists=.env` membaca `./.env` di root repo (file itu tidak ada). | Jalankan dari folder yang benar: `cd server && npm start`. Lihat [3.3](#33-jalankan-server). |
| `trustProxy=false` **dan** ada baris `PERINGATAN: TRUST_PROXY="one" tidak dikenal` | Nilai env **salah ketik** — parser tidak mengenal nilainya, jadi `X-Forwarded-For` diabaikan dan `trustProxy` jadi `false`. | Set persis `TRUST_PROXY=1` di `server/.env`, restart server, pastikan baris konfigurasi efektif jadi `trustProxy=1`. |
| `trustProxy=false` **dan** **tidak ada** baris `PERINGATAN: TRUST_PROXY="…" tidak dikenal` | Nilai `TRUST_PROXY` **tidak diaktifkan sama sekali**: barisnya tidak ada di `.env`, atau masih nilai template `TRUST_PROXY=0`, atau `false`. Ini **bukan** salah ketik — parser memang tidak menerima nilai apa pun sehingga tidak ada yang dicetak. | Set `TRUST_PROXY=1` di `server/.env`. Kalau barisnya sudah `1` tapi log tetap `false`, berarti `.env` yang dibaca bukan file itu (cwd salah) **atau** shell menimpa nilainya (`TRUST_PROXY=0 npm start` — env shell menang atas isi file). |

Nilai yang **dikenali** parser (`server/src/config.js` → `parseTrustProxy()`):

| Nilai | Hasil | Peringatan startup |
| --- | --- | --- |
| `0` / `false` / kosong / tidak di-set | `false` — proxy tidak dipercaya, `X-Forwarded-For` diabaikan | tidak ada |
| `1`, `2`, `3`, … (bilangan bulat > 0) | jumlah hop sebanyak angka itu | tidak ada |
| `true` | `1` (satu hop) | **PERINGATAN** — nilai boolean ditafsirkan 1 hop, pakai angka eksplisit |
| apa pun yang lain (`ture`, `yes`, `on`, `1.5`, `1 2`, `-1`) | `false` — `X-Forwarded-For` diabaikan | **PERINGATAN** "tidak dikenal" |

> Spasi **di tepi** nilai tidak menjadi masalah: parser `.env` Node dan `parseTrustProxy()`
> sama-sama memangkas spasi di awal/akhir (`TRUST_PROXY= 1 ` tetap terbaca `1`). Yang tidak
> dikenal adalah nilai yang **berisi spasi di tengah** (`TRUST_PROXY=1 2`) — itu dianggap
> "tidak dikenal" → `false` + peringatan.

Cek cepat dari terminal lain (tanpa browser):

```sh
curl -s http://127.0.0.1:4000/api/health
```

---

## 4. Langkah B — Cloudflare Tunnel

### 4.1 Pasang `cloudflared` di Termux

Termux tidak menyediakan paket `cloudflared` lewat `pkg`, jadi unduh binari resminya:

```sh
mkdir -p $PREFIX/bin
# perangkat arm64 (umum di HP Android modern)
curl -L -o $PREFIX/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
# perangkat arm (32-bit) — pakai: cloudflared-linux-arm
chmod +x $PREFIX/bin/cloudflared
cloudflared --version
```

### 4.2 Opsi A — Quick tunnel (paling ringkas, untuk coba-coba)

```sh
cloudflared tunnel --url http://127.0.0.1:4000
```

Cloudflare mencetak URL acak, misalnya:

```
Your quick Tunnel has been created! Visit it at https://random-words-here.trycloudflare.com
```

Buka URL tersebut di browser → backend harus balas (mis. `GET /api/health` → JSON).

> **Quick tunnel mengubah URL setiap kali tunnel di-restart.** begitu juga sewaktu
> Termux mati. Maka **repository variable `VITE_API_BASE_URL` harus di-update ulang** dan
> workflow di-run ulang setiap kali URL berubah — kalau tidak, situs yang sudah terbit akan
> tetap menunjuk API yang sudah mati.
>
> Quick tunnel juga cocok untuk **LTS**: tidak ada akun Cloudflare yang perlu disiapkan.

Menjalankan tunnel di background (supaya tidak brutally terputus saat terminal ditutup):

```sh
nohup cloudflared tunnel --url http://127.0.0.1:4000 > $PREFIX/tmp/cloudflared.log 2>&1 &
```

Atau pakai `tmux` agar bisa melihat log tunnel secara langsung.

### 4.3 Opsi B — Named tunnel (dipakai untuk produksi)

Hosting tunnel yang stabil, dengan hostname sendiri dan sertifikat TLS yang managed:

```sh
# 1. Login ke Cloudflare (membuka browser)
cloudflared tunnel login

# 2. Buat tunnel
cloudflared tunnel create playrent

# 3. Arahkan DNS ke tunnel (ganti domain Anda)
cloudflared tunnel route dns playrent api.domain-anda.com
```

Buat file konfigurasi `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /data/data/com.termux/files/home/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.domain-anda.com
    service: http://127.0.0.1:4000
  - service: http_status:404
```

Jalankan:

```sh
cloudflared tunnel run playrent
```

Aturan DNS di dasbor Cloudflare (tunnel ini otomatis membuat record CNAME ke
`<TUNNEL_ID>.cfargotunnel.com`).

> `~/.cloudflared/` berisi kredensial tunnel. **Jangan** masukkan ke repo, jangan di-*commit*,
> dan batasi permission-nya (`chmod 600 ~/.cloudflared/*.json`).

---

## 5. Langkah C — Repository variable GitHub

Frontend dibangun di GitHub Actions. Nilai origin API harus **diumpan ke dalam build** lewat
*repository variable* (bukan secret — nilainya memang publik, karena terkunci di dalam
bundle browser).

1. Buka repository → **Settings**.
2. Menu **Secrets and variables** → **Actions**.
3. Pindah ke tab **Variables** (bukan "Secrets").
4. Klik **New repository variable**.
5. Isi:
   - **Name**: `VITE_API_BASE_URL`
   - **Value**: `https://<host-tunnel>` — **origin saja**: tanpa trailing slash, tanpa `/api`.
     Contoh: `https://random-words-here.trycloudflare.com` atau `https://api.domain-anda.com`.
   - **Scope**: **Repository**.
6. Klik **Add variable**.

> **Variable, bukan secret.** Kalau dibuat di tab *Secrets*, nilainya tidak bisa dibaca lewat
> `vars.*` dan build akan gagal dengan pesan "repository variable not set".
> Nilainya memang bukan rahasia — ia terlihat di bundle JavaScript yang dikirim ke browser.

### 5.1 Setelah menambah/mengubah variable → jalankan workflow ulang

Variable **tidak** berlaku retroaktif. Workflow yang sudah selesai tidak akan memakai nilai
baru. Pilih salah satu:

- **Push** commit apa pun ke `main` → workflow jalan otomatis.
- **Run workflow manual**: tab **Actions** → pilih workflow **Deploy PlayRent Website** →
  tombol **Run workflow** → branch `main` → **Run workflow**.

### 5.2 Fail-fast di dalam workflow

`.github/workflows/deploy.yml` punya **dua** pemeriksaan otomatis, keduanya **sebelum** situs
dipublish:

1. **Check VITE_API_BASE_URL repository variable** — jalan **sebelum build**. Workflow menolak
   variable yang: **kosong**, bukan `http://`/`https://`, **berisi whitespace**, punya
   **path** (`…/app`), **query** (`…?x=1`), **fragment** (`…#/x`), **userinfo** (`https://user@host`),
   atau berakhiran `/api`. Kalau begitu workflow **gagal dengan pesan jelas** dan **tidak ada
   situs yang dipublish** — deployment lama tetap utuh.
2. **Verify API origin is inlined** — jalan **setelah build, sebelum upload artifact**.
   Workflow mencari string origin API di `web/dist/assets`. Kalau **tidak ditemukan**, build
   dianggap gagal dan artifact **tidak pernah** di-upload. Ini menangkap kasus yang tidak
   tertangkap pemeriksaan pertama: variable ada dan formatnya benar, tapi somehow tidak
   ter-abadikan ke dalam bundle (mis. `web/src/lib/api.ts` berhenti memakai
   `import.meta.env`, atau `VITE_*` tidak masuk ke environment build).

> Kenapa pemeriksaan pertama harus tegas soal "origin saja"? Frontend menambahkan `/api`
> sendiri. Kalau variable berisi path (`https://host/app`), bundle terbit dengan
> `https://host/app/api/...` → **404 di setiap panggilan** — dan pemeriksaan kedua **tidak**
> menangkapnya, karena string itu memang ada di dalam bundle.

Alasannya: kalau variable kosong, Vite membangun bundle dengan path **relatif** `/api/...`.
Dari GitHub Pages itu berarti request mendarat ke
`https://adjietegaralamsyah312.github.io/api/...` → **404 di setiap panggilan**. Situs
terbit tapi seluruh aplikasinya mati — lebih buruk daripada deploy yang ditolak.

---

## 6. Langkah D — Verifikasi dari URL publik

Setelah variable diset dan workflow di-run ulang:

### 6.1 Cek dari terminal (tanpa browser)

```sh
# 1. Frontend Pages melayani HTML
curl -sI https://adjietegaralamsyah312.github.io/PlayRent/ | head -1

# 2. API hidup di origin tunnel
curl -s https://<host-tunnel>/api/health

# 3. CORS preflight dari origin Pages → header harus spesifik, BUKAN "*"
curl -i -X OPTIONS https://<host-tunnel>/api/auth/login \
  -H 'Origin: https://adjietegaralamsyah312.github.io' \
  -H 'Access-Control-Request-Method: POST' | grep -i 'access-control'
```

Yang diharapkan pada langkah 3:

```
Access-Control-Allow-Origin: https://adjietegaralamsyah312.github.io
Access-Control-Allow-Credentials: true
```

Kalau muncul `Access-Control-Allow-Origin: *`, allowlist CORS salah.

### 6.2 Cek dari browser (wajib)

1. Buka `https://adjietegaralamsyah312.github.io/PlayRent/`.
2. DevTools → **Network** → login.
   - `POST /api/auth/login` → **200**.
   - Header respons `Set-Cookie` memuat `pr_session=…; HttpOnly; SameSite=None; Secure; Path=/`.
3. Request berikutnya `GET /api/auth/me` → **200** (bukan 401). Kalau 401, cookie tidak
   terkirim → kembali ke [Batasan dukungan browser](#7-batasan-dukungan-browser-wajib-dibaca-operator).
4. DevTools → **Application** → **Cookies** → `pr_session` → atribut `SameSite=None`, `Secure`
   aktif, `HttpOnly` aktif.
5. Buka satu halaman berdata (mis. Dashboard) → data muncul, bukan spinner/error.

### 6.3 Cek bahwa bundle memakai origin yang benar

Workflow sudah memeriksanya otomatis (step **Verify API origin is inlined** — lihat
[5.2](#52-fail-fast-di-dalam-workflow)). Kalau Anda ingin memeriksanya sendiri:

```sh
# Di dalam runner / setelah clone repo, file hasil build:
grep -c "https://<host-tunnel>" web/dist/assets/*.js
```

Harus `>= 1`. Kalau `0`, variable belum ter-inline → ulangi [Langkah C](#5-langkah-c--repository-variable-github).

---

## 7. Batasan dukungan browser (wajib dibaca operator)

Bagian ini sengaja ditulis **jujur** dan **berdasarkan sumber**, bukan tebakan. Deploy ini
memakai **cookie lintas situs** (`SameSite=None; Secure`) — jadi seluruh perilaku browser di
bawah ini bergantung pada kebijakan cookie pihak ketiga yang **berbeda per browser**.

> **Penanda:** **[FAKTA]** = terdokumentasi di spesifikasi/dokumentasi vendor.
> **[PERKIRAAN]** = hasil penalaran yang **belum diuji di browser sungguhan** → wajib
> dibuktikan manual oleh operator.

### 7.1 Dukungan atribut `SameSite=None` + `Secure`

`SameSite=None` **tidak bisa dipakai tanpa `Secure`** — browser membuang cookie itu.

| Browser | Versi minimal (dukungan *atribut*) | Syarat tambahan |
| --- | --- | --- |
| Chrome | 80 | `Secure` wajib |
| Edge | 80 (Chromium; EdgeHTML **tidak** mendukung) | `Secure` wajib |
| Firefox | 96 | `Secure` wajib |
| Safari / WebKit | 13 | `Secure` wajib (WebKit menolak `SameSite=None` tanpa `Secure` sejak 13.1) |

**[FAKTA]** Versi di bawah angka tersebut **tidak** mendukung `SameSite=None` sama sekali →
cookie sesi tidak pernah dikirim → gejala khas: **login balas `200`, lalu semua request
`401`**.

> Angka versi di atas adalah **versi minimum dukungan atribut**, **bukan** jaminan cookie
> benar-benar terkirim. Pengiriman aktual ditentukan kebijakan cookie pihak ketiga tiap
> browser (lihat 7.2–7.4).

### 7.2 Chrome / Edge — **[FAKTA]**

- **Phase-out cookie pihak ketiga dibatalkan** (pengumuman April 2025, dikonfirmasi CMA
  2025). Cookie 3P **tidak** dihapus otomatis dan tidak ada prompt global baru.
- Cookie 3P **tetap tersedia** di browsing normal. Pengguna **bisa** mematikannya sendiri
  lewat **Settings → Privacy and security → Third-party cookies → Block third-party cookies**.
- **Chrome Incognito memblokir cookie pihak ketiga secara default.**
- Chrome 118+ bisa memunculkan peringatan di DevTools → Issues: *"Cookie sent in cross-site
  context will be blocked in future Chrome versions."*
- **Edge** = Chromium → mengikuti Chrome. *"Tracking Prevention: Balanced"* (default)
  membatasi tracker tertentu, **tidak** memblokir semua cookie 3P.

**Artinya:** di Chrome/Edge, login lintas situs **seharusnya** berhasil — **kecuali** pengguna
mematikan "Block third-party cookies", memakai Incognito, atau kebijakan perusahaan memaksa
setting itu. **[PERKIRAAN]** — wajib diuji.

### 7.3 Firefox — **[FAKTA] + [PERKIRAAN]**

- **Total Cookie Protection (TCP)** aktif default sejak **Firefox 102** (rollout global
  2022-06-14); **State Partitioning** default sejak **Firefox 103**.
- Firefox **tidak** memblokir cookie 3P secara blanket — ia **mempartisi** penyimpanan cookie
  berdasarkan situs top-level. Untuk aplikasi ini top-level site-nya `github.io`, jadi cookie
  `pr_session` dipartisi di bawah `github.io`.
- Pengecualian *"first-party isolation"* diberikan untuk provider login pihak ketiga
  (cookie storage bersama), diberikan setelah interaksi pengguna.

**Artinya:** login lintas situs di Firefox **secara teoritis berhasil** — partisi di-key oleh
top-level site `github.io` yang stabil untuk aplikasi ini. **[PERKIRAAN]** yang wajib diuji:
apakah partisi tetap stabil antara langkah "login" dan "reload" di browser yang sama.

> Catatan: Firefox bukan "mengizinkan" cookie 3P begitu saja — ia **mempartisi**. Kesimpulan
> praktisnya sama (login jalan), tapi alapannya berbeda.

### 7.4 Safari / WebKit — **[FAKTA], dan ini yang paling menentukan**

- Kebijakan default WebKit: pihak ketiga **tidak boleh menetapkan** cookie baru kecuali
  domain itu sudah punya cookie → cookie `pr_session` hasil login **tidak akan tersimpan**
  saat origin frontend ≠ origin API.
- **"Full Third-Party Cookie Blocking"** (Safari 13.1, 2020-03): ITP memblokir **semua**
  cookie pihak ketiga, **tanpa pengecualian**.
- Akses hanya bisa diberikan lewat **Storage Access API** — dan API itu **hanya bisa dipanggil
  dari iframe lintas situs**. Aplikasi ini adalah SPA **top-level** → **API itu tidak
  tersedia** untuk kasus ini.
- **"Cookie Blocking Latch Mode"**: begitu satu request diblokir, seluruh redirect-nya ikut
  diblokir.
- Mode privat Safari juga menerapkan ITP.

**Artinya:** di Safari, **login lintas situs diperkirakan GAGAL** — bukan "mungkin gagal".
Ini bukan salah konfigurasi server, dan tidak bisa diperbaiki dari sisi server.

> **Konsekuensi arsitektur:** **fallback same-origin ([bagian 8](#8-fallback-sajikan-spa-dari-origin-yang-sama))
> adalah jalur andal di Safari — bukan pelengkap.** Kalau audiens Anda banyak memakai Safari
> (iPhone/iPad/Mac), jangan mengandalkan Pages: sajikan SPA dari origin API
> yang sama. Cookie jadi first-party → `SameSite=Lax` cukup → semua browser bisa login.

### 7.5 Faktor lain yang memengaruhi

- **Mode privasi / incognito** — Chrome Incognito dan Safari Private memblokir cookie 3P.
- **Ekstensi pemblokir** (ad blocker, privacy guard) bisa memblokir `Set-Cookie`.
- **Kebijakan perusahaan / warnet sekolah-kantor** sering memaksa "block third-party cookies"
  (policy Edge/Chrome Enterprise `BlockThirdPartyCookies`).
- **WebView Android / in-app browser** sering memblokir cookie 3P — **[PERKIRAAN]**, relevan
  kalau aplikasi dibuka dari dalam app.
- Kebijakan cookie pihak ketiga **masih bisa berubah** tanpa pemberitahuan.

### 7.6 Build sukses ≠ login pasti berhasil

`workflow` hijau, situs terbit, API menjawab `200` — itu **tidak** membuktikan login jalan.
Yang dibuktikannya hanya: **konfigurasi server dan bundle sudah benar**. Yang belum terbukti:
**perilaku browser**. Karena itu langkah verifikasi browser ([6.2](#62-cek-dari-browser-wajib))
adalah **wajib**, bukan opsional.

Klaim yang **boleh** dibuat: *"konfigurasi benar dan terverifikasi; perilaku browser masih
harus dibuktikan manual."* Klaim yang **tidak boleh** dibuat: *"login lintas situs pasti
berhasil."*

### 7.7 Cara mendiagnosis cepat

1. DevTools → **Network** → filter `login` → **`POST /api/auth/login`**
   - Status harus **200**.
   - Header respons `Set-Cookie` harus memuat `SameSite=None`, `Secure`, `HttpOnly`.
   - Kalau `Set-Cookie` **tidak ada sama sekali** → cek `NODE_ENV=production` + `COOKIE_SECURE=true`
     di `server/.env`, lalu restart server.
   - Kalau `Set-Cookie` ada tapi `SameSite=Lax` → `COOKIE_SECURE` terbaca `false`, atau
     `COOKIE_SAME_SITE` salah ketik (nilai tak dikenal jatuh ke default).
2. DevTools → **Network** → **`GET /api/auth/me`**
   - Harus **200** (bukan 401). 401 = cookie tidak terkirim (diblokir browser) atau
     `TRUST_PROXY`/host tidak konsisten.
3. DevTools → **Application** → **Cookies** → **`pr_session`**
   - Harus ada, dengan atribut `SameSite=None`, `Secure`, `HttpOnly` aktif.
   - Kalau cookie **tidak ada** sama sekali setelah login sukses → browser memblokir
     cookie pihak ketiga. Di **Safari** ini **diharapkan terjadi** (lihat 7.4) → aktifkan
     [fallback same-origin](#8-fallback-sajikan-spa-dari-origin-yang-sama). Di Chrome/Firefox,
     periksa dulu: Incognito? "Block third-party cookies" aktif? Ekstensi pemblokir?
4. Console → kalau ada error CORS, `Access-Control-Allow-Origin` tidak muncul untuk origin
   Pages → `CORS_ORIGIN` tidak cocok (harus persis `https://adjietegaralamsyah312.github.io`,
   tanpa `/PlayRent`).

### 7.8 Fallback bila cookie pihak ketiga diblokir

Sajikan SPA **dari origin yang sama** dengan API. Server sudah siap: `server/src/app.js`
menyajikan `web/dist` + SPA fallback, jadi origin API bisa sekaligus jadi origin aplikasi.
Ini **bukan** sekadar pelengkap — di Safari inilah **satu-satunya** jalur yang bekerja
(lihat [7.4](#74-safari--webkit--fakta-dan-ini-yang-paling-menentukan)).
Detail lengkap di [bagian 8](#8-fallback-sajikan-spa-dari-origin-yang-sama).

---

## 8. Fallback: sajikan SPA dari origin yang sama

Kalau cookie pihak ketiga diblokir — dan di Safari itu **pasti** terjadi — pindahkan
**frontend** ke origin yang sama dengan **API**. Cookie jadi **first-party** →
`SameSite=Lax` sudah cukup → tidak ada lagi ketergantungan pada cookie pihak ketiga, dan
login **berhasil di semua browser**.

### 8.1 Build SPA untuk origin tunnel (wajib build ulang!)

Build di Termux dengan base path `/` (bukan `/PlayRent/`) dan **tanpa** `VITE_API_BASE_URL`
(agar path API tetap relatif):

```sh
cd web
npm run build          # = typecheck + vite build, base default "/"
cd ../server
npm start              # server menyajikan web/dist + SPA fallback
```

> **Wajib build ulang.** Bundle yang sudah ada di `web/dist` masih berisi origin API
> absolut (dari build Pages) atau base path `/PlayRent/`. Kalau tidak dibangun ulang:
> - aset dimuat dari path `/PlayRent/assets/...` → **404** (bundle itu untuk Pages), dan
> - request API masih menuju origin absolut → request **lintas situs** lagi, jadi cookie
>   3P tetap diblokir dan login tetap gagal.
>
> Vite hanya mengabadikan `VITE_*` yang ada **saat build**. Karena itu `VITE_API_BASE_URL`
> harus **kosong** untuk build fallback, dan hasilnya harus di-build ulang setiap kali Anda
> berpindah mode.

Hasilnya: aplikasi ada di `https://<host-tunnel>/`, API di `https://<host-tunnel>/api/...` —
**satu origin**.

### 8.2 Set cookie jadi first-party

Di `server/.env` ubah:

```env
COOKIE_SAME_SITE=lax
COOKIE_SECURE=true
```

Lalu restart server (`Ctrl-C`, `npm start` lagi). `SameSite=None` juga tetap valid di
same-origin, tapi `lax` lebih ketat dan cukup.

`CORS_ORIGIN` boleh tetap diisi origin Pages (dipakai kalau origin Pages masih dipakai),
dan CSRF guard otomatis menerima origin API sendiri — jadi request dari origin tunnel
tidak akan kena `403 CSRF_ORIGIN_MISMATCH`.

> **`TRUST_PROXY=1` tetap dipakai di mode fallback.** Tanpa itu `req.protocol` = `http`, jadi
> origin API sendiri yang dihitung CSRF guard menjadi `http://<host>` — sedangkan browser
> mengirim `Origin: https://<host>` → **semua request tulis kena
> `403 CSRF_ORIGIN_MISMATCH`** dan aplikasi tidak bisa dipakai sama sekali. Jangan mematikan
> `TRUST_PROXY` saat berpindah ke mode fallback; yang berubah hanya `COOKIE_SAME_SITE`.

### 8.3 Mengarahkan alamat publik ke origin tunnel

Beberapa pilihan, dari yang paling sederhana:

- **Pakai hostname tunnel langsung** sebagai alamat aplikasi: `https://<host-tunnel>/`.
  Tidak ada DNS tambahan, tidak ada Pages. Untuk named tunnel, hostname-nya milik Anda
  sendiri (mis. `https://app.domain-anda.com/`).
- **Hosting di subdomain sendiri** — arahkan DNS ke tunnel
  (`app.domain-anda.com` → tunnel), lalu buka aplikasi dari sana. Frontend dan API tetap
  satu origin.
- **GitHub Pages jadi "pintu masuk"** — Pages hanya berisi halaman pengalihan ke
  `https://<host-tunnel>/`. Setelah dialihkan, origin aktif browser adalah origin tunnel,
  sehingga cookie menjadi first-party. Cara ini butuh penyuntingan `index.html` hasil build
  Pages (di luar cakupan repo normal) — lakukan hanya bila benar-benar perlu.

> **Penting:** Pages dan `github.io` **tidak bisa** menjadi satu origin dengan tunnel
> (`github.io` bukan domain milik Anda). Selama frontend benar-benar disajikan dari
> `github.io` dan API dari domain tunnel, request-nya **selalu lintas situs** — dan itulah
> yang membuat Safari-prone. Mengarahkan Pages ke origin tunnel (opsi di atas) adalah cara
> memindahkannya ke same-origin.

---

## 9. Rollback

Kтами deploy produksi PlayRent **tidak menyentuh database**. Data ada di
`server/data/playrent.db` di Termux, dan tidak ada migrasi dalam jalur deploy ini.
Artinya rollback situs = mengembalikan **frontend**; data transaksi tetap utuh.

### 9.1 Rollback frontend ke build sebelumnya

Opsi paling andal: **deploy ulang commit lama**.

```sh
# Lihat riwayat commit
git log --oneline -10

# Opsi A — revert lalu push (membuat commit baru, riwayat tetap rapi)
git revert <sha-commit-rusak>
git push origin main
# → workflow jalan otomatis, build ulang dengan variable yang sama

# Opsi B — jalankan workflow pada SHA lama tanpa mengubah branch
gh workflow run deploy.yml --ref <sha-commit-sebelumnya>
```

> GitHub Pages **tidak** punya tombol rollback satu-klik untuk proyek Pages; revert + push
> (atau `gh workflow run --ref <sha>`) adalah cara yang bisa diulang dan deterministik.
> Riwayat deployment tetap bisa dilihat di **Settings → Pages → Deployments** sebagai
> rujukan versi mana yang dipakai.

### 9.2 Rollback repository variable

1. **Settings → Secrets and variables → Actions → Variables**.
2. Edit `VITE_API_BASE_URL` → kembalikan ke nilai lama (mis. hostname tunnel sebelumnya).
3. **Run workflow** ulang (push ke `main` atau tombol **Run workflow**).

### 9.3 Rollback backend (bila perlu)

- Hentikan server (`Ctrl-C`), ubah `server/.env` bila ada env yang perlu dikembalikan,
  jalankan `npm start` lagi.
- **Restart tunnel tidak menghapus data.** Tunnel hanya lapisan transport.
- **Jangan** menghapus `server/data/playrent.db` atau file `-wal`/`-shm` — itu menghapus
  data transaksi, bukan bagian dari rollback.

### 9.4 Urutan yang aman

1. Pastikan API masih hidup (`curl -s https://<host-tunnel>/api/health`).
2. Rollback variable kalau origin API berubah (mis. quick tunnel dapat URL baru).
3. Rollback frontend (revert + push).
4. Verifikasi login lagi di browser ([6.2](#62-cek-dari-browser-wajib)).

---

## 10. Ringkasan env yang dipakai

### 10.1 Backend — `server/.env` (dibaca saat runtime)

| Variabel | Nilai produksi | Default kode | Sumber |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `development` | `server/src/config.js` |
| `PORT` | `4000` | `4000` | `server/src/config.js` |
| `DB_PATH` | `./data/playrent.db` | `./data/playrent.db` | `server/src/config.js` |
| `SESSION_TTL_HOURS` | `12` | `12` | `server/src/config.js` |
| `CORS_ORIGIN` | `https://adjietegaralamsyah312.github.io` | prod: `https://adjietegaralamsyah312.github.io`<br>dev: `http://localhost:5173,http://127.0.0.1:5173` | `server/src/config.js` (`corsOrigins()`) |
| `COOKIE_SAME_SITE` | `none` | prod: `none`, selain itu `lax` | `server/src/config.js` (`cookieSameSite()`) |
| `COOKIE_SECURE` | `true` | ikut `NODE_ENV` | `server/src/config.js` (`cookieSecure()`) |
| `TRUST_PROXY` | `1` (jumlah hop) | `0` (tidak dipercaya) | `server/src/config.js` (`trustProxy()`) |
| `HOST` | `127.0.0.1` | kosong → bind semua interface (`0.0.0.0`) | `server/src/config.js` (`host()`) |

> `HOST` mengikat server ke satu alamat saja. Kosong = `0.0.0.0` = **terjangkau dari LAN**.
> Di produksi (API hanya lewat Cloudflare Tunnel di mesin yang sama) pakai `127.0.0.1`, supaya
> tidak ada klien LAN yang bisa menjangkau port `4000` langsung dan memalsukan
> `X-Forwarded-For` saat `TRUST_PROXY=1`. Konsekuensinya: fitur "buka API dari HP di Wi-Fi"
> **mati** — memang itu yang diinginkan di mode tunnel. Detail di
> [3.1](#31-buat-serverenv).

> `TRUST_PROXY` **bukan boolean** — isinya **jumlah hop** yang dipercaya: `1` = satu proxy
> tepercaya (Cloudflare Tunnel), `2` = dua proxy (nginx + cloudflared). Nilai boolean `true`
> **tidak boleh dipakai**: Cloudflare *menambah* `X-Forwarded-For`, jadi trust-all memakai
> entri paling kiri yang bisa dipalsukan penyerang → rate-limit login/register bisa
> dilewati. Detail di [3.2](#32-trust_proxy--jumlah-hop-yang-dipercaya-bukan-boolean).

### 10.2 Frontend — repository variable GitHub

| Variabel | Nilai | Sumber |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://<host-tunnel>` (tanpa trailing slash, tanpa `/api`) | `web/src/lib/api.ts` → `import.meta.env.VITE_API_BASE_URL` |

> Kalau `VITE_API_BASE_URL` kosong → path `/api/...` relatif → dipakai untuk **proxy dev Vite**
> saja. Di produksi itu berarti request mendarat ke domain `github.io` dan **404**.

---

## 11. Checklist operator

| # | Langkah | Lokasi | Selesai |
| --- | --- | --- | --- |
| 1 | `server/.env` dibuat & diisi sesuai bagian 3.1 (termasuk `TRUST_PROXY=1` **dan** `HOST=127.0.0.1`) | Termux | ☐ |
| 2 | `npm start` **dari folder `server/`** → log memuat `env=production`, `trustProxy=1`, `host=127.0.0.1` | Termux | ☐ |
| 3 | `curl http://127.0.0.1:4000/api/health` → JSON | Termux | ☐ |
| 4 | Probe `TRUST_PROXY` → `401` (bukan `403`), artinya proxy dipercaya | Terminal | ☐ |
| 5 | Tunnel jalan, URL/hostname tunnel dicatat | Termux | ☐ |
| 6 | Repository variable `VITE_API_BASE_URL` dibuat (tab **Variables**) | GitHub | ☐ |
| 7 | Workflow di-run ulang (push / Run workflow) | GitHub | ☐ |
| 8 | Step **Check VITE_API_BASE_URL** hijau di log workflow | GitHub | ☐ |
| 9 | Step **Verify API origin is inlined** hijau di log workflow | GitHub | ☐ |
| 10 | CORS preflight mengembalikan origin spesifik (bukan `*`) | Terminal | ☐ |
| 11 | Login `POST /api/auth/login` → 200 + `Set-Cookie` `SameSite=None; Secure; HttpOnly` | Browser | ☐ |
| 12 | `GET /api/auth/me` → 200 (bukan 401) | Browser | ☐ |
| 13 | Halaman berdata (Dashboard) terisi | Browser | ☐ |
| 14 | Diuji juga di **browser lain** (Chrome & Safari). Kalau Safari gagal → aktifkan fallback same-origin (bagian 8) | Browser | ☐ |

Semua langkah di atas **wajib dikerjakan manual oleh operator** — sebagian ada di luar repo
(membuat variable GitHub, menulis `.env` di Termux, menjalankan tunnel).

> Langkah 14 penting: cookie lintas situs **berbeda aturan per browser**, dan di Safari
> login lintas situs diperkirakan **gagal**. Uji minimal di satu browser non-Safari
> (Chrome/Firefox) **dan** satu Safari, supaya Anda tahu sejak awal apakah fallback
> same-origin perlu diaktifkan.

---

## Lampiran — Ringkasan troubleshooting

| Gejala | Penyebab | Solusi |
| --- | --- | --- |
| Workflow gagal: "VITE_API_BASE_URL repository variable is not set" | Variable belum dibuat / dibuat di tab *Secrets* | Buat di tab **Variables**, lalu run ulang workflow. |
| Workflow gagal: "VITE_API_BASE_URL was not inlined into the bundle" | Origin API tidak masuk ke bundle saat build | Build ulang (`vars.VITE_API_BASE_URL` ter-set, `web/src/lib/api.ts` masih memakai `import.meta.env`), lalu run ulang workflow. |
| Semua request kena `https://adjietegaralamsyah312.github.io/api/...` → 404 | Variable kosong saat build (bundle relatif) | Set variable, run ulang workflow. |
| Login `200` lalu semua request `401` | Cookie `Secure` dibuang (HTTP) atau `SameSite` salah | `NODE_ENV=production`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none`; restart server. |
| Cookie `pr_session` tidak ada di browser | Cookie pihak ketiga diblokir browser (di Safari: **pasti** diblokir) | Pakai fallback same-origin (bagian 8) + build ulang `web/dist` tanpa `VITE_API_BASE_URL`. |
| Error CORS di console | `CORS_ORIGIN` tidak cocok dengan origin yang dibuka | Set persis `https://adjietegaralamsyah312.github.io` (tanpa `/PlayRent`). |
| `403 CSRF_ORIGIN_MISMATCH` (semua request tulis gagal) | Origin request tidak ada di allowlist **atau** `TRUST_PROXY` mati sehingga `req.protocol` = `http` | Tambahkan origin ke `CORS_ORIGIN` (comma-separated); pastikan `TRUST_PROXY=1` (probe di 3.2 → harus `401`). |
| Rate limit login memicu untuk semua orang | `TRUST_PROXY` tidak di-set (semua klien satu bucket) | Set `TRUST_PROXY=1`, restart server, ulangi probe. |
| Rate limit login tidak pernah memicu | `TRUST_PROXY` trusts semua hop (entri XFF paling kiri = kiriman penyerang) | Set `TRUST_PROXY=1` (jumlah hop), **bukan** nilai boolean `true`. |
| `trustProxy=false` di log | Dua sebab: `.env` tidak terbaca (cwd salah) **atau** nilai env salah ketik / tidak diaktifkan | Lihat tabel [Dua sebab `trustProxy=false`](#dua-sebab-trustproxyfalse-gejala-sama): cek baris `PERINGATAN` di log untuk memisahkan keduanya. |
| HP di Wi-Fi tidak bisa buka `http://<IP-KBOX>:4000` | `HOST=127.0.0.1` → server hanya bind loopback | Itu **memang** yang diinginkan di mode produksi tunnel (API diakses lewat `https://<host-tunnel>`). Kalau memang butuh akses LAN, kosongkan `HOST` — dan sadari `X-Forwarded-For` jadi bisa dipalsukan dari LAN selama `TRUST_PROXY=1`. |
| Tunnel mati setelah restart Termux | Quick tunnel dapat URL baru | Update `VITE_API_BASE_URL`, run ulang workflow. |

Lihat juga bagian **Troubleshooting** di `README.md` untuk masalah lokal/dev.
