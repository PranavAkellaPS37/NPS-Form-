# Data format: what the form sends, and what the backend answers

This is the **contract** between the form (`web/`) and whichever backend receives the answers:

- **Phase 1:** the local mock server, `scripts/mock_server.py`
- **Phase 2:** Google Apps Script

The pipeline (Phase 3) and the dashboard (Phase 4) read data in this same shape. If you change it, bump `schema_version` and update every reader.

You do not need to read this to *use* the survey. It is for whoever builds or debugs a backend.

---

## 1. Transport (how messages travel)

- There is **one endpoint URL**:
  - **Mock mode:** `/api` on the mock server (`http://localhost:8787/api`).
  - **Live mode:** the Apps Script web-app URL ending in `/exec`.
- **Every POST body is a JSON string, sent with `Content-Type: text/plain;charset=utf-8`.**
  - **Why plain text?** The browser treats a `text/plain` POST as a "simple" cross-origin request. It sends the request straight away instead of first sending an `OPTIONS` "preflight" request to ask permission.
  - Google Apps Script cannot answer preflight requests, so a `Content-Type: application/json` POST from GitHub Pages would be blocked.
  - The body is still JSON. The server simply parses the text.
- **The server always answers HTTP 200 with a JSON body** shaped like `{ "ok": true|false, ... }`, because Apps Script cannot set HTTP status codes. Clients must check `ok`, not the status code.
  - The mock server can deliberately answer `503` when started with `--fail-rate`, to test retries.
  - Clients treat any network error, non-200 status or unreadable body as *temporary* and retry.
- **GET requests** use `?action=...` (see section 4).

## 2. Message `ping` (progress telemetry; never contains answers)

These messages let the dashboard count **opened / started**, and see **which screen people drop off at**, even for partners who never submit.

| stage | When it is sent | How |
|---|---|---|
| `opened` | Every time the form finishes loading | `fetch`, so the response can be read (token check) |
| `started` | The first time the partner answers anything (once per device) | `navigator.sendBeacon` (fire and forget) |
| `progress` | When the partner leaves or hides the page before finishing (at most once every 10 seconds) | `navigator.sendBeacon` |

```json
{
  "kind": "ping",
  "schema_version": 1,
  "stage": "opened",
  "survey_id": "valmo-partner-pulse",
  "config_version": "2026-10-19.1",
  "app_version": "0.1.0",
  "dc": "DC-DEMO-001",
  "t": "Qm9ndXNUb2tlbkV4YW1wbGU",
  "round": "DEMO-R1",
  "session_id": "ses_8f3a0c2e1b7d4a96",
  "lang": "hi",
  "mode": "mock",
  "screen": "nps",
  "step_index": 2,
  "step_total": 13,
  "at": "2026-10-19T11:22:33.456Z",
  "client": { "ua": "Mozilla/5.0 (Linux; Android 11; ...)", "viewport": "360x740", "tz_offset_min": -330, "net": "4g" },
  "events": [ { "seq": 1, "screen": "language", "at": "2026-10-19T11:22:10.000Z" } ]
}
```

- `client` is only included on `opened`.
- `events` is only included on `progress`. It has the same shape as in `submit` (below).
- A `progress` ping whose `screen` is `thanks` means: the partner finished, but their answers were not confirmed yet when they left the page. The form sends them again the next time the link is opened on that phone.

**Response to `opened`:**

```json
{ "ok": true, "token_valid": true, "already_submitted": false }
```

| Response | What the form does |
|---|---|
| `{ "ok": false, "error": "bad_token" }` | Shows "This link is not valid" |
| `already_submitted: true` | Shows "Already received" (only if this device has no unfinished answers in progress) |
| No response, or an error (patchy data) | Carries on as normal; the token is checked again on submit |

The server's answers to `started` and `progress` are ignored.

## 3. Message `submit` (the full response)

The form sends this once the partner finishes the last question.

**How it travels.** Normally by `fetch`. If the partner leaves the page while it is still sending, and the message is small (about 50 KB or less, i.e. without long voice notes), the form hands the *same* message to `navigator.sendBeacon`, which the browser delivers even after the page has closed. A backend therefore receives identical `submit` bodies from both paths. The time the form waits for one send grows with its size (`backend.slow_upload_bytes_per_second`), so slow uploads of voice notes are not cut off.

**Retries are safe.** Every retry carries the same `submission_id`. The backend must store each `submission_id` only once, and simply answer `ok` with `"duplicate": true` for repeats. On patchy data a request can succeed on the server while the answer gets lost on the way back, so the form retries.

```json
{
  "kind": "submit",
  "schema_version": 1,
  "survey_id": "valmo-partner-pulse",
  "config_version": "2026-10-19.1",
  "app_version": "0.1.0",
  "submission_id": "sub_5c1d9e0f7a2b4c83",
  "session_id": "ses_8f3a0c2e1b7d4a96",
  "dc": "DC-DEMO-001",
  "t": "Qm9ndXNUb2tlbkV4YW1wbGU",
  "round": "DEMO-R1",
  "lang": "hi",
  "mode": "mock",
  "opened_at": "2026-10-19T11:22:05.120Z",
  "started_at": "2026-10-19T11:22:12.900Z",
  "submitted_at": "2026-10-19T11:23:31.004Z",
  "sent_at": "2026-10-19T11:23:31.050Z",
  "attempt": 1,
  "resume_count": 0,
  "client": {
    "ua": "Mozilla/5.0 (Linux; Android 11; ...)",
    "viewport": "360x740",
    "tz_offset_min": -330,
    "net": "3g",
    "voice_supported": true,
    "voice_denied": false,
    "tts_voice": true
  },
  "answers": {
    "nps": 6,
    "support_gate": "yes"
  },
  "ratings": [
    { "block": "function", "item": "losses",      "rating": 2,    "not_applicable": false, "threshold": 3,    "below_threshold": true,  "issue_code": "no_proof" },
    { "block": "function", "item": "payments",    "rating": 4,    "not_applicable": false, "threshold": 3,    "below_threshold": false, "issue_code": null },
    { "block": "function", "item": "consumables", "rating": null, "not_applicable": true,  "threshold": 3,    "below_threshold": false, "issue_code": null },
    { "block": "support",  "item": "agent_behaviour", "rating": 4, "not_applicable": false, "threshold": null, "below_threshold": null, "issue_code": null }
  ],
  "free_text": [
    {
      "item_id": "fn_deep_dive:losses",
      "block": "function",
      "function": "losses",
      "issue_code": "no_proof",
      "question_key": "q.tell_more",
      "text": "debit aaya par photo proof nahi diya",
      "audio": { "mime": "audio/webm;codecs=opus", "duration_s": 12.4, "bytes": 24816, "base64": "GkXfo59ChoEBQveBAULygQRC84EIQoKE..." }
    },
    {
      "item_id": "one_fix",
      "block": "one_fix",
      "function": null,
      "issue_code": null,
      "question_key": "q.one_fix",
      "text": "",
      "audio": { "mime": "audio/webm;codecs=opus", "duration_s": 8.1, "bytes": 16200, "base64": "..." }
    }
  ],
  "events": [
    { "seq": 1, "screen": "language",            "at": "2026-10-19T11:22:05.200Z" },
    { "seq": 2, "screen": "whats_changed",       "at": "2026-10-19T11:22:08.010Z" },
    { "seq": 3, "screen": "nps",                 "at": "2026-10-19T11:22:11.500Z" },
    { "seq": 4, "screen": "fn_rating:losses",    "at": "2026-10-19T11:22:14.100Z" },
    { "seq": 5, "screen": "fn_deep_dive:losses", "at": "2026-10-19T11:22:40.900Z" },
    { "seq": 6, "screen": "thanks",              "at": "2026-10-19T11:23:31.004Z" }
  ]
}
```

### Field reference

| Field | Meaning |
|---|---|
| `schema_version` | Version of *this* format. It is `1` today. |
| `config_version` | `config_version` from `web/config/survey.json`, i.e. which questionnaire the partner saw. |
| `app_version` | Version of the form's code. |
| `submission_id` | Random ID, created when the partner finishes. It is the same on every retry, and is the key for de-duplication. |
| `session_id` | Random ID for this device + DC + round. It stays the same if the partner closes the page and comes back. |
| `dc`, `t`, `round` | From the link. The backend re-checks `t`. |
| `lang` | Language code the partner was using when they finished. |
| `mode` | `mock` or `live`. |
| `opened_at` | First time this device opened this DC's link for this round. |
| `started_at` | First answer on this device. |
| `submitted_at` | When the partner finished. **Phone clock**, which can be wrong. |
| `sent_at` | When this particular attempt was sent (phone clock). `received_at − sent_at` estimates how far off the phone's clock is. |
| `attempt` | 1 for the first send, 2 for the first retry, and so on. |
| `resume_count` | How many times the partner reopened the page in the middle and carried on. |
| `client.net` | The phone's network-type guess (`slow-2g`, `2g`, `3g`, `4g`), or `null` if unknown. |
| `client.voice_supported` | Whether this phone can record voice in the browser. |
| `client.voice_denied` | Whether the partner blocked the microphone. |
| `client.tts_voice` | Whether the phone had a read-aloud voice for the chosen language. |
| `answers` | One value per *generic* screen that was answered, keyed by the screen `id` from `flow` (see the table below). Screens that were skipped or never shown are left out. |
| `ratings` | Area and support ratings (see the table below). |
| `free_text` | One item per voice note and/or typed answer. An item is only included if it has text or audio (see the table below). |
| `events` | One entry per screen *view*, in order. Going **Back** creates a new view with the next `seq`. The `thanks` view is the last entry. |

**Values in `answers`, by screen type:**

| Screen type | Value |
|---|---|
| `nps_0_10` | Whole number 0–10 |
| `yes_no` | `"yes"` or `"no"` |
| `rating_1_5` | 1–5 |
| `single_choice` | The option code |

**Fields in each `ratings` item:**

| Field | Meaning |
|---|---|
| `block` | `"function"` for the area ratings, `"support"` for the support block, `"question"` for generic `rating_1_5` screens (those also appear in `answers`). |
| `item` | The area id or support item id. |
| `rating` | 1–5, or `null` when `not_applicable` is true. |
| `threshold` | For areas, the threshold that applied. `null` for support. |
| `below_threshold` | For areas, true when the rating was at or below the threshold. `null` for support. |
| `issue_code` | The chip picked on that area's problem screen (`other` is possible). `null` if none. |

**Fields in each `free_text` item:**

| Field | Meaning |
|---|---|
| `item_id` | `fn_deep_dive:<area>`, `support_comment`, `one_fix`, or the `id` of a generic `free_text` screen. |
| `block` | `function` / `support` / `one_fix` / `question`. |
| `function` | The area id for `fn_deep_dive` items, otherwise `null`. |
| `issue_code` | The chip picked on that screen, if any. |
| `question_key` | The string key of the question that was shown. |
| `text` | Typed text, in any script (may be `""`). |
| `audio` | `null`, or `{ mime, duration_s, bytes, base64 }`. `base64` is the raw recording. |

### Only answers on the final path are sent

If a partner rates Payments 2, answers its problem screen, then goes **Back** and changes the rating to 5, the Payments problem answer is **dropped**. The same applies to the support ratings when the support answer changes to **No**. The submission always matches the screens the partner finally saw.

### Server responses to `submit`

| Response | Meaning | What the form does |
|---|---|---|
| `{ "ok": true, "submission_id": "...", "duplicate": false, "received_at": "..." }` | Stored | Shows "Thank you" |
| `{ "ok": true, "duplicate": true, ... }` | This `submission_id` was already stored, so nothing new was written | Shows "Thank you" |
| `{ "ok": false, "error": "bad_token" }` | Link is not genuine | Stops and shows "This link is not valid" |
| `{ "ok": false, "error": "bad_request", "message": "..." }` | The message is malformed (a bug) | Stops automatic retries, keeps the **Send now** button |
| `{ "ok": false, "error": "server_error", "message": "..." }` | Temporary problem | Retries automatically |

## 4. GET requests

**What changed (for screen S1):**

```
GET <endpoint>?action=whats_changed&round=DEMO-R1
-> { "ok": true, "round": "DEMO-R1", "title": null, "items": [ { "en": "...", "hi": "...", "ta": "...", "te": "...", "kn": "...", "ml": "..." } ] }
```

- An unknown round returns `"items": []`, and the form then skips the screen.
- The mock server reads `web/config/whats_changed.json`. Apps Script (Phase 2) will read a sheet tab, so you can edit it without redeploying.
- If the request fails or takes longer than `whats_changed.timeout_seconds`, the form falls back to `web/config/whats_changed.json`.

**Health check:**

```
GET <endpoint>?action=health
-> { "ok": true, "service": "valmo-partner-pulse", "mode": "mock", "time": "2026-10-19T11:22:33.456Z" }
```

## 5. The link token `t`

```
t = base64url( HMAC-SHA256( key = SECRET, message = DC_ID + "|" + ROUND_ID ) )
    with the trailing "=" padding removed, then cut to the first 22 characters
```

- Both the key and the message are UTF-8 text.
- The result is 22 characters of `A–Z a–z 0–9 - _`, i.e. 132 bits, which is far too many to guess.
- **Mock secret:** `mock-dev-secret-not-for-production`. You can override it with the environment variable `MOCK_SECRET`.
- **Live secret:** stored only in Apps Script's *Script Properties* (Phase 2). It is **never** stored in this repository.
- Links are generated with the same formula by `scripts/generate_links.py` (Phase 2).

## 6. What the mock server stores (on this Mac only, git-ignored)

Everything goes under `local_data/`:

| Path | Contents |
|---|---|
| `responses.jsonl` | One line per *accepted, non-duplicate* submission, in the `submit` shape above (see the changes listed below). |
| `events.jsonl` | One line per `ping`, plus `received_at` and `token_valid`. |
| `audio/<round>/<dc>/<submission_id>__<item_id>.<ext>` | The voice notes. In the file name, `:` in `item_id` becomes `-`. The extension is `.webm`, `.ogg` or `.m4a`, depending on `mime`. |

**How a stored submission differs from what the form sent:**

- `t` is removed. It is not needed once the token has been checked.
- Each `free_text[].audio.base64` is replaced by `audio.file`, a path relative to `local_data/`, for example `audio/DEMO-R1/DC-DEMO-001/sub_5c1d…__fn_deep_dive-losses.webm`.
- Server fields are added:
  - `received_at`
  - `token_valid` (true/false)
  - `server`: `"mock"`
  - `dc_round_seen_before`: true if this DC already had a submission for this round. The dashboard keeps the **latest** submission per DC per round.
