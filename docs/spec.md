# Valmo Partner Pulse: full specification

**What this file is:** the complete brief, plus everything approved or decided since. CLAUDE.md (repo root) has the short version and the working rules. [STATE.md](STATE.md) says where the build is right now.

**How to change it:**
- Never edit §1: it is the brief as written, in a plain-text block so that it shows exactly as pasted. (Markdown would hide `<token>` and `<<leave blank for now>>` and run some lines together.)
- Record new decisions in §4 with the date and who decided.
- Record differences from the brief in §5.
- Record open questions in §6, marked **[UNCONFIRMED]** until Pranav answers.

**Sources:**
- §1 was copied from the session record of 19 Oct 2026 (the brief was pasted twice, identically), not from memory. On 21 Oct a script confirmed that the block matches that record byte for byte.
- §2–§4 come from the same record: the proposal Pranav approved, his Phase 2 request and answers, and the plan announced to him.
- §5 comes from a file-by-file re-check on 20 Oct 2026; its statuses were updated on 21 Oct.

Last updated: 21 Oct 2026, 12:18 IST: §4 gained three of Claude's decisions from STATE items 5–6 (the smoke test's fake DCs, "latest submission", the CHANGELOG date), §6 item 14's wording and the §7 table were brought up to date. Before that (~10:55 IST): Pranav's decisions 1–8 (§4–§6, ~08:45; decisions 1, 2 and 8 built the same morning), then the fixes from two critics' check of this file, CLAUDE.md and STATE.md, and a verifier's check of those fixes: corrected facts, four new open questions (§6 items 11–14), and §1 moved into a plain-text block with its text unchanged.

**Contents:**
1. The original brief (verbatim)
2. Approved Phase 1 design
3. Phase 2 scope: Apps Script, link generator and the control panel
4. Decisions log
5. Where the build differs from the brief
6. Open questions
7. Detailed contracts and guides

## 1. The original brief (verbatim)

Pasted by Pranav on 19 Oct 2026 at 17:05 IST. It sits in a plain-text block so that it shows exactly as pasted.

```text
You are building "Valmo Partner Pulse" — a relationship NPS questionnaire for ~10,000 delivery-centre (DC) partners of Valmo (Meesho's logistics arm), plus the pipeline and dashboard behind it. I'm a non-technical ops person leading analytics/automation; I'll review and run everything, so keep the code readable, heavily commented at the top of each file, and explain every command I need to run.

## Hard constraints
- Fully free. No paid APIs, no paid hosting. Static front-end on GitHub Pages, backend on Google Apps Script (deployed from a company Google account), storage in Google Sheets + Google Drive, processing on this MacBook (M4 Pro, Apple Silicon).
- NO partner data ever goes into the repo. Sample/seed data must be obviously fake. .gitignore anything that could hold real data (exports, audio, .env, credentials).
- Everything must be configurable from JSON/YAML config files, not hardcoded: languages, questions, functions rated, issue chips per function, branching rules, thresholds, branding text, colours. Changing the questionnaire must never require editing JS.
- Mobile-first. Captains use cheap Android phones on patchy data. Target: typical path under 90 seconds, ~8 screens, one question per screen, big tap targets, visible progress bar. Total page weight (excluding optional audio) under 300 KB.
- Six languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam. All UI strings live in a single string table (JSON, one key → six values). Ship English and Hindi as real text; for the other four, put the English text as a placeholder and mark every placeholder with "[TRANSLATE] " prefix so native speakers can find them. Do not machine-translate.

## Product spec
Flow (branching, config-driven):
- S0 Language picker (six big buttons; also pre-select from ?lang= in the URL)
- S1 "What changed since last time" card — content from config; skip if empty
- S2 Headline NPS: "Would you recommend Valmo to another DC owner?" 0–10 chips
- S3 Rate each function 1–5 (faces/emoji), one screen per function. Default functions: Losses & Debits, Payments/Payouts, Line Haul, Consumables, Orders & Planning, App/Tech
- S4 For every function rated at/below a configurable threshold (default 3): "Main problem?" — 4–6 chips from config + Other → then "Tell us more": hold-to-record voice button OR type (free text, any script, romanised allowed). Functions rated above threshold are skipped.
- S5 "Did you contact Valmo support in the last 30 days?" Yes → Support block: rate 1–5 each: agent behaviour, understood my problem, time to resolve, kept me updated + optional voice/text. No → skip.
- S6 "If Valmo fixes one thing, what should it be?" optional voice/text
- S7 Thank-you screen
Identity: the link carries ?dc=<DC_ID>&t=<token>&round=<round_id>. No login. Token is an HMAC of dc+round with a secret held only in Apps Script; the Apps Script rejects bad tokens. Provide a small Python script to generate the per-DC links from a CSV of DC IDs.
Voice: MediaRecorder (webm/opus, mono, low bitrate, 60 s cap). Show a one-line consent before first mic use. Upload as base64 inside the submission JSON. If mic permission is denied or unsupported, fall back to the text box gracefully.
Read-aloud: a speaker icon on every question using the browser's speechSynthesis with the right BCP-47 lang code; silently hide the icon if no voice is available for that language. Also support an optional pre-generated audio clip per string key (config maps key → mp3 path) that takes priority if present.
Resilience: save in-progress state to localStorage (guarded by try/catch); if submission fails, retry with backoff and keep a "retry" button. Record opened_at, each screen's timestamp, and submitted_at so I can see drop-off per screen.
Spam/abuse: client-side only does basic checks; the Apps Script is the gate.

## Backend (Google Apps Script)
- One web app doPost endpoint. Validates token, writes one row to a "responses" sheet, one row per function rating to "function_ratings", one row per free-text/voice item to "free_text" (with the Drive file URL for audio), and the per-screen timestamps to "events". Returns JSON.
- Also a doGet for a "what changed" payload per round so S1 can be updated without redeploying the front-end.
- Handle CORS for a GitHub Pages origin (use text/plain content-type to avoid preflight, and document why).
- Provide clasp setup OR plain copy-paste instructions into the Apps Script editor — pick whichever is simpler for me and explain it step by step.

## Local dev mode
- A `mock` mode (config flag or ?mock=1) where the form posts to a tiny local Node/Python server that writes to a local JSONL file and saves audio to a local folder, so I can test the full flow before Apps Script exists.

## Processing pipeline (runs on this Mac, nightly or on demand)
Python, in /pipeline:
1. `pull.py` — read new rows from the Sheet (Google Sheets API, service account or OAuth, your call — explain) and download new audio from Drive to a local gitignored folder.
2. `transcribe.py` — whisper.cpp or mlx-whisper (large-v3), language hint from the response's lang field, write transcript back to the free_text sheet.
3. `classify.py` — pluggable classifier interface with providers: `ollama` (default; Gemma 3 12B or Qwen3 14B, taxonomy injected from config), `anthropic` (Claude API, off by default, reads key from .env), `gemini`. Output per item a strict JSON: {function, issue_code, severity 1–5, sentiment, summary_en (≤2 lines), confidence 0–1, unmapped: bool, new_theme_label}. Write back to the sheet. Include a `--limit` and `--dry-run`.
4. `review/` — a simple way for me to hand-check a sample of classifications and save a gold set (CSV) for later fine-tuning; report accuracy of the classifier vs the gold set.
5. `run_nightly.sh` that chains 1–3, idempotent, logs to /logs.

## Dashboard (runs locally on the Mac)
Streamlit app in /dashboard reading the Sheet (or the local JSONL in mock mode). Round selector at the top. Must show:
- Fill rate: sent vs opened vs started vs submitted, per round, per language, per state/region if present in the DC CSV; drop-off per screen.
- Headline NPS (promoters − detractors, standard 0–10 method) per round with trend; function-level average scores and % at/below threshold; Support block scores.
- RCA: Pareto of issue_code per function, top themes from the classifier, the "unmapped" bucket with its new_theme_labels, and a drill-down table that shows the actual free text / transcript / audio link behind any bar.
- Round-over-round change: which issues grew/shrank, which functions moved, new themes that appeared. This is what feeds the next round's "what changed" card.
- Export buttons: CSV of any view.
Seed `/sample_data` with ~300 obviously fake responses across all six languages so the dashboard demos immediately.

## Repo shape
/web (static form, config/, i18n/, audio/), /apps-script, /pipeline, /dashboard, /scripts (link generator, seed data), /docs. A README that a non-engineer can follow end to end: deploy form to GitHub Pages, deploy Apps Script, generate links, run pipeline, open dashboard. A CHANGELOG.

## How to work
- Work in phases and STOP for my review at the end of each: Phase 1 form + config + mock backend running locally. Phase 2 Apps Script + link generator. Phase 3 pipeline. Phase 4 dashboard. Phase 5 README/docs polish.
- At the start of Phase 1, before writing code, show me the proposed config schema and the default questions/issue chips and wait for my OK — the issue taxonomy is a placeholder; I'll replace it with our real dispositions.
- Keep dependencies minimal; vanilla JS for the form (no framework, no build step). Python 3.11+, requirements.txt per folder.
- After each phase, list exactly what I need to do manually (accounts, keys, commands) in a numbered checklist.
- Ask me only when a decision genuinely changes the build; otherwise pick the simpler option and note the assumption.

Company: Meesho / Valmo. Sheet ID for later: <<leave blank for now>>. GitHub Pages URL will be: <<your-username.github.io/repo-name>>.

Start with Phase 1.
```

## 2. Approved Phase 1 design

Pranav approved this proposal on 19 Oct 2026 at 17:12 IST (his reply: "ok").

### 2.1 Where the settings live

| File | What it controls |
|---|---|
| `web/config/survey.json` | Brand colours, backend address, languages, threshold, the six areas and their problem chips, the support block, voice settings, and the screen order with skip rules |
| `web/i18n/strings.json` | Every word shown on screen: one key, six values (en, hi, ta, te, kn, ml) |
| `web/config/whats_changed.json` | The "What changed" card for each round (since Phase 2 the live version comes from the control panel) |
| `web/config/audio_clips.json` | Optional: maps a text key and language to a pre-recorded mp3 |

- **JSON, not YAML.** The browser reads JSON without an extra library, and the pipeline and dashboard will read the same files. JSON has no comments, so each section's explanation sits beside it in a `"_help"` key, which the app ignores. (Since Phase 2 the live copy is the version published from the control panel to Drive, and `web/config` is the fallback; see CLAUDE.md, Pipeline.)
- **Generic screen types**, so questions can be added without code: `nps_0_10`, `rating_1_5`, `yes_no`, `single_choice`, `free_text`, `info_card`, plus the built-in blocks: language picker, What changed, function ratings, function deep dives, support block, thank you.
- **Skip rules:** `show_if` can test whether an earlier answer `equals`, `not_equals`, is `at_most` or `at_least` a value, or is `in` a list. Rules can be combined with all/any, and `answered` is also available. (The all/any combinations and `answered` were added during the Phase 1 build; they weren't in the approved proposal.)

### 2.2 Screen count: Option A

The brief asks for "~8 screens" and also for "one screen per function". Six functions alone take six screens, so both can't hold. Pranav approved **Option A**:
- one area per screen, auto-advancing on a tap;
- the problem chips and "Tell us more" on one screen;
- the four support ratings on one screen.

A typical partner sees about 12 screens, most of them one tap. That's about 60–80 seconds when they skip the voice and text boxes. Option B (all six areas on one screen) was rejected as too cramped on a 5-inch phone.

### 2.3 Assumptions approved with it

- **`?lang=` in the link** skips the language screen. A small language button stays in the header so the partner can still switch.
- **Problem screens come after all six ratings**, not straight after each low score, so partners don't learn that a low score means extra questions. The `deep_dive.when` setting can switch this.
- **One "main problem" chip per area.** Choosing "Other" requires a voice note or text.
- **"Not my area"** (later reworded "I don't handle this") can replace a rating and isn't counted in averages.
- **The "What changed" card** carries its own six-language text per round. It's the only text outside `strings.json`.
- **The mock server** uses only Python's standard library: one command serves the form at `localhost:8787` and receives submissions into the git-ignored `local_data/`.
- **Brand colours:** a purple placeholder (`#4B2E83`) until Pranav sends Valmo's colour codes.
- **Fonts:** the phone's built-in fonts, which cover all five Indian scripts on Android and keep the page light.
- **Hindi style:** everyday Hindi, with common loanwords written in Devanagari (पेमेंट, डेबिट, ऐप), not formal Hindi.
- **NPS wording:** the standard "How likely are you to recommend Valmo to another DC owner?" instead of "Would you recommend…?". On a 0–10 scale you measure likelihood; "Would you" invites yes/no.

### 2.4 Default questions (English)

The "Approved" column is the 19 Oct proposal. The "Now" column shows the wording changed at the Phase 1 hand-off (20 Oct 14:12 IST). Pranav didn't object to those changes, and his next message ("these are nice…") moved on to Phase 2.

| Screen | Approved (19 Oct) | Now |
|---|---|---|
| Language | "Choose your language" (six language names, each in its own script) | same |
| What changed | "What changed since your last feedback" + the round's bullets | same |
| NPS | "How likely are you to recommend Valmo to another DC owner?" 0 = Not at all likely, 10 = Extremely likely | same; the Hindi was reworded to the standard, gender-neutral "how likely" form |
| Area rating | Heading = area name + one helper line; question "How happy are you with this?"; faces Very bad … Very good; small "Not my area" link | question "How is your experience with this?"; "Not my area" became "I don't handle this" (partners say "area" for their delivery territory) |
| Problem | "What is the main problem?" (chips + Other), then "Tell us more (optional)" with Hold to talk / Type instead | same |
| Support gate | "In the last 30 days, did you contact Valmo support?" Yes / No | same |
| Support | "About your last support contact:" four rows of faces + optional comment | "How was your last contact with Valmo support?"; an optional "Doesn't apply" per row (off by default) |
| One fix | "If Valmo could fix just one thing for you, what should it be?" (Skip allowed) | same |
| Thanks | "Thank you! Your feedback goes straight to the Valmo team." | same |
| Mic consent | "Your voice note is shared only with the Valmo team to improve service." [OK] | the note "goes to the Valmo team with your answers and is used only to improve service" |

Also added at the Phase 1 hand-off:
- double-tap protection;
- a "Please keep this page open" notice while sending.

**Why one shared rating question:** the area name goes in the heading, not inside a sentence. Dropping a word into the middle of a sentence often breaks the grammar in Tamil, Kannada and other Indian languages. It also gives translators fewer texts.

### 2.5 Placeholder taxonomy

Pranav will replace this with Valmo's real dispositions. A `code` is the fixed id used by the sheet, the classifier and the dashboard. Labels can be reworded at any time, but **a code must stay the same from one round to the next**. Since Phase 2, codes lock only once the first round has been opened, so the placeholder list can be replaced freely before then. (Test rounds won't count once STATE.md item 2 is built.) Every area also gets an automatic **Other** chip (`other`).

| Area (`id`) | Helper line | Chips (`code`: label) |
|---|---|---|
| Losses & Debits (`losses`) | Debits for lost or damaged shipments, disputes | `wrong_debit` Wrong debit raised · `no_proof` Debit without proof · `dispute_slow` Dispute takes too long · `dispute_rejected` Dispute rejected, no reason · `amount_too_high` Debit amount too high |
| Payments / Payouts (`payments`) | Payout timing, amount, invoices | `payout_delayed` Payout delayed · `short_payment` Paid less than expected · `unclear_breakup` Can't understand breakup · `invoice_gst` Invoice / GST problem · `incentive_missing` Incentive not received |
| Line Haul (`linehaul`) | Truck timings, trips, shipments received | `late_arrival` Truck arrives late · `trip_missed` Trip missed or cancelled · `damaged_on_arrival` Shipments arrive damaged · `short_receipt` Shipments missing on arrival · `rto_pickup_delay` Return pickup delayed |
| Consumables (`consumables`) | Packing material, bags, labels | `short_supply` Not enough supplied · `late_supply` Supply arrives late · `poor_quality` Poor quality · `wrong_charge` Charged wrongly · `hard_to_request` Hard to place a request |
| Orders & Planning (`orders`) | Order volume, forecasts, pincode mapping | `volume_low` Volume lower than promised · `volume_spike` Sudden spikes, no notice · `forecast_wrong` Forecast not reliable · `pincode_mapping` Wrong pincodes mapped · `capacity_mismatch` Plan doesn't match capacity |
| App / Tech (`app`) | Partner app, scanning, data shown | `app_slow_crash` App slow or crashes · `scan_issue` Scanning problems · `wrong_data` Wrong data in app · `login_otp` Login / OTP problems · `missing_feature` Missing a feature we need |

**Support items:** `agent_behaviour` Agent's behaviour · `understood_problem` Understood my problem · `time_to_resolve` Time to resolve · `kept_updated` Kept me updated.

## 3. Phase 2 scope: Apps Script, link generator and the control panel

The brief's Phase 2 is "Apps Script + link generator". On 20 Oct at 14:32 IST Pranav widened it:

> "these are nice - but ideally we would need this form to be completely customizable with ease as one wants to do it - since u and i wont be the only ones working on it - so I hope that will be in the command panel along with all the other essential things that are supposed to be there - if thats part of phase 2 then coolio"

He also gave his company Google account and the repository, https://github.com/PranavAkellaPS37/NPS-Form- . At 14:35 IST he answered three questions:

| Question | Pranav's answer |
|---|---|
| Where should the control panel live? | **Inside the Google Sheet**: open the Sheet, then Partner Pulse > Open control panel. Editors of the Sheet can use it. (The option's text said "whoever you share the Sheet with"; the 14:49 plan made that editors.) |
| When someone clicks Publish, how should the change reach partners? | **Instantly, through Google**: live within about a minute. The form reads the published version from Apps Script, and if Google is slow it uses the copy stored in GitHub. |
| May I make the first git commit (Phase 1)? | **Yes, commit now.** Done as `49e9c2b` at 14:41 IST, not pushed (rewritten on 21 Oct as `25c2bfd` to remove personal details; §4, §6 item 13). |

**The plan announced at 14:49 IST**, which Pranav didn't object to:
- **The panel**, a full-screen dialog in the Sheet with these sections:
  - **Questions:** add, reword, reorder, hide or delete, with a plain-English rule builder.
  - **Areas & problems:** areas and chips, and per-area thresholds.
  - **Texts & translations:** all six languages side by side, a "still to translate" filter and progress per language.
  - **Look & feel:** colours, logo and product name, with a live preview.
  - **Rounds:** create, open and close, plus each round's "What changed".
  - **Links:** personal links per DC as a CSV.
  - **Publish:** checks with "Go there" links, Preview of the unpublished draft, Publish (live within about a minute), and full version history with one-click Restore.
- **Storage:** one data spreadsheet per round, and voice notes in Google Drive.
- **Link checking:** the link secret never leaves Google. (Changed since: a Sheet editor can reveal it by typing SHOW; approved 21 Oct, §5.)
- **The form:** it loads the published questionnaire, has a preview mode, and says "closed" or "not open yet" when a round isn't running.
- **Deployment:** GitHub Pages deploys automatically, only after the settings check passes.
- **Guides:** a setup guide for the Sheet, a user guide for colleagues, and an offline link generator script.
- **Testing:** a local imitation of Apps Script, because real Google can't be run from this Mac, followed by independent reviews of security and of ease of use for non-technical staff.

## 4. Decisions log

Dates are 2026, IST. "Brief" means the original brief (§1).

| When | Decision | By |
|---|---|---|
| 19 Oct 17:05 | Free stack only: GitHub Pages, Apps Script, Sheets + Drive, the MacBook | Brief |
| 19 Oct 17:05 | Tamper-proof links: token = HMAC of DC + round with a secret held only in Apps Script | Brief |
| 19 Oct 17:12 | Phase 1 design (§2): JSON config, Option A screens, the listed assumptions, placeholder taxonomy | Pranav ("ok") |
| 19–20 Oct (Phase 1 build) | The dashboard counts only the latest submission per DC per round (written into docs/submission-format.md; `dc_round_seen_before` marks repeats) | Claude |
| 20 Oct (Phase 2 design) | Copy-paste setup into the Apps Script editor rather than clasp (the brief left it to the builder; clasp is documented as an optional developer route) | Claude |
| 20 Oct 14:12 | Wording changes and additions at the Phase 1 hand-off (§2.4) | Claude, not objected to |
| 20 Oct 14:32 | Phase 2 also delivers a no-code control panel | Pranav |
| 20 Oct 14:35 | Panel inside the Google Sheet; publish instantly through Google; commit Phase 1 | Pranav |
| 20 Oct 14:49 | One data spreadsheet per round; voice notes in Drive under the round's folder | Claude, announced; approved by Pranav 21 Oct |
| 20 Oct ~19:00 | `Panel.gs` renamed `PanelServer.gs`: Apps Script refuses a script and an HTML file with the same name | Claude |
| 20 Oct ~19:00 | Preview links need a private preview key (`pk`), which can be rotated from the panel | Claude |
| 20 Oct ~19:00 | Live questions and codes can be hidden, never deleted, so earlier rounds stay readable. (Gap: once an item is hidden and the questionnaire published, it can be deleted again; STATE.md, Later.) | Claude |
| 20 Oct ~19:45 | Security review fixes: size limits on everything partners send, formula guard on exported links, link checked before voice notes are opened, GitHub actions pinned, unsent answers deleted from phones after 30 days | Claude |
| 20 Oct ~20:00 | Codes lock only once the first round has been opened, so Pranav can replace the placeholder taxonomy | Claude |
| 20 Oct ~20:00 | The web app address is saved in the panel with a health check; Google's own `getUrl()` is unreliable | Claude |
| 20 Oct ~20:00 | Admin work uses the document lock so it never blocks partners; the submission lock waits at most 8 s | Claude |
| 20 Oct ~20:00 | Never-seen round ids report "draft" (the form shows "not open yet" at once) | Claude |
| 20 Oct 20:04 | A colleague status page: every code change, test run and agent run is logged on it (CLAUDE.md rule 8) | Pranav |
| 20 Oct 20:32 | Stop writing code and re-check after the compaction. Create CLAUDE.md (under ~300 lines, long detail in docs/spec.md, anything unsure marked [UNCONFIRMED] and asked) and docs/STATE.md (updated after every task); standing rules 1 and 2; then show the remaining Phase 2 work and wait for his OK | Pranav |
| 20 Oct 20:35 | The three fixers already running (F1–F3) were allowed to finish by 20:42, because stopping them would have left files half-changed; the docs and strict-test jobs (F4, F5) were stopped at 20:43, before they changed anything | Claude (told Pranav at 20:46) |
| 21 Oct ~08:45 | The remaining Phase 2 list is approved (STATE.md items 1–11), with all 8 recommendations in §6: test rounds never lock codes; one "Authorization is required" message; keep SHOW for the link secret; keep one spreadsheet per round; keep skipping numeric DC ids; rebuild the tests into `tests/`; Pages address confirmed; protect the `nps`/`support_gate` codes | Pranav ("ok") |
| 21 Oct ~11:10 | The smoke test uses a new obviously fake DC per run (`DC-SMOKE-<date>-<time>-<4 hex>`), so it can be repeated on the live backend (the per-DC cap of 10 stopped a fixed DC). Phases 3 and 4 must therefore ignore test rounds (ids starting SMOKE, DEMO or TEST) and `DC-SMOKE-*` ids | Claude (STATE item 6) |
| 21 Oct ~11:20 | "The latest submission per DC per round" means the one with the latest `received_at` (the server's clock), not `submitted_at` (the phone's clock); written into docs/submission-format.md §9 | Claude (STATE item 5) |
| 21 Oct ~11:20 | CHANGELOG [0.2.0] is dated 2026-10-21, the day its last changes were made; change the date if the Phase 2 commit happens later | Claude (STATE item 5) |
| 21 Oct ~17:35 | Before the first push, the two local commits are rewritten: this Mac's folder path becomes `~/NPSF`, and the author email becomes `PranavAkellaPS37@users.noreply.github.com` (also this project's git email from now on). The upload address names the account (`https://PranavAkellaPS37@github.com/…`), because this Mac's Keychain holds another GitHub login | Pranav (open question 13, recommendation accepted; the email added by Claude) |

## 5. Where the build differs from the brief

From the re-check of 20 Oct 2026. "Approved" means Pranav agreed (§2–§4). **[UNCONFIRMED]** means it is waiting for his answer (§6).

| The brief says | The build does | Status |
|---|---|---|
| ~8 screens, one question per screen | 10–19 screen views: one per area, plus a problem screen per low area. 10 at least (language in the link, no "What changed", no low areas, support No), about 12 typical, up to 19 (all six areas rated 3 or lower, support Yes). The problem chips share a screen with "Tell us more", and the four support ratings share one screen | Approved (Option A, §2.2) |
| S2 "Would you recommend Valmo to another DC owner?" | "How likely are you to recommend Valmo to another DC owner?" | Approved (§2.3) |
| S0 also pre-selects from `?lang=` | With `?lang=` the picker is skipped; a header button still switches language. Removing `skip_if` would show the picker pre-selected | Approved (§2.3) |
| S4 follows each low-rated function | Problem screens come after all six ratings (setting `deep_dive.when` can switch to "immediate") | Approved (§2.3) |
| (not in the brief) | "I don't handle this" instead of a rating; not counted | Approved (§2.3) |
| JSON/YAML config | JSON only, with `_help` notes | Approved (§2.1) |
| All UI strings in the single string table | Boot texts (loading, no-JavaScript and boot-error messages) are fixed in English and Hindi because they show before the texts load. Small formatting bits ("0 = ", "…") are in code | Claude; minor |
| Colours from config | The 9 brand colours come from config. Status colours (test-mode and preview banners, warnings) are fixed in CSS | Claude; minor |
| Read-aloud "a speaker icon on every question" | Missing on the support comment and the "Tell us more" heading | Gap, to fix (STATE.md item 9) |
| Read-aloud "a speaker icon on every question" | No speaker on the language screen: no language is chosen yet, and each button shows its language's name in its own script | **[UNCONFIRMED]**, §6 item 11 |
| A `doGet` for "what changed" per round | The single `?action=bootstrap` carries it with the published questionnaire; `?action=whats_changed` still answers | Claude (Phase 2 design) |
| `doPost` writes four sheets | It also writes a `pings` tab (opened/started/progress, for fill rates). It stores answers only for open or closed rounds, marks closed-round answers `late`, and stores at most 10 submissions per DC per round | Claude (Phase 2 design) |
| Storage in "the Sheet" | A control Sheet (the panel's tabs) plus one data spreadsheet per round in Drive | Approved (Pranav, 21 Oct) |
| The secret is held only in Apps Script | Kept in Script Properties, but any Sheet editor can reveal it in the panel (type SHOW). The offline Python link generator needs it | Approved (Pranav, 21 Oct) |
| Phase 2 = Apps Script + link generator | Also a full no-code control panel | Approved (Pranav, 20 Oct) |
| `requirements.txt` per folder | `scripts/` uses only the Python standard library and has no `requirements.txt` yet | To add (STATE.md item 4) |
| Typical path under 90 seconds | Not measured with people; a scripted run took 40 s | Check in the field |

## 6. Open questions

**Items 1–8 were decided on 21 Oct 2026 (~08:45 IST).** Pranav accepted every recommendation ("ok"). They're kept here with their reasons.

1. **Test rounds and the code lock.** Opening any round locks every code in the live version for good, and the setup guide opens a test round (SMOKE-R1) before the real taxonomy is in.
   - **Decided, and built on 21 Oct (STATE.md item 2):** rounds whose id starts with SMOKE, DEMO or TEST never lock codes, and the setup guide, README and user guide have the real taxonomy put in before the first real round. The panel also warns "This locks the codes" before the first real round opens.
2. **"Authorization is required" advice.** The panel says "another Google account"; the server says "tick Select all".
   - **Decided, and built on 21 Oct (STATE.md item 3):** one message giving both causes, the most likely first (another Google account, then "tick Select all"), word for word the same in the server and the panel.
3. **Revealing the link secret in the panel** (type SHOW), for the offline Python link generator and the smoke test.
   - **Decided:** keep it, with its warnings.
4. **One data spreadsheet per round.**
   - **Decided:** keep it. It stays well under Google's 10-million-cell limit per spreadsheet.
5. **DC ids that Sheets stores as numbers** (e.g. 12345).
   - **Decided:** keep skipping them with "type the id as text", so leading zeros are never lost silently.
6. **Where the developer test suites live.** They were in a temporary folder that the 21 Oct restart wiped.
   - **Decided:** rebuild them from the session records into `tests/` in the repo. It's a developer-only Node package; nothing changes for partners.
7. **GitHub Pages address.**
   - **Decided:** `https://pranavakellaps37.github.io/NPS-Form-/` is confirmed.
8. **The `nps` and `support_gate` question codes.** The responses tab's `nps` and `support_contacted` columns depend on them, and today the panel lets an admin re-code or delete them.
   - **Decided, and built on 21 Oct (STATE.md item 3):** the panel won't delete or re-code these two (they can still be hidden), and the checks warn if one goes missing, for example after an edit made directly in the Screens tab.
9. **Still open: Phase 3 choices** (the brief says "your call — explain"). They'll be proposed at the start of Phase 3:
   - Sheets API access: service account or OAuth;
   - whisper.cpp or mlx-whisper;
   - Gemma 3 12B or Qwen3 14B.
10. **Still open: inputs only Pranav can give:**
    - the real issue taxonomy (before round 1);
    - Tamil, Telugu, Kannada and Malayalam translations (native speakers);
    - a native Hindi speaker's read-through of the Hindi on a phone (Phase 1 checklist);
    - Valmo brand colours, and a logo file if he wants one;
    - confirmation that DC ids use only letters, digits, `_`, `.` and `-` (64 characters at most);
    - the Sheet ID (the brief: "leave blank for now"), once the Sheet exists; Phase 3 needs it.

**Items 11–14 were raised on 21 Oct by the critics' check of these files. Each is [UNCONFIRMED] until Pranav answers; Claude's recommendation follows each.**

11. **Still open [UNCONFIRMED]: no speaker on the language screen.** The brief asks for a speaker icon on every question. The language screen has none: no language is chosen yet, and each button shows its language's name in its own script. (The two other missing speakers will be added by STATE.md item 9.)
    - **Recommended:** accept it as the one exception. Links normally carry the partner's language (`&lang=`), so most partners never see this screen.
12. **Still open [UNCONFIRMED]: Restore deletes "What changed" text.** Restoring an older version deletes the "What changed" bullets of every round that version didn't have. So restoring after creating a new round silently erases that round's text.
    - **Recommended:** keep those bullets. Restore should bring back an old questionnaire, not wipe newer rounds' text. It's a small change in Model.gs.
13. **Decided (Pranav, 21 Oct ~17:35 IST): clean the commits before the first push. Done.** This Mac's folder path (6 copies in the Phase 1 commit) became `~/NPSF`, and the author email of both local commits, Pranav's work address, became GitHub's no-reply address `PranavAkellaPS37@users.noreply.github.com`; this project's git email is set to it for future commits. The final files are byte-identical; the Phase 1 commit is now `25c2bfd`. A backup of the old commits is kept outside the project (session scratchpad).
14. **Still open [UNCONFIRMED]: an old style warning in the Google imitation.** Its scenario S warns that Model.gs declares its fixed lists with the older word `var`. Model.gs does it on purpose, so that the tests can see those lists, and since 21 Oct the design contract (section 2) allows it as an exception; only the imitation's warning is left. It's developer-only; nothing changes for partners.
    - **Recommended:** relax the rule for these lists when the imitation is updated (STATE.md item 6), so the scenario can pass.

## 7. Detailed contracts and guides

| Document | What it holds | Accurate? (21 Oct, after STATE items 5, 8 and 9) |
|---|---|---|
| [submission-format.md](submission-format.md) | What the form sends and the backend answers: transport, `ping`, `submit`, GET requests, the token, round status, preview, live storage, limits, test server vs live backend, how to read the data | Yes: rewritten and verified against the code on 21 Oct (215 statements checked) |
| [control-panel-design.md](control-panel-design.md) | Phase 2 technical contract: tabs, model, settings schema, compile, validation, publish/restore, rounds, web API, panel server API, panel UI, storage keys, security, limits | Yes: rewritten and verified on 21 Oct (about 450 statements checked); its allowed-calls list matches the code both ways |
| [control-panel.md](control-panel.md) | User guide for colleagues: tour, Save/Preview/Publish loop, 12 recipes, errors | Yes: updated and verified on 21 Oct |
| [config-guide.md](config-guide.md) | Every setting in `web/config` and `web/i18n`, with recipes | Yes: updated on 21 Oct (the GitHub copy, `apps_script_url`, https logo and clip addresses, round names) |
| [../apps-script/README.md](../apps-script/README.md) | Setup guide for the Sheet and the web app (Parts A–G) | Yes: updated and verified on 21 Oct (step 10 records the web app address; step numbers unchanged) |
| [../README.md](../README.md) | End-to-end guide: trying the form on the Mac, going live, changing questions, translations | Yes: updated and verified on 21 Oct |
| [../CHANGELOG.md](../CHANGELOG.md) | Changes per version ([0.1.0], [0.2.0]) | Yes: [0.2.0] covers the 20 and 21 Oct fixes |
| [../tests/README.md](../tests/README.md) | The developer test suites, how to run them, today's expected results | Yes (21 Oct) |
