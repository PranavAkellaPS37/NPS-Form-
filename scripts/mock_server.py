#!/usr/bin/env python3
"""
==============================================================================
 mock_server.py  -  Valmo Partner Pulse: LOCAL TEST SERVER (a pretend backend)
==============================================================================

WHAT THIS FILE IS FOR
  The real survey sends its answers to Google Apps Script (the live backend,
  set up from the Google Sheet control panel). This script plays the
  backend's part on this Mac instead, so you can take the survey yourself and
  see exactly what gets saved, without touching anything live.
  It does three jobs at once:
    1. It shows the survey form (the files in the web/ folder) in your browser.
    2. It hands the form its questionnaire (the "bootstrap" request), built
       from the files in web/, just as the live backend hands out the version
       published from the control panel.
    3. It receives the answers at the address /api, checks them and saves
       them in the local_data/ folder. It follows docs/submission-format.md
       (the agreement between the form and any backend) exactly.

HOW TO RUN IT
  Open Terminal, go to the project folder (the one that contains web/ and
  scripts/), then type:

      python3 scripts/mock_server.py

  It prints ready-to-click test links. Open one in Chrome on this Mac.
  Keep the Terminal window open while you test: every message the form sends
  appears there as one line. Press Ctrl+C in that window to stop the server.

  Options (you can combine them, e.g.  python3 scripts/mock_server.py --strict --slow 3):
    --port 8788             Use another port if 8787 is already taken.
    --lan                   Let a phone on the same Wi-Fi open the survey too.
    --strict                Refuse links whose token is wrong (as the live system will).
    --one-response-per-dc   Tell a DC that already answered this round "already received".
    --fail-rate 0.3         Make 30% of sends fail on purpose (tests the form's retries).
    --slow 3                Wait 3 seconds before answering a send (imitates slow mobile data).
    --closed-rounds R1,R2   Pretend these rounds are CLOSED, as if closed in the control
                            panel: new visitors see "This survey has closed"; a partner who
                            had already started on that phone may finish, and those answers
                            are saved marked late.
    --draft-rounds R3       Pretend these rounds are NOT OPEN YET (draft): their links show
                            "This survey is not open yet" and every message for them is
                            refused with round_not_open. Preview links still work.
                            (Every other round counts as open.)
    --data-dir PATH         Save in another folder instead of local_data/.
    --reset                 Delete all saved test answers (asks you to type "yes" first).
  Full explanation of each option:  python3 scripts/mock_server.py --help
  To check that the server works:   python3 scripts/smoke_test.py   (in a second Terminal window)

WHAT YOU SEE WHILE IT RUNS (one line per message, for example)
  11:22:30  PING opened  DC-DEMO-001  DEMO-R1  lang=hi  screen=nps  step=2/13  token OK  already submitted: no
  11:23:31  SUBMIT  DC-DEMO-001  DEMO-R1  lang=hi  nps=6  ratings=10  voice notes=2  texts=1  token OK  -> saved
  11:23:40  SUBMIT  DC-DEMO-001  DEMO-R1  sent again (sub_...): already saved, nothing new written
  11:22:29  GET  bootstrap  round=DEMO-R1 (open)  -> questionnaire 2026-10-19.1, 9 screens, 130 texts, 3 'what changed' item(s)
    GET bootstrap = the form asking for its questionnaire when a link is opened
    PING     = a progress signal from the form (it never contains answers)
    SUBMIT   = a finished survey
    REFUSED  = the message was not accepted; the line says why
  The answers themselves (typed text, voice notes) are never printed, only counts.

WHAT IT READS
  web/                           the survey form, sent to the browser unchanged
  web/config/survey.json,        the questionnaire handed to the form (bootstrap),
  web/i18n/strings.json,         without the notes for humans and without the
  web/config/audio_clips.json    settings that say where answers go. Read again on
                                 every request, so your edits show up without a restart.
  web/config/whats_changed.json  the "What changed" news. It is read again on every
                                 request, so your edits show up without a restart.
  local_data/responses.jsonl     read once at start-up, so a survey that arrives twice
                                 (the form re-sends on bad networks) is saved only once
  MOCK_SECRET (optional setting) the secret used to check link tokens. If it is not
                                 set, the public test secret
                                 "mock-dev-secret-not-for-production" is used.

WHAT IT WRITES  (only inside local_data/, which git ignores, so it is never uploaded)
  local_data/responses.jsonl     one line per finished survey (marked "late": true when
                                 it arrived for a round listed in --closed-rounds)
  local_data/events.jsonl        one line per progress signal (opened / started / progress)
  local_data/audio/<round>/<dc>/ one file per voice note
  It never changes anything in web/, docs/ or scripts/.

SAFETY NOTES
  - Test with FAKE data only, such as the demo DCs it prints (DC-DEMO-001 ...).
    Never use real partner links or real partner answers with this server.
  - Normally only this Mac can reach the server. With --lan, anyone on the same
    Wi-Fi can reach it while it runs: use --lan only on a network you trust,
    and stop the server (Ctrl+C) when you are done.
  - The built-in secret is public and for testing only. The live secret is
    kept in Apps Script and is never written into this project.
  - It never sends anything to the internet.

NEEDS
  Python 3.11 or newer. Nothing to install: it uses only Python's built-in parts.
==============================================================================
"""

from __future__ import annotations

import argparse
import base64
import errno
import hashlib
import hmac
import json
import os
import random
import re
import shutil
import signal
import socket
import socketserver
import sys
import threading
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode


# ============================================================================
# Fixed settings (you should not need to change these)
# ============================================================================

# Folders are found from where THIS file lives, so the script behaves the
# same whichever folder you start it from.
REPO_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_DIR / "web"
SURVEY_FILE = WEB_DIR / "config" / "survey.json"
STRINGS_FILE = WEB_DIR / "i18n" / "strings.json"
AUDIO_CLIPS_FILE = WEB_DIR / "config" / "audio_clips.json"
WHATS_CHANGED_FILE = WEB_DIR / "config" / "whats_changed.json"
DEFAULT_DATA_DIR = REPO_DIR / "local_data"
DEFAULT_PORT = 8787

SERVICE_NAME = "valmo-partner-pulse"
SCHEMA_VERSION = 1
# Public, test-only secret (docs/submission-format.md, section 5).
DEFAULT_SECRET = "mock-dev-secret-not-for-production"

MEGABYTE = 1024 * 1024
MAX_BODY_BYTES = 25 * MEGABYTE        # one whole message, voice notes included
MAX_VOICE_NOTE_BYTES = 5 * MEGABYTE   # one voice note, after decoding

PING_STAGES = ("opened", "started", "progress")

# Settings the form ALWAYS takes from its own copy of survey.json, because it
# needs them before it can ask for the questionnaire. The live backend never
# hands them out (docs/control-panel-design.md, section 5), so neither do we.
FORM_ONLY_BACKEND_SETTINGS = ("mode", "mock_url", "apps_script_url")

# Allowed shapes of IDs. dc and round also become folder names under audio/,
# so they must not contain "/" and must not be "." or ".." (which mean
# "this folder" and "the folder above").
SUBMISSION_ID_RULE = re.compile(r"[A-Za-z0-9_-]{1,64}")
DC_OR_ROUND_RULE = re.compile(r"[A-Za-z0-9_.-]{1,64}")
UNSAFE_FILE_NAME_CHAR = re.compile(r"[^A-Za-z0-9_.-]")
# The names this server gives voice-note files (--reset uses it as a safety check).
OUR_VOICE_NOTE_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}__[A-Za-z0-9_.-]+\.(webm|ogg|m4a|bin)")

# Half of an emoji (a "lone surrogate"). A phone can cut an emoji in half when
# it shortens a long text, and such a half cannot be saved as UTF-8 text.
HALF_CHARACTER = re.compile(r"[\ud800-\udfff]")
# Characters that some programs treat as a line break. They are written as
# \u escapes, so every saved record stays on exactly one line for any reader.
LINE_BREAK_LOOKALIKES = {0x85: "\\u0085", 0x2028: "\\u2028", 0x2029: "\\u2029"}

# File extension of a saved voice note, from the recording's format ("mime").
VOICE_NOTE_EXTENSIONS = {
    "audio/webm": ".webm",       # Chrome on Android: the usual case
    "video/webm": ".webm",
    "audio/ogg": ".ogg",         # Firefox
    "application/ogg": ".ogg",
    "audio/mp4": ".m4a",         # iPhone / Safari
    "audio/x-m4a": ".m4a",
    "audio/m4a": ".m4a",
}
UNKNOWN_VOICE_NOTE_EXTENSION = ".bin"

# What kind of file each web/ file is, so the browser handles it correctly.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",      # notes such as web/audio/README.md: shown as plain text
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
}

# Fake demo DCs for the ready-to-click links printed at start-up. Never real DCs.
DEMO_ROUND = "DEMO-R1"
DEMO_LINKS = (
    # (what the link is for, dc, lang)
    ("English", "DC-DEMO-001", "en"),
    ("Hindi", "DC-DEMO-002", "hi"),
    ("Tamil", "DC-DEMO-003", "ta"),
    ("No language in the link, so it shows the language picker", "DC-DEMO-004", None),
)
# The deliberately broken link: DC-DEMO-005 carrying DC-DEMO-001's token, as if
# someone had changed the DC in a genuine link by hand.
BROKEN_LINK_DC = "DC-DEMO-005"
BROKEN_LINK_TOKEN_DC = "DC-DEMO-001"

PRINT_LOCK = threading.Lock()


# ============================================================================
# Small building blocks
# ============================================================================

class BadRequest(Exception):
    """The message is malformed. The text says why, in plain English."""


class WhatsChangedProblem(Exception):
    """web/config/whats_changed.json cannot be used. The text says why."""


class QuestionnaireFileProblem(Exception):
    """survey.json or strings.json cannot be used. The text names the file and says why."""


class RangeNotSatisfiable(Exception):
    """The browser asked for a part of a file that does not exist."""


@dataclass
class Settings:
    """The choices made on the command line, kept in one place."""
    port: int
    lan: bool
    strict: bool
    one_response_per_dc: bool
    fail_rate: float
    slow_seconds: float
    data_dir: Path
    secret: str
    secret_is_default: bool
    closed_rounds: frozenset = frozenset()   # --closed-rounds
    draft_rounds: frozenset = frozenset()    # --draft-rounds

    def round_status(self, round_id: str) -> str:
        """"open", "closed" or "draft", as the control panel's Rounds tab would say.
        Every round not listed in --closed-rounds or --draft-rounds is open."""
        if round_id in self.draft_rounds:
            return "draft"
        if round_id in self.closed_rounds:
            return "closed"
        return "open"


@dataclass
class VoiceNote:
    """One decoded voice note, waiting to be saved as a file."""
    index: int        # its position in the message's free_text list
    item_id: str      # e.g. "fn_deep_dive:losses"
    data: bytes       # the recording itself
    extension: str    # ".webm", ".ogg", ".m4a" or ".bin"


@dataclass
class SaveResult:
    """What happened when a submission was handed to the store."""
    duplicate: bool           # True: already saved earlier, nothing written now
    received_at: str | None   # when it was (first) received
    seen_before: bool         # this DC already had another submission for this round


def say(text: str = "") -> None:
    """Print one line straight away (also when the output goes to a file)."""
    with PRINT_LOCK:
        print(text, flush=True)


def log(text: str) -> None:
    """One line per request, starting with the time, e.g. '11:22:33  GET health check'."""
    say(f"{datetime.now():%H:%M:%S}  {text}")


def printable(value, limit: int = 40) -> str:
    """Make a value taken from a message safe to print: plain characters only, and short."""
    text = "".join(ch if " " <= ch <= "~" else "?" for ch in str(value))
    return text if len(text) <= limit else text[: limit - 3] + "..."


def utc_now_iso() -> str:
    """The time now in UTC, e.g. 2026-10-19T11:22:33.456Z (the format the contract uses)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def to_json_line(data) -> str:
    """Turn data into ONE line of JSON, keeping Hindi, Tamil etc. readable (not \\u escapes)."""
    line = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    line = HALF_CHARACTER.sub("\ufffd", line)   # \ufffd = the "unknown character" symbol (a ? in a diamond)
    return line.translate(LINE_BREAK_LOOKALIKES)


def append_line(path: Path, line: str) -> None:
    """Add one line at the end of a file, creating the file if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as file:
        file.write(line + "\n")


def without_notes(value):
    """Drop keys that start with "_" (notes for humans), at every level."""
    if isinstance(value, dict):
        return {key: without_notes(item) for key, item in value.items() if not str(key).startswith("_")}
    if isinstance(value, list):
        return [without_notes(item) for item in value]
    return value


def bad_request_answer(message: str) -> dict:
    return {"ok": False, "error": "bad_request", "message": message}


def server_error_answer(message: str) -> dict:
    return {"ok": False, "error": "server_error", "message": message}


def bad_token_answer() -> dict:
    return {"ok": False, "error": "bad_token"}


def round_not_open_answer() -> dict:
    return {"ok": False, "error": "round_not_open"}


# ============================================================================
# Link tokens (docs/submission-format.md, section 5)
# ============================================================================

def expected_token(secret: str, dc: str, round_id: str) -> str:
    """The token that a genuine link for this DC and round carries."""
    message = f"{dc}|{round_id}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")[:22]


def token_is_valid(secret: str, message: dict) -> bool:
    """True when the message's token "t" matches its dc and round."""
    token = message.get("t")
    if not isinstance(token, str):
        return False
    wanted = expected_token(secret, message["dc"], message["round"])
    # compare_digest takes the same time wherever the first difference is, so
    # nobody can work out a valid token by timing the server's answers.
    return hmac.compare_digest(token.encode("utf-8", "replace"), wanted.encode("ascii"))


def demo_link(base_url: str, secret: str, dc: str, lang: str | None, token_dc: str | None = None,
              round_id: str = DEMO_ROUND) -> str:
    """A link shaped like the real ones: <base>/?dc=...&t=...&round=...&lang=..."""
    token = expected_token(secret, token_dc or dc, round_id)
    query = [("dc", dc), ("t", token), ("round", round_id)]
    if lang:
        query.append(("lang", lang))
    # mock=1: these links must reach THIS test server even after
    # web/config/survey.json has been switched to the live Google backend.
    query.append(("mock", "1"))
    return f"{base_url}/?{urlencode(query)}"


# ============================================================================
# Checking incoming messages (docs/submission-format.md, sections 2 and 3)
# ============================================================================

def parse_message(body: bytes) -> dict:
    """Turn the raw text the form sent into a message, or raise BadRequest.
    The form labels its JSON as plain text (see the contract), so the label is ignored."""
    if not body.strip():
        raise BadRequest("The message was empty.")
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise BadRequest("The message is not UTF-8 text.") from None
    try:
        message = json.loads(text, parse_constant=refuse_non_json_number)
    except json.JSONDecodeError as error:
        raise BadRequest(f"The message is not valid JSON "
                         f"(line {error.lineno}, column {error.colno}: {error.msg}).") from None
    except (ValueError, RecursionError):
        raise BadRequest("The message is not valid JSON.") from None
    if not isinstance(message, dict):
        raise BadRequest('The message must be a JSON object, like {"kind": "submit", ...}.')
    if message.get("kind") not in ("submit", "ping"):
        raise BadRequest('"kind" must be "submit" or "ping".')
    return message


def refuse_non_json_number(name: str):
    """NaN and Infinity are not real JSON: other programs could not read them back."""
    raise BadRequest(f"The message contains {name}, which is not allowed in JSON.")


def check_dc_and_round(message: dict) -> None:
    for field in ("dc", "round"):
        value = message.get(field)
        if not (isinstance(value, str) and DC_OR_ROUND_RULE.fullmatch(value) and value not in (".", "..")):
            raise BadRequest(f'"{field}" is missing or not valid. It must be 1 to 64 characters: '
                             'letters, digits, "-", "_" or ".".')


# Size caps, the same as apps-script/Code.gs (PP_SRV): a real survey is small,
# and these stop one partner link from flooding the data with junk.
MAX_LIST_ITEMS = {"free_text": 64, "ratings": 64, "events": 400}
MAX_ANSWER_KEYS = 100
MAX_ANSWERS_CHARS = 200_000          # the whole message without voice notes
MAX_PING_FIELD_CHARS = {"session_id": 64, "lang": 8, "screen": 80, "at": 40, "mode": 10, "stage": 10}
MAX_PING_EVENTS = 400
MAX_PING_CHARS = 60_000


def check_ping(message: dict) -> None:
    """Raise BadRequest unless this is a well-formed progress signal."""
    if message.get("stage") not in PING_STAGES:
        raise BadRequest('"stage" must be "opened", "started" or "progress".')
    check_dc_and_round(message)
    for field, cap in MAX_PING_FIELD_CHARS.items():
        value = message.get(field)
        if value is not None and len(str(value)) > cap:
            raise BadRequest(f'"{field}" is too long.')
    events = message.get("events")
    if events is not None and (not isinstance(events, list) or len(events) > MAX_PING_EVENTS):
        raise BadRequest(f'"events" must be a list of at most {MAX_PING_EVENTS} items.')
    if len(json.dumps(message, ensure_ascii=False)) > MAX_PING_CHARS:
        raise BadRequest("The ping is too large.")


def check_submit(message: dict) -> list[VoiceNote]:
    """Raise BadRequest unless this is a well-formed submission.
    Returns its voice notes, decoded and ready to save."""
    version = message.get("schema_version")
    if type(version) not in (int, float) or version != SCHEMA_VERSION:   # type(): true/false do not count as 1
        raise BadRequest(f'"schema_version" must be {SCHEMA_VERSION}.')
    submission_id = message.get("submission_id")
    if not (isinstance(submission_id, str) and SUBMISSION_ID_RULE.fullmatch(submission_id)):
        raise BadRequest('"submission_id" is missing or not valid. It must be 1 to 64 characters: '
                         'letters, digits, "-" or "_".')
    check_dc_and_round(message)
    if not isinstance(message.get("lang"), str):
        raise BadRequest('"lang" must be text, for example "hi".')
    if not isinstance(message.get("answers"), dict):
        raise BadRequest('"answers" must be an object ({...}).')
    for field in ("ratings", "free_text", "events"):
        if not isinstance(message.get(field), list):
            raise BadRequest(f'"{field}" must be a list ([...]).')
        if len(message[field]) > MAX_LIST_ITEMS[field]:
            raise BadRequest(f'"{field}" has {len(message[field])} items; a real survey has at most '
                             f'{MAX_LIST_ITEMS[field]}.')
    if len(message["answers"]) > MAX_ANSWER_KEYS:
        raise BadRequest('"answers" has too many entries.')
    without_recordings = json.dumps(message, ensure_ascii=False, default=str,
                                    separators=(",", ":"))
    recordings = sum(len(item["audio"]["base64"]) for item in message["free_text"]
                     if isinstance(item, dict) and isinstance(item.get("audio"), dict)
                     and isinstance(item["audio"].get("base64"), str))
    if len(without_recordings) - recordings > MAX_ANSWERS_CHARS:
        raise BadRequest("The answers (without voice notes) are too large.")
    return decode_voice_notes(message["free_text"])


def decode_voice_notes(free_text: list) -> list[VoiceNote]:
    """Check every free_text item, and decode the voice notes inside them."""
    notes = []
    for index, item in enumerate(free_text):
        where = f"free_text[{index}]"
        if not isinstance(item, dict):
            raise BadRequest(f"{where} must be an object ({{...}}).")
        audio = item.get("audio")
        if audio is None:
            continue                           # a typed answer only, no voice note
        if not isinstance(audio, dict):
            raise BadRequest(f"{where}.audio must be null or an object.")
        item_id = item.get("item_id")
        if not isinstance(item_id, str) or not item_id:
            raise BadRequest(f"{where}.item_id is missing. It is needed to name the voice-note file.")
        data = decode_recording(audio.get("base64"), where)
        notes.append(VoiceNote(index, item_id, data, extension_for(audio.get("mime"))))
    return notes


def decode_recording(encoded, where: str) -> bytes:
    """Turn the base64 text of one recording back into the audio itself."""
    if not isinstance(encoded, str) or not encoded:
        raise BadRequest(f"{where}.audio.base64 is missing or empty.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except ValueError:                         # this also covers binascii.Error
        hint = " Send only the part after 'base64,'." if encoded.startswith("data:") else ""
        raise BadRequest(f"{where}.audio.base64 is not valid base64 text.{hint}") from None
    if len(data) > MAX_VOICE_NOTE_BYTES:
        raise BadRequest(f"The voice note in {where} is {len(data) / MEGABYTE:.1f} MB; "
                         "one voice note may be at most 5 MB.")
    return data


def extension_for(mime) -> str:
    """'.webm', '.ogg' or '.m4a' for e.g. 'audio/webm;codecs=opus'; '.bin' if unknown."""
    if not isinstance(mime, str):
        return UNKNOWN_VOICE_NOTE_EXTENSION
    base_type = mime.split(";")[0].strip().lower()
    return VOICE_NOTE_EXTENSIONS.get(base_type, UNKNOWN_VOICE_NOTE_EXTENSION)


def voice_note_file_name(submission_id: str, note: VoiceNote, names_taken: set) -> str:
    """<submission_id>__<item_id>.<ext>, e.g. sub_5c1d__fn_deep_dive-losses.webm
    In item_id, ':' becomes '-' and any other unusual character becomes '_'."""
    item_part = UNSAFE_FILE_NAME_CHAR.sub("_", note.item_id.replace(":", "-"))[:100]
    name = f"{submission_id}__{item_part}{note.extension}"
    number = 2
    # If two items end up with the same name, number the second one instead of
    # overwriting the first. (Compared ignoring capitals, as Mac folders do.)
    while name.lower() in names_taken:
        name = f"{submission_id}__{item_part}-{number}{note.extension}"
        number += 1
    names_taken.add(name.lower())
    return name


# ============================================================================
# Saving (everything under the data folder, normally local_data/)
# ============================================================================

class Store:
    """The saved files, plus a small in-memory index that answers two
    questions quickly without re-reading the files:
      - "Was this submission_id saved already?"  (so a re-sent survey is saved once)
      - "Did this DC already answer this round?" (dc_round_seen_before, --one-response-per-dc)
    """

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.responses_file = data_dir / "responses.jsonl"
        self.events_file = data_dir / "events.jsonl"
        self.audio_dir = data_dir / "audio"
        # One lock around every index update and file write, so that two copies
        # of a survey arriving at the same moment cannot both be saved.
        self.lock = threading.Lock()
        self.received_at_by_id: dict[str, str | None] = {}
        self.dc_rounds_answered: set[tuple[str, str]] = set()

    def load_existing(self) -> list[int]:
        """Rebuild the index from responses.jsonl. Returns the numbers of lines that could not be read."""
        unreadable = []
        if not self.responses_file.exists():
            return unreadable
        with self.responses_file.open(encoding="utf-8", errors="replace") as lines:
            for number, line in enumerate(lines, start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    unreadable.append(number)
                    continue
                if not isinstance(record, dict) or not all(
                        isinstance(record.get(key), str) for key in ("submission_id", "dc", "round")):
                    unreadable.append(number)
                    continue
                self.received_at_by_id[record["submission_id"]] = record.get("received_at")
                self.dc_rounds_answered.add((record["dc"], record["round"]))
        return unreadable

    def count_dcs(self) -> int:
        return len({dc for dc, _ in self.dc_rounds_answered})

    def dc_already_answered(self, dc: str, round_id: str) -> bool:
        with self.lock:
            return (dc, round_id) in self.dc_rounds_answered

    def save_ping(self, record: dict) -> None:
        line = to_json_line(record)
        with self.lock:
            append_line(self.events_file, line)

    def save_submission(self, message: dict, voice_notes: list[VoiceNote], token_valid: bool,
                        late: bool = False) -> SaveResult:
        """Save a submission, unless its submission_id is saved already (then write nothing).
        late = True when the round was already closed (the partner had started before it closed)."""
        submission_id = message["submission_id"]
        dc_round = (message["dc"], message["round"])
        with self.lock:
            if submission_id in self.received_at_by_id:
                return SaveResult(duplicate=True, received_at=self.received_at_by_id[submission_id], seen_before=True)
            received_at = utc_now_iso()
            seen_before = dc_round in self.dc_rounds_answered
            # The stored record is what the form sent, minus the token "t"
            # (not needed once checked), plus five fields added by the server.
            record = {key: value for key, value in message.items() if key != "t"}
            files_written: list[Path] = []
            try:
                record["free_text"] = self._save_voice_notes(message, voice_notes, files_written)
                record.update(received_at=received_at, token_valid=token_valid, late=late,
                              server="mock", dc_round_seen_before=seen_before)
                append_line(self.responses_file, to_json_line(record))
            except OSError:
                for path in files_written:     # do not leave half a submission behind
                    path.unlink(missing_ok=True)
                raise
            self.received_at_by_id[submission_id] = received_at
            self.dc_rounds_answered.add(dc_round)
            return SaveResult(duplicate=False, received_at=received_at, seen_before=seen_before)

    def _save_voice_notes(self, message: dict, voice_notes: list[VoiceNote], files_written: list[Path]) -> list:
        """Write each voice note to its own file. Returns free_text with each
        audio.base64 replaced by audio.file (the file's place inside the data
        folder) and audio.bytes set to the real size."""
        free_text = list(message["free_text"])
        relative_folder = f"audio/{message['round']}/{message['dc']}"
        folder = self.data_dir / relative_folder
        names_taken: set = set()
        for note in voice_notes:
            name = voice_note_file_name(message["submission_id"], note, names_taken)
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / name
            path.write_bytes(note.data)
            files_written.append(path)
            item = dict(free_text[note.index])
            audio = {key: value for key, value in item["audio"].items() if key != "base64"}
            audio["bytes"] = len(note.data)
            audio["file"] = f"{relative_folder}/{name}"
            item["audio"] = audio
            free_text[note.index] = item
        return free_text


def log_save_problem(data_dir: Path, error: OSError) -> None:
    log(f"ERROR  could not save in {data_dir}: {error.strerror or error}. Nothing was saved and the form "
        "will retry. Check that the disk has free space and that the folder can be written to.")


# ============================================================================
# "What changed" content (docs/submission-format.md, section 4)
# ============================================================================

def read_whats_changed(round_id: str):
    """Return (title, items) for one round from web/config/whats_changed.json.
    The file is read again on every request on purpose, so edits show up
    without restarting the server. An unknown round gives (None, [])."""
    try:
        content = json.loads(WHATS_CHANGED_FILE.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise WhatsChangedProblem("is missing") from None
    except json.JSONDecodeError as error:
        raise WhatsChangedProblem(f"has a mistake on line {error.lineno}, column {error.colno} "
                                  f"({error.msg})") from None
    except (OSError, ValueError) as error:
        raise WhatsChangedProblem(f"cannot be read ({error})") from None
    rounds = content.get("rounds") if isinstance(content, dict) else None
    if not isinstance(rounds, dict):
        raise WhatsChangedProblem('has no "rounds": {...} section')
    if round_id.startswith("_"):
        return None, []                        # names starting with "_" are notes, not rounds
    block = rounds.get(round_id)
    if block is None:
        return None, []
    title = block.get("title") if isinstance(block, dict) else None
    items = block.get("items", []) if isinstance(block, dict) else None
    if not isinstance(items, list) or not (title is None or isinstance(title, dict)):
        raise WhatsChangedProblem(f'has a round "{printable(round_id)}" that is not shaped like '
                                  '{"title": null, "items": [...]}')
    return without_notes(title), without_notes(items)


def whats_changed_answer(round_id: str) -> dict:
    """The answer to GET /api?action=whats_changed&round=<round_id>."""
    if not round_id:
        log("REFUSED  GET whats_changed without a round")
        return bad_request_answer('The "round" is missing. Example: ?action=whats_changed&round=DEMO-R1')
    try:
        title, items = read_whats_changed(round_id)
    except WhatsChangedProblem as problem:
        log(f"WARNING  web/config/whats_changed.json {problem}. The form falls back to its own copy of the "
            "file (or skips the screen). Fix the file and save it; no restart needed.")
        return server_error_answer(f"web/config/whats_changed.json {problem}.")
    note = "" if items else " (unknown round or no news: the form skips this screen)"
    log(f"GET  whats_changed  round={printable(round_id)}  -> {len(items)} item(s){note}")
    return {"ok": True, "round": round_id, "title": title, "items": items}


# ============================================================================
# The questionnaire for the form: "bootstrap" (docs/submission-format.md, section 4)
# ============================================================================

def shown_name(path: Path) -> str:
    """A file's name as people know it, e.g. web/config/survey.json."""
    try:
        return path.relative_to(REPO_DIR).as_posix()
    except ValueError:
        return str(path)


def read_json_file(path: Path, what: str):
    """Read one of the form's JSON files, or raise QuestionnaireFileProblem with a plain reason."""
    name = shown_name(path)
    try:
        content = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise QuestionnaireFileProblem(f"{name} ({what}) is missing") from None
    except json.JSONDecodeError as error:
        raise QuestionnaireFileProblem(f"{name} ({what}) has a mistake on line {error.lineno}, "
                                       f"column {error.colno} ({error.msg})") from None
    except (OSError, ValueError) as error:
        raise QuestionnaireFileProblem(f"{name} ({what}) cannot be read ({error})") from None
    if not isinstance(content, dict):
        raise QuestionnaireFileProblem(f"{name} ({what}) is not shaped like {{...}}")
    return content


def survey_as_published(survey: dict) -> dict:
    """survey.json the way the live backend hands out a published questionnaire:
    without the notes for humans, and without the settings the form always
    takes from its own copy (where answers go, and the test-link defaults)."""
    survey = without_notes(survey)
    survey.pop("links", None)
    backend = survey.get("backend")
    if isinstance(backend, dict):
        for name in FORM_ONLY_BACKEND_SETTINGS:
            backend.pop(name, None)
    return survey


def read_audio_clips() -> dict:
    """The read-aloud clips from web/config/audio_clips.json. The file is
    optional: if it is missing or broken, there are simply no clips."""
    if not AUDIO_CLIPS_FILE.exists():
        return {}
    try:
        content = read_json_file(AUDIO_CLIPS_FILE, "read-aloud clips")
    except QuestionnaireFileProblem as problem:
        log(f"WARNING  {problem}. The questionnaire is sent without read-aloud clips (they are optional).")
        return {}
    clips = content.get("clips")
    return without_notes(clips) if isinstance(clips, dict) else {}


def bootstrap_answer(round_id: str, draft: bool, settings: Settings) -> dict:
    """The answer to GET /api?action=bootstrap&round=<round_id>[&draft=1]:
    the questionnaire built from the files in web/, shaped like the live
    backend's answer. Every file is read again, so edits show up at once.
    draft=1 (preview links) gets the same content here: on this Mac the files
    in web/ are both the draft and the published version."""
    if not round_id:
        log("REFUSED  GET bootstrap without a round")
        return bad_request_answer('The "round" is missing. Example: ?action=bootstrap&round=DEMO-R1')
    if not DC_OR_ROUND_RULE.fullmatch(round_id) or round_id in (".", ".."):
        log(f'REFUSED  GET bootstrap for an invalid round "{printable(round_id)}"')
        return bad_request_answer('The "round" is not valid. It must be 1 to 64 characters: '
                                  'letters, digits, "-", "_" or ".".')
    try:
        survey = survey_as_published(read_json_file(SURVEY_FILE, "the questionnaire"))
        strings = without_notes(read_json_file(STRINGS_FILE, "the texts"))
        title, items = read_whats_changed(round_id)
    except QuestionnaireFileProblem as problem:
        log(f"WARNING  {problem}. The form falls back to its own copy of the files, which has the same "
            "problem: fix the file and save it; no restart needed. (python3 scripts/check_config.py finds it.)")
        return server_error_answer(f"{problem}.")
    except WhatsChangedProblem as problem:
        log(f"WARNING  web/config/whats_changed.json {problem}. The form falls back to its own copy of the "
            "files. Fix the file and save it; no restart needed.")
        return server_error_answer(f"web/config/whats_changed.json {problem}.")
    status = settings.round_status(round_id)
    flow = survey.get("flow")
    screens = len(flow) if isinstance(flow, list) else 0
    kind = "  (preview of the draft)" if draft else ""
    log(f"GET  bootstrap{kind}  round={printable(round_id)} ({status})  -> questionnaire "
        f"{printable(survey.get('config_version', '?'))}, {screens} screens, {len(strings)} texts, "
        f"{len(items)} 'what changed' item(s)")
    return {
        "ok": True,
        "draft": draft,
        "round": {"id": round_id, "status": status},
        "version": None,                           # only the live backend numbers its published versions
        "config_version": survey.get("config_version"),
        "survey": survey,
        "strings": strings,
        "whats_changed": {"title": title, "items": items},
        "clips": read_audio_clips(),
    }


# ============================================================================
# Serving the survey form's files from web/
# ============================================================================

def split_request_target(target: str) -> tuple[str, str]:
    """'/api?action=health' -> ('/api', 'action=health')"""
    path, _, query = target.partition("?")
    return path.partition("#")[0], query


def is_api_path(path: str) -> bool:
    return path in ("/api", "/api/")


def find_web_file(url_path: str) -> Path | None:
    """The file inside web/ that a browser address points to, or None.
    Refuses anything outside web/ (such as /../scripts/...), hidden files
    (names starting with "."), and folders, so folder contents are never listed."""
    decoded = unquote(url_path)                         # e.g. %2e%2e becomes ..
    if "\x00" in decoded or "\\" in decoded:
        return None
    parts = [part for part in decoded.split("/") if part]
    if any(part.startswith(".") for part in parts):     # this also catches ".."
        return None
    candidate = WEB_DIR.joinpath(*parts)
    try:
        if candidate.is_dir():
            candidate = candidate / "index.html"
        candidate = candidate.resolve()
        # Last line of defence, e.g. against a shortcut (symlink) leading out of web/.
        if not candidate.is_relative_to(WEB_DIR.resolve()) or not candidate.is_file():
            return None
    except (OSError, ValueError):
        return None
    return candidate


BYTE_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


def requested_byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Understand 'Range: bytes=START-END'. Safari asks for audio this way and
    will not play it otherwise. Returns (start, end), or None for "the whole file"."""
    match = BYTE_RANGE.fullmatch((header or "").strip())
    if not match or match.group(1) == match.group(2) == "":
        return None                            # no range, or a kind we do not handle
    first, last = match.groups()
    if first == "":                            # "bytes=-500" means "the last 500 bytes"
        if int(last) == 0 or size == 0:
            raise RangeNotSatisfiable()
        return max(0, size - int(last)), size - 1
    start = int(first)
    if last and int(last) < start:
        return None                            # a nonsense range: send the whole file
    if start >= size:
        raise RangeNotSatisfiable()
    end = size - 1 if last == "" else min(int(last), size - 1)
    return start, end


# ============================================================================
# The web server
# ============================================================================

class RequestHandler(BaseHTTPRequestHandler):
    """Answers one request from a browser: a file of the form, or an /api message."""

    server_version = "ValmoPulseMock/1.0"
    timeout = 60   # give up on a connection that stays silent this many seconds

    # ---- Python calls do_<METHOD> for each request --------------------------

    def do_GET(self):
        path, query = split_request_target(self.path)
        if not is_api_path(path):
            self.serve_web_file(path, include_body=True)
            return
        try:
            answer = self.answer_api_get(query)
        except (ConnectionError, TimeoutError, socket.timeout):
            raise                              # the phone went away: nobody to answer
        except Exception:                      # a bug in this script, not a problem with the request
            with PRINT_LOCK:
                print(f"{datetime.now():%H:%M:%S}  ERROR  something unexpected went wrong while answering a "
                      "GET request. The form uses its own copy of the questionnaire meanwhile. Technical "
                      "details for whoever maintains this script:", flush=True)
                traceback.print_exc(file=sys.stdout)
                sys.stdout.flush()
            answer = server_error_answer("Unexpected problem in the mock server. Please retry.")
        self.send_json(200, answer)

    def do_HEAD(self):
        path, _ = split_request_target(self.path)
        self.serve_web_file(path, include_body=False)

    def do_OPTIONS(self):
        """A browser asking "may I send this?" (CORS). The form avoids these
        questions on purpose (see the contract), but the answer is always yes."""
        path, _ = split_request_target(self.path)
        if not is_api_path(path):
            self.send_plain_text(404, "Not found.\n")
            return
        requested = self.headers.get("Access-Control-Request-Headers", "")
        allowed_headers = requested if re.fullmatch(r"[A-Za-z0-9, -]+", requested) else "Content-Type"
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", allowed_headers)
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path, _ = split_request_target(self.path)
        if not is_api_path(path):
            self.discard_body(self.body_length())
            self.send_plain_text(404, "Not found. Survey answers are sent to /api.\n")
            log(f"NOT FOUND  a message was sent to {printable(path, 80)}; answers must be sent to /api")
            return
        try:
            status, answer = self.handle_api_post()
        except (ConnectionError, TimeoutError, socket.timeout):
            raise                              # the phone went away mid-message: nobody to answer
        except Exception:                      # a bug in this script, not a problem with the message
            with PRINT_LOCK:
                print(f"{datetime.now():%H:%M:%S}  ERROR  something unexpected went wrong while handling a "
                      "message. The form was told to retry later. Technical details for whoever maintains "
                      "this script:", flush=True)
                traceback.print_exc(file=sys.stdout)
                sys.stdout.flush()
            status, answer = 200, server_error_answer("Unexpected problem in the mock server. Please retry.")
        if self.server.settings.slow_seconds:
            time.sleep(self.server.settings.slow_seconds)   # --slow: imitate slow mobile data
        self.send_json(status, answer)

    def log_message(self, format, *args):
        """Silence Python's built-in log line for every file; this script prints its own lines."""

    # ---- /api -----------------------------------------------------------------

    def answer_api_get(self, query: str) -> dict:
        """The answer to GET /api?action=health, ?action=bootstrap&round=X[&draft=1] or ?action=whats_changed&round=X"""
        params = parse_qs(query, keep_blank_values=True)
        action = params.get("action", [""])[0]
        if action == "health":
            log("GET  health check")
            answer = {"ok": True, "service": SERVICE_NAME, "mode": "mock", "time": utc_now_iso()}
        elif action == "bootstrap":
            answer = bootstrap_answer(params.get("round", [""])[0], params.get("draft", [""])[0] == "1",
                                      self.server.settings)
        elif action == "whats_changed":
            answer = whats_changed_answer(params.get("round", [""])[0])
        else:
            log(f'REFUSED  GET with unknown action "{printable(action)}"' if action
                else "REFUSED  GET /api without an action")
            answer = bad_request_answer('Unknown or missing "action". Use ?action=bootstrap&round=<round>, '
                                        '?action=whats_changed&round=<round> or ?action=health.')
        return answer

    def handle_api_post(self) -> tuple[int, dict]:
        """Read one message sent to POST /api and work out the answer.
        Returns (HTTP status, answer). The status is 200 except for the
        deliberate 503 (--fail-rate) and 413 (message too big)."""
        settings = self.server.settings
        length = self.body_length()
        if length > MAX_BODY_BYTES:
            self.discard_body(length)
            size = f"{length / MEGABYTE:.1f} MB"
            log(f"REFUSED  message too big ({size}; the limit is 25 MB), not saved")
            return 413, bad_request_answer(f"The message is {size}, more than the 25 MB limit.")
        body = self.rfile.read(length)
        if random.random() < settings.fail_rate:
            log(f"FAILED ON PURPOSE  answered error 503 (--fail-rate {settings.fail_rate:g}); "
                "nothing saved, the form should retry")
            return 503, server_error_answer("Simulated failure (--fail-rate). Nothing was saved; please send again.")
        try:
            message = parse_message(body)
            if message["kind"] == "submit":
                return 200, self.handle_submit(message)
            return 200, self.handle_ping(message)
        except BadRequest as problem:
            log(f"REFUSED  bad request: {problem}")
            return 200, bad_request_answer(str(problem))

    def handle_submit(self, message: dict) -> dict:
        """A finished survey: check it, then save it (once).
        Same order as the live backend (the message, the token, then the round),
        except that the voice notes are decoded with the message, before the
        token (docs/submission-format.md, section 11)."""
        settings, store = self.server.settings, self.server.store
        voice_notes = check_submit(message)
        token_ok = token_is_valid(settings.secret, message)
        if not token_ok and settings.strict:
            log(f"REFUSED  SUBMIT  {message['dc']}  {message['round']}  token WRONG (--strict is on), not saved")
            return bad_token_answer()
        status = settings.round_status(message["round"])
        if status == "draft":
            log(f"REFUSED  SUBMIT  {message['dc']}  {message['round']}  this round is not open yet "
                "(--draft-rounds): answered round_not_open, not saved")
            return round_not_open_answer()
        late = status == "closed"
        try:
            result = store.save_submission(message, voice_notes, token_ok, late=late)
        except OSError as error:
            log_save_problem(store.data_dir, error)
            return server_error_answer("The mock server could not save the answers on this computer. Please retry.")
        log(describe_submission(message, voice_notes, token_ok, result, late))
        return {"ok": True, "submission_id": message["submission_id"],
                "duplicate": result.duplicate, "received_at": result.received_at}

    def handle_ping(self, message: dict) -> dict:
        """A progress signal (opened / started / progress): check it and save it."""
        settings, store = self.server.settings, self.server.store
        check_ping(message)
        token_ok = token_is_valid(settings.secret, message)
        stage = message["stage"]
        who = f"PING {stage}  {message['dc']}  {message['round']}"
        if not token_ok and settings.strict:
            log(f"REFUSED  {who}  token WRONG (--strict is on), not saved")
            return bad_token_answer()
        status = settings.round_status(message["round"])
        if status == "draft":
            log(f"REFUSED  {who}  this round is not open yet (--draft-rounds): answered round_not_open, not saved")
            return round_not_open_answer()
        record = {key: value for key, value in message.items() if key != "t"}
        record.update(received_at=utc_now_iso(), token_valid=token_ok)
        try:
            store.save_ping(record)
        except OSError as error:
            log_save_problem(store.data_dir, error)
            return server_error_answer("The mock server could not save this signal on this computer. Please retry.")
        if stage != "opened":
            log(f"{who}  {describe_ping(message)}  {token_label(token_ok)}")
            return {"ok": True}
        already = settings.one_response_per_dc and store.dc_already_answered(message["dc"], message["round"])
        closed_note = "  (round closed)" if status == "closed" else ""
        log(f"{who}  {describe_ping(message)}  {token_label(token_ok)}  "
            f"already submitted: {'yes' if already else 'no'}{closed_note}")
        return {"ok": True, "token_valid": token_ok, "already_submitted": already, "round_status": status}

    def body_length(self) -> int:
        """Size of the message in bytes, as the browser announced it (0 if it did not say)."""
        try:
            return max(0, int(self.headers.get("Content-Length", "0")))
        except ValueError:
            return 0

    def discard_body(self, length: int) -> None:
        """Read and throw away a message we refuse, so the browser reliably gets
        our answer (closing the line in the middle of an upload looks like a
        network failure to the browser)."""
        remaining = min(length, 4 * MAX_BODY_BYTES)
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 64 * 1024))
            if not chunk:
                break
            remaining -= len(chunk)

    # ---- files of the form ----------------------------------------------------

    def serve_web_file(self, url_path: str, include_body: bool) -> None:
        """Send one file from web/ to the browser (HEAD requests get only the headers)."""
        file_path = find_web_file(url_path)
        try:
            data = file_path.read_bytes() if file_path else None
        except OSError:
            data = None
        if data is None:
            self.send_not_found(url_path, include_body)
            return
        try:
            byte_range = requested_byte_range(self.headers.get("Range"), len(data))
        except RangeNotSatisfiable:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{len(data)}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if byte_range is None:
            self.send_response(200)
        else:
            start, end = byte_range
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
            data = data[start:end + 1]
        self.send_header("Content-Type", CONTENT_TYPES.get(file_path.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")   # always show the latest version of a file you edit
        self.end_headers()
        if include_body:
            self.wfile.write(data)

    def send_not_found(self, url_path: str, include_body: bool) -> None:
        if url_path in ("/", "/index.html") and not (WEB_DIR / "index.html").is_file():
            text = ("The survey page (web/index.html) does not exist yet, so there is nothing to show here.\n"
                    "The /api part of this mock server already works.\n")
        else:
            text = "Not found.\n"
        self.send_plain_text(404, text, include_body)
        if url_path != "/favicon.ico":         # browsers ask for this icon by themselves; not worth a line
            log(f"NOT FOUND  {printable(url_path, 80)}")

    # ---- sending answers ----------------------------------------------------

    def send_json(self, status: int, answer: dict) -> None:
        body = to_json_line(answer).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")   # the live form runs on another site (GitHub Pages)
        self.end_headers()
        self.wfile.write(body)

    def send_plain_text(self, status: int, text: str, include_body: bool = True) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def token_label(token_ok: bool) -> str:
    return "token OK" if token_ok else "token WRONG"


def describe_ping(message: dict) -> str:
    """e.g. 'lang=hi  screen=nps  step=2/13' (only the parts the signal has)."""
    parts = [f"lang={printable(message.get('lang', '-'), 12)}"]
    if message.get("screen"):
        parts.append(f"screen={printable(message['screen'])}")
    if message.get("step_index") is not None:
        step, total = printable(message.get("step_index"), 6), printable(message.get("step_total", "?"), 6)
        parts.append(f"step={step}/{total}")
    return "  ".join(parts)


def describe_submission(message: dict, voice_notes: list[VoiceNote], token_ok: bool, result: SaveResult,
                        late: bool = False) -> str:
    """One log line about a submission. Counts only: answers are never printed."""
    who = f"SUBMIT  {message['dc']}  {message['round']}"
    if result.duplicate:
        return f"{who}  sent again ({message['submission_id']}): already saved, nothing new written"
    texts = sum(1 for item in message["free_text"]
                if isinstance(item.get("text"), str) and item["text"].strip())
    nps = message["answers"].get("nps", "-")
    line = (f"{who}  lang={printable(message['lang'], 12)}  nps={printable(nps, 6)}  "
            f"ratings={len(message['ratings'])}  voice notes={len(voice_notes)}  texts={texts}  "
            f"{token_label(token_ok)}  -> saved")
    if not token_ok:
        line += " (lenient mode: marked token_valid=false)"
    if late:
        line += "  [round closed: saved, marked late=true]"
    if result.seen_before:
        line += "  [this DC already answered this round; the dashboard keeps the latest]"
    return line


class MockServer(ThreadingHTTPServer):
    """The web server, plus the settings and the store that every request shares."""

    daemon_threads = True    # Ctrl+C stops the server at once, without waiting for slow phones

    def __init__(self, address: tuple[str, int], settings: Settings, store: Store):
        self.settings = settings
        self.store = store
        super().__init__(address, RequestHandler)

    def server_bind(self):
        # The standard version also looks up this computer's network name,
        # which can take several seconds on some networks. It is not needed.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]

    def handle_error(self, request, client_address):
        # A phone that closes the page or loses signal in the middle of a
        # request is normal: no need for a scary error message.
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError, socket.timeout)):
            return
        log("ERROR  something unexpected went wrong while answering a request. Technical details:")
        super().handle_error(request, client_address)


# ============================================================================
# Start-up messages
# ============================================================================

def lan_ip_address() -> str | None:
    """This Mac's address on the local network (e.g. 192.168.1.23), or None."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Nothing is sent: "connecting" this kind of socket only makes the Mac
        # choose which network connection it would use, and so its address.
        probe.connect(("10.254.254.254", 1))
        address = probe.getsockname()[0]
        return None if address.startswith(("0.", "127.")) else address
    except OSError:
        return None
    finally:
        probe.close()


def print_banner(settings: Settings, store: Store, unreadable_lines: list[int]) -> None:
    """Tell the user, in plain words, what is running and how to use it."""
    lan_ip = lan_ip_address() if settings.lan else None
    base_url = f"http://{lan_ip or 'localhost'}:{settings.port}"
    rule = "=" * 78
    say(rule)
    say(" Valmo Partner Pulse: local test server (pretend backend) is running")
    say(rule)
    if settings.lan:
        say(f" Listening on port {settings.port} for this Mac AND for phones on the same Wi-Fi.")
    else:
        say(f" Listening on port {settings.port}, for this Mac only.")
    say(f" Survey form:    {base_url}/")
    say(f" Backend (API):  {base_url}/api")
    say(f" Answers saved:  {settings.data_dir}")
    say(f"                 (responses.jsonl, events.jsonl and audio/; so far {len(store.received_at_by_id)} "
        f"survey(s) from {store.count_dcs()} DC(s))")
    say("")
    say(" Settings:")
    if settings.strict:
        say("   Token check:          STRICT: messages with a wrong link token are refused and not saved")
    else:
        say("   Token check:          lenient: wrong tokens are accepted and saved, marked token_valid=false")
        say("                         (add --strict to refuse them, like the live system)")
    if settings.one_response_per_dc:
        say("   One response per DC:  on: a DC that already answered this round is told 'already received'")
    else:
        say("   One response per DC:  off: you can retake the survey as often as you like")
    say("   Simulated failures:   " + (f"{settings.fail_rate * 100:g}% of sends get error 503 on purpose"
                                       if settings.fail_rate else "off"))
    say("   Simulated slow data:  " + (f"every send waits {settings.slow_seconds:g} s before it is answered"
                                       if settings.slow_seconds else "off"))
    say("   Token secret:         " + ("the built-in test secret" if settings.secret_is_default
                                       else "taken from the MOCK_SECRET setting"))
    print_round_settings(settings)
    print_warnings(settings, unreadable_lines, lan_ip)
    say("")
    say(f" Ready-to-click test links (fake demo DCs, round {DEMO_ROUND}, genuine tokens):")
    for label, dc, lang in DEMO_LINKS:
        say(f"   {label} ({dc}):")
        say(f"      {demo_link(base_url, settings.secret, dc, lang)}")
    say(f"   A BROKEN link on purpose ({BROKEN_LINK_DC} with another DC's token). With --strict it")
    say("   shows 'This link is not valid':")
    say(f"      {demo_link(base_url, settings.secret, BROKEN_LINK_DC, 'en', token_dc=BROKEN_LINK_TOKEN_DC)}")
    say("   The plain address. The form then uses its built-in test DC from web/config/survey.json;")
    say("   it has no token, so with --strict it also shows 'not valid':")
    say(f"      {base_url}/?mock=1")
    say("   PREVIEW, as the control panel's Preview button makes it (works for any round, sends")
    say("   nothing, saves nothing):")
    say(f"      {base_url}/?{urlencode([('preview', '1'), ('round', DEMO_ROUND), ('lang', 'en'), ('mock', '1')])}")
    for round_id in sorted(settings.closed_rounds | settings.draft_rounds):
        say(f"   Round {round_id} ({settings.round_status(round_id)}), demo DC DC-DEMO-001:")
        say(f"      {demo_link(base_url, settings.secret, 'DC-DEMO-001', 'en', round_id=round_id)}")
    if settings.lan:
        print_phone_notes(settings.port)
    say("")
    say(" Each message from the form appears below as one line. Press Ctrl+C to stop.")
    say(rule)


def print_round_settings(settings: Settings) -> None:
    """Which rounds count as closed / not open yet (--closed-rounds, --draft-rounds)."""
    if not settings.closed_rounds and not settings.draft_rounds:
        say("   Round status:         every round is open (to test the others, add --closed-rounds or")
        say("                         --draft-rounds; see --help)")
        return
    label = "   Round status:         "
    if settings.closed_rounds:
        say(f"{label}CLOSED: {', '.join(sorted(settings.closed_rounds))}")
        say("                         new visitors see 'This survey has closed'; partners who had started")
        say("                         on that phone may finish, and those answers are saved marked late")
        label = " " * len(label)
    if settings.draft_rounds:
        say(f"{label}NOT OPEN YET (draft): {', '.join(sorted(settings.draft_rounds))}")
        say("                         links show 'This survey is not open yet'; messages are refused")
        say("                         (round_not_open); preview links still work")
    say("                         every other round is open")


def print_warnings(settings: Settings, unreadable_lines: list[int], lan_ip: str | None) -> None:
    if not (WEB_DIR / "index.html").is_file():
        say("")
        say(" NOTE: web/index.html does not exist yet, so the survey page shows 'not found'.")
        say("       The /api part works already (check it with: python3 scripts/smoke_test.py).")
    if unreadable_lines:
        shown = ", ".join(str(number) for number in unreadable_lines[:10])
        say("")
        say(f" WARNING: {len(unreadable_lines)} line(s) of responses.jsonl could not be read (line {shown}).")
        say("          They were skipped. The file itself was not changed.")
    data_dir = settings.data_dir
    if data_dir.is_relative_to(REPO_DIR) and not data_dir.is_relative_to(DEFAULT_DATA_DIR):
        say("")
        say(" NOTE: the data folder is inside the project but is not local_data/. Make sure git ignores")
        say("       it (list it in .gitignore), so test answers and voice notes are never uploaded.")
    if settings.lan and not lan_ip:
        say("")
        say(" NOTE: could not find this Mac's Wi-Fi address, so the links below use 'localhost'.")
        say("       Find the address in System Settings > Wi-Fi > Details (for example 192.168.1.23)")
        say(f"       and on the phone open  http://<that address>:{settings.port}/  instead.")


def print_phone_notes(port: int) -> None:
    say("")
    say(" PHONE TESTING (--lan is on):")
    say("   - Open the links above on a phone connected to the SAME Wi-Fi as this Mac.")
    say(f"     On this Mac itself, http://localhost:{port}/ works too.")
    say("   - Over plain http, Chrome on a phone blocks the microphone, so voice notes are not")
    say("     offered and the form falls back to typing. That is expected, not a bug.")
    say("     (Voice does work on this Mac at http://localhost. Advanced: in the phone's Chrome,")
    say("     chrome://flags > 'Insecure origins treated as secure' can allow this address.)")
    say("   - While the server runs, ANYONE on this Wi-Fi can reach it. Use --lan only on a")
    say("     network you trust, and stop the server with Ctrl+C when you are done.")
    say("   - If the phone cannot connect, macOS may be blocking it: if it asks whether Python")
    say("     may accept incoming network connections, click Allow.")


def explain_cannot_listen(error: OSError, port: int) -> None:
    if error.errno == errno.EADDRINUSE:
        say(f"Port {port} is already in use, so the server cannot start.")
        say("Most likely the mock server is already running in another Terminal window (stop it there")
        say("with Ctrl+C), or another program is using that port. To use a different port, run:")
        say(f"    python3 scripts/mock_server.py --port {port + 1 if port < 65535 else 8788}")
    elif error.errno == errno.EACCES:
        say(f"This Mac does not allow this program to use port {port}. Use a number above 1024, e.g. --port 8787")
    else:
        say(f"The server could not start on port {port}: {error.strerror or error}.")


# ============================================================================
# --reset: delete the saved test data (after the user types "yes")
# ============================================================================

def reset_saved_data(data_dir: Path) -> int:
    responses = data_dir / "responses.jsonl"
    events = data_dir / "events.jsonl"
    audio = data_dir / "audio"
    to_delete = []
    if responses.is_file():
        to_delete.append((responses, f"{count_lines(responses)} saved survey(s)"))
    if events.is_file():
        to_delete.append((events, f"{count_lines(events)} progress signal(s)"))
    if audio.exists() or audio.is_symlink():
        stranger = file_we_did_not_create(audio)
        if stranger is not None:
            say(f"To be safe, nothing was deleted: {audio} holds something this server did not create:")
            say(f"    {stranger}")
            say("Check that --data-dir points at the right folder, or delete the files by hand if you are sure.")
            return 1
        to_delete.append((audio, f"{count_files(audio)} voice-note file(s)"))
    if not to_delete:
        say(f"Nothing to delete: there is no saved test data in {data_dir}")
        return 0
    say("This will PERMANENTLY delete:")
    for path, what in to_delete:
        say(f"    {path}   ({what})")
    say("(If the mock server is running in another window, stop it first with Ctrl+C.)")
    try:
        answer = input("Type yes and press Enter to delete, or just press Enter to keep everything: ")
    except (EOFError, KeyboardInterrupt):
        say("")
        answer = ""
    if answer.strip().lower() != "yes":
        say("Nothing was deleted.")
        return 0
    try:
        for path, _ in to_delete:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
    except OSError as error:
        say(f"Could not delete everything ({error}). Close any program using these files and try again.")
        return 1
    say(f"Deleted. There is no saved test data in {data_dir} any more.")
    say("Start the server again with:  python3 scripts/mock_server.py")
    return 0


def file_we_did_not_create(audio_dir: Path) -> Path | None:
    """The first thing in the audio folder that this server would not have written, or None."""
    if audio_dir.is_symlink() or not audio_dir.is_dir():
        return audio_dir
    for path in audio_dir.rglob("*"):
        if path.is_symlink():
            return path
        if path.is_file() and path.name != ".DS_Store" and not OUR_VOICE_NOTE_NAME.fullmatch(path.name):
            return path
    return None


def count_lines(path: Path) -> int:
    with path.open(encoding="utf-8", errors="replace") as file:
        return sum(1 for line in file if line.strip())


def count_files(folder: Path) -> int:
    return sum(1 for path in folder.rglob("*") if path.is_file() and path.name != ".DS_Store")


# ============================================================================
# Command line
# ============================================================================

EXAMPLES = """\
examples:
  python3 scripts/mock_server.py                            start on http://localhost:8787
  python3 scripts/mock_server.py --lan                      phones on the same Wi-Fi can open it too
  python3 scripts/mock_server.py --strict                   refuse wrong tokens, like the live system
  python3 scripts/mock_server.py --fail-rate 0.3 --slow 3   bad network: 30% of sends fail, all are slow
  python3 scripts/mock_server.py --closed-rounds DEMO-R1    the demo round has closed
  python3 scripts/mock_server.py --draft-rounds DEMO-R1     the demo round is not open yet
  python3 scripts/mock_server.py --reset                    delete all saved test answers (asks first)

Then check it in a second Terminal window with:  python3 scripts/smoke_test.py
"""


def port_number(text: str) -> int:
    try:
        value = int(text)
    except ValueError:
        value = 0
    if not 1 <= value <= 65535:
        raise argparse.ArgumentTypeError(f"'{text}' is not a port number. Use a whole number such as 8788.")
    return value


def fraction(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        value = -1.0
    if not 0 <= value <= 1:
        raise argparse.ArgumentTypeError(f"'{text}' is not a number between 0 and 1. "
                                         "Example: --fail-rate 0.3 makes 30% of sends fail.")
    return value


def seconds(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        value = -1.0
    if not 0 <= value <= 600:
        raise argparse.ArgumentTypeError(f"'{text}' is not a number of seconds between 0 and 600. Example: --slow 3")
    return value


def round_list(text: str) -> list[str]:
    """'2026-R1, 2026-R2' -> ['2026-R1', '2026-R2'], each checked like a real round id."""
    rounds = [part.strip() for part in text.split(",") if part.strip()]
    if not rounds:
        raise argparse.ArgumentTypeError("give at least one round id, for example --closed-rounds 2026-R1")
    for round_id in rounds:
        if not DC_OR_ROUND_RULE.fullmatch(round_id) or round_id in (".", ".."):
            raise argparse.ArgumentTypeError(f"'{round_id}' is not a valid round id. Use 1 to 64 letters, digits, "
                                             "'-', '_' or '.', for example 2026-R1. Separate several with commas.")
    return rounds


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python3 scripts/mock_server.py",
        description=("Local test server for the Valmo Partner Pulse survey. It shows the form from\n"
                     "the web/ folder in your browser and pretends to be the backend at /api,\n"
                     "saving the answers in local_data/. Stop it with Ctrl+C."),
        epilog=EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--port", type=port_number, default=DEFAULT_PORT,
                        help="Port number to use (default: %(default)s). Pick another, such as 8788, if it is taken.")
    parser.add_argument("--lan", action="store_true",
                        help="Also let phones on the same Wi-Fi open the survey; prints this Mac's Wi-Fi address. "
                             "Note: on a phone over plain http, Chrome blocks the microphone, so voice falls back "
                             "to typing (expected). Anyone on the same Wi-Fi can reach the server while it runs.")
    parser.add_argument("--strict", action="store_true",
                        help="Refuse every message whose link token is wrong: answer bad_token and save nothing, "
                             "like the live system. Default: accept and save it, marked token_valid=false.")
    parser.add_argument("--one-response-per-dc", action="store_true",
                        help="When a DC that already sent a survey for this round opens its link again, tell the "
                             "form it was 'already received'. Default: off, so testers can retake freely.")
    parser.add_argument("--fail-rate", type=fraction, default=0.0, metavar="FRACTION",
                        help="Share of sends (0 to 1) that fail on purpose with error 503 and are NOT saved, to "
                             "test the form's automatic retries. Example: 0.3 means 30%% fail. Default: 0.")
    parser.add_argument("--slow", type=seconds, default=0.0, metavar="SECONDS",
                        help="Wait this many seconds before answering each send, to imitate slow mobile data. "
                             "Default: 0.")
    parser.add_argument("--closed-rounds", type=round_list, action="append", default=None, metavar="R1,R2",
                        help="Pretend these rounds (comma-separated) are CLOSED, as if closed in the control panel: "
                             "new visitors see 'This survey has closed'; a partner who had already started on that "
                             "phone may still finish, and those answers are saved marked late=true.")
    parser.add_argument("--draft-rounds", type=round_list, action="append", default=None, metavar="R1,R2",
                        help="Pretend these rounds (comma-separated) are NOT OPEN YET (draft): their links show "
                             "'This survey is not open yet', and every message for them is refused with "
                             "round_not_open and not saved. Preview links (?preview=1) still work. "
                             "Every round not listed in either option is open.")
    parser.add_argument("--data-dir", type=Path, default=None, metavar="PATH",
                        help="Folder to save answers in. Default: "
                             + str(DEFAULT_DATA_DIR).replace("%", "%%"))
    parser.add_argument("--reset", action="store_true",
                        help="Delete responses.jsonl, events.jsonl and audio/ in the data folder (after you type "
                             "yes), then exit.")
    return parser.parse_args(argv)


def stop_quietly(signum, frame):
    """Treat a 'please stop' signal from the system like Ctrl+C: stop cleanly."""
    raise KeyboardInterrupt


def main(argv: list[str] | None = None) -> int:
    if sys.version_info < (3, 11):
        say(f"This script needs Python 3.11 or newer, but it was started with Python {sys.version.split()[0]}.")
        say("Install the latest Python from https://www.python.org/downloads/ and then run it again with:")
        say("    python3 scripts/mock_server.py")
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")   # an unusual character must never stop the server
    args = parse_arguments(argv)
    data_dir = args.data_dir.expanduser().resolve() if args.data_dir else DEFAULT_DATA_DIR
    if args.reset:
        return reset_saved_data(data_dir)
    if data_dir.is_relative_to(WEB_DIR):
        say("The data folder must not be inside web/: everything in web/ can be opened by anyone who can")
        say("open the survey, and web/ gets published to GitHub Pages. Choose another folder with --data-dir.")
        return 1

    closed_rounds = frozenset(round_id for group in args.closed_rounds or [] for round_id in group)
    draft_rounds = frozenset(round_id for group in args.draft_rounds or [] for round_id in group)
    in_both = sorted(closed_rounds & draft_rounds)
    if in_both:
        say(f"A round cannot be both closed and not open yet: {', '.join(in_both)}.")
        say("Remove it from --closed-rounds or from --draft-rounds, then start the server again.")
        return 1

    secret = os.environ.get("MOCK_SECRET") or DEFAULT_SECRET
    settings = Settings(port=args.port, lan=args.lan, strict=args.strict,
                        one_response_per_dc=args.one_response_per_dc, fail_rate=args.fail_rate,
                        slow_seconds=args.slow, data_dir=data_dir, secret=secret,
                        secret_is_default=(secret == DEFAULT_SECRET),
                        closed_rounds=closed_rounds, draft_rounds=draft_rounds)
    store = Store(data_dir)
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        unreadable_lines = store.load_existing()
    except OSError as error:
        say(f"Cannot use the data folder {data_dir}: {error.strerror or error}.")
        say("Choose another folder with --data-dir, or check that this folder can be written to.")
        return 1

    host = "0.0.0.0" if args.lan else "127.0.0.1"   # 0.0.0.0 = every network connection of this Mac
    try:
        server = MockServer((host, args.port), settings, store)
    except OSError as error:
        explain_cannot_listen(error, args.port)
        return 1

    print_banner(settings, store, unreadable_lines)
    signal.signal(signal.SIGTERM, stop_quietly)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    say("")
    say(f"Server stopped. Everything it received is still saved in {data_dir}")
    say("Start it again any time with:  python3 scripts/mock_server.py")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:                  # Ctrl+C while starting up
        say("")
        say("Stopped.")
        sys.exit(0)
