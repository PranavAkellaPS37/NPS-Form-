# STATE: where the build is

**Updated:** 28 Oct 2026, 12:48 IST, by Claude.

**APPROVED (21 Oct ~08:45 IST):** Pranav replied "ok" to the remaining Phase 2 list (items 1–11 below) and to all 8 recommended decisions (see Decisions). Work started after a context compaction, as he preferred.

**Progress today (21 Oct):**
- Items 1–10 of 11 were done by ~16:55 IST and handed over; Pranav pushed them (`1c99b5e`, after cleaning personal details from both commits) and switched on GitHub Pages.
- Since ~18:00, at Pranav's request: **the Meesho-only mode** for the BU head demo (see Done). It is built, independently reviewed, every finding fixed, every suite green at 20:47 IST, and committed locally (not pushed).
- Left: Pranav's demo, then the hand-off checklist (item 11).

**What happened this morning:**
- **The Mac restarted at 08:24 IST,** which wiped the temporary scratchpad folder holding the developer test suites and the 20 Oct audit evidence. Nothing in the repo was lost.
- **The audit evidence was restored** from the workflow records, and **the test suites were rebuilt** from the session records (item 1, done).
- **Two critics** checked CLAUDE.md, spec.md and this file against the brief and the 20 Oct evidence: 48 notes. An editor agent applied them, a verifier checked every one, and Claude fixed the rest (21 Oct, 10:00–10:50 IST).
- **A context compaction at 11:10 IST** was saved and resumed automatically by the new compaction guard (CLAUDE.md rule 9).
- **The account's usage limit** stopped all work from ~12:20 to 13:20 IST (the first review run was cut off); a leaner review ran from 13:24 to 14:23.

**Rule:** update this file at the end of every task (CLAUDE.md, standing rule 2). The spec and every decision are in [spec.md](spec.md).

## Where we are (two lines)

**"Paste a route" is BUILT, REVIEWED, FIXED and FULLY TESTED** (27–28 Oct; uncommitted on top of `16c3d66`, which Pranav pushed): the panel's Questions = Copy the current route / Excel template / AI instruction + Paste a route (Check, Map/Try-a-path preview, Use this route + Undo); old editor removed; all 15 review findings fixed; final regression 28 Oct 12:33–12:46 IST: all 20 suites exit 0.
Now: **committed locally, STOPPED for Pranav** (push + release steps below, in Exact next action). Agents are blocked by the account's weekly usage limit until 30 Oct 08:30 IST. His Sheet still needs Settings > Import from GitHub + Publish version 1.

## Current phase

**Phase 2: Apps Script + link generator + control panel**, with two approved additions since: the flow graph (`16c3d66`, pushed 27 Oct) and **"Paste a route"** (27–28 Oct, built, reviewed, fixed, fully tested, uncommitted). Waiting for Pranav: commit, push, paste four Apps Script files, New version, Import from GitHub (his draft is empty), try it, Publish version 1.
- The scope grew at Pranav's request on 20 Oct: a no-code control panel inside the Google Sheet, with instant publish through Google.
- Phase 1 is done and committed. Phases 3–5 haven't started.

## Done

### Phase 1: form, config, mock backend

Committed on 20 Oct 14:41 IST and reviewed by Pranav; now commit `25c2bfd` (rewritten on 21 Oct, before the first push, so it no longer holds this Mac's folder path or Pranav's work email). Not pushed.
- [x] **Survey form `web/`:** S0–S7 as specified, with the approved changes (spec §2). Every part is configured in `web/config/survey.json`, with 6 areas × 5 placeholder chips + Other.
- [x] **Six languages:** 132 text keys. English and Hindi are real text. ta/te/kn/ml are `[TRANSLATE] ` + English for all 132 keys.
- [x] **Voice notes:** webm/opus, mono, ~16 kbps, 60 s cap, with consent, sent as base64 inside the submission. Typing is the fallback.
- [x] **Read-aloud:** speechSynthesis plus optional clips, hidden when there's no voice. Gaps: see Half-done.
- [x] **Resilience:** progress on the phone, retries with backoff (2 s … 300 s), a "Send now" button, sending when back online, and per-screen timestamps.
- [x] **Page weight:** 212 KB (61 KB compressed), 71% of the 300 KB budget, as `check_config.py` counts it (the form's own copy of the files; measured 20 Oct, with the Phase 2 form changes). A normal live visit is about the same: 211 KB (61 KB compressed).
- [x] **Mock server, checks and tools:**
  - `scripts/mock_server.py`: a local backend that writes to `local_data/`.
  - `scripts/check_config.py`: the settings check; also gates GitHub Pages.
  - `scripts/strings_csv.py`: translator spreadsheets.
  - `scripts/smoke_test.py`.
- [x] **Docs:** `README.md`, `docs/config-guide.md`, `docs/submission-format.md`, `CHANGELOG.md`.

### Phase 2: built, reviewed, fixed (all uncommitted)

- [x] **`apps-script/Code.gs` (public web app):**
  - `doPost`: `submit` and `ping`, with the HMAC token check, round status, size limits, duplicates and a per-DC cap of 10.
  - `doGet`: `bootstrap`, `whats_changed`, `health`.
  - Rows go to `responses`, `function_ratings`, `free_text` (with the Drive audio URL), `events` and `pings`.
  - Storage: one data spreadsheet per round, and voice notes in Drive.
  - Publishing to `published/p<N>.json`, plus restore, preview with a private key, and setup/repair.
  - Separate locks: admin changes use the Sheet's document lock and partners' answers the script lock, so they normally don't wait for each other (opening a round still takes the partners' lock briefly). Tested only with a stand-in for Google; see "Never run on real Google" below.
- [x] **`apps-script/Model.gs`:** the Sheet tabs ↔ questionnaire, checks in plain English, compile, import/export, and restore that keeps hidden items. Saving is safe and checks everything first.
- [x] **`apps-script/PanelServer.gs`:** the 15 functions the panel calls. Links CSV with a formula guard. Recording and checking the web app address.
- [x] **`apps-script/Panel.html`:** the control panel, with 10 sections:
  - Home, Questions (with a rule builder), Areas & problems, Support questions, Texts & translations;
  - Look & feel, Rounds (with "What changed"), Links (CSV), Publish (checks, Preview, Publish, history, Restore, GitHub copy), Settings.
- [x] **Form, live mode:** loads the published questionnaire in one request and falls back to its own copy. Preview links (`&pk=`); "closed" and "not open yet" screens.
- [x] **`scripts/generate_links.py`:** tokens identical to Code.gs (checked against an imitation of Google's functions; the live smoke test in item 11 will confirm it on Google). It adds `&mock=1` only for local test links.
- [x] **`.github/workflows/deploy-pages.yml`:** runs the settings check, then publishes `web/`. Actions are pinned to commit SHAs.
- [x] **Docs:**
  - `apps-script/README.md`: setup guide, Parts A–G.
  - `docs/control-panel.md`: user guide.
  - `docs/control-panel-design.md`: technical contract.
- [x] **Independent review** (security, real-Google compatibility, a non-technical walkthrough, docs). All 7 security findings are fixed.
- [x] **Review fixes F1–F3** (20 Oct 20:01–20:42 IST). Two calls Google doesn't have are fixed, either of which would have crashed saving or publishing:
  - `Range.clearContents` became `Range.clearContent`;
  - `MimeType.JSON` became `'application/json'`.

  Also:
  - restore keeps hidden items;
  - checks name "question N" with its text;
  - the web app address is recorded and checked in the panel;
  - an admin lock separate from partners' submissions;
  - codes lock only once a round opens;
  - files are handed to the owner (best effort; voice notes and the main folder were added on 21 Oct, item 3);
  - a permission re-prompt;
  - DC ids are kept as plain text;
  - panel warnings: opening a round with an unpublished draft, the newest round by default, the conflict dialog, fitting small screens.
- [x] **The fix run was stopped on purpose** (20:43 IST), because of Pranav's 20:32 instruction to re-check before writing any more code (spec §4). Claude let the three running fixers finish, since stopping them would have left files half-changed. The docs agent (F4) and strict-test agent (F5) were stopped before they changed anything; their work is now items 5 and 6.

### Phase 2, the approved remaining work (21 Oct)

- [x] **Item 1: the test suites are back, in `tests/`** (done ~10:19 IST).
  - **Rebuilt** from the session records by replaying every recorded write, edit and patch script in order, under a guard that blocked any change outside the test folders.
  - **Proof it's exact:** 24 of 24 fingerprints recorded on 20 Oct match. `e2e.js` and `flow_test.js` have the same SHA-256 (5075f046… and eb434788…), and 22 other files have the same byte size. Every suite then gave exactly the 20 Oct results, including the Google imitation's 19 failed checks and 4 warnings out of 1,528, in the same 7 scenarios, with its self-test at 32/32.
  - **Moved into the project:** `tests/` with a README, pinned tool versions (`puppeteer-core` 23.11.1, `acorn` 8.14.0) and git rules that keep screenshots and test data out of git. Only paths and location notes changed (checked line by line), and a search finds no personal paths. Every suite gives the same results from there.
  - **Kept as well:** a check that a save shrinking every tab works (it fails, as it should, when the old crash is planted back in a copy), and the "do the tests catch mistakes?" tool, which catches 7 of its 11 planted mistakes (the other 4 no longer apply to today's code; item 6).
- [x] **Item 2: test rounds never lock the questionnaire codes** (done ~10:21 IST; decision 1).
  - Rounds whose id starts with SMOKE, DEMO or TEST (in capitals or not) never lock the codes, in both checks (`ROUNDS_EVER_OPENED`, and the scan for open or closed rounds).
  - The panel now says "This locks the codes" before the first real round opens, and says a test round won't.
  - README (steps 9 and 11), the setup guide (step 14) and the user guide now say: put the real problem list in before the first real round.
  - Tests: 12 new fix checks and one new panel-bench step.
- [x] **Item 3: Google-side safety fixes** (done ~10:47 IST; decisions 2 and 8).
  - **Permission re-prompt:** if Google's newer re-prompt fails for any other reason, the menu item carries on instead of failing; a real permission stop still goes through.
  - **"Authorization is required":** one message on both sides, word for word, giving both causes with the likely one first (another Google account, then "tick Select all"). The panel no longer overwrites messages the server already explained.
  - **GitHub copy without a web app address:** `survey.json` stays in test mode (`"mock"`), so it passes the settings check (it's now byte-identical to the repo's own copy), and the panel shows the warning.
  - **Panel wording:** the web app address is used by the GitHub copy, not by links or checks.
  - **Owner hand-over:** voice notes, and a main folder a co-admin had to create, now go to the owner too (best effort, as before).
  - **`nps` and `support_gate`:** the panel never deletes them or changes their code (they can still be hidden), and the checks warn if one goes missing.
  - **An empty new round** is no longer an unpublished change, so no needless "Publish first".
  - **Added (a hole the critics found):** when Google Drive has a passing problem reading the live version, the panel keeps every code locked and says why, instead of showing everything unlocked.
  - Tests: 3 new logic tests, 21 new fix checks and 2 new panel-bench steps.
  - **Found on the way:** the panel bench's test server garbled Hindi characters that straddled two network chunks, so a save could look changed when it wasn't. Fixed (developer tooling only; the real panel talks to Google).
- [x] **Item 4: no personal details in files headed for the public repo** (done ~10:54 IST).
  - This Mac's folder path (15 places) became `~/NPSF`, explained once in README step 2; Pranav's work email (7 places) became "your company Google account" or an obviously made-up example. A scan of every file git would add finds no path, user name or email left.
  - `web/audio/README.md` now explains Phase 2 clips: list them in the Sheet's Audio clips tab and Publish; `audio_clips.json` is the backup copy.
  - The two Phase-1 settings notes (`read_aloud._help`, `whats_changed._help`) are rewritten in `web/config/survey.json` and in Model.gs's copy, so the GitHub copy stays byte-identical to the repo file.
  - New `scripts/requirements.txt`: nothing to install (Python 3.11+ standard library only).
  - Checks: settings check 0 errors; logic 192/192; fix checks 81/81 and 36/36; flow 8/8; Google imitation unchanged.
- [x] **Item 5: every guide and contract matches the code** (done 12:01 IST; workflow `wf_fb839446-008`, 4 writers, each checked by its own verifier).
  - **Setup guide:** step 10 now records the web app address in the panel (anchor `#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel`; step numbers unchanged), the single "Authorization is required" advice, Part G (a colleague without the Drive folder), the smoke test's new fake DC per run.
  - **User guide, README, settings guide:** what Restore keeps and drops, the code lock at the first real round, the protected `nps`/`support_gate`, many new messages; a partner resumes where they stopped.
  - **Technical contract:** the allowed-calls list is rebuilt from the code and matches it both ways (`MimeType.JSON` is on a "never use" list); the 28 stale items and 8 missing topics are fixed; the test-server differences table.
  - **Data contract and CHANGELOG [0.2.0]:** limits, check order, the row-counting rule, unused voice-note files, never-seen rounds are `draft`, the test-data rule (§9 point 6); 11 Code.gs comments and the app.js/net.js headers corrected, proven comment-only with an acorn syntax-tree comparison.
  - **Verified:** about 1,000 statements checked against the code by the 3 doc verifiers; 23 corrected in place.
- [x] **Item 6: the Google imitation is strict and complete; the smoke test is repeatable** (done 12:01 IST, same workflow).
  - The fake Google has no global `MimeType.JSON` and offers the document lock, `requireAllScopes` and `setOwner` as Google documents them; its allowed list equals the contract's.
  - The 7 outdated expectations match the intended code (none weakened); B2 now opens a round first. New scenarios G1–G9 (G9 added by Claude at 12:08 for today's late fixes).
  - Result: 41 passed, 1 with a warning (S: open question 14), 0 failed (42 scenarios, 1,821 checks); self-test 41/41; `tools/plant-bugs.py` catches 32 of 32 planted mistakes, and the verifier's own 14 extra mistakes were all caught too.
  - `scripts/smoke_test.py`: a new fake DC per run (`DC-SMOKE-<date>-<time>-<4 hex>`), optional `--dc`, check 3 follows the published languages. `tests/gas-harness/server.js --open-round` now adds a missing round (e.g. SMOKE-R1) and prints the in-memory test secret: the strict smoke test passes 9/9 against it.
- [x] **Item 8: panel polish** (done ~12:05 IST).
  - The problem list says "question N" like the messages; "Go there" decides by the problem (`isRuleIssue`), not by the question's own words.
  - `scripts/check_config.py` and the panel now use the same rules: a logo or clip may be an `https://` address or a path inside `web/`; round names are 1–64 letters, digits, `-` or `_` (an error in both). The panel newly checks read-aloud clips (`PP_mdlCheckClips_`: a bad address, or a clip for a text that doesn't exist).
  - **Fixes from the agents' reports:** the "address saved" toast; no "run Set up or repair" hint under messages that carry their own advice; the Restore and Publish dialogs say what is kept, dropped and skipped; taking a test-mode `survey.json` asks first (`askIfTestMode`); **a real round opened before anything is published keeps every code locked** (`live_ids_unknown = locked && !live`, with its own note).
  - Tests: 3 new logic tests (they fail on the old code), 4 new fix checks, panel bench 52/52 with new checks and a new step, harness G9 and 3 new planted mistakes.
- [x] **Item 9: form polish** (done 12:15 IST; the full end-to-end run passes 23/23).
  - No progress bar on "link not valid"; an incomplete link (no token in a live link, or an unusable DC or round) no longer downloads the questionnaire (`linkComplete()`); a preview link without a round no longer claims the draft failed to load; a published questionnaire that breaks the form at start-up falls back to the form's own copy (`bindEvents()` runs once); speakers on the "Tell us more" and support comment headings.
  - e2e: new scenarios W and X, new checks in D, E and S. On the old code D, E, S and X fail; X also fails without the bind-once guard.
- [x] **Item 7: full regression and an independent review** (done 16:45 IST).
  - **Regression:** every suite green at 12:04–12:15 and again after the review fixes (see Tests).
  - **Review:** the first run (5 reviewers, 12:17) was cut off by the usage limit. The lean rerun (`wf_dbd94fea-4d1`, 3 read-only reviewers limited to today's changes) found 9 problems; Claude confirmed each in the code and fixed all of them:
    - **high:** files for the GitHub copy prepared before the web app address was recorded stayed downloadable without the test-mode question (Panel.html `saveWebAppUrl` now clears them; `askIfTestMode` decides by the prepared file);
    - **medium:** a round whose name has a dot could be opened and then block every Publish (`PP_SRV.ROUND_RULE` on opening); previewing a draft that breaks the form blamed the link (new text `dev.preview_broken`); e2e W could not fail on this Mac, which has a Hindi voice (W now hides Hindi voices);
    - **low:** the fallback's first attempt could count a resume (it now restores the saved progress); the set-up hint under the panel's own advice (`hasOwnAdvice`); the "nothing published yet" note's wording; two doc statements (submission-format §4, CLAUDE.md).
  - New checks prove each fix: e2e W and X fail on mutated copies (speaker not following the wording, no state restore, no `draftBroken`); bench checks for the old files and the hint; harness G9 and planted mistake `dotted-round-opens` (33 of 33 caught).
  - **Note:** two Google-imitation runs at ~15:20–16:25 crawled (E1 took 17 minutes) and one end-to-end run crashed Chrome once. Rerun alone, E1 took 11 s and the full imitation 38 s: a passing slowdown of this Mac, not the code.

### Phase 2, the Meesho-only mode (21 Oct, ~18:00–20:50 IST; Pranav's request)

**Why:** Meesho's Google Workspace offers "Who has access: Anyone within Meesho" for the web app, but not "Anyone". The GitHub Pages form can't use such a web app: its background requests carry no Google login (by design), so Google refuses them. Pranav's plan: run Meesho-only for the BU head demo, then switch to "Anyone" once IT allows it.

- [x] **The web app serves the survey page itself** to signed-in colleagues (Code.gs `PP_formPage_`): a GET without `action` but with `dc`, `round` or `preview`.
  - The page is the form's `index.html` from the GitHub Pages address (cached 10 min), with its files made absolute and `window.PP_EMBED = {base, params, page}` added (escaped, so a link can't break out of it).
  - Its requests go through `google.script.run.ppFormRequest` (bootstrap, ping, submit). The health answer gains `form_page: true`.
  - If GitHub Pages can't be reached, visitors get a short "could not be loaded just now" page.
- [x] **The form** (`web/js`) reads `PP_EMBED`: `PP.params`, `PP.assetUrl` (logo, clips, settings files), net.js's `scriptCall`, and app.js's `reloadPage` for Start again and Retry.
- [x] **Check and save** accepts a sign-in-protected address when a signed-in retry (`ScriptApp.getOAuthToken()`) gets this web app's health answer with `form_page`, and records `WEB_APP_ACCESS = domain`. While `domain`:
  - links and Preview open through the web app (links made earlier are made again even with "only DCs without a link");
  - the GitHub copy stays in test mode, with a warning;
  - the panel shows Meesho-only notes on Home and Links.

  Check and save again after the switch to "Anyone" puts everything back.
- [x] **Security:** a page Google serves can call every public server function, running as the owner. `PP_requireAdminCaller_` lets admin functions run only from inside the Sheet (its menu or the panel window, where `SpreadsheetApp.getUi()` works), in `PP_forPanel_` and every `pp…` menu function. `PP_ensureRoundStore` became private.
- [x] **Independent review** `wf_8bcc034a-679` (security; behaviour on real Google): 7 findings, all confirmed and fixed.
  - **SEC-1 (medium):** the first admin check still let the owner and Sheet editors call admin functions from a served page, which runs the form's scripts from GitHub. Now only the Sheet itself can.
  - **SEC-2 (low):** that check's "same user" shortcut would have let every colleague in, had the web app ever been deployed as "User accessing the web app". Gone with SEC-1's fix.
  - **F1 (medium):** Start again and Retry reloaded only Google's inner frame. They now reopen the page's own address.
  - **F2 (medium):** after a switch, "Make the links again" kept the old links. Links with the other address are now made again.
  - **F3 (medium):** a deployment still running older code was saved as Meesho-only, so its links would show raw JSON. Now refused, with the fix (Version: New version).
  - **F4 (low):** the page's viewport let the keyboard cover the Next bar. Fixed.
  - **F5 (low):** when the signed-in check failed, the message hid the reason. It now explains.
- [x] **Tests:** Google imitation scenario G10 (73 checks), 8 new planted mistakes (41 of 41 caught), a panel-bench step (53), end-to-end scenario Y (the form served from another path with a stand-in `google.script.run`; 24). The full regression at 20:47 IST is green (see Tests).
- [x] **Docs:** setup guide steps 8–10, user guide (Meesho-only section and troubleshooting), technical contract §2, §12, §13, §18 and §19, data contract, CHANGELOG, spec §4 and §5, CLAUDE.md, README step 4, test guides.

**Known limits on real Google (not testable here):**
- Voice notes may not work inside Google's page (the microphone in Google's frame); typing always works.
- The signed-in check can't tell "Anyone within meesho.com" from "Only myself": the panel's note and the setup guide say to check that.
- The signed-in health check has never run on real Google.
- With several Google accounts in one Chrome, Google may pick the wrong one: use a Chrome profile signed in only with the Meesho account.
- **Seen on 23 Oct (a colleague's phone):** a Meesho-only link opened inside Instagram's built-in browser shows Google's "Sorry, unable to open the file at this time" before our code runs: that browser isn't signed in to her Meesho account. Fix: open it in Chrome/Safari signed in with Meesho. Added to the troubleshooting rows of docs/control-panel.md and apps-script/README.md, plus "use a computer for the panel" (the Sheets phone app has no Partner Pulse menu). Real partners won't hit this once the access is "Anyone".

## Half-done and known gaps

**Must be settled at or before the hand-off:**
- **Never run on real Google (main risk).**
  - `PP_hasMethod_` relies on `'getDocumentLock' in LockService`. If that's false on Google, admins silently share the partners' lock.
  - The same kind of test guards the permission re-prompt (`'requireAllScopes' in ScriptApp`). If it's false, Google silently never re-asks. A short check in the Apps Script editor settles both (item 11).
  - File downloads from the panel use a blob link inside Google's sandbox.
  - **Scale:** links for ~10,000 DCs come back to the panel as one CSV of about 2 MB, and every partner request reads all Script Properties, which counts against a Google quota. Neither is tested at that size.
  - **Owner hand-over** works only inside one Google Workspace domain.
  - **Google's real error texts** are unknown. For example, "You do not have permission to call" matches neither the server's rule nor the panel's.
  - **Checked only against an imitation or the mock server:** the token formula; the way the form sends answers from GitHub Pages to Google (as plain text, so the browser asks for no extra permission); Google's hand-off to its answer address; and the form's first request (the bootstrap). The live smoke test (item 11) covers them.

**Smaller:**
- **Restore** deletes the "What changed" bullets of every round the restored version didn't have (open question 12, below); the Restore dialog now says so. A hidden area that comes back with a restore brings its problems back switched off, so switching the area on later means switching its problems on too.
- **A colleague without the Drive folder** loses the panel on and off (whenever Google's short-term copy of the live version has expired). The guides say so; real Google may differ.
- **One 20 Oct fix is guarded only by `tests/fixes/verify.js`:** searches that read one column instead of the whole tab. Every other fix is also in the Google imitation.
- **Read-aloud on the language screen:** none; whether that's an accepted exception is open question 11, below.

**Not done yet (expected):**
- **Pushed:** Phase 1 (`25c2bfd`) and Phase 2 (`1c99b5e`) are on GitHub (both rewritten at ~17:35 to remove the folder path and the work email, open question 13).
- **Committed locally, not pushed:** the Meesho-only mode, one commit on top of `1c99b5e`.
- **GitHub Pages is on** (Pranav, ~18:00). The Sheet and the web app: Pranav was setting them up when he found "Anyone" missing. The form's `survey.json` stays in `mock` mode until "Anyone" is allowed.

## Next: Phase 2 remaining work (approved by Pranav, 21 Oct ~08:45 IST; do in this order)

**A. Must do before the hand-off**
1. ~~Rebuild the test suites into `tests/`.~~ **Done** (see Done).
2. ~~Fix the code-lock trap (decision 1).~~ **Done.**
3. ~~Safety fixes in the Google code (decisions 2 and 8).~~ **Done.**
4. ~~Remove personal details from files headed for the public repo, and fix the two Phase-1 settings notes.~~ **Done** (details below kept for the record).
   - **The Mac path:** `web/audio/README.md`, README.md, apps-script/README.md, docs/config-guide.md and docs/control-panel.md. Write "your project folder" instead, for example `cd ~/NPSF`. (The copies already in the Phase 1 commit: open question 13.)
   - **Pranav's work email** (apps-script/README.md, docs/control-panel.md): "your company Google account" instead, with an obviously made-up example.
   - Rewrite `web/audio/README.md`'s clip instructions for Phase 2: live clips come from the Sheet's Audio clips tab, and `audio_clips.json` is only the backup copy.
   - The two notes are `read_aloud._help` and `whats_changed._help` in `web/config/survey.json` (Model.gs keeps a copy of these texts for the GitHub copy; change both).
   - Add `scripts/requirements.txt`, saying the scripts need only Python 3.11+ and its standard library (the brief asks for one per folder; spec §5).
5. ~~Bring every guide and contract up to date.~~ **Done** (see Done; the original list is kept below for the record).
   (The stopped F4 job, plus the re-check's list:)
   - setup guide (the step to record the web app address; the "Authorization is required" advice);
   - user guide, README (including what Restore keeps and drops, and that a colleague without the Drive folder soon can't open the panel);
   - design contract (allowed list without `MimeType.JSON`);
   - data contract, CHANGELOG [0.2.0]. The data contract also gets the rule for counting rows in the other tabs (CLAUDE.md, Pipeline), the order of the voice-note checks, unused voice-note files and the payload limits;
   - `docs/config-guide.md`: three statements (the box saying four settings live only in `survey.json`, the GitHub copy's version stamp, the `apps_script_url` rules);
   - code comments that contradict the code: the headers of `web/js/app.js` and `web/js/net.js`, and six in Code.gs (draft "never cached", `PP_checkSubmit_`, the "seed" tab, the folder helper, `PP_restore`, and "never half of it");
   - **the 21 Oct changes** (items 2–3), in the contract, the user guide and the CHANGELOG: `codes_locked` and the test-round rule (`PP_isTestRound_`); `live_ids_unknown`; the GitHub copy's test mode without an address; the `nps`/`support_gate` warning and protection; owner hand-over of voice notes and the main folder; the guarded re-prompt; the single "Authorization is required" message; empty new rounds.
6. ~~Make the Google imitation strict and complete.~~ **Done** (see Done; the original list is kept below). Open question 14 still decides the scenario S warning.
   (The stopped F5 job:)
   - update the 7 outdated expectations;
   - add scenarios for every fix (admin lock, permission re-prompt, owner hand-over, web app address, code lock including test rounds, shrinking saves, and the 21 Oct fixes), or run the checks in `tests/fixes/` as part of it;
   - remove the global `MimeType.JSON` from the fake Google (and from the contract's allowed list, item 5);
   - make scenario B2 open a round first and look for the chips warning;
   - settle the old `var` style warning in scenario S (open question 14);
   - refresh the 4 planted mistakes the code no longer matches (`tools/plant-bugs.py`);
   - make the smoke test safe to repeat on the live backend.
7. ~~**Full regression of every suite**, plus one independent review of all of today's changes.~~ **Done** (see Done).

**B. Should do (small, low risk)**

8. ~~**Panel polish:** "question N" in the problem list; "Go there" fix; the panel's checks agree with `check_config.py`.~~ **Done**, plus 5 fixes from the agents' reports.
9. ~~**Form polish:** the bad-link progress bar, the preview banner, no questionnaire download for incomplete links, falling back when a published questionnaire breaks, read-aloud on the two missing headings.~~ **Done** (the full end-to-end run confirms it).

**C. Hand-off**

10. **Commit Phase 2 locally**, only with Pranav's OK, and no push.
10. ~~**Commit Phase 2 locally**, only with Pranav's OK, and no push.~~ **Done** 21 Oct ~16:55 IST (`git log` shows it on top of `25c2bfd`). Nothing is pushed.
11. **Phase 2 hand-off checklist** for Pranav (STOP for review). What Pranav does by hand, in this order:
    0. **Decide open questions 11, 12 and 14** (below, and spec §6). Question 13 is decided and done: the commits were cleaned before the first push.
    1. ~~**Push to GitHub.**~~ **Done** (21 Oct, `1c99b5e`).
    2. ~~**Switch on GitHub Pages.**~~ **Done** (21 Oct). The form shows a TEST MODE banner: send no links from it yet.
    3. ~~**Create the Sheet, paste the four code files, run Set up or repair, check version 1.**~~ **Done** by Pranav (21 Oct evening); the web app is deployed as "Anyone within Meesho".
    4. **Put the backend online:** IT doesn't offer "Anyone" yet (21 Oct), so for now deploy as "Anyone within meesho.com" (the Meesho-only mode; steps under "Exact next action"). Once IT allows "Anyone": Deploy > Manage deployments > Edit > Who has access: Anyone, Check and save again in the panel, Make links again, and check in an Incognito window (setup guide steps 8–11).
    5. **New, 2 minutes: check two Google features.** In the Apps Script editor: **+** > **Script**, name it `checkGoogle`, paste `function checkGoogle() { console.log('getDocumentLock' in LockService, 'requireAllScopes' in ScriptApp); }`, save, pick `checkGoogle` in the function menu, click **Run**, and read the Execution log. It must say `true true` (otherwise admins share the partners' lock, and Google never re-asks for permissions). Then delete that file (⋮ > Delete) and send Claude the result.
    6. **Connect the form:** setup guide Part D, steps 12–13 (the recorded address goes into `web/config/survey.json` through **Publish > Backup copy in GitHub**), then push.
    7. **Live smoke test:** setup guide Part E, steps 14–16. It must end with "All 9 checks passed"; it is safe to run again (a new fake DC each run).
    8. **Phone test** with a fake DC's link: setup guide Part F, step 17.
    9. **New: make links once for the full DC list** (about 10,000) in a test round, to check the time and the size of the CSV (about 2 MB). Don't send them, and delete the file afterwards.
    10. **Share the Sheet and the Drive folder** with colleagues: setup guide Part G, step 18. **In progress** (22 Oct 14:27 IST): Pranav is adding his first co-admin. Claude's answer: Share the Sheet as Editor, then Partner Pulse > Share the Drive folder with all editors; the colleague opens the panel from the Sheet's menu (there is no separate panel link) and allows every permission (Select all) the first time.
    11. **Before the first real round:** the real problem list (taxonomy), translations read by native speakers, and Valmo's colours and logo (README steps 9–11). Opening the first real round locks the codes.

**Later (Phase 5, or when needed):**
- keep codes that were ever answered locked even after hiding;
- make helper functions private;
- remove the unused `panelSetFormUrl`;
- an audio-clip editor in the panel;
- skip downloading the form's own `survey.json` when the live one arrives.

**Timing:** the hand-off happened at ~16:55 IST (estimated at 12:15 for ~15:30–16:00); the Meesho-only mode took ~18:00–20:54 IST (estimated ~21:30–22:00).

## Decisions: all 8 answered on 21 Oct (Pranav accepted every recommendation; details in [spec.md §6](spec.md#6-open-questions))

1. **Test rounds:** rounds whose id starts with SMOKE, DEMO or TEST never lock codes. Built (item 2).
2. **"Authorization is required":** one message giving both likely causes, the most likely first. Built (item 3).
3. **Link secret:** stays revealable in the panel (type SHOW) for the offline link script, with its warnings.
4. **Storage:** keep one data spreadsheet per round.
5. **DC ids Sheets stored as numbers** (e.g. 12345): keep skipping them with "type the id as text".
6. **Test suites:** rebuild them into `tests/` inside the repo. Done (item 1).
7. **Form address:** `https://pranavakellaps37.github.io/NPS-Form-/` is confirmed.
8. **`nps` and `support_gate` codes:** protected; the panel won't delete or re-code them. Built (item 3).

Four new questions came out of the critics' check on 21 Oct; they're under "Waiting for Pranav" below.

## Waiting for Pranav (inputs and manual steps)

**Flow-graph refactor (22 Oct):** approve or not, the scope (stages), and the 13 decisions in [flow-graph-proposal.md §16](flow-graph-proposal.md#16-open-decisions-for-pranav-recommendation-first). Includes whether to do the ½-day quick fixes now (nps/support_gate type lock, immediate-mode warning, language buttons first).

**Questions [UNCONFIRMED]** (details in [spec.md §6](spec.md#6-open-questions), items 11–14; Claude's recommendation after each). Claude will raise them at the Phase 2 hand-off; none blocks the remaining work.
- **11. No speaker on the language screen.** Recommended: accept it as the one exception, since links normally carry the partner's language and most partners never see that screen.
- **12. Restore deletes the "What changed" text of rounds the old version didn't have.** Recommended: keep that text (a small change in Model.gs).
- **13. Decided and done (21 Oct ~17:35):** both local commits were cleaned before the first push (the folder path became `~/NPSF`; the author email became GitHub's no-reply address). See spec §6 item 13.
- **14. An old style warning in the Google imitation (Model.gs's `var` lists).** Recommended: relax the rule for those lists, a small change in the imitation's static checks (developer-only; nothing changes for partners). The design contract already allows them since 21 Oct; the imitation's scenario S still warns until Pranav decides.

**Inputs:**
- the real issue taxonomy;
- ta/te/kn/ml translations by native speakers;
- a native Hindi speaker's read-through of the Hindi on a phone;
- Valmo brand colours (hex), and a logo file (optional);
- confirmation of the DC id format (letters, digits, `_ . -`; at most 64 characters);
- the Sheet ID, once the Sheet exists (Phase 3 needs it).

**At the hand-off:**
- a GitHub personal access token (this Mac has no GitHub login);
- the company Google account;
- **IT permission for "Anyone"** on Apps Script web apps (21 Oct: Meesho's Google offers only "Anyone within Meesho"). Partners outside Meesho can't open the survey until IT allows it; until then only the Meesho-only demo works.

## Tests: where they live and the last results

All developer suites are in [`tests/`](../tests/README.md): run `cd tests && npm install` once, then each command from the project folder. Results of 21 Oct, after the Meesho-only review fixes (the code that is committed):

| Suite | Command | Last run (21 Oct, IST) | Result |
|---|---|---|---|
| Flow rules | `node tests/flow/flow_test.js` | 20:50 | 8/8 pass |
| Questionnaire logic | `node tests/model/test_model.js` | 20:50 | 195/195 pass |
| Shrinking save | `node tests/model/strict/shrink_check.js` | 20:50 | pass |
| Fix checks | `node tests/fixes/verify.js`, `node tests/fixes/verify-locks.js` | 20:50 | 81/81 and 40/40 pass |
| Google imitation | `node tests/gas-harness/run-tests.js` | ~20:42 | 42 pass, 1 warn (S: Model.gs `var` lists, open question 14), 0 fail; 43 scenarios, 1,895 checks; 38 s. Self-test 41/41 (20:52) |
| Planted mistakes | `cd tests/gas-harness && python3 tools/plant-bugs.py` | 20:50 | 41 of 41 caught |
| Control panel bench | `node tests/panel/test.js` | ~20:44 | 53/53 pass |
| Form, end to end | `node tests/e2e/e2e.js` | ~20:46 | 24/24 pass |
| Settings check | `python3 scripts/check_config.py` | 20:50 | 0 errors, 1 expected warning (the demo round is fake); page weight 74% of 300 KB |
| Smoke test, fresh local test server | `python3 scripts/smoke_test.py --url http://localhost:8992/api` | 20:53 | 9/9 |
| Smoke test, Google imitation (strict) | `node tests/gas-harness/server.js --setup --open-round SMOKE-R1 --port 8974`, then `--url http://127.0.0.1:8975/exec --secret … --expect-strict` | 20:47 | 9/9 |
| Python compile | (all `scripts/*.py`) | 20:50 | 5/5 |

The four browser suites ran one after another in one background run that ended at 20:47 (its log is in the session scratchpad, `regression-final.log`); the times marked ~ are estimated from that run.

For comparison, the morning (after item 3): logic 192/192, fix checks 81/81 and 36/36, Google imitation 26 pass / 2 warn / 5 fail (33 scenarios), planted mistakes 7 of 11, bench 50/50, end to end 21/21.

## What the re-check corrected in the compaction summary

68 specific claims were checked against the files. 63 were confirmed, 5 were slightly off, and none was missing:
- only 8 of the 15 "Phase 2" text keys are actually new;
- a git remote is already configured;
- there are 189 logic tests, not 180;
- `PP_RUN` has a fifth field, and there are two more storage keys;
- the owner hand-over didn't cover voice notes or the main folder (fixed 21 Oct, item 3).

The summary's file sizes were also out of date: Code.gs is 117 KB, Model.gs 183 KB, Panel.html 289 KB (20 Oct).

## Environment notes

- **Git:** on branch `main`: `25c2bfd` (Phase 1) and `1c99b5e` (Phase 2), both pushed; then the Meesho-only commit, local only. Their author email is `PranavAkellaPS37@users.noreply.github.com`, also this project's git email. The remote `origin` is `https://PranavAkellaPS37@github.com/PranavAkellaPS37/NPS-Form-.git` (the username is in the address because this Mac's Keychain holds a login for another GitHub account). A backup bundle of the commits before the clean-up is in the session scratchpad (`before-cleanup.bundle`).
- **Tests:** `tests/node_modules/` comes from `npm install` (git-ignored). The suites start their own local servers: run the browser suites one at a time. Claude's agents use a lock for that (scratchpad `lockrun.py`).
- **Agent runs today:** items 5–6 = workflow `wf_fb839446-008` (done 12:01 IST; every report and verdict is in its journal). The stopped 20 Oct fix run (`wf_c94fdce0-475`) is fully replaced by items 5–6.
- **Old test server:** gone since the 21 Oct restart. Start a fresh one with `python3 scripts/mock_server.py` when needed.
- **Evidence for re-checks:** the brief and the 20 Oct audit results are in the session scratchpad's `spec/` folder, and the replay tools that rebuilt the tests in its `rebuild-tools/` folder (both temporary; the session records can rebuild them).
- **Colleague status page:** guard and field guide in `.claude/status/` (local only, git-ignored).

## Exact next action

**28 Oct 12:48 IST: "Paste a route" DONE; STOPPED for Pranav's review (rule 3).** Final regression (`bash local_data/tools/regress.sh local_data/regress-28oct.log`, 12:33–12:46 IST, every suite exit 0): flow 26, legacy_diff no differences, check 99, sim 34, types 10, panel_rows 17, route_table 36, model 235/235, shrink OK, fixes 81 + 40, Flow.gs fresh (f6444937805f…, 773,671 bytes), check_config 0 errors (page 89%), ES5 9 files, harness 45 + 1 known warning (46), planted 85/85, bench 82/82, narrow OK, panel smoke clean, e2e 34/34. Personal-data scan of every changed/new file: clean (4 machine paths Claude had written into this file were replaced by descriptions).
- **COMMITTED LOCALLY at Pranav's "commit" (28 Oct 14:48 IST):** one commit "Paste a route: change the questions as one table (with the review's fixes)" on top of `16c3d66`, not pushed. `.gitignore` now lets the three fake test tables in `tests/flow/fixtures/route-table/` (*.csv, *.tsv) into the repo; every other csv/tsv stays ignored.
- **Pranav's checklist (sent 28 Oct ~12:50):** (0) done: "commit"; (1) `git push`, green tick; (2) paste **Flow, Model, PanelServer, Panel** (apps-script/README.md "This release: Paste a route"; Flow ~770 KB: check its last lines); (3) Deploy > Manage deployments > Edit > New version; (4) if Questions says "No questions yet": Settings > Import from GitHub > Import, Save; (5) try it: Copy the current route → Excel → add a row → copy all → Paste a route → Check → Map/Try a path of the pasted route → Use this route → Save → Preview; (6) Publish version 1; (7) optional: the AI way and the "NA" safety check.
- **[UNCONFIRMED] on real Google:** the panel window running the route code (fallback: panelRouteTable), the server call's speed, pasting the ~770 KB Flow.gs, copying after a server call ("Copy by hand" box otherwise).
- **Known gap (not fixed, CHANGELOG):** a question hidden in today's live version could change kind unnoticed.
- **After his review:** Phase 3 (pipeline) only after his sign-off; agents available again from 30 Oct 08:30 IST.

**28 Oct 12:33 IST: W8 code fixes DONE; docs + final regression by Claude (agents blocked by the weekly usage limit until 30 Oct 08:30 IST).** Workflow `wf_ed4e7989-8a8` ended ~04:20 IST (14.2 h): FMT, MDL and PNL finished (their full notes are in the workflow result the task output `wkp0dbcbt` (in this Mac\'s temporary session folder); the agents could not write report.md files); **DOCS and VERIFY failed: "You've hit your weekly limit · resets Oct 30 at 8:30am"** (DOCS had already edited README.md, config-guide.md, control-panel-design.md, tests/README.md, apps-script/README.md; not control-panel.md, flow-engine.md, CHANGELOG.md). Do not start agents before 30 Oct 08:30.
- **Fixed (agents' results):** FMT: findings 1–8, 10–15 in flow-panel.js (G5 run-on note in fromRows; liveKinds, rounds; route_table 36, panel_rows 17). MDL: Model.gs drops PP_mdlCheckRunIntoRoutes_ (G5 is an error; any "error" note blocks Publish), new PP_mdlCheckLiveKinds_ (Publish error when a live question's kind changes) + PP_mdlLiveKinds_, all messages in table words; model 235, harness 45 + 1, planted 85/85. PNL: `panelRouteTable(request)` server fallback (tools: status/fromTable/toTable/templateCsv/aiInstruction; 300 KB paste limit; admin-only via PP_forPanel_), live_ids.kinds (from PP_mdlLiveKinds_), rounds passed, "Compared with your draft" fold-out of changed texts, Support note, red G5 badges; bench 82 (new tests/panel/real_server.js).
- **Claude, 28 Oct:** reworded the 2 flow-panel.js comments naming the removed rule; added panelRouteTable to the harness's REQUIRED_FUNCTIONS (scenarios/setup.js) and to G10's refused-on-the-web-app list (scenarios/fixes.js); regenerated Flow.gs (773,671 bytes, fingerprint **f6444937805f…**). Full regression RUNNING (background, `bash local_data/tools/regress.sh local_data/regress-28oct.log`; last line = SUMMARY of exit codes).
- **Known gap (MDL, not fixed):** a question HIDDEN in today's live version could change kind and be shown again unnoticed (CODES_EVER_LIVE holds codes, not kinds; closing it = record "kind:<code>/<type>" entries). Rare; listed in the CHANGELOG's known gaps.
- **Docs DONE by Claude (12:40 IST):** control-panel.md (Recipe 2, route table reference, kinds, rules, errors (Publish now in table words), every new Check message quoted from the code via the scratchpad's `docmsg/msgs.js`, troubleshooting incl. the server fallback), flow-engine.md (§9.4 run-on = G5, live kinds; §9.8 options liveKinds/rounds, placeholders, headers, Screens tab, thank-you/ending rules, answers quoting, panelRouteTable, decisions, tests 36), CHANGELOG [0.3.1] dated 2026-10-28 (safety checks, four files, known gaps), apps-script/README.md (773,671 bytes, f6444937805f), tests/gas-harness/README.md (85; G12), CLAUDE.md (Questions view, tests 36/17/235/82/85). The DOCS agent's partial edits (README.md, config-guide.md, control-panel-design.md, tests/README.md, apps-script/README.md) checked: fine. Links: 0 broken (11 files). Spot checks (`docmsg/spot.js`): real words that look like placeholders kept; a ";" label round-trips in tsv/csv/markdown.
- **Next:** read the regression (`local_data/regress-28oct.log`; all suites up to e2e passed by 12:40), add its line to tests/README.md, status page, then STOP with Pranav's try-it list + release steps (push; paste Flow, Model, PanelServer, Panel; New version; Settings > Import from GitHub if still empty; Publish v1).

**27 Oct 14:07 IST: "Paste a route" BUILT; FIX ROUND W8 next.** Build run `wf_e38930f3-969` finished at ~14:00 IST (4/4 agents; result file the task output `wnm2t4x3l` (in this Mac\'s temporary session folder); reviewer's scratch experiments in the scratchpad's `build-w7/review/` (e1–e28.js, h.js/gm.js/p.js load the repo code)).
- **Built:** `web/js/flow-panel.js` "THE ROUTE AS A TABLE" (fromTable, toTable, templateCsv, aiInstruction, parseRule/ruleText, parseJumps/jumpsText; kinds written "0 to 10"/"faces" because Excel turns 0-10 into dates; header = row 1; empty cell keeps, missing column keeps; "always" turns off a standard skip); `tests/flow/route_table_test.js` 24 + fixtures `tests/flow/fixtures/route-table/`; Flow.gs regenerated (693 KB, fingerprint b9e2c277b758…); `apps-script/Panel.html` Questions = help line, card "1. Get the route as a table" (Copy the current route, Download the Excel template = partner-pulse-route.csv, Copy the instruction for Claude/ChatGPT), card "2. Paste a route" (Check/Ctrl+Enter, problems as "Row N · column", warnings, Map/Try a path on "The pasted route (not used yet)", Use this route + Undo), read-only "The route now"; old editors removed (page 358 KB); PanelServer.gs one message; bench 75 steps (fake server `noTable` option). Docs: control-panel.md (Recipe 1, new Recipe 2 Paste a route, table reference, old recipes as table examples, "When you Check a pasted route"), flow-engine.md §9.8 (table contract), CHANGELOG [0.3.1], tests/README.md, apps-script/README.md (Flow.gs ~680 KB; new release checklist).
- **Results (27 Oct, agents):** route_table 24, flow 26, check 99, sim 34, types 10, panel_rows 14, legacy_diff no differences, model 227, shrink OK, fixes OK, harness 45 + 1 known warning (46), planted 83/83, bench 75/75, narrow 30/30, panel smoke clean, e2e 34/34 (reviewer), check_config 0 errors (page 89%).
- **Review findings to fix (W8):** HIGH placeholder cells ("NA", "-", "—", "TBD", "(to be translated)") overwrite real Hindi/English with no warning. MEDIUM: (2) a route below the thank-you that runs into another route passes Check, Publish refuses (rule only in Model.gs PP_mdlCheckRunIntoRoutes_); (3) a live question's kind can change in one cell (neither Check nor Publish notices); (4) a 2nd "thank you" row with words replaces the MAIN thank-you's words ("end" alias → thank you); (5) AI formatting in answers (backticks, bold, bullets, numbering) becomes labels; a pick-one with 1 answer accepted (commas = one answer); (6) pasting the Sheet's Screens tab is accepted (texts become keys like "q.nps"); (7) a Hindi column titled in Devanagari is silently ignored; (8) AI-written Hindi is stored unflagged (never machine-translate); (9) the route tools are now the only way to change questions and "fails safe to the old editor" is no longer true (new Function in Google's frame + 693 KB Flow.gs unverified). LOW: (10) Publish/cards still name the removed editor (Model.gs 2581/2584/2725/2939/3068, fromRows 306/364/374/395, Panel.html Support note ~4148, comments PanelServer.gs 41, Model.gs 321); (11) a 2nd Markdown table / lines after the table dropped silently; (12) unknown round / wrong case in a rule never warned; (13) ";" inside an answer label breaks the round trip; (14) technical checker words for tables (ending with a rule, ending above the thank-you, language row moved); (15) aiInstruction gaps. Panel agent also: hidden-ending messages say "question 9" (flow-panel.js mainName). Docs agent also: stale editor descriptions in README.md (~724, ~811), CLAUDE.md (125, 130), config-guide.md (386, 1288), control-panel-design.md (~1019–1035).
- **W8 plan (Claude's decisions, rule 4):** phase 1 agent FMT (owns flow-panel.js, route_table_test.js + fixtures, panel_rows_test.js, Flow.gs regen): placeholder cells = empty cell + warning; warning for every non-English text new or changed vs a real translation (old → new, "keep it only if a person wrote it"); run-on rule moved INTO fromRows as an error note (one rule for Check, cards, Publish); live code + different kind = problem (opts.liveKinds, else the draft row's kind); only the main (first shown) "thank you" row writes thanks.*, a later one with words is read as an ending + warning, "end" alias → ending; answers: strip markers/backticks/bold, ≥2 answers for a shown pick-one (problem, hint about ";"), labels with ";" quoted in toTable; Screens-tab header and key-looking text cells = problems; Devanagari/native language names in headers, unknown non-Latin headers warned; a 2nd table merged when its header matches else refused, ignored lines after the table warned; opts.rounds → unknown/wrong-case round warning; ending with a rule / ending above the main thank-you = specific problems; fromRows messages in table words, mainName names rows like nameOf; aiInstruction lines (empty cells, exactly one thank you, end each route below the thank you, a real round id). Phase 2 in parallel: agent MDL (Model.gs + tests/model, gas-harness, fixes): drop PP_mdlCheckRunIntoRoutes_ for the fromRows note (parity kept), Publish error when a live question's kind changes, Model.gs messages in table words; agent PNL (Panel.html, PanelServer.gs, tests/panel): server fallback `panelRouteTable` (fromTable/toTable/templateCsv/aiInstruction run by Flow.gs on the server when the window can't run the route code), pass rounds + live kinds (PP_liveIdsOf_ adds kinds), list changed texts old → new in "Compared with your draft", Support note + any old-editor words. Phase 3 in parallel: docs agent (all guides + stale files) and an adversarial verifier re-running the review's experiments. Then Claude: fixes, full regression, CLAUDE.md, spec §4 rows, status page, Pranav's try-it list.
- **RUNNING (27 Oct, from 14:09 IST): fix round W8, workflow `wf_ed4e7989-8a8`** (task `wkp0dbcbt`; script the workflow script `paste-route-fixes-wf_ed4e7989-8a8.js` (in this Mac\'s Claude session folder); resume with Workflow `{scriptPath, resumeFromRunId: "wf_ed4e7989-8a8"}` if interrupted; agents write report.md files in the scratchpad's `build-w8/{fmt,mdl,pnl,docs,verify}/`; the review list for them: `build-w8/review-findings.md`). Checkpoint of the state before W8: `local_data/checkpoints/20261027-1407-before-w8.*` (diff vs 16c3d66, status, untracked files). The Mac is kept awake (caffeinate pid 16189, until ~21:45 IST).
  - **Progress 18:10 IST:** agent FMT (table reader) DONE at ~17:58 (it could not write report.md; its full notes are in the workflow journal the workflow journal of `wf_ed4e7989-8a8` (in this Mac\'s Claude session folder), before/after outputs of the review experiments in `build-w8/fmt/before` and `fmt/after`): findings 1–8 and 10–15 fixed in flow-panel.js; the run-on rule is fromRows note **G5** (level error; parity with Model.gs's rule on 3,000 generated routes, test in panel_rows_test.js); new fromTable options `liveKinds`, `rounds`; route_table 36 tests, panel_rows 17; Flow.gs regenerated: **773 KB**, fingerprint a462b534d5c4. Known until MDL/PNL finish: model 226/227 and bench 2 failures (old wording), harness flow.js line 277 wording. Agents MDL (Model.gs) and PNL (panel) running since ~17:58; then docs + verify. Caffeinate extended (8 h from 18:10).

**NEW MINI-PHASE (approved 27 Oct ~12:15 IST): "Paste a route"** (spec §4, same date). Pranav: build the paste box with both ways in, REMOVE question-by-question making and route editing from the panel, KEEP Map and Try a path. Also confirmed: the compaction failsafe (hooks in `.claude/settings.local.json`: PreCompact → `compact_guard.py snapshot`; SessionStart `compact` → `compact_guard.py resume`) is active.
- **Format (one for both ways): a table** ("pp-route-table/1"), pasted as tab-separated rows from Excel/Sheets, comma-separated, or a Markdown table (AI output). Header row, columns in any order, case-insensitive: `code | kind | question (English) | question (Hindi) | answers | required | show only if | then go to | jumps | ask for | show`.
  - kinds: built-ins `language`, `what changed`, `nps` (code nps), `area ratings`, `problem screens`, `support question` (code support_gate), `support ratings`, `thank you`, `ending` (question = title, a `message` column or the answers column = body); generic `0-10`, `faces`, `yes/no`, `pick one`, `voice/typing`, `info card`.
  - `answers` for pick one: `code: English label; code2: label` (Hindi labels in a `answers (Hindi)` column, same order); `required` yes/no; `show only if`: a small rule language: `nps <= 6`, `support_gate = yes`, `language = hi`, `round = 2026-R2`, `fn_rating:payments <= 2`, `one_fix answered`, combined with `and` / `or`; `then go to`: a later code or ending; `jumps`: `if nps >= 9 go to support_gate; if … go to …`; `ask for`: once / each area / each area rated low; `show`: yes/no (no = hidden: codes partners answered can't be deleted).
  - texts: English/Hindi become the text keys the panel already uses (q.<code>, choice.<code>.<option>, end.<code>.title/body); other languages get the standard [TRANSLATE] placeholders; never machine-translate (the AI instruction says: copy only the Hindi given).
- **Code plan:** `web/js/flow-panel.js`: `PP.flowPanel.fromTable(text, survey, strings)` → {rows, texts, problems} (plain-English problems with the row number), `toTable(rows, texts)` → the same table (round trip), the rule-language parser/printer (↔ show_if/jumps JSON); `apps-script/Panel.html` Questions view: a "Paste a route" card (paste box → Check: problems + Map preview of the pasted route via PP.flowCheck → "Use this route" replaces the draft's screens and their texts, then Save), "Copy the current route" (table), "Download the Excel template" (CSV with the header and today's route as example rows), "Copy the instruction for Claude/ChatGPT" (format, current area/problem codes, languages, an example, the no-translation rule); keep Map, Try a path and a read-only list with badges; remove Add a question, the per-question editor and its actions (jumps, usually go to, ask this question, endings, add/delete/hide/move). Server: no change expected (the panel saves the model as today); regenerate Flow.gs. Tests: Node tests for the parser and round trips (incl. today's route → table → route identical), bench steps for paste/check/use/copy/template/instruction, bench steps of the removed editors retired; docs: control-panel.md (Recipes rewritten around Paste a route), flow-engine.md §9, CHANGELOG, CLAUDE.md.
- **RUNNING (27 Oct, from ~12:25 IST): workflow `wf_e38930f3-969` "paste-a-route"** (format agent → panel agent → docs + review in parallel; scratch under the scratchpad's `build-w7/`; resume with Workflow `resumeFromRunId` on that id if interrupted). The repo was clean at `16c3d66` before it started (only STATE.md/spec.md edits since), so `git diff` shows exactly what this round changed. The Mac is kept awake (caffeinate, 10 h).
- **Then:** one review, full regression, STOP for Pranav with a short try-it list (export the current route, edit a row in Excel, paste back, Check, Use, Map, Try a path, Preview, Publish).
- **Still pending from before:** Pranav's Sheet is empty: Settings > Import from GitHub, then Publish version 1, then the smoke test; his Excel (if found) can be used to check the template.

**27 Oct ~12:00 IST: Pranav finds adding questions one by one too complicated** and asked whether (1) an AI-made flowchart image or (2) Excel → an AI → "code" could be pasted in to make the questions and the route. Claude's answer: both are possible and become one feature, a **"Paste a route" box** in the panel (proposed, NOT approved yet): input from an Excel template (copy rows, no AI), or text an AI writes from his notes/Excel/flowchart image using an instruction the panel provides; the panel checks it with the same checker as Publish, shows problems and the Map, then fills the Screens/Texts tabs on "Use this route"; Try a path, Preview, Publish as usual. Constraints told: the panel can't read images itself (paid AI, not free), images are less reliable; no machine translation (the AI keeps only the Hindi he wrote; other languages stay [TRANSLATE]). Estimate ~1–2 days of agent work with tests. Meanwhile he can paste his Excel or flowchart image into this chat and Claude fills his Sheet. **Waiting for:** his go-ahead on the paste box, and his Excel/image.

**27 Oct ~11:40 IST: Pranav asked how to build his own route in the panel** (he expected a drag-and-drop flowchart or an Excel upload; neither exists). Claude walked him through the as-built way (Questions list = the route; Add a question, ↑↓, Only show it if…, After this question › Add a jump / Usually go to, Ask this question (each area / rated low), Other routes and endings › Add an ending, Hide/Delete, Map, Try a path, Check for problems, Preview, Publish; docs/control-panel.md Recipes 2, 13–20), reminded him to import first (his Sheet is empty), and offered: **A** (recommended) he sends his Excel of planned questions and Claude writes it into his Sheet's tabs (Screens, Texts, options, rules, jumps, endings) for him to review and publish; **B** a reusable "Import questions from a spreadsheet" feature (~½–1 day with tests); **C** a drag-and-drop editor (much bigger, not recommended now). **Waiting for:** his Excel and whether he wants B.

**27 Oct 11:17 IST: Pranav's release check (screenshot).** He pushed (`origin/main` = `16c3d66`) and pasted the five files (the panel's route code `53be7368c09b…` = the new Flow.gs). (1) The Home banner "form on GitHub does not run the same route code" came from a check at 11:10, before GitHub Pages had published (it saw the old flow.js `74cf6149…`, flow-check.js 404); at 11:17 Pages served the new files, byte-identical to the repo (combined fingerprint `53be7368c09b…`): the banner clears at the next 10-minute check. (2) His Sheet's draft is EMPTY (0 screens/areas/languages, nothing published): set-up never deletes (PP_ensureHeaders_ only appends headings), so the questionnaire was most likely never imported (set-up's 'Copy the questionnaire from GitHub' prompt cancelled, or not offered because the Settings tab has rows). Told him: Settings > Import from GitHub > Import (raw.githubusercontent.com serves the four files, identical to the repo), then Publish version 1, then redo the smoke test and the pings check. Asked whether the Sheet had questions before today (if yes, find what emptied it).

**Flow-graph refactor: APPROVED and being built** (Pranav, 23 Oct ~10:05 IST: "approved - go to town"; every recommendation of [flow-graph-proposal.md §16](flow-graph-proposal.md) accepted; recorded in spec §4). The contract the code must follow is **[flow-engine.md](flow-engine.md)** (format `pp-flow/1`, engine API, step.keys, checker codes, commands).
- **Checkpoint before any code:** `local_data/checkpoints/20261023-1016-before-flow-build.*` (git diff, status, untracked files; git-ignored).
- **Build plan (stages of the proposal):**
  1. Workflow W1 = stages 1–3, **RUNNING: run `wf_8c8e6b42-5d8`** (started 10:19 IST 23 Oct; resume with Workflow `resumeFromRunId` if a compaction or crash interrupts it; agents write scratch work under the scratchpad's `build-w1/`). Agent E: `web/js/flow.js` rewritten from designer A's tested prototype (keeps the old API), `tests/flow/legacy/flow_v1.js` (frozen byte copy of today's engine), `tests/flow/legacy_diff.js` (permanent comparison), `tests/flow/flow_test.js` (+ graph cases). Then in parallel: agent F (form wiring: `app.js`, `net.js`, `screens.js`, `mock_server.py`, `smoke_test.py`, `scripts/dev/simulate.js`, e2e scenarios) and agent V (checker `web/js/flow-check.js`, `scripts/flow.js` + `scripts/flow.py` + root `package.json`, `docs/flow.md`, checker tests, `check_config.py` calling Node with the old Python flow checks removed after a parity test, a pinned Node step in `deploy-pages.yml`). Then 3 adversarial reviewers (engine equivalence; checker/tools; form in Chrome). Claude fixes what they confirm.
  - **Progress (16:05 IST):** agent E (engine) **done at 15:09** after ~5 h: `web/js/flow.js` rewritten (29.0 KB, page 79% of budget), frozen `tests/flow/legacy/flow_v1.js` (SHA-256 74cf6149…), `tests/flow/legacy_diff.js` (default 25 s, `--full` 6 min 46 s: no differences; 73 questionnaires; 1,411,788 sets per mode; ~42,000 Back taps), `tests/flow/flow_test.js` 23/23 (8 old + 15 graph), 25/25 planted engine bugs caught, model tests 195/195; two corrections to flow-engine.md (§4.3: an arrow loop throws; list `required` kept on rating/language nodes). Agents F (form wiring) and V (checker/tools) running since 15:09; then 3 reviewers.
  - **Started in parallel (16:05 IST): stage 4 server side, run `wf_8f71b2ea-836`** (one builder): new `web/js/flow-panel.js` (fromRows/toRows/formatFlow), `scripts/build_flow_gs.js` → `apps-script/Flow.gs`, Model.gs (3 columns, compile through fromLegacy, graph export/import/restore, `CODES_EVER_LIVE`), Code.gs (health fields, publish guard), PanelServer.gs (data only), tests/model, tests/gas-harness, `tests/flow/panel_rows_test.js`. It must not touch W1's files. Left for after W1: checker in PP_validate, Panel.html editors/Map/Try a path, panelOpen template, survey.json migration, docs.
  - **What happened on 23 Oct evening (found 26 Oct 08:14 IST):** the Mac went to sleep at ~15:22 (cutting off agent F's final report) and the account's usage limit hit at ~18:50 (stopping the 3 reviewers and the stage 4 builder's final report). Nothing was lost in the repo: agent V (checker/tools) finished with its report; agent F (form wiring) had finished its edits; the stage 4 builder had finished and verified its work at 16:04 (imitation 43 pass + 1 known warning, 44 scenarios). The reviewers never ran.
  - **State on 26 Oct 08:15 IST (re-tested by Claude):** flow rules 23/23, legacy comparison no differences (73 questionnaires), checker cases 79/79, CLI/tools 18/18, panel rows 14/14, model 211/211, shrinking save OK, fix checks pass, settings check 0 errors (page 82%), planted mistakes 56/56. Browser suites (imitation full, panel bench, e2e) rerunning. macOS cleaned the scratchpad's loose files (folders survived); the browser lock helper now lives at `local_data/tools/lockrun.py` (git-ignored). The Mac is kept awake with `caffeinate` (6 h) while agents run.
  - **Browser results (26 Oct 08:31 IST):** Google imitation 43 pass + 1 known warning (44 scenarios); end to end **30/30** (24 old + Z1–Z6 new: jump, group loop, two endings, stale answers, simulate drawer, unknown format); panel bench 52/53 after Claude fixed `tests/panel/real_model.js` to load `Flow.gs` (was 38/53). The 1 left: the bench's GitHub-copy export step expects the repo's `survey.json`, which is still a list while the export now writes the graph: fixed by migrating `survey.json` (stage 4, next).
  - **Next:** read the browser results; fix any e2e failures; a lean review round (smaller, narrower agents); then the rest of stage 4 (Panel.html editors/Map/Try a path, panelOpen template, PP_validate using PP.flowCheck, survey.json migration), stages 5–6, docs, full regression, Pranav's checklist.
  - **RUNNING (26 Oct, from ~08:35 IST): workflow W3 `wf_f60664ac-d86`** (resume with `resumeFromRunId` if interrupted): stage 4 completion (agent A: `scripts/flow.js migrate`/`build-gs`, migrate `web/config/survey.json` to the graph, `docs/flow.md`, PP_validate on `PP.flowCheck` after a parity test; owns Model.gs, Code.gs, Flow.gs, tests/model, tests/gas-harness) in parallel with the panel UI (agent B: Panel.html + PanelServer.gs + tests/panel: jump/next/repeat editors, endings, settings in editors, Map with pinned Mermaid + fallback, Try a path, fingerprint banner); then stage 6 (pings `config_version` column), then stage 5 (types as plug-ins: `web/js/types.js`, `ui.js`, generated `web/config/types.json`), then 2 read-only reviewers. Checkpoint of the passing state before W3: `local_data/checkpoints/20261026-0833-before-w3.*`.
  - **W3 DONE (26 Oct 08:35–14:05 IST, `wf_f60664ac-d86`, 6/6 agents; reports in `local_data/checkpoints/w3-results.txt`; checkpoint `local_data/checkpoints/20261026-1411-after-w3.*`):**
    - Stage 4 server: `web/config/survey.json` migrated to the graph (`scripts/flow.js migrate`), `docs/flow.md` regenerated, panel export = repo files byte for byte; PP_validate's route checks now come from `PP.flowCheck` after a parity test (221 drafts, 126 old problems all still reported, 25 intended new errors; frozen old Model.gs in `tests/model/legacy/`).
    - Stage 4 panel: engine/checker reach the window through the guarded call `panelFlowCode` (not a template; page 387 KB); badges, 'Other routes and endings', 'After this question' (usually go to + jumps), Repeat card, settings in the problem/support/ratings editors, Add an ending, Map (Mermaid 11.4.1 + SRI in a sandboxed frame, outline fallback), Try a path, Home fingerprint banner (own SHA-256 in PanelServer.gs).
    - Stage 6: `config_version` is the last pings column (new tabs at creation; older tabs get it on their first ping, under the script lock).
    - Stage 5: `PP.types` registry in flow.js; drawings in `web/js/types.js` + helpers `web/js/ui.js` (screens.js deleted); generated `web/config/types.json` (+ Model.gs PP_SCREEN_TYPES block) via `scripts/flow.js types --write`; a new kind = `web/js/types/<code>.js` + one script line; page weight 87%.
    - Results: flow 24, legacy_diff no differences, check 81, sim 23, panel_rows 14, types 9 (5,379 drawing comparisons old vs new), model 214, harness 44 + 1 known warning (45 scenarios, 2,045 checks), planted 70/70, bench 65/65, smoke 9/9 (mock and strict imitation), check_config 0 errors; e2e 27/30 (I, X, Z4 edit the flow as a list: patch ready).
    - **Review findings to fix next (W4):** HIGH hiding/deleting an extra ending lets a branch run into the next branch; MEDIUM codes lock compares bare codes (shared chip/option codes); Publish warnings never shown; live options can't be retired; survey-level deep_dive/rating/support settings ignored on phones after migration (docs still say edit them); plug-in re-registering a built-in kind; no ES5 gate for plug-in files; CLI ignores stray file arguments; a language switch can strand a partner (current screen leaves the route); setup guide still says four files (clasp drops Flow.gs); LOW: empty graph accepted, 'constructor' code, example kind sends ratings > 5, flow.js size vs §4.1, panel wording garbles, immediate-mode F1 should be a warning, added kinds unknown to Publish, Drive hiccup at first locked publish, export lacks docs/flow.md, Map 2.5 MB load with 5 s timeout.
  - **RUNNING (26 Oct, from 14:20 IST): fix round W4 `wf_c9b264fd-c7f`** (resume with `resumeFromRunId`): fixer P (phones/tools: e2e I/X/Z4 + graph variant, settings-drift check, plug-in re-registration refused, language-switch strand, ES5 gate `scripts/flow.js es5` + pinned acorn in CI, CLI positional refusal, stricter supportsFormat, own-key lookups, example kind, comments) in parallel with fixer G (Google/panel: hidden-ending fall-through HIGH, qualified codes lock, Publish warnings shown, live options, wording, immediate-mode warning, Drive hiccup refusal, docs/flow.md in the GitHub copy, Map outline-first, show_if facts, survey.json help notes); then a cross-cutting fixer (structured checker findings + answersAt for the panel; added kinds known to Publish via PP_ADDED_TYPES_; static check for the Map exception). After W4: docs round, full regression, Pranav's checklist.
  - **W4 fix round DONE (26 Oct 14:20–17:57 IST, `wf_c9b264fd-c7f`, 3/3 agents; reports in `local_data/checkpoints/w4-results.txt`):** every review finding fixed, each with a test that fails on the old code: hidden/deleted extra endings end the route at the main thank-you (+ run-on error); codes lock on qualified CODES_EVER_LIVE entries; Publish warnings shown; live options can't be removed (plain message); wording layer; immediate-mode leftovers = warning + Clear them; Publish refuses while codes are locked and Drive can't read the live version; GitHub copy has a 5th file `docs/flow.md`; Map outline-first (20 s); show_if offers language/round; survey.json/Model.gs help notes for the graph era; settings-drift check S1 (repo); plug-in re-registration refused; language switch keeps the partner's place (`place()`); ES5 gate `node scripts/flow.js es5` in check_config + pinned acorn 8.14.0 in CI; CLI refuses stray files and notes unknown --set keys; `PP.flow.isUsable` + `checkRoute()` (broken published graph → own copy); own-key lookups ('constructor'); example kind answers-only; structured findings (site/target/index) + `PP.flowCheck.answersAt` used by the panel; added kinds known to Publish (`PP_ADDED_TYPES_`); harness static check enforces the Map exception.
    - Results: flow 26, legacy_diff no differences, check 99, sim 34, types 10, panel_rows 14, model 227, shrink OK, fixes OK, harness 45 + 1 known warning (46 scenarios), planted 83/83, bench 71/71 (narrow 30/30, smoke clean), e2e **34/34**, check_config 0 errors (ES5 gate on; page 89%). Flow.gs fingerprint b3ab8b63d8f2….
    - **Left:** small code polish (voice.js own-keys; per-area repeat for added kinds from the catalogue; panel_rows_test hidden-ending cases; checker C1 note), all docs (flow-engine.md, control-panel-design.md, control-panel.md, config-guide.md, submission-format.md, apps-script/README.md five files, README.md commands, CHANGELOG, tests/README.md, CLAUDE.md, spec.md §4/§5), final full regression, Pranav's checklist; commit only if he asks.
  - **RUNNING (26 Oct, from ~17:55 IST): last round W5 `wf_3107c6c5-98d`** (resume with `resumeFromRunId`): code polish (voice.js own-keys; per-area repeat from the catalogue; hidden-ending fromRows tests; C1 note) + developer docs (flow-engine.md incl. new §9, control-panel-design.md, config-guide.md, submission-format.md, tests READMEs, CHANGELOG 0.3.0) + user guides (control-panel.md, apps-script/README.md five files, README.md). Claude recorded the build's decisions in spec §4 (3 rows) and a §5 row, and fixed a stale §5 row (requirements.txt). After W5: CLAUDE.md, full regression, status page, Pranav's checklist, ask about a local commit.
  - **W5 result (stopped by the usage limit at ~18:03 IST):** the user guides are DONE (docs/control-panel.md: 'How the route works' + Recipes 13–20, live answers, errors/warnings tables, troubleshooting, glossary; apps-script/README.md: five files, Flow row, 'This release' checklist, clasp line with Flow.gs; README.md: Node + acorn setup, flow tools section). The code polish had finished its edits (checked by Claude: per-area repeat from the kinds' `repeatable` flag in flow-panel.js and Panel.html `canRepeat`; voice.js own-keys; a C1 comment) but not its tests; Claude regenerated Flow.gs (474 KB, fingerprint 53be7368c09b…). The developer-docs agent wrote nothing.
  - **RUNNING (23:50 IST):** the final full regression (log `local_data/regress-final-26oct.log`) and a new developer-docs agent `wf_1eae4fe5-4d6` (writes file by file: flow-engine.md incl. §9–10, tests READMEs, CHANGELOG 0.3.0, config-guide.md, control-panel-design.md, submission-format.md). **Next:** read the regression; update CLAUDE.md (tests table, repo shape, Flow.gs, codes-lock hole closed); Pranav's checklist; ask him about a local commit.
  - **FINAL REGRESSION (27 Oct 00:07 IST, log `local_data/regress-final-26oct.log`):** flow 26/26, legacy_diff "No differences" (73 questionnaires), check 99, sim 34, types 10, panel_rows 14, model 227/227, shrink pass, fixes 81 + 40, check_config 0 errors + 1 expected warning (ES5 gate: 9 files all ES5; page 89%), Google imitation 45 pass + 1 known warning (46 scenarios), planted mistakes 83/83, narrow 30/30, **e2e 34/34**, panel bench 71/71 (a first combined run gave 48/71 from a Chrome stall; rerun alone 71/71, log `local_data/bench-final.log`). Flow.gs regenerated after the polish (474 KB, fingerprint 53be7368c09b…). Claude also updated CLAUDE.md (flow graph, five files, tests table, repo shape, conventions, codes lock), spec §4/§5, and fixed README's git-email advice (GitHub no-reply address; the repo is public). Personal-data scan of every changed/new file: clean.
  - **Developer docs DONE (`wf_1eae4fe5-4d6`, 27 Oct 00:15 IST):** all 7 files written and verified against the code (0 broken links/anchors); Claude corrected tests/README.md's 'last full run' to record the bench rerun (71/71). Nothing is left to build in this phase.
  - **PRANAV'S CHECKLIST (end of this phase):** (0) say "commit" (Claude makes one local commit on top of the Meesho-only commit `241e25d`) or follow the setup guide's step 1 himself; then the setup guide's section "This release: the route tools and the fifth file": (1) push and wait for GitHub's green tick (the workflow now installs Node 20 and acorn 8.14.0); (2) paste all five files (create `Flow` first; Flow.gs is ~474 KB); (3) Partner Pulse > Set up or repair (adds next/jumps/repeat to the Screens tab); (4) Deploy > Manage deployments > Edit > New version (address unchanged; health shows `"flow_engine":2`); (5) open the panel: no red banner on Home; Questions shows Map and Try a path; (6) live smoke test: "All 9 checks passed"; (7) SMOKE-R1 > Answers sheet > pings: last column `config_version` = `smoke-test`. [UNCONFIRMED] on real Google: the route tools in the panel (new Function in Google's frame; fails safe to the old editor), the Map (Mermaid in a sandboxed frame; outline fallback), the pings column on older sheets, pasting a 474 KB file.
  2. **Stage 4 contract drafted** (23 Oct 10:30 IST) in `local_data/checkpoints/stage4-contract-draft.md` (git-ignored; to be merged into flow-engine.md §9 after W1): Screens tab + 3 columns (`next`, `jumps`, `repeat`), compile through `fromLegacy`, `formatFlow`/`toPanelRows` for export/import, panel checks via `PP.flowCheck`, `CODES_EVER_LIVE`, `Flow.gs` with fingerprint + source string, publish guard, panel editors/Map/Try a path. Then stage 4 (Apps Script: `Flow.gs` generated, Model.gs compile/import/restore/codes lock, PanelServer/Code.gs, Panel.html jump/loop/ending editors, Map, Try a path; `survey.json` converted), stage 5 (plug-in types), stage 6 (`config_version` on pings), docs, full regression, one stop for Pranav with his checklist (push, paste 5 files, deploy, smoke test).
- **Rules for this build:** survey.json stays in today's list format until stage 4 (the panel's GitHub copy must stay byte-identical); Model.gs checks untouched until stage 4; browser suites one at a time through the scratchpad's `lockrun.py`; no commit or push unless Pranav asks.


**History of this request (22 Oct, from 14:44 IST): flow audit, Pranav's request.**
- **Asked:** is the form's decision tree (screen order, branch conditions, adding/removing screens, loops, question types) fully editable from config, with no JS change? Answer as a short table; if any answer is "no", propose (don't build) a flow-graph design: one flow file with nodes and edges, a validator, a Mermaid diagram in docs/flow.md, a simulator, a migration of today's S0–S7 with identical behaviour, dashboard drop-off read from the flow, generic renderers. Then STOP for approval, with STATE.md saying "flow-graph refactor: proposed, awaiting approval".
- **Already seen by Claude:** the order is the `flow` list in `web/config/survey.json` (live: the panel's Screens tab, compiled by Model.gs `PP_mdlCompileFlow_`); `show_if` rules are config, evaluated by `web/js/flow.js` `evalCondition`; but per-area expansion and the "rating <= threshold" problem screens are hardcoded in `flow.js` `buildSteps` (lines 99-116), `skip_if` has two fixed values, and new question types need code in screens.js, flow.js (`canProceed`, `buildSubmission`), Model.gs `PP_SCREEN_TYPES`, check_config.py and the backend.
- **Audit done** (15:33 IST; workflow `wf_43b4b1dd-f39`, 6 agents, results in the scratchpad's `flow-audit/journal_results.json`): 1 order = mixed (config list; JS expands the area blocks, forces thank-you last, and does all routing before the flow: bad link, closed round, already sent, resume); 2 conditions = mixed (show_if config; "rating <= threshold" and skip_if meanings JS; the server checks nothing); 3a partly, 3b partly (6 generic types yes, new types no), 3c partly (whole blocks only; no jump; no language/DC tests), 3d mostly yes, 3e no (only the 2 built-in per-area loops); 4 no (12 types + 2 internal; a new type touches screens.js, flow.js canProceed/buildSubmission, Model.gs PP_SCREEN_TYPES, check_config.py FLOW_TYPES, 3 rule-answer functions, index.html).
- **Bugs the audit found (not fixed; Pranav decides):** (1) stale answers: rules read every answer ever saved, so a chained follow-up can be asked and sent after Back removed its trigger (reproduced in Chrome; today's default questionnaire has no chained rule, so it is not affected); (2) with deep_dive.when = immediate the Problem-screens line is ignored (position, rule, hidden) with no warning; (3) re-typing nps as rating_1_5 passes every check and writes 1-5 into the nps column; a hidden-then-published nps can be deleted in the editor after codes lock (the known hole); (4) the language picker can be moved after NPS without a warning; (5) the server stores out-of-range values (nps 42).
- **Design workflow `wf_7c106537-fc5` was STOPPED at 20:08 IST.** Both designs finished (B at 16:11, A at 17:02), but the judge then looped for 3 hours, retrying one oversized answer that was cut off each time. Claude is merging the two designs by hand into `docs/flow-graph-proposal.md` (a proposal document, not code). The designs are saved in the scratchpad's `flow-design/design_A.md` and `design_B.md`, and the prototypes in `flow-design/A/` and `flow-design/designer-b/`. Claude re-ran A's comparison at 20:11: identical to today's engine on every valid configuration; the full exhaustive run is going. **Merged at 20:14 IST** into `docs/flow-graph-proposal.md`; the full exhaustive comparison was re-run by Claude at 20:11 and matched (1,411,788 answer sets x 3 routes, 3,000 Back-button scripts per mode).
- **Lesson:** never ask one agent for one huge structured answer; have it write long deliverables to files in parts.
- **Done:** the answer table and the proposal went to Pranav; STOP until he approves.

**Saved at 20:54 IST on 21 Oct.** The Meesho-only mode is done (see Done): built, reviewed (`wf_8bcc034a-679`, all 7 findings fixed), every suite green, committed locally on top of `1c99b5e` (not pushed). Nothing is running.

**21:05 IST:** Pranav has created the Sheet, pasted the Apps Script and deployed the web app as "Anyone within Meesho"; he hasn't pushed the Meesho-only commit yet. Claude re-sent the steps below with what he should see at each one, a 10-minute wait after the push (the form's files are cached for up to 10 minutes), and a test by himself before the BU head (Rounds > DEMO-BU1 > Answers sheet).

**Next: Pranav runs the BU head demo** (Claude sent him these steps right after the commit):
1. **Push** (`cd ~/NPSF`, then `git push`), and wait for the green tick under GitHub > Actions. The survey page loads the form's scripts from GitHub Pages, so the new `web/js` must be online first.
2. **Paste all four Apps Script files again** (Code.gs, Model.gs, PanelServer.gs, Panel.html), and save.
3. **Deploy > Manage deployments > Edit (pencil) > Version: New version**, with Execute as: Me and Who has access: Anyone within meesho.com. Deploy.
4. **Panel > Home > web app address > Check and save.** It must say "Saved as Meesho-only".
5. **Rounds:** a new test round, e.g. `DEMO-BU1` (DEMO rounds never lock the codes), then open it.
6. **DCs tab:** a fake DC, e.g. `DC-DEMO-BU`; then **Links > Make links**, and copy that DC's link.
7. **The BU head** opens the link in Chrome, signed in with their Meesho account.

**Then:** if anything fails on real Google, Pranav sends the exact message and Claude fixes it. When IT allows "Anyone": Deploy > Manage deployments > Edit > Who has access: Anyone (the address stays the same), then Check and save, then Make links again, then Publish > Backup copy in GitHub (hand-off item 6). After that, the hand-off checklist (item 11) and open questions 11, 12 and 14.

**Offered, not decided:** the panel could re-check the web app's access by itself when it opens, so a switch to "Anyone" needs no Check and save.

**Lessons from today:**
- Read the clock (`date`) before writing any time into this file or the status page. Four times written this morning were estimated ahead and had to be corrected.
- Run browser suites one at a time.
- Stage changes to files an agent is working on as patch scripts in the scratchpad, and apply them once its verifier is done.

After any compaction: read CLAUDE.md and this file first, then tell Pranav in two lines where we are (standing rule 1).
