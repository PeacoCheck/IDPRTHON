# -*- coding: utf-8 -*-
"""Local HTTP entry point for the executive documentation workspace."""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import socket
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from core.objects_db import (  # noqa: E402
    add_object,
    archive_object,
    ensure_objects_db,
    get_current_object,
    get_object_by_id,
    load_objects,
    set_current_object,
    unarchive_object,
)
from core.paths import (  # noqa: E402
    ensure_base_dirs,
    ensure_section_folder,
    is_inside,
    resolve_data_file_for_object,
    resolve_object_folder,
)
from core.state import build_app_state  # noqa: E402
from modules.aosr.aosr_service import DataError, generate_aosr_docs, load_aosr_state  # noqa: E402

SERVER = None
LOCK = threading.Lock()
WEB_DIR = BASE_DIR / "web"


class Handler(BaseHTTPRequestHandler):
    server_version = "IDWorkspace/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code: int, body, ctype: str = "application/json; charset=utf-8") -> None:
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json_body(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            return {}

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._serve_file(WEB_DIR / "index.html", "text/html; charset=utf-8")
        elif self.path in ("/app.js", "/style.css"):
            self._serve_file(WEB_DIR / self.path.lstrip("/"))
        elif self.path == "/api/app-state":
            with LOCK:
                self._send(200, build_app_state())
        elif self.path == "/favicon.ico":
            self._send(204, b"", "image/x-icon")
        else:
            self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        routes = {
            "/api/object/select": self._select_object,
            "/api/object/add": self._add_object,
            "/api/object/archive": self._archive_object,
            "/api/object/unarchive": self._unarchive_object,
            "/api/open-object-folder": self._open_object_folder,
            "/api/open-section": self._open_section,
            "/api/generate": self._generate,
            "/api/open": self._open_aosr_target,
            "/api/shutdown": self._shutdown,
        }
        handler = routes.get(self.path)
        if handler is None:
            self._send(404, {"ok": False, "error": "not found"})
            return
        handler()

    def _serve_file(self, path: Path, ctype: str | None = None) -> None:
        if not path.exists() or not is_inside(WEB_DIR, path):
            self._send(404, {"ok": False, "error": "file not found"})
            return
        data = path.read_bytes()
        ctype = ctype or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/"):
            ctype += "; charset=utf-8"
        self._send(200, data, ctype)

    def _select_object(self) -> None:
        req = self._json_body()
        try:
            with LOCK:
                set_current_object(str(req.get("id") or ""))
                self._send(200, build_app_state())
        except ValueError as e:
            self._send(404, {"ok": False, "error": str(e)})

    def _add_object(self) -> None:
        req = self._json_body()
        try:
            with LOCK:
                add_object(req)
                self._send(200, build_app_state())
        except ValueError as e:
            self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e)})

    def _archive_object(self) -> None:
        req = self._json_body()
        try:
            with LOCK:
                archive_object(str(req.get("id") or ""))
                self._send(200, build_app_state())
        except ValueError as e:
            self._send(404, {"ok": False, "error": str(e)})

    def _unarchive_object(self) -> None:
        req = self._json_body()
        try:
            with LOCK:
                unarchive_object(str(req.get("id") or ""))
                self._send(200, build_app_state())
        except ValueError as e:
            self._send(404, {"ok": False, "error": str(e)})

    def _open_object_folder(self) -> None:
        req = self._json_body()
        obj = get_object_by_id(str(req.get("id") or ""))
        if not obj:
            self._send(404, {"ok": False, "error": "Объект не найден."})
            return
        folder = resolve_object_folder(obj)
        if not folder.exists():
            self._send(404, {"ok": False, "error": "Папка объекта не найдена."})
            return
        self._open_local_path(folder)

    def _open_section(self) -> None:
        req = self._json_body()
        section = str(req.get("section") or "")
        with LOCK:
            obj = get_current_object()
            if not obj:
                self._send(409, {"ok": False, "error": "Объект не выбран."})
                return
            folder = ensure_section_folder(obj, section)
        self._open_local_path(folder)

    def _generate(self) -> None:
        req = self._json_body()
        nums = req.get("nums")
        try:
            with LOCK:
                obj = get_current_object()
                if not obj:
                    self._send(409, {"ok": False, "fatal": {"msg": "Объект не выбран", "hint": ""}})
                    return
                data_file = resolve_data_file_for_object(obj)
                result = generate_aosr_docs(data_file, nums)
            self._send(200, result)
        except DataError as e:
            self._send(409, {"ok": False, "fatal": {"msg": e.msg, "hint": e.hint or ""}})
        except Exception as e:
            self._send(500, {"ok": False, "fatal": {"msg": f"Внутренняя ошибка: {e}", "hint": ""}})

    def _open_aosr_target(self) -> None:
        req = self._json_body()
        target = str(req.get("path") or "")
        with LOCK:
            obj = get_current_object()
            if not obj:
                self._send(409, {"ok": False, "error": "Объект не выбран."})
                return
            data_file = resolve_data_file_for_object(obj)
            state = load_aosr_state(data_file)
            out_dir = Path(state.get("out_dir") or data_file.parent / "Акты" / "АОСР").resolve()

        if target:
            full = Path(target).resolve() if Path(target).is_absolute() else (BASE_DIR / target).resolve()
            allowed = is_inside(out_dir, full) or full == data_file
            if not allowed:
                self._send(403, {"ok": False, "error": "Путь вне папки актов текущего объекта."})
                return
        else:
            full = out_dir

        if not full.exists():
            self._send(404, {"ok": False, "error": "Файл или папка не существует."})
            return
        self._open_local_path(full)

    def _open_local_path(self, path: Path) -> None:
        try:
            os.startfile(path)  # noqa: S606 - local app action after explicit UI confirmation.
            self._send(200, {"ok": True})
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e)})

    def _shutdown(self) -> None:
        self._send(200, {"ok": True})
        threading.Thread(target=SERVER.shutdown, daemon=True).start()


def pick_port(start: int) -> int:
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main() -> None:
    global SERVER
    parser = argparse.ArgumentParser(description="Локальное рабочее место исполнительной документации")
    parser.add_argument("--port", type=int, default=8344, help="порт (по умолчанию 8344)")
    parser.add_argument("--no-browser", action="store_true", help="не открывать браузер автоматически")
    args = parser.parse_args()

    ensure_base_dirs()
    ensure_objects_db()

    port = pick_port(args.port)
    url = f"http://127.0.0.1:{port}/"
    SERVER = ThreadingHTTPServer(("127.0.0.1", port), Handler)

    print("=" * 56)
    print("   ИСПОЛНИТЕЛЬНАЯ ДОКУМЕНТАЦИЯ — рабочее место инженера")
    print("=" * 56)
    print(f"   Адрес: {url}")
    print("   Данные объектов: data/ИД_объекты.xlsx")
    print("   Чтобы завершить работу — закройте это окно или нажмите Ctrl+C.")
    print("=" * 56)

    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        SERVER.serve_forever()
    except KeyboardInterrupt:
        pass
    print("\nСервер остановлен. Хорошего дня!")


if __name__ == "__main__":
    main()
