# BE-002 — Fix temuan review RV-001 (HIGH-1 `TRUST_PROXY`, MEDIUM-3 `Sec-Fetch-Site`)

> Agen: @node-developer · Task: BE-002 · Mode: balanced
> Kontrak acuan: `specs/deploy-contract.md` §1.2 & §3 · Review: `specs/review-deploy-report.md`
> (HIGH-1, MEDIUM-3) · Implementasi sebelumnya: `specs/be001-report.md`
> Tanggal: 2026-10-21

---

## 1. File yang diubah + ringkasan per file

| File | Perubahan |
| --- | --- |
| `server/src/config.js` | **`TRUST_PROXY` jadi hop count.** Satu parser (`parseTrustProxy()`) jadi sumber kebenaran → `trustProxy()` mengembalikan nilai untuk Express, `trustProxyWarning()` mengembalikan pesan startup. Nilai `unset`/`false`/`0` → `false` (default **tidak** berubah); `1`,`2`,… → `Number` (jumlah hop); `true` → `1` (**bukan** trust-all); nilai tak dikenal → `false` + peringatan. Komentar menjelaskan alasannya: Cloudflare **menambah** (append) XFF, jadi entri paling kiri dikontrol penyerang — `trust proxy: true` membuat `req.ip` = entri palsu dan rate-limit login bisa dilewati (HIGH-1). **Kebersihan (req D):** duplikasi "apakah production" dihapus — `nodeEnv()` (runtime, satu-satunya sumber nama environment), `prodEnv()` (runtime, internal), `isProd` (snapshot import-time, **khusus** `tools/security-probe.mjs`, diberi komentar). `nodeEnv` berubah dari konstanta → fungsi; satu-satunya pemakai (`src/index.js`) diperbarui. |
| `server/src/app.js` | `app.set('trust proxy', trustProxy())` tetap (nilai `false` atau angka — keduanya didukung Express). Komentar diperbarui ke semantik hop count. |
| `server/src/lib/auth.js` | `csrfGuard` (MEDIUM-3): cabang "tanpa header `Origin`" tidak lagi lolos diam-diam — dicek `Sec-Fetch-Site`; `cross-site` → `403` dengan kode **yang sama** (`CSRF_ORIGIN_MISMATCH`, tidak ada enum baru); `same-origin`/`same-site`/tidak ada → izinkan (curl/Postman tidak mengirimnya). Aturan yang sudah ada **tidak dilonggarkan**: `Origin` asing tetap `403`, dan `Origin` yang diizinkan tetap lolos. |
| `server/src/index.js` | Saat listen, cetak **konfigurasi efektif** satu baris: `[playrent] env=production cors=["https://adjietegaralamsyah312.github.io"] sameSite=none secure=true trustProxy=1` (req C — tanpa secret, isi `.env` mentah tidak pernah dicetak). Plus **peringatan sekali** kalau `TRUST_PROXY=true`: "`TRUST_PROXY=true` kini berarti 1 hop. Set angka eksplisit (mis. 2) bila ada lebih dari satu proxy di depan server." `nodeEnv` dipakai sebagai `nodeEnv()`. |
| `server/tools/security-probe.mjs` | **Komentar/teks saja** (perilaku probe tidak berubah): referensi AUTH-14 basi (`server/src/lib/auth.js:88`, "cookieOpts sets secure:isProd") → kini menunjuk `config.js:cookieSecure()` + `lib/auth.js:sessionCookieOptions()`; teks remediation AUTH-10 yang menyebut `TRUST_PROXY=true` → menyatakan hop count (`false` = abaikan XFF, `1` = percaya entri yang ditambahkan proxy). |
| `server/test/deploy.test.js` | 5 test baru (req E), gaya `withEnv` + `withServer` yang sudah dipakai (env disetel **sebelum** app dibuat, dipulihkan di `finally`). |

### Keputusan parse `TRUST_PROXY`

| Nilai env | `trustProxy()` | Arti |
| --- | --- | --- |
| tidak di-set | `false` | XFF diabaikan (default anti-spoof, **tidak diubah**) |
| `false` | `false` | idem |
| `0` | `false` | idem |
| `true` | `1` | **satu** hop — bukan trust-all; memunculkan peringatan startup |
| `1` | `1` | 1 hop (Cloudflare Tunnel) |
| `2`, `3`, … | `Number` | jumlah hop yang dipercaya |
| `bogus`, `1.5`, `-1` | `false` | nilai tak dikenal → `false` + peringatan |

Trust count dibaca **saat runtime** (bukan beku saat import) → bisa di-override per proses & per test.

---

## 2. Hasil test

```
$ cd server && npm test
ℹ tests 114
ℹ suites 0
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 53897.3
```

- Baseline BE-001: **109 pass / 0 fail** → sekarang **114 pass / 0 fail** (+5 test).
- Tidak ada test lama yang gagal, tidak ada yang di-skip.

```
$ node server/tools/security-probe.mjs   (dari root repo)
blockers=0  majors=0  minors=0  total=69
VERDICT: PASS
```

Verifikasi tambahan:

```
$ DB_PATH=… NODE_ENV=production TRUST_PROXY=true CORS_ORIGIN=… PORT=4123 node --env-file-if-exists=.env src/index.js
[playrent] listening on http://0.0.0.0:4123 · env=production · db=…
[playrent] env=production cors=["https://adjietegaralamsyah312.github.io"] sameSite=none secure=true trustProxy=1
[playrent] PERINGATAN: TRUST_PROXY=true kini berarti 1 hop. Set angka eksplisit (mis. 2) bila ada lebih dari satu proxy di depan server.
```

### 5 test baru (`server/test/deploy.test.js`)

| # | Test | Yang dibuktikan |
| --- | --- | --- |
| 1 | `BE-002 TRUST_PROXY=1: the spoofable leftmost XFF entry is ignored, the rightmost one is req.ip` | 5 login gagal dengan `X-Forwarded-For: 1.2.3.N, 9.9.9.9`; percobaan ke-6 dengan `5.6.7.8, 9.9.9.9` (kiri **beda**, kanan **sama**) → `429 RATE_LIMITED` → bucket sama. `SELECT DISTINCT ip FROM login_attempts` = `['9.9.9.9']` → `req.ip` = entri **paling kanan** (yang ditambahkan Cloudflare). |
| 2 | `BE-002 TRUST_PROXY off: X-Forwarded-For is ignored, the socket IP is the bucket key` | `TRUST_PROXY` unset → 5 attempt dengan XFF berbeda tetap satu bucket, ke-6 `429`; `ip` yang tersimpan = alamat socket (bukan `10.0.0.*`) → XFF **diabaikan** ( spoofing tidak memberi kuota tambahan). |
| 3 | `BE-002 TRUST_PROXY=1: X-Forwarded-Proto makes req.protocol https` | `Origin: https://<host>` + `X-Forwarded-Proto: https` → `200` (origin API sendiri tetap di allowlist CSRF) → `req.protocol` = `https`. |
| 4 | `BE-002 trustProxy() parses TRUST_PROXY as a hop count, never as trust-all` | `'true'`→`1`, `'1'`→`1`, `'2'`→`2`, `'false'`/`'0'`/unset→`false`, `'bogus'`→`false`. |
| 5 | `BE-002 CSRF: a write without Origin but with Sec-Fetch-Site: cross-site is rejected` | tanpa `Origin` + `Sec-Fetch-Site: cross-site` → `403 CSRF_ORIGIN_MISMATCH`; `same-origin` → bukan 403; tanpa kedua header → bukan 403. |

**Bukti test tidak vakuis (regresi HIGH-1):** dengan `app.set('trust proxy', true)` (perilaku lama) test #1 **GAGAL** (`17 pass / 1 fail`, bukan 429 karena entri paling kiri jadi bucket baru); dengan hop count 1 test #1 **hijau**. Perilaku `req.ip` dipetakan langsung:

```
trust=false  XFF "1.2.3.4, 9.9.9.9" -> ip=::ffff:127.0.0.1   (XFF diabaikan)
trust=1      XFF "1.2.3.4, 9.9.9.9" -> ip=9.9.9.9            (paling kanan ✓)
trust=1      XFF "5.6.7.8, 9.9.9.9" -> ip=9.9.9.9            (bucket sama ✓)
trust=true   XFF "1.2.3.4, 9.9.9.9" -> ip=1.2.3.4            (paling kiri — bisa dipalsukan ✗)
```

---

## 3. Status verifikasi

# `verified`

- `npm test` → **114 pass / 0 fail** (dari 109) ✅
- `tools/security-probe.mjs` → 69/69, 0 blocker/major/minor, **VERDICT: PASS** ✅
- Boot nyata → baris konfigurasi efektif + peringatan `TRUST_PROXY=true` tercetak ✅
- Regresi HIGH-1 terbukti **gagal** pada perilaku lama & **hijau** pada perilaku baru ✅
- Tidak ada data yang dirusak: `npm test` memakai DB temp (`server/test/helpers.js`), `server/data/**` tidak disentuh.

---

## 4. Konfirmasi eksplisit

**Entri XFF paling kiri TIDAK lagi dipakai untuk `req.ip` saat `TRUST_PROXY=1`.**
Dengan `trust proxy = 1`, Express/proxy-addr mengambil entri **paling kanan** dari rantai XFF
— entri yang ditambahkan proxy tepercaya (Cloudflare) — sehingga `req.ip` = IP klien asli.
Nilai `TRUST_PROXY=true` sekarang berarti **1 hop**, bukan trust-all, jadi tidak ada lagi
jalur yang membuat `req.ip` mengikuti header kiriman penyerang (rate-limit login 5/15 mnt &
register 10/15 mnt tidak bisa dilewati dengan merotasi XFF). `req.protocol` tetap diambil
dari `X-Forwarded-Proto` → `https` (req A terpenuhi).

---

## 5. Risiko / limitasi & follow-up di luar scope BE-002

1. **Runbook masih menyuruh `TRUST_PROXY=true`** — `specs/deployment-guide.md` (§3.x, §8.2) dan
   `README.md` masih menyebut `TRUST_PROXY=true`. Nilai itu kini berarti 1 hop (aman), tapi
   **rekomendasieksplisit `TRUST_PROXY=1` + penjelasan "jangan pakai `true`" masih perlu ditulis**
   → tugas **DO-002** (@devops). `server/.env.example` (milik DO-002) juga belum menjelaskan
   bahwa nilainya adalah jumlah hop.
2. **`TRUST_PROXY=2` hanya aman bila ada benar-benar 2 proxy.** Dengan 2 hop dan XFF 2 entri,
   entri paling kiri kembali dipakai sebagai `req.ip` (terbukti di tabel di atas) → jumlah hop
   harus sama dengan jumlah proxy yang benar-benar ada di depan server.
3. **Safari masih tidak bisa login lintas situs** (ITP memblokir cookie 3P sepenuhnya) →
   fallback same-origin §8 runbook tetap satu-satunya jalur andal (di luar scope BE-002).
4. **Tidak ada uji browser end-to-end** — perilaku nyata cookie lintas situs tetap wajib
   diverifikasi manual oleh operator (MEDIUM-2 belum tertutup).
5. `nodeEnv` berubah dari konstanta menjadi fungsi → satu-satunya pemakai (`src/index.js`) sudah
   diperbarui; `tools/security-probe.mjs` tetap memakai `isProd` (snapshot import-time) dan tetap
   PASS.
