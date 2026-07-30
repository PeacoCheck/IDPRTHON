from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ObjectOut(ORMModel):
    id: int
    code: str
    name: str
    short_name: str
    address: str
    comment: str
    folder_path: str
    status: str
    is_current: bool
    profile: str
    meta_json: dict[str, Any]


class ObjectCreate(BaseModel):
    code: str | None = None
    name: str = Field(min_length=2)
    short_name: str | None = None
    address: str = ""
    comment: str = ""


class ObjectPatch(BaseModel):
    name: str | None = None
    short_name: str | None = None
    address: str | None = None
    comment: str | None = None
    profile: str | None = None
    meta_json: dict[str, Any] | None = None


class DocumentOut(ORMModel):
    id: int
    object_id: int
    group_id: int | None
    template_id: int | None
    number: str
    title: str
    doc_type: str
    work_title: str
    document_date: str
    status: str
    completion_status: Literal["not_started", "in_progress", "needs_revision", "completed"]
    values_json: dict[str, Any]
    warnings_json: list[Any]
    missing_fields_json: list[Any]
    source_kind: str
    source_file: str
    output_file: str | None
    file_info: dict[str, Any] | None = None


class DocumentCreate(BaseModel):
    object_id: int | None = None
    preset_id: int | None = None
    template_id: int | None = None
    group_id: int | None = None
    number: str | None = None
    title: str = "Акт освидетельствования скрытых работ"
    doc_type: str = "aosr"
    work_title: str = ""
    document_date: str = ""
    values_json: dict[str, Any] = Field(default_factory=dict)


class DocumentPatch(BaseModel):
    number: str | None = None
    work_title: str | None = None
    document_date: str | None = None
    status: str | None = None
    completion_status: Literal["not_started", "in_progress", "needs_revision", "completed"] | None = None
    values_json: dict[str, Any] | None = None


class TemplateBind(BaseModel):
    template_file: str = Field(min_length=1)
    marker_map: dict[str, Any] | None = None


class TemplatePatch(BaseModel):
    title: str | None = None
    doc_type: str | None = None
    group_kind: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class TemplateCopy(BaseModel):
    object_id: int
    group_id: int | None = None
    title: str | None = None
    number: str | None = None


class TemplateDuplicate(BaseModel):
    title: str | None = None
    notes: str | None = None
