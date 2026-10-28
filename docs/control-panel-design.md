# Phase 2 technical design: the Google Sheet control panel and the Apps Script backend

**Who this is for:** whoever builds or maintains the Apps Script code, the control panel or the form. It is the contract that all of those pieces follow.

If you only want to *use* the control panel, read [control-panel.md](control-panel.md) instead.

The data the form sends is defined in [submission-format.md](submission-format.md). This document adds the control panel, publishing, rounds and the live backend.

**Last checked against the code:** 21 Oct 2026, after the approved Phase 2 items 1–4 ([STATE.md](STATE.md)); the flow-graph changes (23–26 Oct 2026: the route as a graph, `Flow.gs`, the codes lock over every published code, the reviewers' fixes, `config_version` on pings) were added on 27 Oct 2026, checked against the code. The route's own contract (format, engine, checker, the panel's side) is [flow-engine.md](flow-engine.md); this document covers what the Apps Script side does with it. When the code and this document disagree, correct whichever is wrong in the same piece of work.

---

## 1. The big picture

```
 ADMINS (Valmo ops, anyone the Sheet is shared with as Editor)
 Google Sheet "Valmo Partner Pulse - Control"
   |-- menu "Partner Pulse" > Open control panel   (Panel.html in a dialog)
   |-- config tabs = the DRAFT questionnaire        (Settings, Languages, Areas, Chips,
   |                                                 Support, Screens, Texts, What changed,
   |                                                 Audio clips)
   |-- Rounds, DCs, Links, Publish history, _meta
   `-- bound Apps Script project
         |-- panel* functions   run as the admin using the Sheet (google.script.run)
         `-- doGet / doPost     public web app: "Execute as: Me", "Who has access: Anyone"

 Google Drive folder "Valmo Partner Pulse/"   (owned by whoever ran set-up first)
   |-- published/p1.json, p2.json, ...      every published version (the live one is in Script Properties)
   `-- rounds/<round_id>/
         |-- "Valmo Partner Pulse - data - <round_id>"   (spreadsheet: responses, function_ratings,
         |                                                free_text, events, pings)
         `-- audio/                                       (voice notes)

 PARTNERS (phones)
   https://pranavakellaps37.github.io/NPS-Form-/?dc=..&t=..&round=..&lang=..
     1. loads the form files from GitHub Pages (fast, cached, free)
     2. GET  <web app /exec>?action=bootstrap&round=..  -> the PUBLISHED questionnaire, texts,
                                                          "what changed" for the round, round status
        (if Google is slow or down: falls back to web/config + web/i18n in the repo)
     3. POST pings and the submission (text/plain JSON, see submission-format.md)
```

**The rules everything follows:**

1. **The config tabs are a draft.** Partners never see the draft. **Publish** does three things:
   - validates the draft;
   - compiles it into one JSON document;
   - saves it as `published/p<N>.json` and makes it live.
2. **Preview** shows the saved draft to people who have a preview link (`?preview=1`, carrying the private preview key `&pk=`). Nothing is saved in preview.
3. **Opening or closing a round takes effect immediately.** No Publish is needed, because that is an operational switch, not content. Opening a round publishes nothing either: partners get the live version (or, with nothing published, the form's own copy).
4. **Each round's answers go into their own data spreadsheet.** One spreadsheet holds at most 10 million cells, and one round of 10,000 partners uses about 3.5 million.
5. **The form never depends on Google to open.** If bootstrap fails, it uses the copy of the questionnaire in the repo.
6. **No partner data and no secrets ever go into the GitHub repo.** The DC list, links, answers and voice notes stay in Google. The link secret stays in Apps Script's Script Properties.
7. **Codes lock when the first real round opens** (section 11). Until then the placeholder questionnaire can be replaced freely. Test rounds (ids starting with SMOKE, DEMO or TEST) never lock them. From then on the lock covers every code of every version published since (`CODES_EVER_LIVE`).
8. **One route engine.** The route (which screen comes after which: jumps, questions asked once per area, several endings) is compiled, checked and drawn by the form's own files, copied into the generated `Flow.gs`, so the panel, Publish, GitHub's check and phones never disagree ([flow-engine.md](flow-engine.md) §9).

## 2. Files

```
apps-script/
  Code.gs        menu, setup/repair, public API (doGet/doPost), storage of answers,
                 rounds, links, tokens, locks
  Model.gs       tabs <-> model, compile, validate, import/export, restore
                 (pure logic: no UI, no network; reads and writes sheets only in
                 PP_readModel / PP_writeModel)
  PanelServer.gs the functions the control panel calls (google.script.run). Named
                 PanelServer because Apps Script refuses a Script file and an HTML
                 file with the same name (Panel).
  Panel.html     the control panel: one self-contained file (HTML + CSS + JS),
                 no <? ?> scriptlets, no external libraries except the Map's
                 pinned Mermaid in a sandboxed frame (see "In Panel.html" below)
  Flow.gs        GENERATED (node scripts/build_flow_gs.js; never edit it): the
                 form's route files web/js/flow.js, flow-panel.js and
                 flow-check.js, run by PP_flowLib_(); PP_FLOW_SOURCE_ (their
                 text, for the panel window) and PP_FLOW_FINGERPRINT_ (SHA-256)
                 (flow-engine.md section 9.5)
  appsscript.json  manifest (only needed when using clasp; copy-paste users skip it)
  README.md      step-by-step setup for a non-technical admin
```

**Deploying the code:**

- **Normal route (copy-paste):** create the five files in the Apps Script editor with exactly these names: the Script files `Code`, `Model`, `PanelServer` and `Flow`, and the HTML file `Panel`. Paste each file's contents. Without `Flow`, everything that touches the route (compile, Check for problems, Publish, Import, Restore, Preview, the health fingerprint) stops with "The script file "Flow" is missing…" and how to add it (Model.gs `PP_mdlFlowLib_`).
- **Optional route (clasp):** documented in `apps-script/README.md`. Its copy step must include `Flow.gs`: `clasp push` replaces every file of the online project.
- After pasting new code into a project whose web app is already deployed, update the deployment (section 20, "Updating the code").

**Coding rules for the `.gs` files:**

- Use V8 runtime syntax (`const`/`let`, arrow functions, template literals), but no `?.` or `??`.
  - One exception, on purpose: Model.gs declares its fixed lists (`PP_TABS`, `PP_SETTINGS_SCHEMA`, `PP_SCREEN_TYPES`, `PP_ADDED_TYPES_`, `PP_FORM_TEXT_KEYS` and the like, 42 in all) with `var`, so the local tests can read them as global names. `PP_SCREEN_TYPES` and `PP_ADDED_TYPES_` sit between GENERATED marks, written by `node scripts/flow.js types --write` (section 6).
  - The generated `Flow.gs` is exempt from these rules: it carries the form's ES5 files as they are.
  - The test harness still warns about these `var` lists. Whether to relax that warning is open question 14 in [spec.md §6](spec.md#6-open-questions) **[UNCONFIRMED]**.
- Write every function as a top-level `function name() {}` declaration. All `.gs` files share one global scope, so a name may be declared in one file only: a second declaration silently replaces the first.
- Prefix the project's shared functions and helpers with `PP_`. The exceptions are Google's own entry points (`onOpen`, `doGet`, `doPost`), the menu functions (`pp…`, for example `ppSetup`) and the panel functions (`panel…`).
  - Helper names end with `_`, which hides them from `google.script.run`. Model.gs's private helpers start with `PP_mdl`.
  - Functions without the final `_` can be called from the panel's window by anyone who can edit the Sheet: the `panel*` functions, the menu functions, `doGet`/`doPost`, and the shared functions of Model.gs and Code.gs such as `PP_readModel`, `PP_publish` or `PP_restore` (making those private is on the "Later" list in STATE.md).
- Start each file with a header comment written for a non-technical reader.
- Every message an admin sees must be plain English: what happened and what to do.

**The "allowed Apps Script services" rule:** use only the calls in this table. It lists exactly what the code calls today, for two reasons:

- the test harness's pretend Google (`tests/gas-harness/fake-gas.js`, its `ALLOWED` list) must offer exactly these, so a call that isn't listed shows up as a test problem;
- each one is in Google's own Apps Script reference. Two calls Google doesn't have (`Range.clearContents` and a global `MimeType.JSON`) once broke saving and publishing (fixed 20 Oct 2026).

To use anything new, first check it in Google's Apps Script reference, then add it to this table and to the harness's `ALLOWED` list in the same change.

| Service or object | Allowed (exactly what the code calls today) |
|---|---|
| `SpreadsheetApp` | `getActiveSpreadsheet()`, `openById(id)`, `create(name)`, `getUi()`, `flush()`, `newDataValidation()` |
| Spreadsheet | `getId()`, `getUrl()`, `getSheetByName(name)`, `getSheets()`, `insertSheet(name[, index])`, `deleteSheet(sheet)`, `getEditors()` (each `User` with `getEmail()`) |
| Sheet | `getName()`, `getRange(row, column[, numRows, numColumns])`, `getLastRow()`, `getLastColumn()`, `getMaxRows()`, `getMaxColumns()`, `appendRow(values)`, `insertRowsAfter(row, howMany)`, `insertColumnsAfter(column, howMany)`, `deleteColumns(column, howMany)`, `setFrozenRows(1)`, `setTabColor(colour)`, `setColumnWidth(column, width)`, `hideSheet()`, `isSheetHidden()` |
| Range | `getValues()`, `setValues(rows)`, `getValue()`, `setValue(value)`, `getRow()`, `clearContent()`, `setFontWeight('bold')`, `setBackground(colour)`, `setNumberFormat('@')`, `setDataValidation(rule)` (or `null`, which removes a rule), `setNote(text)`, `insertCheckboxes()`, `createTextFinder(text)` |
| TextFinder (from `Range.createTextFinder`) | `matchEntireCell(true)`, then `findAll()` (a list of one-cell ranges) |
| Data validation | `SpreadsheetApp.newDataValidation()`, then `requireCheckbox()` or `requireValueInList(values, true)`, `setAllowInvalid(true)`, `setHelpText(text)`, `build()` |
| `Ui` (from `SpreadsheetApp.getUi()`) | `createMenu(name)` then `addItem(label, functionName)`, `addSeparator()`, `addToUi()`; `alert(title, message, buttons)`; `prompt(title, message, buttons)`, whose answer has `getSelectedButton()` and `getResponseText()`; `showModalDialog(html, title)`; `ButtonSet.OK`, `ButtonSet.OK_CANCEL`, `ButtonSet.YES_NO`; `Button.OK`, `Button.YES` |
| `HtmlService` | `createHtmlOutputFromFile('Panel')`, `createHtmlOutput(html)`; on either, `setWidth(n)`, `setHeight(n)`, `setTitle(title)`, `addMetaTag(name, content)` (the survey page of Meesho-only mode, section 12) |
| `DriveApp` | `getFolderById(id)`, `getFileById(id)`, `createFolder(name)` |
| Folder | `getId()`, `getUrl()`, `createFolder(name)`, `getFoldersByName(name)` (a `FolderIterator` with `hasNext()` and `next()`), `createFile(blob)`, `createFile(name, content, 'application/json')`, `addEditors(emails)`, `setOwner(email)` (best effort, section 13) |
| File | `getId()`, `getUrl()`, `getBlob()` then `getDataAsString()`, `moveTo(folder)`, `setOwner(email)` (best effort, section 13) |
| `CacheService` | `getScriptCache()` with `get(key)`, `getAll(keys)`, `put(key, value, seconds)`, `putAll(values, seconds)`, `remove(key)`. Values up to 100 KB **in bytes**; Indian scripts take 3 bytes per letter, so chunks are at most 30,000 characters |
| `LockService` | `getScriptLock()`; `getDocumentLock()` (looked up first, see below; it gives `null` outside the Sheet, for example in the web app); a lock's `tryLock(ms)` and `releaseLock()` |
| `PropertiesService` | `getScriptProperties()` and `getUserProperties()`, with `getProperty`, `setProperty`, `getProperties`, `deleteProperty` |
| `Utilities` | `computeHmacSha256Signature(value, key, Utilities.Charset.UTF_8)`, `base64EncodeWebSafe(bytes)`, `base64Decode(text)`, `newBlob(bytes, contentType, name)`, `getUuid()`, `formatDate(date, 'Asia/Kolkata', pattern)` |
| `ContentService` | `createTextOutput(text).setMimeType(ContentService.MimeType.JSON)` |
| `UrlFetchApp` | `fetch(url, { muteHttpExceptions: true })`, plus `followRedirects: true` when checking the web app address, fetching the form's `index.html` (Meesho-only mode) or reading the form's route files as text (the publish guard reads `js/flow.js`, section 10; `panelFlowStatus` reads `js/flow.js`, `js/flow-panel.js` and `js/flow-check.js`, section 13; they are never run), and `headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }` only for the second, signed-in check of a web app address on `script.google.com`; the response's `getResponseCode()` and `getContentText()` (`getContentText('UTF-8')` for the route files) |
| `Session` | `getActiveUser().getEmail()`, `getEffectiveUser().getEmail()` |
| `ScriptApp` | `requireAllScopes(ScriptApp.AuthMode.FULL)` (looked up first, see below); `getOAuthToken()` (the signed-in check above) |
| Logging | `console.log`, `console.error` |

**Never use:**

- the global `MimeType`. It has no `JSON` entry, so `MimeType.JSON` is `undefined` on real Google: write the text `'application/json'`. Only `ContentService.MimeType.JSON` exists.
- `Range.clearContents`, which does not exist: use `clearContent`.
- `ScriptApp.getService().getUrl()`: Google often answers with the editors-only `/dev` address or an old deployment. Use the recorded web app address (`WEB_APP_URL`, section 13).
- `Logger` (use `console`), and any other Google service (GmailApp, MailApp, DocumentApp and so on).

**Two Google features are looked up before use.** `LockService.getDocumentLock` and `ScriptApp.requireAllScopes` are called only after `PP_hasMethod_(service, name)` finds them (`name in service`, and it is a function). Without them the code falls back:

- admins use the script lock, so admins and partners wait for each other again (section 20);
- Google is not asked to show its permission screen again; a missing permission is still explained when it gets in the way (section 13).

Whether both are found on real Google hasn't been checked yet (STATE.md, item 11).

**In Panel.html** (the browser side), the only Apps Script globals are:

- `google.script.run`, with `withSuccessHandler`, `withFailureHandler`, then one of the panel functions of section 13;
- `google.script.host.setHeight` and `setWidth`, used only when they exist (section 14).

**Two more things in Panel.html, both on purpose (flow graph, 26 Oct 2026):**

- **`new Function`.** The route code arrives as text from `panelFlowCode()` (`PP_FLOW_SOURCE_`) and runs once per window with a private root (`runFlowCode`, PART 5b), exactly as `PP_flowLib_` runs it on the server. **[UNCONFIRMED]** that Google's HtmlService frame allows it. If not, the rest of the panel works and Questions says why; pasting a route then runs on the server instead (`panelRouteTable`, section 13: the same code, from Flow.gs, since 27 Oct 2026), and only the Map, Try a path and the route badges are off.
- **The Map's one external library.** The page loads nothing from the internet except Mermaid 11.4.1 from cdn.jsdelivr.net (`MERMAID_URL`), pinned with Subresource Integrity (`MERMAID_SRI`, sha384), and only inside the Map's sandboxed `srcdoc` frame (`sandbox="allow-scripts"`, never `allow-same-origin`), which can't reach the page, `google.script.run` or the Sheet and only posts back "drawn" or "failed". The outline shows first; the panel waits at most 20 s (`MAP_WAIT_MS`). The harness's static check `mapException` (`tests/gas-harness/lib/static-checks.js`) enforces exactly this: every web address in the page's code is `MERMAID_URL` or one of `KNOWN_URLS` (addresses the page names but never loads: the default Import address and the mermaid.live link), the loader sets `src`, `integrity` and `crossOrigin` together, and every frame is sandboxed without `allow-same-origin`. **[UNCONFIRMED]** on real Google that the library loads in the nested frame; when it doesn't, the outline stays.

## 3. The control spreadsheet: tabs and columns

Row 1 of every tab holds the headers: frozen, bold, light purple `#EDE7F6`. Data starts at row 2. Column order is fixed as listed.

**Columns are found by header name**, not by position:

- An admin may add extra columns on the right of the last heading: they are never touched.
- In a questionnaire tab, a column squeezed in between two headings is kept and moves with its row, but a formula in it becomes a plain value when the panel saves.
- Never rename or delete a heading. If a tab with rows has lost its key heading (for example `key` in Texts), reading stops with a plain message instead of guessing.

`TRUE`/`FALSE` columns use checkboxes. `active` = unticked means the item is kept but hidden from partners. An empty `active` cell counts as ticked.

Text the script writes into a cell gets a leading apostrophe, so Google keeps it exactly as text: "2026-10-21", "007" or "=..." never become a date, a number or a formula.

| Tab | Columns (in order) | Notes |
|---|---|---|
| `Settings` | `setting`, `value`, `what it does` | One row per entry of `PP_SETTINGS_SCHEMA` (section 5), in schema order. `value` is typed: checkbox for bool, a drop-down list for choice, a number for numbers, text otherwise. Every save rewrites this tab, help texts included. |
| `Languages` | `order`, `code`, `bcp47`, `native_name`, `active` | Order = language-screen button order. |
| `Areas` | `order`, `area_id`, `threshold`, `active` | `threshold` blank = use `deep_dive.threshold`. Names and help lines are in `Texts` (`fn.<id>.name`, `fn.<id>.help`). |
| `Chips` | `area_id`, `order`, `chip_code`, `active` | Labels are in `Texts` (`issue.<area>.<code>`). `other` is never listed: the form adds it automatically. |
| `Support` | `order`, `item_code`, `active` | Labels: `support.<code>`. |
| `Screens` | `order`, `screen_id`, `type`, `text_key`, `required`, `show_if`, `skip_if`, `options`, `low_label`, `high_label`, `scale_hint`, `body`, `active`, `next`, `jumps`, `repeat` | One row per screen. `type` has a drop-down list of the screen types. `show_if` = the JSON rule text (blank = always). `options` = comma-separated codes (single_choice). `required` = TRUE/FALSE/blank (blank = type default). **The route (flow graph, 23 Oct 2026; [flow-engine.md](flow-engine.md) §9.1):** `next` = where to go after this screen, a later row's code or an ending's (blank = the following row); `jumps` = the JSON list `[{"when": <rule>, "goto": "<code>"}]` the jump builder writes, checked before `next` (text that isn't such a list is kept, so the check can point at it); `repeat` = blank (once), `each_area` or `each_low_area`, only on kinds that are `repeatable` (section 6). Rows below the main thank-you screen are other routes and endings, reached only by jumps. Older Sheets without these three headings still load; Set up or repair adds them. |
| `Texts` | `key`, then one column per language **code** in `Languages` order (`en`, `hi`, `ta`, `te`, `kn`, `ml`), then `note` | The single string table. An untranslated value is `"[TRANSLATE] " + English`. `note` = message for translators (for example "English changed on 2026-10-21: please re-check the translations."). A new language gets its column on the next save. |
| `What changed` | `round_id`, `order`, then one column per language code | One row per bullet on the "What changed" screen. |
| `Audio clips` | `key`, `lang`, `url` | Optional pre-recorded read-aloud clips (an https URL or a path inside `web/`). |
| `Rounds` | `round_id`, `status`, `opens_on`, `closes_on`, `data_sheet`, `audio_folder`, `notes` | `status`: `draft` / `open` / `closed`, changed only by the panel's Open / Close: typing a status here opens or closes nothing (the real status is in Script Properties, section 11). `data_sheet` and `audio_folder` are URLs filled in by the script. The dates are information only (no automatic opening or closing in Phase 2). |
| `DCs` | `dc_id`, `dc_name`, `state`, `region`, `language`, `active` | **Partner data**: lives only in this Sheet. `dc_id`: letters, digits, `-`, `_` or `.`, at most 64 characters. Set-up formats the `dc_id` column as plain text (`@`), so 0123 keeps its 0; an id that Sheets already stored as a number or a date gets no link (section 13, `panelGenerateLinks`). `language` = optional code for the link's `&lang=`. A new DCs tab starts with ticked `active` boxes. |
| `Links` | `round_id`, `dc_id`, `dc_name`, `state`, `region`, `language`, `link`, `generated_at`, `generated_by` | One row per DC per round ("sent" in the dashboard). |
| `Publish history` | `version`, `config_version`, `published_at`, `published_by`, `note`, `file`, `live` | `file` = the Drive URL of `p<N>.json`. Exactly one row has `live` = TRUE. |
| `_meta` (hidden) | `key`, `value` | `sheet_schema` = 1, `draft_revision` (integer, +1 on every save of the draft), `last_saved_by`, `last_saved_at`, `setup_done_at`. |

**Tab colours:**

| Colour | Tabs |
|---|---|
| purple `#7E57C2` | config tabs |
| green `#43A047` | `Rounds`, `Links`, `DCs` |
| grey `#9E9E9E` | `Publish history`, `_meta` |

## 4. The model: the questionnaire as one JS object

`PP_readModel(ss)` turns the tabs into this object, and `PP_writeModel` turns it back. The panel loads, edits and saves the **whole model**.

```js
{
  settings:  { "survey_id": "valmo-partner-pulse", "form_url": "https://...", "deep_dive.threshold": 3, ... },
  languages: [ { code: "en", bcp47: "en-IN", native_name: "English", active: true }, ... ],   // in order
  areas:     [ { id: "losses", threshold: null, active: true }, ... ],                         // in order
  chips:     [ { area: "losses", code: "wrong_debit", active: true }, ... ],                   // order within an area = array order
  support:   [ { code: "agent_behaviour", active: true }, ... ],
  screens:   [ { id: "nps", type: "nps_0_10", text: "q.nps", required: true, show_if: null,
                 skip_if: "", options: [], low_label: "nps.low", high_label: "nps.high",
                 scale_hint: "nps.scale_hint", body: "", active: true,
                 next: "", jumps: [], repeat: "" }, ... ],                                     // in order
  texts:     { "q.nps": { en: "...", hi: "...", ta: "[TRANSLATE] ...", ... }, ... },            // key order = tab order
  text_notes:{ "q.nps": "" },
  whats_changed: { "2026-R1": [ { en: "...", hi: "...", ... } ] },                              // order = row order
  clips:     { "q.nps": { hi: "https://..." } },
  rounds:    [ { id: "2026-R1", status: "draft", opens_on: "", closes_on: "", data_sheet: "",
                 audio_folder: "", notes: "" } ],
  config_version: "p7-2026-10-21"   // optional, in memory only: set by an import or a restore (section 8)
}
```

**Section names:**

- `settings`, `languages`, `areas`, `chips`, `support`, `screens`, `texts`, `whats_changed`, `clips`, `rounds`.
- `text_notes` is saved together with `texts`.
- `whats_changed` has an entry for every round in `rounds` (an empty list when the round has no bullets), then any other round that has bullets in the What changed tab.

**`PP_writeModel(ss, model, sections)`** rewrites only the listed sections (all of them when `sections` is left out). It works in two steps, so a problem found early never leaves the draft half-saved:

1. **Check and plan, without writing anything.** It stops with "Nothing was changed" (or "Nothing was saved") when:
   - a value is longer than 49,000 characters (Google Sheets keeps at most 50,000 in a cell);
   - a tab can't be read;
   - a tab's name differs from the right one only in capital letters or spaces (for example `texts`).

   It also works out where each column goes and which lines each tab gets.
2. **Write, tab by tab:**
   - create a missing tab, or add rows and columns to one that is too small (`insertRowsAfter`, `insertColumnsAfter`);
   - add missing headings on the right;
   - write all the new rows with one `setValues`, and only then empty the left-over old rows (`clearContent`), so a Google hiccup half-way never leaves a tab blank;
   - add tick boxes to `active` and a TRUE/FALSE list to `required`. In the Settings tab, the values get tick boxes (on/off settings) and lists (choices) when its rows moved or the tab is new. These are only cosmetic: a failure here is logged and never stops the save.

If Google still refuses a write half-way (for example a protected tab), the error says "Saving stopped half-way", that the draft may be only partly changed, and to reload the control panel.

**Types:**

- Booleans are JS `true`/`false` (checkboxes).
- Numbers are JS numbers.
- `show_if` is an object or `null`. In the tab it is `JSON.stringify(rule)`. A rule that can't be read is kept as `{ unreadable: "the text as typed" }`, so the checks can point at it.
- `options` is an array. In the tab it is `"a, b, c"`.
- `jumps` is an array of `{ when, goto }` (`[]` = none). In the tab it is its JSON text (empty for none). Text that isn't a list is kept as `{ unreadable: "the text as typed" }` (Model.gs `PP_mdlJumpsValue_`), so the checks can point at it and Publish waits.
- `next` and `repeat` are text (`""` = the following row / once). `panelSave` keeps a screen's saved `next`, `jumps` and `repeat` when the panel window sends none of the three fields for it (an older window; PanelServer.gs `PP_carryFlowColumns_`).
- Settings of the types `faces`, `list` and `numlist` stay text in the model (`"😠 🙁 😐 🙂 😄"`, `"2, 5, 10"`); they become lists only in the published document.
- Empty text is `""`.
- A value that is present but wrong (for example a threshold of `"abc"`) is kept as typed, so the checks can show it.

## 5. `PP_SETTINGS_SCHEMA`: every row of the Settings tab

Each entry has these fields:

- `key`: the dotted path inside survey.json, except `form_url`;
- `type`: `text` | `url` | `color` | `bool` | `int` | `number` | `choice` | `lang` | `key` | `faces` | `list` | `numlist`;
- `default`;
- `min` and `max`, for numbers (`null` = no limit);
- `options`, for choice (`null` otherwise);
- `help`: plain English, shown in the "what it does" column and in the panel;
- `group`: the heading it is shown under in the panel (section 6);
- `label`: a short plain-English name, used in the panel and in the checks' messages (for example "Longest voice note (seconds)").

| key | type | default | rule |
|---|---|---|---|
| survey_id | text | valmo-partner-pulse | `^[a-z][a-z0-9_-]*$`; change only before launch |
| form_url | url | https://pranavakellaps37.github.io/NPS-Form-/ | https://..., ends with `/`, no spaces, quotes, `?` or `#`. Used for links and Preview. **Not compiled into survey.json.** |
| default_language | lang | en | an active language |
| fallback_language | lang | en | an active language |
| branding.logo | text | (empty) | empty, an https:// address, or a path inside web/ (no spaces, no leading `/`, no `..`, no `\`). `scripts/check_config.py` applies the same rule to the GitHub copy, and also checks that a path inside web/ exists |
| branding.colors.primary / on_primary / background / surface / text / muted / border / error / success | color | as in the Phase 1 survey.json | `#RRGGBB` |
| navigation.auto_advance | bool | true | |
| navigation.auto_advance_delay_ms | int | 350 | 0-2000 |
| rating.faces | faces | `😠 🙁 😐 🙂 😄` | exactly 5 items separated by spaces |
| rating.allow_not_applicable | bool | true | |
| deep_dive.threshold | int | 3 | 1-5 |
| deep_dive.when | choice | after_all_ratings | after_all_ratings, immediate |
| deep_dive.require_chip | bool | true | |
| deep_dive.require_detail_if_other | bool | true | |
| support.allow_not_applicable | bool | false | |
| support.allow_comment | bool | true | |
| support.comment_text | key | q.support_comment | a key in Texts (when the comment is on) |
| voice.enabled | bool | true | |
| voice.gesture | choice | hold | hold, tap |
| voice.max_seconds | int | 60 | 5-300 |
| voice.min_seconds | number | 1 | 0 or more, and below max_seconds |
| voice.bitrate | int | 16000 | 6000-64000 |
| voice.mime_types | list | audio/webm;codecs=opus, audio/ogg;codecs=opus, audio/webm, audio/mp4 | comma-separated, at least one |
| text.max_chars | int | 1500 | 50-10000 |
| read_aloud.enabled | bool | true | |
| whats_changed.timeout_seconds | number | 4 | 1-20 (also the bootstrap wait) |
| telemetry.enabled | bool | true | |
| backend.request_timeout_seconds | number | 90 | 10-600 |
| backend.slow_upload_bytes_per_second | number | 1000 | 100-100000 |
| backend.retry_delays_seconds | numlist | 2, 5, 10, 20, 40, 60, 60, 120, 120, 300 | 1-20 numbers, each above 0 |

**Never in the Sheet** (static-only, they stay in `web/config/survey.json` in the repo): `backend.mode`, `backend.mock_url`, `backend.apps_script_url` and `links`. The form needs these to find the backend before it can ask for the published version.

## 6. Built-in catalogue (`PP_SCREEN_TYPES`, `PP_FORM_TEXT_KEYS`)

**`PP_SCREEN_TYPES`** is an array of `{ type, label, description, builtin, needs_text, fields, required_default }`, plus `skip_if`, `repeatable`, `icon`, `order`, `default_id`, `default_text`, `after_note` and `node_type` where they apply.

**Since 26 Oct 2026 (flow-graph stage 5) it is GENERATED**, with `PP_ADDED_TYPES_`, between the `BEGIN GENERATED` / `END GENERATED` marks of Model.gs, by `node scripts/flow.js types --write`, from the form's catalogue `web/config/types.json` (each kind's `row`; [flow-engine.md](flow-engine.md) §10). Never edit it by hand; `check_config.py` warns when it is stale. `repeatable: true` marks the kinds that can be asked once per area (the six generic ones). `PP_ADDED_TYPES_` holds the whole catalogue entry of each kind added in `web/js/types/` (`[]` today), and that kind's row carries the same entry as `catalogue`: `PP_mdlFlowLib_` teaches it to the route code once per run (`loadCatalogue`), and the panel window to its own (`teachKinds`), so Publish's checks, the route table's Check (in the window, or on the server through `panelRouteTable`), the Map and Try a path know it. The table shows the built-in kinds:

| type | builtin (at most once, cannot be deleted) | needs `text` | extra fields a row can have | empty `required` means (`required_default`) |
|---|---|---|---|---|
| language_picker | yes | no | skip_if (`lang_in_url` or blank) | (not used) |
| whats_changed | yes | no | skip_if (`empty` or blank) | (not used) |
| function_ratings (route kind `function_rating`) | yes | no | none | (not used) |
| function_deep_dives (route kind `function_deep_dive`) | yes | no | none | (not used) |
| support_block | yes | yes | none | required |
| thank_you | the main one must exist and stay active; more may follow it, as endings of other routes | no | none (an extra ending has its own `text`/`body` keys `end.<id>.title`/`.body`) | (not used) |
| nps_0_10 | no | yes | low_label, high_label, scale_hint, required | required |
| rating_1_5 | no | yes | required | required |
| yes_no | no | yes | required | required |
| single_choice | no | yes | options (+ texts `choice.<screen>.<code>`), required | required |
| free_text | no | yes | required | optional |
| info_card | no | yes | body | (not used) |

**Catalogue shapes** (sent to the panel in `panelLoad().catalog`):

- `settings_schema`: `[ { key, type, default, min, max, options, help, group, label } ]`. `group` is one of: "Form address", "Languages", "Look & feel", "Moving between screens", "Ratings", "Problem screens", "Support questions", "Voice notes", "Typing", "Read aloud", "What changed", "Progress messages", "Sending".
- `screen_types`: `[ { type, label, description, builtin, needs_text, fields: [names of the extra fields a row of that type can have], required_default } ]`. `label` and `description` are plain English, for example "Yes / No question" with "Two big buttons: Yes and No.": the read-only list of Questions shows them on each card. (The route table names the kinds its own way, for example `yes/no`; a kind added in `web/js/types/` is written there with its code, and its `label` is read too.) `required_default` is what an empty `required` means for that type: `true`, `false`, or `null` where it doesn't apply.
- `form_text_keys`: `[ keys ]`.

**`PP_FORM_TEXT_KEYS`** is the texts the form's code uses directly. It must stay **identical** to `FIXED_STRING_KEYS` in `scripts/check_config.py`: today both hold the same 78 keys in the same order, including the Phase 2 keys `round.closed_title`, `round.closed_body`, `round.not_open_title`, `round.not_open_body`, `dev.preview_banner`, `dev.preview_done`, `dev.preview_fallback`, `ui.start_again` and `dev.preview_broken` (21 Oct). The checks never report these three texts the form's code asks for as unused: `q.tell_more_required` (which is also in `PP_FORM_TEXT_KEYS`), `support.not_applicable` and `q.support_comment` (`PP_MDL_CODE_TEXT_KEYS_`).

**Derived text keys** (`PP_derivedTextKeys(model)`) that must exist for active items:

| Item | Keys |
|---|---|
| area | `fn.<id>.name`, `fn.<id>.help` |
| chip | `issue.<area>.<code>` (plus `issue.other` when any area is shown) |
| support item | `support.<code>` (+ `support.not_applicable` when `support.allow_not_applicable`) |
| support comment | `support.comment_text` when `support.allow_comment` |
| screen | its `text`, `low_label`, `high_label`, `scale_hint`, `body`, and `choice.<id>.<code>` for every option |

**Naming for new things created in the panel:**

| New thing | id | Texts |
|---|---|---|
| screen (a row of a pasted route table; since 27 Oct 2026 the only way to add one) | its **code** cell, or, when that is empty, the slug of its English text, for example `how_easy_was_it` for "How easy was it?" (with a warning to keep it) | `q.<id>`, `q.<id>.body`, `q.<id>.low`, `q.<id>.high`, `q.<id>.hint`; an extra ending `end.<id>.title`, `end.<id>.body` ([flow-engine.md](flow-engine.md) §9.8.6) |
| area | slug, for example `returns` | `fn.<id>.name`, `fn.<id>.help` |
| chip | slug | `issue.<area>.<code>` |
| option | slug | `choice.<screen>.<code>` |
| support item | slug | `support.<code>` |
| built-in screen | its usual id: `language`, `whats_changed`, `fn_ratings`, `fn_deep_dives`, `support`, `thanks` | the support screen's question is `q.support_block` |

A new code also skips codes that existing texts already use (for example `q.<code>` for a screen, `fn.<code>.*` for an area), and these reserved ones: `support_comment` (screens), `other` (chips) and `not_applicable` (support items).

`PP_slug(text)` (and the panel's own `slug`, the same rule) lowercases the text, replaces each run of anything outside `[a-z0-9]` with `_`, trims `_` at both ends, cuts it to 40 characters, puts `n` in front if it starts with a digit, uses `item` if nothing is left (the panel uses a word that fits instead: `question`, `area`, `problem` or `option`), and makes it unique by adding `_2`, `_3` and so on.

## 7. Compile: model to published document (`PP_compile(model, stamp)`)

`stamp` = `{ version: N, published_at, published_by, note }`, or `null` for a draft/preview compile.

**`config_version`:** `"p" + N + "-" + yyyy-MM-dd` (Asia/Kolkata date of publishing). For a draft it is `"draft"`.

```json
{
  "format": 1,
  "version": 7,
  "config_version": "p7-2026-10-21",
  "published_at": "2026-10-21T08:30:00.000Z",
  "published_by": "someone@example.com",
  "note": "Added a Payments chip",
  "survey": { "...": "same structure as web/config/survey.json, see below" },
  "strings": { "key": { "en": "...", "hi": "...", "ta": "...", "te": "...", "kn": "...", "ml": "..." } },
  "whats_changed": { "2026-R1": { "title": null, "items": [ { "en": "...", "hi": "..." } ] } },
  "clips": { "q.nps": { "hi": "https://..." } }
}
```

**How `survey` is built (inactive things are always left out):**

| Field | Comes from |
|---|---|
| `survey_id` | the setting |
| `config_version` | as above |
| `branding`, `navigation`, `rating`, `deep_dive`, `voice`, `text`, `read_aloud`, `whats_changed`, `telemetry` | rebuilt from the settings by key path, with typed values. `rating.faces` becomes an array of 5. `voice.mime_types` becomes an array. A setting with a problem gets its default here, so Preview still works (Publish is blocked by the checks anyway). A settings group added to the schema later is copied the same way. |
| `backend` | `{ request_timeout_seconds, slow_upload_bytes_per_second, retry_delays_seconds }` only |
| `languages` | the active languages in order, as `{ code, bcp47, native_name }` |
| `default_language`, `fallback_language` | the settings |
| `functions` | the active areas in order, each `{ id, issues: [active chip codes in order] }`, plus `threshold` when it is set |
| `support` | `{ items: [active codes], allow_not_applicable, allow_comment, comment_text }` |
| `flow` | **the route as a graph** (`pp-flow/1`, since 23 Oct 2026). `PP_mdlCompileSurvey_` calls `PP_mdlCompileFlow_`, which hands the Screens rows to `PP_flowLib_().flowPanel.fromRows` (Flow.gs, the form's own `web/js/flow-panel.js`). That builds the old list exactly as before (the active screens in order, each `{ id, type }` plus only the non-empty fields among `text`, `required` when boolean, `show_if` when an object that could be read, `skip_if`, `options` when non-empty, `low_label`, `high_label`, `scale_hint`, `body`), lets the form's converter `PP.flow.fromLegacy` turn it into the graph, then adds `next`, `jumps` and `repeat`. A Sheet that uses none of the three gives exactly the converter's graph. Arrows to hidden rows are re-targeted; a hidden ending still ends its route at the main thank-you screen. The rules and the notes it reports: [flow-engine.md](flow-engine.md) §9.2 |

**`strings`:**

- Every key in Texts, with one value per **active** language.
- A missing or empty value for an active language becomes `"[TRANSLATE] " + en`, so the form falls back to English.
- No `_help` keys.

**`whats_changed`:** every round of the model (section 4), each `{ title: null, items: [...] }`; `items` may be empty. Each item has values for the active languages, filled the same way as strings.

**`clips`:** for active languages only.

**Comparing the draft with the live version.** The compile is **deterministic**: the same model gives the same JSON, apart from the stamp. `PP_compileForCompare(modelOrDoc)` (Model.gs) is how "the draft differs from live" is decided:

- it compiles a model with `PP_compile(model, null)`, or takes an already published document as it is;
- it removes `version`, `config_version`, `published_at`, `published_by`, `note` and `survey.config_version`;
- it removes every round whose "What changed" has no items: an empty round shows partners nothing, so **creating a new, empty round is not a change** (no needless "Publish first");
- it writes the rest as JSON with every object's keys sorted.

Two documents are the same when those texts are equal. `PP_draftDiffersFromLive(model, liveDoc)` is true when nothing is live or the texts differ. (The panel's own "unsaved content changes" test leaves empty rounds out the same way.)

## 8. Import and export (`PP_importStatic`, `PP_exportStatic`)

**`PP_importStatic(files)`:**

- `files` = `{ survey, strings, whats_changed, audio_clips }` (parsed JSON of the repo files). Each one may be `null`, apart from `survey` and `strings`.
- `survey.flow` may be the graph (the repo copy since 26 Oct 2026) or the old list. A graph becomes Screens rows through `PP.flowPanel.toRows` (Flow.gs), the inverse of compile for what the panel can show (`next`, jumps, area repeats, endings, the immediate-mode group). A graph outside that (custom groups, loops over other lists, loops inside loops, settings the rows can't hold) is refused with a plain message naming up to 8 of the screens, and nothing changes. Restore (section 10) uses the same converter.
- It returns a full model:
  - settings via the schema paths (missing ones get their defaults; `form_url` default as in section 5);
  - languages, all active;
  - areas and chips, all active;
  - support;
  - screens, from `flow`, all active;
  - texts, from strings, minus `_` keys;
  - whats_changed, from `rounds`;
  - clips;
  - rounds, one per round in whats_changed.json, all with `status: "draft"`. For a round id containing `DEMO` (in capitals or not), `notes` is "Fake demo content: never use for real links";
  - `config_version`, remembered in memory from survey.json, so exporting straight away gives the same files back.
- The setup and the panel's "Import from GitHub" use it (`PP_importFromAddress_`):
  - The default base URL is `https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/web/`. A pasted one must start with `https://`; a final `/` is added.
  - The files read are `config/survey.json` and `i18n/strings.json` (required) and `config/whats_changed.json` and `config/audio_clips.json` (optional: `null` when missing or unreadable).
  - Rounds that already exist keep their status, data links and notes; rounds new in the import are added after them; the form address is kept. The import then becomes the draft (all sections, under the admin lock) and the revision goes up.

**`PP_exportStatic(model, opts)`:**

- `opts` = `{ apps_script_url, config_version }`. `config_version` is optional: without it, the one remembered by an import or a restore is used, else `"draft"`. (`panelExport` passes the live version's when the saved draft equals the live version, section 13.)
- It returns `{ "survey.json": text, "strings.json": text, "whats_changed.json": text, "audio_clips.json": text, "flow.md": text }` in the **exact formats of the repo files**. The content is what Publish would publish (hidden items left out). The fifth, `flow.md` (since 26 Oct 2026, review finding 10), goes to `docs/flow.md`: the map of the route, made by `PP.flowCheck.toMarkdown` (`PP_mdlFlowMapText_`) from that `survey.json` and `strings.json`, byte for byte what `node scripts/flow.js map` makes of them, so GitHub's settings check doesn't warn that the map is out of date.
  - `survey.json`:
    - pretty-printed, keeping the same `_help` notes as today, which are stored as constants in Model.gs (`PP_SURVEY_HELP`; they must match the repo file word for word);
    - its `flow` is the graph, written by `PP.flowPanel.surveyTextWithFlow` / `formatFlow` (deterministic layout, with the graph's own note `FLOW_HELP`): the same functions `node scripts/flow.js migrate --write` uses, so `PP_exportStatic(PP_importStatic(the repo files))` equals the repo files byte for byte (a tests/model check);
    - `backend` = `{ mode, mock_url: "/api", apps_script_url, request_timeout_seconds, slow_upload_bytes_per_second, retry_delays_seconds }`. `mode` is `"apps_script"` when a web app address is given. **Without one it stays `"mock"` (test mode)**: the settings check that GitHub runs before publishing the form refuses `"apps_script"` with an empty address, and a form in that state couldn't send answers anyway;
    - `links` = the Phase 1 `mock_defaults`.
  - `strings.json`: the `_help` line first, then one line per key, the same layout as now.
  - `whats_changed.json`: all rounds (including empty ones).
  - `audio_clips.json`: the active languages' clips.
- It is used to refresh the repo's fallback copy (the admin downloads the files and commits them, or hands them to a developer).
- The panel's checks and `scripts/check_config.py` use the same rules for logo and clip addresses (an https:// address or a path inside `web/`) and for round names (1 to 64 letters, digits, `-` or `_`), so a GitHub copy the panel accepts also passes the settings check (21 Oct, STATE item 8). Only `check_config.py` can check that a path inside `web/` exists.

## 9. Validation (`PP_validate(model, liveDoc, everLive)`)

It returns:

```js
{ errors: [issue], warnings: [issue], summary: {...} }
```

where `issue = { section, ref, message }`:

- `section` is one of the section names;
- `ref` is a short pointer, for example:
  - a code: `"payments"`, `"payments/payout_delayed"`, `"ta"`;
  - a text key: `"q.nps"`, or `"q.nps (hi)"` for one language;
  - a setting: `"Settings > voice.max_seconds"`;
  - a screen: `"screen 4"`, counted from 1 (the panel shows it as "question 4");
  - a round: `"2026-R1"`, or `"2026-R1 item 2"` for a bullet;
  - for an item that has no code yet: `"area 2"`, `"language 7"`;
- `message` is plain English and says what to do. It names things the way the panel shows them:
  - a screen as "question N" followed by its English text, for example question 4 ("How likely are you to recommend Valmo…");
  - areas, problems and support questions by their English labels;
  - languages by their English names.

  Codes appear only in brackets at the end.

`liveDoc` is the live published document, or `null`. The panel and Publish pass `PP_liveDocForChecks_()`, which is `null` until codes lock (section 11). So the "live code is missing" checks only start once a real round has been opened. `everLive` is the list in the Script Property `CODES_EVER_LIVE` (Code.gs `PP_codesEverLiveForChecks_()`: `null` until codes lock): every code of every version published since then, as qualified entries (section 11).

**The order of the checks** (Model.gs `PP_validate`): settings, languages, areas, chips, support, the Screens tab's own rows (`PP_mdlCheckScreens_`), the notes from compiling the route (`PP_mdlReportFlowNotes_`, which since 27 Oct 2026 include routes running into each other, note G5), **the route** (`PP_mdlCheckRoute_`), texts, What changed, clips, rounds, **the codes lock** (`PP_mdlCheckLiveCodes_`, the kinds of live questions `PP_mdlCheckLiveKinds_`, `PP_mdlCheckEverLiveSize_`), size.

**The words of the messages (since 27 Oct 2026).** The questions' route is changed only by pasting a route table (Questions > Paste a route), so every message about a screen says what to change in that table: its `kind`, `show`, `show only if`, `then go to`, `jumps` or `ask for` column (`PP_MDL_ROUTE_TABLE_` = "the route table (Questions > Paste a route)"). The kinds are named as the table names them (`PP_MDL_TABLE_KINDS_`, `PP_mdlTableKind_`: "voice/typing", "faces", "ending" …; tests/model compares them with flow-panel.js). No message names the removed question editor (tests/model group 16 checks it).

Errors block Publish. Warnings never block it.

**Errors:**

- **Settings:**
  - wrong type or out of range (per schema): a bool that isn't on/off, a number that isn't one (or isn't whole for `int`), a choice that isn't one of its options, an empty `list`, a `numlist` that isn't 1 to 20 numbers above 0;
  - colours that are not `#RRGGBB`;
  - `rating.faces` not exactly 5;
  - `form_url` not `https://…/` (no spaces, quotes, `?` or `#`);
  - `survey_id` not `^[a-z][a-z0-9_-]*$`;
  - a logo that is not empty, an https:// address or a path inside web/;
  - default or fallback language not active;
  - `support.comment_text` missing from Texts (when the comment is on);
  - `voice.min_seconds` not below `voice.max_seconds`.
- **Languages:**
  - a missing code, a code that is not `^[a-z]{2,3}$`, or one that appears twice;
  - missing `bcp47` or `native_name`;
  - no active language;
  - English missing from the language list (it may be switched off, but every text is written in English first).
- **Areas:**
  - a missing id, an id that is not `^[a-z][a-z0-9_]*$`, or one that appears twice;
  - a threshold that is not blank and not a whole number from 1 to 5;
  - no active area while an active `function_ratings` screen exists.
- **Chips:**
  - an unknown area (with a "did you mean" hint);
  - a missing or invalid code, or one repeated within its area;
  - the code `other`, which is reserved.
- **Support:** an invalid or repeated code.
- **Screens (the rows themselves, `PP_mdlCheckScreens_`).** For every row, hidden ones too: a missing, invalid or repeated code; a missing or unknown type; a built-in type used twice (thank-you screens excepted: several endings are allowed). For shown rows, what compiling leaves out of the route, so the route checker can't see it (`PP_mdlCheckScreenFields_`): `skip_if` not allowed for the type, or a value the type doesn't know; `required` not TRUE/FALSE/blank; a rule that can't be read. The main thank-you screen (the first one) missing or hidden (`PP_mdlCheckMainThanks_`). In "straight after each low rating" mode, the problem-screens row while the ratings screen is missing, hidden or later (`PP_mdlCheckImmediateDives_`; that row is compiled away, so the checker never sees it).
- **Building the route** (`PP_mdlReportFlowNotes_`, the notes of `fromRows`, [flow-engine.md](flow-engine.md) §9.2): an arrow (`next` or a jump) to a code no row has (G2) or back to an earlier row that is not an ending (G3), a jump or `repeat` that can't be used (F1), and a route that runs on into another one (G5, see below) are errors (`PP_MDL_FLOW_ERRORS_`; a note marked `level: "error"` is always an error). Notes marked `level: "warning"` stay warnings: since 26 Oct 2026 that is the problem-screens row's leftover "then go to", jumps or "ask for" in "straight after each low rating" mode, which change nothing for partners (the message says to clear them in the route table). The route table's Check blocks exactly the same notes, so Check and Publish refuse the same routes.
- **The route (`PP_mdlCheckRoute_`, since 26 Oct 2026).** Everything about the route (rules, jumps, order, endings, repeats, answer codes, sizes) is checked by the project's one flow checker: `PP_mdlRouteFindings_` runs `PP_flowLib_().flowCheck.check` on the compiled survey with `{ surface: "panel", hiddenCodes: PP_mdlHiddenCodes_(model), nameOf }` (no `everLiveCodes`: the codes lock is decided below). Its errors and warnings ([flow-engine.md](flow-engine.md) §6, codes G1 to C2) are reported at their row (`ref` `screen N`), worded for the panel by `PP_mdlReportRouteFinding_` (`PP_mdlPanelWords_`: "Texts & translations", "then go to", "show only if", "ask for", `<=` `>=` `=` `!=` for the tests, "the 2nd part of its rule", "code", the same words as the route table's own Check; `PP_mdlThisQuestion_`: the row's own code moves into a closing "(Its code is "…".)"). Left out: T1 (the text checks below cover every text) and every `info`. D1/D2 (`nps`, `support_gate`) are worded by `PP_mdlReportDataColumn_`: deleting either, or re-typing `nps`, is an **error** naming the data column it fills; hiding one is a warning at its row. A row below the main thank-you screen that nothing reaches keeps the panel's own wording. While a shown row has no valid code or kind, only D1/D2 are reported (the screens can't be told apart). If the checker can't run, that is one error and Publish waits. A parity test (tests/model group 13) proved that every problem the old route checks reported (`PP_mdlCheckScreenOrder_`, `PP_mdlCheckRules_` … `PP_mdlCheckNumberTest_`, `PP_mdlCheckOptions_`, `PP_mdlCheckDataColumns_`, all deleted) is still reported at the same question.
- **Routes running into each other (since 26 Oct 2026; since 27 Oct 2026 the `fromRows` note G5).** A shown row below the main thank-you screen with no "then go to", whose following shown row starts **another** route (another question jumps there), would let partners run on into that route (for example promoters into the detractors' questions, after an ending between them was deleted). That is an error naming both questions, reported once, at that row, in Flow.gs's words. A hidden ending between them is fine: it still ends the route, at the main thank-you screen. Until 27 Oct Model.gs had its own copy of this rule (`PP_mdlCheckRunIntoRoutes_`, removed): now the rule lives only in `fromRows`, so the route table's Check refuses the same rows (tests/flow/panel_rows_test.js compared the two on 3,000 generated routes).
- **A question partners answered changed its kind (`PP_mdlCheckLiveKinds_`, since 27 Oct 2026).** For every screen of the live version whose kind stores an answer, the draft's row with that code (shown or hidden) must have the same kind: its answers are stored under its code, and the dashboard compares rounds by that code. Otherwise it is an **error** naming both kinds in the table's words ("… is now of the kind "faces", but partners have already answered it as a question of the kind "voice/typing", so its kind can't change …"). Only when `liveDoc` is given (codes locked). A shown `nps` or `support_gate` of another kind is told by D2 instead. Not covered here: a question that was hidden in the live version (a published version holds only the shown screens, and `CODES_EVER_LIVE` holds codes, not kinds); the route table's Check covers it with the draft row's kind. `PP_mdlLiveKinds_(doc)` gives the same live kinds to the panel (`live_ids.kinds`, section 13), so the route table's Check and Publish agree.
- **Texts:**
  - a required key that is missing (derived keys of active items + `PP_FORM_TEXT_KEYS`; a missing comment question is reported under Settings instead);
  - an empty English value, or one containing `[TRANSLATE]`; the same for the fallback language when it is not English;
  - a translation whose `{…}` marks (such as `{s}`, `{n}`) differ from the English, ignoring values that are still empty or `[TRANSLATE]`.
- **What changed:**
  - an item with no English, or with `[TRANSLATE]` in its English (and the same for the fallback language when it is not English);
  - a round id that is not in the Rounds list and not `^[A-Za-z0-9_-]{1,64}$`.
- **Rounds:** a round id that is not `^[A-Za-z0-9_-]{1,64}$`. (Dots are refused here and in the panel's "New round", although links and the backend would accept them: section 17.)
- **Size:** compiled JSON larger than 200,000 characters. Partners download it on slow data.

**Warnings:**

- a `bcp47` tag that doesn't look like a language tag (such as `ta-IN`);
- a number of active chips in an active area outside 4-6;
- the support ratings screen switched on with no support question switched on;
- a rule on the thank-you screen while it is the only ending (it has no use there);
- the route checker's warnings (for example a screen no answer combination can show, a jump ignored whenever its screen is skipped, an arrow to a hidden question, more than 40 screens on the longest route), and the `fromRows` notes C2 and G4 (an arrow to a hidden row or ending; an ending's arrows);
- **a hidden `nps` or `support_gate` screen**: their answers fill the `nps` and `support_contacted` columns of every round's `responses` tab, so those columns stay empty while it is hidden (deleting one is an error, above). The panel never deletes or re-codes them (section 11);
- an `at_most`/`at_least` number that lets every answer, or no answer, through;
- for each active language other than English and the fallback language, the count of values still missing or `[TRANSLATE]`;
- text keys nothing uses, not even a hidden item (one warning listing them; `rating.*` keys and the form's own texts are never listed);
- a what-changed item in a non-DEMO round that still contains `[SAMPLE]`;
- a DEMO round with bullets that is not open: fake content, never to be opened for real partners;
- a round listed twice, or with a status other than draft/open/closed;
- an open round whose id contains `DEMO`;
- **codes that are live today but missing from the draft** and not yet in `CODES_EVER_LIVE` (a screen id, area id, chip code, support code or option code), only when `liveDoc` is given. The dashboard compares rounds by these codes, so: "change its words and keep the code; hide it instead of deleting it" (for a question: "put its row back in the route table … write no in its "show" column"; for an answer option, which can't be hidden: "put it back in its question's "answers" cell");
- `CODES_EVER_LIVE` near its size limit (`PP_mdlCheckEverLiveSize_`: 8,000 of about 9,000 characters).

**The codes lock (an error, `PP_mdlCheckLiveCodes_`, since 26 Oct 2026, review finding 2).** A code in `everLive` (`CODES_EVER_LIVE`) that is gone from the draft is an **error**, and Publish waits until it is back: "Partners answered it in a real round, so it can never be deleted or re-coded". It is decided on the **qualified** entries, each looked for where it belongs: `screen:<id>` among the screens (with the built-in area screens' answer prefixes), `area:<id>` among the areas, `chip:<area>/<code>` in its own area, `support:<code>`, `option:<question>/<code>` in its own question. A hidden item there counts as kept; the same code elsewhere does not. An answer option can't be hidden, so its message never says "hide it". (The flow checker's own C1 compares bare codes, so the panel doesn't use it.)

**`summary`:**

```js
{ screens: n, areas: n, chips: n, support: n,
  languages: [{ code, total, untranslated }], compiled_chars: n }
```

## 10. Publish, versions and restore

**`PP_publish(ss, note, user)`**, run inside `panelPublish` (and by set-up's "Publish version 1 now?"), always under the admin lock (section 20):

1. Read the **saved** draft.
2. Read the live document for the checks (`PP_liveDocForChecks_()`). **Once codes are locked and a version is live but Google Drive can't read it just now, stop** (`PP_requireLiveWhileLocked_`, since 26 Oct 2026, review finding 9): "Nothing was published: Google Drive could not read the live version (version N) just now, and Publish needs it to protect the codes partners have answered. Try again in a minute." Publishing without it would leave that version's codes out of the lock for good. (A live file deleted for good also stops it; the message says what to check.)
3. Validate it, with that live document and `PP_codesEverLiveForChecks_()` (`CODES_EVER_LIVE`, section 11). If there are errors, refuse: `{ ok: false, errors }`.
4. Take the next version: N = the highest of `LIVE_VERSION` and every version in Publish history, plus 1 (1 when nothing was ever published).
5. Compile with the stamp: `published_at` = now, `published_by` = the user, `note` = the note on one line, at most 500 characters.
6. **The publish guard** (the route is a graph: since 23 Oct 2026 always). `PP_formEngineGuard_(form_url)` reads `<form_url>js/flow.js` as text (never run) and finds `ENGINE = <n>`. Below 2 (`PP_SRV.FLOW_ENGINE_NEEDED`, or this panel's own engine if higher), Publish is refused, as an error under `Settings > form_url`: "The form on GitHub is older than this control panel: upload the new form code first, wait for the green tick, then publish." A form found new enough is remembered for 10 minutes (cache `form_engine:<address>`). When the form can't be checked (an invalid address, no answer, or not 200), Publish goes on with the warning "Published, but Partner Pulse could not check that the form on GitHub understands this version …".
7. Save `published/p<N>.json` in the Drive folder with `createFile(name, text, 'application/json')`. When a co-admin publishes, hand the file to the owner (section 13).
8. Make it live, in this order, so a phone asking in between never gets a mixed-up answer:
   1. put the JSON into the script cache: key `live:N:k` holds the number of chunks, and `live:N:<i>` holds each chunk of at most 30,000 characters (under 100 KB even in Indian scripts), for 6 hours;
   2. write Script Property `LIVE_FILE_ID` = the file id;
   3. write `LIVE_VERSION` = N, last.
9. In `Publish history`, untick `live` on every row and append the new row with `live` ticked.
10. **Remember the codes** (`PP_recordCodesEverLive_`, only once codes are locked): add the codes of the version that was live and of the new one to `CODES_EVER_LIVE` (section 11). When the list nears or passes the 9 KB limit of a Script Property, a warning says so (past it, the new codes aren't recorded).
11. Return `{ ok: true, version, config_version }`, plus `warnings` (a list of sentences) when there are any: the guard's and the codes list's. The panel shows them in the "Version N is live" message under "Please check one thing:" / "Please check N things:" (since 26 Oct 2026, review finding 3; before, they reached only the log), and set-up's "Publish version 1 now?" (`PP_offerFirstPublish_`) puts them in its closing notes.

**Reading the live version.** `doGet` (and the panel) read the live document from the cache. When the cache has lost it, they read the Drive file `LIVE_FILE_ID` and put it back in the cache, but only if its `version` really is `LIVE_VERSION`. The panel uses `PP_liveDocForAdmin_()`, which stops with the "share the Drive folder" error when Drive refuses the person (section 13).

**`PP_restore(ss, version)`**, run inside `panelRestore`:

- It needs a version number that is in Publish history. The document is the live copy when it is the live version, otherwise the Drive file in that history row (a plain error when the row has no file or Drive refuses).
- `PP_modelFromPublished(doc, currentModel, todayIso)` turns its `survey`, `strings`, `whats_changed` and `clips` back into a model (through `PP_importStatic`, so a graph version becomes rows with `PP.flowPanel.toRows`, and one the panel can't show is refused with nothing changed, section 8). `todayIso` is optional: it dates notes, today in India by default.
- **Kept from the current draft:**
  - the rounds (the Rounds tab is not even rewritten);
  - the `form_url` setting, and any setting that is not in the document;
  - the translators' notes of texts that still exist;
  - everything the draft has that the version lacks: languages, areas, problems, support items and screens (hidden built-in screens too).

  These items come back **switched off**, right after the item they follow in the draft. They bring their texts (the version's wording wins where it has the text) and their recordings, and a returning language keeps its translations.
  - A kept translation made for different English gets the note "English changed on <date>: please re-check the translations."
  - A built-in kind of screen the version already has is not added twice; thank-you screens are the exception (the draft's other endings are kept, hidden). A kept screen doesn't end up below the main thank-you screen, unless it belongs to another route there (an ending, or a row some jump or "usually go to" points at), which stays where it was (`PP_mdlOnceOnly_`, `PP_mdlThanksLast_`).
  - Nothing comes back switched on, so partners see exactly the restored version until someone switches something on and publishes.
- **Not kept:** the draft's "What changed" bullets. They are replaced by the version's, and rounds the version didn't have lose their bullets. Whether to keep them is open question 12 in [spec.md §6](spec.md#6-open-questions) **[UNCONFIRMED]**.
- A hidden area that comes back brings all its problems back switched off as well: switching the area on later means switching its problems on too.
- It writes the content sections into the tabs as the new draft and bumps the revision.
- It does **not** publish: the admin reviews, then publishes.

**Draft revision:**

- `_meta.draft_revision` goes up by 1 on every save of the draft: `panelSave`, `panelRestore`, `panelImport` (and set-up's import) and `panelSetFormUrl`. Each save also records `last_saved_by` and `last_saved_at`, and clears the cached preview draft.
- `panelSave` and `panelPublish` take the base revision the panel started from. If it is out of date they are refused with a "someone else saved changes" conflict.

## 11. Rounds and data spreadsheets

**Status:**

- `draft`: links don't work yet ("not open yet"), Preview works.
- `open`: partners can answer.
- `closed`: new visitors see "This survey has closed"; answers from partners already in the middle are still accepted and flagged `late = TRUE` (their pings are still stored too).
- **A round the backend has never seen** (no Script Property `ROUND:<id>`) counts internally as `unknown`. The bootstrap reports it as `draft`, and pings and submissions for it get `round_not_open`.
- Every round saved in the draft gets a `ROUND:<id>` record with status `draft` straight away (`PP_settleRounds_`). The status itself changes only through `panelSetRoundStatus`: what the panel sends in `rounds` never changes it, and a round that already collects answers is never dropped from the Rounds tab.

**`PP_ensureRoundStore(roundId)`** runs when a round is first opened, or lazily on a partner's first ping or submission for an open or closed round that has no store yet. **Its callers always hold the script lock** (section 20), so the store can never be created twice:

- the panel through `PP_withStoreLock_` (waiting up to 30 s);
- a partner's message through `PP_openRoundStore_` (waiting up to 8 s, else "busy, try again").

What it does:

- It creates only what is missing: the Drive folder `rounds/<round_id>/`, an `audio/` sub-folder, and a spreadsheet named `Valmo Partner Pulse - data - <round_id>` with the tabs below.
  - An existing folder with that name is reused.
  - The spreadsheet file is moved into the round folder (`DriveApp.getFileById(id).moveTo(folder)`).
- Each data tab is made **exactly as wide as its columns** (`deleteColumns` / `insertColumnsAfter` on a new 26-column tab). Google counts every cell of a tab, even empty ones, against the 10 million cell limit, so exact widths keep a 10,000-partner round near 3.5 million cells. The starter tab of the new spreadsheet is deleted.
- Anything a co-admin creates here is handed to the owner (section 13). The spreadsheet is handed over last, once it is complete.
- It saves `{ status, sheet_id, audio_folder_id }` in Script Property `ROUND:<round_id>` (refreshing the cached copy at once) and writes the URLs into the Rounds tab.
- When Google can't create the spreadsheet, it stops with "Google could not create the data spreadsheet for round … The round was not opened. Try again in a minute".

The round status that `doGet`/`doPost` need is read from Script Properties `ROUND:<id>` and cached for 60 s. `panelSetRoundStatus` updates both.

### When codes lock (`codes_locked`)

Codes are what partners' answers are stored under: question (screen) ids, area ids, problem (chip) codes, support item codes and answer option codes. Renaming or deleting one after partners answered would break the comparison between rounds.

- **Before the first real round opens, nothing is locked.** No partner can have answered yet, so the placeholder questionnaire can be replaced freely:
  - `panelLoad` returns `codes_locked: false` and empty `live_ids`;
  - the panel lets admins delete or re-code anything, apart from the protections below;
  - the checks give no "live code is missing" warnings (`PP_liveDocForChecks_()` is `null`).
- **They lock for good the first time a real round is opened** with `panelSetRoundStatus(id, 'open')`: Script Property `ROUNDS_EVER_OPENED` = `"1"`.
  - Nothing in the code ever clears it.
  - `PP_codesLocked_()` is also true while any real round has the status `open` or `closed` in Script Properties (this covers rounds opened before the property existed). `panelSetRoundStatus` then records the property too, so the codes stay locked even if that round goes back to draft.
- **Test rounds never lock the codes** (Pranav's decision, 21 Oct 2026):
  - A test round is one whose id **starts with** `SMOKE`, `DEMO` or `TEST`, in capitals or not, for example `SMOKE-R1`, which the setup guide's smoke test opens. Code.gs checks this with `PP_isTestRound_`, and the panel's `isTestRound` uses the same rule.
  - Only fake DCs answer test rounds. Their links must never go to real partners.
  - An id that merely *contains* DEMO elsewhere, such as `2026-DEMO`, is not a test round: opening it locks the codes, and still needs `confirmDemo`.
- **Once codes are locked,** `live_ids` lists the codes of the live version **plus every code in `CODES_EVER_LIVE`** (`PP_liveIds(doc, everLive)`), and the panel shows them read-only:
  - items with those codes can be hidden but not deleted, and their codes can't be changed; a live **answer option** of a pick-one question can't be removed at all (options have no hide), and its label can still be reworded. For questions this is the route table's Check (Questions > Paste a route): a table that leaves out a live question or a live answer, changes its code, or (since 27 Oct 2026) gives a live question another kind, is refused;
  - the checks refuse a code partners answered that is gone from the draft, and a live question whose kind changed, and warn about a code only live today (section 9).
- **`CODES_EVER_LIVE`** (Script Property, since 23 Oct 2026; qualified since 26 Oct): on every Publish once codes are locked, `PP_recordCodesEverLive_` adds every code of the version that was live and of the new one, as qualified entries (`PP_mdlCodesOfDoc_`): `screen:<id>`, `area:<id>`, `chip:<area>/<code>`, `support:<code>`, `option:<question>/<code>`. Nothing removes an entry. This closes the old hide-and-publish hole: a question hidden, published, then deleted is still locked. `PP_mdlCheckLiveCodes_` decides the lock on these entries kind by kind (section 9). Past about 9,000 characters the list can't grow (Publish warns from 8,000).
- **`live_ids_unknown`** covers codes that are locked while the live version can't be read:
  - It is `true` when codes are locked and a version is live (`LIVE_VERSION` > 0), but the live document couldn't be read, for example because of a passing Google Drive problem. `live_ids` is then empty.
  - The panel then treats every code in the draft as live, and says so, until it can read the live version.
  - When Drive refuses the person outright, `panelLoad` stops with the "share the Drive folder" error instead (section 13).
- **Always protected, locked or not:**
  - The panel never deletes the screens with the ids `nps` and `support_gate`, and never changes their codes; they can be hidden (Pranav's decision, 21 Oct 2026). Their answers fill the `nps` and `support_contacted` columns of every round's `responses` tab, and the dashboard's headline score reads `nps`. `PP_validate` refuses a draft where either is missing anyway, and warns while one is hidden (section 9).
  - Built-in screens can't be deleted.
  - The main thank-you screen (the first "thank you" row of the route table) must stay shown: the route table's Check and Publish refuse it hidden. An extra ending (an "ending" row below it) can be hidden: it still ends its route, at the main thank-you screen, and the Check says so in a warning.
- **Known gaps:**
  - ~~A code that is hidden and then published could be deleted afterwards~~: closed on 23–26 Oct 2026 by `CODES_EVER_LIVE`.
  - A code that is only live today (not yet in `CODES_EVER_LIVE`, for example before the first Publish after codes locked) is only a **warning** when deleted, as in Phase 2. That Publish then records it (it records the previous live version's codes too), so the next Publish is refused until it is back. Whether such codes should be errors at once is Pranav's call **[UNCONFIRMED]**.
  - When a round is opened while nothing is published, partners answer the form's own copy, but nothing shows as locked because nothing is live.

### What a round's data spreadsheet holds

**Data spreadsheet tabs:**

- Row 1 holds the headers (frozen).
- Each submission writes **one `setValues` per tab**, in this order: `events`, `free_text`, `function_ratings`, then `responses` last. When a tab is too short, rows are added first (as many as needed, plus 500 spare).
- Pings are added with `appendRow`, to the tab `PP_pingsTab_` gives (below).
- Times are ISO UTC strings, exactly as received, plus `received_at`.
- Text cells get a leading apostrophe (section 3). A value longer than 49,000 characters is cut and ends with " [cut: too long]".
- A data tab that someone deleted is created again on the next write.

| Tab | Columns |
|---|---|
| `responses` | received_at, submission_id, dc, round, lang, nps, support_contacted, late, token_valid, dc_round_seen_before, opened_at, started_at, submitted_at, sent_at, attempt, resume_count, config_version, app_version, mode, session_id, client_net, client_ua, client_viewport, client_tz_offset_min, voice_supported, voice_denied, tts_voice, answers_json, events_count |
| `function_ratings` | received_at, submission_id, dc, round, block, item, rating, not_applicable, threshold, below_threshold, issue_code |
| `free_text` | received_at, submission_id, dc, round, lang, item_id, block, function, issue_code, question_key, text, audio_url, audio_file_id, audio_mime, audio_duration_s, audio_bytes, transcript, transcript_lang, transcribed_at, cls_function, cls_issue_code, cls_severity, cls_sentiment, cls_summary_en, cls_confidence, cls_unmapped, cls_new_theme_label, cls_provider, classified_at |
| `events` | received_at, submission_id, session_id, dc, round, seq, screen, at |
| `pings` | received_at, stage, dc, round, session_id, lang, screen, step_index, step_total, at, token_valid, mode, client_net, events_json, config_version |

**Column notes:**

- `nps` = `answers.nps` and `support_contacted` = `answers.support_gate`: they depend on those two screen codes (protected, above).
- `dc_round_seen_before` = this DC already had a stored submission in this round.
- `answers_json` = `JSON.stringify(answers)`.
- `events_count` = the number of events.
- `pings.config_version` (the last column since 26 Oct 2026, flow-graph stage 6, Pranav's decision 11) = the questionnaire version the phone showed when it sent the ping (a published `p<N>-…` or the form's own copy's), so drop-off per screen can be read against the right screens ([flow-engine.md](flow-engine.md) §6, `screens --published`). New round spreadsheets have it from the start. **A spreadsheet made before that day** gets it from its first ping after the update (Code.gs `PP_pingsTab_` → `PP_addPingVersionColumn_`): a NEW column inserted right after `events_json`, header in the header style, under the script lock (8 s at most), checked again inside the lock so two pings never add it twice; an admin's own column there moves one place right with its values intact; rows stored before stay empty. If the column can't be added at that moment (the lock stays busy, or Google refuses), the ping is still stored, cut to the first 14 columns: a ping is never refused or lost for this. Once the column is there, the cache key `pingcols:<spreadsheet id>` (section 18) means a normal ping reads nothing extra and takes no lock. No length limit was added for the value: it is bounded by the 60,000-character ping limit and the cell limit.
- The `transcript` and `cls_*` columns stay empty; Phase 3 fills them.

**Which rows belong to a stored submission.** The `responses` row is written last, and resends are recognised in `responses` only. If something fails after the other tabs were written, the phone sends again, and the whole submission is written again with a new `received_at`; the first attempt's rows stay in `events`, `free_text` and `function_ratings`. So a submission's rows in those three tabs are the ones with its `submission_id` **and** the same `received_at` as its `responses` row.

**Voice notes** are files in `rounds/<round>/audio/`:

- **Names:** `<dc>__<submission_id>__<item_id with ":" turned into "-">.<webm|ogg|m4a|bin>`. Other characters outside `A-Z a-z 0-9 _ . -` in the item id become `_`, and a second note with the same name gets `-2`, `-3` and so on.
- **The extension** comes from the recording's format: `.webm`, `.ogg`, `.m4a`, otherwise `.bin`.
- **Links and sharing:** the `audio_url` column holds the file's Drive URL. Files keep their default (private) sharing. When the web app runs as someone other than the owner, each file is handed to the owner (section 13).
- **Saved before the lock.** A voice note is saved before its submission takes the lock (section 12). So the folder can hold files that no stored submission uses:
  - from an attempt answered "busy";
  - from two copies of one submission arriving at the same moment;
  - from a submission that finds its DC already at the limit of 10 only once it gets its turn;
  - from a failed attempt (any `free_text` rows it left behind point to them).

## 12. Public web API (`doGet` / `doPost` in Code.gs)

It follows [submission-format.md](submission-format.md):

- `text/plain` JSON bodies (so the browser sends no CORS preflight);
- always HTTP 200 with JSON `{ ok: ... }` (`ContentService.createTextOutput(...).setMimeType(ContentService.MimeType.JSON)`), never a web page;
- the same message checks, with the same plain-English messages, as `scripts/mock_server.py` (the differences are in section 16);
- the same token formula (section 17);
- de-duplication by `submission_id`.

**Meesho-only mode (21 Oct 2026).** While the web app is open only to people signed in with a company account ("Anyone within <domain>", `WEB_APP_ACCESS` = `domain`, section 13), the form on GitHub Pages can't use it, because it never sends a Google login with `fetch()`. So:

- **`doGet` without `action`, but with `dc`, `round` or `preview`,** returns the survey page itself (`PP_wantsFormPage_`, `PP_formPage_`): an `HtmlService` page built from the form's `index.html`, fetched from the form address (`form_url`) and cached 10 minutes. Every relative `src`/`href` is made absolute on the form address, and `window.PP_EMBED = { base, params }` is put first in `<head>`. `params` holds only `dc`, `t`, `round`, `lang`, `preview` and `pk` (each at most 200 characters), and the JSON is escaped (`<`, U+2028, U+2029) so it can't end the script. If the form's page can't be fetched, a short "try again in a minute" page is returned. Every other GET still answers JSON as before.
- **`?action=health` also answers `form_page: true`**, so the panel can tell today's code from a deployment that still runs older code.
- **The page knows its own address** (`PP_EMBED.page`: the recorded web app address plus the link's details), because reloading Google's inner frame shows a blank page: the form's "Start again" (preview) and "Retry" open that address in the whole window instead (`reloadPage` in app.js).
- **`ppFormRequest(kind, payload)`** (public, no admin rights) answers that page through `google.script.run`: `"bootstrap"` with `{ round, draft, pk }` gives the same answer as `GET ?action=bootstrap`, and `"post"` with the message text gives the same answer as `doPost`. Anything else gets `bad_request`.
- **The form** (`web/js`) notices `PP_EMBED` (`net.embedded()`): it reads the link from `PP_EMBED.params`, loads its own files from `PP_EMBED.base` (`PP.assetUrl`), sends everything through `ppFormRequest`, and has no `sendBeacon` (a best-effort send instead).
- Because a page the web app serves can call every public server function, all admin functions check their caller (section 19).

Any unexpected problem is answered `{ ok: false, error: "server_error", message: "The server had a temporary problem. Nothing was lost on the phone; please send again." }`. An unknown or missing `action` gets `bad_request`.

Live specifics:

**`GET ?action=health`**

```js
{ ok: true, service: "valmo-partner-pulse", mode: "live", time, live_version, runs_as_owner,
  form_page: true, flow_engine, flow_fingerprint }
```

`live_version` is a number, or `null` when nothing is published. `runs_as_owner` is `true` when the web app runs as `OWNER_EMAIL`, so the files it creates land in the owner's Drive. The email itself is never sent: this answer is public. `flow_engine` (2) and `flow_fingerprint` (the SHA-256 of the route files in `Flow.gs`, `PP_FLOW_FINGERPRINT_`) say which route code the deployment runs; both are `null` without `Flow.gs` (since 23 Oct 2026).

**`GET ?action=bootstrap&round=<id>[&draft=1&pk=<key>]`**

```js
{
  ok: true,
  draft: false,
  round: { id, status: "draft" | "open" | "closed" },   // a round id the backend has never seen is reported as "draft"
  version: 7,
  config_version: "p7-2026-10-21",
  survey: {...},
  strings: {...},
  whats_changed: { title: null, items: [...] },   // that round's block, or { title: null, items: [] }
  clips: {...}
}
```

- A missing or invalid round id: `bad_request`.
- With nothing published: `{ ok: false, error: "not_published" }`.
- `draft=1` compiles the saved tabs on the fly, with `draft: true`, `version: null` and `config_version: "draft"`. It is for Preview.
  - The web app finds the control Sheet through `CONTROL_SHEET_ID`.
  - The compiled draft is **kept in the script cache for 30 seconds** (`draft:k` and `draft:<i>`), so a widely shared preview link can't make the script re-read the whole Sheet on every visit.
  - Every save of the draft clears it, so admins see their edits at once.
- **`draft=1` also needs `&pk=<preview key>`.** This is Script Property `PREVIEW_KEY`, created by set-up and put into every preview link by `panelPreviewUrl`.
  - Without the right key the answer is `{ ok: false, error: "bad_preview_key" }`. So nobody who merely knows the web app address can read the unpublished draft or make the script re-read the whole Sheet.
- This call needs no token: the questionnaire is not secret.

**`GET ?action=whats_changed&round=<id>`** returns the live `{ ok, round, title, items }`, kept for compatibility.

**`POST kind=ping`** (`PP_handlePing_`), in this order:

1. **Check the message.** It needs:
   - `stage` = `opened`, `started` or `progress`;
   - `dc` and `round` as for submit;
   - `session_id`, `lang`, `screen`, `at`, `mode` and `stage` at most 64, 8, 80, 40, 10 and 10 characters;
   - `events` (if sent) a list of at most 400;
   - the whole ping at most 60,000 characters.

   Otherwise `bad_request`.
2. **The token** is checked strictly. A bad one gets `{ ok: false, error: "bad_token" }` and is not stored.
3. **The round** must be `open` or `closed`. Otherwise the answer is `{ ok: false, error: "round_not_open" }` and nothing is stored.
4. **Rate limit:** more than 60 pings per dc+round in 10 minutes are answered `{ ok: true }` but not stored.
   - The counter is the cache key `pc:<dc>:<round>` = "count|start time".
   - The 10-minute window does not restart with every ping.
   - If the cache fails, the ping is stored anyway.
5. **Store it:** open the round's store, creating it if needed (section 11; busy → "busy, try again"). Then `PP_pingsTab_` makes sure the `pings` tab has its `config_version` column (section 11: normally a cache look-up only), and `appendRow` adds the ping, with `config_version` last.
6. **Answer:**
   - for `opened`: `{ ok: true, token_valid: true, already_submitted, round_status }`, where `already_submitted` = the dc is found in that round's `responses` dc column (TextFinder on that column, then an exact, case-sensitive comparison);
   - for the other stages: `{ ok: true }`.

**`POST kind=submit`** (`PP_handleSubmit_`), in this order:

1. **Check the message** (`PP_checkSubmit_`). Otherwise `bad_request`. It needs:
   - `schema_version` = the number 1;
   - `submission_id` matching `^[A-Za-z0-9_-]{1,64}$`;
   - `dc` and `round` matching `^[A-Za-z0-9_.-]{1,64}$` (and not `.` or `..`);
   - `lang` as text;
   - `answers` an object with at most 100 entries;
   - `ratings`, `free_text` and `events` lists of at most 64, 64 and 400 items;
   - each `free_text` item an object whose `audio` is `null` or an object;
   - the message without its recordings at most 200,000 characters.
2. **Check the token.** A bad one gets `bad_token`. A missing `LINK_SECRET` is a set-up problem, not a bad link, so it gives `server_error`.
3. **Check the round.** A `draft` or never-seen round gets `round_not_open`; a `closed` one is accepted with `late = TRUE`.
4. **Decode the voice notes**, only now that the link and the round are genuine. Otherwise `bad_request`. Each one needs:
   - an `item_id`;
   - standard base64: only base64 letters, `=` only as the final padding, a length that is a multiple of 4;
   - at most 5 MB after decoding.
5. **Short-term memory:** if the cache key `sub:<submission_id>` exists, answer as a duplicate with the `received_at` it holds.
6. **Open the round's store**, creating it if needed (section 11; busy → "busy, try again").
7. **When there are voice notes,** take a quick look at `responses` without the lock, so their recordings are not saved again. A resend that is already stored is answered as a duplicate. A DC that already has 10 stored submissions is answered as in step 10 and nothing is stored.
8. **Save the voice notes** to Drive (section 11), before taking the lock: it is by far the slowest step.
9. **Take `LockService.getScriptLock().tryLock(8000)`.** If that fails, answer `{ ok: false, error: "server_error", message: "busy, try again" }`; the form retries.
10. **Under the lock:**
    - check the cache again;
    - search `responses`, looking only at its `submission_id` and `dc` columns (TextFinder on that one column, then an exact comparison). An earlier copy gets `{ ok: true, submission_id, duplicate: true, received_at }` with its original `received_at`. **10 or more stored submissions from this DC in this round** get the same answer with the current time as `received_at`, and nothing is stored (it is logged), so the phone stops sending;
    - otherwise set `dc_round_seen_before`, read where each tab ends, and write the rows (section 11: `events`, `free_text`, `function_ratings`, then `responses`);
    - `SpreadsheetApp.flush()`;
    - cache `sub:<id>` = `received_at` for 15 minutes. The cache keeps only about 1,000 items, so the `responses` tab is the real duplicate check.
11. **Release the lock** and answer `{ ok: true, submission_id, duplicate: false, received_at }`.

**Size limit:** 25 MB per POST, voice notes included. A larger body gets `bad_request` (HTTP 200).

## 13. Control panel: the server API (`PanelServer.gs`, called via `google.script.run`)

All functions run as the admin using the Sheet. Each one returns plain objects (no `Date` objects: use ISO strings). On an error the function **throws** `new Error("<plain English>")`, and the panel shows it. Every function except `panelOpen` runs its work inside `PP_forPanel_`, which turns Google's permission errors into the plain advice below. The functions that read the Sheet first check that set-up created the main tabs (Settings, Screens, Texts, Rounds, `_meta`); otherwise they stop with "run Partner Pulse > Set up or repair".

| Function | Returns / does |
|---|---|
| `panelOpen()` | Called by the menu items that open the panel. First `PP_requireAllPermissions_()` (permissions, below), then shows the dialog: `HtmlService.createHtmlOutputFromFile('Panel')` at 1100×760, title "Partner Pulse control panel". The panel then shrinks itself on a small screen (section 14). |
| `panelLoad()` | `{ revision, model, catalog: { settings_schema, screen_types, form_text_keys }, live, live_ids, live_ids_unknown, codes_locked, draft_differs_from_live, user, spreadsheet_url, folder_url, web_app_url, web_app_url_recorded, dc_count, active_dc_count, open_section }`. Details below the table. |
| `panelSave(baseRevision, model)` | Saves all sections, under the admin lock. A model without its main parts (settings and texts objects, the lists) is refused, with nothing changed. Returns `{ ok: true, revision, draft_differs_from_live }`, or `{ ok: false, conflict: true, revision, saved_by, saved_at }` when the base revision is out of date. Before writing it tidies the model (`PP_normalizeModel`), applies the translation helpers (below) and settles the rounds (section 11). |
| `panelValidate(model)` | `PP_validate(the tidied model, PP_liveDocForChecks_(), PP_codesEverLiveForChecks_())`. The panel sends its in-memory model for "Check for problems", when it opens on Publish with nothing unsaved, and in Publish (after saving, before `panelPublish`). A plain Save doesn't run these checks. |
| `panelPublish(baseRevision, note)` | Publishes the **saved** draft (the panel saves first), under the admin lock (section 10). Returns `{ ok: true, version, config_version }` plus `warnings` when there are any (the panel shows them under "Please check…"), or `{ ok: false, errors }` (the checks, or the publish guard's refusal), or a conflict like `panelSave`. While codes are locked and Drive can't read the live version it throws "Nothing was published … Try again in a minute". |
| `panelHistory()` | `[ { version, config_version, published_at, published_by, note, live, file } ]`, newest first. |
| `panelRestore(version)` | `{ ok: true, revision }` (section 10), under the admin lock. |
| `panelSetRoundStatus(roundId, status, confirmDemo)` | Opens, closes or re-opens a round, or puts it back to draft. It refuses an unknown status, a round that isn't in the Rounds tab, an id that doesn't match `^[A-Za-z0-9_.-]{1,64}$`, **opening** a round whose name doesn't match the checks' rule `^[A-Za-z0-9_-]{1,64}$` (`PP_SRV.ROUND_RULE`, no dots: an open round is never dropped from the Rounds tab, so a name the checks refuse would block every Publish; 21 Oct), and opening a round whose id contains DEMO unless `confirmDemo` is `true`. Under the admin lock it also takes the script lock for a moment (`PP_withStoreLock_`, up to 30 s; busy → "Many partners' answers are being saved right now, so the round could not be changed. Nothing was changed."). It creates the round store on the first `open`, saves `ROUND:<id>` and writes the status into the Rounds tab. It records `ROUNDS_EVER_OPENED` when a real round opened, or when codes were already locked (section 11). Returns `{ ok: true, round }`, the round's row as in the Rounds tab. |
| `panelRoundCounts(roundId)` | `{ links, opened, started, submitted, by_lang: { hi: n, ... }, last_submission_at }`: distinct dcs per stage, from the round's `pings` and `responses` tabs and the Links tab. A dc that submitted also counts as opened and started. `by_lang` counts each dc once, in the language of its latest submission. Before the round has a store: `{ links: n, opened: 0, started: 0, submitted: 0, by_lang: {}, last_submission_at: null }`. |
| `panelGenerateLinks(roundId, options)` | Details below the table. Returns `{ ok: true, created, updated, kept, skipped: [ { dc_id, reason } ], csv }`. |
| `panelPreviewUrl(roundId)` | `{ url: form_url + "?preview=1&dc=DC-PREVIEW&round=" + enc(roundId) + "&lang=" + enc(default_language) + "&pk=" + enc(preview key) }`. The preview key is created the first time if set-up hasn't made one. |
| `panelNewPreviewKey()` | Replaces `PREVIEW_KEY` (under the admin lock), so every preview link made before stops working. For a preview link that was shared too widely. Returns `{ ok: true }`. |
| `panelGetSecret(confirm)` | Returns `{ secret }` only when `confirm === "SHOW"`; the panel asks the admin to type SHOW. It is for `scripts/generate_links.py`. |
| `panelImport(baseUrl)` | Fetches the four repo files (section 8) and writes them as the new draft, under the admin lock. A graph `flow` becomes rows through `PP.flowPanel.toRows`; one the panel can't show is refused, with nothing changed. Rounds that already exist keep their status, data links and notes; the form address is kept. Returns `{ ok: true, revision, counts: { texts, screens, areas, chips } }`. |
| `panelExport()` | The five files of the GitHub copy (the four repo files and `flow.md`, which goes to `docs/flow.md`), made from the **saved** draft. Details below the table. |
| `panelSetFormUrl(url)` | Saves the `form_url` setting (https://, without spaces, quotes, `?` or `#`; a final `/` is added), under the admin lock. Returns `{ ok: true, form_url, revision }`. The panel doesn't use it today (it edits `form_url` in Settings); removing it is on STATE.md's "Later" list. |
| `panelSetWebAppUrl(url)` | Records the web app's public address in Script Property `WEB_APP_URL`, after checking it, and how it may be opened in `WEB_APP_ACCESS` (`anyone` or `domain`). Details below the table. Returns `{ ok: true, web_app_url, web_app_access }`. |
| `panelFlowCode()` | The route code for the panel window (since 26 Oct 2026): `{ source: PP_FLOW_SOURCE_, fingerprint: PP_FLOW_FINGERPRINT_ }` from Flow.gs, the text of the form's `web/js/flow.js`, `flow-panel.js` and `flow-check.js` (public code, the same GitHub Pages serves to phones). The window runs it once with a private root (section 14). Without Flow.gs it throws `PP_FLOW_MISSING_` (how to add the Flow file); the panel then works without the route tools. |
| `panelFlowStatus(formUrl)` | Does the form at `formUrl` (the form address as the window shows it, Settings > `form_url`; not read from the Sheet, so opening stays fast) run the same route code? It reads `<formUrl>js/flow.js`, `js/flow-panel.js` and `js/flow-check.js` as text (`PP_FLOW_FILES_`, never run), hashes their UTF-8 bytes one after the other with its own SHA-256 (`PP_utf8Bytes_`, `PP_sha256Hex_`, FIPS 180-4; `Utilities.computeDigest` is not on the allowed list) and compares with `PP_FLOW_FINGERPRINT_`. Returns `{ panel, form, same, form_url, checked_at, problem }`; `same` is `null` when the form can't be reached or the address is not valid (the panel then shows nothing). A missing `flow-panel.js` or `flow-check.js` next to a `flow.js` counts as an older form (they differ). Remembered for 10 minutes (cache `form_flow_fp:<address>`). The Home banner uses it. |
| `panelLiveSurvey()` | The live version's questionnaire, for the Map of what partners see now: `{ live: { version, config_version }, survey, strings }`, or `{ live: null }` when nothing is published. |
| `panelRouteTable(request)` | "Paste a route" when the panel window can't run the route code itself (since 27 Oct 2026; [flow-engine.md](flow-engine.md) §9.8.5). It runs the same tools of Flow.gs here, `PP.flowPanel.fromTable`, `toTable`, `templateCsv` and `aiInstruction`, taught the kinds added in `web/js/types/` (`PP_mdlFlowLib_`), with exactly the arguments the window would use (`PP_routeTableArgs_`; Panel.html `tableArgs` makes the same lists from the same request). `request = { tool, text, survey, strings, rows, live_codes, live_kinds, rounds }`: `tool` is `status`, `fromTable` (Check, and Use this route, which checks once more), `toTable` (Copy the current route), `templateCsv` (the Excel template) or `aiInstruction`; `text` only for `fromTable`, at most 300,000 characters (`PP_ROUTE_TABLE_MAX_CHARS_`, the same limit as the window's; longer: a plain "too long to check" message). Answers `{ ok: true, tables: true/false }` for `status` (false: a Flow.gs from before 27 Oct 2026, which has no route table), else `{ ok: true, result }`. With such an old Flow.gs it throws `PP_FLOW_NO_TABLE_` ("paste the latest Flow.gs"), without Flow.gs `PP_FLOW_MISSING_`. It reads and writes nothing: "Use this route" changes only the window's copy of the draft, until Save. |

**`panelLoad` in detail:**

- **`live`:** `{ version, config_version, published_at, published_by, note }` of the live version, or `null` when nothing is published. When the live document can't be read, these come from its Publish history row.
- **`live_ids`:** `{ screens: [ids], areas: [ids], chips: { area: [codes] }, support: [codes], options: { screen: [codes] }, kinds: { id: type } }`, from the live document **and `CODES_EVER_LIVE`** (`PP_liveIds(doc, everLive)`, in `PP_liveIdsOf_`), but **only once codes are locked**; until then every list is empty. `kinds` (since 27 Oct 2026) is the kind of each screen of the live version as the Screens tab names it (`{ one_fix: "free_text" }`), from Model.gs `PP_mdlLiveKinds_` (`{}` with a Model.gs older than that): the route table's Check gets it as `liveKinds`, so a question partners answered keeps its kind, exactly as Publish requires (section 9). **`codes_locked`** and **`live_ids_unknown`** are explained in section 11 (with `live_ids_unknown` the window locks every code of the draft, with the draft's kinds).
- **`catalog.screen_types`** is `PP_SCREEN_TYPES` (section 6), generated from the form's catalogue; a kind added in `web/js/types/` carries its whole description as `catalogue`.
- **`draft_differs_from_live`:** `PP_compileForCompare` of the saved draft and the live version differ (section 7). It is `true` when nothing is live or the comparison failed.
- **`web_app_url`** is the recorded `WEB_APP_URL` (`""` until someone records it); **`web_app_url_recorded`** is `true` when there is one; **`web_app_access`** is `"anyone"`, `"domain"` (Meesho-only mode) or `""` (none recorded).
- **`folder_url`** is `""` when set-up hasn't run or the folder can't be opened.
- **`open_section`** is a one-time hint (User Property `panel_section`, cleared after reading) set by menu items such as "Publish…".
- When Google Drive refuses this person the live version (it isn't in the cache any more and they were never given the folder), `panelLoad` **stops** with the "ask the owner to share the Drive folder" error, instead of opening as if nothing were published.

**`panelGenerateLinks(roundId, options)` in detail:**

- `options` = `{ only_missing: true }` (the default). With `only_missing: false` every link is made again; the same secret gives the same link, so links already sent keep working.
- It needs a round that is in the Rounds tab with a valid id, a valid `form_url` and the link secret. It runs under the admin lock.
- For each **active** row in DCs (an empty `active` cell counts as active), a DC is skipped, with a plain-English reason, when:
  - its `dc_id` cell holds a number or a date (Google Sheets changed what was typed): "Type the id as text…";
  - the `dc_id` doesn't match `^[A-Za-z0-9_.-]{1,64}$`;
  - the `dc_id` appeared in an earlier row (only its first row gets a link).
- A language that is not an active language is left out of the link (not refused).
- Each link is `form_url + "?dc=" + enc(dc) + "&t=" + token + "&round=" + enc(round) + (lang ? "&lang=" + lang : "")`.
- The row is upserted into Links, keyed by round_id + dc_id, with `generated_at` and `generated_by`. `kept` counts DCs whose existing link was left as it was (`only_missing`).
- `csv` has the columns `dc_id, dc_name, state, region, language, link` and lists every active DC that has a link now. A cell starting with `=`, `+`, `-`, `@`, a tab or a line break gets a leading `'`, so it can't run as a formula in Excel or Google Sheets.

**`panelExport()` in detail:**

- It returns `{ files: PP_exportStatic(saved draft, { apps_script_url, config_version }) }`, five files (section 8; `flow.md` since 26 Oct 2026, review finding 10):
  - `apps_script_url` is the recorded `WEB_APP_URL` (`""` when none);
  - `config_version` is the live version's, but only when the saved draft equals the live version (so answers sent while the form uses this backup copy still say which questionnaire it was).
- With no web app address recorded, `survey.json` keeps the form in test mode (`"mock"`, section 8). The answer then also has a **`warning`**: deploy the web app, paste its address into Home > Quick links or Settings, click Check and save, then prepare the files again.
- When Drive refuses the person the live version, it stops with the "share the Drive folder" error.

**`panelSetWebAppUrl(url)` in detail:**

- **The address must be a web app address ending in `/exec`:** `https://script.google.com/macros/s/<id>/exec`.
  - The company forms `…/a/macros/<domain>/s/<id>/exec` and the older `…/a/<domain>/macros/s/<id>/exec` are turned into the plain form. Partners aren't signed in to the company account, so only the plain one works for them.
  - A `/dev` address (editors only) and a `googleusercontent.com` address (where Google forwards to) are refused with an explanation, and so is anything after `/exec`.
- **Then it asks the address for `?action=health`, as a partner's phone would:** `UrlFetchApp.fetch(url + '?action=health', { muteHttpExceptions: true, followRedirects: true })`. The answer must be JSON with `ok: true` and `service: "valmo-partner-pulse"`. Otherwise it stops with a plain error:
  - 404: no web app at that address;
  - 401, 403 or Google's sign-in page: it asks again, signed in as the person using the panel (`Authorization: Bearer` + `ScriptApp.getOAuthToken()`; only ever sent to the `script.google.com` address above). If Partner Pulse answers then, and its health answer has `form_page: true` (today's code, which can serve the survey page), the address is recorded with `WEB_APP_ACCESS` = `domain` (Meesho-only mode, section 12). An answer without `form_page` means the deployment still runs older code: refused, with the fix (Manage deployments > Edit > Version: New version). If the signed-in check doesn't get Partner Pulse's answer, the message says so and explains both ways to deploy. That check can't tell "Anyone within <domain>" from "Only myself", so the panel's message asks the admin to check it. Otherwise: "Who has access" isn't "Anyone";
  - another code: try again in a minute;
  - an answer that isn't Partner Pulse's: the wrong project, or a deployment that wasn't updated to the new code.
- **Then it saves `WEB_APP_URL`** (one Script Property, without the admin lock).
- **Who uses the recorded address:** `panelLoad` (shown in the panel), `panelExport` (the GitHub copy) and set-up's closing message. Links and Preview use `form_url`, except in Meesho-only mode (`WEB_APP_ACCESS` = `domain`), when they use the web app's address (`PP_linkBaseUrl_`) and `panelExport` keeps `survey.json` in test mode with a warning. Checks don't use it. Google's own `ScriptApp.getService().getUrl()` is never used.

**The translation helpers** (`PP_applyTranslationHelpers(oldModel, newModel, todayIso)`, applied by `panelSave`; old = the draft as saved before):

- a language value that is empty for a key with English becomes `"[TRANSLATE] " + en`;
- a value that still starts with `[TRANSLATE]` is updated to the current English;
- when English changed and a real translation exists, `text_notes[key]` = `"English changed on <date>: please re-check the translations."` (any other note is kept after it);
- the "What changed" bullets get the same `[TRANSLATE]` help (they have no notes).

**Menu (`onOpen`), "Partner Pulse":**

- Open control panel
- Preview the draft form
- Publish…
- Generate links…
- (separator)
- Share the Drive folder with all editors
- Set up or repair
- Help

`onOpen` only adds the menu. Every menu function first calls `PP_requireAllPermissions_()` (permissions, below). Then:

- "Open control panel", "Publish…" and "Generate links…" leave the one-time note `panel_section` (`home`, `publish`, `links`) and open the panel.
- "Preview the draft form" shows a small dialog with the preview link of the first open round (else the first draft round, else the first round), from `panelPreviewUrl`. With no round it asks for one to be added and saved first.
- "Share the Drive folder with all editors" runs `ppShareFolder()`. It gives every editor of the Sheet edit access to the "Valmo Partner Pulse" folder (published versions, round data, voice notes), which co-admins need for Publish, Rounds, counts and the GitHub copy. Run it after adding someone to the Sheet. Only someone who can already edit the folder (normally the owner) can share it.
- "Set up or repair" runs `ppSetup()` (below).
- "Help" shows links to the guides on GitHub.

**Set up or repair (`ppSetup`)** never deletes content and is safe to run again:

1. It creates missing tabs. It repairs headers, colours, tick boxes, drop-down lists, header notes and the plain-text `dc_id` column. It deletes nothing but an empty starter tab such as "Sheet1".
2. It records `OWNER_EMAIL` the first time.
3. It creates missing Drive folders. Only set-up, run by the owner, may replace a folder that was deleted (below).
4. It creates `LINK_SECRET` once, and `PREVIEW_KEY` if missing. It records `CONTROL_SHEET_ID`, and updates `_meta` (`sheet_schema`, `setup_done_at`, and `draft_revision` 0 if missing).
5. When every questionnaire tab is empty, it offers to copy the questionnaire from GitHub (the standard address, or one pasted in), then to publish it as version 1 (`PP_offerFirstPublish_`). Publish's warnings (section 10), such as the publish guard's "could not check that the form on GitHub understands this version", go into its closing notes (since 26 Oct 2026).
6. It adds tick boxes and lists to the Settings tab.
7. It ends with a message:
   - what it did;
   - how to deploy the web app (Execute as: Me; Who has access: Anyone);
   - to paste the web app's `/exec` address into the panel: Home (or Settings) > Web app address > Check and save;
   - to update later code with Manage deployments > New version, never a second "New deployment";
   - the web app address recorded so far.

**Drive folders are never replaced behind anyone's back.**

- If a folder in Script Properties can't be opened, that almost always means the person using the panel was never given access. The script then stops with a plain message that names the owner (Script Property `OWNER_EMAIL`, recorded at the first set-up) and the menu item above. Such errors are marked `ppDriveAccess`, so `panelLoad` and `panelExport` always show them (and, once codes lock, the checks and Publish too, through `PP_liveDocForChecks_()`).
- Only "Set up or repair", run by that owner, may create a replacement folder (for one that was really deleted).
- A passing Drive problem is not an access problem. Google's words such as "server error", "try again", "unavailable" or "timed out" give "Google Drive had a passing problem … Nothing was changed. Please try again in a minute." instead.

**Files stay in the owner's Drive** (`PP_giveToOwner_`):

- **When it happens:** when a file or folder was just created by someone other than `OWNER_EMAIL`, the script hands it over with `setOwner(owner)`. That someone is, for example, a co-admin opening a round or publishing, or a web app deployed by a co-admin saving a voice note. The creator keeps edit access.
- **What it covers:**
  - the main folder "Valmo Partner Pulse", when a co-admin had to create it;
  - the `published` and `rounds` folders, and each round's folder and `audio/` folder;
  - each round's data spreadsheet;
  - each `p<N>.json`;
  - each voice note.
- **Best effort:** when Google refuses (for example an owner in another Google Workspace domain), the item stays where it is, inside the shared folder, and the log says so. Nothing happens in the usual case, where the owner creates it.
- **Checking it:** health's `runs_as_owner` tells whether the web app runs as the owner.
- **Never run on real Google;** it works only inside one Google Workspace domain.

**Permissions (Google's permission screen).** Google's permission screen has a tick box per permission, and one left unticked makes Drive or Sheets calls fail half-way.

- **Every menu function and `panelOpen` first call `PP_requireAllPermissions_()`.** When Google offers `ScriptApp.requireAllScopes`, it calls `requireAllScopes(ScriptApp.AuthMode.FULL)`:
  - with every permission granted, nothing happens;
  - otherwise Google stops the run and shows its permission screen again;
  - the guard: an error that mentions authorization, permission or consent goes through, because that is Google showing its screen; any other failure of this newer feature is only logged, and the menu item carries on.
- **Server side** (`PP_permissionHelp_`, used by every panel function through `PP_forPanel_`, and by set-up's messages):
  - Google's "Specified permissions are not sufficient" becomes "use the Partner Pulse menu again … tick Select all";
  - "Authorization is required" becomes the one authorization message below;
  - both end with " (Google said: …)", and an error already explained is never explained twice.
- **The "Authorization is required" message** gives both causes, the likely one first (Pranav's decision, 21 Oct 2026). It is word for word the same in Code.gs (`PP_MSG_AUTHORIZATION_`) and Panel.html (`MSG_AUTHORIZATION`):

  > Google says Partner Pulse needs authorization. Usually Google is using another of your Google accounts: open the Sheet in a Chrome profile (or an Incognito window) signed in only with your company account, then try again. If that does not help, a permission was probably left unticked: use the Partner Pulse menu again and tick Select all on Google’s permission screen.

- **The panel** (`friendlyError`) keeps any server message containing "(Google said: " as it is. Otherwise it makes these errors plain:
  - "Specified permissions are not sufficient" becomes "tick Select all" advice;
  - "Authorization is required" becomes the message above;
  - "PERMISSION_DENIED", "reading from storage" and "unable to open the file" become "Google may be using another of your accounts";
  - network, sign-in and time-out errors become plain sentences.

## 14. Control panel: what the UI must do (`Panel.html`)

The audience is non-technical ops staff. All copy is plain English: no "JSON", no "boolean"; instead "rule", "on/off" and so on.

**Look:**

- The same palette as the form.
- System fonts.
- Left navigation, with a badge on Publish: the number of problems from the last check, or a dot when partners don't see the latest changes yet. Below it, who is signed in.
- A main area.
- A top bar showing:
  - the draft status: "All changes saved", "Unsaved changes" (with **Discard**) or "Saving…";
  - the Live badge, for example "Live: version 7, published 21 Oct by asha@…" or "Nothing published yet";
  - the buttons **Save** (also Ctrl+S / Cmd+S), **Preview** and **Publish**.

**Behaviour:**

- **Load:** `panelLoad()`. If that fails, an error card with "Try again".
- **Editing:** the whole model is edited in memory.
- **Save** calls `panelSave(revision, model)`. On a conflict it offers three buttons:
  - Cancel;
  - "Keep mine and overwrite", in a warning style: `panelSave` again with the new revision, then a message naming whose changes were replaced;
  - "Reload the latest version", the main button: your changes are lost.
- **Discard** reloads the saved draft, after a confirmation.
- **Preview** saves first, and needs a saved round. It shows a dialog with:
  - a round picker, starting on the newest round;
  - the link with Copy, and "Open the preview" as an `<a target="_blank">`, not `window.open`;
  - a hint about that round's "What changed" bullets;
  - a warning that anyone with the link can see the unpublished draft.
- **Publish** saves, validates and shows the issues. It is blocked if there are errors. Otherwise:
  - it asks for a short note (required);
  - the button says "Publish anyway" when the draft is the same as the live version;
  - then it calls `panelPublish`;
  - after "Publish first" in Rounds, it then offers to open that round.
- **Banner:** "Nothing is published yet…", or "Partners still see version N…" when `draft_differs_from_live`.
- **Unsaved state:** every input keeps the "Unsaved changes" state correct. To decide whether partners would see something new (the round-open warning, "Publish anyway"), the panel counts only changes to what Publish would publish: rounds, translators' notes and a new, empty round don't count (section 7).
- **Recovery copy:** unsaved changes are also kept in this browser's `localStorage` under `pp-unsaved:<Sheet address>` (questionnaire only, no partner data).
  - The next time the panel opens, it offers them back, but only if nobody saved the draft in the meantime; otherwise it drops them and says so.
  - Closing the window with unsaved changes asks for confirmation.

**Sections:**

1. **Home:**
   - live version;
   - whether the draft differs from live, and a Preview button;
   - "What to do next" hints, for example:
     - "Nothing published yet: go to Publish";
     - a demo round that is open;
     - an open round with no links;
     - no active DCs;
     - translations to finish;
     - "The web app address isn’t recorded here yet";
   - every round with its status and counts (`panelRoundCounts`; loaded by themselves for open rounds and the three newest);
   - **Quick links** to the Sheet, the Drive folder and the form, and the **Web app address** box:
     - until an address is recorded: a box to paste it in and **Check and save** (`panelSetWebAppUrl`), with the server's plain-English reason shown under the box when the check fails;
     - once recorded: the address with **Copy** and **Change**;
   - **the route-code banner** (since 26 Oct 2026): red when `panelFlowStatus(form address)` says the form on GitHub runs different route code from this panel (`same: false`): upload the new form code. Nothing is shown when the form can't be reached.
2. **Questions** (since 27 Oct 2026, "Paste a route": the questions and their route are changed as **one table**, one row per screen; Pranav's decision in spec §4. The question-by-question editor, with Add a question, the rule builder, "After this question", "Ask this question", Add an ending, and Move / Edit / Hide / Delete / Change code on questions, was removed. The full contract is [flow-engine.md](flow-engine.md) §9.8; this is what the screen shows, top to bottom):
   - **The help line:** "To change the questions: Copy the current route, edit it in Excel (or ask Claude/ChatGPT with the instruction), paste it back here, Check, Use this route, then Save, Preview and Publish." Next to the title, the buttons **Map** and **Try a path**.
   - **The codes note** (`codesNote`): before codes lock, "nothing is locked yet"; with `live_ids_unknown`, why everything is locked for now. **The route-tools note** (`routeNote`, below).
   - **"1. Get the route as a table":** **Copy the current route** (`toTable` of the draft as it is in the window, tab-separated; clipboard, then the older copy command, then a **Copy by hand** box), **Download the Excel template** (`templateCsv`, saved as `partner-pulse-route.csv`, Hindi intact) and **Copy the instruction for Claude/ChatGPT** (`aiInstruction`, with the draft's round ids).
   - **"2. Paste a route":** a text box; **Check** (or Ctrl/Cmd+Enter) reads the table with `fromTable` against the draft as it is now, with the codes partners answered, their kinds (`live_ids.kinds`) and the draft's round ids. Problems (red) each carry "Row N · column" (the header is row 1, as Excel numbers it) and stop **Use this route**; warnings (yellow) are in a fold-out list. A clean check says what would change ("Compared with your draft: …": screens added, removed or changed, the order, texts new or reworded), with a fold-out **The texts that would change (N)** listing each text as "key · language: old → new" (languages that only carry `[TRANSLATE]` are left out); it opens by itself when a translation would change, with "Keep a translation only if a person wrote it: an AI must never translate." **Map of the pasted route** and **Try a path on it** show the pasted route before it is used. **Use this route** checks once more, replaces the draft's questions and their texts (the texts named after a removed row or answer go too, when nothing else uses them), and offers **Undo**. Changing the box or the draft makes the result stale until the next Check.
   - **"The route now"** (read only): every screen in order as a card with its type icon and name, its English (and Hindi), "row N in the table", and badges: Built-in, Required / Optional, "Only if …", "Skipped when …", "↪ goes to … when …" (a jump), "↪ then goes to …" (`next`), "Repeats for each area" (or "… rated low"), "Ends the survey", "Hidden: partners don't see it", and the problem badges "⚠ The rule tests a later or hidden answer", "⚠ this jump can never happen", "⚠ the jumps can't be read", "⚠ route problem: see below" (red, for a `fromRows` note that blocks Publish, G5 included) / "⚠ route note: see below" and "⚠ nothing leads here". The checker's words are listed under the card. No card has buttons. Rows after the main thank-you screen show under **Other routes and endings**. An empty draft shows "No questions yet" with **Go to Settings** (Import from GitHub).
   - **Map:** the route of the draft, of the pasted route (after a clean Check) or of the live version (`panelLiveSurvey`), from `PP.flowCheck.toMermaid`: a text outline at once, with "Open in mermaid.live", replaced by the drawing when the sandboxed frame says "drawn" (after 6 s a "still loading" note; after 20 s the outline stays). The frame rules are in section 2.
   - **Try a path:** pick answers (and language, a link with `?lang=`, "what changed" items, the round when a rule tests it) and see the screens, why the others are skipped, and what would be sent (`PP.flowCheck.simulate`), on the draft or the pasted route.
   - **Publish's "Go there"** on a question opens its card with a note (`fixNote`): "To fix question N, change row N+1 of the route table (code …, its "then go to" or "jumps" column / its "show only if" column): Copy the current route, change it in Excel, paste it back under "Paste a route", Check, then Use this route. The problem: …" (section 14, Publish).
   - **The settings of the built-in screens** (where the problem screens go, a problem must be picked, Other needs detail, "doesn't apply", the comment box, "I don't handle this") are in **Settings** and **Support questions** only.
   - **How the window gets the route code (PART 5b):** `loadFlowCode` asks `panelFlowCode()` once and `runFlowCode` runs it with `new Function` and a private root, giving `PP.flow`, `PP.flowPanel` and `PP.flowCheck` (no template, so the page has no `<?` and doesn't carry the route code's 380 KB on every open). `flowInfo` builds the draft's route with `flowPanel.fromRows` (`draftSurvey` mirrors Model.gs's compile for the route's parts; the bench compares the two) and checks it with `PP.flowCheck`. `routeAnswers` asks `PP.flowCheck.answersAt` which answers a rule or jump may test; badges and jump problems (`routeProblems`) match the findings by `site`, `target` and `index`, reading the message only with a `Flow.gs` older than 26 Oct. Kinds added in `web/js/types/` arrive with `catalog.screen_types` (their `catalogue`) and are taught to the window's route code (`teachKinds`, `kindAnswer`), before every table tool too.
   - **When the window can't run the route code** (since 27 Oct 2026): `probeServerTables` asks `panelRouteTable({ tool: 'status' })` (section 13). If the server can run the table's tools, Check, Use this route and the three table buttons run there (`runTableTool`: the same request as in the window, `tableRequest`, with a busy box such as "Google is checking the table…", a failure message with **Try again**, one check at a time, and a pasted text over 300 KB refused with a plain message), and the note says "Pasting a route still works: …"; only the Map, Try a path and the route badges are off. If the server can't either (its Flow.gs is older than the table, or missing), those buttons are locked buttons that say why, and the note asks for the latest Flow.gs. **Try again** (`retryFlowCode`) loads the route code again.
   - **Codes:** a code in `live_ids` shows a lock icon. The route table's Check refuses a table that leaves out a live question or a live answer of a pick-one question, changes its code, or gives a live question another kind; `nps` and `support_gate` can never leave the table (section 11).
3. **Areas & problems:**
   - **Areas:** cards showing:
     - the name and help (all languages);
     - a threshold override ("Use the standard (3)" or 1-5);
     - a Shown/Hidden switch, Move, Add area and Change code;
     - Delete, only for areas not in `live_ids`; otherwise Hide.
   - **Chips:** each area's chips with the label in every language, Shown/Hidden, Move, Add, Change code and Delete (same lock rules). "Other" is shown as a fixed, non-editable chip.
   - A warning chip shows when the area has fewer than 4 or more than 6 active chips.
4. **Support questions:**
   - the items (labels in each language), Shown/Hidden, Move, Add, Change code, Delete (lock rules);
   - "Doesn't apply" on/off, with its label;
   - comment on/off, and the comment question's text in every language (edited here, not in Settings).
5. **Texts & translations:**
   - **Progress:** a bar per active language other than English ("Tamil: 12 of 127 done").
   - **The table:** all keys, grouped by prefix with friendly group names (Questions, Areas, Problems, Support, Buttons and messages, Voice notes, …), each with a few words saying where it is used.
   - **Finding:** a search (any language, or a text code), a language picker, and a filter for "only texts still to translate in <language>".
   - **Editing:** the English and the chosen language side by side, with a "To translate" tag.
   - **Notes:** the translator note is shown, and can be cleared with "Checked".
   - "How translations work": `[TRANSLATE]`, `{s}`/`{n}`, notes, and how to work with outside translators.
6. **Look & feel:**
   - the product name (`brand.name` in every language);
   - the logo address;
   - the 9 colours, each with a colour picker and a hex field, and "Use the standard colours";
   - the 5 faces;
   - a **live mini preview** of one question card in the chosen colours.
7. **Rounds:**
   - **The table:** id, status, dates, notes, data sheet and voice-notes links, and counts. Delete is offered only for a round that is still a draft and has no data sheet.
   - **New round:** suggests the next id, for example `2026-R2`; the code allows letters, digits, `-` and `_` only.
   - **Open / Close / Re-open:** with a confirmation that says:
     - when partners would not get the draft: "Partners will get version N…" or "Nothing has been published yet…", with the buttons Cancel, **Publish first** and "Open anyway";
     - for the first real round: **"This locks the codes."**, with a reminder to put the real problem list in first;
     - for a test round: that it does not lock the codes;
     - for a DEMO round: a strong warning and an "I understand" tick box.
   - **What changed:** an editor for the selected round's bullets (all languages, add/remove/reorder), with a reminder that content changes need Publish, and a warning while bullets contain `[SAMPLE]`.
8. **Links:**
   - pick a round (open or draft; the newest by default);
   - the active DC count, and a "the DC list lives in the DCs tab" pointer;
   - **Make links**, for only DCs without a link or all active DCs again. Then a result summary: created / made again / kept / skipped with reasons;
   - **Download CSV** (a blob link, with a `data:` URI as the fallback) and copy;
   - a box to search one DC and copy its link;
   - **Show the link secret (for the Python tool)**: type SHOW to confirm.
9. **Publish:**
   - **Check:** "Check for problems" runs `panelValidate` and lists errors and warnings. Each one has a "Go there" link that opens the right section and item; a route problem about a rule opens the rule card, one about a jump or "usually go to" opens **After this question** (`isRuleIssue`, `isJumpIssue`; these still decide by the message's words, since Model.gs's issues carry no `site`).
   - **Publish:** a note field, then the Publish button (a note says when the draft is the same as the live version). The "Version N is live" message lists Publish's `warnings` in a "Please check…" box (since 26 Oct 2026).
   - **History:** each version with its date, author, note, file and a Live badge, plus "Restore this version as the draft" with confirmation.
   - **Repo copy:** "Download files for the GitHub copy" (`panelExport`), then one download per file (five since 26 Oct 2026: `flow.md` goes to `docs/flow.md`), with where each file goes. It warns:
     - when the draft has unpublished changes;
     - when no web app address is recorded: survey.json would keep the form in test mode;
     - and shows the server's own `warning`.

     **Download** or **Copy** of a `survey.json` that is in test mode (decided by the prepared file itself, `"mode": "mock"`) first asks "Take a test-mode survey.json?" (`askIfTestMode`). Recording or changing the web app address clears files already prepared, so they must be prepared again with the new address (21 Oct review).
10. **Settings:**
    - friendly controls for every Settings entry except the Look & feel ones and the comment question (edited in Support questions). They are grouped as Form address, Languages, Moving between screens, Ratings, Problem screens, Support questions, Voice notes, Typing, Read aloud, What changed, Progress messages and Sending (the last one marked advanced);
    - the Web app address box again, under Form address;
    - the language list: add, remove, reorder and activate (adding needs the code, the BCP-47 tag and the native name; new text columns are created on save; the default and fallback languages stay on);
    - Import from GitHub, with confirmation;
    - "Make new preview links…" (`panelNewPreviewKey`), with confirmation.

**Testability:**

- Every interactive element has a `data-test` attribute (for example `data-test="nav-questions"`, `data-test="save"`, `data-test="screen-card-nps"`).
- The panel must work when `google.script.run` is provided by a test shim (the local test harness).
- No reliance on `<? ?>` scriptlets, and no Apps Script-only globals other than `google.script.run`. The one exception is optional: at start-up `fitToScreen` calls `google.script.host.setHeight` / `setWidth`, only when they exist, so the 1100×760 window fits a small laptop screen. Every section scrolls inside the window.
- The bench's fake server (`tests/panel/server.js`) can stand in for the route calls and their failures: `POST /control/flow_status`, `/control/flow_code` (an older or failing route code), `/control/screen_types`, `/control/publish_warnings`, `/control/model` and others; [tests/README.md](../tests/README.md).

## 15. Changes to the form (`web/`)

1. **Bootstrap.**
   - The form loads its own `config/survey.json` (it says where the backend is), then calls `GET <endpoint>?action=bootstrap&round=<round>` (plus `&draft=1&pk=<the link's pk>` in preview). An incomplete link skips this call and shows only `incomplete`: `dc` and `round` must match `[A-Za-z0-9_.-]{1,64}`, and a live link (not preview, not test mode) needs a token-shaped `t` (`linkComplete()` in app.js).
   - It waits up to `whats_changed.timeout_seconds + 2` s, taking the setting from the static config.
   - **On `ok`:**
     - `config` = the published `survey`, but `backend.mode`, `backend.mock_url`, `backend.apps_script_url` and `links` are kept from the static file;
     - `config_version` is the published one;
     - `strings`, `whats_changed` and `clips` come from the response;
     - i18n and branding are initialised again;
     - `roundStatus` = `round.status`.
   - **Otherwise** (failure, timeout, `not_published`, `bad_preview_key`, or an answer without usable screens, languages or texts; since 26 Oct 2026 "usable" is `PP.flow.isUsable(survey.flow)` in `net.js` `usableBootstrap`: a non-empty list, or a graph whose `start` names one of its screens):
     - the static config and strings are used (the form downloads `i18n/strings.json` **only** in this case, so partners never download the texts twice);
     - "what changed" comes from the static `config/whats_changed.json`;
     - the static `audio_clips.json` is used;
     - `roundStatus` = `"unknown"`.
   - **A published questionnaire whose route goes straight to an ending before anything is answered** (app.js `checkRoute()`, since 26 Oct 2026) is treated like one that breaks the form, below.
   - **A published questionnaire that throws while the form starts** (a mistake the checks missed) is treated the same way: the form logs it to the console and uses its own copy, keeping the round status the answer gave. Its event handlers are bound once (`bindEvents()` is guarded), although `setup()` then runs twice, and the second attempt starts from the progress saved on the phone before the first one (no extra resume, no screen view that never happened). In a preview, the strip then shows `dev.preview_broken` (the draft itself is broken: don't publish it) instead of `dev.preview_fallback`.
   - The separate "what changed" request of Phase 1 is replaced by this one call.
   - Link, language and state handling run **after** bootstrap (only the link itself is read before it), because the language list may have changed.
2. **Round gate** (not in preview):
   - `draft`: the terminal screen `not_open`;
   - `closed`: the terminal screen `closed`, unless this phone already has progress or a finished-but-unsent survey (then it carries on, and the backend marks it late);
   - `unknown`: carry on.

   A submit or ping answered `round_not_open` shows `not_open` (permanent, no retries). When the bootstrap didn't arrive (`unknown`) and the `opened` ping answers `round_status: "closed"`, a partner who hasn't started yet sees `closed`.
3. **Preview mode** (`?preview=1`):
   - the bootstrap uses `draft=1&pk=<the link's pk>` and waits up to 20 seconds, or `whats_changed.timeout_seconds + 2` if that is longer (compiling the draft can take Google longer);
   - a banner shows `dev.preview_banner`, in every mode, plus `dev.preview_fallback` when the draft was asked for but did not arrive and the form's own copy is shown (a preview link without a round is simply `incomplete`);
   - the Start again button reads `ui.start_again`;
   - state is saved under `state:preview:<round>:<dc>`;
   - **no pings and no submit**;
   - finishing shows the thank-you screen with status `preview` (`dev.preview_done`) and a "Start again" button;
   - `dc` and `t` are optional (default `DC-PREVIEW`), and a round is required;
   - there is no round gate: any round can be previewed, a draft one too.
4. **New thank-you screen statuses:**

   | Status | Title key | Body key |
   |---|---|---|
   | `closed` | `round.closed_title` | `round.closed_body` |
   | `not_open` | `round.not_open_title` | `round.not_open_body` |
   | `preview` | `thanks.title` | `dev.preview_done` |

5. **New strings,** written in English and Hindi, with `[TRANSLATE]` placeholders for the others:

   | Key | English | Hindi |
   |---|---|---|
   | `round.closed_title` | This survey has closed | यह सर्वे बंद हो चुका है |
   | `round.closed_body` | Thank you. Look out for the next round. | धन्यवाद। अगले राउंड का इंतज़ार कीजिए। |
   | `round.not_open_title` | This survey is not open yet | यह सर्वे अभी शुरू नहीं हुआ है |
   | `round.not_open_body` | Please open the same link again once it starts. | कृपया शुरू होने के बाद यही लिंक फिर से खोलें। |
   | `dev.preview_banner` | PREVIEW: answers are not saved | प्रीव्यू: जवाब सेव नहीं होते |
   | `dev.preview_done` | Preview finished. Nothing was saved. | प्रीव्यू पूरा हुआ। कुछ भी सेव नहीं हुआ। |
   | `dev.preview_fallback` | Could not load the draft: showing the form's stored copy. Open the preview link from the control panel again. | ड्राफ़्ट लोड नहीं हो पाया: फ़ॉर्म की सेव कॉपी दिख रही है। कंट्रोल पैनल से प्रीव्यू लिंक फिर से खोलें। |
   | `ui.start_again` | Start again | फिर से शुरू करें |
   | `dev.preview_broken` | The draft could not be shown: something in it stops the form from starting, so the form's stored copy is shown. Don't publish it: undo your last change, run Check for problems and preview again. | ड्राफ़्ट नहीं दिख पाया: इसमें कुछ ऐसा है जिससे फ़ॉर्म शुरू नहीं होता, इसलिए फ़ॉर्म की सेव कॉपी दिख रही है। इसे पब्लिश न करें: अपना पिछला बदलाव हटाएँ, Check for problems चलाएँ और फिर से प्रीव्यू करें। |

6. The submission's `config_version` is the effective config's (`p7-2026-10-21`, or the static file's). Pings carry it too; since 26 Oct 2026 the live backend also stores it with each ping (section 11).
7. **The route** (flow graph, 23–26 Oct 2026): the form walks the published `survey.flow` as a graph with the same engine the panel uses (`web/js/flow.js`); old list versions are converted on the fly. Rules see only answers on the partner's current route. The contract is [flow-engine.md](flow-engine.md).

## 16. Changes to the local test server (`scripts/mock_server.py`)

- **`GET /api?action=bootstrap&round=R[&draft=1]`:**
  - returns the bootstrap shape built from the local files (`web/config/survey.json` minus `backend` mode/URLs and `links`, `strings.json`, the round's what-changed, `audio_clips.json`), read again on every request;
  - `version`: null;
  - `config_version`: from survey.json;
  - `draft`: as asked (the content is the same: on this Mac the files are both the draft and the published version);
  - round status: `open`, or as set by the new flags `--closed-rounds R1,R2` and `--draft-rounds R3`.
- **Draft rounds:** a submit or ping answers `round_not_open`.
- **Closed rounds:** accepted, and stored with `late: true`.
- **`smoke_test.py`** gets a check that `bootstrap` returns a questionnaire (`survey.flow` and `survey.languages` non-empty, `strings` with `q.nps`), as the form needs. On a live backend with nothing published it FAILs with the advice "publish from the control panel first".

**Where the test server differs from the live backend** (on purpose, or not yet aligned). The full list, with what the form does in each case, is in [submission-format.md, section 11](submission-format.md#11-where-the-test-server-and-the-live-backend-differ):

| Case | Test server | Live backend |
|---|---|---|
| A round it has never heard of | `open` | `draft` ("not open yet"; pings and answers get `round_not_open`) |
| A message over 25 MB | HTTP 413 (with a `bad_request` body) | HTTP 200 with `bad_request` |
| A wrong token | refused only with `--strict`; otherwise stored with `token_valid: false` | always refused, never stored |
| Voice-note base64 | checked with the rest of the message, before the token and round | checked after the token and round checks |
| `already_submitted` in the answer to an `opened` ping | `true` only when started with `--one-response-per-dc` | `true` whenever the DC already has a stored submission in this round |
| Stored submissions per DC per round | no limit | at most 10 (more are answered `ok`, not stored) |
| Pings per DC per round in 10 minutes | no limit | 60 stored; more are answered `ok`, not stored |
| `draft=1` bootstrap | no preview key needed | needs `&pk=` |
| Failures on purpose | `--fail-rate` answers HTTP 503 | (none) |

## 17. Links and tokens

- **Token:** exactly as in submission-format.md section 5. In Apps Script:
  ```js
  Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(dc + "|" + round, secret, Utilities.Charset.UTF_8)
  ).replace(/=+$/, "").slice(0, 22)
  ```
  The backend compares tokens in a time that doesn't depend on where they differ.
- **Ids in links:** `dc` and `round` must match `^[A-Za-z0-9_.-]{1,64}$` (and not be `.` or `..`). The questionnaire checks and the panel's "New round" allow round ids without dots only (`^[A-Za-z0-9_-]{1,64}$`), so use letters, digits, `-` and `_` for rounds.
- **The secret** = Script Property `LINK_SECRET`.
  - Setup creates it once, as 64 hex characters from two `Utilities.getUuid()` with the dashes removed.
  - **Never change it while links are out:** every old link would stop working.
- **`scripts/generate_links.py`** (the offline alternative to the panel):
  - **The command:** `python3 scripts/generate_links.py --dcs <DC list>.csv --round 2026-R1 [--base-url https://pranavakellaps37.github.io/NPS-Form-/] [--out links.csv] [--overwrite]`.
    - The default `--out` is `links-<round>.csv` next to the DC list.
    - An existing file is replaced only with `--overwrite`.
    - The name must end in `.csv`, and it refuses to write inside `web/` or `sample_data/`.
  - **The secret** comes from the environment variable `PULSE_LINK_SECRET`, from a `.env` file in the project folder (git-ignored), or else a hidden prompt. There is no `--secret` option on purpose: Terminal would remember it.
  - **Input CSV columns:** `dc_id` (required), and optionally `language`/`lang`, `dc_name`, `state`, `region` and `active`. For `active`, empty, TRUE, yes, y, 1 or on makes a link; anything else skips the row, as in the DCs tab.
  - **Output:** the columns `dc_id, dc_name, state, region, language, link` (the panel's CSV columns), saved as UTF-8 with a BOM, readable only by the Mac user, with the same formula guard as the panel.
  - **Skipped and changed rows:**
    - invalid ids are skipped, with a plain-English reason;
    - a repeated `dc_id` gets one link (its first row);
    - a language that isn't offered is left out of the link.
  - **Test links:** a `--base-url` of localhost or 127.0.0.1 makes TEST links for the test server, each ending in `&mock=1`.
  - **Secret warnings:** it warns when the test server's public test secret is used with a real address, and when a secret doesn't look like the live one (64 characters of 0-9 and a-f).

## 18. Storage keys

**Script Properties:**

| Key | Holds |
|---|---|
| `LINK_SECRET` | the link secret |
| `FOLDER_ID` | the main Drive folder |
| `PUBLISHED_FOLDER_ID` | the folder of published versions |
| `ROUNDS_FOLDER_ID` | the rounds folder |
| `LIVE_VERSION` | the live version number |
| `LIVE_FILE_ID` | the live version's Drive file |
| `ROUND:<id>` | JSON `{ status, sheet_id, audio_folder_id }`; every round saved in the draft gets one |
| `PREVIEW_KEY` | the private key preview links carry (`&pk=`); replaced by `panelNewPreviewKey` |
| `OWNER_EMAIL` | who ran set-up first (owns the Drive folder; named in access errors; gets files handed over) |
| `CONTROL_SHEET_ID` | lets the web app find the control Sheet (for Preview) |
| `WEB_APP_URL` | the web app's `/exec` address, recorded by `panelSetWebAppUrl` after a check (used by `panelLoad`, `panelExport` and set-up's closing message) |
| `WEB_APP_ACCESS` | `anyone`, or `domain` when the recorded web app answers only signed-in colleagues (Meesho-only mode; links and Preview then use the web app's address) |
| `ROUNDS_EVER_OPENED` | `"1"` once a real (not test) round has been opened: codes are locked from then on. Nothing clears it (section 11) |
| `CODES_EVER_LIVE` | JSON list of every code of every version published since codes locked, as qualified entries (`screen:<id>`, `area:<id>`, `chip:<area>/<code>`, `support:<code>`, `option:<question>/<code>`), written by `PP_recordCodesEverLive_` on Publish (section 11). Nothing removes an entry. At most about 9,000 characters (one Script Property); Publish warns from 8,000 |

**User Properties:** `panel_section`.

**Script cache:**

| Key | Holds | Kept for |
|---|---|---|
| `live:<N>:k`, `live:<N>:<i>` | the live JSON, in chunks | 6 h (filled again from Drive when missing) |
| `draft:k`, `draft:<i>` | the compiled draft, for Preview | 30 s; every save of the draft removes it |
| `round:<id>` | the round's record (status `unknown` for a round never saved) | 60 s; refreshed at once when the status changes |
| `sub:<submission_id>` | the received_at of a stored submission | 15 min (the `responses` tab is the real duplicate check) |
| `pc:<dc>:<round>` | the ping counter for the rate limit, "count\|start time" | until its 10-minute window ends |
| `pingcols:<spreadsheet id>` | `"15"`: this round spreadsheet's `pings` tab has every column, `config_version` included (section 11), so a ping reads nothing extra and takes no lock | 6 h; when the cache drops it, a ping costs two small reads again (no lock) |
| `form_engine:<form address>` | the route engine the form on GitHub declares (`ENGINE` in `js/flow.js`), once found new enough by the publish guard (section 10) | 10 min |
| `form_flow_fp:<form address>` | `panelFlowStatus`'s answer: the SHA-256 of the form's route files, when it was checked, and any problem (section 13) | 10 min |

**The panel's browser** (per computer): `localStorage` key `pp-unsaved:<Sheet address>`, the recovery copy of unsaved changes (section 14).

## 19. Security

- **Admin functions can't be reached from outside.** The public web app exposes `doGet`/`doPost` (JSON) and, in Meesho-only mode, the survey page (section 12). A page the web app serves can call every public server function through `google.script.run`, running as the web app's owner. That page also runs the form's scripts from GitHub Pages. So every admin function checks first that it runs from inside the control Sheet (`PP_requireAdminCaller_`, Code.gs: `SpreadsheetApp.getUi()` must work, which it does only in the Sheet's menu and the panel's window, never on a page the web app serves): in `PP_forPanel_` (every `panel…` function), `ppSetup`, `ppShareFolder` and the `ppMenu…` functions. Calls from a served page are refused for everyone, the owner and editors included (21 Oct review). `PP_ensureRoundStore_` is private. The remaining public functions are `doGet`, `doPost`, `ppFormRequest`, `onOpen` (menus only) and Model.gs's pure helpers, plus `PP_publish` and `PP_restore`, which need a Spreadsheet object that a page can't send.
- **The route tools add no admin door (26 Oct 2026 review).** `panelFlowCode`, `panelFlowStatus` and `panelLiveSurvey` run inside `PP_forPanel_` like every `panel…` function, and `Flow.gs` exposes only `PP_flowLib_` (a helper name, hidden from `google.script.run`). The code `panelFlowCode` sends is the form's public route code. The Map's drawing library runs only in a sandboxed frame without `allow-same-origin`, pinned with its integrity hash, and the page checks a token before trusting the frame's messages (section 2).
- **Sharing the Sheet = admin rights.**
  - Anyone with edit access to the Sheet can also open its Apps Script and see Script Properties, including `LINK_SECRET`.
  - They can also call every function without a final `_` from the panel's window (section 2).
  - Share the Sheet as **Editor** only with trusted Valmo staff, and as **Viewer** otherwise.
- **The link secret** is shown in the panel only after typing SHOW (`panelGetSecret`), for the offline link tool. Anyone holding it can make a valid link for any DC.
- **The published questionnaire is public.** Anyone can read the bootstrap. Never put secrets or partner data in texts or settings.
- **The draft is private.** Preview needs the private preview key (section 12). If a preview link was shared too widely, `panelNewPreviewKey` makes every older preview link stop working; partners' links are not affected.
- **Co-admins need the Drive folder too.** Use the menu item "Share the Drive folder with all editors". The script never quietly creates a second folder in someone else's Drive (section 13).
- **Partner data stays in Google.**
  - The DC list, links, answers, voice notes and data spreadsheets stay in the owner's Google Drive.
  - Files a co-admin creates are handed to the owner, best effort (section 13).
  - Phase 3's pipeline will need access to the "Valmo Partner Pulse" folder: it reads the answers and voice notes, and writes transcripts and classifications back. How it signs in to Google (a service account or the owner's own login) is still to be chosen.
- **Strict token check.** The backend checks every token strictly and never stores rejected messages. Voice notes are decoded only after the token and round checks.
- **Limits on everything partners send** (section 12): message size, list lengths, field lengths, 5 MB per voice note, 10 stored submissions per DC per round, 60 stored pings per DC per round in 10 minutes.
- **Nothing typed becomes a formula.** Text written into a cell gets a leading apostrophe (section 3), and the links CSV guards cells that start with `=`, `+`, `-` or `@` (section 13).

## 20. Limits and performance (Apps Script)

- **Concurrency:**
  - Apps Script runs only so many executions at once (about 30 for one script).
  - Submissions also queue on one lock. Each holds it only briefly, because voice notes are saved before the wait, and waits at most 8 s.
  - **Send links in batches** (for example 1,000 an hour) rather than all 10,000 at once.
  - The form's retries absorb short peaks.
- **Who waits for whom (the locks):**
  - **Partners' submissions** use the script lock (`LockService.getScriptLock()`), waiting at most 8 s (`SUBMIT_LOCK_MS`). Busy → `server_error` "busy, try again", and the form sends again.
  - **Admin changes** use the Sheet's document lock (`PP_withAdminLock_` with `LockService.getDocumentLock()`), waiting at most 30 s (`ADMIN_LOCK_MS`). Busy → "Someone else is changing Partner Pulse right now (saving, publishing, making links or opening a round). Nothing was changed. Please try again in a minute."
    - Admin changes are: `panelSave`, `panelPublish`, `panelRestore`, `panelImport`, `panelGenerateLinks`, `panelSetFormUrl`, `panelNewPreviewKey`, `panelSetRoundStatus`, and set-up's import and first publish.
    - Normally partners never wait for admins, and admins never wait for partners. The one exception is creating a round's store (below).
    - Where Google gives no document lock (the method is missing, or it returns `null`), the script lock is used instead, and admins and partners wait for each other again.
  - **Creating a round's store** takes the script lock as well, so the same spreadsheet can never be created twice:
    - in `panelSetRoundStatus` for up to 30 s (`STORE_LOCK_MS`);
    - on a partner's first ping or submission for a round without a store, for up to 8 s.
  - **No lock:** `panelSetWebAppUrl` (one Script Property), the other panel functions (they only read, apart from `panelPreviewUrl` making the first preview key), set-up's own repairs, and storing a ping.
  - **One exception for pings (since 26 Oct 2026):** the first ping that finds an older round spreadsheet's `pings` tab without its `config_version` column takes the script lock (8 s at most) to add it, once per spreadsheet (section 11). If the lock stays busy, the ping is stored without its version; it is never refused. After that the cache key `pingcols:` means pings take no lock.
  - After taking the admin lock or the store lock, a run reads Script Properties and the live version again (`PP_forgetRemembered_`).
  - Not checked on real Google: whether `'getDocumentLock' in LockService` is true there. If it is false, admins silently share the partners' lock (STATE.md, item 11).
- **Bootstrap is fast:** it serves from the cache (about 50 KB of JSON). If Google is slow, the form falls back to the repo copy after `whats_changed.timeout_seconds + 2` s.
- **Sheet size:** one round's data spreadsheet holds about 3.5 million cells for 10,000 partners, against the 10 million cell limit.
- **Not tested at full size** (STATE.md):
  - links for about 10,000 DCs come back to the panel as one CSV of about 2 MB;
  - every partner request reads all Script Properties once, which counts against a Google quota.
- **The route code in the panel:** `panelFlowCode` sends about 240 KB of route code (the three route files) to the window once per opening; it is not part of the page, so Panel.html itself stays about 400 KB. Model.gs runs `PP_flowLib_()` once per Google execution.
- **Updating the code:** after changing it in the Apps Script editor (all five files when they changed; `Flow.gs` after any change to `web/js/flow.js`, `flow-panel.js` or `flow-check.js`), go to Deploy > Manage deployments > edit the existing deployment > Version: New version. This keeps the same `/exec` URL. Upload the form (`web/`) to GitHub first: the publish guard refuses a graph while the form on GitHub is older (section 10).
  - A brand-new deployment changes the URL that `web/config/survey.json` points to.
  - The new address must then also be pasted into the panel again (Home or Settings > Web app address > Check and save), because the GitHub copy uses the recorded address.
