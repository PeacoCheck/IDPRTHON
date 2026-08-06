from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = BASE_DIR / "skills_library"
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"

DATA_DIR.mkdir(parents=True, exist_ok=True)
SKILLS_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Settings:
    base_dir: Path
    skills_dir: Path
    data_dir: Path
    frontend_dir: Path
    db_path: Path


settings = Settings(
    base_dir=BASE_DIR,
    skills_dir=SKILLS_DIR,
    data_dir=DATA_DIR,
    frontend_dir=FRONTEND_DIR,
    db_path=DATA_DIR / "autocad_vault.sqlite3",
)
