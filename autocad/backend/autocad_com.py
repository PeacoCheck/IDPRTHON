from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("autocad_com")

try:
    import pythoncom
    import win32com.client
    HAS_WIN32COM = True
except ImportError:
    HAS_WIN32COM = False


def check_autocad_status() -> dict[str, Any]:
    """Check if AutoCAD process is running and accessible via Windows COM."""
    if not HAS_WIN32COM:
        return {
            "connected": False,
            "running": False,
            "active_document": None,
            "active_path": None,
            "version": None,
            "mode": "simulation",
            "message": "Библиотека pywin32 не установлена. Работает режим эмуляции.",
        }

    com_initialized = False
    try:
        pythoncom.CoInitialize()
        com_initialized = True
        acad = win32com.client.GetActiveObject("AutoCAD.Application")
        doc = acad.ActiveDocument
        doc_name = doc.Name if doc else "Без названия"
        version = getattr(acad, "Version", "AutoCAD (Неизвестная версия)")
        return {
            "connected": True,
            "running": True,
            "active_document": doc_name,
            "active_path": getattr(doc, "Path", ""),
            "version": str(version),
            "mode": "live",
            "message": f"Подключено к AutoCAD ({doc_name})",
        }
    except Exception as e:
        return {
            "connected": False,
            "running": False,
            "active_document": None,
            "active_path": None,
            "version": None,
            "mode": "simulation",
            "message": f"AutoCAD не найден в активных процессах: {str(e)}",
        }
    finally:
        if com_initialized:
            pythoncom.CoUninitialize()


def execute_skill_in_autocad(lsp_file_path: Path, command_name: str) -> dict[str, Any]:
    """Load and execute an AutoLISP file inside the active AutoCAD document via COM."""
    abs_path = Path(lsp_file_path).resolve()
    if not abs_path.exists():
        return {
            "success": False,
            "message": f"Файл скилла не найден: {abs_path}",
            "dwg_name": "—",
        }

    status = check_autocad_status()
    posix_path = abs_path.as_posix()  # AutoLISP requires forward slashes /

    if status["connected"] and HAS_WIN32COM:
        com_initialized = False
        try:
            pythoncom.CoInitialize()
            com_initialized = True
            acad = win32com.client.GetActiveObject("AutoCAD.Application")
            doc = acad.ActiveDocument
            if not doc:
                return {
                    "success": False,
                    "message": "В AutoCAD нет открытых документов чертежей.",
                    "dwg_name": "—",
                }

            # Escape quotes in file path
            escaped_path = posix_path.replace('"', '\\"')
            escaped_cmd = command_name.replace('"', '\\"')

            # LISP load string + command trigger
            lisp_command = f'(load "{escaped_path}") (c:{escaped_cmd})\n'
            doc.SendCommand(lisp_command)
            doc_name = doc.Name

            return {
                "success": True,
                "message": f"Скилл '{command_name}' успешно передан и выполнен в AutoCAD ({doc_name}).",
                "dwg_name": doc_name,
                "mode": "live",
            }
        except Exception as e:
            logger.error(f"COM execution error: {e}")
            return {
                "success": False,
                "message": f"Ошибка отправки команды в AutoCAD: {str(e)}",
                "dwg_name": status.get("active_document") or "—",
                "mode": "live",
            }
        finally:
            if com_initialized:
                pythoncom.CoUninitialize()

    # Simulation fallback if AutoCAD is not running
    return {
        "success": True,
        "message": f"[Эмуляция] Скилл '{command_name}' сэмулирован. Для живого запуска откройте AutoCAD.",
        "dwg_name": "Demo_Drawing.dwg (Симуляция)",
        "mode": "simulation",
    }
