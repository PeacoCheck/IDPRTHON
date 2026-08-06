from __future__ import annotations

from pathlib import Path
from sqlalchemy.orm import Session

from .config import settings
from .db import SkillRecord

BUILTIN_SKILLS = [
    {
        "code": "elevation_mark",
        "title": "Выноска высотных отметок",
        "category": "marks",
        "description": "Автоматическое измерение высоты от базовой точки 0.000 и расстановка текстовых выносок видов +0.000/-1.250 на чертеже.",
        "command_name": "ID_ElevationMark",
        "file_name": "elevation_mark_v1.0.lsp",
        "version": "1.0",
    },
    {
        "code": "polyline_length",
        "title": "Суммирование длин полилиний",
        "category": "polyline",
        "description": "Вычисление суммарной длины выделенных отрезков, полилиний, дуг и сплайнов (трубопроводы, кабели, сварные швы ИД) в мм и метрах.",
        "command_name": "ID_PolylineLength",
        "file_name": "polyline_length_v1.0.lsp",
        "version": "1.0",
    },
    {
        "code": "block_count",
        "title": "Спецификация и подсчёт блоков",
        "category": "blocks",
        "description": "Автоматический подсчёт количества выбранных элементов и блоков в чертеже с выводом подсчитанной ведомости.",
        "command_name": "ID_BlockCount",
        "file_name": "block_count_v1.0.lsp",
        "version": "1.0",
    },
    {
        "code": "title_block_id",
        "title": "Вставка штампа ИД",
        "category": "stamps",
        "description": "Отрисовка ГОСТ штампа исполнительной документации («Исправлениям и отклонениям соответствует») с атрибутами ID Vault.",
        "command_name": "ID_TitleBlockID",
        "file_name": "title_block_id_v1.0.lsp",
        "version": "1.0",
    },
    {
        "code": "batch_pdf",
        "title": "Пакетный экспорт листов в PDF",
        "category": "print",
        "description": "Пакетная публикация всех подготовленных листов исполнительного чертежа в единый PDF документ.",
        "command_name": "ID_BatchExportPDF",
        "file_name": "batch_pdf_v1.0.lsp",
        "version": "1.0",
    },
]


def seed_skills(db: Session) -> None:
    existing = {s.code: s for s in db.query(SkillRecord).all()}

    for skill_data in BUILTIN_SKILLS:
        file_path = settings.skills_dir / skill_data["file_name"]
        code_content = ""
        if file_path.exists():
            code_content = file_path.read_text(encoding="utf-8", errors="replace")

        if skill_data["code"] not in existing:
            # Insert new record
            record = SkillRecord(
                code=skill_data["code"],
                title=skill_data["title"],
                category=skill_data["category"],
                description=skill_data["description"],
                command_name=skill_data["command_name"],
                file_name=skill_data["file_name"],
                version=skill_data.get("version", "1.0"),
                code_content=code_content,
                is_builtin=True,
                use_count=0,
            )
            db.add(record)
        else:
            # Always sync: fix broken code_content from file
            record = existing[skill_data["code"]]
            if len(record.code_content or "") < 10 and code_content:
                record.code_content = code_content
                record.file_name = skill_data["file_name"]
                record.version = skill_data.get("version", record.version or "1.0")

    db.commit()
