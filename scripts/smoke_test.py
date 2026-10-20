#!/usr/bin/env python3
"""
==============================================================================
 smoke_test.py  -  Valmo Partner Pulse: quick check that a BACKEND works
==============================================================================

WHAT THIS FILE IS FOR
  A fast, automatic check that a backend answers the way
  docs/submission-format.md (the agreement between the form and any backend)
  says it must. It works with:
    - the local test server (scripts/mock_server.py), now, in Phase 1;
    - the Google Apps Script backend, later, in Phase 2.
  It sends a few test messages and prints PASS or FAIL for each check, with a
  plain-English line explaining the result.

HOW TO RUN IT
  1. Start the backend first. For the local test server, in one Terminal window:
         python3 scripts/mock_server.py
  2. In a SECOND Terminal window, from the project folder:
         python3 scripts/smoke_test.py
     "All 8 checks passed" at the end means the backend is fine.

  Options:
    --url URL          Where the backend is. Default: http://localhost:8787/api
                       (the local test server). For Apps Script (Phase 2), use
                       its web-app address, which ends in /exec.
    --secret TEXT      The secret the backend uses to check link tokens.
                       Default: the MOCK_SECRET setting if it is set, otherwise
                       the public test secret of the local test server.
    --expect-strict    Use this when the backend refuses wrong tokens (the
                       local server started with --strict, or the live backend).
  Examples:
    python3 scripts/smoke_test.py
    python3 scripts/smoke_test.py --url http://localhost:8788/api
    python3 scripts/smoke_test.py --expect-strict     (server started with --strict)

WHAT IT CHECKS, IN ORDER
  1. Health: the backend is up and says it is "valmo-partner-pulse".
  2. "What changed" for round DEMO-R1: at least one item, each in all six
     languages (en, hi, ta, te, kn, ml).
  3. "What changed" for a round that does not exist: an empty list.
  4. An "opened" signal with a genuine token: accepted, token recognised.
  5. A new fake submission: saved (duplicate = false).
  6. The SAME submission sent again, as the form does on a bad network:
     recognised as a repeat (duplicate = true), not saved twice.
  7. A submission with a wrong token: accepted and marked as such (normal
     mode), or refused with "bad_token" (with --expect-strict).
  8. A garbled message that is not JSON: refused with "bad_request".

WHAT IT READS AND WRITES
  On this Mac: nothing. It only talks to the backend over the network.
  On the BACKEND: yes, it adds a little obviously-fake test data there:
  one "opened" signal and one or two saved survey submissions for the fake
  DC "DC-SMOKE-TEST", round "SMOKE-R1" (each with one tiny fake "voice note"
  that is not real audio). The backend keeps it.
    - Local test server: it ends up in local_data/. To clear ALL local test
      data (not only this): python3 scripts/mock_server.py --reset
    - Live backend: the pipeline and dashboard should ignore DC-SMOKE-TEST.

SAFETY NOTES
  - It never uses or sends real partner data.
  - The live secret (Phase 2) is a password. Do not paste it into chats or
    documents. Note that a command you type in Terminal (including --secret)
    is remembered in that Mac's Terminal history.
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
LANGUAGES = ("en", "hi", "ta", "te", "kn", "ml")

DEMO_ROUND = "DEMO-R1"                     # has sample "What changed" items
UNKNOWN_ROUND = "SMOKE-NO-SUCH-ROUND"      # must not exist anywhere
SMOKE_DC = "DC-SMOKE-TEST"                 # obviously fake DC used for every test message
SMOKE_ROUND = "SMOKE-R1"
WRONG_TOKEN = "WRONG-TOKEN-SMOKE-TEST"     # 22 characters, like a real token, but wrong
FAKE_VOICE_NOTE = b"SMOKE TEST: FAKE VOICE NOTE, NOT REAL AUDIO"

TIMEOUT_SECONDS = 60     # Apps Script can take a while to wake up
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


# ============================================================================
# Fake test messages (obviously fake: DC-SMOKE-TEST, round SMOKE-R1)
# ============================================================================

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


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
        "dc": SMOKE_DC, "t": context.token, "round": SMOKE_ROUND,
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
        "dc": SMOKE_DC,
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
    """What the checks share: the backend, the genuine token and the first fake submission."""

    def __init__(self, url: str, secret: str, expect_strict: bool):
        self.backend = Backend(url)
        self.token = make_token(secret, SMOKE_DC, SMOKE_ROUND)
        self.expect_strict = expect_strict
        self.mode = "mock"                    # replaced by what the health check reports
        self.session_id = "ses_smoke_" + secrets.token_hex(8)
        self.submission: dict | None = None


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


def check_whats_changed_demo(context: Context) -> str:
    answer = context.backend.get(action="whats_changed", round=DEMO_ROUND)
    items = answer.get("items")
    if answer.get("ok") is not True or not isinstance(items, list):
        raise CheckFailed(f'expected {{"ok": true, "items": [...]}} but got {brief(answer)}')
    if not items:
        raise CheckFailed(f"there are no items for {DEMO_ROUND}. Add at least one in web/config/whats_changed.json "
                          "(local server) or in the sheet (Apps Script).")
    gaps = []
    for number, item in enumerate(items, start=1):
        missing = [lang for lang in LANGUAGES
                   if not (isinstance(item, dict) and isinstance(item.get(lang), str) and item[lang].strip())]
        if missing:
            gaps.append(f"item {number} has no {', '.join(missing)}")
    if gaps:
        raise CheckFailed("every item needs all six languages (en hi ta te kn ml), but " + "; ".join(gaps) + ".")
    return f"{len(items)} item(s), each in all six languages."


def check_unknown_round(context: Context) -> str:
    answer = context.backend.get(action="whats_changed", round=UNKNOWN_ROUND)
    if answer.get("ok") is True and answer.get("items") == []:
        return "an empty list, as expected (the form then skips the 'What changed' screen)."
    raise CheckFailed(f'expected {{"ok": true, "items": []}} but got {brief(answer)}')


def check_opened_ping(context: Context) -> str:
    answer = context.backend.post(make_ping(context, "opened"))
    if answer.get("ok") is True and answer.get("token_valid") is True:
        already = json.dumps(answer.get("already_submitted"))
        return f"accepted, and the token was recognised (already_submitted = {already})."
    if answer.get("error") == "bad_token" or answer.get("token_valid") is False:
        raise CheckFailed("the backend says the token is wrong. The secret this test uses probably differs "
                          "from the backend's secret: pass the right one with --secret.")
    raise CheckFailed(f'expected {{"ok": true, "token_valid": true, ...}} but got {brief(answer)}')


def check_new_submission(context: Context) -> str:
    context.submission = make_submission(context, token=context.token)
    answer = context.backend.post(context.submission)
    if (answer.get("ok") is True and answer.get("duplicate") is False
            and answer.get("submission_id") == context.submission["submission_id"]
            and isinstance(answer.get("received_at"), str)):
        return f"saved (duplicate = false, received_at {answer['received_at']})."
    if answer.get("ok") is True and answer.get("duplicate") is True:
        raise CheckFailed("the backend called a brand-new submission a 'duplicate'; it should have saved it as new.")
    raise CheckFailed('expected {"ok": true, "submission_id": <the one sent>, "duplicate": false, "received_at": ...} '
                      f"but got {brief(answer)}")


def check_resend(context: Context) -> str:
    # The same submission again, as the form re-sends it when an answer gets
    # lost on a bad network: same submission_id, next attempt number.
    retry = dict(context.submission or make_submission(context, token=context.token), attempt=2, sent_at=utc_now_iso())
    answer = context.backend.post(retry)
    if answer.get("ok") is True and answer.get("duplicate") is True:
        return "recognised as a repeat (duplicate = true), so it was not saved twice."
    if answer.get("ok") is True:
        raise CheckFailed("the backend saved the same submission_id a second time (duplicate = false). "
                          "Re-sent surveys would be counted twice.")
    raise CheckFailed(f'expected {{"ok": true, "duplicate": true, ...}} but got {brief(answer)}')


def check_wrong_token(context: Context) -> str:
    answer = context.backend.post(make_submission(context, token=WRONG_TOKEN))
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
    (f"'What changed' for round {DEMO_ROUND}", check_whats_changed_demo),
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


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python3 scripts/smoke_test.py",
        description=("Quick check that a Valmo Partner Pulse backend (the local test server now,\n"
                     "Apps Script later) answers as docs/submission-format.md says.\n"
                     "Prints PASS or FAIL per check. Note: it sends a little obviously-fake test\n"
                     "data (DC-SMOKE-TEST, round SMOKE-R1) to the backend, which keeps it."),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=("examples:\n"
                "  python3 scripts/smoke_test.py                    check the local test server\n"
                "  python3 scripts/smoke_test.py --expect-strict    ...when it runs with --strict\n"
                "  python3 scripts/smoke_test.py --url https://script.google.com/macros/s/<id>/exec --expect-strict\n"),
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
    print("Valmo Partner Pulse: backend smoke test")
    print(f"  Backend:      {args.url}")
    print(f"  Token secret: {secret_source}")
    print("  Expecting:    " + ("a STRICT backend (wrong tokens refused)" if args.expect_strict
                                else "a lenient backend (wrong tokens accepted but marked); use --expect-strict "
                                     "for a strict one"))
    print(f"  Note: this sends a little obviously-fake test data ({SMOKE_DC}, round {SMOKE_ROUND},")
    print("        including one tiny fake voice note) to the backend, which keeps it.")
    print("")

    context = Context(args.url, secret, args.expect_strict)
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
    print(f"Reminder: the backend now holds fake test data for {SMOKE_DC} / {SMOKE_ROUND}.")
    if is_local_address(urllib.parse.urlsplit(args.url).hostname or ""):
        print("To clear ALL local test data later (not only this), stop the server and run:")
        print("    python3 scripts/mock_server.py --reset")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped before the end. Nothing else was sent.")
        sys.exit(1)
