from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers

from backend import api
from backend.db import Base, Document, ObjectGroup, ObjectRecord, StructureException, StructureRule, Template
from backend.schemas import DocumentCreate, TemplateCopy


class FileArchiveApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.vault = self.root / "vault"
        self.vault.mkdir(parents=True)
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
            SimpleNamespace(vault_dir=self.vault, frontend_dir=self.root / "frontend"),
        )
        self.base_dir_patch = patch.object(api, "BASE_DIR", self.root)
        self.session_patch.start()
        self.settings_patch.start()
        self.base_dir_patch.start()

        with self.session_factory.begin() as db:
            obj = ObjectRecord(
                code="TEST-001",
                name="Test object",
                short_name="Test",
                address="Samara",
                folder_path="objects/TEST-001",
                is_current=True,
                profile="industrial_repair",
                meta_json={},
            )
            db.add(obj)
            db.flush()
            group = ObjectGroup(
                object_id=obj.id,
                code="acts",
                title="Акты",
                kind="acts",
                sort_order=10,
                is_required=True,
            )
            db.add(group)
            db.flush()
            self.object_id = obj.id
            self.group_id = group.id

    def tearDown(self) -> None:
        self.base_dir_patch.stop()
        self.settings_patch.stop()
        self.session_patch.stop()
        self.engine.dispose()
        self.temporary_directory.cleanup()

    def create_document_with_pdf(self) -> tuple[int, bytes]:
        payload = b"%PDF-1.4\n% archived source\n"
        source = self.vault / "objects" / "TEST-001" / "Импорт" / "Акты" / "old.pdf"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(payload)
        with self.session_factory.begin() as db:
            document = Document(
                object_id=self.object_id,
                group_id=self.group_id,
                number="A-1",
                title="Old act",
                doc_type="aosr",
                work_title="Work",
                document_date="29.07.2026",
                status="ready",
                completion_status="completed",
                values_json={},
                warnings_json=[],
                missing_fields_json=["legacy.marker"],
                source_kind="imported",
                source_file=str(source),
            )
            db.add(document)
            db.flush()
            return document.id, payload

    def create_empty_template(self) -> int:
        with self.session_factory.begin() as db:
            template = Template(
                title="Табличный шаблон",
                doc_type="registry",
                group_kind="acts",
                version=1,
                is_active=True,
                fields_json=[],
                field_map_json={},
                marker_map={},
            )
            db.add(template)
            db.flush()
            return template.id

    @staticmethod
    def xlsx_bytes() -> bytes:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Номер", "Наименование"])
        sheet.append([1, "Документ"])
        output = io.BytesIO()
        workbook.save(output)
        workbook.close()
        return output.getvalue()

    @staticmethod
    def pdf_bytes() -> bytes:
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()

    @staticmethod
    def upload(name: str, content: bytes, content_type: str) -> UploadFile:
        return UploadFile(
            io.BytesIO(content),
            size=len(content),
            filename=name,
            headers=Headers({"content-type": content_type}),
        )

    def test_preview_and_replacement_create_downloadable_version(self) -> None:
        document_id, old_content = self.create_document_with_pdf()

        preview = api.preview_document(document_id)
        self.assertEqual("application/pdf", preview.media_type)
        self.assertTrue(preview.headers["content-disposition"].startswith("inline"))

        new_content = b"\x89PNG\r\n\x1a\nnew revision"
        replaced = api.replace_document_file(
            document_id,
            self.upload("revision.png", new_content, "image/png"),
        )
        body = replaced.model_dump(mode="json")
        self.assertEqual("revision.png", body["source_file"])
        self.assertEqual("in_progress", body["completion_status"])
        self.assertEqual("image/png", body["file_info"]["media_type"])
        self.assertEqual("v1", body["values_json"]["versions"][0]["id"])
        self.assertNotIn(str(self.root), json.dumps(body, ensure_ascii=False))

        versions = api.list_document_versions(document_id)
        version = versions["versions"][0]
        self.assertEqual({"id", "name", "size", "created_at", "download_url"}, {key for key in version if key in {"id", "name", "size", "created_at", "download_url"}})
        self.assertEqual("old.pdf", version["name"])
        old_download = api.download_document_version(document_id, version["id"])
        self.assertEqual(old_content, Path(old_download.path).read_bytes())

        current_preview = api.preview_document(document_id)
        self.assertEqual("image/png", current_preview.media_type)
        self.assertEqual(new_content, Path(current_preview.path).read_bytes())

    def test_import_preserves_suffix_for_long_names_and_accepts_webp(self) -> None:
        long_pdf_name = f"{'Очень длинное имя исполнительного документа ' * 5}.pdf"
        imported_pdf = api.import_document_file(
            self.object_id,
            self.upload(long_pdf_name, self.pdf_bytes(), "application/pdf"),
            self.group_id,
        ).model_dump(mode="json")
        self.assertTrue(imported_pdf["source_file"].endswith(".pdf"))
        self.assertEqual(".pdf", imported_pdf["file_info"]["file_extension"])

        imported_webp = api.import_document_file(
            self.object_id,
            self.upload("photo.webp", b"RIFFxxxxWEBP", "image/webp"),
            self.group_id,
        ).model_dump(mode="json")
        self.assertEqual(".webp", imported_webp["file_info"]["file_extension"])
        self.assertEqual("image/webp", imported_webp["file_info"]["media_type"])

    def test_integrity_counts_file_presence_separately_from_completion(self) -> None:
        document_id, _content = self.create_document_with_pdf()
        with self.session_factory.begin() as db:
            document = db.get(Document, document_id)
            document.completion_status = "needs_revision"
            db.add(
                StructureRule(
                    code="acts-required",
                    title="Акт обязателен",
                    group_kind="acts",
                    profile="industrial_repair",
                    doc_types_json=["aosr"],
                    min_count=1,
                    severity="error",
                )
            )
        with self.session_factory() as db:
            integrity = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))

        check = integrity["checks"][0]
        self.assertEqual("ok", check["status"])
        self.assertEqual(1, check["records"])
        self.assertEqual(1, check["present_files"])
        self.assertEqual(0, check["completed_files"])

    def test_integrity_requires_matching_required_group_and_preserves_waiver(self) -> None:
        document_id, _content = self.create_document_with_pdf()
        with self.session_factory.begin() as db:
            wrong_group = ObjectGroup(
                object_id=self.object_id,
                code="journals",
                title="Журналы",
                kind="journals",
                sort_order=20,
                is_required=True,
            )
            db.add(wrong_group)
            db.flush()
            db.get(Document, document_id).group_id = wrong_group.id
            rule = StructureRule(
                code="acts-in-acts-group",
                title="Акт в разделе актов",
                group_kind="acts",
                profile="industrial_repair",
                doc_types_json=["aosr"],
                min_count=1,
                severity="error",
            )
            db.add(rule)
            db.flush()
            rule_id = rule.id

        with self.session_factory() as db:
            integrity = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))
        check = integrity["checks"][0]
        self.assertEqual("error", check["status"])
        self.assertEqual(0, check["records"])
        self.assertEqual([], check["document_ids"])

        with self.session_factory.begin() as db:
            db.add(
                StructureException(
                    object_id=self.object_id,
                    rule_id=rule_id,
                    resolution_type="justified_exception",
                    reason="Акт учтён в другом разделе по решению комиссии",
                    status="accepted",
                )
            )
        with self.session_factory() as db:
            waived = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))
        self.assertEqual("waived", waived["checks"][0]["status"])
        self.assertEqual(1, waived["satisfied"])

    def test_integrity_omits_rules_for_optional_group_kind(self) -> None:
        with self.session_factory.begin() as db:
            db.get(ObjectGroup, self.group_id).is_required = False
            db.add(
                StructureRule(
                    code="optional-acts",
                    title="Необязательный раздел актов",
                    group_kind="acts",
                    profile="industrial_repair",
                    doc_types_json=["aosr"],
                    min_count=1,
                    severity="error",
                )
            )

        with self.session_factory() as db:
            integrity = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))
        self.assertEqual([], integrity["checks"])
        self.assertEqual(0, integrity["total"])
        self.assertEqual(100, integrity["score"])

    def test_custom_required_group_has_its_own_integrity_check_and_waiver(self) -> None:
        with self.session_factory.begin() as db:
            group = ObjectGroup(
                object_id=self.object_id,
                code=f"custom-{self.object_id}-20",
                title="Протоколы специальных испытаний",
                kind="acts",
                description="Отдельный обязательный комплект",
                sort_order=20,
                is_required=True,
            )
            db.add(group)
            db.flush()
            custom_group_id = group.id

        with self.session_factory() as db:
            missing = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))
        self.assertEqual(1, missing["total"])
        self.assertEqual("error", missing["checks"][0]["status"])
        self.assertEqual(-custom_group_id, missing["checks"][0]["id"])

        waived = api.waive_integrity_issue(
            self.object_id,
            -custom_group_id,
            {
                "resolution_type": "justified_exception",
                "reason": "Испытания не предусмотрены проектом",
                "evidence": "Письмо заказчика № 15",
            },
        )
        self.assertEqual("waived", waived["checks"][0]["status"])
        self.assertEqual(100, waived["score"])

        restored = api.restore_integrity_issue(self.object_id, -custom_group_id)
        self.assertEqual("error", restored["checks"][0]["status"])

        document_id, _content = self.create_document_with_pdf()
        with self.session_factory.begin() as db:
            db.get(Document, document_id).group_id = custom_group_id
        with self.session_factory() as db:
            complete = api.integrity_for_object(db, db.get(ObjectRecord, self.object_id))
        self.assertEqual("ok", complete["checks"][0]["status"])

    def test_expected_document_auto_selects_group_without_template(self) -> None:
        with self.session_factory.begin() as db:
            journals = ObjectGroup(
                object_id=self.object_id,
                code="journals",
                title="Журналы",
                kind="journals",
                sort_order=20,
                is_required=True,
            )
            quality = ObjectGroup(
                object_id=self.object_id,
                code="quality",
                title="Материалы и паспорта",
                kind="quality",
                sort_order=30,
                is_required=True,
            )
            db.add_all([journals, quality])
            db.flush()
            journal_group_id = journals.id
            quality_group_id = quality.id

        journal = api.create_document(
            DocumentCreate(
                object_id=self.object_id,
                title="Общий журнал работ",
                doc_type="general_journal",
            )
        )
        passport = api.create_document(
            DocumentCreate(
                object_id=self.object_id,
                title="Паспорт оборудования",
                doc_type="imported",
            )
        )

        self.assertEqual(journal_group_id, journal.group_id)
        self.assertEqual(quality_group_id, passport.group_id)
        self.assertIsNone(journal.template_id)
        self.assertIsNone(passport.file_info)

    def test_xlsx_template_can_be_previewed_downloaded_and_copied_to_object(self) -> None:
        template_id = self.create_empty_template()
        xlsx = self.xlsx_bytes()

        uploaded = api.upload_template_file(
            template_id,
            self.upload("registry.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            marker_map=None,
        )
        body = uploaded
        self.assertEqual([], body["markers"])
        self.assertEqual(".xlsx", body["file_info"]["file_extension"])
        self.assertNotIn(str(self.root), json.dumps(body, ensure_ascii=False))

        markers = api.list_template_markers(template_id)
        self.assertEqual([], markers["markers"])
        preview = api.preview_template_file(template_id)
        self.assertTrue(preview.headers["content-disposition"].startswith("inline"))
        spreadsheet_preview = api.preview_template_spreadsheet(template_id)
        self.assertEqual("Sheet", spreadsheet_preview["sheet_name"])
        self.assertEqual([["Номер", "Наименование"], [1, "Документ"]], spreadsheet_preview["rows"])
        self.assertEqual(xlsx, Path(api.download_template_file(template_id).path).read_bytes())

        copied = api.copy_template_to_object(
            template_id,
            TemplateCopy(object_id=self.object_id, group_id=self.group_id),
        )
        document = copied.model_dump(mode="json")
        self.assertEqual("in_progress", document["completion_status"])
        self.assertEqual(template_id, document["template_id"])
        self.assertEqual(xlsx, Path(api.open_source_document(document["id"]).path).read_bytes())
        self.assertEqual(spreadsheet_preview, api.preview_document_spreadsheet(document["id"]))

        duplicate = api.duplicate_template(template_id)
        self.assertNotEqual(template_id, duplicate["id"])
        self.assertEqual(".xlsx", duplicate["file_info"]["file_extension"])
        self.assertEqual(xlsx, Path(api.download_template_file(duplicate["id"]).path).read_bytes())

        archived = api.archive_template(template_id)
        self.assertTrue(archived["archived"])
        api.archive_template(duplicate["id"])
        self.assertEqual([], api.list_templates())
        archived_list = api.list_templates(include_archived=True)
        self.assertEqual(2, len(archived_list))

    def test_pdf_template_creation_and_resource_template_metadata_are_safe(self) -> None:
        created = api.create_template(
            self.upload("blank.pdf", self.pdf_bytes(), "application/pdf"),
            title="PDF шаблон",
            doc_type="other",
            group_kind="acts",
            notes="Для ручного заполнения",
            marker_map=None,
        )
        self.assertEqual("application/pdf", created["file_info"]["media_type"])

        resource = self.root / "resources" / "templates" / "builtin.pdf"
        resource.parent.mkdir(parents=True, exist_ok=True)
        resource.write_bytes(self.pdf_bytes())
        with self.session_factory.begin() as db:
            template = Template(
                title="Встроенный PDF",
                doc_type="other",
                group_kind="acts",
                version=1,
                is_active=True,
                fields_json=[],
                field_map_json={},
                marker_map={},
                template_file="resources/templates/builtin.pdf",
            )
            db.add(template)

        templates = api.list_templates()
        builtin = next(item for item in templates if item["title"] == "Встроенный PDF")
        self.assertEqual("builtin.pdf", builtin["template_file"])
        self.assertEqual("application/pdf", builtin["file_info"]["media_type"])
        self.assertNotIn(str(self.root), json.dumps(builtin, ensure_ascii=False))

    def test_invalid_xlsx_is_rejected_without_replacing_current_template(self) -> None:
        template_id = self.create_empty_template()
        first = api.upload_template_file(
            template_id,
            self.upload("valid.xlsx", self.xlsx_bytes(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            marker_map=None,
        )
        current_name = first["template_file"]

        with self.assertRaises(HTTPException) as raised:
            api.upload_template_file(
                template_id,
                self.upload("broken.xlsx", b"not-an-xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                marker_map=None,
            )
        self.assertEqual(422, raised.exception.status_code)
        with self.session_factory() as db:
            template = db.get(Template, template_id)
            self.assertEqual(current_name, Path(template.template_file).name)


if __name__ == "__main__":
    unittest.main()
