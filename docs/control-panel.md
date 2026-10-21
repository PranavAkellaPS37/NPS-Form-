<!--
===============================================================================
docs/control-panel.md: user guide for the Partner Pulse control panel
===============================================================================
What this file is for
  How to use the control panel inside the Google Sheet "Valmo Partner Pulse -
  Control": change the questionnaire, translate, run rounds, make links,
  publish, and undo. Each task is a recipe with exact clicks.

Who it is for
  Valmo ops colleagues with Editor access to the Sheet. No coding needed.

What else to read
  - apps-script/README.md: the one-time setup (done by the admin).
  - README.md, section "Phase 2: go live": the order of the go-live.
  - docs/control-panel-design.md: the technical design (for developers).

What it reads and writes
  Nothing. It is documentation only.

Safety
  Never paste real partner data, real links or the link secret into this
  file. Examples use fake ids such as DC-DEMO-001 and SMOKE-R1.
===============================================================================
-->

# The control panel: user guide

The **control panel** is where you run Valmo Partner Pulse: the questions, the texts in six languages, the rounds, the partners' links, and publishing. It lives inside a Google Sheet, so there is nothing to install.

You never need to edit code or files. If the panel was not set up yet, the admin follows [apps-script/README.md](../apps-script/README.md) first.

## On this page

1. [What the control panel is](#what-the-control-panel-is)
2. [Who can use it](#who-can-use-it)
3. [The golden rules](#the-golden-rules)
4. [A tour of the panel](#a-tour-of-the-panel)
5. [The everyday loop: Save, Preview, Publish](#the-everyday-loop-save-preview-publish)
6. [Recipes](#recipes)
7. [Meesho-only mode (until IT allows "Anyone")](#meesho-only-mode-until-it-allows-anyone)
8. [What the errors and warnings mean](#what-the-errors-and-warnings-mean)
9. [If something goes wrong](#if-something-goes-wrong)
10. [Words used in this guide](#words-used-in-this-guide)

---

## What the control panel is

Open the Google Sheet **Valmo Partner Pulse - Control** and click **Partner Pulse > Open control panel**. A large window opens over the Sheet: that is the control panel. Everything you do there is stored in the Sheet's tabs.

**Draft and live.** There are always two versions of the questionnaire:

| | The **draft** | The **live** version |
|---|---|---|
| What it is | What you are working on. It is stored in the Sheet's purple tabs. | What partners see. A saved copy of the draft, made when you click **Publish**. |
| Who sees it | Only admins, through **Preview** links. | Every partner who opens their link. |
| How it changes | Every **Save**. | Only **Publish** (or **Restore** followed by Publish). |

The journey of every change:

1. You change something in the panel. The top bar says **Unsaved changes**.
2. **Save**: the change is stored in the draft. Partners still see the old version.
3. **Preview**: you try the draft form yourself. Nothing is saved from a preview.
4. **Publish**: the draft becomes the next live version (version 1, 2, 3 …). Partners get it the next time they open their link. A partner who already has the survey open finishes with the version they loaded.

Every published version is kept, so you can always go back (see [Undo a bad publish](#recipe-11-undo-a-bad-publish-restore)).

**One exception: rounds.** Opening or closing a round takes effect straight away, without Publish, because it is a switch, not content.

**When Google is slow.** The form also keeps a copy of the questionnaire on GitHub, and uses it if Google does not answer within 6 seconds (the setting **Settings > What changed > Wait for the live questionnaire (seconds)**, 4 by default, plus 2). Keep that copy up to date after big changes: see [Refresh the GitHub copy](#recipe-12-refresh-the-github-copy).

---

## Who can use it

Access to the panel is access to the Sheet. Set it with the Sheet's **Share** button.

| Access to the Sheet | What the person can do |
|---|---|
| **Editor** | Everything: use the control panel, publish, open and close rounds, generate links. They also need the Drive folder: without it, publishing, opening a round and the numbers stop with an error, and the panel soon stops opening for them, at least some of the time (see [Adding a colleague](#adding-a-colleague-a-co-admin)). Editors can also open the Apps Script code and see the **link secret**. **Editor = admin.** Give it only to trusted Valmo staff. |
| **Viewer** (or Commenter) | Can look at the tabs, but gets no **Partner Pulse** menu, so cannot use the panel. Can still read the **DCs** and **Links** tabs, which hold partner data and every partner's link. |
| Nobody else | Never share the Sheet with **Anyone with the link**. |

### Adding a colleague (a co-admin)

Two steps, always both:

1. **Share the Sheet.** Click **Share** (top right of the Sheet) and add their email address as **Editor**.
2. **Share the Drive folder.** In the Sheet, click **Partner Pulse > Share the Drive folder with all editors**. A window **Drive folder shared** lists everyone who can now use the folder.

**Why the second step.** The panel works with the permissions of the person using it. The published versions, every round's data spreadsheet and the voice notes are kept in the Google Drive folder **Valmo Partner Pulse**, which belongs to the admin who first ran set-up. Sharing the Sheet does not share that folder. Without it:

- **Publish**, restoring an older version, opening a round for the first time and the round numbers on **Home** stop with an error like this:

  > Google Drive would not open the Drive folder "Valmo Partner Pulse" for you (new.colleague@meesho.com). Partner Pulse keeps its files in the Drive folder "Valmo Partner Pulse". Ask owner.name@meesho.com to open this Sheet and click Partner Pulse > Share the Drive folder with all editors, then try again. (Google said: …)

- **The panel soon stops opening for them, at least some of the time.** Google keeps a short-term copy of the live version (for 6 hours at most), and the panel can use it without the folder. Whenever that copy has expired (it is refilled whenever someone with the folder opens the panel or publishes, or a partner opens a link), the colleague sees **The control panel could not open** with the same message. **Check for problems** (once a real round has opened) and **Download files for the GitHub copy** stop the same way.

Instead of "the Drive folder", the message may name "the data spreadsheet of round 2026-R1", "the saved copy of version 3" or "the published questionnaire (version 3)". The first email address is the colleague's own; the second is the admin who first ran set-up.

**Files a colleague creates** in the folder (for example a round's answers sheet when they open a round, or a published version) are handed over to the admin who ran set-up, so everything stays in one Drive. The colleague keeps edit access. (Google allows this only within the company's accounts; if it refuses, the file stays where it is, inside the shared folder.)

**When.** Every time you add someone to the Sheet. The menu item shares the folder with **all** current editors at once, so it is safe to run again.

**Who.** Someone who can already edit the folder, normally the admin who ran set-up. For anyone else it stops with **Could not share the Drive folder**.

**Removing a colleague.** The menu item only adds people. To remove someone, remove them from the Sheet (**Share**) **and** from the folder: in Google Drive, right-click **Valmo Partner Pulse** > **Share**, and remove them there too.

The script never makes a second "Valmo Partner Pulse" folder in a colleague's own Drive: that would split the answers between two places. That is why it stops with the message above instead.

**The first time** a colleague uses the **Partner Pulse** menu, Google asks them to allow the same permissions as the admin did. They should allow all of them, with **Select all** (see [step 6 of the setup guide](../apps-script/README.md#step-6-run-set-up-or-repair-and-allow-the-permissions)).

### Two people at once

If a colleague saved changes after you opened the panel, your **Save** stops with a window **Someone else saved changes**, which names who saved and when. You can then choose:

- **Reload the latest version** (the highlighted, safe choice): you get their changes, and **your unsaved changes are lost**;
- **Keep mine and overwrite**: your version is saved, and **their changes are lost**. A message then confirms whose changes you replaced ("Saved. You replaced the changes … saved at …");
- **Cancel**: nothing happens yet (your changes stay in the window, unsaved).

Two changes never run at the same moment. If a colleague is saving, publishing, making links or opening a round right then, yours waits up to half a minute, and if it still cannot start it says "Someone else is changing Partner Pulse right now (saving, publishing, making links or opening a round). Nothing was changed. Please try again in a minute."

It is simplest to agree that one person edits at a time.

---

## The golden rules

1. **Partners only see what you Publish.** Save keeps your work in the draft; it does not change anything for partners.
2. **Always Preview before you Publish.** Go through the screens you changed, on your phone if you can.
3. **Never rename or delete codes during a round.** Every question, area, problem chip, option and support item has a **code** (such as `payments` or `payout_delayed`). Answers are saved under these codes, and the dashboard compares rounds by them. To change what partners read, change the **wording** instead: that is always safe. To stop asking something, **Hide** it instead of deleting it. The panel helps: once the first real round has opened, anything live shows a **lock icon** 🔒 next to its code, has no **Change code** button, and cannot be deleted, only hidden. Before that, nothing is locked, and a note at the top of **Questions** and **Areas & problems** says so: that is the time to replace the placeholder questionnaire. Test rounds, whose name starts with SMOKE, DEMO or TEST, never lock anything. Two questions are protected from the start: the 0–10 question (code `nps`) and "Did you contact Valmo support?" (code `support_gate`) fill their own columns in every round's answers sheet, so they can be hidden but never deleted or given a new code.
4. **Never put partner data or secrets in texts or settings.** The published questionnaire is public: anyone with the web app address can read it.
5. **Open and close rounds only with the panel's buttons.** Typing a status into the **Rounds** tab does not change anything for partners.
6. **Close the panel before you type in the tabs directly**, and open it again afterwards. The panel works on its own copy while it is open, and its **Save** would overwrite what you typed.

---

## A tour of the panel

**The top bar** (always visible):

- the draft status: **All changes saved**, **Unsaved changes** or **Saving…**. Next to **Unsaved changes**, **Discard** throws your unsaved changes away and goes back to the last saved draft;
- the **Live** badge, for example "Live: version 7, published 21 Oct by asha@…", or **Nothing published yet**;
- the buttons **Save**, **Preview** and **Publish**. **Ctrl+S** (Cmd+S on a Mac) also saves.

A banner appears when the draft is different from the live version ("Partners still see version 7. Your saved draft has changes they don't see yet."), with a **Check and publish** button. On the left, **Publish** shows a red number when the last check found problems, and an orange dot when partners don't see your changes yet.

**If the window closes before you save** (or the browser crashes), your unsaved changes stay on this computer. The next time you open the panel it asks **Bring back your unsaved changes?**: click **Bring them back**, then **Save**, or **Throw them away**. If a colleague saved the draft in the meantime, they are dropped instead, with a short message.

**After a delete**, a short message offers **Undo** for a few seconds.

**The sections** (left-hand list):

| Section | What you do there |
|---|---|
| **Home** | The live version, whether the draft differs from it, "What to do next" hints, every round with its status and numbers, and quick links (the Sheet, the Drive folder, the form, and the web app address). Until someone records the web app address, its box is empty: the admin pastes it there and clicks **Check and save** ([setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). |
| **Questions** | The screens of the survey, in order: change wording, add questions, set "Only show it if…" rules, hide, reorder. |
| **Areas & problems** | The areas partners rate (such as Payments / Payouts) and each area's problem chips. |
| **Support questions** | The support items rated after "Did you contact Valmo support?", and the optional comment. |
| **Texts & translations** | Every text in every language, translation progress, and notes for translators. |
| **Look & feel** | The product name, logo, colours and the five faces, with a preview sketch that changes as you type. |
| **Rounds** | Create rounds, open and close them, and write each round's "What changed" bullets. |
| **Links** | Make partners' links for a round, download them, and find one DC's link. |
| **Publish** | Check for problems, publish, see the history of versions, restore an old one, and download the files for the GitHub copy. |
| **Settings** | Every other setting (voice notes, read aloud, sending, …); the form address and the web app address (group **Form address**); the language list; **Import from GitHub**; and **Preview links**, where **Make new preview links…** stops every older preview link (for a preview link that was shared too widely). |

**The Partner Pulse menu** (in the Sheet's menu bar):

| Menu item | What it does |
|---|---|
| Open control panel | Opens the panel at Home. |
| Preview the draft form | Shows a small window with **Open the preview**, a preview link of the saved draft (for the first open round, otherwise the first round not open yet). To preview another round, use **Preview** in the panel. |
| Publish… | Opens the panel at Publish. |
| Generate links… | Opens the panel at Links. |
| Share the Drive folder with all editors | Gives everyone who can edit the Sheet access to the Drive folder **Valmo Partner Pulse**. Run it after adding a colleague (see [Adding a colleague](#adding-a-colleague-a-co-admin)). |
| Set up or repair | Re-creates anything missing (a deleted tab, a missing folder or setting). Safe to run: it never deletes your content and never changes the link secret. |
| Help | Links to these guides. |

**Read-aloud clips** (recordings the speaker button plays instead of the phone's voice) have no section in the panel yet. They are listed in the Sheet's **Audio clips** tab, the one questionnaire tab you edit directly (close the panel first: golden rule 6), and reach partners when you publish. [web/audio/README.md](../web/audio/README.md) explains how to record and list them.

The panel window shrinks itself to fit a small laptop screen, and each section scrolls inside it. If it is still cut off, zoom out in Chrome (**Cmd+minus**).

---

## The everyday loop: Save, Preview, Publish

Use this loop for every change. The recipes below refer to it.

1. **Change** what you need. The top bar says **Unsaved changes**.
2. Click **Save**. **You should see:** **All changes saved**, and a short message "Saved. Partners don't see it until you publish."
3. Click **Preview**. The panel saves first, then opens a window **Preview the draft**. Pick the **Round** (the list starts on the newest round, and the line under it says how many of its "What changed" bullets the preview shows, or that the screen is skipped) and click **Open the preview ↗**. The draft form opens in a new tab, with a blue strip **PREVIEW: answers are not saved**. Go through the screens you changed. At the end you see **Preview finished. Nothing was saved.** and a **Start again** button.
   - **To preview on your phone**, click **Copy** next to the link and send it to yourself. Copy the **whole** link: its end (`&pk=…`) is a private preview key. Without it the form shows its stored copy instead of your draft, with the notice "Could not load the draft: showing the form's stored copy. Open the preview link from the control panel again." The same notice appears if Google takes more than 20 seconds to send the draft: open the link again.
   - **Keep preview links among colleagues** (the window says so too: "Share only with colleagues…"). Anyone with one can read your unpublished draft. It cannot be used to answer as a partner, and it contains no partner data. If a preview link was shared too widely, **Settings > Preview links > Make new preview links…** makes every older preview link stop working (partners' links keep working).
   - Preview works for any round, even one that is not open yet. It never saves or sends anything. With no saved round at all, a window **Create a round first** opens instead: create one in **Rounds** (it can stay "not open yet"), save, then preview.
   - Preview shows the draft only once the form is connected to the live backend ([setup guide, Part D](../apps-script/README.md#part-d-connect-the-form)). Before that, it shows the form's stored copy with the notice above.
4. Click **Publish**. The panel saves, opens the **Publish** section and checks the draft:
   - **Errors** block publishing: "Not published: fix the … problems marked in red first." Each one has a **Go there** button that takes you to the right place. Fix them and click **Publish** again.
   - **Warnings** never block. Read them; they are explained [below](#what-the-errors-and-warnings-mean).
5. With no errors, a window **Publish version 8?** (the next number) asks for **A short note for the history: what changed?** Type a few words (for example "Reworded the payments question") and click **Publish now**. **You should see** a window **Version 8 is live**, and the Live badge with the new number.
   - If your saved draft is exactly the live version, the window says "Your draft is the same as version 7, which partners already see. Publish anyway?" and the button reads **Publish anyway**. There is nothing new for partners then: usually you can click **Cancel**.

Partners get the new version the next time they open their link. A partner who has the survey open at that moment finishes with the version already on their phone. A partner who started earlier and opens the link again gets the new version, keeps their answers, and carries on at the screen where they stopped (if the new version no longer has that screen, at the first screen they haven't answered). A question you added before that screen is skipped for them.

---

## Recipes

Each recipe ends with the [everyday loop](#the-everyday-loop-save-preview-publish), unless it says otherwise.

- [Recipe 1: Change a question's wording](#recipe-1-change-a-questions-wording)
- [Recipe 2: Add a question only for low scorers (0–6)](#recipe-2-add-a-question-only-for-low-scorers-06)
- [Recipe 3: Add or hide a problem chip](#recipe-3-add-or-hide-a-problem-chip)
- [Recipe 4: Add an area](#recipe-4-add-an-area)
- [Recipe 5: Translate a language](#recipe-5-translate-a-language)
- [Recipe 6: Change colours, logo or product name](#recipe-6-change-colours-logo-or-product-name)
- [Recipe 7: Start a new round with its "What changed" bullets](#recipe-7-start-a-new-round-with-its-what-changed-bullets)
- [Recipe 8: Open or close a round](#recipe-8-open-or-close-a-round)
- [Recipe 9: Generate and download links](#recipe-9-generate-and-download-links)
- [Recipe 10: Check how many partners answered](#recipe-10-check-how-many-partners-answered)
- [Recipe 11: Undo a bad publish (Restore)](#recipe-11-undo-a-bad-publish-restore)
- [Recipe 12: Refresh the GitHub copy](#recipe-12-refresh-the-github-copy)

### Recipe 1: Change a question's wording

Always safe, even during a round: the question's code stays the same.

1. **Questions**. Each card shows the question in English with the Hindi underneath.
2. On the question's card, click **Edit**.
3. Under **Question**, change the English text. If you can, change the Hindi too, and any other language. Each language has its own box, labelled with the language's name. A language that is not translated yet has an empty box marked **To translate**: partners see the English there.
4. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

**What happens to the other languages when you save:**

- a language that was never translated (still `[TRANSLATE]`) follows the new English automatically;
- a language that has a real translation keeps it, and gets a note for the translator: "English changed on (date): please re-check the translations." The note shows in **Texts & translations**. Once the translation is checked, click **Checked** next to the note to clear it.

To reword an area name, a problem chip or a support item, use **Areas & problems** or **Support questions**, or find the text in **Texts & translations**.

### Recipe 2: Add a question only for low scorers (0–6)

Partners who score 0 to 6 on "How likely are you to recommend…" are *detractors*. This recipe asks them one extra question, for example "What is the main reason for your score?".

Best done **between rounds**, so that every partner in a round sees the same questions.

1. **Questions > Add a question**. A window **Add a question** opens.
2. Under **1. What kind of question?**, pick a kind. Each one has a plain description. For example:
   - **Voice note or typing**: the partner records a voice note or types an answer;
   - **Pick one answer**: the partner taps one of your answers;
   - **Yes / No question**: two big buttons.

   (The others are **0 to 10 question**, **Faces question (1 to 5)** and **Information card**.)
3. Under **2. The question**, **Write the question in English**. Below it, the panel shows the **code** it will use ("Code in the data: …").
4. In **Put it after**, choose the 0–10 question (**3. How likely are you to recommend Valmo to another DC owner?**). A rule can only look at answers given **earlier** in the survey. (You can move a question later with the **↑** and **↓** arrows on its card.)
5. Click **Add question**. The question's editor opens.
6. Under **Question**, add the Hindi and any other language you can. Languages you leave empty show the English until they are translated.
7. Under **Answers**, **Partners must answer**: **Yes, required**, or **No: a Skip button is shown**. For a voice note or typing question, No is kinder (it is also the standard for that kind).
8. For a **Pick one answer** question: under **Answers partners can pick**, click **Add an answer** for each answer (type it in English, click **Add answer**), add the other languages in its boxes, and order them with **↑** and **↓**. Add at least two.
9. Under **When to show this question**, choose **Only show it if…**. The panel suggests a condition; make it read:
   - the earlier answer: **How likely are you to recommend Valmo to…**;
   - the test: **is at most**;
   - the value: **6**.

   The builder shows the rule as a sentence: "Partners see this question only if the answer to "How likely are you to recommend Valmo to…" is 6 or lower." Check that it reads the way you mean.
10. Save and **Preview twice**: once scoring 5 (the question must appear) and once scoring 9 (it must not). Use **Start again** at the end of the preview between the two tries.
11. Publish.

**Good to know:**

- The panel makes the new question's **code** from its English words, and shows it on the card. You can change it with **Change code** in the editor until it locks, which happens once the question is published **and** the first real round has opened. Then the code gets a lock icon and never changes, even if you reword the question.
- **Add another condition** adds a second test. With two or more, choose **Show it when**: **all of these are true** (every condition must match) or **any of these is true** (one is enough). The **✕** next to a condition removes it.
- **Always show it** shows the question to everyone again. (The panel remembers the rule, so switching back to **Only show it if…** brings it back.)
- If a rule tests a question that is later in the list, or hidden, the card shows a red badge "⚠ The rule tests a later or hidden answer: edit it", and **Check for problems** reports an error.
- The answers appear in the round's data spreadsheet: spoken and typed answers in the **free_text** tab, the others in the **responses** tab.

### Recipe 3: Add or hide a problem chip

Problem chips are the choices on "What is the main problem?" for an area rated low.

**To add a chip:**

1. **Areas & problems**. Find the area and click **Edit** on its card. The area opens.
2. Under **Problems partners can pick**, click **Add a problem**.
3. Type **The problem in English**, short and concrete, and click **Add problem**.
4. Add the Hindi and the other languages you can, in the boxes under the new problem (or later in **Texts & translations**).
5. Reorder it with the **↑** and **↓** arrows if you like.
6. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

**To stop showing a chip:** switch it from **Shown** to **Hidden**. The chip stays in the history, so older answers still make sense. **Delete** is possible until the chip locks (once it is published and the first real round has opened). A locked chip shows a lock next to its code: hide it instead.

**Good to know:**

- Keep **4 to 6 active chips** per area. A warning shows on the area when it has fewer or more.
- **Other** is added automatically at the end of every area and cannot be removed or moved. A partner who picks it is asked to explain by voice or text. Its wording is the text `issue.other`, in **Texts & translations**.
- Adding a chip during a round is possible, but partners who answered earlier never saw it. Between rounds is better.

### Recipe 4: Add an area

Every area is one more rating screen for **every** partner, so add areas sparingly. Best done between rounds.

1. **Areas & problems > Add an area**.
2. Type its **Name in English** and a **Short help line in English** (the short explanation under the name), then click **Add area**. The new area opens.
3. Under **Name** and **Help line (shown under the name)**, add the other languages you can.
4. **Ask about problems when rated**: leave **Use the standard (3)**, or choose a number from 1 to 5 (for example **2 – Bad or lower**). Partners who rate the area at or below it get its "What is the main problem?" screen.
5. Add **4 to 6 problem chips** ([Recipe 3](#recipe-3-add-or-hide-a-problem-chip)).
6. Reorder the area with the **↑** and **↓** arrows on its card: the order of areas is the order of the rating screens.
7. Do the [everyday loop](#the-everyday-loop-save-preview-publish). In Preview, rate the new area low to see its problem screen.

To stop asking about an area, switch it from **Shown** to **Hidden**. **Delete** works only until the area locks (once it is published and the first real round has opened); after that, hide it.

### Recipe 5: Translate a language

Until a text is translated, partners see the English. In the Sheet's **Texts** tab, an untranslated text is stored as `[TRANSLATE] ` followed by the English.

**In the panel (easiest):**

1. **Texts & translations**. Under **How far translations are**, a bar per language shows how much is done, for example "Tamil: 12 of 132 done".
2. Under **Find and edit texts**, pick the language in the list next to the search box, and tick **Only texts still to translate in** (that language).
3. Each text shows its English box and a box for the language. A box still to translate is **empty**, marked **To translate**, and says "Shows the English for now". Type the translation into it. You never type `[TRANSLATE]` yourself: the panel adds and removes it.
4. Keep `{s}` and `{n}` exactly as they are: the form puts numbers there. If a translation drops or adds one, a warning appears under the box, and **Check for problems** reports an error.
5. Keep it short: it must fit on a small phone screen.
6. Save often. When the language is done, do the [everyday loop](#the-everyday-loop-save-preview-publish). In Preview, switch to that language with the language button at the top of the form.

**How translations work** (a box at the top of **Find and edit texts**) repeats these rules.

**Directly in the Texts tab:** close the panel first (golden rule 6). The tab has one row per text: the **key** (the text's code, such as `q.nps`), then one column per language (`en`, `hi`, `ta`, `te`, `kn`, `ml`), then **note**. Type in the language's column, replacing the **whole** cell, including the `[TRANSLATE] ` tag. Never change the **key** column, and never sort the tab. Then open the panel again, and publish.

**With an outside translator:** do not give them Editor access to the Sheet (that would make them an admin). Instead:

1. Close the panel.
2. In the **Texts** tab, copy the **key** and **en** columns and the language's column into a new Google Sheet, and share only that sheet with the translator.
3. When it comes back, paste the translated column into the same column of the **Texts** tab, starting at row 2. The rows must be in the same order: ask the translator not to sort, add or delete rows.
4. Open the panel again, check the progress bar, then do the everyday loop.

Ask a native speaker to go through the whole survey in Preview, on a phone, before you publish a new language.

### Recipe 6: Change colours, logo or product name

1. **Look & feel**.
2. **Product name**: the name in the form's header, in every language.
3. **Logo** (**Logo address**): a web address starting with `https://`, or the path of an image file inside the form's `web/` folder on GitHub (for example `assets/logo.svg`; a developer must add the file there first). Leave it empty to show the product name as text.
4. **Colours**: 9 colours. For each, use the colour picker or type the code, such as `#4B2E83` (if you type the six characters without `#`, the panel adds it). A mistyped code shows "Use # and 6 characters, for example #4B2E83" under its box, and **Save** then names the colours that are not valid yet: publishing waits until they are fixed. **Use the standard colours** puts the original purple back. The **Preview** card on the right sketches a question card in your colours (pick its **Language** to see other scripts): check that text is easy to read on its background.
5. **Rating faces**: the 5 faces used for ratings, from 1 (worst) to 5 (best), one emoji each.
6. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

### Recipe 7: Start a new round with its "What changed" bullets

A **round** is one survey wave, such as `2026-R1`. Every link belongs to one round.

1. **Rounds > New round**. The **Round code** box suggests the next one (for example `2026-R2`). Keep it or type another: letters, digits, `-` and `_` only. Never reuse an old round's code, and never use `DEMO-R1` for real partners.
2. Add **Notes** if you like (for example "October 2026, all DCs"), then click **Create round**. The round appears with the status **Not open yet** and a **Not saved yet** badge.
3. Click **Save** to keep it. (Preview, **Make links** and **Open the round** also save first; the round's numbers appear only once it is saved.) A new round without "What changed" bullets changes nothing for partners, so it needs no Publish of its own.
4. In the **What changed** card (lower down in Rounds), pick the round in **Round:**, and click **Add a bullet** for each improvement since the last round. Write it in every language you can (English is needed). Remove and reorder bullets as needed. Partners see them on the "What changed since your last feedback" screen; if a round has no bullets, the screen is skipped.
5. Do the [everyday loop](#the-everyday-loop-save-preview-publish). The bullets are content, so partners only see them after **Publish**.
6. Make the links ([Recipe 9](#recipe-9-generate-and-download-links)).
7. Click **Open the round** when you are ready to send the links ([Recipe 8](#recipe-8-open-or-close-a-round)).

A new round starts as **Not open yet** (draft): its links show "This survey is not open yet" until you open it. The round's **Opens on** and **Closes on** dates are for your information only: nothing opens or closes by itself. A round that was never opened can still be removed with its **Delete** button.

### Recipe 8: Open or close a round

1. **Rounds**. Find the round in **All rounds**.
2. Click **Open the round**, **Close the round** or **Re-open**. A window asks you to confirm (for example **Open round 2026-R1?**): click **Open round**, **Close round** or **Re-open round**. Unsaved changes are saved first.

It takes effect for partners straight away. No Publish is needed. **You should see** the new status on the round, and the message "Round 2026-R1 is now open." The first opening of a round can take half a minute.

**If the window warns "Partners will get version 7, the version that is live now"** (or "Nothing has been published yet…"): opening a round publishes nothing, and your draft has changes that partners would not get. The warning may also say which of the round's "What changed" bullets are not live yet. The buttons are then **Cancel**, **Publish first** and **Open anyway** (or **Re-open anyway**):

- **Publish first** takes you to **Publish**. After you publish, the window **Version 8 is live** offers **Open round 2026-R1 now**: click it and confirm.
- **Open anyway** opens the round now: partners get the version that is live (or, with nothing published yet, the copy stored in GitHub).

A new round that has no "What changed" bullets yet does not count as a change, so creating one never brings this warning up by itself.

| Status (badge in the panel) | What partners see |
|---|---|
| **Not open yet** (draft) | "This survey is not open yet. Please open the same link again once it starts." Preview still works. |
| **Open** | The survey. |
| **Closed** | New visitors see "This survey has closed". Partners who were already in the middle can still finish; their answers are marked **late**. |

**Good to know:**

- The first time a round is opened, the panel creates its **data spreadsheet** (**Valmo Partner Pulse - data -** followed by the round's code) and its voice-notes folder in Drive. On the round, **Data:** then shows the links **Answers sheet** and **Voice notes folder**. (A colleague needs access to the Drive folder for this first opening: see [Adding a colleague](#adding-a-colleague-a-co-admin).)
- **Opening the first real round locks the codes** of everything live: from then on those questions, areas and problems can only be hidden, not deleted or given a new code. The confirm window warns you ("This locks the codes"). Put the real problem list in and publish before that.
- **Test rounds never lock anything.** A round whose name starts with `SMOKE`, `DEMO` or `TEST` (for example the setup guide's `SMOKE-R1`) is a test round; its confirm window says so. Never send its links to real partners.
- Opening a round whose name contains `DEMO` needs an extra tick, **I understand: this is only for testing.** DEMO rounds hold fake content and are for testing only.
- Only the buttons change what partners see. Typing in the **status** column of the Rounds tab does not.
- If very many partners are sending answers at that moment, the change can stop with "Many partners' answers are being saved right now, so the round could not be changed. Nothing was changed." Wait a minute and click the button again.

### Recipe 9: Generate and download links

Each DC gets a personal link for each round. The link contains a secret code, so a partner cannot answer as another DC.

**First, the DC list.** The list of DCs lives in the **DCs** tab (green). It is partner data: it stays in this Sheet only. To fill it in:

1. Close the panel.
2. In the **DCs** tab, click cell **A2** and paste your list, with the columns in this order: **dc_id**, **dc_name**, **state**, **region**, **language**.
   - **dc_id**: the DC's id. Only letters, digits, `-`, `_` or `.`, at most 64 characters. Capital letters matter. Use the same ids as in Valmo's other systems. Set-up makes this column plain text, so an id such as `0123` keeps its `0` when you type it. If Google Sheets still turns an id into a number or a date (`0123` into `123`, `1-2` into a date), **Make links** skips that DC: type the id again with an apostrophe in front, for example `'0123`.
   - **language** (optional): `en`, `hi`, `ta`, `te`, `kn` or `ml`. The link then opens the survey in that language. Leave it empty to let the partner choose on the first screen. A code the survey does not offer is ignored.
3. The **active** column decides who gets a link. Its boxes start ticked, and an empty **active** cell also counts as active, so a pasted list is ready to use. To leave a DC out of new links, untick its box (or type `FALSE`).

**Then the links:**

1. Open the panel > **Links** (or **Partner Pulse > Generate links…**).
2. Under **1. Pick the round and make the links**, choose the **Round** (an open one, or one that is not open yet; the list starts on the newest round). The panel shows how many DCs are active in the DCs tab.
3. Choose **Only DCs without a link yet (recommended)**, or **All active DCs again**.
4. Click **Make links**. For thousands of DCs this can take a minute.
5. **You should see** the message "Links for 2026-R1 ready: … new, … made again." and the card **2. Links for 2026-R1**: **new links**, **links made again**, **already had a link (unchanged)** and **DCs skipped**. Skipped DCs are listed with the reason, for example an id with characters that are not allowed, a DC listed twice, or "Type the id as text…" for an id Google Sheets turned into a number or a date. Fix those rows in the DCs tab and make links again.
6. Click **Download the 2026-R1 links (CSV)**. The file is called `partner-pulse-links-<round>.csv` and has the columns `dc_id, dc_name, state, region, language, link`, one row per active DC (skipped DCs are left out). **Copy all links** copies the same list instead. To find one DC's link, type its code or name under **Find one DC's link**, then click **Copy**.

The links are also listed in the **Links** tab, one row per DC per round, with when and by whom they were made.

**To get the file again later** (the result only shows after **Make links**): click **Make links** again with **Only DCs without a link yet**. Existing links stay exactly as they are, and the file lists them all.

**Good to know:**

- **Making links again never breaks links already sent:** the same DC and round always get the same link. A link changes only if the form's address or that DC's language changed.
- **Send the links in batches**, for example 1,000 an hour, not all 10,000 at once: Google handles only about 30 partners at the same moment, and the form retries by itself if it is busy.
- **The CSV is partner data:** each link lets someone answer as that DC. Share it only with whoever sends the links, and delete it when the round is over. Never save it in the project folder on GitHub.
- **Link secret (for the Python tool)**, at the bottom of this section, is only for `scripts/generate_links.py`, the offline way to make the same links on a Mac (see the [README](../README.md#step-10-make-the-links)). Click **Show the link secret**, type `SHOW` and click **Show the secret**. Treat it as a password, and **never change it while links are out**.

### Recipe 10: Check how many partners answered

1. **Home**, card **Rounds**. Each round is listed with its status and **Numbers**. The numbers of open rounds (and of the three newest rounds) load by themselves; for the others, click **Show numbers**. Click **Refresh** to update them. They read like "120 links · 64 opened · 51 started · 47 sent answers 39% answered":
   - **links**: DCs that have a link for this round;
   - **opened**, **started**, **sent answers**: how many different DCs reached each stage;
   - **% answered**: sent answers out of links;
   - below: how many answered in each language, and the time of the **last answer**.

   The same numbers show on each round in **Rounds**.
2. For the answers themselves, go to **Rounds** and click the round's **Answers sheet** link. It has five tabs:

   | Tab | What it holds |
   |---|---|
   | **responses** | One row per finished survey: DC, language, the 0–10 score, times, and all answers. |
   | **function_ratings** | One row per area or support rating, with the problem chip picked. |
   | **free_text** | One row per typed or spoken answer, with a link to the voice note (**audio_url**). |
   | **events** | Which screens each partner saw, in order. |
   | **pings** | Progress signals (opened, started, how far partners got). |

Look, but do not edit or sort these spreadsheets: later phases (the pipeline and the dashboard) read them as they are, and the script writes every column in a fixed place. Each tab is exactly as wide as its columns, to stay far below Google's limit of 10 million cells per spreadsheet. Voice notes are files in Drive (the round's **Voice notes folder** link), in **Valmo Partner Pulse > rounds >** (the round's code) **> audio**. They are private to the people the folder is shared with.

### Recipe 11: Undo a bad publish (Restore)

1. **Publish**, then the card **3. Published versions**: every version, newest first, with its date, author, note and a **Live** badge on the current one.
2. Find the last good version. Click **Restore this version as the draft**. A window **Restore version 7 as the draft?** explains what happens: click **Restore version 7**.
3. **You should see** the message "Version 7 is now your draft. Check it, then publish when ready." **Nothing has changed for partners yet.**
4. Preview, then Publish with a note such as "Undo version 8: back to version 7".

The restored content is published as a **new** version number (for example 9). Version numbers only go up, so the history always shows what happened.

**What Restore replaces, keeps and drops:**

- **Replaced with version 7:** the questions, areas, problems, support questions, languages, texts, colours and settings, the read-aloud clips (the **Audio clips** tab), and the "What changed" bullets.
- **Kept as they are:** your rounds, the form address, any setting version 7 did not have yet, and the notes for translators.
- **Kept, but hidden:** anything your draft has that version 7 does not (a question, area, problem, support question or language, including things that were already hidden). It stays in its place, switched to **Hidden**, with its texts, translations and clips, so partners see exactly version 7 until you switch it on again and publish. An area that comes back this way brings its problems back hidden too: if you switch the area on, switch its problems on as well.
- **Dropped:** the "What changed" bullets of every round that version 7 did not have. The rounds stay, but those bullets are deleted. Copy them somewhere before you restore, and add them again afterwards ([Recipe 7](#recipe-7-start-a-new-round-with-its-what-changed-bullets)).

Restore replaces the current draft, including saved changes you have not published yet (and any unsaved ones: the window warns you). Publish or write those down first.

### Recipe 12: Refresh the GitHub copy

The form keeps a backup copy of the questionnaire in the GitHub project (the files in `web/config/` and `web/i18n/`). It only uses it when Google does not answer quickly. After important changes (new questions, a new round's "What changed", translations), refresh that copy so the backup matches.

1. **Publish your latest changes first**, so that the draft and the live version are the same: the banner "Partners still see version … Your saved draft has changes they don't see yet." must be gone. The files are made from the draft. (When the draft is exactly the live version, `survey.json` also carries the live version's name, such as `p7-2026-10-21`, so answers sent while a phone uses the backup still say which version it was. Otherwise it says `draft`, and the card warns "Your draft has changes that are not published…".)
2. **Publish**, card **4. Backup copy in GitHub**. **First check that the card does not warn "The web app address isn't recorded yet".** Without that address, the downloaded `survey.json` keeps the form in test mode (`"mock"`), and putting it on GitHub would stop the online form from sending answers to Google. If you see the warning, record the address first (**Home > Quick links**, **Check and save**: [setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). Without it, **Download** or **Copy** of `survey.json` first asks "Take a test-mode survey.json?"; take it anyway only while the form is not live yet. Then click **Download files for the GitHub copy**. The panel prepares the files ("The 4 files are ready to download.") and lists them: `survey.json`, `strings.json`, `whats_changed.json` and `audio_clips.json`, each with the folder it goes to. Click **Download** next to **each** of the four (one click each: the browser does not allow one click to download several files). They land in your Downloads folder.
3. Either give the four files to a developer, or put them into the project on the Mac yourself:

   ```bash
   cd ~/NPSF
   cp ~/Downloads/survey.json web/config/survey.json
   cp ~/Downloads/strings.json web/i18n/strings.json
   cp ~/Downloads/whats_changed.json web/config/whats_changed.json
   cp ~/Downloads/audio_clips.json web/config/audio_clips.json
   python3 scripts/check_config.py
   ```

   What it does: replaces the four files in the project with the downloaded ones, then checks them.

   **You should see** "All good" at the end, and in the SUMMARY, "Answers go to: Google Apps Script (https://script.google.com/macros/s/…/exec)", with the web app address recorded in the panel. The downloaded `survey.json` takes it from there.

   **If the SUMMARY says "the test server on this Mac" instead**, or shows an address that is not your web app's, stop: do not save this to GitHub. Put the saved copy back:

   ```bash
   git checkout web/config/survey.json
   ```

   What it does: puts back `survey.json` as it was in the last commit, so the online form keeps its address. Then record the right address in the panel (**Home > Quick links**, **Check and save**, or **Change** if one is there), and download the files again.

   If your Downloads folder had older copies, Chrome names the new files `survey (1).json` and so on: delete the old ones first and download again.

4. Save the change to GitHub:

   ```bash
   git status --ignored
   git add web/config web/i18n
   git commit -m "Refresh the backup copy of the questionnaire"
   git push
   ```

   Before the commit, read the list from `git status --ignored`: only the four files should be listed as changed.

5. Delete the four files from Downloads.

**You should see:** in GitHub's **Actions** tab, a green tick a minute or two later.

---

## Meesho-only mode (until IT allows "Anyone")

Partners reach the survey only if the web app's **Who has access** is **Anyone**. If Meesho's Google settings don't offer that yet, the web app can run as **Anyone within meesho.com** meanwhile, so colleagues can try the real thing, for example to show it to a manager before approval ([setup guide, step 8](../apps-script/README.md#step-8-first-check-that-anyone-is-offered)).

- **How the panel knows:** when you record the web app address (**Home > Quick links > Check and save**), the panel says "Saved as Meesho-only", and a yellow note on **Home** and in **Links** reminds you.
- **What changes:** the web app shows the survey page itself, to people signed in with a Meesho Google account. **Links** and **Preview** open the survey through the web app's address, so make the links again after recording it. Answers, numbers, Publish and everything else work as usual.
- **What doesn't work yet:** partners (no Meesho account) can't open those links, and the GitHub copy of the questionnaire stays in test mode (the **Backup copy in GitHub** card says why). Voice notes may not work inside Google's page; typing always does.
- **Switching up, once IT allows "Anyone":** in the Apps Script editor, **Deploy > Manage deployments >** pencil icon (Edit) > **Who has access: Anyone** > **Deploy** (the address stays the same). Then in the panel: **Home > Quick links > Change**, the same address, **Check and save**. The panel says the web app "is open to anyone now". Make the links again (they now open the form on GitHub Pages) and refresh the GitHub copy ([Recipe 12](#recipe-12-refresh-the-github-copy)).

## What the errors and warnings mean

**Check for problems** (in **Publish**, card **1. Check for problems**) lists **errors** ("✖ … problems to fix before publishing") and **warnings** ("… warnings (publishing still works)"), and shows the questionnaire's size for phones. Each one names where the problem is (for example "Problems › payments/payout_delayed" or "Settings › Longest voice note (seconds)") and has a **Go there** button. The exact wording comes from the panel; the table explains the common ones.

**Errors (they block Publish):**

| It is about… | What it means | What to do |
|---|---|---|
| A setting that is out of range, or of the wrong kind | For example a number too big, or text where a number belongs. | Go there and use a value in the range the message gives. |
| A colour | Colours must be codes like `#4B2E83`: `#` and 6 characters. | Use the colour picker in **Look & feel**. |
| The default or backup language | It is switched off in the language list. | Switch it on in **Settings**, or choose another. |
| The faces | There must be exactly 5. | Fix them in **Look & feel**. |
| The form address | It must start with `https://` and end with `/`. | Fix it in **Settings > Form address**. |
| A code (question, area, chip, option, support item, language) | It is empty, repeated, or uses characters that are not allowed. `other` is reserved for the automatic Other chip. | Let the panel make the code from the English text, or ask an admin. |
| The thank-you screen | It must exist, be switched on and be the last screen. | Move it back to the end; do not hide it. |
| The order of screens | For example the problem screens come before the area ratings. | Move the screens back into a sensible order. |
| A question without text, or a choice question without options | Partners would see an empty screen. | Add the text or the options. |
| A rule ("Only show it if…") | It points at a question that comes **later**, is hidden or no longer exists, or the rule is incomplete. | Fix the rule, or move the question after the one it depends on. |
| A missing text | A text the form needs has no English (or no text in the backup language), or still says `[TRANSLATE]` in English. | Write the English in **Texts & translations**. |
| `{s}` or `{n}` in a translation | The translation dropped or added one of these number places. | Make it match the English exactly. |
| A "What changed" bullet without English | Every bullet needs English. | Add it in **Rounds > What changed**. |
| Size | The questionnaire is over the size limit for phones on slow data. | Remove unused texts or shorten long ones. |

**Warnings (they never block Publish; read them anyway):**

| It is about… | What it means | What to do |
|---|---|---|
| An area with fewer than 4 or more than 6 active chips | Too few chips miss problems; too many slow partners down. | Add or hide chips. |
| Texts still to translate in a language | Partners using that language see English for those texts. | Translate them ([Recipe 5](#recipe-5-translate-a-language)) when you can. |
| Texts that nothing uses | Left over from something you deleted. | Harmless. A developer can tidy them up. |
| Codes that are live today but missing from the draft ("… is live today but is no longer in the draft") | You deleted or renamed something partners already answered. The dashboard compares rounds by code. This check starts once the first real round has opened; before that, codes may still change. | **Undo it**: rename the label instead of the code, and hide instead of deleting. |
| The question with the code `nps` or `support_gate` is missing | Its answers fill their own column (`nps` or `support_contacted`) in every round's answers sheet, and the dashboard's headline score reads `nps`. The panel never deletes these two: this happens only after a hand edit of the **Screens** tab, or an **Import from GitHub** of files without them. | Undo the change, or add the question back with exactly that code. To stop asking it, hide it instead. |
| A round whose code contains DEMO, such as `DEMO-R1` ("fake demo content") | DEMO rounds hold fake content. This warning is normal: it shows as long as `DEMO-R1` has its sample bullets. | Never open it or send its links to real partners. |
| An open round whose name contains DEMO | DEMO rounds hold fake content. | Close it, unless you are testing on purpose. |
| `[SAMPLE]` in a real round's "What changed" | Sample text was left in. | Replace it with real bullets. |

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| A colleague can't open a link while the panel says "Meesho-only" | They aren't signed in with their Meesho Google account in that browser, or **Who has access** is **Only myself** (the panel can't tell that apart from **Anyone within meesho.com**). | Ask them to sign in with their Meesho account (or open the link in a Chrome profile that has it). In the Apps Script editor, check **Deploy > Manage deployments**: **Who has access** must be **Anyone within meesho.com**. |
| No **Partner Pulse** menu | You have Viewer access, or the Sheet has not finished loading. | Reload the Sheet and wait 10 seconds. If it still does not appear, ask the admin for Editor access. |
| Google's permission screen, the first time you use the menu | Google asks you to allow Partner Pulse's permissions. | Tick **Select all** and allow them all ([setup guide, step 6](../apps-script/README.md#step-6-run-set-up-or-repair-and-allow-the-permissions)). |
| "Authorization is required", or "Google says Partner Pulse needs authorization" | Usually Google is using another of your Google accounts (several are signed in to Chrome). Less often, a permission was left unticked. | Open the Sheet in a Chrome profile (or an Incognito window) signed in only with your company account, and try again. If that does not help, use the **Partner Pulse** menu again and tick **Select all** on Google's permission screen. |
| "Google needs all of Partner Pulse's permissions" (or "Google has not given Partner Pulse all the permissions it needs") | A permission was left unticked on Google's permission screen. | Use the **Partner Pulse** menu again (for example **Open control panel**), tick **Select all** on Google's permission screen, then click **Continue**. |
| "Google Drive would not open … for you … Ask … to open this Sheet and click Partner Pulse > Share the Drive folder with all editors" (when you publish, restore an older version, open a round for the first time or load the numbers; or when the panel itself does not open) | You can edit the Sheet but not the Drive folder **Valmo Partner Pulse**. | Ask the admin named in the message to run **Partner Pulse > Share the Drive folder with all editors** (see [Adding a colleague](#adding-a-colleague-a-co-admin)), then try again. |
| "Google Drive had a passing problem while opening … Nothing was changed." | A short hiccup on Google's side, not an access problem. | Try again in a minute. |
| A note in **Questions** or **Areas & problems**: "Google Drive had a passing problem reading the live version, so for now nothing that already exists can be deleted or given a new code" | The panel could not read the live version just then, so it keeps every code locked to be safe. | Close the panel and open it again in a minute. |
| A note in **Questions** or **Areas & problems**: "A real round is open, but nothing has been published yet…" | A real round was opened with **Open anyway** before the first publish, so partners answer with the form's own copy of the questions, whose codes the panel can't see. It keeps every code locked to be safe. | Publish (**Publish > Publish**). From then on only the codes of the live version are locked. |
| **Could not share the Drive folder** | You ran the menu item, but you cannot edit the folder yourself. | Ask the admin who ran set-up to run it. |
| "Someone else saved changes" | A colleague saved after you opened the panel. | Choose **Reload the latest version** or **Keep mine and overwrite** (see [Two people at once](#two-people-at-once)). |
| "Someone else is changing Partner Pulse right now … Nothing was changed." | A colleague is saving, publishing, making links or opening a round at this moment. | Try again in a minute. |
| "Many partners' answers are being saved right now, so the round could not be changed." | Very many partners are sending answers at this moment. | Wait a minute and click the round's button again. Nothing was changed. |
| When you save: "There is a tab called …, but it must be called … exactly" | A tab's name differs from the expected one only in capitals or spaces (for example `texts` instead of `Texts`). Nothing was saved. | Rename that tab exactly as the message says (double-click its name at the bottom of the Sheet), then save again. |
| When you save: "Could not read the … tab before saving" | Google Sheets was busy. Nothing was saved. | Try again in a minute. |
| When you save: "Saving stopped half-way" | Google Sheets refused to change one tab after saving had started, so the draft may be only partly saved. | Close the panel, open it again to see what was saved, then redo your last changes and save. If it happens again, check that the tab named in the message is not protected (**Data > Protect sheets and ranges**). |
| **Home** says "The web app address isn't recorded here yet", or the **Backup copy in GitHub** card warns about it | Nobody has recorded the web app address in the panel yet. | Ask the admin to record it ([setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). Until then, do not put files from **Download files for the GitHub copy** on GitHub ([Recipe 12](#recipe-12-refresh-the-github-copy)). |
| **Bring back your unsaved changes?** when the panel opens | The panel was closed last time before you saved. | **Bring them back** and **Save**, or **Throw them away**. |
| Publish is blocked | **Check for problems** found errors. | Use each **Go there** button, fix, and publish again. |
| **This question can't be deleted** | The question is live and the first real round has opened: earlier answers use its code. (Before that, live questions can still be deleted.) | Click **Hide it instead**. For live areas, problems and support items, **Delete** is greyed out (click it to see why): switch them to **Hidden** instead. |
| **Delete** is greyed out on the 0–10 question or on "Did you contact Valmo support?" | These two fill their own columns in the answers sheet, so they can never be deleted or given a new code. | Click **Hide** instead, if you really want to stop asking it. |
| The preview says "The draft could not be shown: something in it stops the form from starting" | The draft has a mistake the checks missed, and it stops the form from starting (the form shows its stored copy instead). | **Don't publish it.** Undo your last change, click **Check for problems**, and preview again. If you can't find the cause, restore the live version as your draft (**Publish > history > Restore**). |
| The preview says "Could not load the draft: showing the form's stored copy" | The preview link lost its end (`&pk=…`) when it was copied, Google took more than 20 seconds, or the form is not connected to the live backend yet. | Open the preview again from the panel (**Preview > Open the preview**), or copy the **whole** link with **Copy**. Before go-live, see the [setup guide, Part D](../apps-script/README.md#part-d-connect-the-form). |
| Partners still see the old version | You saved but did not publish, or their page was already open. | Publish. Partners get it the next time they open their link. |
| Partners see "This survey is not open yet" | The round is a draft, or the round in their link is one the backend does not know (a typo in `round=…`, or a round that was never saved), which also counts as not open yet. | Open it ([Recipe 8](#recipe-8-open-or-close-a-round)). If it is open already, check that the link's `round=…` is exactly the round's code, capitals included. |
| A partner sees "This link is not valid" | The link was cut when it was copied, or edited by hand. | Send the full link again from the **Links** section. |
| The panel says "The control panel could not open" | A tab is missing, or Google was busy. If the message also says "Google Drive would not open … for you", you don't have the Drive folder (see the row about that message above). | Click **Try again**. If it keeps happening, run **Partner Pulse > Set up or repair**, then open the panel again. In the Drive case, ask the admin to share the folder instead. |
| The panel window is cut off | Your screen is very small: the window shrinks itself only so far. | Zoom out in Chrome (Cmd+minus). |

The admin's [setup guide](../apps-script/README.md#troubleshooting) has more answers.

---

## Words used in this guide

| Word | Meaning |
|---|---|
| **Draft** | The questionnaire you are working on, in the Sheet's purple tabs. Partners never see it. |
| **Live version** | The last published version: what partners see. |
| **Publish** | Make the draft the next live version. |
| **Preview** | Try the draft form yourself. Nothing is saved. A preview link ends with a private **preview key** (`&pk=…`) that only shows the draft: share it only with colleagues. |
| **Round** | One survey wave, such as `2026-R1`. Status: draft, open or closed. |
| **Code** | The permanent id of a question, area, chip, option or support item, such as `payout_delayed`. Answers are saved under it. |
| **Chip** | One of the problem choices on "What is the main problem?". |
| **Threshold** | The rating at or below which an area's problem screen is asked (3 by default). |
| **Detractor** | A partner who scores 0–6 on the 0–10 question. |
| **Link secret** | The password that makes every partner's link unique. Never share it, never change it while links are out. |
| **DC** | Delivery centre: a partner's site. |
