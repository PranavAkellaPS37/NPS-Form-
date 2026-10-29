<!--
===============================================================================
docs/config-guide.md: how to change the survey without touching code
===============================================================================
What this file is for
  A friendly guide to every setting in the four settings files, plus
  copy-and-paste recipes for common changes (add a chip, add an area, ask an
  extra question only to low scorers, change colours, translate, ...).

The four files it explains
  web/config/survey.json         the questionnaire and its rules
  web/i18n/strings.json          every word on screen, in six languages
  web/config/whats_changed.json  the "What changed" card, per round
  web/config/audio_clips.json    optional recorded read-aloud clips

How to use it
  Read "Before you start" and "JSON in two minutes" once. After that, jump
  straight to the recipe you need. After EVERY edit, run:
      python3 scripts/check_config.py

What it reads and writes
  Nothing. It is documentation only.

When to update it
  Whenever a setting is added, removed or changes meaning. Keep the
  "_help" notes inside the settings files in step with this guide.

Safety
  All examples use fake data. Never paste real partner data (names, phone
  numbers, real DC ids, answers, voice notes, real links) into this guide
  or into any settings file: everything in web/ will be public online.
===============================================================================
-->

# Settings guide: change the survey without touching code

Everything partners see is controlled by four **settings files**. This guide explains every setting in plain English. Then it gives copy-and-paste **recipes** for common changes.

> [!IMPORTANT]
> **Since Phase 2, the live questionnaire is changed in the control panel**, not in these files. Once the Google Sheet control panel is set up ([README, Phase 2](../README.md#phase-2-go-live)), what you **publish** there is what partners see: use the [control panel guide](control-panel.md), which has the same recipes as clicks.
>
> These four files then serve as the **backup copy**: the form uses them only when Google does not answer in time (and the test server on this Mac always uses them). Refresh them from the panel after important changes ([control panel guide, Recipe 12](control-panel.md#recipe-12-refresh-the-github-copy)). This guide explains the files themselves, which is still useful to understand every setting, and for testing on this Mac.
>
> Four settings are never part of what you publish: `backend.mode`, `backend.mock_url`, `backend.apps_script_url` and `links`. The form always reads them from its own copy of `web/config/survey.json`, because it needs them before it can ask Google for the published questionnaire. The control panel has no setting for them, with one exception: once the web app address is recorded in the panel (**Home > Quick links**, **Check and save**), its **Download files for the GitHub copy** writes that address into `backend.apps_script_url`, with `mode` set to `"apps_script"`. While no address is recorded, the downloaded `survey.json` stays in test mode (`"mock"`, with an empty address), and the panel warns you. `mock_url` and `links` are always written as they are today.

You do not need to read it all. Read [Before you start](#before-you-start) and [JSON in two minutes](#json-in-two-minutes) once. After that, jump straight to the [recipe](#recipes) you need.

## On this page

- [Before you start](#before-you-start)
- [Codes you must not change mid-round](#codes-you-must-not-change-mid-round)
- [JSON in two minutes](#json-in-two-minutes)
- [The four settings files](#the-four-settings-files)
- [survey.json: the main settings](#surveyjson-the-main-settings)
  - [The flow: the screens, in order](#flow-the-screens-in-order) (jumps, endings, loops, rules on the language or the round)
  - [The settings the screens carry](#the-settings-the-screens-carry)
  - [show_if: show a screen only to some partners](#show_if-show-a-screen-only-to-some-partners)
- [strings.json: every word on screen](#stringsjson-every-word-on-screen)
- [whats_changed.json: the "What changed" card](#whats_changedjson-the-what-changed-card)
- [audio_clips.json: recorded read-aloud clips](#audio_clipsjson-recorded-read-aloud-clips)
- [Recipes](#recipes)
  1. [Reword a question or a chip](#recipe-1-reword-a-question-or-a-chip)
  2. [Add a problem chip](#recipe-2-add-a-problem-chip)
  3. [Remove a problem chip](#recipe-3-remove-a-problem-chip)
  4. [Add a new area](#recipe-4-add-a-new-area)
  5. [Change the threshold](#recipe-5-change-the-threshold)
  6. [Ask about problems right after each low rating](#recipe-6-ask-about-problems-right-after-each-low-rating)
  7. [Add a yes/no question only for scores of 6 or below](#recipe-7-add-a-yesno-question-only-for-scores-of-6-or-below)
  8. [Add a single-choice question](#recipe-8-add-a-single-choice-question)
  9. [Reorder or remove screens](#recipe-9-reorder-or-remove-screens)
  10. [Change colours, the logo or the product name](#recipe-10-change-colours-the-logo-or-the-product-name)
  11. [Switch voice notes to tap mode, or turn them off](#recipe-11-switch-voice-notes-to-tap-mode-or-turn-them-off)
  12. [Update the "What changed" card for a new round](#recipe-12-update-the-what-changed-card-for-a-new-round)
  13. [Add a pre-recorded audio clip](#recipe-13-add-a-pre-recorded-audio-clip)
  14. [Translate a language with a spreadsheet](#recipe-14-translate-a-language-with-a-spreadsheet)
  15. [Bump config_version](#recipe-15-bump-config_version)
- [How to add a question type (for a developer)](#how-to-add-a-question-type-for-a-developer)
- [If check_config.py reports a problem](#if-check_configpy-reports-a-problem)

---

## Before you start

Four habits keep you safe. Run every command from the project folder: open Terminal and run `cd ~/NPSF` first (your project folder; the main README, step 2, explains `~`).

**1. Make a backup copy first.** These commands copy the two files you will edit most onto your Desktop, outside the project:

```bash
cp web/config/survey.json ~/Desktop/survey-backup.json
cp web/i18n/strings.json ~/Desktop/strings-backup.json
```

What they do: save a copy of each file on your Desktop. Nothing is printed.

To undo all your changes later, copy them back:

```bash
cp ~/Desktop/survey-backup.json web/config/survey.json
cp ~/Desktop/strings-backup.json web/i18n/strings.json
```

**2. Use a plain-text editor.** VS Code is best, because it colours the file and underlines mistakes. If you have it, this opens a file in it:

```bash
open -a "Visual Studio Code" web/config/survey.json
```

TextEdit also works, but first turn off **Edit > Substitutions > Smart Quotes**. Otherwise TextEdit may turn straight quotes `"` into curly quotes `“ ”`, which breaks the file. Never edit these files in Word or Google Docs.

**3. Check after every edit.**

```bash
python3 scripts/check_config.py
```

What it does: checks all four files, and that every text exists in all six languages. It also reports the page weight: how much a phone must download to open the form (the limit is 300 KB). It never changes any file.

**You should see** a report whose last line starts with **All good**. The report has three parts:

- **ERRORS** must be fixed: the form may break, or a screen may silently never appear. Never send links while there are errors.
- **WARNINGS** are worth a look, but the form still works. One warning is normal: round "DEMO-R1" is fake test content.
- **SUMMARY** shows the size of the survey, how much is left to translate, and the page weight.

If the last line says "Please fix the errors above", fix each error and run it again.

**4. Never rename codes.** See the next section.

---

## Codes you must not change mid-round

> [!WARNING]
> **Do NOT change these during a round.** (A *round* is one survey wave, such as `2026-R1`, while its links are out with partners.)
>
> - **Area ids**, such as `losses`, `payments`, `linehaul`
> - **Problem chip codes**, such as `wrong_debit`, `payout_delayed`
> - **Screen ids** in `flow`, such as `nps`, `support_gate`, `one_fix` (and a screen's `store_as` code, such as `fn_rating:{area}`)
>
> Every answer is saved under these codes, and the dashboard compares rounds using them. If you renamed `payments` to `payouts`, the dashboard would see one area disappear and a new one appear, and the trend line would break.
>
> **Reword freely instead.** What partners read lives in `web/i18n/strings.json`. Fixing a typo or improving a label there is always safe.
>
> Between rounds you may add new codes or retire old ones. But **never rename a code, and never reuse an old code for a new meaning.** The same goes for support item ids (`agent_behaviour`, …) and the option codes of single-choice questions.
>
> **With the control panel**, codes lock by themselves when the first real round opens (rounds whose name starts with SMOKE, DEMO or TEST never lock them). The screen ids `nps` and `support_gate` are protected from the start: their answers fill their own columns in every round's answers sheet, so the panel can hide them but never deletes them or changes their code.

---

## JSON in two minutes

All four settings files are written in **JSON**, a simple text format. Here is a piece of `survey.json` (its `_help` note is left out):

```json
"deep_dive": {
  "threshold": 3,
  "when": "after_all_ratings",
  "require_chip": true,
  "require_detail_if_other": true
},
```

| What you see | What it means |
|---|---|
| `"threshold": 3` | One setting: its name in quotes, a colon, then its value. |
| `"after_all_ratings"` | Text is wrapped in straight double quotes. |
| `3`, `true`, `false`, `null` | Numbers, `true`/`false` and `null` (which means "nothing") have **no** quotes. |
| `{ }` | Curly brackets hold a group of named settings. |
| `[ ]` | Square brackets hold a list, such as `["wrong_debit", "no_proof"]`. |
| `,` | A comma goes **between** two items. There is **no** comma after the last item before a `}` or `]`. |
| `"_help": "…"` | A name that starts with `_` is a note for humans, and the form ignores it. Read these notes: they are short versions of this guide. |

Spaces and line breaks do not matter, except inside quotes.

**Common mistakes:**

| Mistake | Wrong | Right |
|---|---|---|
| Missing comma between two items | `"threshold": 3` `"when": "immediate"` | `"threshold": 3,` `"when": "immediate"` |
| Extra comma after the last item | `["late_supply", "poor_quality",]` | `["late_supply", "poor_quality"]` |
| Curly quotes (from TextEdit, Word or WhatsApp) | `“yes”` | `"yes"` |
| `true` or `false` in quotes (`"false"` in quotes counts as **true**) | `"required": "false"` | `"required": false` |
| Text without quotes | `"equals": yes` | `"equals": "yes"` |
| A bracket left open | `["late_supply", "poor_quality"` | `["late_supply", "poor_quality"]` |

If you make one of these, `check_config.py` usually tells you the line.

---

## The four settings files

| File | What it controls | How often you will edit it |
|---|---|---|
| [`web/config/survey.json`](../web/config/survey.json) | The questionnaire: areas, problem chips, rules, order of screens, colours, voice. Also where answers are sent (`backend`). | Before the control panel: between rounds, when questions change. After: once, to connect the form to the live backend; the rest comes from the panel. |
| [`web/i18n/strings.json`](../web/i18n/strings.json) | Every word on screen, in six languages. | Before the control panel: for wording fixes and translations. After: only when refreshing the backup copy. |
| [`web/config/whats_changed.json`](../web/config/whats_changed.json) | The "What changed since your last feedback" card, one block per round. | Before the control panel: once per round. After: only when refreshing the backup copy. |
| [`web/config/audio_clips.json`](../web/config/audio_clips.json) | Optional recorded read-aloud clips. | Rarely. |

Two more files are **made by commands, never edited by hand**: `web/config/types.json` (the catalogue of the kinds of screen, see [How to add a question type](#how-to-add-a-question-type-for-a-developer)) and `docs/flow.md` (the route drawn as a map, see [After every change to the flow](#after-every-change-to-the-flow)). `check_config.py` says when either is out of date.

**Why words and settings are kept apart.** `survey.json` never contains the words partners read. It refers to each text by a short code called a **string key**, such as `q.nps`. The words themselves live in `strings.json`, in all six languages. So translators only ever touch `strings.json`, and changing a word can never break the survey's logic.

> [!NOTE]
> **One list, used everywhere.** The list of areas and problem chips in `survey.json` (the *taxonomy*) is used by the form today. The Phase 3 classifier (which sorts comments and voice notes into these codes) and the Phase 4 dashboard will read the same list. So you edit the taxonomy in one place only, and everything else follows.

---

## survey.json: the main settings

The sections below follow the order of the file.

### Notes for humans

Every setting whose name starts with `_` (such as `_help`) is a note. The form ignores notes. They are short reminders of what this guide explains.

### survey_id and config_version

| Setting | What it means | Today |
|---|---|---|
| `survey_id` | The survey's permanent name. Every answer is stamped with it. | `"valmo-partner-pulse"`. Never change it. |
| `config_version` | The version of the questionnaire. Every answer is stamped with it, so the dashboard knows which version each partner saw. Change it whenever partners will see something different ([Recipe 15](#recipe-15-bump-config_version)). Once the control panel is in use, every published version gets its own stamp (for example `p7-2026-10-21`). Refreshing the GitHub copy writes that stamp here only when the saved draft is exactly the live version; otherwise it writes `"draft"`. | `"2026-10-19.1"` |

### branding: colours and logo

Colours are **hex codes**: a `#` followed by six characters (0–9 and A–F), such as `#4B2E83`. Your brand team can give you these. Today's colours are a **placeholder purple** until Valmo's brand colours arrive ([Recipe 10](#recipe-10-change-colours-the-logo-or-the-product-name)).

| Setting | What it colours | Today |
|---|---|---|
| `logo` | Optional logo image: a path inside `web/`, such as `"assets/logo.svg"`, or a secure web address starting with `https://`. Leave it empty (`""`) to show the product name as text instead. The product name is the text `brand.name` in `strings.json`. | `""` |
| `colors.primary` | Buttons and selected answers. | `#4B2E83` |
| `colors.on_primary` | Text on primary buttons. | `#FFFFFF` (white) |
| `colors.background` | The page background. | `#FFFFFF` |
| `colors.surface` | The background of answer buttons. | `#F3F0F8` |
| `colors.text` | Main text. | `#1B1B1F` |
| `colors.muted` | Secondary, less important text. | `#5F5E6B` |
| `colors.border` | Outlines. | `#D9D4E3` |
| `colors.error` | Error messages. | `#B3261E` (red) |
| `colors.success` | Success messages. | `#1B7F3B` (green) |

### backend: where answers go

| Setting | What it means | Today |
|---|---|---|
| `mode` | Where answers are sent, and where the form asks for the published questionnaire. `"mock"` = the test server on this Mac. `"apps_script"` = Google Apps Script, the live backend. Keep `"mock"` until the web app exists; switching is step 12 of the [setup guide](../apps-script/README.md#step-12-put-the-web-app-address-into-the-forms-settings). The control panel's GitHub copy writes `"apps_script"` once the web app address is recorded in the panel, and `"mock"` while it is not. | `"mock"` |
| `mock_url` | The test server's address for receiving answers. Leave it. | `"/api"` |
| `apps_script_url` | The Apps Script web app address, in the plain form ending in `/exec` (see below). Needed when `mode` is `"apps_script"`. | `""` |
| `request_timeout_seconds` | How long the form waits for the server to reply to one send. After that, it counts the attempt as failed and tries again. Bigger sends get more time automatically (next row). | `90` |
| `slow_upload_bytes_per_second` | The slowest upload speed the form plans for. A send with voice notes gets at least 30 seconds plus the time to upload it at this speed, so a slow but working connection is never cut off. 1000 = very weak 2G. | `1000` |
| `retry_delays_seconds` | The waits, in seconds, before each automatic retry when sending fails. After the last one, the partner still has a **Send now** button. The form also tries again when the internet comes back or the page is reopened. | `[2, 5, 10, 20, 40, 60, 60, 120, 120, 300]` (about 12 minutes in all) |

The last three rows can also be changed in the control panel (**Settings > Sending**); the published values win over these.

Adding `mock=1` to any link forces test mode, whatever `mode` says. The links the test server prints already end in `&mock=1`, so they keep working after `mode` becomes `"apps_script"`; add it yourself to local links you type (`localhost:8787/?mock=1`).

**The web app address (`apps_script_url`).** It must look like `https://script.google.com/macros/s/AKfycb...long-code.../exec`. The easiest way to get it right: copy it from the control panel (**Home > Quick links > Copy**), where it was checked when it was recorded ([setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). Never use:

- an address ending in `/dev`: it only works for people who can edit the script, never for partners;
- a `googleusercontent.com` address: that is where Google forwards to, not the web app itself;
- a company-style `…/a/macros/<company>/s/…/exec` address: it can ask partners to sign in. (The panel turns it into the plain form when you record it.)

`check_config.py` reports an error when `mode` is `"apps_script"` and the address is empty or does not start with `https://script.google.com/` (GitHub then keeps the previous form online), and a warning when it does not end in `/exec`.

### links: test-mode defaults

Every real link carries three details: `dc` (the DC's id), `t` (the *token*, a secret code that proves the link is genuine) and `round` (the round id). It can also carry `lang` (the language; the language screen is then skipped) and `mock=1` (test mode). Preview links made by the control panel carry `preview=1` and `pk` (a private preview key) instead of a token. A real link looks like this (fake values):

```text
https://<the survey's web address>/?dc=DC-DEMO-001&t=<token>&round=2026-R1&lang=hi
```

In live mode (from Phase 2), a link missing `dc`, `t` or `round` shows "This link is incomplete". In test mode, the values below fill the gaps, so you can test without a real link.

| Setting | What it means | Today |
|---|---|---|
| `mock_defaults.dc` | The DC id used in test mode. Always a fake id. | `"DC-DEMO-001"` |
| `mock_defaults.round` | The round used in test mode. | `"DEMO-R1"` |
| `mock_defaults.t` | The token used in test mode. Leave it empty. | `""` |

### languages

| Setting | What it means | Today |
|---|---|---|
| `languages` | The languages offered, in the order of the buttons on the language screen. Each has three parts: **`code`** (used in `strings.json` and in `lang=` links), **`bcp47`** (tells the phone which read-aloud voice to use; `hi-IN` means Hindi as spoken in India) and **`native_name`** (the language's name in its own script, shown on its button). | English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം |
| `default_language` | The language the form uses before the partner picks one. | `"en"` |
| `fallback_language` | Used when a text is missing, or still marked `[TRANSLATE]`, in the chosen language. That language's text is shown instead, and read aloud with its voice. | `"en"` |

The codes are `en` English, `hi` Hindi, `ta` Tamil, `te` Telugu, `kn` Kannada and `ml` Malayalam. To change the order of the buttons, move whole lines within the list (and check the commas).

Never change a language's code: it would break every link and every text that uses it. Adding a seventh language is a bigger job, because every text in `strings.json` and every "What changed" sentence needs it. Plan it as a project, not a quick edit. (With the control panel: **Settings > Languages > Add a language**. Every text then starts as "to translate", so partners see English until it is translated.)

### navigation

| Setting | What it means | Today |
|---|---|---|
| `auto_advance` | `true` = after a tap on a single-answer question (0–10, faces, yes/no, single choice), the form moves on by itself. `false` = the partner taps **Next**. | `true` |
| `auto_advance_delay_ms` | The pause before moving on, so the partner sees what they tapped. In milliseconds: 1000 = 1 second. | `350` |

### rating: the faces

| Setting | What it means | Today |
|---|---|---|
| `faces` | The five faces, from 1 (worst) to 5 (best). Their labels are the texts `rating.1` to `rating.5` (Very bad, Bad, Okay, Good, Very good). Keep exactly five. | 😠 🙁 😐 🙂 😄 |
| `allow_not_applicable` | `true` adds a small **I don't handle this** option under each area rating (text `rating.na`). For example, a captain may never deal with payouts. These answers are left out of averages. | `true` |

The area ratings screen in `flow` (`fn_ratings`) carries its own copy of `allow_not_applicable`, and phones follow that copy: change both ([The settings the screens carry](#the-settings-the-screens-carry)).

### deep_dive: the "main problem" screens

| Setting | What it means | Today |
|---|---|---|
| `threshold` | An area rated **at or below** this number gets a "What is the main problem?" screen, with that area's problem chips and an optional voice note or text. `3` means ratings 1, 2 and 3 (Very bad, Bad, Okay). | `3` |
| `when` | `"after_all_ratings"` = the problem screens come after all six ratings. `"immediate"` = each comes straight after its low rating. | `"after_all_ratings"` |
| `require_chip` | `true` = the partner must pick a chip before **Next**. | `true` |
| `require_detail_if_other` | `true` = if the partner picks **Other**, a voice note or typed text is required. | `true` |

**Why "after all ratings" is recommended:** partners cannot learn half-way through that a low score means extra questions. If they could, some would give higher scores to finish faster.

The screens in `flow` carry their own copies of these four settings, and phones follow those: change both ([The settings the screens carry](#the-settings-the-screens-carry); Recipes [5](#recipe-5-change-the-threshold) and [6](#recipe-6-ask-about-problems-right-after-each-low-rating)).

### functions: the areas and their problem chips

The areas partners rate, one screen each, in this order. ("Function" is the code word for an area.)

| Area id | Name on screen (English) | Problem chip codes |
|---|---|---|
| `losses` | Losses & Debits | `wrong_debit`, `no_proof`, `dispute_slow`, `dispute_rejected`, `amount_too_high` |
| `payments` | Payments / Payouts | `payout_delayed`, `short_payment`, `unclear_breakup`, `invoice_gst`, `incentive_missing` |
| `linehaul` | Line Haul | `late_arrival`, `trip_missed`, `damaged_on_arrival`, `short_receipt`, `rto_pickup_delay` |
| `consumables` | Consumables | `short_supply`, `late_supply`, `poor_quality`, `wrong_charge`, `hard_to_request` |
| `orders` | Orders & Planning | `volume_low`, `volume_spike`, `forecast_wrong`, `pincode_mapping`, `capacity_mismatch` |
| `app` | App / Tech | `app_slow_crash`, `scan_issue`, `wrong_data`, `login_otp`, `missing_feature` |

Each line in the file has these parts:

| Part | What it means |
|---|---|
| `id` | The area's permanent code. |
| `issues` | The area's problem chips, as permanent codes, in the order shown. Use 4–6 per area. |
| `threshold` | Optional. Gives this one area its own threshold instead of the one in `deep_dive` ([Recipe 5](#recipe-5-change-the-threshold)). |

Good to know:

- An **Other** chip (code `other`, text `issue.other`) is added to every area automatically. Never add `other` yourself.
- The words come from `strings.json`: `fn.<area id>.name` (the area's name), `fn.<area id>.help` (the line under it) and `issue.<area id>.<chip code>` (each chip).
- The same list feeds the Phase 3 classifier and the Phase 4 dashboard (see [the note above](#the-four-settings-files)).

### support: the support block

Shown only to partners who answer **Yes** to "In the last 30 days, did you contact Valmo support?". (The `show_if` rule in `flow` does this. See [show_if](#show_if-show-a-screen-only-to-some-partners).)

| Setting | What it means | Today |
|---|---|---|
| `items` | The four things rated 1–5 on one screen. Labels: `support.<item>` in `strings.json`. These ids are permanent codes too. | `agent_behaviour`, `understood_problem`, `time_to_resolve`, `kept_updated` |
| `allow_not_applicable` | `true` adds a small **Doesn't apply** link under each support row (text `support.not_applicable`), for example "Kept me updated" when the problem was solved on the first call. `false` = every row needs a face. | `false` |
| `allow_comment` | `true` adds an optional voice note or typed comment under the four rows. | `true` |
| `comment_text` | The string key of the comment's question. | `"q.support_comment"` |

The `support` screen in `flow` carries its own copies of `allow_not_applicable`, `allow_comment` (its `comment`) and `comment_text`, and phones follow those: change both ([The settings the screens carry](#the-settings-the-screens-carry)).

### voice: voice notes

| Setting | What it means | Today |
|---|---|---|
| `enabled` | `true` = partners can leave voice notes. `false` = typing only. | `true` |
| `gesture` | `"hold"` = press and hold to record, let go to stop (like WhatsApp). `"tap"` = tap to start, tap again to stop. | `"hold"` |
| `max_seconds` | The longest note allowed. A countdown shows while recording. | `60` |
| `min_seconds` | Notes shorter than this are thrown away as accidental taps. | `1` |
| `bitrate` | Recording quality, in bits per second. `16000` keeps a 60-second note around 120 KB, which suits slow data. | `16000` |
| `mime_types` | The audio formats to try, best first. Leave as is. | four formats |

If a phone cannot record, or the partner blocks the microphone, the form quietly shows a text box instead.

### text, read_aloud, whats_changed and telemetry

| Setting | What it means | Today |
|---|---|---|
| `text.max_chars` | The maximum length of one typed answer, in characters. Any language or script is accepted, including Hindi or Tamil typed in English letters. | `1500` |
| `read_aloud.enabled` | Shows the speaker button on each question. It plays a recorded clip when one is listed for that text and language. In live mode the list comes from the Sheet's **Audio clips** tab (published from the control panel); in test mode, or when Google is slow, from [`audio_clips.json`](#audio_clipsjson-recorded-read-aloud-clips). If there is no clip, it uses the phone's built-in voice. The button hides itself when neither is available. | `true` |
| `whats_changed.timeout_seconds` | How long the form waits for the backend when a link is opened. Since Phase 2 the "What changed" content arrives together with the published questionnaire, in one request, and the form waits this many seconds **plus 2** for it (4 + 2 = 6 seconds). If it takes longer, the form uses its own copy of all four files, including `whats_changed.json`; if that has nothing for the round, the screen is skipped. Preview links wait up to 20 seconds instead, because Google needs longer to prepare a draft. Allowed: 1 to 20. In the control panel: **Settings > What changed > Wait for the live questionnaire (seconds)**. | `4` |
| `telemetry.enabled` | Sends small progress messages (started, which screen the partner reached), so the dashboard can show where partners drop off. They never contain answers. The "opened" message is always sent, even when this is `false`, because it also checks that the link is genuine. | `true` |

### help: the help videos (since 28 Oct 2026)

| Setting | What it means | Today |
|---|---|---|
| `help.how_to_fill_video` | A YouTube link (unlisted is fine) to a short video on how to fill the form. When it (or the next one) is set, an ⓘ button in the top bar of every screen opens a sheet with one button per video; a YouTube video plays inside the form, in a frame made only on that tap, and any other `https://` link opens in a new tab. Empty: no video. Its title is the text `help.how_to_fill`; the button's name is `help.button`. Live, it is **Settings > Help videos** in the control panel. | `""` |
| `help.why_it_helps_video` | The same for a short, neutral video on what partners' answers are used for (never how to answer). Its title is the text `help.why_it_helps`. | `""` |

The settings check (`scripts/check_config.py`) refuses a value that is neither empty nor a full `https://` link. A questionnaire published before 28 Oct 2026 has no help texts: the form then shows no button, never a text's name.

### flow: the screens, in order

`flow` is the **route** through the questionnaire: every screen, and which one comes after which. Since 26 Oct 2026 it is written as a small map (a "graph", format `pp-flow/1`): each screen says where to go next. So a question can send some partners elsewhere (a **jump**), a screen can be asked once for each area (a **loop**), and there can be several thank-you screens (**endings**).

> [!NOTE]
> **Live, the route is edited in the control panel** (Questions > **Paste a route**: the whole route as one table, copied out, changed in Excel and pasted back), which also writes this copy for you ([control panel guide, How the route works](control-panel.md#how-the-route-works)). Edit it here by hand only for the backup copy or to test on this Mac, and always finish with [After every change to the flow](#after-every-change-to-the-flow). The exact format, for developers: [flow-engine.md](flow-engine.md). The route drawn as a map: [flow.md](flow.md).

**The shape** (the screens shortened):

```json
"flow": {
  "_help": "…",
  "format": "pp-flow/1",
  "start": "language",
  "collections": {
    "areas": { "list": "functions", "defaults": { "threshold": 3 } },
    "support_items": { "list": "support.items" }
  },
  "nodes": [
    { "id": "language", "type": "language_picker", …, "next": "whats_changed" },
    …
    { "id": "thanks", "type": "thank_you" }
  ]
}
```

| Part | What it means |
|---|---|
| `format` | Always `"pp-flow/1"`. Never change it. |
| `start` | The `id` of the first screen. |
| `collections` | The lists a screen can repeat over: `areas` (the areas in `functions`) and `support_items` (the support questions). `defaults` > `threshold` is the threshold every area uses unless it has its own ([Recipe 5](#recipe-5-change-the-threshold)). |
| `nodes` | The screens, one `{ }` each, in the order the control panel lists them. The arrows (`next`) decide the order partners see, not the place in this list. |

**Today's screens:**

| # | `id` | `type` | What the partner sees | `next` |
|---|---|---|---|---|
| 1 | `language` | `language_picker` | Choose your language. Skipped when the link already has `lang=`. | `whats_changed` |
| 2 | `whats_changed` | `whats_changed` | What changed since your last feedback. Skipped when the round has no items. | `nps` |
| 3 | `nps` | `nps_0_10` | How likely are you to recommend Valmo to another DC owner? (0–10) | `fn_ratings` |
| 4 | `fn_ratings` | `function_rating` | One faces screen per area: six screens (it repeats for each area). | `fn_deep_dives` |
| 5 | `fn_deep_dives` | `function_deep_dive` | What is the main problem? Once for each area rated at or below its threshold. | `support_gate` |
| 6 | `support_gate` | `yes_no` | In the last 30 days, did you contact Valmo support? | `support` |
| 7 | `support` | `support_block` | Four support rows and an optional comment. Only after **Yes**; otherwise skipped. | `one_fix` |
| 8 | `one_fix` | `free_text` | If Valmo could fix just one thing for you, what should it be? Optional. | `thanks` |
| 9 | `thanks` | `thank_you` | Sends the answers and says thank you. | (an ending: none) |

**The parts of a screen:**

| Part | What it means |
|---|---|
| `id` | The screen's permanent code. Answers are saved under it. Use lowercase letters, digits and underscores (`_`), starting with a letter, and never rename it. |
| `type` | The kind of screen (see the next tables). |
| `text` | The string key of the question, such as `"q.one_fix"`. |
| `required` | `true` = the partner must answer. `false` = adds a **Skip** button. Write it on every question screen you add. |
| `next` | Where to go after this screen: the `id` of a screen further along, or a list of [jumps](#jumps-send-some-partners-elsewhere). Every screen needs one, except a thank-you screen. |
| `show_if` | Show this screen only when the rule is true ([show_if](#show_if-show-a-screen-only-to-some-partners)). Otherwise it is skipped, and the route follows its `next` (with jumps: the `default`). |
| `repeat_for` | Ask this screen once for each area ([Loops](#loops-ask-a-question-for-each-area)). |
| `store_as` | The answer's code, when it is not the `id`. A screen asked for each area needs one with `{area}` in it, such as `"long_running:{area}"`, so each area's answer has its own code. |
| `label` | On a screen asked for each area: `"fn.{area}.name"`, the area's name above the question. |
| `low_label`, `high_label`, `scale_hint` | 0–10 screens only: the words under 0 and under 10, and the one-line hint. All three are string keys. |
| `options` | Single-choice screens only: the list of option codes. |
| `body` | Info cards and thank-you screens: optional longer text under the title (a string key). |

The built-in screens have more parts (for example `rows`, `comment`, `issue_code_from`, `require_choice`, and the rules that skip the first two screens). Leave them as they are, except the settings listed in [The settings the screens carry](#the-settings-the-screens-carry).

**Screen types.** The **built-in** types are already in the flow. Use each one only once (thank-you screens excepted).

| Built-in type | What it is |
|---|---|
| `language_picker` | The language buttons. Must be the first screen. |
| `whats_changed` | The "What changed" card. |
| `function_rating` | The faces screen for one area, repeated for each area in `functions`. |
| `function_deep_dive` | The "main problem" screen, repeated for each area rated low. |
| `support_block` | The four support rows, from `support`. |
| `thank_you` | Sends the answers and says thank you: an **ending**. There may be several. |

(The control panel's Screens tab, and versions published before 26 Oct 2026, call the two area screens `function_ratings` and `function_deep_dives`.)

The **generic** types can be added freely. Every screen costs partners time, though, so add only what you will act on.

| Generic type | What the partner sees | Parts it needs |
|---|---|---|
| `nps_0_10` | Buttons from 0 to 10. | `text`, `low_label`, `high_label`, `scale_hint`, `required` |
| `rating_1_5` | One row of five faces. | `text`, `required` |
| `yes_no` | Yes and No buttons. | `text`, `required` |
| `single_choice` | A list of options; pick one. | `text`, `options`, `required` |
| `multi_choice` | A list of options; tick one or more, then Next (since 28 Oct 2026). A rule's `equals` means "is one of the ticked". | `text`, `options`, `required` |
| `free_text` | A voice note or a typed answer. | `text`, `required` |
| `info_card` | A message, with nothing to answer. | `text` (the title), optional `body` |

A new kind of question needs a developer: [How to add a question type](#how-to-add-a-question-type-for-a-developer).

#### Jumps: send some partners elsewhere

Instead of one screen, `next` can be a list:

```json
"next": [
  { "when": { "answer": "nps", "at_least": 9 }, "goto": "promoter_q" },
  { "default": "fn_ratings" }
]
```

Read it as: "after this screen, partners who scored 9 or 10 go to `promoter_q`; everyone else goes to `fn_ratings`". The first `when` that is true wins, and `default` (for everyone else) comes last. A `when` is written exactly like a [show_if](#show_if-show-a-screen-only-to-some-partners) rule, and it may test the screen's own answer.

#### Endings: more than one thank-you screen

Every `thank_you` screen is an **ending**: partners stop there and their answers are sent. A short route can end on its own thank-you screen, with its own title and message. With the jump above:

```json
{ "id": "promoter_q", "type": "free_text", "text": "q.promoter_q", "required": false, "next": "promoter_end" },
{ "id": "promoter_end", "type": "thank_you", "text": "end.promoter_end.title", "body": "end.promoter_end.body" }
```

Promoters then see `nps`, `promoter_q` ("What does Valmo do well that we should keep doing?") and `promoter_end`. Put such screens **after** `thanks` in `nodes`, as the control panel does: only a jump leads to them. Add their texts to `strings.json` ([Adding a new text](#adding-a-new-text)).

#### Loops: ask a question for each area

```json
{ "id": "long_running", "type": "yes_no", "text": "q.long_running", "label": "fn.{area}.name", "required": true,
  "store_as": "long_running:{area}",
  "repeat_for": { "each": "area", "in": "areas",
                  "where": { "answer": "fn_rating:{area}", "at_most": { "var": "area.threshold" } } },
  "next": "support_gate" },
```

Read it as: "for each area rated at or below its threshold, ask 'Has this problem been going on for more than a month?', with the area's name above the question". Put it after `fn_deep_dives` in `nodes` and point `fn_deep_dives` at it (`"next": "long_running"`). The answers arrive as `long_running:payments`, `long_running:app` and so on. Leave out `where` to ask for every area.

#### Rules on the language or the round

A `show_if`, or a jump's `when`, can also test facts about the visit instead of an answer:

| Write | Means |
|---|---|
| `{ "fact": "lang", "in": ["hi", "en"] }` | the partner reads Hindi or English |
| `{ "fact": "round", "equals": "2026-R2" }` | the link is for round `2026-R2` |
| `{ "fact": "lang_in_url", "equals": true }` | the link chose the language |
| `{ "fact": "whats_changed_count", "at_least": 1 }` | the round has "What changed" items |

For example, an information card only in round `2026-R2` (and `"next": "r2_note"` on `whats_changed`):

```json
{ "id": "r2_note", "type": "info_card", "text": "info.r2_note", "show_if": { "fact": "round", "equals": "2026-R2" }, "next": "nps" },
```

Partners can switch language with the button at the top. A screen shown only in some languages then appears or disappears, and the form carries on from the first screen not answered yet.

#### Rules for the flow

- `start` names the first screen, `language`, and the language screen stays first.
- Every `id` is different. Ids and `store_as` codes are permanent ([Codes you must not change](#codes-you-must-not-change-mid-round)).
- Every screen except a thank-you screen has `next`. Arrows only go **forward**, to a screen further along the route, never back: going round in circles is refused. A screen repeats only through `repeat_for`.
- A rule can only test answers given **before** it on the route (a jump also its own screen's answer).
- `fn_deep_dives` comes after `fn_ratings`.
- Every route ends at a thank-you screen.
- `nps` stays a 0–10 question and `support_gate` a yes/no question: their answers fill their own columns in every round's answers sheet.
- Mind the commas: between the screens in `nodes`, and between the jumps of a list.

#### After every change to the flow

Run these in Terminal, in the project folder:

```bash
python3 scripts/flow.py check
```

What it does: looks for mistakes in the route (a jump to a screen that doesn't exist, a rule that can never be true, a screen nobody reaches, a setting that disagrees with the screens …) and explains each one, with how to fix it. **You should see** `All good: no errors.` (Codes such as `[R1]` are explained in [flow-engine.md](flow-engine.md), section 6.)

```bash
python3 scripts/flow.py map --write
```

What it does: redraws `docs/flow.md`, the map of the route (GitHub shows it as a picture). **You should see** `Wrote docs/flow.md (… lines).` Commit it together with `survey.json`; `check_config.py` warns while it is out of date.

```bash
python3 scripts/flow.py simulate --set nps=10
```

What it does: shows the screens a partner with these answers would see, in order, why every other screen is skipped, where **Next** would be blocked, and what would be sent. Try one example per route, for example `--set nps=10`, then `--set nps=4 --set fn_rating:payments=2 --set support_gate=no`. Add `--round 2026-R2` or `--lang ta` to try a rule on the round or the language. Nothing is sent anywhere.

Then run `python3 scripts/check_config.py` as after every edit.

### The settings the screens carry

Some settings are kept twice: in the settings groups above (`deep_dive`, `rating`, `support`) and on the screens in `flow`. **Phones follow the copy in `flow`.** The control panel writes both when it publishes. When you edit by hand, **change both**: if they disagree, `python3 scripts/check_config.py` and `python3 scripts/flow.py check` report an error (check S1) that names both values, and GitHub does not publish the form.

| Setting | Its copy in `flow` |
|---|---|
| `deep_dive` > `threshold` | `collections` > `areas` > `defaults` > `threshold` |
| `deep_dive` > `require_chip` | `"require_choice"` on `fn_deep_dives` |
| `deep_dive` > `require_detail_if_other` | `"require_detail_if_other"` on `fn_deep_dives` |
| `deep_dive` > `when` | the shape of the flow: `"immediate"` needs the area loop of [Recipe 6](#recipe-6-ask-about-problems-right-after-each-low-rating) |
| `rating` > `allow_not_applicable` | `"allow_not_applicable"` on `fn_ratings` |
| `support` > `allow_not_applicable` | `"allow_not_applicable"` on `support` |
| `support` > `allow_comment` | `"comment"` on `support`: there when `true`, removed when `false` |
| `support` > `comment_text` | `"comment"` > `"text"` on `support` |

An area's own `threshold` in `functions` still wins over both ([Recipe 5](#recipe-5-change-the-threshold)).

### show_if: show a screen only to some partners

Add `show_if` to a screen in `flow` to show it only when an earlier answer matches. Otherwise the screen is skipped (the route follows its `next`), and it sends no answer. A jump's `when` ([Jumps](#jumps-send-some-partners-elsewhere)) is written the same way, and so is a test on the language or the round ([Rules on the language or the round](#rules-on-the-language-or-the-round)).

The basic shape:

```json
"show_if": { "answer": "nps", "at_most": 6 }
```

Read it as: "show this screen only if the answer to `nps` is at most 6".

**What you can test** (the value after `"answer"`):

| Write | What it tests | Possible values |
|---|---|---|
| `"nps"` | The 0–10 score. | Numbers 0 to 10 |
| `"support_gate"` | "Did you contact Valmo support?" | `"yes"` or `"no"` |
| `"fn_rating:payments"` (any area id after the colon) | That area's rating. | Numbers 1 to 5, or `"na"` for "I don't handle this" |
| `"fn_deep_dive:payments"` (any area id after the colon) | The problem chip picked on that area's "main problem" screen. | A chip code of that area, or `"other"` |
| `"support:kept_updated"` (any support item after the colon) | That support row's rating. | Numbers 1 to 5 |
| The `id` of a screen you added | Its answer. | `yes_no`: `"yes"` or `"no"`. `rating_1_5`: 1 to 5. `single_choice`: an option code. `multi_choice`: an option code, true when it is one of the ticked. `nps_0_10`: 0 to 10. |
| `"one_fix"`, `"support_comment"` or the `id` of a free-text screen you added | Whether the partner typed something or recorded a voice note there. | Use only with `answered`, e.g. `{ "answer": "one_fix", "answered": true }` |

Info cards have no answer to test. A screen can only test answers from screens that come **before** it on the route. So `fn_rating:…` tests go after `fn_ratings`, `fn_deep_dive:…` tests after `fn_deep_dives`, and `support:…` tests after `support`. A screen asked for each area stores one answer per area, such as `"long_running:payments"` ([Loops](#loops-ask-a-question-for-each-area)).

**The tests:**

| Test | Means | Example | Reads as |
|---|---|---|---|
| `equals` | is exactly | `{ "answer": "support_gate", "equals": "yes" }` | answered Yes to the support question |
| `not_equals` | is anything except | `{ "answer": "support_gate", "not_equals": "yes" }` | did not answer Yes |
| `at_most` | is this number or lower | `{ "answer": "nps", "at_most": 6 }` | scored 0 to 6 |
| `at_least` | is this number or higher | `{ "answer": "nps", "at_least": 9 }` | scored 9 or 10 |
| `in` | is one of a list | `{ "answer": "role", "in": ["owner", "manager"] }` | is an owner or a manager |
| `answered` | was answered (`true`), or was skipped or never shown (`false`) | `{ "answer": "role", "answered": false }` | skipped the role question |

(The `role` examples use the question from [Recipe 8](#recipe-8-add-a-single-choice-question).)

Two more examples:

- `{ "answer": "fn_rating:app", "equals": "na" }` reads "tapped **I don't handle this** for App / Tech". That answer is not a number, so `at_most` and `at_least` never match it.
- `{ "answer": "fn_deep_dive:payments", "equals": "payout_delayed" }` reads "picked **Payout delayed** as the main Payments problem".

**When there is no answer.** If the earlier screen was skipped, or never shown on this partner's route, it has no answer. (An answer given on a screen the partner later left behind, by going **Back** and changing an earlier answer, counts as no answer too, and it is not sent.) Then `equals`, `in`, `at_most` and `at_least` do **not** match, but `not_equals` **does** (no answer counts as "not that"). To target exactly the partners who skipped, use `"answered": false`.

**Combining tests.** Use `all` when **every** test must match:

```json
"show_if": { "all": [
  { "answer": "nps", "at_most": 6 },
  { "answer": "support_gate", "equals": "yes" }
] }
```

Read it as: "scored 0 to 6 **and** contacted support".

Use `any` when **at least one** test must match:

```json
"show_if": { "any": [
  { "answer": "fn_rating:payments", "at_most": 2 },
  { "answer": "fn_rating:losses", "at_most": 2 }
] }
```

Read it as: "rated Payments 1 or 2 **or** rated Losses 1 or 2".

**Writing tips:**

- Numbers have no quotes (`6`). Text has quotes (`"yes"`). Lists use square brackets (`["owner", "manager"]`).
- `true` and `false` never have quotes: `"answered": "false"` in quotes would count as **true**.
- Codes must match exactly, in lowercase: `"yes"`, not `"Yes"`.
- Each test sits in its own `{ }` with one `"answer"` and exactly one test. To use two tests, combine them with `all` or `any`.
- Here is a whole screen with `show_if` (from [Recipe 7](#recipe-7-add-a-yesno-question-only-for-scores-of-6-or-below)):

  ```json
  { "id": "callback", "type": "yes_no", "text": "q.callback", "required": true, "show_if": { "answer": "nps", "at_most": 6 }, "next": "support_gate" },
  ```

---

## strings.json: every word on screen

Every word partners see, in all six languages, one line per text:

```json
"ui.next": {"en": "Next", "hi": "आगे", "ta": "[TRANSLATE] Next", "te": "[TRANSLATE] Next", "kn": "[TRANSLATE] Next", "ml": "[TRANSLATE] Next"},
```

- **On the left** is the **key**: the text's permanent code. `survey.json` and the form refer to texts by key. Never change a key that is in use.
- **On the right** is one value per language: `en` English, `hi` Hindi, `ta` Tamil, `te` Telugu, `kn` Kannada, `ml` Malayalam.

### The [TRANSLATE] tag

A value that starts with `[TRANSLATE] ` (the tag, then one space) is a placeholder. Partners see the English instead, without the tag, and it is read aloud with the English voice. A translator replaces the **whole** value, tag included.

Today, English and Hindi are written, and every Tamil, Telugu, Kannada and Malayalam text is a placeholder. In test mode, the yellow banner says how many texts in the chosen language are still placeholders.

### Numbers the form fills in

`{s}` (seconds) and `{n}` (a count) are filled in by the form. For example, `"{s} s left"` becomes "12 s left". Keep them exactly as they are, in every language.

### How keys are named

| Key pattern | Used for | Example |
|---|---|---|
| `q.<name>` | Questions. For a new screen, use `q.<screen id>`. | `q.nps`, `q.one_fix` |
| `fn.<area id>.name` | An area's name. | `fn.payments.name` |
| `fn.<area id>.help` | The short line under an area's name. | `fn.payments.help` |
| `issue.<area id>.<chip code>` | A problem chip. | `issue.payments.payout_delayed` |
| `issue.other` | The **Other** chip, shared by all areas. | `issue.other` |
| `support.<item id>` | A support row. | `support.kept_updated` |
| `choice.<screen id>.<option code>` | An option of a single-choice question. | `choice.role.owner` |
| `rating.1` … `rating.5`, `rating.na` | The labels under the faces, and "I don't handle this". | `rating.3` |
| `nps.low`, `nps.high`, `nps.scale_hint` | The words at the two ends of the 0–10 scale, and the hint line. | `nps.low` |
| `brand.name` | The product name in the header. | `brand.name` |
| `lang.title`, `wc.title` | The titles of the language and "What changed" screens. | `wc.title` |
| `ui.*`, `voice.*`, `text.*`, `dd.*`, `submit.*`, `thanks.*`, `already.*`, `link.*`, `resume.*`, `net.*` | Buttons and messages. | `ui.next` |
| `round.*` | The messages for a round that has closed or is not open yet (Phase 2). | `round.closed_title` |
| `dev.*` | Test-mode and preview messages, such as the yellow TEST MODE banner and the blue PREVIEW strip. Partners never see these. | `dev.mock_banner`, `dev.preview_banner` |

**The texts added in Phase 2** (English and Hindi written, the other four languages `[TRANSLATE]`):

| Key | English | Where it shows |
|---|---|---|
| `round.closed_title` | This survey has closed | A round that has closed. |
| `round.closed_body` | Thank you. Look out for the next round. | Under it. |
| `round.not_open_title` | This survey is not open yet | A round that is not open yet. |
| `round.not_open_body` | Please open the same link again once it starts. | Under it. |
| `dev.preview_banner` | PREVIEW: answers are not saved | The blue strip on preview links. |
| `dev.preview_done` | Preview finished. Nothing was saved. | The last screen of a preview. |
| `dev.preview_fallback` | Could not load the draft: showing the form's stored copy. Open the preview link from the control panel again. | Added to the strip when a preview could not get the draft. |
| `ui.start_again` | Start again | The button on the last screen of a preview. |
| `dev.preview_broken` | The draft could not be shown: something in it stops the form from starting, so the form's stored copy is shown. Don't publish it: undo your last change, run Check for problems and preview again. | Added to the strip when the draft arrived but stops the form from starting. |

`check_config.py` checks that all of them exist, in all six languages.

### Adding a new text

**Every new key needs all six languages:**

- `en`: the real English.
- `hi`: the real Hindi. If you do not have it yet, use `[TRANSLATE] ` + the English for now, and get it translated before the round starts.
- `ta`, `te`, `kn`, `ml`: `[TRANSLATE] ` + the English, until a translator fills them in.

**Where to paste it:** anywhere inside the outer `{ }`. Best is next to similar keys, and **not** as the very last line. That way every line, including yours, ends with a comma. Each key may appear only once.

---

## whats_changed.json: the "What changed" card

This is the content of the "What changed since your last feedback" screen, one block per round. It is the only text that lives outside `strings.json`.

| Part | What it means |
|---|---|
| `rounds` | One block per round. The block's name must exactly match `round=…` in the partner links, capitals included. |
| `title` | Leave it as `null`. The screen then uses the standard title, the text `wc.title` ("What changed since your last feedback"). |
| `items` | The sentences shown, one per change. Each needs all six languages, with `[TRANSLATE] ` + English for the ones not translated yet. If a round has no items, or no block at all, the screen is skipped. |

Good to know:

- `DEMO-R1` is fake test content (every sentence starts with `[SAMPLE]`). Never use it for a real round.
- `2026-R1` already exists, with no items yet.
- Since Phase 2, the live form gets this content from Google Apps Script, together with the published questionnaire. It is written in the control panel (**Rounds > What changed**) and reaches partners when you **Publish**. This file is then the backup.
- Anyone will be able to read it once the form is online, so write nothing confidential.

How to fill it in: [Recipe 12](#recipe-12-update-the-what-changed-card-for-a-new-round).

---

## audio_clips.json: recorded read-aloud clips

**This is optional.** By default, the speaker button uses the phone's built-in voice. Recorded clips help when a phone has no voice for a language, or when it sounds wrong.

| Part | What it means |
|---|---|
| `clips` | Connects a string key to one mp3 file per language. Paths are relative to the `web/` folder. Empty (`{}`) = use the phone's voice only. |

Example:

```json
"clips": {
  "q.nps": { "hi": "audio/hi/q.nps.mp3", "ta": "audio/ta/q.nps.mp3" }
}
```

**With the control panel (Phase 2)**, the live list of clips is the Sheet's **Audio clips** tab (columns `key`, `lang` and `url`), and it reaches phones when you publish. This file is then the backup copy, refreshed from the panel like the others.

How to record and add clips: [Recipe 13](#recipe-13-add-a-pre-recorded-audio-clip) and [web/audio/README.md](../web/audio/README.md).

---

## Recipes

Each recipe uses fake example content. Replace it with yours.

### Finish every recipe the same way

> [!IMPORTANT]
> After every recipe:
>
> 1. Save the file or files.
> 2. Run `python3 scripts/check_config.py`. Fix anything it lists until it says **All good**.
> 3. If partners will see something different, bump `config_version` ([Recipe 15](#recipe-15-bump-config_version)).
> 4. Look at the result. Start the test server if it is not running (`python3 scripts/mock_server.py`). Open a **new Incognito window** in Chrome (Cmd+Shift+N), so old saved answers do not get in the way. Go to `localhost:8787` (once the form is connected to the live backend: `localhost:8787/?mock=1`) and go through the screens you changed.

### Recipe 1: Reword a question or a chip

Safe at any time, even during a round.

1. Open `web/i18n/strings.json`.
2. Find the text: search (Cmd+F) for a few of the English words you see on screen. For example, searching for `fix just one thing` finds this line:

   ```json
   "q.one_fix": {"en": "If Valmo could fix just one thing for you, what should it be?", "hi": "अगर Valmo आपके लिए सिर्फ़ एक चीज़ ठीक कर सके, तो वह क्या होनी चाहिए?", "ta": "[TRANSLATE] If Valmo could fix just one thing for you, what should it be?", "te": "[TRANSLATE] If Valmo could fix just one thing for you, what should it be?", "kn": "[TRANSLATE] If Valmo could fix just one thing for you, what should it be?", "ml": "[TRANSLATE] If Valmo could fix just one thing for you, what should it be?"},
   ```

3. Change the words inside the quotes after `"en":` and `"hi":`. Never change the key on the left (`q.one_fix`).
4. Then the other four languages:
   - If a language still has `[TRANSLATE] ` + English, update the English part to match your new English.
   - If it already has a real translation and you changed the **meaning**, replace it with `[TRANSLATE] ` + your new English, so a translator redoes it. A small typo fix in the English needs no change there.
5. If the text has a recorded audio clip, record it again, or the clip will say the old words.

Another example: changing the chip "Payout delayed" to "Payout comes late". The code `payout_delayed` stays exactly the same; only the words change. (The Hindi already means "payout comes late", so it stays too.)

```json
"issue.payments.payout_delayed": {"en": "Payout comes late", "hi": "पेआउट देर से आता है", "ta": "[TRANSLATE] Payout comes late", "te": "[TRANSLATE] Payout comes late", "kn": "[TRANSLATE] Payout comes late", "ml": "[TRANSLATE] Payout comes late"},
```

Then [finish as usual](#finish-every-recipe-the-same-way).

### Recipe 2: Add a problem chip

Example: add "Wrong item sent" to Consumables. Do this between rounds.

**Step 1.** In `web/config/survey.json`, find the `consumables` line under `functions`, and add the new code at the end of its `issues` list.

Before:

```json
{ "id": "consumables", "issues": ["short_supply", "late_supply", "poor_quality", "wrong_charge", "hard_to_request"] },
```

After:

```json
{ "id": "consumables", "issues": ["short_supply", "late_supply", "poor_quality", "wrong_charge", "hard_to_request", "wrong_item"] },
```

**Step 2.** In `web/i18n/strings.json`, add the chip's label in all six languages. Paste it right after the other `issue.consumables.` lines:

```json
"issue.consumables.wrong_item": {"en": "Wrong item sent", "hi": "गलत सामान भेजा गया", "ta": "[TRANSLATE] Wrong item sent", "te": "[TRANSLATE] Wrong item sent", "kn": "[TRANSLATE] Wrong item sent", "ml": "[TRANSLATE] Wrong item sent"},
```

**Rules for a new chip code:**

- Use lowercase letters, digits and underscores only, starting with a letter and with no spaces, such as `wrong_item`.
- Make it different from every other chip in the same area.
- Never use `other`: it is added automatically.
- Keep 4–6 chips per area. Consumables now has 6, which is the most.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 3: Remove a problem chip

Example: remove "Hard to place a request" from Consumables. Do this between rounds.

**Step 1.** In `web/config/survey.json`, delete the code from the list, together with the comma before it.

Before:

```json
{ "id": "consumables", "issues": ["short_supply", "late_supply", "poor_quality", "wrong_charge", "hard_to_request"] },
```

After:

```json
{ "id": "consumables", "issues": ["short_supply", "late_supply", "poor_quality", "wrong_charge"] },
```

**Step 2.** In `web/i18n/strings.json`, **leave** `issue.consumables.hard_to_request` where it is. Answers from earlier rounds still use that code, and the dashboard needs its name to show them. `check_config.py` will now show a **warning** that this text is not used by any chip. That is fine: it is kept on purpose, and the warning says leaving it does no harm.

**Step 3.** Never reuse `hard_to_request` later for a different problem.

Keep at least 4 chips per area. Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 4: Add a new area

Example: add "Communication from Valmo", with four chips. Do this between rounds.

Every area adds one more screen for every partner. Before adding one, ask whether another could go.

**Step 1.** In `web/config/survey.json`, add a line at the end of the `functions` list. The line before it (`app`) now needs a comma at the end, and the new last line has none:

```json
"functions": [
  { "id": "losses",      "issues": ["wrong_debit", "no_proof", "dispute_slow", "dispute_rejected", "amount_too_high"] },
  { "id": "payments",    "issues": ["payout_delayed", "short_payment", "unclear_breakup", "invoice_gst", "incentive_missing"] },
  { "id": "linehaul",    "issues": ["late_arrival", "trip_missed", "damaged_on_arrival", "short_receipt", "rto_pickup_delay"] },
  { "id": "consumables", "issues": ["short_supply", "late_supply", "poor_quality", "wrong_charge", "hard_to_request"] },
  { "id": "orders",      "issues": ["volume_low", "volume_spike", "forecast_wrong", "pincode_mapping", "capacity_mismatch"] },
  { "id": "app",         "issues": ["app_slow_crash", "scan_issue", "wrong_data", "login_otp", "missing_feature"] },
  { "id": "communication", "issues": ["told_too_late", "hard_to_understand", "no_contact_person", "too_many_messages"] }
],
```

**Step 2.** In `web/i18n/strings.json`, add the area's name, its help line, and one label per chip, each in all six languages:

```json
"fn.communication.name": {"en": "Communication from Valmo", "hi": "Valmo से मिलने वाली जानकारी", "ta": "[TRANSLATE] Communication from Valmo", "te": "[TRANSLATE] Communication from Valmo", "kn": "[TRANSLATE] Communication from Valmo", "ml": "[TRANSLATE] Communication from Valmo"},
"fn.communication.help": {"en": "Updates about changes, plans and who to contact", "hi": "बदलाव और प्लान के अपडेट, और किससे संपर्क करें", "ta": "[TRANSLATE] Updates about changes, plans and who to contact", "te": "[TRANSLATE] Updates about changes, plans and who to contact", "kn": "[TRANSLATE] Updates about changes, plans and who to contact", "ml": "[TRANSLATE] Updates about changes, plans and who to contact"},
"issue.communication.told_too_late": {"en": "Changes told too late", "hi": "बदलाव की जानकारी देर से मिलती है", "ta": "[TRANSLATE] Changes told too late", "te": "[TRANSLATE] Changes told too late", "kn": "[TRANSLATE] Changes told too late", "ml": "[TRANSLATE] Changes told too late"},
"issue.communication.hard_to_understand": {"en": "Updates hard to understand", "hi": "अपडेट समझ नहीं आते", "ta": "[TRANSLATE] Updates hard to understand", "te": "[TRANSLATE] Updates hard to understand", "kn": "[TRANSLATE] Updates hard to understand", "ml": "[TRANSLATE] Updates hard to understand"},
"issue.communication.no_contact_person": {"en": "No clear person to contact", "hi": "पता नहीं किससे बात करें", "ta": "[TRANSLATE] No clear person to contact", "te": "[TRANSLATE] No clear person to contact", "kn": "[TRANSLATE] No clear person to contact", "ml": "[TRANSLATE] No clear person to contact"},
"issue.communication.too_many_messages": {"en": "Too many messages", "hi": "बहुत ज़्यादा मैसेज आते हैं", "ta": "[TRANSLATE] Too many messages", "te": "[TRANSLATE] Too many messages", "kn": "[TRANSLATE] Too many messages", "ml": "[TRANSLATE] Too many messages"},
```

Good to know:

- The order of the `functions` list is the order of the area screens.
- The "main problem" screen for the new area works automatically.
- The Phase 3 classifier and Phase 4 dashboard pick up the new area from the same list.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 5: Change the threshold

The threshold decides who gets a "What is the main problem?" screen: an area rated **at or below** it gets one.

| `threshold` | Ratings that get a problem screen |
|---|---|
| `2` | 1 Very bad and 2 Bad |
| `3` (today) | 1 Very bad, 2 Bad and 3 Okay |
| `4` | Everything except 5 Very good |

**For all areas:** in `web/config/survey.json`, change the number in **two** places (phones follow the second one; [why](#the-settings-the-screens-carry)):

1. inside `deep_dive`, change `"threshold": 3,` to `"threshold": 2,`;
2. inside `flow`, in `collections`, change

   ```json
   "areas": { "list": "functions", "defaults": { "threshold": 3 } },
   ```

   to

   ```json
   "areas": { "list": "functions", "defaults": { "threshold": 2 } },
   ```

If you change only one, the check reports an error (S1) naming both numbers.

**For one area only:** add `"threshold"` next to that area's `id` in `functions`. The other areas keep the value above. Example: for Payments, ask only after ratings of 1 or 2:

```json
{ "id": "payments", "threshold": 2, "issues": ["payout_delayed", "short_payment", "unclear_breakup", "invoice_gst", "incentive_missing"] },
```

Every saved rating records the threshold that applied, so the dashboard can still compare rounds. Even so, change it between rounds, not during one. Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 6: Ask about problems right after each low rating

Today the problem screens come after all six ratings. That is the recommended setting, because partners cannot learn half-way through that a low score means extra questions.

> [!TIP]
> In the control panel this is one choice: **Settings**, group **Problem screens**, then under **When to ask about problems** pick **Straight after each low rating** ([control panel guide, Recipe 16](control-panel.md#recipe-16-choose-where-the-problem-screens-go)). The panel then builds the route below by itself.

By hand it takes three changes in `web/config/survey.json`:

1. Inside `deep_dive`, change `"when": "after_all_ratings",` to `"when": "immediate",`.
2. In `flow` > `nodes`, replace the two screens `fn_ratings` and `fn_deep_dives` with this one **group**. It repeats for each area: first the area's rating, then its problem screen if the rating is low.

   ```json
   { "id": "area_loop", "type": "group",
     "repeat_for": { "each": "area", "in": "areas" },
     "body": {
       "start": "fn_ratings",
       "nodes": [
         { "id": "fn_ratings", "type": "function_rating", "store_as": "fn_rating:{area}",
           "text": "q.fn_rating", "label": "fn.{area}.name", "help": "fn.{area}.help",
           "issue_code_from": "fn_deep_dive:{area}", "allow_not_applicable": true,
           "next": "fn_deep_dives" },
         { "id": "fn_deep_dives", "type": "function_deep_dive", "store_as": "fn_deep_dive:{area}",
           "show_if": { "answer": "fn_rating:{area}", "at_most": { "var": "area.threshold" } },
           "text": "q.deep_dive", "label": "fn.{area}.name", "detail_text": "q.tell_more", "detail_text_required": "q.tell_more_required",
           "options": { "from": "area.issues", "text": "issue.{area}.{code}", "other": "issue.other" },
           "rating_from": "fn_rating:{area}", "require_choice": true, "require_detail_if_other": true,
           "next": "@next_item" }
       ]
     },
     "next": "support_gate" },
   ```

   `"@next_item"` means "this area is done: go on to the next area". The answer codes stay the same (`fn_rating:payments`, `fn_deep_dive:payments`), so the dashboard can still compare rounds.
3. On the `nps` screen, change `"next": "fn_ratings"` to `"next": "area_loop"`.

To go back, undo all three. Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump, and try it with `python3 scripts/flow.py simulate --set nps=5 --set fn_rating:payments=2 --set support_gate=no`: the Payments problem screen should come straight after the Payments rating.

### Recipe 7: Add a yes/no question only for scores of 6 or below

Example: ask partners who scored 0 to 6 whether they would like a call from the Valmo team. Only add this if someone will really make those calls.

**Step 1.** In `web/config/survey.json`, in `flow` > `nodes`, add the `callback` screen after `fn_deep_dives`, so partners have already told us their problems, and point `fn_deep_dives` at it. Only these two screens change (the rest of `fn_deep_dives` stays as it is):

```json
{ "id": "fn_deep_dives", "type": "function_deep_dive", …, "next": "callback" },

{ "id": "callback", "type": "yes_no",
  "text": "q.callback",
  "required": true,
  "show_if": { "answer": "nps", "at_most": 6 },
  "next": "support_gate" },
```

The `show_if` part reads: "show this screen only if the answer to `nps` is at most 6". Partners who scored 7 or more skip it and go straight on to `support_gate` (its `next`).

**Step 2.** In `web/i18n/strings.json`, add the question:

```json
"q.callback": {"en": "Would you like someone from the Valmo team to call you?", "hi": "क्या आप चाहेंगे कि Valmo टीम से कोई आपको कॉल करे?", "ta": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "te": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "kn": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "ml": "[TRANSLATE] Would you like someone from the Valmo team to call you?"},
```

The answer is saved under the screen's id: `"callback": "yes"` or `"callback": "no"`. Partners who score 7 or more never see the screen, so their answers have no `callback` value.

**To test it:** `python3 scripts/flow.py simulate --set nps=6` lists `callback`, and `--set nps=7` does not. Then, in the form, score 6 and you should see the question; in a new Incognito window, score 7 and you should not.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 8: Add a single-choice question

Example: "Who is filling in this survey?" with three options. It is optional (`"required": false`), so partners can skip it.

**Step 1.** In `web/config/survey.json`, in `flow` > `nodes`, add this screen just before `one_fix`, and change the `next` of the `support` screen from `"one_fix"` to `"role"`:

```json
{ "id": "role", "type": "single_choice",
  "text": "q.role",
  "options": ["owner", "manager", "captain"],
  "required": false,
  "next": "one_fix" },
```

Partners who answer **No** to the support question skip `support` and follow its `next`, so they get `role` too.

**Step 2.** In `web/i18n/strings.json`, add the question and one text per option. Option texts are named `choice.<screen id>.<option code>`:

```json
"q.role": {"en": "Who is filling in this survey?", "hi": "यह सर्वे कौन भर रहा है?", "ta": "[TRANSLATE] Who is filling in this survey?", "te": "[TRANSLATE] Who is filling in this survey?", "kn": "[TRANSLATE] Who is filling in this survey?", "ml": "[TRANSLATE] Who is filling in this survey?"},
"choice.role.owner": {"en": "DC owner", "hi": "DC मालिक", "ta": "[TRANSLATE] DC owner", "te": "[TRANSLATE] DC owner", "kn": "[TRANSLATE] DC owner", "ml": "[TRANSLATE] DC owner"},
"choice.role.manager": {"en": "DC manager", "hi": "DC मैनेजर", "ta": "[TRANSLATE] DC manager", "te": "[TRANSLATE] DC manager", "kn": "[TRANSLATE] DC manager", "ml": "[TRANSLATE] DC manager"},
"choice.role.captain": {"en": "Captain", "hi": "कैप्टन", "ta": "[TRANSLATE] Captain", "te": "[TRANSLATE] Captain", "kn": "[TRANSLATE] Captain", "ml": "[TRANSLATE] Captain"},
```

The answer is saved as the option code, for example `"role": "manager"`. A partner who skips it has no `role` value. Option codes follow the same rules as chip codes, and they are permanent too.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 9: Reorder or remove screens

The order partners see comes from the arrows (`next`), not from the place of a screen in `nodes`.

**To reorder,** change the arrows. Example: ask "one thing to fix" before the support questions. Three `next` values change:

| Screen | `next` before | `next` after |
|---|---|---|
| `fn_deep_dives` | `"support_gate"` | `"one_fix"` |
| `one_fix` | `"thanks"` | `"support_gate"` |
| `support` | `"one_fix"` | `"thanks"` |

Then move the `one_fix` screen above `support_gate` in `nodes` too, so the file (and the control panel) read in the order partners see.

**To remove** a screen, delete its `{ … }` and point the arrow that led to it at the screen after it. Examples:

- **Drop "one thing to fix":** delete the `one_fix` screen, and change the `next` of `support` from `"one_fix"` to `"thanks"`.
- **Drop the support questions:** delete **both** `support_gate` and `support`, and change the `next` of `fn_deep_dives` to `"one_fix"`. The check then warns that the `support_contacted` column of the answers sheet will stay empty: that is expected. If you deleted only `support_gate`, the `support` screen's `show_if` would test an answer nothing asks for, which is an error. (In the control panel you **hide** these screens instead: `support_gate`, like `nps`, can never be deleted there. A hidden screen is simply left out of these files, so deleting it here has the same effect. If you bring it back, use exactly the same id.)
- **Hide the "What changed" card for one round:** do not delete anything. Leave that round's `items` empty in `whats_changed.json`, and the screen is skipped by itself.

**Rules:** the [rules for the flow](#rules-for-the-flow) apply. A removed screen's answers stop arriving, so the dashboard will show a gap. If you bring the screen back later, use the **same** id.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump, and check every route with `python3 scripts/flow.py check`.

### Recipe 10: Change colours, the logo or the product name

**Colours.** In `web/config/survey.json`, under `branding`, replace the codes in `colors`. The values below are **examples only, not Valmo's real colours**. Ask the brand team for those.

```json
"colors": {
  "primary": "#0B5FFF",
  "on_primary": "#FFFFFF",
  "background": "#FFFFFF",
  "surface": "#EEF3FF",
  "text": "#1B1B1F",
  "muted": "#5F5E6B",
  "border": "#D3DCF0",
  "error": "#B3261E",
  "success": "#1B7F3B"
}
```

Tips:

- `primary` is the main brand colour. Text in `on_primary` must be easy to read on it: white works on dark colours.
- `surface` works best as a very light tint of the primary colour, and `border` as a light grey or tint.
- Keep `error` red and `success` green, because partners already know those colours.
- Check the result on a real phone outdoors, in bright light.

**Logo.** Put the image inside `web/`, for example in a new folder `web/assets/` as `logo.svg`. Then set:

```json
"logo": "assets/logo.svg",
```

The path starts inside `web/`, so do not write `web/` at the start. Keep the file small (an SVG, or a PNG of a few KB), because the whole page must stay under 300 KB. `check_config.py` reports the page weight. Leave `"logo": ""` to show the product name as text.

A picture already online can be used instead, by its full address: `"logo": "https://…/logo.png"`. It must start with `https://` (a plain `http://` picture is blocked on the form's secure page), and it must not contain spaces. `check_config.py` can't check that such a picture exists or how big it is, so open the form once to see it, and keep the picture small. The control panel (**Look & feel > Logo**) uses the same rule.

**Product name.** The name in the header is the text `brand.name` in `strings.json` (today "Valmo Partner Pulse"). Change it like any other text ([Recipe 1](#recipe-1-reword-a-question-or-a-chip)).

Then [finish as usual](#finish-every-recipe-the-same-way). A change to colours or the logo alone does not need a `config_version` bump.

### Recipe 11: Switch voice notes to tap mode, or turn them off

In `web/config/survey.json`, find the `voice` block. (The words `enabled` also appear in other blocks, so make sure you are inside `voice`.) Its `_help` line is left out below; keep it in your file.

**Tap mode:** tap once to start, tap again to stop. It can help partners who find holding a button hard. Hold mode is more familiar to WhatsApp users. Change `"gesture": "hold",` to `"gesture": "tap",`:

```json
"voice": {
  "enabled": true,
  "gesture": "tap",
  "max_seconds": 60,
  "min_seconds": 1,
  "bitrate": 16000,
  "mime_types": ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"]
},
```

**Voice off:** partners can only type. Change `"enabled": true,` to `"enabled": false,` inside the `voice` block.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 12: Update the "What changed" card for a new round

> [!IMPORTANT]
> **With the control panel (Phase 2), do this in the panel instead:** **Rounds > What changed**, then **Publish**. The exact clicks are in the [control panel guide, Recipe 7](control-panel.md#recipe-7-start-a-new-round-with-its-what-changed-bullets). Partners get the bullets from the published version; this file is only the backup copy, which you refresh from the panel ([control panel guide, Recipe 12](control-panel.md#recipe-12-refresh-the-github-copy)). The steps below edit the file by hand, for example to try it on the test server.

Do this before each round's links go out.

1. **Decide the round id**, such as `2026-R1`. It must match `round=…` in the partner links **exactly**, capitals included. Use 1 to 64 letters, digits, `-` or `_`: no spaces and no dots. `check_config.py` and the control panel both refuse any other name.
2. Open `web/config/whats_changed.json` and find that round's block under `rounds`. `2026-R1` is already there, with an empty `items` list. For a new round, see the note below.
3. **Add one item per change.** Two or three short sentences are plenty. Each item needs all six languages. Write each one as a single short sentence a partner can check for themselves.
4. **Translations:** ask your translators for these sentences too, and paste their text in place of the `[TRANSLATE]` lines.

The example below uses the fake `[SAMPLE]` sentences from `DEMO-R1`. **Replace them with what really changed, and remove the `[SAMPLE]` tag.**

```json
"2026-R1": {
  "title": null,
  "items": [
    {
      "en": "[SAMPLE] Debit disputes now get a first reply within 48 hours.",
      "hi": "[SAMPLE] डेबिट डिस्प्यूट का पहला जवाब अब 48 घंटों में मिलता है।",
      "ta": "[TRANSLATE] [SAMPLE] Debit disputes now get a first reply within 48 hours.",
      "te": "[TRANSLATE] [SAMPLE] Debit disputes now get a first reply within 48 hours.",
      "kn": "[TRANSLATE] [SAMPLE] Debit disputes now get a first reply within 48 hours.",
      "ml": "[TRANSLATE] [SAMPLE] Debit disputes now get a first reply within 48 hours."
    },
    {
      "en": "[SAMPLE] The payout breakup is now shown line by line in the app.",
      "hi": "[SAMPLE] पेआउट का ब्रेकअप अब ऐप में हर लाइन के साथ दिखता है।",
      "ta": "[TRANSLATE] [SAMPLE] The payout breakup is now shown line by line in the app.",
      "te": "[TRANSLATE] [SAMPLE] The payout breakup is now shown line by line in the app.",
      "kn": "[TRANSLATE] [SAMPLE] The payout breakup is now shown line by line in the app.",
      "ml": "[TRANSLATE] [SAMPLE] The payout breakup is now shown line by line in the app."
    }
  ]
}
```

**For a round that is not in the file yet** (such as `2026-R2`), add a new block after the last one inside `rounds`, shaped like the one above. Put a comma after the closing `}` of the block before it.

**To preview it,** start the test server and open `localhost:8787/?round=2026-R1&mock=1` in a new Incognito window. (In test mode, the parts missing from this link are filled with demo values.) The test server reads this file again every time, so later edits show up without restarting it: just open a new Incognito window.

**For partners,** the bullets come from the control panel: see the note at the top of this recipe.

Run `check_config.py` afterwards. No `config_version` bump is needed: the card belongs to the round, not to the questionnaire.

### Recipe 13: Add a pre-recorded audio clip

Full instructions are in [web/audio/README.md](../web/audio/README.md). In short:

1. Record a native speaker reading the exact text from `strings.json`, and save it as an mp3 (mono, 32–48 kbps, a few seconds long).
2. Save it as `web/audio/<language code>/<string key>.mp3`, for example `web/audio/hi/q.nps.mp3`.
3. List it in `web/config/audio_clips.json`. Paths start inside `web/`:

   ```json
   "clips": {
     "q.nps": { "hi": "audio/hi/q.nps.mp3" }
   }
   ```

4. Run `python3 scripts/check_config.py`. It checks that every listed file exists. A clip may also be a full `https://` address (no spaces); the check can't see such a file, so play it once on a phone.
5. Open the survey in that language and tap the speaker button on that question.

**With the control panel (Phase 2):** the clip still has to be a file in `web/audio/` on GitHub (or any `https://` address), but partners only get it once it is listed in the Sheet's **Audio clips** tab (columns `key`, `lang`, `url`; for example `q.nps`, `hi`, `audio/hi/q.nps.mp3`) and you **Publish**. Close the control panel before typing in the tab, and open it again afterwards. The panel's checks refuse a clip whose `key` is not a text, or whose `url` is neither a path inside `web/` nor an `https://` address (the same rules as `check_config.py`).

### Recipe 14: Translate a language with a spreadsheet

> [!NOTE]
> **With the control panel (Phase 2), translate there instead:** **Texts & translations**, or the Sheet's **Texts** tab, then **Publish**. See the [control panel guide, Recipe 5](control-panel.md#recipe-5-translate-a-language). The steps below change only the backup copy in `web/i18n/strings.json`.

Translators work in a spreadsheet, so they never edit `strings.json` itself.

**1. Make the spreadsheet** (here: only texts still marked `[TRANSLATE]`, only Tamil):

```bash
python3 scripts/strings_csv.py export --out translations.csv --only-untranslated --lang ta
```

What it does: creates `translations.csv` in the project folder, with one row per text. Leave out `--only-untranslated` to include every text, and leave out `--lang ta` to include every language. Language codes: `hi`, `ta`, `te`, `kn`, `ml`.

**2. Send it to the translator.** Google Sheets is easiest (File > Import > Upload). If Hindi or Tamil letters look like strange symbols in Excel, use Google Sheets instead. Give the translator these rules:

- Only type in your language's column. Never change the column of codes (like `q.nps`).
- Replace the **whole** cell, including the `[TRANSLATE] ` tag.
- Keep `{s}` and `{n}` exactly as they are: the form puts numbers there.
- Keep it short and simple: it must fit on a small phone screen, and partners read it at work.
- Texts whose code starts with `dev.` only appear in test mode, so translate them last.

**3. Save it back as CSV.** Google Sheets: File > Download > Comma-separated values (.csv). Excel: File > Save As > **CSV UTF-8** (plain "CSV" can scramble Indian scripts). Put the file in the project folder and name it `translations.csv`.

**4. Preview the import.** This changes nothing:

```bash
python3 scripts/strings_csv.py import translations.csv --dry-run
```

**You should see** a summary of what would change. Read it.

**5. Import for real:**

```bash
python3 scripts/strings_csv.py import translations.csv
```

What it does: copies the translations into `web/i18n/strings.json`.

**6. Check and look.** Run `python3 scripts/check_config.py`. Then open the survey, pick the language and go through every screen. Ideally, a native speaker reads it on a real phone. The count in the yellow test-mode banner should go down.

**7. Delete `translations.csv`.** `strings.json` is the master copy. The spreadsheet was only temporary, and git never saves `.csv` files anyway.

The "What changed" sentences live in `whats_changed.json`, so send those to the translator as well ([Recipe 12](#recipe-12-update-the-what-changed-card-for-a-new-round)).

### Recipe 15: Bump config_version

Every answer is stamped with `config_version`, so the dashboard knows which version of the questionnaire each partner saw.

> [!NOTE]
> **With the control panel (Phase 2) you never bump it by hand.** Every **Publish** stamps the new version itself, as `p` + the version number + the date (for example `p7-2026-10-21`), and partners' answers carry that stamp. When you refresh the backup copy from the panel ([control panel guide, Recipe 12](control-panel.md#recipe-12-refresh-the-github-copy)), the downloaded `survey.json` carries the live version's stamp too, as long as your saved draft is exactly the live version. Otherwise it carries `"draft"`: publish first, then download the files again. Bump by hand only if you edit the files themselves.

**When:** whenever partners would see something different, such as questions, wording, areas, chips, thresholds, the order of screens or voice settings. A change to colours or the logo alone does not need it, but bumping never hurts.

**How:** in `web/config/survey.json`, find

```json
"config_version": "2026-10-19.1",
```

- Another change on the same day: raise the last number, to `"2026-10-19.2"`.
- A change on a new day: use that day's date and `.1`, for example `"2026-11-02.1"`.
- If it holds a stamp from the control panel, such as `"p7-2026-10-21"` or `"draft"`, use that day's date and `.1` as above. Never invent a `p…` stamp: those are made only by Publish.

Keep the quotes. Then run `check_config.py`.

---

## How to add a question type (for a developer)

> [!NOTE]
> This section needs code. Everything above changes the survey with settings only; a **new kind of question** (a new `type`, for example ten stars, a slider or a pick-several list) also needs a small JavaScript file. Hand it to a developer.

**First, check you need one.** The 13 kinds the form already knows cover most questions: `nps_0_10`, `rating_1_5` (faces), `yes_no`, `single_choice`, `multi_choice` (pick several, since 28 Oct 2026), `free_text` (voice or typing) and `info_card`, plus the built-in ones (language buttons, "What changed", area ratings, problem screens, support ratings, thank-you). A new wording, a new answer option or a new rule is a setting, not a new kind.

**What a kind is.** Every kind is described **once**, with `PP.types.register({...})`, and everything else reads that description: the phones, the flow checker (`python3 scripts/flow.py check`), `python3 scripts/check_config.py`, GitHub's deployment check and the control panel. The 12 built-in kinds are described in `web/js/flow.js` and drawn in `web/js/types.js`. A new kind is:

1. **one file**, `web/js/types/<code>.js`, holding its whole description, drawing included;
2. **one line** in `web/index.html`;
3. its **texts** in `web/i18n/strings.json`;
4. one **command** that refreshes the catalogue, `web/config/types.json` (made from the code, never edited by hand).

A complete, tested example is [`tests/flow/fixtures/types/stars_1_10.js`](../tests/flow/fixtures/types/stars_1_10.js): ten numbered stars. Copy it and change it.

### Step 1: write the file

Name the file after the kind's code: `web/js/types/stars_1_10.js` for the type `stars_1_10`. Start it with a plain-English header saying what it is for, like every file in the project. The description has these parts:

| Part | What it says | In the example |
|---|---|---|
| `type` | The code, written in the flow as `"type"`. Lowercase letters, digits and `_`, starting with a letter. **Permanent** once partners have answered a screen of this kind. | `"stars_1_10"` |
| `label`, `description` | Its name, and one plain sentence about it. The map, the checks' messages and the control panel use them. | `"Stars (1 to 10)"` |
| `fields` | The settings a screen of this kind may have, each `{ kind, required, default, values }`. Kinds: `text_key` (the name of a text in `strings.json`), `bool` (true or false, with its `default`), `choice` (one of `values`), `number`, `answer_key` (another screen's answer code), `options`, `rows`, `comment`. With `required: true` the checker refuses a screen without it. Every node may also have `id`, `type`, `store_as`, `show_if`, `repeat_for`, `next`, `required`, `text`, `help` and `label`. | `text` (required), `low_label`, `required` (default true) |
| `answer` | What a rule (`show_if`, a jump) can test about its answer, or `null` when there is nothing to answer. `kind`: `number` (with `min` and `max`), `choice` (with `values`, or `values_from: "options"`), or `text` (typed or spoken: only `answered` can test it). `what`: how messages name it. `required_by`: the true/false setting that makes an answer required (default `"required"`; `null` = always required). `na_by`: the setting that allows `"na"`. | `{ "kind": "number", "min": 1, "max": 10, "what": "the star rating" }` |
| `records` | What one screen adds to the data sent at the end: `answers` (the answer, under the screen's code), `ratings` (one ratings row with the answer as its rating: **only for an answer that is a number from 1 to 5**, because the ratings in the data are 1 to 5 and the dashboard averages them with the area and support ratings; `node scripts/flow.js types` refuses anything else), `free_text` (the typed text or voice note). These are also the limits the checker adds up (the server accepts 100, 64 and 64). | `{ "answers": 1 }`: a 1 to 10 answer is sent as an answer only, like the 0–10 question |
| `flags` | `auto`: one tap answers it, so the form moves on by itself. `end`: an ending, which sends the answers. (`first`, `once` and `early` belong to the language buttons and the "What changed" card.) | `{ "auto": true }` |
| `texts` | The text keys it shows when a screen sets none (templates such as `fn.{area}.name` are filled in). The checker then makes sure they exist in every language. | none |
| `row` | How the control panel knows it. The route table of **Paste a route** takes the kind's code (or its `label`) in its **kind** column, and **Copy the current route** writes the code. `label`, `description`, `needs_text`, `fields` (the settings a row of this kind can have, for example `options` for answers to pick), `required_default`, `repeatable` (`true`: it may be asked once for each area, or each area rated low; the table's **ask for** column and the route both read this flag), `icon` and `order` (its place in the list of kinds). Leave `row` out to keep the kind out of the panel (the table then refuses it as an unknown kind). | `"repeatable": true`, `"order": 65` puts it after the information card |
| `render(ctx)` | Draws one screen and returns `{ el, auto, optional, nextLabel, blockedHint, update }`; the header of `web/js/types.js` explains `ctx` and each of these. Build elements with `PP.h` and the shared pieces of `PP.ui` (`web/js/ui.js`: the question title with its read-aloud button, faces, the voice-or-typing box), so it looks like the rest of the form. Save an answer with `ctx.setAnswer(step.id, value, advance)`. | ten buttons |
| `isComplete`, `collect` | Optional. Your own rule for when **Next** is allowed, and for what is sent. Without them the **standard rules** apply: Next needs an answer unless the screen's `required` setting is false (a `text` answer needs typed text or a voice note), and the data follows `records`. | not needed |

Rules for the file:

- **Only a NEW kind.** The file may only add a kind with its own new code. A file that registers a code that already exists (a built-in kind, or one from another file), or changes an existing kind, is refused by `node scripts/flow.js types`, and so by `check_config.py` and GitHub: phones would otherwise behave differently from what every check says.
- **ES5 only**, because partners' old Android phones (Chrome 61) run it: no `let`, `const`, arrow functions, template strings, `?.` or `??`. A file such a phone can't read is skipped whole, and its screens would silently not work. `node scripts/flow.js es5` checks it, and `check_config.py` and GitHub run that check (on this Mac it needs `cd tests && npm install` once; without it the check is skipped with a warning).
- **Touch the page only inside `render`.** The command line and the checks read the file without a page; `node scripts/flow.js types` says so if a file breaks this rule.
- **Never put text into the page as HTML** (`innerHTML`): use `PP.h` with `text`, so nothing typed in the control panel can run as code.
- **Every word comes from the texts** (`PP.t('key')`), never from the file.
- **Keep it small.** Every phone downloads it; `check_config.py` adds it to the page weight (the limit is 300 KB).

### Step 2: add one line to web/index.html

Open `web/index.html` and add the file's line where the comment says, after `js/types.js` and before `js/app.js`:

```html
  <script defer src="js/types/stars_1_10.js"></script>
```

Keep `defer`: it makes the file run in order, after the form's own code.

### Step 3: add its texts

Add every text key the kind shows to `web/i18n/strings.json`, in all six languages: real English and everyday Hindi, and `"[TRANSLATE] "` followed by the English for Tamil, Telugu, Kannada and Malayalam ([Adding a new text](#adding-a-new-text)). Never machine-translate.

### Step 4: refresh the catalogue

In Terminal, in the project folder:

```bash
node scripts/flow.js types --write
```

What it does: runs the form's type files (without a page), checks each description, and writes the catalogue `web/config/types.json`. It also refreshes the GENERATED part of `apps-script/Model.gs`: the control panel's list of kinds (`PP_SCREEN_TYPES`) and the whole description of each added kind (`PP_ADDED_TYPES_`), from which Publish's checks and the panel learn it.

**You should see** `Wrote: web/config/types.json (13 kinds of screen: 12 built in, 1 added (stars_1_10)).` and `Wrote: apps-script/Model.gs (its list of kinds, PP_SCREEN_TYPES). Paste Model.gs into the Apps Script project.` If it lists mistakes instead, nothing was written: fix them and run it again. `node scripts/flow.js types --check` only checks; `python3 scripts/check_config.py` runs it too, and stops a GitHub deployment while `web/config/types.json` is out of date.

### Step 5: use it, and test it

- **In the form's own copy:** add a node of the new type to `flow` in `web/config/survey.json`, for example `{ "id": "stars", "type": "stars_1_10", "text": "q.stars", "next": "thanks" }`, and point the screen before it at it.
- **Check:** `python3 scripts/check_config.py` (all files, the catalogue, the page weight), then `python3 scripts/flow.py check`, then try it with `python3 scripts/flow.py simulate --set stars=8`.
- **See it:** `python3 scripts/mock_server.py`, then open a printed link and go through the survey on a phone-sized window.
- **Tests:** `node tests/flow/types_test.js` and `node tests/e2e/e2e.js`. A new kind should get its own test: copy what `types_test.js` does with `stars_1_10.js`.
- **ES5:** `node scripts/flow.js es5` should end with `All ES5`, counting one file more than before.
- **The control panel:** after the change is on GitHub, paste the new `apps-script/Model.gs` into the Apps Script project and deploy a new version ([setup guide, Update the code later](../apps-script/README.md#update-the-code-later-same-address)). `Flow.gs` does not change: it holds only the built-in kinds. The new kind then appears in **Questions > Add a question**, and Publish's checks, the rule and jump builders, the Map and **Try a path** all know it. With `"repeatable": true` it can be asked for each area.

> [!NOTE]
> The command line and the control panel know a new kind from its description (`web/config/types.json`, and `PP_ADDED_TYPES_` in Model.gs), so they use the **standard** rules for it. A kind with its own `isComplete` or `collect` behaves exactly like that only on phones; `simulate` and **Try a path** show the standard data for it.

**What still needs more than this.** Some changes are bigger than a new kind: new data columns in the Google Sheet, a new kind of rule test (for example "contains", for a pick-several question), facts from the DC list (region, state), or repeating a question over a list that is not in `survey.json`. Those need changes to the form's engine and to Apps Script.

---

## If check_config.py reports a problem

- Fix everything under **ERRORS** first. **WARNINGS** do not break the form, but read them: they often point at a typo.
- It names the file and, for a broken file, usually the line. In VS Code, press **Ctrl+G** and type the line number to jump there.
- The mistake is often on the line **before** the one mentioned. A missing comma at the end of one line is only noticed at the start of the next.
- Look for the [common mistakes](#json-in-two-minutes): missing or extra commas, curly quotes, a bracket left open.
- If it says a text is missing, add it to `strings.json` in all six languages ([Adding a new text](#adding-a-new-text)).
- A message ending in `[flow check …]` comes from the route checker: `python3 scripts/flow.py check` shows the same message with the screen it is about. `[flow check S1]` means a setting and its copy in `flow` disagree ([The settings the screens carry](#the-settings-the-screens-carry)).
- "The map of the questionnaire (docs/flow.md) is out of date" is a warning: run `python3 scripts/flow.py map --write` and commit the map with your change ([After every change to the flow](#after-every-change-to-the-flow)).
- If you are stuck, put your backup back (see [Before you start](#before-you-start)) and redo the change in smaller steps, running the check after each one.
