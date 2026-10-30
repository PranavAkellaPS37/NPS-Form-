<!--
===============================================================================
docs/control-panel.md: user guide for the Partner Pulse control panel
===============================================================================
What this file is for
  How to use the control panel inside the Google Sheet "Valmo Partner Pulse -
  Control": change the questionnaire, translate, run rounds, make links,
  publish, and undo. Since 27 Oct 2026 the questions and their route (which
  screen comes after which: rules, jumps, questions asked once per area,
  extra endings) are changed as ONE TABLE with "Paste a route": copy the
  current route into Excel (or have Claude/ChatGPT write the table), change
  it, paste it back, Check, Use this route. The Map and Try a path show and
  test it. Each task is a recipe with exact clicks; the table's columns and
  rule words, and every message the Check can show, are listed here too.

Who it is for
  Valmo ops colleagues with Editor access to the Sheet. No coding needed.

What else to read
  - apps-script/README.md: the one-time setup (done by the admin).
  - README.md, section "Phase 2: go live": the order of the go-live.
  - docs/control-panel-design.md: the technical design (for developers).
  - docs/flow.md: the map of the route, as GitHub draws it (made by the
    panel's "Download files for the GitHub copy", never typed by hand).

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

**New since 27 Oct 2026:** the questions and their route are no longer made one by one. You copy the whole route as a table, change it in Excel (or let Claude or ChatGPT write it), and paste it back: [Recipe 2: Paste a route](#recipe-2-change-the-questions-paste-a-route).

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

**Use a computer for the panel.** The **Partner Pulse** menu and the control panel only appear in Google Sheets in a computer's browser (Chrome is best). The Google Sheets phone app doesn't show them.

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
3. **Never rename or delete codes during a round.** Every question, area, problem chip, answer option and support item has a **code** (such as `payments` or `payout_delayed`). Answers are saved under these codes, and the dashboard compares rounds by them. To change what partners read, change the **wording** instead: that is always safe. To stop asking something, **hide** it instead of deleting it: a question is hidden by writing `no` in the **show** column of the route table ([Paste a route](#recipe-2-change-the-questions-paste-a-route)); an area, problem or support item with its **Shown / Hidden** switch. The panel helps: once the first real round has opened, anything live shows a **lock icon** 🔒 next to its code. Areas, problems and support items then have no **Change code** button and can't be deleted, only hidden; and **Check** refuses a pasted route table that leaves out a live question or a live answer, or changes its code. Before that, nothing is locked, and a note at the top of **Questions** and **Areas & problems** says so: that is the time to replace the placeholder questionnaire. Test rounds, whose name starts with SMOKE, DEMO or TEST, never lock anything. Two questions are protected from the start: the 0–10 question (code `nps`) and "Did you contact Valmo support?" (code `support_gate`) fill their own columns in every round's answers sheet, so they can be hidden but never deleted or given a new code: a route table without them is refused.
   - **A code partners answered stays locked for good.** Once the first real round has opened, every **Publish** remembers for good the codes of the version partners had until then and of the new one. A remembered code stays locked, even after you hide its question (or area, problem or support item) and publish again. If it ever goes missing from the draft (for example after typing in the tabs, or an **Import from GitHub**), **Check for problems** shows an **error** and Publish waits until it is back ([what the errors mean](#what-the-errors-and-warnings-mean)).
   - **An answer of a "Pick one answer" question can't be hidden or removed.** Once partners picked it in a real round, it must stay on its question in the table: reword it instead ([live answers](#a-live-answer-of-a-pick-one-question)).
4. **Never put partner data or secrets in texts or settings.** The published questionnaire is public: anyone with the web app address can read it.
5. **Open and close rounds only with the panel's buttons.** Typing a status into the **Rounds** tab does not change anything for partners.
6. **Close the panel before you type in the tabs directly**, and open it again afterwards. The panel works on its own copy while it is open, and its **Save** would overwrite what you typed.

---

## A tour of the panel

**The top bar** (always visible):

- the draft status: **All changes saved**, **Unsaved changes** or **Saving…**. Next to **Unsaved changes**, **Discard** throws your unsaved changes away and goes back to the last saved draft;
- the **Live** badge, for example "Live: version 7, published 21 Oct by asha@…", or **Nothing published yet**;
- the buttons **Save**, **Preview** and **Publish**. **Ctrl+S** (Cmd+S on a Mac) also saves, except while any window of the panel is open: answer or close it first.

A banner appears when the draft is different from the live version ("Partners still see version 7. Your saved draft has changes they don't see yet."), with a **Check and publish** button. On the left, **Publish** shows a red number when the last check found problems, and an orange dot when partners don't see your changes yet.

**If the window closes before you save** (or the browser crashes), your unsaved changes stay on this computer. The next time you open the panel it asks **Bring back your unsaved changes?**: click **Bring them back**, then **Save**, or **Throw them away**. If a colleague saved the draft in the meantime, they are dropped instead, with a short message.

- **They stay on this computer until you click one of the two buttons**, even if you close the panel while it asks.
- **If the panel also added the form's newer texts as it opened** (the message "4 new texts of the form were added…", [below](#if-something-goes-wrong)), **Bring them back** keeps those texts too. One message then says both: "Your changes are back. 4 new texts of the form were added to Texts & translations (…). Press Save to keep them." **Throw them away** keeps them as well: it drops last time's changes and keeps the draft as the panel opened it, with the texts added. Either way, click **Save**. (Since 30 Oct 2026.)

**After a delete, or after Use this route**, a short message offers **Undo** for a few seconds (until you change something else).

**The sections** (left-hand list):

| Section | What you do there |
|---|---|
| **Home** | The live version, whether the draft differs from it, "What to do next" hints, every round with its status and numbers, and quick links (the Sheet, the Drive folder, the form, and the web app address). Until someone records the web app address, its box is empty: the admin pastes it there and clicks **Check and save** ([setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). A red banner shows here if the form on GitHub runs different route code from the panel ([what to do](#if-something-goes-wrong)). |
| **Questions** | The questions and their **route** (which screen comes after which), changed as **one table**: **1. Get the route as a table** (copy it, download the Excel template, or copy the instruction for Claude/ChatGPT) and **2. Paste a route** (paste the table back, **Check**, **Use this route**) ([Recipe 2](#recipe-2-change-the-questions-paste-a-route)). Below them, **The route now**: every screen in order, read only, with its badges and its row number in the table. Also the **Map** and **Try a path** ([How the route works](#how-the-route-works)). |
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
| Set up or repair | Re-creates anything missing (a deleted tab, a missing column, folder or setting). Safe to run: it never deletes your content and never changes the link secret. |
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
   - **If that window has a yellow box "Please check one thing:"** (or "Please check 2 things:"), the version is live, but Publish wants you to look at something. Read it. The usual one starts "Published, but Partner Pulse could not check that the form on GitHub understands this version": Google could not reach the form on GitHub just then. If partners keep seeing the old questions, ask whoever looks after GitHub to upload the newest form code and wait for the green tick, then publish again. The other one says the list of codes partners have answered is full or nearly full: send it to whoever maintains the scripts. The same notes appear at the end of **Set up or repair** when it publishes version 1.
   - If your saved draft is exactly the live version, the window says "Your draft is the same as version 7, which partners already see. Publish anyway?" and the button reads **Publish anyway**. There is nothing new for partners then: usually you can click **Cancel**.

Partners get the new version the next time they open their link. A partner who has the survey open at that moment finishes with the version already on their phone. A partner who started earlier and opens the link again gets the new version, keeps their answers, and carries on at the screen where they stopped (if the new version no longer has that screen, at the first screen they haven't answered). A question you added before that screen is skipped for them.

---

## Recipes

Each recipe ends with the [everyday loop](#the-everyday-loop-save-preview-publish), unless it says otherwise.

**The questions** (since 27 Oct 2026 they are changed as one table, "Paste a route"):

- [Recipe 1: Change a question's wording (fix a typo)](#recipe-1-change-a-questions-wording)
- [Recipe 2: Change the questions: Paste a route](#recipe-2-change-the-questions-paste-a-route) (add, remove, move, hide, rules, jumps, endings)
- [Examples in the route table](#examples-in-the-route-table): a question only for low scorers, a jump, a question for each area, an extra ending, a question in one language or one round

**Everything else:**

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
- [Recipe 21: Add help videos for partners (the ⓘ button)](#recipe-21-add-help-videos-for-partners-the--button)

**The route** (which screen comes after which): start with [How the route works](#how-the-route-works).

- [The route table: columns, kinds and rules](#the-route-table-columns-kinds-and-rules) (the reference for Recipe 2)
- [Recipe 16: Choose where the problem screens go](#recipe-16-choose-where-the-problem-screens-go)
- [Recipe 19: See the whole route on the Map](#recipe-19-see-the-whole-route-on-the-map)
- [Recipe 20: Try a path](#recipe-20-try-a-path)
- [A live answer of a pick-one question](#a-live-answer-of-a-pick-one-question)

(Recipes 13, 14, 15, 17 and 18 used the question editor, which was removed on 27 Oct 2026. What they did is now written in the table: see the [examples](#examples-in-the-route-table). Old links to them land on the matching example.)

### Recipe 1: Change a question's wording

For a typo, or a better wording. Always safe, even during a round: the question's **code** stays the same. The way is **copy, fix, paste back** ([Recipe 2](#recipe-2-change-the-questions-paste-a-route) explains each step in more detail):

1. **Questions**. In the card **1. Get the route as a table**, click **Copy the current route**. **You should see** the message "The current route copied. Paste it into Excel or Google Sheets (… rows and the header)."
2. Open a new, empty Excel sheet or Google Sheet, click cell **A1** and paste (**Cmd+V**). Row 1 holds the column names; every row below is one screen.
3. Find the question's row. (In the panel, each card under **The route now** says which row it is, for example "row 4 in the table".) Fix the words in its **question (English)** cell, and in **question (Hindi)** if you have the Hindi. Change nothing else, and above all not the **code**.
4. Click any cell of the table, press **Cmd+A** (select all) and copy (**Cmd+C**).
5. In the panel, click in the big box under **2. Paste a route**, paste (**Cmd+V**) and click **Check**.
6. **You should see** "✔ No problems." and "Compared with your draft: 1 text new or reworded." Click **Use this route**.
7. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

**Only the words? There is a shortcut:** **Texts & translations** > **Find and edit texts**: type a few words of the question in the search box, then change its English box (and the other languages). That changes the words only; the route stays as it is.

**What happens to the other languages:**

- a language that was never translated (still `[TRANSLATE]`) follows the new English automatically;
- a language that has a real translation keeps it (the **Check** of a pasted table already warns: "the English changed but the Tamil did not: check it in Texts & translations"), and when you save it gets a note for the translator: "English changed on (date): please re-check the translations." The note shows in **Texts & translations**. Once the translation is checked, click **Checked** next to the note to clear it.

To reword an area name, a problem chip or a support item, use **Areas & problems** or **Support questions**, or find the text in **Texts & translations**.

### Recipe 2: Change the questions: Paste a route

Everything about the questions is changed here: add, remove, move, hide or reword a question, its answers, its rule ("show only if"), where partners go next, jumps, questions asked for each area, and extra endings. The whole **route** (which screen comes after which) is **one table**, one row per screen, in the order partners see them. You change the table outside the panel, in Excel or Google Sheets, or let Claude or ChatGPT write it, and paste it back.

**Nothing changes in your draft until you click Use this route**, and partners see nothing until you **Publish**. Best done **between rounds**, so that every partner in a round sees the same questions.

| Way in | Good for | Start with (Questions, card **1. Get the route as a table**) |
|---|---|---|
| **A. Excel or Google Sheets** (no AI) | A typo, a new question, a rule, hiding a question, a jump | **Copy the current route** (or **Download the Excel template**) |
| **B. Claude or ChatGPT** | A bigger change, or when you have notes, an Excel sheet of planned questions, or a flowchart picture | **Copy the instruction for Claude/ChatGPT** |

#### Way A: in Excel or Google Sheets

1. **Questions**. In the card **1. Get the route as a table**, click **Copy the current route**. **You should see** "The current route copied. Paste it into Excel or Google Sheets (… rows and the header)." It copies your draft as it is in the window, unsaved changes included. (If the browser does not allow copying, a window **Copy by hand** opens with the table selected: press **Cmd+C**, then **Close**.)

   Or click **Download the Excel template**: the file `partner-pulse-route.csv` lands in your Downloads folder. It holds the same table (the header, and your draft's route as example rows) and opens in Excel with the Hindi intact.
2. In a new, empty Excel sheet or Google Sheet, click cell **A1** and paste (**Cmd+V**), or open the template file. Row 1 holds the column names (the header); every row below is one screen, in the order partners see them.
3. Change what you need. The columns are explained in [The route table](#the-route-table-columns-kinds-and-rules), with [examples](#examples-in-the-route-table):
   - **reword:** the **question (English)** and **question (Hindi)** cells;
   - **add a question:** insert a row where partners should see it, with a new **code**, its **kind** and its words;
   - **move a question:** move its whole row;
   - **hide a question:** write `no` in its **show** cell (never delete a row partners answered);
   - **rules and the route:** **show only if**, **then go to**, **jumps** and **ask for**.

   Keep the header row, and keep every row's **code**: answers are saved under it.
4. Copy the whole table, **header row included**: click any cell of it, press **Cmd+A**, then **Cmd+C**.
5. Back in the panel, click in the big box under **2. Paste a route**, paste (**Cmd+V**) and click **Check** (or press **Ctrl+Enter** in the box; **Cmd+Enter** on a Mac).
6. Read the result ([Reading the Check](#reading-the-check), below). If it lists problems, fix them in Excel, copy the table again, click **Clear**, paste and **Check** again.
7. When it says **✔ No problems**, look before you use it: **Map of the pasted route** and **Try a path on it** show the pasted route and change nothing ([Recipe 19](#recipe-19-see-the-whole-route-on-the-map), [Recipe 20](#recipe-20-try-a-path)). **← All questions** brings you back.
8. Click **Use this route**. **You should see** "This route is now your draft (… screens). It is not saved yet: press Save, then Preview and Publish as usual.", the message "Route used: your questions were replaced." with an **Undo** button, and the new route in the list **The route now**.
9. Do the [everyday loop](#the-everyday-loop-save-preview-publish): **Save**, **Preview**, **Publish**.

#### Way B: with Claude or ChatGPT

1. **Questions** > **Copy the instruction for Claude/ChatGPT**. **You should see** "The instruction copied. Paste it into Claude or ChatGPT, then add your notes, your Excel sheet or a picture of your flowchart."
2. In Claude or ChatGPT, start a new chat and paste the instruction. Then add what you want, in the same message or the next: your notes, your Excel sheet, a photo of a flowchart, or simply a sentence such as "After nps, add a question for partners who scored 6 or less: What is the main reason for your score?".
   - The instruction tells the AI the table's exact format, every kind and rule word, today's area and problem codes, support questions, languages and today's route, and to answer with **only the table**.
   - A picture of a flowchart is read less reliably than notes: check the AI's table carefully, and look at it on the Map before you use it.
   - The instruction holds only the questionnaire (its wording and codes, which are public anyway). **Never paste partner data into the chat** (DC names or ids, links, answers).
3. **Check the Hindi columns before you paste.** The instruction tells the AI to copy only the Hindi you give it and **never to translate**. **question (Hindi)**, **answers (Hindi)** and **message (Hindi)** must hold only Hindi you wrote. If the AI made up Hindi of its own, ask it to leave those cells empty: an empty cell keeps the words the questionnaire already has, and a new text waits for a translator, marked `[TRANSLATE]`. The **Check** also warns at every Hindi cell the table adds or changes ("new Hindi words: …", "the Hindi words change: … -> …"), so you see each one before you use the table.
4. Copy the AI's table (the copy button under its answer is fine: words around the table are left out, with a warning).
5. Paste it into **2. Paste a route**, click **Check**, and go on as in Way A, steps 6 to 9. If the Check lists problems, you can paste them back into the chat and ask the AI to fix the table.

#### Reading the Check

- **Problems (red)** block the route: "… problems to fix before this route can be used. Nothing has changed in your draft. Fix them in your table (or ask the AI to), paste it again and press Check." Each problem starts with where it is: **Row 5 · jumps** means row 5 of your table, as Excel numbers it (the header is row 1), in the column **jumps**. A problem about the whole table says **The whole table**; one about a column name says **Column "…"**. Every message is explained in [When you Check a pasted route](#when-you-check-a-pasted-route).
- **Warnings (yellow)**, under "… warnings: worth reading, they don't stop you", for example a row your table leaves out ("using the table removes it"), or a code the panel made for you. Read them.
- **No problems (green):** "✔ No problems. The route has … screens (… shown). Nothing has changed in your draft yet.", then what would change, for example "Compared with your draft: 1 screen added (main_reason) and 1 text new or reworded.", or "This is the same route as your draft: using it changes nothing." Under it, the fold-out **The texts that would change (…)** lists each changed text as its key and language, old → new. It opens by itself ("translations too: check them") when a real translation would change.
- **"…press Check again."** If you change the box, or anything in the panel, after a check, the result says so and its buttons wait for a new **Check**.
- **The same rules as Publish.** Check runs the same route checks as **Check for problems** in Publish, including a route that runs on into another one and a question whose kind may no longer change. Publish also checks the texts, the settings and the rest of the questionnaire ([errors](#what-the-errors-and-warnings-mean)), so do the everyday loop as always.

#### Use this route, and Undo

- **Use this route** checks the table once more against your draft as it is now. If that finds problems, nothing changes ("The table was checked once more and now has problems (see the list), so nothing was changed.").
- **It replaces** the questions (every row of **The route now**) and their texts. **It keeps** everything else: areas and problems, support questions, other texts and translations, look & feel, settings, languages and rounds.
- **Texts of a removed question go with it** when they are named after its code (its question, its answers, an ending's title and message) and nothing else uses them. The message then adds "… texts that only the removed screens or answers used were removed too." The standard texts of the built-in screens always stay.
- **Undo**: click **Undo** in the message (it shows for a few seconds) to put the whole draft back as it was. It works until you change something else; after that it says "Undo is no longer possible: you changed other things since." **Discard** in the top bar also goes back to the last saved draft, but it throws away all your other unsaved changes too.
- The warnings of the check stay visible under the box after **Use this route**.

#### Good to know

- **Codes.** Every row's **code** is permanent once partners have answered. Keep the codes when you edit. A new question needs a new code: small letters, digits and `_`, starting with a letter, at most 60 characters, for example `main_reason`. If you leave it empty, the panel makes one from the English words and warns you to keep it.
- **Changing a code is removing a question and adding a new one.** Before the first real round that is allowed, but the new code starts with the words in the table only (English, and the Hindi you give): translations in other languages stayed with the old code and are removed with it. So settle the codes before translating. Once partners have answered under a code, **Check** refuses to let it go.
- **A question partners answered keeps its kind.** **Check** (and Publish) refuse, for example, `faces` for a question partners answered by voice or typing: their answers would mean something else from one round to the next. Hide it (`no` in **show**) and add the new question in a new row with a new code.
- **Hiding.** Write `no` in **show**: the row stays, with its code, and its card says "Hidden: partners don't see it". Write `yes` to show it again.
- **Empty means keep.** An empty text cell keeps the words that are there. A cell holding only a placeholder, such as `NA`, `N/A`, `-`, `—`, `TBD` or `(to be translated)`, counts as empty too, with a warning, so it can never wipe real words.
- **One thank-you row.** The first `thank you` row is the main thank-you screen. Every other end of a route is an `ending` row below it, with its own words. (A later `thank you` row with its own words is read as an `ending`, with a warning.)
- **Removing.** A row you leave out of the table is removed from the draft (the check warns: "The current questionnaire has a row … that this table does not have: using the table removes it."). Rows partners answered can't be left out, and `nps`, `support_gate` and the first thank-you row never ([golden rule 3](#the-golden-rules)).
- **Built-in screens** (language, what changed, nps, area ratings, problem screens, support question, support ratings, thank you) keep their standard codes. Leave their **question (English)** cell empty to keep today's words. The areas and their problems are changed in **Areas & problems**, the support items in **Support questions**.
- **Languages.** Every text the table adds or changes gets your English and the Hindi you wrote. A language that already has a real translation keeps it; every other language shows the English, marked `[TRANSLATE]`, until someone translates it ([Recipe 5](#recipe-5-translate-a-language)). Nothing is ever machine-translated. An empty text cell keeps the words that are there.
- **One person at a time** (see [Two people at once](#two-people-at-once)): **Use this route** replaces the questions of the draft in your window.
- **If the panel window can't run the route tools**, pasting still works: **Check**, **Use this route** and the three table buttons ask Google to run the same code (a few seconds slower, with a box such as "Google is checking the table…"). Only the **Map**, **Try a path** and the badges are off. If Google can't either (usually an old or missing `Flow` file), the buttons of both cards look switched off and say why when clicked ([If something goes wrong](#if-something-goes-wrong)).

### Recipe 3: Add or hide a problem chip

Problem chips are the choices on "What is the main problem?" for an area rated low.

**To add a chip:**

1. **Areas & problems**. Find the area and click **Edit** on its card. The area opens.
2. Under **Problems partners can pick**, click **Add a problem**.
3. Type **The problem in English**, short and concrete, and click **Add problem**.
4. Add the Hindi and the other languages you can, in the boxes under the new problem (or later in **Texts & translations**).
5. Reorder it with the **↑** and **↓** arrows if you like.
6. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

**To stop showing a chip:** switch it from **Shown** to **Hidden**. The chip stays in the history, so older answers still make sense. **Delete** is possible until the chip locks (once it is published and the first real round has opened). A locked chip shows a lock next to its code: hide it instead. It stays locked after you hide it and publish ([golden rule 3](#the-golden-rules)).

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
   - **language** (optional): `en`, `hi`, `ta`, `te`, `kn` or `ml`. The link then opens the survey in that language: the language screen is skipped, or, when the route shows it to everyone (`always`, as the v2.1 route does), that language is already picked on it. Leave it empty to let the partner choose on the first screen. A code the survey does not offer is ignored.
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
   | **pings** | Progress signals (opened, started, how far partners got). The last column, **config_version**, says which version of the questionnaire the phone showed. A round's sheet made before this column existed gets it with its next signal; its older rows stay empty there. |

Look, but do not edit or sort these spreadsheets: later phases (the pipeline and the dashboard) read them as they are, and the script writes every column in a fixed place. Each tab is exactly as wide as its columns, to stay far below Google's limit of 10 million cells per spreadsheet. Voice notes are files in Drive (the round's **Voice notes folder** link), in **Valmo Partner Pulse > rounds >** (the round's code) **> audio**. They are private to the people the folder is shared with.

### Recipe 11: Undo a bad publish (Restore)

1. **Publish**, then the card **3. Published versions**: every version, newest first, with its date, author, note and a **Live** badge on the current one.
2. Find the last good version. Click **Restore this version as the draft**. A window **Restore version 7 as the draft?** explains what happens: click **Restore version 7**.
3. **You should see** the message "Version 7 is now your draft. Check it, then publish when ready." **Nothing has changed for partners yet.**
4. Preview, then Publish with a note such as "Undo version 8: back to version 7".

The restored content is published as a **new** version number (for example 9). Version numbers only go up, so the history always shows what happened.

**What Restore replaces, keeps and drops:**

- **Replaced with version 7:** the questions (with their route: "then go to", jumps, "ask for" and extra endings), areas, problems, support questions, languages, texts, colours and settings, the read-aloud clips (the **Audio clips** tab), and the "What changed" bullets.
- **Kept as they are:** your rounds, the form address, any setting version 7 did not have yet, and the notes for translators.
- **Kept, but hidden:** anything your draft has that version 7 does not (a question, area, problem, support question or language, including things that were already hidden). It stays in its place, switched to **Hidden**, with its texts, translations and clips, so partners see exactly version 7 until you switch it on again and publish. An area that comes back this way brings its problems back hidden too: if you switch the area on, switch its problems on as well.
- **Dropped:** the "What changed" bullets of every round that version 7 did not have. The rounds stay, but those bullets are deleted. Copy them somewhere before you restore, and add them again afterwards ([Recipe 7](#recipe-7-start-a-new-round-with-its-what-changed-bullets)).

Restore replaces the current draft, including saved changes you have not published yet (and any unsaved ones: the window warns you). Publish or write those down first.

### Recipe 12: Refresh the GitHub copy

The form keeps a backup copy of the questionnaire in the GitHub project (the files in `web/config/` and `web/i18n/`). It only uses it when Google does not answer quickly. After important changes (new questions, a new jump or ending, a new round's "What changed", translations), refresh that copy so the backup matches.

The copy has a fifth file, `docs/flow.md`: the **map of the route**, as a diagram and a table that GitHub draws when you open the file there. Partners never see it. It is made from the same questionnaire, so GitHub's settings check can tell when it is out of date. Never edit it by hand: you change the route in the panel, and this recipe brings the map along.

**Next time: with the v2.1 route and the help videos** ([Recipe 2](#recipe-2-change-the-questions-paste-a-route), [Recipe 21](#recipe-21-add-help-videos-for-partners-the--button)), **but not before the page-weight change below.** The copy in GitHub still holds the old route: the language screen skipped when the link names the language, six area ratings, the support questions, and no help videos. Phones show that old route whenever Google takes more than 6 seconds to answer.

- **Before any refresh, Claude (or a developer) checks the page weight**: what a phone downloads to open the form, at most 300 KB (a limit from the original brief). With v2.1 (83 new texts, each in six languages) the copy comes to about 320 KB, about 107% of the limit: the check of step 3 then reports an error, and GitHub refuses to publish the copy. Decided on 30 Oct: the phone's files will stop carrying the "[TRANSLATE] …" placeholder copies of untranslated texts (partners see English for those texts either way, and the panel still counts what is left to translate), which brings the copy to about 268 KB. That change comes first ([STATE.md](STATE.md)); until then the copy keeps the old route.
- **The refresh matters before the switch to "Anyone"** (go-live), when partners open the form on GitHub Pages. While the web app is Meesho-only, only colleagues open links, and the copy is in test mode anyway.
- Once that change is in: do steps 1 and 2, then give the five downloaded files to Claude (or a developer). Claude puts them in the project and runs the check of step 3; you then save the change to GitHub (step 4).
- While the web app is Meesho-only, the downloaded `survey.json` stays in test mode, as the copy in GitHub is today. Take it anyway when the panel asks "Take a test-mode survey.json?". In step 3 the SUMMARY then says "the test server on this Mac": that is expected in Meesho-only mode, because the survey page the web app serves sends the answers to Google whatever this file says. Once the web app is open to Anyone, refresh the copy again ([Meesho-only mode](#meesho-only-mode-until-it-allows-anyone)).

1. **Publish your latest changes first**, so that the draft and the live version are the same: the banner "Partners still see version … Your saved draft has changes they don't see yet." must be gone. The files are made from the draft. (When the draft is exactly the live version, `survey.json` also carries the live version's name, such as `p7-2026-10-21`, so answers sent while a phone uses the backup still say which version it was. Otherwise it says `draft`, and the card warns "Your draft has changes that are not published…".)
2. **Publish**, card **4. Backup copy in GitHub**. **First check that the card does not warn "The web app address isn't recorded yet".** Without that address, the downloaded `survey.json` keeps the form in test mode (`"mock"`), and putting it on GitHub would stop the online form from sending answers to Google. If you see the warning, record the address first (**Home > Quick links**, **Check and save**: [setup guide, step 10](../apps-script/README.md#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel)). Without it, **Download** or **Copy** of `survey.json` first asks "Take a test-mode survey.json?"; take it anyway only while the form is not live yet. Then click **Download files for the GitHub copy**. The panel prepares the files ("The 5 files are ready to download.") and lists them: `survey.json`, `strings.json`, `whats_changed.json`, `audio_clips.json` and `flow.md`, each with the folder it goes to ("goes to docs/flow.md" for the map). Click **Download** next to **each** of the five (one click each: the browser does not allow one click to download several files). They land in your Downloads folder.
3. Either give the five files to a developer, or put them into the project on the Mac yourself:

   ```bash
   cd ~/NPSF
   cp ~/Downloads/survey.json web/config/survey.json
   cp ~/Downloads/strings.json web/i18n/strings.json
   cp ~/Downloads/whats_changed.json web/config/whats_changed.json
   cp ~/Downloads/audio_clips.json web/config/audio_clips.json
   cp ~/Downloads/flow.md docs/flow.md
   python3 scripts/check_config.py
   ```

   What it does: replaces the five files in the project with the downloaded ones, then checks them. The check needs Node.js on the Mac (see the [README, step 3](../README.md#step-3-check-python-and-nodejs)).

   **You should see** "All good" at the end, and in the SUMMARY, "Answers go to: Google Apps Script (https://script.google.com/macros/s/…/exec)", with the web app address recorded in the panel. The downloaded `survey.json` takes it from there.

   **If the SUMMARY says "the test server on this Mac" instead**, or shows an address that is not your web app's, stop: do not save this to GitHub. (One exception: while the web app is Meesho-only, "the test server on this Mac" is expected, so carry on with step 4; see the note at the top of this recipe.) Otherwise, put the saved copy back:

   ```bash
   git checkout web/config/survey.json
   ```

   What it does: puts back `survey.json` as it was in the last commit, so the online form keeps its address. Then record the right address in the panel (**Home > Quick links**, **Check and save**, or **Change** if one is there), and download the files again.

   If your Downloads folder had older copies, Chrome names the new files `survey (1).json` and so on: delete the old ones first and download again.

4. Save the change to GitHub:

   ```bash
   git status --ignored
   git add web/config web/i18n docs/flow.md
   git commit -m "Refresh the backup copy of the questionnaire"
   git push
   ```

   Before the commit, read the list from `git status --ignored`: only the five files should be listed as changed (fewer if some did not change).

5. Delete the five files from Downloads.

**You should see:** in GitHub's **Actions** tab, a green tick a minute or two later.

### How the route works

The **route** is which screen comes after which. Since 27 Oct 2026 you change it in the route table ([Recipe 2](#recipe-2-change-the-questions-paste-a-route)), and you look at it and test it with the [Map](#recipe-19-see-the-whole-route-on-the-map) and [Try a path](#recipe-20-try-a-path).

- **The table is the route, from top to bottom.** After each row, partners go to the next row, unless that row's **then go to** or one of its **jumps** says otherwise.
- **The first thank-you row ends the main route.** Partners stop there and their answers are sent.
- **Rows below it are other routes and endings.** Partners reach them **only through a jump** (or a **then go to**) from an earlier row. In the panel they show under **Other routes and endings**. Each of these routes must end: give its last row a **then go to** (an ending, or `end`), or put its own ending row right after it. Otherwise its partners would run on into the next route, and **Check** refuses the table.
- **Arrows only go down the table**: to a later row, or to any ending (a thank-you row). So a route can never go round in circles. A row below the main thank-you can't send partners back up into the main route: end its route with an ending of its own, or with the main thank-you (`end` in **then go to**).
- **The list "The route now" shows the route**, read only, with badges such as "↪ goes to question 6 when … ≥ 9" (a jump), "↪ then goes to question 8" (a **then go to**), "Repeats for each area rated low", "Ends the survey" and "Hidden: partners don't see it". A badge with ⚠ points at a problem, and the explanation is written under the card ([If something goes wrong](#if-something-goes-wrong)).
- **Question numbers and row numbers.** The list numbers the screens 1, 2, 3 …; in the table the same screen is one row lower, because the header is row 1. Each card says it: question 6 shows "row 7 in the table".
- **Route changes are content**, like wording: partners get them after **Save** and **Publish**. **Check** (in **Paste a route**) and **Check for problems** (in **Publish**) check the whole route with the same route code the phones run.
- **The route tools** (pasting a route, the Map and Try a path) run that route code inside the panel window. While they load, Questions says "Loading the route tools (pasting a route, the map, Try a path)…". If they can't start there, pasting a route still works through Google, and everything else works too; only the Map, Try a path and the badges are off ([If something goes wrong](#if-something-goes-wrong)).

### The route table: columns, kinds and rules

**The columns** are the table's header row. **Copy the current route** writes them in this order. You may put them in any order, and capitals and brackets don't matter: `Question (English)`, `question_en` and `English` are the same column. A column the panel doesn't know is left out with a warning, except your own note columns (such as **Notes**, **Comments**, **No.** or **Step**), which are left out without a word. Column names in Hindi script work too (for example `प्रश्न (हिंदी)` or just `हिंदी`), and so does `Hindi translation`.

| Column | What to write | An empty cell means |
|---|---|---|
| **code** | The row's permanent code: small letters, digits and `_`, starting with a letter, at most 60 characters, for example `main_reason`. Built-in screens have fixed codes ([the kinds](#the-kinds)). | A built-in gets its standard code; a question gets one made from its English words, with a warning to keep it. |
| **kind** | What the row is: one of [the kinds](#the-kinds). The only column a table must have. | A problem (unless the code is a built-in's, such as `nps`). |
| **question (English)** | The words partners read. For an ending or an info card: its title. | Keep the words it has. A new question needs them. |
| **question (Hindi)** | Your Hindi for the same words. Never machine-translated. | Keep the Hindi it has. |
| **answers** | Only for **pick one** and **pick several**: at least 2 answers, each as `code: English words`, separated by `;`, for example `phone: Phone call; app: In the app; visit: A visit`. Commas and slashes don't separate answers. A label that contains `;` goes in double quotes: `b: "Yes; always"`. List marks (`-`, `1.`) and an AI's formatting (`` `code` ``, `**bold**`) are removed. | Keep the answers it has. A new pick one needs them. |
| **answers (Hindi)** | The same answers in Hindi, with the same codes: `phone: …; app: …`. | Keep. |
| **message (English)** | The longer text of an **info card** or an **ending**, under its title. | Keep. |
| **message (Hindi)** | Its Hindi. | Keep. |
| **required** | `yes` (partners must answer) or `no` (a **Skip** button is shown). | The usual for that kind. |
| **show only if** | A [rule](#rules-show-only-if-and-jumps): the row is shown only when it is true, for example `nps <= 6`. On the `language` and `what changed` rows you may write `always` instead (or `everyone`, or `all partners`), which switches off their usual skip ([the kinds](#the-kinds)). | Everyone sees it, except that the `language` and `what changed` rows keep their usual skip. |
| **then go to** | Where partners go after this row: the code of a **later** row, or of any ending. `end` means the main thank-you screen. | The next row. |
| **jumps** | Exceptions, checked first, for example `if nps >= 9 go to support_gate`. Several are separated by `;` and checked in order. | No jumps. |
| **ask for** | `once`, `each area` or `each area rated low`: ask it once for each area, with the area's name above it. Only for 0 to 10, faces, yes/no, pick one, pick several, voice/typing and info card. | Once. |
| **show** | `yes`, or `no` to hide the row (it keeps its code). | Shown. |

- **Optional, for a 0 to 10 question:** **left end**, **right end** and **hint** (and the same with `(Hindi)`): the words under 0 and under 10, and a line under the buttons. Without them a new question gets the standard words ("Not at all likely" / "Extremely likely"), and an existing one keeps its own. **Copy the current route** doesn't write these columns.
- **Other languages:** a column such as **question (Tamil)** is read too, for words a translator wrote, if the questionnaire has that language (**Settings > Languages**).
- **A column you leave out** keeps what the draft has: for example, a table without a **jumps** column keeps every row's jumps as they are.

#### The kinds

| kind | What partners see | Code |
|---|---|---|
| `language` | The language buttons. Skipped when the link already says the language. With `always` in its **show only if**, every partner sees the buttons, even when the link names the language: that language is then already picked, so **Next** goes on in it (or the partner taps another). An empty **show only if** keeps the usual skip. | `language` |
| `what changed` | The "What changed since your last feedback" card. Skipped when the round has no bullets (**Rounds > What changed**). With `always` in its **show only if**, partners see the card even when the round has nothing new: they then see only its title. An empty **show only if** keeps the usual skip. | `whats_changed` |
| `nps` | "How likely are you to recommend Valmo to another DC owner?", 0 to 10. | must be `nps` |
| `area ratings` | One screen of five faces for each area shown in **Areas & problems**. | `fn_ratings` |
| `problem screens` | "What is the main problem?" for each area rated low, with that area's problems. Comes after the area ratings. | `fn_deep_dives` |
| `support question` | "In the last 30 days, did you contact Valmo support?", yes or no. | must be `support_gate` |
| `support ratings` | The support questions (**Support questions** section) on one screen; usually with `show only if` = `support_gate = yes`. | `support` |
| `thank you` | Says thank you and sends the answers. Write one: it ends the main route and must be shown. (A later `thank you` row with its own words is read as an `ending`.) | `thanks` |
| `ending` | Another thank-you screen with its own title (**question**) and **message**, for another route, **below** the `thank you` row. It sends the answers too, and can't have a **show only if** (partners reach it through a jump or a **then go to**). | your own |
| `0 to 10` | Eleven buttons, 0 to 10. | your own |
| `faces` | Five faces, from 1 (very bad) to 5 (very good). | your own |
| `yes/no` | Two buttons, Yes and No. | your own |
| `pick one` | Your **answers**; the partner taps one. | your own |
| `pick several` | Your **answers**; the partner ticks one or more, then taps **Next**. Under the question the form adds "You can tick more than one." (28 Oct 2026). | your own |
| `voice/typing` | The partner records a voice note or types an answer. | your own |
| `info card` | A title and an optional **message**, with nothing to answer. | your own |

- Each built-in screen appears once at most (thank-you screens excepted). Leave its **question (English)** empty to keep today's words.
- Write `0 to 10` and `faces`, not "0-10" or "1-5": Excel turns those into dates. (If it already did, the Check says the kind is unknown.)
- Never write "multiple choice", "multi choice", "Multi-choice", "multichoice" or "MCQ" (nor "multiple choices", "MCQs" or "MCQ question"): some people mean pick one by them, others pick several, so the Check asks you which one you mean. Write `pick one` or `pick several`. ("Multiple choice" and "MCQ" have been refused since the pick-several release of 28 Oct 2026. Until 30 Oct "multi choice" and "Multi-choice" meant `pick several`; the other spellings were refused as unknown kinds, and now get the same "can mean two things" message.) Only the code `multi_choice` itself, with its underscore, still means `pick several`, also in backticks (`` `multi_choice` ``, as AIs often write it) or with an invisible character copied along with it. "Multi select", "pick all that apply", "tick all that apply" and "checkboxes" are read as `pick several`.
- Other spellings work too, such as "Yes or No", "Pick one answer", "Voice note or typing", "Information card" or "Thanks"; `end` means `ending`. A kind a developer added (in `web/js/types/`) is written with its code.

#### Rules: "show only if" and jumps

A rule is a short sentence: an answer, a test and a value.

| You write | True when… |
|---|---|
| `nps <= 6` | the 0–10 score is 6 or lower (detractors) |
| `nps >= 9` | the score is 9 or 10 (promoters) |
| `support_gate = yes` | they answered Yes to "Did you contact Valmo support?" |
| `support_gate != yes` | they didn't answer Yes (No, or no answer) |
| `fn_rating:payments <= 2` | they rated the area with the code `payments` 2 or lower |
| `fn_rating:payments in (1, 2)` | they rated it 1 or 2 |
| `fn_deep_dive:payments = payout_delayed` | they picked the problem `payout_delayed` for that area |
| `contact_way = phone` | they picked the answer `phone` of the pick-one question `contact_way` |
| `one_fix answered` | they typed or recorded something for `one_fix` (`one_fix not answered`: nothing) |
| `language = hi` | the survey is in Hindi at that moment (`language = Hindi` works too) |
| `round = 2026-R2` | the partner's link is for round `2026-R2` (the round's code exactly, capitals included: the Check warns about a round that doesn't exist, with "Did you mean …?") |
| `nps <= 6 and language = hi` | both are true |
| `nps <= 6 or support_gate = no` | at least one is true |
| `(nps <= 6 or support_gate = no) and language = hi` | brackets: needed whenever you mix `and` and `or` |
| `not (language = hi)` | the opposite |

- **A pick-several question** is tested answer by answer: `areas = load` is true when **load is one of the answers ticked** (with others or alone), `areas != load` when it is not ticked, `areas in (load, app)` when either is, `areas answered` when at least one is ticked. So a follow-up question with `show only if` = `areas = load` is asked of everyone who ticked load: tick three areas, get three follow-ups. `<=` and `>=` make no sense for it and the Check refuses them.
  - **The Map and Try a path write these rules in words** (since 30 Oct 2026): `areas includes load` (for `areas = load`), `areas does not include load` (`!=`), `areas includes one of [load, app]` (`in`), `areas has at least one tick` (`answered`) and `areas has no tick` (`not answered`). Those words are for reading only: in the table, keep writing `=`, `!=`, `in` and `answered` (the Check doesn't read "includes").
- **What each answer can be tested for:** `nps` and any 0 to 10 question: 0 to 10. A faces question: 1 to 5. A yes/no question: `yes` or `no`. A pick-one question: its answer codes. A voice/typing question: only `answered` or `not answered`. An area's rating: `fn_rating:<area code>`, 1 to 5 (or `na`, "I don't handle this", which never counts as low). The problem picked for an area: `fn_deep_dive:<area code>` = a problem code (or `other`). A support rating: `support:<support code>`, 1 to 5. A question asked for each area: `<its code>:<area code>`. The area, problem and support codes are in **Areas & problems** and **Support questions**; the instruction for Claude/ChatGPT lists them too.
- **Only earlier answers.** A rule may test only answers given **before** its row (a jump may also test its own row's answer), plus the language and the round.
- **The tests:** `=`, `!=`, `<=`, `>=`, `in (a, b)`, `answered` and `not answered`. Also understood: `==`, `<>`, `≤`, `≥`, `≠`, `is`, `is not`, `&&`, `||`, and `<` or `>` with whole numbers (`nps < 7` is the same as `nps <= 6`).
- **Values** are what the answers store: `yes`, `hi`, answer codes, numbers. Capitals don't matter (`Yes` is read as `yes`), except in a round's code.

**Jumps** are written `if <rule> go to <code>`, for example `if nps >= 9 go to support_gate`. Several jumps are separated by `;` (or each put on its own line in the cell); they are checked in order, and the first one that is true wins. A jump goes only down the table, or to an ending; `go to end` means the main thank-you screen.

**A rule or a jump?** A rule (**show only if**) shows or skips this one row. A jump moves partners past several rows at once, or to a route of their own.

### Examples in the route table

Each example shows only the columns that matter: leave the others as they are. After each one: **Check**, **Use this route**, then the [everyday loop](#the-everyday-loop-save-preview-publish). Codes such as `main_reason` are examples: choose your own, short and clear.

<a id="recipe-2-add-a-question-only-for-low-scorers-06"></a>

#### A question only for low scorers (0–6)

Partners who score 0 to 6 on "How likely are you to recommend…" are *detractors*. To ask them one extra question, insert a row **right after the `nps` row** (a rule can only look at earlier answers):

| code | kind | question (English) | required | show only if |
|---|---|---|---|---|
| `main_reason` | `voice/typing` | What is the main reason for your score? | `no` | `nps <= 6` |

- For a voice/typing question, `no` (a **Skip** button) is kinder; it is also the usual for that kind.
- For a **pick one** question instead, also fill **answers**, for example `phone: Phone call; app: In the app`. Give it at least two.
- **Try it** with [Try a path](#recipe-20-try-a-path) (the 0–10 answer at 5, then at 9), or Save and **Preview twice**: score 5 (the question must appear) and score 9 (it must not), with **Start again** at the end of the preview between the two tries.
- **You should see** on its card the badge "Only if …" with the rule in words.
- The answers appear in the round's data spreadsheet: spoken and typed answers in the **free_text** tab, the others in the **responses** tab.

<a id="recipe-13-change-where-a-question-usually-goes"></a>

#### Where a question goes next ("then go to")

After a row, partners normally go to the next row. To send **everyone** who answers it somewhere else, write in its **then go to** the code of a later row, or of an ending (for example `one_fix`, or `end` for the main thank-you screen). Everything in between is skipped for everyone, unless a jump leads there.

- A row that nothing leads to any more is an error ("… can never be reached: no arrow leads to it from the start"). So is a rule that tests the answer of a row everyone skips.
- If the row it goes to is hidden (`no` in **show**), partners go where that row would have gone; the Check warns about it.
- A thank-you row or an ending has no **then go to**: partners stop there.
- **You should see** on its card the badge "↪ then goes to question …".

<a id="recipe-14-add-a-jump-promoters-skip-the-area-questions"></a>

#### A jump: promoters skip the area questions

A **jump** sends **some** partners somewhere else, depending on an answer. Here, partners who score 9 or 10 (promoters) skip the area ratings and their problem screens, and go straight to "Did you contact Valmo support?". On the **nps** row:

| code | kind | jumps |
|---|---|---|
| `nps` | `nps` | `if nps >= 9 go to support_gate` |

- **Try it** with Try a path, or Preview twice: score 10 (the next screen must be the support question) and score 5 (the area ratings must come).
- **You should see** on the 0–10 question's card the badge "↪ goes to question 6 when “How likely are you to…” ≥ 9" (with today's questionnaire; the panel shortens long names).
- **Skipped screens send nothing.** In this example promoters send no area ratings, so the dashboard has fewer area scores from promoters.
- **Several jumps** are checked in order, and the first one that is true wins: `if nps >= 9 go to support_gate; if nps <= 3 go to why_low`.
- **Where a jump can go:** a later row, a row below the thank-you screen (another route), or any ending. Never up the table: the Check says "… goes back up to row …".
- **"⚠ this jump can never happen"** on a card means the jump is not used, for example because the row it goes to is hidden or above it, or its rule can't be true. The reason is written under the card.

<a id="recipe-15-ask-a-question-for-each-area"></a>

#### A question for each area

An ordinary question (0 to 10, faces, yes/no, pick one, pick several, voice/typing or info card) can be asked once for each area, with the area's name above it, or only for the areas the partner rated low. For example, after the problem screens:

| code | kind | question (English) | ask for |
|---|---|---|---|
| `callback` | `yes/no` | Should someone from Valmo call you about this? | `each area rated low` |

- `each area`: one screen per area shown in **Areas & problems**, in that order. `each area rated low`: only the areas the partner rated at or below the area's limit (**Ask about problems when rated** in **Areas & problems**: 3 unless you changed it). "I don't handle this" never counts as low.
- The answers are stored as the code, a colon and the area's code, for example `callback:payments`, and a rule tests them the same way: `callback:payments = yes`.
- **"each area rated low" must come after the area ratings.** Above them the Check refuses it, in the column **ask for**.
- `nps` and `support_gate` are always asked once: they fill their own columns of the answers sheet.
- **A live question asked for each area gets new answer names** (`callback:payments` instead of `callback`), so earlier rounds can't be compared with it directly.
- **You should see** the badge **Repeats for each area rated low** (or **Repeats for each area**) on its card. Every repeated screen adds time for the partner: keep the survey short.

<a id="recipe-17-add-an-ending-or-hide-or-delete-one"></a>

#### An extra ending, and hiding one

An **ending** is a thank-you screen: partners stop there and their answers are sent. Besides the main thank-you screen you can add others, for example "Thank you for telling us" for partners who score 0 to 3. Rows below the first thank-you row are other routes: only a jump (or a **then go to**) leads there.

| code | kind | question (English) | message (English) | jumps |
|---|---|---|---|---|
| `nps` | `nps` | | | `if nps <= 3 go to why_low` |
| … | … | | | |
| `thanks` | `thank you` | | | |
| `why_low` | `voice/typing` | What went wrong for you? | | |
| `low_end` | `ending` | Thank you for telling us | Our team will look at what you told us. | |

- Partners who score 0 to 3 answer `why_low`, then reach `low_end` (the next row), and their answers are sent. Everyone else follows the main route.
- **Its words are its own** (the texts `end.low_end.title` and `end.low_end.body`): add the other languages in **Texts & translations**. The closing line under the message is the main thank-you screen's (the text `thanks.close`).
- **Give every route an ending.** If the ending isn't the next row, write its code in the route's last question's **then go to** (an ending may be chosen from anywhere, even above). A question at the very bottom of the table with no **then go to** ends at a standard thank-you screen that the form adds itself.
- **An ending nothing leads to** is refused by the Check. Add the jump, or leave the row out.
- **To hide an ending:** `no` in its **show**. Partners who would reach it end at the main thank-you screen instead; their answers are still sent, and they never go on to the rows below it. The Check warns about each route that now ends there.
- **To remove an ending:** leave its row out of the table (only while it isn't live: once partners reached it in a real round, hide it instead). If the question just above it has no **then go to**, its route would then run on into the rows below: the **Check** of the pasted table and **Check for problems** in Publish both refuse that ("Row 11 ("…") has no "then go to", so partners who answer it go straight on to row 12 ("…"), which starts another route …"; Publish names the same rows as question 10 and question 11). Write an ending's code (or `end`) in that question's **then go to**, or keep an ending row between them. If both routes really should carry on into question 11, write its code there to say so.
- **The main thank-you screen** is always the first thank-you row: it ends the main route, so it must be shown, and a table without any thank-you row is refused.

<a id="recipe-18-show-a-question-only-in-one-language-or-one-round"></a>

#### A question only in one language or one round

Besides earlier answers, a rule (and a jump) can test **the partner's language** and **the round**. An information card only for partners who use the survey in Hindi:

| code | kind | question (English) | message (English) | show only if |
|---|---|---|---|---|
| `hindi_note` | `info card` | A note for you | … | `language = hi` |

For one round: `round = 2026-R2`, with the round's code exactly as in **Rounds**, capitals included.

- **The language must be one of the questionnaire's languages** (`en`, `hi`, `ta`, `te`, `kn`, `ml` today), or the Check refuses it.
- **The partner's language is the one on screen at that moment.** If a partner switches language with the button at the top of the form, the rules are checked again, and screens can appear or disappear. If the screen they are on disappears, **Next** takes them on to the first screen they haven't seen or finished yet, and **Back** keeps working. Answers on screens that left their route stay on the phone but are not sent.
- **The round** is the one in the partner's link (`round=…`).
- **Try it:** [Try a path](#recipe-20-try-a-path) offers the language and (when a rule tests it) the round. In Preview, switch to Hindi with the language button at the top of the form, or pick the round in the **Preview the draft** window.

### Recipe 16: Choose where the problem screens go

The problem screens ("What is the main problem?") come after all the area ratings, as standard. They can also come straight after each low rating.

1. **Settings**, group **Problem screens**.
2. Under **When to ask about problems**, pick:
   - **After all the area ratings (recommended)**: partners rate every area first, then get one problem screen per low area;
   - **Straight after each low rating**: each area's problem screen comes right after its rating.
3. The same group has **Low rating (at or below)** (3 as standard; an area can have its own limit in **Areas & problems**), **A problem must be picked** and **"Other" needs an explanation**.
4. Do the [everyday loop](#the-everyday-loop-save-preview-publish).

**With "Straight after each low rating":**

- The **problem screens** row's place in the table, its rule, its **then go to**, its **jumps** and its **ask for** are not used.
- If that row still has a **then go to**, jumps or an **ask for**, the Check of a pasted table, and **Check for problems** in Publish, warn: "… so this row's "then go to", "jumps" and "ask for" are not used. They change nothing for partners: clear them in the route table (Questions > Paste a route), or choose "After all the area ratings" in that setting." Empty those cells in the table and paste it back. Nothing changes for partners either way.

### Recipe 19: See the whole route on the Map

1. **Questions**, then **Map** (at the top right, next to **Try a path**). To see a pasted route before you use it, click **Map of the pasted route** in the card **2. Paste a route** instead (after a clean **Check**).
2. Pick **Your draft (unsaved changes included)**, **The pasted route (not used yet)** (shown after a clean **Check**, until you change the box or the draft) or **The live version (what partners get now)**.
3. **You should see** the route as a list straight away ("Drawing the map of your draft… Meanwhile, here is the same route as a list."): each screen with its code, its "Only if …", "Asked for each …", "Then: …", "If …: …" and "Otherwise: …".
4. **Within about 20 seconds the drawing replaces the list**: boxes are screens, diamonds are "only if" rules, labelled arrows are jumps, framed boxes are "for each area" loops, and round boxes are endings. The drawing library is large (about 750 KB), so after 6 seconds a note says it is still loading.
5. **← All questions** goes back to Questions.

**A rule on a pick-several answer is written in words** (since 30 Oct 2026), in the list and on the drawing alike (its diamonds, jump labels and "for each" titles): for example "Only if nps <= 8 AND areas includes load." ([the words](#rules-show-only-if-and-jumps)). Other rules keep their signs, such as `nps <= 6` or `contact_way == phone`.

**If the drawing does not come**, after 20 seconds the panel says "The diagram could not be drawn here (…)" and keeps the list, which shows the same route. The drawing library comes from the website `cdn.jsdelivr.net`, which some office networks block. **Open in mermaid.live ↗** draws the same map in a new browser tab; that link holds only the questionnaire's wording and codes, no partner data. **[UNCONFIRMED]** Whether Google's panel window lets the drawing library load at all is tested only in Chrome outside Google; the list always works.

The map of the questionnaire on GitHub, `docs/flow.md`, shows the same kind of drawing ([Recipe 12](#recipe-12-refresh-the-github-copy)).

### Recipe 20: Try a path

See which screens a partner with certain answers gets, without opening the form. Nothing is sent or saved.

1. **Questions**, then **Try a path** (at the top right, next to **Map**). It uses your draft as it is in the window (unsaved changes included). To try a pasted route before you use it, click **Try a path on it** in the card **2. Paste a route** (after a clean **Check**): a card at the top then offers **Your draft (unsaved changes included)** and **The pasted route (not used yet)**.
2. In the card **Answers and the link**, set:
   - **Language**;
   - **The partner’s link already says the language (&lang=…)**: tick it to try a link that names the language. The language screen is then skipped, unless the `language` row says `always` in its **show only if**: then the screen still shows, with that language already picked;
   - **“What changed” items for the round** (0 to 3);
   - **Round** (only when a rule tests the round);
   - under **Answers that rules and jumps test**, one list per answer that a rule, a jump or "each area rated low" tests. Each starts at **(not answered)**. A **pick several** answer gets tick boxes instead, one per answer, marked "(tick any)": tick as many as you like; none ticked means not answered.
3. **You should see**, in the card **What this partner gets** (**What this partner gets on the pasted route** for a pasted one):
   - how many screens, and the screens in order. The ending is marked **Ends: sends the answers**. **⏸ Next needs an answer** marks a screen where Next waits for an answer that this tool doesn't ask (it asks only the answers that rules test);
   - **Skipped**, with the reason for each skipped screen, for example "only if nps <= 8 AND areas includes load: not true here (nps is 5, areas is ["payments"])" (a pick-several rule [in words](#rules-show-only-if-and-jumps));
   - **What would be sent**: how many answers, ratings and typed or recorded items. **Show the data** shows the whole message.
4. Change any list: the result changes at once. **← All questions** goes back.

<a id="recipe-21-add-help-videos-for-partners-the--button"></a>
### Recipe 21: Add help videos for partners (the ⓘ button)

Partners can watch two short videos from inside the form: **How to fill this form**, and **How your answers help** (a neutral one: what answers are used for, never how to answer). Since 28 Oct 2026.

1. Put each video on **YouTube** as **Unlisted** (anyone with the link can watch; it does not show up in searches). YouTube plays smoothly on weak mobile data, and nothing loads until a partner taps.
2. **Settings > Help videos**: paste the links into **Video: how to fill the form** and **Video: how answers help** (one is enough). A link must start with `https://`, for example `https://youtu.be/AbCdEfGhIjK`.
3. **Save**, **Preview**: a round **ⓘ** button appears in the top bar of every screen, next to the language button (on the language screen itself, where the language button is hidden, it is there on its own). It opens a sheet with one button per video; the video plays inside the form, and closing the sheet stops it. The phone's **Back** key also closes the sheet (and stops the video): the survey stays on its screen. If the page is reloaded while the sheet is open, the sheet is gone and no **Back** press is lost: the next one goes one screen back, as usual. A link that is not YouTube opens in a new tab instead.
4. **Try it on a phone before you publish.** In the **Preview the draft** window, click **Copy** next to the link, send it to yourself and open it on your phone (while the web app is Meesho-only, in Chrome signed in with your Meesho account). Tap **ⓘ**, then each video's button. **You should see** the video play inside the form. Press the phone's **Back** key: the sheet closes, and the survey is still on the same screen.
5. **Publish**. The videos reach partners only with a Publish, even if you published the route just before.

- **YouTube never sees the partner's link.** The form tells YouTube only the site's address (on GitHub Pages: `https://pranavakellaps37.github.io/`), never the rest of the page's address, so never a partner's link with its DC and secret code. (The form's page sends its address to no other site. YouTube refuses to play a video that gets no address at all, with "Video player configuration error, Error 153", so the video's frame alone sends the site's address. Since 30 Oct 2026.)
- **[UNCONFIRMED] In Meesho-only mode** the survey runs inside Google's own page ([Meesho-only mode](#meesho-only-mode-until-it-allows-anyone)), and whether a YouTube video plays there has never been tried on real Google: the videos were tried only outside it, in Chrome (30 Oct 2026). Step 4 tests exactly this. Which address YouTube gets there is untested too (probably Google's own address, not the GitHub one). If a video doesn't play there, partners can still answer everything; tell whoever maintains the scripts.
- **The words** (the button's name "Help" and the two titles) are in **Texts & translations**: `help.button`, `help.how_to_fill`, `help.why_it_helps`, in English and Hindi, the other languages waiting for a translator like every text.
- **One video per link, for every language.** If you make a Hindi version, use it as the link (or put both languages in one video).
- **To remove a video**, empty its box and Publish: the button disappears when no video is left.

### A live answer of a pick-one question

(The same goes for a **pick several** question.) Once the first real round has opened, every answer of a **pick one** question that partners could pick in a real round is locked: the dashboard compares rounds by its code. It must stay in its question's **answers** cell, with the same code. A table that leaves it out (or changes its code) is refused by the Check, for example: "Row 9 (contact_way), answers: the answer "visit" was already picked by partners in a real round, so it must stay (the dashboard compares rounds by its code). Put it back in "answers"; you can still change its words."

- **To change what partners read**, change its words after the colon (`visit: A visit to our office`), or in **Texts & translations**. Its code stays.
- **To stop asking the question**, hide the whole question (`no` in **show**).
- **If such an answer disappears anyway** (after typing in the **Screens** tab, or an **Import from GitHub**), **Check for problems** shows an error: "The answer "…" of the question "…" was answered in an earlier published version but is no longer in the draft. Partners answered it in a real round, so it can never be deleted or re-coded, and Publish waits until it is back. Put it back in the list of answers …". Add it back with exactly the same code.

---

## Meesho-only mode (until IT allows "Anyone")

Partners reach the survey only if the web app's **Who has access** is **Anyone**. If Meesho's Google settings don't offer that yet, the web app can run as **Anyone within meesho.com** meanwhile, so colleagues can try the real thing, for example to show it to a manager before approval ([setup guide, step 8](../apps-script/README.md#step-8-first-check-that-anyone-is-offered)).

- **How the panel knows:** when you record the web app address (**Home > Quick links > Check and save**), the panel says "Saved as Meesho-only", and a yellow note on **Home** and in **Links** reminds you.
- **What changes:** the web app shows the survey page itself, to people signed in with a Meesho Google account. **Links** and **Preview** open the survey through the web app's address, so make the links again after recording it. Answers, numbers, Publish and everything else work as usual.
- **What doesn't work yet:** partners (no Meesho account) can't open those links, and the GitHub copy of the questionnaire stays in test mode (the **Backup copy in GitHub** card says why). Voice notes may not work inside Google's page; typing always does.
- **[UNCONFIRMED]:** whether the help videos play inside Google's page. It has never been tried on real Google: play one in Preview on a phone before you rely on them ([Recipe 21](#recipe-21-add-help-videos-for-partners-the--button), step 4).
- **Switching up, once IT allows "Anyone":** in the Apps Script editor, **Deploy > Manage deployments >** pencil icon (Edit) > **Who has access: Anyone** > **Deploy** (the address stays the same). Then in the panel: **Home > Quick links > Change**, the same address, **Check and save**. The panel says the web app "is open to anyone now". Make the links again (they now open the form on GitHub Pages) and refresh the GitHub copy ([Recipe 12](#recipe-12-refresh-the-github-copy); with v2.1 it first needs the page-weight change described there).

## What the errors and warnings mean

**Check for problems** (in **Publish**, card **1. Check for problems**) lists **errors** ("✖ … problems to fix before publishing") and **warnings** ("… warnings (publishing still works)"), and shows the questionnaire's size for phones. Each one names where the problem is (for example "Problems › payments/payout_delayed", "Settings › Longest voice note (seconds)" or "Questions › question 10") and has a **Go there** button. For a question, **Go there** opens **Questions** at that question's card, with a yellow note saying which row and column of the route table to change, for example: "To fix question 6, change row 7 of the route table (code callback, its "show only if" column): Copy the current route, change it in Excel, paste it back under "Paste a route", Check, then Use this route. The problem: …". **Close** removes the note ([Recipe 2](#recipe-2-change-the-questions-paste-a-route)). The route is checked by the same route code the phones run, so the messages name the question ("Question 10 ("…")") and often end with its code ("(Its code is …)"). The exact wording comes from the panel; the tables explain the common ones.

**Publish uses the route table's words** (since 28 Oct 2026): "then go to", "jumps", "show only if", "ask for", "kind" and "show" are the columns of the route table, and "question 6" is row 7 of the table (the header is row 1).

The **Check** of a pasted table uses the table's own words; its messages are explained [below](#when-you-check-a-pasted-route).

**Errors (they block Publish):**

| It is about… | What it means | What to do |
|---|---|---|
| A setting that is out of range, or of the wrong kind | For example a number too big, or text where a number belongs. | Go there and use a value in the range the message gives. |
| A colour | Colours must be codes like `#4B2E83`: `#` and 6 characters. | Use the colour picker in **Look & feel**. |
| The default or backup language | It is switched off in the language list. | Switch it on in **Settings**, or choose another. |
| The faces | There must be exactly 5. | Fix them in **Look & feel**. |
| The form address | It must start with `https://` and end with `/`. | Fix it in **Settings > Form address**. |
| A code (question, area, chip, option, support item, language) | It is empty, repeated, or uses characters that are not allowed. `other` is reserved for the automatic Other chip. | For a question or an answer: fix its code in the route table (small letters, digits and `_`), or leave the code cell empty and the panel makes one from the English. For an area, problem or support item: in its section. Or ask an admin. |
| The main thank-you screen ("There is no thank-you screen", "The thank-you screen (question 9) is hidden", or "… must be the last one, but … no jump leads there") | The main route must end with a thank-you screen that is switched on: the answers are sent from it. Screens below it are allowed only when a jump leads to them. | In the route table: `yes` in the first thank-you row's **show**. For rows below it: add a jump to them ([example](#recipe-14-add-a-jump-promoters-skip-the-area-questions)), move them above it, or write `no` in their **show**. |
| A screen below the thank-you screen ("Question 11 (…) comes after the thank-you screen (question 9), but no jump leads to it") | Partners would never see it. | Add a jump to it in an earlier row's **jumps**, move its row above the thank-you row, or write `no` in its **show**. |
| A screen nothing leads to ("… can never be reached: no arrow leads to it from the start") | A **then go to** or a jump makes every partner skip it. | Point an earlier row's **then go to** or **jumps** at it ([example](#recipe-13-change-where-a-question-usually-goes)), or leave the row out. |
| A route that runs on into another route ("Question 10 (…) has no "then go to", so partners who answer it go straight on to question 11 (…), which starts another route: question 3 (…) jumps there.") | Usually it happens after removing an ending. The **Check** of a pasted table finds it too. | Write an ending's code (or `end`) in that question's **then go to**, or keep an ending row between the two routes ([An extra ending](#recipe-17-add-an-ending-or-hide-or-delete-one)). |
| The order of screens | For example the problem screens come before the area ratings, or a question asked "for each area rated low" comes before them (its message mentions its "repeat for" filter). | Move the rows of the route table back into a sensible order: the area ratings first. |
| A question without text, or a choice question without options | Partners would see an empty screen. | Fill its **question (English)** (and, for a pick one, its **answers**) in the route table. |
| A rule (the table's **show only if**; Publish may say "Only show it if…") or a jump's condition | It points at a question that comes **later**, is hidden or no longer exists, tests a value no partner can give (for example 11 on the 0–10 question), or the rule is incomplete. | Fix the row's **show only if** or **jumps** cell ([the rules](#rules-show-only-if-and-jumps)), or move the row below the one it depends on. |
| The question with the code `nps` or `support_gate` is missing | Its answers fill their own column (`nps` or `support_contacted`) in every round's answers sheet, and the dashboard's headline score reads `nps`. Neither the panel nor a pasted route table can remove these two (the **Check** refuses it): this happens only after a hand edit of the **Screens** tab, or an **Import from GitHub** of files without them. | Undo the change, or add the row back with exactly that code. To stop asking it, hide it instead (`no` in **show**). |
| The 0–10 question or "Did you contact Valmo support?" changed its kind ("… must stay of the kind "0 to 10 question"") | Their answers fill fixed columns of the answers sheet. This happens only after a hand edit of the **Screens** tab. | Put its kind back (in the **type** column: `nps_0_10` for `nps`, `yes_no` for `support_gate`), or give the new question another code. |
| A question partners answered changed its kind ("… is now of the kind "faces", but partners have already answered it as a question of the kind "voice/typing", so its kind can't change") | Its answers would mean something else from one round to the next, and the dashboard compares rounds by its code. This check starts once the first real round has opened. | In the route table, put its **kind** back. To ask something else, write `no` in its **show** and add the new question in a new row with a new code. |
| A code partners answered ("… was answered in an earlier published version but is no longer in the draft. Partners answered it in a real round, so it can never be deleted or re-coded, and Publish waits until it is back.") The start may also read "… is live today but is no longer in the draft." | Something partners answered after the first real round opened was deleted or given another code, usually by a hand edit of the tabs or an **Import from GitHub** ([golden rule 3](#the-golden-rules)). | Put it back with exactly the same code (a question: add its row back to the route table). To stop asking it, hide it (`no` in **show**); to change what partners read, change its wording. An answer of a pick-one question can't be hidden: put it back ([live answers](#a-live-answer-of-a-pick-one-question)). |
| The form on GitHub ("The form on GitHub is older than this control panel: upload the new form code first, wait for the green tick, then publish.", at **Settings › Form address (web link)**) | Your version has a route the old form on GitHub doesn't understand: its phones would ignore it and show the form's stored copy. | Ask whoever looks after GitHub to upload the newest project files and wait for the green tick in GitHub's **Actions** tab. Then publish again. |
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
| Codes that are live today but missing from the draft ("… is live today but is no longer in the draft") | You deleted or renamed something partners already answered. The dashboard compares rounds by code. This check starts once the first real round has opened; before that, codes may still change. If the message goes on "Partners answered it in a real round, so it can never be deleted or re-coded", it is an **error** instead (see the errors above). | **Undo it**: rename the label instead of the code, and hide instead of deleting (a question: put its row back in the route table with `no` in **show**). |
| The 0–10 question or "Did you contact Valmo support?" is hidden ("… is hidden, so the support_contacted column of every round's answers sheet stays empty while it is") | Its own column of the answers sheet stays empty while it is hidden. Hiding "Did you contact Valmo support?" also gives an **error** on the support ratings question, whose rule tests its answer. | Show it again (`yes` in its **show**), unless that is what you want. If you keep it hidden, hide the support ratings row too, or change its rule. |
| An ending that is hidden ("… an ending that is hidden, so partners end at the main thank-you screen, question 9 (…), instead …") | Normal after you hide an ending: its partners still send their answers, from the main thank-you screen ([An extra ending](#recipe-17-add-an-ending-or-hide-or-delete-one)). | Nothing, if that is what you want. Otherwise show the ending again (`yes` in its **show**). |
| A jump or a **then go to** that leads to a hidden question ("… goes to question 6 (…), which is hidden, so it goes to question 7 (…) instead") | Partners go where the hidden question would have gone. | Nothing, if that is what you want. Otherwise change that row's **then go to** or **jumps** in the route table, or show the question again. |
| Left-overs on the problem screens row ("… so this row's "then go to", "jumps" and "ask for" are not used. They change nothing for partners: clear them in the route table …") | The problem screens come straight after each low rating, so that row's **then go to**, **jumps** and **ask for** are not used. | Empty those three cells of the problem screens row in the route table and paste it back ([Recipe 16](#recipe-16-choose-where-the-problem-screens-go)). |
| The list of codes partners answered is nearly full ("The list of every code partners have answered under is … characters long") | Google keeps it in one small setting of the script. When it is full, newly added codes are no longer protected. | Ask whoever maintains the scripts. |
| A round whose code contains DEMO, such as `DEMO-R1` ("fake demo content") | DEMO rounds hold fake content. This warning is normal: it shows as long as `DEMO-R1` has its sample bullets. | Never open it or send its links to real partners. |
| An open round whose name contains DEMO | DEMO rounds hold fake content. | Close it, unless you are testing on purpose. |
| `[SAMPLE]` in a real round's "What changed" | Sample text was left in. | Replace it with real bullets. |

### When you Check a pasted route

**Check** in **Questions > 2. Paste a route** lists **problems** (they stop **Use this route**; nothing changes in your draft) and **warnings** (they don't stop you). Each one is labelled with where it is: **Row 5 · jumps** is row 5 of your table as Excel numbers it (the header is row 1), column **jumps**; **The whole table** or **Column "…"** when it is about the whole table or a column name. The message itself starts the same way, "Row 5 (nps), jumps: …", with the row's code in brackets; the messages of the route checker name the row as "Row 4 ("How likely are you…")". Fix the table in Excel (or ask the AI to), copy it again, click **Clear**, paste and **Check**.

**On a row with `no` in show**, problems with its rule, jumps or **then go to** are only warnings: they aren't used while the row is hidden.

**Problems (they stop Use this route):**

| The message says… | What it means | What to do |
|---|---|---|
| "The header row could not be found." | No line of the pasted text names at least two of the columns. | Copy the header row together with your rows (**Cmd+A** in Excel selects both), from the template or **Copy the current route**. |
| "This looks like the Sheet's Screens tab. In the control panel use Questions > Copy the current route, change that table, and paste it here." | The pasted rows come from the Sheet's own **Screens** tab (its columns are `id`, `type`, `text` …), not from the route table. | Do what it says: **Copy the current route**, change that table, paste it. |
| "Below the table there is a second table with other columns ("…"). Paste one table only: the route, with one header row." | An AI added another table (for example a list of the codes) under the route. | Copy only the route table. (A second table with the **same** columns is joined to the first, with a warning.) |
| "The table has no "kind" column, so the panel cannot tell what each row is." | **kind** is the one column every table needs. | Add a column named `kind`. |
| "The table has its header row but no rows under it." | Only the header was pasted. | Copy the whole table. |
| "The column "…" means the same as the column "…". Keep only one of them." | Two columns are read as the same one, for example `question` and `question (English)`. | Delete one of the two columns. |
| "this row has more cells than the header row has columns (…), so some of its words would be lost." | Usually a comma inside a text of a CSV file, or a `|` inside a text of an AI's table; otherwise a column name is missing. | Put that text in "double quotes" (CSV), write the `|` as `\|` (an AI's table), or add the missing column name. |
| "the kind is empty. Write one of: …" | The **kind** cell is empty. | Write one of [the kinds](#the-kinds). |
| ""…" can mean two things: write "pick one" when partners choose one answer, or "pick several" when they may tick more than one." | The kind says "multiple choice", "multiple choices", "multiple choice question", "multi choice", "Multi-choice", "multi choice question", "multichoice", "MCQ", "MCQs" or "MCQ question" (capitals don't matter): some people mean pick one by these, others pick several. ("multiple choice", "multiple choice question", "multi choice question" and "MCQ" since 28 Oct 2026, the others since 30 Oct; until then "multi choice" and "Multi-choice" were read as pick several.) This is the row's only problem: the rules that test its answer get no "is not an answer of any row" messages of their own. The code `multi_choice` itself (also in backticks) is read as pick several. | Write `pick one` or `pick several` ([the kinds](#the-kinds)). |
| ""…" is not a kind the panel knows. Did you mean "…"? The kinds are: …" | A typo, or Excel changed the cell: it turns `0-10` and `1-5` into dates such as `10-Jan`. | Write one of the kinds listed; `0 to 10` and `faces` instead of 0-10 and 1-5. |
| "there is already a "…" row (row …). It can appear only once: remove one of them." | A built-in screen (language, what changed, area ratings, problem screens, support ratings) appears twice. | Remove one of the two rows. |
| ""…" cannot be a code: use small letters a-z, digits and _, starting with a letter (for example "…")." | The code has spaces or other signs, or starts with a digit. (Capitals alone are fine: they are read as small letters.) | Use the code the message suggests, or one like it. |
| "the code is … characters long; the most is 60." | | Use a shorter code. |
| "the same code as row …. Every row needs its own code, because answers are saved under it." | Two rows share a code. | Give one of them another code (keep the one partners answered). |
| "a "nps" row must have the code "nps" …" or "a "support question" row must have the code "support_gate" …" | These two fill their own columns of every answers sheet. | Write `nps` / `support_gate` as the code. For another 0 to 10 question use the kind `0 to 10`; for another yes/no question, `yes/no`. |
| "the code "nps" belongs to the NPS question, so its kind must be "nps"." (or `support_gate`: "support question") | The code `nps` or `support_gate` is on another kind of row. | Put the right kind back, or give your new question another code. |
| ""support_comment" is kept for the comment under the support ratings. Use another code." | | Use another code. |
| ""…" cannot be the code of a question: the rules read it as …" | Words such as `language`, `round`, `and`, `or`, `not`, `if` or `answered` mean something in rules. | Use another code, for example `language_pref`. |
| "the code "…" cannot be used here: its question text (q.…) holds the words of the area ratings …" (or the problem screens, the support ratings, the support comment) | Codes such as `fn_rating`, `deep_dive`, `tell_more` or `support_block` would change a built-in screen's words. | Use another code. |
| ""…" is not yes or no." (**show**), or "… is not yes or no (leave it empty for the usual)." (**required**) | | Write `yes` or `no` (or leave **required** empty). |
| "the rule "…" cannot be read: …" | The **show only if** cell isn't a rule the panel understands. The end of the message says what is wrong and where, for example "a value is missing", "a comparison (=, !=, <=, >=, in, answered) is missing after …", "a "(" is not closed with ")"" or "there is something after the end of the rule … Join two tests with "and" or "or"." | Write it like [the rules](#rules-show-only-if-and-jumps): `nps <= 6`, `support_gate = yes`. |
| "… it mixes "and" and "or" without brackets, so it is not clear which goes first." | | Add brackets: `(nps <= 6 and support_gate = yes) or one_fix answered`. |
| "jump 1 ("…"): it does not say where to go." / "… the rule before "go to" is missing." / "… the code to go to is missing after "go to"." | The **jumps** cell isn't written as `if <rule> go to <code>`. | Write each jump like `if nps >= 9 go to support_gate`; separate several with `;`. |
| ""then go to" goes to "…", but no row has that code. Did you mean "…"?" (also "jump 1 goes to …") | A typo, or that row isn't in the table. | Correct the code, or add the row. |
| "… goes to this row itself. Write a later row or an ending." | | Write a later row's code, or an ending's. |
| "… goes back up to row … ("…"). Arrows may only go down the table (to a later row) or to an ending (a thank-you row), so a route can never go round in circles." | Partners can't be sent back up; only an ending may be above. | Send them to a later row or an ending, or move the rows. |
| ""…" is not an answer of any row in this table." (often with a hint) | A rule or jump tests something no row stores. (Not given for the answer of a row whose kind the Check couldn't read: that row's own problem is the one to fix.) The hint says how to write it: "Name the area: fn_rating:<area>, for example fn_rating:losses", "Problems are tested one area at a time: write fn_deep_dive:<area>", "Support ratings are tested one at a time: write support:<code>", "That question is asked once per area, so name the area: …", "There is no area "…". The areas are: …", or "Did you mean "…"?". | Write the answer the way the hint says. |
| "… Row … is a "…" row: it has no answer to test." | The rule tests a row that stores no answer (an info card, a thank-you …). | Test another answer. |
| ""…" is not one of the questionnaire's languages (en, hi, …)." | `language = …` names a language the questionnaire doesn't have. | Use one of the codes listed (or its name: `Hindi`). |
| "its rule ("show only if") tests "…", which row … answers, but that screen never comes before this point, so there is no answer yet. Move … above …, or test an earlier answer." | A rule tests an answer given **later** (or only on another route). | Move the row below the question it tests, or test an earlier answer. |
| "its "repeat for" filter ("where") tests "fn_rating:…", which row … (fn_ratings) answers, but that screen never comes before this point …" (column **ask for**) | `each area rated low` above the area ratings. | Move the row below the area ratings. |
| "its jump to "…" tests "…", but what answers it is hidden (switched off), so there is never an answer. Switch it on again, or change the rule." | A rule or jump tests a row with `no` in **show**. | Show that row again, or test another answer. |
| "a "…" row is never asked once per area. Only these kinds can be: …. Leave "ask for" empty." | **ask for** on a built-in screen or an ending. | Leave **ask for** empty. |
| ""…" is not one of: once (empty), each area, each area rated low." | | Write one of those (or leave it empty). |
| "the question is empty: write it in English." / "the ending's title (the question column) is empty: write it in English." | A new question (or ending) needs its English words. | Fill **question (English)**. |
| "a "pick one" question needs its answers, written like: phone: Phone call; app: In the app" | | Fill **answers**. |
| "a "pick one" question needs at least 2 answers, separated by ";" …" (and "Commas and slashes don't separate answers: use ";".") | One answer only, often because the answers were separated by commas. | Separate the answers with `;`. |
| "the answer "…" has no code, but the answers around it have one: is there a ";" inside a label? Put that label in double quotes, like: …" | A label contains `;`, so it was cut in two. | Put that label in double quotes: `b: "Yes; always"`. |
| "looks like a text key ("q.one_fix"), not words. Write the words partners should see." | The cell holds a text's name (its key), not its words, usually after copying the Sheet's tabs. | Write the words, or leave the cell empty to keep today's words. |
| "partners have already answered it as a question of the kind "…", so its kind can't change …" (column **kind**) | A question partners answered got another kind. | Put its kind back. To ask something else, write `no` in its **show** and add a new row with a new code. |
| "Row … has no "then go to", so partners who answer it go straight on to row …, which starts another route: row … jumps there. …" | A route below the thank-you row has no end, so its partners would run on into the next route (usually after removing an ending). | Write where it goes in its **then go to** (its own ending, or `end`), or add an ending row between the two routes. |
| "endings go below the "thank you" row (row …) …" | An `ending` row is above the main `thank you` row: partners reaching it would never see the rows after it. | Move it below the `thank you` row. |
| "an ending can't have a "show only if": partners reach it through a jump or a "then go to". Leave the cell empty." | A rule on a `thank you` or `ending` row. | Empty its **show only if**. |
| "two answers have the code "…". Every answer needs its own code." | | Give each answer its own code. |
| "the answer "…" has no words: write them in English, like: …" | | Write the words after the colon. |
| "these words go into the same text as row … (…), but they are different." | Two rows would write different words into one text. | Make the words the same, or give one of the rows its own words another way (for a second thank-you screen, the kind `ending`). |
| "The table has no row with the code "nps" (kind: nps). …" (or `support_gate`, kind: support question) | These two fill their own columns of every answers sheet, so they can never be removed. | Put the row back. To stop asking it, keep the row and write `no` in **show**. |
| "The table has no thank-you row. Add one (kind: thank you) after the last question: the answers are sent from it." | | Add a `thank you` row after the last question of the main route. |
| "the first thank-you row ends the main route and sends the answers, so it must be shown: write yes in "show"." | | `yes` in its **show**. |
| "the problem screens ask about the areas rated low, but there is no shown "area ratings" row …" / "the problem screens must come after the area ratings (row …) …" | | Add (or show) the `area ratings` row, above the problem screens row. |
| "The table has no row with the code "…", but partners already answered it in a real round, so it can never be removed …" | A question partners answered is missing from the table, or its code was changed ([golden rule 3](#the-golden-rules)). | Put its row back with the same code. To stop asking it, write `no` in **show**. |
| "the answer "…" was already picked by partners in a real round, so it must stay …" | An answer of a pick-one question partners picked is missing (or re-coded). | Put it back in **answers** with its code; you can change its words ([live answers](#a-live-answer-of-a-pick-one-question)). |
| "Row … ("…") can never be reached: no arrow leads to it from the start. Point the "then go to" of an earlier screen at it, or remove it." | Usually an ending or a question below the thank-you row that no jump leads to, or a row everyone skips. | Add a jump (or a **then go to**) to it in an earlier row, or leave it out. |
| "The table could not be read (…). Check that it is the whole table, header row first." | Something unexpected went wrong while reading it. | Paste the whole table again, header row first. If it keeps happening, send the message to whoever maintains the scripts. |
| "The route could not be checked here, so it can't be used yet. Close the panel, open it again and press Check once more." | The route checker didn't run on this table. | Do what it says. |

**Warnings (they don't stop you):**

| The message says… | What it means | What to do |
|---|---|---|
| "The line of other text above the table is left out." (or "The 3 lines …", or "… below the table …") | Words above or below the table, for example the AI's introduction. | Nothing. |
| "Left out of the table, as the line under it says: "…". Check whether it is needed." | The AI wrote a "Left out: …" line under its table, naming notes that didn't fit. | Read it: add what you need to the table yourself, or ask the AI. |
| "A second table with the same columns follows the first one: its … rows were added after the first table, as rows … to …. …" | The paste held two tables with the same header, for example a long answer split in two. | Check that the second part isn't an old copy of the route: each code may appear only once. |
| ""NA" was read as an empty cell, so the words stay as they are. Leave a cell empty when you don't want to change it." | A placeholder (`NA`, `-`, `TBD`, `(to be translated)` …) in a text cell counts as empty. | Nothing; next time leave the cell empty. |
| "new Hindi words: "…". Keep them only if a person wrote them: the panel never translates, and an AI must not either." (or "the Hindi words change: "…" -> "…". …") | The table adds or changes Hindi (or another language's words). | Keep them only if you, or a person you trust, wrote them. If an AI made them up, empty those cells and paste again. |
| "the English of a built-in screen changes: "…" -> "…". Partners see it, so check that this is what you want." | A built-in screen (for example `nps`) gets new English. | Nothing, if you meant it; have the Hindi checked too. |
| "only the first "thank you" row is the main thank-you screen; this row was read as an "ending" with its own words. Write ending in its kind." | A second `thank you` row has its own words. | Write `ending` in its **kind**. |
| "the rule tests the round "…", but no round has that id (the rounds are: …). Did you mean "…"? Round ids must match exactly." | The rule names a round that doesn't exist, or with other capitals. | Write the round's code exactly as in **Rounds**. |
| "this line is not a row of the table, so it is left out: "…"." | Words under the table, or a line with a single cell and no kind. | Nothing, unless it was meant to be a row: then give it a kind. |
| "The column "…" is not one the panel reads, so it is left out. The columns are: …" (or "… left out, with the words in it (… rows)") | A column name the panel doesn't know, perhaps a typo. | If it was meant to be read, rename it to one of the columns listed. |
| "The column "…" is left out: Tamil is not one of the questionnaire's languages (Settings > Languages)." | | Add the language in **Settings > Languages** first, if you want it. |
| "the kind is empty, so the row is read as "…" (its code says so)." | | Nothing; or write the kind. |
| "codes are written in small letters, so "…" is read as "…"." | | Nothing. |
| "the code was empty, so the panel made one from the English question: "…". Answers are saved under it, so keep it from now on." | | Write that code into your table, and keep it. (Before the first real round you may still choose a shorter one.) |
| "answers without a code got one made from their English: …" / "the answer code "…" is written "…"" | | Write those codes into your table, like `phone: Phone call`, and keep them. |
| "it has … answers but "answers" has …, so they are matched in order." (column **answers (Hindi)**) | The Hindi answers have no codes, and their number differs. | Write the Hindi answers with their codes: `phone: …; app: …`. |
| "only "pick one" and "pick several" questions have answers to write here, so this is left out." | | Nothing (or empty the cell). |
| "a "…" row has nothing to answer, so "required" changes nothing." / "a "…" row shows no message, so it is left out." | | Nothing (or empty the cell). |
| "the Hindi words are left out: write the English too." | A new text has Hindi but no English. | Write the English. |
| "a thank-you row ends the survey, so its "then go to" and jumps are not used." | | Empty those cells. |
| "The current questionnaire has a row "…" (…) that this table does not have: using the table removes it." | You left that row out. | Nothing, if you meant to remove it. Otherwise put it back, or keep it hidden with `no` in **show**. |
| "the English changed but the Tamil did not: check it in Texts & translations (…)." | A real translation was kept while the English changed. | Have the translator check it ([Recipe 5](#recipe-5-translate-a-language)). |
| "… an ending that is hidden, so partners end at the main thank-you screen, row … (…), instead …", or "… which is hidden, so it goes to …" | A jump or **then go to** leads to a hidden row. | Nothing, if that is what you want. |
| "… so this row's "then go to", "jumps" and "ask for" are not used …" | [Recipe 16](#recipe-16-choose-where-the-problem-screens-go). | Empty those cells. |

---

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| A colleague can't open a link while the panel says "Meesho-only" (often Google's page "Sorry, unable to open the file at this time") | They opened it **inside another app's built-in browser** (Instagram, WhatsApp, Slack, Gmail on a phone), which isn't signed in to their Google account; or they aren't signed in with their Meesho Google account in that browser; or **Who has access** is **Only myself** (the panel can't tell that apart from **Anyone within meesho.com**). | Open the link in Chrome or Safari instead (in the app's browser: the compass or ⋯ button > **Open in Safari / Chrome**, or copy the link), signed in with the Meesho account (a private window with only that account is safest). If it still fails, check in the Apps Script editor: **Deploy > Manage deployments**: **Who has access** must be **Anyone within meesho.com**. Partners won't have this problem once the access is **Anyone**: their links then open as a normal web page, with no sign-in. |
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
| **Bring back your unsaved changes?** when the panel opens | The panel was closed last time before you saved. | **Bring them back** and **Save**, or **Throw them away**. The changes stay on this computer until you click one of the two ([more](#a-tour-of-the-panel)). |
| Publish is blocked | **Check for problems** found errors. | Use each **Go there** button, fix, and publish again. |
| **Delete** is greyed out on an area, a problem or a support item | It is live and the first real round has opened: earlier answers use its code. (Before that, live items can still be deleted.) | Click it to see why, then switch it to **Hidden** instead. For a question: write `no` in its **show** in the route table; the **Check** refuses a table that leaves out a question partners answered, or `nps` and `support_gate` at any time ([When you Check a pasted route](#when-you-check-a-pasted-route)). |
| There are no **Edit**, **Hide**, **Delete** or **↑ ↓** buttons on the questions, and no **Add a question** | Since 27 Oct 2026 the questions are changed only through the route table; the list **The route now** is read only. | Use **Copy the current route**, change it, paste it back ([Recipe 2](#recipe-2-change-the-questions-paste-a-route)). |
| **Questions** says "No questions yet" | The draft in this Sheet is empty: the questionnaire was never imported. | Click **Go to Settings** and use **Import from GitHub** first: it brings the questions, languages, areas, support questions and texts. Then change the route with the table. |
| A message "Paste the table into the box first (with its header row), then press Check." | **Check** was clicked with an empty box. | Paste the whole table, header row included, then **Check**. |
| Under the paste box: "The table in the box changed since this check: press Check again." or "Your draft changed since this check: press Check again." (and the buttons say "Press Check again first …") | The box or the draft changed after the last **Check**, so its result may no longer be right. | Click **Check** again. |
| A message "The table was checked once more and now has problems (see the list), so nothing was changed." | **Use this route** checks again against your draft as it is now, and something changed since the first **Check** (for example a colleague's save that you reloaded). | Read the problems under the box, fix the table and **Check** again. |
| A message "Undo is no longer possible: you changed other things since." | Undo works only until the next change. | Use **Discard** in the top bar to go back to the last saved draft (this also throws away your other unsaved changes), or restore a published version ([Recipe 11](#recipe-11-undo-a-bad-publish-restore)). |
| A window **Copy by hand** after a copy button | This browser did not allow automatic copying. | The text is selected: press **Cmd+C** (Ctrl+C on Windows), then **Close**. |
| In the **Paste a route** card: "The route code in this Sheet (the Apps Script file Flow) is older than this control panel, so it can't read or write a route table." | `Panel` was updated, but `Flow` wasn't. The Map and Try a path still work. | Ask whoever set up the Sheet to paste the latest `Flow.gs` into the Apps Script project ([setup guide, This release](../apps-script/README.md#this-release-paste-a-route-27-oct-2026)), then open the panel again. |
| The preview says "The draft could not be shown: something in it stops the form from starting" | The draft has a mistake the checks missed, and it stops the form from starting (the form shows its stored copy instead). | **Don't publish it.** Undo your last change, click **Check for problems**, and preview again. If you can't find the cause, restore the live version as your draft (**Publish > history > Restore**). |
| The preview says "Could not load the draft: showing the form's stored copy" | The preview link lost its end (`&pk=…`) when it was copied, Google took more than 20 seconds, or the form is not connected to the live backend yet. | Open the preview again from the panel (**Preview > Open the preview**), or copy the **whole** link with **Copy**. Before go-live, see the [setup guide, Part D](../apps-script/README.md#part-d-connect-the-form). |
| Partners still see the old version | You saved but did not publish, or their page was already open. | Publish. Partners get it the next time they open their link. |
| Partners see "This survey is not open yet" | The round is a draft, or the round in their link is one the backend does not know (a typo in `round=…`, or a round that was never saved), which also counts as not open yet. | Open it ([Recipe 8](#recipe-8-open-or-close-a-round)). If it is open already, check that the link's `round=…` is exactly the round's code, capitals included. |
| A partner sees "This link is not valid" | The link was cut when it was copied, or edited by hand. | Send the full link again from the **Links** section. |
| A message when the panel opens: "4 new texts of the form were added to Texts & translations (…). Save to keep them." | Your Sheet was made before 28 Oct 2026, and the form now has texts it didn't have then (the "You can tick more than one." hint and the help videos' names). The panel adds them, with English and Hindi; the other languages wait for a translator. | Click **Save** (Publish also saves first). It appears only once. If the panel also asks **Bring back your unsaved changes?**, **Bring them back** keeps these texts too, and one message says so: "Your changes are back. 4 new texts of the form were added to Texts & translations (…). Press Save to keep them." |
| The panel says "The control panel could not open" | A tab is missing, or Google was busy. If the message also says "Google Drive would not open … for you", you don't have the Drive folder (see the row about that message above). | Click **Try again**. If it keeps happening, run **Partner Pulse > Set up or repair**, then open the panel again. In the Drive case, ask the admin to share the folder instead. |
| A red banner on **Home**: "The form on GitHub does not run the same route code as this control panel." | The form on GitHub Pages and this control panel run different versions of the route code, so phones could follow other rules than the ones the panel shows and checks (jumps, repeats, endings). The banner's last line shows the start of both codes and when they were compared. | Make them the same, from one copy of the project: whoever looks after GitHub uploads the newest form files (`web/js/flow.js`, `flow-panel.js` and `flow-check.js`) and waits for the green tick, and the admin pastes the newest `apps-script/Flow.gs` into the Apps Script project ([setup guide](../apps-script/README.md#update-the-code-later-same-address)). The comparison is kept for 10 minutes: open the panel again after that. If the form can't be reached, no banner shows. |
| In **Questions**: "The route tools could not start: …" and "Pasting a route still works: Check, Use this route and the table buttons ask Google instead, so they take a few seconds longer. …" | The panel window could not run the route code, so the panel asks Google to run the same code. Pasting a route, Save, Preview and Publish all work; only the **Map**, **Try a path** and the route badges are off. **[UNCONFIRMED]** that Google's panel window always allows the route code to run: it is tested only in Chrome outside Google. | Click **Try again** in the note. If it stays, keep working, and send the whole note to whoever maintains the scripts. |
| In **Questions**: "The route tools could not start: …" and "Pasting a route, the Map and Try a path need them, so they are switched off for now. Everything else works. …" | Neither the window nor Google could run the route code. If the message says the script file "Flow" is missing, the fifth code file was never pasted. | Click **Try again** in that note. If it keeps happening, close the panel and open it again, then ask the admin to paste the latest `Flow.gs` ([setup guide, step 3](../apps-script/README.md#step-3-add-the-five-code-files)). |
| **Map**, **Try a path**, **Check** and the three table buttons look switched off; clicking one says "The route tools are still loading. Try again in a moment." (or "… could not start …") | The route code is still loading, or could not start (row above). | Wait a moment. If the note above appears, see that row. |
| In **Questions**: "The route could not be worked out from these rows (…). Check for problems in Publish." | The draft's rows (perhaps typed into the **Screens** tab by hand) have a mistake that stops the route from being made. | **Publish > Check for problems** names it. Or **Copy the current route**, fix the row in Excel, paste it back and **Check**. |
| The **Map** says "The diagram could not be drawn here (…)" | The drawing library (from the website `cdn.jsdelivr.net`) was blocked, or took more than 20 seconds. | Use the list below it: it shows the same route. Or click **Open in mermaid.live ↗**. On another network (for example a phone's hotspot) the drawing may work ([Recipe 19](#recipe-19-see-the-whole-route-on-the-map)). |
| **Version … is live**, with "Please check one thing: Published, but Partner Pulse could not check that the form on GitHub understands this version (…)" | The version is live, but Google could not reach the form on GitHub just then (or the form address is not valid). | If partners keep seeing the old questions, ask whoever looks after GitHub to upload the newest form code and wait for the green tick, then publish again. Check **Settings › Form address (web link)**. |
| "Nothing was published: Google Drive could not read the live version (version …) just now, and Publish needs it to protect the codes partners have answered." | A passing problem with Google Drive, once codes are locked. Nothing was published. | Try again in a minute. If it keeps happening, check that the file named in the message (for example `p7.json`) is still in the Drive folder **Valmo Partner Pulse > published**, or ask whoever maintains the scripts. |
| The badge **⚠ nothing leads here** on a card | No arrow leads to this screen, so partners never see it. Usual for an ending or a question below the thank-you screen that no jump leads to. The reason is written under the card. | Add a jump (or a **then go to**) to it in an earlier row of the route table ([example](#recipe-14-add-a-jump-promoters-skip-the-area-questions)), or leave the row out. |
| The badge **⚠ this jump can never happen** | The jump is not used: where it goes is hidden, missing or above it, or its condition can't be true. The reason is written under the card. | Change the row's **jumps** cell in the route table: another place or another rule. |
| The badge **⚠ The rule tests a later or hidden answer** | The row's **show only if** tests an answer that comes later, is hidden, or that no screen stores any more. The text under the card says which. | In the route table, test an earlier answer, or move the row further down. |
| The badge **⚠ the jumps can't be read**, **⚠ route problem: see below** or **⚠ route note: see below** | The route checker found something about this row; the text under the card says what. Usually after typing in the **Screens** tab by hand. | Fix that row in the route table (or follow **Check for problems** in **Publish**). |
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
| **Route** | Which screen comes after which: the route table from top to bottom, plus any **then go to**, jumps and endings. |
| **Route table** | The whole route as one table, one row per screen (Questions > **Copy the current route**). You change it in Excel or Google Sheets, or have Claude or ChatGPT write it, and paste it back with **Paste a route** ([Recipe 2](#recipe-2-change-the-questions-paste-a-route)). |
| **Paste a route** | The card in Questions where you paste the route table, **Check** it and **Use this route**. |
| **Check** (of a pasted route) | Reads the pasted table and checks it with the same rules as Publish. Problems name the table's row and column. It changes nothing. |
| **Use this route** | Makes the checked table your draft's questions. Then Save, Preview and Publish as usual; **Undo** puts the draft back. |
| **Kind** | What a row of the route table is: a built-in screen (such as `nps` or `area ratings`) or a kind of question (such as `yes/no` or `pick one`) ([the kinds](#the-kinds)). |
| **Show only if** | A row's rule: partners see it only when the rule is true, for example `nps <= 6`. |
| **Then go to** | Where partners go after a row when no jump applies. Empty: the next row. |
| **Usually go to** | The older name of **then go to** (the removed question editor), still used in Publish's messages. |
| **Jump** | "If this answer is …, go to …": sends some partners to a later row or an ending. In the table: `if nps >= 9 go to support_gate`. |
| **Ending** | A thank-you screen. Partners stop there and their answers are sent. The main one (the first thank-you row) ends the main route; extra ones are reached through jumps. |
| **Map** | A drawing of the whole route (Questions > Map). On GitHub, the file `docs/flow.md` shows the same kind of map. |
| **Route code** | The part of the form's code that decides the route. The phones, the panel (the Apps Script file `Flow`) and GitHub's settings check all run the same copy. |
| **Detractor** | A partner who scores 0–6 on the 0–10 question. |
| **Link secret** | The password that makes every partner's link unique. Never share it, never change it while links are out. |
| **DC** | Delivery centre: a partner's site. |
