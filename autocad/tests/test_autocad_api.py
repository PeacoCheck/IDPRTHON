from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import api, autocad_com
from backend.db import Base, SkillRecord
from backend.seed import seed_skills


class AutoCADSkillsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.skills_dir = self.root / "skills_library"
        self.skills_dir.mkdir(parents=True, exist_ok=True)

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)

        self.session_patch = patch.object(api, "SessionLocal", self.session_factory)
        self.settings_patch = patch.object(
            api,
            "settings",
            SimpleNamespace(skills_dir=self.skills_dir, data_dir=self.root),
        )
        self.session_patch.start()
        self.settings_patch.start()

    def tearDown(self) -> None:
        self.settings_patch.stop()
        self.session_patch.stop()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_seed_skills(self) -> None:
        with self.session_factory() as db:
            seed_skills(db)
            records = db.query(SkillRecord).all()
            self.assertGreater(len(records), 0)

    def test_check_status_simulation(self) -> None:
        status = autocad_com.check_autocad_status()
        self.assertIn("mode", status)

    def test_execute_simulation(self) -> None:
        test_lsp = self.skills_dir / "test.lsp"
        test_lsp.write_text("(defun c:test () (princ))", encoding="utf-8")

        res = autocad_com.execute_skill_in_autocad(test_lsp, "test")
        self.assertTrue(res["success"])


if __name__ == "__main__":
    unittest.main()
