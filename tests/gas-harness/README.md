# Partner Pulse: local Apps Script test harness

This folder tests the Phase 2 Google Apps Script code (`apps-script/Code.gs`, `Model.gs`, `PanelServer.gs`, `Panel.html` in the project) **on this Mac, without Google**.

It contains a pretend Google that lives in memory. It has spreadsheets, Drive, Script Properties, the cache, the two locks, dialogs, Google's permission screen and the web app. The code under test runs inside it exactly as it would inside Google, and the tests check every answer against the contract:

- `docs/control-panel-design.md`
- `docs/submission-format.md`

These are developer tests. They live in the project's `tests/` folder, but they are never part of what partners see (GitHub Pages publishes only `web/`), and nothing here ever contacts Google. The tests use fake DCs and fake accounts only (`DC-DEMO-…`, `DC-E2E-…`, `DC-BULK-…`; `admin@example.com`, `coadmin@example.com`, `agency@example.org`).

---

## 1. Run all the tests

Open Terminal and go to the project folder. The first time only, run `npm install` in the `tests/` folder (see `tests/README.md`). Then type:

```
node tests/gas-harness/run-tests.js
```

(From inside `tests/gas-harness`, `node run-tests.js` does the same.) It takes about 40 seconds. It prints one line per scenario, then the details of anything that failed. It also writes:

- `out/report.txt`: the same report as on screen;
- `out/report.json`: the same, for tools;
- `out/shots/*.png`: screenshots of the browser tests.

**Expected result (21 Oct 2026):**

```
Self-test of the pretend Google: 41/41 checks passed
RESULT: 42 passed, 1 passed with warnings, 0 failed, 0 skipped (43 scenarios, ...)
```

- The one warning is scenario **S**: a style rule says Model.gs should use `const`/`let`, and Model.gs uses `var` for its 37 fixed lists on purpose (so other files and the tests can see them). Whether to relax that rule is open question 14 in `docs/STATE.md`; until Pranav decides, S stays a warning. It never blocks.
- Anything else is news.

**Reading the result:**

| Word | Meaning |
|---|---|
| `PASS` | everything checked is as the contract says |
| `WARN` | passed, but a "should" rule was not met (worth a look; never blocks) |
| `FAIL` | at least one "must" rule was broken. Each failure says what was expected, what happened, and, when the code threw an error, **which function, which message and which line** (for example `panelSave(3, {...}) threw: ... at PP_writeTable_ (Model.gs:812:9)`) |
| `SKIP` | could not run (for example Chrome missing) |
| `CRASH` | a problem in the test itself, not in the code; please report it |

The exit code is 0 when nothing failed, and 1 otherwise.

**Useful options.** Type these inside `tests/gas-harness` (from the project folder, first `cd tests/gas-harness`):

| Command | What it does |
|---|---|
| `node run-tests.js --only B4,D` | only some scenarios (by id or prefix) |
| `node run-tests.js --skip E,F` | leave out the browser tests |
| `node run-tests.js --no-browser` | the same, without loading the browser module at all |
| `node run-tests.js --headful` | show Chrome while the browser tests run |
| `node run-tests.js --verbose` | print every check, and the code's own `console.log` lines |
| `node run-tests.js --self-test` | only check the pretend Google itself (41 checks) |
| `node run-tests.js --apps-script-dir /other/copy/apps-script` | test another copy of the code |
| `node run-tests.js --web-dir /other/copy/web` | test another copy of the form (browser scenarios) |
| `node run-tests.js --out /some/folder` | write `report.txt` and `report.json` there instead of `out/` |
| `python3 tools/plant-bugs.py` | checks the tests themselves (see below) |

**Do the tests bite?** In `tests/gas-harness`, run `python3 tools/plant-bugs.py` (about 10 seconds, no browser). It plants **41 known mistakes**, one at a time, in temporary copies of the code (for example: a token one character short, test rounds locking the codes again, the "Authorization is required" advice differing between the server and the panel, the 20 Oct `MimeType.JSON` crash). First it runs the same scenarios on an unchanged copy; a mistake counts as **CAUGHT** only when a scenario that passes there fails with the mistake. Expected: `RESULT: 41 of 41 planted mistakes caught`, exit code 0. A line saying **NOT APPLIED** means the code changed and that mistake's text in the tool needs updating.

## 2. The scenarios

| Id | What is tested |
|---|---|
| self-test | The pretend Google behaves like Google: tokens, signed bytes, grid limits, typed-input conversion, checkboxes, TextFinder, cache limits, dates in India time, dialogs, contexts, Drive hand-overs (`setOwner`), the two separate locks, the permission re-check, redirects, a member hidden for an older Apps Script, no global `MimeType.JSON`, fresh globals for every execution. |
| S | Static checks, by reading the code without running it. Every file is present. The code parses, and uses no `?.` or `??`. Functions are top-level `function name() {}`, and no name is declared twice. Each file has a header comment. Only allowed service methods are used (the global `MimeType` has none: `MimeType.JSON` fails here). Panel.html has no `<? ?>` and no external libraries, and its script parses. `appsscript.json` is sane. Every function and constant the contract names exists (including `panelSetWebAppUrl` and `panelNewPreviewKey`). |
| A1 | **Set up or repair** on a brand-new Sheet. The admin accepts the default GitHub address; the fake internet serves the repo's own `web/` files. Version 1 gets published. Checked: every tab with the contract's headers in order, frozen bold light-purple header rows, purple/green/grey tab colours, tick boxes, hidden `_meta`, Drive folders, a 64-hex `LINK_SECRET`, version 1 live, Publish history, and content identical to the repo. |
| A2 | Set up run again (repair). Nothing is duplicated; a deleted tab comes back; an extra admin column is kept; an unticked DC stays unticked; the secret and folders are unchanged. |
| A3 | Before anything is published: `health` works, `bootstrap` says `not_published`. A set-up where the admin answers **No** to publishing, then a first publish from the panel. |
| B1 | `panelLoad`: every field; the model in the contract's shape; the settings catalogue (all 38 settings of section 5, with types, defaults, ranges and groups); the 12 screen types; `form_text_keys` equal to `FIXED_STRING_KEYS` of `check_config.py`; the `open_section` menu hint; DC counts. Before any round has opened: `codes_locked` false and `live_ids` empty; after round 2026-R1 opens: `codes_locked` true and `live_ids` lists the live codes. `web_app_url` is `""` until an address is recorded (Google's own `getUrl()` is never used). |
| B2 | `panelValidate`: the repo questionnaire has no errors. Each of 35 deliberate mistakes is caught in the right section: duplicate language, chip "other", thank-you not last, a `show_if` pointing forward, missing `{n}`, a bad colour, a form address without the final `/`, oversize, and more. Each of 3 warnings is given and never blocks. A deleted problem that partners answered gives **no** "is live today" warning before a round has opened, and exactly one (section `chips`, `losses/wrong_debit`, "rename its label") after 2026-R1 opens. Messages are plain English. |
| B3 | `panelSave`: the revision goes up; an out-of-date save gets a conflict; the translation helpers work (`[TRANSLATE]` filling, the "English changed on …" note). An unchanged save keeps "draft differs from live" false. Texts like `123`, `=SUM(1,2)`, `2026-10-21` and `TRUE`, round dates and `007` survive the Sheet unchanged. A new language gets its column. New questions keep their place, their `show_if` rules and their options. |
| B4 | `panelPublish`: version 2, with the India-time `p2-yyyy-MM-dd`. `p2.json` is in Drive with the right stamp, and `survey` equals the repo's `survey.json` content without notes or `backend` mode/URLs or `links`. The cached chunks join up exactly. Publish history has exactly one live row. `panelHistory`, a deterministic compile, inactive items left out, refused publishes (errors or conflict), and `panelRestore` (keeps rounds and the form address, does not publish). |
| B5 | Rounds. Opening creates `rounds/<id>/`, `audio/` and the data spreadsheet with the five tabs and their exact headers. Open and close take effect at once (no 60 s cache delay). No second spreadsheet is created on re-open. Unknown rounds, unknown statuses and DEMO rounds without confirmation are refused. A new round can be added. `panelRoundCounts` works without data. |
| B6 | `panelGenerateLinks`. The exact link format and tokens. A wrong language is ignored. An invalid id is skipped with a reason; an inactive DC is left out. An id Google Sheets holds as a **number** (12345) is skipped with "type the id as text"; an id typed into the plain-text column (`00777`) keeps its zeros and gets its link. The CSV is correct (including a name with a comma). The secret never leaks. `only_missing` and regenerate both upsert correctly. **1,200 extra DCs** make the Links tab grow past 1,000 rows. |
| B7 | `panelPreviewUrl`, `panelGetSecret` (only with `SHOW`), `panelSetFormUrl`. |
| B8 | `panelImport`: from the default address; rounds keep their status and data links; failures are reported in plain English for a missing file, a damaged file or `http://`. `panelExport`: the four files with the same content as the repo. **Without a recorded web app address** the copy stays in test mode (`"mock"`, byte-for-byte the repo's own `survey.json` apart from `config_version`) and the answer carries a warning; **with one** (recorded through `panelSetWebAppUrl`) it says `"apps_script"` and that address, with no warning. Export, then import, gives the identical questionnaire. |
| B9 | The **Partner Pulse** menu: items, order and functions. `panelOpen` opens a 1100 × 760 dialog titled "Partner Pulse control panel". What Publish…, Generate links…, Preview and Help do. |
| B10 | `PP_slug`: lowercase, `_` between words, a letter before a leading digit, 40 characters, `_2`/`_3` when taken. `PP_derivedTextKeys`: the texts each active area, chip, support item and screen needs, including choice options and `support.not_applicable` when on. |
| B11 | Co-admins: a co-admin without the Drive folder gets a plain message naming the owner (the folder is never silently replaced); "Share the Drive folder with all editors"; data tabs exactly as wide as their columns. |
| C | `doGet`. `health`. `bootstrap`: the published version, a round never seen before (reported as `"draft"`, so the form says "not open yet"), `draft=1` (never cached, and working even if the web app cannot see the Sheet), served from the cache, the Drive fallback when the cache is empty or damaged. `whats_changed`; an unknown action. |
| C2 | A **fully translated** questionnaire (long texts in five Indian scripts; about 3 bytes per letter) publishes. It is cached as several pieces under 100 KB **in bytes**, and served from the cache. |
| D1 | Pings: the answer to `opened`; every stored column; refusals (`bad_token`, `round_not_open`, `bad_request`) that are never stored; the 60 pings per 10 minutes limit; a closed round. |
| D2 | A full submission. **Every column** of `responses`, `function_ratings`, `free_text` and `events` (nulls become empty cells). The voice note is in `rounds/2026-R1/audio/` with the contract's file name and the exact bytes. One write per tab; the submission waits only for the **script** lock, at most 8 s (`tryLock(8000)`), never for the document lock; the cache remembers the id for 15 minutes. |
| D3 | Duplicates: from the cache, then from the sheet once the cache is empty, always with the original `received_at`. `dc_round_seen_before`; `already_submitted`; ids differing only in capitals; `panelRoundCounts`. |
| D4 | A bad token, a draft round, an unknown round: refused and not stored. A closed round: stored with `late = TRUE`. |
| D5 | 22 malformed messages, including over 25 MB and a 5.5 MB voice note: `bad_request` with a plain-English message, and nothing stored. |
| D6 | A busy script lock gives `{ ok: false, error: "server_error", message: "busy, try again" }`; the retry is stored. |
| D7 | Data tabs filled to their last row still accept a submission (they grow). Three 1.5 MB voice notes get `.ogg` and `.m4a` names. |
| D8 | Partner texts such as `=1+1`, `=HYPERLINK(...)`, `007`, `2026-10-21`, `TRUE`, `+91 …` and `-5` are stored exactly as typed. An NPS of 0 is stored as 0. |
| D9 | A round marked open whose data spreadsheet is missing gets one on the first write. |
| D10 | Size limits: oversized lists, answers and pings are refused; at most 10 stored submissions per DC and round; a forged submission's voice note is never decoded (the token is checked first). |
| D11 | The links CSV neutralises cells that would run as formulas in Excel or Sheets (`=`, `+`, `@`). |
| G1 | **Locks** (20 Oct fix). Admin changes (save, publish, links, rounds) take only the Sheet's **document** lock; partners' answers only the **script** lock, so neither waits for the other. Opening a round takes the script lock for a moment inside the document lock (it creates the data spreadsheet): refused in plain English while partners are busy, with nothing changed. A second admin gets "Someone else is changing Partner Pulse". Without a document lock (Google gives none, or an older Apps Script lacks `getDocumentLock`) the script lock is used, only once. |
| G2 | **The permission re-check** (20 and 21 Oct fixes). Every menu item and `panelOpen` first calls `ScriptApp.requireAllScopes(AuthMode.FULL)`; the web app and the panel's calls never do. A permission left unticked stops the item and shows Google's permission screen (nothing opens, nothing is published, set-up does nothing). Any other failure of the re-check is only logged and every menu item carries on; a failure that names a permission still goes through. An Apps Script without `requireAllScopes` works as before. |
| G3 | **Owner hand-over** (20 and 21 Oct fixes). What a co-admin creates goes to the owner (`OWNER_EMAIL`): the round folder, its audio folder and its data spreadsheet; a published version; voice notes saved while the web app runs as a co-admin (who deployed it); the main folder, `published/` and `rounds/` when a co-admin had to make them again. The co-admin keeps edit access, and the owner's own files are never handed over. Best effort: when Google refuses (a co-admin from another company, or any other refusal) the work still succeeds and the log says so. |
| G4 | **The web app address** (20 and 21 Oct fixes). Nothing recorded: `web_app_url` is `""`, the GitHub copy stays in test mode with a warning, and set-up's message says "none yet". `panelSetWebAppUrl` turns a company address into the plain one, checks it with `?action=health` (following Google's redirect; the answer is this web app's own), records it, and from then on panelLoad, the GitHub copy and set-up's message use it. Google's own `getUrl()` (often the `/dev` address) is never used. Twelve wrong addresses are refused in plain English (empty, `/dev`, googleusercontent, `http://`, another site, 404, a sign-in page, 403, another service, a web page, 500, a missing permission), and none replaces the recorded one. |
| G5 | **The code lock** (20 Oct fix and decision 1 of 21 Oct). `PP_isTestRound_`: ids starting with SMOKE, DEMO or TEST, in any capitals, are test rounds, and Panel.html's `isTestRound` uses the same rule. Opening and closing test rounds never locks the codes; the first real round does, for good. A passing Google Drive problem while the codes are locked gives `live_ids_unknown` (the panel then keeps every code locked) and the panel still opens; before any real round it never does. Old rounds without `ROUNDS_EVER_OPENED`: a closed real round counts, a closed test round does not. |
| G6 | **A save that shrinks every list tab** (20 Oct fix). Saving a small questionnaire after the full one leaves each tab ending right after its last item: the left-over rows are emptied with `Range.clearContent` (Google's Range has no `clearContents`, the 20 Oct crash). Everything reads back exactly; saving the full one again grows the tabs back. |
| G7 | **"Authorization is required"** (21 Oct, decision 2). The server's advice is word for word Panel.html's `MSG_AUTHORIZATION` (the likely cause, another Google account, first; then "tick Select all"), followed by Google's own words; given once, never twice; the same in a menu item (Share the Drive folder). "Specified permissions are not sufficient" gets only the "tick Select all" advice, and other errors are not explained as permissions. |
| G8 | **`nps` and `support_gate`** (21 Oct, decision 8): deleting either gives a plain warning naming the data column it fills (never an error); hiding them gives none. **A new, empty round** is not an unpublished change; a "What changed" bullet in it is. |
| G9 | **Later 21 Oct fixes:** a DC id Google Sheets turned into a **date** gets no link ("Type the id as text"); **read-aloud clip addresses** follow the settings check's rule (an `https://` address or a path inside `web/`; a clip for a text that doesn't exist is an error); a **round whose name has a dot** can't be opened; a **real round opened before anything is published** keeps every code locked (`live_ids_unknown`). |
| G10 | **Meesho-only mode** (21 Oct evening). A link opened on the web app's own address (no `action`; `dc`, `round` or `preview` present) gets the survey page itself (`PP_formPage_`): the form's `index.html` from the GitHub Pages address, its files made absolute, `window.PP_EMBED` added and escaped (a `</script>` in a link can't break out), and the page's own address for Start again and Retry. Health still answers JSON. The page's requests go through `ppFormRequest` (bootstrap, ping and submit; anything else is `bad_request`). Admin functions run only from inside the Sheet (its menu or the panel): from a served page they are refused for everyone, the owner and editors included. **Check and save** records `domain` only when a signed-in retry gets this web app's health answer with `form_page`; one still running older code is refused ("Version: New version"), and so is an address that asks to sign in even then. While `domain`, links (made again even with "only DCs without a link") and Preview open through the web app, and the GitHub copy stays in test mode with a warning; after the switch to "Anyone", Check and save puts everything back. If GitHub Pages can't be reached, visitors get a short message, never a crash. |
| E1 | **Real form in headless Chrome, at phone size.** The partner opens a link made by `panelGenerateLinks` and answers everything. The rows land in the round's data spreadsheet. The form made one `bootstrap` request, sent no CORS preflight, and showed no console errors. |
| E2 | The admin changes the NPS question text through the panel API and publishes; a new partner sees the new text. |
| E3 | A closed round shows "This survey has closed"; a draft round shows "This survey is not open yet". |
| E4 | A preview link shows the PREVIEW banner and the saved draft text, ends with "Preview finished. Nothing was saved.", and sends nothing. |
| F | The control panel (`Panel.html` with a stand-in for `google.script.run`) loads without console errors. Every left-menu section opens, all server calls succeed, and nothing is loaded from other websites. From `google.script.host` it uses only `setHeight`/`setWidth`, to shrink its window on a small screen (never asking for more than 1100 × 760). |

## 3. Try the system by hand (local server)

In Terminal, inside `tests/gas-harness`:

```
node server.js --setup --open-round 2026-R1 --dcs 5
```

This runs **Set up or repair**, adds 5 fake DCs, opens round 2026-R1 and prints partner links. Then open in Chrome:

- a printed partner link: the form, talking to the local "Google";
- `http://127.0.0.1:8790/panel`: the control panel, running as `admin@example.com`;
- `http://127.0.0.1:8790/debug`: pages that show every fake spreadsheet, the Drive files, Script Properties, the cache, the dialogs, the requests and the code's logs, as JSON.

Stop it with **Ctrl+C**.

**Options:**

| Option | What it does |
|---|---|
| `--port 8790` | the main port. The web app answers on port+1; its redirect target is port+2. |
| `--state FILE` | keeps the fake Google in a file, so a restart continues where you left off |
| `--no-redirect` | answers `/exec` directly instead of with Google's 302 redirect |
| `--user EMAIL` | the admin's email |
| `--echo-console` | prints the code's `console.log` lines |
| `--apps-script-dir DIR` | uses another copy of the code |

`POST /debug/run/<function>` with `{"args": [...]}` runs any function as the admin, for example `ppSetup`.

**The smoke test against this server** (the strict check of the live contract, without Google). `--open-round` adds a round that is not in the Rounds list yet, and set-up's in-memory test secret is printed as "Link secret …":

```
node server.js --setup --open-round SMOKE-R1 --port 8970
```

Then, in a second Terminal window, from the project folder (paste the printed secret in place of `<secret>`):

```
python3 scripts/smoke_test.py --url http://127.0.0.1:8971/exec --secret "<secret>" --expect-strict
```

It should end with "All 9 checks passed." Run it as often as you like: every run uses a new fake DC (`DC-SMOKE-…`).

**How the local server imitates Google:**

- `GET`/`POST /exec` call `doGet(e)`/`doPost(e)` with Google-shaped events: `e.parameter`, `e.parameters`, `e.queryString`, and `e.postData.contents`/`type`/`length`.
- Like Google, it answers with a **302 redirect** to a second address that serves the JSON, and it sends `Access-Control-Allow-Origin: *`.
- It **refuses `OPTIONS`** preflight requests, as Google does, so a form that sends a preflighted request fails here too.
- The form is served from the project's `web/` folder. Only the copy of `config/survey.json` sent to the browser is changed: it gets `backend.mode = "apps_script"` and `apps_script_url` = this server's `/exec`, which runs on another port, so the request is really cross-origin. The file on disk is never changed.
- If `doGet`/`doPost` throws, the server answers with an HTML error page, as Google does, and the test reports the function and the line.
- The panel's web app address is not filled in automatically: `panelSetWebAppUrl` accepts only real `https://script.google.com/.../exec` addresses, so the GitHub copy made from the local panel stays in test mode.

## 4. How faithful the pretend Google is

**The allowed list (`ALLOWED` in `fake-gas.js`) is exactly the contract's table (section 2),** which since 21 Oct lists what the code calls today, including the Google features it uses on purpose: `LockService.getDocumentLock`, `ScriptApp.requireAllScopes` with `ScriptApp.AuthMode.FULL`, `File.setOwner` / `Folder.setOwner`, `File.moveTo` and `Range.createTextFinder`. Change the two together. Every method on the list is implemented. A method that is not on the list:

- throws an error that starts with `[contract]` if the harness does not have it;
- is allowed but **listed in the report** under "outside the contract" if the harness has it (for example `Sheet.setName`, or `ScriptApp.getService`, which the contract says never to use). Scenario S also fails when the code calls a service method that is not listed (for example `ScriptApp.getService()` or anything on the global `MimeType`).

Forbidden services such as `GmailApp` or `Drive` throw.

It copies Google's documented behaviour, including the surprises that often break real scripts:

- **The grid.** A new tab has 1000 rows × 26 columns. `getRange` outside the grid throws "The coordinates of the range are outside the dimensions of the sheet". `appendRow` widens and lengthens the grid. `insertRowsAfter` adds rows, and the new rows copy the formatting of the row above. `insertSheet(name, {template})` copies the template's size and content. `SpreadsheetApp.create(name, rows, cols)` uses the size you give it.
- **Shape errors.** `getRange(r, c, 0, n)` throws, and `setValues` with the wrong number of rows or columns throws, with Google's messages. A Range has `clearContent` but no `clearContents` (only a Sheet has that), as in Google.
- **Typed input.** Text written to a cell is read like typed input: `"123"` becomes a number, `"TRUE"` becomes true, `"2026-10-21"` becomes a **Date**, and `"=…"` becomes a formula that shows `#ERROR!`. A leading apostrophe, or the number format `@`, keeps text as text. ISO times with `T…Z` stay text.
- **Checkboxes.** `insertCheckboxes()` sets the cells to FALSE, as Google documents.
- **Data validation** rules (lists, checkboxes) are recorded but not enforced, so the script can always write. Pass `enforceValidation: true` to `loadGas` to refuse writes that break a "reject input" rule.
- **Cell size.** One cell holds at most 50,000 characters.
- **Deleting rows.** Deleting every non-frozen row throws.
- **TextFinder** ignores upper/lower case unless `matchCase(true)`, and matches the whole cell with `matchEntireCell(true)`.
- **Objects.** Each `getSheets()`/`getRange()` call returns a new object (`===` is never true), and Dates and arrays are real Dates and arrays of the code's own world (`instanceof Date` works).
- **The cache.** At most 100 KB per value, **counted in bytes** (Hindi and Tamil letters take 3 bytes each), and at most 6 hours. `getAll`/`putAll` work.
- **Script Properties.** At most 9 KB per value and 500 KB in total. A non-text value is stored as text, with a warning.
- **Utilities.** `computeHmacSha256Signature` returns signed bytes (−128…127). `base64EncodeWebSafe` keeps the `=` padding. `base64Decode` refuses web-safe or invalid characters ("Could not decode string."). `formatDate` uses Java patterns, in any time zone.
- **Two locks, as in Google.** The **script** lock (one for the whole project) and the Sheet's **document** lock are separate; a test can make either one "busy" (held by another execution) on its own. `getDocumentLock()` is `null` inside the web app, as Google gives no document lock outside the Sheet. Every execution logs what it did, for example `["document:30000", "script:30000", "script:release", "document:release"]`.
- **Google's permission screen.** `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` is quiet when every permission is granted. With one missing, Google stops the run with "Authorization is required to perform that action." and shows its permission screen (recorded as a dialog of kind `consent`). A test can also make it fail with any other text. Anything but an `AuthMode` value is refused.
- **Drive owners.** Every file and folder has an owner: whoever's account created it (inside the web app, the account that deployed it). `setOwner(email)` hands it over and the previous owner keeps edit access; only the owner can give an item away, and only to someone of the same company (domain), as in Google Workspace. Every hand-over is recorded. A test can make Google refuse (`control.ownerTransferError`).
- **No global `MimeType.JSON`.** Google's global `MimeType` (Drive file types) has no JSON entry, so `MimeType.JSON` is a `[contract]` error here, with an explanation. The code writes `'application/json'`. `setMimeType` accepts only `ContentService.MimeType.*`.
- **UrlFetchApp** serves files from this Mac (or test routes), never the internet. It follows redirects as Google does (`followRedirects`, true by default). Options other than `muteHttpExceptions` and `followRedirects` give a warning.
- **Fresh start for every execution.** Each menu click, panel call and web request gets new globals, with the `.gs` files loaded again, as in Google. Only the services (Sheets, Drive, properties, cache) remember things between executions.
- **Contexts.**
  - Inside the public web app, `getUi()` fails and the active user's email is empty.
  - Inside the simple trigger `onOpen`, DriveApp, UrlFetchApp, `openById` and `create` fail with Google's permission message.
  - The test runner sets the Mac's time zone for the run to `appsscript.json`'s (Asia/Kolkata), as Google does.
- **Dialogs.**
  - `ui.alert(title, message)` without a ButtonSet throws, as in Google.
  - The answers to alerts and prompts come from a script: by default, OK/YES with an empty text, which accepts the default. A test can queue specific answers.
- **google.script.run** (`/panel`, and the B tests): results containing a **Date** reach the panel as `null` (Google's behaviour) and are reported. Functions ending in `_` cannot be called.

**What a test can switch on (`h.control`, see `fake-gas.js`):** `setLockBusy` (script lock), `setDocumentLockBusy`, `setDocumentLockAvailable(false)` (no document lock), `setConsent({ missing: true })` or `setConsent({ error: '...' })`, `hidden.add('ScriptApp.requireAllScopes')` (an older Apps Script without that member: `'requireAllScopes' in ScriptApp` is false), `ownerTransferError`, `denyDrive` (no access to a Drive item), `driveError` (a passing Drive problem), `routeUrl` (an answer for an address, including `{ code: 302, location }` redirects), `queueAnswer` (dialog answers), `advanceClock`, `setScriptUrl`.

**What it does not imitate:**

- real sharing and permissions (beyond owners, editors and `denyDrive`);
- daily quotas;
- many executions at the same time (calls run one after another; a lock can be set to "busy");
- the 6-minute limit (times are measured instead and noted in the report);
- the dialog's sandboxed iframe;
- the Sheets UI itself (an admin typing is imitated by writing cells "as typed");
- whether real Google really has `getDocumentLock` and `requireAllScopes` as the code expects (`'name' in Service`): only a check in the Apps Script editor can tell (`docs/STATE.md`, item 11).

## 5. Files

| File | What it is |
|---|---|
| `run-tests.js` | runs everything and writes the report |
| `fake-gas.js` | the pretend Google services (strict, in memory) |
| `load-gas.js` | loads every `apps-script/*.gs` into one shared scope with the fakes, a fresh scope for every execution as in Google. Runs a function in a context (menu, panel, webapp, simpleTrigger). |
| `server.js` | the local server: `/exec`, the form, `/panel` with the `google.script.run` stand-in, `/debug` |
| `scenarios/setup.js` | scenarios S and A |
| `scenarios/panel.js` | scenarios B |
| `scenarios/webapp.js` | scenarios C and D |
| `scenarios/fixes.js` | scenarios G (the Google-side fixes of 20 and 21 Oct) |
| `scenarios/browser.js` | scenarios E and F (Chrome) |
| `lib/contract.js` | the contract's tabs, columns, settings and screen types, written down once |
| `lib/testkit.js` | checks (`must`/`should`), calling functions, phone-like requests, fake submissions |
| `lib/helpers.js` | shared steps (set-up, rounds, tokens, CSV) |
| `lib/browser.js` | Chrome helpers (screen ids via `history.state.pp`, 600 ms after each screen change) |
| `lib/static-checks.js` | the static checks |
| `lib/selftest.js` | the self-test of the pretend Google (41 checks) |
| `lib/java-date-format.js` | Java-style date patterns (`Utilities.formatDate`) |
| `tools/plant-bugs.py` | the "do the tests bite?" check: 41 planted mistakes (temporary copies in `out/planted/`, deleted afterwards) |

**What it needs:**

- **Node.js 18 or newer.** It was built with v24.
- **Google Chrome** in `/Applications`.
- **`puppeteer-core` and `acorn`.** Installed once by `npm install` in the `tests/` folder (exact versions in `tests/package.json`). Without acorn the static checks (scenario S) cannot read the code.
- **Nothing is installed into the form or the Google code.** The packages stay in `tests/node_modules/`, which git ignores.

## 6. Changing the harness

- **A new test.** Add an `add('ID', 'title', async (s) => { ... })` block in the right `scenarios/*.js` file:
  - `s.ok(cond, what, detail)` is a must;
  - `s.soft(...)` is a should;
  - `s.need(...)` stops the scenario.
  - Run functions with `K.call(h, s, 'panelX', [args])`, which reports the failing function, message and line for you.
- **When the code changes on purpose**, update the check that expected the old behaviour in the same piece of work (never just loosen it), and say why next to it. Then run `python3 tools/plant-bugs.py`: a NOT APPLIED line means a planted mistake's text must follow the code.
- **The contract allows a new Apps Script method.** Add it to `ALLOWED` in `fake-gas.js`. Implement it in the matching fake object if it is not there yet, as Google documents it, and add a self-test check in `lib/selftest.js`.
- **The contract's tabs or columns change.** Update `lib/contract.js`.
