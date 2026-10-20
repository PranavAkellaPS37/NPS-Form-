#!/usr/bin/env python3
"""
strings_csv.py: give the on-screen texts to translators as a spreadsheet, and bring them back
==============================================================================================

WHAT THIS IS FOR
    Every word the form shows lives in web/i18n/strings.json, in six
    languages. Editing that file by hand is fiddly for translators, so this
    script turns it into a spreadsheet file (CSV) that opens in Google Sheets
    or Excel, and later copies the finished translations back.

    IMPORTANT: web/i18n/strings.json is the MASTER COPY (the "source of
    truth"). The CSV is only a temporary working file. Git ignores every .csv
    file on purpose (see .gitignore), so the CSV is never saved in the
    project. Delete it once its translations have been imported.

HOW TO RUN (in Terminal, from the project folder that contains web/ and scripts/)
    1. Make the spreadsheet:
           python3 scripts/strings_csv.py export
       This writes translations.csv with the columns key, en, hi, ta, te, kn, ml
       (the language columns follow the order in survey.json).

       Options:
           --out FILE            write FILE instead of translations.csv
           --only-untranslated   only rows that still need translating
           --lang ta             only English plus one language (for one translator)
           --overwrite           replace FILE if it already exists
       Example, a sheet for the Tamil translator with only what is left to do:
           python3 scripts/strings_csv.py export --lang ta --only-untranslated --out tamil.csv

    2. The translators fill in their column.
           Google Sheets: File > Import > Upload.  Excel: just open the file.
       Rules for translators:
           - Replace the WHOLE cell, including the "[TRANSLATE]" tag.
           - Keep {s} and {n} exactly as they are (the form puts numbers there).
           - Do not change the "key" column, and do not add or delete rows.
       Save it as CSV again:
           Google Sheets: File > Download > Comma-separated values (.csv)
           Excel: File > Save As > "CSV UTF-8 (Comma delimited)"
                  (NOT plain "CSV": that turns Indian scripts into ????)

    3. Preview what would change (this writes nothing):
           python3 scripts/strings_csv.py import translations.csv --dry-run
    4. Save the changes into strings.json:
           python3 scripts/strings_csv.py import translations.csv
    5. Run the safety check:
           python3 scripts/check_config.py

WHAT IT READS AND WRITES
    export   reads  web/config/survey.json (the list of languages) and
                    web/i18n/strings.json
             writes the CSV file only (never strings.json)
    import   reads  the CSV file, web/config/survey.json, web/i18n/strings.json
             writes web/i18n/strings.json (not with --dry-run), and first saves
                    a copy of the old version in local_data/backups/
                    (git ignores that folder)

SAFETY NOTES
    - import never adds or deletes texts. Rows whose key is not in
      strings.json are skipped with a warning. Empty cells are ignored, so
      they can never wipe out a translation.
    - Cells that still start with [TRANSLATE] are never imported (they hold
      no translation, and an old sheet must not undo newer work).
    - Cells that look damaged ("????" instead of letters, which happens when
      Excel saves as plain CSV) are not imported.
    - If a translation drops or adds a placeholder such as {s}, it is still
      imported, but you get a loud warning so you can fix it.
    - strings.json is written to a temporary file first and then swapped in
      in one step, so a crash or power cut can never leave a half-written
      file. If you ever see a file named .strings-....tmp in web/i18n, it is
      a leftover from an interrupted run and can be deleted.
    - The CSV may contain only texts, never partner data.
    - Needs Python 3.11 or newer, standard library only. No internet needed.
"""

from __future__ import annotations  # lets the type hints below work on older Pythons too

import argparse
import copy
import csv
import io
import json
import os
import re
import shlex
import sys
import tempfile
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

SURVEY_FILE = "web/config/survey.json"
STRINGS_FILE = "web/i18n/strings.json"
BACKUP_FOLDER = "local_data/backups"
DEFAULT_CSV = "translations.csv"

# A text that still starts with this tag has not been translated yet.
# (Same rule as the form itself, web/js/core.js.)
TRANSLATE_TAG = "[TRANSLATE]"
# Placeholders such as {s} and {n} are replaced by numbers on screen.
PLACEHOLDER_RE = re.compile(r"\{[A-Za-z0-9_]+\}")
# Excel's plain "CSV" format cannot store Indian scripts and writes ?? instead.
DAMAGED_RE = re.compile(r"\?\?")

LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
    "ml": "Malayalam", "mr": "Marathi", "bn": "Bengali", "gu": "Gujarati",
    "pa": "Punjabi", "or": "Odia", "as": "Assamese", "ur": "Urdu",
}


class Stop(Exception):
    """A problem the user can fix. Printed as a plain message, without the
    technical details Python normally shows."""


# =============================================================================
# Small helpers
# =============================================================================

def language_name(code: str) -> str:
    """'Tamil (ta)'."""
    return f"{LANGUAGE_NAMES.get(code, code)} ({code})"


def needs_translation(text) -> bool:
    """The form's own rule: missing, empty, or still starting with [TRANSLATE]."""
    return not isinstance(text, str) or not text.strip() or text.lstrip().startswith(TRANSLATE_TAG)


def clean_cell(cell: str) -> str:
    """Trim spaces, and store letters in one standard form (Unicode NFC).

    Why NFC: some programs store the same Tamil or Malayalam letter as two
    pieces instead of one. It looks identical, but without this a sheet that
    was only opened and saved could look "changed"."""
    return unicodedata.normalize("NFC", cell.strip())


def for_terminal(path: Path) -> str:
    """A path the user can copy into a command (quoted if it has spaces)."""
    try:
        shown = str(path.resolve().relative_to(Path.cwd().resolve()))
    except ValueError:
        shown = str(path.resolve())
    return shlex.quote(shown)


def placeholders(text: str) -> set:
    return set(PLACEHOLDER_RE.findall(text))


def plural(count: int, word: str) -> str:
    """'1 text', '3 texts'."""
    return f"{count} {word if count == 1 else word + 's'}"


# =============================================================================
# Reading and writing the project files
# =============================================================================

def find_root(root_arg) -> Path:
    """The project folder: --root if given, otherwise the folder above scripts/."""
    root = Path(root_arg).expanduser().resolve() if root_arg else Path(__file__).resolve().parent.parent
    if not (root / STRINGS_FILE).is_file():
        raise Stop(f"Could not find {STRINGS_FILE} inside {root}. Point --root at the project folder "
                   "(the one that contains web/ and scripts/), or leave --root out.")
    return root


def read_json(root: Path, rel: str):
    """Read a settings file. Returns (content, the file's exact bytes)."""
    path = root / rel
    if not path.is_file():
        raise Stop(f"Could not find {rel} in {root}.")
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise Stop(f"{rel} is not saved as UTF-8 text. Run python3 scripts/check_config.py for details.") from None
    repeated: list = []
    try:
        data = json.loads(text, object_pairs_hook=remember_repeated_names(repeated))
    except json.JSONDecodeError as problem:
        raise Stop(f"{rel} is not valid JSON right now (line {problem.lineno}, column {problem.colno}). "
                   "Run python3 scripts/check_config.py: it shows exactly what is wrong. Fix that "
                   "first, then try again. Nothing was changed.") from None
    if repeated:
        raise Stop(f'{rel} has the name "{repeated[0]}" twice inside the same {{ }} group. Fix that '
                   "first (python3 scripts/check_config.py shows where); otherwise one of the two "
                   "would be silently lost. Nothing was changed.")
    if not isinstance(data, dict):
        raise Stop(f"{rel} must be one group in curly brackets {{ ... }}. Run python3 scripts/check_config.py.")
    return data, raw


def remember_repeated_names(repeated: list):
    """JSON quietly keeps only the last of two entries with the same name."""
    def build_group(pairs):
        group = {}
        for name, value in pairs:
            if name in group:
                repeated.append(name)
            group[name] = value
        return group
    return build_group


def language_codes(root: Path) -> list:
    """The language codes from survey.json, in their order there."""
    survey, _ = read_json(root, SURVEY_FILE)
    languages = survey.get("languages")
    codes = []
    if isinstance(languages, list):
        codes = [lang["code"] for lang in languages
                 if isinstance(lang, dict) and isinstance(lang.get("code"), str) and lang["code"].strip()]
    if not codes:
        raise Stop('survey.json has no usable "languages" list. Run python3 scripts/check_config.py to see what is wrong.')
    return codes


def render_strings(data: dict) -> str:
    """strings.json in its exact standard layout: one line per text, so that
    a change shows up in git as a change to just that line."""
    items = list(data.items())
    lines = ["{"]
    for number, (key, value) in enumerate(items, start=1):
        comma = "," if number < len(items) else ""
        lines.append(f"  {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}{comma}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def write_atomically(path: Path, text: str) -> None:
    """Write to a temporary file next to the real one, then swap it in with
    one step (os.replace). A crash can therefore never leave a half-written
    strings.json: it is either the old version or the new one."""
    handle, temp_name = tempfile.mkstemp(prefix=".strings-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as temp:
            temp.write(text)
            temp.flush()
            os.fsync(temp.fileno())
        os.chmod(temp_name, path.stat().st_mode & 0o777)   # keep the old file's permissions
        os.replace(temp_name, path)
    except BaseException:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
        raise


def save_backup(root: Path, raw: bytes) -> Path:
    """Keep a copy of the old strings.json in local_data/backups/ (git-ignored)."""
    folder = root / BACKUP_FOLDER
    folder.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = folder / f"strings-{stamp}.json"
    number = 2
    while backup.exists():
        backup = folder / f"strings-{stamp}-{number}.json"
        number += 1
    backup.write_bytes(raw)
    return backup


# =============================================================================
# export: strings.json -> CSV
# =============================================================================

def export_csv(root: Path, args) -> int:
    codes = language_codes(root)
    strings, _ = read_json(root, STRINGS_FILE)
    lang = chosen_language(args.lang, codes)
    columns = codes if lang is None else list(dict.fromkeys(["en", lang]))
    check_langs = codes if lang is None else [lang]
    rows, broken = [], []
    for key, value in strings.items():
        if key.startswith("_"):
            continue   # notes for humans, not texts
        if not isinstance(value, dict):
            broken.append(key)
            continue
        if args.only_untranslated and not any(needs_translation(value.get(c)) for c in check_langs):
            continue
        rows.append([key] + [value.get(c) if isinstance(value.get(c), str) else "" for c in columns])
    if broken:
        print(f"Warning: skipped {plural(len(broken), 'text')} that are not in the usual format "
              f"(run python3 scripts/check_config.py): {', '.join(broken[:5])}")
    if not rows:
        who = language_name(lang) if lang else "every language"
        reason = f"every text is already translated for {who}" if args.only_untranslated else "strings.json has no texts"
        print(f"Nothing to export: {reason}. No file was written.")
        return 0
    out = Path(args.out).expanduser()
    write_csv(out, ["key"] + columns, rows, args.overwrite)
    print_export_done(out, len(rows), columns, lang, args.only_untranslated)
    return 0


def chosen_language(lang, codes: list):
    if lang is None:
        return None
    match = next((code for code in codes if code.lower() == lang.strip().lower()), None)
    if match is None:
        raise Stop(f'"{lang}" is not one of the languages in survey.json. Use one of: {", ".join(codes)}.')
    return match


def write_csv(out: Path, header: list, rows: list, overwrite: bool) -> None:
    if out.is_dir():
        raise Stop(f"{out} is a folder. Give a file name with --out, for example --out translations.csv.")
    if out.exists() and not overwrite:
        raise Stop(f"{out} already exists, and it may hold translators' work. Import it first, or "
                   "rename or delete it, or choose another name with --out, or add --overwrite "
                   "to replace it.")
    if not out.parent.is_dir():
        raise Stop(f"The folder {out.parent} does not exist. Choose another place with --out.")
    # utf-8-sig adds an invisible marker (BOM) at the start. Without it, Excel
    # shows Hindi, Tamil and the other scripts as garbled characters.
    with open(out, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def print_export_done(out: Path, count: int, columns: list, lang, only_untranslated: bool) -> None:
    what = "texts"
    if only_untranslated:
        what = f"texts that still need {language_name(lang)}" if lang else "texts that still need translating"
    shown = for_terminal(out)
    print(f"Done: wrote {count} {what} to {out.resolve()}")
    print(f"Columns: key, {', '.join(columns)}")
    print()
    print("Next steps:")
    print("  1. Open the file in Google Sheets (File > Import > Upload) or in Excel.")
    print("  2. Translators fill in their language column:")
    print("       - replace the WHOLE cell, including the [TRANSLATE] tag;")
    print("       - keep {s} and {n} exactly as they are (the form puts numbers there);")
    print("       - do not change the key column, and do not add or delete rows.")
    print("  3. Save it as CSV again:")
    print("       Google Sheets: File > Download > Comma-separated values (.csv)")
    print('       Excel: File > Save As > "CSV UTF-8 (Comma delimited)"  (plain "CSV" turns Indian scripts into ????)')
    print("  4. Preview the changes (this writes nothing):")
    print(f"       python3 scripts/strings_csv.py import {shown} --dry-run")
    print("     then save them:")
    print(f"       python3 scripts/strings_csv.py import {shown}")
    print("  5. Check everything:  python3 scripts/check_config.py")
    print()
    print("Remember: this CSV is only a temporary working file. Git ignores CSV files on purpose, so it")
    print("is never saved in the project. web/i18n/strings.json stays the master copy (the source of")
    print("truth). Delete the CSV once its translations are imported.")


# =============================================================================
# import: CSV -> strings.json
# =============================================================================

@dataclass
class Change:
    row: int
    lang: str
    key: str
    old: object
    new: str


@dataclass
class ImportResult:
    updated: dict                                      # strings.json with the changes applied
    changes: list = field(default_factory=list)        # Change objects
    warnings: list = field(default_factory=list)
    placeholder_problems: list = field(default_factory=list)
    rows_read: int = 0
    unknown_keys: int = 0
    damaged: int = 0


def import_csv(root: Path, args) -> int:
    codes = language_codes(root)
    strings, original_raw = read_json(root, STRINGS_FILE)
    csv_path = Path(args.csv_file).expanduser()
    header, rows, delimiter = read_csv_table(csv_path)
    columns, column_notes = map_columns(header, codes)
    result = apply_rows(strings, rows, columns, codes)
    result.warnings = column_notes + result.warnings
    print_import_report(csv_path, delimiter, columns, result)
    if not result.changes:
        print("Nothing to update: every filled-in cell already matches strings.json. Nothing was written.")
        return 0
    if args.dry_run:
        print("DRY RUN: nothing was written. To save these changes, run the same command without --dry-run:")
        print(f"    python3 scripts/strings_csv.py import {for_terminal(csv_path)}")
        return 0
    save_import(root, strings, original_raw, result, csv_path)
    return 0


def read_csv_table(path: Path):
    """Read the CSV. Returns (header row, other rows, the separator used)."""
    if not path.is_file():
        raise Stop(f"Could not find the file {path}. Check the name and the folder. Tip: drag the file "
                   "from Finder into the Terminal window to paste its full path.")
    text = decode_csv(path.read_bytes(), path)
    delimiter = detect_delimiter(text)
    try:
        rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))
    except csv.Error as problem:
        raise Stop(f"{path.name} could not be read as a CSV file ({problem}). Save it again as CSV from "
                   "Google Sheets or Excel and try again. Nothing was changed.") from None
    if not rows:
        raise Stop(f"{path.name} is empty. Nothing was changed.")
    header = [cell.strip().lstrip("\ufeff") for cell in rows[0]]
    if not header or header[0].lower() != "key":
        raise Stop(f'The first row of {path.name} must be the header row, starting with a column called '
                   '"key" (as written by the export). Nothing was changed.')
    return header, rows[1:], delimiter


def decode_csv(raw: bytes, path: Path) -> str:
    """CSV text from the file's bytes. Accepts UTF-8 with or without the
    invisible BOM marker, and the UTF-16 that Excel's "Unicode Text" uses."""
    try:
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            return raw.decode("utf-16")
        return raw.decode("utf-8-sig")
    except UnicodeError:
        raise Stop(f"{path.name} is not saved as UTF-8, so the Indian-language letters in it are damaged. "
                   'Save it again: in Excel use File > Save As > "CSV UTF-8 (Comma delimited)"; in Google '
                   "Sheets use File > Download > Comma-separated values. Nothing was changed.") from None


def detect_delimiter(text: str) -> str:
    """Normally a comma. Excel in some regions saves with ; instead, and its
    "Unicode Text" format uses tabs. We know the first cell must be "key", so
    try each separator on the header row; if none fits, let Python's csv
    Sniffer guess."""
    first_line = text.split("\n", 1)[0]
    for delimiter in (",", ";", "\t"):
        cells = next(csv.reader([first_line], delimiter=delimiter), [])
        if len(cells) > 1 and cells[0].strip().lstrip("\ufeff").lower() == "key":
            return delimiter
    try:
        return csv.Sniffer().sniff(text[:5000], delimiters=",;\t").delimiter
    except csv.Error:
        return ","


def map_columns(header: list, codes: list):
    """Which column holds which language. Returns ({column number: code}, notes)."""
    by_lower = {code.lower(): code for code in codes}
    columns, notes = {}, []
    for index, name in enumerate(header[1:], start=1):
        if not name.strip():
            continue   # an empty column, e.g. added by the spreadsheet program
        code = by_lower.get(name.strip().lower())
        if code is None:
            notes.append(f'Column "{name}" is not a language in survey.json, so it was ignored.')
        elif code in columns.values():
            raise Stop(f'The column "{name}" appears twice in the header row. Delete one of them and try '
                       "again. Nothing was changed.")
        else:
            columns[index] = code
    if not columns:
        raise Stop(f"The header row has no language columns (expected some of: {', '.join(codes)}). "
                   "Nothing was changed.")
    return columns, notes


def apply_rows(strings: dict, rows: list, columns: dict, codes: list) -> ImportResult:
    """Work out every change, on a copy of strings.json (nothing is written here)."""
    result = ImportResult(updated=copy.deepcopy(strings))
    seen_rows: dict = {}
    for row_number, row in enumerate(rows, start=2):   # row 1 is the header
        key = clean_cell(row[0]) if row else ""
        if not key and not any(cell.strip() for cell in row):
            continue   # a blank line
        result.rows_read += 1
        if not key_is_usable(key, row_number, strings, result):
            continue
        if key in seen_rows:
            result.warnings.append(f'Row {row_number}: "{key}" is also in row {seen_rows[key]}; the later row wins.')
        seen_rows[key] = row_number
        for index, lang in columns.items():
            cell = clean_cell(row[index]) if index < len(row) else ""
            apply_cell(result, row_number, key, lang, cell, codes)
    check_placeholders(result, codes)
    english = [change for change in result.changes if change.lang == "en"]
    if english:
        result.warnings.append(f"{plural(len(english), 'English text')} changed. English is the source for every "
                               "translation: if this sheet is older than your latest edits to strings.json, "
                               "do NOT import it; export a fresh sheet instead.")
    return result


def key_is_usable(key: str, row_number: int, strings: dict, result: ImportResult) -> bool:
    if not key:
        result.warnings.append(f"Row {row_number}: the key cell is empty, so the row was skipped.")
        return False
    if key.startswith("_"):
        return False   # notes for humans, never imported
    if key not in strings:
        result.unknown_keys += 1
        result.warnings.append(f'Row {row_number}: "{key}" is not a text in strings.json, so the row was '
                               "skipped. (This tool never adds new texts: add them to strings.json first.)")
        return False
    if not isinstance(strings[key], dict):
        result.warnings.append(f'Row {row_number}: "{key}" is not in the usual format in strings.json, so the '
                               "row was skipped. Run python3 scripts/check_config.py.")
        return False
    return True


def apply_cell(result: ImportResult, row_number: int, key: str, lang: str, cell: str, codes: list) -> None:
    """Use one filled-in cell, unless it is empty, unchanged, untranslated or damaged."""
    if not cell:
        return   # empty cells never delete anything
    entry = result.updated[key]
    current = entry.get(lang)
    if isinstance(current, str) and cell == clean_cell(current):
        return   # unchanged
    where = f'Row {row_number}, {language_name(lang)}, "{key}"'
    if cell.startswith(TRANSLATE_TAG):
        result.warnings.append(f"{where}: still starts with [TRANSLATE], so it was not imported. If the cell "
                               "holds a finished translation, delete the [TRANSLATE] tag in the sheet and "
                               "import again.")
        return
    if DAMAGED_RE.search(cell) and not (isinstance(current, str) and DAMAGED_RE.search(current)):
        result.damaged += 1
        result.warnings.append(f'{where}: looks damaged ("??" where letters should be), so it was not '
                               'imported. This happens when Excel saves as plain "CSV": save as "CSV UTF-8" '
                               "and import again.")
        return
    result.updated[key] = with_language(entry, lang, cell, codes)
    result.changes.append(Change(row_number, lang, key, current, cell))


def with_language(entry: dict, lang: str, text: str, codes: list) -> dict:
    """The entry with one language set. A language that was missing is put in
    its usual place, so the line in strings.json keeps the standard order."""
    if lang in entry:
        updated = dict(entry)
        updated[lang] = text
        return updated
    ordered = {code: (text if code == lang else entry[code]) for code in codes if code in entry or code == lang}
    ordered.update({name: value for name, value in entry.items() if name not in ordered})
    return ordered


def check_placeholders(result: ImportResult, codes: list) -> None:
    """{s} and {n} become numbers on screen, so a finished translation must
    have exactly the same ones as English. Checked after all changes, so an
    English text changed in the same sheet is taken into account."""
    for key in dict.fromkeys(change.key for change in result.changes):
        entry = result.updated[key]
        english = entry.get("en")
        if not isinstance(english, str):
            continue
        changed_langs = {change.lang for change in result.changes if change.key == key}
        to_check = codes if "en" in changed_langs else sorted(changed_langs)
        for lang in to_check:
            text = entry.get(lang)
            if lang == "en" or needs_translation(text) or placeholders(text) == placeholders(english):
                continue
            missing = placeholders(english) - placeholders(text)
            extra = placeholders(text) - placeholders(english)
            problems = ([f"is missing {' '.join(sorted(missing))}"] if missing else []) + \
                       ([f"has {' '.join(sorted(extra))}, which English does not have"] if extra else [])
            result.placeholder_problems.append(
                f'"{key}" in {language_name(lang)} {" and ".join(problems)} (English: {json.dumps(english, ensure_ascii=False)}). '
                "It was imported anyway: correct it in the sheet and import again, or edit strings.json, "
                "otherwise the number will not show correctly on screen.")


def print_import_report(csv_path: Path, delimiter: str, columns: dict, result: ImportResult) -> None:
    separator = {",": "comma", ";": "semicolon", "\t": "tab"}.get(delimiter, repr(delimiter))
    print(f"Reading {csv_path.resolve()}")
    print(f"  {result.rows_read} rows ({separator}-separated). Language columns: {', '.join(columns.values())}.")
    print()
    print(f"Changes ({len(result.changes)}):")
    if not result.changes:
        print("  None.")
    key_width = max((len(change.key) for change in result.changes), default=0)
    for change in result.changes:
        verb = "updated" if isinstance(change.old, str) else "added"
        line = f"  {change.lang:<4}{change.key:<{key_width}}  {verb}"
        if change.lang == "en":
            line += f"   (English was {json.dumps(change.old, ensure_ascii=False)}, now {json.dumps(change.new, ensure_ascii=False)})"
        print(line)
    print_warnings(result)
    print_totals(result)


def print_warnings(result: ImportResult) -> None:
    if result.warnings:
        print()
        print(f"Warnings ({len(result.warnings)}):")
        for warning in result.warnings:
            print(f"  - {warning}")
    if result.placeholder_problems:
        print()
        print(f"!! PLEASE CHECK: PLACEHOLDERS DO NOT MATCH ENGLISH ({len(result.placeholder_problems)}) !!")
        for problem in result.placeholder_problems:
            print(f"  !! {problem}")


def print_totals(result: ImportResult) -> None:
    per_lang: dict = {}
    for change in result.changes:
        per_lang[change.lang] = per_lang.get(change.lang, 0) + 1
    by_lang = ", ".join(f"{language_name(lang)}: {count}" for lang, count in per_lang.items())
    print()
    problems = len(result.placeholder_problems)
    print(f"Total: {plural(len(result.changes), 'text')} to update" + (f" ({by_lang})" if by_lang else "") + ". "
          f"{plural(result.unknown_keys, 'unknown key')} skipped. {plural(len(result.warnings), 'warning')}"
          + (f", {plural(problems, 'placeholder problem')}" if problems else "") + ".")
    print()


def save_import(root: Path, strings: dict, original_raw: bytes, result: ImportResult, csv_path: Path) -> None:
    path = root / STRINGS_FILE
    text = render_strings(result.updated)
    json.loads(text)   # safety net: never write something that is not valid JSON
    backup = save_backup(root, original_raw)
    write_atomically(path, text)
    print(f"Saved {STRINGS_FILE}: {plural(len(result.changes), 'text')} updated.")
    print(f"A copy of the previous version is in {backup.relative_to(root)} (git ignores it).")
    if render_strings(strings).encode("utf-8") != original_raw:
        print("Note: strings.json was also rewritten in the standard layout (one line per text), so a few")
        print("lines may look different in a comparison even where no text changed.")
    print()
    print("Next:")
    print("  1. Check everything:  python3 scripts/check_config.py")
    print(f"  2. Delete {csv_path.name} when you no longer need it (it is only a temporary working file).")


# =============================================================================
# Command line
# =============================================================================

def parse_args(argv):
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--root", metavar="PATH",
                        help="project folder (the one that contains web/). Default: the project this script belongs to.")
    parser = argparse.ArgumentParser(
        prog="python3 scripts/strings_csv.py",
        description="Move the on-screen texts between web/i18n/strings.json and a CSV file for translators.",
        epilog="Examples:\n"
               "  python3 scripts/strings_csv.py export\n"
               "  python3 scripts/strings_csv.py export --lang ta --only-untranslated --out tamil.csv\n"
               "  python3 scripts/strings_csv.py import translations.csv --dry-run\n"
               "  python3 scripts/strings_csv.py import translations.csv",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", metavar="export | import")
    export = commands.add_parser("export", parents=[common], help="write the texts to a CSV file for translators")
    export.add_argument("--out", default=DEFAULT_CSV, metavar="FILE", help=f"file to write (default: {DEFAULT_CSV})")
    export.add_argument("--only-untranslated", action="store_true",
                        help="only rows that still need translating (for --lang, or for any language)")
    export.add_argument("--lang", metavar="CODE", help="only English plus this language, e.g. ta")
    export.add_argument("--overwrite", action="store_true", help="replace the file if it already exists")
    importer = commands.add_parser("import", parents=[common], help="copy filled-in translations back into strings.json")
    importer.add_argument("csv_file", metavar="FILE", help="the CSV file with the translations")
    importer.add_argument("--dry-run", action="store_true", help="only show what would change; write nothing")
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        raise Stop('Say what to do: "export" (make the spreadsheet) or "import FILE" (bring it back).')
    return args


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:   # never crash on a terminal that cannot show some characters
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        args = parse_args(argv)
        root = find_root(args.root)
        return export_csv(root, args) if args.command == "export" else import_csv(root, args)
    except Stop as problem:
        print()
        print(f"Stopped: {problem}")
        return 1
    except Exception as problem:   # a bug in this script, not a mistake by the user
        print()
        print("Sorry: strings_csv.py ran into something it did not expect. strings.json is only ever")
        print("replaced in one step, so it is either unchanged or fully updated; run")
        print("python3 scripts/check_config.py to be sure. Please send this line to whoever maintains the scripts:")
        print(f"    {type(problem).__name__}: {problem}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
