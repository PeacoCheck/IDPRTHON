# -*- coding: utf-8 -*-
"""Application state assembly for the web interface."""
from __future__ import annotations

from .objects_db import ensure_object_files, ensure_objects_db, get_current_object, load_objects
from .paths import resolve_data_file_for_object
from modules.aosr.aosr_service import load_aosr_state


def build_object_json(obj: dict) -> dict:
    return {
        "id": obj.get("id", ""),
        "name": obj.get("name", ""),
        "shortName": obj.get("shortName") or _short_name(obj.get("name", "")),
        "address": obj.get("address", ""),
        "dataFile": obj.get("dataFile", ""),
        "folder": obj.get("folder", ""),
        "status": obj.get("status", "active"),
        "current": bool(obj.get("current")),
        "created": obj.get("created", ""),
        "comment": obj.get("comment", ""),
    }


def build_empty_state() -> dict:
    return {
        "ok": False,
        "fatal": {
            "msg": "Объект не выбран",
            "hint": "Добавьте объект или восстановите объект из архива.",
        },
        "events": [],
        "data_file": "",
    }


def build_app_state() -> dict:
    ensure_objects_db()
    objects_all = [build_object_json(obj) for obj in load_objects()]
    current = get_current_object()
    aosr = build_empty_state()
    current_json = None
    if current:
        ensure_object_files(current)
        current_json = build_object_json(current)
        data_file = resolve_data_file_for_object(current)
        aosr = load_aosr_state(data_file)

    return {
        "ok": True,
        "appTitle": "Исполнительная документация",
        "activeObjectId": current_json["id"] if current_json else "",
        "activeSection": "objects/current",
        "objects": [obj for obj in objects_all if obj["status"] == "active"],
        "archiveObjects": [obj for obj in objects_all if obj["status"] == "archive"],
        "currentObject": current_json,
        "aosr": aosr,
    }


def _short_name(name: str) -> str:
    return name if len(name) <= 32 else name[:32].rstrip() + "…"
