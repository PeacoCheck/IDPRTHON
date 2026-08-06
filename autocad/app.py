# -*- coding: utf-8 -*-
"""One-click launcher for the AutoCAD Skills Vault isolated application."""
from __future__ import annotations

import argparse
import socket
import sys
import threading
import webbrowser

import uvicorn

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def pick_port(start: int = 8770) -> int:
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("Не найден свободный локальный порт")


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoCAD Skills Vault — Исполнительная документация")
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    port = pick_port(args.port)
    url = f"http://127.0.0.1:{port}"
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    print(f"AutoCAD Skills Vault запущен: {url}")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, reload=args.reload)


if __name__ == "__main__":
    main()
