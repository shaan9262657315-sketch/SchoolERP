from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

import os
from pathlib import Path

_configured_database_url = os.getenv("DATABASE_URL", "").strip()
if _configured_database_url:
    DATABASE_URL = _configured_database_url
else:
    _database_path = Path(os.getenv(
        "SCHOOL_DATABASE_PATH",
        str(Path(__file__).resolve().parent / "school_erp.db")
    )).resolve()
    _database_path.parent.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = "sqlite:///" + _database_path.as_posix()


# Normalize PostgreSQL URLs for the synchronous psycopg driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

# SQLite needs this option; PostgreSQL does not.
_engine_kwargs = {}
if DATABASE_URL.startswith("sqlite:"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    **_engine_kwargs,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass
