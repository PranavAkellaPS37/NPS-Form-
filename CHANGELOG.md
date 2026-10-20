<!--
===============================================================================
CHANGELOG.md: what changed in each version of Valmo Partner Pulse
===============================================================================
What this file is for
  A dated list of every notable change, newest first. Anyone can see what is
  new, what changed and what was fixed, without reading code.

How to update it
  1. Write each change under "Unreleased" as you make it, in plain English.
  2. When a version is finished, rename "Unreleased" to the new version
     number and the date (YYYY-MM-DD).
  3. Start a fresh, empty "Unreleased" section above it.

What it reads and writes
  Nothing. It is documentation only.

Safety
  Describe changes only. Never paste real partner data here.
===============================================================================
-->

# Changelog

All notable changes to Valmo Partner Pulse are listed here, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the number starts with `0.`, the project is still being built.

**Two different version numbers.** Do not mix them up:

| Name | Where it lives | Example | What it tracks |
|---|---|---|---|
| App version | This file. Sent as `app_version` with every answer. | `0.1.0` | The form's code and the tools. |
| Questionnaire version | `config_version` in `web/config/survey.json`. Sent with every answer. | `2026-10-19.1` | The questions, areas, chips and rules. |

## [Unreleased]

Nothing yet. Next up is **Phase 2: go live**. It brings a Google Apps Script backend that checks every link and saves answers in a Google Sheet, a personal link for every DC, and the form online on GitHub Pages.

## [0.1.0] - 2026-10-19 - Phase 1: form + config + mock backend

The first working version: the complete survey form, all its settings, and a test server that runs on a Mac. Nothing is live yet. Answers only reach the test server.

### Added

**Survey form (`web/`)**

- A one-question-per-screen survey designed for Android phones. It is plain HTML, CSS and JavaScript with no build step, ready to be hosted on GitHub Pages. It reads all its settings and texts when it starts.
- Screens, in order:
  - language picker, skipped when the link has `lang=`;
  - "What changed since your last feedback" card, skipped when the round has nothing to show;
  - "How likely are you to recommend Valmo to another DC owner?" (0–10);
  - one screen per area, with five faces and "I don't handle this";
  - "What is the main problem?" for every area rated 3 or lower, asked after all six ratings, with problem chips, "Other", and an optional voice note or text;
  - "In the last 30 days, did you contact Valmo support?";
  - the support block (four rows of faces on one screen, plus an optional comment), only after Yes;
  - "If Valmo could fix just one thing for you, what should it be?" (optional);
  - the thank-you screen.
- A header with the product name, a language button that works on any screen, and a progress bar.
- Single-answer screens move on by themselves after a tap. The on-screen Back button and the phone's back button both go to the previous screen.
- A speaker button that reads each question aloud. It plays a pre-recorded mp3 when one exists, otherwise the phone's own voice, and hides itself when neither is available.
- Voice notes:
  - a one-line consent note before the first recording;
  - hold to talk, release to stop;
  - a 60-second limit with a countdown;
  - play, delete and record again.

  If the microphone is blocked or not supported, a text box appears instead.
- Answers are saved on the phone as the partner goes. Reopening the link continues where they left off.
- Reliable sending:
  - "Sending…" then "Thank you";
  - on failure, a plain explanation and automatic retries after 2, 5, 10, 20, 40, 60, 60, 120, 120 and 300 seconds;
  - another try when the internet comes back or the page is reopened;
  - a "Send now" button.

  Every retry carries the same submission id, so an answer is never stored twice.
- Built for patchy data and cheap phones:
  - bigger sends (voice notes on slow data) automatically get more time before they count as failed;
  - if the partner leaves the page while sending, small answer sets are still delivered by the browser, and bigger ones are sent the next time the link is opened;
  - "Sending your answers…" asks the partner to keep the page open until "Thank you".
- Double-tap protection: a tap on an answer, Next or Skip within half a second of a new screen appearing is ignored, so a double tap never answers or submits the next screen.
- A link the server rejected unlocks by itself when a corrected link is opened, or when the server accepts it again.
- With the same link open in two tabs, a tab can never undo answers already sent from the other tab.
- If the questionnaire changes between visits, the partner continues at the first screen they have not answered yet.
- Link details `dc`, `t` (token), `round`, `lang` and `mock=1`. There are clear messages for an invalid link, an incomplete link (live mode only) and a partner who has already answered.
- Only answers from the screens the partner finally saw are sent. Going Back and raising a low rating drops that area's problem answer.
- Small progress messages (opened, started, how far the partner got) so the dashboard can show where partners drop off. They never contain answers.
- Test mode:
  - a yellow "TEST MODE" banner that also says how many texts are not yet translated for the chosen language;
  - a "Start again (test mode)" button on the thank-you and "Already received" screens.

**Settings (`web/config/`)**

- `survey.json` holds the whole questionnaire as settings, each part with a plain-English `_help` note:
  - six areas (Losses & Debits, Payments / Payouts, Line Haul, Consumables, Orders & Planning, App / Tech), each with five problem chips plus an automatic "Other";
  - the problem-screen threshold (3), set for all areas or for one;
  - when the problem screens are asked, and the support block;
  - voice, read-aloud, retry and progress-message settings;
  - placeholder purple colours until Valmo's brand colours arrive;
  - the screen `flow`, with `show_if` rules (including "did the partner type or record anything" on free-text screens);
  - an optional "Doesn't apply" choice on support rows (`support.allow_not_applicable`).
- `whats_changed.json`: the "What changed" card for each round. It has fake `[SAMPLE]` content for `DEMO-R1` and an empty `2026-R1`.
- `audio_clips.json`: the list of optional recorded read-aloud clips. It is empty for now.

**Languages (`web/i18n/strings.json`)**

- One table of every text on screen, in six languages: English, Hindi, Tamil, Telugu, Kannada and Malayalam.
- English and Hindi are fully written. Tamil, Telugu, Kannada and Malayalam are `[TRANSLATE]` placeholders. Partners see these in English until a native speaker replaces them.

**Tools (`scripts/`), using only Python's standard library, so there is nothing to install**

- `mock_server.py`: a test server at `http://localhost:8787` that shows the form and receives answers.
  - It saves to `local_data/`: answers in `responses.jsonl`, progress messages in `events.jsonl`, voice notes in `audio/`.
  - It prints ready-to-use demo links when it starts.
  - Options:
    - `--port`: use a different port;
    - `--lan`: open the survey from a phone on the same Wi-Fi;
    - `--strict`: reject wrong tokens;
    - `--one-response-per-dc`: answer "already received" for a DC that has already answered;
    - `--fail-rate` and `--slow`: imitate bad internet;
    - `--data-dir`: save test data in another folder;
    - `--reset`: delete the test data, after you type "yes".
- `smoke_test.py`: checks that a running backend answers correctly and prints PASS/FAIL lines. Its test data uses the fake DC `DC-SMOKE-TEST`. `--url` points it at another backend (for example the live one in Phase 2), and `--expect-strict` is for a backend that rejects wrong tokens.
- `check_config.py`: checks all settings and texts without changing anything. It explains every problem in plain English, as errors (must fix) or warnings (worth a look), shows translation progress per language, and reports the page weight against the 300 KB budget.
- `strings_csv.py`: exports the texts to a spreadsheet for translators and imports them back. It has `--only-untranslated`, `--lang` and a `--dry-run` preview.

**Documentation**

- `README.md`: what the project is, the no-real-data rule, a folder map, and step-by-step testing on a Mac and on a phone.
- `docs/config-guide.md`: every setting explained, with 15 copy-and-paste recipes.
- `docs/submission-format.md`: the data contract between the form and any backend (`schema_version` 1). It covers the messages, the server's replies, link tokens and what the test server stores.
- `web/audio/README.md`: how to add recorded read-aloud clips.
- `CHANGELOG.md`: this file.

**Safety**

- `.gitignore` keeps real data out of git:
  - local data folders;
  - spreadsheets and data exports;
  - voice recordings;
  - secrets such as keys and credentials.

  Only `sample_data/`, for obviously fake demo data, is allowed through.
- All test data uses obviously fake DC ids (`DC-DEMO-001`, `DC-SMOKE-TEST`).
- The test token secret is for testing only. The live secret will never be stored in this folder.
