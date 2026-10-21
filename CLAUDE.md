# CLAUDE.md: Valmo Partner Pulse

A relationship-NPS survey for ~10,000 Valmo delivery-centre (DC) partners, plus the pipeline and dashboard behind it. Valmo is Meesho's logistics arm. Owner: Pranav Akella (Valmo ops). He isn't technical, and he reviews and runs everything.

**Where to look:**
- **This file:** the working rules and the spec in short form.
- **[docs/spec.md](docs/spec.md):** the original brief word for word, the approved designs, every decision since, and where the build differs from the brief.
- **[docs/STATE.md](docs/STATE.md):** where the build is now, the open decisions and the exact next action.

## Standing rules

1. **After any compaction or at the start of any session, read CLAUDE.md and /docs/STATE.md before doing anything, and tell me in two lines where we are.** (Pranav, 20 Oct 2026.) Trust the files over any summary or memory. If they disagree, say so.
2. **Update /docs/STATE.md at the end of every task from now on, not just at phase ends.** Cover the current phase, the done / in-progress / next checklist, open decisions and the exact next action.
3. **Work in phases and STOP for Pranav's review at the end of each.** End each phase with a numbered checklist of exactly what he must do by hand: accounts, keys, commands.
4. **Ask only when a decision genuinely changes the build.** Otherwise pick the simpler option and note the assumption: in docs/STATE.md, and in docs/spec.md §4 if it changes the spec. Mark anything uncertain **[UNCONFIRMED]** and ask.
5. **Write for a non-technical reader.**
   - Every file starts with a heavy plain-English header comment: what it's for, what it reads and writes, how to run it.
   - Explain every command Pranav must run: where to run it, what it does and what he should see.
6. **Never commit or push unless Pranav asks.** Never put partner data, real links, exports, voice notes, secrets or personal paths in the repo: the GitHub repo is public, and everything in `web/` is published to the internet.
7. **Verify before claiming.** After a change, run the relevant tests (see [Tests](#tests)) and report the real result, including failures.
8. **Status page:** if `.claude/status/` exists on this Mac, log every code change, test run and agent run on the colleague status page. A Stop hook enforces this; see `.claude/status/README.md`.
9. **Be ready for a compaction at any moment** (Pranav, 21 Oct 2026). Keep docs/STATE.md's "Exact next action" current while working: running agent runs with their run ids, edits written but not yet tested, and planned changes with file and function names. On this Mac, hooks also do it automatically (`.claude/status/compact_guard.py`):
   - **Just before a compaction:** a snapshot of the mechanical state goes into `.claude/status/compact-snapshot.md` (files changed after STATE.md, git status, runs still going).
   - **Right after it:** Claude is told to read CLAUDE.md, STATE.md and that snapshot, give the two lines (rule 1) and carry on with the next action.

## Hard constraints (from the brief)

- **Free only.** No paid APIs, no paid hosting.
  - The form is a static site on GitHub Pages.
  - The backend is Google Apps Script, deployed from the company Google account.
  - Storage is Google Sheets plus Google Drive.
  - Processing runs on Pranav's MacBook (M4 Pro, Apple Silicon).
- **No partner data in the repo.** Sample and seed data must be obviously fake. `.gitignore` anything that could hold real data: exports, audio, `.env`, credentials.
- **Everything configurable, nothing hardcoded.** That covers languages, questions, functions rated, issue chips per function, branching rules, thresholds, branding text and colours. **Changing the questionnaire must never require editing JS.**
  - The config is JSON (spec §2.1).
  - Since Phase 2 the live questionnaire is edited in the control panel. `web/config/` and `web/i18n/` are the fallback copy.
- **Mobile-first.** Cheap Android phones on patchy data.
  - A typical path under 90 seconds, big tap targets, a visible progress bar.
  - Page weight under 300 KB, not counting optional audio.
  - **Screens:** the brief says ~8 screens and one question per screen. Pranav approved Option A (spec §2.2): one area per screen, about 12 screens typical (the build shows 10–19, spec §5). Two kinds of screen deliberately hold more than one question: each problem screen (the chips with "Tell us more"), and the support screen (the four ratings).
- **Six languages:** English, Hindi, Tamil, Telugu, Kannada, Malayalam (`en hi ta te kn ml`).
  - All UI text lives in one string table: one key, six values.
  - English and Hindi (everyday Hindi, spec §2.3) are real text. For ta/te/kn/ml the value is the English prefixed with `[TRANSLATE] `.
  - **Never machine-translate.**
- **Minimal dependencies.** Vanilla JS for the form (no framework, no build step). Python 3.11+ with a `requirements.txt` per folder.

## The survey (product spec)

The flow branches and comes from config (`flow` in `web/config/survey.json`).

| Step | Screen | Rule | `flow` id |
|---|---|---|---|
| S0 | Language picker: six big buttons | Skipped when the link has `?lang=`; a header button still lets the partner switch | `language` |
| S1 | "What changed since last time" card | Content per round; skipped when empty | `whats_changed` |
| S2 | Headline NPS, 0–10 chips | Approved wording: "How likely are you to recommend Valmo to another DC owner?" | `nps` |
| S3 | Rate each function 1–5 with faces, one screen per function | "I don't handle this" is allowed and isn't counted | `fn_ratings` |
| S4 | For each function rated at or below its threshold (default 3): "Main problem?" (4–6 chips per area from config, plus Other; the checks warn outside 4–6) and "Tell us more" (hold-to-record voice, or type in any script, romanised allowed) | After all ratings; above the threshold, skipped; Other needs voice or text | `fn_deep_dives` |
| S5 | "Did you contact Valmo support in the last 30 days?" Yes: rate agent behaviour, understood my problem, time to resolve and kept me updated (1–5), plus optional voice/text | No: skipped | `support_gate`, `support` |
| S6 | "If Valmo fixes one thing, what should it be?" | Optional voice/text | `one_fix` |
| S7 | Thank you | | `thanks` |

**Default functions** (codes in brackets): Losses & Debits (`losses`), Payments/Payouts (`payments`), Line Haul (`linehaul`), Consumables (`consumables`), Orders & Planning (`orders`), App/Tech (`app`). The chips (4–6 per area; the placeholder has 5, plus Other) are a **placeholder taxonomy** (spec §2.5); Pranav will replace them with real dispositions. A code must not change once partners have answered.

- **Identity:**
  - The link carries `?dc=<DC_ID>&t=<token>&round=<round_id>`, optionally with `&lang=`. There's no login.
  - The token: `t = base64url(HMAC-SHA256(secret, dc + "|" + round))`, padding removed, first 22 characters.
  - The secret is a Script Property (`LINK_SECRET`), and Apps Script rejects bad tokens. The brief says the secret is held only in Apps Script. By Pranav's 21 Oct decision (spec §6 item 3), a Sheet editor can still reveal it in the panel by typing SHOW, for `scripts/generate_links.py` and the smoke test.
  - Links come from the control panel, or from `scripts/generate_links.py` (a CSV of DC ids).
- **Voice:**
  - MediaRecorder, webm/opus, mono, ~16 kbps, 60 s cap.
  - A one-line consent before the first mic use.
  - Sent as base64 inside the submission JSON.
  - Falls back to typing when the mic is denied or unsupported.
- **Read-aloud:**
  - A speaker icon on every question: `speechSynthesis` with the language's BCP-47 code. (Open: the language screen has none; spec §6 item 11, [UNCONFIRMED].)
  - The icon is hidden when no voice exists for that language.
  - A pre-recorded clip per text key (key → mp3) takes priority.
- **Resilience:**
  - Progress is kept in localStorage (guarded by try/catch).
  - A failed send retries with backoff and keeps a "Send now" button.
  - The form records `opened_at`, every screen's timestamp and `submitted_at`, for drop-off per screen.
- **Spam/abuse:** the form only does basic checks. **The Apps Script is the gate.**

## Backend contract (Google Apps Script)

**What the brief asks for:**
- One `doPost` that validates the token and writes:
  - one row to `responses`;
  - one row per function rating to `function_ratings`;
  - one row per free-text or voice item to `free_text`, with the Drive file URL for audio;
  - the per-screen timestamps to `events`.

  It returns JSON.
- A `doGet` for the "what changed" payload per round.
- CORS for the GitHub Pages origin: `text/plain` POSTs, so the browser sends no preflight. The reason is documented.
- Step-by-step setup instructions: copy-paste was chosen, with clasp as an optional developer route.

**What was built.** The data contract is [docs/submission-format.md](docs/submission-format.md); the panel and server design is [docs/control-panel-design.md](docs/control-panel-design.md). Both were brought up to date with the 20 and 21 Oct fixes on 21 Oct (docs/STATE.md item 5).
- **Messages:**
  - POST `submit` and `ping`. A `submit` can also arrive by `sendBeacon`.
  - GET `?action=bootstrap`: the form's one request on opening. It returns the published questionnaire, the texts and the round's "what changed".
  - GET `?action=whats_changed`: kept for older forms.
  - GET `?action=health`.
  - **Meesho-only mode** (21 Oct, while IT hasn't allowed "Anyone"): a GET without `action` but with `dc`/`round`/`preview` returns the survey page itself (`PP_formPage_`), which talks back through `google.script.run.ppFormRequest`. Links and Preview point at the web app while `WEB_APP_ACCESS` is `domain`. Because such a page can call every public server function (and runs the form's scripts from GitHub), every admin function calls `PP_requireAdminCaller_`, which allows only calls made from inside the Sheet (its menu or the panel window: `SpreadsheetApp.getUi()` works only there), via `PP_forPanel_` and in the `pp…` menu functions: **keep that rule for any new public function.**
- **Answers:** always HTTP 200 with `{ok: true|false, ...}`. Checks run in this order: message shape, token, round status, duplicate (`submission_id`). Voice notes are decoded only after the token and round checks.
- **Storage:**
  - One data spreadsheet per round, with tabs `responses`, `function_ratings`, `free_text`, `events` and `pings`.
  - Voice notes go in Drive at `Valmo Partner Pulse/rounds/<round>/audio/`.
  - Published versions go in `Valmo Partner Pulse/published/p<N>.json`.
- **Limits:**
  - 5 MB per voice note.
  - At most 10 stored submissions per DC per round.
  - At most 60 stored pings per DC per round per 10 minutes.
  - Answers to a closed round are stored and marked `late`.
- **Round status:** draft / open / closed. A never-seen round id reports `draft`.
- **Preview links** carry a private preview key (`pk`).
- **`schema_version` is 1.** Change it only together with every reader.

## Control panel (Phase 2 addition, at Pranav's request, 20 Oct)

> "completely customizable with ease ... since u and i wont be the only ones working on it"

- **Where:** inside the Google Sheet (Partner Pulse > Open control panel).
- **Publishing:** live through Google within about a minute; no code push.
- **Sections:** Home, Questions (with a rule builder), Areas & problems, Support questions, Texts & translations, Look & feel, Rounds (with "What changed"), Links (CSV), Publish (checks, Preview, Publish, history, Restore, GitHub copy) and Settings.
- **Files:**
  - `apps-script/Code.gs`: web app, setup, publishing, rounds, storage, locks.
  - `Model.gs`: Sheet tabs ↔ questionnaire, checks, compile, restore.
  - `PanelServer.gs`: what the panel can ask the server.
  - `Panel.html`: the panel itself.
- **Guides:** [docs/control-panel.md](docs/control-panel.md) (user guide) and [apps-script/README.md](apps-script/README.md) (setup).
- **Codes lock:** once any real round has been opened (Script Property `ROUNDS_EVER_OPENED`, or any real round record that is open or closed), the codes in the current live version can't be deleted or re-coded. The panel warns "This locks the codes" first.
  - **Test rounds never lock them:** ids starting with SMOKE, DEMO or TEST, in capitals or not (`PP_isTestRound_` in Code.gs, `isTestRound` in Panel.html; Pranav's decision of 21 Oct, built that day).
  - **`nps` and `support_gate`** can never be deleted or re-coded, only hidden: they fill the `nps` and `support_contacted` columns (decision 8).
  - **If Drive can't read the live version** when the panel opens, the panel keeps every code locked (`live_ids_unknown`).
  - One hole remains: hiding an item and publishing unlocks its code again (docs/STATE.md, Later).

## Local dev mode

`?mock=1` or `backend.mode: "mock"` makes the form talk to `scripts/mock_server.py` (Python standard library only) at `localhost:8787`. It writes `local_data/responses.jsonl`, `local_data/events.jsonl` and `local_data/audio/`, all git-ignored.

## Pipeline (Phase 3, not started): Python in /pipeline, run on the Mac nightly or on demand

1. `pull.py` reads new rows through the Google Sheets API (service account or OAuth, to be chosen and explained) and downloads new audio from Drive into a git-ignored folder.
   - The data is now one spreadsheet per round.
   - A failed save can leave rows in `events`, `free_text` and `function_ratings` without a `responses` row, and the phone's retry writes them again. Count a row in those tabs only when its `submission_id` and `received_at` match a `responses` row.
   - Leave out test data: rounds whose id starts with SMOKE, DEMO or TEST, and DCs starting `DC-SMOKE-` (docs/submission-format.md §9).
2. `transcribe.py` uses whisper.cpp or mlx-whisper (large-v3), with a language hint from `lang`. The transcript is written back to `free_text`.
3. `classify.py` has pluggable providers:
   - `ollama` (default; Gemma 3 12B or Qwen3 14B; taxonomy injected from config). Since Phase 2 that means the questionnaire the partner saw: the published `published/p<N>.json`, found from the response's `config_version` (e.g. `p7-2026-10-21` → `p7.json`). When `config_version` is the form's own fallback version (e.g. `2026-10-19.1`), the partner saw the `web/config` copy, so use that one;
   - `anthropic` (off by default; key in `.env`);
   - `gemini`.

   Each item gets strict JSON: `{function, issue_code, severity 1–5, sentiment, summary_en (≤2 lines), confidence 0–1, unmapped: bool, new_theme_label}`. Results are written back to the sheet. It has `--limit` and `--dry-run`.
4. `review/` lets Pranav hand-check a sample of classifications and save a gold set (CSV) for later fine-tuning, so each row keeps the text or transcript and `lang` next to the corrected labels. It reports the classifier's accuracy against it.
5. `run_nightly.sh` chains 1–3, is idempotent, and logs to `/logs`.

## Dashboard (Phase 4, not started): Streamlit in /dashboard, run locally on the Mac

Run it on the Mac only, as the brief says; never host it online, because it shows partner answers. It reads the Sheet, or the local JSONL in mock mode, with a round selector at the top. It shows:
- **Fill rate:** sent / opened / started / submitted, per round, per language, and per state/region when the DC list CSV has those columns (the data tabs don't; join on `dc_id`), plus drop-off per screen.
- **Scores:** headline NPS (promoters − detractors, 0–10 method) per round with the trend; function averages and the % at or below the threshold; support scores. Count only the latest submission per DC per round (docs/submission-format.md).
- **RCA:** a Pareto of `issue_code` per function, the top themes, the unmapped bucket with its `new_theme_label`s, and a drill-down to the free text, transcript or audio link behind any bar.
- **Round-over-round change:** issues that grew or shrank, functions that moved, new themes. This feeds the next "what changed" card.
- **Export:** CSV of any view.

`/sample_data` gets ~300 obviously fake responses across all six languages, made by a seed-data script in `scripts/`.

## Repo shape

```
web/          survey form (published to GitHub Pages): index.html, css/, js/, config/, i18n/, audio/
apps-script/  Google side: Code.gs, Model.gs, PanelServer.gs, Panel.html, appsscript.json, README.md (setup guide)
scripts/      mock_server.py, smoke_test.py, check_config.py, strings_csv.py, generate_links.py
              (Phase 4 adds the seed-data script for sample_data/)
docs/         spec.md, STATE.md, submission-format.md, control-panel-design.md, control-panel.md, config-guide.md
sample_data/  obviously fake data only (dcs_fake.csv: 20 fake DCs)
tests/        developer tests (Node; never published): e2e/, flow/, gas-harness/, model/, panel/, fixes/, README.md
.github/      workflows/deploy-pages.yml: settings check, then publishes web/ (actions pinned to commit SHAs)
pipeline/     Phase 3 (not created yet)
dashboard/    Phase 4 (not created yet)
README.md     end-to-end guide for a non-engineer: deploy the form to GitHub Pages, deploy Apps Script,
              generate links, run the pipeline, open the dashboard
CHANGELOG.md  what changed in each version
```

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Form + config + mock backend running locally | Done; commit `25c2bfd` (20 Oct; rewritten 21 Oct to remove personal details), pushed 21 Oct |
| 2 | Apps Script + link generator, plus the control panel | Built, reviewed and pushed on 21 Oct (`1c99b5e`). The Meesho-only mode for the BU head demo was added that evening (committed locally, not pushed). Waiting for Pranav's hand-off review (docs/STATE.md, item 11) |
| 3 | Pipeline | Not started |
| 4 | Dashboard + ~300 fake sample responses | Not started |
| 5 | README/docs polish | Not started |

## Code conventions

- **Form JS:** ES5-level syntax; it must run on Chrome 61+, so no `?.`, `??`, arrow functions or `let`. Classic deferred scripts share the global `PP`. Never put data into `innerHTML`.
- **Apps Script:** V8, no `?.` or `??`.
  - Use only methods that exist on real Google: `Range.clearContent()` (not `clearContents`), and the string `'application/json'` (there is no global `MimeType.JSON`).
  - All `.gs` files share one global namespace, and a script file and an HTML file can't have the same name.
  - Helper names end with `_`, which hides them from `google.script.run`.
- **Python:** the standard library where possible.
- **After any change to `web/config` or `web/i18n`:** run `python3 scripts/check_config.py`. GitHub runs it too, and refuses to publish on errors.

## Tests

The developer suites live in [`tests/`](tests/README.md) (rebuilt there on 21 Oct, byte for byte, after a restart wiped the originals; docs/STATE.md). Run `cd tests && npm install` once (pinned `puppeteer-core` and `acorn`), then each command from the project folder, one browser suite at a time. The last results are in docs/STATE.md.

| Suite | Command | Checks |
|---|---|---|
| Form, end to end | `node tests/e2e/e2e.js` | 24 scenarios: the form in headless Chrome at phone size, against the mock server |
| Flow rules | `node tests/flow/flow_test.js` | which screen comes next (8 cases) |
| Google imitation | `node tests/gas-harness/run-tests.js` | 43 scenarios, 1,895 checks: the real `.gs`/`Panel.html` code in a strict fake Google (no global `MimeType.JSON`; the document lock, `requireAllScopes` and `setOwner` as Google documents them). Expected: 42 pass, 1 warns (S: Model.gs's `var` lists, open question 14). `python3 tools/plant-bugs.py` (in `tests/gas-harness`) must catch 41 of 41 planted mistakes |
| Questionnaire logic | `node tests/model/test_model.js` | 195 tests of `Model.gs` |
| Shrinking save | `node tests/model/strict/shrink_check.js` | a save that shrinks every tab, in the strict fake (the 20 Oct `clearContents` crash) |
| Fix checks | `node tests/fixes/verify.js`, `node tests/fixes/verify-locks.js` | 81 + 40 checks: the 20 and 21 Oct fixes, a second, independent check of the document lock, permission re-prompt, owner hand-over and code lock |
| Panel bench | `node tests/panel/test.js` | 53 steps in `Panel.html` with a fake server |
| Settings check | `python3 scripts/check_config.py` | config and texts; page weight |
| Smoke test | Mock: `python3 scripts/smoke_test.py` (add `--url http://localhost:<port>/api` for another port). Live: `python3 scripts/smoke_test.py --url <web app address ending in /exec> --secret "$(pbpaste)" --expect-strict`. Without Google: `node tests/gas-harness/server.js --setup --open-round SMOKE-R1 --port 8970`, then `--url http://127.0.0.1:8971/exec` with the secret it prints | 9 checks; safe to repeat (a new fake `DC-SMOKE-…` DC each run; optional `--dc`) |
