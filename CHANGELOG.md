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
| App version | This file. Sent as `app_version` with every answer. | `0.3.3` | The form's code and the tools. |
| Questionnaire version | Made by the control panel each time you **Publish** (`p` + version number + date). Sent as `config_version` with every answer. When the form has to fall back to its backup copy, it sends `config_version` from `web/config/survey.json` instead. | `p7-2026-10-21` (published), `2026-10-19.1` (backup copy, until it is refreshed from the control panel) | The questions, areas, chips, rules and texts. |

## [Unreleased]

Nothing yet. Next up is **Phase 3: pipeline**. A Python program that downloads the answers from each round's data spreadsheet, transcribes the voice notes, and sorts comments and voice notes into the same area and problem codes.

## [0.3.3] - 2026-10-30 - Fixes from the review of 0.3.2

A read-only review of 0.3.2 on 30 Oct found the problems below. None reached partners: the web app is still open only to Meesho colleagues, and 0.3.2's Apps Script files were never pasted. All are fixed and tested. **For partners:** the help videos now play, the phone's Back key closes a video or the language list, and answers sent again on a later visit are exactly the ones the partner finished. 0.3.2 and 0.3.3 are installed together (see **To upgrade**).

### Fixed

- **The help videos never played.** The form's page tells the browser never to send the address it is on to other websites (`<meta name="referrer" content="no-referrer">` in `web/index.html`), on purpose, so a link's `?dc=` and token never leave the page. YouTube now refuses to play an embedded video that arrives without that address (the "Referer"): it shows "Video player configuration error, Error 153" (reproduced in Chrome on 30 Oct). The video's frame now tells YouTube only the site's address (`https://pranavakellaps37.github.io/`), never the page's path or the link's token. With the fix the video loads (tested in Chrome on a local test page; on GitHub Pages the same rule applies, not yet tried on the live site). **[UNCONFIRMED]** inside the page Google serves in Meesho-only mode: whether a video plays there, and which address YouTube gets there, is untested.
- **The phone's Back key now closes an open sheet** (the help videos, or the language list). Before, Back moved the survey a screen back underneath the open sheet, or, on the first screen, left the form. An open sheet now adds its own step to the browser's history, so Back closes the sheet and the survey stays where it is. A sheet closed another way (its ✕, a tap outside it, a language picked) removes its step itself, so the next Back works as usual. The form counts those steps of its own, so they are never taken for Back presses. A page reloaded while a sheet was open (or an Android tab brought back) takes the sheet's step away again at once, so no Back press is lost.
- **Answers are sent exactly as the partner finished them.** If a send failed and the link was opened again later, the phone rebuilt the answers from whatever questionnaire that later visit loaded: a newer published version, or the form's own GitHub copy when Google was slow (over 6 seconds). That silently dropped answers to screens the other questionnaire doesn't have, and stamped its `config_version` on them. Now the first send keeps a copy of the finished answers on the phone: the answers, ratings and typed texts, and which voice notes go with them (the recordings' sound stays stored apart and is added back at send time). Every later send uses that copy and its `config_version`. The copy is deleted with everything else once the answers arrive. Any send keeps it, the last-moment one made while the page closes included, unless a voice note is still being saved (then a later send keeps it). One narrow case remains: the copy is made only when the partner finished during that visit, or when the questionnaire in use is the one they finished on. So answers finished with a form older than 0.3.3, or whose sends before the partner left were all made while a voice note was still being saved, and that are then sent on a later visit running another questionnaire, are still rebuilt from that other questionnaire.
- **The route table no longer reads "multi choice" as pick several.** Since 28 Oct it refused "multiple choice", "multiple choice question", "multi choice question" and "MCQ" as a kind, because they can mean either. Now "multi choice" (until now read as pick several), "Multi-choice", "multichoice", "MCQ question", "MCQs" and "multiple choices" get the same problem: "… can mean two things: write "pick one" when partners choose one answer, or "pick several" when they may tick more than one." Only the code `multi_choice` itself is read as pick several, also in backticks, asterisks or quotes (as AIs often write it) or with an invisible character copied along with it. A row whose kind can't be read (empty, ambiguous or unknown) gets only that problem: the rules of other rows that test its answer no longer add "… is not an answer of any row in this table".
- **"all partners" in "show only if" now works like "always" and "everyone" on the `language` and `what changed` rows**: every partner sees the language buttons (or the card). Before, it kept their usual skip, like an empty cell.
- **"Bring them back" dropped the form's 4 newer texts.** When the control panel offered to bring back unsaved changes kept before 28 Oct, bringing them back replaced the draft with a copy that lacked the 4 texts the panel had just added (`ui.pick_several`, `help.button`, `help.how_to_fill`, `help.why_it_helps`). The copy now gets them too, and one message says both: "Your changes are back. 4 new texts of the form were added … Press Save to keep them." A copy that differs from the draft only by those texts is no longer offered at all. It also fixes an older loss (since 28 Oct): 800 ms after the panel opened, the old recovery copy was replaced by the draft while the dialog was still asking, so closing the window at that point lost the unsaved changes. The copy is now kept until a button is pressed.
- **Save now gives the Screens tab its list of kinds again.** On a Sheet set up before 28 Oct, the drop-down list in the Screens tab's `type` column lacked pick several, so a pick-several row showed a red "invalid" corner until **Set up or repair** was run. Save now puts back the same list that Set up or repair gives that column, on every row of it, so an older Sheet needs no repair.
- **Ctrl+S (Cmd+S on a Mac) no longer saves while any window of the control panel is open**, such as "Bring back your unsaved changes?": answer or close it first. Before, the key saved behind the open window, which answered for you: under that question, the save threw away the very changes it was asking about.

### Changed

- **A rule on a pick-several answer reads the way it works.** It now says "areas includes load", "areas does not include load", "areas includes one of [load, app]", "areas has at least one tick" or "areas has no tick". Before, it said "areas == load", as if the answer were one code. This applies on the Map (its diamonds, jump labels and loop titles), in the Map's text list, in Try a path's "skipped" reasons, in `python3 scripts/flow.py simulate --explain` and in `docs/flow.md`. Every other rule keeps `==`, `!=`, `<=`, `>=`, `in` and `exists`.
- **The instruction for Claude/ChatGPT explains `always`** in "show only if":
  - on the `language` row, it shows the language buttons even when the link already names the language (with that language already picked);
  - on the `what changed` row, it shows the card even when the round has nothing new (partners then see only its title);
  - an empty cell keeps the usual skip.

  It also says never to write "multi choice" or "MCQ" as a kind.
- **The form reports `app_version` 0.3.3.** It still said 0.2.0: versions 0.3.0 to 0.3.2 never changed it.
- Page weight: 96% of the 300 KB budget, 286.9 KB (was 93%).

### For developers

- `web/js/app.js`: `showSheet` / `sheetClosed` (an open sheet's own history entry; `onPopState` closes an open sheet first); `ownSteps` / `stepBack` (the form's own `history.back()` steps, counted out in `onPopState`, so never taken for Back presses; a sheet opened while such a step is still on its way gets no entry); `bindEvents` steps off a sheet's entry after a reload; the help iframe's `referrerpolicy="strict-origin-when-cross-origin"`; `finish()` records `state.finished_version`; `buildPayload()` (no `keep` parameter) sends `state.sent_copy`, made by `finishedCopy()` when the partner finished during this visit (`finishedHere`) or `state.finished_version` is the questionnaire in use, and kept by any send, the page-closing beacon included, while `voice.isBusy()` is false; `APP_VERSION` 0.3.3. `web/js/voice.js`: `voice.isBusy()`.
- `web/js/flow-check.js`: `PP.flowCheck.sentence(cond)` is unchanged; `sentence(cond, survey)` and `sentenceFor(survey)` know each answer's kind. `apps-script/Panel.html`: `routeOutline` uses `sentenceFor` (with an older `Flow.gs` it keeps `==`); `offerRecovery` gives the recovery copy the newer texts (`addNewerTextsTo`) and stops the pending recovery timer; Ctrl+S / Cmd+S does nothing while a dialog is open.
- `web/js/flow-panel.js`: `ambiguousKind` (`AMBIGUOUS_KIND_RE`; `bareCode` reads the code `multi_choice` inside backticks, asterisks or quotes, or with an invisible character, as pick several, not ambiguous); a row whose kind can't be read adds no "is not an answer of any row" problems to the rows that test it; one list of "every partner" words (`ALWAYS_RE`), so "all partners" counts as `always` on the language and what-changed rows too; `aiInstruction` explains `always` on those rows.
- `apps-script/Model.gs`: every save gives every row of the Screens tab's `type` column `PP_listRule_(PP_screenTypeNames_())`, as Set up or repair does, with Code.gs's own helpers (skipped when Code.gs isn't loaded, as in Model.gs's own tests).
- `apps-script/Flow.gs` regenerated: 800,439 bytes, fingerprint `3d495cc75d82…` (on 28 Oct: 782,503 bytes, `d8b72ec2fa1d…`). [docs/flow-engine.md](docs/flow-engine.md): the rule words, the API, the kinds and the instruction.
- **Tests:**
  - flow 27; legacy_diff no differences; check 101; sim 35; types 11; panel_rows 17; route_table 39 (new: the ambiguous spellings refused and what the instruction says about `always`; `multi_choice` in backticks, quotes or with an invisible character, one problem for a kind that can't be read, and "all partners"); model 239;
  - shrink OK (it now loads Code.gs and also checks the type list, on every row of the tab);
  - fixes 81 + 40;
  - Google imitation: 46 scenarios, 45 pass + 1 known warning (S), 2,130 checks; new in B3 (Save re-applies the type list, on every row below the heading) and D2 (a list answer is stored as a list in `answers_json`);
  - planted mistakes 89 of 89 (new: `type-list-not-reapplied`, `type-list-only-written-rows`, `list-answer-refused`, `list-answer-flattened`);
  - panel bench 85 steps (new: "Bring them back" keeps the newer texts, and Ctrl+S while the panel asks saves nothing; the pick-several step also checks that the Map's text list says "includes"); narrow OK;
  - end to end 39 scenarios (new: Z12 the language screen shown "always"; Z13 answers sent as finished across questionnaires: the first visit leaves with its sends still failing, nothing stored, and the voice note recorded then is stored, sound included, on the later visit; Z14 ticks survive a reload, and an unticked area sends no answer; Z11 now also checks the referrer, the Back key by what is drawn and not only the history entry, a reload while a sheet is open, and the help button on the language and thank-you screens).

### To upgrade

0.3.2's Apps Script files were never pasted, so these steps install both. [apps-script/README.md](apps-script/README.md#this-release-pick-several-help-videos-and-the-fixes-of-30-oct-2026) has them, with what you should see.

1. Commit and push, then wait for the green tick: the phone fixes are in `web/` (`app.js`, `voice.js`), which reach phones only from GitHub.
2. Paste **Flow**, **Model**, **PanelServer** and **Panel** into the Apps Script project (**Code** is unchanged; **Set up or repair** is not needed), save, then **Deploy > Manage deployments > Edit > Version: New version**. The health check (`?action=health`) shows a `"flow_fingerprint"` starting `3d495cc75d82`. While the web app is Meesho-only, open it in a Chrome window signed in with the Meesho account: a signed-out Incognito window shows Google's sign-in page.
3. Open the panel: the "4 new texts" message; **Save**.
4. Paste the v2.1 table Claude gives you (it is not in the public project): **Check**, **Use this route**, **Save**, **Preview**, **Publish**. Before **Publish**, check whether the codes are locked (the setup guide's step 5 says how).
5. Help videos: **Settings > Help videos**, paste the links, **Save**, **Preview** (play one on a phone), then **Publish** (again, if v2.1 is already live).
6. The form's backup copy in GitHub waits. Phones use it when Google is slow (over 6 seconds), and it still has the old route (the language screen skipped when the link names the language, six area ratings, the support questions, no help videos). Before any refresh ([docs/control-panel.md, Recipe 12](docs/control-panel.md#recipe-12-refresh-the-github-copy)), Claude checks the page weight: with v2.1 (83 new texts, each in six languages) the copy comes to about 320 KB, about 107% of the 300 KB limit from the brief, so `scripts/check_config.py` reports an error and GitHub refuses to publish. Decided on 30 Oct: the phone's files will stop carrying the "[TRANSLATE] …" placeholder copies (partners see English for those texts either way), about 268 KB then; that change comes after this install ([docs/STATE.md](docs/STATE.md)), and until then the copy keeps the old route. It matters before the switch to "Anyone" (go-live); while the web app is Meesho-only, only colleagues open links, and the copy is in test mode anyway.

## [0.3.2] - 2026-10-28 - Pick several, help videos

From the first feedback on form v2 (Pranav, 28 Oct): partners may name more than one area behind their score, the language buttons come first, and partners can watch short help videos. **For partners:** a new kind of question and an optional ⓘ button; nothing changes until the questionnaire uses them.

### Added

- **A new kind of question, "pick several"** (`multi_choice`): a list of answers; the partner ticks one or more, then taps **Next**, with "You can tick more than one." under the question. A rule tests it answer by answer: `areas = load` is true when load is one of the answers ticked, so every ticked area gets its own follow-up (`!=`: not ticked; `in`: any of them; `answered`: at least one). The answer is sent as the list of codes ticked. Known everywhere: on phones, in the route table (`pick several`; "multi select", "pick all that apply", "checkboxes" too; "multiple choice" is refused because it can mean either), in the checks (a number test on it is refused), in Publish (its answers are locked like a pick one's once partners answered, and a live pick one can't become one), in Try a path (tick boxes) and in the instruction for Claude/ChatGPT.
- **Help videos** (Settings > Help videos): two YouTube links, "How to fill this form" and "How your answers help". When one is set, an ⓘ button at the top of every screen opens one button per video; a YouTube video plays inside the form only after the tap (nothing loads before), any other link opens in a new tab. Titles in Texts & translations (`help.button`, `help.how_to_fill`, `help.why_it_helps`).
- **The form's new texts reach older Sheets by themselves:** when the control panel opens a Sheet made before 28 Oct 2026, it adds the four new texts (English and Hindi, the others waiting for a translator) and says so; Save keeps them.

### Changed

- The route table (v2.1 for Pranav): the language buttons always first (`always` in their "show only if"), the area question as pick several (a new code, `score_areas`; the pick-one `nps_area` stays hidden in case partners answered it), the support questions hidden (a separate support survey later). Pasted in the panel; no code.
- Page weight: 93% of the 300 KB budget (was 89%).

### For developers

- `web/js/flow.js`: `evalCondition` reads a list answer as "is one of"; kind `multi_choice` (answer kind `choices`). `web/js/types.js`: its drawing. `web/js/flow-check.js`: `choices` (values, candidates, `answersAt` kind `choices`, the simulator's lists). `web/js/flow-panel.js`: the table kind. `scripts/flow.js`: ANSWER_KINDS gains `choices`. Model.gs: settings `help.*`, `PP_MDL_NEWER_FORM_TEXTS_`, `PP_MDL_HELP_VIDEOS_`; PanelServer.gs: `catalog.newer_texts`. The old engine comparison's variant `form-viii` now uses the unknown kind `checkbox_grid` (it used the name `multi_choice` as its example of an unknown kind).
- Tests: flow 27, check 100, types 11, route_table 37, model 239, panel bench 84, end to end 36 (Z10 pick several, Z11 help videos).

### To upgrade

Push, wait for the green tick, then paste **Flow**, **Model**, **PanelServer** and **Panel** again and make a **New version** (apps-script/README.md, "This release"). Open the panel once and **Save** (it adds the four new texts). Then paste the v2.1 route table, Check, Use this route, Save, Preview, Publish.

## [0.3.1] - 2026-10-28 - Paste a route

Questions and their route are no longer made one by one in the control panel. The **whole route is one table**, one row per screen: you copy it into Excel or Google Sheets (or let Claude or ChatGPT write it from your notes, an Excel sheet or a flowchart picture), change it, paste it back, check it and use it. Pranav's decision of 27 Oct ([docs/spec.md §4](docs/spec.md#4-decisions-log)): "paste the route is awesome … the current flow should be gone". The Map and Try a path stay. **For partners nothing changes:** the files phones load are untouched, and today's route copied as a table and pasted back gives exactly the same route (tested, in every format).

### Added

**In the control panel (Questions)**

- **"1. Get the route as a table"**, with three buttons:
  - **Copy the current route**: today's route as a table on the clipboard, ready to paste into Excel or Google Sheets. If the browser blocks copying, a **Copy by hand** box opens.
  - **Download the Excel template**: the same table as a file, `partner-pulse-route.csv`, that opens in Excel with the Hindi intact.
  - **Copy the instruction for Claude/ChatGPT**: what to paste into the AI before your notes, Excel sheet or flowchart picture. It explains every column, kind and rule word, lists today's areas and problem codes, support questions and languages, gives a short made-up example and today's route, and tells the AI to output only the table and to copy only the Hindi you give it, **never translating**.
- **"2. Paste a route"**: a large box for the table. It reads rows copied from Excel or Google Sheets, a CSV file's text, or the Markdown table an AI writes (with words or code fences around it). **Check** (or **Ctrl+Enter**) reads it and checks it with the same checker as Publish. Each problem shows its **row** (the header row is row 1, as Excel numbers it) and **column**, with a plain-English sentence, and nothing in the draft changes. A clean check says what would change (screens added, removed or changed, the order, texts new or reworded), or that it is the same route.
- **The pasted route on the Map and in Try a path** before you use it: both offer "The pasted route (not used yet)".
- **Use this route**: checks the table once more, then replaces the draft's questions and their texts. Areas, problems, support questions, settings, languages and rounds stay as they are. A message with **Undo** follows; then **Save**, **Preview** and **Publish** as usual.
- **The table** (format `pp-route-table/1`): columns `code`, `kind`, `question (English)`, `question (Hindi)`, `answers`, `answers (Hindi)`, `message (English)`, `message (Hindi)`, `required`, `show only if`, `then go to`, `jumps`, `ask for` and `show`, in any order, with forgiving names (and optional `left end`, `right end` and `hint` for a 0 to 10 question). Rules are short sentences such as `nps <= 6`, `support_gate = yes`, `language = hi` or `fn_rating:payments <= 2`, joined with `and` / `or`; a jump reads `if nps >= 9 go to support_gate`. The guide, [docs/control-panel.md](docs/control-panel.md#recipe-2-change-the-questions-paste-a-route), lists them all.
- **Codes partners answered can't leave the table.** Once a real round has opened, a table that drops such a question, or an answer of a pick-one question, is refused at Check ("hide, never delete": write `no` in `show`). `nps` and `support_gate` can never be removed or given another code.
- **New texts are never translated.** English and the Hindi you give go in; a real translation already there is kept; every other language gets the usual `[TRANSLATE]` placeholder.

**Safety checks added after the independent review (28 Oct)**

- **A placeholder never wipes words.** A cell holding only `NA`, `N/A`, `-`, `—`, `TBD`, `(to be translated)` or similar counts as empty (today's words stay), with a warning. Before, "NA" in a Hindi cell replaced every real Hindi text.
- **Every Hindi text a table adds or changes is flagged** (old → new: "keep them only if a person wrote them"), and so is new English on a built-in screen. Under "Compared with your draft", a fold-out lists every text that would change; it opens by itself when a translation would change.
- **A question partners answered keeps its kind** (for example voice/typing can't become faces): refused at Check and at Publish.
- **A route that runs on into another route** is now found by Check too, not only by Publish: it is one rule in the route code that both use.
- **Only the first `thank you` row is the main thank-you screen.** A later one with its own words is read as an `ending` (before, its words replaced the main thank-you's). `end` now means `ending`. An ending above the thank-you row, or with a `show only if`, is refused.
- **Answers:** a pick one needs at least 2 answers separated by `;` (commas and slashes don't separate them); a label with `;` goes in double quotes (and Copy the current route writes it that way); list marks and an AI's `` `code` `` or `**bold**` are removed.
- **Other pastes:** the Sheet's own Screens tab is refused ("use Copy the current route"), and so is a text that looks like a text key (`q.nps`); column names in Hindi script (`प्रश्न (हिंदी)`, `हिंदी`) and `Hindi translation` are read; an unknown column with words in it is named; a second table is joined when it has the same columns, else refused; a "Left out: …" line under an AI's table is repeated as a warning; a rule on a round that doesn't exist gets a warning ("Did you mean DEMO-R1?").
- **The instruction for Claude/ChatGPT** now also says: leave cells empty (never NA or -), exactly one thank-you row, end each route below it, `;` between answers, one table only, and list what was left out.
- **Pasting works even if the panel window can't run the route code:** Check, Use this route and the three table buttons then ask Google to run the same code (a few seconds slower); only the Map, Try a path and the badges are off.

**For developers**

- `web/js/flow-panel.js`: `PP.flowPanel.fromTable`, `toTable`, `templateCsv`, `aiInstruction`, and the rule language `parseRule` / `ruleText`, `parseJumps` / `jumpsText` ([docs/flow-engine.md §9.8](docs/flow-engine.md#98-the-route-as-a-table-paste-a-route-27-oct-2026)). `apps-script/Flow.gs` regenerated (about 770 KB, up from about 480 KB). Since 28 Oct: `fromTable` options `liveKinds` and `rounds`; the run-on rule is the `fromRows` note G5 (Model.gs's own copy removed); Model.gs `PP_mdlCheckLiveKinds_` and `PP_mdlLiveKinds_`; PanelServer.gs `panelRouteTable(request)` (admin-only server fallback) and `live_ids.kinds`.
- **Tests:** `tests/flow/route_table_test.js` (36 tests; fake fixtures in `tests/flow/fixtures/route-table/`); `panel_rows_test.js` 17 (G5 compared with a frozen copy of the old Model.gs rule on 3,000 generated routes); model 235; the panel bench rewritten around the table (82 steps, including a check that no control of the old question editor is left, and the server fallback with the real `PanelServer.gs`, through the new `tests/panel/real_server.js`); planted mistakes 85; a fake-server hook for a `Flow.gs` from before the table (`/control/flow_code {noTable: true}`).

### Changed

- **The Questions list is read only ("The route now").** Each card keeps its badges (rules, jumps, repeats, endings, hidden, problems), shows its place in the table ("row N in the table") and shows the checker's words under the card, not only in a tooltip. The badges now say "⚠ nothing leads here" and "⚠ The rule tests a later or hidden answer" (without the old "add a jump" / "edit it" advice, since the fix is made in the table).
- **Publish's "Go there"** on a question problem opens that question's card with a note naming the table row and column to change (for example its `show only if`, or its `then go to` or `jumps`), with **Close**.
- **Texts that go with a removed question.** When **Use this route** removes a question or an answer, the texts named after its code (`q.<code>`, `choice.<code>.…`, `end.<code>.…`) that nothing else uses go too; Undo brings them back. A built-in screen's standard texts always stay.
- When the route tools can't start in the panel window, pasting still works through Google (see above) and Questions says so, with **Try again**; only when Google can't run them either does it say that pasting a route, the Map and Try a path are switched off. With a `Flow.gs` older than this release, the paste card asks for the latest one. An empty draft points to **Settings > Import from GitHub**.
- The control panel's page is smaller: 358 KB (was 387 KB).
- `apps-script/PanelServer.gs`: the "Flow file missing" message no longer mentions jumps.
- **Publish's messages use the route table's words** ("then go to", "jumps", "show only if", "show"), no longer the removed editor's.
- The Support section's note now points to **Paste a route** and **Texts & translations** for the support question's wording.

### Removed

- From the control panel: **Add a question**; the question editor (its wording, answers, "required", the rule builder "Only show it if…", "After this question" with **Usually go to** and **Add a jump**, "Ask this question", and the settings cards of the built-in screens); **Add an ending**; and adding, hiding, moving, deleting and renaming questions. All of it is done in the table now. The problem-screen, support and rating settings stay in **Settings** (and **Support questions**); wording stays editable in **Texts & translations**.

### To upgrade

Phones are unaffected. In the Apps Script project `Flow`, `Model`, `PanelServer` and `Panel` changed (paste all four together); `Code` is unchanged, and **Set up or repair** is not needed.

1. Upload the project to GitHub and wait for the green tick (the Home banner compares the route code on GitHub with the panel's, and `web/js/flow-panel.js` changed).
2. Paste **Flow**, **Model**, **PanelServer** and **Panel** into the Apps Script project, save, then **Deploy > Manage deployments > Edit > Version: New version**. [apps-script/README.md](apps-script/README.md#this-release-paste-a-route-27-oct-2026) has the steps and what you should see.
3. Open the panel > **Questions**: "1. Get the route as a table" and "2. Paste a route" are there. Click **Copy the current route**, paste it straight back, and click **Check**: it should say "This is the same route as your draft: using it changes nothing."

The app version (`APP_VERSION` in `web/js/app.js`) still says `0.2.0`, as noted under 0.3.0: phones load none of the changed files.

**Known gaps (for a later change):**

- A question that is **hidden** in today's live version could still change its kind without a warning: the protected list of codes partners answered holds codes, not kinds. A shown question is protected.
- **[UNCONFIRMED] on real Google:** whether the panel window runs the route code (if not, pasting goes through Google instead; the Map and Try a path are then off), how long a check through Google takes, and whether the Apps Script editor takes the ~770 KB `Flow` file in one paste (the setup guide has the clasp route if not).

## [0.3.0] - 2026-10-26 - The route: jumps, loops and endings

The questionnaire's **route** (which screen comes after which) can now branch: a question can send partners to a later question or to an ending of its own, a question can be asked once for each area (or each area rated low), and there can be several thank-you screens. All of it is edited in the control panel, without JSON. Behind it there is one engine, one checker and one converter, shared by the phones, the control panel, the command line and GitHub's check, so they can never disagree. Pranav approved the design on 23 Oct ([docs/flow-graph-proposal.md](docs/flow-graph-proposal.md)); it was built, reviewed and fixed by 26 Oct. **For partners nothing changes yet:** today's questionnaire shows exactly the same screens and sends exactly the same data (proven on 73 questionnaires).

### Added

**In the control panel (Questions)**

- **After this question.** Each question has a **Usually go to** (the next question by default; any later question or an ending) and **Add a jump**: "If [answer] [is] [value] → go to [later question or ending]". The answers on offer are exactly the ones that can exist at that point, plus the partner's language and the round.
- **Ask this question once, for each area, or for each area rated low** (0 to 10, faces, yes/no, pick one, voice or typing, and information cards).
- **Several endings.** Questions and thank-you screens below the main thank-you screen form **Other routes and endings**, reached only by a jump. **Add an ending** makes one, with its own title and message (English first, the other languages marked `[TRANSLATE]`).
- **Badges** on each question: "↪ goes to …" (where it jumps), "Repeats for each area" (or "… rated low"), "Ends the survey", "⚠ this jump can never happen", "⚠ nothing leads here: add a jump to it".
- **Map:** the whole route as a picture. A text outline shows at once, with an "Open in mermaid.live" link; the drawing replaces it when it has loaded (within 20 seconds). It works on the draft or on the live version.
- **Try a path:** pick answers and see which screens a partner gets, why the others are skipped, and exactly what would be sent.
- **"Show this question only if"** can now also test the partner's language and the round.
- The settings of the problem screens, the support screen and the area ratings (for example "Where the problem screens go") also show inside those screens' editors.
- **Home** shows a red banner when the form on GitHub runs different route code from the control panel (upload the new form code).
- **Check for problems** now runs the same checker as GitHub and the command line, in the panel's words ("question N", "Usually go to"), and **Go there** opens the right card (the rule, or "After this question").

**Publishing**

- **The publish guard.** Publish refuses while the form on GitHub is older than the control panel: "upload the new form code first, wait for the green tick, then publish". If GitHub can't be reached, Publish goes on and says so.
- **"Please check…"** in the "Version N is live" message lists Publish's warnings (for example that the form on GitHub could not be checked). Set-up's closing message carries them too.
- **The GitHub copy** (**Download files for the GitHub copy**) now has **5 files**: the fifth, `flow.md`, goes to `docs/flow.md` (the map of the route).
- A new, fifth Apps Script file, **Flow** (`apps-script/Flow.gs`): the form's own route code, generated, never edited by hand. The health check shows which route code a deployment runs (`flow_engine`, `flow_fingerprint`).

**For developers**

- **The route format `pp-flow/1`** (a graph of screens, arrows, rules, loops and endings), the engine `web/js/flow.js` (on every phone), the checker `web/js/flow-check.js` (never on phones), and the panel's converter `web/js/flow-panel.js`. Old questionnaires (lists) are converted on the fly and behave exactly as before. Contract: [docs/flow-engine.md](docs/flow-engine.md).
- **The command line** `python3 scripts/flow.py` (or `node scripts/flow.js`): `check`, `map`, `simulate`, `paths`, `compare`, `screens` (the screen list for the Phase 4 dashboard), `migrate`, `build-gs`, `types` and `es5`. Shortcuts in a new root `package.json`: `npm run validate-flow`, `npm run flow-map`, `npm run simulate` (nothing to install).
- **`docs/flow.md`**: the questionnaire drawn as a map, with every screen and three example routes, generated from `survey.json`. `scripts/check_config.py` warns when it is out of date.
- **Question kinds as plug-ins.** Every kind of screen is described once (`PP.types` in `web/js/flow.js`); a new kind is one file, `web/js/types/<code>.js`, plus one line in `web/index.html`. `web/config/types.json` (format `pp-types/1`) is the catalogue without code, and Model.gs's list of kinds (`PP_SCREEN_TYPES`, `PP_ADDED_TYPES_`) is generated from it, so Publish and the panel know an added kind. Guide: [docs/config-guide.md](docs/config-guide.md), "How to add a question type", with a tested example.
- **The ES5 gate.** `node scripts/flow.js es5` checks that every script phones load is plain ES5 (old Android phones, Chrome 61). `scripts/check_config.py` runs it, and GitHub installs the parser (acorn 8.14.0) itself, so a file with newer syntax stops the deployment. On this Mac it needs `cd tests && npm install` once.
- **Tests:** the flow suites in `tests/flow/` (flow rules, old vs new engine, checker, command line, question kinds, panel rows), with frozen copies of the old code in `tests/flow/legacy/` and `tests/model/legacy/`; Google-imitation scenarios G11, G12 and D12; 83 planted mistakes; panel bench 71 steps; end to end 34 scenarios; questionnaire logic 227 tests. [tests/README.md](tests/README.md) has every command and result.

**Data**

- **The `pings` tab** of each round's answers sheet has a new last column, **`config_version`**: the questionnaire version the phone showed, so drop-off per screen can be read against the right screens. A round spreadsheet made before 26 Oct gets the column from its first ping after the update (inserted right after `events_json`; an admin's own column there moves one place right). Rows stored before stay empty, and a ping is never refused or lost for this. `schema_version` is still 1, and the messages are unchanged.

### Changed

- **`web/config/survey.json`'s `flow` is now the graph** (converted with `scripts/flow.js migrate --write`, after proving it shows the same screens and sends the same data). Every other byte stayed; the old `_flow_help` note is gone (the graph carries its own). The published versions are graphs too; old published versions stay lists and keep working.
- **Answers are tested only along the partner's current route.** An answer left behind by going Back and changing an earlier one stays on the phone but is never tested by a rule and never sent (the "stale answer" fix).
- **The codes lock covers every code ever published**, not only the live version's: once a real round has opened, every Publish remembers the codes of the version that was live and of the new one (Script Property `CODES_EVER_LIVE`). Hiding a question, publishing, then deleting it is no longer possible: deleting a code partners answered is an error and Publish waits. Deleting `nps` or `support_gate` is an error; hiding one is a warning.
- **New data shapes, same format:** a question asked for each area stores `<code>:<area>` (for example `callback:payments`), and with several endings the `events` end at the id of the ending the partner reached. See [docs/submission-format.md](docs/submission-format.md).
- **Code layout:** `web/js/screens.js` was split into `web/js/ui.js` (the shared drawing helpers) and `web/js/types.js` (how each built-in kind is drawn). Phones load 8 scripts; the page is 267.6 KB, 89% of the 300 KB budget (the engine `flow.js` grew from 13 KB to about 40 KB).
- The app version (`APP_VERSION` in `web/js/app.js`, sent as `app_version`) still says `0.2.0` in the code; it should say `0.3.0` when this version is uploaded.

### Fixed

Found by the reviews of 26 Oct, before any of this went live:

- **A hidden or deleted extra ending could send partners into another route** (for example promoters into the detractors' questions), with no error. A hidden ending now still ends the route, at the main thank-you screen, and the panel says so before hiding it. A deleted one that would let a route run into another is an error that names the question needing a "Usually go to".
- **The codes lock compared bare codes**, so a problem or answer partners had chosen could be deleted when another area or question had the same code. It now checks each code where it belongs (a problem in its own area, an answer in its own question).
- **Publish's warnings were never shown** (they only reached a log). They now appear in the "Version N is live" message and in set-up's notes.
- **A live answer of a pick-one question** could be removed, and the error then said "hide it", which answers can't be. Remove is now locked for live answers, and the message says to keep it (its label can still be reworded).
- **Publish during a Google Drive hiccup** could skip the codes lock for the version that was live. Once codes are locked, Publish now stops with "try again in a minute" while Drive can't read the live version.
- **A setting left on the problem-screens row** while the problem screens follow each low rating blocked Publish with a confusing error. It is now a warning, and the editor offers **Clear them**.
- **The GitHub copy left `docs/flow.md` out of date** (see Added: it is now the fifth file).
- **survey.json's own settings could silently stop working:** with a graph, phones follow the settings on its screens. A `deep_dive`, `rating` or `support` setting in survey.json that disagrees with the screens is now an error in the settings check (check S1), naming both values.
- **A broken published route could show an empty screen.** A route with no screens, a start that names no screen, or one that goes straight to a thank-you before anything is answered is now ignored: phones use the form's own copy.
- **Switching language with the header button** could take the screen on show off the route (a rule on the language) and send the partner back to the first question. The form now carries on where it would on a resumed visit, and Back keeps working.
- **Codes such as `constructor` or `toString`** were treated as already answered (every JavaScript object has them). Answers are now always looked up as the object's own.
- **A plug-in file that registered an existing kind** silently changed it on phones while every check stayed green. Such a file is now refused, and a kind that sends a ratings row must have a 1 to 5 answer (the guide's example sends its 1 to 10 answer only).
- **The command line ignored a stray file name** (`check p7.json` checked `survey.json` and said all good). It now refuses it and suggests `--published`. A `simulate --set` key no screen stores is pointed out.
- **Messages in the control panel** no longer garble a sentence when they name the question's own code, and use the panel's words.
- `apps-script/README.md` now lists five code files, and its `clasp` route copies `Flow.gs` too.

### To upgrade

1. Upload the new form code (`web/`) to GitHub and wait for the green tick: the publish guard refuses to publish until the form on GitHub understands the route.
2. Paste all five Apps Script files into the project (Code, Model, PanelServer, Panel and the new **Flow**), then **Deploy > Manage deployments > Edit > Version: New version**. [apps-script/README.md](apps-script/README.md) has the steps.
3. Run the live smoke test, then open SMOKE-R1's answers sheet: the `pings` tab's last column should be `config_version`.

## [0.2.0] - 2026-10-21 - Phase 2: control panel + live backend

The survey can now go live. A Google Sheet becomes the **control panel**, where colleagues change the whole questionnaire without touching code, run rounds, make links and publish. A Google Apps Script **web app** inside that Sheet hands the published questionnaire to the form, checks every link and saves the answers in Google Drive. The form goes online on GitHub Pages.

This version also contains the fixes from the independent review of 20 Oct and the checks of 21 Oct (see **Fixed**), all made before anything went live.

### Added

**Meesho-only mode (21 Oct, for demos while IT has not yet allowed "Anyone")**

- When Google offers only **Anyone within meesho.com** for the web app, the web app now shows the survey page itself to colleagues signed in with a Meesho account, and the page talks to the script through Google's own channel (`google.script.run`, `ppFormRequest`). Answers reach the Sheet as usual.
- **Check and save** recognises such an address (it asks again signed in as you) and records it as Meesho-only. Links and Preview then open the survey through the web app; the GitHub copy stays in test mode. Recording the address again once it is open to **Anyone** switches everything back.
- **Safety:** a page the web app serves could call any of the script's public functions, and it runs the form's scripts from GitHub. Every admin function (the panel's, set-up, sharing the folder, the menu items) now runs only from inside the Sheet itself (its menu or the control panel), so such a page can't use them, whoever opens it.
- After a switch to or from Meesho-only, **Make links** remakes every link that points at the old address, even with "Only DCs without a link yet"; and a Meesho-only web app that still runs older code is refused with the fix (deploy a new version).

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
