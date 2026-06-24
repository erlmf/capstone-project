"""
Cannibalization & Forecast Analysis API — v3.3
================================================
Perubahan v3.3 dari v3.2:
  - Forecasting (XGBoost) diganti dari "1 model per branch, SKU sebagai identity
    categorical" -> "1 model global, SKU_Category + Branch sebagai fitur".
    Tujuan: model bisa generalize ke SKU baru / branch baru yang tidak ada di
    training data, selama histori Qty-nya cukup panjang dan SKU_Category /
    Branch-nya dikenal model.
  - Ditambahkan fallback naive baseline (rolling average) untuk:
      a) SKU dengan histori < HISTORY_BUFFER_DAYS (tidak cukup untuk lag/roll)
      b) SKU_Category atau Branch yang tidak dikenal model (unseen di training)
    Sebelumnya kasus ini menyebabkan SKU/branch di-skip diam-diam -> kalau
    semua SKU di-skip, /forecast dan /simulate gagal total dengan 400.
  - run_forecast() dan build_base_forecast_table() (dipakai run_simulate)
    sekarang menggunakan model & meta yang sama: models/global.json +
    models/global_meta.pkl (lihat baseline_forecast.py versi global).

Patch di atas v3.3:
  - run_did(): loop ditambah per YearMonth (branch → month → pair),
    threshold b_data < 15 dan b_no_promo < 5 (selaras versi temen).
  - rev_impact dihitung pakai did_ab_pct dalam bentuk desimal
    (did_ab / baseline_mean_b), bukan persen, supaya skala rev_impact
    tidak meledak.

Cara run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8001
"""

import os
import pickle
import uuid
from collections import defaultdict
from itertools import permutations
from typing import Optional

from dotenv import load_dotenv
load_dotenv()  # baca file .env (kalau ada) SEBELUM modul lain (ai.py) baca os.environ

print(os.getenv("GEMINI_API_KEY"))

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats as scipy_stats
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from xgboost import XGBRegressor
import warnings

from database import Base, engine, get_db
import models
import auth
import ai

warnings.filterwarnings("ignore")

# ── Init DB ────────────────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)


def ensure_dataset_cache_columns():
    with engine.begin() as conn:
        existing = {
            row[1] for row in conn.execute(text("PRAGMA table_info(datasets)")).fetchall()
        }
        for column in ("elasticity_result", "matrix_result", "did_simulator_result", "context_insights"):
            if column not in existing:
                conn.execute(text(f"ALTER TABLE datasets ADD COLUMN {column} JSON"))


ensure_dataset_cache_columns()

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

app = FastAPI(title="Cannibalization & Forecast API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REQUIRED_COLUMNS = [
    "Date", "Branch", "SKU_ID", "SKU_Name", "SKU_Category",
    "Qty", "DiscountPercentage", "Revenue",
]


# ════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════
class RegisterRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if len(req.username) < 3 or len(req.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Username minimal 3 karakter, password minimal 6 karakter.",
        )
    existing = db.query(models.User).filter(models.User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username sudah dipakai.")
    user = models.User(
        username=req.username,
        hashed_password=auth.hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer", "username": user.username}


@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username atau password salah.")
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer", "username": user.username}


@app.get("/api/auth/me")
def me(current_user: models.User = Depends(auth.get_current_user)):
    return {"username": current_user.username, "user_id": current_user.id}


# ════════════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════════════
def validate_and_prepare(df: pd.DataFrame):
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Kolom wajib tidak ditemukan: {missing}. Kolom yang ada: {df.columns.tolist()}",
        )

    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date")

    if "IsPromo" not in df.columns:
        df["IsPromo"] = (df["DiscountPercentage"] > 0).astype(int)
    if "Year" not in df.columns:
        df["Year"] = df["Date"].dt.year
    if "Month" not in df.columns:
        df["Month"] = df["Date"].dt.month

    date_range_days = (df["Date"].max() - df["Date"].min()).days
    n_months = date_range_days / 30.4

    checks = []
    if n_months < 6:
        checks.append({"check": "Rentang Waktu", "status": "WARN",
                        "message": f"Dataset hanya {n_months:.1f} bulan. Forecasting butuh minimal 12 bulan."})
    elif n_months < 12:
        checks.append({"check": "Rentang Waktu", "status": "WARN",
                        "message": f"Dataset {n_months:.1f} bulan. Confidence interval lebar."})
    else:
        checks.append({"check": "Rentang Waktu", "status": "PASS",
                        "message": f"Dataset {n_months:.1f} bulan — cukup untuk forecasting."})

    if "DiscountedPrice" in df.columns:
        cv = df.groupby("SKU_ID")["DiscountedPrice"].agg(["mean", "std"])
        cv["cv_pct"] = (cv["std"] / cv["mean"] * 100).round(2)
        low_cv_skus = cv[cv["cv_pct"] < 10].index.tolist()
        if low_cv_skus:
            checks.append({"check": "Price Variation (CV)", "status": "WARN",
                            "message": f"{len(low_cv_skus)} SKU punya price CV < 10%: {low_cv_skus[:5]}{'...' if len(low_cv_skus) > 5 else ''}."})
        else:
            checks.append({"check": "Price Variation (CV)", "status": "PASS",
                            "message": "Semua SKU punya price CV >= 10%."})

    promo_pct = df.groupby("SKU_ID")["IsPromo"].mean() * 100
    too_low  = promo_pct[promo_pct < 5].index.tolist()
    too_high = promo_pct[promo_pct > 70].index.tolist()
    if too_low or too_high:
        msg_parts = []
        if too_low:  msg_parts.append(f"{len(too_low)} SKU promo <5% hari")
        if too_high: msg_parts.append(f"{len(too_high)} SKU promo >70% hari")
        checks.append({"check": "Frekuensi Promo", "status": "WARN", "message": "; ".join(msg_parts) + "."})
    else:
        checks.append({"check": "Frekuensi Promo", "status": "PASS",
                        "message": f"Promo frequency per SKU dalam rentang sehat ({promo_pct.min():.1f}% - {promo_pct.max():.1f}%)."})

    sku_by_category = {}
    for cat, grp in df.groupby("SKU_Category"):
        skus_in_cat = (
            grp[["SKU_ID", "SKU_Name"]]
            .drop_duplicates("SKU_ID")
            .sort_values("SKU_ID")
            .to_dict("records")
        )
        sku_by_category[str(cat)] = skus_in_cat

    summary = {
        "n_rows": len(df),
        "n_sku": df["SKU_ID"].nunique(),
        "n_branch": df["Branch"].nunique() if "Branch" in df.columns else 1,
        "date_min": str(df["Date"].min().date()),
        "date_max": str(df["Date"].max().date()),
        "n_months": round(n_months, 1),
        "categories": sorted(df["SKU_Category"].unique().tolist()),
        "sku_by_category": sku_by_category,
    }
    return df, checks, summary


def load_dataset_df(dataset: models.Dataset) -> pd.DataFrame:
    if not os.path.exists(dataset.storage_path):
        raise HTTPException(status_code=404, detail="File dataset tidak ditemukan di server.")
    df = pd.read_parquet(dataset.storage_path)
    df["Date"] = pd.to_datetime(df["Date"])
    return df


def build_daily_panel(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Date"] = pd.to_datetime(df["Date"])
    min_date = df["Date"].min()
    df["WeekNum"] = ((df["Date"] - min_date).dt.days // 7).astype(int)

    group_cols = ["Date", "WeekNum", "Branch", "SKU_ID", "SKU_Name", "SKU_Category"]
    if "Brand" in df.columns:
        group_cols.append("Brand")

    agg_kwargs = {
        "DailyQty": ("Qty", "sum"),
        "Revenue":  ("Revenue", "sum"),
        "Discount": ("DiscountPercentage", "first"),
        "IsPromo":  ("IsPromo", "max"),
    }
    if "DiscountedPrice" in df.columns:
        agg_kwargs["Price"] = ("DiscountedPrice", "first")

    daily = df.groupby(group_cols, as_index=False).agg(**agg_kwargs)

    if "Price" not in daily.columns:
        daily["Price"] = daily["Revenue"] / daily["DailyQty"].replace(0, np.nan)

    return daily


def get_owned_dataset(dataset_id: int, db: Session, user: models.User) -> models.Dataset:
    ds = db.query(models.Dataset).filter(
        models.Dataset.id == dataset_id, models.Dataset.owner_id == user.id
    ).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset tidak ditemukan.")
    return ds


# ════════════════════════════════════════════════════════════════════════════
# DATASET ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File harus berformat .csv")
    content = await file.read()
    try:
        df = pd.read_csv(pd.io.common.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca CSV: {e}")

    df, checks, summary = validate_and_prepare(df)

    file_id = str(uuid.uuid4())
    storage_path = os.path.join(STORAGE_DIR, f"{current_user.id}_{file_id}.parquet")
    df.to_parquet(storage_path, index=False)

    dataset = models.Dataset(
        owner_id=current_user.id,
        filename=file.filename,
        storage_path=storage_path,
        summary=summary,
        elasticity_result=None,
        did_result=None,
        matrix_result=None,
        forecast_result=None,
        ai_recommendation=None,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return {"dataset_id": dataset.id, "filename": dataset.filename, "summary": summary, "checks": checks}


def _enrich_summary_with_sku_by_category(d: "models.Dataset") -> dict:
    """Re-compute sku_by_category jika belum ada di summary (dataset lama)."""
    summary = dict(d.summary) if d.summary else {}
    if "sku_by_category" not in summary and os.path.exists(d.storage_path):
        try:
            df_tmp = pd.read_parquet(d.storage_path, columns=["SKU_ID", "SKU_Name", "SKU_Category"])
            sku_by_cat = {}
            for cat, grp in df_tmp.groupby("SKU_Category"):
                skus = (
                    grp[["SKU_ID", "SKU_Name"]]
                    .drop_duplicates("SKU_ID")
                    .sort_values("SKU_ID")
                    .to_dict("records")
                )
                sku_by_cat[str(cat)] = skus
            summary["sku_by_category"] = sku_by_cat
            d.summary = summary
        except Exception:
            pass
    return summary


@app.get("/api/datasets")
def list_datasets(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    datasets = db.query(models.Dataset).filter(models.Dataset.owner_id == current_user.id).all()
    result = []
    for d in datasets:
        summary = _enrich_summary_with_sku_by_category(d)
        result.append({
            "dataset_id": d.id,
            "filename": d.filename,
            "summary": summary,
            "uploaded_at": d.uploaded_at.isoformat(),
            "has_elasticity": d.elasticity_result is not None,
            "has_did": d.did_result is not None,
            "has_matrix": d.matrix_result is not None,
            "has_cannibalization": d.matrix_result is not None,
            "has_forecast": d.forecast_result is not None,
            "context_insights": d.context_insights or {},
        })
    db.commit()
    return result


@app.get("/api/datasets/{dataset_id}/results")
def get_dataset_results(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    return {
        "dataset_id":        ds.id,
        "did":               ds.did_result,
        "did_simulator":     ds.did_simulator_result,
        "forecast":          ds.forecast_result,
        "ai_recommendation": ds.ai_recommendation,
        "context_insights":  ds.context_insights or {},
        "has_did":           ds.did_result is not None,
        "has_did_simulator": ds.did_simulator_result is not None,
        "has_forecast":      ds.forecast_result is not None,
        "has_cannibalization": ds.matrix_result is not None,
    }


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    if os.path.exists(ds.storage_path):
        os.remove(ds.storage_path)
    db.delete(ds)
    db.commit()
    return {"deleted": True}


def build_category_trend_payload(df: pd.DataFrame, granularity: str) -> dict:
    freq = "W-MON" if granularity == "week" else "MS"
    period_format = "%Y-W%U" if granularity == "week" else "%Y-%m"

    data = df.copy()
    data["Date"] = pd.to_datetime(data["Date"])
    if "IsPromo" not in data.columns:
        data["IsPromo"] = (data["DiscountPercentage"] > 0).astype(int)

    grouped = (
        data.groupby([pd.Grouper(key="Date", freq=freq), "SKU_Category"])
        .agg(
            qty=("Qty", "sum"),
            revenue=("Revenue", "sum"),
            promo_rows=("IsPromo", "sum"),
            rows=("IsPromo", "count"),
            avg_discount=("DiscountPercentage", "mean"),
            active_sku=("SKU_ID", "nunique"),
        )
        .reset_index()
        .rename(columns={"SKU_Category": "category"})
    )
    grouped["period"] = grouped["Date"].dt.strftime(period_format)
    grouped["promo_rate"] = grouped["promo_rows"] / grouped["rows"].clip(lower=1)
    grouped = grouped.sort_values(["Date", "category"])

    category_summary = []
    for category, grp in grouped.groupby("category"):
        first = grp.iloc[0]
        last  = grp.iloc[-1]
        revenue_growth = 0.0 if first["revenue"] == 0 else (last["revenue"] - first["revenue"]) / first["revenue"]
        qty_growth     = 0.0 if first["qty"] == 0 else (last["qty"] - first["qty"]) / first["qty"]
        promo_delta    = last["promo_rate"] - first["promo_rate"]
        avg_promo_rate = grp["promo_rate"].mean()
        avg_discount   = grp["avg_discount"].mean()
        risk_score = (
            max(avg_promo_rate, 0) * 45
            + max(avg_discount, 0) * 35
            + max(promo_delta, 0) * 20
            + max(-revenue_growth, 0) * 25
        )
        category_summary.append({
            "category":      str(category),
            "periods":       int(len(grp)),
            "total_qty":     int(round(float(grp["qty"].sum()))),
            "total_revenue": round(float(grp["revenue"].sum()), 0),
            "avg_promo_rate":round(float(avg_promo_rate), 4),
            "avg_discount":  round(float(avg_discount), 4),
            "promo_delta":   round(float(promo_delta), 4),
            "revenue_growth":round(float(revenue_growth), 4),
            "qty_growth":    round(float(qty_growth), 4),
            "active_sku":    int(grp["active_sku"].max()),
            "risk_score":    round(float(risk_score), 2),
        })

    category_summary.sort(key=lambda x: x["risk_score"], reverse=True)
    top_category = category_summary[0]["category"] if category_summary else None

    highlights = []
    if category_summary:
        highest_promo   = max(category_summary, key=lambda x: x["avg_promo_rate"])
        fastest_promo   = max(category_summary, key=lambda x: x["promo_delta"])
        weakest_revenue = min(category_summary, key=lambda x: x["revenue_growth"])
        highlights = [
            {"title": "Promo paling intens",  "category": highest_promo["category"],
             "value": f"{highest_promo['avg_promo_rate'] * 100:.1f}%",
             "detail": "Rata-rata promo rate tertinggi di dataset."},
            {"title": "Promo naik tercepat",  "category": fastest_promo["category"],
             "value": f"{fastest_promo['promo_delta'] * 100:+.1f} pp",
             "detail": "Kenaikan promo rate dari periode awal ke akhir."},
            {"title": "Revenue paling lemah", "category": weakest_revenue["category"],
             "value": f"{weakest_revenue['revenue_growth'] * 100:+.1f}%",
             "detail": "Growth revenue periode awal ke akhir."},
        ]

    series = [
        {
            "period":       row["period"],
            "category":     row["category"],
            "qty":          int(round(float(row["qty"]))),
            "revenue":      round(float(row["revenue"]), 0),
            "promo_rate":   round(float(row["promo_rate"]), 4),
            "avg_discount": round(float(row["avg_discount"]), 4),
            "active_sku":   int(row["active_sku"]),
        }
        for _, row in grouped.iterrows()
    ]

    return {
        "granularity":     granularity,
        "top_category":    top_category,
        "category_summary":category_summary,
        "highlights":      highlights,
        "series":          series,
    }


@app.get("/api/datasets/{dataset_id}/category-trends")
def category_trends(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)
    n_months = ds.summary.get("n_months", 0) if ds.summary else 0
    return {
        "recommended_granularity": "month" if n_months >= 9 else "week",
        "week":  build_category_trend_payload(df, "week"),
        "month": build_category_trend_payload(df, "month"),
    }


# ════════════════════════════════════════════════════════════════════════════
# OWN-PRICE ELASTICITY
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/elasticity")
def run_elasticity(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)
    daily = build_daily_panel(df)

    results = []
    for sku_id, grp in daily.groupby("SKU_ID"):
        grp = grp[(grp["Price"] > 0) & (grp["DailyQty"] > 0)].copy()
        if len(grp) < 30:
            continue
        grp["ln_qty"]   = np.log(grp["DailyQty"])
        grp["ln_price"] = np.log(grp["Price"])
        try:
            model = smf.ols("ln_qty ~ ln_price", data=grp).fit()
            beta  = model.params.get("ln_price")
            pval  = model.pvalues.get("ln_price")
            if beta is None:
                continue
            results.append({
                "sku_id":         sku_id,
                "sku_name":       grp["SKU_Name"].iloc[0],
                "category":       grp["SKU_Category"].iloc[0],
                "own_elasticity": round(float(beta), 4),
                "p_value":        round(float(pval), 4),
                "r_squared":      round(float(model.rsquared), 4),
                "n_obs":          int(len(grp)),
            })
        except Exception:
            continue

    if not results:
        raise HTTPException(status_code=400, detail="Tidak ada SKU dengan data cukup untuk estimasi elasticity.")

    output = {
        "summary":   {"n_sku": len(results)},
        "results":   results,
        "timestamp": pd.Timestamp.now().isoformat(),
    }
    ds.elasticity_result = output
    db.commit()
    return output


# ════════════════════════════════════════════════════════════════════════════
# CANNIBALIZATION DETECTION  (DiD per branch + per month)
# ════════════════════════════════════════════════════════════════════════════
class MatrixRequest(BaseModel):
    agg: str = "mean"


class DidRequest(BaseModel):
    p_threshold:    float = 0.05
    min_promo_days: int   = 10
    max_coef:       float = 1.0


@app.post("/api/datasets/{dataset_id}/did")
def run_did(
    dataset_id: int,
    req: Optional[DidRequest] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    req = req or DidRequest()

    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    sku_category_map = df.groupby("SKU_ID")["SKU_Category"].first().to_dict()
    sku_name_map     = df.groupby("SKU_ID")["SKU_Name"].first().to_dict()
    daily_rev        = df.groupby("SKU_ID")["Revenue"].mean().to_dict()

    daily = (
        df.groupby(["Date", "Branch", "SKU_ID", "SKU_Category"])["Qty"]
        .sum()
        .reset_index()
        .rename(columns={"Qty": "DailyQty"})
    )
    promo_flag = (
        df.groupby(["Date", "Branch", "SKU_ID"])["IsPromo"]
        .max()
        .reset_index()
    )
    daily = daily.merge(promo_flag, on=["Date", "Branch", "SKU_ID"])
    daily["WeekNum"]   = (daily["Date"] - daily["Date"].min()).dt.days // 7
    daily["YearMonth"] = daily["Date"].dt.to_period("M")

    skus       = daily["SKU_ID"].unique()
    branches   = daily["Branch"].unique()
    months     = sorted(daily["YearMonth"].unique())
    n_branches = len(branches)
    records    = []

    for branch in branches:
        branch_data = daily[daily["Branch"] == branch].copy()

        for month in months:
            month_data = branch_data[branch_data["YearMonth"] == month].copy()

            for sku_a in skus:
                a_data = month_data[month_data["SKU_ID"] == sku_a][
                    ["Date", "WeekNum", "IsPromo", "DailyQty"]
                ].copy()

                promo_days_a    = set(a_data[a_data["IsPromo"] == 1]["Date"])
                no_promo_days_a = set(a_data[a_data["IsPromo"] == 0]["Date"])

                if len(promo_days_a) < req.min_promo_days:
                    continue

                for sku_b in skus:
                    if sku_a == sku_b:
                        continue
                    if sku_category_map.get(sku_a) != sku_category_map.get(sku_b):
                        continue

                    b_data = month_data[month_data["SKU_ID"] == sku_b][
                        ["Date", "WeekNum", "IsPromo", "DailyQty"]
                    ].copy()

                    if len(b_data) < 15:
                        continue

                    no_promo_days_b = set(b_data[b_data["IsPromo"] == 0]["Date"])
                    clean_days      = no_promo_days_a & no_promo_days_b
                    b_no_promo      = b_data[b_data["Date"].isin(clean_days)].copy()

                    if len(b_no_promo) < 5:
                        continue

                    try:
                        baseline_model = smf.ols("DailyQty ~ WeekNum", data=b_no_promo).fit()
                    except Exception:
                        continue

                    b_data = b_data.copy()
                    b_data["BaselineDemand"] = baseline_model.predict(b_data)
                    b_data["Residual_B"]     = b_data["DailyQty"] - b_data["BaselineDemand"]

                    residual_treatment = b_data[b_data["Date"].isin(promo_days_a)]["Residual_B"].dropna()
                    residual_control   = b_data[b_data["Date"].isin(clean_days)]["Residual_B"].dropna()

                    if len(residual_treatment) < 5 or len(residual_control) < 5:
                        continue

                    did_ab = float(residual_treatment.mean() - residual_control.mean())

                    # did_ab_pct dalam desimal (sama persis dengan versi temen)
                    baseline_mean_b    = float(b_data["BaselineDemand"].mean())
                    did_ab_pct_decimal = (did_ab / baseline_mean_b) if baseline_mean_b > 0 else None

                    _, p_one = scipy_stats.ttest_ind(
                        residual_treatment, residual_control,
                        equal_var=False, alternative="less",
                    )

                    a_promo_data = a_data[a_data["Date"].isin(promo_days_a)].copy()
                    a_clean      = a_data[a_data["Date"].isin(clean_days)].copy()

                    cannib_coef = None
                    raw_coef    = None
                    if len(a_promo_data) > 0 and len(a_clean) > 0:
                        mean_uplift_a = (
                            a_promo_data["DailyQty"].mean() - a_clean["DailyQty"].mean()
                        )
                        if mean_uplift_a > 0:
                            raw_coef    = abs(did_ab) / mean_uplift_a
                            cannib_coef = min(raw_coef, req.max_coef)

                    # rev_impact: daily_rev × rasio desimal (selaras versi temen)
                    rev_impact = None
                    if did_ab_pct_decimal is not None:
                        rev_impact = round(float(daily_rev.get(sku_b, 0)) * did_ab_pct_decimal, 0)

                    records.append({
                        "branch":         branch,
                        "year_month":     str(month),
                        "sku_a":          sku_a,
                        "sku_a_name":     sku_name_map.get(sku_a, sku_a),
                        "sku_b":          sku_b,
                        "sku_b_name":     sku_name_map.get(sku_b, sku_b),
                        "category":       sku_category_map.get(sku_a, ""),
                        "did_ab":         round(did_ab, 4),
                        # did_ab_pct disimpan dalam % untuk display
                        "did_ab_pct":     round(float(did_ab_pct_decimal) * 100, 2) if did_ab_pct_decimal is not None else None,
                        "p_value":        round(float(p_one), 4),
                        "cannib_coef":    round(float(cannib_coef), 4) if cannib_coef is not None else None,
                        "is_capped":      bool(raw_coef is not None and raw_coef > req.max_coef),
                        "confirmed":      bool(p_one < req.p_threshold and did_ab < 0),
                        "baseline_rev_b": round(float(daily_rev.get(sku_b, 0)), 0),
                        "rev_impact":     rev_impact,
                        "n_treatment":    int(len(residual_treatment)),
                        "n_control":      int(len(residual_control)),
                    })

    if not records:
        raise HTTPException(status_code=400, detail="Tidak cukup data untuk estimasi DiD.")

    confirmed        = [r for r in records if r["confirmed"]]
    confirmed_sorted = sorted(confirmed, key=lambda x: x["did_ab"])

    total_revenue_at_risk = round(
        sum(abs(r["rev_impact"]) for r in confirmed if r["rev_impact"] is not None), 0
    )

    output = {
        "summary": {
            "total_pairs":                 len(records),
            "significant_cannibalization": len(confirmed),
            "p_threshold":                 req.p_threshold,
            "min_promo_days":              req.min_promo_days,
            "max_coef":                    req.max_coef,
            "n_branches":                  int(n_branches),
            "total_revenue_at_risk":       total_revenue_at_risk,
        },
        "results":     records,
        "confirmed":   confirmed_sorted,
        "significant": confirmed_sorted,
        "timestamp":   pd.Timestamp.now().isoformat(),
    }

    ds.did_result    = output
    ds.matrix_result = None
    db.commit()
    return output


@app.post("/api/datasets/{dataset_id}/cannibalization/matrix")
def build_matrix(
    dataset_id: int,
    req: Optional[MatrixRequest] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    req = req or MatrixRequest()

    ds = get_owned_dataset(dataset_id, db, current_user)
    if not ds.did_result:
        raise HTTPException(
            status_code=400,
            detail="Jalankan analisis DiD (/did) terlebih dahulu sebelum build matrix.",
        )

    df   = load_dataset_df(ds)
    skus = sorted(df["SKU_ID"].unique().tolist())

    confirmed_records = [r for r in ds.did_result.get("confirmed", []) if r.get("cannib_coef") is not None]

    pair_coefs = defaultdict(list)
    for r in confirmed_records:
        pair_coefs[(r["sku_a"], r["sku_b"])].append(r["cannib_coef"])

    matrix = {a: {b: 0.0 for b in skus} for a in skus}
    for (sku_a, sku_b), coefs in pair_coefs.items():
        if sku_a in matrix and sku_b in matrix[sku_a]:
            matrix[sku_a][sku_b] = round(float(np.mean(coefs)), 4)

    n_confirmed_pairs = len(pair_coefs)

    output = {
        "skus":              skus,
        "matrix":            matrix,
        "agg":               "mean_across_branches",
        "n_confirmed_pairs": n_confirmed_pairs,
        "timestamp":         pd.Timestamp.now().isoformat(),
    }

    ds.matrix_result = output
    db.commit()
    return output


# ════════════════════════════════════════════════════════════════════════════
# FORECASTING (XGBoost — GLOBAL MODEL, v3.3)
# ════════════════════════════════════════════════════════════════════════════
class ForecastRequest(BaseModel):
    forecast_days: int = 90


MODEL_DIR         = os.path.join(os.path.dirname(__file__), "models")
GLOBAL_MODEL_PATH = os.path.join(MODEL_DIR, "global.json")
GLOBAL_META_PATH  = os.path.join(MODEL_DIR, "global_meta.pkl")

LAGS                = [1, 7, 14, 28, 56]
ROLL_WINDOWS        = [7, 14, 28]
HISTORY_BUFFER_DAYS = max(LAGS + ROLL_WINDOWS) + 7


def load_global_model():
    if not os.path.exists(GLOBAL_MODEL_PATH) or not os.path.exists(GLOBAL_META_PATH):
        raise HTTPException(
            status_code=503,
            detail="Model global (models/global.json) tidak ditemukan. Jalankan baseline_forecast.py dulu.",
        )
    model = XGBRegressor()
    model.load_model(GLOBAL_MODEL_PATH)
    with open(GLOBAL_META_PATH, "rb") as f:
        meta = pickle.load(f)
    return model, meta


def build_features_for_inference(daily: pd.DataFrame) -> pd.DataFrame:
    GROUP_COLS = ["SKU", "Branch"]
    daily = daily.sort_values(GROUP_COLS + ["Date"]).copy()

    daily["day_of_week"]  = daily["Date"].dt.dayofweek
    daily["week_of_year"] = daily["Date"].dt.isocalendar().week.astype(int)
    daily["month"]        = daily["Date"].dt.month
    daily["year"]         = daily["Date"].dt.year
    daily["day_of_year"]  = daily["Date"].dt.dayofyear

    grouped_qty = daily.groupby(GROUP_COLS)["Qty"]
    for lag in LAGS:
        daily[f"lag{lag}"] = grouped_qty.shift(lag)

    shifted = grouped_qty.shift(1)
    for window in ROLL_WINDOWS:
        roll = shifted.groupby([daily["SKU"], daily["Branch"]])
        daily[f"roll{window}_mean"] = roll.transform(lambda x: x.rolling(window).mean())
        daily[f"roll{window}_std"]  = roll.transform(lambda x: x.rolling(window).std())

    if "Price" not in daily.columns:
        daily["Price"] = daily["Revenue"] / daily["Qty"].replace(0, np.nan)
    daily["price_log"] = np.log1p(daily["Price"].clip(lower=0))

    cat_avg_price = daily.groupby("SKU_Category")["Price"].transform("mean")
    daily["price_rel_to_category"] = daily["Price"] / cat_avg_price.replace(0, np.nan)

    return daily


def naive_baseline_forecast(qty_history: pd.Series, sku_id, sku_name, branch,
                             forecast_start: pd.Timestamp, n_days: int, window: int = 28) -> list:
    recent    = qty_history.tail(window)
    daily_avg = float(recent.mean()) if len(recent) > 0 else 0.0

    rows = []
    for day_offset in range(n_days):
        forecast_week = (day_offset // 7) + 1
        rows.append({
            "SKU_ID": sku_id, "SKU": sku_name, "Branch": branch,
            "ForecastWeek": forecast_week, "BaseForecast": daily_avg,
        })
    return rows


def build_base_forecast_table(df: pd.DataFrame, forecast_days: int = 28) -> pd.DataFrame:
    model, meta   = load_global_model()
    features      = meta["features"]
    category_list = meta["category_list"]
    branch_list   = meta["branch_list"]

    work = df.copy()
    if "SKU_Name" in work.columns and "SKU" not in work.columns:
        work = work.rename(columns={"SKU_Name": "SKU"})
    work["Branch"] = work["Branch"].astype(str).str.strip().str.title()

    daily = (
        work.groupby(["Date", "Branch", "SKU_ID", "SKU", "SKU_Category"])
        .agg(Qty=("Qty", "sum"), Revenue=("Revenue", "sum"), IsPromo=("IsPromo", "max"))
        .reset_index()
    )
    daily["Date"] = pd.to_datetime(daily["Date"])

    last_date      = daily["Date"].max()
    forecast_start = last_date + pd.Timedelta(days=1)
    n_days         = max(1, min(forecast_days, 28))

    daily_no_promo = daily[daily["IsPromo"] == 0].copy() if "IsPromo" in daily.columns else daily.copy()
    daily_feat     = build_features_for_inference(daily_no_promo)

    future_rows = []

    for branch in sorted(daily["Branch"].unique()):
        branch_raw_hist = daily_no_promo[daily_no_promo["Branch"] == branch]

        for sku_id in sorted(daily[daily["Branch"] == branch]["SKU_ID"].unique()):
            sku_rows = daily[(daily["SKU_ID"] == sku_id) & (daily["Branch"] == branch)]
            if sku_rows.empty:
                continue
            sku_name     = sku_rows["SKU"].iloc[0]
            sku_category = sku_rows["SKU_Category"].iloc[0]

            sku_hist_feat = daily_feat[
                (daily_feat["SKU"] == sku_name) & (daily_feat["Branch"] == branch)
            ].sort_values("Date")
            sku_hist_raw = branch_raw_hist[branch_raw_hist["SKU"] == sku_name].sort_values("Date")

            category_known = sku_category in category_list
            branch_known   = branch in branch_list
            enough_history = len(sku_hist_feat) >= HISTORY_BUFFER_DAYS

            if not (category_known and branch_known and enough_history):
                future_rows.extend(naive_baseline_forecast(
                    sku_hist_raw["Qty"], sku_id, sku_name, branch, forecast_start, n_days
                ))
                continue

            history = sku_hist_feat.copy()
            for day_offset in range(n_days):
                target_date   = forecast_start + pd.Timedelta(days=day_offset)
                forecast_week = (day_offset // 7) + 1

                qty_series   = history["Qty"].values
                price_series = (history["Revenue"] / history["Qty"].replace(0, np.nan)).values

                row = {
                    "Date": target_date, "Branch": branch, "SKU": sku_name, "SKU_Category": sku_category,
                    "day_of_week": target_date.dayofweek, "week_of_year": target_date.isocalendar()[1],
                    "month": target_date.month, "year": target_date.year,
                    "day_of_year": target_date.timetuple().tm_yday,
                }
                for lag in LAGS:
                    row[f"lag{lag}"] = float(qty_series[-lag]) if len(qty_series) >= lag else np.nan
                for window in ROLL_WINDOWS:
                    if len(qty_series) >= 1:
                        row[f"roll{window}_mean"] = float(np.mean(qty_series[-window:])) if len(qty_series) >= window else float(np.mean(qty_series))
                        row[f"roll{window}_std"]  = float(np.std(qty_series[-window:]))  if len(qty_series) >= window else float(np.std(qty_series))
                    else:
                        row[f"roll{window}_mean"] = np.nan
                        row[f"roll{window}_std"]  = np.nan

                last_price = float(price_series[-1]) if len(price_series) > 0 and not np.isnan(price_series[-1]) else 0.0
                row["price_log"] = np.log1p(max(last_price, 0))
                row["price_rel_to_category"] = 1.0

                row_df = pd.DataFrame([row])
                row_df["SKU_Category"] = pd.Categorical(row_df["SKU_Category"], categories=category_list)
                row_df["Branch"]       = pd.Categorical(row_df["Branch"], categories=branch_list)
                for feat in features:
                    if feat not in row_df.columns:
                        row_df[feat] = np.nan

                pred_qty = float(np.clip(model.predict(row_df[features])[0], 0, None))

                history = pd.concat([history, pd.DataFrame([{
                    "Date": target_date, "Branch": branch, "SKU": sku_name, "SKU_Category": sku_category,
                    "Qty": pred_qty, "Revenue": pred_qty * last_price, "IsPromo": 0,
                }])], ignore_index=True)

                future_rows.append({
                    "SKU_ID": sku_id, "SKU": sku_name, "Branch": branch,
                    "ForecastWeek": forecast_week, "BaseForecast": pred_qty,
                })

    if not future_rows:
        raise HTTPException(status_code=400, detail="Tidak ada base forecast yang berhasil.")

    return (
        pd.DataFrame(future_rows)
        .groupby(["SKU_ID", "SKU", "Branch", "ForecastWeek"], as_index=False)
        .agg(BaseForecast=("BaseForecast", "sum"))
    )


@app.post("/api/datasets/{dataset_id}/forecast")
def run_forecast(
    dataset_id: int,
    req: ForecastRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    n_days     = max(1, min(req.forecast_days, 365))
    all_blocks = []
    remaining  = n_days
    df_running = df.copy()

    while remaining > 0:
        block_days = min(28, remaining)
        block = build_base_forecast_table(df_running, forecast_days=block_days)
        all_blocks.append(block)
        remaining -= block_days

    base_forecast = (
        pd.concat(all_blocks, ignore_index=True)
        .groupby(["SKU_ID", "SKU", "Branch"], as_index=False)
        .agg(qty_forecast=("BaseForecast", "sum"))
    )

    work = df.copy()
    if "SKU_Name" in work.columns and "SKU" not in work.columns:
        work = work.rename(columns={"SKU_Name": "SKU"})
    work["Branch"] = work["Branch"].astype(str).str.strip().str.title()

    daily = (
        work.groupby(["Date", "Branch", "SKU_ID", "SKU", "SKU_Category"])
        .agg(Qty=("Qty", "sum"), Revenue=("Revenue", "sum"))
        .reset_index()
    )
    last_date      = pd.to_datetime(daily["Date"]).max()
    forecast_start = last_date + pd.Timedelta(days=1)

    sku_meta = (
        daily.groupby(["SKU_ID", "SKU", "SKU_Category"])
        .agg(total_rev=("Revenue", "sum"), total_qty=("Qty", "sum"))
        .reset_index()
    )
    sku_meta["avg_price"] = sku_meta["total_rev"] / sku_meta["total_qty"].clip(lower=1)

    forecast_summary = []
    for sku_id in sorted(base_forecast["SKU_ID"].unique()):
        sku_fc   = base_forecast[base_forecast["SKU_ID"] == sku_id]
        sku_info = sku_meta[sku_meta["SKU_ID"] == sku_id]
        if sku_info.empty:
            continue
        sku_name  = sku_info.iloc[0]["SKU"]
        category  = sku_info.iloc[0]["SKU_Category"]
        avg_price = float(sku_info.iloc[0]["avg_price"])
        qty_total = float(sku_fc["qty_forecast"].sum())
        rev_total = round(qty_total * avg_price, 0)

        forecast_summary.append({
            "sku_id":           sku_id,
            "sku_name":         sku_name,
            "category":         category,
            "qty_forecast":     int(round(qty_total)),
            "qty_lower":        int(round(qty_total * 0.85)),
            "qty_upper":        int(round(qty_total * 1.15)),
            "revenue_forecast": rev_total,
        })

    forecast_summary.sort(key=lambda x: x["revenue_forecast"], reverse=True)
    output = {
        "forecast_days":           n_days,
        "forecast_start":          forecast_start.strftime("%Y-%m-%d"),
        "yearly_seasonality_used": False,
        "model_type":              "XGBoost (global model, SKU_Category + Branch features)",
        "total_revenue_forecast":  round(sum(f["revenue_forecast"] for f in forecast_summary), 0),
        "per_sku":                 forecast_summary,
    }
    ds.forecast_result = output
    db.commit()
    return output


# ════════════════════════════════════════════════════════════════════════════
# AI RECOMMENDATION
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/ai-recommendation")
def ai_recommendation(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    if not ds.did_result or not ds.matrix_result or not ds.forecast_result:
        raise HTTPException(status_code=400, detail="Jalankan DiD, matrix, dan forecast terlebih dahulu.")

    result = ai.generate_recommendation(did=ds.did_result, matrix=ds.matrix_result, forecast=ds.forecast_result)
    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"])

    ds.ai_recommendation = result["text"]
    db.commit()
    return {"recommendation": result["text"]}


class AIInsightRequest(BaseModel):
    context: str       # "dashboard" | "analysis" | "simulator"
    data: dict = {}


@app.post("/api/datasets/{dataset_id}/ai-insight")
def ai_insight(
    dataset_id: int,
    req: AIInsightRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Insight AI kecil & kontekstual, dipanggil dari card 'AI Insight' di tiap menu
    (Dashboard / Analisis / Simulator). Berbeda dari /ai-recommendation yang
    menggabungkan semua hasil analisis jadi rekomendasi besar dan terstruktur,
    endpoint ini hanya menjelaskan data yang sedang dilihat user di halaman itu."""
    ds = get_owned_dataset(dataset_id, db, current_user)

    result = ai.generate_context_insight(req.context, req.data)
    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"])

    insights = dict(ds.context_insights or {})
    insights[req.context] = result["text"]
    ds.context_insights = insights
    db.commit()

    return {"insight": result["text"]}


@app.get("/api/ai/status")
def ai_status(current_user: models.User = Depends(auth.get_current_user)):
    """Info non-sensitif soal provider/model AI yang aktif, dipakai di halaman Settings."""
    return ai.get_status()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ════════════════════════════════════════════════════════════════════════════
# WHAT-IF PRICING SIMULATOR
# ════════════════════════════════════════════════════════════════════════════
class SimulateRequest(BaseModel):
    sku_id:        str
    branch:        str
    discount_pct:  float
    forecast_week: int = 0


@app.post("/api/datasets/{dataset_id}/simulate")
def run_simulate(
    dataset_id: int,
    req: SimulateRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    if req.sku_id == "__meta__":
        return {"metadata": {
            "sku_list":    df[["SKU_ID", "SKU_Name", "SKU_Category"]].drop_duplicates().to_dict("records"),
            "branch_list": sorted(df["Branch"].unique().tolist()),
        }}

    if not ds.did_simulator_result:
        raise HTTPException(status_code=400, detail="Jalankan Analysis terlebih dahulu (DiD Simulator belum ada).")
    if not ds.forecast_result:
        raise HTTPException(status_code=400, detail="Jalankan Forecasting terlebih dahulu.")

    if req.branch != "all":
        df_branch = df[df["Branch"] == req.branch]
        if df_branch.empty:
            raise HTTPException(status_code=400, detail=f"Branch '{req.branch}' tidak ditemukan.")
    else:
        df_branch = df

    if req.sku_id not in df["SKU_ID"].unique():
        raise HTTPException(status_code=400, detail=f"SKU '{req.sku_id}' tidak ditemukan.")

    forecast_week = int(req.forecast_week or 0)
    if forecast_week < 0 or forecast_week > 4:
        raise HTTPException(status_code=400, detail="forecast_week harus 0 atau 1-4.")

    all_base_forecast = build_base_forecast_table(df, forecast_days=28)
    base_forecast = all_base_forecast.copy()
    if req.branch != "all":
        base_forecast = base_forecast[base_forecast["Branch"] == req.branch]
    if forecast_week != 0:
        base_forecast = base_forecast[base_forecast["ForecastWeek"] == forecast_week]
    if base_forecast.empty:
        raise HTTPException(status_code=400, detail="Base forecast tidak ditemukan.")

    sku_a_data  = df_branch[df_branch["SKU_ID"] == req.sku_id]
    sku_a_name  = sku_a_data["SKU_Name"].iloc[0]
    sku_a_cat   = sku_a_data["SKU_Category"].iloc[0]
    avg_price_a = sku_a_data["Revenue"].sum() / sku_a_data["Qty"].sum()

    promo_forecast_rows = base_forecast[base_forecast["SKU_ID"] == req.sku_id]
    if promo_forecast_rows.empty:
        raise HTTPException(status_code=400, detail="Forecast untuk SKU promo tidak ditemukan.")
    baseline_qty_a = float(promo_forecast_rows["BaseForecast"].sum())
    baseline_rev_a = baseline_qty_a * avg_price_a

    own_elas = 1.5
    try:
        df_a = df_branch[df_branch["SKU_ID"] == req.sku_id].copy()
        if len(df_a) >= 30:
            df_a["ln_qty"]   = np.log(df_a["Qty"] + 1)
            df_a["ln_price"] = np.log(df_a["Revenue"] / df_a["Qty"].replace(0, np.nan))
            df_a = df_a.replace([np.inf, -np.inf], np.nan).dropna(subset=["ln_qty", "ln_price"])
            if len(df_a) >= 30:
                m = smf.ols("ln_qty ~ ln_price", data=df_a).fit()
                est = float(m.params.get("ln_price", 1.5))
                own_elas = abs(est) if est != 0 else 1.5
    except Exception:
        own_elas = 1.5

    uplift_pct   = float(own_elas * req.discount_pct)
    uplift_qty   = baseline_qty_a * uplift_pct
    qty_a_new    = baseline_qty_a + uplift_qty
    rev_a_new    = qty_a_new * avg_price_a * (1 - req.discount_pct)
    rev_a_uplift = rev_a_new - baseline_rev_a

    coef_accum: dict = defaultdict(list)
    capped_accum: dict = defaultdict(list)
    for r in ds.did_simulator_result.get("significant", []):
        if r["sku_a"] == req.sku_id and r.get("cannib_coef") is not None:
            if req.branch != "all" and r["branch"] != req.branch:
                continue
            coef_accum[r["sku_b"]].append(r["cannib_coef"])
            capped_accum[r["sku_b"]].append(bool(r.get("is_capped", False)))

    cannib_pairs = {
        sku_b: float(np.mean(coefs))
        for sku_b, coefs in coef_accum.items()
    }

    # ── Precompute victim info once (reused for both current-discount calc
    #    and the break-even scan below) ─────────────────────────────────
    victims_info = []
    for sku_b_id, cann_coef in cannib_pairs.items():
        if cann_coef <= 0:
            continue
        sku_b_data = df_branch[df_branch["SKU_ID"] == sku_b_id]
        if sku_b_data.empty:
            continue
        victim_rows = base_forecast[base_forecast["SKU_ID"] == sku_b_id]
        if victim_rows.empty:
            continue
        victims_info.append({
            "sku_b_id":       sku_b_id,
            "sku_b_name":     sku_b_data["SKU_Name"].iloc[0],
            "cann_coef":      cann_coef,
            "avg_price_b":    sku_b_data["Revenue"].sum() / sku_b_data["Qty"].sum(),
            "baseline_qty_b": float(victim_rows["BaseForecast"].sum()),
            "is_capped":      any(capped_accum.get(sku_b_id, [])),
        })

    cannibalized   = []
    total_rev_lost = 0.0

    for v in victims_info:
        lost_qty   = uplift_qty * v["cann_coef"]
        qty_b_new  = max(v["baseline_qty_b"] - lost_qty, 0.0)
        rev_impact = (qty_b_new - v["baseline_qty_b"]) * v["avg_price_b"]
        total_rev_lost += rev_impact
        cannibalized.append({
            "sku_b_id":    str(v["sku_b_id"]),
            "sku_b_name":  str(v["sku_b_name"]),
            "cannib_coef": round(float(v["cann_coef"]), 4),
            "baseline_qty":round(float(v["baseline_qty_b"]), 1),
            "lost_qty":    round(float(lost_qty), 1),
            "new_qty":     round(float(qty_b_new), 1),
            "rev_impact":  round(float(rev_impact), 0),
            "is_capped":   bool(v["is_capped"]),
        })

    cannibalized.sort(key=lambda x: x["rev_impact"])
    net_revenue_impact = rev_a_uplift + total_rev_lost

    # ── Break-even discount ─────────────────────────────────────────────
    # Net Revenue Impact = rev_a_uplift(d) + total_rev_lost(d), dihitung
    # dengan model linear yang sama dipakai di atas (bukan exponential).
    # Scan d dari 0 -> 0.70 (range slider), cari batas atas discount di
    # mana net masih >= 0 (tepat sebelum dia jadi rugi).
    break_even_disc   = None
    always_worth_it   = False
    last_positive_d   = None
    for d in np.arange(0.0, 0.705, 0.005):
        d = float(d)
        scan_uplift_qty = baseline_qty_a * own_elas * d
        scan_qty_a_new  = baseline_qty_a + scan_uplift_qty
        scan_rev_a_new  = scan_qty_a_new * avg_price_a * (1 - d)
        scan_rev_uplift = scan_rev_a_new - baseline_rev_a

        scan_rev_lost = 0.0
        for v in victims_info:
            scan_lost_qty  = scan_uplift_qty * v["cann_coef"]
            scan_qty_b_new = max(v["baseline_qty_b"] - scan_lost_qty, 0.0)
            scan_rev_lost += (scan_qty_b_new - v["baseline_qty_b"]) * v["avg_price_b"]

        scan_net = scan_rev_uplift + scan_rev_lost
        if scan_net >= 0:
            last_positive_d = d
        elif last_positive_d is not None:
            break_even_disc = last_positive_d
            break

    if break_even_disc is None and last_positive_d is not None and last_positive_d >= 0.70:
        always_worth_it = True  # net masih >= 0 di seluruh range slider (0-70%)

    # ── Debug diagnostics: kenapa break-even bisa 0% ────────────────────
    # net'(0) sebanding dengan: avg_price_a*(own_elas-1) - own_elas*K
    # K = Σ (cannib_coef_b × avg_price_b) dari semua SKU yang kena dampak
    cannib_weight_K   = sum(v["cann_coef"] * v["avg_price_b"] for v in victims_info)
    marginal_term     = avg_price_a * (own_elas - 1) - own_elas * cannib_weight_K
    n_capped_pairs    = sum(1 for v in victims_info if v["is_capped"])

    weekly_projection = []
    weekly_base = all_base_forecast.copy()
    if req.branch != "all":
        weekly_base = weekly_base[weekly_base["Branch"] == req.branch]

    for week in range(1, 5):
        week_rows       = weekly_base[weekly_base["ForecastWeek"] == week]
        promo_week_rows = week_rows[week_rows["SKU_ID"] == req.sku_id]
        if promo_week_rows.empty:
            continue
        week_base_qty_a   = float(promo_week_rows["BaseForecast"].sum())
        week_uplift_qty   = week_base_qty_a * uplift_pct
        week_qty_a_new    = week_base_qty_a + week_uplift_qty
        week_baseline_rev = week_base_qty_a * avg_price_a
        week_rev_a_new    = week_qty_a_new * avg_price_a * (1 - req.discount_pct)
        week_total_rev_lost = 0.0
        for sku_b_id, cann_coef in cannib_pairs.items():
            if cann_coef <= 0:
                continue
            week_victim_rows = week_rows[week_rows["SKU_ID"] == sku_b_id]
            sku_b_data = df_branch[df_branch["SKU_ID"] == sku_b_id]
            if week_victim_rows.empty or sku_b_data.empty:
                continue
            avg_price_b         = sku_b_data["Revenue"].sum() / sku_b_data["Qty"].sum()
            week_baseline_qty_b = float(week_victim_rows["BaseForecast"].sum())
            week_lost_qty       = week_uplift_qty * cann_coef
            week_qty_b_new      = max(week_baseline_qty_b - week_lost_qty, 0.0)
            week_total_rev_lost += (week_qty_b_new - week_baseline_qty_b) * avg_price_b
        weekly_projection.append({
            "week":                 week,
            "baseline_revenue":     round(float(week_baseline_rev), 0),
            "promo_revenue":        round(float(week_rev_a_new + week_total_rev_lost), 0),
            "promo_sku_revenue":    round(float(week_rev_a_new), 0),
            "cannibalized_revenue": round(float(week_total_rev_lost), 0),
            "baseline_qty":         round(float(week_base_qty_a), 1),
            "promo_qty":            round(float(week_qty_a_new), 1),
        })

    return {
        "input": {
            "sku_id":        req.sku_id,
            "sku_name":      sku_a_name,
            "sku_category":  sku_a_cat,
            "branch":        req.branch,
            "discount_pct":  float(req.discount_pct),
            "forecast_week": int(forecast_week),
        },
        "sku_a_result": {
            "baseline_qty_daily": round(float(baseline_qty_a), 1),
            "baseline_rev_daily": round(float(baseline_rev_a), 0),
            "qty_new_daily":      round(float(qty_a_new), 1),
            "rev_new_daily":      round(float(rev_a_new), 0),
            "qty_uplift_pct":     round(float(uplift_pct) * 100, 2),
            "rev_uplift_daily":   round(float(rev_a_uplift), 0),
            "own_elasticity":     round(float(own_elas), 4),
        },
        "weekly_projection":      weekly_projection,
        "cannibalization_impact": cannibalized,
        "summary": {
            "total_rev_uplift_a":       round(float(rev_a_uplift), 0),
            "total_rev_lost":           round(float(total_rev_lost), 0),
            "net_revenue_impact":       round(float(net_revenue_impact), 0),
            "is_worth_it":              bool(net_revenue_impact > 0),
            "n_sku_cannibalized":       int(len(cannibalized)),
            "baseline_source":          "XGBoost BaseForecast (global model)",
            "analysis_timestamp":       ds.did_simulator_result.get("timestamp", "unknown"),
            "break_even_discount_pct":  round(break_even_disc * 100, 1) if break_even_disc is not None else None,
            "always_worth_it":          always_worth_it,
        },
        "debug": {
            "own_elasticity":         round(float(own_elas), 4),
            "total_cannib_weight_K":  round(float(cannib_weight_K), 2),
            "marginal_threshold":     round(float(marginal_term), 2),
            "marginal_note":          (
                "marginal_threshold < 0 -> net negatif sejak discount terkecil "
                "(kanibalisasi K terlalu besar dibanding own-uplift)"
                if marginal_term < 0 else
                "marginal_threshold >= 0 -> net masih positif di discount kecil"
            ),
            "n_sku_affected":         int(len(victims_info)),
            "n_capped_pairs":         int(n_capped_pairs),
        },
        "metadata": {
            "sku_list":    df[["SKU_ID", "SKU_Name", "SKU_Category"]].drop_duplicates().to_dict("records"),
            "branch_list": sorted(df["Branch"].unique().tolist()),
        },
    }


# ════════════════════════════════════════════════════════════════════════════
# DiD SIMULATOR  (full-period DiD tanpa loop bulan — untuk Simulator page)
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/did-simulator")
def run_did_simulator(
    dataset_id: int,
    p_threshold: float = 0.05,
    min_promo_days: int = 10,
    max_coef: float = 1.0,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    sku_category_map = df.groupby("SKU_ID")["SKU_Category"].first().to_dict()
    sku_name_map     = df.groupby("SKU_ID")["SKU_Name"].first().to_dict()

    daily = (
        df.groupby(["Date", "Branch", "SKU_ID", "SKU_Category"])["Qty"]
        .sum()
        .reset_index()
        .rename(columns={"Qty": "DailyQty"})
    )
    promo_flag = (
        df.groupby(["Date", "Branch", "SKU_ID"])["IsPromo"]
        .max()
        .reset_index()
    )
    daily = daily.merge(promo_flag, on=["Date", "Branch", "SKU_ID"])
    daily["WeekNum"] = (daily["Date"] - daily["Date"].min()).dt.days // 7

    skus     = daily["SKU_ID"].unique()
    branches = daily["Branch"].unique()
    records  = []

    for branch in branches:
        branch_data = daily[daily["Branch"] == branch].copy()

        for sku_a in skus:
            a_data = branch_data[branch_data["SKU_ID"] == sku_a][
                ["Date", "WeekNum", "IsPromo", "DailyQty"]
            ].copy()

            promo_days_a    = set(a_data[a_data["IsPromo"] == 1]["Date"])
            no_promo_days_a = set(a_data[a_data["IsPromo"] == 0]["Date"])

            if len(promo_days_a) < min_promo_days:
                continue

            for sku_b in skus:
                if sku_a == sku_b:
                    continue
                if sku_category_map[sku_a] != sku_category_map[sku_b]:
                    continue

                b_data = branch_data[branch_data["SKU_ID"] == sku_b][
                    ["Date", "WeekNum", "IsPromo", "DailyQty"]
                ].copy()

                if len(b_data) < 30:
                    continue

                no_promo_days_b = set(b_data[b_data["IsPromo"] == 0]["Date"])
                clean_days      = no_promo_days_a & no_promo_days_b
                b_no_promo      = b_data[b_data["Date"].isin(clean_days)].copy()

                if len(b_no_promo) < 10:
                    continue

                try:
                    baseline_model = smf.ols("DailyQty ~ WeekNum", data=b_no_promo).fit()
                except Exception:
                    continue

                b_data = b_data.copy()
                b_data["BaselineDemand"] = baseline_model.predict(b_data)
                b_data["Residual_B"]     = b_data["DailyQty"] - b_data["BaselineDemand"]

                residual_treatment = b_data[
                    b_data["Date"].isin(promo_days_a)
                ]["Residual_B"].dropna()

                residual_control = b_data[
                    b_data["Date"].isin(clean_days)
                ]["Residual_B"].dropna()

                if len(residual_treatment) < 5 or len(residual_control) < 5:
                    continue

                did_ab = float(residual_treatment.mean() - residual_control.mean())

                _, p_one = scipy_stats.ttest_ind(
                    residual_treatment,
                    residual_control,
                    equal_var=False,
                    alternative="less",
                )

                a_promo_data = a_data[a_data["Date"].isin(promo_days_a)].copy()
                a_clean      = a_data[a_data["Date"].isin(clean_days)].copy()

                cannib_coef = None
                raw_coef    = None
                if len(a_promo_data) > 0 and len(a_clean) > 0:
                    mean_uplift_a = (
                        a_promo_data["DailyQty"].mean()
                        - a_clean["DailyQty"].mean()
                    )
                    if mean_uplift_a > 0:
                        raw_coef    = abs(did_ab) / mean_uplift_a
                        cannib_coef = min(raw_coef, max_coef)

                records.append({
                    "branch":      branch,
                    "sku_a":       sku_a,
                    "sku_a_name":  sku_name_map.get(sku_a, sku_a),
                    "sku_b":       sku_b,
                    "sku_b_name":  sku_name_map.get(sku_b, sku_b),
                    "category":    sku_category_map[sku_a],
                    "did_ab":      round(did_ab, 4),
                    "p_value":     round(float(p_one), 4),
                    "cannib_coef": round(float(cannib_coef), 4) if cannib_coef is not None else None,
                    "is_capped":   bool(raw_coef is not None and raw_coef > max_coef),
                    "confirmed":   bool(p_one < p_threshold and did_ab < 0),
                    "n_treatment": int(len(residual_treatment)),
                    "n_control":   int(len(residual_control)),
                })

    if not records:
        raise HTTPException(status_code=400, detail="Tidak cukup data untuk estimasi DiD Simulator.")

    confirmed = [r for r in records if r["confirmed"]]

    output = {
        "summary": {
            "total_pairs":                len(records),
            "significant_cannibalization": len(confirmed),
            "p_threshold":                p_threshold,
            "max_coef":                   max_coef,
        },
        "results":     records,
        "significant": confirmed,
    }

    ds.did_simulator_result = output
    db.commit()
    return output