# DO-001 — Server test gate di GitHub Actions

**Agent:** @devops · **Tanggal:** 2026-10-20
**File yang diubah:** `.github/workflows/deploy.yml` (satu blok job baru). Tidak ada file lain yang disentuh — `server/package.json` **tidak** berubah, tidak ada dependency baru.

**Status: `verified`**
(config valid, paritas CI terbukti lokal; belum ada eksekusi nyata di runner `ubuntu-latest` — push pertama ke `main` akan menjadi bukti. Semua prasyarat Node 22 diverifikasi dari dokumentasi resmi Node v22.x.)

---

## 1. Diff YAML yang diterapkan

Blok baru ditambahkan di akhir `jobs:` pada `.github/workflows/deploy.yml`. Job `build` dan `deploy` **tidak diubah** (diff hanya penambahan di akhir file):

```yaml
  # Server regression gate. Runs in PARALLEL with `build` on purpose: a broken
  # backend must not block the Pages deploy, but it still shows up as a red
  # check on the run. Make it blocking later by adding `server-test` to the
  # `needs:` list of `build`.
  server-test:
    name: Server tests
    runs-on: ubuntu-latest
    needs: []
    timeout-minutes: 10
    permissions:
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Node 22 LTS: node:sqlite is unflagged since 22.13.0 and the
      # sqlite.backup() API used by src/lib/db-backup.js needs >= 22.16.0,
      # so `node-version: 22` (latest 22.x) covers both.
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: server/package-lock.json

      - name: Install dependencies
        working-directory: server
        run: npm ci

      # `npm test` = `node --test` (auto-discovery). It picks up every
      # server/test/*.test.js AND server/test/smoke-manual.mjs, because the
      # Node test runner also matches files under a `test/` directory.
      - name: Run server tests
        working-directory: server
        run: npm test
```

### Keputusan desain

| Keputusan | Alasan |
| --- | --- |
| `needs: []` (paralel, **tidak** memblokir Pages) | Sesuai kontrak: regresi backend tidak boleh menggagalkan deploy Pages. Job tetap **gagal keras** (red check di halaman Actions) → tidak ada silent skip. |
| `permissions: contents: read` (level job) | Permissions level-job **menggantikan** blok level-workflow hanya untuk job ini → `pages: write` / `id-token: write` dicabut dari `server-test`, sementara `build`/`deploy` tetap memakai permission level-workflow. Tidak ada yang berubah untuk Pages. |
| `timeout-minutes: 10` | Suite lokal ~43 s di ponsel; 10 menit memberi headroom besar tanpa membiarkan test macet memblokir antrean runner. |
| `node-version: 22` (bukan `22.x` / angka tetap) | `actions/setup-node` me-resolve `22` ke **22.x terbaru** (saat ini 22.23.x). Lihat §2 — butuh ≥ 22.16.0, jadi pasti terpenuhi. |
| Tidak ada flag `--experimental-sqlite` / `--test-concurrency=1` | Tidak diperlukan (dibuktikan §2 & §3). |
| `cache-dependency-path: server/package-lock.json` | Satu-satunya lockfile yang dipakai job ini → cache npm terisolasi dari cache job `build` (`web/package-lock.json`). |

---

## 2. Temuan teknis Node 22 (inti dari tugas ini)

### 2.1 `node --test` **memang** menjalankan `smoke-manual.mjs` — tanpa flag tambahan

Pola file uji default Node (dokumentasi resmi "Test runner" v22.x):

```
**/*.test.{cjs,mjs,js}   **/*-test.{cjs,mjs,js}   **/*_test.{cjs,mjs,js}
**/test-*.{cjs,mjs,js}   **/test.{cjs,mjs,js}      **/test/**/*.{cjs,mjs,js}
```

Pola terakhir (`**/test/**/*.{cjs,mjs,js}`) membuat `node --test` ikut mengambil **semua** file di dalam `server/test/`:

- `server/test/*.test.js` — 14 file uji
- `server/test/smoke-manual.mjs` — ikut jalan (terbukti di output lokal: `✔ test/smoke-manual.mjs (8266ms)`)
- `server/test/helpers.js` — ikut jalan sebagai file tanpa test (`✔ test/helpers.js (4959ms)`), exit 0 → pass

Jadi `npm test` sudah mencakup semuanya. **Tidak perlu** step `npm run test:smoke` terpisah, **tidak perlu** ubah script `test` di `server/package.json`.

### 2.2 `smoke-manual.mjs` tidak butuh polyfill `describe`/`it`

Dibaca langsung: file ini **tidak** memakai `describe`/`it` sama sekali. Ia skrip mandiri dengan counter sendiri (`check()` / `failures` / `checks`) dan `process.exit(1)` bila ada check gagal. Node test runner memperlakukan file uji yang tidak memakai `node:test` sebagai skrip biasa: *"Test files must be executable by Node.js, but are not required to use the node:test module internally."* → child process exit 0 = pass, exit != 0 = **fail**.

Artinya: smoke yang gagal **akan menggagalkan job CI** — tidak ada silent skip. (Terverifikasi lokal: `[smoke] 110/110 checks passed` → `[smoke] OK`.)

### 2.3 `node:sqlite` di Node 22 — butuh versi berapa?

| API | Minimal Node 22 | Sumber |
| --- | --- | --- |
| `node:sqlite` tanpa flag `--experimental-sqlite` | **22.13.0** | Node v22 docs, tabel History modul SQLite |
| `sqlite.backup()` (dipakai `src/lib/db-backup.js`, `src/backup.js`) | **22.16.0** | Node v22 docs, `sqlite.backup()` "Added in: v22.16.0" |

`node-version: 22` → 22.23.x di runner ⇒ **kedua syarat terpenuhi**, tidak perlu `--experimental-sqlite`, tidak perlu `package.json` diubah.

### 2.4 Flag lain yang TIDAK diperlukan

- **`--test-concurrency=1`** — tidak perlu. Isolation default Node 22 = `'process'` (setiap file di child process sendiri). Tiap file punya: DB SQLite temp sendiri (`helpers.js` override `DB_PATH` sebelum import `src/db.js`), server Express sendiri di **port 0** (random), dan limiter login-nya **berbasis DB** (tabel `login_attempts`) → tidak ada interferensi antar file meski paralel.
- **`--experimental-test-isolation`** — flag lama (pre-22.8), sudah digantikan oleh `--experimental-test-isolation=none` yang justru **tidak** diinginkan di sini (butuh isolation per-proses).
- **`--test-force-exit`** — tidak perlu; semua file menutup server/DB-nya sendiri di blok `finally`.

### 2.5 Tidak ada test yang "khusus Termux"

Satu-satunya accommodation Termux ada di `server/test/helpers.js` (`mkTmpDir()`: fallback ke `$PREFIX/tmp/opencode` bila `os.tmpdir()` tidak bisa dipakai). Di runner GitHub, `os.tmpdir()` = `/tmp` → jalur native langsung dipakai, fallback tidak pernah tereksekusi.

Tidak ada test yang memanggil binary eksternal: backup/restore memakai API `node:sqlite` (bukan CLI `sqlite3`), dan test CLI (`be005-backup`, `be005-criteria`) menjalankan `process.execPath` dengan `DB_PATH` temporer.

---

## 3. Hasil verifikasi lokal

### 3.1 `npm test` (lingkungan biasa)

```
ℹ tests 96
ℹ suites 0
ℹ pass 96
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 27946
```

Termasuk `[smoke] 110/110 checks passed` → `[smoke] OK`.

### 3.2 Uji paritas CI (fresh checkout)

 simulating runner GitHub: `web/dist` dipindahkan aside (gitignored → absen di checkout), `node_modules` dihapus, `npm ci` dijalankan ulang:

```
found 0 vulnerabilities
ℹ tests 96
ℹ pass 96
ℹ fail 0
ℹ duration_ms 43388
```

→ **96/96 hijau** tanpa `web/dist` dan dengan `node_modules` hasil `npm ci` (lockfile `server/package-lock.json` sinkron dengan `package.json`; `npm ci --dry-run` → "up to date"). `web/dist` dikembalikan ke posisi semula setelah pengujian.

### 3.3 Validasi sintaks YAML

```sh
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"
```

→ **YAML OK**. Struktur terverifikasi:

```
jobs: ['build', 'deploy', 'server-test']
server-test: {name: Server tests, runs-on: ubuntu-latest, needs: [], timeout-minutes: 10,
              permissions: {contents: read}}
steps: ['Checkout', 'Setup Node.js', 'Install dependencies', 'Run server tests']
needs build = None | needs deploy = build
wf permissions: {'contents': 'read', 'pages': 'write', 'id-token: 'write'}
```

`build` dan `deploy` tidak punya `needs` baru → **perilaku Pages persis seperti sebelumnya**.

---

## 4. Test yang tidak bisa jalan di CI + handling-nya

Tidak ada test yang di-skip. Yang dilakukan adalah menghilangkan sumber divergensi lokal↔CI:

| Potensi masalah di runner | Temuan | Handling (tanpa skip) |
| --- | --- | --- |
| `web/dist` tidak ada di checkout (gitignored) | `src/app.js` hanya memasang static/SPA fallback di balik `if (existsSync(webDistPath))` → app tetap boot normal. Semua request test mengarah ke `/api/*` (dicek: 0 request non-`/api`). `notFoundHandler` selalu balas JSON 404. | Diverifikasi empiris: test hijau 96/96 tanpa `web/dist`. Tidak perlu action tambahan. |
| `server/data/` tidak ada di checkout (gitignored) | `src/config.js` melakukan `mkdirSync(dirname(dbPath), {recursive:true})`, dan semua test meng-override `DB_PATH` ke direktori temp sebelum meng-import `src/db.js` (`helpers.js` baris 31–34, `smoke-manual.mjs` baris 8). | Tidak perlu action tambahan — tidak ada yang pernah membuka `server/data/playrent.db` saat test. |
| `node:sqlite` masih di-flag di Node lama | Minimal 22.13.0 (unflag) & 22.16.0 (`sqlite.backup()`); `node-version: 22` → 22.23.x | Tidak perlu `--experimental-sqlite`; `server/package.json` tidak diubah. |
| `npm ci` gagal karena lockfile tidak sinkron | `npm ci --dry-run` → "up to date"; `npm ci` nyata → 0 vulnerability | Tidak perlu action. |
| Rate-limit login tercemar antar file yang jalan paralel | Limiter berbasis tabel `login_attempts` per-DB; tiap file punya DB sendiri | Tidak perlu `--test-concurrency=1`. |
| Test macet | Tidak ada timeout per-test (default `Infinity`) | `timeout-minutes: 10` di level job → runner kill job, bukan menggantung. |
| Smoke test gagal diam-diam | `smoke-manual.mjs` memanggil `process.exit(1)` → runner tandai file gagal | Kegagalan smoke **menggagalkan job**. Tidak ada `|| true`, tidak ada `--test-skip-pattern`. |

**Kalau nanti ada test yang memang hanya bisa jalan di Termux**, cara yang benar (bukan silent skip) adalah mengisolasinya di file terpisah lalu memakai `--test-skip-pattern` **dengan komentar eksplisit di YAML + laporan ini**, sehingga test yang dilewati terlihat di log runner. Saat ini tidak ada yang perlu itu.

---

## 5. Rujukan deploy (ringkas)

| Item | Nilai |
| --- | --- |
| Build frontend | `cd web && npm ci && npm run typecheck && npx vite build --base=/PlayRent/` |
| Output frontend | `web/dist/` → `404.html` = salinan `index.html` (SPA fallback) |
| Test server | `cd server && npm ci && npm test` → `node --test` (auto-discovery, 96 test) |
| Build server | Tidak ada build step (`type: module`, plain ESM, tanpa native deps) |
| Node minimum | **22.16.0** (butuh `sqlite.backup()`); `node:sqlite` unflag sejak 22.13.0 |
| Env server | `PORT` (default 4000), `DB_PATH` (default `./data/playrent.db`), `NODE_ENV`, `CORS_ORIGIN`, `TRUST_PROXY`, `COOKIE_SECURE`, `SESSION_TTL_HOURS` — lihat `server/.env.example` |
| Health check | `GET /api/health` (`{ success, data: { db: { ok }, version } }`) |
| Rollback | GitHub Pages: re-run workflow pada commit sebelumnya (`workflow_dispatch`) — `deploy` memakai `actions/deploy-pages` dari artifact job `build`, jadi rollback = trigger ulang pada SHA lama |

---

## 6. Follow-up (opsional, di luar scope DO-001)

1. **Membuat gate blocking** (backend wajib hijau sebelum Pages deploy): ubah `build` → `needs: [server-test]`. Sengaja **tidak** dilakukan sekarang karena kontrak DO-001 meminta Pages tidak ikut gagal.
2. **Branch protection**: tandai check `Server tests` sebagai *required* di branch protection `main` agar regresi tidak bisa lolos ke `main` meski job tidak memblokir Pages. Ini menutup celah "40 temuan audit lolos ke main".
3. Menambah `web/` ke job `server-test` (typecheck) bila ingin satu check untuk seluruh repo — saat ini typecheck frontend sudah berjalan di job `build`.
