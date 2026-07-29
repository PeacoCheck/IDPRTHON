from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import settings
from .db import create_schema
from .seed import seed_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_schema()
    seed_database()
    yield


app = FastAPI(title="ID Vault API", version="0.2.0", lifespan=lifespan)
app.include_router(router)

assets = settings.frontend_dir / "assets"
if assets.exists():
    app.mount("/assets", StaticFiles(directory=assets), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str):
    candidate = (settings.frontend_dir / full_path).resolve()
    if full_path and candidate.is_file() and settings.frontend_dir.resolve() in candidate.parents:
        return FileResponse(candidate)
    index = settings.frontend_dir / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"ok": False, "error": "Frontend не собран. Выполните npm run build в папке frontend."}
