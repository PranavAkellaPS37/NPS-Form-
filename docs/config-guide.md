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

You do not need to read it all. Read [Before you start](#before-you-start) and [JSON in two minutes](#json-in-two-minutes) once. After that, jump straight to the [recipe](#recipes) you need.

## On this page

- [Before you start](#before-you-start)
- [Codes you must not change mid-round](#codes-you-must-not-change-mid-round)
- [JSON in two minutes](#json-in-two-minutes)
- [The four settings files](#the-four-settings-files)
- [survey.json: the main settings](#surveyjson-the-main-settings)
  - [The flow: the screens, in order](#flow-the-screens-in-order)
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
- [If check_config.py reports a problem](#if-check_configpy-reports-a-problem)

---

## Before you start

Four habits keep you safe. Run every command from the project folder: open Terminal and run `cd ~/NPSF` first.

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
> - **Screen ids** in `flow`, such as `nps`, `support_gate`, `one_fix`
>
> Every answer is saved under these codes, and the dashboard compares rounds using them. If you renamed `payments` to `payouts`, the dashboard would see one area disappear and a new one appear, and the trend line would break.
>
> **Reword freely instead.** What partners read lives in `web/i18n/strings.json`. Fixing a typo or improving a label there is always safe.
>
> Between rounds you may add new codes or retire old ones. But **never rename a code, and never reuse an old code for a new meaning.** The same goes for support item ids (`agent_behaviour`, …) and the option codes of single-choice questions.

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
| [`web/config/survey.json`](../web/config/survey.json) | The questionnaire: areas, problem chips, rules, order of screens, colours, voice. | Between rounds, when questions change. |
| [`web/i18n/strings.json`](../web/i18n/strings.json) | Every word on screen, in six languages. | For wording fixes and translations. |
| [`web/config/whats_changed.json`](../web/config/whats_changed.json) | The "What changed since your last feedback" card, one block per round. | Once per round. |
| [`web/config/audio_clips.json`](../web/config/audio_clips.json) | Optional recorded read-aloud clips. | Rarely. |

**Why words and settings are kept apart.** `survey.json` never contains the words partners read. It refers to each text by a short code called a **string key**, such as `q.nps`. The words themselves live in `strings.json`, in all six languages. So translators only ever touch `strings.json`, and changing a word can never break the survey's logic.

> [!NOTE]
> **One list, used everywhere.** The list of areas and problem chips in `survey.json` (the *taxonomy*) is used by the form today. The Phase 3 classifier (which sorts comments and voice notes into these codes) and the Phase 4 dashboard will read the same list. So you edit the taxonomy in one place only, and everything else follows.

---

## survey.json: the main settings

The sections below follow the order of the file.

### Notes for humans

Every setting whose name starts with `_` (such as `_help` or `_flow_help`) is a note. The form ignores notes. They are short reminders of what this guide explains.

### survey_id and config_version

| Setting | What it means | Today |
|---|---|---|
| `survey_id` | The survey's permanent name. Every answer is stamped with it. | `"valmo-partner-pulse"`. Never change it. |
| `config_version` | The version of the questionnaire. Every answer is stamped with it, so the dashboard knows which version each partner saw. Change it whenever partners will see something different ([Recipe 15](#recipe-15-bump-config_version)). | `"2026-10-19.1"` |

### branding: colours and logo

Colours are **hex codes**: a `#` followed by six characters (0–9 and A–F), such as `#4B2E83`. Your brand team can give you these. Today's colours are a **placeholder purple** until Valmo's brand colours arrive ([Recipe 10](#recipe-10-change-colours-the-logo-or-the-product-name)).

| Setting | What it colours | Today |
|---|---|---|
| `logo` | Optional logo image: a path inside `web/`, such as `"assets/logo.svg"`. Leave it empty (`""`) to show the product name as text instead. The product name is the text `brand.name` in `strings.json`. | `""` |
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
| `mode` | Where answers are sent. `"mock"` = the test server on this Mac. `"apps_script"` = Google Apps Script (set up in Phase 2). Leave it as `"mock"` in Phase 1. | `"mock"` |
| `mock_url` | The test server's address for receiving answers. Leave it. | `"/api"` |
| `apps_script_url` | Phase 2: the Apps Script web address ending in `/exec` goes here. | `""` |
| `request_timeout_seconds` | How long the form waits for the server to reply to one send. After that, it counts the attempt as failed and tries again. Bigger sends get more time automatically (next row). | `90` |
| `slow_upload_bytes_per_second` | The slowest upload speed the form plans for. A send with voice notes gets at least 30 seconds plus the time to upload it at this speed, so a slow but working connection is never cut off. 1000 = very weak 2G. | `1000` |
| `retry_delays_seconds` | The waits, in seconds, before each automatic retry when sending fails. After the last one, the partner still has a **Send now** button. The form also tries again when the internet comes back or the page is reopened. | `[2, 5, 10, 20, 40, 60, 60, 120, 120, 300]` (about 12 minutes in all) |

Adding `mock=1` to any link forces test mode, whatever `mode` says.

### links: test-mode defaults

Every real link carries three details: `dc` (the DC's id), `t` (the *token*, a secret code that proves the link is genuine) and `round` (the round id). It can also carry `lang` (the language; the language screen is then skipped) and `mock=1` (test mode). A real link looks like this (fake values):

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

Never change a language's code: it would break every link and every text that uses it. Adding a seventh language is a bigger job, because every text in `strings.json` and every "What changed" sentence needs it. Plan it as a project, not a quick edit.

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

### deep_dive: the "main problem" screens

| Setting | What it means | Today |
|---|---|---|
| `threshold` | An area rated **at or below** this number gets a "What is the main problem?" screen, with that area's problem chips and an optional voice note or text. `3` means ratings 1, 2 and 3 (Very bad, Bad, Okay). | `3` |
| `when` | `"after_all_ratings"` = the problem screens come after all six ratings. `"immediate"` = each comes straight after its low rating. | `"after_all_ratings"` |
| `require_chip` | `true` = the partner must pick a chip before **Next**. | `true` |
| `require_detail_if_other` | `true` = if the partner picks **Other**, a voice note or typed text is required. | `true` |

**Why "after all ratings" is recommended:** partners cannot learn half-way through that a low score means extra questions. If they could, some would give higher scores to finish faster.

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
| `read_aloud.enabled` | Shows the speaker button on each question. It plays a recorded clip if [`audio_clips.json`](#audio_clipsjson-recorded-read-aloud-clips) has one for that text and language. Otherwise it uses the phone's built-in voice. The button hides itself when neither is available. | `true` |
| `whats_changed.timeout_seconds` | How long the form waits for the backend to send the "What changed" content. If it takes longer, the form uses the copy in `whats_changed.json`. If that has nothing for the round, the screen is skipped. | `4` |
| `telemetry.enabled` | Sends small progress messages (opened, started, which screen the partner reached), so the dashboard can show where partners drop off. They never contain answers. | `true` |

### flow: the screens, in order

`flow` is the list of screens, in the order partners see them.

**Today's screens:**

| # | `id` | `type` | What the partner sees |
|---|---|---|---|
| 1 | `language` | `language_picker` | Choose your language. Skipped when the link already has `lang=`. |
| 2 | `whats_changed` | `whats_changed` | What changed since your last feedback. Skipped when the round has no items. |
| 3 | `nps` | `nps_0_10` | How likely are you to recommend Valmo to another DC owner? (0–10) |
| 4 | `fn_ratings` | `function_ratings` | One faces screen per area: six screens. |
| 5 | `fn_deep_dives` | `function_deep_dives` | What is the main problem? Once for each area rated at or below the threshold. |
| 6 | `support_gate` | `yes_no` | In the last 30 days, did you contact Valmo support? |
| 7 | `support` | `support_block` | Four support rows and an optional comment. Only after **Yes**. |
| 8 | `one_fix` | `free_text` | If Valmo could fix just one thing for you, what should it be? Optional. |
| 9 | `thanks` | `thank_you` | Sends the answers and says thank you. |

**The parts of a screen line:**

| Part | What it means |
|---|---|
| `id` | The screen's permanent code. Answers are saved under it. Use lowercase letters, digits and underscores (`_`), starting with a letter, and never rename it. |
| `type` | The kind of screen (see the next table). |
| `text` | The string key of the question, such as `"q.one_fix"`. |
| `required` | `true` = the partner must answer. `false` = adds a **Skip** button. Write it on every question screen you add. |
| `show_if` | Show this screen only when an earlier answer matches. See [show_if](#show_if-show-a-screen-only-to-some-partners). |
| `skip_if` | A built-in skip rule, used only by the first two screens: `"lang_in_url"` (skip the language screen when the link has `lang=`) and `"empty"` (skip "What changed" when there is nothing to show). Leave them as they are. |
| `low_label`, `high_label`, `scale_hint` | 0–10 screens only: the words under 0 and under 10, and the one-line hint. All three are string keys. |
| `options` | Single-choice screens only: the list of option codes. |
| `body` | Info cards only: optional longer text under the title (a string key). |

**Screen types.** The **built-in** types are already in the flow. Use each one only once.

| Built-in type | What it is |
|---|---|
| `language_picker` | The language buttons. |
| `whats_changed` | The "What changed" card. |
| `function_ratings` | One faces screen per area in `functions`. |
| `function_deep_dives` | The "main problem" screens. |
| `support_block` | The four support rows, from `support`. |
| `thank_you` | Sends the answers and says thank you. **Must be last.** |

The **generic** types can be added freely. Every screen costs partners time, though, so add only what you will act on.

| Generic type | What the partner sees | Parts it needs |
|---|---|---|
| `nps_0_10` | Buttons from 0 to 10. | `text`, `low_label`, `high_label`, `scale_hint`, `required` |
| `rating_1_5` | One row of five faces. | `text`, `required` |
| `yes_no` | Yes and No buttons. | `text`, `required` |
| `single_choice` | A list of options; pick one. | `text`, `options`, `required` |
| `free_text` | A voice note or a typed answer. | `text`, `required` |
| `info_card` | A message, with nothing to answer. | `text` (the title), optional `body` |

**Rules for the flow:**

- `thanks` stays **last**. The answers are sent from that screen.
- `fn_deep_dives` comes after `fn_ratings`.
- A screen with `show_if` must come **after** the screen it looks at.
- Every `id` is different.
- Every line ends with a comma, except the last one before the closing `]`.

### show_if: show a screen only to some partners

Add `show_if` to a screen in `flow` to show it only when an earlier answer matches. Otherwise the screen is skipped, and it sends no answer.

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
| The `id` of a screen you added | Its answer. | `yes_no`: `"yes"` or `"no"`. `rating_1_5`: 1 to 5. `single_choice`: an option code. `nps_0_10`: 0 to 10. |
| `"one_fix"`, `"support_comment"` or the `id` of a free-text screen you added | Whether the partner typed something or recorded a voice note there. | Use only with `answered`, e.g. `{ "answer": "one_fix", "answered": true }` |

Info cards have no answer to test. A screen can only test answers from screens that come **before** it in `flow`. So `fn_rating:…` tests go after `fn_ratings`, `fn_deep_dive:…` tests after `fn_deep_dives`, and `support:…` tests after `support`.

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

**When there is no answer.** If the earlier screen was skipped, or never shown, it has no answer. Then `equals`, `in`, `at_most` and `at_least` do **not** match, but `not_equals` **does** (no answer counts as "not that"). To target exactly the partners who skipped, use `"answered": false`.

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
- Here is a whole screen line with `show_if` (from [Recipe 7](#recipe-7-add-a-yesno-question-only-for-scores-of-6-or-below)):

  ```json
  { "id": "callback", "type": "yes_no", "text": "q.callback", "required": true, "show_if": { "answer": "nps", "at_most": 6 } },
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
| `dev.*` | Test-mode messages. Partners never see these. | `dev.mock_banner` |

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
- From Phase 2, the live form gets this content from Google Apps Script, so it can be changed without republishing the form. This file is then the backup.
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
> 4. Look at the result. Start the test server if it is not running (`python3 scripts/mock_server.py`). Open a **new Incognito window** in Chrome (Cmd+Shift+N), so old saved answers do not get in the way. Go to `localhost:8787` and go through the screens you changed.

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

**For all areas:** in `web/config/survey.json`, inside `deep_dive`, change

```json
"threshold": 3,
```

to

```json
"threshold": 2,
```

**For one area only:** add `"threshold"` next to that area's `id` in `functions`. The other areas keep the value in `deep_dive`. Example: for Payments, ask only after ratings of 1 or 2:

```json
{ "id": "payments", "threshold": 2, "issues": ["payout_delayed", "short_payment", "unclear_breakup", "invoice_gst", "incentive_missing"] },
```

Every saved rating records the threshold that applied, so the dashboard can still compare rounds. Even so, change it between rounds, not during one. Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 6: Ask about problems right after each low rating

Today the problem screens come after all six ratings. That is the recommended setting, because partners cannot learn half-way through that a low score means extra questions.

To ask straight after each low rating instead, in `web/config/survey.json`, inside `deep_dive`, change

```json
"when": "after_all_ratings",
```

to

```json
"when": "immediate",
```

Nothing else needs to change: leave the `fn_deep_dives` line in `flow` where it is. Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 7: Add a yes/no question only for scores of 6 or below

Example: ask partners who scored 0 to 6 whether they would like a call from the Valmo team. Only add this if someone will really make those calls.

**Step 1.** In `web/config/survey.json`, add the `callback` line to `flow`. Here it goes after `fn_deep_dives`, so partners have already told us their problems. Only the `callback` line is new:

```json
"flow": [
  { "id": "language",      "type": "language_picker", "skip_if": "lang_in_url" },
  { "id": "whats_changed", "type": "whats_changed",   "skip_if": "empty" },
  { "id": "nps",           "type": "nps_0_10",        "text": "q.nps", "low_label": "nps.low", "high_label": "nps.high", "scale_hint": "nps.scale_hint", "required": true },
  { "id": "fn_ratings",    "type": "function_ratings" },
  { "id": "fn_deep_dives", "type": "function_deep_dives" },
  { "id": "callback",      "type": "yes_no",          "text": "q.callback", "required": true, "show_if": { "answer": "nps", "at_most": 6 } },
  { "id": "support_gate",  "type": "yes_no",          "text": "q.support_gate", "required": true },
  { "id": "support",       "type": "support_block",   "text": "q.support_block", "show_if": { "answer": "support_gate", "equals": "yes" } },
  { "id": "one_fix",       "type": "free_text",       "text": "q.one_fix", "required": false },
  { "id": "thanks",        "type": "thank_you" }
],
```

The `show_if` part reads: "show this screen only if the answer to `nps` is at most 6".

**Step 2.** In `web/i18n/strings.json`, add the question:

```json
"q.callback": {"en": "Would you like someone from the Valmo team to call you?", "hi": "क्या आप चाहेंगे कि Valmo टीम से कोई आपको कॉल करे?", "ta": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "te": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "kn": "[TRANSLATE] Would you like someone from the Valmo team to call you?", "ml": "[TRANSLATE] Would you like someone from the Valmo team to call you?"},
```

The answer is saved under the screen's id: `"callback": "yes"` or `"callback": "no"`. Partners who score 7 or more never see the screen, so their answers have no `callback` value.

**To test it:** score 6 and you should see the question. Then, in a new Incognito window, score 7 and you should not.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

### Recipe 8: Add a single-choice question

Example: "Who is filling in this survey?" with three options. It is optional (`"required": false`), so partners can skip it.

**Step 1.** In `web/config/survey.json`, add this line to `flow`, just before the `one_fix` line:

```json
{ "id": "role", "type": "single_choice", "text": "q.role", "options": ["owner", "manager", "captain"], "required": false },
```

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

**To reorder,** move whole lines within `flow`. Example: ask "one thing to fix" before the support questions:

```json
"flow": [
  { "id": "language",      "type": "language_picker", "skip_if": "lang_in_url" },
  { "id": "whats_changed", "type": "whats_changed",   "skip_if": "empty" },
  { "id": "nps",           "type": "nps_0_10",        "text": "q.nps", "low_label": "nps.low", "high_label": "nps.high", "scale_hint": "nps.scale_hint", "required": true },
  { "id": "fn_ratings",    "type": "function_ratings" },
  { "id": "fn_deep_dives", "type": "function_deep_dives" },
  { "id": "one_fix",       "type": "free_text",       "text": "q.one_fix", "required": false },
  { "id": "support_gate",  "type": "yes_no",          "text": "q.support_gate", "required": true },
  { "id": "support",       "type": "support_block",   "text": "q.support_block", "show_if": { "answer": "support_gate", "equals": "yes" } },
  { "id": "thanks",        "type": "thank_you" }
],
```

**To remove** a screen, delete its whole line. Examples:

- **Drop "one thing to fix":** delete the `one_fix` line.
- **Drop the support questions:** delete **both** the `support_gate` and `support` lines. If you deleted only `support_gate`, the `support` screen's `show_if` would point at a screen that no longer exists.
- **Hide the "What changed" card for one round:** do not delete anything. Leave that round's `items` empty in `whats_changed.json`, and the screen is skipped by itself.

**Rules:**

- Never remove `thanks`, and keep it last: the answers are sent from that screen.
- A screen with `show_if` must stay after the screen it looks at (`support` after `support_gate`).
- `fn_deep_dives` stays after `fn_ratings`.
- Mind the commas: every line ends with a comma except the last one before `]`.
- A removed screen's answers stop arriving, so the dashboard will show a gap. If you bring the screen back later, use the **same** id.

Then [finish as usual](#finish-every-recipe-the-same-way), including a `config_version` bump.

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

Do this before each round's links go out.

1. **Decide the round id**, such as `2026-R1`. It must match `round=…` in the partner links **exactly**, capitals included.
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

**To preview it,** start the test server and open `localhost:8787/?round=2026-R1` in a new Incognito window. (In test mode, the parts missing from this link are filled with demo values.) The test server reads this file again every time, so later edits show up without restarting it: just open a new Incognito window.

**From Phase 2,** the live form gets this content from Google Apps Script first, so it will need updating there too (the Phase 2 guide will explain how). This file is then the backup.

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

4. Run `python3 scripts/check_config.py`. It checks that every listed file exists.
5. Open the survey in that language and tap the speaker button on that question.

### Recipe 14: Translate a language with a spreadsheet

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

**When:** whenever partners would see something different, such as questions, wording, areas, chips, thresholds, the order of screens or voice settings. A change to colours or the logo alone does not need it, but bumping never hurts.

**How:** in `web/config/survey.json`, find

```json
"config_version": "2026-10-19.1",
```

- Another change on the same day: raise the last number, to `"2026-10-19.2"`.
- A change on a new day: use that day's date and `.1`, for example `"2026-11-02.1"`.

Keep the quotes. Then run `check_config.py`.

---

## If check_config.py reports a problem

- Fix everything under **ERRORS** first. **WARNINGS** do not break the form, but read them: they often point at a typo.
- It names the file and, for a broken file, usually the line. In VS Code, press **Ctrl+G** and type the line number to jump there.
- The mistake is often on the line **before** the one mentioned. A missing comma at the end of one line is only noticed at the start of the next.
- Look for the [common mistakes](#json-in-two-minutes): missing or extra commas, curly quotes, a bracket left open.
- If it says a text is missing, add it to `strings.json` in all six languages ([Adding a new text](#adding-a-new-text)).
- If you are stuck, put your backup back (see [Before you start](#before-you-start)) and redo the change in smaller steps, running the check after each one.
