#!/usr/bin/env python3
"""
==============================================================================
 generate_links.py  -  Valmo Partner Pulse: make every DC's personal survey link
==============================================================================

WHAT THIS FILE IS FOR
  Every partner (DC) gets a personal survey link, shaped like this:

    https://pranavakellaps37.github.io/NPS-Form-/?dc=DC-DEMO-001&t=<token>&round=2026-R1&lang=hi

    dc     the DC's id.
    t      the "token": a 22-character code that proves the link is genuine.
           It is made from the DC id, the round and the LINK SECRET, with the
           formula in docs/submission-format.md (section 5). The live backend
           checks it, so nobody can answer as another DC by editing a link.
    round  the survey round, for example 2026-R1.
    lang   optional: opens the survey straight in that language.
    mock   only in TEST links, made for the test server on this Mac (a
           --base-url of localhost or 127.0.0.1): &mock=1 keeps the form in
           test mode, so the link reaches the test server even after the form
           has been connected to the live backend.

  The normal way to make links is the control panel in the Google Sheet
  (Partner Pulse > Generate links...). This script is the OFFLINE
  alternative. It makes exactly the same links on this Mac, from a CSV file
  (a spreadsheet saved as plain text). Use it when the DC list is not in the
  Sheet's DCs tab, or to make links for a few test DCs.

HOW TO RUN IT
  1. Save the DC list as a CSV file OUTSIDE this project folder (it is
     partner data), for example in Documents. Its first row must hold the
     column names:
       dc_id                   Required. The DC's id, for example DC-DEMO-001.
                               Only letters, digits, "-", "_" or ".", at most
                               64 characters. Capital letters matter.
       language  (or lang)     Optional. A language code from
                               web/config/survey.json: en, hi, ta, te, kn or
                               ml. The link then opens the survey in that
                               language. Leave it empty to let the partner
                               choose on the first screen. A code that is not
                               offered is left out of the link (not refused),
                               as in the control panel.
       dc_name, state, region  Optional. Copied into the result, to help
                               whoever sends the links.
       active                  Optional. Read like the control panel's DCs
                               tab: empty, TRUE, yes or 1 = make a link;
                               FALSE, no, 0 (anything else) = skip this DC.
     Other columns are ignored. A DC listed twice gets one link (first row).
     From Excel: File > Save As > "CSV UTF-8". From Google Sheets:
     File > Download > Comma-separated values (.csv).
     A fake example to try: sample_data/dcs_fake.csv

  2. Have the LINK SECRET ready: control panel > Links > "Show the link
     secret" (in the box "Link secret (for the Python tool)"). It is a
     password: see SAFETY NOTES below.

  3. In Terminal, from the project folder:
         python3 scripts/generate_links.py --dcs ~/Documents/dcs.csv --round 2026-R1
     When it asks for the secret, paste it and press Enter. Nothing appears
     while you paste: that is normal.

  4. Read the summary. It says how many links were made, which rows were
     skipped and why, and where the file was saved.

  Options:
    --dcs FILE       The DC list (CSV). Required.
    --round ROUND    The round id, exactly as in the control panel's Rounds
                     tab, for example 2026-R1. Required.
    --base-url URL   The form's address. Default:
                     https://pranavakellaps37.github.io/NPS-Form-/
                     With localhost or 127.0.0.1 (the test server on this
                     Mac) the links are TEST links: each one ends in &mock=1.
    --out FILE       Where to save the links (must end in .csv). Default:
                     links-<round>.csv in the same folder as the DC list.
    --overwrite      Replace the --out file if it already exists.
  Full help:  python3 scripts/generate_links.py --help

  Try it safely with fake DCs and the local test server's public test secret:
    PULSE_LINK_SECRET=mock-dev-secret-not-for-production python3 scripts/generate_links.py \
        --dcs sample_data/dcs_fake.csv --round DEMO-R1 \
        --base-url http://localhost:8787/ --out ~/Downloads/demo-links.csv
  Then start the test server with  python3 scripts/mock_server.py --strict
  and open any link from ~/Downloads/demo-links.csv in Chrome. (Each link
  ends in &mock=1, so it reaches the test server even after the form has
  been connected to the live backend.)

WHERE THE SECRET COMES FROM (the first one found is used)
  1. The PULSE_LINK_SECRET setting (an "environment variable").
  2. A file named .env in the project folder, containing the line
         PULSE_LINK_SECRET=<the secret>
     git never saves .env (it is listed in .gitignore).
  3. Otherwise the script asks for it, without showing what you paste.
  There is deliberately no --secret option: Terminal remembers every command
  you type, so a secret typed into a command would stay in its history.

WHAT IT READS
  The DC list given with --dcs.
  web/config/survey.json   Only its list of language codes.
  .env                     Only the PULSE_LINK_SECRET line, if the file exists.

WHAT IT WRITES
  One CSV file with the columns  dc_id, dc_name, state, region, language, link
  (the same columns as the control panel's "Download the links (CSV)"). "language" is the
  code used in that row's link (empty = no language in the link). The file is
  saved as UTF-8 with a "BOM" marker, so Excel shows Indian scripts correctly,
  and only your Mac user account can open it.
  It changes nothing else, and it never sends anything over the internet.

SAFETY NOTES
  - The links file is partner data: each link lets someone answer as that DC.
    Keep it private, share it only with whoever sends the links, and delete
    it when the round is over.
  - It refuses to save inside web/ (that folder is published on the
    internet) or sample_data/ (that folder is saved to GitHub).
  - It never prints the secret, the tokens or the links.
  - Never change the secret while links are out: every link made with the
    old secret would stop working.
  - Links made with the local test server's public test secret
    (mock-dev-secret-not-for-production) only work with the test server,
    and only when --base-url is that server (localhost or 127.0.0.1).

EXIT CODE
  0 when the links file was written, 1 when nothing was written (the message
  says why), 2 when the command itself was mistyped.

NEEDS
  Python 3.11 or newer. Nothing to install: it uses only Python's built-in parts.
==============================================================================
"""

from __future__ import annotations

import argparse
import base64
import csv
import getpass
import hashlib
import hmac
import io
import json
import os
import re
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit


# ============================================================================
# Fixed settings (you should not need to change these)
# ============================================================================

# Folders are found from where THIS file lives, so the script behaves the
# same whichever folder you start it from.
REPO_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_DIR / "web"                    # published on the internet
SAMPLE_DATA_DIR = REPO_DIR / "sample_data"    # saved to GitHub (fake data only)
SURVEY_FILE = WEB_DIR / "config" / "survey.json"
ENV_FILE = REPO_DIR / ".env"

SECRET_SETTING = "PULSE_LINK_SECRET"
DEFAULT_BASE_URL = "https://pranavakellaps37.github.io/NPS-Form-/"
# A --base-url on one of these computers means the test server on this Mac:
# the links are then TEST links (they end in &mock=1).
LOCAL_HOSTS = ("localhost", "127.0.0.1")
# The local test server's public secret (docs/submission-format.md, section 5).
MOCK_SECRET = "mock-dev-secret-not-for-production"
# Used only if web/config/survey.json cannot be read.
FALLBACK_LANGUAGES = ["en", "hi", "ta", "te", "kn", "ml"]
# Only to give a helpful hint when someone writes "Hindi" instead of "hi".
LANGUAGE_NAMES = {"english": "en", "hindi": "hi", "tamil": "ta", "telugu": "te",
                  "kannada": "kn", "malayalam": "ml"}

# The same rule as the backend (scripts/mock_server.py and Apps Script) for
# both DC ids and round ids. "." and ".." alone are refused as well.
ID_RULE = re.compile(r"[A-Za-z0-9_.-]{1,64}")
ID_CHARACTER = re.compile(r"[A-Za-z0-9_.-]")
# The live secret made by the control panel's setup: 64 characters of 0-9 a-f.
LIVE_SECRET_SHAPE = re.compile(r"[0-9a-fA-F]{64}")
# Words that mark obviously fake test rounds, as in scripts/check_config.py.
TEST_ROUND_WORDS = re.compile(r"DEMO|TEST|FAKE|SAMPLE|SMOKE", re.IGNORECASE)
# The "active" cell, read exactly like the control panel reads the DCs tab:
# empty counts as active; otherwise only these mean active (FALSE, no, 0 ... do not).
ACTIVE_VALUES = {"true", "yes", "y", "1", "on"}

TOKEN_LENGTH = 22
OUTPUT_COLUMNS = ["dc_id", "dc_name", "state", "region", "language", "link"]
COPIED_COLUMNS = ["dc_name", "state", "region"]
SCREEN_WIDTH = 100


# ============================================================================
# Small building blocks
# ============================================================================

class Stop(Exception):
    """A problem that stops the script before anything is written.
    The text says what happened and what to do, in plain English."""


@dataclass
class DcRow:
    """One row of the DC list."""
    number: int     # the row number a spreadsheet shows (the column names are row 1)
    cells: dict     # column name (tidied, see tidy_column_name) -> text in that cell


@dataclass
class DcList:
    """The DC list as read from the CSV file."""
    rows: list
    language_column: str | None   # "language", "lang" or None


@dataclass
class Outcome:
    """What happened to the rows: links made, rows skipped, and notes."""
    links: list = field(default_factory=list)     # one dict per link, keys = OUTPUT_COLUMNS
    skipped: list = field(default_factory=list)   # (row number, reason)
    notes: list = field(default_factory=list)     # (row number, dc id, note): link made, but look at this


def say(text: str = "", indent: int = 0) -> None:
    """Print a line, wrapped to fit the Terminal window, indented by `indent` spaces."""
    if not text:
        print(flush=True)
        return
    pad = " " * indent
    print(textwrap.fill(text, width=SCREEN_WIDTH, initial_indent=pad, subsequent_indent=pad + "  ",
                        break_long_words=False, break_on_hyphens=False), flush=True)


def printable(value: str, limit: int = 40) -> str:
    """A cell value made safe to show: no line breaks, not too long."""
    shown = value.encode("unicode_escape").decode("ascii") if not value.isprintable() else value
    return shown if len(shown) <= limit else shown[:limit] + "..."


def plural(count: int, word: str) -> str:
    return f"{count} {word}" + ("" if count == 1 else "s")


# ============================================================================
# The link and its token (docs/submission-format.md, section 5)
# ============================================================================

def make_token(secret: str, dc: str, round_id: str) -> str:
    """t = base64url(HMAC-SHA256(key = secret, message = dc + "|" + round)),
    without the "=" padding, cut to 22 characters. Identical to the backend."""
    digest = hmac.new(secret.encode("utf-8"), f"{dc}|{round_id}".encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")[:TOKEN_LENGTH]


def make_link(base_url: str, dc: str, round_id: str, token: str, lang: str, mock: bool = False) -> str:
    """Build the link in the same order as the control panel: dc, t, round, lang.
    A test link (mock=True) also gets &mock=1, as the test server's own links do."""
    link = f"{base_url}?dc={quote(dc, safe='')}&t={token}&round={quote(round_id, safe='')}"
    if lang:
        link += f"&lang={lang}"
    return link + "&mock=1" if mock else link


def is_local_address(base_url: str) -> bool:
    """True when the form address is the test server on this Mac (localhost or 127.0.0.1)."""
    return (urlsplit(base_url).hostname or "").lower() in LOCAL_HOSTS


# ============================================================================
# Reading the DC list
# ============================================================================

def tidy_column_name(name: str) -> str:
    """'DC ID', 'dc-id' and ' Dc_Id ' all become 'dc_id', so small differences
    in how a spreadsheet names its columns do not matter."""
    return re.sub(r"[\s-]+", "_", name.strip().lower())


def guess_delimiter(text: str) -> str:
    """Excel in some countries separates columns with ";" instead of ","."""
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    counts = {mark: first_line.count(mark) for mark in (",", ";", "\t")}
    best = max(counts, key=counts.get)
    return best if counts[best] > 0 else ","


def read_text(path: Path) -> str:
    """The file's text, or Stop with a plain explanation of why it cannot be read."""
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        raise Stop(f"Cannot find the DC list {path}. Check the name and the folder. Tip: type --dcs "
                   "and a space, then drag the file from Finder into the Terminal window.") from None
    except IsADirectoryError:
        raise Stop(f"{path} is a folder, not a file. Give the CSV file itself with --dcs.") from None
    except OSError as error:
        raise Stop(f"Cannot read the DC list {path}: {error.strerror or error}.") from None
    if raw.startswith(b"PK\x03\x04"):
        raise Stop(f"{path.name} looks like an Excel file, not a CSV file. In Excel use File > Save As > "
                   "\"CSV UTF-8\"; in Google Sheets use File > Download > Comma-separated values (.csv).")
    try:
        return raw.decode("utf-8-sig")       # "-sig" also removes the BOM marker Excel adds
    except UnicodeDecodeError:
        raise Stop(f"{path.name} is not saved as UTF-8 text, so names in Indian scripts would come out "
                   "garbled. In Excel use File > Save As > \"CSV UTF-8\"; in Google Sheets use "
                   "File > Download > Comma-separated values (.csv). Then run this again.") from None


def read_dc_list(path: Path) -> DcList:
    """Read the CSV: the first row names the columns, every other row is one DC."""
    text = read_text(path)
    try:
        records = list(csv.reader(io.StringIO(text, newline=""), delimiter=guess_delimiter(text)))
    except csv.Error as error:
        raise Stop(f"{path.name} is not a readable CSV file ({error}). Save it again as CSV UTF-8.") from None
    if not records or not any(cell.strip() for cell in records[0]):
        raise Stop(f"{path.name} is empty, or its first row is empty. The first row must name the "
                   "columns, for example: dc_id,dc_name,state,region,language")
    columns = [tidy_column_name(name) for name in records[0]]
    if "dc_id" not in columns:
        found = ", ".join(f'"{printable(name)}"' for name in records[0] if name.strip())
        raise Stop(f"The first row of {path.name} must name the columns, and one of them must be dc_id. "
                   f"The first row has: {found}. Rename the column that holds the DC ids to dc_id, "
                   "save the file, and run this again.")
    rows = []
    for number, record in enumerate(records[1:], start=2):
        if not any(cell.strip() for cell in record):
            continue                                   # an empty line: ignore it quietly
        cells = {}
        for name, value in zip(columns, record):
            if name and name not in cells:             # if a column name repeats, the first one wins
                cells[name] = value
        rows.append(DcRow(number, cells))
    if not rows:
        raise Stop(f"{path.name} has column names but no DCs below them.")
    language_column = next((name for name in ("language", "lang") if name in columns), None)
    return DcList(rows, language_column)


def survey_language_codes() -> tuple[list, str]:
    """The language codes the survey offers, and where they came from."""
    try:
        survey = json.loads(SURVEY_FILE.read_text(encoding="utf-8"))
        codes = [entry["code"] for entry in survey["languages"]]
        if codes and all(isinstance(code, str) and code for code in codes):
            return codes, "from web/config/survey.json"
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return FALLBACK_LANGUAGES, ("the standard six, because web/config/survey.json could not be read; "
                                "run python3 scripts/check_config.py to see why")


# ============================================================================
# Checking each row
# ============================================================================

def is_valid_id(value: str) -> bool:
    """The rule for DC ids and round ids, as in the backend."""
    return bool(ID_RULE.fullmatch(value)) and value not in (".", "..")


def dc_id_problem(dc: str) -> str | None:
    """Why this DC id cannot be used in a link, or None if it is fine."""
    if is_valid_id(dc):
        return None
    rule = 'Ids may only use letters, digits, "-", "_" and "." (at most 64 characters).'
    if dc in (".", ".."):
        return f'an id cannot be just "{dc}". {rule}'
    if len(dc) > 64:
        return f"it is {len(dc)} characters long. {rule}"
    bad = sorted({character for character in dc if not ID_CHARACTER.fullmatch(character)})
    if " " in bad:
        return f"it contains a space. {rule}"
    shown = ", ".join(f'"{printable(character)}"' for character in bad)
    return f"it contains {shown}. {rule}"


def is_marked_not_active(row: DcRow) -> bool:
    """Like the control panel: an empty "active" cell counts as active."""
    value = row.cells.get("active", "").strip().lower()
    return bool(value) and value not in ACTIVE_VALUES


def pick_language(raw: str, codes: list) -> tuple[str, str | None]:
    """The language code to put in the link ("" for none), and a note if the cell was not usable.
    Like the control panel, a language that is not offered is left out, not refused."""
    value = raw.strip()
    if not value:
        return "", None
    if value.lower() in codes:
        return value.lower(), None
    hint = ""
    if value.lower() in LANGUAGE_NAMES and LANGUAGE_NAMES[value.lower()] in codes:
        hint = f" For {value.title()}, write {LANGUAGE_NAMES[value.lower()]}."
    return "", (f'language "{printable(value)}" is not one of the survey\'s language codes: '
                f'{", ".join(codes)}.{hint} This link has no language, so the partner picks one '
                "on the first screen.")


def build_links(dc_list: DcList, round_id: str, base_url: str, secret: str, codes: list) -> Outcome:
    """Make one link per usable row; collect the reasons for every row left out.
    The checks come in the same order as in the control panel: not active,
    then an invalid id, then a DC that already got a link from an earlier row.
    For the test server on this Mac (is_local_address) every link ends in &mock=1."""
    outcome = Outcome()
    mock = is_local_address(base_url)
    first_row_of = {}                               # dc id -> the row that got its link
    for row in dc_list.rows:
        dc = row.cells.get("dc_id", "").strip()
        if not dc:
            outcome.skipped.append((row.number, "the dc_id cell is empty."))
            continue
        if is_marked_not_active(row):
            outcome.skipped.append((row.number, f'{printable(dc)} is marked not active (active = '
                                                f'"{printable(row.cells["active"].strip())}").'))
            continue
        problem = dc_id_problem(dc)
        if problem:
            outcome.skipped.append((row.number, f'DC id "{printable(dc)}" is not valid: {problem}'))
            continue
        if dc in first_row_of:
            outcome.skipped.append((row.number, f"{dc} is already on row {first_row_of[dc]}. "
                                                "One link per DC is enough."))
            continue
        first_row_of[dc] = row.number
        lang, note = pick_language(row.cells.get(dc_list.language_column or "", ""), codes)
        if note:
            outcome.notes.append((row.number, dc, note))
        link = make_link(base_url, dc, round_id, make_token(secret, dc, round_id), lang, mock)
        entry = {name: row.cells.get(name, "").strip() for name in COPIED_COLUMNS}
        entry.update(dc_id=dc, language=lang, link=link)
        outcome.links.append(entry)
    return outcome


# ============================================================================
# The link secret
# ============================================================================

def secret_from_env_file(path: Path) -> str | None:
    """The PULSE_LINK_SECRET line of the .env file, if there is one."""
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return None                                  # no .env file (the usual case), or unreadable
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[len("export "):].strip()
        name, equals, value = line.partition("=")
        if not equals or name.strip() != SECRET_SETTING:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1].strip()              # PULSE_LINK_SECRET="..." works too
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()   # drop a trailing "# comment"
        return value or None
    return None


def ask_for_secret() -> str:
    """Ask for the secret without showing it on screen."""
    if not sys.stdin.isatty():
        raise Stop(f"No link secret found. Set {SECRET_SETTING}, or put the line {SECRET_SETTING}=<the secret> "
                   "in a file named .env in the project folder, or run this in a Terminal window so it can "
                   "ask you for it.")
    say("No link secret found in the PULSE_LINK_SECRET setting or in a .env file, so please paste it now.")
    say("Copy it from the control panel: Links > Show the link secret. Nothing appears while you paste: "
        "that is normal. Then press Enter.")
    return getpass.getpass("Link secret: ")


def find_secret(environment, env_file: Path, ask) -> tuple[str, str]:
    """The secret, and where it came from (a description, never the secret itself)."""
    candidates = (
        (lambda: environment.get(SECRET_SETTING), f"the {SECRET_SETTING} setting"),
        (lambda: secret_from_env_file(env_file), "the .env file in the project folder"),
        (ask, "what you pasted"),
    )
    for get_secret, source in candidates:
        secret = (get_secret() or "").strip()    # stray spaces from copy and paste would break every link
        if secret:
            return secret, source
    raise Stop("The link secret was empty, so no links were made. Copy it from the control panel "
               "(Links > Show the link secret) and try again.")


def secret_warnings(secret: str, local: bool = True) -> list:
    if secret == MOCK_SECRET:
        if not local:
            return ["This is the local test server's public test secret, but the links point at the real "
                    "form: the live survey will refuse every one of them as \"not valid\". For test links use "
                    "--base-url http://localhost:8787/ (the test server on this Mac)."]
        return ["This is the local test server's public test secret. These links only work with the test "
                "server on this Mac (python3 scripts/mock_server.py), never with the live survey."]
    if not LIVE_SECRET_SHAPE.fullmatch(secret):
        return ["The live secret from the control panel is 64 characters long and uses only 0-9 and a-f. "
                "This one is different, so the links will probably be refused as \"not valid\". Copy it "
                "again from the control panel (Links > Show the link secret) and check that nothing is missing."]
    return []


# ============================================================================
# Where the result goes
# ============================================================================

def is_inside(path: Path, folder: Path) -> bool:
    """True when `path` is `folder` or anywhere inside it. It compares real
    folders, so a different spelling (WEB/ for web/: Mac disks usually ignore
    capital letters) or a shortcut cannot sneak past the check."""
    if not folder.exists():
        return False
    for place in (path, *path.parents):
        try:
            if place == folder or (place.exists() and os.path.samefile(place, folder)):
                return True
        except OSError:
            continue
    return False


def check_output_place(out: Path, dcs: Path, overwrite: bool) -> list:
    """Stop if the result must not be written there. Returns warnings to show."""
    if is_inside(out, WEB_DIR):
        raise Stop("The links file must not be saved inside web/: everything in web/ is published on the "
                   "internet, and these links are partner data. Choose another place with --out, for "
                   "example --out ~/Documents/links.csv")
    if is_inside(out, SAMPLE_DATA_DIR):
        raise Stop("The links file must not be saved inside sample_data/: that folder is saved to GitHub "
                   "(it is only for obviously fake demo data). Choose another place with --out, for "
                   "example --out ~/Downloads/links.csv")
    if out.suffix.lower() != ".csv":
        raise Stop(f"The links file name must end in .csv (you gave {out.name}). git never saves .csv files, "
                   "which keeps the links out of GitHub even if the file lands in the project folder.")
    if not out.parent.is_dir():
        raise Stop(f"The folder {out.parent} does not exist. Create it first, or choose another place "
                   "with --out.")
    if out.exists():
        if out.is_dir():
            raise Stop(f"{out} is a folder. Give a file name with --out, for example {out / 'links.csv'}")
        if dcs.exists() and os.path.samefile(out, dcs):
            raise Stop("--out points at the DC list itself, which would be overwritten. Choose another name.")
        if not overwrite:
            raise Stop(f"{out} already exists, so nothing was written (it may hold notes you added). Add "
                       "--overwrite to replace it, or choose another name with --out.")
    if is_inside(out, REPO_DIR):
        return ["The links file is inside the project folder. git ignores .csv files, so it will not be "
                "uploaded, but real partner data belongs outside this folder (for example in Documents)."]
    return []


def spreadsheet_safe(value) -> str:
    """A cell starting with = + - @ (or a tab / line break) would run as a formula
    when the CSV is opened in Excel or Google Sheets, so a hostile DC name could
    send the links elsewhere. A leading ' keeps such a cell plain text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def write_links(out: Path, links: list) -> None:
    """Write the CSV via a temporary file, so an interruption never leaves half a file.
    The temporary file is created readable by this Mac user only, and keeps that."""
    handle, temporary = tempfile.mkstemp(prefix=".links-", suffix=".partial.csv", dir=out.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=OUTPUT_COLUMNS)
            writer.writeheader()
            writer.writerows([{key: spreadsheet_safe(value) for key, value in row.items()} for row in links])
        os.replace(temporary, out)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


# ============================================================================
# The report on screen
# ============================================================================

def print_header(dcs: Path, round_id: str, base_url: str, dc_list: DcList, codes: list, codes_source: str) -> None:
    say("Valmo Partner Pulse: survey links")
    say(f"DC list:       {dcs}  ({plural(len(dc_list.rows), 'row')})", 2)
    say(f"Round:         {round_id}", 2)
    say(f"Form address:  {base_url}", 2)
    if dc_list.language_column:
        say(f'Languages:     from the "{dc_list.language_column}" column. Allowed codes: {", ".join(codes)} '
            f"({codes_source}).", 2)
    else:
        say("Languages:     the DC list has no language column, so every partner picks a language on the "
            "first screen.", 2)


def print_outcome(outcome: Outcome) -> None:
    with_language = sum(1 for link in outcome.links if link["language"])
    say("")
    say(f"Made {plural(len(outcome.links), 'link')} ({with_language} with a language, "
        f"{len(outcome.links) - with_language} without).")
    if outcome.skipped:
        say(f"Skipped {plural(len(outcome.skipped), 'row')} (no link made):")
        for number, reason in outcome.skipped:
            say(f"- row {number}: {reason}", 2)
    if outcome.notes:
        say(f"{plural(len(outcome.notes), 'note')} (the link was made, but check this):")
        for number, dc, note in outcome.notes:
            say(f"- row {number} ({dc}): {note}", 2)


def print_warnings(warnings: list) -> None:
    if warnings:
        say("")
        say("WARNINGS:")
        for warning in warnings:
            say(f"- {warning}", 2)


def print_next_steps(out: Path, local: bool, test_secret: bool) -> None:
    """What to do with the file. The "test links" hint is only for links to the
    test server on this Mac (--base-url localhost or 127.0.0.1)."""
    say("")
    say(f"Saved: {out}")
    say("Columns: " + ", ".join(OUTPUT_COLUMNS), 2)
    say("")
    if local:
        say("These are TEST links for the test server on this Mac (each one ends in &mock=1). To try them: "
            "start the test server with  python3 scripts/mock_server.py --strict  and open a link from the "
            "file in Chrome.")
        if not test_secret:
            say("They were made with a secret other than the test server's built-in one, so start the test "
                "server with the same secret in its MOCK_SECRET setting, or it will call them \"not valid\".", 2)
        return
    say("Next:")
    say("1. Keep this file private: each link lets someone answer as that DC. Share it only with whoever "
        "sends the links.", 2)
    say("2. Send the links in batches (for example 1,000 an hour), not all at once.", 2)
    say("3. Delete the file when the round is over.", 2)


# ============================================================================
# Command line
# ============================================================================

def round_id_argument(text: str) -> str:
    value = text.strip()
    if not is_valid_id(value):
        raise argparse.ArgumentTypeError(
            f'"{printable(text)}" is not a valid round id. It may only use letters, digits, "-", "_" and "." '
            "(at most 64 characters), for example 2026-R1. It must match the round in the control panel's "
            "Rounds tab exactly, including capital letters.")
    return value


def base_url_argument(text: str) -> str:
    parts = urlsplit(text.strip())
    if parts.scheme not in ("https", "http") or not parts.netloc:
        raise argparse.ArgumentTypeError(f'"{printable(text, 80)}" is not a web address. Example: {DEFAULT_BASE_URL}')
    if parts.query or parts.fragment:
        raise argparse.ArgumentTypeError("give only the form's address, without ? or # and anything after "
                                         f"them. Example: {DEFAULT_BASE_URL}")
    path = parts.path or "/"
    if not path.endswith(("/", ".html")):
        path += "/"                           # .../NPS-Form- and .../NPS-Form-/ mean the same page
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def parse_arguments(argv: list | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python3 scripts/generate_links.py",
        description=("Make every DC's personal survey link from a CSV file of DCs, with the same formula as\n"
                     "the control panel. The link secret is read from the PULSE_LINK_SECRET setting, or from\n"
                     "a .env file in the project folder, or asked for (hidden while you paste).\n"
                     "The result is a CSV file: dc_id, dc_name, state, region, language, link."),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python3 scripts/generate_links.py --dcs ~/Documents/dcs.csv --round 2026-R1\n"
            "      makes ~/Documents/links-2026-R1.csv (asks for the secret)\n"
            "  python3 scripts/generate_links.py --dcs ~/Documents/dcs.csv --round 2026-R1 \\\n"
            "      --out ~/Documents/links-round1.csv --overwrite\n"
            "      saves under another name, replacing an older file\n"
            "  PULSE_LINK_SECRET=mock-dev-secret-not-for-production python3 scripts/generate_links.py \\\n"
            "      --dcs sample_data/dcs_fake.csv --round DEMO-R1 --base-url http://localhost:8787/ \\\n"
            "      --out ~/Downloads/demo-links.csv\n"
            "      TEST links: fake DCs, the test server's public secret and a localhost address.\n"
            "      Each link ends in &mock=1; open them while python3 scripts/mock_server.py --strict\n"
            "      is running\n"
            "\n"
            "A --base-url of localhost or 127.0.0.1 (the test server on this Mac) makes test links\n"
            "ending in &mock=1; any other address makes real links, without it.\n"
            "\n"
            "The DC list needs a dc_id column. Optional columns: language (or lang), dc_name, state,\n"
            "region, and active (empty, TRUE, yes or 1 = make a link; FALSE, no or 0 = skip), read\n"
            "the same way as the control panel's DCs tab. Real DC lists and links are partner data:\n"
            "keep them outside the project folder, never in web/ or sample_data/."),
    )
    parser.add_argument("--dcs", type=Path, required=True, metavar="FILE",
                        help="The DC list, a CSV file whose first row names the columns (dc_id is required).")
    parser.add_argument("--round", type=round_id_argument, required=True, metavar="ROUND",
                        help="The round id, exactly as in the control panel's Rounds tab, for example 2026-R1.")
    parser.add_argument("--base-url", type=base_url_argument, default=DEFAULT_BASE_URL, metavar="URL",
                        help="The form's address (default: %(default)s). With localhost or 127.0.0.1 "
                             "the links are test links for the test server and end in &mock=1.")
    parser.add_argument("--out", type=Path, default=None, metavar="FILE",
                        help="Where to save the links; must end in .csv. Default: links-<round>.csv in the "
                             "same folder as the DC list.")
    parser.add_argument("--overwrite", action="store_true",
                        help="Replace the --out file if it already exists. Default: stop instead.")
    return parser.parse_args(argv)


def run(args: argparse.Namespace) -> int:
    dcs = args.dcs.expanduser().resolve()
    out = (args.out.expanduser() if args.out else dcs.parent / f"links-{args.round}.csv").resolve()
    dc_list = read_dc_list(dcs)
    warnings = check_output_place(out, dcs, args.overwrite)     # checked before asking for the secret
    codes, codes_source = survey_language_codes()
    print_header(dcs, args.round, args.base_url, dc_list, codes, codes_source)
    secret, secret_source = find_secret(os.environ, ENV_FILE, ask_for_secret)
    say(f"Link secret:   taken from {secret_source} (it is never shown)", 2)

    local = is_local_address(args.base_url)
    outcome = build_links(dc_list, args.round, args.base_url, secret, codes)
    print_outcome(outcome)
    warnings += secret_warnings(secret, local)
    if TEST_ROUND_WORDS.search(args.round):
        warnings.append(f'Round "{args.round}" looks like a test round. Real partner links should use the real '
                        "round, for example 2026-R1.")
    if args.base_url.startswith("http://"):
        warnings.append("The form address starts with http://, which is only right for testing on this Mac. "
                        "Real links must start with https://, or voice notes will not work on phones.")
    print_warnings(warnings)
    if not outcome.links:
        say("")
        say("STOPPED: no row could be used, so no file was written. Fix the rows listed above and run this "
            "again.")
        return 1
    write_links(out, outcome.links)
    print_next_steps(out, local=local, test_secret=(secret == MOCK_SECRET))
    return 0


def main(argv: list | None = None) -> int:
    if sys.version_info < (3, 11):
        print(f"This script needs Python 3.11 or newer, but it was started with Python {sys.version.split()[0]}.")
        print("Install the latest Python from https://www.python.org/downloads/ and run it again.")
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")   # an unusual character must never stop the script
    args = parse_arguments(argv)
    try:
        return run(args)
    except Stop as problem:
        say("")
        say("STOPPED: nothing was written.")
        say(str(problem), 2)
        return 1
    except KeyboardInterrupt:
        say("")
        say("Stopped. Nothing was written.")
        return 1
    except OSError as error:
        say("")
        say(f"STOPPED: could not save the links file: {error.strerror or error}. Check the folder given "
            "with --out, and that there is free disk space.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
