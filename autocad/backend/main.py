from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import settings
from .db import SessionLocal, init_db
from .seed import seed_skills

app = FastAPI(title="AutoCAD Skills Vault", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def startup_event():
    init_db()
    with SessionLocal() as db:
        seed_skills(db)


if settings.frontend_dir.exists():
    app.mount("/", StaticFiles(directory=settings.frontend_dir.as_posix(), html=True), name="frontend")
