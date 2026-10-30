<!--
===============================================================================
docs/submission-format.md: what the form sends, and what the backend answers
===============================================================================
What this file is for
  The data contract between the survey form (web/) and the two backends it
  can talk to: the test server on the Mac (scripts/mock_server.py) and the
  live Google Apps Script web app (apps-script/Code.gs). It also says where
  the live backend keeps the answers, and the rules for reading them
  correctly (for the Phase 3 pipeline and the Phase 4 dashboard).

Who needs it
  Whoever builds, changes or debugs the form, a backend, the pipeline or the
  dashboard. You do not need it to USE the survey or the control panel.

What it reads and writes
  Nothing. It is documentation only.

When to update it
  Whenever the form, scripts/mock_server.py or apps-script/Code.gs changes
  what is sent, answered or stored. A change to the message formats also
  needs a new schema_version, together with every reader.

Safety
  Every example uses fake data (DC-DEMO-..., made-up tokens). Never paste
  real partner data, real links, tokens or voice notes into this file.
===============================================================================
-->

# Data format: what the form sends, and what the backend answers

This is the **contract** between the form (`web/`) and whichever backend it talks to:

- **Test mode:** the local mock server, `scripts/mock_server.py`, on your Mac. This document also calls it the *test server*.
- **Live mode:** the Google Apps Script web app that belongs to the control panel (the Google Sheet "Valmo Partner Pulse - Control").

The pipeline (Phase 3) and the dashboard (Phase 4) read data in this same shape. If you change it, bump `schema_version` and update every reader.

You do not need to read this to *use* the survey. It is for whoever builds or debugs a backend, the pipeline or the dashboard.

The control panel, publishing, rounds and the live storage are described in [control-panel-design.md](control-panel-design.md). This document covers what travels between a phone and a backend, what a backend stores, and how to read what it stores.

**What is new in Phase 2** (the message formats themselves did not change, so `schema_version` is still `1`):

- the form asks for the published questionnaire with **one** `GET ?action=bootstrap` request, and downloads its own copy of the texts only when that request fails ([section 4](#4-get-requests));
- survey **rounds have a status**: a draft round answers `round_not_open` (on the live backend, so does a round id it has never seen), and a closed round still accepts late answers ([section 7](#7-round-status-draft-open-closed));
- stored submissions get a server field **`late`** ([section 6](#6-what-the-mock-server-stores-on-this-mac-only-git-ignored));
- **preview links** never send anything, and carry a private **preview key** (`pk`) without which the live backend refuses to hand out the draft (`bad_preview_key`) ([section 8](#8-preview-links-preview1));
- where the live backend keeps the data, and **how to read it correctly** ([section 9](#9-what-the-live-backend-apps-script-stores));
- the **limits** on what a message may contain ([section 10](#10-limits-how-big-a-message-may-be)), and the places where the test server and the live backend **behave differently** ([section 11](#11-where-the-test-server-and-the-live-backend-differ)).

---

## 1. Transport (how messages travel)

- There is **one endpoint URL**:
  - **Mock mode:** `/api` on the mock server (`http://localhost:8787/api`).
  - **Live mode:** the Apps Script web-app URL ending in `/exec`. The form reads it from `backend.apps_script_url` in its own `web/config/survey.json`. The control panel records the checked address (Home or Settings > **Web app address** > **Check and save**) and writes it into that setting when you download the files for the GitHub copy. Without a recorded address, the downloaded `survey.json` stays in test mode (`"mock"`).
- **Every POST body is a JSON string, sent with `Content-Type: text/plain;charset=utf-8`.**
  - **Why plain text?** The browser treats a `text/plain` POST as a "simple" cross-origin request. It sends the request straight away instead of first sending an `OPTIONS` "preflight" request to ask permission.
  - Google Apps Script cannot answer preflight requests, so a `Content-Type: application/json` POST from GitHub Pages would be blocked.
  - The body is still JSON. The server simply parses the text.
- **The live backend always answers HTTP 200 with a JSON body** shaped like `{ "ok": true|false, ... }`, because Apps Script cannot set HTTP status codes. Clients must check `ok`, not the status code.
  - The test server answers 200 too, with two deliberate exceptions: `503` when started with `--fail-rate` (to test retries), and `413` for a message over 25 MB ([section 10](#10-limits-how-big-a-message-may-be)).
  - Clients treat any network error, non-200 status or unreadable body as *temporary* and retry.
- **GET requests** use `?action=...` (see section 4). They need no token, and the form sends them without cookies. The one exception is a preview's request for the unpublished draft (`draft=1`), which must carry the preview key `pk`.

## 2. Message `ping` (progress telemetry; never contains answers)

These messages let the dashboard count **opened / started**, and see **which screen people drop off at**, even for partners who never submit.

| stage | When it is sent | How |
|---|---|---|
| `opened` | Every time the form finishes loading | `fetch`, so the response can be read (token and round check) |
| `started` | The first time the partner answers anything (once per device) | `navigator.sendBeacon` (fire and forget) |
| `progress` | When the partner leaves or hides the page before finishing (at most once every 10 seconds) | `navigator.sendBeacon` |

No ping is sent from a [preview link](#8-preview-links-preview1), nor after the form has shown "This survey has closed" or "This survey is not open yet" ([section 7](#7-round-status-draft-open-closed)).

```json
{
  "kind": "ping",
  "schema_version": 1,
  "stage": "opened",
  "survey_id": "valmo-partner-pulse",
  "config_version": "p7-2026-10-21",
  "app_version": "0.3.3",
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
- A `progress` ping whose `screen` is an ending (`thanks`, or the id of another thank-you screen: [several endings](#several-endings-and-questions-asked-for-each-area)) means: the partner finished, but their answers were not confirmed yet when they left the page. The form sends them again the next time the link is opened on that phone.
- `config_version` is the version of the questionnaire the phone uses on this visit. (A submission's is the version the partner finished on, even when it is sent on a later visit, with one narrow exception: see the field reference in section 3.)

**Response to `opened`:**

```json
{ "ok": true, "token_valid": true, "already_submitted": false, "round_status": "open" }
```

- `token_valid`: always `true` from the live backend, which answers a wrong token with `bad_token` instead. The test server stores a ping with a wrong token and answers `"token_valid": false`, unless it was started with `--strict`.
- `already_submitted`: on the live backend, `true` when this DC already has a stored submission in this round (sent from any phone). The test server says `true` only when it was started with `--one-response-per-dc`.
- `round_status`: `open` or `closed`. A draft round gets `round_not_open` instead (see the table).

| Response | What the form does |
|---|---|
| `{ "ok": false, "error": "bad_token" }` | Shows "This link is not valid" |
| `{ "ok": false, "error": "round_not_open" }` | Shows "This survey is not open yet". Nothing more is sent during this visit ([section 7](#7-round-status-draft-open-closed)) |
| `already_submitted: true` | Shows "Already received" (only if this device has no unfinished answers in progress) |
| `round_status: "closed"` | Only used when the bootstrap did not arrive: a partner who has not started yet on this phone sees "This survey has closed" |
| No response, or an error (patchy data) | Carries on as normal; the token is checked again on submit |

- The server's answers to `started` and `progress` are ignored.
- The live backend answers a ping for a draft round, or for a round id it has never seen, with `round_not_open` and does not store it. The test server does this only for rounds listed in `--draft-rounds`.
- **Rate limit (live backend only):** pings above 60 per DC and round in 10 minutes are answered just `{ "ok": true }` (an `opened` ping too) and are not stored.

## 3. Message `submit` (the full response)

The form sends this once the partner finishes the last question.

**How it travels.** Normally by `fetch`. If the partner leaves the page while it is still sending, and the message is small (about 50 KB or less, i.e. without long voice notes), the form hands the *same* message to `navigator.sendBeacon`, which the browser delivers even after the page has closed. A backend therefore receives identical `submit` bodies from both paths. The time the form waits for one send grows with its size (`backend.slow_upload_bytes_per_second`), so slow uploads of voice notes are not cut off.

**Retries are safe.** Every retry carries the same `submission_id`. The backend must store each `submission_id` only once, and simply answer `ok` with `"duplicate": true` for repeats. On patchy data a request can succeed on the server while the answer gets lost on the way back, so the form retries.

```json
{
  "kind": "submit",
  "schema_version": 1,
  "survey_id": "valmo-partner-pulse",
  "config_version": "p7-2026-10-21",
  "app_version": "0.3.3",
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
| `config_version` | The version of the questionnaire the partner **finished** on: the **published** version from the bootstrap (for example `p7-2026-10-21`), or, when the bootstrap did not arrive, `config_version` from the form's own `web/config/survey.json` (for example `2026-10-19.1`). **Since 30 Oct 2026 (`app_version` 0.3.3) this holds even when the send happens on a later visit**, after a failed send, and that visit loaded another questionnaire (a newer published version, or the form's own copy because Google took more than 6 seconds): the first send keeps a copy of the finished answers on the phone, and every later send uses that copy and its `config_version`, so `answers`, `ratings` and `free_text` are exactly as the partner finished them. Any send keeps the copy, the page-closing beacon included, unless a voice note is still being saved (then a later send keeps it), and the copy leaves the phone with everything else once the answers arrive. Before, a later visit rebuilt the answers from its own questionnaire: answers to screens that questionnaire doesn't have were dropped, and its version was stamped. **One narrow exception remains:** the copy is made only when the partner finished during that visit, or when the questionnaire in use is the one they finished on. So answers finished with a form older than 0.3.3, or whose sends before the partner left were all made while a voice note was still being saved, and that are then sent on a later visit running another questionnaire, are still rebuilt from that other questionnaire and carry its version. |
| `app_version` | Version of the form's code: `0.3.3` since 30 Oct 2026. Before, `0.2.0` from Phase 2 on, also in the releases 0.3.0 to 0.3.2 ([CHANGELOG](../CHANGELOG.md)), which left it unchanged: `0.2.0` alone does not tell those releases apart. |
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
| `answers` | One value per *generic* screen that was answered, keyed by the screen `id` from `flow` (see the table below), or by its `store_as` code: a question asked once for each area sends one value per area, keyed `<id>:<area>` ([below](#several-endings-and-questions-asked-for-each-area)). Screens that were skipped or never shown are left out. |
| `ratings` | Area and support ratings (see the table below). |
| `free_text` | One item per voice note and/or typed answer. An item is only included if it has text or audio (see the table below). |
| `events` | One entry per screen *view*, in order. Going **Back** creates a new view with the next `seq`, and the views of screens the partner then left behind stay in the list, so `events` is not the final route ([section 9](#reading-the-data-correctly-for-the-pipeline-and-the-dashboard), item 7). The view of the ending the partner reached is the last entry: `thanks`, or the id of another thank-you screen. The form keeps the latest 300 views. |

**Values in `answers`, by screen type:**

| Screen type | Value |
|---|---|
| `nps_0_10` | Whole number 0–10 |
| `yes_no` | `"yes"` or `"no"` |
| `rating_1_5` | 1–5 |
| `single_choice` | The option code |
| `multi_choice` (pick several, since 28 Oct 2026) | A **list** of the option codes ticked, in the options' order, for example `["load", "payments"]`; not sent when nothing is ticked. The server stores it as it is, inside `answers_json`; whoever reads the answers must expect a list here |

A kind of question added as a plug-in (`web/js/types/`) sends what its description's `records` say ([flow-engine.md](flow-engine.md) §10): usually just its value in `answers`. A ratings row is only ever sent for a value from 1 to 5.

**Fields in each `ratings` item:**

| Field | Meaning |
|---|---|
| `block` | `"function"` for the area ratings, `"support"` for the support block, `"question"` for generic `rating_1_5` screens (those also appear in `answers`). |
| `item` | The area id or support item id; for a generic `rating_1_5` screen, its id (`<id>:<area>` when it is asked for each area). |
| `rating` | 1–5, or `null` when `not_applicable` is true. |
| `threshold` | For areas, the threshold that applied. `null` for support. |
| `below_threshold` | For areas, true when the rating was at or below the threshold. `null` for support. |
| `issue_code` | The chip picked on that area's problem screen (`other` is possible). `null` if none. |

**Fields in each `free_text` item:**

| Field | Meaning |
|---|---|
| `item_id` | `fn_deep_dive:<area>`, `support_comment`, `one_fix`, or the `id` of a generic `free_text` screen (`<id>:<area>` when it is asked for each area). |
| `block` | `function` / `support` / `one_fix` / `question`. |
| `function` | The area id for `fn_deep_dive` items, otherwise `null`. |
| `issue_code` | The chip picked on that screen, if any. |
| `question_key` | The string key of the question that was shown. |
| `text` | Typed text, in any script (may be `""`). |
| `audio` | `null`, or `{ mime, duration_s, bytes, base64 }`. `base64` is the raw recording (standard base64, not the URL-safe kind). |

### Only answers on the final path are sent

If a partner rates Payments 2, answers its problem screen, then goes **Back** and changes the rating to 5, the Payments problem answer is **dropped**. The same applies to the support ratings when the support answer changes to **No**, and to a pick-several question: a partner who ticks Payments, answers the Payments reason screen, then goes **Back** and unticks Payments sends no Payments reason. The submission always matches the screens the partner finally saw. Since 23 Oct 2026 the same is true for the rules themselves: a rule ("show only if", a jump) only ever sees answers on the partner's current route, never one left behind by going Back.

### Several endings and questions asked for each area

Since 23–26 Oct 2026 the questionnaire's route can branch ([flow-engine.md](flow-engine.md)). The message format is unchanged (`schema_version` is still `1`); two things can now look different:

- **Several endings.** A route can end on its own thank-you screen (for example a short route for promoters). Reaching any ending sends the answers. The `events` then end at **that ending's id** (for example `promoter_end` instead of `thanks`), and a `progress` ping sent from it carries that id as its `screen`. To know which route a partner took, read the last `events` row of their submission.
- **A question asked once for each area** (or each area rated low) stores one answer per area under `<id>:<area>`, the way the built-in area screens use `fn_rating:<area>` and `fn_deep_dive:<area>`. For example a yes/no question `long_running` asked for Payments and App / Tech sends `"long_running:payments": "yes"` and `"long_running:app": "no"` in `answers`. A faces question asked this way also sends a `question` ratings row per area with that `item`; a voice/typing one, a `free_text` item per area with that `item_id` (`block` `question`, `function` `null`).

Both are listed screen by screen by `python3 scripts/flow.py screens --published <file>` ([section 9](#reading-the-data-correctly-for-the-pipeline-and-the-dashboard), item 5): each `screen` there is exactly what `events` and pings say, with `end: true` on the endings.

### Server responses to `submit`

A backend checks, in this order:

1. **The message** (`bad_request`): its shape, the ids, and the limits in [section 10](#10-limits-how-big-a-message-may-be).
2. **The token** (`bad_token`).
3. **The round** (`round_not_open`).
4. **The voice notes** (`bad_request`): each recording must be valid standard base64 and at most 5 MB once decoded, and its item needs an `item_id`. The live backend does this only now, after the token and round checks, so it never spends time decoding a forged message. The test server does it as part of step 1, before the token. So a message with a broken recording and a wrong token gets `bad_token` from the live backend (or `round_not_open`, when its token is right but the round is not open), but `bad_request` from the test server.
5. **Duplicates, then storing** (see [section 9](#9-what-the-live-backend-apps-script-stores) for the live order of work).

| Response | Meaning | What the form does |
|---|---|---|
| `{ "ok": true, "submission_id": "...", "duplicate": false, "received_at": "..." }` | Stored (for a closed round: stored and marked `late`) | Shows "Thank you" |
| `{ "ok": true, "duplicate": true, ... }` | Nothing new was written. Either this `submission_id` was already stored (`received_at` is then the first copy's, when known), or, on the live backend only, this DC already has 10 stored submissions in this round ([section 10](#10-limits-how-big-a-message-may-be)): only the backend's log says so, and `received_at` is the time of this answer | Shows "Thank you" |
| `{ "ok": false, "error": "bad_token" }` | Link is not genuine (the test server says so only when started with `--strict`) | Stops and shows "This link is not valid" |
| `{ "ok": false, "error": "round_not_open" }` | The round is a draft (not started yet) or, on the live backend, a round id it has never seen. Nothing was stored | Shows "This survey is not open yet". **No retries** during this visit. The answers stay on the phone and are sent the next time the link is opened, once the round is open |
| `{ "ok": false, "error": "bad_request", "message": "..." }` | The message is malformed (a bug), or too big | Stops automatic retries, keeps the **Send now** button |
| `{ "ok": false, "error": "server_error", "message": "..." }` | Temporary problem. Apps Script answers "busy, try again" when a submission waited more than 8 seconds for its turn. A live backend that is not set up yet (no link secret) also answers `server_error`, never `bad_token`, so phones keep the answers | Retries automatically |

## 4. GET requests

### Bootstrap: the questionnaire (one request when a link is opened)

```
GET <endpoint>?action=bootstrap&round=DEMO-R1                            (normal links)
GET <endpoint>?action=bootstrap&round=DEMO-R1&draft=1&pk=<preview key>   (preview links)
```

```json
{
  "ok": true,
  "draft": false,
  "round": { "id": "DEMO-R1", "status": "open" },
  "version": 7,
  "config_version": "p7-2026-10-21",
  "survey": { "...": "the questionnaire, same structure as web/config/survey.json" },
  "strings": { "q.nps": { "en": "...", "hi": "...", "ta": "...", "te": "...", "kn": "...", "ml": "..." } },
  "whats_changed": { "title": null, "items": [ { "en": "...", "hi": "..." } ] },
  "clips": { "q.nps": { "hi": "https://..." } }
}
```

| Field | Meaning |
|---|---|
| `round.status` | `draft`, `open` or `closed`. **Live backend:** `draft` means the round is in the control panel's Rounds list but was never opened, **or** the backend has never seen that round id (it was never saved in the Rounds list, or the link has a mistyped round). It never answers `unknown`: that status exists only inside the form, when the bootstrap did not arrive. **Test server:** `open`, unless the round is listed in `--closed-rounds` or `--draft-rounds`. See [section 7](#7-round-status-draft-open-closed). |
| `version` | The published version number. `null` for a draft (preview) and on the mock server. |
| `config_version` | The questionnaire's version stamp, also found inside `survey`, for example `p7-2026-10-21`. `"draft"` for a live preview. |
| `survey` | Same structure as `web/config/survey.json`, **without** the notes for humans (`_help`), without `links`, and with `backend` holding only `request_timeout_seconds`, `slow_upload_bytes_per_second` and `retry_delays_seconds`. Hidden (inactive) items are left out. |
| `strings` | Every text, one value per active language. A missing translation arrives as `"[TRANSLATE] " + English`, which the form shows in English. |
| `whats_changed` | That round's "What changed" block, or `{ "title": null, "items": [] }` (the form then skips that screen). |
| `clips` | Optional pre-recorded read-aloud clips: text key → language → URL. |

- **No token is needed**: the questionnaire is not secret. Never put partner data or secrets into texts or settings.
- **A missing or invalid `round`** gets `{ "ok": false, "error": "bad_request", "message": "..." }` from both backends.
- **Nothing published yet** (live backend): `{ "ok": false, "error": "not_published" }`.
- `draft=1` (preview): the admins' current, unpublished draft **as last saved**, compiled from the Sheet's tabs, with `"draft": true`, `"version": null` and `"config_version": "draft"`. The live backend keeps the compiled draft in its script cache for 30 seconds, so a preview link shared around cannot make the script re-read the whole Sheet on every visit. Every save in the control panel clears that cache, so a preview shows saved changes at once; edits typed straight into the Sheet's tabs show within 30 seconds.
- **`draft=1` needs the preview key.** The live backend hands out the draft only when the request also carries `pk=<preview key>`: the private key that set-up creates (Script Property `PREVIEW_KEY`) and that the control panel puts into every preview link. A missing or wrong key gets `{ "ok": false, "error": "bad_preview_key" }` (so does every preview request while the backend has no preview key yet; Set up or repair creates it). So someone who only knows the web app address can neither read the unpublished draft nor make the script re-read the whole Sheet. The mock server ignores `pk`.

**Meesho-only mode** (21 Oct 2026): while the web app is open only to people signed in with a company account, the web app serves the survey page itself, and the same messages and answers travel through Google's own channel instead (`google.script.run.ppFormRequest`: `"bootstrap"` with `{round, draft, pk}`, `"post"` with the message text; [control-panel-design.md, section 12](control-panel-design.md#12-public-web-api-doget--dopost-in-codegs)). Nothing in the messages changes.

**What the form does with it** (`web/js/app.js`):

1. It first loads only its own `web/config/survey.json` (it comes with the form from GitHub Pages and says where the backend is).
2. Then it asks for the bootstrap (only when the link is complete: `dc` and `round` are usable ids, and a live link has a token; an incomplete link gets only the "This link is incomplete" message) and waits at most `whats_changed.timeout_seconds + 2` seconds (the setting from its own copy; 4 + 2 = 6 seconds by default). A preview waits up to 20 seconds instead (or `timeout_seconds + 2`, if that is longer), because compiling the draft can take Google longer.
3. **Answer received** (`ok` is true and it contains screens, languages and texts): the form uses the published `survey`, `strings`, `whats_changed` and `clips`, and applies the colours again. These always stay as in its own copy, because the form needs them before it can ask: `backend.mode`, `backend.mock_url`, `backend.apps_script_url` and `links`.
4. **No answer in time, an error, `not_published`, `bad_preview_key`, an unusable answer, or a published questionnaire that breaks the form while it starts:** only now does the form download its own `web/i18n/strings.json` (so a phone never downloads the texts twice), and it uses its own copy, plus `web/config/whats_changed.json` and `web/config/audio_clips.json`. The round status is then `unknown` (after a published questionnaire that breaks the form, the status that answer gave is kept), and the survey carries on. In a preview that asked for the draft, the PREVIEW strip then adds the text `dev.preview_fallback` ([section 8](#8-preview-links-preview1)), or `dev.preview_broken` when the draft arrived but breaks the form; a preview link without a round is simply incomplete.
5. Only after this does it look at the link's language, the saved progress on the phone and the round status, because the published questionnaire may offer different languages.

The mock server builds the bootstrap from the files in `web/` every time (so edits show up at once). It answers `version: null`, the `config_version` of `web/config/survey.json`, `draft` as asked, and the round status `open`, unless the round is listed in `--closed-rounds` or `--draft-rounds`.

### What changed (kept for older forms)

```
GET <endpoint>?action=whats_changed&round=DEMO-R1
-> { "ok": true, "round": "DEMO-R1", "title": null, "items": [ { "en": "...", "hi": "...", "ta": "...", "te": "...", "kn": "...", "ml": "..." } ] }
```

- The form no longer uses this request: the bootstrap carries the same content. Backends keep answering it for compatibility, and `scripts/smoke_test.py` still checks it.
- An unknown round returns `"items": []`.
- The mock server reads `web/config/whats_changed.json`. The live backend answers from the published version (`not_published` when nothing is published yet).

### Health check

```
GET <endpoint>?action=health
-> { "ok": true, "service": "valmo-partner-pulse", "mode": "mock", "time": "2026-10-19T11:22:33.456Z" }
```

The live backend answers `"mode": "live"` and adds two fields:

- `live_version`: the published version number (`null` when nothing is published yet);
- `runs_as_owner`: `true` when the web app runs as the person who set Partner Pulse up (Script Property `OWNER_EMAIL`), so the files it creates land in their Google Drive. The email itself is never sent: this answer is public.
- `form_page`: `true` from the code of 21 Oct on, which can serve the survey page itself in Meesho-only mode; the control panel uses it to spot a deployment that still runs older code.

## 5. The link token `t`

```
t = base64url( HMAC-SHA256( key = SECRET, message = DC_ID + "|" + ROUND_ID ) )
    with the trailing "=" padding removed, then cut to the first 22 characters
```

- Both the key and the message are UTF-8 text.
- The result is 22 characters of `A–Z a–z 0–9 - _`, i.e. 132 bits, which is far too many to guess.
- **Mock secret:** `mock-dev-secret-not-for-production`. You can override it with the environment variable `MOCK_SECRET`.
- **Live secret:** stored only in Apps Script's *Script Properties* (`LINK_SECRET`). It is **never** stored in this repository. If it is missing (set-up never ran), the live backend answers every well-formed ping and submission with `server_error`, never `bad_token`: the links are fine, the backend is not ready, so phones keep the answers and send them later.
- Links are generated with the same formula by the control panel and by `scripts/generate_links.py`.
- Preview links need no token, because they never send anything. They carry the preview key `pk` instead ([section 8](#8-preview-links-preview1)), which only unlocks the draft questionnaire: it cannot make partner links, and the backend never accepts it in place of a token.

## 6. What the mock server stores (on this Mac only, git-ignored)

Everything goes under `local_data/`:

| Path | Contents |
|---|---|
| `responses.jsonl` | One line per *accepted, non-duplicate* submission, in the `submit` shape above (see the changes listed below). |
| `events.jsonl` | One line per accepted `ping`, plus `received_at` and `token_valid`. |
| `audio/<round>/<dc>/<submission_id>__<item_id>.<ext>` | The voice notes. In the file name, `:` in `item_id` becomes `-`, and a second note with the same name gets `-2`, `-3`, .... The extension is `.webm`, `.ogg` or `.m4a`, depending on `mime`, or `.bin` for a format it does not know. |

**How a stored submission differs from what the form sent:**

- `t` is removed. It is not needed once the token has been checked.
- Each `free_text[].audio.base64` is replaced by `audio.file`, a path relative to `local_data/`, for example `audio/DEMO-R1/DC-DEMO-001/sub_5c1d…__fn_deep_dive-losses.webm`.
- Server fields are added:
  - `received_at`
  - `token_valid` (true/false). Unless the test server was started with `--strict`, a submission or ping with a wrong token is still stored, with `token_valid: false`.
  - `late` (true/false): true when the round was already **closed** when the answers arrived ([section 7](#7-round-status-draft-open-closed))
  - `server`: `"mock"`
  - `dc_round_seen_before`: true if this DC already had a submission for this round. The dashboard keeps the **latest** submission per DC per round ([section 9](#reading-the-data-correctly-for-the-pipeline-and-the-dashboard)).

Messages for a draft round (`--draft-rounds`) are answered `round_not_open` and not stored. The test server has no limit on submissions or pings per DC (`--one-response-per-dc` only changes the `already_submitted` answer), and it never leaves unused voice-note files: it saves the recordings only after the duplicate check, and a save that fails deletes the files it wrote.

## 7. Round status: draft, open, closed

Every survey round has a status, set in the control panel's **Rounds** section. It takes effect immediately, without publishing.

| Status | Bootstrap says | What a partner sees | Pings and submissions |
|---|---|---|---|
| `draft` (in the Rounds list, never opened) | `"draft"` | "This survey is not open yet. Please open the same link again once it starts." | Answered `round_not_open`, **not stored** |
| `open` | `"open"` | The survey | Stored |
| `closed` | `"closed"` | "This survey has closed. Thank you. Look out for the next round." **Except** a partner who had already started on that phone, or finished but whose answers were not sent yet: they may finish | Accepted and stored, the submission marked **`late` = true** |
| A round id the live backend has never seen (never saved in the Rounds list, or mistyped in the link) | `"draft"` | "This survey is not open yet", straight away, as for a draft round | Answered `round_not_open`, not stored |

A round gets its `draft` record the moment it is saved in the control panel (Set up or repair does the same for the rounds it imports). With or without that record, a link for a round that has never been opened shows "not open yet" as soon as the bootstrap arrives. So when a partner sees "not open yet" for a round that **is** open, check the round id in their link against the Rounds list.

**How the form decides** (`web/js/app.js`):

- It checks the status from the bootstrap before showing anything. Preview links are never checked.
- If the bootstrap did not arrive (status `unknown`), the form carries on. The `opened` ping then corrects it: `round_not_open` shows "not open yet"; `round_status: "closed"` shows "has closed" to a partner who has not started yet.
- After "not open yet" or "has closed", the form sends nothing more during that visit: no pings, no retries.
- Answers that could not be sent because the round was not open stay on the phone. They are sent the next time the link is opened while the round is open or closed.

**Testing on the Mac:** `python3 scripts/mock_server.py --closed-rounds R1,R2 --draft-rounds R3`. Every other round counts as open (unlike the live backend, where a round id it has never seen counts as a draft).

## 8. Preview links (`?preview=1`)

The control panel's **Preview** button (and the menu item **Partner Pulse > Preview the draft form**) gives a link like this:

```
<form address>?preview=1&dc=DC-PREVIEW&round=<round>&lang=<language>&pk=<preview key>
```

- `pk` is the private **preview key** (Script Property `PREVIEW_KEY`). It is not the link secret: it cannot make partner links or send answers. It only lets the bootstrap hand out the draft. The control panel's **Make new preview links** replaces it, and every older preview link stops working.
- The bootstrap asks for `draft=1` with that `pk`: admins see the **unpublished draft, as last saved** ([section 4](#4-get-requests)). The form waits up to 20 seconds for it.
- **Without the right `pk`** (for example a link cut short when it was copied) the backend answers `bad_preview_key`. The form then shows its own stored copy of the questionnaire, and the strip adds: "Could not load the draft: showing the form's stored copy. Open the preview link from the control panel again." (text `dev.preview_fallback`). The same notice appears when the draft does not arrive within 20 seconds.
- A blue strip says "PREVIEW: answers are not saved" (text `dev.preview_banner`), also in live mode.
- **Nothing is sent**: no pings, no submission, no beacons. A backend never sees preview traffic, except the bootstrap request itself.
- Progress is kept on the phone under its own name (`state:preview:<round>:<dc>`), so it never mixes with a real link's answers.
- `dc` and `t` are optional (`dc` defaults to `DC-PREVIEW`). The round is required; without it the link is "incomplete".
- Any round can be previewed, also a draft round.
- The last screen says "Thank you!" and "Preview finished. Nothing was saved." (text `dev.preview_done`), with a **Start again** button (text `ui.start_again`), which forgets the preview's answers and reloads (fetching the latest draft).
- On this Mac, `scripts/mock_server.py` prints a ready-made preview link (`/?preview=1&round=DEMO-R1&lang=en&mock=1`). The mock server needs no `pk`: it shows the files in `web/`.

## 9. What the live backend (Apps Script) stores

The full description is in [control-panel-design.md, section 11](control-panel-design.md#11-rounds-and-data-spreadsheets), with every column of every tab. In short:

- **Each round has its own data spreadsheet**, "Valmo Partner Pulse - data - &lt;round_id&gt;", in the Drive folder `Valmo Partner Pulse/rounds/<round_id>/`, with the tabs `responses`, `function_ratings`, `free_text`, `events` and `pings`. It is created the first time the round is opened in the control panel (or, if it is missing, by the first message for an open or closed round).
- **Each data tab is exactly as wide as its columns.** Google counts every cell of a tab, even an empty one, against a spreadsheet's 10 million cell limit, so no spare columns are kept: a round of 10,000 partners stays near 3.5 million cells. The script writes each column in a fixed place, so never insert, delete or move columns in these tabs (an extra column of your own on the far right is fine).
- **One `responses` row per stored submission**, and at most 10 per DC per round ([section 10](#10-limits-how-big-a-message-may-be)). Like the mock server, it adds `received_at`, `token_valid` (always `TRUE` here, because wrong tokens are refused), `late` and `dc_round_seen_before`, and keeps the whole `answers` object as `answers_json` (a pick-several answer stays a list there, for example `"score_areas":["load","app"]`). The answers to `nps` and `support_gate` also get their own columns, `nps` and `support_contacted`.
- **`function_ratings`** has one row per `ratings` item, **`free_text`** one row per `free_text` item, and **`events`** one row per screen view. Each of these rows carries the submission's `submission_id` and `received_at`.
- **`pings`** has one row per stored ping ([section 2](#2-message-ping-progress-telemetry-never-contains-answers)), with `received_at` and `token_valid` added, the `client.net` of an `opened` ping as `client_net`, and the `events` of a `progress` ping as JSON text in `events_json`. Its **last** column, since 26 Oct 2026, is **`config_version`**: the version of the questionnaire the phone showed, the same stamp as in `responses` (Pranav's decision 11 of the flow-graph work). The message did not change (`schema_version` is still `1`): the form always sent it, but until then the live backend did not keep it. The cell is empty when a ping has no `config_version`.
  - **A data spreadsheet made before 26 Oct 2026** has a `pings` tab that ends with `events_json`. The first ping that arrives after the update adds the `config_version` column, header included, as a new column right after `events_json`: a column of your own there moves one place to the right, and nothing is overwritten. The rows already stored keep an empty cell. Two pings arriving together never add it twice (the script lock), and a ping is never refused or lost for this: if the column cannot be added at that moment, the ping is stored without its version.
  - The test server keeps each whole ping, `config_version` included, in `local_data/events.jsonl` ([section 6](#6-what-the-mock-server-stores-on-this-mac-only-git-ignored)).
- **Voice notes** are files in `rounds/<round_id>/audio/`, named `<dc>__<submission_id>__<item_id with ":" turned into "-">.<webm|ogg|m4a|bin>` (a second note with the same name in one submission gets `-2`, `-3`, ...), with private sharing. The `free_text` tab holds each file's Drive link (`audio_url`) and id (`audio_file_id`). The `transcript` and `cls_*` columns stay empty until the Phase 3 pipeline fills them.
- **Text is written as text**, so answers such as `=1+1`, `007` or `2026-10-21` never become formulas, numbers or dates. A cell holds at most 49,000 characters: longer text is cut and ends with ` [cut: too long]`.
- Rejected messages (`bad_token`, `round_not_open`, `bad_request`) are never stored. Pings above 60 per DC and round in 10 minutes are answered `ok` but not stored.
- Partner data (the DC list, links, answers, voice notes) stays in the admin's Google Drive and is never put in the GitHub repository.

**How one submission is written** (`PP_handleSubmit_` in `apps-script/Code.gs`):

1. The checks of [section 3](#server-responses-to-submit): the message, the token, the round, then the voice notes (decoded here).
2. A look in the short-term memory (the script cache, 15 minutes) for a copy already stored.
3. When the submission has voice notes: a quick look at the `responses` tab skips a copy already stored, or a DC that already has 10, before any recording is saved.
4. **The voice notes are saved in Drive first**, before the submission waits for its turn, because that is by far the slowest step.
5. The submission waits for its turn (one at a time; at most 8 seconds, else `server_error` "busy, try again").
6. In its turn: the duplicate and per-DC checks again, then **one write per tab, in this order: `events`, `free_text`, `function_ratings`, and `responses` LAST**. Every row of one attempt gets the same `received_at`.
7. Only then the answer `ok`.

If anything fails before the `responses` row is written, the phone gets `server_error` and sends the whole submission again; the resend is written again in full, with a new `received_at`. The `responses` tab therefore never holds half a submission, but the other three tabs can hold rows from the failed attempt.

### Reading the data correctly (for the pipeline and the dashboard)

1. **A submission is stored only when its `responses` row exists.** Count a row in `events`, `free_text` or `function_ratings` only when its `submission_id` **and** `received_at` match a `responses` row. Rows that match no `responses` row are left over from a failed attempt (the phone's resend writes its own copy). (The pipeline should transcribe and classify only `free_text` rows that count.)
2. **One submission per DC per round counts on the dashboard: the latest one**, by `received_at` (the server's clock; `submitted_at` comes from the phone's clock, which can be wrong). Up to 10 are stored per DC per round; `dc_round_seen_before` is `TRUE` on every one after the first.
3. **Unused voice-note files can exist** in `rounds/<round_id>/audio/`: files that no counted `free_text` row points to. They come from a send that failed after its recordings were saved (answered "busy" or `server_error`; the resend saves its recordings again, under the same names, which Drive allows), or from a copy that turned out to be a repeat (or over the DC's limit of 10) only once it got its turn. Find a recording by `audio_file_id` from a counted `free_text` row, never by its file name, and ignore the other files. They stay private like every recording, and nothing removes them automatically.
4. **`late` = `TRUE`** marks answers that arrived after the round was closed, from partners who had already started on their phone (or finished, but their answers had not been sent yet).
5. **Pings** (the `pings` tab) are not tied to a submission. Some may be missing: patchy data, the rate limit above, or `started` and `progress` pings switched off in the settings (`telemetry.enabled`; `opened` is always sent, because it also checks the link). Read each ping's `screen` against the screens of the questionnaire in its `config_version`, so drop-off is counted on the screens that partner really saw:
   - `p<N>-<date>` (for example `p7-2026-10-21`) is published version N: `python3 scripts/flow.py screens --published p7.json` lists its screens, from `published/p7.json` in the Drive folder.
   - Any other value (for example `2026-10-19.1`) is the form's own copy, `web/config/survey.json` with that `config_version`: `python3 scripts/flow.py screens --published <that survey.json>`.
   - Each entry's `screen` is exactly what a ping's `screen` (and an `events` row's `screen`) says, for example `fn_rating:payments`.
   - An empty `config_version` is a ping stored before 26 Oct 2026, or one stored while the column could not be added (above). The nearest ping in time with the same `session_id` (or that session's submission) usually has the version; a version can change between two visits when a new one is published in between.
6. **Test data is not partner data.** Leave out rounds whose id starts with `SMOKE`, `DEMO` or `TEST` (in capitals or not: the same rule as `PP_isTestRound_` in Code.gs) and DCs whose id starts with `DC-SMOKE-` (the smoke test makes a new one on every run).
7. **Routes and endings** ([section 3](#several-endings-and-questions-asked-for-each-area)). A submission's counted `events` rows are every screen **view**, in order, including screens the partner left by going **Back** (for example the reason screen of an area they later unticked), so they are not the final route. The questions answered on the final route are the keys of `answers` plus the `free_text` items (and, for area and support ratings, the `ratings` rows): only answers on the final route are sent ([section 3](#only-answers-on-the-final-path-are-sent)). The last `events` row is still the ending the partner reached. Answers keyed `<id>:<area>` belong to a question asked once per area: split the key at the first `:` to get the question and the area.
8. **A pick-several answer is a list** of option codes in `answers_json` (for example `"score_areas": ["load", "payments"]`): count each code ticked. **A questionnaire that hides the area ratings** (the v2.1 route, 28 Oct 2026: `fn_ratings`, `fn_deep_dives`, `support_gate` and `support` hidden) needs these rules while they stay hidden:
   - the `function_ratings` tab gets no rows, and `support_contacted` stays blank;
   - the areas are `answers_json.score_areas`: a list of `load`, `payments`, `losses`, `ops`, `app` (count each ticked area);
   - the reason for each ticked area is `answers_json.<area>_low` (score 0–8) or `<area>_high` (9–10): an option code, whose words are the text `choice.<question>.<code>` (for example `choice.load_low.load_changes`) in the `strings` of the published version that partner answered (`config_version`, item 5);
   - the "Tell us more" answers, one per area (`load_other`, `payments_other`, `losses_other`, `ops_other`, `app_other`, each asked after that area's "Others" reason), and `one_fix` are `free_text` rows whose `function` is empty;
   - `nps_area` (v2's one area) exists only in answers to v2; v2.1 hides it;
   - the classifier's taxonomy for v2.1 is the options of `score_areas` and of the `<area>_low` / `<area>_high` questions, not `functions[].issues`.

## 10. Limits: how big a message may be

These limits stop one partner link (or a stolen one) from flooding a round's data with junk. A real survey stays far below every one of them.

| What | Live backend (`apps-script/Code.gs`, `PP_SRV`) | Test server (`scripts/mock_server.py`) |
|---|---|---|
| One whole message, voice notes included | 25 MB, counted in characters. A bigger one gets HTTP **200** with `bad_request` | 25 MB, counted in bytes. A bigger one gets HTTP **413**, with the same `bad_request` body |
| One voice note, once decoded | 5 MB (`bad_request`) | 5 MB (`bad_request`) |
| `free_text` items in a submission | 64 | 64 |
| `ratings` items in a submission | 64 | 64 |
| `events` in a submission | 400 (the form keeps at most 300) | 400 |
| Entries in `answers` | 100 | 100 |
| The submission without its recordings | 200,000 characters | 200,000 characters |
| Text fields of a ping | `session_id` 64, `lang` 8, `screen` 80, `at` 40, `mode` 10, `stage` 10 characters | the same |
| `events` in a ping | 400 (the form sends at most 100) | 400 |
| One whole ping | 60,000 characters | 60,000 characters |
| Stored pings per DC and round | 60 in 10 minutes; more are answered `{ "ok": true }` and not stored | no limit |
| Stored submissions per DC and round | 10; more are answered `ok` with `"duplicate": true` and not stored (only the log says so) | no limit |
| One cell of a data tab | 49,000 characters; longer text is cut and ends with ` [cut: too long]` | no limit (one JSON line per record) |
| `submission_id` | 1–64 letters, digits, `-` or `_` | the same |
| `dc` and `round` | 1–64 letters, digits, `-`, `_` or `.`, and not `.` or `..` | the same |
| `schema_version` | must be `1` | must be `1` |

A message over any of these limits is refused with `bad_request` and a plain-English `message`, except the three storage rows (pings, submissions and cells), which work as their rows say. If Google itself ever refuses a very large message before the script sees it, the form gets no JSON answer and retries, as for any network error.

**Testing tip:** the smoke test (`scripts/smoke_test.py`) uses a new, obviously fake DC on every run (`DC-SMOKE-<date>-<time>-<4 characters>`), so it can be run again and again against the live backend. Any test that sends many submissions for one DC, including the smoke test run again and again with the same `--dc`, stops being stored after the 10th in that round. Use another DC id or another test round.

## 11. Where the test server and the live backend differ

The test server imitates the live backend closely, so the form can be tested on a Mac. These are the places where it deliberately does something else:

| Situation | Test server | Live backend |
|---|---|---|
| A round id it has never seen | `open`: every round is open unless listed in `--closed-rounds` or `--draft-rounds` | `draft` in the bootstrap; pings and submissions get `round_not_open` |
| A wrong token | Stored, with `token_valid: false`, and answered `ok`, unless started with `--strict` | `bad_token`; nothing is stored |
| When the voice notes are checked (base64, 5 MB, `item_id`) | With the message, before the token and the round | After the token and the round |
| A message over 25 MB | HTTP 413 with `bad_request`. The form treats any non-200 answer as temporary, so it keeps retrying until its retries run out | HTTP 200 with `bad_request`. The form stops automatic retries and keeps **Send now** |
| `already_submitted` in the answer to `opened` | `false`, unless started with `--one-response-per-dc` | `true` when the DC has any stored submission in this round |
| Stored submissions per DC and round | No limit | 10 |
| Stored pings per DC and round | No limit | 60 in 10 minutes |
| `draft=1` (preview) | Ignores `pk`; shows the files in `web/` | Needs `pk`; shows the saved draft, compiled from the Sheet (kept 30 seconds) |
| `version` in the bootstrap | Always `null` | The published version number (`null` for a preview) |
| Health check | `mode: "mock"` | `mode: "live"`, plus `live_version`, `runs_as_owner` and `form_page` |
| Deliberate failures | `--fail-rate` answers 503; `--slow` delays the answer to every ping and submission | None |
| Where answers go | `local_data/` on the Mac ([section 6](#6-what-the-mock-server-stores-on-this-mac-only-git-ignored)) | One data spreadsheet per round, voice notes in Drive ([section 9](#9-what-the-live-backend-apps-script-stores)) |
| Unused voice-note files | Never | Possible ([section 9](#reading-the-data-correctly-for-the-pipeline-and-the-dashboard)) |
