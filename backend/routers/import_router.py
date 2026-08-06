from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from ..db import SessionLocal, ObjectRecord
from ..api import import_document_file, replace_document_file, update_document

import_router = APIRouter(prefix="/api/v1", tags=["batch-import"])


class BatchImportItemResult(BaseModel):
    filename: str
    status: str
    document_id: Optional[int] = None
    error: Optional[str] = None


class BatchImportResponse(BaseModel):
    imported_count: int
    skipped_count: int
    error_count: int
    results: List[BatchImportItemResult]


@import_router.post("/objects/{object_id}/batch-import", response_model=BatchImportResponse)
async def batch_import_files(
    object_id: int,
    files: List[UploadFile] = File(...),
    group_ids: Optional[List[str]] = Form(None),
    completion_statuses: Optional[List[str]] = Form(None),
    document_ids: Optional[List[str]] = Form(None),
):
    """
    Mass file upload & heuristic matching route for Wave 2 Agent B contract.
    """
    with SessionLocal() as db:
        object_row = db.get(ObjectRecord, object_id)
        if not object_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")

    imported_count = 0
    skipped_count = 0
    error_count = 0
    results: List[BatchImportItemResult] = []

    for index, file in enumerate(files):
        if not file.filename:
            skipped_count += 1
            results.append(BatchImportItemResult(filename="unknown", status="skipped", error="Empty filename"))
            continue

        try:
            group_id_val = None
            if group_ids and index < len(group_ids) and group_ids[index]:
                group_id_val = int(group_ids[index])
            
            doc_id_val = None
            if document_ids and index < len(document_ids) and document_ids[index]:
                doc_id_val = int(document_ids[index])
                
            status_val = None
            if completion_statuses and index < len(completion_statuses) and completion_statuses[index]:
                status_val = completion_statuses[index]

            if doc_id_val:
                doc = replace_document_file(document_id=doc_id_val, file=file)
            else:
                doc = import_document_file(object_id=object_id, file=file, group_id=group_id_val)
            
            if status_val and status_val != "completed":
                # We need to manually update completion status using the DB directly or update_document endpoint,
                # but update_document expects a DocumentUpdate payload. So we just use update_document.
                from ..schemas import DocumentUpdate
                update_document(document_id=doc.id, payload=DocumentUpdate(completion_status=status_val))

            imported_count += 1
            results.append(
                BatchImportItemResult(
                    filename=file.filename,
                    status="imported",
                    document_id=doc.id,
                )
            )
        except Exception as err:
            error_count += 1
            results.append(
                BatchImportItemResult(
                    filename=file.filename,
                    status="error",
                    error=str(err),
                )
            )

    return BatchImportResponse(
        imported_count=imported_count,
        skipped_count=skipped_count,
        error_count=error_count,
        results=results,
    )
