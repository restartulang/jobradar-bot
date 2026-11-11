# Product Requirements Document (PRD)
**Nama Proyek:** JobRadar Headless Bot (Personal Remote & Local Job Aggregator)  
**Versi Dokumen:** 2.0 (Headless Telegram-Only Edition)  
**Mode Deployment:** Self-Hosted via Docker (Background Worker)  
**Target Pengguna:** Single-User (Personal Use)

---

## 1. Ringkasan Eksekutif (Executive Summary)
**JobRadar Headless Bot** adalah aplikasi pencari dan penyaring lowongan kerja otomatis yang berjalan sepenuhnya di latar belakang (*headless daemon*) tanpa antarmuka web (Web UI). Aplikasi ini mengumpulkan informasi lowongan kerja dari berbagai portal kerja *remote* global, *marketplace freelance*, serta portal kerja nasional/lokal Indonesia, lalu menyaringnya sesuai profil keahlian teknis dan lokasi pengguna.

Seluruh interaksi—mulai dari menerima notifikasi *real-time*, membuka tautan langsung lowongan, menyimpan/mengabaikan loker, melacak status lamaran, hingga mengatur filter kata kunci dan kota pantauan—dilakukan **100% melalui Telegram Bot**.

---

## 2. Tujuan & Keunggulan Arsitektur
1. **Ultra-Lightweight & Hemat Resource:** Berjalan tanpa *frontend* atau *web server*, menekan penggunaan RAM di bawah 80 MB pada container Docker lokal.
2. **Zero Network Configuration:** Menggunakan metode *Telegram Long Polling* sehingga tidak memerlukan pengaturan *port forwarding*, domain, ataupun *Cloudflare Tunnel*.
3. **Hybrid Location Discovery:** Mendukung pencarian kerja **100% Remote (Global/Nasional)** sekaligus pekerjaan **On-Site/Hybrid/Project Lokal** di wilayah domisili pengguna (Default: **Ambon / Maluku**).
4. **Akses Tautan Instan (Direct-Link First):** Setiap notifikasi lowongan di Telegram wajib menyertakan tautan langsung yang dapat diklik baik melalui teks judul, URL cadangan di badan pesan, maupun tombol interaktif (*Inline URL Button*).

---

## 3. Profil Keahlian & Kriteria Pemfilteran (Matching Engine)

Mesin penyaring (*scoring & filtering engine*) mengevaluasi setiap lowongan berdasarkan kecocokan kata kunci dan lokasi.

### 3.1. Kategori Keahlian Target
| Kategori Keahlian | Kata Kunci Positif (Include / Boost Score) | Kata Kunci Negatif (Auto-Skip / Exclude) |
| :--- | :--- | :--- |
| **Full-Stack & PWA** | `JavaScript`, `TypeScript`, `Node.js`, `React`, `Next.js`, `PWA`, `Offline-first`, `IndexedDB`, `Service Worker`, `Full-Stack`, `Frontend`, `Backend` | `Cobol`, `Mainframe`, `.NET Legacy`, `US Citizen Only`, `Security Clearance` |
| **UI/UX & SaaS Design** | `UI/UX`, `Product Designer`, `SaaS`, `Figma`, `Design System`, `Dashboard Design`, `Wireframing`, `Prototyping` | `3D Animation`, `Print Design`, `Motion Graphic` |
| **SysAdmin, Docker & Infra** | `Docker`, `Self-hosted`, `Linux`, `Cloudflare`, `Reverse Proxy`, `CI/CD`, `VPS`, `SysAdmin`, `DevOps`, `Server` | `Data Center Physical Only (Non-Local)` |
| **IoT & Hardware Monitoring** | `IoT`, `Telemetry`, `Data Logging`, `Sensor`, `MQTT`, `WebSockets`, `Hardware Monitoring`, `Embedded`, `Microcontroller` | `Mechanical CAD`, `Civil Engineering` |
| **Tech Support & IT** | `Technical Support`, `IT Support`, `Troubleshooting`, `Helpdesk`, `System Diagnostics`, `Network`, `Maintenance`, `QA` | `Telemarketing`, `Cold Calling`, `Sales Target` |

### 3.2. Tipe Komitmen Kerja (Multi-Type)
Bot menerima dan memberi label otomatis untuk semua jenis komitmen kerja berikut:
* **`[FREELANCE / PROJECT]`** — Proyek lepas berbasis *deliverable* atau kontrak jangka pendek.
* **`[PART-TIME / ASYNC]`** — Pekerjaan paruh waktu dengan jam kerja fleksibel.
* **`[BOUNTY / MICRO-GIG]`** — Perbaikan *bug*, tugas singkat, atau pengembangan fitur spesifik.
* **`[FULL-TIME]`** — Pekerjaan penuh waktu (*Remote WFA* maupun *On-Site Lokal*).

### 3.3. Logika Filter Lokasi Ganda (Dual-Mode Geo-Filter)
Setiap lowongan yang masuk dievaluasi melalui dua jalur lokasi:

1. **Jalur 1: Mode Remote (Global & Nasional)**
   * **Syarat Lolos:** Memiliki atribut `Remote`, `Work From Anywhere (WFA)`, atau `Work From Home (WFH)`.
   * **Aturan Filter Skill:** Menggunakan filter kata kunci *Strict/Normal* sesuai Tabel 3.1.
2. **Jalur 2: Mode Wilayah Lokal (On-Site / Hybrid / Kontrak Lapangan)**
   * **Wilayah Default Aktif:** `Ambon`, `Maluku` (mencakup kata kunci area seperti *Teluk Ambon, Sirimau, Baguala, Paso, Pattimura*, dll., serta dapat ditambah kota lain via perintah Telegram).
   * **Syarat Lolos:** Lokasi penempatan berada di dalam daftar kota aktif pengguna, meskipun berstatus **WFO / On-Site**.
   * **Aturan Filter Skill (Relaxed Local Mode):** Khusus loker di dalam kota aktif, filter dibuat lebih longgar agar mencakup pekerjaan teknis umum seperti *IT Support Instansi/Vendor, Teknisi Jaringan/Perangkat, Maintenance Sistem, Operator IT,* dan *Vendor Proyek Lapangan*.
   * **Auto-Reject:** Lowongan berstatus *WFO / On-Site* di luar kota aktif (misal: WFO Jakarta) otomatis ditolak.

---

## 4. Sumber Data & Jadwal Akuisisi (Scraper & Fetcher)

Aplikasi menggabungkan penggunaan *Public JSON API*, *RSS/Atom Feed*, dan *Lightweight Web Scraping*:

| Kategori Sumber | Portal Penyedia Loker | Metode Akuisisi | Interval Cron |
| :--- | :--- | :--- | :--- |
| **Global Remote** | **RemoteOK**, **Remotive**, **WeWorkRemotely**, **Jobicy**, **WorkingNomads** | Public REST API (JSON) & XML RSS Feed | Setiap 30 Menit |
| **Freelance & Bounty** | **Upwork** (RSS Search Feed), **Freelancer.com** API, **GitHub Issues** (`bounty`) | RSS Feed terfilter kueri & Public API | Setiap 20 Menit |
| **Indonesia & Lokal (Ambon)** | **Glints ID**, **JobStreet ID**, **Kalibrr**, **Indeed ID**, **Karir/Google Jobs Aggregator** | HTTP JSON Endpoint & Lightweight HTML Parser (`Cheerio`) dengan kueri `Remote` + kueri `Location: Ambon/Maluku` | Setiap 2 Jam |

---

## 5. Spesifikasi Antarmuka & Interaksi Telegram Bot

### 5.1. Desain Pesan Notifikasi & Penempatan Link Langsung
Setiap lowongan baru yang lolos filter dikirimkan ke Telegram pengguna dengan struktur pesan berikut (mendukung **3 titik akses tautan langsung**):

```text
📍 [LOKAL: AMBON]  (atau 🌍 [REMOTE - 92% MATCH])
🔗 Judul (Klik Langsung): IT Support & Network Engineer (Project/Contract)
   └── (Hyperlink HTML/Markdown tertanam langsung pada teks judul)

🏢 Perusahaan : PT Nusantara Infrastruktur Teknologi
🌐 Sumber     : JobStreet ID | 💼 Tipe: On-Site / Kontrak
💰 Estimasi   : Rp 4.500.000 - Rp 6.000.000 (atau N/A jika tidak dicantumkan)
🛠 Skill Cocok: Technical Support, Hardware Monitoring, Troubleshooting, Linux

📝 Ringkasan Singkat:
Bertanggung jawab atas instalasi, pemeliharaan perangkat jaringan dan sensor monitoring, serta troubleshooting...

🔗 Tautan Cadangan (Copy-friendly):
https://id.jobstreet.com/id/job/12345678
```

**Susunan Tombol Interaktif (Inline Keyboard di Bawah Pesan):**
* **Baris 1 (Aksi Tracking):**
  * `[ ⭐ Simpan ]` — Menyimpan loker ke daftar *Saved* di SQLite & mengubah teks tombol menjadi `⭐ Tersimpan`.
  * `[ ✅ Dilamar ]` — Menandai loker sudah dilamar, mencatat waktu melamar di database, dan menambahkan *badge* `✅ SUDAH DILAMAR` pada pesan.
  * `[ ❌ Abaikan ]` — Menandai loker sebagai *ignored* di database dan langsung menghapus pesan dari layar chat Telegram.
* **Baris 2 (Navigasi Eksternal - Full Width):**
  * `[ 🔗 Buka Halaman Lowongan ↗️ ]` — Tombol bertipe `InlineKeyboardButton (URL)` yang langsung membuka halaman asli lowongan saat diklik.

---

### 5.2. Daftar Perintah Bot (Slash Commands)

#### A. Manajemen Loker & Pencarian Manual
* `/saved` — Menampilkan daftar lowongan yang sudah disimpan (`⭐ Simpan`) lengkap dengan tautan langsung ke masing-masing lowongan.
* `/applied` — Menampilkan riwayat lowongan yang sudah ditandai `✅ Dilamar` beserta tanggal melamarnya.
* `/scan` — Memicu penarikan seluruh sumber loker (*Remote* + *Lokal*) secara instan saat itu juga.
* `/scan_local` — Memicu pencarian khusus untuk wilayah lokal aktif (Ambon/Maluku) saat itu juga.

#### B. Manajemen Lokasi & Mode Kerja
* `/locations` — Menampilkan daftar kota/wilayah lokal yang sedang dipantau (Default: `Ambon, Maluku`).
* `/add_city <nama_kota>` — Menambahkan wilayah pantauan loker *on-site* baru (Contoh: `/add_city makassar`).
* `/remove_city <nama_kota>` — Menghapus kota dari daftar pantauan lokal.
* `/mode <all|remote|local>` — Mengubah mode kerja bot:
  * `all` : Kirim loker Remote + Loker Lokal di kota aktif *(Default)*.
  * `remote` : Hanya kirim loker 100% Remote.
  * `local` : Hanya kirim loker di wilayah kota aktif.

#### C. Manajemen Kata Kunci & Sistem
* `/keywords` — Menampilkan daftar kata kunci positif (*include*) dan negatif (*exclude*) yang sedang aktif.
* `/add_kw <kata>` — Menambahkan kata kunci skill baru ke dalam filter positif.
* `/block_kw <kata>` — Menambahkan kata kunci ke daftar hitam (*blacklist*) agar loker dengan kata tersebut otomatis dilewati.
* `/quiet` — Mengaktifkan/menonaktifkan mode senyap (notifikasi masuk tanpa suara atau ditahan sementara).
* `/status` — Menampilkan informasi *uptime* container, jumlah loker tersimpan di database, waktu *scraping* terakhir, dan status kesehatan tiap sumber portal.

---

## 6. Spesifikasi Teknis & Skema Database

### 6.1. Tech Stack (Dockerized)
* **Bahasa & Runtime:** Node.js (v20 LTS) dengan TypeScript.
* **Telegram Framework:** `grammY` atau `Telegraf` (Mode: *Long Polling*).
* **HTTP & Parsing:** `undici` / `axios` (HTTP Request), `rss-parser` (RSS Feeds), `cheerio` (HTML Parsing ringan).
* **Scheduler:** `node-cron` untuk penjadwalan berkala di latar belakang.
* **Database:** `better-sqlite3` (SQLite lokal yang disimpan di dalam Docker Volume `./data/jobs.db`).

### 6.2. Skema Tabel SQLite

#### 1. Tabel `jobs` (Menyimpan Data Lowongan & Deduplikasi)
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY` | ID Auto-increment internal |
| `job_hash` | `TEXT UNIQUE` | Hash SHA-256 dari `(source + external_id atau url)` untuk mencegah duplikasi pesan |
| `title` | `TEXT NOT NULL` | Judul posisi lowongan |
| `company` | `TEXT` | Nama perusahaan atau klien |
| `source` | `TEXT NOT NULL` | Nama portal asal (`remoteok`, `glints`, `jobstreet`, `upwork`, dll.) |
| `work_mode` | `TEXT NOT NULL` | `'remote'` atau `'local'` |
| `location` | `TEXT` | Lokasi spesifik (misal: `'Ambon'`, `'Maluku'`, `'Global Remote'`) |
| `job_type` | `TEXT` | `'freelance'`, `'part_time'`, `'full_time'`, `'bounty'` |
| `salary` | `TEXT` | Estimasi gaji atau *budget* proyek (jika tersedia) |
| `matched_skills`| `TEXT (JSON)` | Daftar skill yang cocok (misal: `["React", "Docker"]`) |
| `match_score` | `INTEGER` | Skor kecocokan (0 - 100) |
| `url` | `TEXT NOT NULL` | URL langsung menuju halaman lowongan asli |
| `summary` | `TEXT` | Ringkasan deskripsi singkat (maksimal 250 karakter) |
| `status` | `TEXT DEFAULT 'new'` | `'new'`, `'saved'`, `'applied'`, `'ignored'` |
| `telegram_msg_id`| `INTEGER` | ID pesan di Telegram untuk pembaruan tombol *inline* |
| `created_at` | `DATETIME` | Waktu lowongan pertama kali ditemukan oleh bot |
| `updated_at` | `DATETIME` | Waktu terakhir status diubah (misal: saat diklik *Dilamar*) |

#### 2. Tabel `watched_locations` (Daftar Wilayah Lokal Aktif)
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY` | ID internal |
| `city_keyword` | `TEXT UNIQUE` | Nama kota/wilayah (Default awal: `'ambon'`, `'maluku'`) |
| `is_active` | `INTEGER DEFAULT 1` | Status aktif (`1` = Aktif, `0` = Nonaktif) |

#### 3. Tabel `keywords` (Pengaturan Kata Kunci Dinamis)
| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY` | ID internal |
| `word` | `TEXT UNIQUE` | Kata kunci (misal: `'pwa'`, `'iot'`, `'wordpress'`) |
| `type` | `TEXT NOT NULL` | `'include'` (positif) atau `'exclude'` (blokir) |
| `category` | `TEXT` | Kategori skill (`'fullstack'`, `'uiux'`, `'infra'`, `'iot'`, `'support'`, `'general'`) |

---

## 7. Struktur Folder Proyek & Konfigurasi Environment

### 7.1. Struktur Direktori
```text
jobradar-bot/
├── src/
│   ├── index.ts            # Entry point aplikasi (Inisialisasi DB, Bot, & Cron)
│   ├── config.ts           # Pembacaan variabel .env & konfigurasi default
│   ├── db/
│   │   └── sqlite.ts       # Inisialisasi tabel SQLite & query helper
│   ├── bot/
│   │   ├── bot.ts          # Setup Telegram Bot, command handlers, & inline buttons
│   │   └── formatter.ts    # Pemformatan teks pesan HTML/Markdown & URL button
│   ├── scrapers/
│   │   ├── index.ts        # Orkestrator seluruh scraper
│   │   ├── remoteApis.ts   # Fetcher RemoteOK, Remotive, Jobicy, WeWorkRemotely
│   │   ├── freelanceRss.ts # Fetcher Upwork RSS & GitHub Bounties
│   │   └── indoLocal.ts    # Scraper Glints, JobStreet, & Indeed (Remote + Ambon)
│   └── engine/
│       └── matcher.ts      # Logika Dual-Mode Geo-Filter & perhitungan Match Score
├── data/                   # Volume persisten untuk menyimpan file SQLite (jobs.db)
├── .env.example            # Template konfigurasi environment
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

### 7.2. Variabel Environment (`.env`)
```env
# Kredensial Utama Telegram
TELEGRAM_BOT_TOKEN=1234567890:AAH_token_rahasia_dari_botfather
TELEGRAM_CHAT_ID=987654321

# Konfigurasi Default Lokasi & Jadwal
DEFAULT_LOCAL_CITIES=ambon,maluku,teluk ambon,sirimau,baguala,paso
CRON_REMOTE_SCHEDULE=*/30 * * * *
CRON_LOCAL_SCHEDULE=0 */2 * * *
TZ=Asia/Jayapura
```

---

## 8. Kriteria Keberhasilan (Acceptance Criteria / Definition of Done)
1. **Zero Duplicate Spam:** Lowongan yang sama dari satu portal tidak pernah dikirimkan lebih dari satu kali ke chat Telegram meskipun *cron job* berjalan berulang kali.
2. **Direct URL Berfungsi Penuh:** Pengguna dapat mengklik judul lowongan ataupun tombol `[ 🔗 Buka Halaman Lowongan ↗️ ]` dan langsung diarahkan ke halaman web asli lowongan tersebut.
3. **Akurasi Dual-Location:** Lowongan *on-site* di Ambon/Maluku berhasil masuk dengan label `📍 [LOKAL]`, sementara lowongan *on-site* di kota lain yang tidak terdaftar otomatis terblokir.
4. **Persistensi Data Docker:** Saat container Docker di-*restart*, seluruh data riwayat loker, daftar `/saved`, `/applied`, serta kota dan *keyword* tambahan tetap tersimpan aman di dalam folder `./data/jobs.db`.