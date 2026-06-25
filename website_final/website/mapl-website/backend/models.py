from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)

    datasets = relationship("Dataset", back_populates="owner", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id          = Column(Integer, primary_key=True, index=True)
    owner_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename    = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)   # path .parquet di disk
    summary     = Column(JSON, nullable=True)        # hasil validasi (n_rows, dll)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Cache hasil analisis terakhir (opsional, supaya tidak re-run terus)
    cannibalization_result = Column(JSON, nullable=True)
    elasticity_result       = Column(JSON, nullable=True)
    did_result              = Column(JSON, nullable=True)
    did_simulator_result    = Column(JSON, nullable=True)
    matrix_result           = Column(JSON, nullable=True)
    forecast_result         = Column(JSON, nullable=True)
    ai_recommendation        = Column(Text, nullable=True)
    context_insights        = Column(JSON, nullable=True)  # {"dashboard": "...", "analysis": "...", "simulator": "..."}

    owner = relationship("User", back_populates="datasets")