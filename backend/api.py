from __future__ import annotations

import os
import json
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any

from docx import Document as WordDocument
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, or_, select

from .config import BASE_DIR, settings
from .db import (
    CatalogItem,
    CorpusSource,
    Document,
    ObjectGroup,
    ObjectRecord,
    Preset,
    Section,
    SessionLocal,
    StructureException,
    StructureRule,
    Template,
)
from .docx_templates import inspect_docx_markers, render_docx_template, resolve_marker_values
from .schemas import DocumentCreate, DocumentOut, DocumentPatch, ObjectCreate, ObjectOut, ObjectPatch, TemplateBind
from .seed import GROUPS

router = APIRouter(prefix="/api")
MAX_TEMPLATE_SIZE = 25 * 1024 * 1024


def safe_component(value: str, fallback: str = "Документ") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value)).strip(" .")
    return (cleaned[:120] or fallback).strip()


def is_within(path: Path, root: Path) -> bool:
    path = path.resolve()
    root = root.resolve()
    return path == root or root in path.parents


def template_roots() -> tuple[Path, Path]:
    return ((BASE_DIR / "resources" / "templates").resolve(), (settings.vault_dir / "templates").resolve())


def resolve_template_path(value: str, *, must_exist: bool = True) -> Path:
    raw = Path(value).expanduser()
    candidate = raw.resolve() if raw.is_absolute() else (BASE_DIR / raw).resolve()
    if candidate.suffix.casefold() != ".docx" or not any(is_within(candidate, root) for root in template_roots()):
        raise HTTPException(422, "DOCX-шаблон должен находиться в resources/templates или vault/templates")
    if must_exist and not candidate.is_file():
        raise HTTPException(404, "Файл DOCX-шаблона не найден")
    return candidate


def stored_template_path(path: Path) -> str:
    resolved = path.resolve()
    if is_within(resolved, BASE_DIR):
        return resolved.relative_to(BASE_DIR.resolve()).as_posix()
    return str(resolved)


def managed_template_target(template: Template, original_name: str) -> tuple[Path, int]:
    root = (settings.vault_dir / "templates").resolve()
    root.mkdir(parents=True, exist_ok=True)
    version = template.version + (1 if template.template_file else 0)
    stem = safe_component(Path(original_name).stem, "template")
    target = root / f"template-{template.id}-v{version}-{stem}.docx"
    while target.exists() and stored_template_path(target) != template.template_file:
        version += 1
        target = root / f"template-{template.id}-v{version}-{stem}.docx"
    return target, version


def template_markers_payload(template: Template) -> dict[str, Any]:
    if not template.template_file:
        return {
            "template_id": template.id,
            "template_file": "",
            "marker_map": template.marker_map or {},
            "markers": [],
        }
    path = resolve_template_path(template.template_file)
    markers = inspect_docx_markers(path)
    configured = template.marker_map or {}
    for marker in markers:
        marker["mapping"] = configured.get(marker["name"])
    return {
        "template_id": template.id,
        "template_file": template.template_file,
        "marker_map": configured,
        "markers": markers,
    }


def normalized_marker_map(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(422, "marker_map должен быть JSON-объектом")
    nested = payload.get("markers")
    return nested if isinstance(nested, dict) else payload


def document_marker_context(document: Document, obj: ObjectRecord) -> dict[str, Any]:
    values = dict(document.values_json or {})
    meta = dict(obj.meta_json or {})
    customer = dict(meta.get("customer") or {})
    contractor = dict(meta.get("contractor") or {})
    responsible = dict(meta.get("responsible_person") or {})
    context: dict[str, Any] = {
        **values,
        "document": {
            "id": document.id,
            "number": document.number,
            "date": document.document_date,
            "title": document.title,
            "work_title": document.work_title,
        },
        "object": {
            "id": obj.id,
            "code": obj.code,
            "name": obj.name,
            "address": obj.address,
            "meta": meta,
        },
        "customer": customer,
        "contractor": contractor,
        "responsible": responsible,
        "document.number": document.number,
        "document.date": document.document_date,
        "journal.number": document.number,
        "object.code": obj.code,
        "object.name": obj.name,
        "object.address": obj.address,
        "object.meta.work_kind": meta.get("work_kind") or values.get("work_kind"),
        "customer.name": values.get("customer.name") or customer.get("name"),
        "contractor.name": values.get("contractor.name") or contractor.get("name"),
        "responsible.fio": values.get("responsible.fio") or responsible.get("fio"),
        "journal_number": document.number,
        "journal_date": document.document_date,
        "construction_type": values.get("construction_type") or meta.get("work_kind") or values.get("work_kind"),
        "object_name": obj.name,
        "object_address": obj.address,
        "zakaz": values.get("customer.name") or customer.get("name"),
        "podryad": values.get("contractor.name") or contractor.get("name"),
    }
    return context


def expected_output_path(document_id: int, object_id: int) -> Path:
    return (settings.vault_dir / "output" / f"object-{object_id}" / f"document-{document_id}.docx").resolve()


def safe_owned_output(path_value: str, document_id: int, object_id: int) -> Path | None:
    if not path_value:
        return None
    candidate = Path(path_value).expanduser().resolve()
    output_root = (settings.vault_dir / "output").resolve()
    expected = expected_output_path(document_id, object_id)
    if candidate == expected and is_within(candidate, output_root):
        return candidate
    return None


def infer_document_type(filename: str) -> str:
    name = filename.lower()
    patterns = (
        ("реестр", "registry"),
        ("общий журнал", "general_journal"),
        ("входн", "incoming_control"),
        ("свар", "welding_journal"),
        ("аоср", "aosr"),
        ("скрыт", "aosr"),
        ("вик", "vik"),
        ("гидр", "hydro"),
        ("исполнительн", "executive_scheme"),
        ("сертификат", "certificate"),
        ("паспорт", "passport"),
        ("приказ", "appointment_order"),
        ("ппр", "ppr"),
    )
    return next((doc_type for marker, doc_type in patterns if marker in name), "imported")


def current_object(db) -> ObjectRecord:
    obj = db.scalar(select(ObjectRecord).where(ObjectRecord.is_current.is_(True)))
    if not obj:
        obj = db.scalar(select(ObjectRecord).where(ObjectRecord.status == "active").limit(1))
    if not obj:
        raise HTTPException(404, "Нет активного объекта")
    return obj


def serialize(model) -> dict:
    data = {column.name: getattr(model, column.name) for column in model.__table__.columns}
    for key, value in tuple(data.items()):
        if hasattr(value, "isoformat"):
            data[key] = value.isoformat()
    return data


def document_is_ready(document: Document) -> bool:
    return document.completion_status == "completed" and not document.missing_fields_json


def get_nested(data: dict, path: str):
    current = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def integrity_for_object(db, obj: ObjectRecord) -> dict:
    documents = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
    rules = db.scalars(select(StructureRule).where(StructureRule.profile == obj.profile).order_by(StructureRule.id)).all()
    exceptions = {
        item.rule_id: item
        for item in db.scalars(select(StructureException).where(StructureException.object_id == obj.id, StructureException.status == "accepted")).all()
    }
    checks = []
    satisfied = 0
    for rule in rules:
        matches = [document for document in documents if document.doc_type in rule.doc_types_json and document.status != "superseded"]
        ready_matches = [
            document
            for document in matches
            if document.completion_status == "completed" and not document.missing_fields_json
        ]
        count = len(matches)
        exception = exceptions.get(rule.id)
        if len(ready_matches) >= rule.min_count:
            status = "ok"
            satisfied += 1
        elif count >= rule.min_count:
            status = "pending"
        elif exception and exception.resolution_type != "pending":
            status = "waived"
            satisfied += 1
        elif exception:
            status = "pending"
        else:
            status = rule.severity
        checks.append(
            {
                "id": rule.id,
                "code": rule.code,
                "title": rule.title,
                "group_kind": rule.group_kind,
                "doc_types": rule.doc_types_json,
                "description": rule.description,
                "required": rule.min_count,
                "found": count,
                "ready": len(ready_matches),
                "document_ids": [document.id for document in matches],
                "pending_document_id": next(
                    (
                        document.id
                        for document in matches
                        if document.completion_status != "completed" or document.missing_fields_json
                    ),
                    None,
                ),
                "status": status,
                "reason": exception.reason if exception else "",
                "resolution_type": exception.resolution_type if exception else "",
                "evidence": exception.evidence if exception else "",
                "resolved_by": exception.created_by if exception else "",
                "resolved_at": exception.updated_at.isoformat() if exception and exception.updated_at else "",
            }
        )
    return {
        "score": round(satisfied / len(rules) * 100) if rules else 100,
        "total": len(rules),
        "satisfied": satisfied,
        "issues": sum(check["status"] in {"error", "warning", "pending"} for check in checks),
        "checks": checks,
    }


def resolved_template_fields(template: Template, obj: ObjectRecord, preset: Preset | None = None, documents: list[Document] | None = None) -> dict:
    meta = obj.meta_json or {}
    object_data = {
        "object": {
            "name": obj.name,
            "address": obj.address,
            "code": obj.code,
            "meta": meta,
            "participants": [
                value
                for value in (
                    meta.get("customer", {}).get("name"),
                    meta.get("contractor", {}).get("name"),
                    meta.get("responsible_person", {}).get("fio"),
                )
                if value
            ],
            "documents": [
                {"number": document.number, "title": document.title, "date": document.document_date, "status": document.status}
                for document in (documents or [])
            ],
        }
    }
    preset_data = {"preset": preset.values_json if preset else {}}
    resolved = {}
    fields = []
    for field in template.fields_json or []:
        source = field.get("source") or template.field_map_json.get(field["key"], "manual")
        value = None
        if source.startswith("object."):
            value = get_nested(object_data, source)
            if value in (None, "", []) and source == "object.meta.construction_type":
                value = meta.get("work_kind")
        elif source.startswith("preset."):
            value = get_nested(preset_data, source)
        elif source == "default":
            value = field.get("default", "Соответствует")
        if value in (None, "", []) and preset and field["key"] in (preset.values_json or {}):
            value = preset.values_json[field["key"]]
        status = "resolved" if value not in (None, "", []) else "manual"
        fields.append({**field, "source": source, "value": value, "status": status})
        if status == "resolved":
            resolved[field["key"]] = value
    return {
        "template": serialize(template),
        "object": serialize(obj),
        "preset": serialize(preset) if preset else None,
        "fields": fields,
        "values": resolved,
        "resolved_count": sum(field["status"] == "resolved" for field in fields),
        "manual_count": sum(field["status"] == "manual" for field in fields),
    }


def resolved_document_values(
    document: Document,
    template: Template | None,
    obj: ObjectRecord | None,
    documents: list[Document] | None = None,
) -> dict:
    """Return document values with object-bound fields refreshed from the object profile."""
    stored_values = dict(document.values_json or {})
    if not template or not obj:
        return stored_values

    resolution = resolved_template_fields(template, obj, documents=documents)
    values = {**resolution["values"], **stored_values}
    for field in resolution["fields"]:
        if not str(field.get("source") or "").startswith("object."):
            continue
        key = field["key"]
        if field["status"] == "resolved":
            values[key] = field["value"]
        else:
            # An empty current profile value must not reveal an obsolete snapshot.
            values.pop(key, None)
    return values


def serialize_documents_for_read(db, documents: list[Document]) -> list[dict]:
    """Serialize documents using current object data without mutating the database."""
    object_map = {object_id: db.get(ObjectRecord, object_id) for object_id in {item.object_id for item in documents}}
    template_map = {
        template_id: db.get(Template, template_id)
        for template_id in {item.template_id for item in documents if item.template_id}
    }
    documents_by_object: dict[int, list[Document]] = {}
    for item in documents:
        documents_by_object.setdefault(item.object_id, []).append(item)

    result = []
    for item in documents:
        data = serialize(item)
        values = resolved_document_values(
            item,
            template_map.get(item.template_id),
            object_map.get(item.object_id),
            documents_by_object.get(item.object_id),
        )
        data["values_json"] = values
        data["missing_fields_json"] = missing_fields_for_template(
            template_map.get(item.template_id),
            values,
            item.number,
            item.work_title,
            item.document_date,
        )
        result.append(data)
    return result


def missing_fields_for_template(template: Template | None, values: dict, number: str = "", work_title: str = "", document_date: str = "") -> list[str]:
    if not template:
        return []
    aliases = {
        "act.number": number,
        "order.number": number,
        "scheme.number": number,
        "journal.number": number,
        "act.date": document_date,
        "order.date": document_date,
        "works": work_title,
        "scope": work_title,
    }
    missing = []
    for field in template.fields_json or []:
        if not field.get("required"):
            continue
        key = field["key"]
        value = values.get(key)
        if value in (None, "", []):
            value = get_nested(values, key)
        if value in (None, "", []):
            value = aliases.get(key)
        if value in (None, "", []):
            missing.append(key)
    return missing


@router.get("/app-state")
def app_state() -> dict:
    with SessionLocal() as db:
        obj = current_object(db)
        objects = db.scalars(select(ObjectRecord).order_by(ObjectRecord.created_at)).all()
        sections = db.scalars(select(Section).order_by(Section.sort_order)).all()
        documents = db.scalars(select(Document).where(Document.object_id == obj.id).order_by(Document.id.desc())).all()
        return {
            "ok": True,
            "appTitle": "ID Vault",
            "activeObjectId": obj.id,
            "currentObject": serialize(obj),
            "objects": [serialize(item) for item in objects if item.status == "active"],
            "archiveObjects": [serialize(item) for item in objects if item.status == "archived"],
            "sections": [serialize(item) for item in sections],
            "documents": serialize_documents_for_read(db, documents),
            "capabilities": {"pdf": False, "fts": True, "offline": True},
        }


@router.get("/objects/summary")
def object_summaries() -> list[dict]:
    with SessionLocal() as db:
        objects = db.scalars(select(ObjectRecord).order_by(ObjectRecord.is_current.desc(), ObjectRecord.updated_at.desc())).all()
        result = []
        for obj in objects:
            documents = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
            integrity = integrity_for_object(db, obj)
            result.append(
                {
                    **serialize(obj),
                    "documents_count": len(documents),
                    "ready_count": sum(document_is_ready(document) for document in documents),
                    "issues_count": integrity["issues"] + sum(len(document.warnings_json) for document in documents),
                    "integrity": integrity["score"],
                    "updated_label": "Сегодня" if obj.is_current else "Недавно",
                }
            )
        return result


@router.get("/objects/{object_id}/workspace")
def object_workspace(object_id: int) -> dict:
    with SessionLocal() as db:
        obj = db.get(ObjectRecord, object_id)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        groups = db.scalars(select(ObjectGroup).where(ObjectGroup.object_id == obj.id).order_by(ObjectGroup.sort_order)).all()
        documents = db.scalars(select(Document).where(Document.object_id == obj.id).order_by(Document.updated_at.desc())).all()
        document_map: dict[int | None, list[Document]] = {}
        for document in documents:
            document_map.setdefault(document.group_id, []).append(document)
        serialized_documents = serialize_documents_for_read(db, documents)
        return {
            "object": serialize(obj),
            "groups": [
                {
                    **serialize(group),
                    "documents_count": len(document_map.get(group.id, [])),
                    "ready_count": sum(document_is_ready(document) for document in document_map.get(group.id, [])),
                    "issues_count": sum(bool(document.warnings_json or document.missing_fields_json) for document in document_map.get(group.id, [])),
                }
                for group in groups
            ],
            "documents": serialized_documents,
            "integrity": integrity_for_object(db, obj),
        }


@router.get("/objects", response_model=list[ObjectOut])
def list_objects(include_archived: bool = False):
    with SessionLocal() as db:
        query = select(ObjectRecord).order_by(ObjectRecord.created_at.desc())
        if not include_archived:
            query = query.where(ObjectRecord.status == "active")
        return db.scalars(query).all()


@router.post("/object/select")
def select_object(payload: dict) -> dict:
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, int(payload.get("id", 0)))
        if not obj:
            raise HTTPException(404, "Объект не найден")
        for item in db.scalars(select(ObjectRecord).where(ObjectRecord.is_current.is_(True))):
            item.is_current = False
        obj.is_current = True
    return app_state()


@router.post("/object/add", response_model=ObjectOut)
def add_object(payload: ObjectCreate):
    with SessionLocal.begin() as db:
        next_id = (db.scalar(select(ObjectRecord.id).order_by(ObjectRecord.id.desc()).limit(1)) or 0) + 1
        code = payload.code or f"{date.today().year}-{next_id:03d}"
        if db.scalar(select(ObjectRecord.id).where(ObjectRecord.code == code)):
            raise HTTPException(409, "Код объекта уже используется")
        for item in db.scalars(select(ObjectRecord).where(ObjectRecord.is_current.is_(True))):
            item.is_current = False
        obj = ObjectRecord(
            code=code,
            name=payload.name,
            short_name=payload.short_name or payload.name[:80],
            address=payload.address,
            comment=payload.comment,
            folder_path=f"objects/{safe_component(code, 'OBJECT')}_{safe_component(payload.name[:40], 'Объект')}",
            is_current=True,
            profile="industrial_repair",
            meta_json={},
        )
        db.add(obj)
        db.flush()
        for code_value, title, kind, description, order, required in GROUPS:
            db.add(ObjectGroup(object_id=obj.id, code=code_value, title=title, kind=kind, description=description, sort_order=order, is_required=required))
        return obj


@router.post("/objects/{object_id}/groups")
def add_group(object_id: int, payload: dict) -> dict:
    title = str(payload.get("title") or "").strip()
    if len(title) < 2:
        raise HTTPException(422, "Укажите название группы")
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, object_id)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        existing = db.scalar(select(ObjectGroup).where(ObjectGroup.object_id == object_id, ObjectGroup.title == title))
        if existing:
            raise HTTPException(409, "Такая группа уже существует")
        last_order = db.scalar(select(ObjectGroup.sort_order).where(ObjectGroup.object_id == object_id).order_by(ObjectGroup.sort_order.desc()).limit(1)) or 0
        code = f"custom-{object_id}-{last_order + 10}"
        group = ObjectGroup(
            object_id=object_id,
            code=code,
            title=title,
            kind=str(payload.get("kind") or "other"),
            description=str(payload.get("description") or ""),
            sort_order=last_order + 10,
            is_required=bool(payload.get("is_required", False)),
        )
        db.add(group)
        db.flush()
        return serialize(group)


@router.patch("/objects/{object_id}", response_model=ObjectOut)
def update_object(object_id: int, payload: ObjectPatch):
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, object_id)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        for key, value in payload.model_dump(exclude_none=True).items():
            setattr(obj, key, value)
        db.flush()
        return obj


@router.post("/object/archive")
def archive_object(payload: dict) -> dict:
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, int(payload.get("id", 0)))
        if not obj:
            raise HTTPException(404, "Объект не найден")
        replacement = db.scalar(select(ObjectRecord).where(ObjectRecord.status == "active", ObjectRecord.id != obj.id).limit(1))
        if not replacement:
            raise HTTPException(409, "Нельзя архивировать последний активный объект")
        obj.status = "archived"
        obj.is_current = False
        replacement.is_current = True
    return app_state()


@router.post("/object/unarchive")
def unarchive_object(payload: dict) -> dict:
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, int(payload.get("id", 0)))
        if not obj:
            raise HTTPException(404, "Объект не найден")
        obj.status = "active"
    return app_state()


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(object_id: int | None = None, q: str = ""):
    with SessionLocal() as db:
        oid = object_id or current_object(db).id
        query = select(Document).where(Document.object_id == oid)
        if q:
            query = query.where(or_(Document.number.ilike(f"%{q}%"), Document.work_title.ilike(f"%{q}%")))
        documents = db.scalars(query.order_by(Document.id.desc())).all()
        return serialize_documents_for_read(db, documents)


@router.post("/documents", response_model=DocumentOut)
def create_document(payload: DocumentCreate):
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, payload.object_id) if payload.object_id else current_object(db)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        values = dict(payload.values_json)
        template = db.get(Template, payload.template_id) if payload.template_id else None
        if payload.template_id and not template:
            raise HTTPException(404, "Шаблон не найден")
        missing_fields: list[str] = []
        if payload.preset_id:
            preset = db.get(Preset, payload.preset_id)
            if not preset:
                raise HTTPException(404, "Пресет не найден")
            if template and preset.doc_type != template.doc_type:
                raise HTTPException(422, "Пресет не подходит к выбранному шаблону")
            values = {**preset.values_json, **values}
            preset.use_count += 1
        else:
            preset = None
        if template:
            object_documents = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
            resolution = resolved_template_fields(template, obj, preset, object_documents)
            values = {**resolution["values"], **values}
        group_id = payload.group_id
        if group_id:
            selected_group = db.get(ObjectGroup, group_id)
            if not selected_group or selected_group.object_id != obj.id:
                raise HTTPException(422, "Группа не принадлежит выбранному объекту")
        if not group_id and template:
            group = db.scalar(select(ObjectGroup).where(ObjectGroup.object_id == obj.id, ObjectGroup.kind == template.group_kind).limit(1))
            group_id = group.id if group else None
        count = db.scalar(select(Document.id).where(Document.object_id == obj.id).order_by(Document.id.desc()).limit(1)) or 0
        number = payload.number or f"ИД-{count + 15:03d}"
        document_date = payload.document_date or date.today().strftime("%d.%m.%Y")
        missing_fields = missing_fields_for_template(template, values, number, payload.work_title, document_date)
        doc = Document(
            object_id=obj.id,
            group_id=group_id,
            template_id=template.id if template else None,
            number=number,
            title=payload.title,
            doc_type=template.doc_type if template else payload.doc_type,
            work_title=payload.work_title or values.get("work_title", ""),
            document_date=document_date,
            status="draft",
            completion_status="not_started",
            values_json=values,
            warnings_json=[],
            missing_fields_json=missing_fields,
        )
        db.add(doc)
        db.flush()
        return doc


@router.post("/objects/{object_id}/import", response_model=DocumentOut)
def import_document_file(object_id: int, file: UploadFile = File(...), group_id: int | None = Form(default=None)):
    with SessionLocal.begin() as db:
        obj = db.get(ObjectRecord, object_id)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        source_name = Path(file.filename or "Документ").name
        allowed_suffixes = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".jpg", ".jpeg", ".png", ".dwg", ".dxf", ".txt"}
        if Path(source_name).suffix.casefold() not in allowed_suffixes:
            raise HTTPException(415, "Поддерживаются документы, таблицы, PDF, изображения и чертежи")
        if getattr(file, "size", 0) and file.size > 100 * 1024 * 1024:
            raise HTTPException(413, "Файл больше 100 МБ")
        doc_type = infer_document_type(source_name)
        group = db.get(ObjectGroup, group_id) if group_id else None
        if group and group.object_id != obj.id:
            raise HTTPException(422, "Группа не принадлежит выбранному объекту")
        if not group:
            kind_by_type = {
                "registry": "registry",
                "general_journal": "journals",
                "incoming_control": "quality",
                "welding_journal": "journals",
                "aosr": "acts",
                "vik": "acts",
                "hydro": "acts",
                "executive_scheme": "schemes",
                "certificate": "quality",
                "passport": "quality",
                "appointment_order": "permits",
                "ppr": "source",
            }
            kind = kind_by_type.get(doc_type, "other")
            group = db.scalar(select(ObjectGroup).where(ObjectGroup.object_id == obj.id, ObjectGroup.kind == kind).limit(1))
        filename = safe_component(source_name)
        object_root = (settings.vault_dir / obj.folder_path).resolve()
        vault_root = settings.vault_dir.resolve()
        if object_root != vault_root and vault_root not in object_root.parents:
            raise HTTPException(422, "Путь объекта выходит за пределы локального хранилища")
        target_dir = object_root / "Импорт" / safe_component(group.title if group else "Без группы")
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / filename
        suffix = 2
        while target.exists():
            target = target_dir / f"{Path(filename).stem}_{suffix}{Path(filename).suffix}"
            suffix += 1
        with target.open("wb") as output:
            shutil.copyfileobj(file.file, output)
        next_id = (db.scalar(select(Document.id).order_by(Document.id.desc()).limit(1)) or 0) + 1
        doc = Document(
            object_id=obj.id,
            group_id=group.id if group else None,
            number=f"ИМП-{next_id:04d}",
            title=Path(source_name).stem,
            doc_type=doc_type,
            work_title="Импортированный документ",
            document_date=date.today().strftime("%d.%m.%Y"),
            status="ready",
            completion_status="completed",
            values_json={},
            warnings_json=[],
            missing_fields_json=[],
            source_kind="imported",
            source_file=str(target),
        )
        db.add(doc)
        db.flush()
        return doc


@router.patch("/documents/{document_id}", response_model=DocumentOut)
def update_document(document_id: int, payload: DocumentPatch):
    with SessionLocal.begin() as db:
        doc = db.get(Document, document_id)
        if not doc:
            raise HTTPException(404, "Документ не найден")
        changes = payload.model_dump(exclude_none=True)
        values_patch = changes.pop("values_json", None)
        requested_completion = changes.pop("completion_status", None)
        previous_completion = doc.completion_status
        content_changed = any(
            key in changes and getattr(doc, key) != value
            for key, value in changes.items()
            if key in {"number", "work_title", "document_date"}
        )
        if values_patch is not None:
            merged_values = {**(doc.values_json or {}), **values_patch}
            content_changed = content_changed or merged_values != (doc.values_json or {})
            doc.values_json = merged_values
        for key, value in changes.items():
            setattr(doc, key, value)
        if content_changed and doc.output_file:
            doc.values_json = {**(doc.values_json or {}), "_previous_output_file": doc.output_file}
            doc.output_file = None
            doc.status = "draft"
        template = db.get(Template, doc.template_id) if doc.template_id else None
        if template:
            obj = db.get(ObjectRecord, doc.object_id)
            object_documents = db.scalars(select(Document).where(Document.object_id == doc.object_id)).all()
            doc.values_json = resolved_document_values(doc, template, obj, object_documents)
        doc.missing_fields_json = missing_fields_for_template(
            template,
            doc.values_json or {},
            doc.number,
            doc.work_title,
            doc.document_date,
        )
        if requested_completion is not None:
            doc.completion_status = requested_completion
        elif content_changed:
            doc.completion_status = "needs_revision" if previous_completion == "completed" else "in_progress"
        if doc.completion_status == "completed" and doc.missing_fields_json:
            raise HTTPException(
                422,
                detail={
                    "message": "Документ нельзя завершить: заполнены не все обязательные поля",
                    "missing_fields": doc.missing_fields_json,
                },
            )
        db.flush()
        return doc


@router.delete("/documents/{document_id}")
def delete_document(document_id: int) -> dict:
    with SessionLocal.begin() as db:
        doc = db.get(Document, document_id)
        if not doc:
            raise HTTPException(404, "Документ не найден")
        object_id = doc.object_id
        source_file = doc.source_file or ""
        output_candidates = [
            value
            for value in (
                doc.output_file,
                (doc.values_json or {}).get("_previous_output_file"),
            )
            if isinstance(value, str) and value
        ]
        db.delete(doc)

    deleted_outputs: list[str] = []
    preserved_outputs: list[str] = []
    deletion_errors: list[str] = []
    source_resolved = Path(source_file).expanduser().resolve() if source_file else None
    for value in dict.fromkeys(output_candidates):
        owned = safe_owned_output(value, document_id, object_id)
        if not owned or (source_resolved and owned == source_resolved):
            preserved_outputs.append(value)
            continue
        try:
            if owned.exists():
                owned.unlink()
                deleted_outputs.append(str(owned))
        except OSError as exc:
            deletion_errors.append(f"{owned}: {exc}")
    return {
        "ok": True,
        "document_id": document_id,
        "source_file_preserved": source_file,
        "deleted_outputs": deleted_outputs,
        "preserved_outputs": preserved_outputs,
        "warnings": deletion_errors,
    }


@router.post("/generate")
def generate_documents(payload: dict) -> dict:
    ids = payload.get("ids") or payload.get("nums") or []
    blocked: list[dict[str, Any]] = []
    made: list[dict[str, Any]] = []
    with SessionLocal.begin() as db:
        query = select(Document)
        if ids:
            numeric_ids = [int(value) for value in ids if str(value).isdigit()]
            query = query.where(or_(Document.id.in_(numeric_ids), Document.number.in_([str(value) for value in ids])))
        else:
            query = query.where(Document.object_id == current_object(db).id)
        docs = db.scalars(query).all()
        if ids and not docs:
            raise HTTPException(404, "Документы для формирования не найдены")

        plans: list[dict[str, Any]] = []
        for item in docs:
            obj = db.get(ObjectRecord, item.object_id)
            template = db.get(Template, item.template_id) if item.template_id else None
            if template:
                object_documents = db.scalars(select(Document).where(Document.object_id == item.object_id)).all()
                item.values_json = resolved_document_values(item, template, obj, object_documents)
            missing = missing_fields_for_template(
                template,
                item.values_json or {},
                item.number,
                item.work_title,
                item.document_date,
            )
            template_path: Path | None = None
            replacements: dict[str, Any] = {}
            marker_count = 0
            if template and template.template_file:
                template_path = resolve_template_path(template.template_file)
                try:
                    markers = inspect_docx_markers(template_path)
                except Exception as exc:
                    raise HTTPException(422, f"DOCX-шаблон «{template.title}» повреждён или не читается: {exc}") from exc
                replacements, marker_missing = resolve_marker_values(
                    markers,
                    template.marker_map or {},
                    document_marker_context(item, obj),
                )
                missing = sorted(set([*missing, *marker_missing]), key=str.casefold)
                marker_count = sum(marker["occurrences"] for marker in markers)
            item.missing_fields_json = missing
            if missing:
                item.completion_status = "needs_revision"
                blocked.append(
                    {
                        "id": item.id,
                        "number": item.number,
                        "missing_fields": missing,
                    }
                )
                continue
            plans.append(
                {
                    "document": item,
                    "template": template,
                    "template_path": template_path,
                    "replacements": replacements,
                    "marker_count": marker_count,
                }
            )

        if not blocked:
            for plan in plans:
                item: Document = plan["document"]
                target = expected_output_path(item.id, item.object_id)
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(f".{target.stem}.building.docx")
                try:
                    if plan["template_path"]:
                        replaced = render_docx_template(plan["template_path"], temporary, plan["replacements"])
                    else:
                        word = WordDocument()
                        word.add_heading(item.title, 0)
                        word.add_paragraph(f"№ {item.number} от {item.document_date}")
                        word.add_heading("Выполненные работы", level=1)
                        word.add_paragraph(item.work_title)
                        template = plan["template"]
                        fields = template.fields_json if template else [
                            {"key": "project_doc", "label": "Проектная документация"},
                            {"key": "materials", "label": "Материалы"},
                            {"key": "norms", "label": "Нормативные документы"},
                        ]
                        aliases = {
                            "act.number": item.number,
                            "order.number": item.number,
                            "scheme.number": item.number,
                            "act.date": item.document_date,
                            "order.date": item.document_date,
                            "works": item.work_title,
                            "scope": item.work_title,
                        }
                        for field in fields:
                            value = item.values_json.get(field["key"], aliases.get(field["key"], "Не указано"))
                            if isinstance(value, (dict, list)):
                                value = json.dumps(value, ensure_ascii=False, indent=2)
                            word.add_heading(field.get("label") or field["key"], level=2)
                            word.add_paragraph(str(value or "Не указано"))
                        word.save(temporary)
                        replaced = 0
                    os.replace(temporary, target)
                except Exception:
                    if temporary.exists():
                        temporary.unlink()
                    raise
                item.output_file = str(target)
                item.status = "generated"
                item.completion_status = "completed"
                item.missing_fields_json = []
                made.append(
                    {
                        "id": item.id,
                        "number": item.number,
                        "file": str(target),
                        "template_file": plan["template"].template_file if plan["template"] else "",
                        "markers_found": plan["marker_count"],
                        "markers_replaced": replaced,
                    }
                )

        warning_count = sum(len(item.warnings_json) for item in docs)

    if blocked:
        raise HTTPException(
            422,
            detail={
                "message": "Формирование заблокировано: заполнены не все значения",
                "missing_fields": blocked,
            },
        )
    return {"ok": True, "made": made, "warnings": warning_count}


@router.get("/templates")
def list_templates() -> list[dict]:
    with SessionLocal() as db:
        return [serialize(item) for item in db.scalars(select(Template).order_by(Template.updated_at.desc())).all()]


@router.get("/templates/{template_id}/markers")
def list_template_markers(template_id: int) -> dict:
    with SessionLocal() as db:
        template = db.get(Template, template_id)
        if not template:
            raise HTTPException(404, "Шаблон не найден")
        try:
            return template_markers_payload(template)
        except Exception as exc:
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(422, f"DOCX-шаблон повреждён или не читается: {exc}") from exc


@router.post("/templates/{template_id}/file")
def upload_template_file(
    template_id: int,
    file: UploadFile = File(...),
    marker_map: str | None = Form(default=None),
) -> dict:
    source_name = Path(file.filename or "template.docx").name
    if Path(source_name).suffix.casefold() != ".docx":
        raise HTTPException(415, "Шаблон должен быть файлом .docx")
    parsed_map: dict[str, Any] | None = None
    if marker_map is not None:
        try:
            parsed_map = normalized_marker_map(json.loads(marker_map))
        except json.JSONDecodeError as exc:
            raise HTTPException(422, "marker_map содержит некорректный JSON") from exc
    content = file.file.read(MAX_TEMPLATE_SIZE + 1)
    if len(content) > MAX_TEMPLATE_SIZE:
        raise HTTPException(413, "DOCX-шаблон больше 25 МБ")

    with SessionLocal.begin() as db:
        template = db.get(Template, template_id)
        if not template:
            raise HTTPException(404, "Шаблон не найден")
        target, version = managed_template_target(template, source_name)
        temporary = target.with_name(f".{target.name}.uploading")
        temporary.write_bytes(content)
        try:
            inspect_docx_markers(temporary)
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            raise HTTPException(422, f"Файл не является читаемым DOCX: {exc}") from exc
        os.replace(temporary, target)
        template.template_file = stored_template_path(target)
        template.version = version
        if parsed_map is not None:
            template.marker_map = parsed_map
        db.flush()
        result = template_markers_payload(template)
        return {"template": serialize(template), **result}


@router.post("/templates/{template_id}/bind")
def bind_template_file(template_id: int, payload: TemplateBind) -> dict:
    raw = Path(payload.template_file).expanduser()
    source = raw.resolve() if raw.is_absolute() else (BASE_DIR / raw).resolve()
    if source.suffix.casefold() != ".docx" or not source.is_file():
        raise HTTPException(404, "Указанный DOCX-шаблон не найден")
    try:
        inspect_docx_markers(source)
    except Exception as exc:
        raise HTTPException(422, f"Файл не является читаемым DOCX: {exc}") from exc

    with SessionLocal.begin() as db:
        template = db.get(Template, template_id)
        if not template:
            raise HTTPException(404, "Шаблон не найден")
        if any(is_within(source, root) for root in template_roots()):
            target = source
            version = template.version + (1 if template.template_file and stored_template_path(source) != template.template_file else 0)
        else:
            target, version = managed_template_target(template, source.name)
            temporary = target.with_name(f".{target.name}.binding")
            shutil.copy2(source, temporary)
            os.replace(temporary, target)
        template.template_file = stored_template_path(target)
        template.version = version
        if payload.marker_map is not None:
            template.marker_map = normalized_marker_map(payload.marker_map)
        db.flush()
        result = template_markers_payload(template)
        return {"template": serialize(template), **result}


@router.get("/templates/{template_id}/resolve")
def resolve_template(template_id: int, object_id: int, preset_id: int | None = None) -> dict:
    with SessionLocal() as db:
        template = db.get(Template, template_id)
        obj = db.get(ObjectRecord, object_id)
        preset = db.get(Preset, preset_id) if preset_id else None
        if not template or not obj:
            raise HTTPException(404, "Шаблон или объект не найден")
        documents = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
        return resolved_template_fields(template, obj, preset, documents)


@router.get("/presets")
def list_presets(q: str = "") -> list[dict]:
    with SessionLocal() as db:
        query = select(Preset)
        if q:
            query = query.where(or_(Preset.title.ilike(f"%{q}%"), Preset.description.ilike(f"%{q}%")))
        return [serialize(item) for item in db.scalars(query.order_by(Preset.is_favorite.desc(), Preset.use_count.desc())).all()]


@router.get("/catalogs/{catalog}")
def list_catalog(catalog: str) -> list[dict]:
    with SessionLocal() as db:
        return [serialize(item) for item in db.scalars(select(CatalogItem).where(CatalogItem.catalog == catalog).order_by(CatalogItem.title)).all()]


@router.get("/search")
def global_search(q: str = Query(min_length=2)) -> dict:
    needle = q.casefold()
    contains = lambda *values: any(needle in str(value or "").casefold() for value in values)
    with SessionLocal() as db:
        docs = [
            item
            for item in db.scalars(select(Document).order_by(Document.updated_at.desc())).all()
            if contains(item.number, item.title, item.work_title)
        ][:12]
        objects = [
            item
            for item in db.scalars(select(ObjectRecord).order_by(ObjectRecord.updated_at.desc())).all()
            if contains(item.code, item.name, item.short_name, item.address)
        ][:8]
        presets = [
            item
            for item in db.scalars(select(Preset).order_by(Preset.is_favorite.desc(), Preset.use_count.desc())).all()
            if contains(item.title, item.description)
        ][:8]
        catalogs = [
            item
            for item in db.scalars(select(CatalogItem).order_by(CatalogItem.title)).all()
            if contains(item.title, item.code, item.subtitle)
        ][:12]
        return {
            "objects": [serialize(x) for x in objects],
            "documents": serialize_documents_for_read(db, docs),
            "presets": [serialize(x) for x in presets],
            "catalogs": [serialize(x) for x in catalogs],
        }


@router.get("/reports/completeness")
def completeness_report() -> dict:
    with SessionLocal() as db:
        obj = current_object(db)
        docs = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
        total = len(docs)
        ready = sum(document_is_ready(item) for item in docs)
        warnings = sum(len(item.warnings_json) for item in docs)
        integrity = integrity_for_object(db, obj)
        groups = db.scalars(select(ObjectGroup).where(ObjectGroup.object_id == obj.id).order_by(ObjectGroup.sort_order)).all()
        return {
            "object_id": obj.id,
            "progress": integrity["score"],
            "total": total,
            "ready": ready,
            "warnings": warnings,
            "sections": [
                {
                    "title": group.title,
                    "ready": sum(document.group_id == group.id and document_is_ready(document) for document in docs),
                    "total": sum(document.group_id == group.id for document in docs),
                    "status": (
                        "ok"
                        if any(document.group_id == group.id for document in docs)
                        and all(document_is_ready(document) for document in docs if document.group_id == group.id)
                        else "warning"
                        if any(document.group_id == group.id for document in docs)
                        else "error"
                        if group.is_required
                        else "neutral"
                    ),
                }
                for group in groups
            ],
            "checks": integrity["checks"],
        }


@router.post("/objects/{object_id}/integrity/{rule_id}/waive")
def waive_integrity_issue(object_id: int, rule_id: int, payload: dict) -> dict:
    reason = str(payload.get("reason") or "").strip()
    resolution_type = str(payload.get("resolution_type") or "not_applicable").strip()
    evidence = str(payload.get("evidence") or "").strip()
    allowed_types = {"not_applicable", "equivalent", "justified_exception", "pending"}
    if resolution_type not in allowed_types:
        raise HTTPException(422, "Неизвестный тип решения")
    if len(reason) < 5:
        raise HTTPException(422, "Укажите причину исключения")
    if resolution_type == "equivalent" and len(evidence) < 3:
        raise HTTPException(422, "Для замены эквивалентом укажите документ-подтверждение")
    with SessionLocal.begin() as db:
        if not db.get(ObjectRecord, object_id) or not db.get(StructureRule, rule_id):
            raise HTTPException(404, "Объект или правило не найдено")
        exception = db.scalar(select(StructureException).where(StructureException.object_id == object_id, StructureException.rule_id == rule_id))
        if exception:
            exception.resolution_type = resolution_type
            exception.reason = reason
            exception.evidence = evidence
            exception.status = "accepted"
        else:
            db.add(
                StructureException(
                    object_id=object_id,
                    rule_id=rule_id,
                    resolution_type=resolution_type,
                    reason=reason,
                    evidence=evidence,
                )
            )
    with SessionLocal() as db:
        return integrity_for_object(db, db.get(ObjectRecord, object_id))


@router.post("/objects/{object_id}/integrity/{rule_id}/restore")
def restore_integrity_issue(object_id: int, rule_id: int) -> dict:
    with SessionLocal.begin() as db:
        db.execute(delete(StructureException).where(StructureException.object_id == object_id, StructureException.rule_id == rule_id))
    with SessionLocal() as db:
        obj = db.get(ObjectRecord, object_id)
        if not obj:
            raise HTTPException(404, "Объект не найден")
        return integrity_for_object(db, obj)


@router.get("/corpus/insights")
def corpus_insights() -> dict:
    with SessionLocal() as db:
        sources = db.scalars(select(CorpusSource).order_by(CorpusSource.updated_at.desc())).all()
        templates = db.scalars(select(Template).order_by(Template.group_kind, Template.title)).all()
        return {
            "sources": [serialize(source) for source in sources],
            "template_families": [
                {
                    "id": template.id,
                    "title": template.title,
                    "doc_type": template.doc_type,
                    "group_kind": template.group_kind,
                    "fields_count": len(template.fields_json or []),
                    "source_example": template.source_example,
                }
                for template in templates
            ],
            "principle": "Данные объекта подставляются автоматически; неизвестные значения остаются явными полями для заполнения.",
            "legal_note": "Публичные образцы используются как справочный корпус, а не как нормативная истина. Правила объекта должны подтверждаться актуальными требованиями договора, проекта и законодательства.",
        }


@router.post("/open-object-folder")
def open_object_folder(payload: dict) -> dict:
    with SessionLocal() as db:
        obj = db.get(ObjectRecord, int(payload.get("id", 0))) or current_object(db)
        target = (settings.vault_dir / obj.folder_path).resolve()
        target.mkdir(parents=True, exist_ok=True)
        os.startfile(target)
        return {"ok": True, "path": str(target)}


@router.get("/files/{document_id}")
def download_document(document_id: int):
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        if not doc or not doc.output_file or not Path(doc.output_file).exists():
            raise HTTPException(404, "Сформированный файл не найден")
        return FileResponse(doc.output_file, filename=Path(doc.output_file).name)


@router.get("/source/{document_id}")
def open_source_document(document_id: int):
    with SessionLocal() as db:
        doc = db.get(Document, document_id)
        source = Path(doc.source_file).resolve() if doc and doc.source_file else None
        vault_root = settings.vault_dir.resolve()
        if not source or not source.exists() or (source != vault_root and vault_root not in source.parents):
            raise HTTPException(404, "Исходный файл не найден")
        return FileResponse(source, filename=source.name)
