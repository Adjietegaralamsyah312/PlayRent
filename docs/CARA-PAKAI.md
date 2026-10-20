# Cara Pakai PlayRent — Panduan Super Admin

Panduan singkat untuk Super Admin (operator). Sekitar 5 menit baca. Tidak perlu paham teknis.

**Buka aplikasi:** `http://localhost:5173` (atau alamat yang diberikan pemilik usaha).
**Masuk:** username dan kata sandi Super Admin Anda. Tidak ada kata sandi bawaan — akun
pertama dibuat pemilik usaha lewat perintah `npm run admin:bootstrap`. Kalau lupa, lihat
bagian **Kalau lupa password Super Admin** di bawah.

---

## Dua jenis akun

| Peran | Siapa | Hak akses |
| --- | --- | --- |
| **Super Admin** | Pemilik/operator usaha | Akses penuh: sesi, unit, booking, transaksi, laporan, pengaturan, pengguna. |
| **Pelanggan** | Orang yang menyewa unit | Daftar sendiri di `/daftar`, lalu hanya melihat dan mengelola miliknya sendiri. |

Semua pekerjaan operasional — mulai sesi, terima bayaran, check-in booking — dilakukan
Super Admin. Pelanggan tidak bisa menyentuh menu operator.

---

## Hal yang perlu diingat

- **Timer tidak pernah meleset walau halaman di-refresh** — waktu dihitung dari waktu selesai
  yang tersimpan, bukan dari jam di layar. Aman kalau HP mati layar atau pindah aplikasi.
- Semua tombol penting menampilkan **konfirmasi** sebelum menyimpan. Baca dulu, baru tekan.
- Angka rupiah dan kembalian dihitung **oleh sistem**, bukan oleh Anda.

---

## 1. Memulai sesi rental

1. Dari **Dashboard**, buka menu **Konsol** (daftar unit yang disewakan).
2. Cari unit yang **tersedia** (berwarna hijau / status "Tersedia"), lalu tekan **Mulai sesi**
   pada unit itu.
3. Isi **nama pelanggan** dan pilih **durasi** (paket, atau durasi khusus dalam menit).
4. Sistem menampilkan **tarif dan estimasi biaya** — periksa dulu.
5. Tekan **Mulai sesi**. Unit berubah menjadi **Sedang Bermain** dan hitung mundur berjalan.

> Unit yang sedang dipakai atau sudah dipesan **tidak bisa** dimulai lagi. Kalau tombol
> Mulai sesi ditolak, unit itu memang sedang terpakai.

## 2. Memperpanjang waktu

1. Buka **detail sesi** unit tersebut (di menu **Sesi**, ketuk baris/kartu unit yang sedang
   berjalan).
2. Tekan **Perpanjang**, masukkan tambahan menit (mis. 30 menit).
3. Konfirmasi. Waktu selesai bergeser maju, dan perpanjangan tercatat di riwayat.

> Lakukan sebelum waktu habis bila pelanggan minta tambah. Tambahan tetap dihitung dengan tarif
> yang sama seperti saat sesi dimulai.

## 3. Menyelesaikan sesi dan menerima bayaran

1. Di detail sesi, tekan **Selesaikan**.
2. Pilih **metode pembayaran**: **Tunai**, **Transfer Bank**, atau **QRIS**.
3. Kalau tunai, masukkan **jumlah uang yang diterima**.
4. Sistem menampilkan **total tagihan** dan, untuk tunai, **kembalian**.

   *Contoh: total Rp 25.000, uang diterima Rp 50.000 → kembalian Rp 25.000.*
5. Selesaikan transaksi. Unit kembali menjadi **Tersedia**.
6. Buka menu **Transaksi**, lalu tekan **Cetak struk** pada transaksi tadi.

> Kalau uang kurang dari total, sistem menolak. Pastikan jumlahnya cukup.

## 4. Menangani booking (pelanggan yang memesan lebih dulu)

1. Buka menu **Booking**.
2. Saat pelanggan datang, cari booking-nya (biasanya berdasarkan tanggal/nama).
3. Tekan **Check-in** untuk mengubah booking menjadi sesi rental.
4. Lanjutkan seperti memulai sesi biasa (durasi bisa disesuaikan saat check-in).

> **Booking bentrok akan ditolak.** Kalau Anda mencoba membuat booking di unit dan jam yang
> sudah dipesan, muncul pesan konflik jadwal. Pilih jam atau unit lain.

> Booking juga bisa dibuat manual dari menu **Booking** (**Booking baru**) kalau pelanggan
> memesan langsung di tempat.

## 5. Kalau waktu sudah lewat (overdue)

Kalau pelanggan melewati waktu selesai:

1. Sesi otomatis ditandai **Lewat Waktu** (overdue) di daftar/dashboard.
2. Buka detail sesi. Sistem menghitung **biaya overtime** sesuai kebijakan usaha.
3. Saat pelanggan selesai, tekan **Selesaikan** seperti biasa — overtime sudah termasuk di
   total yang dihitung sistem.
4. Kalau pelanggan minta tambahan waktu dari posisi lewat waktu, gunakan **Perpanjang** dulu,
   lalu selesaikan bila benar-benar selesai.

> Jangan menutup sesi diam-diam tanpa menagih. Semua tagihan dihitung server, jadi angka tetap
> benar walaupun Anda selesaikan terlambat.

---

## 6. Pelanggan mendaftar sendiri

Anda **tidak perlu** membuat akun untuk setiap pelanggan — mereka mendaftar sendiri:

1. Pelanggan membuka halaman `/daftar` (publik, tanpa perlu login).
2. Mengisi **nama pengguna**, **nama lengkap**, **nomor HP** (opsional, tapi berguna untuk
   menghubungi), dan **kata sandi** minimal 8 karakter.
3. Akun **langsung aktif** — tanpa persetujuan admin, tanpa verifikasi.
4. Pelanggan login di `/masuk` dengan nama pengguna dan sandi miliknya.
5. Pelanggan membuat **booking** sendiri lewat menu **Booking Saya**, lalu menunggu Anda
   melakukan **check-in** (bagian 4).
6. Sesi berjalan seperti biasa; tagihan tetap dihitung sistem.

> Nama pengguna tidak bisa diubah sendiri. Kalau pelanggan salah ketik, dia daftar ulang di
> `/daftar` dengan nama pengguna lain.

## 7. Mengelola akun (menu Pengguna)

Menu **Pengguna** berisi seluruh akun Super Admin dan pelanggan.

- **Tambah akun** — tekan **Tambah pengguna**, isi **Username**, **Nama lengkap**, dan
  **Sandi awal**, pilih **Peran**, tandai **Akun aktif**, lalu simpan.
- **Peran** hanya dua: **Super Admin** (akses penuh) atau **Pelanggan** (hanya miliknya).
  Pelanggan yang daftar sendiri juga muncul di sini, jadi Anda bisa melihat dan
  menonaktifkan akunnya.
- **Atur ulang sandi** — tekan **Atur ulang sandi** pada baris pengguna.
- **Nonaktifkan** — menonaktifkan akun tanpa menghapus riwayat transaksinya. Super Admin
  aktif terakhir tidak bisa dinonaktifkan, supaya aplikasi tidak terkunci tanpa operator.

> Menu **Pengguna** hanya muncul bila Anda login sebagai Super Admin.

## 8. Kalau lupa password Super Admin

Reset kata sandi **tidak bisa lewat browser**. Harus dari terminal pemilik usaha (Termux),
dari folder `server/`:

```sh
cd server
npm run admin:bootstrap -- --force
```

- Perintah ini **mengatur ulang sandi Super Admin yang sudah ada** — tidak membuat akun
  ganda. Ikuti prompt: username (tekan Enter untuk memakai yang ada) dan sandi baru
  (minimal 8 karakter).
- Akun jadi aktif lagi dan semua sesi lama akun tersebut dihentikan.
- Sesudah itu, login lagi di `/masuk` dengan sandi baru.

> Ini perintah **pemilik/operator** yang punya akses ke server — bukan fitur pelanggan, dan
> tidak ada versi lewat browser. Jangan bagikan terminalnya ke siapa pun.

## 9. Backup database

- **Backup:** dari folder `server/`, jalankan `npm run backup`. Hasilnya
  `server/data/backups/playrent-YYYYMMDD-HHMMSS-mmm-xxxxxx.db`. Server **tidak** melakukan backup
  otomatis — jalankan berkala (misalnya tiap malam sebelum tutup) supaya selalu ada salinan
  terbaru. Snapshot yang gagal validasi otomatis dihapus, jadi file yang tersimpan aman dipakai.
- **Restore:** **hentikan server dulu** (Ctrl-C di terminal yang menjalankan `npm start`),
  lalu jalankan `npm run restore -- ./data/backups/playrent-20261019-222330-481-3f9c2a.db` dan ketik
  persis `RESTORE` saat diminta. Database aktif diganti utuh, dan snapshot lama disimpan
  otomatis sebagai `pre-restore-...db`.

> Restore tanpa menghentikan server bisa menulis ke file database yang sudah tidak aktif.
> **Hentikan server-nya dulu.**

---

## Menu Super Admin vs Pelanggan

| Layar | Super Admin | Pelanggan |
| --- | --- | --- |
| Navigasi | Dashboard, Sesi, Konsol, Booking, Transaksi, Laporan, Game, Pengaturan, Pengguna | Beranda, Booking Saya, Info Rental, Profil |

Menu operator **hanya muncul untuk Super Admin**. Kalau Anda tidak melihat **Pengguna**
atau **Pengaturan**, berarti Anda login sebagai akun pelanggan — logout dan login dengan
akun Super Admin.

---

## Kalau ada masalah

| Masalah | Yang dilakukan |
| --- | --- |
| Tidak bisa login | Pastikan username & kata sandi benar; setelah 5 kali gagal salah, tunggu 15 menit. |
| Lupa sandi Super Admin | Reset dari terminal: `npm run admin:bootstrap -- --force` (bagian 8). |
| Terlempar ke halaman login | Sesi kedaluwarsa. Login lagi — data tidak hilang. |
| Tombol Mulai sesi ditolak | Unit sedang dipakai/dipesan orang lain. Pilih unit lain. |
| Pelanggan belum bisa booking | Pelanggan harus daftar dulu di `/daftar`, lalu login, lalu membuat booking di **Booking Saya**. |
| Sudah tekan Selesai tapi ragu | Cek menu **Transaksi**; transaksi yang sudah jadi ada di sana. |
| Data tidak sengaja terhapus | Restore dari file backup — bagian 9 (hentikan server dulu). |
| Ada yang aneh / error | Catat unit & waktu kejadiannya, lalu lapor ke pemilik usaha. |
