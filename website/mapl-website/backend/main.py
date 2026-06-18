"""
Cannibalization & Forecast Analysis API — v2
================================================
Tambahan dari v1:
  - User accounts (register/login, JWT auth)
  - Dataset disimpan persisten (SQLite + file .parquet di disk),
    terkait ke user (multi-tenant)
  - AI Recommendation via local LLM (Ollama)

Cara run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Tabel database dibuat otomatis saat app start (lihat Base.metadata.create_all).
"""

import os
import uuid
from itertools import permutations

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import statsmodels.stats.diagnostic as smd
from statsmodels.stats.stattools import jarque_bera
from scipy import stats as scipy_stats
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
import warnings

from database import Base, engine, get_db
import models
import auth
import ai

warnings.filterwarnings("ignore")

# ── Init DB (buat tabel kalau belum ada) ────────────────────────────────────
Base.metadata.create_all(bind=engine)

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
# Helper: validasi & preprocessing dataset
# ════════════════════════════════════════════════════════════════════════════
def validate_and_prepare(df: pd.DataFrame):
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Kolom wajib tidak ditemukan: {missing}. "
                   f"Kolom yang ada: {df.columns.tolist()}",
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
                        "message": f"Dataset hanya {n_months:.1f} bulan. "
                                   f"Forecasting butuh minimal 12 bulan untuk hasil reliable."})
    elif n_months < 12:
        checks.append({"check": "Rentang Waktu", "status": "WARN",
                        "message": f"Dataset {n_months:.1f} bulan. "
                                   f"Forecasting bisa jalan tapi confidence interval lebar."})
    else:
        checks.append({"check": "Rentang Waktu", "status": "PASS",
                        "message": f"Dataset {n_months:.1f} bulan — cukup untuk forecasting."})

    if "DiscountedPrice" in df.columns:
        cv = df.groupby("SKU_ID")["DiscountedPrice"].agg(["mean", "std"])
        cv["cv_pct"] = (cv["std"] / cv["mean"] * 100).round(2)
        low_cv_skus = cv[cv["cv_pct"] < 10].index.tolist()
        if low_cv_skus:
            checks.append({"check": "Price Variation (CV)", "status": "WARN",
                            "message": f"{len(low_cv_skus)} SKU punya price CV < 10%: "
                                       f"{low_cv_skus[:5]}{'...' if len(low_cv_skus) > 5 else ''}."})
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
                        "message": f"Promo frequency per SKU dalam rentang sehat "
                                   f"({promo_pct.min():.1f}% - {promo_pct.max():.1f}%)."})

    summary = {
        "n_rows": len(df),
        "n_sku": df["SKU_ID"].nunique(),
        "n_branch": df["Branch"].nunique() if "Branch" in df.columns else 1,
        "date_min": str(df["Date"].min().date()),
        "date_max": str(df["Date"].max().date()),
        "n_months": round(n_months, 1),
        "categories": sorted(df["SKU_Category"].unique().tolist()),
    }

    return df, checks, summary


def load_dataset_df(dataset: models.Dataset) -> pd.DataFrame:
    if not os.path.exists(dataset.storage_path):
        raise HTTPException(status_code=404, detail="File dataset tidak ditemukan di server.")
    df = pd.read_parquet(dataset.storage_path)
    df["Date"] = pd.to_datetime(df["Date"])
    return df


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
        cannibalization_result=None,  # invalidate cache — dataset baru, analisis ulang
        did_result=None,
        forecast_result=None,
        ai_recommendation=None,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return {"dataset_id": dataset.id, "filename": dataset.filename, "summary": summary, "checks": checks}


@app.get("/api/datasets")
def list_datasets(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    datasets = db.query(models.Dataset).filter(models.Dataset.owner_id == current_user.id).all()
    return [
        {
            "dataset_id": d.id,
            "filename": d.filename,
            "summary": d.summary,
            "uploaded_at": d.uploaded_at.isoformat(),
            "has_cannibalization": d.cannibalization_result is not None,
            "has_forecast": d.forecast_result is not None,
        }
        for d in datasets
    ]


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


# ════════════════════════════════════════════════════════════════════════════
# CANNIBALIZATION ANALYSIS
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/cannibalization")
def run_cannibalization(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    df["month_num"] = (df["Year"] - df["Year"].min()) * 12 + df["Month"]
    df["log_qty"]   = np.log(df["Qty"] + 1)

    qty_wide  = df.pivot_table(index=["Date", "Branch"], columns="SKU_ID", values="log_qty")
    disc_wide = df.pivot_table(index=["Date", "Branch"], columns="SKU_ID", values="DiscountPercentage")
    meta_wide = df.groupby(["Date", "Branch"])[["month_num", "Year"]].first()

    sku_cat   = df.groupby("SKU_ID")["SKU_Category"].first().to_dict()
    sku_name  = df.groupby("SKU_ID")["SKU_Name"].first().to_dict()
    sku_brand = (df.groupby("SKU_ID")["Brand"].first().to_dict()
                  if "Brand" in df.columns else {s: "" for s in sku_cat})

    n_years = df["Year"].nunique()
    formula = "log_qty_B ~ disc_pct_A + disc_pct_B + month_num + C(Branch)"
    if n_years > 1:
        formula += " + C(Year)"

    results = []
    for cat in sorted(df["SKU_Category"].unique()):
        skus = [s for s, c in sku_cat.items() if c == cat]
        if len(skus) < 2:
            continue
        for sku_a, sku_b in permutations(skus, 2):
            try:
                reg_df = pd.DataFrame({
                    "log_qty_B": qty_wide[sku_b],
                    "disc_pct_A": disc_wide[sku_a],
                    "disc_pct_B": disc_wide[sku_b],
                }).join(meta_wide).reset_index().dropna()

                if len(reg_df) < 100:
                    continue

                model = smf.ols(formula, data=reg_df).fit()
                coef = model.params.get("disc_pct_A")
                pval = model.pvalues.get("disc_pct_A")
                if coef is None:
                    continue

                residuals = model.resid
                _, _, skew, _ = jarque_bera(residuals)
                bp = smd.het_breuschpagan(residuals, model.model.exog)
                cv_a = (disc_wide[sku_a].std() / disc_wide[sku_a].mean() * 100
                        if disc_wide[sku_a].mean() != 0 else 0)

                norm_pass   = abs(skew) < 1.0
                hetero_pass = bp[1] > 0.01
                cv_pass     = cv_a >= 10
                reliability = "RELIABLE" if (norm_pass and hetero_pass and cv_pass) else "UNRELIABLE"

                verdict = ("Tidak Signifikan" if pval >= 0.05
                           else "CANNIBALIZATION" if coef < 0 else "KOMPLEMEN")

                results.append({
                    "category": cat,
                    "sku_a": sku_a, "sku_a_name": sku_name.get(sku_a, sku_a),
                    "brand_a": sku_brand.get(sku_a, ""),
                    "sku_b": sku_b, "sku_b_name": sku_name.get(sku_b, sku_b),
                    "brand_b": sku_brand.get(sku_b, ""),
                    "coef_disc_a": round(float(coef), 4),
                    "p_value": round(float(pval), 4),
                    "r_squared": round(float(model.rsquared), 4),
                    "n_obs": int(len(reg_df)),
                    "cv_disc_a": round(float(cv_a), 2),
                    "skew": round(float(skew), 3),
                    "reliability": reliability,
                    "verdict": verdict,
                })
            except Exception:
                continue

    reliable = [r for r in results if r["reliability"] == "RELIABLE"]

    daily_rev = df.groupby("SKU_ID")["Revenue"].mean().to_dict()
    impact = []
    for r in reliable:
        if r["verdict"] != "CANNIBALIZATION":
            continue
        rev_b = daily_rev.get(r["sku_b"], 0)
        pct_change = r["coef_disc_a"] * 0.10
        impact.append({
            "category": r["category"],
            "sku_a_name": r["sku_a_name"],
            "sku_b_name": r["sku_b_name"],
            "pct_qty_change": round(pct_change * 100, 2),
            "avg_daily_rev_b": round(rev_b, 0),
            "daily_rev_impact": round(rev_b * pct_change, 0),
        })
    impact.sort(key=lambda x: x["daily_rev_impact"])

    summary = {
        "total_pairs": len(results),
        "reliable_pairs": len(reliable),
        "cannibalization": sum(1 for r in reliable if r["verdict"] == "CANNIBALIZATION"),
        "komplemen": sum(1 for r in reliable if r["verdict"] == "KOMPLEMEN"),
        "tidak_signifikan": sum(1 for r in reliable if r["verdict"] == "Tidak Signifikan"),
        "total_revenue_at_risk": round(sum(abs(i["daily_rev_impact"]) for i in impact), 0),
    }

    output = {"summary": summary, "results": results, "revenue_impact": impact,
               "timestamp": pd.Timestamp.now().isoformat()}

    ds.cannibalization_result = output
    db.commit()

    return output


# ════════════════════════════════════════════════════════════════════════════
# DiD CROSS-VALIDATION
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/did")
def run_did(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    sku_cat  = df.groupby("SKU_ID")["SKU_Category"].first().to_dict()
    sku_name = df.groupby("SKU_ID")["SKU_Name"].first().to_dict()

    daily_panel = df.groupby(["Date", "Branch", "SKU_ID"])[["Qty"]].sum().reset_index()
    daily_panel = daily_panel.merge(
        df[["Date", "Branch", "SKU_ID", "IsPromo"]].drop_duplicates(),
        on=["Date", "Branch", "SKU_ID"],
    )
    daily_panel["WeekNum"] = (daily_panel["Date"] - daily_panel["Date"].min()).dt.days // 7

    baseline_results = []
    for sku_id in sorted(daily_panel["SKU_ID"].unique()):
        for branch in daily_panel["Branch"].unique():
            sub = daily_panel[
                (daily_panel["SKU_ID"] == sku_id) & (daily_panel["Branch"] == branch)
            ].sort_values("Date").copy()
            if len(sub) < 30:
                continue
            no_promo = sub[sub["IsPromo"] == 0]
            if len(no_promo) < 20:
                continue
            slope, intercept, r, p, se = scipy_stats.linregress(no_promo["WeekNum"], no_promo["Qty"])
            sub["BaselineDemand"] = (intercept + slope * sub["WeekNum"]).clip(lower=1)
            sub["ResidualPct"] = (sub["Qty"] - sub["BaselineDemand"]) / sub["BaselineDemand"]
            baseline_results.append(sub)

    if not baseline_results:
        raise HTTPException(status_code=400, detail="Tidak cukup data untuk estimasi baseline trend.")

    daily_base = pd.concat(baseline_results, ignore_index=True)

    did_results = []
    for cat in sorted(df["SKU_Category"].unique()):
        skus = [s for s, c in sku_cat.items() if c == cat]
        if len(skus) < 2:
            continue
        for sku_a, sku_b in permutations(skus, 2):
            promo_a = (daily_base[daily_base["SKU_ID"] == sku_a]
                       .groupby("Date")["IsPromo"].max().reset_index(name="IsPromo_A"))
            resid_b = daily_base[daily_base["SKU_ID"] == sku_b][["Date", "Branch", "ResidualPct"]].copy()
            merged = resid_b.merge(promo_a, on="Date")
            if len(merged) < 30:
                continue
            treatment = merged[merged["IsPromo_A"] == 1]["ResidualPct"]
            control   = merged[merged["IsPromo_A"] == 0]["ResidualPct"]
            if len(treatment) < 5 or len(control) < 5:
                continue
            did = treatment.mean() - control.mean()
            t_stat, p_two = scipy_stats.ttest_ind(treatment, control)
            p_one = p_two / 2 if t_stat < 0 else 1 - p_two / 2

            did_results.append({
                "category": cat,
                "sku_a": sku_a, "sku_a_name": sku_name.get(sku_a, sku_a),
                "sku_b": sku_b, "sku_b_name": sku_name.get(sku_b, sku_b),
                "n_treatment": int(len(treatment)),
                "n_control": int(len(control)),
                "did_pct": round(float(did) * 100, 2),
                "p_value": round(float(p_one), 4),
                "significant": bool(p_one < 0.05 and did < 0),
            })

    significant = sorted([d for d in did_results if d["significant"]], key=lambda x: x["did_pct"])

    output = {
        "summary": {"total_pairs": len(did_results), "significant_cannibalization": len(significant)},
        "results": did_results,
        "significant": significant,
    }

    ds.did_result = output
    db.commit()

    return output


# ════════════════════════════════════════════════════════════════════════════
# FORECASTING (Prophet)
# ════════════════════════════════════════════════════════════════════════════
class ForecastRequest(BaseModel):
    forecast_days: int = 90


MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

LAGS = [1, 7, 14, 28, 56]
ROLL_WINDOWS = [7, 14, 28]


def build_features_for_inference(daily: pd.DataFrame) -> pd.DataFrame:
    """Build lag & rolling features — sama persis dengan notebook temen lo."""
    GROUP_COLS = ["SKU", "Branch"]
    daily = daily.sort_values(GROUP_COLS + ["Date"]).copy()

    daily["day_of_week"]  = daily["Date"].dt.dayofweek
    daily["week_of_year"] = daily["Date"].dt.isocalendar().week.astype(int)
    daily["month"]        = daily["Date"].dt.month
    daily["year"]         = daily["Date"].dt.year
    daily["day_of_year"]  = daily["Date"].dt.dayofyear

    grouped_qty = daily.groupby(GROUP_COLS)["DailyQty"]

    for lag in LAGS:
        daily[f"lag{lag}"] = grouped_qty.shift(lag)

    shifted = grouped_qty.shift(1)
    for window in ROLL_WINDOWS:
        roll = shifted.groupby([daily["SKU"], daily["Branch"]])
        daily[f"roll{window}_mean"] = roll.transform(lambda x: x.rolling(window).mean())
        daily[f"roll{window}_std"]  = roll.transform(lambda x: x.rolling(window).std())

    return daily


@app.post("/api/datasets/{dataset_id}/forecast")
def run_forecast(
    dataset_id: int,
    req: ForecastRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    import pickle
    from xgboost import XGBRegressor

    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    # Cek apakah folder models tersedia
    if not os.path.exists(MODEL_DIR):
        raise HTTPException(
            status_code=503,
            detail="Folder models/ tidak ditemukan di backend. Pastikan file .json dan _meta.pkl sudah ada.",
        )

    # Rename SKU_Name → SKU supaya match dengan notebook
    if "SKU_Name" in df.columns and "SKU" not in df.columns:
        df = df.rename(columns={"SKU_Name": "SKU"})

    # Aggregate ke daily panel per SKU × Branch
    daily = (
        df.groupby(["Date", "Branch", "SKU_ID", "SKU", "SKU_Category"])
        .agg(DailyQty=("Qty", "sum"), Revenue=("Revenue", "sum"))
        .reset_index()
    )

    last_date      = daily["Date"].max()
    forecast_start = last_date + pd.Timedelta(days=1)
    n_days         = max(1, min(req.forecast_days, 365))

    # Build features dari data historis
    daily_feat = build_features_for_inference(daily)

    forecast_summary = []
    branches = sorted(daily["Branch"].unique())

    for branch in branches:
        model_path = os.path.join(MODEL_DIR, f"{branch}.json")
        meta_path  = os.path.join(MODEL_DIR, f"{branch}_meta.pkl")

        if not os.path.exists(model_path) or not os.path.exists(meta_path):
            continue  # skip branch yang tidak ada modelnya

        # Load model & metadata
        model = XGBRegressor()
        model.load_model(model_path)

        with open(meta_path, "rb") as f:
            meta = pickle.load(f)

        features       = meta["features"]
        sku_categories = meta["sku_categories"]

        branch_df = daily_feat[daily_feat["Branch"] == branch].copy()
        branch_df["SKU"] = pd.Categorical(branch_df["SKU"], categories=sku_categories)

        # Predict iteratif: satu hari sekaligus, update lag setelah tiap prediksi
        future_rows = []
        # Seed dari data historis terakhir per SKU
        history = branch_df.copy()

        for day_offset in range(n_days):
            target_date = forecast_start + pd.Timedelta(days=day_offset)

            for sku_id in sorted(daily["SKU_ID"].unique()):
                sku_name_series = daily[
                    (daily["SKU_ID"] == sku_id) & (daily["Branch"] == branch)
                ]["SKU"]
                if sku_name_series.empty:
                    continue
                sku_name = sku_name_series.iloc[0]

                sku_hist = history[
                    (history["SKU"] == sku_name) & (history["Branch"] == branch)
                ].sort_values("Date")

                if sku_hist.empty:
                    continue

                # Build satu baris feature untuk target_date
                row = {
                    "Date":        target_date,
                    "Branch":      branch,
                    "SKU":         sku_name,
                    "SKU_ID":      sku_id,
                    "day_of_week": target_date.dayofweek,
                    "week_of_year":target_date.isocalendar()[1],
                    "month":       target_date.month,
                    "year":        target_date.year,
                    "day_of_year": target_date.timetuple().tm_yday,
                }

                qty_series = sku_hist["DailyQty"].values

                for lag in LAGS:
                    row[f"lag{lag}"] = float(qty_series[-lag]) if len(qty_series) >= lag else np.nan

                for window in ROLL_WINDOWS:
                    if len(qty_series) >= 1:
                        row[f"roll{window}_mean"] = float(np.mean(qty_series[-window:])) if len(qty_series) >= window else float(np.mean(qty_series))
                        row[f"roll{window}_std"]  = float(np.std(qty_series[-window:]))  if len(qty_series) >= window else float(np.std(qty_series))
                    else:
                        row[f"roll{window}_mean"] = np.nan
                        row[f"roll{window}_std"]  = np.nan

                row_df = pd.DataFrame([row])
                row_df["SKU"] = pd.Categorical(row_df["SKU"], categories=sku_categories)

                # Handle missing features
                for feat in features:
                    if feat not in row_df.columns:
                        row_df[feat] = np.nan

                pred_qty = float(np.clip(model.predict(row_df[features])[0], 0, None))

                # Append ke history supaya lag berikutnya benar
                new_hist_row = pd.DataFrame([{
                    "Date": target_date, "Branch": branch,
                    "SKU": sku_name, "SKU_ID": sku_id,
                    "DailyQty": pred_qty, "Revenue": 0,
                }])
                history = pd.concat([history, new_hist_row], ignore_index=True)

                future_rows.append({
                    "date":    target_date,
                    "branch":  branch,
                    "sku_id":  sku_id,
                    "sku_name":sku_name,
                    "pred_qty":pred_qty,
                })

    if not future_rows:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada prediksi yang berhasil. Pastikan nama branch di dataset cocok dengan nama model (Bandung, Jakarta, Semarang, Surabaya).",
        )

    # Aggregate hasil per SKU (across branches)
    future_df = pd.DataFrame(future_rows)

    sku_meta = (
        daily[["SKU_ID", "SKU", "SKU_Category", "Revenue", "DailyQty"]]
        .groupby(["SKU_ID", "SKU", "SKU_Category"])
        .agg(total_rev=("Revenue", "sum"), total_qty=("DailyQty", "sum"))
        .reset_index()
    )
    sku_meta["avg_price"] = sku_meta["total_rev"] / sku_meta["total_qty"].clip(lower=1)

    forecast_summary = []
    for sku_id in sorted(future_df["sku_id"].unique()):
        sku_fc   = future_df[future_df["sku_id"] == sku_id]
        sku_info = sku_meta[sku_meta["SKU_ID"] == sku_id]
        if sku_info.empty:
            continue

        sku_name  = sku_info.iloc[0]["SKU"]
        category  = sku_info.iloc[0]["SKU_Category"]
        avg_price = float(sku_info.iloc[0]["avg_price"])

        qty_total = float(sku_fc["pred_qty"].sum())
        rev_total = round(qty_total * avg_price, 0)

        daily_series = (
            sku_fc.groupby("date")["pred_qty"].sum()
            .reset_index()
            .sort_values("date")
        )

        forecast_summary.append({
            "sku_id":          sku_id,
            "sku_name":        sku_name,
            "category":        category,
            "qty_forecast":    int(round(qty_total)),
            "qty_lower":       int(round(qty_total * 0.85)),   # estimasi CI ±15%
            "qty_upper":       int(round(qty_total * 1.15)),
            "revenue_forecast":rev_total,
            "daily_series": [
                {"date": str(row["date"].date()), "qty": round(float(row["pred_qty"]), 1),
                 "qty_lower": round(float(row["pred_qty"]) * 0.85, 1),
                 "qty_upper": round(float(row["pred_qty"]) * 1.15, 1)}
                for _, row in daily_series.iterrows()
            ],
        })

    forecast_summary.sort(key=lambda x: x["revenue_forecast"], reverse=True)

    output = {
        "forecast_days":          n_days,
        "forecast_start":         forecast_start.strftime("%Y-%m-%d"),
        "yearly_seasonality_used":False,
        "model_type":             "XGBoost (per branch)",
        "total_revenue_forecast": round(sum(f["revenue_forecast"] for f in forecast_summary), 0),
        "per_sku":                forecast_summary,
    }

    ds.forecast_result = output
    db.commit()

    return output


# ════════════════════════════════════════════════════════════════════════════
# AI RECOMMENDATION (local LLM via Ollama)
# ════════════════════════════════════════════════════════════════════════════
@app.post("/api/datasets/{dataset_id}/ai-recommendation")
def ai_recommendation(
    dataset_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)

    if not ds.cannibalization_result or not ds.forecast_result:
        raise HTTPException(
            status_code=400,
            detail="Jalankan analisis cannibalization, DiD, dan forecast terlebih dahulu "
                   "sebelum meminta AI recommendation.",
        )

    result = ai.generate_recommendation(
        cannibalization=ds.cannibalization_result,
        did=ds.did_result or {"significant": []},
        forecast=ds.forecast_result,
    )

    if not result["success"]:
        raise HTTPException(status_code=503, detail=result["error"])

    ds.ai_recommendation = result["text"]
    db.commit()

    return {"recommendation": result["text"]}


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ════════════════════════════════════════════════════════════════════════════
# WHAT-IF PRICING SIMULATOR
# ════════════════════════════════════════════════════════════════════════════
class SimulateRequest(BaseModel):
    sku_id: str
    branch: str        # "all" untuk semua branch
    discount_pct: float  # 0.0 - 1.0, misal 0.20 = 20%


@app.post("/api/datasets/{dataset_id}/simulate")
def run_simulate(
    dataset_id: int,
    req: SimulateRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ds = get_owned_dataset(dataset_id, db, current_user)
    df = load_dataset_df(ds)

    # Shortcut __meta__: return daftar SKU & Branch TANPA perlu analisis dulu
    if req.sku_id == "__meta__":
        sku_list    = df[["SKU_ID","SKU_Name","SKU_Category"]].drop_duplicates().to_dict("records")
        branch_list = sorted(df["Branch"].unique().tolist())
        return {"metadata": {"sku_list": sku_list, "branch_list": branch_list}}

    # Guard: analisis harus sudah dijalankan
    if not ds.cannibalization_result:
        raise HTTPException(
            status_code=400,
            detail="Jalankan analisis cannibalization terlebih dahulu sebelum simulasi.",
        )

    # Filter branch jika bukan "all"
    if req.branch != "all":
        df_branch = df[df["Branch"] == req.branch]
        if df_branch.empty:
            raise HTTPException(status_code=400, detail=f"Branch '{req.branch}' tidak ditemukan.")
    else:
        df_branch = df

    # Validasi SKU
    if req.sku_id not in df["SKU_ID"].unique():
        raise HTTPException(status_code=400, detail=f"SKU '{req.sku_id}' tidak ditemukan.")

    # ── Ambil data SKU A ──────────────────────────────────────────────────
    sku_a_data   = df_branch[df_branch["SKU_ID"] == req.sku_id]
    sku_a_name   = sku_a_data["SKU_Name"].iloc[0]
    sku_a_cat    = sku_a_data["SKU_Category"].iloc[0]
    avg_price_a  = sku_a_data["Revenue"].sum() / sku_a_data["Qty"].sum()
    baseline_qty_a   = float(sku_a_data["Qty"].mean())
    baseline_rev_a   = float(sku_a_data["Revenue"].mean())

    # ── Own-price uplift SKU A ────────────────────────────────────────────
    # Ambil coef_disc_B dari pasangan A→X (disc_pct_B = own-price SKU A)
    canni_results = ds.cannibalization_result.get("results", [])
    own_coef = None
    for r in canni_results:
        if r["sku_a"] == req.sku_id:
            # coef_disc_B adalah own-price elasticity SKU A
            own_coef = r.get("own_coef_b")
            break

    # Fallback: estimasi own-price elasticity dari baseline data
    # Kalau disc naik, qty naik (own boost). Pakai average dari literatur FMCG ~1.5–2.5
    # Atau hitung dari data: korelasi antara disc_pct dan qty SKU A
    if own_coef is None:
        try:
            import statsmodels.formula.api as smf
            df_a = df_branch[df_branch["SKU_ID"] == req.sku_id].copy()
            df_a["log_qty"] = np.log(df_a["Qty"] + 1)
            df_a["month_num"] = (df_a["Date"].dt.year - df_a["Date"].dt.year.min()) * 12 + df_a["Date"].dt.month
            if len(df_a) >= 30:
                m = smf.ols("log_qty ~ DiscountPercentage + month_num + C(Branch)", data=df_a).fit()
                own_coef = float(m.params.get("DiscountPercentage", 1.5))
            else:
                own_coef = 1.5  # fallback literatur
        except Exception:
            own_coef = 1.5

    # Hitung uplift qty dan revenue SKU A
    # log(qty_new) = log(qty_base) + own_coef * disc_pct_new
    current_avg_disc = float(sku_a_data["DiscountPercentage"].mean())
    delta_disc       = req.discount_pct - current_avg_disc
    qty_uplift_pct   = float(np.exp(own_coef * delta_disc) - 1)
    qty_a_new        = baseline_qty_a * (1 + qty_uplift_pct)
    rev_a_new        = qty_a_new * avg_price_a * (1 - req.discount_pct)
    rev_a_baseline   = baseline_qty_a * avg_price_a * (1 - current_avg_disc)
    rev_a_uplift     = rev_a_new - rev_a_baseline

    # ── Cannibalization impact pada SKU lain ─────────────────────────────
    cannibalized = []
    total_rev_lost = 0.0

    for r in canni_results:
        if r["sku_a"] != req.sku_id:
            continue
        if r["verdict"] not in ("CANNIBALIZATION", "KOMPLEMEN"):
            continue

        sku_b_id   = r["sku_b"]
        sku_b_name = r["sku_b_name"]
        coef       = r["coef_disc_a"]
        p_value    = r["p_value"]
        reliability= r["reliability"]

        sku_b_data    = df_branch[df_branch["SKU_ID"] == sku_b_id]
        if sku_b_data.empty:
            continue

        avg_price_b   = sku_b_data["Revenue"].sum() / sku_b_data["Qty"].sum()
        baseline_qty_b= float(sku_b_data["Qty"].mean())
        baseline_rev_b= float(sku_b_data["Revenue"].mean())

        # Impact: delta_qty_B = baseline_qty_B * (exp(coef * delta_disc) - 1)
        qty_change_pct = float(np.exp(coef * delta_disc) - 1)
        qty_b_new      = baseline_qty_b * (1 + qty_change_pct)
        rev_b_new      = qty_b_new * avg_price_b
        rev_b_impact   = rev_b_new - baseline_rev_b
        total_rev_lost += rev_b_impact  # negatif jika kanibal, positif jika komplemen

        cannibalized.append({
            "sku_b_id"      : str(sku_b_id),
            "sku_b_name"    : str(sku_b_name),
            "verdict"       : str(r["verdict"]),
            "coef"          : round(float(coef), 4),
            "p_value"       : round(float(p_value), 4),
            "reliability"   : str(reliability),
            "qty_change_pct": round(float(qty_change_pct) * 100, 2),
            "rev_impact"    : round(float(rev_b_impact), 0),
            "baseline_rev"  : round(float(baseline_rev_b), 0),
        })

    cannibalized.sort(key=lambda x: x["rev_impact"])

    # ── Net revenue ───────────────────────────────────────────────────────
    net_revenue_impact = rev_a_uplift + total_rev_lost

    # ── Break-even discount ───────────────────────────────────────────────
    # Net = 0 ketika uplift A = total lost
    # Estimasi numerik sederhana: scan disc dari 0 ke 1
    break_even_disc = None
    if total_rev_lost < 0:  # ada kanibal
        for d in np.arange(0.0, 1.0, 0.005):
            dd = d - current_avg_disc
            up = (baseline_qty_a * (1 + float(np.exp(own_coef * dd) - 1))
                  * avg_price_a * (1 - d)) - rev_a_baseline
            lost = sum(
                float(df_branch[df_branch["SKU_ID"] == r["sku_b_id"]]["Revenue"].mean()
                      if not df_branch[df_branch["SKU_ID"] == r["sku_b_id"]].empty else 0)
                * (float(np.exp(r["coef"] * dd) - 1))
                for r in cannibalized
            )
            if up + lost >= 0:
                break_even_disc = round(float(d), 3)
                break

    # ── SKU metadata ──────────────────────────────────────────────────────
    all_skus   = df[["SKU_ID","SKU_Name","SKU_Category","Branch"]].drop_duplicates()
    sku_list   = all_skus[["SKU_ID","SKU_Name","SKU_Category"]].drop_duplicates().to_dict("records")
    branch_list= sorted(df["Branch"].unique().tolist())

    return {
        "input": {
            "sku_id"       : req.sku_id,
            "sku_name"     : sku_a_name,
            "sku_category" : sku_a_cat,
            "branch"       : req.branch,
            "discount_pct" : float(req.discount_pct),
            "current_avg_disc": round(float(current_avg_disc), 3),
        },
        "sku_a_result": {
            "baseline_qty_daily"    : round(float(baseline_qty_a), 1),
            "baseline_rev_daily"    : round(float(baseline_rev_a), 0),
            "qty_new_daily"         : round(float(qty_a_new), 1),
            "rev_new_daily"         : round(float(rev_a_new), 0),
            "qty_uplift_pct"        : round(float(qty_uplift_pct) * 100, 2),
            "rev_uplift_daily"      : round(float(rev_a_uplift), 0),
            "own_coef"              : round(float(own_coef), 4),
        },
        "cannibalization_impact": [
            {k: (bool(v) if hasattr(v, 'item') else v) for k, v in c.items()}
            for c in cannibalized
        ],
        "summary": {
            "total_rev_uplift_a"    : round(float(rev_a_uplift), 0),
            "total_rev_lost"        : round(float(total_rev_lost), 0),
            "net_revenue_impact"    : round(float(net_revenue_impact), 0),
            "is_worth_it"           : bool(net_revenue_impact > 0),
            "break_even_discount"   : float(break_even_disc) if break_even_disc is not None else None,
            "n_sku_cannibalized"    : int(len([c for c in cannibalized if c["verdict"] == "CANNIBALIZATION"])),
            "n_sku_komplemen"       : int(len([c for c in cannibalized if c["verdict"] == "KOMPLEMEN"])),
            "analysis_timestamp"    : ds.cannibalization_result.get("timestamp", "unknown"),
        },
        "metadata": {
            "sku_list"   : sku_list,
            "branch_list": branch_list,
        },
    }