from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class SkillOut(BaseModel):
    id: int
    code: str
    title: str
    category: str
    description: str
    command_name: str
    file_name: str
    code_content: str
    version: str
    is_builtin: bool
    use_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class SkillCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    category: str = Field("general", min_length=2, max_length=50)
    description: str = ""
    command_name: str = Field(..., min_length=2, max_length=100)
    code_content: str = Field(..., min_length=5)
    version: str = Field("1.0", max_length=20)


class SkillUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    description: str | None = None
    command_name: str | None = None
    code_content: str | None = None
    version: str | None = None


class ExecuteSkillRequest(BaseModel):
    skill_id: int


class StatusOut(BaseModel):
    connected: bool
    running: bool
    active_document: str | None
    active_path: str | None
    version: str | None
    mode: str
    message: str


class ExecutionLogOut(BaseModel):
    id: int
    skill_id: int
    skill_title: str
    status: str
    dwg_name: str
    message: str
    executed_at: datetime

    class Config:
        from_attributes = True


class SkillHistoryOut(BaseModel):
    version: str
    file_name: str
    code_content: str
    created_at: float

    class Config:
        from_attributes = True
