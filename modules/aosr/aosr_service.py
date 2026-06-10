# -*- coding: utf-8 -*-
"""Thin service layer around the existing AOSR generator."""
from __future__ import annotations

from pathlib import Path

from . import generate_aosr as core

core.VERBOSE = False
DataError = core.DataError


def act_to_json(a: dict, proj: dict) -> dict:
    return {
        "row": a["row"],
        "num": a["num"],
        "date": core.d_short(a["date"]) if a["date"] else "",
        "date_long": core.d_long(a["date"]) if a["date"] else "",
        "works": a["works"],
        "proj_doc": a["proj_doc"],
        "materials": core.materials_text(a),
        "presented": a["presented"],
        "dstart": core.d_short(a["dstart"]) if a["dstart"] else "",
        "dend": core.d_short(a["dend"]) if a["dend"] else "",
        "norms": a["norms"],
        "next_works": a["next_works"],
        "extra": a["extra"],
        "copies": a["copies"] or proj["copies_default"],
        "attach": a["attach"],
        "performer": a["performer"] or proj["performer_default"],
        "file": core.act_filename(a, proj),
        "errors": a.get("errors", []),
        "warnings": a.get("warnings", []),
    }


def load_aosr_state(data_file: str | Path) -> dict:
    data_file = Path(data_file).resolve()
    core.reset_events()
    try:
        proj, people, mats, acts = core.load_all(str(data_file))
        errors, warnings = core.validate(acts, mats)
    except core.DataError as e:
        return {
            "ok": False,
            "fatal": {"msg": e.msg, "hint": e.hint or ""},
            "events": list(core.EVENTS),
            "data_file": str(data_file),
        }

    return {
        "ok": True,
        "data_file": str(data_file),
        "project": proj,
        "out_dir": str(_resolve_out_dir(data_file, proj)),
        "people": people,
        "materials": [
            {
                "code": code,
                "name": mat["name"],
                "dtype": mat["dtype"],
                "num": mat["num"],
                "date": core.d_short(mat["date"]) if mat["date"] else "",
            }
            for code, mat in mats.items()
        ],
        "acts": [act_to_json(a, proj) for a in acts],
        "errors": errors,
        "warnings": warnings,
        "events": list(core.EVENTS),
    }


def generate_aosr_docs(data_file: str | Path, nums=None) -> dict:
    data_file = Path(data_file).resolve()
    core.reset_events()
    proj, people, mats, acts = core.load_all(str(data_file))
    core.validate(acts, mats)
    if nums is not None:
        wanted = {str(num).strip() for num in nums}
        acts = [act for act in acts if act["num"] in wanted]
        if not acts:
            raise core.DataError(
                "Выбранные акты не найдены в реестре.",
                "Обновите данные и попробуйте снова.",
            )

    bad = [act for act in acts if act.get("errors")]
    if bad:
        lines = []
        for act in bad:
            for msg in act["errors"]:
                lines.append(f"Акт № {act['num'] or '?'} (строка {act['row']}): {msg}")
        raise core.DataError(
            "Есть критические ошибки — файлы не созданы:\n" + "\n".join(lines),
            "Исправьте данные в Excel и нажмите «Обновить».",
        )

    out_dir = _resolve_out_dir(data_file, proj)
    made, out_abs = core.generate(acts, proj, people, out_dir=str(out_dir))
    return {"ok": True, "made": made, "out_dir": out_abs, "events": list(core.EVENTS)}


def _resolve_out_dir(data_file: Path, proj: dict) -> Path:
    out_dir = Path(proj["out_dir"])
    return out_dir.resolve() if out_dir.is_absolute() else (data_file.parent / out_dir).resolve()
