# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════╗
║  ГЕНЕРАТОР АКТОВ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ (АОСР)        ║
║  Форма — Приказ Ростехнадзора № 344 от 16.10.2022                ║
║                                                                  ║
║  Красивый интерфейс:  двойной клик по ЗАПУСК.bat                 ║
║  Консольный запуск:   python generate_aosr.py                    ║
║  Один акт:            python generate_aosr.py --akt 1            ║
║  Другой файл:         python generate_aosr.py --file Файл.xlsx   ║
║  Справка:             python generate_aosr.py --help             ║
╚══════════════════════════════════════════════════════════════════╝
Требуются библиотеки:  pip install openpyxl python-docx
"""
import argparse
import datetime as dt
import os
import re
import sys
import warnings

# openpyxl ругается на выпадающие списки Excel — на работу это не влияет
warnings.filterwarnings("ignore", message="Data Validation extension is not supported")

# ---------- дружелюбная консоль ----------
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


class DataError(Exception):
    """Критическая ошибка данных: генерация невозможна."""
    def __init__(self, msg, hint=None):
        super().__init__(msg)
        self.msg = msg
        self.hint = hint


# Журнал событий последнего запуска (используется веб-интерфейсом).
EVENTS = []
VERBOSE = True  # веб-сервер выключает печать в консоль


def _emit(level, msg):
    EVENTS.append({"level": level, "msg": msg})
    if VERBOSE:
        prefix = {"ok": "  [OK] ", "warn": "  [!]  ", "err": "  [X]  "}[level]
        print(prefix + msg)


def reset_events():
    EVENTS.clear()


def say(msg=""):    print(msg)
def ok(msg):        _emit("ok", msg)
def warn(msg):      _emit("warn", msg)
def err(msg):       _emit("err", msg)
def title(msg):     print(f"\n=== {msg} " + "=" * max(1, 60 - len(msg)))


def die(msg, hint=None):
    raise DataError(msg, hint)


# ---------- проверка библиотек ----------
_MISSING = []
try:
    import openpyxl
except ImportError:
    openpyxl = None
    _MISSING.append(("openpyxl", "pip install openpyxl"))
try:
    from docx import Document
    from docx.shared import Pt, Mm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
except ImportError:
    Document = None
    _MISSING.append(("python-docx", "pip install python-docx"))


def check_libs():
    if _MISSING:
        names = ", ".join(n for n, _ in _MISSING)
        cmds = ";  ".join(c for _, c in _MISSING)
        die(f"Не установлены библиотеки: {names}.",
            f"выполните в командной строке:  {cmds}")


MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]

def as_date(v):
    """Привести значение ячейки к дате или вернуть None."""
    if v is None or v == "":
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = str(v).strip()
    for fmt in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

def d_short(d):  # 25.02.2026
    return d.strftime("%d.%m.%Y") if d else "«___» __________ 20__ г."

def d_long(d):   # «25» февраля 2026 г.
    if not d:
        return "«___» __________ 20__ г."
    return f"«{d.day:02d}» {MONTHS[d.month - 1]} {d.year} г."

def s(v):
    return "" if v is None else str(v).strip()

def sanitize_filename(name):
    return re.sub(r'[\\/:*?"<>|\n\r\t]+', "-", name).strip(" .")


# ============================================================
#                    ЧТЕНИЕ EXCEL
# ============================================================
def read_workbook(path):
    check_libs()
    if not os.path.exists(path):
        die(f"Файл данных не найден: {path}",
            "положите файл АОСР_данные.xlsx рядом со скриптом или укажите путь: python generate_aosr.py --file путь.xlsx")
    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        die(f"Не удалось открыть {path}: {e}", "закройте файл в Excel, если он открыт, и попробуйте снова.")
    needed = ["1.Объект", "2.Участники", "3.Материалы", "4.Реестр актов"]
    for n in needed:
        if n not in wb.sheetnames:
            die(f"В книге нет листа «{n}».", "не переименовывайте листы шаблона.")
    return wb

def read_project(ws):
    p = {}
    for row in ws.iter_rows(min_row=2, max_col=2, values_only=True):
        key, val = s(row[0]), row[1]
        if key:
            p[key] = val
    def need(key):
        v = s(p.get(key))
        if not v:
            warn(f"На листе «1.Объект» не заполнено: «{key}». В акте останется пустая строка.")
        return v
    proj = {
        "object_name": need("Наименование объекта"),
        "object_addr": need("Адрес объекта"),
        "developer": need("Застройщик (технический заказчик)"),
        "builder": need("Лицо, осуществляющее строительство"),
        "designer": need("Лицо, осуществляющее подготовку проектной документации"),
        "performer_default": need("Лицо, выполнившее работы (по умолчанию)"),
        "copies_default": s(p.get("Количество экземпляров (по умолчанию)")) or "2",
        "out_dir": s(p.get("Папка для готовых актов")) or "Акты",
        "name_pattern": s(p.get("Шаблон имени файла")) or "АОСР_{номер}_{дата}",
    }
    return proj

def read_people(ws):
    people = []
    for i, row in enumerate(ws.iter_rows(min_row=2, max_col=6, values_only=True), start=2):
        role, org, pos, fio, order, nrs = (s(x) for x in row)
        if not any([role, org, pos, fio]):
            continue
        if not fio:
            warn(f"Лист «2.Участники», строка {i}: не указано ФИО — участник пропущен.")
            continue
        if not role:
            warn(f"Лист «2.Участники», строка {i} ({fio}): не выбрана роль — участник пропущен.")
            continue
        people.append({"role": role, "org": org, "pos": pos, "fio": fio, "order": order, "nrs": nrs})
    if not people:
        die("На листе «2.Участники» нет ни одного участника комиссии.",
            "заполните хотя бы представителей застройщика и лица, выполнившего работы.")
    return people

def read_materials(ws):
    mats = {}
    for i, row in enumerate(ws.iter_rows(min_row=2, max_col=6, values_only=True), start=2):
        code, name, dtype, num, ddate, note = row
        code, name, dtype, num = s(code), s(name), s(dtype), s(num)
        if not any([code, name]):
            continue
        if not code:
            warn(f"Лист «3.Материалы», строка {i}: нет кода — материал недоступен для ссылок.")
            continue
        if code in mats:
            warn(f"Лист «3.Материалы», строка {i}: код «{code}» уже встречался — использую первую запись.")
            continue
        mats[code] = {"name": name, "dtype": dtype, "num": num, "date": as_date(ddate)}
    return mats

def read_acts(ws):
    acts = []
    for i, row in enumerate(ws.iter_rows(min_row=2, max_col=14, values_only=True), start=2):
        vals = list(row) + [None] * (14 - len(row))
        (num, adate, works, proj_doc, mat_codes, presented,
         dstart, dend, norms, next_works, extra, copies, attach, performer) = vals
        if not any(s(x) for x in [num, works]):
            continue
        acts.append({
            "row": i,
            "num": s(num),
            "date": as_date(adate),
            "works": s(works),
            "proj_doc": s(proj_doc),
            "mat_codes": s(mat_codes),
            "presented": s(presented),
            "dstart": as_date(dstart),
            "dend": as_date(dend),
            "norms": s(norms),
            "next_works": s(next_works),
            "extra": s(extra),
            "copies": s(copies),
            "attach": s(attach),
            "performer": s(performer),
        })
    if not acts:
        die("На листе «4.Реестр актов» нет ни одного акта.", "заполните хотя бы одну строку.")
    return acts


def load_all(path):
    """Прочитать книгу целиком: (proj, people, mats, acts)."""
    wb = read_workbook(path)
    proj = read_project(wb["1.Объект"])
    people = read_people(wb["2.Участники"])
    mats = read_materials(wb["3.Материалы"])
    acts = read_acts(wb["4.Реестр актов"])
    return proj, people, mats, acts


# ============================================================
#                    ВАЛИДАЦИЯ
# ============================================================
def validate(acts, mats):
    """Проверить акты; каждому акту записать списки errors/warnings.
    Возвращает (всего ошибок, всего предупреждений)."""
    errors, warnings = 0, 0
    for a in acts:
        where = f"Акт № {a['num'] or '?'} (строка {a['row']})"
        a_err, a_warn = [], []
        if not a["num"]:
            a_err.append("не указан номер акта.")
        if not a["works"]:
            a_err.append("пустое наименование скрытых работ (п.1).")
        if not a["date"]:
            a_err.append("не указана или нераспознана дата акта.")
        if not a["dstart"] or not a["dend"]:
            a_err.append("не заполнены даты начала/окончания работ (п.5).")
        if a["dstart"] and a["dend"] and a["dstart"] > a["dend"]:
            a_err.append("дата начала работ позже даты окончания.")
        if a["date"] and a["dend"] and a["date"] < a["dend"]:
            a_err.append("акт датирован раньше окончания работ — стройконтроль такое не пропустит.")
        # материалы
        codes = [c.strip() for c in re.split(r"[,;]", a["mat_codes"]) if c.strip()]
        a["materials"] = []
        for c in codes:
            if c not in mats:
                a_err.append(f"материал с кодом «{c}» не найден на листе «3.Материалы».")
            else:
                m = mats[c]
                a["materials"].append(m)
                if m["date"] and a["date"] and m["date"] > a["date"]:
                    a_warn.append(f"документ на материал «{c}» датирован позже акта ({d_short(m['date'])}).")
        if not codes and not a["mat_codes"]:
            a_warn.append("не указаны материалы (п.3) — в акте будет прочерк.")
        if not a["norms"]:
            a_warn.append("не указаны нормативные документы (п.6).")
        if not a["next_works"]:
            a_warn.append("не указаны последующие работы (п.7).")
        a["errors"], a["warnings"] = a_err, a_warn
        for m in a_err:
            err(f"{where}: {m}")
        for m in a_warn:
            warn(f"{where}: {m}")
        errors += len(a_err)
        warnings += len(a_warn)
    return errors, warnings


# ============================================================
#                    ГЕНЕРАЦИЯ DOCX
# ============================================================
FONT = "Times New Roman"

def set_base_styles(doc):
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(11)
    st.paragraph_format.space_after = Pt(2)
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin, sec.right_margin = Mm(25), Mm(12)
    sec.top_margin, sec.bottom_margin = Mm(15), Mm(15)

def para(doc, text="", bold=False, size=11, align=None, italic=False, gray=False, space_after=2):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    if align is not None:
        p.alignment = align
    r = p.add_run(text)
    r.font.name = FONT
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    if gray:
        r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
    return p

def labeled(doc, label, value, caption=None):
    """Строка формы: метка + подчёркнутое значение, под ним серая расшифровка."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r1 = p.add_run(label + " ")
    r1.font.name = FONT; r1.font.size = Pt(11)
    val = value if value else "—"
    r2 = p.add_run(val)
    r2.font.name = FONT; r2.font.size = Pt(11)
    r2.underline = True
    if caption:
        para(doc, f"({caption})", size=8, italic=True, gray=True,
             align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    else:
        p.paragraph_format.space_after = Pt(4)

def numbered_item(doc, num_text, body, caption=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r1 = p.add_run(num_text + " ")
    r1.font.name = FONT; r1.font.size = Pt(11); r1.bold = False
    r2 = p.add_run(body if body else "—")
    r2.font.name = FONT; r2.font.size = Pt(11); r2.underline = True
    if caption:
        para(doc, f"({caption})", size=8, italic=True, gray=True,
             align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
    else:
        p.paragraph_format.space_after = Pt(6)

def materials_text(a):
    if not a["materials"]:
        return a["mat_codes"] or ""
    parts = []
    for m in a["materials"]:
        bits = [m["name"]]
        doc_bits = " ".join(x for x in [m["dtype"], ("№ " + m["num"]) if m["num"] else ""] if x)
        if doc_bits:
            d = f" от {d_short(m['date'])}" if m["date"] else ""
            bits.append(f"({doc_bits}{d})")
        parts.append(" ".join(bits))
    return "; ".join(parts)

def signatures(doc, people):
    para(doc, "")
    for p_ in people:
        para(doc, p_["role"] + ":", size=10, space_after=2)
        t = doc.add_table(rows=1, cols=2)
        t.alignment = WD_TABLE_ALIGNMENT.LEFT
        t.autofit = False
        widths = (Mm(123), Mm(45))
        cells = t.rows[0].cells
        left = cells[0].paragraphs[0]
        info = ", ".join(x for x in [p_["pos"], p_["fio"], p_["order"]] if x)
        if p_["nrs"]:
            info += f", НРС № {p_['nrs']}"
        r = left.add_run(info)
        r.font.name = FONT; r.font.size = Pt(11); r.underline = True
        right = cells[1].paragraphs[0]
        right.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r2 = right.add_run("_______________")
        r2.font.name = FONT; r2.font.size = Pt(11)
        for c, w in zip(cells, widths):
            c.width = w
        cap = doc.add_table(rows=1, cols=2)
        cap.autofit = False
        cc = cap.rows[0].cells
        for c, w in zip(cc, widths):
            c.width = w
        cp1 = cc[0].paragraphs[0]; cp1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rr = cp1.add_run("(должность, фамилия, инициалы, реквизиты документа о полномочиях)")
        rr.font.name = FONT; rr.font.size = Pt(8); rr.italic = True
        rr.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
        cp2 = cc[1].paragraphs[0]; cp2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rr2 = cp2.add_run("(подпись)")
        rr2.font.name = FONT; rr2.font.size = Pt(8); rr2.italic = True
        rr2.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
        para(doc, "", space_after=4)

def build_act(a, proj, people):
    doc = Document()
    set_base_styles(doc)

    labeled(doc, "Объект капитального строительства:",
            ", ".join(x for x in [proj["object_name"], proj["object_addr"]] if x),
            "наименование, почтовый или строительный адрес объекта капитального строительства")
    labeled(doc, "Застройщик (технический заказчик):", proj["developer"],
            "наименование, ОГРН, ИНН, место нахождения, СРО")
    labeled(doc, "Лицо, осуществляющее строительство:", proj["builder"],
            "наименование, ОГРН, ИНН, место нахождения, СРО")
    labeled(doc, "Лицо, осуществляющее подготовку проектной документации:", proj["designer"],
            "наименование, ОГРН, ИНН, место нахождения, СРО")
    performer = a["performer"] or proj["performer_default"]
    labeled(doc, "Лицо, выполнившее работы, подлежащие освидетельствованию:", performer,
            "наименование, ОГРН, ИНН, место нахождения, СРО")

    para(doc, "")
    para(doc, "АКТ", bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    para(doc, "освидетельствования скрытых работ", bold=True, size=12,
         align=WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    para(doc, f"№ {a['num']}    {d_long(a['date'])}", size=12,
         align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)

    para(doc, "Представители:", space_after=2)
    for p_ in people:
        info = ", ".join(x for x in [p_["org"], p_["pos"], p_["fio"], p_["order"]] if x)
        if p_["nrs"]:
            info += f", НРС № {p_['nrs']}"
        pp = doc.add_paragraph()
        pp.paragraph_format.space_after = Pt(0)
        r1 = pp.add_run(p_["role"] + " — ")
        r1.font.name = FONT; r1.font.size = Pt(11)
        r2 = pp.add_run(info)
        r2.font.name = FONT; r2.font.size = Pt(11); r2.underline = True
    para(doc, "произвели осмотр работ, выполненных " + (performer or "—") +
         ", и составили настоящий акт о нижеследующем:", space_after=6)

    numbered_item(doc, "1. К освидетельствованию предъявлены следующие работы:", a["works"],
                  "наименование скрытых работ")
    numbered_item(doc, "2. Работы выполнены по проектной документации:", a["proj_doc"],
                  "номер, другие реквизиты чертежа, наименование проектной и/или рабочей документации")
    numbered_item(doc, "3. При выполнении работ применены:", materials_text(a),
                  "наименование строительных материалов (изделий) со ссылкой на документы, подтверждающие качество и безопасность")
    numbered_item(doc, "4. Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям:",
                  a["presented"],
                  "исполнительные схемы и чертежи, результаты экспертиз, обследований, лабораторных и иных испытаний")
    p5 = doc.add_paragraph(); p5.paragraph_format.space_after = Pt(6)
    r = p5.add_run("5. Даты: начала работ "); r.font.name = FONT; r.font.size = Pt(11)
    r = p5.add_run(d_long(a["dstart"])); r.font.name = FONT; r.font.size = Pt(11); r.underline = True
    r = p5.add_run(";   окончания работ "); r.font.name = FONT; r.font.size = Pt(11)
    r = p5.add_run(d_long(a["dend"])); r.font.name = FONT; r.font.size = Pt(11); r.underline = True
    numbered_item(doc, "6. Работы выполнены в соответствии с:", a["norms"],
                  "наименования и пункты технических регламентов, иных нормативных правовых актов, разделы проектной документации")
    numbered_item(doc, "7. Разрешается производство последующих работ:", a["next_works"],
                  "наименование работ, конструкций, участков сетей инженерно-технического обеспечения")
    labeled(doc, "Дополнительные сведения:", a["extra"] or "—")
    copies = a["copies"] or proj["copies_default"]
    para(doc, f"Акт составлен в {copies} экземплярах.", space_after=2)
    labeled(doc, "Приложения:", a["attach"] or "—")

    para(doc, "Подписи:", bold=True, space_after=2)
    signatures(doc, people)
    return doc


def act_filename(a, proj):
    name = proj["name_pattern"]
    name = name.replace("{номер}", a["num"])
    name = name.replace("{дата}", d_short(a["date"]) if a["date"] else "без_даты")
    name = name.replace("{работы}", a["works"][:40])
    return sanitize_filename(name) + ".docx"


def generate(acts, proj, people, out_dir=None):
    """Сгенерировать .docx для каждого акта. Возвращает (список файлов, папка)."""
    check_libs()
    out_dir = out_dir or proj["out_dir"]
    os.makedirs(out_dir, exist_ok=True)
    made = []
    for a in acts:
        fname = act_filename(a, proj)
        path = os.path.join(out_dir, fname)
        try:
            build_act(a, proj, people).save(path)
        except PermissionError:
            die(f"Нет доступа к файлу {path}.", "закройте его в Word и запустите снова.")
        ok(f"Акт № {a['num']} → {path}")
        made.append({"num": a["num"], "file": fname, "path": os.path.abspath(path)})
    return made, os.path.abspath(out_dir)


# ============================================================
#                    MAIN
# ============================================================
def run_cli(args):
    say("=" * 64)
    say("   ГЕНЕРАТОР АКТОВ АОСР  ·  форма по приказу РТН № 344")
    say("=" * 64)

    title("Чтение данных")
    proj, people, mats, acts = load_all(args.file)
    ok(f"Объект: {proj['object_name'] or '(не указан)'}")
    ok(f"Участников комиссии: {len(people)};  материалов в реестре: {len(mats)};  актов: {len(acts)}")

    if args.akt is not None:
        acts = [a for a in acts if a["num"] == str(args.akt).strip()]
        if not acts:
            die(f"Акт № {args.akt} не найден в реестре.",
                "проверьте номер в колонке «№ акта» листа «4.Реестр актов».")

    title("Проверка данных")
    errors, warnings = validate(acts, mats)
    if errors:
        die(f"Найдено критических ошибок: {errors}. Файлы не созданы.",
            "ошибки перечислены выше с номерами строк Excel.")
    if warnings:
        warn(f"Предупреждений: {warnings}. Это не блокирует генерацию, но лучше проверить.")
    else:
        ok("Все проверки пройдены.")

    title("Генерация актов")
    made, out_abs = generate(acts, proj, people, out_dir=args.out or None)

    say("\n" + "=" * 64)
    say(f"   ГОТОВО: создано актов — {len(made)}. Папка: {out_abs}")
    say("   Откройте файлы в Word, проверьте и распечатайте на подпись.")
    say("=" * 64)


def main():
    ap = argparse.ArgumentParser(description="Генератор актов АОСР из Excel", add_help=True)
    ap.add_argument("--file", default="АОСР_данные.xlsx", help="файл с данными (по умолчанию АОСР_данные.xlsx)")
    ap.add_argument("--akt", default=None, help="сгенерировать только акт с указанным номером")
    ap.add_argument("--out", default=None, help="папка для готовых актов (переопределяет настройку из Excel)")
    args = ap.parse_args()
    try:
        run_cli(args)
    except DataError as e:
        err(e.msg)
        if e.hint:
            say(f"       Подсказка: {e.hint}")
        say("\nГенерация остановлена. Исправьте данные и запустите снова.")
        sys.exit(1)

if __name__ == "__main__":
    main()
