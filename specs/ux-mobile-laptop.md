# DS-008 — Audit & Redesign UX: HP (kasir) & Laptop (admin)

> **Status:** Phase 1 (DESIGN). Dokumen ini adalah kontrak implementasi untuk `@frontend-react`.
> **Metode:** inspeksi statis `web/src/**` + `DESIGN.md` + `specs/*.md`. **Tidak ada browser / headless di lingkungan ini** → tidak ada yang diklaim "sudah terlihat".
> **Ruang lingkup:** perbaikan & penajaman pengalaman yang sudah ada. **Tidak menambah fitur, tidak mengubah token, tidak mengubah peta status §7, tidak mengubah kontrak API.**
> **Status verifikasi visual:** `not_verified` — lihat §9.

---

## 1. Dua persona, dua perangkat, dua tekanan

| | **Kasir** | **Admin / Owner** |
| --- | --- | --- |
| Perangkat | HP Android, 360–430 px | Laptop 1280–1440 px |
| Postur | berdiri, satu tangan, pelanggan menunggu | duduk, membandingkan angka |
| Layar kunci | Sesi, Konsol, Booking, Transaksi | Dashboard, Laporan, Transaksi, Pengguna, Pengaturan |
| Perilaku | satu tangan, suara, cahaya terang | mouse, tabular, ekspor CSV |
| Titik gagal | satu ketuk salah = pelanggan pergi / unit salah dipakai | angka tidak terbaca / tabel tidak bisa dibandingkan |

Konsekuensi utama: **bukan satu layout yang di-zoom.** HP dan laptop adalah dua permukaan yang berbeda. Yang sama di keduanya: token, peta status, dan bahasa.

---

## 2. Ringkasan temuan

**12 temuan teratas** (maksimal sesuai kontrak): **P0 = 6 · P1 = 5 · P2 = 1**.

| # | Sev | Temuan | Lokasi utama |
| --- | --- | --- | --- |
| F01 | **P0** | `StickyActionBar` tidak ada tombol simpan di laptop; di HP ia menutupi ~36 px konten | `components/AppShell.tsx:276` · `pages/Settings.tsx:318,323` |
| F02 | **P0** | Aksi `PageHeader` meluber keluar layar 360 px (TransactionDetail: 5 aksi ≈ 540 px) | `components/AppShell.tsx:245` · `pages/TransactionDetail.tsx:79-103` |
| F03 | **P0** | Bottom nav HP menyembunyikan **Booking** di balik "Lainnya" | `components/AppShell.tsx:30` |
| F04 | **P0** | Tombol **"Mulai Sesi" mati** di layar "Mulai sesi" (tidak ada handler) | `components/ConsoleCard.tsx:78-82` · `pages/SessionStart.tsx:145-153` |
| F05 | **P0** | `Pagination` numbered meluber di 360 px; mode `load-more` sudah ada tapi mati | `components/Pagination.tsx:21,40-84` · `pages/Sessions.tsx:217` · `pages/Transactions.tsx:200` |
| F06 | **P0** | Kartu `DataTable` HP: kontrol interaktif bersarang + nama aksesibel selalu "Buka detail" | `components/DataTable.tsx:231-244,260-262` · 4 halaman |
| F07 | **P1** | Hierarki kartu HP salah: unit = teks terlemah, aksi di header, nominal di baris ke-4 | `components/DataTable.tsx:246-275` · `pages/Bookings.tsx:179-188` |
| F08 | **P1** | Target sentuh HP di bawah 44 px: field 40 px, tab 31 px, pil tanggal 38 px | `components/Form.tsx:11` · `components/Tabs.tsx:55` · `components/DateRangePicker.tsx:75` |
| F09 | **P1** | "Cetak struk" di daftar Transaksi gagal **senyap** bila popup diblokir | `pages/Transactions.tsx:183` · `lib/receipt.ts:10-14` |
| F10 | **P1** | Batas lebar konten 1280 px di `DESIGN.md` §6 **tidak diimplementasikan** | `components/AppShell.tsx:128` |
| F11 | **P1** | `DataTable.stickyHeader` tidak pernah dipakai; sticky header tidak akan bekerja | `components/DataTable.tsx:34,74,134` |
| F12 | **P2** | Dashboard: 5 kartu metrik bertepi (larangan §11 #4), chart 50/50 (§8 bilang 2/3–1/3), strip "Segera berakhir" di urutan ke-4 di HP | `pages/Dashboard.tsx:131-156,158-202,208` |

---

## 3. Tiga keputusan

### (a) Timeline di HP → **TETAP disembunyikan di bawah 768 px**

**Alasan (satu kalimat):** di 360 px timeline tidak menyusut — ia tetap 896 px dan menjadi kanvas yang digeser horizontal, sehingga kasir bisa salah baca unit terpesan sebagai kosong; jadi yang diganti adalah **unit mana** yang jadi informasi utama, bukan bentuknya.

Rinciannya:

- Yang **benar** dari spec lama: timeline memang tidak bisa dipakai di 360 px. Yang **kurang tepat** adalah alasannya. `specs/bookings.md` §6 menulis *"not shrunk — a 30-min block is unreadable at 360"*. Kenyataannya `BookingTimeline.tsx:67` memaksa `min-w-[896px]` di dalam wadah `overflow-x-auto`, jadi blok **tidak pernah menyusut** — blok 30 menit tetap ~28 px. Yang terjadi di HP adalah: kanvas 896 px yang harus digeser, dengan kolom kode unit sticky 88 px yang memakan 27 % dari 328 px viewport, dan hanya 2,7 dari 16 jam yang terlihat sekaligus. Salah baca di sana = **memulai sesi pada unit yang sudah dipesan** → revenue hilang + pelanggan kecewa.
- Yang **menggantikan** (bukan fitur baru — re-prioritaskan data yang sudah ada): di kartu booking versi HP, **kode konsol naik ke slot kanan-atas kartu** (dengan ikon `Gamepad2`), dan **badge status turun ke dalam daftar**. Detail + kode ada di spec F07.
- Ditambah satu kalimat penjelas di bawah daftar HP: *"Jadwal harian per unit tersedia di layar ≥ 768 px."* —(copy, bukan fitur).
- **Divergensi dari spec lama:** aturan `specs/bookings.md` §6 (*"Timeline: hidden @360"*) **tetap berlaku**. Yang dikoreksi hanya **alasannya**; rationale baru ada di file ini §3(a). `specs/bookings.md` tidak diubah oleh DS-008.

### (b) Target sentuh blok timeline → **Tetap dikecualikan, konsekuensinya ditulis eksplisit**

**Alasan (satu kalimat):** lebar blok adalah *datanya* — memaksanya 44 px akan membuat booking 30 menit tampak seperti 47 menit, dan itu lebih berbahaya daripada target yang kecil.

- Lebar blok = durasi / 960 menit × 896 px. 30 menit = 28 px. Memaksa 44 px = 47 menit → **durasi palsu di papan booking**.
- Lantai `minWidth: 24px` (`BookingTimeline.tsx:133`) hanya menyalakan booking **lebih pendek dari ~26 menit**; booking 30 menit sudah dirender pada lebar sebenarnya. Menaikkan lantai ke 28 px justru **mendistorsi** booking pendek → **lantai 24 px tetap**.
- Yang **kurang** dari catatan pengecualian lama: ia tidak menyebut asumsi modalitas input. Di 768–1023 px perangkatnya bisa berupa tablet (jari), di ≥1024 laptop (mouse).
- **Konsekuensi yang diterima:** di 768–1023 px, booking berdurasi ≤ 30 menit adalah target kecil untuk jari; jalur jari yang andal di ukuran itu adalah tampilan **Daftar** (bukan Jadwal). Disengaja dan didokumentasikan.
- **Mitigasi tanpa fitur baru:** `aria-label` + `title` pada blok sudah membawa waktu nyata (*"Booking Budi, PS5-01, 14.00 sampai 16.00, Dikonfirmasi"*) — pertahankan; tinggi blok 44 px (`h-11`) tetap.

→ Catatan `DESIGN.md` §6 (paragraf terakhir) ditulis ulang sesuai keputusan ini.

### (c) Densitas laptop → **Pertahankan plafon 1280 px, isi dengan kerapatan, bukan lebar**

**Alasan (satu kalimat):** di 1440 px konten terpakai sudah 1152 px sehingga tidak ada ruang kosong terbuang — ruang kosong baru muncul di atas ±1568 px, jadi yang harus diperbaiki adalah *kerapatan*, bukan lebar.

- Perhitungan: sidebar 240 px + gutter 48 px → konten = `viewport − 288`. Pada **1440 px → 1152 px** (< 1280, **tidak ada ruang terbuang**). Pada **1280 px → 992 px**. Plafon 1280 baru mengikat pada viewport ≈ **1568 px** ke atas (monitor 1920 → konten 1632 px, melar tanpa kendali).
- **Plafon 1280 px tidak diimplementasikan** sama sekali (`AppShell.tsx:128` — tidak ada `max-w` di mana pun) → **F10**.
- **Yang mengisi ruang di 1440/1920 = kerapatan, bukan lebar:**
  1. `DataTable` mendapat header lengket + panel tabel berbatas tinggi → admin membandingkan 20+ baris tanpa kehilangan kepala kolom (**F11**).
  2. Dashboard: 5 kartu metrik bertepi → 1 strip metrik 5 sel; chart 50/50 → 2/3–1/3 sesuai §8 (**F12**).
  3. Laporan: ringkasan 6 metrik → 1 strip 6 sel di ≥1280 (bukan 3×2).
- **Tidak** menaikkan plafon ke 1536/1600 px: yang bermasalah bukan lebar, tapi **kemampuan membandingkan**.

---

## 4. Audit per layar — HP (360 / 390 / 430 px)

| Layar | Apa yang pertama dilihat | Aksi utama di jangkauan ibu jari? | Target sentuh nyata | Terbaca 2 detik? | Tumpang tindih / terpotong | State (loading/empty/error) |
| --- | --- | --- | --- | --- | --- | --- |
| **Login** | Logo + kata "Masuk" | ✅ tombol "Masuk" 48 px, di tengah layar | Field 40 px ❌ (F08); tombol 48 ✅ | — | Tidak | Error inline ✅ |
| **Dashboard** | Greeting + 2 tombol header | ❌ tombol header di **atas**; "Segera berakhir" di urutan ke-4 | 40 px input / 32 px `Button sm` ❌ | Strip unit ✅; "Hari ini" 3 kartu ❌ (F12) | **Aksi header meluber** (F02) | Loading → skeleton blok ✅; error → EmptyState ✅; "Aktivitas terbaru" error = teks polos ❌ |
| **Sesi (board)** | Header + 4 tab status + kolom cari | ❌ aksi baris ada di **kartu atas** | Icon 44 ✅; `Button sm` 32 visual + hit 44 ✅ | Timer "Berakhir" tenggelam di baris 3 ❌ | Judul kartu terpotong cluster aksi ❌ (F07) | Skeleton kartu ✅; **board tidak polling** (hanya Dashboard) → timer bisa basi |
| **Sesi (detail)** | Kode konsol + status + tombol | ❌ "Perpanjang/Selesaikan" di header atas | 40 px | Timer besar ✅ | Aksi header pas-pasan meluber (F02) | Skeleton ✅; error EmptyState ✅ |
| **Konsol** | Tab status + grid kartu 1 kolom | ✅ tombol di dalam kartu | 32 visual + hit 44 | Kartu konsol ✅ (**tapi** "Mulai Sesi" mati — F04) | — | Grid skeleton ✅; error EmptyState ✅ |
| **Booking (+ timeline)** | Strip tanggal + 6 tab status | ⚠️ aksi baris di atas kartu; timeline **tidak ada** | 40 px | Kode konsol = teks terlemah ❌ (F07) | — | Banner kedaluwarsa ✅ (ada tombol "Tampilkan") |
| **Transaksi (+ detail)** | Kartu rentang tanggal | ❌ total di baris ke-4 kartu ❌ (F07) | 40 px | Nomor mono + 4 baris dl → lambat ❌ | **Aksi header meluber** (F02) | Error alert di DataTable ✅; "Cetak struk" gagal senyap ❌ (F09) |
| **Struk** | Iframe 80 dvh | ⚠️ "Cetak" di header | 40 px | — | Iframe `h-[80dvh]` + bar scroll | loading 15 s → error ✅ |
| **Laporan** | Kartu rentang + ringkasan + 5 tab | ❌ semua filter di atas daftar | 40 px | 6 metrik 2 kolom → nominal panjang mepet ❌ | — | Ringkasan error → EmptyState ✅ |
| **Pengaturan** | 6 tab | ✅ StickyActionBar (tapi menutup konten — F01) | 40 px | — | **Tidak ada tombol simpan di laptop** (F01) | Skeleton ✅; error EmptyState ✅ |
| **Pengguna** | 2 filter + tabel | ❌ aksi baris di atas kartu | 40 px | Nama + username + peran + status ✅ | — | Kosong → EmptyState + "Tambah pengguna" ✅ |
| **Game** | 2 filter + tabel | ❌ aksi baris di atas kartu | 40 px | Judul + platform + genre + status ✅ | — | Kosong → EmptyState ✅ |

### 4.1 Temuan lintas-layar HP (berulang, bukan per-layar)

1. **Aksi utama sering tidak di jangkauan ibu jari.** Berulang: header (atas), kartu baris (atas), stack filter (atas). Yang benar: `ConsoleCard` (tombol di dalam kartu), `StickyActionBar`, chip durasi, "Tampilkan" di banner.
2. **`dvh` + `safe-bottom` dipakai benar untuk chrome, salah untuk konten.** `AppShell.tsx:88` `min-h-dvh` ✅; `AppShell.tsx:133` `paddingBottom: var(--spacing-safe-bottom)` ✅; `AppShell.tsx:276` bar di `bottom-[calc(3.5rem+safe)]` — tapi nav sebenarnya 60 px, bukan 56 px (F01).
3. **Halaman "kosong" tanpa jalan keluar.** Kasir yang membuka Transaksi kosong tidak punya jalan selain "coba rentang lain" — tidak ada "Mulai sesi" di sana. *Rekomendasi terpisah (§8), bukan temuan.*

---

## 5. Audit per layar — Laptop (1280 / 1440 px)

| Layar | Kepadatan informasi | Sidebar | Header tabel lengket | Gulir horizontal? | Pemakaian 1280 px |
| --- | --- | --- | --- | --- | --- |
| **Login** | N/A — `max-w-sm` ✅ | N/A | N/A | Tidak | ✅ |
| **Dashboard** | ⚠️ 5 kartu metrik bertepi + strip unit + 2 chart 50/50 → **lebih banyak kartu daripada angka** (F12) | Daftar link + user di bawah | N/A | Tidak | ⚠️ chart 50/50, bukan 2/3–1/3 (§8) |
| **Sesi (board)** | ✅ 20 baris, kolom `.tnum` rata kanan | ⚠️ **hanya daftar link**; user blok dobel (sidebar + topbar) | ❌ tak pernah dipakai (F11) | Tidak | ⚠️ konten 992 px @1280 / 1152 px @1440 |
| **Sesi (detail)** | ✅ 2 kolom `lg:grid-cols-2` | idem | N/A | Tidak | ✅ |
| **Konsol** | ✅ grid 3 kolom | idem | ❌ (F11) | Tidak | ✅ |
| **Booking (+ timeline)** | ✅ timeline 08.00–24.00 muat; toggle Jadwal/Daftar tersedia | idem | N/A | **Ya** di 768–1023 (track 896 px) | ✅ |
| **Transaksi** | ✅ strip 4 metrik + tabel | idem | ❌ (F11) | Tidak | ✅ |
| **Laporan** | ⚠️ ringkasan 3×2 + chart penuh + tabel; **chart & tabel memblokir satu sama lain** — tabel 30 baris berada ±1800 px dari atas | idem | ❌ (F11) | Tidak | ⚠️ 6 metrik occupy 2 baris; tabel 1 kolom penuh |
| **Pengaturan** | ✅ 6 tab; **tetapi tidak ada tombol simpan** (F01) | idem | N/A | Tidak | — |
| **Pengguna** | ✅ 5 kolom | idem | ❌ (F11) | Tidak | ✅ |
| **Game** | ✅ 6 kolom | idem | ❌ (F11) | Tidak | ✅ |

### 5.1 Sidebar: informatif atau daftar link?

**Hari ini: daftar link + blok user di bawah.** 240 px yang selalu terlihat membawa 9 tautan dan satu blok identitas — **nol informasi operasional**. Ini *konsisten* dengan produk (sidebar = navigasi, bukan dashboard), jadi saya **tidak** mengusulkan panel status di sidebar: itu fitur baru.

Yang **justru** perlu diperbaiki (dan bukan fitur):
- **Identitas user tampil dua kali** di ≥1024: `AppShell.tsx:96` (sidebar bawah) dan `AppShell.tsx:123` (topbar kanan) → sisakan di sidebar.
- **Topbar 56 px di semua ukuran** (spec §6 menulis 64 px @≥1024 dan menyebut breadcrumb + search; keduanya tidak ada) → §6 dikoreksi ke kondisi nyata.
- Yang **tidak** dikoreksi: sidebar tidak di-collapse ke rail 64 px. Merebut 240 px di 1280 berarti konten 992 px; rail 64 px akan mengembalikan 176 px (≈18 %) untuk tabel — nyata, tapi **bukan temuan** (mengubah navigasi = perubahan produk). Lihat §8.

---

## 6. Spesifikasi implementasi

> Format: **dari → menjadi**, dengan breakpoint, komponen, kelas/token, dan state yang berubah.
> Tidak ada token baru. Tidak ada perubahan API. Tidak ada perubahan `DESIGN.md` §2/§7.

### F01 · P0 — `StickyActionBar`: tidak bisa menyimpan di laptop, dan menutupi konten di HP

**Bukti:** `web/src/components/AppShell.tsx:276` — `fixed inset-x-0 bottom-[calc(3.5rem+var(--spacing-safe-bottom))] … sm:hidden`.
`web/src/pages/Settings.tsx:318` — `<StickyActionBar visible={dirty}>`; satu-satunya tombol "Simpan perubahan" ada di `Settings.tsx:323`, **di dalam bar tersebut** → di ≥640 px bar itu tidak ada → **admin laptop tidak bisa menyimpan pengaturan sama sekali**.
Dimensi: bar = `py-3` (24) + `Button size="lg"` (48) = **72 px**; nav bawah = `py-2` (16) + ikon 24 + `gap-0.5` 2 + label 18 = **60 px**; `main` menyisakan `pb-24` = 96 px → 60 + 72 = **132 px** chrome tetap vs 96 px disisakan → **~36 px konten tertutup** (di `SessionStart` baris "Total" kartu Ringkasan) dan bar menindih nav bawah 4 px.

**Spesifikasi:**

1. `AppShell.tsx` — `StickyActionBar` **dari** satu elemen `sm:hidden` **menjadi** dua render (satu komponen, dua tata letak, `children` sama):
   - `< 1024` (HP & tablet): `fixed inset-x-0 bottom-[3.75rem+var(--spacing-safe-bottom)] z-[var(--z-sticky)] border-t border-border bg-sidebar px-4 py-3 lg:hidden` — **offset `3.5rem` → `3.75rem`** (nav = 60 px, bukan 56 px).
   - `≥ 1024` (laptop): `sticky bottom-0 z-[var(--z-sticky)] hidden border-t border-border bg-sidebar px-6 py-2.5 lg:flex lg:items-center lg:justify-end lg:gap-2` — **di dalam flow `main`**, jadi tidak pernah menutupi konten dan selalu di jangkauan mouse.
2. `Settings.tsx:318` — **tetap** `<StickyActionBar visible={dirty}>`. Karena bar kini punya varian ≥1024, tombol "Simpan perubahan" **muncul di laptop** (sebelumnya tidak ada sama sekali).
3. `SessionStart.tsx:260` — **dari** bar + tombol duplikat di header (`SessionStart.tsx:122`, `hidden sm:inline-flex`) **menjadi** **satu** permukaan aksi: hapus `actions` dari `PageHeader` di `SessionStart`, andalkan bar (HP: fixed di atas nav; laptop: sticky di bawah konten). Tombol tetap `Mulai sesi · Rp 25.000` dengan `loadingText="Memulai…"`.
4. Spacer alur: tambahkan `<div className="h-[4.5rem] lg:hidden" aria-hidden="true" />` tepat sebelum bar di `SessionStart.tsx` (72 px) supaya isi terakhir tidak tertutup di <1024. Di `Settings.tsx:192` **hapus** `pb-24` pada wrapper (duplikat `pb-24` milik `main`) dan pakai spacer yang sama.
5. State yang berubah: `visible={dirty}` kini juga berlaku di ≥1024 → admin laptop melihat "Ada perubahan yang belum disimpan." + Batalkan/Simpan selama form dirty.

**Hasil akhir:** admin di 1280 px punya tombol Simpan yang selalu terlihat; di 360 px tidak ada isi yang tertutup nav maupun bar.

---

### F02 · P0 — `PageHeader`: aksi meluber di 360 px

**Bukti:** `web/src/components/AppShell.tsx:245` — `<div className="flex shrink-0 items-center gap-2">{actions}</div>` — satu baris, **tanpa wrap**, `shrink-0`.
`web/src/pages/TransactionDetail.tsx:79-103` — 5 aksi (2 badge + "Cetak struk" + "Halaman struk" + "Batalkan") ≈ **540 px** vs 328 px tersedia → **halaman menggulir horizontal di HP**; "Cetak struk" dan "Batalkan" jatuh di luar layar.
`web/src/pages/SessionDetail.tsx:95-111` — 3 aksi ≈ 314 px → judul "Konsol PS5-01" terpotong jadi ~2 px.
`web/src/pages/Dashboard.tsx:98-111` — 2 aksi ≈ 250 px → greeting terpotong jadi "Selamat…".

**Spesifikasi:**

1. `AppShell.tsx` `PageHeader` — **dari** `flex items-start gap-3` + baris aksi terpisah **menjadi** dua baris pada <640:

   ```tsx
   <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
     <div className="flex min-w-0 flex-1 items-start gap-3">{/* back + title */}</div>
     {actions && (
       <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
     )}
   </div>
   ```

   → di <640 aksi turun ke baris penuh sendiri; judul tidak pernah diremas jadi 0. `PageSection` (`AppShell.tsx:262`) memakai pola yang sama → ubah juga ke `flex-col` + `flex-wrap` di <640.
2. **Batasi aksi di header HP menjadi 1** (aksi utama layar). Sisanya pindah ke isi halaman:
   - `TransactionDetail.tsx:79-103` → header HP: **hanya** "Cetak struk" (primary). "Halaman struk" → `Button variant="link"` di dalam kartu "Pembayaran" (`TransactionDetail.tsx:173-196`). "Batalkan" → `Button variant="danger"` di kartu "Pembayaran" (hanya saat `tx.status === 'completed'`), berdampingan dengan `StatusBadge`.
   - `SessionDetail.tsx:95-111` → header HP: **hanya** "Selesaikan" (primary). "Perpanjang" → `Button variant="secondary"` di dalam kartu timer (`SessionDetail.tsx:114-131`), tepat di bawah angka sisa waktu.
   - `Dashboard.tsx:98-111` → header HP: tanpa aksi. Dua tombol turun menjadi **baris 2-up** tepat di bawah header: `<div className="grid grid-cols-2 gap-2 sm:hidden">` → "Mulai sesi" (primary) + "Booking baru" (secondary), keduanya `size="lg"` (48 px) → dalam jangkauan ibu jari.
   - Di ≥640 seluruh aksi tetap di header seperti sekarang.
3. State yang berubah: `actions` tetap opsional; tidak ada perubahan state di halaman mana pun.

**Hasil akhir:** tidak ada halaman yang menggulir horizontal di 360/390/430 px; judul selalu terbaca penuh; aksi utama berada ≤ 200 px dari atas dan setinggi 48 px.

---

### F03 · P0 — Bottom nav HP menyembunyikan Booking

**Bukti:** `web/src/components/AppShell.tsx:30` — `const MOBILE_PRIMARY = ['/dashboard', '/sesi', '/unit', '/transaksi'];` — statis, tidak sadar peran. **Booking** (tugas kasir tercepat: check-in pelanggan yang sudah memesan) jatuh ke sheet "Lainnya" → 2 ketuk ekstra + satu sheet per dokumen. `Login.tsx:13-15` `homeFor(role)` sudah mengarahkan kasir ke `/sesi` → **Dashboard adalah bobot mati** di bottom nav kasir.

**Spesifikasi:**

1. `AppShell.tsx:30` — **dari** satu array statis **menjadi** dua set berbasis peran:

   ```ts
   const MOBILE_PRIMARY_ADMIN   = ['/dashboard', '/sesi', '/unit', '/transaksi'];
   const MOBILE_PRIMARY_CASHIER = ['/sesi', '/unit', '/booking', '/transaksi'];
   ```

   `AppShell.tsx:79-80` memilih set berdasarkan `user?.role` (fallback ke set admin).
2. Jumlah item tetap **4 + "Lainnya" = 5** → sesuai `DESIGN.md` §6 "5 items max" (tidak diubah).
3. Label tab bawah: "Sesi", "Konsol", "Booking", "Transaksi", "Lainnya" — panjang maksimum "Transaksi" ≈ 58 px pada 12 px, muat di 72 px/item pada 360 px ✅.
4. **Tinggi nav bawah: 56 px → 60 px.** Nyatakan di `DESIGN.md` §6 (baris Navigation) sebagai **60 px**; baris `py-2` tidak diubah (itulah yang menghasilkan 60 px). Konsisten dengan offset bar F01 (`3.75rem`).
5. Set kasir tidak memuat `/dashboard` → Dashboard pindah ke sheet "Lainnya" (layar owner).

**Hasil akhir:** kasir mencapai **Check-in booking dalam satu ketuk**, bukan lewat sheet.

---

### F04 · P0 — Tombol "Mulai Sesi" mati di layar "Mulai sesi"

**Bukti:** `web/src/components/ConsoleCard.tsx:78-82` — tombol dirender kapan pun `status === 'available'`, dengan `onClick={() => onStart?.(unit.id)}` → **no-op** bila `onStart` undefined. `ConsoleCard.tsx:77` membungkus baris aksi dengan `onClick={(e) => e.stopPropagation()}` → ketukan **ditelan**, kartu pun tidak terselect.
`web/src/pages/SessionStart.tsx:145-153` meneruskan `variant="compact"`, `selected`, `onOpenDetail` — **tanpa `onStart`** → di layar "Mulai sesi" **setiap** konsol menampilkan tombol "Mulai Sesi" yang **tidak melakukan apa pun**. Ini layar yang paling sering dipakai kasir, dan tombol yang paling inviting untuk diketuk.

**Spesifikasi:**

1. `ConsoleCard.tsx:78` — **dari** `status === 'available' && …` **menjadi** `status === 'available' && onStart && ( … )` → tombol hanya ada kalau ada handler.
2. `ConsoleCard.tsx:77` — `stopPropagation` pada baris aksi tetap (perlu, agar tombol Edit/Perpanjang tidak memicu select kartu).
3. `SessionStart.tsx:145-153` — kartu tetap `role="button"` + `onOpenDetail` = **satu-satunya** target (seluruh kartu bisa diketuk); state terpilih sudah ada (`selected` → `border-border-strong ring-1`) ✅.
4. `Units.tsx:235` — `onStart` tetap diteruskan (di sana tombolnya hidup dan berguna) ✅.
5. Efek samping yang diinginkan: kartu `variant="compact"` di `SessionStart` **tidak lagi** memuat kontrol native di dalam `role="button"` → ikut menutup sebagian masalah **nested-interactive** (F06) di layar itu.

**Hasil akhir:** tidak ada lagi tombol mati di layar kasir utama; mengetuk kartu = memilih konsol.

---

### F05 · P0 — `Pagination` meluber di 360 px

**Bukti:** `web/src/components/Pagination.tsx:38-84` — mode `numbered`: nav luar `flex flex-wrap` ✅, tetapi **baris kontrol dalam** `flex items-center gap-1` (`:40`) **tanpa wrap** → 5 tombol halaman `size-11` (220 px) + "Sebelumnya" (~96) + "Berikutnya" (~88) + gap ≈ **448 px** vs 328 px tersedia → **gulir horizontal halaman**. Dipakai di `pages/Sessions.tsx:217` dan `pages/Transactions.tsx:200` (keduanya tanpa prop `mode`).
Mode `load-more` sudah ada (`Pagination.tsx:21-32`) tapi **tidak pernah dipakai** — dan ia **tidak bisa** dipakai tanpa mengubah akumulasi list (API mengembalikan satu halaman).

**Spesifikasi:**

1. `Pagination.tsx` — **dari** strip 5 nomor **menjadi** dua tata letak, tanpa mengubah API:
   - `< 640`: satu baris — `IconButton` "Halaman sebelumnya" (44×44) · `2 / 5` (`tnum`, `text-body`, `aria-label="Halaman 2 dari 5"`) · `IconButton` "Halaman berikutnya" (44×44); baris summary "Menampilkan 21–40 dari 118" di atas. Total ≈ 44 + 8 + 56 + 8 + 44 = **160 px** ✅.
   - `≥ 640`: strip nomor penuh **seperti sekarang** (5 angka + Sebelumnya/Berikutnya) ✅.
   - Implementasi: pakai `window.matchMedia('(min-width: 640px)')` — **pola `useIsWide` sudah ada** di `components/Chart.tsx:39-49`; tidak menambah dependensi. (PWy: boleh diekstrak ke `lib/useMediaQuery.ts` dan dipakai juga di `Bookings.tsx:48` — opsional, bukan syarat.)
2. `Pagination.tsx:11` — prop `mode` **tetap** (`'numbered' | 'load-more'`) agar pemanggil lain tidak rusak; `load-more` **tetap tidak dipakai** — lihat §8.
3. `Pagination.tsx:21-32` — blok `load-more` adalah **kode mati** (tidak ada pemanggil) → **hapus**. Bila pemanggil muncul nanti, implementasinya butuh akumulasi list di halaman pemanggil, bukan di komponen ini.
4. `Pagination.tsx:44-52` "Per halaman" (`onLimitChange`) tidak dipakai pemanggil mana pun → **biarkan** (tidak merusak apa pun).

**Hasil akhir:** navigasi halaman muat di 360 px tanpa scroll horizontal; tetap satu ketuk per halaman.

---

### F06 · P0 — Kartu `DataTable` HP: kontrol bersarang + nama aksesibel yang salah

**Bukti:** `web/src/components/DataTable.tsx:231-244` — kartu HP adalah `role="button"` + `tabIndex={0}` dengan `aria-label={rowLabel ? rowLabel(row) : 'Buka detail'}` (`:234`); `:260-262` merender `rowActions(row)` **di dalam** kartu itu.
→ (a) `role="button"` yang memuat `<button>` asli = **axe `nested-interactive`**, pelanggaran WCAG 2.1 AA **4.1.2**; (b) ketika `rowLabel` tidak dioper, **nama aksesibel kartu persis string "Buka detail"** — pembaca layar mengulang "Buka detail" 20× tanpa tahu sesi mana.
Halaman tanpa `rowLabel`: `pages/Sessions.tsx:164` (Sesi), `pages/Units.tsx:191` (Konsol), `pages/Users.tsx:169` (Pengguna), `pages/Games.tsx:159` (Game). Yang **sudah benar**: `pages/Bookings.tsx:284` (`rowLabel={b.customerName}`), `pages/Transactions.tsx:162` (`rowLabel="Transaksi {number}"`).

**Spesifikasi:**

1. `DataTable.tsx:224-244` — kartu HP **dari** elemen interaktif `role="button"` **menjadi** `<div>` biasa (tanpa `role`, tanpa `tabIndex`, tanpa `aria-label`).
2. `DataTable.tsx` — kolom `primary` **menjadi** satu-satunya kontrol "buka detail": bungkus render-nya dalam `<button type="button" onClick={() => onRowClick?.(row)} className="text-left font-semibold text-text">`. Bila `onRowClick` tidak ada, kolom primary tetap teks biasa.
3. `DataTable.tsx` — `Column` gaining **satu** properti opsional: `text?: (row: T) => string` (teks polos untuk nama aksesibel). Nama aksesibel tombol = `rowLabel?.(row) ?? primaryCol.text?.(row) ?? 'Buka detail'`.
   - `pages/Sessions.tsx:95-106` → `text: (s) => \`Sesi ${s.consoleCode ?? ''} — ${s.customerName}\``
   - `pages/Units.tsx:145` → `text: (u) => \`Konsol ${u.code}\``
   - `pages/Users.tsx:125` → `text: (u) => \`Pengguna ${u.fullName}\``
   - `pages/Games.tsx:99` → `text: (g) => \`Game ${g.title}\``
4. `DataTable.tsx:150-171` (baris desktop) — **dari** `role="row"` + `aria-label="Buka detail"` **menjadi**: `role="row"` dihapus (`<tr>` sudah row), `aria-label` diganti nama identitas yang sama seperti kartu, `tabIndex` + `onKeyDown` dipertahankan untuk aktivasi keyboard.
5. `DataTable.tsx:260-262` — cluster aksi **tetap** di dalam kartu, tetapi kini **bukan** anak dari elemen ber-peran-button → tidak ada lagi kontrol bersarang.

**Hasil akhir:** tidak ada `nested-interactive` di 4 tabel; setiap kartu/baris mengumumkan identitasnya ("Sesi PS5-01 — Budi") bukan "Buka detail".

---

### F07 · P1 — Hierarki kartu HP salah: unit, aksi, dan nominal

**Bukti (3 cacat pada kartu HP `DataTable`):**
1. `DataTable.tsx:246-263` — **aksinya** (Perpanjang/Selesaikan/Check-in) dirender di **header kartu**, berdampingan dengan judul. `DataTable.tsx:258` memberi judul `truncate` → nama pelanggan terpotong hanya untuk memberi ruang ke tombol.
2. `DataTable.tsx:264-275` — semua kolom lain jadi baris `dl`, jadi **nominal "Total" adalah baris ke-4** pada kartu Transaksi — bukan sesuatu yang terbaca dalam 2 detik.
3. `pages/Bookings.tsx:179-188` — **kode konsol** ada di dalam sel primary sebagai sub-teks `text-caption text-text-muted` (12 px, muted) → di kartu, **unit adalah teks terlemah**, padahal pertanyaan kasir adalah "konsol mana?".

Ini sekaligus adalah **pengganti timeline di HP** (keputusan (a)): kalau unit tidak terbaca di HP, "kapan unit berikutnya booked" memang mustahil dijawab.

**Spesifikasi:**

1. `DataTable.tsx` — `Column` gaining **satu** properti opsional kedua: `prominentOnMobile?: boolean` → kolom itu dirender di **slot kanan-atas kartu** (bukan di `dl`).
2. `DataTable.tsx:246-263` — **dari** "judul + aksi di header" **menjadi** "judul (kiri) + nilai menonjol (kanan)"; cluster aksi **turun ke footer kartu** (DESIGN.md §6 sudah memandangnya: *"the row's actions become the card's footer"* — kode belum melakukannya):

   ```tsx
   <div className="rounded-[var(--radius-lg)] border bg-surface p-4">
     <div className="flex items-start justify-between gap-3">
       {/* primary: tombol "buka detail" (F06) */}
       {/* kolom prominentOnMobile: nilai kanan, .tnum, rata kanan */}
     </div>
     <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">{/* ≤3 baris */}</dl>
     <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">{rowActions}</div>
   </div>
   ```

3. `DataTable.tsx:69-71` — `cardCols` **dari** semua kolom mobile **menjadi** `mobileColumns` dikurangi primary dan prominent, **di-slice 3**. Baris sisanya disembunyikan di HP (bukan ditumpuk) → kartu jadi ringkas.
4. Nilai menonjol: `text-h2 font-bold tnum text-text` (Transaksi: nominal) / `text-h2 font-bold tnum text-cyan` (Sesi: timer "Berakhir", pakai komponen `Timer size="md"`). Warna mengikuti token status yang sudah ada (`text-cyan` = live signal, `text-text` = netral) — **tanpa token baru**.
5. Pemakaian per halaman:
   - `pages/Transactions.tsx:112` → `{ key: 'total', header: 'Total', numeric: true, prominentOnMobile: true }` → nominal jadi judul kanan kartu, `dl` menyisakan "Pelanggan", "Metode", "Pembayaran".
   - `pages/Sessions.tsx:112-116` → kolom "Berakhir" jadi `prominentOnMobile` → timer jadi nilai kanan kartu, bukan baris `dl` ketiga.
   - `pages/Bookings.tsx:177-197` → **kode konsol jadi kolom tersendiri** `prominentOnMobile` (dengan ikon `Gamepad2 size-4`), dipindah keluar dari sel primary; badge status turun menjadi baris `dl` "Status". Sel primary menjadi nama pelanggan saja.
6. `pages/Bookings.tsx` — di bawah daftar (HP) tambahkan satu baris penjelas: `<p className="mt-2 text-caption text-text-muted">Jadwal harian per unit tersedia di layar ≥ 768 px.</p>` (copy, bukan fitur).

**Hasil akhir:** kartu HP terbaca dalam 2 detik (pelanggan → nominal/timer → status), aksi berada di zona ibu jari (bawah kartu), dan unit terbaca sekelas nama pelanggan.

---

### F08 · P1 — Target sentuh HP di bawah 44 px

**Bukti:** `web/src/components/Form.tsx:11` — `md: 'h-10 text-body'` = **40 px**; `Input`/`Select`/`Textarea` semuanya default `size="md"` → **semua field form di HP 40 px**, padahal `DESIGN.md` §10.5 dan §6 menyatakan "every interactive target is ≥ 44 × 44 px".
`web/src/components/Tabs.tsx:55` — `px-3 py-2` ≈ **31 px** (tab status Sesi/Booking/Reports).
`web/src/components/DateRangePicker.tsx:75` — `px-3 py-1.5` ≈ **38 px** (pil preset rentang).
Yang **sudah benar**: `Button sm` punya hit-area 44 px lewat `before:-inset-y-1.5` (`Button.tsx:20,23`), `IconButton` 44 px (`Button.tsx:82`), `Pagination` tombol nomor `size-11` (`Pagination.tsx:69`).

**Spesifikasi:**

1. `Form.tsx:9-13` `FIELD_SIZE` — **dari** `sm: 'h-8 …'`, `md: 'h-10 …'`, `lg: 'h-12 …'` **menjadi**:
   ```ts
   sm: 'h-9 text-body-sm',
   md: 'h-11 text-body lg:h-10',
   lg: 'h-12 text-body-lg',
   ```
   → 44 px di HP, 40 px di ≥640 (di sana pointer = mouse), 48 px untuk `lg`. `Input`, `Select`, `Textarea` mengikuti otomatis.
2. `Tabs.tsx:55` — tambahkan `min-h-11` pada tombol tab (→ 44 px) tanpa mengubah padding; strip tab tetap `overflow-x-auto`.
3. `DateRangePicker.tsx:75` — pil preset **dari** `px-3 py-1.5` **menjadi** `px-3.5 min-h-11` (→ 44 px).
4. Token: **tidak ada token baru** — semua memakai skala `--spacing` dan `--text-*` yang sudah ada.

**Hasil akhir:** setiap field, tab, dan pil preset di HP menjadi target 44 px, sesuai `DESIGN.md` §10.5.

---

### F09 · P1 — "Cetak struk" gagal senyap di daftar Transaksi

**Bukti:** `web/src/pages/Transactions.tsx:183` — `onClick={() => openReceipt(t.id, true)}` — **nilai balik dibuang**. `web/src/lib/receipt.ts:10-14` — `openReceipt` mengembalikan `{ ok: win !== null, url }`; `ok === false` berarti **popup diblokir peramban** (sangat umum di Android Chrome). Di `components/session-dialogs.tsx:291-295` pola yang benar sudah dipakai (`if (!res.ok) toastError('Popup diblokir peramban. …')`), tapi tidak di halaman Transaksi → kasir menekan "Cetak struk", **tidak terjadi apa-apa, tanpa pesan**.

**Spesifikasi:**

1. `pages/Transactions.tsx:177-195` — **dari** `onClick={() => openReceipt(t.id, true)}` **menjadi** handler yang memeriksa hasil:
   ```tsx
   onClick={() => {
     const res = openReceipt(t.id, true);
     if (!res.ok) toastError('Popup diblokir peramban. Izinkan popup lalu coba lagi.');
   }}
   ```
   `useToast` sudah di-import di halaman itu (`Transactions.tsx:19`) ✅.
2. Pola identik dipakai di `pages/TransactionDetail.tsx:86` (tombol "Cetak struk" di header) — cek hasilnya dan toast bila gagal.
3. `pages/Receipt.tsx:62-65` ("Buka tab baru") memakai `window.open` langsung — biarkan (tombol tersebut memang berniat membuka tab; bila diblokir, halaman sudah menampilkan iframe sebagai gantinya).
4. **Fallback yang lebih baik (opsional, tanpa API baru):** bila popup diblokir, arahkan kasir ke `/transaksi/:id/struk` (halaman struk internal yang sudah ada, `App.tsx:88`) alih-alih hanya toast. Implementasikan sebagai `navigate('/transaksi/' + t.id + '/struk')` bila `!res.ok` — **pilih satu**, jangan dua-duanya.

**Hasil akhir:** kasir selalu tahu struk tercetak atau tidak, dan punya jalan keluar.

---

### F10 · P1 — Batas lebar konten 1280 px tidak diimplementasikan

**Bukti:** `web/src/components/AppShell.tsx:128` — `<main className="min-w-0 flex-1 px-4 py-5 pb-24 lg:px-6 lg:pb-8">`. `grep` terhadap seluruh `web/src` → **tidak ada satu pun** `max-w-[1280px]` / `mx-auto` pada container konten. `DESIGN.md` §6 menyatakan *"Content max width `1280px`. On ≥ 1280 the sidebar is fixed and the content region centres in the remaining space."* → **spec tidak terpenuhi**. Pada monitor 1920 px konten menjadi 1920 − 240 − 48 = **1632 px**, dan tabel mata pemindai kehilangan baris.

**Spesifikasi:**

1. `AppShell.tsx:128` — **dari** `<main className="…">` **menjadi** dua lapis:

   ```tsx
   <main className="min-w-0 flex-1 px-4 py-5 pb-24 lg:px-6 lg:pb-8">
     <div className="mx-auto w-full max-w-[1280px]">{children}</div>
   </main>
   ```

   → konten terpusat dan dibatasi 1280 px; di 1280/1440 px **tidak ada perubahan visual** (konten masing-masing 992/1152 px < 1280); di ≥1568 px tabel berhenti melar.
2. Nilai `1280px` **bukan token baru** — itu angka yang sudah tertulis di `DESIGN.md` §6. Jangan tambahkan `--content-max` ke `@theme` (YAGNI: satu nilai, satu tempat).
3. `AppShell.tsx:90` sidebar `w-60` (240 px) **tetap** — keputusan (c): janganainties; ruang 240 px dibayar dengan kerapatan (F11, F12), bukan dengan lebar.

**Hasil akhir:** tabel berhenti melar di monitor besar; di 1440 px tidak ada ruang terbuang dan tidak ada yang berubah.

---

### F11 · P1 — `stickyHeader` tidak pernah dipakai, dan sticky header tidak akan bekerja

**Bukti:** `web/src/components/DataTable.tsx:34` mendeklarasikan `stickyHeader?: boolean`; **tidak ada halaman yang mengopernya** (`grep` → 0 call site). `DESIGN.md` §6: *"≥ 1024 (desktop) → full table, sticky header"*.
Hambatan teknis yang tidak terlihat dari kode: `DataTable.tsx:134` membungkus tabel dalam `overflow-x-auto`. CSS menyebabkan `overflow-y` ikut menjadi `auto` → wadah itu menjadi **scroll container**, dan `position: sticky` pada `thead` menempel ke scrollport wadah, bukan ke viewport. Karena wadah tidak punya scroll vertikal, **header lengket tidak akan bergerak sama sekali**. Jadi sekadar menyalakan `stickyHeader` **tidak cukup**.

**Spesifikasi:**

1. `DataTable.tsx:134` — **dari** `hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border sm:block` **menjadi** `hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border sm:block lg:max-h-[calc(100dvh-8rem)] lg:overflow-auto` → di ≥1024 wadah menjadi **panel tabel berbatas tinggi** yang bisa digulir sendiri; header lengket di dalamnya benar-benar bekerja.
   - `8rem` (128 px) = topbar 56 px + blok header/filter halaman ≈ 72 px.
2. `DataTable.tsx:74` — `thead` **dari** `sticky top-0 z-[var(--z-sticky)] bg-surface-2` **menjadi** `sticky top-0 z-[var(--z-sticky)] bg-surface-2 shadow-e1` (bayangan tipis `e1` menandai header lengket — token sudah ada). `top-0` **benar** di sini karena konteks lengketnya adalah panel, bukan viewport.
3. `DataTable.tsx:49` — **dari** `stickyHeader` tanpa default **menjadi** `stickyHeader = true` (default on) → semua tabel mendapatnya tanpa menyentuh pemanggil. Mode kartu (<640) tidak terpengaruh (tabel `hidden sm:block`).
4. Halaman yang **tetap** butuh `stickyHeader={false}`: tidak ada.
5. Catatan: panel berbatas tinggi membuat **tabel 20 baris** bisa digulir di dalam dirinya sendiri — ini **kerapatan** sesuai keputusan (c), tapi **wajib diuji visual** (§9, item "panel tabel bergulir internal").

**Hasil akhir:** di laptop, admin menggulir 30 baris laporan atau 100 baris transaksi **tanpa kehilangan kepala kolom**, dan tabel tidak melebar melebihi 1280 px.

---

### F12 · P2 — Dashboard: kartu metrik, rasio chart, dan urutan blok

**Bukti (3 penyimpangan dari `DESIGN.md`):**
1. `pages/Dashboard.tsx:131-156` — "Hari ini" = 3 kartu bertepi + "Minggu ini"/"Bulan ini" = 2 kartu lagi = **5 kartu metrik bertepi**. `DESIGN.md` §11 #4 melarang *hero-metric template* di Dashboard dan meminta *"a dense metric strip with aligned .tnum values, not four decorative cards"*. Halaman **sudah benar** melakukan ini untuk counters unit (`Dashboard.tsx:120-127` — `grid gap-px … bg-border` = strip sungguhan), jadi ada dua pola berbeda dalam satu halaman.
2. `pages/Dashboard.tsx:208` — `lg:grid-cols-2` (50/50) vs `DESIGN.md` §8: *"the revenue chart takes 2/3 and busy-hours 1/3 at ≥1280"*.
3. `pages/Dashboard.tsx:158-202` — blok "Segera berakhir" (yang paling mendesak) berada **setelah** strip unit, blok "Hari ini", dan blok minggu/bulan → di HP berada di y ≈ 400 px, bukan yang pertama dilihat.

**Spesifikasi:**

1. `Dashboard.tsx:131-156` — **dari** 5 kartu bertepi **menjadi** **satu strip metrik 5 sel** dengan pola yang sama seperti `Dashboard.tsx:120-127`:
   ```tsx
   <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border bg-border sm:grid-cols-5">
     {cells.map(c => (
       <div key={c.label} className="bg-surface p-3">
         <p className="text-caption text-text-muted">{c.label}</p>
         <p className="mt-1 text-h3 font-bold tnum text-text">{c.value}</p>
       </div>
     ))}
   </div>
   ```
   Sel: "Sesi" · "Transaksi" · "Pendapatan tercatat" · "Minggu ini" · "Bulan ini". Nilai "Pendapatan tercatat" tetap `text-accent-text` (aksen = satu-satunya aksi/tanda, bukan pelengkap).
2. `Dashboard.tsx:208` — **dari** `lg:grid-cols-2` **menjadi** `lg:grid-cols-[2fr_1fr]` (pendapatan 2/3, jam tersibuk 1/3) sesuai §8. Pada <1024 tetap satu kolom.
3. `Dashboard.tsx` — **dari** urutan [unit strip → Hari ini → Segera berakhir] **menjadi** [Segera berakhir → unit strip → Hari ini]. Cukup **memindahkan blok JSX** (tanpa `order`, tanpa wrapper) → urutan yang sama di HP dan laptop; untuk owner, "yang akan berakhir" di atas juga benar.
4. `Dashboard.tsx:243` — "Aktivitas terbaru" error state **dari** `<p className="p-4 text-body-sm text-danger">` **menjadi** `EmptyState variant="error"` (konsisten dengan bagian lain).

**Hasil akhir:** satu halaman, satu pola metrik; chart sesuai aturan §8; blok mendesak tampil pertama di HP.

---

---

## 7. Urutan implementasi yang disarankan

| Gelombang | Temuan | Alasan urutan |
| --- | --- | --- |
| **1 — Mbledak / memblokir tugas** | F01, F04, F03, F09 | Masing-masing memblokir satu tugas nyata: simpan pengaturan, mulai sesi, check-in booking, cetak struk. Semuanya perubahan lokal, tanpa kontrak baru. |
| **2 — Tata letak HP** | F02, F05, F07, F08 | Semua menyentuh `AppShell` / `DataTable` / `Pagination` / `Form` — satu gelombang, lalu satu putaran verifikasi visual di 360/390/430 px. |
| **3 — Aksesibilitas & laptop** | F06, F10, F11, F12 | F06 mengubah struktur kartu (sentuh kartu HP); F10–F12 hanya layout desktop. |
| **4 — Laporan** | Kepadatan Laporan (ringkasan 6 sel di ≥1280) | Bukan temuan P0/P1 — di luar daftar 12 bila waktunya mepet. |

> Catatan: F06 dan F07 menyentuh **komponen yang sama** (`DataTable`) → kerjakan **dalam satu perubahan** supaya kartu tidak dirombak dua kali.

---

## 8. Rekomendasi terpisah (di luar daftar 12, **tidak diimplementasikan**)

Ini bukan temuan dan **tidak masuk daftar 12**. Semuanya adalah perubahan produk, bukan perbaikan; saya tidak=swap its scope.

| # | Rekomendasi | Alasan | Kenapa tidak diimplementasikan |
| --- | --- | --- | --- |
| R1 | **Layar "Bayar" penuh khusus HP** (bukan bottom sheet) | `FinishDialog` adalah alur yang paling sering diulang; di sheet 92 dvh kasir menggulir melewati 3 blok sebelum mencapai chip uang | Layar baru = fitur baru |
| R2 | **Filter unit di halaman Booking HP** | Menjawab "PS5-02 hari ini" dalam satu ketuk | Filter baru = fitur baru; penggantinya sudah dispesifikasikan di F07 (kode unit naik ke slot utama) |
| R3 | **Sidebar bisa di-collapse ke rail 64 px** | Di 1280 px, 176 px (≈18 %) kembali ke tabel — nyata untuk admin yang membandingkan angka | Mengubah navigasi = keputusan produk; §6 saat ini menyebut "collapsible" tetapi tidak ada mekanismenya |
| R4 | **Mode terang** | Ruang rental terang, layar HP di bawah matahari | Bukan kebutuhan: ruang rental gelap, produk ini memang "instrument panel" gelap. Menambah palet = risiko token, dan bertentangan dengan §1 |
| R5 | **Navigasi "Lainnya" jadi 2-tingkat** | Sheet "Lainnya" berisi 4–5 item dengan label panjang | Perbaikan F03 (Booking masuk bottom nav) sudah menghapus 2 dari 4 item sheet → sisanya tidak perlu |
| R6 | **`load-more` sebagai mode pagination utama di HP** | Lebih sedikit ketuk daripada nomor halaman | Butuh akumulasi list di setiap halaman pemanggil (API mengembalikan satu halaman). F05 memakai `2 / 5` — cukup |

---

## 9. Yang **wajib** diverifikasi visual di browser (tidak ada browser di lingkungan ini)

Semua temuan di dokumen ini berasal dari **sumber + penalaran**, bukan dari piksel yang dilihat. Berikut yang **tidak boleh dianggap terverifikasi** sampai ada mata manusia:

### 9.1 Lebar & overflow
- [ ] 360 / 390 / 430 px — **tidak ada** gulir horizontal di halaman mana pun (F02, F05).
- [ ] Lebar aktual tombol header setelah F02 — hitung ulang, jangan pakai estimasi teks.
- [ ] `max-w-[1280px]` (F10): konten di 1920 px terpusat dan tidak melar.
- [ ] Panel tabel berbatas tinggi (F11): `lg:max-h-[calc(100dvh-8rem)]` + `lg:overflow-auto` benar-benar menggulir internal, dan `thead` benar-benar lengket.
- [ ] "Tinggi 60 px" nav bawah (F03/F01): bar `StickyActionBar` **tidak** menindih nav; tidak ada celah 4 px.

### 9.2 Jangkauan sentuh & geometri
- [ ] Semua field/tab/pil di HP benar-benar **≥ 44 px** (F08) — ukur, jangan perkirakan.
- [ ] Tombol di footer kartu benar-benar di zona ibu jari (F07).
- [ ] Spacer `h-[4.5rem]` menutupi bar sticky tanpa celah (F01).

### 9.3 Aksesibilitas
- [ ] `axe` **nested-interactive = 0** di Sesi, Konsol, Pengguna, Game (F06).
- [ ] Nama aksesibel kartu: "Sesi PS5-01 — Budi", bukan "Buka detail" (F06).
- [ ] Pembaca layar (TalkBack / VoiceOver): urutan fokus pada kartu HP, dan apakah footer aksi terjangkau.
- [ ] `aria-label="Halaman 2 dari 5"` pada pagination HP terbaca (F05).

### 9.4 Timeline (keputusan a & b)
- [ ] Timeline **tetap** tersembunyi < 768 px dan tabel "Daftar" adalah penggantinya.
- [ ] Di 768–1023 px: blok 30 menit ≈ 28 px **terlihat** dan **menekan** (karena itu konsekuensi yang diterima).
- [ ] `aria-label` blok tetap membawa waktu nyata.

### 9.5 Visual &Cetak
- [ ] Kontras badge/kartu setelah perubahan hierarki (F07) — `--color-text-muted` 5.51:1 masih berlaku di atas `--color-surface`.
- [ ] Timer di slot kanan kartu (F07) tidak berdesakan dengan judul panjang.
- [ ] Dashboard: strip 5 sel (F12) pada 360 px (2 kolom) dan 1280 px (5 kolom).
- [ ] Struk 80 mm setelah perubahan F09 (jalur fallback ke `/transaksi/:id/struk`).
- [ ] Cetak struk di printerthermal nyata / preview cetak browser.

### 9.6 Perilaku
- [ ] `prefers-reduced-motion` masih berlaku setelah perubahan transisi bar (F01).
- [ ] Rotasi layar (portrait → landscape) di HP: bottom nav, sticky bar, dan grid konsol.
- [ ] Aman area (notch / gesture bar) pada perangkat Android nyata.

---

## 10. Apotek kecil (di luar 12, tanpa severity, **tidak wajib dikerjakan**)

1. `Tabs` — tab aktif bisa mulai **di luar layar** di 360 px (Sesi punya 4 tab ≈ 360 px). Pertimbangkan `scrollIntoView` saat tab berubah.
2. `Transactions` HP — stack filter (rentang + ringkasan + 3 kontrol) ≈ 600 px di atas transaksi pertama. Idealnya diringkas jadi satu baris "Rentang: 12–19 Okt" yang membuka sheet.
3. `SessionStart.tsx:122` — tombol header memakai `fullWidth` di dalam `shrink-0`; `w-full` melawan parent auto-width. Buang `fullWidth` untuk instans itu.
4. `Modal.tsx:152` — footer `flex-col-reverse` → di HP tombol **Batal** ada di bawah tombol utama (posisi bawah = jangkauan ibu jari, tapi urutan unconventional). Pertimbangkan `flex-col` dengan primary di paling bawah.
5. `AppShell.tsx:96` vs `:123` — blok user tampil dua kali di ≥1024 (sidebar + topbar). Sisakan di sidebar.
6. `Settings.tsx:192` — `pb-24` pada wrapper + `pb-24` milik `main` = 192 px ruang kosong di bawah (terlihat sebagai "halaman terlalu panjang" saat menggulir).

---

## 11. Ringkasan kontrak

- **Token:** tidak ada token baru. Semua nilai yang dipakai sudah ada di `DESIGN.md` §2 (`--color-accent-text`, `--color-cyan`, `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--radius-lg`, `--radius-md`, `--spacing-safe-bottom`, `--z-sticky`, `--shadow-e1`).
- **Peta status §7:** tidak disentuh. Semua label/tone/icon tetap.
- **API:** tidak disentuh. Tidak ada endpoint, query, atau bentuk payload baru. `POST /api/sessions/quote`, `sessions.list`, `transactions.list` tetap apa adanya.
- **Status quo yang dipertahankan:** bahasa Indonesia, `Asia/Jakarta`, IDR tanpa desimal, `.tnum` di semua angka, "server yang menghitung uang", "status = ikon + teks + warna", "tanpa horizontal scroll di HP".
- **Yang berubah di `DESIGN.md`:** hanya **§6** (tabel responsive + catatan pengecualian target sentuh) — mengikuti keputusan (a), (b), (c). §2, §3, §7, §8, §9, §10, §11 **tidak diubah**.
- **Verifikasi:** `not_verified` secara visual. Yang terverifikasi: setiap temuan ditelusuri ke `file:line` di `web/src/**`; setiap class dihitung dari token `DESIGN.md` §2; tidak ada klaim yang menyebut "terlihat di browser".

---

## 12. Status implementasi (DS-009 — Phase 3 QA, diisi oleh `@designer`)

> Ditambahkan oleh QA gate DS-009. **Isi §1–§11 di atas tidak diubah** — tabel ini hanya mencatat status, bukti, dan catatan per F0x.
> Rincian temuan, hitung ulang angka, dan daftar verifikasi visual: `specs/design-qa-report.md` → bagian **"DS-009 — QA batch UX HP & laptop"**.

**Verdict: PASS ✅** — 0 blocker · 2 major · 5 minor. 12 dari 13 item RESOLVED, 1 (F08) PARTIAL.

| Item | Status | Bukti implementasi | Notes (DS-009) |
| --- | --- | --- | --- |
| **F01** | RESOLVED | `AppShell.tsx:284-297` dua render (`fixed` <1024 / `sticky bottom-0` in-flow ≥1024), `Settings.tsx:318-327`, `SessionStart.tsx:260-261` | Tinggi bar 72 px = spacer `h-[4.5rem]` 72 px (tepat); nav 60 px = offset `3.75rem` (tepat); cadangan bawah 168 px vs kebutuhan 132 px → kelonggaran 36 px, tidak ada isi tertutup. Minor m3: pesan "Ada perubahan…" membungkus 3 baris di 360 px → bar ±83 px > spacer 72 px. |
| **F02** | RESOLVED | `AppShell.tsx:243-258` + `269-276` (`flex-col` + `flex-wrap`), `TransactionDetail.tsx:94-114, 188-199`, `SessionDetail.tsx:100-108, 133-142`, `Dashboard.tsx:141-173` | Tidak ada overflow di 360 px (maks aksi mobile 204 px). "Aksi utama ≤200 px dari atas" ✅ (~147 px). **"48 px" hanya terpenuhi di Dashboard** — `Cetak struk`/`Selesaikan` tetap `size="md"` = 40 px (pre-existing). |
| **F03** | RESOLVED | `AppShell.tsx:33-34, 83-85` | 4 item + "Lainnya" = 5; label terpanjang 56 px < 72 px, tanpa truncasi; "Lainnya" kasir = Dashboard + Game. `DESIGN.md` §6 sudah menyebut 60 px & nav sadar-peran. |
| **F04** | RESOLVED | `ConsoleCard.tsx:36` (`status === 'available' && onStart`), `SessionStart.tsx:145-153` | Tombol mati hilang. **M1 (major):** kartu tak lagi `role="button"` (poin 3 spec tidak dijalankan) → satu-satunya target = tombol kode ±25 px, bukan 44 px. |
| **F05** | RESOLVED | `Pagination.tsx:29-52`, `lib/useMediaQuery.ts` (ekstraksi diizinkan spec poin 1) | Lebar 134 px (spec perkira 160) — masih 1 ketuk/halaman. Minor m2: `aria-label` pada `<span>` generic tidak terbaca (axe `aria-prohibited-attr`). |
| **F06** | RESOLVED | `DataTable.tsx:230-268` (div biasa + tombol primary), `lib/table-card.ts:37-43`, `text:` di `Sessions/Units/Users/Games.tsx` | Nama aksesibel persis string spec ("Sesi PS5-01 — Budi" dll). Guard keyboard desktop `e.target !== e.currentTarget` utuh. **M1 (major):** target menyusut dari "se-kartu" ke ±25 px. |
| **F07** | RESOLVED | `DataTable.tsx:263-285`, `lib/table-card.ts:22-30`, `prominentOnMobile` di `Transactions/Sessions/Bookings.tsx` | Slot kanan-atas + `dl` ≤3 + footer `border-t` sesuai spec; timer tetap `text-cyan`/warning/danger. **M2 (major):** batas 3 baris memotong kolom uang di `Reports.tsx:74, 82` (dan status paket di `Settings.tsx:165`) → tidak tampil di HP. |
| **F08** | **PARTIAL** | `Form.tsx:13-17` (`h-11` + `sm:h-10`), `Tabs.tsx:55` (`min-h-11`), `DateRangePicker.tsx:75, 96, 108` | 44 px di <640 ✅ (field/tab/pil preset/input tanggal). **Minor m1:** 640–1023 px = 40 px (`sm:h-10`) — deviasi terdokumentasi dari kode spec (`lg:h-10`) yang mengikuti prosa spec, tetapi melawan `DESIGN.md` §6/§10.5 (pengecualian pointer hanya ≥1024). |
| **F09** | RESOLVED | `Transactions.tsx:90-98`, `TransactionDetail.tsx:47-56` | `res.ok` diperiksa di kedua halaman; toast sticky + aksi "Buka struk" (satu mekanisme, sama dengan `session-dialogs.tsx`). |
| **F10** | RESOLVED | `AppShell.tsx:133-136` (`mx-auto w-full max-w-[1280px]`) | 1280→992 px & 1440→1152 px tak berubah; 1920→1280 px (+176 px/sisi). Tanpa token baru. |
| **F11** | RESOLVED | `DataTable.tsx:55` (`stickyHeader = true`), `:78` (`sticky top-0 shadow-e1`), `:139` (`lg:max-h-[calc(100dvh-8rem)] lg:overflow-auto`) | Tabel pendek **tidak** meregang; `main` tanpa `overflow` → tak ada dua scroll container; `thead` lengket di dalam panel. **Minor m4:** offset `8rem` mengasumsikan tabel ~128 px dari atas; di Transaksi/Laporan tabel jauh lebih bawah → panel bisa melebihi ruang tersisa. |
| **F12** | RESOLVED | `Dashboard.tsx:118-133` (strip 5 sel), `:175-232` (urutan), `:234` (`lg:grid-cols-[2fr_1fr]`), `:262-276` (EmptyState error) | Satu pola metrik di seluruh halaman; sel pendapatan tetap `text-accent-text`. Urutan **tidak** membalik prioritas persona: kasir tidak pernah mendarat di Dashboard (`Login.tsx:13-15` → `/sesi`). |
| **F13** | RESOLVED | `ConsoleCard.tsx:48-71` | Kartu sudah **bukan** `role="button"` — kode konsol jadi satu-satunya kontrol, dan hanya ada bila ada handler (`canOpenDetail`). |

**Temuan di luar daftar F0x (ditambahkan QA, tidak mengubah spec):** M1 dan M2 di atas (dua-duanya konsekuensi desain F04/F06/F07, diperbaiki 1 baris masing-masing), plus m1–m5 di `specs/design-qa-report.md`.
