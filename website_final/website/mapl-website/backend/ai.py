"""
AI Insights — menggunakan Google Gemini API.

Setup (sekali saja):
    1. Buat API key di https://aistudio.google.com/apikey
    2. Set environment variable sebelum jalanin backend:
         export GEMINI_API_KEY="xxxxx"          (Linux/Mac)
         setx GEMINI_API_KEY "xxxxx"             (Windows)
    3. (Opsional) ganti model lewat env var GEMINI_MODEL, default "gemini-2.5-flash".

Kalau API key belum di-set / quota habis / request gagal, function akan
return dict {"success": False, "error": "..."} (bukan raise/crash) supaya
endpoint FastAPI bisa kasih HTTPException yang jelas dan frontend bisa
nampilin fallback message.

Ada 2 jenis insight di file ini:
  1. generate_recommendation()   -> insight BESAR & terstruktur (JSON),
                                     gabungin DiD + matrix + forecast,
                                     dipakai di halaman "AI Insights".
  2. generate_context_insight()  -> insight KECIL & naratif (plain text),
                                     spesifik per halaman (dashboard,
                                     analysis, simulator), dipakai sebagai
                                     "AI Insight" card di tiap menu.
"""

import json
import os

import requests
import logging

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-flash-lite-latest"

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


print(f"[AI DEBUG] MODEL={GEMINI_MODEL}")
print(f"[AI DEBUG] URL={GEMINI_URL}")
print(f"[AI DEBUG] KEY_SET={bool(GEMINI_API_KEY)}")


# ════════════════════════════════════════════════════════════════════════════
# Core Gemini caller — dipakai semua jenis insight di bawah
# ════════════════════════════════════════════════════════════════════════════
def _call_gemini(prompt: str, temperature: float = 0.4, max_output_tokens: int = 1024) -> dict:
    if not GEMINI_API_KEY:
        return {
            "success": False,
            "error": "GEMINI_API_KEY belum di-set di environment variable backend. "
                     "Buat API key di https://aistudio.google.com/apikey lalu set "
                     "GEMINI_API_KEY sebelum menjalankan server.",
        }

    try:
        resp = requests.post(
            GEMINI_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_output_tokens,
                },
            },
            timeout=60,
        )

        print("[AI DEBUG] STATUS =", resp.status_code)
        print("[AI DEBUG] RESPONSE =", resp.text)

        if resp.status_code in (401, 403):
            return {
                "success": False,
                "error": "GEMINI_API_KEY tidak valid atau tidak punya akses ke model "
                         f"'{GEMINI_MODEL}'. Cek kembali API key di Google AI Studio.",
            }
        if resp.status_code == 429:
            return {
                "success": False,
                "error": "Kuota / rate limit Gemini API habis. Coba lagi beberapa saat lagi.",
            }
        resp.raise_for_status()

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            block_reason = data.get("promptFeedback", {}).get("blockReason")
            msg = "Gemini tidak mengembalikan hasil."
            if block_reason:
                msg += f" (blocked: {block_reason})"
            return {"success": False, "error": msg}

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            return {"success": False, "error": "Gemini mengembalikan respons kosong."}
        return {"success": True, "text": text}

    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Tidak bisa terhubung ke Gemini API. Cek koneksi internet server."}
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Gemini API timeout. Coba lagi."}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _to_json(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


# ════════════════════════════════════════════════════════════════════════════
# 1) INSIGHT BESAR (terstruktur) — halaman "AI Insights"
# ════════════════════════════════════════════════════════════════════════════
def build_prompt_combined(did: dict, matrix: dict, forecast: dict) -> str:
    significant_pairs = did.get("significant", [])[:5]
    top_forecast = forecast.get("per_sku", [])[:5]

    # Hitung total rev at risk dari significant pairs
    total_rev_at_risk_per_month = int(sum(
        abs(p.get("rev_impact", 0) or 0)
        for p in did.get("significant", [])  # semua, bukan cuma top 5
    ) * 30)

    matrix_data = matrix.get("matrix", {})
    flat_pairs = []
    for sku_a, row in matrix_data.items():
        for sku_b, coef in row.items():
            if coef and coef > 0:
                flat_pairs.append({"sku_a": sku_a, "sku_b": sku_b, "coef": coef})
    flat_pairs.sort(key=lambda x: x["coef"], reverse=True)
    top_matrix_pairs = flat_pairs[:5]

    context = {
        "did_summary": did.get("summary"),
        "total_rev_at_risk_per_month": total_rev_at_risk_per_month,  # ← inject langsung
        "top_significant_pairs": [
            {
                "promoted_product": p["sku_a_name"],
                "cannibalized_product": p["sku_b_name"],
                "branch": p["branch"],
                "did_ab": p["did_ab"],
                "cannib_coef": p["cannib_coef"],
                "p_value": p["p_value"],
                "rev_impact": p.get("rev_impact", 0),
                "is_capped": p.get("is_capped", False),
            } for p in significant_pairs
        ],
        "top_cannibalization_matrix_pairs": top_matrix_pairs,
        "forecast_summary": {
            "total_revenue_forecast": forecast.get("total_revenue_forecast"),
            "forecast_days": forecast.get("forecast_days"),
        },
        "top_forecast_sku": [
            {"sku": f["sku_name"], "revenue_forecast": f["revenue_forecast"]}
            for f in top_forecast
        ],
    }

    return f"""Kamu adalah analis bisnis FMCG senior. Berikut hasil analisis cannibalization (Difference-in-Differences) dan forecasting dari sebuah toko retail:

{_to_json(context)}

Tugas: Buat rekomendasi bisnis yang actionable dalam format JSON berikut (HANYA return JSON, tidak ada teks lain):

{{
  "summary": {{
    "summary": "1 kalimat ringkasan temuan utama",
    "potential_revenue_saved": "GUNAKAN PERSIS nilai total_rev_at_risk_per_month dari data di atas. Tulis ANGKA integer SAJA, tanpa Rp, tanpa titik, tanpa koma, TANPA huruf.",
    "sku_at_risk": "jumlah SKU yang perlu perhatian (angka + SKU, misal: 6 SKU)",
  }},
  "recommendations": [
    {{
      "title": "Judul singkat rekomendasi (max 6 kata)",
      "severity": "HIGH atau MED atau LOW",
      "explanation": "Penjelasan 2-3 kalimat: mengapa ini terjadi dan apa dampaknya ke revenue",
      "action": "Langkah konkret yang bisa dilakukan tim marketing minggu ini",
      "impact": "Kalikan rev_impact pasangan terkait × 30 untuk dapat angka per bulan. Tulis integer saja tanpa satuan."
    }}
  ]
}}

Buat 3-5 rekomendasi. Severity HIGH untuk cannibalization coefficient tinggi (>0.5) atau DiD effect besar, MED untuk coefficient sedang (0.2-0.5), LOW untuk effect kecil/peluang bundling. Bahasa Indonesia, profesional tapi mudah dipahami tim bisnis."""

def generate_recommendation(did: dict, matrix: dict, forecast: dict) -> dict:
    prompt = build_prompt_combined(did, matrix, forecast)
    return _call_gemini(prompt, temperature=0.5, max_output_tokens=2048)


# ════════════════════════════════════════════════════════════════════════════
# 2) INSIGHT KECIL (naratif, plain text) — card "AI Insight" per halaman
# ════════════════════════════════════════════════════════════════════════════
def build_prompt_dashboard(payload: dict) -> str:
    return f"""Kamu adalah analis bisnis retail FMCG. Berikut ringkasan dataset transaksi dan ranking kategori berdasarkan tren promo & revenue dari sebuah toko retail:

{_to_json(payload)}

Tugas: Tulis 1 paragraf insight (3-5 kalimat, Bahasa Indonesia, nada profesional tapi mudah dipahami tim non-teknis) yang menyoroti pola paling penting di data ini — misalnya kategori dengan risk score tertinggi, efektivitas promo dibanding pertumbuhan revenue, atau anomali yang perlu ditindaklanjuti. Langsung paragraf naratif, JANGAN pakai format JSON atau bullet point."""


def build_prompt_analysis(payload: dict) -> str:
    
    return f"""Kamu adalah analis bisnis retail FMCG. Berikut hasil analisis cannibalization (Difference-in-Differences) yang sedang dilihat user, sudah difilter sesuai pilihan branch/periode/kategori di dashboard:

{_to_json(payload)}

PENTING:
- Produk Promoted adalah SKU yang dipromosikan atau mengalami peningkatan aktivitas promosi.
- Produk Terdampak adalah SKU yang mengalami penurunan penjualan akibat cannibalization.
- Jika Produk A muncul sebagai Produk Promoted dan Produk B muncul sebagai Produk Terdampak, maka interpretasinya adalah promosi Produk A berasosiasi dengan penurunan penjualan Produk B.
- Jangan membalik hubungan tersebut.
- Jangan menyimpulkan adanya perpindahan konsumen secara langsung kecuali didukung data.
- Jangan mengasumsikan peluncuran produk baru kecuali disebutkan dalam data.
- Revenue Loss adalah total estimasi kehilangan revenue dari seluruh pasangan yang ditampilkan.

Tugas:
Tulis 1 paragraf insight (3-5 kalimat, Bahasa Indonesia, profesional dan mudah dipahami) yang:
1. Menjelaskan pasangan cannibalization paling signifikan.
2. Menjelaskan dampak revenue yang terlihat.
3. Menjelaskan implikasi bisnis yang relevan.

Jangan menggunakan bullet point atau format JSON.
"""

def build_prompt_simulator(payload: dict) -> str:
    return f"""Kamu adalah analis bisnis retail FMCG. Berikut hasil simulasi what-if pricing (perubahan diskon) untuk satu SKU, termasuk dampaknya ke SKU lain (cannibalization):

{_to_json(payload)}

Tugas: Tulis 1 paragraf insight (3-5 kalimat, Bahasa Indonesia, profesional tapi mudah dipahami) yang menjelaskan apakah skenario diskon ini worth it secara revenue, SKU mana yang paling terdampak cannibalization, dan rekomendasi langkah selanjutnya. Langsung paragraf naratif, JANGAN pakai format JSON atau bullet point."""


_CONTEXT_PROMPT_BUILDERS = {
    "dashboard": build_prompt_dashboard,
    "analysis":  build_prompt_analysis,
    "simulator": build_prompt_simulator,
}


def generate_context_insight(context: str, payload: dict) -> dict:
    builder = _CONTEXT_PROMPT_BUILDERS.get(context)
    if not builder:
        return {"success": False, "error": f"Context insight '{context}' tidak dikenal."}
    prompt = builder(payload or {})
    return _call_gemini(prompt, temperature=0.4, max_output_tokens=400)


def get_status() -> dict:
    """Dipakai endpoint /api/ai/status — info non-sensitif buat ditampilkan di Settings."""
    return {
        "provider": "Google Gemini",
        "model": GEMINI_MODEL,
        "configured": bool(GEMINI_API_KEY),
    }
