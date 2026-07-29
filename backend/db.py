from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ObjectRecord(TimestampMixin, Base):
    __tablename__ = "objects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(Text)
    short_name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(Text, default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    folder_path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="active")
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    profile: Mapped[str] = mapped_column(String(40), default="industrial_repair")
    meta_json: Mapped[dict] = mapped_column(JSON, default=dict)
    documents: Mapped[list["Document"]] = relationship(back_populates="object", cascade="all, delete-orphan")
    groups: Mapped[list["ObjectGroup"]] = relationship(back_populates="object", cascade="all, delete-orphan")


class ObjectGroup(TimestampMixin, Base):
    __tablename__ = "object_groups"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int] = mapped_column(ForeignKey("objects.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(180))
    kind: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    object: Mapped[ObjectRecord] = relationship(back_populates="groups")
    documents: Mapped[list["Document"]] = relationship(back_populates="group")


class Section(Base):
    __tablename__ = "sections"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    icon: Mapped[str] = mapped_column(String(40), default="folder")
    kind: Mapped[str] = mapped_column(String(32), default="other")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int] = mapped_column(ForeignKey("objects.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("object_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("templates.id", ondelete="SET NULL"), nullable=True)
    number: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(240))
    doc_type: Mapped[str] = mapped_column(String(40), default="aosr")
    work_title: Mapped[str] = mapped_column(Text)
    document_date: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    completion_status: Mapped[str] = mapped_column(String(24), default="not_started", index=True)
    values_json: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings_json: Mapped[list] = mapped_column(JSON, default=list)
    missing_fields_json: Mapped[list] = mapped_column(JSON, default=list)
    source_kind: Mapped[str] = mapped_column(String(24), default="native")
    source_file: Mapped[str] = mapped_column(Text, default="")
    output_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    object: Mapped[ObjectRecord] = relationship(back_populates="documents")
    group: Mapped[ObjectGroup | None] = relationship(back_populates="documents")


class Template(TimestampMixin, Base):
    __tablename__ = "templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    doc_type: Mapped[str] = mapped_column(String(40), index=True)
    group_kind: Mapped[str] = mapped_column(String(40), default="acts", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    fields_json: Mapped[list] = mapped_column(JSON, default=list)
    field_map_json: Mapped[dict] = mapped_column(JSON, default=dict)
    template_file: Mapped[str] = mapped_column(Text, default="")
    marker_map: Mapped[dict] = mapped_column(JSON, default=dict)
    source_example: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")


class Preset(TimestampMixin, Base):
    __tablename__ = "presets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(240), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    doc_type: Mapped[str] = mapped_column(String(40), index=True)
    scope: Mapped[str] = mapped_column(String(16), default="global")
    values_json: Mapped[dict] = mapped_column(JSON, default=dict)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)


class CatalogItem(TimestampMixin, Base):
    __tablename__ = "catalog_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    catalog: Mapped[str] = mapped_column(String(40), index=True)
    code: Mapped[str] = mapped_column(String(120), default="")
    title: Mapped[str] = mapped_column(Text, index=True)
    subtitle: Mapped[str] = mapped_column(Text, default="")
    meta_json: Mapped[dict] = mapped_column(JSON, default=dict)


class StructureRule(TimestampMixin, Base):
    __tablename__ = "structure_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(240))
    group_kind: Mapped[str] = mapped_column(String(40), index=True)
    profile: Mapped[str] = mapped_column(String(40), default="industrial_repair")
    doc_types_json: Mapped[list] = mapped_column(JSON, default=list)
    min_count: Mapped[int] = mapped_column(Integer, default=1)
    severity: Mapped[str] = mapped_column(String(16), default="error")
    description: Mapped[str] = mapped_column(Text, default="")


class StructureException(TimestampMixin, Base):
    __tablename__ = "structure_exceptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int] = mapped_column(ForeignKey("objects.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("structure_rules.id", ondelete="CASCADE"), index=True)
    resolution_type: Mapped[str] = mapped_column(String(32), default="not_applicable")
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="accepted")
    created_by: Mapped[str] = mapped_column(String(120), default="Пользователь")


class CorpusSource(TimestampMixin, Base):
    __tablename__ = "corpus_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    source_type: Mapped[str] = mapped_column(String(24))
    source_path: Mapped[str] = mapped_column(Text)
    projects_count: Mapped[int] = mapped_column(Integer, default=0)
    documents_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="indexed")
    families_json: Mapped[list] = mapped_column(JSON, default=list)


DB_PATH = settings.vault_dir / "db" / "vault.sqlite3"
engine = create_engine(f"sqlite:///{DB_PATH.as_posix()}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def configure_sqlite(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def create_schema() -> None:
    Base.metadata.create_all(engine)
    _migrate_existing_schema()


def _migrate_existing_schema() -> None:
    """Small forward-only migration for installations created by the first prototype."""
    required_columns = {
        "objects": {
            "profile": "TEXT NOT NULL DEFAULT 'industrial_repair'",
            "meta_json": "JSON NOT NULL DEFAULT '{}'",
        },
        "documents": {
            "group_id": "INTEGER REFERENCES object_groups(id) ON DELETE SET NULL",
            "template_id": "INTEGER REFERENCES templates(id) ON DELETE SET NULL",
            "missing_fields_json": "JSON NOT NULL DEFAULT '[]'",
            "source_kind": "TEXT NOT NULL DEFAULT 'native'",
            "source_file": "TEXT NOT NULL DEFAULT ''",
            "completion_status": "TEXT NOT NULL DEFAULT 'not_started'",
        },
        "templates": {
            "group_kind": "TEXT NOT NULL DEFAULT 'acts'",
            "field_map_json": "JSON NOT NULL DEFAULT '{}'",
            "template_file": "TEXT NOT NULL DEFAULT ''",
            "marker_map": "JSON NOT NULL DEFAULT '{}'",
            "source_example": "TEXT NOT NULL DEFAULT ''",
        },
        "structure_exceptions": {
            "resolution_type": "TEXT NOT NULL DEFAULT 'not_applicable'",
            "evidence": "TEXT NOT NULL DEFAULT ''",
        },
    }
    inspector = inspect(engine)
    added_columns: set[tuple[str, str]] = set()
    with engine.begin() as connection:
        for table_name, columns in required_columns.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
                    added_columns.add((table_name, column_name))
        if ("documents", "completion_status") in added_columns:
            connection.execute(
                text(
                    """
                    UPDATE documents
                    SET completion_status = CASE
                        WHEN status IN ('ready', 'generated', 'signed') THEN 'completed'
                        WHEN status IN ('review', 'rejected') THEN 'needs_revision'
                        WHEN status = 'draft' THEN 'not_started'
                        ELSE 'not_started'
                    END
                    """
                )
            )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_documents_group_id ON documents (group_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_documents_template_id ON documents (template_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_documents_completion_status ON documents (completion_status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_templates_group_kind ON templates (group_kind)"))
