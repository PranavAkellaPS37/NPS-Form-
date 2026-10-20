<!--
===============================================================================
README.md: the front page of the Valmo Partner Pulse project
===============================================================================
What this file is for
  The first page anyone reads. It says what the project is, the golden rule
  about partner data, what each folder holds, and how to try the survey on a
  Mac, step by step.

Who it is for
  Ops colleagues. You do not need to know how to code.

How to read it
  On GitHub it is shown nicely formatted. On this Mac you can open it in
  VS Code and press Cmd+Shift+V to see the formatted preview.

When to update it
  At the end of every phase. It covers Phase 1 today and grows phase by
  phase. Phase 5 polishes it end to end.

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
> **This README grows with each phase.** Today it covers **Phase 1**: the survey form, its settings, and a test server that runs on this Mac. Phase 5 will polish it end to end.

## On this page

1. [The golden rule: no real partner data](#the-golden-rule-no-real-partner-data)
2. [What is in this folder](#what-is-in-this-folder)
3. [Phase 1: try the survey on this Mac](#phase-1-try-the-survey-on-this-mac)
4. [Test the tricky cases](#test-the-tricky-cases)
5. [Try it on your phone](#try-it-on-your-phone)
6. [Change the questions](#change-the-questions)
7. [Translations](#translations)
8. [What's next](#whats-next)
9. [Command cheat sheet](#command-cheat-sheet)
10. [If something goes wrong](#if-something-goes-wrong)
11. [Words used in this README](#words-used-in-this-readme)

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

For testing, use only obviously fake data, such as the DC ids `DC-DEMO-001` and `DC-SMOKE-TEST`.

### How the folder protects you

This folder will be stored on GitHub using **git**. (git is a tool that saves versions of a folder and uploads them to GitHub.)
A file called `.gitignore` tells git which files it must never save:

| Never saved by git | Why |
|---|---|
| The folders `local_data/`, `data/`, `exports/` and `logs/` | Test answers, downloads and logs go there. |
| Spreadsheets and data exports: `.csv`, `.tsv`, `.xlsx`, `.xls`, `.jsonl`, `.parquet`, `.sqlite`, `.db` | They could hold real answers. |
| Voice recordings: `.webm`, `.ogg`, `.opus`, `.m4a`, `.wav`, `.aac`, `.mp4`, `.bin` | Partner voices are personal data. |
| Secrets: `.env`, `*.key`, `credentials*.json`, `token*.json` and similar | Passwords and keys must never be uploaded. |

The one exception is the `sample_data/` folder (coming in a later phase). It is only for obviously fake demo data.

`.gitignore` is a safety net, not a guarantee. It cannot catch real data that someone types or pastes into a file git does save, such as a `.json` or `.md` file.

Two more things to know:

- Everything inside `web/` becomes a **public** web page once the form is online (Phase 2). Keep it free of anything confidential.
- The live secret key will never be stored in this folder. Phase 2 keeps it inside Google Apps Script.

### Before every commit, check what git will save

A *commit* is one saved snapshot of the folder. Once this folder uses git, run this before every commit:

```bash
git status --ignored
```

What it does: lists every file git sees as new or changed. Then, under the heading **Ignored files**, it lists the files it is leaving out.

Read everything **above** "Ignored files": those files can end up on GitHub. If any of them could contain real partner data, stop and ask for help before you commit.

> [!NOTE]
> This folder does not use git yet. Start doing this check as soon as it does.

---

## What is in this folder

| Folder or file | What it is | Will you edit it? |
|---|---|---|
| `web/` | **The form**: the survey page partners open on their phone. | Only the sub-folders below. |
| `web/config/` | **Questionnaire settings**: questions, areas, problem chips, colours, voice. | Yes. See the [settings guide](docs/config-guide.md). |
| `web/i18n/` | **All six languages**: every word on screen, in `strings.json`. (*i18n* is short for "internationalisation".) | Yes, to change wording or add translations. |
| `web/audio/` | Optional pre-recorded read-aloud clips. See [web/audio/README.md](web/audio/README.md). | Only if you add clips. |
| `web/index.html`, `web/css/`, `web/js/` | The form's code. | No. |
| `scripts/` | Tools you run: the test server, the checks and the translation tool. | No, you only run them. |
| `docs/` | Guides: the [settings guide](docs/config-guide.md) and the [data format](docs/submission-format.md). | No. |
| `local_data/` | **Your test answers and voice notes**, saved by the test server on this Mac. git never saves it. | No. You can clear it with `--reset` (see below). |
| `README.md` | This page. | |
| `CHANGELOG.md` | [What changed in each version](CHANGELOG.md). | |
| `.gitignore` | The list of files git must never save. It is hidden in Finder: press Cmd+Shift+. (full stop) to show hidden files. | Only to add more protection. |

**Coming in later phases:**

| Folder | What it will hold |
|---|---|
| `apps-script/` | Phase 2: the live backend. It checks links and saves answers in a Google Sheet. |
| `pipeline/` | Phase 3: a program that downloads the answers and sorts comments and voice notes into problem codes. |
| `dashboard/` | Phase 4: the results dashboard. |
| `sample_data/` | Obviously fake demo data for trying the pipeline and dashboard. It is the only data folder git is allowed to save. |
| `logs/` | Run logs. git never saves them. |

---

## Phase 1: try the survey on this Mac

You will start a small test server on this Mac, fill in the survey in Google Chrome, and then look at the answer it saved. The first time takes about 10 minutes.

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

What it does: moves Terminal into the project folder. Every other command on this page only works from here.

**You should see:** nothing printed, and the prompt now mentions `NPSF`. That is normal.

**If it goes wrong:** "no such file or directory" means the folder is somewhere else. Type `cd` followed by a space, drag the project folder from Finder into the Terminal window, and press Enter.

### Step 3: Check Python

```bash
python3 --version
```

What it does: shows which version of Python is installed. Python is the language the project's tools are written in.

**You should see:** `Python 3.11` or a higher number, such as `Python 3.14.6`.

**If it goes wrong:** if you see "command not found" or a number below 3.11, install Python from [python.org/downloads](https://www.python.org/downloads/). Then close Terminal, open it again, and repeat steps 2 and 3. Ask IT if your laptop does not let you install software.

### Step 4: Check the settings (a good habit)

```bash
python3 scripts/check_config.py
```

What it does: checks every settings file and every translation, and reports the *page weight*. Page weight is how much data a phone must download to open the form. The limit is 300 KB, so the form opens quickly on slow mobile data.

**You should see:** a report in three parts, ending with a line that starts with **All good**:

- **ERRORS**: must be fixed, or the form may break. There should be none.
- **WARNINGS**: worth a look, but they will not break the form. On a fresh copy of the project there is one, and it is normal: round "DEMO-R1" is fake test content.
- **SUMMARY**: the number of screens and areas, how much is still to translate in each language, and the page weight.

**If it goes wrong:** the last line says "Please fix the errors above", and each error says in plain English what to fix. If you have not edited anything yet, send the message to whoever set up the project.

### Step 5: Start the test server

```bash
python3 scripts/mock_server.py
```

What it does: starts a small test server on this Mac. It shows the survey to your browser and saves your answers in the `local_data/` folder. (*Mock* means "pretend". The server pretends to be the real backend that arrives in Phase 2.)

**You should see** a block of text headed "Valmo Partner Pulse: local test server (pretend backend) is running". It shows:

- the survey's address, `http://localhost:8787/`, and where answers are saved (`local_data/`);
- its test settings (none of the special options from [Test the tricky cases](#test-the-tricky-cases) are on yet);
- ready-to-click test links for fake demo DCs: English, Hindi, Tamil, one with no language (so the survey starts with the language screen), a link that is **broken on purpose**, and the plain address.

After that the window waits. That is normal: the server is running. While you use the survey, one line appears here for each message the form sends (for example `PING opened` or `SUBMIT … saved`). Typed answers and voice notes are never shown here, only counts.

**Leave this window open.** Closing it stops the server.

**If it goes wrong:** a message saying port 8787 is already in use means the server is already running in another Terminal window or tab. Use that one, or stop it there with Ctrl+C. You can also start this one on another port:

```bash
python3 scripts/mock_server.py --port 8788
```

What it does: the same as above, but on port 8788. Then use `localhost:8788` instead of `localhost:8787` everywhere.

### Step 6: Open the survey

Open **Google Chrome**, click in the address bar, type `localhost:8787` and press Enter.

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

To fill it in again from the start, tap **Start again (test mode)**. It appears on the Thank you screen and on the Already received screen, in test mode only. It clears this browser's saved answers for that link. It does not delete anything in `local_data/`.

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

- It saves a few obviously fake answers for `DC-SMOKE-TEST` (round `SMOKE-R1`). That is expected. Delete them with `--reset` if you like.
- Options such as `--fail-rate` (below) make some checks fail on purpose, so run the smoke test against a server started without them.
- If the server was started with `--strict`, run `python3 scripts/smoke_test.py --expect-strict` instead.
- If the server runs on another port, tell the check where it is: `python3 scripts/smoke_test.py --url http://localhost:8788/api`. Phase 2 will use `--url` to check the live backend.

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

The message "This link is incomplete" (for a link with parts missing) only appears in live mode, from Phase 2. In test mode, missing parts are filled with demo values.

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

**Voice notes on the phone:** the microphone will not work, and the form shows a text box instead. **That is expected.** Chrome only allows the microphone on secure (`https`) links, and the test link is plain `http`. Test voice notes in Chrome on the Mac instead, where `localhost` is allowed. The real links in Phase 2 are `https`, so voice notes will work on phones then.

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

## Change the questions

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
4. Look at the result. Open the survey in a new Incognito window (Cmd+Shift+N) so old saved answers do not get in the way, and go through the screens you changed.
5. If partners will see something different, change `config_version` (the guide shows how).

> [!WARNING]
> **Never rename the codes** for areas, problem chips or screens (for example `payments`, `payout_delayed`, `nps`), and do not add or remove them while a round is running. The dashboard compares rounds using these codes. To change what partners read, change the wording in `web/i18n/strings.json` instead. That is always safe.

---

## Translations

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

## What's next

- **Phase 2: Go live.** A Google Apps Script backend that checks every link and saves answers in a Google Sheet, a personal link for every DC, and the form online on GitHub Pages.
- **Phase 3: Pipeline.** A Python program on this Mac that downloads the answers, sorts comments and voice notes into the same area and problem codes, and prepares clean tables.
- **Phase 4: Dashboard.** A Streamlit dashboard (a simple web dashboard made with Python): NPS, area scores, top problems, where partners drop off, and round-by-round comparison.
- **Phase 5: Polish.** An end-to-end review of everything, and this README rewritten as one complete guide.

---

## Command cheat sheet

Run all of these from the project folder (`cd ~/NPSF` first, in every new Terminal window or tab).

| Command | What it does |
|---|---|
| `python3 scripts/mock_server.py` | Start the test server at `http://localhost:8787`. Stop it with Ctrl+C. |
| `python3 scripts/mock_server.py --port 8788` | Use another port if 8787 is busy. Then open `localhost:8788`. |
| `python3 scripts/mock_server.py --lan` | Let a phone on the same Wi-Fi open the survey. Prints a `http://192.168.x.x:8787` link. |
| `python3 scripts/mock_server.py --strict` | Reject links with a wrong token. |
| `python3 scripts/mock_server.py --one-response-per-dc` | Answer "Already received" for a DC that has already answered. |
| `python3 scripts/mock_server.py --fail-rate 0.3` | Make 30% of sends fail, to test automatic retries. |
| `python3 scripts/mock_server.py --slow 3` | Reply 3 seconds late, like slow mobile data. |
| `python3 scripts/mock_server.py --data-dir local_data/demo2` | Save test answers in a different folder. Keep it inside `local_data/` so git ignores it. |
| `python3 scripts/mock_server.py --reset` | Delete all local test answers. Asks you to type `yes` first. |
| `python3 scripts/smoke_test.py` | Check that the running test server answers correctly (PASS/FAIL lines). Add `--expect-strict` if the server runs with `--strict`. |
| `python3 scripts/check_config.py` | Check all settings and texts, and report the page weight. **Run after every edit.** |
| `python3 scripts/strings_csv.py export --out translations.csv` | Make a translation spreadsheet. Add `--only-untranslated` and/or `--lang ta` to narrow it down. |
| `python3 scripts/strings_csv.py import translations.csv --dry-run` | Preview a translation import without changing anything. |
| `python3 scripts/strings_csv.py import translations.csv` | Import translations into `strings.json`. |
| `tail -n 1 local_data/responses.jsonl \| python3 -m json.tool --no-ensure-ascii` | Show the newest saved answer, neatly laid out. |
| `git status --ignored` | Before a commit: see what git will save and what it ignores. |

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
| Your change does not show | Chrome is showing an old copy, or old saved answers. | Press Cmd+Shift+R, or open the survey in a new Incognito window. |
| "This link is not valid" | The server was started with `--strict` and the link's token is wrong. | Use a demo link the server printed, or restart without `--strict`. |
| "Already received" when you open the survey again | This browser remembers that you finished the survey for this link. | Tap **Start again (test mode)**, or open the link in a new Incognito window. |
| "Already received" in a new Incognito window | The server was started with `--one-response-per-dc`. | Restart without it, or delete the test answers with `--reset`. |
| "Could not send" does not go away | The server is stopped, or was started with `--fail-rate`. | Make sure the server is running, then tap **Send now**. |
| No speaker button | This device has no read-aloud voice for that language. | Expected. Recorded clips can fill the gap: see [web/audio/README.md](web/audio/README.md). |
| On the phone, a text box shows instead of the voice button | Chrome blocks the microphone on `http` links. | Expected in Phase 1. Test voice notes on the Mac. |
| The phone cannot open the link | Different Wi-Fi, the Mac's firewall, or a Wi-Fi network that keeps devices apart. | See [Try it on your phone](#try-it-on-your-phone). |

---

## Words used in this README

| Word | Meaning |
|---|---|
| **Backend** | The part that receives and stores answers. In Phase 1 it is the test server on this Mac; from Phase 2 it is Google Apps Script. |
| **Mock / test mode** | A pretend version for testing. Answers stay on this Mac, and a yellow banner shows on every screen. |
| **localhost** | "This computer". |
| **Port** | A door number on a computer. The test server uses 8787. |
| **Terminal** | The Mac app where you type commands. |
| **Option** | Extra text after a command that changes what it does, such as `--slow 3`. |
| **JSON** | The text format of the settings files. The [settings guide](docs/config-guide.md#json-in-two-minutes) explains it in two minutes. |
| **Round** | One survey wave, such as `2026-R1`. Every link says which round it belongs to. |
| **DC** | Delivery centre: a partner's site. |
| **NPS** | Net Promoter Score. Partners answer 0–10: 9–10 are *promoters*, 0–6 are *detractors*. NPS = % promoters minus % detractors. |
| **Token** | The secret code in each partner's link (`t=…`) that proves the link is genuine. |
| **git, commit** | git saves versions of this folder and uploads them to GitHub. A commit is one saved snapshot. |

**More guides:** [settings guide](docs/config-guide.md) · [data format](docs/submission-format.md) · [read-aloud clips](web/audio/README.md) · [changelog](CHANGELOG.md)
