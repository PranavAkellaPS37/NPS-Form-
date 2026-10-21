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
| App version | This file. Sent as `app_version` with every answer. | `0.2.0` | The form's code and the tools. |
| Questionnaire version | Made by the control panel each time you **Publish** (`p` + version number + date). Sent as `config_version` with every answer. When the form has to fall back to its backup copy, it sends `config_version` from `web/config/survey.json` instead. | `p7-2026-10-21` (published), `2026-10-19.1` (backup copy, until it is refreshed from the control panel) | The questions, areas, chips, rules and texts. |

## [Unreleased]

Nothing yet. Next up is **Phase 3: pipeline**. A Python program that downloads the answers from each round's data spreadsheet, transcribes the voice notes, and sorts comments and voice notes into the same area and problem codes.

## [0.2.0] - 2026-10-21 - Phase 2: control panel + live backend

The survey can now go live. A Google Sheet becomes the **control panel**, where colleagues change the whole questionnaire without touching code, run rounds, make links and publish. A Google Apps Script **web app** inside that Sheet hands the published questionnaire to the form, checks every link and saves the answers in Google Drive. The form goes online on GitHub Pages.

This version also contains the fixes from the independent review of 20 Oct and the checks of 21 Oct (see **Fixed**), all made before anything went live.

### Added

**Control panel in a Google Sheet (`apps-script/Panel.html` and `apps-script/PanelServer.gs`)**

- The Google Sheet **Valmo Partner Pulse - Control** has a **Partner Pulse** menu: *Open control panel*, *Preview the draft form*, *Publish…*, *Generate links…*, *Share the Drive folder with all editors*, *Set up or repair* and *Help*.
- The panel's script file is called `PanelServer`, because Apps Script refuses a Script file and an HTML file with the same name, and the HTML file must be called `Panel`.
- The control panel opens as a window inside the Sheet, and shrinks itself to fit a small laptop screen. It is written in plain English and has ten sections:
  - **Home**: the live version, whether the draft differs from it, "What to do next" hints, every round with its numbers (links, opened, started, sent answers, % answered, by language, time of the last answer), quick links to the Sheet, the Drive folder and the form, and the **web app address** (paste it once and press **Check and save**; after that it shows with **Copy** and **Change**);
  - **Questions**: the screens in order, as cards. Add questions of six kinds (0 to 10 question, Faces question (1 to 5), Yes / No question, Pick one answer, Voice note or typing, Information card), reword them in every language, reorder and hide them, and set "Only show it if…" rules with a rule builder that reads each rule back as a sentence;
  - **Areas & problems**: the areas partners rate and each area's problem chips (4–6 recommended, "Other" added automatically), with an optional threshold per area;
  - **Support questions**: the support items, "Doesn't apply", and the optional comment with its question;
  - **Texts & translations**: every text in every language, translation progress per language, search, a "still to translate" filter, and notes for translators with a **Checked** button;
  - **Look & feel**: the product name, logo, 9 colours and the 5 faces, with a preview sketch;
  - **Rounds**: create rounds, open, close and re-open them, delete one that was never opened, note their dates, write each round's "What changed" bullets, and open each round's answers sheet and voice-notes folder;
  - **Links**: make every active DC's link for a round, download them as CSV, copy them, find one DC's link, and show the link secret for the Python tool (after typing SHOW);
  - **Publish**: check for problems (each with a **Go there** button), publish with a note, see every published version, restore an old one, and download the files for the GitHub copy;
  - **Settings**: every other setting, in groups, plus the language list (add, remove, reorder, switch off), the web app address, Import from GitHub, and **Make new preview links** (a new private preview key: every older preview link stops working).
- **Draft and live.** The Sheet's questionnaire tabs are a draft that partners never see.
  - **Preview** shows the draft to admins only. Nothing is saved.
  - **Publish** checks the draft (errors block publishing, warnings never do), saves it as `published/p<N>.json` in Google Drive, and makes it live at once, stamped `p<N>-<date>` (for example `p7-2026-10-21`).
  - Every published version is kept. **Restore** brings any version back as the draft, to be published again as a new version. Everything the draft has that the version lacks (a language, area, problem, support question or question) is kept, switched off, in its place, with its texts, translations and recordings.
- **Translation helpers** when saving: an empty translation becomes `[TRANSLATE]` plus the English; untranslated texts follow changes to the English; a real translation gets a note "English changed on <date>: please re-check the translations." when its English changes.
- **Codes are protected once partners can have answered.** A code is what the data uses for a question, area, chip, answer option or support item.
  - Until the first real round opens, every code can still be renamed or deleted, so the placeholder questionnaire can be replaced freely. The panel says so ("Codes lock when the first real round opens…"), and opening the first real round warns "This locks the codes" first.
  - From then on, for good (Script Property `ROUNDS_EVER_OPENED`), a code in the live version shows a lock: it cannot be renamed or deleted, only hidden. A live question can no longer be deleted at all: the panel offers **Hide it instead**. **Check for problems** warns if a live code goes missing from the draft.
  - **Test rounds** never lock the codes: rounds whose id starts with SMOKE, DEMO or TEST, in capitals or not (for example the setup guide's smoke-test round `SMOKE-R1`). Their links must never go to real partners.
  - The questions `nps` and `support_gate` fill their own columns of every round's answers sheet (`nps` and `support_contacted`), so the panel never deletes them or changes their code (they can still be hidden), and **Check for problems** warns if one goes missing.
  - If Google Drive has a passing problem reading the live version when the panel opens, every code stays locked and the panel says why.
- **Safe teamwork and undo.** If someone else saved in the meantime, Save offers "Reload the latest version" (the main button) or "Keep mine and overwrite" (shown as a warning; afterwards the panel says whose changes were replaced). **Discard** throws away unsaved changes; **Undo** follows every delete; changes not saved when the window closed are offered back the next time ("Bring back your unsaved changes?"); **Ctrl+S** saves.
- **Import from GitHub** turns the repository's copy of the questionnaire into the draft. **Download files for the GitHub copy** produces `survey.json`, `strings.json`, `whats_changed.json` and `audio_clips.json` in the repository's formats, to refresh the backup copy. When the draft is the live version, `survey.json` carries the live version's stamp. `survey.json` gets the recorded web app address and live mode; while no address is recorded it stays in test mode (`"mock"`), so it still passes the settings check, and the panel says why.
- **The web app address is recorded and checked in the panel** (Home, or Settings > Form address: paste it, then **Check and save**). Only an address like `https://script.google.com/macros/s/<id>/exec` is accepted: a company address with `/a/macros/<domain>/` is turned into that form, and `/dev` and `googleusercontent` addresses are refused with a hint. The panel then checks that the address really answers as Partner Pulse (`?action=health`) before keeping it (Script Property `WEB_APP_URL`). The GitHub copy uses it.
- **Opening a round** warns when partners would not get the draft ("Partners will get version N…" or "Nothing has been published yet…"), with **Cancel**, **Publish first** and **Open anyway**; after **Publish first**, the panel offers to open the round. **Publish** says "Publish anyway" when the draft is the same as the live version.

**Live backend (`apps-script/Code.gs`, `apps-script/Model.gs`)**

- **Set up or repair** creates the tabs (questionnaire tabs in purple; Rounds, DCs and Links in green; Publish history in grey), the Google Drive folder **Valmo Partner Pulse** (with `published/` and `rounds/`), the link secret and the private preview key, and records who ran it first as the owner of the folder. The first time, it offers to copy the questionnaire from GitHub and to publish it as version 1. It formats the DCs tab's `dc_id` column as plain text, so an id such as `0123` keeps its 0. Its closing message explains how to deploy the web app and where to paste its address in the control panel. It is safe to run again: it never deletes content and never changes the secret.
- **Share the Drive folder with all editors** gives everyone who can edit the Sheet edit access to the Drive folder, which co-admins need to publish, restore, open rounds and see the numbers. Without it, a colleague may not even be able to open the control panel: whenever Google's short-term copy of the live version has expired (it is kept for at most 6 hours), the panel stops with a message naming the owner and this menu item.
- A public **web app** (*Execute as: Me*, *Who has access: Anyone*) that follows [docs/submission-format.md](docs/submission-format.md):
  - `health` (with `runs_as_owner`: whether the web app runs as the owner), `bootstrap` (the published questionnaire and the round's status; `draft=1` with the preview key for previews) and `whats_changed` (kept for compatibility);
  - `ping` and `submit`, with strict token checks, de-duplication by `submission_id`, one submission written at a time, a 25 MB limit per message and 5 MB per voice note, at most 10 stored submissions per DC and round, and a limit of 60 progress signals per DC and round in 10 minutes;
  - the live questionnaire is served from Google's script cache, so the form starts quickly.
- **Rounds** have a status: draft (links say "not open yet"), open, or closed (new visitors see "This survey has closed"; partners already in the middle can finish, and their answers are marked late). Opening or closing a round takes effect at once, without Publish. A round id the backend has never seen also counts as a draft.
- **One data spreadsheet per round** (**Valmo Partner Pulse - data - &lt;round&gt;**, with the tabs `responses`, `function_ratings`, `free_text`, `events` and `pings`), created when the round is first opened, and a folder for that round's voice notes.
- **Counts per round**: links, opened, started, sent answers, by language, and the time of the last answer.
- **Links** for every active DC in the **DCs** tab, kept in the **Links** tab (one row per DC per round), downloadable as CSV. A DC id that Google Sheets has turned into a number or a date gets no link: the panel lists it with "Type the id as text".
- `appsscript.json`: the project manifest, for people who upload the code with `clasp`.

**Form (`web/`)**

- When a link is opened, one **bootstrap** request fetches the published questionnaire, its texts, the round's "What changed" and the round's status. It replaces the separate "What changed" request. If Google does not answer within `whats_changed.timeout_seconds` + 2 seconds (6 seconds by default), the form uses its backup copy in `web/config/` and `web/i18n/`.
- The form downloads its own copy of the texts (`web/i18n/strings.json`) **only** when the bootstrap fails, so partners on slow data never download the texts twice.
- **Round status**: "This survey is not open yet" for draft rounds (and for a round id the live backend has never seen), "This survey has closed" for closed rounds (a partner who already started on that phone can still finish).
- **Preview mode** (`?preview=1`): shows the draft, with a blue "PREVIEW: answers are not saved" strip. It passes the link's preview key to the backend, waits up to 20 seconds for the draft, and if the draft does not arrive shows the form's stored copy with the notice "Could not load the draft: showing the form's stored copy. Open the preview link from the control panel again." It sends nothing, keeps its own saved progress, and ends with "Preview finished. Nothing was saved." and a **Start again** button.
- The progress bar is hidden on the "has closed", "not open yet" and "link incomplete" screens, where a full bar would wrongly suggest the survey was finished.
- Eight new texts, in English and Hindi (the other languages are `[TRANSLATE]`): `round.closed_title`, `round.closed_body`, `round.not_open_title`, `round.not_open_body`, `dev.preview_banner`, `dev.preview_done`, `dev.preview_fallback` and `ui.start_again`.

**Tools (`scripts/`)**

- `generate_links.py`: the offline way to make partners' links, from a CSV file of DCs, with exactly the same formula as the control panel.
  - It reads the secret from the `PULSE_LINK_SECRET` setting or a `.env` file, or asks for it without showing it. It never prints the secret.
  - It reads the columns `dc_id`, `language` (or `lang`), `dc_name`, `state`, `region` and `active`, checks DC ids, round ids and language codes, and explains every row it skips. It warns about the test server's secret (and that links made with it for the real form will all be refused) and about test rounds such as `SMOKE-R1`.
  - With a `--base-url` of `localhost` or `127.0.0.1` it makes test links that end in `&mock=1` (like the test server's own links), and only then prints the test server's hints.
  - It saves a UTF-8 CSV that Excel opens correctly, refuses to save inside `web/` or `sample_data/`, and never overwrites a file unless told to (`--overwrite`).
- `mock_server.py`: answers `bootstrap` like the live backend, and has two new options, `--closed-rounds` and `--draft-rounds`, to test closed and not-yet-open rounds. Messages for draft rounds are refused with `round_not_open`; answers for closed rounds are saved marked late. Every link it prints ends in `&mock=1`, so the links keep working after the form is switched to the live backend, and it also prints a PREVIEW link.
- `smoke_test.py`: also checks that `bootstrap` returns a questionnaire. On a live backend it explains the two new failures: nothing published yet ("Publish from the control panel first") and round `SMOKE-R1` not open (`round_not_open`).
  - It can be run again and again on the live backend (21 Oct). Every run uses a new, obviously fake DC (`DC-SMOKE-<date>-<time>-<4 characters>`; `--dc` picks one instead), so it never reaches the limit of 10 stored submissions per DC. Its "What changed" check accepts whatever news the backend really serves, even none, and checks that each item has a text in every language the questionnaire offers.
- `scripts/requirements.txt`: says there is nothing to install. Every script needs only Python 3.11 or newer and its standard library (the project asks for one requirements file per Python folder).

**Developer tests (`tests/`)**

- The developer test suites now live in the project, in `tests/`, with `tests/README.md` saying how to run each: the form end to end in headless Chrome at phone size; the flow rules; an imitation of Google that runs the real Apps Script code and the control panel; the questionnaire logic (`Model.gs`); the control panel bench; checks of the review fixes; and a save that shrinks every tab. They used to sit in a temporary folder outside the project, which a restart of the Mac wiped on 21 Oct; they were rebuilt exactly from the session records.
- Tool versions are pinned (`puppeteer-core` 23.11.1, `acorn` 8.14.0), and git rules keep screenshots and test data out of the project.

**Putting the form online**

- `.github/workflows/deploy-pages.yml`: after every push to `main` (or when started by hand), GitHub runs `scripts/check_config.py` and, only if it finds no errors, publishes the `web/` folder on GitHub Pages at https://pranavakellaps37.github.io/NPS-Form-/.

**Sample data**

- `sample_data/dcs_fake.csv`: 20 obviously fake DCs (`DC-DEMO-001` to `DC-DEMO-020`) in all six languages, for trying the link generator.

**Documentation**

- `apps-script/README.md`: step-by-step setup, in order: the Sheet and its four code files, set-up and version 1, the "Anyone" check (with a message for IT), the web app, connecting the form, the smoke test, a phone test, and sharing the Sheet and the Drive folder with colleagues, with troubleshooting.
- `docs/control-panel.md`: the user guide for colleagues: roles, adding a co-admin, golden rules, and recipes with exact clicks.
- `docs/control-panel-design.md`: the technical design of the control panel and the live backend.
- `README.md`: a new section, "Phase 2: go live", with every step in order, from pushing to GitHub to sending the links in batches.

**Safeguards**

- **The draft stays private.** Preview links carry a private preview key (`&pk=…`). Without it the web app answers `bad_preview_key`, so nobody who only knows the web app address can read the unpublished draft or make the script re-read the whole Sheet.
- **Co-admins never split the data.** When a colleague cannot open the Drive folder, the script never quietly makes a second folder in their Drive: it stops with a plain message that names the owner and the menu item to run. Only **Set up or repair**, run by the owner, may replace a folder that was really deleted.
- **Everything stays in the owner's Drive.** Files a co-admin creates (a round's data spreadsheet and folders, a published version, the main folder if they had to create it), and voice notes saved while the web app runs as a co-admin, are handed over to the owner. This is best effort: when Google refuses (for example across companies), the file stays where it is, inside the shared folder. The health check's `runs_as_owner` says whether the web app runs as the owner.
- **Admins and partners do not wait for each other.** Control-panel changes (save, publish, restore, import, links, form address, preview key, round status) wait for each other on the Sheet's own lock; partners' answers use the script's lock. Opening a round takes the partners' lock for a moment, so a round's data spreadsheet is never created twice.
- **Permissions.** Every Partner Pulse menu item, and opening the control panel, first asks Google (where Google offers this) to show its permission screen again when a permission was left unticked. If that newer Google feature fails for another reason, the menu item carries on. "Specified permissions are not sufficient" becomes "use the Partner Pulse menu again and tick Select all". "Authorization is required" gets one message, word for word the same in the panel and on the server: most often Google is using another of your Google accounts (open the Sheet in a Chrome profile or Incognito window signed in only with your company account); otherwise a permission was left unticked.
- **Drive problems are explained.** When Google Drive refuses a colleague the live version or a folder, the panel says to ask the owner to run *Share the Drive folder with all editors*, instead of carrying on as if nothing was published. A passing Drive problem ("server error", "try again") gets its own "try again in a minute" message.
- **Exact data-tab widths.** Each tab of a round's data spreadsheet is exactly as wide as its columns. Google counts every cell, even an empty one, against a spreadsheet's 10 million cell limit, so a round of 10,000 partners stays near 3.5 million cells.
- The link secret is shown only after typing SHOW, every token is checked strictly, and rejected messages are never stored.
- Whatever partners or admins type is stored as text: answers such as `=1+1`, `007` or `2026-10-21` never turn into formulas, numbers or dates in the Sheet.
- Opening a round whose code contains DEMO needs an extra tick ("I understand: this is only for testing.").
- A new **DCs** tab starts with every **active** box ticked, and **Set up or repair** never re-ticks a box someone unticked.

### Changed

- `docs/submission-format.md`: the bootstrap request (with the preview key and `bad_preview_key`), downloading the texts only on fallback, round status (`round_not_open`, late answers, and `draft` for a round id the live backend has never seen), preview links, where the live backend keeps the data, how to read it (count a row of `events`, `free_text` or `function_ratings` only when its `submission_id` and `received_at` match a `responses` row), unused voice-note files, the limits on a message, and where the test server and the live backend differ. The message formats are unchanged (`schema_version` is still 1).
- The submission's `config_version` is now the questionnaire version the partner actually saw: the published one (for example `p7-2026-10-21`), or the backup copy's when the bootstrap did not arrive.
- The app version is now `0.2.0`.
- `scripts/check_config.py` knows the eight new texts the form uses, and `q.tell_more_required`, which the form already used.
- `README.md`:
  - the golden rule now covers the public GitHub copy, and keeping DC lists and links outside the project folder;
  - "Change the questions" and "Translations" point to the control panel, which is now where the live questionnaire is edited; the files in `web/` become the backup copy;
  - after go-live, local links need `&mock=1` (the test server's own links already have it);
  - the folder map, "What's next", the command cheat sheet, the troubleshooting table and the word list are updated.
- `docs/config-guide.md`: notes on where each setting lives now that the control panel exists, the bootstrap wait (`whats_changed.timeout_seconds` + 2 seconds; 20 seconds for previews), the new texts, and pointers to the control panel recipes (Recipes 12, 13, 14 and 15).
- `.gitignore` also ignores `.clasp.json` (the optional `clasp` tool's link to one person's Apps Script project).
- **Sending answers holds up other partners less.** Voice notes are saved in Drive before a submission waits for its turn, and a quick look at the `responses` tab first stops a copy that is already stored, or a DC that already has 10, from saving any recordings. A submission waits at most 8 seconds for its turn (was 20), then is answered "busy, try again" and the phone sends it again. A stored submission's id is remembered for 15 minutes (was 6 hours): the `responses` tab is the real duplicate check. Searches look only at the one column they need, and the `responses` row is written last.
- **No personal details in files headed for the public repository** (21 Oct). The guides no longer contain this Mac's folder path or a personal email address: they use `~/NPSF` (explained in the README), "your company Google account", or obviously made-up addresses.
- `web/audio/README.md` explains the Phase 2 way to add clips: list them in the Sheet's **Audio clips** tab and publish; `web/config/audio_clips.json` is only the backup copy.
- The settings notes `read_aloud._help` and `whats_changed._help` now describe Phase 2 (where clips and "What changed" come from in live mode), in `web/config/survey.json` and in Model.gs's copy for the GitHub copy, so the two stay identical.
- Control panel wording:
  - **Check for problems** names "question N" with the start of its English text and puts codes only in brackets (a wrong code gets a suggestion); setting help no longer mentions codes;
  - Links and Preview start on the newest round, and the Preview dialog warns that anyone with a preview link can see the unpublished draft;
  - a mistyped colour code is pointed out right under its box;
  - Home's "What to do next" hint says the web app address is what the GitHub copy of the questionnaire points the form at.

### Fixed

Found by the independent review of 20 Oct and the checks of 21 Oct, before anything went live:

- **Publish crashed on real Google.** It gave Google a file type that does not exist (`MimeType.JSON`). It now passes `'application/json'`.
- **Saving crashed on real Google** whenever a tab got shorter: it called `Range.clearContents`, which does not exist (Google's is `clearContent`). Saving now also checks and plans every tab before writing anything. It refuses with "Nothing was changed" for a tab it cannot read, a look-alike tab name (such as "texts"), or a value too long for one cell; it adds rows and columns when a tab is too small; and it explains a save that stopped half-way.
- **Restore lost hidden items.** A published version leaves out everything hidden, so restoring one dropped what was hidden (or added since). Now those items come back switched off, in their place, with their texts, translations and recordings.
- **The web app address came from Google's own guess** (`ScriptApp.getService().getUrl()`), which is often the editors-only `/dev` address or an old deployment. It now comes only from the address recorded and checked in the panel.
- **Codes locked too early:** every placeholder code was locked as soon as version 1 was published, before any partner could answer. Codes now lock when the first real round opens, and test rounds never lock them (see **Added**).
- **A round id the live backend had never seen** was reported as `unknown`, so the form showed the survey until the backend refused its first signal (the `opened` ping). It is now reported as `draft`, and the form says "This survey is not open yet" straight away.
- **DC ids typed into the DCs tab** could be changed by Google Sheets (`0123` became `123`, which would break the link between a DC and its answers). The `dc_id` column is now plain text, and an id Sheets already changed gets no link (see **Added**).
- **A colleague without the Drive folder** saw a panel that looked as if nothing was published. The panel now stops with a message naming the owner and the menu item to run.
- **Missing Google permissions** were reported as a folder-sharing or "Google is busy" problem. They now get the plain "tick Select all" advice, and every menu item asks Google to show its permission screen again.
- **The GitHub copy, downloaded before a web app address was recorded,** said live mode with an empty address, which the settings check refuses, so GitHub would not have published the form. It now stays in test mode, and the panel says why.
- **An empty new round** counted as an unpublished change, so opening it asked to "Publish first" for nothing.
- **The settings check and the control panel disagreed** on three things. A logo or read-aloud clip given as a secure web address (`https://…`) passed the panel but failed `scripts/check_config.py`, so a GitHub copy with one would have stopped GitHub publishing the form; and a round name with a dot was an error in the panel but only a warning in the check. Both now follow the panel's rules: an `https://` address or a file inside `web/`, and round names of 1 to 64 letters, digits, `-` or `_`.
- **The survey form's start-up** (21 Oct):
  - the "This link is not valid" screen no longer shows a full progress bar, which suggested the survey was finished;
  - an incomplete link (no token in a live link, or an unusable DC or round) no longer downloads the questionnaire first: it only shows "This link is incomplete";
  - a preview link without a round no longer says the draft could not be loaded (nothing was asked for);
  - a published questionnaire that breaks the form while it starts (a mistake the checks missed) no longer ends in the "could not start" message: the form uses its own copy instead, and its buttons still react once per tap.
- **Found by the independent review of 21 Oct:**
  - **The GitHub copy could still hand over old files.** Files prepared before the web app address was recorded (or changed) stayed downloadable afterwards, and the "Take a test-mode survey.json?" question no longer appeared, so a test-mode `survey.json` could reach GitHub and stop partners' answers from reaching Google. Recording an address now clears them, and the question is decided by the prepared file itself.
  - **A round whose name has a dot** (typed into the Rounds tab) could be opened, after which every Publish was blocked, because the checks refuse such names and an open round can't be dropped. Opening now uses the checks' rule (letters, digits, `-` or `_`).
  - **Previewing a draft that breaks the form** said "Could not load the draft … open the link again", which can never help. The strip now says the draft itself is broken and must not be published (new text `dev.preview_broken`).
  - **When a published questionnaire broke the form,** the failed first attempt could be counted as a resume and leave a screen view that never happened. The second attempt now starts from the progress saved before.
  - Smaller: the "could not open" screen no longer suggests set-up under the panel's own advice (another Google account, no connection, signing in again), and the "nothing published yet" note fits a round that has since closed.
- **Read-aloud was missing** on the "Tell us more" heading of problem screens and on the support comment heading. Both have their own speaker now; the "Tell us more" one reads whichever wording is showing.
- **"Start again (test mode)" now really starts again.** In 0.1.0 the page saved the old answers back to the phone while it was reloading, so they came straight back (a finished survey even showed "Already received" again). The button now forgets the answers and voice notes first.

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
