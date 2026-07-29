from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SETTINGS_FILE = BASE_DIR / "settings.json"


@dataclass(frozen=True)
class Settings:
    vault_dir: Path
    frontend_dir: Path


def get_settings() -> Settings:
    raw: dict[str, str] = {}
    if SETTINGS_FILE.exists():
        raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    vault = Path(raw.get("vault_path", BASE_DIR / "vault")).expanduser().resolve()
    frontend = BASE_DIR / "frontend" / "dist"
    return Settings(vault_dir=vault, frontend_dir=frontend)


settings = get_settings()
for directory in (
    settings.vault_dir / "db",
    settings.vault_dir / "objects",
    settings.vault_dir / "templates",
    settings.vault_dir / "presets",
    settings.vault_dir / "catalogs",
    settings.vault_dir / "files",
    settings.vault_dir / "output",
    settings.vault_dir / "backups",
):
    directory.mkdir(parents=True, exist_ok=True)
