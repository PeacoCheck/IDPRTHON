# -*- coding: utf-8 -*-
"""Paths and folder safety for the local workspace."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OBJECTS_DIR = DATA_DIR / "objects"
TEMPLATES_DIR = BASE_DIR / "templates"
OBJECTS_DB = DATA_DIR / "ИД_объекты.xlsx"
OBJECTS_SHEET = "0.Объекты"
AOSR_FILE_NAME = "АОСР_данные.xlsx"
LEGACY_AOSR_DATA_FILE = BASE_DIR / AOSR_FILE_NAME
AOSR_TEMPLATE = TEMPLATES_DIR / "АОСР_данные_шаблон.xlsx"

SECTION_FOLDERS = {
    "journals/general": Path("Журналы") / "Общий журнал работ",
    "journals/welding": Path("Журналы") / "Журнал сварочных работ",
    "journals/incoming": Path("Журналы") / "Журнал входного контроля",
    "acts/aosr": Path("Акты") / "АОСР",
    "acts/vik": Path("Акты") / "ВИК",
    "materials/registry": Path("Материалы") / "Реестр",
    "materials/certificates": Path("Материалы") / "Сертификаты",
    "permits/project": Path("Разрешительная") / "Проектная документация",
    "schemes/registry": Path("Исполнительные схемы"),
}


def ensure_base_dirs() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    OBJECTS_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(exist_ok=True)


def _resolve_base(base: Path | str) -> Path:
    return Path(base).resolve()


def safe_join(base: Path | str, *parts: str | os.PathLike[str]) -> Path:
    base_abs = _resolve_base(base)
    target = base_abs.joinpath(*map(Path, parts)).resolve()
    if os.path.commonpath([str(base_abs), str(target)]) != str(base_abs):
        raise ValueError("Путь выходит за пределы рабочей папки.")
    return target


def resolve_project_path(value: str | os.PathLike[str], base: Path | str = BASE_DIR) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else safe_join(base, path)


def rel_to_base(path: Path | str) -> str:
    path_abs = Path(path).resolve()
    try:
        return path_abs.relative_to(BASE_DIR).as_posix()
    except ValueError:
        return str(path_abs)


def object_folder(object_id: str) -> Path:
    return safe_join(OBJECTS_DIR, object_id)


def resolve_object_folder(obj: dict) -> Path:
    folder = obj.get("folder") or f"data/objects/{obj.get('id', '')}"
    return resolve_project_path(folder)


def resolve_data_file_for_object(obj: dict) -> Path:
    data_file = obj.get("dataFile") or obj.get("data_file") or AOSR_FILE_NAME
    return resolve_project_path(data_file)


def section_folder(obj: dict, section: str) -> Path:
    base = resolve_object_folder(obj)
    rel = SECTION_FOLDERS.get(section)
    if rel is None:
        rel = Path(*[sanitize_part(part) for part in section.split("/") if part])
    return safe_join(base, rel)


def ensure_section_folder(obj: dict, section: str) -> Path:
    folder = section_folder(obj, section)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def sanitize_part(value: str) -> str:
    bad = '<>:"\\|?*'
    cleaned = "".join("-" if ch in bad else ch for ch in value).strip(" .")
    return cleaned or "Раздел"


def is_inside(base: Path | str, target: Path | str) -> bool:
    base_abs = Path(base).resolve()
    target_abs = Path(target).resolve()
    return os.path.commonpath([str(base_abs), str(target_abs)]) == str(base_abs)
