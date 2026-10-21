# Kontrak Deploy Lintas-Situs — PlayRent (Pages + Cloudflare Tunnel)

> Kontrak bersama untuk BE-001 (@node-developer), FE-001 (@frontend-react), DO-001 (@devops),
> RV-001 (@reviewer). Semua agent **wajib membaca file ini** dan tidak boleh
> meminta Leader meneruskan isi file.

## 0. Konteks

| Item                | Nilai                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Frontend (public)   | GitHub Pages — `https://adjietegaralamsyah312.github.io/PlayRent/`     |
| Origin frontend     | `https://adjietegaralamsyah312.github.io` (**tanpa** path `/PlayRent`) |
| Backend (API)       | Cloudflare Tunnel → `https://<tunnel-host>` → `http://127.0.0.1:4000`  |
| Database            | SQLite di Termux (`server/data/playrent.db`) — tidak diubah           |
| Loopback             | `localhost:5173` **dilarang** jadi alamat publik                     |

Origin = scheme + host (+ port). Path `/PlayRent` bukan bagian dari origin.

## 1. Variabel environment (nama final — jangan diubah)

### 1.1 Frontend (baked saat build Vite, prefix `VITE_`)

| Variabel          | Nilai                                                             | Arti                                                     |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `VITE_API_BASE_URL` | `https://<tunnel-host>` (tanpa trailing slash, **tanpa** `/api`) | Origin API. Kosong/tidak diset → proxy lokal dev (`/api/...` relatif) |

### 1.2 Backend (dibaca saat runtime, `server/.env`)

| Variabel            | Default                                                       | Arti                                                        |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `NODE_ENV`          | `development`                                                | `production` → Secure cookie + SameSite default `none`      |
| `CORS_ORIGIN`       | prod: `https://adjietegaralamsyah312.github.io`<br>dev: `http://localhost:5173,http://127.0.0.1:5173` | Allowlist origin, **comma-separated** |
| `COOKIE_SAME_SITE`  | prod: `none`<br>dev: `lax`                                   | `lax` \| `strict` \| `none`                                 |
| `COOKIE_SECURE`     | ikut `NODE_ENV` (prod → `true`)                              | `true` \| `false` \| kosong                                 |
| `TRUST_PROXY`       | `false`                                                      | **Hop count** (angka), bukan boolean — Cloudflare *menambah* XFF, jadi `true` (trust-all) bikin IP kiriman penyerang dipakai → rate-limit bisa dilewati. Behind Cloudflare Tunnel: `1` |
| `PORT`, `DB_PATH`, `SESSION_TTL_HOURS` | seperti sekarang | Tidak berubah                                              |
| `HOST`               | kosong (bind semua interface)                                | Opsional: `127.0.0.1` → API hanya bisa diakses lokal (aman di belakang tunnel, karena klien LAN tak bisa menyamar sebagai proxy) |

## 2. Aturan cookie sesi (`pr_session`)

- `HttpOnly` — **selalu** `true`. Token sesi tidak pernah keluar di JSON.
- `path=/` — tetap.
- `Secure` — dari `COOKIE_SECURE` (default mengikuti `NODE_ENV`).
- `SameSite` — dari `COOKIE_SAME_SITE`.
- **Invarian:** `SameSite=None` **wajib** berpasangan dengan `Secure=true`. Bila `Secure=false`
  eksplisit → turunkan `SameSite` ke `lax` (browser akan membuang cookie `None` tanpa `Secure`).
- `clearCookie` **wajib** memakai atribut identik dengan `setCookie`, kalau tidak cookie lama tidak terhapus.
- Header `Set-Cookie` **tidak boleh** memuat nilai `Domain` yang perlu dikonfigurasi (host-only sudah cukup).

## 3. Aturan CORS + CSRF

- CORS: `credentials: true`, allowlist dari `CORS_ORIGIN`, **dilarang** `*`.
  `Access-Control-Allow-Origin` harus mengembalikan origin yang cocok, bukan `*`.
- CSRF (`csrfGuard`): origin yang diizinkan = allowlist CORS **+** origin API sendiri
  (`${req.protocol}://${req.get('host')}`).
  `https://adjietegaralamsyah312.github.io` **wajib** diterima (tanpa path).
  Origin asing pada request tulis → `403 CSRF_ORIGIN_MISMATCH` (tidak boleh dihapus/disable).
- **Hardening tambahan (wajib):** bila request tulis datang **tanpa** header `Origin`,
  periksa `Sec-Fetch-Site`. Nilai `cross-site` → `403` (browser selalu mengirim header ini;
  request tanpa `Origin` + `Sec-Fetch-Site: cross-site` =Upcoming browser menulis lintas situs).
  `same-origin` / `same-site` / header tidak ada → izinkan (klien non-browser).

## 4. Perilaku frontend

- Semua request `/api/...` (termasuk pembentuk URL receipt & export CSV) memakai
  `VITE_API_BASE_URL` bila ada; bila kosong → path relatif (proxy dev Vite).
- `credentials: 'include'` tetap di setiap request.
- Build produksi: `VITE_API_BASE_URL` diisi dari **repository variable** GitHub
  (`vars.VITE_API_BASE_URL`), bukan secret.

## 5. Batasan yang harus dilaporkan jujur

Cookie lintas situs (`SameSite=None; Secure`) **hanya** dikirim bila browser mengizinkan
cookie pihak ketiga. Known limits: Safari ITP (memblokir cookie 3P di banyak konteks),
mode privasi/ekstensi browser, dan kebijakan cookie pihak ketiga yang sedang berubah di
Chrome. **Build sukses ≠ login pasti berhasil.** Wajib ada langkah verifikasi manual
dari URL publik + catatan fallback (sajikan SPA dari origin yang sama lewat tunnel,
sehingga cookie jadi first-party dan `SameSite=Lax` cukup).

## 6. Larangan

- Dilarang reset database, mengubah password pengguna, atau menghapus data.
- Dilarang menonaktifkan CSRF atau mengekspos token sesi ke klien.
- Dilarang memakai `localhost:5173` sebagai alamat publik.
- Dilarang menyentuh file di luar scope tiap agent (lihat kontrak delegasi).
