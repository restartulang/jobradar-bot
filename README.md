# JobRadar Headless Bot

Worker Telegram pribadi untuk mencari lowongan remote atau pekerjaan teknis lokal. Wilayah awal Ambon dan Maluku. Semua interaksi melalui chat pribadi Telegram.

## Jalankan dengan Docker

1. Buat bot lewat @BotFather menggunakan /newbot. Buka chat pribadi dengan bot dan kirim /start.
2. Siapkan token yang diberikan BotFather.
3. Salin `.env.example` menjadi `.env`. Isi `TELEGRAM_BOT_TOKEN`. Biarkan `TELEGRAM_CHAT_ID` kosong untuk pairing otomatis.
4. Dari folder ini jalankan:

```sh
docker compose up -d --build
docker compose logs -f jobradar
```

Setelah worker dimulai, baca perintah sekali pakai dengan `docker compose exec jobradar cat data/pairing.txt` lalu kirim perintah itu ke chat pribadi bot. Di Windows, perintah yang sama muncul di panel terminal. Pemilik tersimpan di SQLite setelah pairing. Instalasi dengan chat ID terisi langsung menggunakan ID tersebut. Worker langsung melakukan pemindaian awal. Kirim /status untuk melihat hasil per sumber. Sumber remote dijadwalkan tiap 30 menit, freelance tiap 20 menit, dan Indonesia tiap 2 jam dalam zona Asia/Jayapura. Jadwal dapat diatur di .env. Tidak ada port yang perlu dibuka. Satu worker untuk satu bot dan satu database.

## Penggunaan

| Perintah | Kegunaan |
| --- | --- |
| /stop_scan | Hentikan scan aktif dan kosongkan antrean scan. Hasil yang telah ditemukan tetap dikirim. Jadwal otomatis berikutnya tetap aktif. |
| /scan, /scan_local | Antrekan pemindaian semua sumber atau kueri kota aktif. Mode aktif tetap berlaku. |
| /locations, /add_city Makassar, /remove_city Makassar | Atur wilayah. Sirimau, Baguala, Paso/Passo dan Pattimura mengikuti kota Ambon. |
| /mode all, /mode remote, /mode local | Pilih jalur pencarian. |
| /keywords, /add_kw WordPress, /block_kw Telemarketing | Lihat dan ubah daftar skill serta kata yang diblokir. |
| /quiet | Alihkan pengiriman senyap. |
| /saved, /applied | Lihat daftar dengan tautan. Tambahkan nomor halaman jika disediakan. |
| /status | Periksa uptime, jumlah lowongan, kesehatan sumber dan waktu pemindaian. |

Setiap kartu punya tautan pada judul, URL yang bisa disalin dan tombol buka. Simpan, Dilamar dan Abaikan memperbarui status di SQLite. Tanggal lamaran ditampilkan dalam UTC. Jenis kerja yang tidak disebut sumber diberi label “Tidak dicantumkan”. Persentase menunjukkan jumlah kecocokan kata kunci, bukan probabilitas diterima.

## Sumber dan konfigurasi opsional

- RemoteOK, Remotive, Jobicy, WorkingNomads dan WeWorkRemotely menggunakan API atau feed publik.
- Freelancer dan GitHub Issues mengambil proyek atau issue terbuka berlabel bounty. Token GitHub opsional melalui GITHUB_TOKEN.
- RSS resmi Upwork telah dihentikan. UPWORK_FEED_URL dapat diisi jika memiliki feed RSS/Atom pengganti yang sah dengan tautan asli lowongan.
- JobStreet ID, Glints ID, Kalibrr, Indeed ID dan Karir dibaca lewat HTML publik dan metadata JobPosting. Halaman yang membutuhkan JavaScript, membatasi akses, atau berubah struktur dapat gagal. /status menampilkan kegagalan per portal. Setiap kueri membaca paling banyak 12 halaman detail setelah daftar hasil.
- Google Jobs opsional menggunakan SerpApi. Isi SERPAPI_KEY untuk mengaktifkan kueri remote dan masing-masing kota. Pemakaian mengikuti kuota akun.

## Persistensi dan pengujian

SQLite berada di ./data/jobs.db pada host. Untuk mencadangkan, hentikan worker dengan `docker compose stop`, salin folder data, lalu jalankan `docker compose start`. Bot menyimpan klaim pengiriman sebelum menghubungi Telegram. Jika koneksi putus sesudah pengiriman dimulai dan hasilnya ambigu, klaim tetap tersimpan untuk menghindari pesan ganda. Jumlah ini terlihat di /status. Penolakan pembatasan laju dijadwalkan ulang sesuai waktu tunggu dari Telegram.

Dengan Node 22.13+ (disarankan Node 24) dan npm:

```sh
npm install
npm run typecheck
npm test
node --env-file=.env --import tsx src/index.ts
```

Periksa konsumsi memori saat scan aktif melalui `docker stats`. Target PRD di bawah 80 MB perlu diukur pada host deployment.

## Windows tanpa Docker: worker otomatis dan panel terminal

Ekstrak ke folder permanen pada drive lokal. Pasang Node.js 22.13+ (disarankan Node 24),
jalankan `npm.cmd install` di folder tersebut, dan isi kredensial di
`.env`. Hentikan salinan bot yang sedang berjalan manual atau lewat Docker
sebelum mengaktifkan worker. Dari PowerShell Administrator di folder proyek:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\jobradar.ps1 install
```

Task Scheduler memulai worker sekarang dan saat Windows boot, sebelum login.
Worker memakai akun pemasang dengan hak terbatas dan mencoba kembali satu
menit setelah proses gagal. Setelah pemasangan, terminal boleh ditutup.
Komputer perlu menyala, terhubung ke internet, dan tidak dalam mode sleep.

Untuk membuka panel dari PowerShell biasa, jalankan:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\jobradar.ps1 panel
```

Panel menampilkan status proses, PID, waktu mulai, waktu laporan terakhir,
serta sumber yang sedang dipindai, antrean, scan terakhir dan jadwal berikutnya.
Tekan I untuk mengatur interval remote, freelance atau local dalam menit. Jadwal
baru dihitung sejak perubahan diterapkan (sekitar dua detik). Pemindaian yang sedang
berjalan diselesaikan. Nilai disimpan dalam SQLite. Pilih default untuk kembali
ke jadwal cron di .env. Di Telegram, buka /profil untuk memilih mode pencarian,
menambah atau menghapus kota, mengatur skill dan kata blokir. Balas langsung
pesan pertanyaan bot saat mengisi nilai.

Panel juga menampilkan informasi proses
dan status task. AKTIF berarti bot telah menyelesaikan inisialisasi Telegram dan
worker masih memperbarui laporan. Gunakan /status di Telegram untuk kesehatan
sumber lowongan. Panel memperbarui tampilan tiap lima detik. Tekan Q untuk keluar.
Ganti `panel` dengan `status` untuk satu kali pengecekan. Ganti dengan
`uninstall` dari PowerShell Administrator untuk menghentikan task dan melepas autostart.
