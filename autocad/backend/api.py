from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .autocad_com import check_autocad_status, execute_skill_in_autocad
from .config import settings
from .db import ExecutionLog, SessionLocal, SkillRecord
from .schemas import ExecutionLogOut, ExecuteSkillRequest, SkillCreate, SkillOut, SkillUpdate, StatusOut, SkillHistoryOut

router = APIRouter(prefix="/api")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/status", response_model=StatusOut)
def get_status():
    return check_autocad_status()


@router.get("/diagnostics")
def get_diagnostics():
    import subprocess, shutil
    status = check_autocad_status()
    checks = []

    # Check 1: pywin32
    try:
        import win32com.client
        checks.append({"id": "pywin32", "label": "Библиотека pywin32", "ok": True, "detail": "Установлена"})
    except ImportError:
        checks.append({"id": "pywin32", "label": "Библиотека pywin32", "ok": False, "detail": "Не установлена — pip install pywin32"})

    # Check 2: AutoCAD process running
    acad_running = False
    try:
        result = subprocess.run(["tasklist", "/FI", "IMAGENAME eq acad.exe", "/NH"], capture_output=True, text=True)
        acad_running = "acad.exe" in result.stdout
    except Exception:
        pass
    checks.append({"id": "acad_process", "label": "Процесс AutoCAD (acad.exe)", "ok": acad_running,
                   "detail": "Запущен" if acad_running else "Не найден в процессах"})

    # Check 3: COM connection
    checks.append({"id": "com_conn", "label": "COM-подключение к AutoCAD", "ok": status["connected"],
                   "detail": status["message"]})

    # Check 4: skills folder
    skills_ok = settings.skills_dir.exists() and len(list(settings.skills_dir.glob("*.lsp"))) > 0
    checks.append({"id": "skills_dir", "label": "Папка со скиллами", "ok": skills_ok,
                   "detail": f"{len(list(settings.skills_dir.glob('*.lsp')))} .lsp файлов найдено"})

    # Check 5: DB readable
    db_ok = settings.db_path.exists()
    checks.append({"id": "db", "label": "База данных", "ok": db_ok,
                   "detail": "Файл БД существует" if db_ok else "Файл БД не найден"})

    all_ok = all(c["ok"] for c in checks)
    return {
        "all_ok": all_ok,
        "status": status,
        "checks": checks,
    }


@router.post("/diagnostics/open-autocad")
def open_autocad():
    import subprocess
    try:
        subprocess.Popen(["acad.exe"])
        return {"ok": True, "message": "Команда запуска AutoCAD отправлена"}
    except FileNotFoundError:
        # Try common install paths
        import os, glob
        patterns = [
            r"C:\Program Files\Autodesk\AutoCAD*\acad.exe",
            r"C:\Program Files (x86)\Autodesk\AutoCAD*\acad.exe",
        ]
        for pattern in patterns:
            matches = glob.glob(pattern)
            if matches:
                subprocess.Popen([matches[0]])
                return {"ok": True, "message": f"AutoCAD запущен: {matches[0]}"}
        return {"ok": False, "message": "acad.exe не найден. Убедитесь что AutoCAD установлен и добавлен в PATH"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.get("/skills", response_model=list[SkillOut])
def list_skills(
    category: str = Query("all"),
    query: str = Query(""),
    db: Session = Depends(get_db),
):
    q = db.query(SkillRecord)
    if category != "all":
        q = q.filter(SkillRecord.category == category)
    if query.strip():
        term = f"%{query.strip()}%"
        q = q.filter(
            (SkillRecord.title.ilike(term))
            | (SkillRecord.description.ilike(term))
            | (SkillRecord.command_name.ilike(term))
        )
    skills = q.order_by(SkillRecord.id.asc()).all()
    changed = False
    for skill in skills:
        if len(skill.code_content or "") < 10:
            file_path = settings.skills_dir / skill.file_name
            if file_path.exists():
                skill.code_content = file_path.read_text(encoding="utf-8", errors="replace")
                changed = True
    if changed:
        db.commit()
    return skills


@router.get("/skills/{skill_id}", response_model=SkillOut)
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Скилл не найден")
    # If DB code_content is broken/empty, read from file
    if len(skill.code_content or "") < 10:
        file_path = settings.skills_dir / skill.file_name
        if file_path.exists():
            skill.code_content = file_path.read_text(encoding="utf-8", errors="replace")
            db.commit()
    return skill


@router.post("/skills", response_model=SkillOut)
def create_skill(data: SkillCreate, db: Session = Depends(get_db)):
    clean_code_name = re.sub(r"[^a-zA-Z0-9_]", "_", data.command_name).lower()
    code = f"custom_{clean_code_name}"
    version = data.version or "1.0"
    file_name = f"{code}_v{version}.lsp"
    file_path = settings.skills_dir / file_name

    file_path.write_text(data.code_content, encoding="utf-8")

    record = SkillRecord(
        code=code,
        title=data.title,
        category=data.category,
        description=data.description,
        command_name=data.command_name,
        file_name=file_name,
        code_content=data.code_content,
        version=data.version,
        is_builtin=False,
        use_count=0,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/skills/{skill_id}", response_model=SkillOut)
def update_skill(skill_id: int, data: SkillUpdate, db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Скилл не найден")

    if data.title is not None:
        skill.title = data.title
    if data.category is not None:
        skill.category = data.category
    if data.description is not None:
        skill.description = data.description
    if data.command_name is not None:
        skill.command_name = data.command_name

    new_version = (data.version or skill.version or "1.0").strip()
    new_code = data.code_content if data.code_content is not None else skill.code_content

    # Always save as versioned file: skill_code_vX.Y.lsp
    new_file_name = f"{skill.code}_v{new_version}.lsp"
    new_file_path = settings.skills_dir / new_file_name
    new_file_path.write_text(new_code, encoding="utf-8")

    skill.file_name = new_file_name
    skill.version = new_version
    skill.code_content = new_code

    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/skills/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Скилл не найден")
    if skill.is_builtin:
        raise HTTPException(status_code=400, detail="Системные встроенные скиллы нельзя удалять")

    # Delete only the current active file
    file_path = settings.skills_dir / skill.file_name
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    db.delete(skill)
    db.commit()
    return {"ok": True, "message": "Скилл успешно удалён"}


@router.get("/skills/{skill_id}/history", response_model=list[SkillHistoryOut])
def get_skill_history(skill_id: int, db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == skill_id).first()
    if not skill:
        return []

    # Only look at files matching pattern: code_vX.Y.lsp
    pattern = f"{skill.code}_v*.lsp"
    files = sorted(settings.skills_dir.glob(pattern), key=lambda f: f.stat().st_mtime, reverse=True)

    history = []
    for f in files:
        if not f.is_file() or f.stat().st_size < 5:
            continue
        # Extract version from filename: elevation_mark_v1.0.lsp -> "1.0"
        v_str = f.stem[len(skill.code) + 2:]  # skip "code_v"
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            continue
        history.append({
            "version": v_str,
            "file_name": f.name,
            "code_content": content,
            "created_at": f.stat().st_mtime,
        })

    return history


@router.post("/skills/{skill_id}/rollback")
def rollback_skill(skill_id: int, version: str = Query(...), db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Скилл не найден")

    target_file = f"{skill.code}_v{version}.lsp"
    file_path = settings.skills_dir / target_file

    if not file_path.exists() or file_path.stat().st_size < 5:
        raise HTTPException(status_code=404, detail=f"Файл версии {version} не найден")

    code_content = file_path.read_text(encoding="utf-8")
    skill.code_content = code_content
    skill.version = version
    skill.file_name = target_file

    db.commit()
    return {"ok": True, "message": f"Откат на версию {version} выполнен"}


@router.post("/execute")
def execute_skill(req: ExecuteSkillRequest, db: Session = Depends(get_db)):
    skill = db.query(SkillRecord).filter(SkillRecord.id == req.skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Скилл не найден")

    lsp_path = settings.skills_dir / skill.file_name

    if not lsp_path.exists() and skill.code_content:
        lsp_path.write_text(skill.code_content, encoding="utf-8")

    result = execute_skill_in_autocad(lsp_path, skill.command_name)

    skill.use_count += 1

    log = ExecutionLog(
        skill_id=skill.id,
        skill_title=skill.title,
        status="success" if result["success"] else "error",
        dwg_name=result.get("dwg_name", "—"),
        message=result.get("message", ""),
    )
    db.add(log)
    db.commit()

    return {
        "ok": result["success"],
        "message": result["message"],
        "dwg_name": result.get("dwg_name"),
        "skill": skill.title,
    }


@router.get("/logs", response_model=list[ExecutionLogOut])
def get_logs(limit: int = Query(20), db: Session = Depends(get_db)):
    return db.query(ExecutionLog).order_by(ExecutionLog.executed_at.desc()).limit(limit).all()
