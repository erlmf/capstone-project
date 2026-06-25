"""
Database setup — SQLite via SQLAlchemy.

Untuk migrasi ke PostgreSQL nanti, cukup ganti DATABASE_URL,
sisa kode (models, queries) tidak perlu diubah.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # khusus SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
