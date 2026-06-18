"""
AI Recommendation — menggunakan local LLM via Ollama.

Setup Ollama (sekali saja):
    1. Install dari https://ollama.com
    2. Jalankan: ollama pull llama3.1
    3. Ollama otomatis serve di http://localhost:11434

Kalau Ollama tidak jalan, endpoint akan return error yang jelas
(bukan crash) supaya frontend bisa kasih fallback message.
"""

import json
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.1"  # ganti sesuai model yang sudah di-pull, misal "mistral", "qwen2.5"


def build_prompt(cannibalization: dict, did: dict, forecast: dict) -> str:
    """Susun prompt ringkas berisi hasil analisis untuk diringkas LLM."""

    canni_pairs = [
        r for r in cannibalization.get("results", [])
        if r["verdict"] == "CANNIBALIZATION" and r["reliability"] == "RELIABLE"
    ][:5]

    did_pairs = did.get("significant", [])[:5]

    top_forecast = forecast.get("per_sku", [])[:5]

    context = {
        "cannibalization_summary": cannibalization.get("summary"),
        "top_cannibalization_pairs": [
            {
                "from": r["sku_a_name"], "to": r["sku_b_name"],
                "elasticity": r["coef_disc_a"], "p_value": r["p_value"],
            } for r in canni_pairs
        ],
        "revenue_impact_top": cannibalization.get("revenue_impact", [])[:5],
        "did_cross_validation": [
            {"from": d["sku_a_name"], "to": d["sku_b_name"], "effect_pct": d["did_pct"]}
            for d in did_pairs
        ],
        "forecast_summary": {
            "total_revenue_forecast": forecast.get("total_revenue_forecast"),
            "forecast_days": forecast.get("forecast_days"),
        },
        "top_forecast_sku": [
            {"sku": f["sku_name"], "revenue_forecast": f["revenue_forecast"]}
            for f in top_forecast
        ],
    }

    prompt = f"""Kamu adalah analis bisnis FMCG senior. Berikut hasil analisis cannibalization dan forecasting dari sebuah toko retail:

{json.dumps(context, indent=2, ensure_ascii=False)}

Tugas: Buat rekomendasi bisnis yang actionable dalam format JSON berikut (HANYA return JSON, tidak ada teks lain):

{{
  "summary": {{
    "summary": "1 kalimat ringkasan temuan utama",
    "potential_revenue_saved": "estimasi Rp per bulan jika rekomendasi dijalankan, format: RpXXXK/bulan",
    "sku_at_risk": "jumlah SKU yang perlu perhatian (angka + SKU, misal: 6 SKU)",
    "confidence": "95%"
  }},
  "recommendations": [
    {{
      "title": "Judul singkat rekomendasi (max 6 kata)",
      "severity": "HIGH atau MED atau LOW",
      "explanation": "Penjelasan 2-3 kalimat: mengapa ini terjadi dan apa dampaknya ke revenue",
      "action": "Langkah konkret yang bisa dilakukan tim marketing minggu ini",
      "impact": "Estimasi dampak revenue jika dijalankan, misal: Hemat Rp38K/hari"
    }}
  ]
}}

Buat 3-5 rekomendasi. Severity HIGH untuk cannibalization >Rp30K/hari, MED untuk Rp10K-30K/hari, LOW untuk komplemen/bundling opportunity. Bahasa Indonesia, profesional tapi mudah dipahami tim bisnis."""

    return prompt


def generate_recommendation(cannibalization: dict, did: dict, forecast: dict) -> dict:
    prompt = build_prompt(cannibalization, did, forecast)

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"success": True, "text": data.get("response", "").strip()}
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "Tidak bisa terhubung ke Ollama (http://localhost:11434). "
                     "Pastikan Ollama sudah running: `ollama serve` "
                     "dan model sudah di-pull: `ollama pull llama3.1`.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
