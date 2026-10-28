<!--
===============================================================================
README.md: the front page of the Valmo Partner Pulse project
===============================================================================
What this file is for
  The first page anyone reads. It says what the project is, the golden rule
  about partner data, what each folder holds, how to try the survey on a
  Mac, and how to go live (GitHub, the Google Sheet control panel, links),
  step by step. Also the flow tools: the commands that check, draw and try
  out the route through the questionnaire (python3 scripts/flow.py ...).

Who it is for
  Ops colleagues. You do not need to know how to code.

How to read it
  On GitHub it is shown nicely formatted. On this Mac you can open it in
  VS Code and press Cmd+Shift+V to see the formatted preview.

When to update it
  At the end of every phase. It covers Phases 1 and 2 today and grows phase
  by phase. Phase 5 polishes it end to end.

What it reads and writes
  Nothing. It is documentation only.

Safety
  Never paste real partner data into this file: no names, phone numbers,
  real DC ids, answers, voice notes or real survey links. Use obviously fake
  ids such as DC-DEMO-001.
===============================================================================
-->

# Valmo Partner Pulse

A short, phone-friendly feedback survey for the ~10,000 delivery-centre (DC) partners of Valmo, Meesho's logistics arm.
Partners score Valmo from 0 to 10, rate six areas of work, and say what the main problem is.
They can use any of six languages, and can tap, type or leave a voice note.

> [!NOTE]
> **This README grows with each phase.** Today it covers:
>
> - **Phase 1**: the survey form, its settings, and a test server that runs on this Mac;
> - **Phase 2**: going live. The form goes online on GitHub Pages, a Google Sheet becomes the **control panel** where colleagues change the whole questionnaire, and a small Google program (Apps Script) checks every partner's link and saves the answers;
> - **the route tools** (26 Oct 2026): jumps, questions asked for each area and extra endings in the control panel, and [commands](#the-route-through-the-questionnaire-flow-tools) that check, draw and try out the route on this Mac.
>
> Phase 5 will polish it end to end.

## On this page

1. [The golden rule: no real partner data](#the-golden-rule-no-real-partner-data)
2. [What is in this folder](#what-is-in-this-folder)
3. [Phase 1: try the survey on this Mac](#phase-1-try-the-survey-on-this-mac)
4. [Test the tricky cases](#test-the-tricky-cases)
5. [Try it on your phone](#try-it-on-your-phone)
6. [Phase 2: go live](#phase-2-go-live)
7. [Change the questions](#change-the-questions)
8. [Translations](#translations)
9. [The route through the questionnaire (flow tools)](#the-route-through-the-questionnaire-flow-tools)
10. [What's next](#whats-next)
11. [Command cheat sheet](#command-cheat-sheet)
12. [If something goes wrong](#if-something-goes-wrong)
13. [Words used in this README](#words-used-in-this-readme)

---

## The golden rule: no real partner data

> [!CAUTION]
> **Never put real partner data in this project folder.**

Real partner data means anything about a real partner:

- names, phone numbers and real DC ids;
- real answers, comments and voice notes;
- downloads or exports of the answers sheet;
- real survey links (each one contains that DC's personal secret code);
- the live secret key that makes those codes.

For testing, use only obviously fake data, such as the DC id `DC-DEMO-001` and the smoke test's `DC-SMOKE-…` ids.

### How the folder protects you

This folder is stored on GitHub using **git**. (git is a tool that saves versions of a folder and uploads them to GitHub.)
A file called `.gitignore` tells git which files it must never save:

| Never saved by git | Why |
|---|---|
| The folders `local_data/`, `data/`, `exports/` and `logs/` | Test answers, downloads and logs go there. |
| Spreadsheets and data exports: `.csv`, `.tsv`, `.xlsx`, `.xls`, `.jsonl`, `.parquet`, `.sqlite`, `.db` | They could hold real answers. |
| Voice recordings: `.webm`, `.ogg`, `.opus`, `.m4a`, `.wav`, `.aac`, `.mp4`, `.bin` | Partner voices are personal data. |
| Secrets: `.env`, `*.key`, `credentials*.json`, `token*.json` and similar | Passwords and keys must never be uploaded. |

The one exception is the `sample_data/` folder. git does save it, so it is only for obviously fake demo data, such as the 20 fake DCs in `sample_data/dcs_fake.csv`.

`.gitignore` is a safety net, not a guarantee. It cannot catch real data that someone types or pastes into a file git does save, such as a `.json` or `.md` file.

More things to know:

- Everything inside `web/` is a **public** web page once the form is online (GitHub Pages). Keep it free of anything confidential.
- The GitHub copy of this folder is **public** too: anyone can read every file git saves.
- The live secret key is never stored in this folder. It stays inside Google Apps Script (in its "Script Properties").
- Real partner data lives in Google: the DC list and the links in the control-panel Sheet, the answers and voice notes in Google Drive. If you ever download a DC list or a links file to this Mac, keep it **outside** this project folder, for example in Documents, and delete it when you are done.

### Before every commit, check what git will save

A *commit* is one saved snapshot of the folder. Run this before every commit:

```bash
git status --ignored
```

What it does: lists every file git sees as new or changed. Then, under the heading **Ignored files**, it lists the files it is leaving out.

Read everything **above** "Ignored files": those files can end up on GitHub. If any of them could contain real partner data, stop and ask for help before you commit.

> [!NOTE]
> This folder uses git, and its GitHub copy is public. Do this check before **every** commit.

---

## What is in this folder

| Folder or file | What it is | Will you edit it? |
|---|---|---|
| `web/` | **The form**: the survey page partners open on their phone. | Only the sub-folders below. |
| `web/config/` | **Questionnaire settings**: questions, areas, problem chips, colours, voice. Since Phase 2 they are the **backup copy**: the live questionnaire is changed in the [control panel](docs/control-panel.md). (`types.json` there, the list of the kinds of question, is made by a command: never edit it by hand.) | Rarely. See the [settings guide](docs/config-guide.md). |
| `web/i18n/` | **All six languages**: every word on screen, in `strings.json`. (*i18n* is short for "internationalisation".) Also a backup copy since Phase 2. | Rarely: wording and translations are changed in the control panel. |
| `web/audio/` | Optional pre-recorded read-aloud clips. Since Phase 2, which clip plays for which text is listed in the Sheet's **Audio clips** tab. See [web/audio/README.md](web/audio/README.md). | Only if you add clips. |
| `web/index.html`, `web/css/`, `web/js/` | The form's code. | No. |
| `apps-script/` | **The control panel and the live backend**: the code that is pasted into the Google Sheet, and its [setup guide](apps-script/README.md). | No. You copy the code into the Sheet once (and again when it is updated). |
| `scripts/` | Tools you run: the test server, the checks, the translation tool, the link generator and the [flow tools](#the-route-through-the-questionnaire-flow-tools) (`flow.py`, which runs `flow.js` with Node.js). | No, you only run them. |
| `docs/` | Guides: the [control panel guide](docs/control-panel.md), the [settings guide](docs/config-guide.md), the [data format](docs/submission-format.md) and the [technical design of the control panel](docs/control-panel-design.md). Also [`docs/flow.md`](docs/flow.md), the **map of the route** (made by a command, see below), and [`docs/flow-engine.md`](docs/flow-engine.md), how the route works inside (for developers). | No. `docs/flow.md` is made for you: never edit it by hand. |
| `package.json` | Short names for the flow tools, for people who use npm (`npm run validate-flow`). It installs nothing. | No. |
| `tests/` | The developers' automatic tests. Running `cd tests && npm install` once also gives the settings check the parser it needs for its ES5 check (Phase 1, [step 3](#step-3-check-python-and-nodejs)). | No. |
| `sample_data/` | Obviously fake demo data, such as `dcs_fake.csv` (20 fake DCs). The only data folder git is allowed to save. | Only with fake data. |
| `.github/workflows/` | Instructions GitHub follows by itself: `deploy-pages.yml` checks the settings and publishes `web/` on GitHub Pages after every push. Hidden in Finder, like `.gitignore`. | No. |
| `local_data/` | **Your test answers and voice notes**, saved by the test server on this Mac. git never saves it. | No. You can clear it with `--reset` (see below). |
| `README.md` | This page. | |
| `CHANGELOG.md` | [What changed in each version](CHANGELOG.md). | |
| `.gitignore` | The list of files git must never save. It is hidden in Finder: press Cmd+Shift+. (full stop) to show hidden files. | Only to add more protection. |

**Coming in later phases:**

| Folder | What it will hold |
|---|---|
| `pipeline/` | Phase 3: a program that downloads the answers and sorts comments and voice notes into problem codes. |
| `dashboard/` | Phase 4: the results dashboard. |
| `logs/` | Run logs. git never saves them. |

---

## Phase 1: try the survey on this Mac

You will start a small test server on this Mac, fill in the survey in Google Chrome, and then look at the answer it saved. The first time takes about 10 minutes.

> [!IMPORTANT]
> **After go-live, local links need `&mock=1`.** Once the form is connected to the live backend ([Phase 2](#phase-2-go-live), step 5), the form starts in live mode even on this Mac, and would talk to Google instead of the test server. `&mock=1` at the end of a link puts it back in test mode. The links the test server prints already end in `&mock=1`, so they keep working. Add it yourself only to links you type, such as the plain address: use `localhost:8787/?mock=1` instead of `localhost:8787`.

> [!TIP]
> **How to run a command.** Copy it from a grey box (on GitHub, use the copy button that appears at the box's top-right corner). Click in the Terminal window, paste with Cmd+V, and press Enter.
> A command has finished when you see the prompt again: the line ending in `%`.

### Step 1: Open Terminal

Press Cmd+Space, type `Terminal` and press Enter.

**You should see:** a window with a line of text ending in `%`. Terminal is a Mac app where you type commands instead of clicking.

### Step 2: Go to the project folder

```bash
cd ~/NPSF
```

What it does: moves Terminal into the project folder. `~` is short for your home folder, so `~/NPSF` is the folder NPSF in it, where the project lives on the Mac it was built on. If your copy is somewhere else, use that folder in every `cd` on this page. Every other command on this page only works from here.

**You should see:** nothing printed, and the prompt now mentions `NPSF`. That is normal.

**If it goes wrong:** "no such file or directory" means the folder is somewhere else. Type `cd` followed by a space, drag the project folder from Finder into the Terminal window, and press Enter.

### Step 3: Check Python and Node.js

```bash
python3 --version
```

What it does: shows which version of Python is installed. Python is the language the project's tools are written in.

**You should see:** `Python 3.11` or a higher number, such as `Python 3.14.6`.

**If it goes wrong:** if you see "command not found" or a number below 3.11, install Python from [python.org/downloads](https://www.python.org/downloads/). Then close Terminal, open it again, and repeat steps 2 and 3. Ask IT if your laptop does not let you install software.

**Then check Node.js.** The settings check (step 4) also checks the route through the questionnaire, with the same code the phones run. That code is JavaScript, so it needs **Node.js 16 or newer** (free).

```bash
node --version
```

What it does: shows which version of Node.js is installed.

**You should see:** a version from `v16` up, such as `v20.18.0`.

**If it goes wrong:** if you see "command not found" or a number below 16, install the **LTS** version from [nodejs.org](https://nodejs.org): download it for macOS, open the downloaded file and click through the installer (Continue, Agree, Install). Then close Terminal, open it again, and repeat steps 2 and 3. (If you use Homebrew, `brew install node` works too.)

**Once: the parser for the ES5 check.** Run these two lines:

```bash
cd tests && npm install
cd ..
```

What it does: the first line goes into the `tests` folder and installs the exact tool versions the project pins, into `tests/node_modules` (git never saves that folder). One of them is **acorn** 8.14.0, the parser the settings check uses to make sure every script phones load is plain **ES5**: the older JavaScript that old Android phones (Chrome 61) understand. The other is for the developers' browser tests. It needs the internet, this one time. `cd ..` goes back to the project folder.

**You should see:** a line that starts with `added` and a number of packages (or `up to date`, if it was done before). Without it, the settings check still works, but says "ES5 check skipped: acorn is not installed …" as a warning. GitHub always runs the ES5 check: it installs acorn by itself.

### Step 4: Check the settings (a good habit)

```bash
python3 scripts/check_config.py
```

What it does: checks every settings file and every translation, and reports the *page weight*. Page weight is how much data a phone must download to open the form. The limit is 300 KB, so the form opens quickly on slow mobile data. With Node.js (step 3) it also checks the route through the questionnaire, the map of the route (`docs/flow.md`), the list of the kinds of question (`web/config/types.json`), and that every script phones load is ES5.

**You should see:** a report in three parts, ending with a line that starts with **All good**:

- **ERRORS**: must be fixed, or the form may break. There should be none.
- **WARNINGS**: worth a look, but they will not break the form. On a fresh copy of the project there is one, and it is normal: round "DEMO-R1" is fake test content.
- **SUMMARY**: the number of screens and areas, where answers go, the kinds of screen, the ES5 check ("all ES5"), the longest route, how much is still to translate in each language, and the page weight.

**If it goes wrong:** the last line says "Please fix the errors above", and each error says in plain English what to fix. If you have not edited anything yet, send the message to whoever set up the project. Two cases that come from this Mac, not from the settings:

- an error that the flow "could not be checked" because "The flow tools need Node.js (free), and it was not found on this Mac": install Node.js (step 3);
- a second warning "ES5 check skipped: acorn is not installed …": run `cd tests && npm install` once (step 3).

### Step 5: Start the test server

```bash
python3 scripts/mock_server.py
```

What it does: starts a small test server on this Mac. It shows the survey to your browser and saves your answers in the `local_data/` folder. (*Mock* means "pretend". The server pretends to be the real backend, Google Apps Script, from [Phase 2](#phase-2-go-live).)

**You should see** a block of text headed "Valmo Partner Pulse: local test server (pretend backend) is running". It shows:

- the survey's address, `http://localhost:8787/`, and where answers are saved (`local_data/`);
- its test settings (none of the special options from [Test the tricky cases](#test-the-tricky-cases) are on yet);
- ready-to-click test links for fake demo DCs: English, Hindi, Tamil, one with no language (so the survey starts with the language screen), a link that is **broken on purpose**, the plain address, and a **PREVIEW** link (see [Preview mode](#preview-mode)). Every link ends in `&mock=1` (test mode), so they also work after go-live.

After that the window waits. That is normal: the server is running. While you use the survey, one line appears here for each request the form makes (for example `GET bootstrap` when a link is opened, `PING opened` or `SUBMIT … saved`). Typed answers and voice notes are never shown here, only counts.

**Leave this window open.** Closing it stops the server.

**If it goes wrong:** a message saying port 8787 is already in use means the server is already running in another Terminal window or tab. Use that one, or stop it there with Ctrl+C. You can also start this one on another port:

```bash
python3 scripts/mock_server.py --port 8788
```

What it does: the same as above, but on port 8788. Then use `localhost:8788` instead of `localhost:8787` everywhere.

### Step 6: Open the survey

Open **Google Chrome**, click in the address bar, type `localhost:8787` and press Enter. (After go-live, type `localhost:8787/?mock=1` instead: see the note at the top of this section.)

*localhost* means "this computer". *8787* is the port: a door number the test server listens on.
A plain address like this has no link details, so the form uses its demo values: DC `DC-DEMO-001`, round `DEMO-R1`.

**You should see:** a yellow banner saying **TEST MODE: answers go only to the test server**, then the **Choose your language** screen.

To use one of the demo links instead: select it in the Terminal window, copy it with Cmd+C, and paste it into Chrome's address bar with Cmd+V.

**If it goes wrong:** "This site can't be reached" means the server is not running. Go back to step 5.

### Step 7: Fill in the survey

Go through it as a partner would. It takes one to two minutes.

| Screen | What to do |
|---|---|
| **Choose your language** | Tap a language. This screen is skipped when the link already names a language (like the Hindi demo link). |
| **What changed since your last feedback** | Read the three `[SAMPLE]` lines and tap **Continue**. This screen is skipped when a round has nothing to show. |
| **How likely are you to recommend Valmo to another DC owner?** | Tap a number from 0 to 10. The form moves on by itself. |
| **Six area screens**: Losses & Debits, Payments / Payouts, Line Haul, Consumables, Orders & Planning, App / Tech | Tap a face, or **I don't handle this**. The form moves on by itself. |
| **What is the main problem?** | Comes after all six ratings, once for every area you rated **Okay** (3) or lower. Pick one problem. You can add a voice note or type. Then tap **Next**. |
| **In the last 30 days, did you contact Valmo support?** | Yes or No. |
| **How was your last contact with Valmo support?** | Only shown after Yes. Rate four things on one screen, then tap **Next**. A comment is optional. |
| **If Valmo could fix just one thing for you, what should it be?** | Optional. Speak or type, then tap **Submit**. (Submit also works if you leave it empty.) |
| **Thank you!** | It shows "Sending your answers…" and then "Thank you!". |

Tips:

- To see a "main problem" screen, rate at least one area **Okay** or lower.
- The **Back** button on screen and Chrome's back arrow both take you to the previous screen.
- The speaker button reads the question aloud. If it is missing for a language, this computer has no voice for that language. That is expected.
- To try a voice note, press and hold **Hold to talk**, speak, and let go. The first time, the form shows a one-line note about voice notes: tap **OK**. Then click **Allow** when Chrome asks to use the microphone. If your Mac also asks whether Chrome may use the microphone, allow that too.

### Step 8: Look at the saved answer

The first Terminal tab is busy running the server, so open a second tab with **Cmd+T** and go to the project folder again:

```bash
cd ~/NPSF
```

Then show the newest saved answer, neatly laid out:

```bash
tail -n 1 local_data/responses.jsonl | python3 -m json.tool --no-ensure-ascii
```

What it does: takes the last line of the answers file (one line = one finished survey) and lays it out so it is easy to read. Hindi and other scripts show as normal letters.

**You should see:** your answers. For example:

- `"dc": "DC-DEMO-001"` and `"round": "DEMO-R1"`: who answered, and in which round;
- `"answers"`: your 0–10 score (`"nps"`) and your support Yes/No;
- `"ratings"`: one entry per area. "I don't handle this" shows as `"rating": null`;
- `"free_text"`: what you typed. Each voice note is saved as a separate audio file.

To see the whole file in TextEdit (one long line per finished survey):

```bash
open -e local_data/responses.jsonl
```

To open the voice notes folder in Finder:

```bash
open local_data/audio
```

To play a voice note, drag the file onto a Chrome window.

The file `local_data/events.jsonl` holds small progress messages: opened, started, and how far each visit got. They never contain answers. Every field is explained in [docs/submission-format.md](docs/submission-format.md).

**If it goes wrong:** "No such file or directory" means no survey has been finished yet (go all the way to the Thank you screen first). It can also mean this tab is not in the project folder: run the `cd` command again.

### Step 9: Stop the server

Go back to the first tab (the one running the server) and press **Ctrl+C**. That is the Control key, not Cmd.

**You should see:** "Server stopped. Everything it received is still saved in …", then the normal prompt ending in `%`. Your test answers stay in `local_data/` until you delete them.

**Next time,** you only need steps 1, 2, 5 and 6.

### Start again with an empty form

The survey remembers your answers in the browser, so you can carry on later. It also remembers when you have finished. If you open the same link again in the same browser, you will see **Already received**. That is correct: a real partner who opens their link twice sees the same message.

To fill it in again from the start, tap **Start again (test mode)**. It appears on the Thank you screen and on the other end screens (such as Already received or Could not send), in test mode only. It clears this browser's saved answers and voice notes for that link, and reloads the page. It does not delete anything in `local_data/`.

You can also open the link in an **Incognito window** (Cmd+Shift+N in Chrome). An Incognito window starts with no saved answers, like a brand-new phone.

### Delete all your test answers

Stop the server first (Ctrl+C), then run:

```bash
python3 scripts/mock_server.py --reset
```

What it does: asks you to type `yes`, then deletes the test data saved in `local_data/`: answers, progress messages and voice notes. Nothing is deleted unless you type `yes`.

Then start the server again as usual (step 5).

### Run the automatic check (smoke test)

With the server running (started without extra options), run this in the second tab:

```bash
python3 scripts/smoke_test.py
```

What it does: sends a few test messages to the server and checks it answers correctly.

**You should see:** one **PASS** line per check, each with a short explanation, and at the end a line saying all checks passed. A **FAIL** line says what went wrong.

Good to know:

- It saves a few obviously fake answers in round `SMOKE-R1`, for a new fake DC each time it runs (its id starts with `DC-SMOKE-`). That is expected. Delete them with `--reset` if you like.
- Options such as `--fail-rate` (below) make some checks fail on purpose, so run the smoke test against a server started without them.
- If the server was started with `--strict`, run `python3 scripts/smoke_test.py --expect-strict` instead.
- If the server runs on another port, tell the check where it is: `python3 scripts/smoke_test.py --url http://localhost:8788/api`.
- The same check works against the live backend: see [step 16 of the setup guide](apps-script/README.md#step-16-run-the-smoke-test-against-the-live-backend).

---

## Test the tricky cases

Real partners have patchy mobile data and old phones, and links get forwarded on WhatsApp. These tests imitate those problems.

For each test, stop the server (Ctrl+C) and start it again with the **option** shown. An option is extra text after a command that changes what it does. Options start with two dashes.

### Slow internet

```bash
python3 scripts/mock_server.py --slow 3
```

What it does: the server waits 3 seconds before every reply, like slow mobile data.

**You should see:** the survey still works. On the Thank you screen, "Sending your answers…" stays up for a few seconds before "Thank you!".

### Internet that keeps failing

```bash
python3 scripts/mock_server.py --fail-rate 0.3
```

What it does: about 3 in every 10 sends fail on purpose (0.3 means 30%).

Finish several surveys, tapping **Start again (test mode)** between them. When a send fails, **you should see:**

- "Could not send yet. Maybe no internet? Your answers are saved on this phone. Keep this page open and we will keep trying, or open the same link again later.";
- a countdown such as "Trying again in 2 s";
- a **Send now** button to try straight away.

The form tries again by itself after 2, 5, 10, 20, 40, 60, 60, 120, 120 and 300 seconds. Each finished survey is saved only once, even if it is sent more than once.

### No internet at all

1. Start the server normally and fill in the survey up to the last question.
2. In the server's tab, press Ctrl+C to stop it. Do not reload the page now: it cannot load while the server is off.
3. Finish the survey. **You should see** the "Could not send" message and the countdown.
4. Start the server again with `python3 scripts/mock_server.py`. At the next automatic try, or when you tap **Send now**, **you should see** "Thank you!".

Two variations:

- While it says "Could not send", close the tab. Start the server, then open the same link again. The form sends the saved answers by itself.
- In Chrome's developer tools (Cmd+Option+I), open the **Network** tab and change **No throttling** to **Offline**. Finish the survey, then set it back to **No throttling**. The form notices the internet is back and sends by itself.

### Wrong or broken links

```bash
python3 scripts/mock_server.py --strict
```

What it does: the server now checks each link's *token*: the secret code at the end of a real link that proves it is genuine. Without `--strict`, the test server accepts any token so you can test quickly.

Copy the link the server labels **A BROKEN link on purpose** into Chrome. (It is a demo link whose DC was changed by hand, so its token no longer matches.)

**You should see:** "This link is not valid. Please use the link Valmo sent you." The other demo links still work. The plain address `localhost:8787` has no token, so with `--strict` it shows "not valid" too: use the demo links the server prints, which carry a correct token.

The message "This link is incomplete" (for a link with parts missing) only appears in live mode. In test mode, missing parts are filled with demo values.

To try links made by the link generator instead (one for each of the 20 fake DCs), run `python3 scripts/generate_links.py --help` and copy its **TEST links** example. With a `localhost` address it makes test links that end in `&mock=1` and carry tokens the `--strict` server accepts.

### A round that is closed, or not open yet

```bash
python3 scripts/mock_server.py --closed-rounds DEMO-R1
```

What it does: the server pretends round `DEMO-R1` was closed in the control panel.

**You should see**, with a demo link in a new Incognito window: "This survey has closed". A phone that had already started the survey before may still finish it, and the server saves those answers marked `late`.

```bash
python3 scripts/mock_server.py --draft-rounds DEMO-R1
```

What it does: the server pretends round `DEMO-R1` is not open yet (a draft round).

**You should see:** "This survey is not open yet". Nothing is saved for that round.

### Preview mode

When the server starts, it also prints a **PREVIEW** link (`…/?preview=1&round=DEMO-R1&lang=en&mock=1`). It works like the control panel's **Preview** button. On this Mac it shows the files in `web/` (there is no separate draft here), so it needs none of the private preview key that the control panel's preview links carry.

**You should see:** a blue banner "PREVIEW: answers are not saved". At the end: "Preview finished. Nothing was saved." and a **Start again** button. A preview never sends anything to the server.

### A partner who has already answered

```bash
python3 scripts/mock_server.py --one-response-per-dc
```

What it does: the server answers "already received" for a DC that has already sent a survey this round.

1. Finish the survey once.
2. Open the same link in an Incognito window (Cmd+Shift+N). This is like opening the link on a second phone.

**You should see:** **Already received**: "Your feedback for this round has already reached us. Thank you!"

### Coming back half-way

1. Open the survey and answer the first few screens.
2. Reload the page (Cmd+R), or close the tab and open the link again.

**You should see:** the same screen you were on, with your earlier answers kept. You may also see "Welcome back. Continuing where you left off."

### Changing your mind

1. Rate **Payments / Payouts** as **Bad**, carry on to its "main problem" screen, and pick a problem.
2. Press **Back** until you reach the Payments rating again, and change it to **Very good**.
3. Finish the survey and look at the saved answer (step 8).

**You should see:** Payments has no problem picked (`"issue_code": null`). Only answers on the screens the partner finally saw are sent.

### Switching language

1. Open the survey in English and answer a couple of screens.
2. Tap the language button in the header and pick **हिन्दी**. **You should see** the screen switch to Hindi, with your answers kept.
3. Pick **தமிழ்** (Tamil). The texts stay in English because Tamil is not translated yet. The yellow banner says how many texts still need translating.
4. Open the **Hindi** demo link. It skips the language screen, because the link already says `lang=hi`.

### Voice notes, and a blocked microphone

1. On a "main problem" screen, press and hold **Hold to talk**, speak, and let go.
   **You should see** a countdown while you speak (60 seconds at most), then **Play**, **Delete** and **Record again**. If you let go in under a second, it says "Too short. Keep holding the button while you speak."
2. To test a blocked microphone, open the link in an Incognito window (Cmd+Shift+N), try to record, and click **Block** (or **Never allow**) when Chrome asks.
   **You should see** a text box instead, with "The mic is not available. Please type instead."

Closing the Incognito window forgets the "Block" choice, so there is nothing to undo.

---

## Try it on your phone

1. Connect your phone and this Mac to the **same Wi-Fi**.
2. Stop the server if it is running (Ctrl+C), then start it like this:

   ```bash
   python3 scripts/mock_server.py --lan
   ```

   What it does: lets other devices on the same Wi-Fi open the survey.
   **You should see** the same block as before, but the links now start with this Mac's address on the Wi-Fi instead of `localhost`, for example `http://192.168.1.23:8787/`. (The numbers depend on your network.) A **PHONE TESTING** section repeats the tips below.
3. If your Mac asks whether Python may "accept incoming network connections", click **Allow**.
4. On the phone, open Chrome and type that link **exactly**, including `http://` and `:8787`. You can also email or message the link to yourself.

**You should see:** the same survey, with the yellow TEST MODE banner. Answers go into `local_data/` on this Mac.

**Voice notes on the phone:** the microphone will not work, and the form shows a text box instead. **That is expected.** Chrome only allows the microphone on secure (`https`) links, and the test link is plain `http`. Test voice notes in Chrome on the Mac instead, where `localhost` is allowed. The real links (GitHub Pages, [Phase 2](#phase-2-go-live)) are `https`, so voice notes work on phones there.

**If the phone cannot open the link:**

- Check that both devices are on the same Wi-Fi.
- Check that you clicked **Allow** in step 3. If you missed it, look in System Settings > Network > Firewall.
- Office and guest Wi-Fi often stop devices from seeing each other. Turn on your phone's hotspot, connect the Mac to it, start the server with `--lan` again, and use the new link it prints.
- If Chrome on the phone warns that the connection is not secure, that is because the test link uses plain `http`. Only continue if the address is exactly the one your Mac printed.

> [!WARNING]
> While `--lan` is on, anyone on the same Wi-Fi who has the link can open the test survey. It holds only fake data, but stop the server (Ctrl+C) when you finish, and do not use `--lan` on public Wi-Fi.

### Or imitate a phone on this Mac

1. Open the survey in Chrome.
2. Press **Cmd+Option+I** to open the developer tools.
3. Press **Cmd+Shift+M** to switch to the phone view.
4. At the top of the page, pick a small Android phone from the list, for example **Samsung Galaxy S8+** (360 × 740).
5. Reload the page.

Press Cmd+Shift+M again to go back to the normal view. In this view, voice notes still work, because the page is still on `localhost`.

---

## Phase 2: go live

Going live puts the survey in partners' hands. It has four parts. Each is set up once:

| Part | Where it lives | What it does |
|---|---|---|
| **The form** | GitHub Pages, at `https://pranavakellaps37.github.io/NPS-Form-/` | The survey page partners open. Free and fast. It is the `web/` folder of the GitHub copy of this project. |
| **The control panel** | The Google Sheet **Valmo Partner Pulse - Control** | Where colleagues change the whole questionnaire (questions, areas, chips, texts in six languages, colours), run rounds, make links and **publish**. |
| **The live backend** | A small Google program (Apps Script) inside that Sheet, put online as a **web app** | Hands the form the published questionnaire, checks every link, and saves the answers. |
| **The data** | The Google Drive folder **Valmo Partner Pulse** | One data spreadsheet per round, the voice notes, and every published version of the questionnaire. |

### How it fits together

1. A partner opens their personal link on their phone, for example `https://pranavakellaps37.github.io/NPS-Form-/?dc=DC-DEMO-001&t=…&round=2026-R1&lang=hi`.
2. The phone downloads the form from GitHub Pages.
3. The form asks the web app for the **published** questionnaire and whether the round is open. If Google takes more than 6 seconds (the setting `whats_changed.timeout_seconds`, 4, plus 2), the form uses the backup copy in `web/config/` and `web/i18n/` instead, so the survey always opens.
4. The partner answers. The form sends the answers and voice notes to the web app, which checks the link and saves them in the round's data spreadsheet and Drive folder.
5. In the control panel you change the questionnaire, **Preview** it and **Publish** it. Partners get the new version the next time they open their link. No code changes and no GitHub updates are needed. See the [control panel guide](docs/control-panel.md).

Partner data (the DC list, the links, the answers, the voice notes) stays in Google, never on GitHub.

### The steps, in order

Do them in this order. Steps 3 to 8 are in the [setup guide for the Sheet and the live backend](apps-script/README.md).

| Step | What | Where it is explained |
|---|---|---|
| 1 | Put the project on GitHub (with a personal access token, because this Mac has no GitHub login yet) | [Below](#step-1-put-the-project-on-github) |
| 2 | Switch on GitHub Pages (**Source: GitHub Actions**) | [Below](#step-2-switch-on-github-pages) |
| 3 | Create the Sheet, paste the five code files (`Code`, `Model`, `PanelServer`, `Flow`, `Panel`), run **Set up or repair** and publish version 1 | [Setup guide](apps-script/README.md), Parts A–B |
| 4 | Check that Google offers **Anyone** for the web app (if not, ask IT, and meanwhile use the Meesho-only mode for colleagues: setup guide, step 8), then deploy it, copy its `/exec` address and record it in the control panel (**Check and save**) | [Setup guide](apps-script/README.md#part-c-put-the-backend-online), Part C |
| 5 | Connect the form: the `/exec` address into `web/config/survey.json` (`"mode": "apps_script"`), then push | [Setup guide](apps-script/README.md#part-d-connect-the-form), Part D |
| 6 | Run the smoke test against the live backend | [Setup guide](apps-script/README.md#part-e-run-the-smoke-test-against-the-live-backend), Part E |
| 7 | Try the whole thing on a phone | [Setup guide](apps-script/README.md#part-f-try-it-end-to-end-on-a-phone), Part F |
| 8 | Share the Sheet **and** the Drive folder with colleagues | [Below](#step-8-share-the-sheet-and-the-drive-folder-with-colleagues), and the [setup guide](apps-script/README.md#part-g-share-the-sheet-and-the-drive-folder-with-colleagues), Part G |
| 9 | Prepare the real round | [Below](#step-9-prepare-the-real-round) |
| 10 | Make the links | [Below](#step-10-make-the-links) |
| 11 | Open the round and send the links in batches | [Below](#step-11-open-the-round-and-send-the-links-in-batches) |

### Step 1: Put the project on GitHub

The project's GitHub address is https://github.com/PranavAkellaPS37/NPS-Form- (public). This Mac already knows that address (git calls it `origin`), and the work is saved in commits on the branch `main`. What this Mac does not have yet is a GitHub login.

**1a. Make a personal access token.** GitHub does not accept your account password for uploads from Terminal. It wants a *personal access token*: a long password made only for this purpose, which you can limit and cancel.

1. On github.com, sign in as **PranavAkellaPS37**.
2. Click your profile picture (top right) > **Settings** > **Developer settings** (at the bottom of the left-hand list) > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
3. Fill in:
   - **Token name**: `NPSF Mac`
   - **Expiration**: 90 days (or what your company allows)
   - **Repository access**: **Only select repositories** > `PranavAkellaPS37/NPS-Form-`
   - **Permissions** (repository permissions): add **Contents** with *Read and write*, and **Workflows** with *Read and write*. **Workflows** is needed because the project contains `.github/workflows/deploy-pages.yml`: without it, GitHub refuses the upload. (**Metadata: Read-only** is added automatically.)
4. Click **Generate token**, and copy the token (it starts with `github_pat_`). **GitHub shows it only once.** Never save it in a file in the project.

**1b. Check what will be uploaded.**

```bash
cd ~/NPSF
git status --ignored
```

What it does: lists the new and changed files git will save (above "Ignored files") and the files it leaves out. Everything above "Ignored files" becomes public on GitHub: make sure nothing there holds real partner data or secrets.

**1c. Save any new work in a commit, and upload it.**

```bash
git add -A
git commit -m "Phase 2: control panel, live backend, links and GitHub Pages"
git push -u origin main
```

What it does: `git add -A` and `git commit` save everything listed above "Ignored files" as one snapshot. (If git says "nothing to commit", everything is already saved: carry on.) `git push` uploads the snapshots to GitHub.

The first time, Terminal asks two questions:

- `Username for 'https://github.com':` type `PranavAkellaPS37` and press Enter;
- `Password for 'https://PranavAkellaPS37@github.com':` paste the **token** (not your GitHub password) and press Enter. Nothing appears while you paste: that is normal.

**You should see** a few lines of progress ending with `main -> main` and `branch 'main' set up to track 'origin/main'`. On https://github.com/PranavAkellaPS37/NPS-Form- you now see the project's files.

This Mac remembers the token (in the Mac's Keychain), so `git push` will not ask again until the token expires.

**If it goes wrong:**

| What you see | What to do |
|---|---|
| `Authentication failed` | The token was pasted wrongly, has expired, or lacks **Contents: Read and write**. Make a new one (1a) and push again. |
| `refusing to allow a Personal Access Token to create or update workflow` | The token lacks **Workflows: Read and write**. Make a new token with it. Then open the **Keychain Access** app, search for `github.com`, and delete that entry, so the Mac forgets the old token. Push again. |
| `Updates were rejected because the remote contains work that you do not have locally` | Something was added on GitHub directly (for example a README created there). Do not force anything: ask a developer. |
| `Permission to PranavAkellaPS37/NPS-Form-.git denied to <another account>` | This Mac already has a GitHub login for another account saved in its Keychain, and git used it instead of asking for your token. Put the account name into the upload address, so git asks for this account's token instead (the other login stays as it is): `git remote set-url origin https://PranavAkellaPS37@github.com/PranavAkellaPS37/NPS-Form-.git`, then push again. Terminal now asks only for the password: paste the token. |
| `GH007: Your push would publish a private email address` | GitHub is protecting your email address. On GitHub: **Settings > Emails**, untick **Block command line pushes that expose my email**, and push again. Or ask a developer. |
| `Please tell me who you are` (on commit) | git needs your name once: run `git config user.name "Your Name"` and `git config user.email "YOUR-GITHUB-NAME@users.noreply.github.com"` (GitHub's private no-reply address: GitHub > Settings > Emails shows yours), then commit again. Don't use your work email: this repository is public, and every commit shows its author's email. |

### Step 2: Switch on GitHub Pages

1. On https://github.com/PranavAkellaPS37/NPS-Form-, click the repository's **Settings** tab (along the top of the repository) > **Pages** (left-hand list).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. If GitHub then suggests workflows (such as "Static HTML"), ignore them: the project already has its own.
3. Click the repository's **Actions** tab, then **Deploy the form to GitHub Pages** on the left. The run started by your push has probably failed (red cross), because Pages was not switched on yet. That is expected: click **Run workflow** (right) > **Run workflow**.
4. Wait for the green tick (1–2 minutes).

What it does: from now on, after every push, GitHub runs `python3 scripts/check_config.py` and, only if it finds no errors, publishes the `web/` folder. To run that check it first installs Node.js 20 and acorn 8.14.0 by itself, so the route check and the ES5 check run there too. The steps are in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

**You should see** the form at https://pranavakellaps37.github.io/NPS-Form-/ with the yellow **TEST MODE** banner. The form is online, but still in test mode: it cannot save answers yet. **Do not send any links yet.**

**If it goes wrong:** a red cross on a later run means `check_config.py` found an error, so GitHub kept the previous version online. Click the run, then **deploy**, then the step with the red cross to read the error. Fix it on the Mac, run `python3 scripts/check_config.py` until it says "All good", then commit and push again.

### Steps 3 to 7: The Sheet, the live backend and the tests

Follow the [setup guide for the Sheet and the live backend](apps-script/README.md) from Part A to Part F. It takes about an hour and covers, in this order:

- creating the Sheet **Valmo Partner Pulse - Control** and pasting the five code files into it (`Code`, `Model`, `PanelServer` and `Flow` as Script files, `Panel` as an HTML file);
- running **Partner Pulse > Set up or repair**, which builds the tabs and the Drive folder, copies the questionnaire from GitHub and publishes version 1;
- checking that Google offers **Who has access: Anyone** for the web app (Meesho's Google Workspace settings may block it: the guide has a message to send to IT), then deploying the web app and copying its address ending in `/exec`;
- recording that address in the control panel (**Home > Quick links**, **Check and save**), which checks that partners' phones can reach it. The panel's GitHub copy of the questionnaire takes the address from there;
- connecting the form: in `web/config/survey.json`, `"mode": "apps_script"` and your web app address in `"apps_script_url"`, then commit and push;
- running `scripts/smoke_test.py` against the live backend;
- a full test on a phone, with a link for a fake DC.

### Step 8: Share the Sheet and the Drive folder with colleagues

Every colleague who will use the control panel needs **both**:

1. **The Sheet:** click **Share** and add them as **Editor**. Editors are admins: they can publish, and they can see the link secret. (A **Viewer** can only look at the tabs, including the DC list and the links.)
2. **The Drive folder:** then click **Partner Pulse > Share the Drive folder with all editors**. Without it, publishing, opening a round and the numbers stop with a message that starts "Google Drive would not open … for you" and names you. The control panel soon stops opening for them, at least some of the time: without the folder it can only use Google's short-term copy of the live version, which is kept for 6 hours at most.

Run the menu item again whenever you add someone. Details, and how to remove someone: [setup guide, Part G](apps-script/README.md#part-g-share-the-sheet-and-the-drive-folder-with-colleagues) and [Who can use it](docs/control-panel.md#who-can-use-it).

### Step 9: Prepare the real round

The [control panel guide](docs/control-panel.md) has the exact clicks for each item.

1. **The DC list**: paste the real DCs into the Sheet's **DCs** tab ([Recipe 9](docs/control-panel.md#recipe-9-generate-and-download-links)). Its **active** boxes start ticked; untick a DC to leave it out. The DC ids may use only letters, digits, `-`, `_` or `.` (at most 64 characters). If Google Sheets turns an id into a number or a date (`0123` into `123`, `1-2` into a date), **Make links** skips that DC and says "Type the id as text": type it again with an apostrophe in front, for example `'0123`.
2. **The round**: `2026-R1` is already in **Rounds**, as a draft. Add its "What changed" bullets, or leave them empty to skip that screen ([Recipe 7](docs/control-panel.md#recipe-7-start-a-new-round-with-its-what-changed-bullets)).
3. **The questionnaire**: make the areas, problem chips and questions final (Recipes 1–4), add Valmo's colours and logo (Recipe 6), and get the translations done and read by native speakers on a phone (Recipe 5). **Nothing is locked yet:** codes lock only when you open the first real round (step 11). The test round `SMOKE-R1` from step 6 doesn't count, because rounds whose name starts with SMOKE, DEMO or TEST never lock anything. So this is the moment to replace the placeholder areas and problem chips with the real ones: delete, rename or change the code of anything you like.
4. **Preview** on a phone, then **Publish**.
5. **Refresh the GitHub copy**, so the backup matches what you published ([Recipe 12](docs/control-panel.md#recipe-12-refresh-the-github-copy)). It needs the web app address recorded in the control panel (step 4): without it, the panel warns you and the files would put the form back in test mode.

### Step 10: Make the links

In the control panel: **Links** > pick `2026-R1` > **Make links** > **Download the 2026-R1 links (CSV)** ([Recipe 9](docs/control-panel.md#recipe-9-generate-and-download-links)).

**The offline alternative** makes exactly the same links on this Mac, from a CSV file of DCs (column `dc_id`, and optionally `language`, `dc_name`, `state`, `region` and `active`). It asks for the link secret, which you copy from the control panel (**Links > Show the link secret**):

```bash
cd ~/NPSF
python3 scripts/generate_links.py --dcs ~/Documents/dcs.csv --round 2026-R1
```

What it does: makes one link per DC and saves them in `links-2026-R1.csv`, next to the DC list. It explains every row it skipped, refuses to save inside `web/` or `sample_data/`, and never prints the secret. `python3 scripts/generate_links.py --help` shows all the options.

> [!CAUTION]
> A links file is partner data: each link lets someone answer as that DC. Keep it outside this project folder, share it only with whoever sends the links, and delete it when the round is over.

### Step 11: Open the round and send the links in batches

1. In the control panel: **Rounds** > `2026-R1` > **Open the round**, then **Open round** to confirm ([Recipe 8](docs/control-panel.md#recipe-8-open-or-close-a-round)). **This locks the codes:** from now on, questions, areas and problems that are live can only be hidden, not deleted or given a new code, so rounds stay comparable. The confirm window says so. If the problem list is still the placeholder one, cancel and do step 9 first. If the window also warns "Partners will get version …", your draft has changes that are not published: click **Publish first** and publish. The window **Version … is live** then offers **Open round 2026-R1 now**: click it, and confirm with **Open round**.
2. Send a small first batch (for example 50 DCs), and check on **Home** that answers arrive.
3. Then send the rest **in batches**, for example 1,000 an hour, not all 10,000 at once. Google handles only about 30 partners at the same moment. The form retries by itself when Google is busy, but batches keep the waiting short.
4. Watch the numbers on **Home**: links, opened, started, sent answers ([Recipe 10](docs/control-panel.md#recipe-10-check-how-many-partners-answered)).
5. When the round is over, click **Close the round**. Partners who are already in the middle can still finish.

---

## Change the questions

> [!IMPORTANT]
> **Once the control panel is set up ([Phase 2](#phase-2-go-live)), change the live questionnaire in the control panel**, not in these files: see the [control panel guide](docs/control-panel.md). What you publish there is what partners see, and it wins over these files. That includes the questions and their **route** (which screen comes after which: rules, jumps, questions asked for each area, extra endings), which you change in **Questions** as one table with **Paste a route**, and see on its **Map** ([Recipe 2](docs/control-panel.md#recipe-2-change-the-questions-paste-a-route), [How the route works](docs/control-panel.md#how-the-route-works)).
>
> The files in `web/config/` and `web/i18n/` then serve as the **backup copy**: the form uses them only when Google does not answer in time, and the test server on this Mac uses them. Refresh them from the panel after important changes ([Recipe 12](docs/control-panel.md#recipe-12-refresh-the-github-copy)). The rest of this section explains how to edit the files themselves.

The questions, areas, problem chips, the "main problem" rule, the order of screens, colours and voice settings are all **settings**, not code. You change them by editing text files in `web/config/` and `web/i18n/`.

The **[settings guide (docs/config-guide.md)](docs/config-guide.md)** explains every setting in plain English and has copy-and-paste recipes. For example: add a problem chip, add an area, or ask an extra question only to partners who scored 6 or below.

Every change follows the same loop:

1. Make a backup copy of the file you are about to edit. The guide shows how.
2. Make the change.
3. Check it. **Always run this after every edit:**

   ```bash
   python3 scripts/check_config.py
   ```

   What it does: checks all settings and texts. **You should see** "All good". Otherwise it lists each problem in plain English. Fix them and run it again.
4. Look at the result. With the test server running, open `localhost:8787` (after go-live: `localhost:8787/?mock=1`) in a new Incognito window (Cmd+Shift+N), so old saved answers do not get in the way, and go through the screens you changed.
5. If partners will see something different, change `config_version` (the guide shows how).

> [!WARNING]
> **Never rename the codes** for areas, problem chips or screens (for example `payments`, `payout_delayed`, `nps`), and do not add or remove them while a round is running. The dashboard compares rounds using these codes. To change what partners read, change the wording in `web/i18n/strings.json` instead. That is always safe.

---

## Translations

> [!NOTE]
> **With the control panel ([Phase 2](#phase-2-go-live)), translate in the panel** (**Texts & translations**) or in the Sheet's **Texts** tab: see [Recipe 5](docs/control-panel.md#recipe-5-translate-a-language). That is what partners see once you publish. The steps below work on the backup copy in `web/i18n/strings.json`.

Every word on screen lives in one file, `web/i18n/strings.json`, in six languages: English, Hindi, Tamil, Telugu, Kannada and Malayalam.

- **English and Hindi are written.** Ask a native Hindi speaker to read the whole survey once before launch.
- **Tamil, Telugu, Kannada and Malayalam are placeholders.** Each text starts with `[TRANSLATE] ` followed by the English. Partners see the English (without the tag) until a native speaker replaces it.

Translators work in a spreadsheet, so they never edit the file itself:

1. **Make the spreadsheet.**

   ```bash
   python3 scripts/strings_csv.py export --out translations.csv
   ```

   What it does: creates `translations.csv` in the project folder, with one row per text.
   To include only the texts that still need translating, and only one language (here Tamil), add `--only-untranslated` and `--lang`:

   ```bash
   python3 scripts/strings_csv.py export --out translations.csv --only-untranslated --lang ta
   ```

   Language codes: `hi` Hindi, `ta` Tamil, `te` Telugu, `kn` Kannada, `ml` Malayalam.

   If `translations.csv` already exists, export stops instead of overwriting it, so a translator's work is never lost by accident. Import or rename the old file first, or add `--overwrite` if you really want to replace it.
2. **Send it to the translator.** Google Sheets is easiest (File > Import > Upload). Tell the translator:
   - only type in your language's column, and never change the column of codes (like `q.nps`);
   - replace the whole cell, **including** the `[TRANSLATE] ` tag;
   - keep `{s}` and `{n}` exactly as they are, because the form puts numbers there;
   - keep it short: it must fit on a small phone screen.
3. **Save it back as CSV.** In Google Sheets: File > Download > Comma-separated values (.csv). In Excel: File > Save As > **CSV UTF-8**. (Plain "CSV" in Excel can scramble Indian scripts.) Put the file in the project folder and name it `translations.csv`.
4. **Preview the import.** This changes nothing:

   ```bash
   python3 scripts/strings_csv.py import translations.csv --dry-run
   ```

   **You should see** a summary of what would change. Read it before going on.
5. **Import for real.**

   ```bash
   python3 scripts/strings_csv.py import translations.csv
   ```

   What it does: copies the translations into `web/i18n/strings.json`.
6. **Check.** Run `python3 scripts/check_config.py` and make sure it says "All good".
7. **Look at it.** Open the survey, pick the language, and go through every screen. A native speaker should read it on a real phone. The number in the yellow banner should go down.
8. **Delete `translations.csv`.** `strings.json` is the master copy. The spreadsheet was only temporary, and git never saves `.csv` files anyway.

The [settings guide](docs/config-guide.md#recipe-14-translate-a-language-with-a-spreadsheet) has more tips on translations.

---

## The route through the questionnaire (flow tools)

The **route** (or *flow*) is which screen a partner sees after which: the order, the "show only if" rules, jumps, questions asked once per area, and the endings that send the answers.

**Where you change it: the control panel.** In **Questions** the whole route is one table, one row per screen: click **Copy the current route** (or **Copy the instruction for Claude/ChatGPT** to have an AI write the table from your notes), change it in Excel or Google Sheets, paste it back under **Paste a route**, then **Check** and **Use this route**. The **Map** and **Try a path** show and test the draft, or the pasted route before you use it, before you publish ([control panel guide, Recipe 2](docs/control-panel.md#recipe-2-change-the-questions-paste-a-route) and [How the route works](docs/control-panel.md#how-the-route-works)). The backup copy is the `"flow"` part of `web/config/survey.json` ([settings guide](docs/config-guide.md#flow-the-screens-in-order)).

**The map: [`docs/flow.md`](docs/flow.md).** A picture of every route a partner can take, a table of every screen and three example routes. Open it on GitHub to see the drawing. It is made from `web/config/survey.json` by a command, never typed by hand: the control panel's **Download files for the GitHub copy** gives you a fresh one with the other files ([Recipe 12](docs/control-panel.md#recipe-12-refresh-the-github-copy)), and the settings check warns when it no longer matches.

**The flow tools** are commands that check, draw and try out the route on this Mac. They use the same code as the phones, so they can never disagree with the form. They need Node.js 16 or newer ([Phase 1, step 3](#step-3-check-python-and-nodejs)). Run them in Terminal, in the project folder (`cd ~/NPSF` first). They only read, except where it says they write. The settings check (`python3 scripts/check_config.py`) already runs the check, the map check, the kinds check and the ES5 check for you.

### Check the route

```bash
python3 scripts/flow.py check
```

What it does: looks for mistakes in the route of `web/config/survey.json`: screens nobody can reach, dead ends, rules that test an answer that doesn't exist yet, impossible values (such as 11 on the 0–10 question), and more.

**You should see:** "ERRORS (must fix): 0" and "WARNINGS (worth a look): 0", perhaps a few NOTES (for example how many texts still need a translation), a **Size** line, and at the end "All good: no errors." Each problem has a code such as `[R1]`, explained in [docs/flow-engine.md](docs/flow-engine.md), section 6.

- `npm run validate-flow` does the same (npm comes with Node.js).
- To check a version published from the control panel, download its file (for example `p7.json`, from the Drive folder **Valmo Partner Pulse > published**) and run `python3 scripts/flow.py check --published ~/Downloads/p7.json`. A file name without `--published` is refused, with "Did you mean --published …?", so a check never runs on the wrong questionnaire.

### Try out answers

```bash
python3 scripts/flow.py simulate --set nps=4 --set fn_rating:payments=2 --set support_gate=no
```

What it does: shows what a partner with these answers would see. Each `--set` is one answer: a number (`nps=4`), a code (`support_gate=no`), `na`, `text:` followed by typed words, or `voice`. Add `--lang hi` for another language, `--lang-in-url` for a link that names the language, `--whats-changed 2` for a round with two "What changed" items, and `--submission` to see the whole message that would be sent.

**You should see:** "Screens, in order (12):" with the screens numbered, "Not on this route (7):" with the reason each other screen is skipped, the screens where Next would wait for an answer, and "What would be sent". An answer name no screen stores (a typo such as `nsp=4`) is ignored, with a note saying so.

### Draw the map

```bash
python3 scripts/flow.py map --write
```

What it does: writes `docs/flow.md` from `web/config/survey.json` (without `--write` it only shows it). You need it only after changing `survey.json`'s route by hand: the GitHub copy from the control panel already brings a fresh map. `npm run flow-map` does the same.

**You should see:** "Wrote docs/flow.md (… lines). Commit it together with the questionnaire."

### More commands

| Command (in the project folder) | What it does | You should see (today's project) |
|---|---|---|
| `python3 scripts/flow.py paths` | Lists every distinct route, trying the boundary values of every answer a rule tests, each with an example and how often it occurs. | "16 distinct routes through web/config/survey.json, from 512 answer sets …", then the routes, such as "language > nps > fn_ratings x6 > …". |
| `python3 scripts/flow.py compare ~/Downloads/p7.json web/config/survey.json` | Do two versions (a `survey.json`, a published `p7.json`, or a `web` folder) show the same screens and send the same data for the same answers? The only command that takes file names on their own. | "The same screens and the same data for all … answer sets tried", or "Different for … of … answer sets" with the first differences. |
| `python3 scripts/flow.py screens` | The list of screens as JSON, for the Phase 4 dashboard: each screen's name exactly as the **events** and **pings** tabs show it, its kind, its area and its English question. Add `--published p7.json` for a published version. | A list starting with `[`, then `"screen": "language"`. |
| `python3 scripts/flow.py migrate` | For developers: turns an old-style list in `survey.json`'s `"flow"` into the route format the panel writes, after proving that both show the same screens and send the same data. Writes only with `--write`. | "… already holds the flow as the graph (format pp-flow/1) …: nothing to do." |
| `python3 scripts/flow.py build-gs` | For developers: makes `apps-script/Flow.gs` (the fifth Apps Script file) from the route code in `web/js/`. **Writes** that file; with `--check` it only says whether it is up to date. After a new `Flow.gs`, paste it into the Apps Script project ([setup guide](apps-script/README.md#update-the-code-later-same-address)). | With `--check`: "apps-script/Flow.gs is up to date (fingerprint …)." |
| `python3 scripts/flow.py types` | For developers: the list of the kinds of question (`web/config/types.json`) and the control panel's copy of it in `apps-script/Model.gs`. **Writes** both only with `--write`; `--check` only says whether they are up to date. Adding a kind: [settings guide](docs/config-guide.md#how-to-add-a-question-type-for-a-developer). | With `--check`: "web/config/types.json is up to date (12 kinds of screen: 12 built in, none added)." |
| `python3 scripts/flow.py es5` | Checks that every script phones load is ES5, which old Android phones (Chrome 61) can run. Needs acorn (`cd tests && npm install`, once). | "All ES5: old Android phones (Chrome 61) can run every one of them." |
| `python3 scripts/flow.py help` | Every command and option. | The list of commands. |

Every flow command ends with an exit code, for automation: 0 = all good, 1 = problems found, 2 = it could not run (for example Node.js is missing: the command then explains how to install it).

---

## What's next

- **Phase 2: Go live** (this version). The form online on GitHub Pages, the Google Sheet control panel, the live Apps Script backend, and a personal link for every DC. See [Phase 2: go live](#phase-2-go-live).
- **Phase 3: Pipeline.** A Python program on this Mac that downloads the answers from each round's data spreadsheet, transcribes the voice notes, sorts comments and voice notes into the same area and problem codes, and prepares clean tables. It will read the Google Drive folder **Valmo Partner Pulse** through its own Google service account, with which the folder will be shared.
- **Phase 4: Dashboard.** A Streamlit dashboard (a simple web dashboard made with Python): NPS, area scores, top problems, where partners drop off, and round-by-round comparison.
- **Phase 5: Polish.** An end-to-end review of everything, and this README rewritten as one complete guide.

---

## Command cheat sheet

Run all of these from the project folder (`cd ~/NPSF` first, in every new Terminal window or tab).

| Command | What it does |
|---|---|
| `python3 scripts/mock_server.py` | Start the test server at `http://localhost:8787`. Stop it with Ctrl+C. After go-live, open `localhost:8787/?mock=1` (the links it prints already end in `&mock=1`). |
| `python3 scripts/mock_server.py --port 8788` | Use another port if 8787 is busy. Then open `localhost:8788`. |
| `python3 scripts/mock_server.py --lan` | Let a phone on the same Wi-Fi open the survey. Prints a `http://192.168.x.x:8787` link. |
| `python3 scripts/mock_server.py --strict` | Reject links with a wrong token. |
| `python3 scripts/mock_server.py --one-response-per-dc` | Answer "Already received" for a DC that has already answered. |
| `python3 scripts/mock_server.py --fail-rate 0.3` | Make 30% of sends fail, to test automatic retries. |
| `python3 scripts/mock_server.py --slow 3` | Reply 3 seconds late, like slow mobile data. |
| `python3 scripts/mock_server.py --closed-rounds DEMO-R1` | Pretend round DEMO-R1 has closed. `--draft-rounds DEMO-R1` pretends it is not open yet. |
| `python3 scripts/mock_server.py --data-dir local_data/demo2` | Save test answers in a different folder. Keep it inside `local_data/` so git ignores it. |
| `python3 scripts/mock_server.py --reset` | Delete all local test answers. Asks you to type `yes` first. |
| `python3 scripts/smoke_test.py` | Check that the running test server answers correctly (PASS/FAIL lines). Add `--expect-strict` if the server runs with `--strict`. |
| `python3 scripts/smoke_test.py --url <web app address ending in /exec> --secret "$(pbpaste)" --expect-strict` | Check the **live** backend. Copy the link secret first (control panel > **Links > Show the link secret**). [Details](apps-script/README.md#step-16-run-the-smoke-test-against-the-live-backend). |
| `python3 scripts/generate_links.py --dcs ~/Documents/dcs.csv --round 2026-R1` | Make every DC's personal link from a CSV file (column `dc_id`; optional `language`, `dc_name`, `state`, `region`, `active`), offline. Asks for the link secret. Add `--help` to see all the options. |
| `LANG=en_US.UTF-8 pbcopy < apps-script/Code.gs` | Copy a code file, to paste it into the Apps Script editor ([setup guide](apps-script/README.md#step-3-add-the-five-code-files)). |
| `python3 scripts/check_config.py` | Check all settings and texts, and report the page weight. With Node.js it also checks the route, `docs/flow.md`, the kinds of question and ES5. **Run after every edit.** |
| `node --version` | Show the Node.js version (16 or newer needed). [Phase 1, step 3](#step-3-check-python-and-nodejs). |
| `cd tests && npm install`, then `cd ..` | Once: install the parser (acorn) the settings check needs for its ES5 check. |
| `python3 scripts/flow.py check` | Check the route through the questionnaire. `npm run validate-flow` does the same. [The flow tools](#the-route-through-the-questionnaire-flow-tools). |
| `python3 scripts/flow.py simulate --set nps=4 --set support_gate=no` | Show the screens a partner with these answers sees, and what would be sent. |
| `python3 scripts/flow.py map --write` | Write the map of the route, `docs/flow.md`. |
| `python3 scripts/flow.py paths` | List every distinct route, with examples. |
| `python3 scripts/flow.py compare A B` | Do two versions (two files) show the same screens and send the same data? |
| `python3 scripts/flow.py screens` | The list of screens as JSON (for the dashboard). |
| `python3 scripts/flow.py migrate`, `build-gs`, `types`, `es5` | For developers: convert an old route list, make `apps-script/Flow.gs`, refresh the list of the kinds of question, check ES5. See [More commands](#more-commands). |
| `python3 scripts/strings_csv.py export --out translations.csv` | Make a translation spreadsheet. Add `--only-untranslated` and/or `--lang ta` to narrow it down. |
| `python3 scripts/strings_csv.py import translations.csv --dry-run` | Preview a translation import without changing anything. |
| `python3 scripts/strings_csv.py import translations.csv` | Import translations into `strings.json`. |
| `tail -n 1 local_data/responses.jsonl \| python3 -m json.tool --no-ensure-ascii` | Show the newest saved answer, neatly laid out. |
| `git status --ignored` | Before a commit: see what git will save and what it ignores. |
| `git add -A` then `git commit -m "What changed"` | Save all changes (except ignored files) as one snapshot. |
| `git push` | Upload your commits to GitHub. GitHub then checks the settings and republishes the form by itself. |

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `command not found: python3` | Python is not installed. | Install it from [python.org/downloads](https://www.python.org/downloads/), then open a new Terminal window. |
| "This script needs Python 3.11 or newer" | Python is too old. | Install the latest Python from [python.org/downloads](https://www.python.org/downloads/), then open a new Terminal window. |
| `can't open file` or `No such file or directory` | Terminal is not in the project folder. | Run `cd ~/NPSF` and try again. |
| A message that port 8787 is already in use | The server is already running in another tab or window. | Use that one, or stop it there with Ctrl+C. Or add `--port 8788` and open `localhost:8788`. |
| Chrome says "This site can't be reached" | The server is not running, or the address is wrong. | Start the server (step 5) and check the address. |
| The page is blank or shows an error after you edited a settings file | A settings file has a mistake. | Run `python3 scripts/check_config.py`, fix what it lists, and reload. |
| The settings check or a flow command says "The flow tools need Node.js (free), and it was not found on this Mac" | Node.js is not installed. The settings check then reports an error, because the route could not be checked. | Install Node.js ([Phase 1, step 3](#step-3-check-python-and-nodejs)), open a new Terminal window, and run the command again. |
| "The Node.js on this Mac is version …, which is too old: the flow tools need version 16 or newer." | An old Node.js. | Install the LTS version from [nodejs.org](https://nodejs.org), then open a new Terminal window. |
| A warning "ES5 check skipped: acorn is not installed …" | The parser for the ES5 check is not installed on this Mac. Not an error: GitHub runs that check anyway. | Run `cd tests && npm install` once, then `cd ..`, and run the check again. |
| A warning "The map of the questionnaire (docs/flow.md) is out of date …" (or missing) | `web/config/survey.json` changed, but its map did not. | Run `python3 scripts/flow.py map --write`, and commit `docs/flow.md` together with the questionnaire. After a GitHub copy from the control panel, copy its `flow.md` into `docs/` ([Recipe 12](docs/control-panel.md#recipe-12-refresh-the-github-copy)). |
| "Could not run: check does not take a file name on its own (…). Did you mean --published …?" | A flow command was given a file name without `--published` (only `compare` takes file names on their own). | Put `--published` before the file name. |
| An error about `web/config/types.json` ("… is missing" or "… no longer matches the form's code") | The list of the kinds of question was not made again after a change to the form's code. | For a developer: run `node scripts/flow.js types --write`, and commit the result. |
| Your change does not show | Chrome is showing an old copy, or old saved answers. | Press Cmd+Shift+R, or open the survey in a new Incognito window. |
| "This link is not valid" | The server was started with `--strict` and the link's token is wrong. | Use a demo link the server printed, or restart without `--strict`. |
| "Already received" when you open the survey again | This browser remembers that you finished the survey for this link. | Tap **Start again (test mode)**, or open the link in a new Incognito window. |
| "Already received" in a new Incognito window | The server was started with `--one-response-per-dc`. | Restart without it, or delete the test answers with `--reset`. |
| "Could not send" does not go away | The server is stopped, or was started with `--fail-rate`. | Make sure the server is running, then tap **Send now**. |
| No speaker button | This device has no read-aloud voice for that language. | Expected. Recorded clips can fill the gap: see [web/audio/README.md](web/audio/README.md). |
| On the phone, a text box shows instead of the voice button | Chrome blocks the microphone on `http` links. | Expected with the test server. Test voice notes on the Mac, or with a real `https` link. |
| The phone cannot open the link | Different Wi-Fi, the Mac's firewall, or a Wi-Fi network that keeps devices apart. | See [Try it on your phone](#try-it-on-your-phone). |
| After go-live, a local test link says "This link is not valid" or "This link is incomplete" | The form is in live mode now, so a link without `&mock=1` talks to Google, not to the test server. | Use a link the test server printed (they end in `&mock=1`), or add `&mock=1` to the end of the link (the plain address becomes `localhost:8787/?mock=1`). |
| `git push` asks for a password | GitHub wants the personal access token, not your account password. | Paste the token. See [Step 1: Put the project on GitHub](#step-1-put-the-project-on-github). |
| GitHub's **Actions** tab shows a red cross | `check_config.py` found an error, so GitHub kept the previous version of the form online. | Open the run to read the error. Fix it, run `python3 scripts/check_config.py` until "All good", then commit and push. |
| The online form still shows TEST MODE | `web/config/survey.json` still says `"mode": "mock"`, the change is not pushed yet, or the old page is cached. | See [the setup guide, Part D](apps-script/README.md#part-d-connect-the-form). Wait for the green tick in **Actions**, then reload in a new Incognito window. |
| A colleague gets "Google Drive would not open … for you" in the control panel, or the panel does not open for them at all ("The control panel could not open") | They can edit the Sheet but not the Drive folder **Valmo Partner Pulse**. | The admin who ran set-up clicks **Partner Pulse > Share the Drive folder with all editors** (see [Step 8](#step-8-share-the-sheet-and-the-drive-folder-with-colleagues)). |
| Problems with the Google Sheet, the control panel or the live backend | | See the [setup guide's troubleshooting](apps-script/README.md#troubleshooting) and the [control panel guide](docs/control-panel.md#if-something-goes-wrong). |

---

## Words used in this README

| Word | Meaning |
|---|---|
| **Backend** | The part that receives and stores answers. For testing, the test server on this Mac; for real partners, Google Apps Script. |
| **Mock / test mode** | A pretend version for testing. Answers stay on this Mac, and a yellow banner shows on every screen. |
| **Live mode** | The real thing: the form talks to Google Apps Script, and only works with a genuine personal link. |
| **Control panel** | The window inside the Google Sheet **Valmo Partner Pulse - Control** where colleagues change the questionnaire, run rounds and make links. See the [control panel guide](docs/control-panel.md). |
| **Draft / Publish / Live version** | The draft is what you edit in the control panel. **Publish** turns it into the next live version, which partners see. |
| **Preview** | Trying the draft form yourself. Nothing is saved. A preview link from the control panel ends with a private **preview key** (`&pk=…`): without it, the form shows its stored copy instead of the draft. |
| **Apps Script** | Google's way to add small programs to a Google Sheet. The live backend and the control panel are Apps Script. |
| **Web app, `/exec` address** | The Apps Script program put online, so the form can talk to it. Its address ends in `/exec`. |
| **GitHub, GitHub Pages, GitHub Actions** | GitHub stores the project online (public). GitHub Pages serves the form to partners' phones. GitHub Actions does the publishing by itself after every push. |
| **Push** | Uploading your commits to GitHub. |
| **Personal access token** | A long password made only for `git push`, created on github.com. |
| **Link secret** | The password the backend uses to make and check every partner's token. It lives only in Apps Script. Never share it, and never change it while links are out. |
| **localhost** | "This computer". |
| **Port** | A door number on a computer. The test server uses 8787. |
| **Terminal** | The Mac app where you type commands. |
| **Option** | Extra text after a command that changes what it does, such as `--slow 3`. |
| **JSON** | The text format of the settings files. The [settings guide](docs/config-guide.md#json-in-two-minutes) explains it in two minutes. |
| **Round** | One survey wave, such as `2026-R1`. Every link says which round it belongs to. |
| **DC** | Delivery centre: a partner's site. |
| **NPS** | Net Promoter Score. Partners answer 0–10: 9–10 are *promoters*, 0–6 are *detractors*. NPS = % promoters minus % detractors. |
| **Token** | The secret code in each partner's link (`t=…`) that proves the link is genuine. |
| **Route, flow** | Which screen a partner sees after which: the order, rules, jumps, per-area questions and endings. Changed in the control panel; its map is `docs/flow.md`. |
| **Node.js** | A free program that runs JavaScript on the Mac. The flow tools and the settings check need it. |
| **ES5** | The older JavaScript that old Android phones (Chrome 61) understand. Every script phones load must be written in it. |
| **git, commit** | git saves versions of this folder and uploads them to GitHub. A commit is one saved snapshot. |

**More guides:** [control panel guide](docs/control-panel.md) · [setup guide for the Sheet and the live backend](apps-script/README.md) · [settings guide](docs/config-guide.md) · [data format](docs/submission-format.md) · [technical design of the control panel](docs/control-panel-design.md) · [map of the route](docs/flow.md) · [how the route works inside](docs/flow-engine.md) · [read-aloud clips](web/audio/README.md) · [changelog](CHANGELOG.md)
