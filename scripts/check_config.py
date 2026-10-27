#!/usr/bin/env python3
"""
check_config.py: the safety check for the Valmo Partner Pulse settings
=======================================================================

WHAT THIS IS FOR
    Run this after EVERY change you make to the survey's settings or texts,
    before you test the form or send any links. It reads the settings files,
    looks for mistakes that would break the form (or quietly hide a question),
    and prints a report in plain English. It also shows how much translation
    is left and how heavy the page is for a partner's phone.

HOW TO RUN
    1. Open the Terminal app.
    2. Go to the project folder (the one that contains web/ and scripts/):
           cd ~/NPSF
       (Change ~/NPSF if your copy of the project is somewhere else.)
    3. Run:
           python3 scripts/check_config.py

    To check another copy of the project (used when testing this script):
           python3 scripts/check_config.py --root /path/to/the/other/copy

WHAT IT READS (it never changes any file)
    web/config/survey.json          screens, areas, chips, colours, backend
                                    (the flow itself, meaning the screens, their
                                    order, rules, jumps, loops and endings, is
                                    checked by the project's one flow checker,
                                    web/js/flow-check.js, which this script runs
                                    with Node.js through scripts/flow.js)
    web/i18n/strings.json           every on-screen text, in every language
    web/config/whats_changed.json   content of the "What changed" screen
    web/config/audio_clips.json     optional pre-recorded read-aloud clips
                                    (and that each clip file inside web/ exists;
                                    a clip or logo may also be an https:// address)
    web/index.html, web/css/, web/js/
                                    the form itself, to measure the page
                                    weight and to see which texts its code
                                    asks for (calls written like t('ui.next')).
                                    Only the files index.html loads count: a
                                    file phones never load (web/js/flow-check.js)
                                    costs partners nothing.
    docs/flow.md                    the map of the flow, to warn when it no
                                    longer matches the questionnaire
    web/config/types.json           the catalogue of the kinds of screen
                                    ("question types": what each is called,
                                    its settings, what a rule can test, what
                                    it sends). It is made from the form's own
                                    code by  node scripts/flow.js types --write ;
                                    a copy that no longer matches the code, or
                                    a missing one, is an error. The same
                                    command checks the control panel's copy,
                                    PP_SCREEN_TYPES in apps-script/Model.gs
                                    (a warning when it is out of date).
    ES5 check                       every script web/index.html loads, every
                                    web/js/types/*.js and scripts/dev/*.js must
                                    be plain ES5, the JavaScript old Android
                                    phones (Chrome 61) run: a file with newer
                                    syntax (let, const, =>, ?., ??, template
                                    strings ...) is skipped whole by such a
                                    phone. It is an error. Checked by
                                    node scripts/flow.js es5  with the "acorn"
                                    parser from tests/node_modules (run
                                    cd tests && npm install  once); without it
                                    the check is skipped with a warning. GitHub
                                    installs acorn 8.14.0 and passes its folder
                                    as ACORN_PATH, and then a broken install is
                                    an error, so GitHub always runs the check.

WHAT IT WRITES
    Nothing. It only prints a report on the screen.

HOW TO READ THE REPORT
    ERRORS     Must fix. The form may break, or a screen may silently never
               appear. Do not send links while there are errors.
    WARNINGS   Should look at. The form still works.
    SUMMARY    Survey size, where answers go, translation progress for each
               language, and the page weight (what a phone downloads).
    The last line says "All good" or "Please fix the errors above".
    Messages that end with [flow check R1] (or another code) come from the
    flow checker; docs/flow-engine.md section 6 lists every code, and
    python3 scripts/flow.py check  shows only those, with extra notes.
    For automation: the exit code is 0 when there are no errors, and 1 when
    there are errors.

SAFETY NOTES
    - Read-only: safe to run as often as you like.
    - Needs no internet and installs nothing. Python 3.11 or newer, standard
      library only, plus Node.js 16 or newer for the flow check (free, from
      https://nodejs.org). If Node.js is missing, the report says so as an
      error and explains how to install it. GitHub installs it by itself
      (.github/workflows/deploy-pages.yml). The ES5 check also uses acorn,
      which  cd tests && npm install  puts in tests/node_modules (GitHub
      installs it by itself too).
    - It never prints partner data. The settings files must not contain any
      either: test ids must look fake, like DC-DEMO-001.
"""

from __future__ import annotations  # lets the type hints below work on older Pythons too

import argparse
import difflib
import gzip
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import traceback
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath


# =============================================================================
# 1. The rules: what correct settings look like
# =============================================================================

SURVEY_FILE = "web/config/survey.json"
STRINGS_FILE = "web/i18n/strings.json"
WHATS_CHANGED_FILE = "web/config/whats_changed.json"
AUDIO_FILE = "web/config/audio_clips.json"
FORM_CODE = "The form itself (web/index.html, web/css, web/js)"
PAGE_WEIGHT = "Page weight"
FLOW_MAP_FILE = "docs/flow.md"
TYPES_FILE = "web/config/types.json"
# Problems are printed under these headings, in this order.
GROUP_ORDER = [SURVEY_FILE, STRINGS_FILE, WHATS_CHANGED_FILE, AUDIO_FILE, FLOW_MAP_FILE, TYPES_FILE, FORM_CODE, PAGE_WEIGHT]

# The flow (screens, order, rules, jumps, loops, endings) is checked by the
# project's ONE flow checker, web/js/flow-check.js, through this command
# (Node.js); scripts/flow.py finds Node.js and explains how to install it.
FLOW_TOOL = Path(__file__).resolve().parent / "flow.js"
FLOW_WRAPPER = Path(__file__).resolve().parent / "flow.py"
FLOW_TIMEOUT_SECONDS = 300

# The six languages the project was planned for. If one is missing that is
# only a warning: the survey still works with fewer languages.
EXPECTED_LANGUAGES = ["en", "hi", "ta", "te", "kn", "ml"]
# English names, so the report can say "Tamil (ta)" rather than just "ta".
LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
    "ml": "Malayalam", "mr": "Marathi", "bn": "Bengali", "gu": "Gujarati",
    "pa": "Punjabi", "or": "Odia", "as": "Assamese", "ur": "Urdu",
}

# Permanent codes (area ids, chip codes, screen ids, option codes) end up in
# the data, the sheet and the dashboard, so they must be simple and stable.
CODE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
CODE_RULE = "only lowercase letters a-z, digits and _, starting with a letter"

HEX_COLOUR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
EXPECTED_COLOURS = ["primary", "on_primary", "background", "surface", "text",
                    "muted", "border", "error", "success"]
BCP47_RE = re.compile(r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
# Test ids are saved in the project, so they must be obviously fake.
FAKE_ID_RE = re.compile(r"DEMO|TEST|FAKE|SAMPLE|SMOKE", re.IGNORECASE)

BACKEND_MODES = ["mock", "apps_script"]
APPS_SCRIPT_PREFIX = "https://script.google.com/"
# A logo or a read-aloud clip may also be a secure web address: the same rule as
# the control panel's check (apps-script/Model.gs, PP_mdlLogoProblem_).
HTTPS_ADDRESS_RE = re.compile(r"^https://\S+$", re.IGNORECASE)
OTHER_ADDRESS_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)   # http:, data:, javascript: ...
# Round names: the control panel's rule (Model.gs PP_MDL_ROUND_RE_, Panel.html ROUND_RE).
ROUND_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
DEEP_DIVE_WHEN = ["after_all_ratings", "immediate"]
VOICE_GESTURES = ["hold", "tap"]

# Sections of survey.json. The first list has rules of its own below, so a
# missing one is an error; a missing optional one is only a warning.
REQUIRED_SECTIONS = ["branding", "backend", "rating", "deep_dive", "support", "voice", "text"]
OPTIONAL_SECTIONS = ["links", "navigation", "read_aloud", "whats_changed", "telemetry"]

KNOWN_AREA_FIELDS = ["id", "issues", "threshold"]

# Texts the form's code uses directly (not derived from survey.json).
FIXED_STRING_KEYS = """
    brand.name ui.next ui.back ui.skip ui.continue ui.submit ui.yes ui.no ui.language
    ui.close ui.listen ui.stop_listening ui.answer_all ui.choose_one lang.title
    wc.title q.fn_rating rating.1 rating.2 rating.3 rating.4 rating.5 rating.na
    q.deep_dive dd.your_rating q.tell_more dd.other_needs_detail issue.other
    voice.hold voice.tap_start voice.recording voice.recording_tap voice.too_short_tap
    voice.starting voice.seconds_left voice.saved voice.not_saved voice.play voice.pause
    voice.delete voice.redo voice.too_short voice.consent voice.consent_ok
    voice.ready voice.ready_tap voice.denied text.type_instead text.placeholder text.required
    thanks.title thanks.body thanks.close submit.sending submit.failed
    submit.retrying_in submit.retry_now submit.error submit.bad_link
    already.title already.body link.bad_title link.incomplete resume.notice
    net.offline dev.mock_banner dev.untranslated dev.start_over
    round.closed_title round.closed_body round.not_open_title round.not_open_body
    dev.preview_banner dev.preview_done
    q.tell_more_required ui.start_again dev.preview_fallback dev.preview_broken
""".split()

# A text that still starts with this tag is shown in the fallback language.
# (Same rule as the form itself: web/js/core.js.)
TRANSLATE_TAG = "[TRANSLATE]"
# Placeholders such as {s} and {n} are replaced by numbers on screen.
PLACEHOLDER_RE = re.compile(r"\{[A-Za-z0-9_]+\}")

# A text key written literally in the form's code, e.g. t('ui.next') or
# PP.t("voice.saved"). A trailing "." or a following "+" means the key is
# built in code (e.g. t('rating.' + n)), so it is a prefix, not a whole key.
T_CALL_RE = re.compile(r"""\bt\(\s*(['"])(?P<key>[a-z0-9_.]+)\1\s*(?P<plus>\+)?""")
# Where a t( call starts, and a quoted text key such as 'ui.submit' (at least
# one dot). Used to also catch keys inside a call, e.g.
# t(isLast ? 'ui.submit' : 'ui.next'), and keys kept in the code as data,
# e.g. nextLabel: 'ui.continue'.
T_CALL_START_RE = re.compile(r"\bt\(")
KEY_LITERAL_RE = re.compile(r"""(['"])(?P<key>[a-z0-9_]+(?:\.[a-z0-9_]*)+)\1(?P<plus>\s*\+)?""")
# Keys under these prefixes are fully listed by survey.json (areas, chips,
# support items, choices). The code builds them from the settings, so such a
# prefix in the code must NOT hide leftovers from the "unused texts" warning.
CONFIG_DRIVEN_PREFIXES = ("fn.", "issue.", "support.", "choice.")
# The face labels rating.1 ... rating.5 are looked up by number, never by name.
ALWAYS_USED_PREFIXES = ("rating.",)

PAGE_BUDGET_BYTES = 300 * 1024   # from the project spec
CLIP_WARN_BYTES = 150 * 1024
# Which files web/index.html loads (only those reach a partner's phone).
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
SCRIPT_SRC_RE = re.compile(r"""<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
STYLESHEET_RE = re.compile(r"""\brel\s*=\s*["']?stylesheet\b""", re.IGNORECASE)
HREF_RE = re.compile(r"""\bhref\s*=\s*["']([^"']+)["']""", re.IGNORECASE)

MISSING = object()   # marks "this field is not in the file at all"


# =============================================================================
# 2. Small helpers
# =============================================================================

def visible_items(group: dict) -> list:
    """(name, value) pairs of a { } group, skipping notes (names starting with _)."""
    return [(name, value) for name, value in group.items() if not str(name).startswith("_")]


def is_number(value) -> bool:
    """True for 3 or 2.5. False for true/false, which Python also counts as numbers."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_whole_number(value) -> bool:
    return is_number(value) and float(value).is_integer()


def is_text(value) -> bool:
    """A piece of text with something in it."""
    return isinstance(value, str) and value.strip() != ""


def show(value, limit: int = 60) -> str:
    """A value written the way it looks in the file, shortened if long."""
    if value is MISSING:
        return "missing"
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[: limit - 3] + "..."


def kind_of(value) -> str:
    """Plain-English name for what kind of value something is."""
    if value is MISSING:
        return "missing"
    if value is None:
        return "null (empty)"
    if isinstance(value, bool):
        return "true/false"
    if is_number(value):
        return "a number"
    if isinstance(value, str):
        return "text"
    if isinstance(value, list):
        return "a list [ ... ]"
    return "a group { ... }"


def quoted_list(items, limit: int = 8) -> str:
    """'"a", "b" and 3 more': keeps long lists short."""
    items = list(items)
    shown = ", ".join(f'"{item}"' for item in items[:limit])
    rest = len(items) - limit
    return shown + (f" and {rest} more" if rest > 0 else "")


def did_you_mean(word, choices) -> str:
    """' Did you mean "payments"?' when a close spelling exists, otherwise ''."""
    if not isinstance(word, str):
        return ""
    close = difflib.get_close_matches(word, [c for c in choices if isinstance(c, str)], n=1, cutoff=0.7)
    return f' Did you mean "{close[0]}"?' if close else ""


def plural(count: int, word: str, many: str = "") -> str:
    """'1 text', '3 texts'."""
    return f"{count} {word if count == 1 else (many or word + 's')}"


def kb(size: int) -> str:
    return f"{size / 1024:.1f} KB"


def needs_translation(text) -> bool:
    """The form's own rule: missing, empty, or still starting with [TRANSLATE]."""
    return not is_text(text) or text.lstrip().startswith(TRANSLATE_TAG)


def list_files(folder: Path, pattern: str) -> list:
    """All files matching pattern inside folder (and its subfolders), sorted."""
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.rglob(pattern) if path.is_file())


def actual_spelling(base: Path, rel: str):
    """The path as it is really spelled on disk (capital letters included), or
    None if it does not exist.

    Why: the Mac's disk ignores capital letters, GitHub Pages does not. A file
    called Q.nps.mp3 in the settings but q.nps.mp3 on disk works on this Mac
    and fails online, so we compare the exact spelling ourselves.
    """
    current = base
    found = []
    for part in PurePosixPath(rel).parts:
        try:
            names = os.listdir(current)
        except OSError:
            return None
        if part not in names:
            matches = [name for name in names if name.lower() == part.lower()]
            if not matches:
                return None
            part = matches[0]
        found.append(part)
        current = current / part
    return "/".join(found)


def picture_or_clip_problem(root: Path, value: str, example: str):
    """A logo or clip is either a secure web address (https://..., which the
    phone downloads from there) or a file inside web/. Same rule as the control
    panel's check. Returns a plain-English problem, or None when all is well."""
    if re.search(r"\s", value):
        return f'"{value}" must not contain spaces.'
    if HTTPS_ADDRESS_RE.match(value):
        return None
    if OTHER_ADDRESS_RE.match(value):
        return (f'"{value}" must be an https:// address (a secure web address), or a file path inside the '
                f"web folder, {example}.")
    return web_file_problem(root, value, example)


def web_file_problem(root: Path, rel: str, example: str = 'for example "audio/hi/q.nps.mp3"'):
    """Check that a path written in the settings points at a real file inside
    web/. Returns a plain-English problem, or None when all is well."""
    if rel.startswith("/") or "\\" in rel or "://" in rel or ".." in PurePosixPath(rel).parts:
        return (f'"{rel}" must be a path inside the web folder, written with forward slashes '
                f"and without a leading / or .., {example}.")
    actual = actual_spelling(root / "web", rel)
    if actual is None:
        return f"the file web/{rel} does not exist. Add the file there, or correct the path."
    if actual != str(PurePosixPath(rel)):
        return (f'the file exists as web/{actual}, but the settings say "{rel}". Capital letters must '
                "match exactly: it works on this Mac, but GitHub Pages treats them as different, "
                "so the file would not be found online.")
    if not (root / "web" / actual).is_file():
        return f"web/{rel} is a folder, not a file."
    return None


# =============================================================================
# 3. Collecting problems
# =============================================================================

class Report:
    """Collects errors and warnings, grouped by the file they belong to."""

    def __init__(self) -> None:
        self.errors: dict = {}
        self.warnings: dict = {}

    def error(self, group: str, message: str) -> None:
        self.errors.setdefault(group, []).append(message)

    def warn(self, group: str, message: str) -> None:
        self.warnings.setdefault(group, []).append(message)

    @staticmethod
    def count(problems: dict) -> int:
        return sum(len(messages) for messages in problems.values())


@dataclass
class SurveyInfo:
    """What the other checks need to know from survey.json."""
    loaded: bool = False
    language_codes: list = field(default_factory=lambda: list(EXPECTED_LANGUAGES))
    native_names: dict = field(default_factory=dict)
    fallback: str = "en"
    functions: dict = field(default_factory=dict)      # area id -> its chip codes
    support_items: list = field(default_factory=list)
    flow_screens: int = 0                              # screens (lines or nodes) the flow lists
    flow_checked: bool = False                         # the flow checker ran (Node.js found)
    flow_text_keys: dict = field(default_factory=dict) # text key -> why: what the flow shows
    flow_stats: dict = field(default_factory=dict)     # longest route, most answers ... (flow checker)
    flow_notes: int = 0                                # the flow checker's notes (not repeated here)
    type_kinds: list = field(default_factory=list)     # the kinds of screen of the catalogue (built in)
    type_added: list = field(default_factory=list)     # ... and the ones added in web/js/types/
    es5_summary: str = ""                              # what the ES5 check did, for the summary
    backend_mode: str = ""
    apps_script_url: str = ""
    required_keys: dict = field(default_factory=dict)  # text key -> why it is needed

    def name(self, code: str) -> str:
        """'Tamil (ta)'."""
        return f"{LANGUAGE_NAMES.get(code) or self.native_names.get(code) or code} ({code})"


@dataclass
class FormCode:
    """What the form's own code tells us about the texts it uses."""
    found: bool = False
    keys: dict = field(default_factory=dict)       # text key -> where it is used (must exist)
    prefixes: set = field(default_factory=set)     # keys built in code, e.g. 'rating.'
    mentioned: set = field(default_factory=set)    # key-like texts anywhere in the code


# =============================================================================
# 4. Reading the JSON files (with friendly explanations of syntax mistakes)
# =============================================================================

EXTRA_COMMA = ("there is an extra comma after the last item, just before a closing } or ]. "
               "Delete that comma.")
MISSING_COMMA = ("a comma is missing right after the marked spot: there must be a comma "
                 "between two items (usually at the end of the line).")
UNESCAPED_QUOTE = ('a text contains a double quote (") which ends the text too early. Inside a '
                   "text write \\\" instead, or use a different quote mark such as ' or “ ”.")
# Curly quotes, as typed by TextEdit (Smart Quotes), Word or WhatsApp. They are
# fine INSIDE a text, but JSON needs straight quotes around names and values.
CURLY_QUOTES = "“”‘’"
CURLY_QUOTE = ('curly quotes (“ ” or ‘ ’), probably typed by TextEdit, Word or WhatsApp. Around names '
               'and values JSON needs straight double quotes ("). Retype them; in TextEdit first turn '
               "off Edit > Substitutions > Smart Quotes.")


def load_json(root: Path, rel_path: str, report: Report):
    """Read one settings file. Returns its content, or None if it cannot be used."""
    path = root / rel_path
    if not path.is_file():
        report.error(rel_path, "This file is missing, and the form needs it. Put it back "
                               "(for example from git, or from the last copy that worked).")
        return None
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as problem:
        line = raw[: problem.start].count(b"\n") + 1
        report.error(rel_path, f"The file is not saved as UTF-8 text (the problem is on line {line}), "
                               "so Indian-language letters would be garbled. Save it again with the "
                               "encoding set to UTF-8.")
        return None
    if text.startswith("\ufeff"):
        report.warn(rel_path, "The file starts with an invisible 'byte order mark' (BOM). Browsers "
                              "ignore it, but other tools may not. If your editor offers it, save the "
                              "file as plain 'UTF-8' (without BOM).")
        text = text[1:]
    repeated: list = []
    try:
        data = json.loads(text, object_pairs_hook=remember_repeated_names(repeated),
                          parse_constant=refuse_constant)
    except json.JSONDecodeError as problem:
        report.error(rel_path, explain_json_error(text, problem))
        return None
    except ValueError as problem:   # NaN or Infinity, see refuse_constant()
        report.error(rel_path, str(problem))
        return None
    for name in sorted(set(repeated)):
        report.error(rel_path, repeated_name_message(text, name))
    if not isinstance(data, dict):
        report.error(rel_path, "The whole file must be one group in curly brackets { ... }.")
        return None
    return data


def remember_repeated_names(repeated: list):
    """JSON quietly keeps only the LAST of two entries with the same name, so
    an edit can vanish without a trace. This notes every repeated name."""
    def build_group(pairs):
        group = {}
        for name, value in pairs:
            if name in group:
                repeated.append(name)
            group[name] = value
        return group
    return build_group


def refuse_constant(name: str):
    """Python accepts NaN and Infinity, but browsers refuse the whole file."""
    raise ValueError(f"The file contains {name}, which is not allowed in JSON: browsers would "
                     "refuse the whole file. Write a normal number instead.")


def repeated_name_message(text: str, name: str) -> str:
    pattern = re.compile(re.escape(json.dumps(name, ensure_ascii=False)) + r"\s*:")
    lines = [str(n) for n in sorted({text.count("\n", 0, match.start()) + 1 for match in pattern.finditer(text)})]
    where = f" (lines {', '.join(lines[:-1])} and {lines[-1]})" if 2 <= len(lines) <= 6 else ""
    return (f'The name "{name}" appears twice inside the same {{ }} group{where}. Only the last one '
            "counts; the other is silently ignored. Delete one of them, or rename it if it was "
            "meant to be a new entry.")


def explain_json_error(text: str, problem: json.JSONDecodeError) -> str:
    """Turn Python's JSON error into: where it is, the line itself, and a likely cause."""
    spot, cause = guess_json_mistake(text, problem.pos, problem.msg)
    line_start = text.rfind("\n", 0, spot) + 1
    line_end = text.find("\n", spot)
    line_no = text.count("\n", 0, spot) + 1
    column = spot - line_start + 1
    lines = [
        "The file is not valid JSON, so the form cannot read it at all.",
        f"Where: line {line_no}, column {column} (marked with >> << below).",
        f"|Line {line_no}: {mark_spot(text, spot)}",
        f"Likely cause: {cause}",
    ]
    this_line = text[line_start:line_end if line_end != -1 else len(text)]
    if cause != CURLY_QUOTE and any(quote in this_line for quote in CURLY_QUOTES):
        lines.append('Also check: this line contains curly quotes (“ ” or ‘ ’). Inside a text they are '
                     'fine, but around names and values JSON needs straight double quotes (").')
    return "\n".join(lines)


def previous_visible(text: str, pos: int) -> int:
    """Index of the last non-space character before pos (-1 if none)."""
    i = pos - 1
    while i >= 0 and text[i].isspace():
        i -= 1
    return i


def next_visible(text: str, pos: int) -> int:
    """Index of the first non-space character from pos on (-1 if none)."""
    i = pos
    while i < len(text) and text[i].isspace():
        i += 1
    return i if i < len(text) else -1


def guess_json_mistake(text: str, pos: int, msg: str):
    """Best guess at the real mistake. Returns (position to show, explanation)."""
    here = text[pos:pos + 1]
    before = previous_visible(text, pos)
    after = next_visible(text, pos + 1)
    if here and here in CURLY_QUOTES:   # (an empty string is "in" every string)
        return pos, CURLY_QUOTE
    # Extra comma before } or ]. Python 3.13+ points at the comma itself,
    # older versions point at the bracket after it: handle both.
    if here == "," and after != -1 and text[after] in "}]":
        return pos, EXTRA_COMMA
    if here in ("}", "]") and before != -1 and text[before] == ",":
        return before, EXTRA_COMMA
    if msg.startswith("Expecting ',' delimiter"):
        if pos > 0 and text[pos - 1] == '"' and not here.isspace():
            return pos - 1, UNESCAPED_QUOTE
        return (before if before >= 0 else pos), MISSING_COMMA
    return pos, other_json_cause(text, pos, msg)


def other_json_cause(text: str, pos: int, msg: str) -> str:
    here = text[pos:pos + 1]
    if msg.startswith("Expecting ':' delimiter"):
        return ('a colon (:) is missing after a name, or a name contains a double quote ("). '
                'Each entry looks like "name": value.')
    if msg.startswith("Unterminated string"):
        return 'this text has no closing double quote ("). Add the missing " at its end.'
    if msg.startswith("Invalid control character"):
        return ('a text is not closed with a double quote (") before the end of the line, or it '
                "is split over two lines. Keep each text on one line and close it with \".")
    if "escape" in msg:
        return "a backslash (\\) inside a text. Write \\\\ for a real backslash, or remove it."
    if msg.startswith("Extra data"):
        return ("there is something after the final closing }, for example an extra } or a "
                "second copy pasted at the end. The file must be exactly one { ... } group.")
    if here == "/":
        return ('JSON files cannot contain comments (// or /* */). For a note, add an entry whose '
                'name starts with _, for example "_note": "...".')
    if here == "'":
        return "texts and names must use double quotes (\"), not single quotes (')."
    if re.match(r"(True|False|None|TRUE|FALSE|NULL|Null)\b", text[pos:pos + 5]):
        return "true, false and null must be written in lowercase, without quotes."
    if msg.startswith("Expecting value") and next_visible(text, pos) == -1:
        return "the file is empty or cut off before its end (a closing } or ] is missing)."
    if msg.startswith("Expecting property name"):
        return 'every name must be in double quotes, for example "en": "...".'
    if msg.startswith("Expecting value"):
        return ("a value is missing or written wrongly here. Texts need double quotes, numbers "
                "have none, and true, false and null are lowercase.")
    return "check the marked spot for a missing or extra comma, bracket or quote."


def mark_spot(text: str, spot: int) -> str:
    """The line around spot, with the character at spot marked like >>,<<.
    Long lines keep their start (which names the entry) and the part just
    before the spot."""
    start = text.rfind("\n", 0, spot) + 1
    end = text.find("\n", spot)
    end = len(text) if end == -1 else end
    before, after = text[start:spot].lstrip(), text[spot + 1:end]
    char = text[spot:spot + 1]
    if spot >= len(text):
        char = "(end of file)"
    elif char == "\n":
        char = "(end of line)"
    if len(before) > 70:
        before = before[:25] + " ... " + before[-40:]
    if len(after) > 25:
        after = after[:22] + "..."
    return f"{before}>>{char}<<{after}"


# =============================================================================
# 5. survey.json
# =============================================================================

def check_survey(survey, root: Path, r: Report) -> SurveyInfo:
    info = SurveyInfo()
    if survey is None:
        return info
    info.loaded = True
    check_identity(survey, r)
    check_sections_present(survey, r)
    check_branding(survey.get("branding"), root, r)
    check_backend(survey.get("backend"), info, r)
    check_links(survey.get("links"), r)
    check_languages(survey, info, r)
    check_small_sections(survey, r)
    check_rating(survey.get("rating"), r)
    check_deep_dive(survey.get("deep_dive"), info, r)
    check_functions(survey.get("functions", MISSING), info, r)
    check_support(survey.get("support"), info, r)
    check_voice(survey.get("voice"), r)
    check_text_box(survey.get("text"), r)
    check_flow(survey, root, info, r)
    info.required_keys = keys_needed_by_settings(survey, info)
    return info


def check_identity(survey: dict, r: Report) -> None:
    if not is_text(survey.get("survey_id")):
        r.error(SURVEY_FILE, 'survey_id must be a short name in double quotes, like "valmo-partner-pulse". '
                             "Every answer is stamped with it.")
    version = survey.get("config_version", MISSING)
    if not is_text(version):
        now = "missing" if version is MISSING else f"{show(version)} ({kind_of(version)})"
        r.error(SURVEY_FILE, f"config_version is {now}, but it must be text in double quotes, for example "
                             '"2026-10-19.1". Change it whenever you change questions, areas or chips.')


def check_sections_present(survey: dict, r: Report) -> None:
    for name in REQUIRED_SECTIONS + OPTIONAL_SECTIONS:
        value = survey.get(name, MISSING)
        if value is MISSING:
            message = (f'The "{name}" section is missing. Put it back (copy it from the last version '
                       "that worked).")
            if name in REQUIRED_SECTIONS:
                r.error(SURVEY_FILE, message + " The form needs it.")
            else:
                r.warn(SURVEY_FILE, message + " Without it the form uses its own defaults.")
        elif not isinstance(value, dict):
            r.error(SURVEY_FILE, f'"{name}" must be a group in curly brackets {{ ... }}, but it is {kind_of(value)}.')


def check_bool(group: dict, where: str, name: str, r: Report) -> None:
    """Optional true/false switch. Why it matters: written in quotes ("false")
    it is text, and the form treats any text as switched ON."""
    value = group.get(name, MISSING)
    if value is not MISSING and not isinstance(value, bool):
        r.error(SURVEY_FILE, f"{where} > {name} is {show(value)}, but it must be true or false "
                             "(lowercase, without quotes). In quotes it is text, and the form "
                             "would treat any text as switched on.")


def check_range(group: dict, where: str, name: str, low, high, r: Report,
                whole: bool = False, unit: str = "") -> bool:
    """A number from low to high (both included). Returns True when it is fine."""
    value = group.get(name, MISSING)
    if not is_number(value) or (whole and not is_whole_number(value)) or not low <= value <= high:
        number = "a whole number" if whole else "a number"
        r.error(SURVEY_FILE, f"{where} > {name} is {show(value)}. It must be {number} from {low} to "
                             f"{high}{unit}, written without quotes.")
        return False
    return True


def check_positive(group: dict, where: str, name: str, r: Report, unit: str = " seconds") -> None:
    value = group.get(name, MISSING)
    if not is_number(value) or value <= 0:
        r.error(SURVEY_FILE, f"{where} > {name} is {show(value)}. It must be a number above 0"
                             f"{unit}, written without quotes.")


def check_branding(branding, root: Path, r: Report) -> None:
    if not isinstance(branding, dict):
        return
    colours = branding.get("colors", MISSING)
    if not isinstance(colours, dict):
        r.error(SURVEY_FILE, 'branding > colors must be a group of colours like {"primary": "#4B2E83", ...}.')
    else:
        for name, value in visible_items(colours):
            if not isinstance(value, str) or not HEX_COLOUR_RE.match(value):
                r.error(SURVEY_FILE, f"branding > colors > {name} is {show(value)}, but colours must look "
                                     'like "#RRGGBB": a # and exactly 6 characters from 0-9 and A-F, '
                                     'for example "#4B2E83".')
        missing = [name for name in EXPECTED_COLOURS if name not in colours]
        if missing:
            r.warn(SURVEY_FILE, f"branding > colors has no {quoted_list(missing)}. Put "
                                f"{'it' if len(missing) == 1 else 'them'} back so every part of the "
                                "form gets the intended colour.")
    logo = branding.get("logo", "")
    if logo in (None, ""):
        return
    if not isinstance(logo, str):
        r.error(SURVEY_FILE, 'branding > logo must be an https:// address or a file path inside web/, in double '
                             'quotes, or "" for no logo.')
        return
    problem = picture_or_clip_problem(root, logo, 'for example "assets/logo.svg"')
    if problem:
        r.error(SURVEY_FILE, f"branding > logo: {problem}")


def check_backend(backend, info: SurveyInfo, r: Report) -> None:
    if not isinstance(backend, dict):
        return
    mode = backend.get("mode", MISSING)
    if mode in BACKEND_MODES:
        info.backend_mode = mode
    else:
        r.error(SURVEY_FILE, f'backend > mode is {show(mode)}. It must be "mock" (answers go to the test '
                             'server on this Mac) or "apps_script" (answers go to Google).'
                             + did_you_mean(mode, BACKEND_MODES))
    check_apps_script_url(backend.get("apps_script_url", ""), mode, info, r)
    if not is_text(backend.get("mock_url")):
        r.error(SURVEY_FILE, 'backend > mock_url must be the test server\'s address, normally "/api". '
                             "Test mode (and links with ?mock=1) need it.")
    check_positive(backend, "backend", "request_timeout_seconds", r)
    if "slow_upload_bytes_per_second" in backend:
        check_positive(backend, "backend", "slow_upload_bytes_per_second", r, unit=" bytes per second")
    check_retry_delays(backend.get("retry_delays_seconds", MISSING), r)


def check_apps_script_url(url, mode, info: SurveyInfo, r: Report) -> None:
    if not isinstance(url, str):
        r.error(SURVEY_FILE, 'backend > apps_script_url must be text in double quotes (or "" while you are '
                             "still in mock mode).")
        return
    url = url.strip()
    info.apps_script_url = url
    if mode == "apps_script" and not url:
        r.error(SURVEY_FILE, 'backend > mode is "apps_script", but apps_script_url is empty, so answers '
                             "would have nowhere to go. Paste the Apps Script web-app address (it starts "
                             f"with {APPS_SCRIPT_PREFIX} and ends with /exec).")
    elif url and not url.startswith(APPS_SCRIPT_PREFIX):
        message = (f"backend > apps_script_url must start with {APPS_SCRIPT_PREFIX}, but it is "
                   f"{show(url)}. Copy the address from Apps Script: Deploy > Manage deployments > Web app.")
        if mode == "apps_script":
            r.error(SURVEY_FILE, message)
        else:
            r.warn(SURVEY_FILE, message + " (Not used yet, because mode is not apps_script.)")
    elif url and not url.rstrip("/").endswith("/exec"):
        r.warn(SURVEY_FILE, "backend > apps_script_url normally ends with /exec (the published web app). "
                            "An address ending in /dev only works for you, not for partners.")


def check_retry_delays(delays, r: Report) -> None:
    where = "backend > retry_delays_seconds"
    if not isinstance(delays, list):
        r.error(SURVEY_FILE, f"{where} is {show(delays)}, but it must be a list of waiting times in "
                             "seconds, like [2, 5, 10, 20].")
        return
    bad = [show(delay) for delay in delays if not is_number(delay) or delay <= 0]
    if bad:
        r.error(SURVEY_FILE, f"{where} may only contain numbers above 0 (seconds, without quotes). "
                             f"These are not: {', '.join(bad)}.")
    if not delays:
        r.warn(SURVEY_FILE, f"{where} is empty, so the form never re-tries sending by itself: "
                            "partners would have to tap the Send now button.")


def check_links(links, r: Report) -> None:
    if not isinstance(links, dict):
        return
    defaults = links.get("mock_defaults", MISSING)
    if not isinstance(defaults, dict):
        r.error(SURVEY_FILE, 'links > mock_defaults must be a group like {"dc": "DC-DEMO-001", "round": '
                             '"DEMO-R1", "t": ""}. Test mode uses it when a link has no dc or round.')
        return
    for name, example in (("dc", "DC-DEMO-001"), ("round", "DEMO-R1")):
        if not is_text(defaults.get(name)):
            r.error(SURVEY_FILE, f'links > mock_defaults > {name} must be text in double quotes, for example "{example}".')
    dc = defaults.get("dc")
    if is_text(dc) and not FAKE_ID_RE.search(dc):
        r.warn(SURVEY_FILE, f"links > mock_defaults > dc is {show(dc)}. Settings are saved in the "
                            'project, so use an obviously fake id such as "DC-DEMO-001", never a real '
                            "partner's DC id.")


def check_languages(survey: dict, info: SurveyInfo, r: Report) -> None:
    languages = survey.get("languages", MISSING)
    if not isinstance(languages, list) or not languages:
        r.error(SURVEY_FILE, '"languages" must be a list like [{"code": "en", "bcp47": "en-IN", '
                             '"native_name": "English"}, ...]. The other checks below assume the '
                             "six standard languages.")
        return
    codes = []
    for pos, language in enumerate(languages, start=1):
        code = check_one_language(pos, language, codes, info, r)
        if code:
            codes.append(code)
    if codes:
        info.language_codes = codes
    for name in ("default_language", "fallback_language"):
        value = survey.get(name, MISSING)
        if value not in codes:
            r.error(SURVEY_FILE, f"{name} is {show(value)}, but it must be one of the language codes "
                                 f"listed in \"languages\": {', '.join(codes)}.")
    if survey.get("fallback_language") in codes:
        info.fallback = survey["fallback_language"]
    missing = [code for code in EXPECTED_LANGUAGES if code not in codes]
    if missing:
        r.warn(SURVEY_FILE, "These planned languages are not in \"languages\", so partners cannot choose "
                            f"them: {', '.join(info.name(code) for code in missing)}.")


def check_one_language(pos: int, language, codes: list, info: SurveyInfo, r: Report):
    """Check one entry of "languages". Returns its code when usable."""
    if not isinstance(language, dict) or not is_text(language.get("code")):
        r.error(SURVEY_FILE, f'languages, entry {pos} must be a group like {{"code": "ta", "bcp47": '
                             '"ta-IN", "native_name": "தமிழ்"}} with a code in double quotes.')
        return None
    code = language["code"]
    where = f'languages > "{code}"'
    if code in codes:
        r.error(SURVEY_FILE, f"{where} is listed twice. Each language may appear only once.")
        return None
    if is_text(language.get("native_name")):
        info.native_names[code] = language["native_name"]
    else:
        r.error(SURVEY_FILE, f"{where} needs native_name: the language's name in its own script, "
                             "shown on the language screen.")
    bcp47 = language.get("bcp47")
    if not is_text(bcp47):
        r.error(SURVEY_FILE, f'{where} needs bcp47: a language tag like "ta-IN", used to find the '
                             "read-aloud voice.")
    elif not BCP47_RE.match(bcp47):
        r.warn(SURVEY_FILE, f'{where} > bcp47 is {show(bcp47)}, which does not look like a language tag '
                            'such as "ta-IN". The phone may not find a read-aloud voice.')
    return code


def check_small_sections(survey: dict, r: Report) -> None:
    navigation = survey.get("navigation")
    if isinstance(navigation, dict):
        check_bool(navigation, "navigation", "auto_advance", r)
        if "auto_advance_delay_ms" in navigation:
            check_range(navigation, "navigation", "auto_advance_delay_ms", 0, 5000, r, unit=" milliseconds")
    for name in ("read_aloud", "telemetry"):
        if isinstance(survey.get(name), dict):
            check_bool(survey[name], name, "enabled", r)
    whats_changed = survey.get("whats_changed")
    if isinstance(whats_changed, dict) and "timeout_seconds" in whats_changed:
        check_positive(whats_changed, "whats_changed", "timeout_seconds", r)


def check_rating(rating, r: Report) -> None:
    if not isinstance(rating, dict):
        return
    faces = rating.get("faces", MISSING)
    if not isinstance(faces, list) or len(faces) != 5:
        now = plural(len(faces), "entry", "entries") if isinstance(faces, list) else kind_of(faces)
        r.error(SURVEY_FILE, "rating > faces must be a list of exactly 5 faces, from worst (1) to best "
                             f"(5). Right now it is {now}.")
    elif not all(is_text(face) for face in faces):
        r.error(SURVEY_FILE, "rating > faces: every face must be text in double quotes (usually an emoji).")
    check_bool(rating, "rating", "allow_not_applicable", r)


def check_threshold(value, where: str, r: Report) -> None:
    if not is_whole_number(value) or not 1 <= value <= 5:
        r.error(SURVEY_FILE, f"{where} is {show(value)}. It must be a whole number from 1 to 5, written "
                             "without quotes: areas rated at or below it get the 'main problem' screen.")


def check_deep_dive(deep_dive, info: SurveyInfo, r: Report) -> None:
    if not isinstance(deep_dive, dict):
        return
    check_threshold(deep_dive.get("threshold", MISSING), "deep_dive > threshold", r)
    when = deep_dive.get("when", MISSING)
    if when not in DEEP_DIVE_WHEN:
        r.error(SURVEY_FILE, f'deep_dive > when is {show(when)}. It must be "after_all_ratings" (problem '
                             'screens after all area ratings, recommended) or "immediate" (right after '
                             "each low rating)." + did_you_mean(when, DEEP_DIVE_WHEN))
    for name in ("require_chip", "require_detail_if_other"):
        check_bool(deep_dive, "deep_dive", name, r)


def check_functions(functions, info: SurveyInfo, r: Report) -> None:
    if not isinstance(functions, list):
        r.error(SURVEY_FILE, '"functions" (the areas partners rate) must be a list, like '
                             '[{"id": "payments", "issues": ["payout_delayed", ...]}, ...].')
        return
    for pos, area in enumerate(functions, start=1):
        check_one_area(pos, area, info, r)


def check_one_area(pos: int, area, info: SurveyInfo, r: Report) -> None:
    if not isinstance(area, dict):
        r.error(SURVEY_FILE, f'functions, entry {pos} must be a group like {{"id": "payments", "issues": [...]}}.')
        return
    area_id = area.get("id", MISSING)
    if not isinstance(area_id, str) or not CODE_RE.match(area_id):
        r.error(SURVEY_FILE, f"functions, entry {pos}: the id {show(area_id)} is not allowed. Use "
                             f'{CODE_RULE}, for example "payments".')
        return
    where = f'functions > area "{area_id}"'
    if area_id in info.functions:
        r.error(SURVEY_FILE, f"{where} is listed twice. Every area needs its own id (the data, sheet "
                             "and dashboard use it).")
        return
    info.functions[area_id] = check_chips(area.get("issues", MISSING), where, r)
    if "threshold" in area:
        check_threshold(area["threshold"], f"{where} > threshold", r)
    warn_unknown_fields(area, KNOWN_AREA_FIELDS, where, r)


def check_chips(chips, where: str, r: Report) -> list:
    """Check one area's problem chips. Returns the usable chip codes."""
    if not isinstance(chips, list):
        r.error(SURVEY_FILE, f'{where} needs "issues": a list of 4-6 problem codes, like '
                             '["payout_delayed", "short_payment", ...].')
        return []
    good = []
    for code in chips:
        if code == "other":
            r.error(SURVEY_FILE, f'{where}: remove "other" from issues. The Other chip is added '
                                 "automatically (its label is the text issue.other).")
        elif not isinstance(code, str) or not CODE_RE.match(code):
            r.error(SURVEY_FILE, f"{where}: the chip code {show(code)} is not allowed. Use {CODE_RULE}, "
                                 'for example "late_supply".')
        elif code in good:
            r.error(SURVEY_FILE, f'{where}: the chip "{code}" is listed twice.')
        else:
            good.append(code)
    if not 4 <= len(good) <= 6:
        r.warn(SURVEY_FILE, f"{where} has {plural(len(good), 'chip')} (plus Other). 4 to 6 works best: "
                            "fewer gives partners too little choice, more is hard to read on a small phone.")
    return good


def warn_unknown_fields(group: dict, known: list, where: str, r: Report) -> None:
    """Catch typos such as "treshold" or "show-if": the form silently ignores them."""
    for name, _ in visible_items(group):
        if name not in known:
            r.warn(SURVEY_FILE, f'{where} has "{name}", which the form does not use, so it has no '
                                f"effect.{did_you_mean(name, known)} (For a note, start the name with _.)")


def check_support(support, info: SurveyInfo, r: Report) -> None:
    if not isinstance(support, dict):
        return
    items = support.get("items", MISSING)
    if not isinstance(items, list):
        r.error(SURVEY_FILE, 'support > items must be a list of codes, like ["agent_behaviour", "kept_updated"].')
        items = []
    for item in items:
        if not isinstance(item, str) or not CODE_RE.match(item):
            r.error(SURVEY_FILE, f"support > items: {show(item)} is not allowed. Use {CODE_RULE}.")
        elif item in info.support_items:
            r.error(SURVEY_FILE, f'support > items: "{item}" is listed twice.')
        else:
            info.support_items.append(item)
    for name in ("allow_not_applicable", "allow_comment"):
        check_bool(support, "support", name, r)
    comment_text = support.get("comment_text", MISSING)
    if support.get("allow_comment") is True and not is_text(comment_text):
        r.error(SURVEY_FILE, "support > allow_comment is true, so support > comment_text must be the name "
                             'of the question text in strings.json, for example "q.support_comment".')


def check_voice(voice, r: Report) -> None:
    if not isinstance(voice, dict):
        return
    check_bool(voice, "voice", "enabled", r)
    gesture = voice.get("gesture", MISSING)
    if gesture not in VOICE_GESTURES:
        r.error(SURVEY_FILE, f'voice > gesture is {show(gesture)}. It must be "hold" (press and hold to '
                             'record) or "tap" (tap to start, tap again to stop).')
    max_ok = check_range(voice, "voice", "max_seconds", 5, 300, r, unit=" seconds")
    min_seconds = voice.get("min_seconds", MISSING)
    if not is_number(min_seconds) or min_seconds < 0:
        r.error(SURVEY_FILE, f"voice > min_seconds is {show(min_seconds)}. It must be a number of seconds, "
                             "0 or more (shorter notes are thrown away as accidental taps).")
    elif max_ok and min_seconds >= voice["max_seconds"]:
        r.error(SURVEY_FILE, f"voice > min_seconds ({show(min_seconds)}) must be smaller than voice > "
                             f"max_seconds ({show(voice['max_seconds'])}), otherwise every voice note "
                             "would be thrown away.")
    check_range(voice, "voice", "bitrate", 6000, 64000, r, unit=" bits per second")
    mime_types = voice.get("mime_types", MISSING)
    if not isinstance(mime_types, list) or not mime_types or not all(is_text(m) for m in mime_types):
        r.error(SURVEY_FILE, 'voice > mime_types must be a list of audio formats in double quotes, like '
                             '["audio/webm;codecs=opus", "audio/mp4"].')


def check_text_box(text, r: Report) -> None:
    if isinstance(text, dict):
        check_range(text, "text", "max_chars", 50, 10000, r, whole=True, unit=" characters")


# ---- The flow: which screens, in which order ----------------------------------------
# Checked by the project's ONE flow checker (web/js/flow-check.js, run with
# Node.js through scripts/flow.js), never by a second copy of its rules here.
# The checks this file had until 23 Oct 2026 (step fields, order, show_if) are
# all in that checker now (docs/flow-engine.md section 6), so the control
# panel, the command line and this check can never disagree.

def check_flow(survey: dict, root: Path, info: SurveyInfo, r: Report) -> None:
    """Runs the flow checker on web/config/survey.json and adds its errors and
    warnings to this report. It also says which texts the flow shows (for the
    text checks below) and how big one submission can get (for the summary)."""
    info.flow_screens = count_flow_screens(survey.get("flow", MISSING))
    outcome = run_flow_tool(["check", "--root", str(root / "web"), "--json"])
    if isinstance(outcome, str):
        r.error(SURVEY_FILE, "The flow (the screens, their order and their rules) could not be checked. " + outcome)
        return
    code, out, err = outcome
    try:
        data = json.loads(out)
    except ValueError:
        data = None
    if code not in (0, 1) or not isinstance(data, dict) or not isinstance(data.get("findings"), list):
        said = " ".join((err or out or "").split())[:500]
        r.error(SURVEY_FILE, "The flow check (node scripts/flow.js check) could not run, so the screens, their order "
                             "and their rules were not checked." + (f" It said: {said}" if said else ""))
        return
    info.flow_checked = True
    for finding in data["findings"]:
        if not isinstance(finding, dict) or finding.get("code") == "T1":
            continue   # texts (T1): the text checks below cover every text, these included
        message = f'{finding.get("message")} [flow check {finding.get("code")}]'
        if finding.get("level") == "error":
            r.error(SURVEY_FILE, message)
        elif finding.get("level") == "warning":
            r.warn(SURVEY_FILE, message)
        else:
            info.flow_notes += 1   # notes ("info"): shown by  python3 scripts/flow.py check
    if isinstance(data.get("text_keys"), dict):
        info.flow_text_keys = data["text_keys"]
    if isinstance(data.get("stats"), dict):
        info.flow_stats = data["stats"]


def count_flow_screens(flow) -> int:
    """How many screens the flow lists (lines of the list, or nodes of a graph), for the summary."""
    if isinstance(flow, list):
        return len(flow)
    if not isinstance(flow, dict):
        return 0
    count, todo = 0, list(flow.get("nodes") or []) if isinstance(flow.get("nodes"), list) else []
    while todo:
        node = todo.pop()
        if isinstance(node, dict) and node.get("type") == "group":
            body = node.get("body") if isinstance(node.get("body"), dict) else {}
            todo.extend(body.get("nodes") if isinstance(body.get("nodes"), list) else [])
        elif isinstance(node, dict):
            count += 1
    return count


def load_flow_wrapper():
    """scripts/flow.py: it finds Node.js on this Mac and explains how to install it."""
    try:
        spec = importlib.util.spec_from_file_location("pp_flow_wrapper", FLOW_WRAPPER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module if hasattr(module, "find_node") and hasattr(module, "node_problem") else None
    except Exception:   # missing or broken: fall back to "node" on the PATH
        return None


def run_flow_tool(args: list):
    """Runs  node scripts/flow.js <args>. Returns (exit code, output, error output),
    or a plain-English explanation when Node.js or the tool cannot be used."""
    if not FLOW_TOOL.is_file():
        return "scripts/flow.js is missing next to this script. Put it back from git."
    wrapper = load_flow_wrapper()
    if wrapper is not None:
        node = wrapper.find_node()
        problem = wrapper.node_problem(node)
    else:
        node = shutil.which("node")
        problem = None if node else ("It needs Node.js (free), which was not found on this Mac. Install the LTS "
                                     "version from https://nodejs.org, open a new Terminal window and run this check again.")
    if problem:
        return problem
    try:
        done = subprocess.run([node, str(FLOW_TOOL)] + list(args), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=FLOW_TIMEOUT_SECONDS)
    except (OSError, subprocess.SubprocessError) as problem:
        return f"Node.js could not run scripts/flow.js ({problem})."
    return done.returncode, done.stdout, done.stderr


def check_flow_map(root: Path, info: SurveyInfo, r: Report) -> None:
    """docs/flow.md is the map of the flow, made by  python3 scripts/flow.py map --write.
    Warns when it no longer matches the questionnaire. Only in a project folder
    (one with docs/), and only when the flow itself could be checked."""
    if not info.flow_checked or not (root / "docs").is_dir():
        return
    target = root / FLOW_MAP_FILE
    outcome = run_flow_tool(["map", "--root", str(root / "web"), "--check", str(target)])
    if isinstance(outcome, str):
        return
    code, out, err = outcome
    if code == 1:
        state = "missing" if not target.is_file() else "out of date: it no longer matches web/config/survey.json"
        r.warn(FLOW_MAP_FILE, f"The map of the questionnaire (docs/flow.md) is {state}. Make it again with  "
                              "python3 scripts/flow.py map --write  and commit it together with your change.")
    elif code != 0:
        r.warn(FLOW_MAP_FILE, "docs/flow.md could not be compared with the questionnaire: "
                              + " ".join((err or out or "").split())[:300])


# ---- The catalogue of the kinds of screen (web/config/types.json) ----------------------
# Made from the form's own code (web/js/flow.js, web/js/types/) by  node scripts/flow.js types --write ,
# never by hand: the flow checker, this script and the control panel read it, so a copy that no longer
# matches the code would make them disagree with the phones. How to add a kind of question:
# docs/config-guide.md, "How to add a question type".

def check_types_catalogue(root: Path, info: SurveyInfo, r: Report) -> None:
    """web/config/types.json must be exactly what the form's code describes (an error otherwise);
    the control panel's copy in apps-script/Model.gs (PP_SCREEN_TYPES) too (a warning)."""
    outcome = run_flow_tool(["types", "--check", "--json", "--root", str(root / "web")])
    if isinstance(outcome, str):
        r.error(TYPES_FILE, "The catalogue of the kinds of screen could not be checked. " + outcome)
        return
    code, out, err = outcome
    try:
        data = json.loads(out)
    except ValueError:
        data = None
    if code not in (0, 1) or not isinstance(data, dict):
        said = " ".join((err or out or "").split())[:500]
        r.error(TYPES_FILE, "The catalogue of the kinds of screen (node scripts/flow.js types --check) could not run."
                            + (f" It said: {said}" if said else ""))
        return
    remake = "Make it again with  node scripts/flow.js types --write  and commit it together with your change."
    state = data.get("types_json")
    if state == "missing":
        r.error(TYPES_FILE, "The catalogue of the kinds of screen (web/config/types.json) is missing, so the checks and "
                            "the control panel do not know the form's kinds of question. " + remake)
    elif state == "stale":
        r.error(TYPES_FILE, "The catalogue of the kinds of screen (web/config/types.json) no longer matches the form's "
                            "code (web/js/flow.js, web/js/types/), so the checks and the control panel would disagree "
                            "with the phones. " + remake)
    for problem in data.get("problems") or []:
        r.error(TYPES_FILE, f"{problem} [types]")
    for note in data.get("warnings") or []:
        r.warn(TYPES_FILE, f"{note} [types]")
    model = data.get("model_gs")
    if model == "stale":
        r.warn(TYPES_FILE, "The control panel's list of kinds of screen (PP_SCREEN_TYPES in apps-script/Model.gs) is "
                           "out of date. Run  node scripts/flow.js types --write , then paste Model.gs into the Apps "
                           "Script project.")
    elif model == "no_markers":
        r.warn(TYPES_FILE, "apps-script/Model.gs has lost the GENERATED marks around PP_SCREEN_TYPES, so its list of "
                           "kinds of screen cannot be checked or refreshed. Put them back from git.")
    info.type_kinds = [t for t in data.get("builtin") or [] if isinstance(t, str)]
    info.type_added = [t for t in data.get("added") or [] if isinstance(t, str)]


# ---- Every script phones load is ES5 (old Android phones, Chrome 61) -------------------
# Checked by  node scripts/flow.js es5  with the "acorn" parser the tests pin (tests/node_modules, after
# cd tests && npm install ; GitHub's deployment installs acorn 8.14.0 and passes ACORN_PATH). A file
# with newer syntax (let, const, =>, ?., ??, template strings ...) is skipped whole by such a phone, so
# what it does (for example a new kind of question in web/js/types/) would silently not work.

def check_es5(root: Path, info: SurveyInfo, r: Report) -> None:
    """A script that is not ES5 is an error. Without acorn the check is skipped with a warning, except
    when ACORN_PATH was given (as on GitHub): then a broken install is an error, so the gate never
    silently goes missing there."""
    outcome = run_flow_tool(["es5", "--json", "--root", str(root / "web")])
    if isinstance(outcome, str):   # Node.js missing: the flow check above already explains it, as an error
        r.warn(FORM_CODE, "ES5 check skipped: it needs Node.js and scripts/flow.js, which could not be used (the error "
                          "about the flow above says why and what to do).")
        return
    code, out, err = outcome
    try:
        data = json.loads(out)
    except ValueError:
        data = None
    if not isinstance(data, dict) or not isinstance(data.get("acorn"), dict):
        said = " ".join((err or out or "").split())[:500]
        r.error(FORM_CODE, "The ES5 check (node scripts/flow.js es5) could not run, so it is not known whether old Android "
                           "phones can run every script." + (f" It said: {said}" if said else ""))
        return
    acorn = data["acorn"]
    if not acorn.get("found"):
        message = data.get("message") or "ES5 check skipped: acorn is not installed. Run  cd tests && npm install  once."
        if acorn.get("given"):
            r.error(FORM_CODE, message + " [ES5 check]")
        else:
            r.warn(FORM_CODE, message + " [ES5 check]")
        info.es5_summary = "skipped (acorn is not installed: cd tests && npm install)" if not acorn.get("given") else "could not run (ACORN_PATH)"
        return
    problems = [p for p in data.get("problems") or [] if isinstance(p, dict)]
    for problem in problems:
        r.error(FORM_CODE, f"{problem.get('message')} [ES5 check]")
    files = data.get("files") or []
    info.es5_summary = (f"{plural(len(files), 'file')} (the scripts phones load, web/js/types/ and scripts/dev/) parsed by acorn "
                        f"{acorn.get('version')}: " + (f"{plural(len(problems), 'file')} not ES5." if problems else "all ES5."))


# ---- Which texts the settings need -----------------------------------------------

def keys_needed_by_settings(survey: dict, info: SurveyInfo) -> dict:
    """Every text key the settings refer to, with a plain-English reason."""
    need = {}
    for area, chips in info.functions.items():
        need[f"fn.{area}.name"] = f'the name of the area "{area}"'
        need[f"fn.{area}.help"] = f'the help line of the area "{area}"'
        for chip in chips:
            need[f"issue.{area}.{chip}"] = f'the chip "{chip}" of the area "{area}"'
    for item in info.support_items:
        need[f"support.{item}"] = f'the support item "{item}"'
    support = survey.get("support")
    # The form shows the support comment unless allow_comment is false, and
    # falls back to q.support_comment when comment_text is not set.
    if isinstance(support, dict) and support.get("allow_comment") is not False:
        comment = support.get("comment_text")
        need[comment if is_text(comment) else "q.support_comment"] = \
            "the support comment question (support > comment_text)"
    # Every text the flow shows (questions, labels, options, chips, ...), as the
    # flow checker lists them (the "text_keys" of  node scripts/flow.js check --json).
    for key, why in info.flow_text_keys.items():
        if isinstance(key, str) and key:
            need.setdefault(key, why if isinstance(why, str) else "shown by the flow")
    for key in FIXED_STRING_KEYS:
        need.setdefault(key, "used by the form's code")
    return need


# =============================================================================
# 6. The form's own code: which texts does it ask for?
# =============================================================================

def files_the_page_loads(root: Path):
    """The scripts and stylesheets web/index.html loads, as (scripts, stylesheets),
    each a sorted list of paths inside web/; None when there is no index.html.
    Only these reach a partner's phone: a file the page never loads, such as
    web/js/flow-check.js (used only by the checks), costs partners nothing and
    is not the form's code."""
    index = root / "web" / "index.html"
    if not index.is_file():
        return None
    html = HTML_COMMENT_RE.sub("", index.read_text(encoding="utf-8", errors="replace"))

    def inside_web(ref: str):
        ref = ref.split("#", 1)[0].split("?", 1)[0].strip()
        if not ref or ref.startswith("//") or OTHER_ADDRESS_RE.match(ref) or ".." in PurePosixPath(ref).parts:
            return None   # another website, or outside web/: not counted here
        return root / "web" / PurePosixPath(ref.lstrip("/"))

    scripts = [inside_web(m.group(1)) for m in SCRIPT_SRC_RE.finditer(html)]
    styles = []
    for tag in LINK_TAG_RE.findall(html):
        href = HREF_RE.search(tag)
        if STYLESHEET_RE.search(tag) and href:
            styles.append(inside_web(href.group(1)))
    return (sorted({p for p in scripts if p is not None}), sorted({p for p in styles if p is not None}))


def scan_form_code(root: Path, r: Report) -> FormCode:
    code = FormCode()
    loaded = files_the_page_loads(root)
    if loaded is None:
        js_files = list_files(root / "web" / "js", "*.js")
    else:
        js_files = [path for path in loaded[0] if path.is_file()]
    code.found = bool(js_files)
    if not js_files:
        r.warn(FORM_CODE, "The form's code (web/js) was not found, so the check of which texts the code "
                          "asks for was skipped. That is expected while the form is still being built: "
                          "run this check again once it exists.")
    for path in js_files:
        source = strip_js_comments(path.read_text(encoding="utf-8", errors="replace"))
        rel = path.relative_to(root).as_posix()
        for match in T_CALL_RE.finditer(source):          # t('ui.next')
            note_key(code, match, source, match.start(), rel)
        for call in T_CALL_START_RE.finditer(source):     # t(isLast ? 'ui.submit' : 'ui.next')
            argument = first_argument(source, call.end())
            for match in KEY_LITERAL_RE.finditer(argument):
                note_key(code, match, source, call.start(), rel)
        code.mentioned.update(match.group("key") for match in KEY_LITERAL_RE.finditer(source))
    return code


def note_key(code: FormCode, match, source: str, position: int, rel: str) -> None:
    key = match.group("key")
    if key.endswith(".") or match.group("plus"):
        code.prefixes.add(key)   # built in code, e.g. t('rating.' + n)
    else:
        line = source.count("\n", 0, position) + 1
        code.keys.setdefault(key, f"used by the form's code: {rel}, line {line}")


def first_argument(source: str, start: int) -> str:
    """The first argument of a call, from just after its opening bracket up to
    the first top-level comma or the closing bracket (quotes and nested
    brackets are skipped over)."""
    depth, i, quote = 0, start, None
    while i < len(source):
        char = source[i]
        if quote:
            if char == "\\":
                i += 1
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char in "([{":
            depth += 1
        elif char in ")]}":
            if depth == 0:
                break
            depth -= 1
        elif char == "," and depth == 0:
            break
        i += 1
    return source[start:i]


def strip_js_comments(source: str) -> str:
    """Blank out // and /* */ comments, so example calls written in comments
    (like PP.t('key')) are not mistaken for real ones. Text in quotes is kept
    as it is, so the // in 'https://...' is not taken for a comment. Line
    breaks are kept, so line numbers stay correct."""
    out, i, quote = [], 0, None
    while i < len(source):
        char = source[i]
        if quote:
            if char == "\\":
                out.append(source[i:i + 2])
                i += 2
                continue
            if char == quote:
                quote = None
            out.append(char)
            i += 1
        elif char in "'\"`":
            quote = char
            out.append(char)
            i += 1
        elif source.startswith("//", i) or source.startswith("/*", i):
            end = source.find("\n", i) if source[i + 1] == "/" else source.find("*/", i + 2)
            end = len(source) if end == -1 else (end if source[i + 1] == "/" else end + 2)
            out.append(re.sub(r"[^\n]", " ", source[i:end]))
            i = end
        else:
            out.append(char)
            i += 1
    return "".join(out)


# =============================================================================
# 7. strings.json
# =============================================================================

def check_strings(strings: dict, info: SurveyInfo, code: FormCode, r: Report) -> dict:
    """Check every text. Returns how many texts each language still needs."""
    codes = info.language_codes
    missing = {c: [] for c in codes}       # key has no entry for this language
    empty = {c: [] for c in codes}         # entry exists but is not real text
    tagged = {c: [] for c in codes}        # contains [TRANSLATE]
    untranslated = {c: 0 for c in codes}   # the form would fall back for these
    unknown_languages: dict = {}
    for key, value in visible_items(strings):
        if not isinstance(value, dict):
            r.error(STRINGS_FILE, f'"{key}" must be a group of languages like {{"en": "...", "hi": "..."}}, '
                                  f"but it is {kind_of(value)}.")
            continue
        for lang in codes:
            text = value.get(lang, MISSING)
            if text is MISSING:
                missing[lang].append(key)
            elif not is_text(text):
                empty[lang].append(key)
            elif TRANSLATE_TAG in text:
                tagged[lang].append(key)
            if text is MISSING or needs_translation(text):
                untranslated[lang] += 1
        for lang, _ in visible_items(value):
            if lang not in codes:
                unknown_languages.setdefault(lang, []).append(key)
        check_placeholders(key, value, info, r)
    report_language_gaps(missing, empty, tagged, unknown_languages, info, r)
    check_required_texts(strings, info, code, r)
    return untranslated


def report_language_gaps(missing: dict, empty: dict, tagged: dict, unknown: dict,
                         info: SurveyInfo, r: Report) -> None:
    for lang, keys in missing.items():
        if keys:
            r.error(STRINGS_FILE, f"No {info.name(lang)} text for {plural(len(keys), 'key')}: {quoted_list(keys)}. "
                                  "Every text needs all languages; if there is no translation yet, use "
                                  '"[TRANSLATE] " followed by the English.')
    for lang, keys in empty.items():
        if keys:
            r.error(STRINGS_FILE, f"The {info.name(lang)} text is empty (or not text in double quotes) for "
                                  f"{plural(len(keys), 'key')}: {quoted_list(keys)}.")
    for lang in dict.fromkeys(["en", info.fallback]):
        keys = tagged.get(lang, [])
        if keys:
            role = ("the fallback language, shown whenever a translation is missing"
                    if lang == info.fallback else "the source text that translators work from")
            r.error(STRINGS_FILE, f"{info.name(lang)} is {role}, so it must be real text, but these still "
                                  f"contain [TRANSLATE]: {quoted_list(keys)}. Remove the tag.")
    for lang, keys in unknown.items():
        r.warn(STRINGS_FILE, f'"{lang}" is not a language in survey.json, so its texts are ignored '
                             f"({plural(len(keys), 'key')}, e.g. {quoted_list(keys, 3)}).")


def check_placeholders(key: str, value: dict, info: SurveyInfo, r: Report) -> None:
    """{s} and {n} are replaced by numbers on screen, so every finished
    translation must have exactly the same ones as English."""
    english = value.get("en")
    if not isinstance(english, str):
        return
    expected = set(PLACEHOLDER_RE.findall(english))
    for lang in info.language_codes:
        text = value.get(lang)
        if lang == "en" or not isinstance(text, str) or needs_translation(text):
            continue
        found = set(PLACEHOLDER_RE.findall(text))
        if found == expected:
            continue
        problems = []
        if expected - found:
            problems.append(f"it is missing {' '.join(sorted(expected - found))}")
        if found - expected:
            problems.append(f"it has {' '.join(sorted(found - expected))}, which English does not have")
        r.error(STRINGS_FILE, f'"{key}" in {info.name(lang)}: {" and ".join(problems)}. Placeholders in '
                              "curly brackets are replaced by numbers on screen, so every language must "
                              f"have the same ones as English ({show(english)}).")


def check_required_texts(strings: dict, info: SurveyInfo, code: FormCode, r: Report) -> None:
    """Every text the settings or the form's code ask for must exist; texts
    nothing asks for are probably leftovers."""
    present = [key for key, _ in visible_items(strings)]
    needed = dict(info.required_keys) if info.loaded else {k: "used by the form's code" for k in FIXED_STRING_KEYS}
    for key, why in code.keys.items():
        needed.setdefault(key, why)
    # Without the flow checker the texts the flow uses are unknown: no "unused" guesses then.
    unused = find_unused_texts(present, needed, code) if info.loaded and info.flow_checked else []
    for key, why in needed.items():
        if key not in strings:
            hint = rename_hint(key, unused)
            r.error(STRINGS_FILE, f'The text "{key}" is missing ({why}). Add it with all '
                                  f"{len(info.language_codes)} languages.{hint}")
    if unused:
        one = len(unused) == 1
        r.warn(STRINGS_FILE, f"{plural(len(unused), 'text')} {'is' if one else 'are'} not used by any "
                             "screen, area, chip or the form's code (probably left over after removing "
                             f"something): {quoted_list(unused)}. You can delete {'it' if one else 'them'}; "
                             f"leaving {'it' if one else 'them'} does no harm.")


def rename_hint(missing_key: str, unused: list) -> str:
    """When an area, chip or screen was renamed in survey.json but not in
    strings.json, the old text is now unused and differs from the missing one
    in exactly one part (fn.app.name -> fn.tech.name). Point at it."""
    parts = missing_key.split(".")
    renamed = [key for key in unused if len(key.split(".")) == len(parts)
               and sum(a != b for a, b in zip(key.split("."), parts)) == 1]
    best = difflib.get_close_matches(missing_key, renamed, n=1, cutoff=0) or \
        difflib.get_close_matches(missing_key, unused, n=1, cutoff=0.7)
    if not best:
        return ""
    return f' Did you mean "{best[0]}"? (If you renamed something in survey.json, rename that text too.)'


def find_unused_texts(present: list, needed: dict, code: FormCode) -> list:
    """Texts nothing refers to. To avoid false alarms, a key written anywhere
    in the form's code counts as used, and so does any key under a prefix the
    code builds keys from (except the prefixes survey.json fully lists)."""
    exempt = ALWAYS_USED_PREFIXES + tuple(
        prefix for prefix in code.prefixes if not prefix.startswith(CONFIG_DRIVEN_PREFIXES))
    return [key for key in present
            if key not in needed and key not in code.mentioned and not key.startswith(exempt)]


# =============================================================================
# 8. whats_changed.json
# =============================================================================

def check_whats_changed(data: dict, info: SurveyInfo, r: Report) -> list:
    """Check every round. Returns one summary line per round."""
    rounds = data.get("rounds", MISSING)
    if not isinstance(rounds, dict):
        r.error(WHATS_CHANGED_FILE, '"rounds" must be a group like {"2026-R1": {"title": null, "items": [...]}}.')
        return []
    lines = []
    for round_id, block in visible_items(rounds):
        line = check_one_round(round_id, block, info, r)
        if line:
            lines.append(line)
    return lines


def check_one_round(round_id: str, block, info: SurveyInfo, r: Report):
    where = f'round "{round_id}"'
    is_demo = "demo" in round_id.lower()
    if is_demo:
        r.warn(WHATS_CHANGED_FILE, f"{where} is fake test content (its name contains DEMO). Never use it "
                                   "as the round in real partner links.")
    if not ROUND_ID_RE.fullmatch(round_id):
        r.error(WHATS_CHANGED_FILE, f"{where} has a name that is not allowed. Use 1 to 64 letters, digits, - or _ "
                                    '(no spaces or dots), exactly as in the partner links, for example "2026-R1". '
                                    "The control panel uses the same rule.")
    if not isinstance(block, dict):
        r.error(WHATS_CHANGED_FILE, f'{where} must be a group like {{"title": null, "items": [...]}}.')
        return None
    still_to_do = {lang: 0 for lang in info.language_codes}
    items = block.get("items", MISSING)
    if not isinstance(items, list):
        r.error(WHATS_CHANGED_FILE, f'{where} needs "items": a list [ ... ] of changes (use [] for none; '
                                    "the screen is then skipped).")
        items = []
    for number, item in enumerate(items, start=1):
        check_language_block(item, f"{where} > item {number}", info, still_to_do, r)
        if not is_demo and isinstance(item, dict) and any(
                isinstance(text, str) and "[SAMPLE]" in text for _, text in visible_items(item)):
            r.warn(WHATS_CHANGED_FILE, f"{where} > item {number} still contains the example tag [SAMPLE]. "
                                       "Replace it with the real change before sending links for this round.")
    title = block.get("title")
    if title is not None and not isinstance(title, dict):
        r.error(WHATS_CHANGED_FILE, f"{where} > title must be null (to use the standard title) or a group "
                                    'with one text per language, like {"en": "...", "hi": "..."}.')
    elif isinstance(title, dict):
        check_language_block(title, f"{where} > title", info, still_to_do, r)
    return round_summary(round_id, len(items), is_demo, still_to_do, info)


def check_language_block(block, where: str, info: SurveyInfo, still_to_do: dict, r: Report) -> None:
    """One what-changed item (or title): a text for every language."""
    if not isinstance(block, dict):
        r.error(WHATS_CHANGED_FILE, f'{where} must be a group with one text per language, like '
                                    '{"en": "...", "hi": "..."}.')
        return
    missing = [lang for lang in info.language_codes if not isinstance(block.get(lang), str)]
    if missing:
        r.error(WHATS_CHANGED_FILE, f"{where} has no text (in double quotes) for "
                                    f"{', '.join(info.name(lang) for lang in missing)}. Every item needs all "
                                    'languages; use "[TRANSLATE] " + the English if there is no translation yet.')
    for lang in dict.fromkeys(["en", info.fallback]):
        text = block.get(lang)
        if isinstance(text, str) and not text.strip():
            r.error(WHATS_CHANGED_FILE, f"{where}: the {info.name(lang)} text is empty.")
        elif isinstance(text, str) and TRANSLATE_TAG in text:
            r.error(WHATS_CHANGED_FILE, f"{where}: the {info.name(lang)} text still contains [TRANSLATE]; it "
                                        "must be real text (it is shown when a translation is missing).")
    for lang in info.language_codes:
        if isinstance(block.get(lang), str) and needs_translation(block[lang]):
            still_to_do[lang] += 1
    for lang, _ in visible_items(block):
        if lang not in info.language_codes:
            r.warn(WHATS_CHANGED_FILE, f'{where}: "{lang}" is not a language in survey.json, so it is ignored.')


def round_summary(round_id: str, count: int, is_demo: bool, still_to_do: dict, info: SurveyInfo) -> str:
    if count == 0:
        return f'round "{round_id}" has no items, so the screen is skipped for that round.'
    line = f'round "{round_id}" has {plural(count, "item")}'
    if is_demo:
        return line + " (fake test content)."
    todo = [f"{info.name(lang)} {n}" for lang, n in still_to_do.items() if n]
    return line + (f"; still to translate: {', '.join(todo)}." if todo else ", all translated.")


# =============================================================================
# 9. audio_clips.json
# =============================================================================

def check_audio_clips(data: dict, info: SurveyInfo, strings, root: Path, r: Report) -> None:
    clips = data.get("clips", MISSING)
    if not isinstance(clips, dict):
        r.error(AUDIO_FILE, '"clips" must be a group like {"q.nps": {"hi": "audio/hi/q.nps.mp3"}} '
                            "(or {} for no clips).")
        return
    for key, per_language in visible_items(clips):
        where = f'clip "{key}"'
        if strings is not None and key not in strings:
            r.error(AUDIO_FILE, f'{where}: there is no text "{key}" in strings.json, so this clip would never '
                                "play. Use the exact name of the text it reads aloud."
                                + did_you_mean(key, list(strings)))
        if not isinstance(per_language, dict):
            r.error(AUDIO_FILE, f'{where} must be a group like {{"hi": "audio/hi/{key}.mp3"}}.')
            continue
        for lang, path in visible_items(per_language):
            if lang not in info.language_codes:
                r.error(AUDIO_FILE, f'{where}: "{lang}" is not a language in survey.json. Use one of: '
                                    f"{', '.join(info.language_codes)}.")
            else:
                check_clip_file(path, f"{where} > {lang}", root, r)


def check_clip_file(path, where: str, root: Path, r: Report) -> None:
    if not is_text(path):
        r.error(AUDIO_FILE, f'{where} must be a file path or an https:// address in double quotes, like '
                            '"audio/hi/q.nps.mp3".')
        return
    problem = picture_or_clip_problem(root, path, 'for example "audio/hi/q.nps.mp3"')
    if problem:
        r.error(AUDIO_FILE, f"{where}: {problem}")
        return
    if HTTPS_ADDRESS_RE.match(path):
        return  # a web address: its file and size can't be checked from here
    if not path.lower().endswith(".mp3"):
        r.warn(AUDIO_FILE, f'{where}: "{path}" is not an .mp3 file. MP3 plays on every phone; other formats may not.')
    size = (root / "web" / path).stat().st_size
    if size > CLIP_WARN_BYTES:
        r.warn(AUDIO_FILE, f"{where}: web/{path} is {kb(size)}. Keep clips under {kb(CLIP_WARN_BYTES)} "
                           "(mono, 32-48 kbps MP3) so they load quickly on slow mobile data.")


# =============================================================================
# 10. Page weight: what a phone downloads to open the form
# =============================================================================

def measure_page_weight(root: Path, r: Report) -> list:
    """Returns rows of (file, size, compressed size). Audio clips are not counted."""
    web = root / "web"
    loaded = files_the_page_loads(root)
    if loaded is None:   # no index.html yet: count every file
        scripts, styles = list_files(web / "js", "*.js"), list_files(web / "css", "*.css")
    else:                # only what index.html loads (web/js/flow-check.js is not)
        scripts, styles = loaded
        for path in scripts + styles:
            if not path.is_file():
                r.warn(PAGE_WEIGHT, f"web/index.html loads {path.relative_to(web).as_posix()}, which does not exist "
                                    "in the web folder, so the form would miss it. Add the file or correct index.html.")
        scripts = [path for path in scripts if path.is_file()]
        styles = [path for path in styles if path.is_file()]
    parts = {
        "web/index.html": [web / "index.html"] if (web / "index.html").is_file() else [],
        "web/css (.css files)": styles,
        "web/js (.js files)": scripts,
    }
    not_found = [name for name, files in parts.items() if not files]
    if not_found:
        r.warn(PAGE_WEIGHT, f"Not found yet: {', '.join(not_found)}. The page weight below only counts "
                            "the files that exist, so the real total will be higher. Run this check again "
                            "once the form is in place.")
    files = [path for group in parts.values() for path in group]
    files += [root / rel for rel in (SURVEY_FILE, WHATS_CHANGED_FILE, AUDIO_FILE, STRINGS_FILE)
              if (root / rel).is_file()]
    rows = []
    for path in files:
        data = path.read_bytes()
        rows.append((path.relative_to(root).as_posix(), len(data),
                     len(gzip.compress(data, compresslevel=9, mtime=0))))
    total = sum(size for _, size, _ in rows)
    if total > PAGE_BUDGET_BYTES:
        r.error(PAGE_WEIGHT, f"The form's files add up to {kb(total)}, more than the {kb(PAGE_BUDGET_BYTES)} "
                             "budget. Partners on slow mobile data would wait longer for the first screen. "
                             "The table in the summary shows which files are biggest.")
    return rows


# =============================================================================
# 11. Printing the report
# =============================================================================

RULE = "-" * 64


def text_width() -> int:
    columns = shutil.get_terminal_size((100, 24)).columns
    return max(60, min(columns - 1, 110))


def print_message(number: int, message: str, width: int) -> None:
    """One numbered problem, wrapped to the screen. Lines starting with | are
    printed exactly as they are (they show a line from a file)."""
    prefix = f"    {number}. "
    indent = " " * len(prefix)
    first = True
    for paragraph in message.split("\n"):
        if paragraph.startswith("|"):
            print(indent + paragraph[1:])
            continue
        print(textwrap.fill(paragraph, width=width, initial_indent=prefix if first else indent,
                            subsequent_indent=indent, break_long_words=False, break_on_hyphens=False))
        first = False


def print_problems(title: str, problems: dict, width: int) -> None:
    total = Report.count(problems)
    print(f"{title}: {total} found")
    print(RULE)
    if not total:
        print("    None.")
    number = 0
    for group in GROUP_ORDER + [g for g in problems if g not in GROUP_ORDER]:
        if not problems.get(group):
            continue
        print(f"  {group}:")
        for message in problems[group]:
            number += 1
            print_message(number, message, width)
    print()


def print_line(text: str, width: int) -> None:
    """One summary line, wrapped to the screen."""
    print(textwrap.fill(text, width=width, initial_indent="  ", subsequent_indent="    ",
                        break_long_words=False, break_on_hyphens=False))


def print_summary(info: SurveyInfo, strings, untranslated, round_lines: list,
                  weight_rows: list, report: Report, width: int) -> None:
    print("SUMMARY")
    print(RULE)
    if info.loaded:
        chips = sum(len(c) for c in info.functions.values())
        print_line(f"Survey: {plural(info.flow_screens, 'screen')} in the flow, "
                   f"{plural(len(info.functions), 'area')} with {plural(chips, 'problem chip')} (plus Other), "
                   f"{plural(len(info.support_items), 'support item')}, "
                   f"{plural(len(info.language_codes), 'language')}.", width)
        print_line(f"Answers go to: {backend_text(info)}", width)
        if info.type_kinds or info.type_added:
            added = (f"{len(info.type_added)} added in web/js/types/ ({', '.join(info.type_added)})" if info.type_added
                     else "none added")
            print_line(f"Kinds of screen: {len(info.type_kinds) + len(info.type_added)} in web/config/types.json "
                       f"({len(info.type_kinds)} built in, {added}).", width)
        if info.es5_summary:
            print_line(f"ES5 check: {info.es5_summary}", width)
        if info.flow_stats:
            stats = info.flow_stats
            notes = (f" The flow check also has {plural(info.flow_notes, 'note')}: python3 scripts/flow.py check "
                     "shows them." if info.flow_notes else "")
            print_line(f"Flow: the longest route has {plural(stats.get('longest_path', 0), 'screen')}; one submission "
                       f"holds at most {plural(stats.get('answers', 0), 'answer')}, {plural(stats.get('ratings', 0), 'rating')} "
                       f"and {plural(stats.get('free_text', 0), 'voice or typed answer')} (the server accepts 100, 64 "
                       f"and 64).{notes}", width)
    else:
        print_line("survey.json could not be read, so the checks that depend on it were skipped.", width)
    for line in round_lines:
        print_line(f"What changed screen: {line}", width)
    if untranslated is not None:
        print_translation_progress(strings, untranslated, info)
    if weight_rows:
        print_weight_table(weight_rows)
    errors, warnings = Report.count(report.errors), Report.count(report.warnings)
    print(f"  Found: {plural(errors, 'error')}, {plural(warnings, 'warning')}.")
    print()


def backend_text(info: SurveyInfo) -> str:
    if info.backend_mode == "mock":
        return ('the test server on this Mac (backend mode "mock"). Switch to "apps_script" before '
                "sending real links.")
    if info.backend_mode == "apps_script":
        return f"Google Apps Script ({info.apps_script_url or 'address missing'})."
    return "unknown (backend > mode is not valid)."


def print_translation_progress(strings: dict, untranslated: dict, info: SurveyInfo) -> None:
    total = len(visible_items(strings))
    print(f"  Translations ({plural(total, 'text')} in strings.json):")
    for lang, count in untranslated.items():
        status = f"{plural(count, 'text')} still to translate" if count else "all translated"
        print(f"    {info.name(lang)}: {status}")


def print_weight_table(rows: list) -> None:
    raw_total = sum(size for _, size, _ in rows)
    packed_total = sum(packed for _, _, packed in rows)
    name_width = max(len(name) for name, _, _ in rows)
    print("  Page weight (what a phone downloads to open the form; audio clips not counted):")
    print(f"    {'File':<{name_width}}  {'Size':>9}  {'Compressed':>10}")
    for name, size, packed in rows:
        print(f"    {name:<{name_width}}  {kb(size):>9}  {kb(packed):>10}")
    print(f"    {'Total':<{name_width}}  {kb(raw_total):>9}  {kb(packed_total):>10}")
    used = round(100 * raw_total / PAGE_BUDGET_BYTES)
    print(f"    Budget: {kb(PAGE_BUDGET_BYTES)} uncompressed, {used}% used.")
    print('    "Compressed" (gzip) is roughly what really travels over the network.')


def print_verdict(report: Report) -> None:
    warnings = Report.count(report.warnings)
    if report.errors:
        print("Please fix the errors above, then run this check again:  python3 scripts/check_config.py")
    elif warnings:
        print(f"All good: no errors. The {plural(warnings, 'warning')} above "
              f"{'is' if warnings == 1 else 'are'} worth a look, but will not break the form.")
    else:
        print("All good.")


# =============================================================================
# 12. Putting it together
# =============================================================================

def run_checks(root: Path) -> int:
    report = Report()
    survey = load_json(root, SURVEY_FILE, report)
    strings = load_json(root, STRINGS_FILE, report)
    whats_changed = load_json(root, WHATS_CHANGED_FILE, report)
    audio = load_json(root, AUDIO_FILE, report)

    info = check_survey(survey, root, report)
    if strings is not None:   # the map shows the texts: compare it only when they could be read
        check_flow_map(root, info, report)
    check_types_catalogue(root, info, report)
    check_es5(root, info, report)
    code = scan_form_code(root, report)
    untranslated = check_strings(strings, info, code, report) if strings is not None else None
    round_lines = check_whats_changed(whats_changed, info, report) if whats_changed is not None else []
    if audio is not None:
        check_audio_clips(audio, info, strings, root, report)
    weight_rows = measure_page_weight(root, report)

    width = text_width()
    print()
    print("Valmo Partner Pulse: settings check")
    print(f"Project folder: {root}")
    print()
    print_problems("ERRORS (must fix: the form may break)", report.errors, width)
    print_problems("WARNINGS (should look at)", report.warnings, width)
    print_summary(info, strings, untranslated, round_lines, weight_rows, report, width)
    print_verdict(report)
    return 1 if report.errors else 0


def find_root(root_arg):
    """The project folder: --root if given, otherwise the folder above scripts/."""
    root = Path(root_arg).expanduser().resolve() if root_arg else Path(__file__).resolve().parent.parent
    if not (root / "web").is_dir():
        print(f"Could not find the web folder inside {root}.")
        print("Point --root at the project folder (the one that contains web/ and scripts/), or leave")
        print("--root out to check the project this script belongs to.")
        return None
    return root


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="python3 scripts/check_config.py",
        description="Checks the survey settings and texts for mistakes. Read-only: it never changes any file.",
    )
    parser.add_argument("--root", metavar="PATH",
                        help="project folder to check (the one that contains web/). "
                             "Default: the project this script belongs to.")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:   # never crash on a terminal that cannot show some characters
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    args = parse_args(argv)
    root = find_root(args.root)
    if root is None:
        return 1
    try:
        return run_checks(root)
    except Exception as problem:   # a bug in this checker, not in the settings
        where = traceback.extract_tb(problem.__traceback__)[-1]
        print()
        print("Sorry: the checker itself ran into something it did not expect. This is a bug in")
        print("scripts/check_config.py, not necessarily in your settings. Please send this line to")
        print("whoever maintains the scripts:")
        print(f"    {type(problem).__name__}: {problem} (check_config.py, line {where.lineno})")
        return 2


if __name__ == "__main__":
    sys.exit(main())
