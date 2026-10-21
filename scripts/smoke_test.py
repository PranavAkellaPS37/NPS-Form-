#!/usr/bin/env python3
"""
==============================================================================
 smoke_test.py  -  Valmo Partner Pulse: quick check that a BACKEND works
==============================================================================

WHAT THIS FILE IS FOR
  A fast, automatic check that a backend answers the way
  docs/submission-format.md (the agreement between the form and any backend)
  says it must. It works with:
    - the local test server (scripts/mock_server.py);
    - the live Google Apps Script backend (the web app behind the control
      panel's Google Sheet).
  It sends a few test messages and prints PASS or FAIL for each check, with a
  plain-English line explaining the result.

  You can run it again and again, on the live backend too:
    - every run uses a NEW obviously fake DC (see "WHAT IT READS AND WRITES"),
      so it never reaches the live backend's limit of 10 saved submissions
      per DC and round;
    - the "What changed" check (check 3) accepts whatever news the backend
      really serves, even none, and checks that what is there is complete.

HOW TO RUN IT
  1. Start the backend first. For the local test server, in one Terminal window:
         python3 scripts/mock_server.py
  2. In a SECOND Terminal window, from the project folder:
         python3 scripts/smoke_test.py
     "All 9 checks passed" at the end means the backend is fine.

  BEFORE TESTING THE LIVE (APPS SCRIPT) BACKEND
    - Publish the questionnaire once from the control panel (Partner Pulse
      menu > Publish...). Until then check 2 fails, on purpose.
    - In the control panel's Rounds section, add a round named SMOKE-R1 and
      open it. The live backend refuses messages for rounds that are not open,
      so checks 5 to 8 need it. Its fake test answers then land in SMOKE-R1's
      own data spreadsheet, apart from the real rounds.
    - Use --expect-strict (the live backend always checks tokens) and give the
      link secret with --secret (control panel > Links > Show the link secret).
      The setup guide (apps-script/README.md, Part E) has the exact command.

  Options:
    --url URL          Where the backend is. Default: http://localhost:8787/api
                       (the local test server). For Apps Script, use its
                       web-app address, which ends in /exec.
    --secret TEXT      The secret the backend uses to check link tokens.
                       Default: the MOCK_SECRET setting if it is set, otherwise
                       the public test secret of the local test server.
    --expect-strict    Use this when the backend refuses wrong tokens (the
                       local server started with --strict, or the live backend).
    --dc DC_ID         Rarely needed. Use this fake DC id instead of a new one
                       (1 to 64 letters, digits, "-", "_" or "."). Careful: the
                       live backend saves at most 10 submissions per DC and
                       round, so from the 11th run with the same --dc, check 6
                       fails. Never use a real DC's id.
  Examples:
    python3 scripts/smoke_test.py
    python3 scripts/smoke_test.py --url http://localhost:8788/api
    python3 scripts/smoke_test.py --expect-strict     (server started with --strict)
    python3 scripts/smoke_test.py --url <web app address ending in /exec> --secret "$(pbpaste)" --expect-strict
                                                      (the live backend, with the link secret copied first)

WHAT IT CHECKS, IN ORDER
  1. Health: the backend is up and says it is "valmo-partner-pulse".
  2. The questionnaire ("bootstrap", what the form asks for when a link is
     opened): it has screens, languages and texts, including the recommend
     question (q.nps). Without screens or languages the form would ignore it
     and use its own copy. It also reports the status of round SMOKE-R1. On a
     live backend where nothing is published yet, it FAILS with "publish
     from the control panel first".
  3. "What changed" for the test round SMOKE-R1 and the demo round DEMO-R1,
     as the backend serves it today. No news is fine (the form then skips
     that screen), so it passes whether or not DEMO-R1's sample news is still
     published. Each item that IS there must have a text in every language
     the questionnaire offers (from check 2; normally en, hi, ta, te, kn, ml),
     and SMOKE-R1's news must be the same as the copy inside the
     questionnaire (the two requests must agree).
  4. "What changed" for a round that does not exist: an empty list.
  5. An "opened" signal with a genuine token: accepted, token recognised.
  6. A new fake submission: saved (duplicate = false).
  7. The SAME submission sent again, as the form does on a bad network:
     recognised as a repeat (duplicate = true), not saved twice.
  8. A submission with a wrong token: accepted and marked as such (normal
     mode), or refused with "bad_token" (with --expect-strict).
  9. A garbled message that is not JSON: refused with "bad_request".
  If the backend answers "round_not_open" (round SMOKE-R1 is not open
  there), checks 5 to 8 FAIL and say how to open it.

WHAT IT READS AND WRITES
  On this Mac: nothing. It only talks to the backend over the network.
  On the BACKEND: yes, it adds a little obviously-fake test data there, all
  in round "SMOKE-R1": one "opened" signal and one or two saved survey
  submissions (each with one tiny fake "voice note" that is not real audio).
  The backend keeps it.
    - The fake DC is new for every run, for example
      DC-SMOKE-20261021-105312-4f9a: "DC-SMOKE-", the date and time on this
      Mac, and 4 random characters. Why: the live backend saves at most 10
      submissions per DC and round, so one DC used for every run would make
      check 6 fail from the 11th run. The first lines of the output show the
      DC of this run.
    - Local test server: it ends up in local_data/ (each run adds one small
      folder of fake voice notes). To clear ALL local test data (not only
      this): python3 scripts/mock_server.py --reset
    - Live backend: it stays in SMOKE-R1's own data spreadsheet, apart from
      the real rounds. The control panel's numbers for SMOKE-R1 count each
      run as one more DC. The pipeline and dashboard should ignore round
      SMOKE-R1 and every DC whose id starts with DC-SMOKE-.

SAFETY NOTES
  - It never uses or sends real partner data. With --dc, give only an
    obviously fake id.
  - The live link secret is a password. Do not paste it into chats or
    documents. Note that a command you type in Terminal (including --secret)
    is remembered in that Mac's Terminal history; --secret "$(pbpaste)" keeps
    the secret itself out of it.
  - Exit code: 0 when every check passes, 1 otherwise (handy for automation).

NEEDS
  Python 3.11 or newer. Nothing to install: it uses only Python's built-in parts.
==============================================================================
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
import re
import secrets
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


# ============================================================================
# Fixed settings
# ============================================================================

DEFAULT_URL = "http://localhost:8787/api"
MOCK_SECRET = "mock-dev-secret-not-for-production"   # the local test server's public secret
SERVICE_NAME = "valmo-partner-pulse"
LANGUAGES = ("en", "hi", "ta", "te", "kn", "ml")      # used only if the questionnaire does not list its languages

SMOKE_ROUND = "SMOKE-R1"                   # the test round that every test message goes to
DEMO_ROUND = "DEMO-R1"                     # the demo round: sample "What changed" news, if the backend still has it
UNKNOWN_ROUND = "SMOKE-NO-SUCH-ROUND"      # must not exist anywhere
SMOKE_DC_PREFIX = "DC-SMOKE-"              # each run's new fake DC starts with this
DC_ID_RULE = re.compile(r"[A-Za-z0-9_.-]{1,64}")   # a valid DC id: the same rule as both backends
TEST_ID_WORDS = ("SMOKE", "TEST", "DEMO")  # an obviously fake id given with --dc contains one of these
SUBMISSIONS_KEPT_PER_DC = 10               # the live backend saves at most this many per DC and round
PINGS_KEPT_PER_10_MINUTES = 60             # ... and at most this many signals per DC and round in 10 minutes
WRONG_TOKEN = "WRONG-TOKEN-SMOKE-TEST"     # 22 characters, like a real token, but wrong
FAKE_VOICE_NOTE = b"SMOKE TEST: FAKE VOICE NOTE, NOT REAL AUDIO"

TIMEOUT_SECONDS = 60     # Apps Script can take a while to wake up

# What to do when the backend says the test round is not open.
ROUND_ADVICE = (f"Live backend: in the control panel (Rounds), add a round named {SMOKE_ROUND} and open it; "
                "its fake test answers then go to their own data spreadsheet. Local test server: do not list "
                f"{SMOKE_ROUND} in --draft-rounds.")
PUBLISH_ADVICE = ("Nothing is published on this backend yet, so every partner would get the copy of the "
                  "questionnaire that is inside the form's files. Publish from the control panel first "
                  "(Partner Pulse menu > Publish...), then run this test again.")
NEW_DC_ADVICE = "Run the test again without --dc: it then uses a new fake DC."
ATTEMPTS = 4             # temporary problems (like error 503) are retried, as the form does


# ============================================================================
# Talking to the backend
# ============================================================================

class Unreachable(Exception):
    """Nothing answered at the backend's address."""


class TemporaryProblem(Exception):
    """A problem worth retrying: a network hiccup or a 5xx error."""


class Problem(Exception):
    """The backend answered, but not in a way the contract allows."""


class CheckFailed(Exception):
    """A check got an answer, but not the one the contract promises."""


def is_local_address(host: str) -> bool:
    """localhost, or an address on this Mac's own network (e.g. 192.168.1.23)."""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


class Backend:
    """Sends messages to the backend the way the form does: JSON labelled as
    plain text, following redirects (Apps Script answers a POST with a
    redirect to another address, where the answer is collected with a GET)."""

    def __init__(self, url: str):
        self.url = url
        self.is_local = is_local_address(urllib.parse.urlsplit(url).hostname or "")
        if self.is_local:
            # A company proxy (if this Mac has one) cannot reach this Mac's own
            # server, so talk to it directly.
            self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        else:
            self.opener = urllib.request.build_opener()

    def get(self, **params) -> dict:
        parts = urllib.parse.urlsplit(self.url)
        query = "&".join(part for part in (parts.query, urllib.parse.urlencode(params)) if part)
        return self.send(urllib.parse.urlunsplit(parts._replace(query=query)), body=None)

    def post(self, message: dict) -> dict:
        return self.send(self.url, json.dumps(message, ensure_ascii=False).encode("utf-8"))

    def post_raw(self, body: bytes) -> dict:
        return self.send(self.url, body)

    def send(self, url: str, body: bytes | None) -> dict:
        """Send; on a temporary problem wait a little and try again, like the form does."""
        attempt = 1
        while True:
            try:
                return self.send_once(url, body)
            except TemporaryProblem as problem:
                if attempt == ATTEMPTS:
                    raise Problem(f"{problem} (tried {ATTEMPTS} times)") from None
                print(f"        ...{problem}; trying again")
                time.sleep(attempt)            # wait 1 s, then 2 s, then 3 s
                attempt += 1

    def send_once(self, url: str, body: bytes | None) -> dict:
        if body is None:
            request = urllib.request.Request(url, method="GET")
        else:
            request = urllib.request.Request(url, data=body, method="POST",
                                             headers={"Content-Type": "text/plain;charset=utf-8"})
        try:
            with self.opener.open(request, timeout=TIMEOUT_SECONDS) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:       # the backend answered with an error number
            if error.code >= 500 or error.code == 429:
                hint = ""
                if error.code == 503 and self.is_local:
                    hint = " (the local test server does this on purpose when started with --fail-rate)"
                raise TemporaryProblem(f"the backend answered with error {error.code}{hint}") from None
            raise Problem(f"the backend answered with error {error.code} ({error.reason}). Check that --url "
                          "is right: it should end in /api (local server) or /exec (Apps Script).") from None
        except urllib.error.URLError as error:        # no answer at all
            if isinstance(error.reason, ConnectionRefusedError):
                raise Unreachable("nothing is running there") from None
            if isinstance(error.reason, socket.gaierror):
                raise Unreachable("this address could not be found") from None
            raise TemporaryProblem(f"network problem ({error.reason})") from None
        except (TimeoutError, socket.timeout, ConnectionError, http.client.HTTPException) as error:
            raise TemporaryProblem(f"network problem ({str(error) or 'no answer in time'})") from None
        return read_answer(raw)


def read_answer(raw: bytes) -> dict:
    """The backend's answer as a dict, or Problem if it is not the JSON object the contract promises."""
    text = raw.decode("utf-8", errors="replace")
    try:
        answer = json.loads(text)
    except ValueError:
        hint = ""
        if "<html" in text[:1000].lower():
            hint = (" It is a web page instead. For Apps Script this usually means the web app is not "
                    "deployed for 'Anyone', or the address is not the one ending in /exec.")
        raise Problem(f"the answer was not JSON.{hint} It starts with: {text[:80]!r}") from None
    if not isinstance(answer, dict):
        raise Problem('the answer was JSON, but not an object like {"ok": ...}')
    return answer


def brief(answer: dict) -> str:
    """A short, printable version of an answer, for FAIL lines."""
    text = json.dumps(answer, ensure_ascii=False)
    return text if len(text) <= 200 else text[:197] + "..."


def fail_if_not_published(context: Context, answer: dict) -> None:
    """A live backend where nothing has been published from the control panel yet.
    The advice is printed in full only the first time, to keep the output short."""
    if answer.get("ok") is False and answer.get("error") == "not_published":
        advice = PUBLISH_ADVICE if not context.publish_advice_given else "Nothing is published yet (see above)."
        context.publish_advice_given = True
        raise CheckFailed(advice)


def fail_if_round_not_open(context: Context, answer: dict) -> None:
    """The backend refused a test message because round SMOKE-R1 is not open there.
    The advice is printed in full only the first time, to keep the output short."""
    if answer.get("ok") is False and answer.get("error") == "round_not_open":
        advice = "See the advice above." if context.round_advice_given else ROUND_ADVICE
        context.round_advice_given = True
        raise CheckFailed(f"the backend refused it with \"round_not_open\": round {SMOKE_ROUND} is not open "
                          f"there. {advice}")


# ============================================================================
# Fake test messages (obviously fake: a new DC-SMOKE-... DC each run, round SMOKE-R1)
# ============================================================================

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_smoke_dc() -> str:
    """A new, obviously fake DC id for this run, for example DC-SMOKE-20261021-105312-4f9a:
    the date and time on this Mac, then 4 random characters, so two runs in the same
    second still differ. 29 characters, all of them allowed in a DC id."""
    return SMOKE_DC_PREFIX + datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)


def make_token(secret: str, dc: str, round_id: str) -> str:
    """The link token, with the same formula as the backend (docs/submission-format.md, section 5)."""
    digest = hmac.new(secret.encode("utf-8"), f"{dc}|{round_id}".encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")[:22]


FAKE_CLIENT = {"ua": "smoke_test.py (automated check, not a real partner)",
               "viewport": "360x740", "tz_offset_min": -330, "net": None}


def make_ping(context: Context, stage: str) -> dict:
    """A progress signal shaped like the form's (section 2 of the contract)."""
    ping = {
        "kind": "ping", "schema_version": 1, "stage": stage,
        "survey_id": SERVICE_NAME, "config_version": "smoke-test", "app_version": "smoke-test",
        "dc": context.dc, "t": context.token, "round": SMOKE_ROUND,
        "session_id": context.session_id, "lang": "en", "mode": context.mode,
        "screen": "language", "step_index": 0, "step_total": 13, "at": utc_now_iso(),
    }
    if stage == "opened":
        ping["client"] = dict(FAKE_CLIENT)
    return ping


def make_submission(context: Context, token: str) -> dict:
    """A small fake submission shaped like the form's (section 3 of the contract).
    Each call gets a new random submission_id."""
    now = utc_now_iso()
    return {
        "kind": "submit",
        "schema_version": 1,
        "survey_id": SERVICE_NAME,
        "config_version": "smoke-test",
        "app_version": "smoke-test",
        "submission_id": "sub_smoke_" + secrets.token_hex(8),
        "session_id": context.session_id,
        "dc": context.dc,
        "t": token,
        "round": SMOKE_ROUND,
        "lang": "hi",
        "mode": context.mode,
        "opened_at": now,
        "started_at": now,
        "submitted_at": now,
        "sent_at": now,
        "attempt": 1,
        "resume_count": 0,
        "client": dict(FAKE_CLIENT, voice_supported=True, voice_denied=False, tts_voice=False),
        "answers": {"nps": 7, "support_gate": "no"},
        "ratings": [
            {"block": "function", "item": "payments", "rating": 2, "not_applicable": False,
             "threshold": 3, "below_threshold": True, "issue_code": "payout_delayed"},
            {"block": "function", "item": "app", "rating": 4, "not_applicable": False,
             "threshold": 3, "below_threshold": False, "issue_code": None},
        ],
        "free_text": [
            {"item_id": "fn_deep_dive:payments", "block": "function", "function": "payments",
             "issue_code": "payout_delayed", "question_key": "q.tell_more",
             # Some Hindi on purpose: checks that non-English text survives the trip.
             "text": "SMOKE TEST: नकली जवाब (fake answer, not from a real partner)",
             "audio": {"mime": "audio/webm;codecs=opus", "duration_s": 1.0, "bytes": len(FAKE_VOICE_NOTE),
                       "base64": base64.b64encode(FAKE_VOICE_NOTE).decode("ascii")}},
            {"item_id": "one_fix", "block": "one_fix", "function": None, "issue_code": None,
             "question_key": "q.one_fix", "text": "SMOKE TEST: fake typed answer", "audio": None},
        ],
        "events": [
            {"seq": 1, "screen": "nps", "at": now},
            {"seq": 2, "screen": "fn_rating:payments", "at": now},
            {"seq": 3, "screen": "thanks", "at": now},
        ],
    }


class Context:
    """What the checks share: the backend, this run's fake DC and its genuine
    token, what the questionnaire said (check 2) and the first fake submission."""

    def __init__(self, url: str, secret: str, expect_strict: bool, dc: str, dc_given: bool):
        self.backend = Backend(url)
        self.dc = dc                          # this run's fake DC
        self.dc_given = dc_given              # True when it came from --dc (then it may have been used before)
        self.token = make_token(secret, dc, SMOKE_ROUND)
        self.expect_strict = expect_strict
        self.mode = "mock"                    # replaced by what the health check reports
        self.session_id = "ses_smoke_" + secrets.token_hex(8)
        self.submission: dict | None = None
        self.languages: tuple[str, ...] = ()  # the languages the questionnaire offers (check 2)
        self.bootstrap_news: dict | None = None   # SMOKE-R1's "What changed" inside the questionnaire (check 2)
        self.round_advice_given = False       # "how to open round SMOKE-R1" is printed once
        self.publish_advice_given = False     # "publish from the control panel first" is printed once


def language_codes(languages) -> tuple[str, ...]:
    """The codes in the questionnaire's list of languages, e.g. ("en", "hi"); () when there are none."""
    if not isinstance(languages, list):
        return ()
    return tuple(entry["code"] for entry in languages
                 if isinstance(entry, dict) and isinstance(entry.get("code"), str) and entry["code"].strip())


def missing_languages(items: list, languages: tuple[str, ...]) -> list[str]:
    """What the "What changed" items lack, e.g. ["item 2 has no ta, te"]; empty when each item is complete."""
    gaps = []
    for number, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            gaps.append(f'item {number} is not shaped like {{"en": "...", "hi": "...", ...}}')
            continue
        missing = [lang for lang in languages if not (isinstance(item.get(lang), str) and item[lang].strip())]
        if missing:
            gaps.append(f"item {number} has no {', '.join(missing)}")
    return gaps


# ============================================================================
# The checks. Each returns a PASS explanation, or raises CheckFailed.
# ============================================================================

def check_health(context: Context) -> str:
    answer = context.backend.get(action="health")
    if answer.get("ok") is not True or answer.get("service") != SERVICE_NAME:
        raise CheckFailed(f'expected {{"ok": true, "service": "{SERVICE_NAME}", ...}} but got {brief(answer)}')
    if answer.get("mode") in ("mock", "live"):
        context.mode = answer["mode"]
    return (f"the backend is up (service {SERVICE_NAME}, mode {answer.get('mode')}, "
            f"its clock says {answer.get('time')}).")


def check_bootstrap(context: Context) -> str:
    answer = context.backend.get(action="bootstrap", round=SMOKE_ROUND)
    fail_if_not_published(context, answer)
    survey = answer.get("survey")
    strings = answer.get("strings")
    flow = survey.get("flow") if isinstance(survey, dict) else None
    if answer.get("ok") is not True or not isinstance(flow, list) or not flow:
        raise CheckFailed('expected {"ok": true, "survey": {"flow": [...screens...], ...}, "strings": {...}, ...} '
                          f"but got {brief(answer)}")
    # The form uses a questionnaire only when it lists its languages too
    # (web/js/net.js); without them every partner would get the form's own copy.
    languages = language_codes(survey.get("languages"))
    if not languages:
        raise CheckFailed('the questionnaire came back without its list of languages ("languages" is missing, '
                          "empty or has no language codes), so the form would not use it. Check the Languages "
                          "tab of the control panel (local server: web/config/survey.json), then publish again.")
    if not isinstance(strings, dict) or not isinstance(strings.get("q.nps"), dict):
        raise CheckFailed('the questionnaire came back, but its texts ("strings") have no "q.nps" (the '
                          '"How likely are you to recommend" question). Check the Texts tab of the control '
                          "panel (local server: web/i18n/strings.json), then publish again.")
    context.languages = languages
    news = answer.get("whats_changed")
    context.bootstrap_news = news if isinstance(news, dict) else None
    round_info = answer.get("round") if isinstance(answer.get("round"), dict) else {}
    status = round_info.get("status", "not given")
    result = (f"a questionnaire with {len(flow)} screens, {len(languages)} language(s) ({', '.join(languages)}) "
              f"and {len(strings)} texts (version {answer.get('config_version')}); round {SMOKE_ROUND} is {status}.")
    if status not in ("open", "closed"):
        result += (f" Heads-up: test messages for a round that is {status} are refused (round_not_open), "
                   f"so checks 5 to 8 will fail. {ROUND_ADVICE}")
        context.round_advice_given = True
    return result


def check_whats_changed(context: Context) -> str:
    """'What changed' for the test round and the demo round, as the backend serves it
    today: any number of items, even none, as long as each item is complete."""
    languages = context.languages or LANGUAGES
    found = []
    item_count = 0
    compared = False
    for round_id in (SMOKE_ROUND, DEMO_ROUND):
        answer = context.backend.get(action="whats_changed", round=round_id)
        fail_if_not_published(context, answer)
        items = answer.get("items")
        if answer.get("ok") is not True or not isinstance(items, list):
            raise CheckFailed(f'for round {round_id}, expected {{"ok": true, "items": [...]}} but got {brief(answer)}')
        gaps = missing_languages(items, languages)
        if gaps:
            raise CheckFailed(f"round {round_id}: every item needs a text in each language the questionnaire offers "
                              f"({', '.join(languages)}), but " + "; ".join(gaps) + ". Complete it in the control "
                              "panel (Rounds, What changed) and publish again (local server: "
                              "web/config/whats_changed.json).")
        if round_id == SMOKE_ROUND and context.bootstrap_news is not None:
            # The form takes this news from the questionnaire (check 2); older forms
            # use this request. Both must say the same (docs/submission-format.md, section 4).
            inside = context.bootstrap_news
            if inside.get("items") != items or inside.get("title") != answer.get("title"):
                raise CheckFailed(f"round {round_id}: this request and the questionnaire (check 2) give different "
                                  "'What changed' news, but both should come from the same published version. "
                                  "Run the test again; if it happens again, the backend is mixing up versions.")
            compared = True
        item_count += len(items)
        found.append(f"{round_id} has {len(items)} item(s)" if items else f"{round_id} has none")
    if item_count:
        result = (f"{' and '.join(found)}; every item has a text in each language the questionnaire offers "
                  f"({', '.join(languages)}).")
    else:
        result = f"no news for {SMOKE_ROUND} or {DEMO_ROUND}, which is fine (the form then skips that screen)."
    if not context.languages:
        result += " (The questionnaire did not say which languages it offers, so all six were required.)"
    if compared:
        result += f" {SMOKE_ROUND}'s news is the same as inside the questionnaire."
    return result


def check_unknown_round(context: Context) -> str:
    answer = context.backend.get(action="whats_changed", round=UNKNOWN_ROUND)
    fail_if_not_published(context, answer)
    if answer.get("ok") is True and answer.get("items") == []:
        return "an empty list, as expected (the form then skips the 'What changed' screen)."
    raise CheckFailed(f'expected {{"ok": true, "items": []}} but got {brief(answer)}')


def check_opened_ping(context: Context) -> str:
    answer = context.backend.post(make_ping(context, "opened"))
    fail_if_round_not_open(context, answer)
    if answer.get("ok") is True and answer.get("token_valid") is True:
        already = json.dumps(answer.get("already_submitted"))
        return f"accepted, and the token was recognised (already_submitted = {already})."
    if answer.get("error") == "bad_token" or answer.get("token_valid") is False:
        raise CheckFailed("the backend says the token is wrong. The secret this test uses probably differs "
                          "from the backend's secret: pass the right one with --secret.")
    if answer.get("ok") is True and "token_valid" not in answer and context.dc_given:
        # The live backend answers a bare {"ok": true}, and stores nothing, once a
        # DC goes over its limit of signals per 10 minutes.
        raise CheckFailed(f"the backend took the signal without confirming the token. The live backend does this "
                          f"when a DC has sent more than {PINGS_KEPT_PER_10_MINUTES} signals in 10 minutes in one "
                          f"round, so {context.dc} (given with --dc) was probably used too often. {NEW_DC_ADVICE}")
    raise CheckFailed(f'expected {{"ok": true, "token_valid": true, ...}} but got {brief(answer)}')


def check_new_submission(context: Context) -> str:
    context.submission = make_submission(context, token=context.token)
    answer = context.backend.post(context.submission)
    fail_if_round_not_open(context, answer)
    if (answer.get("ok") is True and answer.get("duplicate") is False
            and answer.get("submission_id") == context.submission["submission_id"]
            and isinstance(answer.get("received_at"), str)):
        return f"saved (duplicate = false, received_at {answer['received_at']})."
    if answer.get("ok") is True and answer.get("duplicate") is True:
        if context.dc_given:
            # The live backend answers "duplicate" without saving once a DC has
            # reached its limit, so that the phone stops sending.
            raise CheckFailed(f"the backend called a brand-new submission a 'duplicate'. The live backend does this "
                              f"when a DC already has {SUBMISSIONS_KEPT_PER_DC} saved submissions in the round, so "
                              f"{context.dc} (given with --dc) has probably been used too often in {SMOKE_ROUND}. "
                              f"{NEW_DC_ADVICE}")
        raise CheckFailed("the backend called a brand-new submission a 'duplicate'; it should have saved it as new.")
    raise CheckFailed('expected {"ok": true, "submission_id": <the one sent>, "duplicate": false, "received_at": ...} '
                      f"but got {brief(answer)}")


def check_resend(context: Context) -> str:
    # The same submission again, as the form re-sends it when an answer gets
    # lost on a bad network: same submission_id, next attempt number.
    retry = dict(context.submission or make_submission(context, token=context.token), attempt=2, sent_at=utc_now_iso())
    answer = context.backend.post(retry)
    fail_if_round_not_open(context, answer)
    if answer.get("ok") is True and answer.get("duplicate") is True:
        return "recognised as a repeat (duplicate = true), so it was not saved twice."
    if answer.get("ok") is True:
        raise CheckFailed("the backend saved the same submission_id a second time (duplicate = false). "
                          "Re-sent surveys would be counted twice.")
    raise CheckFailed(f'expected {{"ok": true, "duplicate": true, ...}} but got {brief(answer)}')


def check_wrong_token(context: Context) -> str:
    answer = context.backend.post(make_submission(context, token=WRONG_TOKEN))
    fail_if_round_not_open(context, answer)
    refused = answer.get("ok") is False and answer.get("error") == "bad_token"
    if context.expect_strict:
        if refused:
            return 'refused with "bad_token", as a strict backend should.'
        if answer.get("ok") is True:
            raise CheckFailed("the backend ACCEPTED a wrong token, but --expect-strict says it should refuse it. "
                              "Was the server started with --strict?")
    else:
        if answer.get("ok") is True:
            return ("accepted and saved, marked as a wrong token (normal for the local server without --strict). "
                    "For a strict backend, run this test with --expect-strict.")
        if refused:
            raise CheckFailed('the backend refused the wrong token ("bad_token"). That is right for a strict '
                              "backend: run this test again with --expect-strict.")
    raise CheckFailed(f"unexpected answer: {brief(answer)}")


def check_garbled_message(context: Context) -> str:
    answer = context.backend.post_raw(b"SMOKE TEST: this is deliberately not JSON")
    if answer.get("ok") is False and answer.get("error") == "bad_request":
        return 'refused with "bad_request", as expected.'
    raise CheckFailed(f'expected {{"ok": false, "error": "bad_request", ...}} but got {brief(answer)}')


CHECKS = (
    ("Health check", check_health),
    ("The questionnaire (bootstrap)", check_bootstrap),
    (f"'What changed' for rounds {SMOKE_ROUND} and {DEMO_ROUND}", check_whats_changed),
    ("'What changed' for a round that does not exist", check_unknown_round),
    ("'Opened' signal with a genuine token", check_opened_ping),
    ("New fake submission", check_new_submission),
    ("Same submission sent again", check_resend),
    ("Submission with a wrong token", check_wrong_token),
    ("Garbled message", check_garbled_message),
)


def run_checks(context: Context) -> int:
    """Run every check in order and print PASS/FAIL for each. Returns the number of failures."""
    failures = 0
    for number, (title, check) in enumerate(CHECKS, start=1):
        try:
            print(f"PASS  {number}. {title}: {check(context)}")
        except (CheckFailed, Problem) as failure:
            failures += 1
            print(f"FAIL  {number}. {title}: {failure}")
    return failures


# ============================================================================
# Command line
# ============================================================================

def web_address(text: str) -> str:
    parts = urllib.parse.urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise argparse.ArgumentTypeError(f"'{text}' is not a web address. Example: {DEFAULT_URL}")
    return text


def dc_id(text: str) -> str:
    """A DC id given with --dc, checked with the backends' own rule."""
    if not DC_ID_RULE.fullmatch(text) or text in (".", ".."):
        raise argparse.ArgumentTypeError(f"'{text}' is not a valid DC id. Use 1 to 64 letters, digits, '-', '_' "
                                         "or '.', for example DC-SMOKE-TEST.")
    return text


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python3 scripts/smoke_test.py",
        description=("Quick check that a Valmo Partner Pulse backend (the local test server, or the\n"
                     "live Apps Script) answers as docs/submission-format.md says.\n"
                     "Prints PASS or FAIL per check. Note: it sends a little obviously-fake test\n"
                     "data (round SMOKE-R1, and a new fake DC-SMOKE-... DC each run) to the backend,\n"
                     "which keeps it. It is safe to run again and again."),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=("examples:\n"
                "  python3 scripts/smoke_test.py                    check the local test server\n"
                "  python3 scripts/smoke_test.py --expect-strict    ...when it runs with --strict\n"
                "  python3 scripts/smoke_test.py --url https://script.google.com/macros/s/<id>/exec "
                "--secret \"$(pbpaste)\" --expect-strict\n"
                "  (live backend: publish once and open a round named SMOKE-R1 in the control panel first,\n"
                "   then copy the link secret: control panel > Links > Show the link secret)\n"),
    )
    parser.add_argument("--url", type=web_address, default=DEFAULT_URL,
                        help="Backend address (default: %(default)s, the local test server). "
                             "For Apps Script, use its web-app address ending in /exec.")
    parser.add_argument("--secret", default=None,
                        help="Secret the backend uses to check link tokens. Default: the MOCK_SECRET setting if "
                             "set, otherwise the local test server's public test secret.")
    parser.add_argument("--expect-strict", action="store_true",
                        help="Expect the backend to refuse wrong tokens (local server started with --strict, "
                             "or the live backend).")
    parser.add_argument("--dc", type=dc_id, default=None, metavar="DC_ID",
                        help="Rarely needed: use this obviously fake DC id instead of a new one for this run. "
                             f"The live backend saves at most {SUBMISSIONS_KEPT_PER_DC} submissions per DC and "
                             f"round, so after {SUBMISSIONS_KEPT_PER_DC} runs with the same id, check 6 fails. "
                             "Never use a real DC's id.")
    return parser.parse_args(argv)


def pick_secret(given: str | None) -> tuple[str, str]:
    """The secret to use, and a description of where it came from (never the secret itself)."""
    if given:
        return given, "the one given with --secret"
    if os.environ.get("MOCK_SECRET"):
        return os.environ["MOCK_SECRET"], "taken from the MOCK_SECRET setting"
    return MOCK_SECRET, "the local test server's built-in test secret"


def main(argv: list[str] | None = None) -> int:
    if sys.version_info < (3, 11):
        print(f"This script needs Python 3.11 or newer, but it was started with Python {sys.version.split()[0]}.")
        print("Install the latest Python from https://www.python.org/downloads/ and run it again.")
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")   # an unusual character must never stop the test
    args = parse_arguments(argv)
    secret, secret_source = pick_secret(args.secret)
    dc = args.dc or new_smoke_dc()
    print("Valmo Partner Pulse: backend smoke test")
    print(f"  Backend:      {args.url}")
    print(f"  Token secret: {secret_source}")
    print("  Expecting:    " + ("a STRICT backend (wrong tokens refused)" if args.expect_strict
                                else "a lenient backend (wrong tokens accepted but marked); use --expect-strict "
                                     "for a strict one"))
    print(f"  Test DC:      {dc}  " + ("(given with --dc)" if args.dc else "(a new fake DC for this run)"))
    if args.dc and not any(word in args.dc.upper() for word in TEST_ID_WORDS):
        print(f"  Heads-up:     {args.dc} does not look like a test id. Use only obviously fake ids "
              "(for example DC-SMOKE-...), never a real DC's.")
    print(f"  Note: this sends a little obviously-fake test data ({dc}, round {SMOKE_ROUND},")
    print("        including one tiny fake voice note) to the backend, which keeps it.")
    print("")

    context = Context(args.url, secret, args.expect_strict, dc, dc_given=bool(args.dc))
    try:
        failures = run_checks(context)
    except Unreachable as problem:
        print(f"STOP  Could not reach {args.url}: {problem}.")
        if args.url == DEFAULT_URL:
            print("      Is the local test server running? Start it in another Terminal window with:")
            print("          python3 scripts/mock_server.py")
            print("      then run this test again.")
        else:
            print("      Check the address given with --url, and that the backend is running.")
        return 1

    print("")
    if failures == 0:
        print(f"All {len(CHECKS)} checks passed. The backend follows docs/submission-format.md.")
    else:
        print(f"{failures} of {len(CHECKS)} checks FAILED. Each FAIL line above says what went wrong.")
    print(f"Reminder: the backend now holds fake test data for {dc} / {SMOKE_ROUND}.")
    if context.backend.is_local and context.mode == "mock":     # the local test server (check 1 says "mock")
        print("To clear ALL local test data later (not only this), stop the server and run:")
        print("    python3 scripts/mock_server.py --reset")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped before the end. Nothing else was sent.")
        sys.exit(1)
