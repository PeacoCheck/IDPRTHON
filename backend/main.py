from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
import subprocess

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import settings
from .db import create_schema
from .routers.import_router import import_router
from .seed import seed_database

AUTOCAD_SERVICE_URL = "http://127.0.0.1:8770"


def local_autocad_diagnostics() -> dict:
    """Useful fallback while the optional COM bridge is not running."""
    tasklist = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq acad.exe", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    process_running = "acad.exe" in tasklist.stdout.lower()
    return {
        "connected": False,
        "status": {"connected": False, "message": "COM-мост AutoCAD не запущен"},
        "checks": [
            {"id": "acad_process", "label": "Процесс AutoCAD (acad.exe)", "ok": process_running, "detail": "AutoCAD запущен" if process_running else "acad.exe не найден"},
            {"id": "bridge", "label": "Локальный AutoCAD-сервис", "ok": False, "detail": "Сервис на 127.0.0.1:8770 не отвечает"},
            {"id": "com_conn", "label": "COM-подключение", "ok": False, "detail": "Проверка будет доступна после запуска AutoCAD-сервиса"},
        ],
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_schema()
    seed_database()
    yield


app = FastAPI(title="ID Vault API", version="0.2.0", lifespan=lifespan)
app.include_router(router)
app.include_router(import_router)

assets = settings.frontend_dir / "assets"
if assets.exists():
    app.mount("/assets", StaticFiles(directory=assets), name="assets")


@app.api_route("/autocad-api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def autocad_proxy(path: str, request: Request):
    """Proxy all /autocad-api/* requests to the AutoCAD service."""
    url = f"{AUTOCAD_SERVICE_URL}/api/{path}"
    params = dict(request.query_params)
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                params=params,
                headers=headers,
                content=body,
            )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
            media_type=resp.headers.get("content-type", "application/json"),
        )
    except httpx.ConnectError:
        if path == "diagnostics" and request.method == "GET":
            return JSONResponse(local_autocad_diagnostics())
        return Response(
            content=b'{"detail":"AutoCAD service offline","connected":false}',
            status_code=503,
            media_type="application/json",
        )
    except Exception as e:
        return Response(
            content=f'{{"detail":"{str(e)}"}}'.encode(),
            status_code=502,
            media_type="application/json",
        )


@app.get("/{full_path:path}", include_in_schema=False)
def frontend(full_path: str):
    candidate = (settings.frontend_dir / full_path).resolve()
    if full_path and candidate.is_file() and settings.frontend_dir.resolve() in candidate.parents:
        return FileResponse(candidate)
    index = settings.frontend_dir / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"ok": False, "error": "Frontend не собран. Выполните npm run build в папке frontend."}
