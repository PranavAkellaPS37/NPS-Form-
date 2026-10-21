# STATE: where the build is

**Updated:** 21 Oct 2026, 16:46 IST, by Claude.

**APPROVED (21 Oct ~08:45 IST):** Pranav replied "ok" to the remaining Phase 2 list (items 1–11 below) and to all 8 recommended decisions (see Decisions). Work started after a context compaction, as he preferred.

**Progress today (21 Oct):** items 1–9 of 11 are done and tested; item 7's independent review found 9 problems, all fixed and tested (16:45 IST). Left: the hand-off (11). Next: item 7 (full regression plus an independent review), then the local commit (10) and the hand-off (11).

**What happened this morning:**
- **The Mac restarted at 08:24 IST,** which wiped the temporary scratchpad folder holding the developer test suites and the 20 Oct audit evidence. Nothing in the repo was lost.
- **The audit evidence was restored** from the workflow records, and **the test suites were rebuilt** from the session records (item 1, done).
- **Two critics** checked CLAUDE.md, spec.md and this file against the brief and the 20 Oct evidence: 48 notes. An editor agent applied them, a verifier checked every one, and Claude fixed the rest (21 Oct, 10:00–10:50 IST).
- **A context compaction at 11:10 IST** was saved and resumed automatically by the new compaction guard (CLAUDE.md rule 9).
- **The account's usage limit** stopped all work from ~12:20 to 13:20 IST (the first review run was cut off); a leaner review ran from 13:24 to 14:23.

**Rule:** update this file at the end of every task (CLAUDE.md, standing rule 2). The spec and every decision are in [spec.md](spec.md).

## Where we are (two lines)

Phase 2 is built, independently reviewed, fixed and committed locally (not pushed): all 11 approved items except the hand-off are done, and every developer suite is green (end to end 23/23, panel 52/52, Google imitation 41 + 1 known warning, logic 195/195).
Now: the hand-off (item 11): Pranav reviews, answers open questions 11–14, then follows the go-live checklist (item 11 under "Next").

## Current phase

**Phase 2: Apps Script + link generator + control panel.** Built, reviewed and committed locally; waiting for Pranav's hand-off review.
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
- **Committed locally, not pushed:** Phase 2 is one commit on top of the Phase 1 commit `25c2bfd`, on branch `main` (21 Oct ~16:55 IST; both rewritten at ~17:35 to remove the folder path and the work email, open question 13).
- **Not pushed:** nothing is pushed. The remote `origin` = https://github.com/PranavAkellaPS37/NPS-Form-.git is set, and the GitHub repo exists but is empty.
- **No live deployment:** GitHub Pages isn't on, the Sheet isn't created, and the web app isn't deployed. The form's `survey.json` is still in `mock` mode.

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
    1. **Push to GitHub:** README, "Phase 2: go live", Step 1. Make a fine-grained token (only this repository; Contents and Workflows: Read and write), then in Terminal: `cd ~/NPSF` and `git push -u origin main`. Username `PranavAkellaPS37`; the password is the token.
    2. **Switch on GitHub Pages:** README Step 2 (Settings > Pages > Source: GitHub Actions; run the workflow again). The form shows a TEST MODE banner: send no links yet.
    3. **Create the Sheet, paste the four code files, run Set up or repair, check version 1:** setup guide (`apps-script/README.md`) Parts A–B, steps 1–7.
    4. **Put the backend online:** check with IT that "Anyone" is offered (step 8), deploy the web app (step 9), record its `/exec` address in the panel with **Check and save** (step 10), and check it in an Incognito window (step 11).
    5. **New, 2 minutes: check two Google features.** In the Apps Script editor: **+** > **Script**, name it `checkGoogle`, paste `function checkGoogle() { console.log('getDocumentLock' in LockService, 'requireAllScopes' in ScriptApp); }`, save, pick `checkGoogle` in the function menu, click **Run**, and read the Execution log. It must say `true true` (otherwise admins share the partners' lock, and Google never re-asks for permissions). Then delete that file (⋮ > Delete) and send Claude the result.
    6. **Connect the form:** setup guide Part D, steps 12–13 (the recorded address goes into `web/config/survey.json` through **Publish > Backup copy in GitHub**), then push.
    7. **Live smoke test:** setup guide Part E, steps 14–16. It must end with "All 9 checks passed"; it is safe to run again (a new fake DC each run).
    8. **Phone test** with a fake DC's link: setup guide Part F, step 17.
    9. **New: make links once for the full DC list** (about 10,000) in a test round, to check the time and the size of the CSV (about 2 MB). Don't send them, and delete the file afterwards.
    10. **Share the Sheet and the Drive folder** with colleagues: setup guide Part G, step 18.
    11. **Before the first real round:** the real problem list (taxonomy), translations read by native speakers, and Valmo's colours and logo (README steps 9–11). Opening the first real round locks the codes.

**Later (Phase 5, or when needed):**
- keep codes that were ever answered locked even after hiding;
- make helper functions private;
- remove the unused `panelSetFormUrl`;
- an audio-clip editor in the panel;
- skip downloading the form's own `survey.json` when the live one arrives.

**Estimate (12:15 IST):** item 7 about 1 hour (the review workflow and its fixes), items 10–11 about 30 minutes; hand-off today, ~15:30–16:00 IST.

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
- an IT check that Apps Script web apps may be shared with "Anyone".

## Tests: where they live and the last results

All developer suites are in [`tests/`](../tests/README.md): run `cd tests && npm install` once, then each command from the project folder. Results of 21 Oct, after the item 7 review fixes:

| Suite | Command | Last run (21 Oct, IST) | Result |
|---|---|---|---|
| Flow rules | `node tests/flow/flow_test.js` | 16:44 | 8/8 pass |
| Questionnaire logic | `node tests/model/test_model.js` | 16:44 | 195/195 pass |
| Shrinking save | `node tests/model/strict/shrink_check.js` | 16:44 | pass |
| Fix checks | `node tests/fixes/verify.js`, `node tests/fixes/verify-locks.js` | 16:44 | 81/81 and 40/40 pass |
| Google imitation | `node tests/gas-harness/run-tests.js` | 16:40 | 41 pass, 1 warn (S: Model.gs `var` lists, open question 14), 0 fail; 42 scenarios, 1,821 checks; self-test 41/41; 38 s |
| Planted mistakes | `cd tests/gas-harness && python3 tools/plant-bugs.py` | 16:20 | 33 of 33 caught |
| Control panel bench | `node tests/panel/test.js` | 15:20 | 52/52 pass |
| Form, end to end | `node tests/e2e/e2e.js` | 16:46–16:51 | 23/23 pass |
| Settings check | `python3 scripts/check_config.py` | 16:44 | 0 errors, 1 expected warning (the demo round is fake); page weight 73% of 300 KB |
| Smoke test, fresh local test server | `python3 scripts/smoke_test.py --url http://localhost:8867/api` | 16:45 | 9/9 |
| Smoke test, Google imitation (strict) | `node tests/gas-harness/server.js --setup --open-round SMOKE-R1 --port 8970`, then `--url http://127.0.0.1:8971/exec --secret … --expect-strict` | 12:07 | 9/9 twice |
| Python compile | (all `scripts/*.py`) | 16:45 | 5/5 |

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

- **Git:** two commits on branch `main`: `25c2bfd` (Phase 1) and the Phase 2 commit. Their author email is `PranavAkellaPS37@users.noreply.github.com`, also this project's git email. The remote `origin` is `https://PranavAkellaPS37@github.com/PranavAkellaPS37/NPS-Form-.git` (the username is in the address because this Mac's Keychain holds a login for another GitHub account). Nothing is pushed yet; a backup bundle of the commits before the clean-up is in the session scratchpad (`before-cleanup.bundle`).
- **Tests:** `tests/node_modules/` comes from `npm install` (git-ignored). The suites start their own local servers: run the browser suites one at a time. Claude's agents use a lock for that (scratchpad `lockrun.py`).
- **Agent runs today:** items 5–6 = workflow `wf_fb839446-008` (done 12:01 IST; every report and verdict is in its journal). The stopped 20 Oct fix run (`wf_c94fdce0-475`) is fully replaced by items 5–6.
- **Old test server:** gone since the 21 Oct restart. Start a fresh one with `python3 scripts/mock_server.py` when needed.
- **Evidence for re-checks:** the brief and the 20 Oct audit results are in the session scratchpad's `spec/` folder, and the replay tools that rebuilt the tests in its `rebuild-tools/` folder (both temporary; the session records can rebuild them).
- **Colleague status page:** guard and field guide in `.claude/status/` (local only, git-ignored).

## Exact next action

**Saved at 12:15 IST on 21 Oct.**

1. ~~The full end-to-end run~~ **done: 23/23 at 12:15 IST** (docs updated).
2. ~~Item 7~~ **done** (see Done; the final end-to-end run passed 23/23 at 16:51).
3. ~~Item 10~~ **done**: Phase 2 committed locally (not pushed).
4. **Item 11: the hand-off.** The checklist is in "Next" above (item 11). Claude presents it and STOPS for Pranav's review. Raise open questions 11–14 (spec §6); question 13 must be decided before the first push.

**Lessons from today:**
- Read the clock (`date`) before writing any time into this file or the status page. Four times written this morning were estimated ahead and had to be corrected.
- Run browser suites one at a time.
- Stage changes to files an agent is working on as patch scripts in the scratchpad, and apply them once its verifier is done.

After any compaction: read CLAUDE.md and this file first, then tell Pranav in two lines where we are (standing rule 1).
