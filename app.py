# -*- coding: utf-8 -*-
"""
Веб-интерфейс генератора актов АОСР.

Запуск:  python app.py            (или двойной клик по ЗАПУСК.bat)
         python app.py --file Объект2.xlsx
         python app.py --port 8765 --no-browser

Сервер работает только на этом компьютере (127.0.0.1) и не выходит в сеть.
"""
import argparse
import json
import os
import socket
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import generate_aosr as core

core.VERBOSE = False  # события уходят в интерфейс, консоль не засоряем

LOCK = threading.Lock()        # ядро не потокобезопасно (общий журнал событий)
DATA_FILE = os.path.join(BASE_DIR, "АОСР_данные.xlsx")
SERVER = None


# ------------------------------------------------------------
#  Сериализация данных для интерфейса
# ------------------------------------------------------------
def act_to_json(a, proj):
    return {
        "row": a["row"],
        "num": a["num"],
        "date": core.d_short(a["date"]) if a["date"] else "",
        "date_long": core.d_long(a["date"]) if a["date"] else "",
        "works": a["works"],
        "proj_doc": a["proj_doc"],
        "materials": core.materials_text(a),
        "presented": a["presented"],
        "dstart": core.d_short(a["dstart"]) if a["dstart"] else "",
        "dend": core.d_short(a["dend"]) if a["dend"] else "",
        "norms": a["norms"],
        "next_works": a["next_works"],
        "extra": a["extra"],
        "copies": a["copies"] or proj["copies_default"],
        "attach": a["attach"],
        "performer": a["performer"] or proj["performer_default"],
        "file": core.act_filename(a, proj),
        "errors": a.get("errors", []),
        "warnings": a.get("warnings", []),
    }


def build_state():
    """Прочитать книгу и собрать всё состояние для интерфейса."""
    core.reset_events()
    try:
        proj, people, mats, acts = core.load_all(DATA_FILE)
        errors, warnings = core.validate(acts, mats)
    except core.DataError as e:
        return {
            "ok": False,
            "fatal": {"msg": e.msg, "hint": e.hint or ""},
            "events": list(core.EVENTS),
            "data_file": os.path.abspath(DATA_FILE),
        }
    return {
        "ok": True,
        "data_file": os.path.abspath(DATA_FILE),
        "project": proj,
        "out_dir": os.path.abspath(os.path.join(BASE_DIR, proj["out_dir"]))
                   if not os.path.isabs(proj["out_dir"]) else proj["out_dir"],
        "people": people,
        "materials": [
            {"code": c, "name": m["name"], "dtype": m["dtype"],
             "num": m["num"], "date": core.d_short(m["date"]) if m["date"] else ""}
            for c, m in mats.items()
        ],
        "acts": [act_to_json(a, proj) for a in acts],
        "errors": errors,
        "warnings": warnings,
        "events": list(core.EVENTS),
    }


def build_app_state():
    """Состояние всего приложения «Исполнительная документация».

    Возвращает список объектов, активный объект и активный раздел, а также
    полное состояние раздела АОСР (через build_state). Меню разделов задаётся
    на стороне интерфейса (структура UI), поэтому здесь не дублируется.

    Сейчас объект один и берётся из текущего файла данных, но структура
    рассчитана на массив объектов: достаточно расширить objects[].
    """
    aosr = build_state()
    proj = aosr.get("project") or {}
    name = proj.get("object_name") or "Объект"
    addr = proj.get("object_addr") or ""
    # короткое имя: первые слова названия — для выпадающего списка объектов
    short = name if len(name) <= 32 else name[:32].rstrip() + "…"
    objects = [{
        "id": "object_1",
        "name": name,
        "shortName": short,
        "address": addr,
        "dataFile": os.path.basename(DATA_FILE),
    }]
    return {
        "ok": True,
        "appTitle": "Исполнительная документация",
        "activeObjectId": "object_1",
        "activeSection": "acts/aosr",
        "objects": objects,
        "aosr": aosr,
    }


def do_generate(nums):
    """Сгенерировать выбранные акты (nums — список строк-номеров, None = все)."""
    core.reset_events()
    proj, people, mats, acts = core.load_all(DATA_FILE)
    core.validate(acts, mats)
    if nums is not None:
        wanted = {str(n).strip() for n in nums}
        acts = [a for a in acts if a["num"] in wanted]
        if not acts:
            raise core.DataError("Выбранные акты не найдены в реестре.",
                                 "обновите данные и попробуйте снова.")
    bad = [a for a in acts if a.get("errors")]
    if bad:
        lines = []
        for a in bad:
            for m in a["errors"]:
                lines.append(f"Акт № {a['num'] or '?'} (строка {a['row']}): {m}")
        raise core.DataError("Есть критические ошибки — файлы не созданы:\n" + "\n".join(lines),
                             "исправьте данные в Excel и нажмите «Обновить».")
    out_dir = proj["out_dir"]
    if not os.path.isabs(out_dir):
        out_dir = os.path.join(BASE_DIR, out_dir)
    made, out_abs = core.generate(acts, proj, people, out_dir=out_dir)
    return {"ok": True, "made": made, "out_dir": out_abs, "events": list(core.EVENTS)}


# ------------------------------------------------------------
#  HTTP-сервер
# ------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "AOSR/2.0"

    def log_message(self, fmt, *args):
        pass  # тихий лог; ошибки Python всё равно попадут в консоль

    # ---- ответы ----
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            return {}

    # ---- GET ----
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            try:
                with open(os.path.join(BASE_DIR, "index.html"), "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except FileNotFoundError:
                self._send(500, {"error": "index.html не найден рядом с app.py"})
        elif self.path == "/api/state":
            with LOCK:
                state = build_state()
            self._send(200, state)
        elif self.path == "/api/app-state":
            # состояние всего приложения: объекты + раздел АОСР
            with LOCK:
                state = build_app_state()
            self._send(200, state)
        elif self.path == "/favicon.ico":
            self._send(204, b"", "image/x-icon")
        else:
            self._send(404, {"error": "not found"})

    # ---- POST ----
    def do_POST(self):
        if self.path == "/api/generate":
            req = self._json_body()
            nums = req.get("nums")  # None = все акты
            try:
                with LOCK:
                    result = do_generate(nums)
                self._send(200, result)
            except core.DataError as e:
                self._send(409, {"ok": False, "fatal": {"msg": e.msg, "hint": e.hint or ""}})
            except Exception as e:
                self._send(500, {"ok": False, "fatal": {"msg": f"Внутренняя ошибка: {e}", "hint": ""}})
        elif self.path == "/api/open":
            # открыть папку результата или конкретный сгенерированный файл
            req = self._json_body()
            target = req.get("path") or ""
            with LOCK:
                state = build_state()
            out_dir = state.get("out_dir") or os.path.join(BASE_DIR, "Акты")
            if target:
                full = os.path.abspath(target)
                if not full.startswith(os.path.abspath(out_dir) + os.sep):
                    self._send(403, {"ok": False, "error": "путь вне папки актов"})
                    return
            else:
                full = out_dir
            if not os.path.exists(full):
                self._send(404, {"ok": False, "error": "файл или папка не существует"})
                return
            try:
                os.startfile(full)  # noqa: S606 — локальное действие по запросу пользователя
                self._send(200, {"ok": True})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})
        elif self.path == "/api/shutdown":
            self._send(200, {"ok": True})
            threading.Thread(target=SERVER.shutdown, daemon=True).start()
        else:
            self._send(404, {"error": "not found"})


def pick_port(start):
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start


def main():
    global DATA_FILE, SERVER
    ap = argparse.ArgumentParser(description="Веб-интерфейс генератора АОСР")
    ap.add_argument("--file", default=DATA_FILE, help="файл с данными (xlsx)")
    ap.add_argument("--port", type=int, default=8344, help="порт (по умолчанию 8344)")
    ap.add_argument("--no-browser", action="store_true", help="не открывать браузер автоматически")
    args = ap.parse_args()

    DATA_FILE = args.file if os.path.isabs(args.file) else os.path.join(BASE_DIR, args.file)
    port = pick_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    SERVER = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("=" * 56)
    print("   ИСПОЛНИТЕЛЬНАЯ ДОКУМЕНТАЦИЯ — рабочее место инженера")
    print("=" * 56)
    print(f"   Данные:  {DATA_FILE}")
    print(f"   Адрес:   {url}")
    print()
    print("   Окно браузера откроется автоматически.")
    print("   Чтобы завершить работу — закройте это окно")
    print("   или нажмите Ctrl+C.")
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
