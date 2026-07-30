from __future__ import annotations

import json

from sqlalchemy import select

from .config import BASE_DIR
from .db import (
    CatalogItem,
    CorpusSource,
    Document,
    ObjectGroup,
    ObjectRecord,
    Preset,
    Section,
    SessionLocal,
    StructureRule,
    Template,
)

GROUPS = [
    ("registry", "Реестр", "registry", "Главный перечень исполнительной документации", 10, True),
    ("working", "Проектная и рабочая документация", "working", "Проект, рабочие чертежи, изменения и согласования", 20, True),
    ("permits", "Разрешительная документация", "permits", "Приказы, допуски, НАКС и полномочия", 30, True),
    ("journals", "Журналы", "journals", "Общий, сварочный и специальные журналы", 40, True),
    ("acts", "Акты и испытания", "acts", "АОСР, ВИК, гидравлика, демонтаж, монтаж и приёмка", 50, True),
    ("schemes", "Исполнительные схемы", "schemes", "Схемы стыков, трасс и фактического исполнения", 60, True),
    ("quality", "Материалы и паспорта", "quality", "Сертификаты, декларации, паспорта и входной контроль", 70, True),
    ("ppr", "ППР, графики и дефектные", "source", "Проекты производства работ, графики и дефектные ведомости", 80, False),
    ("evidence", "Фото и подтверждения", "evidence", "Фотографии, протоколы и подтверждающие материалы", 90, False),
    ("archive", "Архив заменённых версий", "archive", "Устаревшие документы с сохранённой историей", 100, False),
    ("other", "Прочее", "other", "Документы вне основной структуры", 110, False),
]

GENERAL_JOURNAL_TEMPLATE_FILE = "resources/templates/general-journal-1026pr.docx"
GENERAL_JOURNAL_MARKER_MAP = {
    "construction_permit": {"source": "object.meta.construction_permit", "required": False},
    "construction_type": "object.meta.work_kind",
    "contractor": "contractor.name",
    "designer": {"source": "object.meta.designer.name", "required": False},
    "end_date": {"source": "object.meta.end_date", "required": False},
    "journal_number": "document.number",
    "object_address": "object.address",
    "object_name": "object.name",
    "object_summary": {"source": "object.meta.object_summary", "required": False},
    "page_count": {"source": "page_count", "required": False},
    "project_expertise": {"source": "object.meta.project_expertise", "required": False},
    "start_date": {"source": "object.meta.start_date", "required": False},
    "technical_customer": {"source": "object.meta.technical_customer.name", "required": False},
    "zakaz": "customer.name",
}


def _general_journal_marker_map() -> dict:
    sidecar = BASE_DIR / "resources" / "templates" / "general-journal-1026pr.markers.json"
    if sidecar.is_file():
        try:
            payload = json.loads(sidecar.read_text(encoding="utf-8"))
            markers = payload.get("markers") if isinstance(payload, dict) else None
            if isinstance(markers, dict):
                return markers
        except (OSError, json.JSONDecodeError):
            pass
    return GENERAL_JOURNAL_MARKER_MAP


def _general_journal_fields() -> list[dict]:
    fields = []
    for marker, mapping in _general_journal_marker_map().items():
        if isinstance(mapping, dict):
            fields.append(
                {
                    "key": str(mapping.get("field") or marker),
                    "label": str(mapping.get("label") or marker),
                    "required": bool(mapping.get("required", True)),
                    "source": str(mapping.get("source") or "manual"),
                }
            )
        else:
            fields.append(
                {
                    "key": marker,
                    "label": marker,
                    "required": True,
                    "source": str(mapping),
                }
            )
    return fields

RULES = [
    ("registry-main", "Реестр исполнительной документации", "registry", ["registry"], 1, "error", "Главный навигатор по комплекту."),
    ("working-docs", "Проектная или рабочая документация", "working", ["project", "working_documentation"], 1, "warning", "Основание для сопоставления фактического исполнения с проектом."),
    ("journal-general", "Общий журнал работ", "journals", ["general_journal"], 1, "error", "Обязателен для ведения хода работ."),
    ("journal-input", "Журнал входного контроля", "journals", ["incoming_journal"], 1, "warning", "Нужен при применении материалов и оборудования."),
    ("journal-welding", "Журнал сварочных работ", "journals", ["welding_journal"], 1, "warning", "Нужен, если на объекте выполняются сварочные работы."),
    ("order-responsible", "Приказ о назначении ответственных", "permits", ["appointment_order"], 1, "error", "Подтверждает полномочия участников."),
    ("act-aosr", "Акты освидетельствования скрытых работ", "acts", ["aosr"], 1, "error", "Минимум один АОСР при наличии скрытых работ."),
    ("act-vik", "Акт визуального и измерительного контроля", "acts", ["vik"], 1, "warning", "Требуется для сварных соединений."),
    ("quality-docs", "Паспорта и сертификаты материалов", "quality", ["certificate", "passport"], 1, "error", "Подтверждают качество применённых материалов."),
    ("scheme-executive", "Исполнительная схема", "schemes", ["executive_scheme"], 1, "warning", "Фиксирует фактическое положение или сварные стыки."),
    ("ppr-main", "ППР или технологическая карта", "source", ["ppr", "method_statement"], 1, "warning", "Организационно-технологическое основание выполнения работ."),
]

OBJECT_META = {
    "customer": {"name": "ООО «Заказчик»", "inn": "6300000000"},
    "contractor": {"name": "ООО «Генподрядчик»", "inn": "6310000000"},
    "project_documentation": "2026-001-ТС, листы 12–18",
    "contract": "Договор № 2026-001/СМР",
    "responsible_person": {
        "fio": "Иванов Иван Иванович",
        "position": "Инженер ПТО",
        "order": "Приказ № 823",
    },
    "work_kind": "Капитальный ремонт",
}


def seed_database() -> None:
    with SessionLocal.begin() as db:
        objects = db.scalars(select(ObjectRecord).order_by(ObjectRecord.id)).all()
        if not objects:
            demo = ObjectRecord(
                code="2026-001",
                name="Реконструкция котельной с заменой сетевых трубопроводов",
                short_name="Котельная № 1",
                address="Самарская область, промышленная площадка № 1",
                comment="Демонстрационный объект",
                folder_path="objects/2026-001_demo",
                is_current=True,
                profile="industrial_repair",
                meta_json=OBJECT_META,
            )
            db.add(demo)
            db.flush()
            objects = [demo]

        _seed_sections(db)
        templates = _seed_templates(db)
        for obj in objects:
            groups = _seed_groups(db, obj)
            if obj.folder_path == "objects/2026-001_Котельная-ПТВМ-50":
                _seed_documents(db, obj, groups, templates)
            _hydrate_document_autofill(db, obj)
        _seed_presets(db)
        _seed_catalogs(db)
        _seed_rules(db)
        _seed_corpus(db)


def _seed_sections(db) -> None:
    rows = [
        ("overview", "Обзор объекта", "layout-dashboard", "objects", 10),
        ("documents", "Документы", "files", "act", 20),
        ("materials", "Материалы", "package", "materials", 30),
        ("schemes", "Исполнительные схемы", "drafting-compass", "schemes", 40),
        ("reports", "Комплектность", "chart-no-axes-column", "reports", 50),
    ]
    existing = set(db.scalars(select(Section.slug)).all())
    for slug, title, icon, kind, order in rows:
        if slug not in existing:
            db.add(Section(slug=slug, title=title, icon=icon, kind=kind, sort_order=order))


def _seed_groups(db, obj: ObjectRecord) -> dict[str, ObjectGroup]:
    result = {group.code: group for group in db.scalars(select(ObjectGroup).where(ObjectGroup.object_id == obj.id)).all()}
    for code, title, kind, description, order, required in GROUPS:
        if code not in result:
            group = ObjectGroup(
                object_id=obj.id,
                code=code,
                title=title,
                kind=kind,
                description=description,
                sort_order=order,
                is_required=required,
            )
            db.add(group)
            db.flush()
            result[code] = group
        else:
            group = result[code]
            group.title = title
            group.kind = kind
            group.description = description
            group.sort_order = order
            group.is_required = required
    kind_by_type = {
        "registry": "registry",
        "general_journal": "journals",
        "incoming_journal": "journals",
        "welding_journal": "journals",
        "appointment_order": "permits",
        "aosr": "acts",
        "vik": "acts",
        "hydro": "acts",
        "dismantling_act": "acts",
        "installation_act": "acts",
        "equipment_acceptance": "acts",
        "repair_readiness": "acts",
        "certificate": "quality",
        "passport": "quality",
        "incoming_control": "quality",
        "executive_scheme": "schemes",
        "project": "working",
        "working_documentation": "working",
        "ppr": "source",
        "method_statement": "source",
    }
    group_by_kind = {group.kind: group for group in result.values()}
    for document in db.scalars(select(Document).where(Document.object_id == obj.id, Document.group_id.is_(None))).all():
        group = group_by_kind.get(kind_by_type.get(document.doc_type, "other"))
        if group:
            document.group_id = group.id
    return result


def _seed_templates(db) -> dict[str, Template]:
    common_fields = [
        {"key": "object.name", "label": "Объект", "required": True, "source": "object.name"},
        {"key": "object.address", "label": "Адрес", "required": True, "source": "object.address"},
        {"key": "customer.name", "label": "Заказчик", "required": True, "source": "object.meta.customer.name"},
        {"key": "contractor.name", "label": "Подрядчик", "required": True, "source": "object.meta.contractor.name"},
        {"key": "responsible.fio", "label": "Ответственный", "required": True, "source": "object.meta.responsible_person.fio"},
    ]
    rows = [
        ("aosr", "АОСР по РД 11-02-2006", "acts", common_fields + [
            {"key": "act.number", "label": "Номер акта", "required": True, "source": "manual"},
            {"key": "works", "label": "Предъявленные работы", "required": True, "source": "preset.work_title"},
            {"key": "project_doc", "label": "Проектная документация", "required": True, "source": "object.meta.project_documentation"},
            {"key": "materials", "label": "Применённые материалы", "required": True, "source": "manual"},
            {"key": "norms", "label": "Нормативы", "required": True, "source": "preset.norms"},
            {"key": "next_works", "label": "Последующие работы", "required": True, "source": "manual"},
        ], "АОСР из комплектов «Фильтры Башаев» и «Апельсинки»"),
        ("vik", "Акт визуального и измерительного контроля", "acts", common_fields + [
            {"key": "act.number", "label": "Номер ВИК", "required": True, "source": "manual"},
            {"key": "control_object", "label": "Объект контроля", "required": True, "source": "manual"},
            {"key": "steel_grade", "label": "Марка стали", "required": True, "source": "manual"},
            {"key": "joint_sizes", "label": "Диаметры и толщины", "required": True, "source": "manual"},
            {"key": "control_standard", "label": "Документ контроля", "required": True, "source": "preset.norms"},
        ], "Типовой акт ВИК"),
        ("incoming_control", "Акт входного контроля материалов", "quality", common_fields + [
            {"key": "act.number", "label": "Номер акта", "required": True, "source": "manual"},
            {"key": "materials_table", "label": "Материалы и сертификаты", "required": True, "source": "manual"},
            {"key": "control_results", "label": "Результаты контроля", "required": True, "source": "default"},
        ], "Акт входного контроля из комплекта фильтров"),
        ("hydro", "Акт испытаний на прочность и герметичность", "acts", common_fields + [
            {"key": "system", "label": "Система или трубопровод", "required": True, "source": "manual"},
            {"key": "pressure", "label": "Испытательное давление", "required": True, "source": "manual"},
            {"key": "duration", "label": "Продолжительность", "required": True, "source": "manual"},
        ], "Акты гидравлических испытаний из объектов теплосетей"),
        ("appointment_order", "Приказ о назначении ответственных лиц", "permits", common_fields + [
            {"key": "order.number", "label": "Номер приказа", "required": True, "source": "object.meta.responsible_person.order"},
            {"key": "order.date", "label": "Дата приказа", "required": True, "source": "manual"},
            {"key": "responsibilities", "label": "Обязанности и зона ответственности", "required": True, "source": "manual"},
        ], "Приказы и разрешительные комплекты объектов архива"),
        ("executive_scheme", "Исполнительная схема", "schemes", common_fields + [
            {"key": "scheme.number", "label": "Номер схемы", "required": True, "source": "manual"},
            {"key": "system", "label": "Система, узел или участок", "required": True, "source": "manual"},
            {"key": "drawing_reference", "label": "Лист рабочей документации", "required": True, "source": "object.meta.project_documentation"},
            {"key": "deviations", "label": "Отклонения от проекта", "required": False, "source": "manual"},
        ], "Исполнительные схемы сварных стыков, трасс и оборудования"),
        ("registry", "Реестр исполнительной документации", "registry", common_fields + [
            {"key": "document_rows", "label": "Строки реестра", "required": True, "source": "object.documents"},
        ], "Реестры Осинки, Отрадный и фильтров"),
        (
            "general_journal",
            "Общий журнал работ",
            "journals",
            _general_journal_fields(),
            "Официальная форма по приказу Минстроя России № 1026/пр от 02.12.2022",
        ),
    ]
    active_doc_types = {row[0] for row in rows}
    legacy_defaults = db.scalars(
        select(Template).where(
            Template.is_default.is_(True),
            Template.doc_type.notin_(active_doc_types),
        )
    ).all()
    for template in legacy_defaults:
        if not template.template_file:
            template.is_active = False

    result: dict[str, Template] = {}
    for doc_type, title, group_kind, fields, source in rows:
        template = db.scalar(select(Template).where(Template.doc_type == doc_type, Template.is_default.is_(True)))
        custom_general_journal = bool(
            doc_type == "general_journal"
            and template
            and template.template_file
            and template.template_file != GENERAL_JOURNAL_TEMPLATE_FILE
        )
        if not template:
            template = Template(
                title=title,
                doc_type=doc_type,
                group_kind=group_kind,
                version=1 if doc_type != "aosr" else 4,
                is_default=True,
                fields_json=fields,
                field_map_json={field["key"]: field["source"] for field in fields},
                source_example=source,
                notes="Проверено по реальным комплектам",
            )
            db.add(template)
            db.flush()
        else:
            template.group_kind = group_kind
            if not custom_general_journal:
                template.fields_json = fields
                template.field_map_json = {field["key"]: field["source"] for field in fields}
                template.source_example = source
        if doc_type == "general_journal" and not custom_general_journal:
            template.template_file = GENERAL_JOURNAL_TEMPLATE_FILE
            template.marker_map = _general_journal_marker_map()
        result[doc_type] = template
    return result


def _seed_documents(db, obj: ObjectRecord, groups: dict[str, ObjectGroup], templates: dict[str, Template]) -> None:
    common = {
        "project_doc": obj.meta_json.get("project_documentation", ""),
        "norms": "СП 73.13330.2016; СП 48.13330.2019",
        "organization": obj.meta_json.get("contractor", {}).get("name", ""),
        "next_works": "Выполнение последующих работ по рабочей документации",
    }
    specific_values = {
        "appointment_order": {
            "order.date": "15.01.2026",
            "responsibilities": "Организация и безопасное производство строительно-монтажных работ",
        },
        "vik": {
            "control_object": "Сварные соединения трубопровода Ду159×6",
            "steel_grade": "Сталь 20",
            "joint_sizes": "159×6",
            "control_standard": "РД 153-34.1-003-01",
        },
        "incoming_control": {
            "materials_table": "Труба стальная электросварная 159×6; сертификат качества СЕРТ-0159",
            "control_results": "Соответствует сопроводительной документации",
        },
        "executive_scheme": {
            "system": "Трубопровод теплоснабжения Ду159×6",
            "drawing_reference": obj.meta_json.get("project_documentation", ""),
        },
    }
    existing = {document.number: document for document in db.scalars(select(Document).where(Document.object_id == obj.id)).all()}
    act_rows = [
        ("АОСР-ТС-015", "Монтаж неподвижной опоры НО-3 трубопровода теплоснабжения", "18.07.2026", "ready", []),
        ("АОСР-ТС-016", "Антикоррозионная защита трубопровода Ду159×6", "20.07.2026", "review", ["Не указан номер протокола контроля покрытия"]),
        ("АОСР-ТС-017", "Монтаж трубопровода теплоснабжения Ду159×6 в осях 2-7", "24.07.2026", "review", ["Срок действия сертификата истёк 14.06.2026"]),
        ("АОСР-ТС-018", "Тепловая изоляция трубопровода минераловатными цилиндрами", "26.07.2026", "draft", []),
    ]
    rows = [
        *[(number, "Акт освидетельствования скрытых работ", "aosr", "acts", work, date, status, warnings, []) for number, work, date, status, warnings in act_rows],
        ("РЕЕСТР-001", "Реестр исполнительной документации", "registry", "registry", "Комплект исполнительной документации по объекту", "27.07.2026", "ready", [], []),
        ("ОЖР-001", "Общий журнал работ", "general_journal", "journals", "Ведение общего журнала по объекту", "15.01.2026", "ready", [], []),
        ("ЖСР-001", "Журнал сварочных работ", "welding_journal", "journals", "Сварка трубопроводов теплоснабжения", "18.07.2026", "draft", [], ["welding_manager"]),
        ("ПРИКАЗ-823", "Приказ о назначении ответственных лиц", "appointment_order", "permits", "Назначение ответственных за производство работ", "15.01.2026", "ready", [], []),
        ("2026-001-ТС", "Рабочая документация по трубопроводу теплоснабжения", "working_documentation", "working", "Листы 12–18, монтаж трубопровода Ду159×6", "10.01.2026", "ready", [], []),
        ("ППР-ТС-001", "Проект производства работ", "ppr", "ppr", "Монтаж и испытание трубопровода теплоснабжения", "12.01.2026", "ready", [], []),
        ("1-ВИК", "Акт визуального и измерительного контроля", "vik", "acts", "Контроль сварных соединений трубопровода Ду159×6", "24.07.2026", "ready", [], []),
        ("ВК-001", "Акт входного контроля материалов", "incoming_control", "quality", "Труба стальная электросварная 159×6 ГОСТ 10704-91", "17.07.2026", "ready", [], []),
        ("СЕРТ-0159", "Сертификат качества на трубу 159×6", "certificate", "quality", "Труба стальная электросварная 159×6", "14.06.2025", "review", ["Срок действия документа требует проверки"], []),
        ("ИС-001", "Исполнительная схема сварных стыков", "executive_scheme", "schemes", "Схема стыков трубопровода теплоснабжения", "24.07.2026", "ready", [], []),
    ]
    for number, title, doc_type, group_code, work, doc_date, status, warnings, missing in rows:
        values = {**common, **specific_values.get(doc_type, {}), "materials": "Труба стальная электросварная 159×6 ГОСТ 10704-91"}
        document = existing.get(number)
        if not document:
            document = Document(
                object_id=obj.id,
                group_id=groups[group_code].id,
                template_id=templates.get(doc_type).id if templates.get(doc_type) else None,
                number=number,
                title=title,
                doc_type=doc_type,
                work_title=work,
                document_date=doc_date,
                status=status,
                completion_status=(
                    "completed"
                    if status in {"ready", "generated", "signed"}
                    else "needs_revision"
                    if status in {"review", "rejected"}
                    else "not_started"
                ),
                values_json=values,
                warnings_json=warnings,
                missing_fields_json=missing,
                source_kind="native",
            )
            db.add(document)
        else:
            document.values_json = {**values, **(document.values_json or {})}
            if not document.group_id:
                document.group_id = groups[group_code].id
            if not document.template_id and templates.get(doc_type):
                document.template_id = templates[doc_type].id


def _nested(data: dict, path: str):
    current = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _hydrate_document_autofill(db, obj: ObjectRecord) -> None:
    """Backfill only deterministic object/default fields on older local documents."""
    meta = obj.meta_json or {}
    documents = db.scalars(select(Document).where(Document.object_id == obj.id)).all()
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
                {"number": document.number, "title": document.title, "date": document.document_date}
                for document in documents
            ],
        }
    }
    for document in documents:
        template = db.get(Template, document.template_id) if document.template_id else None
        if not template:
            continue
        values = dict(document.values_json or {})
        for field in template.fields_json or []:
            source = field.get("source", "manual")
            value = None
            if source.startswith("object."):
                value = _nested(object_data, source)
            elif source == "default":
                value = field.get("default", "Соответствует")
            if field["key"] not in values and value not in (None, "", []):
                values[field["key"]] = value
        aliases = {
            "act.number": document.number,
            "order.number": document.number,
            "scheme.number": document.number,
            "journal.number": document.number,
            "act.date": document.document_date,
            "order.date": document.document_date,
            "journal.date": document.document_date,
            "works": document.work_title,
            "scope": document.work_title,
        }
        document.values_json = values
        document.missing_fields_json = [
            field["key"]
            for field in template.fields_json or []
            if field.get("required") and values.get(field["key"], aliases.get(field["key"])) in (None, "", [])
        ]


def _seed_presets(db) -> None:
    common = {
        "project_doc": "2026-001-ТС, листы 12–18",
        "norms": "СП 73.13330.2016; СП 48.13330.2019",
        "organization": "ООО «Генподрядчик»",
    }
    rows = [
        ("TS-DU159", "Монтаж трубопровода теплоснабжения Ду159×6", "aosr", {**common, "work_title": "Монтаж трубопровода теплоснабжения Ду159×6 в осях 2-7", "materials": "Труба стальная электросварная 159×6 ГОСТ 10704-91"}, True, 14),
        ("TS-INSULATION", "Тепловая изоляция трубопровода", "aosr", {**common, "work_title": "Тепловая изоляция трубопровода минераловатными цилиндрами"}, False, 8),
        ("WELD-VIK-159", "ВИК сварных соединений Ду159×6", "vik", {"work_title": "Визуальный и измерительный контроль сварных соединений", "norms": "РД 153-34.1-003-01", "steel_grade": "Сталь 20", "joint_sizes": "159×6"}, True, 6),
        ("HYDRO-TS", "Гидравлическое испытание теплосети", "hydro", {"system": "Трубопровод теплоснабжения", "pressure": "1,25 МПа", "duration": "10 минут"}, False, 5),
    ]
    for code, title, doc_type, values, favorite, uses in rows:
        preset = db.scalar(select(Preset).where(Preset.code == code))
        if not preset:
            db.add(Preset(code=code, title=title, description="Демонстрационный набор полей", doc_type=doc_type, values_json=values, is_favorite=favorite, use_count=uses))


def _seed_catalogs(db) -> None:
    if db.scalar(select(CatalogItem.id).limit(1)):
        return
    db.add_all(
        [
            CatalogItem(catalog="materials", code="М-0159", title="Труба стальная электросварная 159×6 ГОСТ 10704-91", subtitle="Сертификат № ЕАЭС RU С-RU.АБ53.В.01944/25", meta_json={"status": "expired"}),
            CatalogItem(catalog="norms", code="СП 73.13330.2016", title="Внутренние санитарно-технические системы зданий", subtitle="Действует"),
            CatalogItem(catalog="organizations", code="ИНН 6310000000", title="ООО «Генподрядчик»", subtitle="Генеральный подрядчик"),
            CatalogItem(catalog="persons", code="НРС С-00-000000", title="Иванов Иван Иванович", subtitle="Инженер ПТО"),
        ]
    )


def _seed_rules(db) -> None:
    for code, title, group_kind, doc_types, count, severity, description in RULES:
        rule = db.scalar(select(StructureRule).where(StructureRule.code == code))
        if not rule:
            rule = StructureRule(code=code)
            db.add(rule)
        rule.title = title
        rule.group_kind = group_kind
        rule.doc_types_json = doc_types
        rule.min_count = count
        rule.severity = severity
        rule.description = description


def _seed_corpus(db) -> None:
    path = r"\\SERVER\Share\ID_Archive"
    source = db.scalar(select(CorpusSource).where(CorpusSource.source_path == path))
    families = [
        "Реестры",
        "Общие журналы",
        "Журналы входного контроля",
        "Сварочные журналы",
        "АОСР",
        "ВИК",
        "Входной контроль",
        "Гидравлические испытания",
        "Демонтаж и монтаж",
        "Готовность к ремонту",
        "Приёмка оборудования",
        "Исполнительные схемы",
        "Приказы и допуски",
        "Паспорта и сертификаты",
        "ППР и графики",
        "Дефектные ведомости",
    ]
    if not source:
        source = CorpusSource(title="Демонстрационный архив объектов", source_type="local_nas", source_path=path)
        db.add(source)
    source.projects_count = 3
    source.documents_count = 120
    source.status = "indexed"
    source.families_json = families
    public_path = "https://ispolnitelnaya.ru/"
    public_source = db.scalar(select(CorpusSource).where(CorpusSource.source_path == public_path))
    if not public_source:
        public_source = CorpusSource(title="Исполнительная.ру — справочная библиотека", source_type="public_reference", source_path=public_path)
        db.add(public_source)
    public_source.projects_count = 24
    public_source.documents_count = 484
    public_source.status = "reference"
    public_source.families_json = ["246 форм актов", "22 формы журналов", "216 заполненных примеров", "24 типовых перечня"]
