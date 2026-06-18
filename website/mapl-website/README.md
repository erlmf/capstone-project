# Cannibalization & Forecast Dashboard

Website untuk analisis cannibalization (OLS + DiD cross-validation),
revenue forecasting (Prophet), dan AI recommendation (local LLM via Ollama),
dengan multi-user login.

## Struktur

```
website/
├── backend/
│   ├── main.py            # FastAPI app — semua endpoint
│   ├── database.py        # SQLAlchemy setup (SQLite)
│   ├── models.py           # User & Dataset models
│   ├── auth.py             # Password hashing (bcrypt) + JWT
│   ├── ai.py                # Integrasi local LLM (Ollama)
│   ├── requirements.txt
│   └── storage/             # File .parquet dataset per user (auto-created)
└── frontend/
    ├── src/
    │   ├── App.jsx          # Layout utama, sidebar, tabs
    │   ├── AuthScreen.jsx    # Login / Register
    │   ├── api.js            # Helper fetch + JWT token
    │   ├── main.jsx
    │   └── index.css         # Tailwind + font Poppins
    ├── index.html
    ├── tailwind.config.js    # Warna brand: #004996, #94CFE5, #FFFAF4
    ├── vite.config.js
    └── package.json
```

## 1. Setup Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Tabel database (`app.db` — SQLite) dibuat **otomatis** saat pertama kali run.
Cek API jalan: `http://localhost:8000/api/health`.

> **Migrasi ke PostgreSQL nanti:** cukup ganti `DATABASE_URL` di `database.py`,
> sisa kode (models, queries) tidak perlu diubah.

## 2. Setup Local LLM (Ollama) — untuk AI Recommendation

```bash
# Install Ollama dari https://ollama.com
ollama pull llama3.1      # atau model lain: mistral, qwen2.5, dll
ollama serve               # biasanya auto-start setelah install
```

Kalau mau pakai model lain, ubah `OLLAMA_MODEL` di `backend/ai.py`.

Jika Ollama tidak running, endpoint `/api/datasets/{id}/ai-recommendation`
akan return error 503 dengan pesan jelas — bukan crash.

## 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend di `http://localhost:5173`, proxy otomatis `/api/*` ke backend
(lihat `vite.config.js`).

## Alur Aplikasi

1. **Register/Login** — username (min 3 karakter) + password (min 6 karakter).
   Token JWT disimpan di `localStorage`, berlaku 7 hari.
2. **Upload Dataset** — CSV per user, disimpan sebagai `.parquet` di
   `backend/storage/`, metadata di SQLite. User hanya bisa lihat/analisis
   dataset miliknya sendiri.
3. **Cannibalization** — OLS discount-elasticity + diagnostic checks +
   cross-validation DiD. Hasil di-cache ke database.
4. **Forecasting** — Prophet per SKU (30/90/180 hari), yearly seasonality
   otomatis aktif jika data ≥ 12 bulan.
5. **AI Recommendation** — kirim ringkasan hasil cannibalization + DiD +
   forecast ke local LLM (Ollama), minta ringkasan & rekomendasi bisnis
   dalam Bahasa Indonesia.

## Format Dataset (CSV)

Kolom wajib:

| Kolom | Tipe | Keterangan |
|---|---|---|
| `Date` | date | format YYYY-MM-DD |
| `Branch` | string | nama cabang/toko |
| `SKU_ID` | string | ID produk |
| `SKU_Name` | string | nama produk |
| `SKU_Category` | string | kategori produk (untuk grouping pasangan) |
| `Brand` | string | (opsional, untuk label) |
| `Qty` | number | quantity terjual |
| `DiscountPercentage` | number | 0.0 - 1.0 |
| `Revenue` | number | total revenue baris tersebut |
| `IsPromo` | 0/1 | opsional — kalau tidak ada, di-derive dari `DiscountPercentage > 0` |

Validasi otomatis saat upload:
- Rentang waktu (idealnya ≥ 12 bulan untuk forecasting)
- Price/Discount CV per SKU (idealnya ≥ 10%)
- Frekuensi promo per SKU (idealnya 15-35% hari)

## Catatan Production

- **SECRET_KEY**: set env var `APP_SECRET_KEY` dengan random string yang
  rahasia (jangan pakai default di `auth.py`).
- **CORS**: `allow_origins=["*"]` di `main.py` — batasi ke domain frontend
  saja saat deploy.
- **Storage**: file `.parquet` disimpan flat di `backend/storage/` — untuk
  scale besar, pertimbangkan object storage (S3-compatible) + simpan path/URL
  di kolom `storage_path`.
- **Ollama**: jalan sebagai proses terpisah di server yang sama (atau
  mesin lain — ubah `OLLAMA_URL` di `ai.py`).
