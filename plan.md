Perbaiki deployment PlayRent dengan persyaratan berikut:

- Frontend harus tetap dipublikasikan melalui GitHub Pages.
- Backend Node.js dan database tetap berjalan di Termux.
- Jangan menggunakan localhost:5173 sebagai alamat website publik.
- Backend akan diakses melalui HTTPS Cloudflare Tunnel.

Implementasi:

1. Tambahkan konfigurasi "VITE_API_BASE_URL" pada "web/src/lib/api.ts". Ketika nilainya tersedia, semua permintaan "/api/..." harus dikirim ke origin API tersebut. Ketika kosong, pertahankan perilaku proxy lokal untuk pengembangan.
2. Perbarui workflow GitHub Actions agar menggunakan repository variable "VITE_API_BASE_URL" saat build frontend.
3. Tetapkan origin frontend produksi untuk CORS dan CSRF menjadi "https://adjietegaralamsyah312.github.io", tanpa path "/PlayRent".
4. Pertahankan autentikasi cookie "httpOnly". Tambahkan konfigurasi cookie yang dapat diatur dari environment, termasuk "SameSite=None" dan "Secure=true" untuk skenario lintas situs HTTPS. Jangan menonaktifkan CSRF dan jangan mengekspos token sesi.
5. Audit dukungan browser terhadap cookie lintas situs. Laporkan batasan yang masih ada dan jangan menyatakan login pasti berhasil hanya karena build sukses.
6. Periksa semua endpoint login, logout, "/api/auth/me", dan registrasi jika ada. Tambahkan atau perbarui tes yang sesuai.
7. Jalankan typecheck, tes backend, dan build frontend.
8. Jangan mereset database, mengganti password pengguna, atau menghapus data.

Setelah perubahan, berikan langkah pengaturan repository variable dan cara memastikan login berfungsi dari alamat GitHub Pages publik.	
