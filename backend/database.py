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


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass
