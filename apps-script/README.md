<!--
===============================================================================
apps-script/README.md: set up the Google Sheet control panel and the live backend
===============================================================================
What this file is for
  Step-by-step instructions to create the Google Sheet "Valmo Partner Pulse -
  Control", paste the four Apps Script code files into it, run set-up and
  publish the first version of the questionnaire, check that Google lets the
  web app be open to "Anyone", put the backend online as a web app and record
  its address in the control panel, point the survey form at it (and push
  that to GitHub), run the smoke test against the live backend, try it on a
  phone, and share the Sheet and its Drive folder with colleagues. Also: how
  to update the code later, an optional developer route (clasp), and a
  troubleshooting table.

Who it is for
  The admin who sets everything up once (a company Google account is needed).
  You do not need to know how to code: every click and command is spelled out.

What else to read
  - README.md (project front page), section "Phase 2: go live": the order of
    the whole go-live, including pushing the project to GitHub first, and the
    steps after this guide (the real DC list, links, sending in batches).
  - docs/control-panel.md: how to USE the control panel day to day.
  - docs/control-panel-design.md: the technical design (for developers).

What it reads and writes
  Nothing. It is documentation only.

Safety
  Never paste real partner data, real links or the link secret into this
  file. Examples use fake DC ids such as DC-DEMO-001.
===============================================================================
-->

# Set up the control panel and the live backend

This guide turns a blank Google Sheet into the **control panel** for Valmo Partner Pulse, and puts the **live backend** online: the small Google program that hands the form its questionnaire, checks every partner's link and saves the answers.

When you finish, you will have:

- the Google Sheet **Valmo Partner Pulse - Control**, with a **Partner Pulse** menu that opens the control panel;
- a folder **Valmo Partner Pulse** in your Google Drive, where published versions, answers and voice notes are kept;
- version 1 of the questionnaire **published** (live);
- a **web app address** ending in `/exec`, which the survey form talks to, recorded in the control panel;
- the online form connected to it;
- a test that proves it all works, from this Mac and from a phone;
- colleagues who can use the control panel.

It takes about **an hour** the first time. Do the steps in order.

> [!IMPORTANT]
> **Before you start**
>
> 1. **The project must already be on GitHub, with GitHub Pages switched on.** Do steps 1 and 2 of [Phase 2: go live](../README.md#phase-2-go-live) in the main README first. Set-up reads the questionnaire from the GitHub copy, and Part D changes the form online.
> 2. **Use your company Google account** (your `@meesho.com` address). Everything (the Sheet, the code, the answers) will belong to this account.
> 3. **Use a Chrome window where only that Google account is signed in.** When several Google accounts are signed in at once, Apps Script often picks the wrong one and shows errors such as "Sorry, unable to open the file at this time". The simplest way: in Chrome, click your profile picture (top right) > **Add** (or **Add Chrome profile**), sign in with the company account only, and do this whole guide in that window.

## On this page

- [Part A: Create the Sheet and paste the code](#part-a-create-the-sheet-and-paste-the-code) (steps 1–4)
- [Part B: Set up and publish version 1](#part-b-set-up-and-publish-version-1) (steps 5–7)
- [Part C: Put the backend online](#part-c-put-the-backend-online) (steps 8–11)
- [Part D: Connect the form](#part-d-connect-the-form) (steps 12–13)
- [Part E: Run the smoke test against the live backend](#part-e-run-the-smoke-test-against-the-live-backend) (steps 14–16)
- [Part F: Try it end to end on a phone](#part-f-try-it-end-to-end-on-a-phone) (step 17)
- [Part G: Share the Sheet and the Drive folder with colleagues](#part-g-share-the-sheet-and-the-drive-folder-with-colleagues) (step 18)
- [What comes next](#what-comes-next)
- [Update the code later (same address)](#update-the-code-later-same-address)
- [Optional: the clasp route (for developers)](#optional-the-clasp-route-for-developers)
- [Troubleshooting](#troubleshooting)
- [Safety rules](#safety-rules)

---

## Part A: Create the Sheet and paste the code

### Step 1: Create a blank Google Sheet

1. In Chrome (signed in with the company account only), go to **[sheets.new](https://sheets.new)**. A new, blank spreadsheet opens.
2. Click **Untitled spreadsheet** at the top left, type exactly:

   ```text
   Valmo Partner Pulse - Control
   ```

   and press Enter.

**You should see:** the new name at the top left. The Sheet is saved in your Google Drive automatically.

### Step 2: Open the Apps Script editor

1. In the Sheet's menu bar, click **Extensions > Apps Script**.
2. A new tab opens: the **Apps Script editor**. On the left, under **Files**, there is one file, **Code.gs**, containing a few lines (`function myFunction() { ... }`).
3. Click **Untitled project** at the top, type `Valmo Partner Pulse` and click **Rename**. Google shows this name on the permission screens later, so a clear name helps.
4. Click the **gear icon** (Project Settings) on the far left. Make sure **Enable Chrome V8 runtime** is ticked. (New projects have it ticked. The code needs it.) Then click the **< >** icon (Editor) on the far left to go back to the code.

This code is "bound" to the Sheet: it lives inside the Sheet, not as a separate file in Drive. To open it again later, always use **Extensions > Apps Script** from the Sheet.

### Step 3: Add the four code files

The code is in the project folder on this Mac, in the `apps-script` folder. The editor needs **four files**:

| Name to give it in the editor | Kind | Copy its content from |
|---|---|---|
| `Code` | Script (already there as **Code.gs**) | `apps-script/Code.gs` |
| `Model` | Script | `apps-script/Model.gs` |
| `PanelServer` | Script | `apps-script/PanelServer.gs` |
| `Panel` | HTML | `apps-script/Panel.html` |

> [!NOTE]
> **Why "PanelServer" and not "Panel"?** Apps Script does not let a Script file and an HTML file have the same name, and the HTML file **must** be called `Panel` (the code opens the panel by that name). So the panel's script half is called `PanelServer`, in the project folder and in the editor.

**For each row of the table, in order:**

1. **Copy the file.** In Terminal, go to the project folder, then run the copy command for that file (one command per file):

   ```bash
   cd ~/NPSF   # your project folder (main README, Phase 1 step 2)
   LANG=en_US.UTF-8 pbcopy < apps-script/Code.gs
   ```

   For the other files, use the same command with `apps-script/Model.gs`, then `apps-script/PanelServer.gs`, then `apps-script/Panel.html`.

   What it does: copies the whole file to the clipboard, as if you had selected it all and pressed Cmd+C. Nothing is printed. (`LANG=en_US.UTF-8` keeps Hindi letters and emoji intact.)

   *Alternative without Terminal:* open the file on GitHub, for example `https://github.com/PranavAkellaPS37/NPS-Form-/blob/main/apps-script/Code.gs`, and click the **Copy raw file** button (two overlapping squares, top right of the file).

2. **Create the file in the editor** (skip this for `Code`, which already exists): click the **+** next to **Files** (top left), choose **Script** or **HTML** as the table says, type the name exactly as in the table **without** `.gs` or `.html` (the editor adds that), and press Enter.

3. **Paste.** Click the file's name on the left to open it. Click inside the code area, press **Cmd+A** (select everything already there, including Google's sample lines), then **Cmd+V** (paste).

**You should see** four files on the left: **Code.gs**, **Model.gs**, **PanelServer.gs** and **Panel.html**. Each one starts with a long comment explaining what it is.

You do not need `apps-script/appsscript.json` or `apps-script/README.md` in the editor. (The first is only for the optional [clasp route](#optional-the-clasp-route-for-developers).)

### Step 4: Save

Press **Cmd+S** (or click the **Save project to Drive** icon, the floppy disk above the code).

**You should see:** no red message. (The orange dot next to a file's name, which means "not saved", disappears.)

**If it goes wrong:** a red bar such as `Syntax error: ... line: 120 file: Model.gs` almost always means a paste was cut short or went into the wrong file. Open that file, press Cmd+A, copy the file again (step 3), press Cmd+V, and save again.

---

## Part B: Set up and publish version 1

### Step 5: Reload the Sheet

Go back to the Sheet's tab and reload the page (**Cmd+R**).

**You should see:** after a few seconds, a new menu **Partner Pulse** to the right of **Help**. It has: **Open control panel**, **Preview the draft form**, **Publish…**, **Generate links…**, then (below a line) **Share the Drive folder with all editors**, **Set up or repair** and **Help**.

**If it goes wrong:** wait 10 seconds and reload again. Still no menu? Check in the Apps Script tab that all four files are saved (step 4).

### Step 6: Run "Set up or repair", and allow the permissions

1. Click **Partner Pulse > Set up or repair**.
2. The first time, Google asks you to allow the script to work. Go through the screens below.

| Screen | What to do |
|---|---|
| **Authorization required** ("A script attached to this document needs your permission to run") | Click **OK** (or **Continue**). |
| **Choose an account** | Click your company account (the one ending in `@meesho.com`). |
| **Google hasn't verified this app** (you may not see this screen at all with a company account) | It appears because Google has not reviewed this script, which is normal for a script you added yourself. Click **Advanced** (small, bottom left), then **Go to Valmo Partner Pulse (unsafe)**. It is safe: it is your own code, from this project. |
| **Valmo Partner Pulse wants to access your Google Account** | Read the list (see the table below). If each permission has a tick box, tick them all (there is usually a **Select all** box). Then click **Continue** (or **Allow**). Partner Pulse needs every one of them: if one is left unticked, use the **Partner Pulse** menu again and tick **Select all** when Google asks. |

**What each permission is for.** Google's exact wording may differ slightly.

| Google asks to… | Why Partner Pulse needs it |
|---|---|
| See, edit, create and delete all your Google Sheets spreadsheets | To build the tabs of this Sheet, and to create one **data spreadsheet** per round, where the answers are saved. |
| See, edit, create and delete all of your Google Drive files | To create the **Valmo Partner Pulse** folder, save each published version of the questionnaire, save partners' voice notes, and share the folder with colleagues when you ask it to. |
| Connect to an external service | To read the questionnaire from the GitHub copy (set-up, and **Import from GitHub**). |
| Display and run third-party web content in prompts and sidebars inside Google applications | To show the control panel window inside the Sheet. |
| See your primary Google Account email address | To record **who** published each version, saved changes or generated links. |

The script uses these permissions **only for you, inside your own Drive**. Partners never sign in and never see these screens.

3. If nothing seems to happen after you allow, click **Partner Pulse > Set up or repair** again. (The first click is sometimes used up by the permission screens.)

Set-up now builds the tabs, the Drive folders and the link secret. Because the questionnaire tabs are still empty, it then asks two questions:

| Window | What to do |
|---|---|
| **Copy the questionnaire from GitHub** (with an address box) | Leave the box empty and click **OK**. Set-up copies the questionnaire from the GitHub copy of the project into the tabs. |
| **Publish version 1 now?** | Click **Yes**. This makes the copied questionnaire the live version 1. Nobody can answer yet: a round still has to be opened. |

**You should see:** after up to a minute, a window **Set-up finished**. Under **What set-up did** it lists the tabs and folders it created, "Copied the questionnaire from GitHub (9 screens, 6 areas, 30 problem chips, 132 texts)" and "Published version 1 (p1-…)". Then three **NEXT STEPS**: make the web app, paste its address into the control panel and click **Check and save**, and how to update the code later. That is [Part C](#part-c-put-the-backend-online) below, step by step. The last line says "Web app address recorded in the control panel: none yet (see steps 1 and 2)", which is right for now. Click **OK**.

In the Sheet, new tabs appear at the bottom:

- **purple** tabs: the questionnaire (*Settings, Languages, Areas, Chips, Support, Screens, Texts, What changed, Audio clips*). This is the **draft**: partners never see it until you publish. *Audio clips* lists optional recorded read-aloud clips ([web/audio/README.md](../web/audio/README.md) explains them);
- **green** tabs: *Rounds, DCs, Links*;
- **grey** tab: *Publish history* (and a hidden one, *_meta*, that the script uses for its own notes).

Behind the scenes, set-up also:

- created the folder **Valmo Partner Pulse** in your Google Drive, with the sub-folders **published** and **rounds**;
- remembered **you** as the owner of that folder. Colleagues who cannot open the folder later get a message that names you ([Part G](#part-g-share-the-sheet-and-the-drive-folder-with-colleagues));
- created the **link secret**, the password that makes every partner's link unique. It is stored inside the script (Apps Script's "Script Properties"), never in the Sheet's cells and never on GitHub;
- created the private **preview key** that every preview link carries, so only people with a preview link from the panel can see the unpublished draft;
- formatted the **dc_id** column of the **DCs** tab as plain text, so a DC id such as `0123` keeps its `0` when it is typed in;
- listed the rounds `DEMO-R1` (fake demo content) and `2026-R1` in **Rounds**, both as draft ("not open yet").

**If it goes wrong:**

- "Could not copy the questionnaire" in the list of what set-up did: check that you pushed the project (README, Phase 2 step 1) and that the repository is public. Then copy it from the control panel: **Settings**, card **Import from GitHub** > **Import…** > **Import**, and publish (step 7).
- "Set-up stopped": Google was busy or a permission is missing. Wait a minute and run **Set up or repair** again. Nothing is deleted.
- "This app is blocked": Meesho's Google admin blocks scripts like this one. Ask IT to allow Apps Script for your account (see [Troubleshooting](#troubleshooting)).

**Set up or repair** is safe to run again at any time: it only adds what is missing (a deleted tab, a missing folder or setting), never deletes your content and never changes the link secret.

### Step 7: Open the control panel and check version 1

1. Click **Partner Pulse > Open control panel**. A large window opens over the Sheet. It takes a few seconds to load.
2. Look at the badge in the top bar.

**You should see:** **Live: version 1, published** with today's date and the start of your email address (for example "Live: version 1, published 20 Oct by your.name@…").

What happened: version 1 was saved as the file `p1.json` in the Drive folder **Valmo Partner Pulse > published**, and made live. **Publish history** (grey tab) has one row, marked live.

**If the badge says "Nothing published yet"** (you clicked **No**, or publishing found a problem), publish now:

1. Click **Publish** in the left-hand list, then **Check for problems**.

   **You should see:** **✔ No problems**, and five warnings. They are normal for now, and warnings never block publishing: Tamil, Telugu, Kannada and Malayalam still have texts to translate, and `DEMO-R1` is fake demo content.

2. In **A short note for the history**, type `Version 1: questionnaire from GitHub`, and click **Publish version 1**. A window **Publish version 1?** shows your note: click **Publish now**.

   **You should see:** a window **Version 1 is live**. Click **OK**.

---

## Part C: Put the backend online

The **web app** is the address the survey form talks to. Partners' phones get the questionnaire from it and send their answers there.

### Step 8: First check that "Anyone" is offered

Do this check **before** anything else in this part.

1. Go to the **Apps Script** tab (if you closed it: Sheet > **Extensions > Apps Script**).
2. Click the blue **Deploy** button (top right) > **New deployment**.
3. Next to **Select type**, click the **gear icon** > **Web app**.
4. Click the list under **Who has access** and look at the choices.

**You should see** the choice **Anyone**. Then go straight on to step 9.

> [!WARNING]
> **If "Anyone" is NOT in the list** (you only see *Only myself*, *Anyone within meesho.com* and perhaps *Anyone with Google account*): partners can't use the web app yet. Ask Meesho's IT team (Google Workspace admin) for help. **Meanwhile you can run it Meesho-only** (box below), so colleagues can try the real thing. You can send IT this:
>
> > I need to deploy a Google Apps Script web app with **Who has access: Anyone**, from my account [your email address]. It is the backend of a feedback survey for Valmo's delivery-centre partners, who are outside Meesho and do not sign in to Google. In the Google Admin console, the "Anyone" option for web apps depends on the Drive sharing settings (sharing outside the organisation, and making content visible to anyone with the link). Please enable it for my account, or for a group or organisational unit that contains it. The web app only answers with survey data; it does not share any Drive files.
>
> **Why the other choices do not work for partners:**
>
> - **Anyone within meesho.com**: partners do not have meesho.com accounts, so Google would turn every partner away.
> - **Anyone with Google account**: Google would first demand a sign-in. The form talks to the web app in the background, and a sign-in page cannot appear there: Google answers with a sign-in page instead of the survey data, so the form could neither load the questionnaire nor send any answers. Partners would see "Could not send" forever.
> - **Only myself**: only you could use it.

> [!NOTE]
> **Meesho-only mode, while you wait for IT** (for example to show the survey to a manager before approval). In step 9 choose **Who has access: Anyone within meesho.com** instead of **Anyone**, and carry on. In step 10, **Check and save** then records the address as **Meesho-only**:
>
> - the web app shows the survey page itself, to anyone **signed in with a Meesho Google account**, and their answers go to the Sheet as usual;
> - the panel's links and Preview open the survey through the web app's address (make the links again in **Links** after recording it);
> - partners, who have no Meesho account, can't open those links, and the GitHub copy of the questionnaire stays in test mode;
> - voice notes may not work inside Google's page; typing always does.
>
> **When IT has allowed "Anyone":** **Deploy > Manage deployments >** pencil icon (Edit) > **Who has access: Anyone** > **Deploy** (the address stays the same). In the panel, **Home > Quick links > Change**, paste the same address and click **Check and save** again: it is recorded as open to anyone. Then make the links again (they point at the form on GitHub Pages) and refresh the GitHub copy ([control panel guide, Recipe 12](../docs/control-panel.md#recipe-12-refresh-the-github-copy)).

### Step 9: Deploy the web app

Still in the **New deployment** window:

1. **Description:** `Partner Pulse`
2. **Execute as:** **Me (your email address)**. The backend then works with your account's permissions, so answers are saved in your Drive.
3. **Who has access:** **Anyone** (or, in Meesho-only mode, **Anyone within meesho.com**: see step 8).
4. Click **Deploy**.
5. Google may show the permission screens again (**Authorize access**): allow them as in step 6.

**You should see:** a window saying the deployment was created, with a **Deployment ID** and a **Web app URL**, each with a **Copy** button.

### Step 10: Copy the web app address and record it in the control panel

1. **Copy it.** Under **Web app URL**, click **Copy**, then click **Done**.

   **The address must look like this** (the long middle part is different for you):

   ```text
   https://script.google.com/macros/s/AKfycb...long-code.../exec
   ```

   - It must end in **`/exec`**. An address ending in `/dev` only works for you, never for partners.
   - It may look like `https://script.google.com/a/macros/meesho.com/s/AKfycb.../exec` instead. Such a company-style address can ask partners to sign in, but you can paste it as it is in the next step: the panel turns it into the plain form above.

2. **Record it in the control panel.** Go back to the Sheet's tab and click **Partner Pulse > Open control panel**. On **Home**, in the card **Quick links**, find **Web app address (for whoever sets up the form)**. Click in its box, paste the address (**Cmd+V**) and click **Check and save**.

   What it does: the panel first asks the address for `?action=health`, the way a partner's phone would, and keeps it only if Partner Pulse answers. It is kept with the script, not in the Sheet's tabs and not on GitHub. Later, the panel's **Download files for the GitHub copy** writes it into the form's settings for you ([control panel guide, Recipe 12](../docs/control-panel.md#recipe-12-refresh-the-github-copy)).

   **You should see:** "Checking the web app address…", then a green message starting "Web app address saved.". The box is replaced by the address in the plain form, with a **Copy** and a **Change** button. (The same box is in **Settings**, in the group **Form address**.)

   **In Meesho-only mode** (step 8) the green message starts "Saved as Meesho-only", and a yellow note under the address explains what that means. The panel could confirm the address only by asking it again signed in as you. It can't tell **Anyone within meesho.com** from **Only myself** that way, so check that **Who has access** is **Anyone within meesho.com**: with *Only myself*, colleagues can't open the survey.

   **If it goes wrong**, a red message under the box says what to fix:

   | The message starts with… | What to do |
   |---|---|
   | "This is the test address (it ends in /dev)" | In the Apps Script editor, **Deploy > Manage deployments**, and copy the **Web app** URL that ends in `/exec`. |
   | "This web app is open only to signed-in colleagues, but it still runs older code" | The deployment runs the code from before you pasted the new files. **Deploy > Manage deployments >** pencil icon (Edit) > **Version: New version** > **Deploy**, then click **Check and save** again. |
   | "The web app asks visitors to sign in" | **Who has access** is neither **Anyone** nor **Anyone within meesho.com** (for example *Only myself*), or it is another person's web app. In the Apps Script editor: **Deploy > Manage deployments >** pencil icon (Edit) > **Who has access: Anyone** (or **Anyone within meesho.com** for Meesho-only mode, step 8) > **Deploy**. The address stays the same: click **Check and save** again. |
   | "There is no web app at …" | Part of the address is missing. Copy it again, from `https://` to `/exec`. |
   | "That is not a web app address" | Copy the whole **Web app URL**, with nothing after `/exec`. |
   | "This address answers, but not as the Partner Pulse web app" | It is the address of another script. Deploy the script of **this** Sheet (step 9) and copy its address. |

**To find the address again later** (steps 11, 12 and 16 need it): control panel > **Home** > **Quick links** > **Copy** next to the address. It is not a secret.

### Step 11: Quick check in an Incognito window

An Incognito window is not signed in to Google, just like a partner's phone.

1. In Chrome, press **Cmd+Shift+N** to open an Incognito window.
2. Paste your web app address (copy it from the panel, as in step 10, so it is in the plain form), add `?action=health` to the end, and press Enter. For example:

   ```text
   https://script.google.com/macros/s/AKfycb...long-code.../exec?action=health
   ```

**You should see** one line of text like this:

```json
{"ok":true,"service":"valmo-partner-pulse","mode":"live","time":"2026-10-20T10:15:00.000Z","live_version":1,"runs_as_owner":true}
```

`"live_version":1` means the web app sees version 1, published in step 7. `"runs_as_owner":true` means the web app runs as the account that ran set-up, so answers and voice notes are saved in your Drive. (The answer never shows the email address itself: anyone can ask for it.)

You can also replace `?action=health` with `?action=bootstrap&round=DEMO-R1`. **You should see** a long line starting with `{"ok":true,"draft":false,"round":{"id":"DEMO-R1","status":"draft"},"version":1,...`: the whole published questionnaire. It is public on purpose (it contains no partner data). The unpublished draft is not: adding `&draft=1` answers `{"ok":false,"error":"bad_preview_key"}`, because only preview links made by the control panel carry the private preview key.

**If it goes wrong:**

- A **Google sign-in page**, or "Sorry, unable to open the file at this time": the access is not **Anyone**, or the address still contains `/a/macros/meesho.com/`. Check steps 9 and 10. To change the access of an existing deployment: **Deploy > Manage deployments >** pencil icon (Edit) > **Who has access: Anyone** > **Deploy**.
- `"error":"not_published"`: nothing is published yet. Do step 7.
- `"runs_as_owner":false`: the web app does not run as the account that ran set-up (step 6). Either it was deployed from another Google account, or **Execute as** is not **Me**. Deploy it again from the account that ran set-up, with **Execute as: Me** (step 9). That makes a new address: record it with **Change** in the control panel (step 10).

---

## Part D: Connect the form

So far the online form (on GitHub Pages) is still in **test mode**: it shows a yellow TEST MODE banner and cannot save answers. Now point it at the web app.

### Step 12: Put the web app address into the form's settings

1. Make a backup copy and open the settings file (the [settings guide](../docs/config-guide.md#before-you-start) explains these habits):

   ```bash
   cd ~/NPSF
   cp web/config/survey.json ~/Desktop/survey-backup.json
   open -a "Visual Studio Code" web/config/survey.json
   ```

   No VS Code? Use `open -a TextEdit web/config/survey.json`, but first turn off **Edit > Substitutions > Smart Quotes** in TextEdit.

2. Find the `"backend"` section. Change **two lines** and leave everything else as it is:

   | Line before | Line after |
   |---|---|
   | `"mode": "mock",` | `"mode": "apps_script",` |
   | `"apps_script_url": "",` | `"apps_script_url": "https://script.google.com/macros/s/AKfycb...long-code.../exec",` |

   Use **your** address from step 10 (control panel > **Home** > **Quick links** > **Copy**), between straight double quotes, with the comma at the end.

   The form reads these two lines only from this file, never from what you publish in the control panel: it needs them before it can ask Google for the published questionnaire. Later, the panel's **Download files for the GitHub copy** writes the same two lines for you, from the address you recorded in step 10.

3. Save the file (Cmd+S).
4. Check it:

   ```bash
   python3 scripts/check_config.py
   ```

   **You should see** "All good" at the end, and in the SUMMARY: "Answers go to: Google Apps Script (https://script.google.com/macros/s/…/exec)".

   **If it goes wrong:** each error says what to fix, for example a missing comma or quote. To undo everything: `cp ~/Desktop/survey-backup.json web/config/survey.json`.

> [!NOTE]
> **Testing on this Mac after this change.** The test server (`python3 scripts/mock_server.py`) still works, but the form now starts in live mode, even on `localhost`. The links the test server prints already end in `&mock=1`, which switches the form back to test mode, so they keep working. Add `&mock=1` to any other local link you type yourself (for the plain address: `localhost:8787/?mock=1`).

### Step 13: Save the change to GitHub

```bash
cd ~/NPSF
git status --ignored
```

Read the list above "Ignored files": it should show only `modified: web/config/survey.json` (and nothing with partner data). Then:

```bash
git add web/config/survey.json
git commit -m "Connect the form to the live Apps Script backend"
git push
```

What it does: saves the change as a commit and uploads it. GitHub then republishes the form by itself (about 1–2 minutes). `git push` uses the personal access token this Mac remembers from README step 1; if it asks for a password, paste the token, not your GitHub password.

**You should see:** on GitHub, in the repository's **Actions** tab, a new run with a green tick. Then open `https://pranavakellaps37.github.io/NPS-Form-/` in an Incognito window: there is **no** yellow TEST MODE banner any more, and the form says "This link is incomplete. Please open the full link Valmo sent you." That is correct: in live mode the form only works with a personal link.

If the old version still shows, wait a few minutes (GitHub Pages caches pages for up to about 10 minutes) and reload.

From now on, **Preview** in the control panel shows your draft on the real form ([control panel guide](../docs/control-panel.md#the-everyday-loop-save-preview-publish)).

---

## Part E: Run the smoke test against the live backend

The **smoke test** is an automatic check, run from this Mac, that sends a few fake test messages to the live backend and checks every answer.

### Step 14: Create the test round SMOKE-R1

The live backend only accepts answers for rounds that exist and are open. The smoke test uses the fake round `SMOKE-R1`, so create it once:

1. In the Sheet: **Partner Pulse > Open control panel**, then **Rounds** > **New round**.
2. In **Round code**, replace the suggestion with exactly `SMOKE-R1`. Click **Create round**.
3. Click **Open the round** next to `SMOKE-R1`. A window **Open round SMOKE-R1?** asks you to confirm: click **Open round**. (Your unsaved changes, including the new round, are saved first. The first opening can take half a minute.) If the window also warns "Partners will get version 1…", your saved draft has changes that are not published yet. The smoke test does not need them: click **Open anyway**.

**You should see:** the message "Round SMOKE-R1 is now open.", and on `SMOKE-R1` the status **Open** and, after **Data:**, the links **Answers sheet** and **Voice notes folder**. The answers sheet is the new spreadsheet **Valmo Partner Pulse - data - SMOKE-R1**, in the Drive folder **Valmo Partner Pulse > rounds > SMOKE-R1**.

`SMOKE-R1` is only for tests: never send partner links for it. You can leave it open; the smoke test needs it each time you run it.

Opening `SMOKE-R1` does **not** lock the questionnaire's codes: rounds whose name starts with SMOKE, DEMO or TEST never do, and the confirm window says so. The codes lock only when you open the first **real** round, after you have put in the real problem list (main README, [Phase 2](../README.md#phase-2-go-live), steps 9 and 11).

### Step 15: Copy the link secret

The smoke test needs the link secret, to make a genuine test link.

1. In the control panel, click **Links**.
2. At the bottom, in **Link secret (for the Python tool)**, click **Show the link secret**. Type `SHOW` (in capital letters) and click **Show the secret**.
3. The secret appears: 64 letters and digits. Click **Copy** next to it (or select it and press **Cmd+C**), then **Close**. Copy nothing else before step 16: the command takes the secret from the clipboard.

> [!CAUTION]
> The link secret is a **password**: anyone who has it can make a valid link for any DC. Never paste it into chats, emails, documents or any file in the project folder. **Never change it while links are out:** every link already sent would stop working.

### Step 16: Run the smoke test against the live backend

With the secret on the clipboard (step 15), run this in Terminal, replacing the address with **your** web app address from step 10:

```bash
cd ~/NPSF
python3 scripts/smoke_test.py --url https://script.google.com/macros/s/AKfycb...long-code.../exec --secret "$(pbpaste)" --expect-strict
```

What it does: sends a few test messages to the live backend and checks each answer. `"$(pbpaste)"` hands over the secret from the clipboard, so the secret itself never appears in the command (Terminal keeps a history of every command you type). `--expect-strict` tells it the live backend refuses wrong links.

**You should see:** nine **PASS** lines (the health check, the questionnaire, two "What changed" checks, the "opened" signal, a fake submission, the same submission sent again, a wrong token refused, a garbled message refused), and at the end "All 9 checks passed." The first answer can take up to 30 seconds while Google wakes the script up.

It leaves a little obviously fake test data in the `SMOKE-R1` answers sheet, for a new fake DC each time it runs (its id starts with `DC-SMOKE-`; the first lines of the output show it). That is expected, and it is why you can run the smoke test as often as you like.

**If a check FAILs**, the line says why. The common ones:

| FAIL message mentions… | What to do |
|---|---|
| "the token is wrong", or `bad_token` | The secret on the clipboard is not the right one. Copy it again (step 15) and rerun. |
| `round_not_open` | `SMOKE-R1` does not exist or is not open. Do step 14. |
| "Nothing is published on this backend yet … Publish from the control panel first" | Publish version 1 (step 7). |
| "the answer was not JSON. It is a web page instead." | The web app is not deployed for **Anyone**, or the address is not the one ending in `/exec`. Check steps 9 and 10. |
| `STOP  Could not reach` | Check the address (it must end in `/exec`) and your internet connection. |

---

## Part F: Try it end to end on a phone

### Step 17: Answer the real survey with a test link

1. **Make test links** for the fake DCs, in the test round. Copy the secret again (step 15), then:

   ```bash
   cd ~/NPSF
   PULSE_LINK_SECRET="$(pbpaste)" python3 scripts/generate_links.py --dcs sample_data/dcs_fake.csv --round SMOKE-R1 --out ~/Downloads/test-links.csv
   ```

   What it does: makes a personal link for each of the 20 fake DCs (`DC-DEMO-001` to `DC-DEMO-020`) in round `SMOKE-R1`, and saves them in your Downloads folder. It warns that `SMOKE-R1` looks like a test round: that is expected here.

2. Open `~/Downloads/test-links.csv` (double-click it in Finder), copy the link in the row of `DC-DEMO-001`, and send it to your phone (for example by email to yourself).
3. On the phone, open the link in Chrome and answer the survey. Record one voice note: it works on phones now, because the address is `https`.

**You should see:** the survey in Hindi (the language of that row), no TEST MODE banner, and **Thank you!** at the end.

4. **Check that the answer arrived.** In the control panel, **Home**, card **Rounds**: the numbers of `SMOKE-R1` load by themselves (click **Refresh** if they were already shown). **sent answers** now counts your DC too (each smoke-test run counts as one more fake `DC-SMOKE-…` DC). Then in **Rounds**, click the **Answers sheet** link of `SMOKE-R1`: the **responses** tab has a row for `DC-DEMO-001`, and **free_text** has your voice note, with a Drive link in **audio_url**.
5. Delete `~/Downloads/test-links.csv` when you are done.

**The backend is live.**

To see a draft before you publish it, use **Preview** in the control panel instead: preview links never save anything. See [docs/control-panel.md](../docs/control-panel.md).

---

## Part G: Share the Sheet and the Drive folder with colleagues

### Step 18: Add each colleague in two steps

The control panel works with the permissions of the person using it. So a colleague needs **two** things: the Sheet, and the Drive folder **Valmo Partner Pulse** (published versions, round data, voice notes), which belongs to you.

1. **Share the Sheet.** Click **Share** (top right of the Sheet) and add the colleague's email address:
   - **Editor**: can use the control panel: change the questionnaire, publish, open rounds, generate links. **Editors are admins:** they can also open the Apps Script code and see the link secret. Give Editor only to trusted Valmo staff.
   - **Viewer**: can look at the tabs but cannot use the control panel (the **Partner Pulse** menu does not appear for them). Note that Viewers can still read the **DCs** and **Links** tabs, which hold partner data and every partner's link. Share with Viewers only if that is acceptable.

   Never use **Anyone with the link** for this Sheet.

2. **Share the Drive folder.** In the Sheet, click **Partner Pulse > Share the Drive folder with all editors**. It gives everyone who can edit the Sheet edit access to the folder.

   **You should see** a window **Drive folder shared**, listing those email addresses: "They can now publish, open rounds and see counts in the control panel."

**Why the second step.** Sharing the Sheet does not share the folder. Without the folder:

- **Publish**, restoring an older version, opening a round for the first time and the round numbers stop with a message like this:

  > Google Drive would not open the Drive folder "Valmo Partner Pulse" for you (new.colleague@meesho.com). Partner Pulse keeps its files in the Drive folder "Valmo Partner Pulse". Ask owner.name@meesho.com to open this Sheet and click Partner Pulse > Share the Drive folder with all editors, then try again. (Google said: …)

- **The control panel soon stops opening for them, at least some of the time.** Google keeps a short-term copy of the live version (for 6 hours at most), and the panel can use it without the folder. Whenever that copy has expired (it is refilled whenever someone with the folder opens the panel or publishes, or a partner opens a link), the panel shows **The control panel could not open** with the same message, naming "the published questionnaire (version 1)". **Check for problems** (once a real round has opened) and **Download files for the GitHub copy** stop the same way.

The script never quietly makes a second "Valmo Partner Pulse" folder in your colleague's own Drive: answers and versions would then be split between two places. Only **Set up or repair** run by you (the owner, named in that message) may replace a folder, and only one that was really deleted.

**Files your colleagues create** in the folder (for example a round's answers sheet when they open a round, or a published version) are handed over to you, the owner, so everything stays in your Drive. The colleague keeps edit access. Google allows this only between accounts of the same company; if it refuses, the file simply stays where it is, inside the shared folder.

**When.** Run the menu item every time you add someone to the Sheet. Running it again is harmless.

**Who.** You (or anyone who can already edit the folder). For anyone else it ends with **Could not share the Drive folder**.

**Removing someone.** The menu item only adds people. Remove the person from the Sheet (**Share**) **and** from the folder (in Google Drive, right-click **Valmo Partner Pulse** > **Share**).

The first time a colleague uses the **Partner Pulse** menu, Google shows them the permission screens of [step 6](#step-6-run-set-up-or-repair-and-allow-the-permissions): they should allow all of them, with **Select all**. [docs/control-panel.md](../docs/control-panel.md#who-can-use-it) explains the roles and the day-to-day work.

---

## What comes next

Go back to the main README, [Phase 2: go live](../README.md#phase-2-go-live), for the rest: the real DC list and round, the questionnaire's final wording and translations (Preview, then Publish), refreshing the GitHub copy, making the links, opening the round and sending the links **in batches**.

---

## Update the code later (same address)

When a developer gives you a new version of the code:

1. Open the Sheet > **Extensions > Apps Script**.
2. Paste the new content into each changed file, exactly as in step 3 (each project file goes into the editor file with the same name). Paste **all** the changed files before you use the panel again: `Panel` and `PanelServer` work as a pair. Save (**Cmd+S**).
3. **Deploy > Manage deployments**. Select the active deployment (`Partner Pulse`), click the **pencil icon** (Edit), set **Version** to **New version**, and click **Deploy**.

**You should see:** the same **Web app URL** as before. Nothing needs to change in `web/config/survey.json`, and the address recorded in the control panel stays as it is.

Good to know:

- The **control panel** uses your saved code straight away. The **web app** (what partners use) only changes when you make a **New version** (step 3).
- **Never** use **Deploy > New deployment** for an update: it creates a **new address**, while the form keeps sending answers to the old one, which keeps running the old code. (If a new address is ever really needed, record it in the panel with **Change**, as in step 10, and put it into `web/config/survey.json`, as in steps 12 and 13.)
- If the panel says "The script behind this Sheet has no step called …", one of the files was not pasted (usually `PanelServer`). Paste it, save, and open the panel again.
- If the developer says so, run **Partner Pulse > Set up or repair** afterwards, to add any new tabs or settings.

---

## Optional: the clasp route (for developers)

`clasp` is Google's command-line tool for Apps Script. It replaces the copy and paste of step 3 with one command. Most admins can skip this section.

1. Install Node.js (the LTS version) from [nodejs.org](https://nodejs.org/), then install clasp:

   ```bash
   npm install -g @google/clasp
   ```

2. Turn on **Google Apps Script API** for your account at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
3. Sign clasp in with the company account:

   ```bash
   clasp login
   ```

   It opens the browser; allow access. clasp saves its sign-in in `~/.clasprc.json` in your home folder. That file is a credential: never copy it into the project (`.gitignore` blocks it anyway).
4. Find the **Script ID**: Apps Script editor > gear icon (**Project Settings**) > **IDs** > **Script ID** > **Copy**.
5. Make a separate upload folder **outside** the project, and link it to your script. Replace `PASTE-THE-SCRIPT-ID` with the ID you copied:

   ```bash
   mkdir -p ~/partner-pulse-clasp
   cd ~/partner-pulse-clasp
   printf '{"scriptId":"%s"}\n' "PASTE-THE-SCRIPT-ID" > .clasp.json
   ```

   Why a separate folder: clasp uploads every code file in its folder and replaces the online project with them, so it gets a folder holding only the five files Apps Script needs. Nothing in the project folder changes.
6. Upload the code (every time it changes):

   ```bash
   cd ~/NPSF
   cp apps-script/Code.gs apps-script/Model.gs apps-script/PanelServer.gs apps-script/Panel.html apps-script/appsscript.json ~/partner-pulse-clasp/
   cd ~/partner-pulse-clasp
   clasp push
   ```

   What it does: copies the four code files and the project's manifest (`appsscript.json`, only used on this route) into the upload folder, then uploads them. **`clasp push` replaces every file in the online project**, including anything pasted by hand.
7. Make the update live for partners as in [Update the code later](#update-the-code-later-same-address), step 3 (**Manage deployments > Edit > New version**). Do not use `clasp` to create deployments: a new deployment gets a new address.

---

## Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| No **Partner Pulse** menu after reloading the Sheet | The code is not saved, or not finished loading. | Wait 10 seconds and reload. Check that all four files are saved (step 4). In the Apps Script editor, **Executions** (left, list icon) shows errors in red. |
| "A file with this name already exists" when adding a file | A Script file and the HTML file both have the name `Panel`. | Name the Script file `PanelServer` (step 3). To rename a file: the **⋮** next to its name > **Rename**. |
| `Syntax error ... line N file X` when saving | A paste was cut short or went into the wrong file. | Copy that file again and paste it over everything (Cmd+A, Cmd+V). Then save. |
| "Sorry, unable to open the file at this time" | Several Google accounts are signed in, and Google picked the wrong one. | Use a Chrome profile, or an Incognito window, signed in with the company account only. |
| "Authorization is required", or "Google says Partner Pulse needs authorization" | Usually Google is using another of your Google accounts (several are signed in to Chrome). Less often, a permission was left unticked. | Open the Sheet in a Chrome profile (or an Incognito window) signed in only with the company account, and try again. If that does not help, use the **Partner Pulse** menu again (for example **Open control panel**): on Google's permission screen, tick **Select all**, then click **Continue**. |
| "Google has not given Partner Pulse all the permissions it needs", "Google needs all of Partner Pulse's permissions", or "You do not have permission to call…" | A permission was left unticked on Google's permission screen. | Use the **Partner Pulse** menu again (for example **Open control panel**). On Google's permission screen, tick **Select all**, then click **Continue**. |
| "This app is blocked" | Meesho's Google admin does not allow this kind of script. | Ask IT to allow Google Apps Script for your account (or to trust this script). |
| "Could not copy the questionnaire" when set-up finishes | The project is not on GitHub yet, the repository is private, or GitHub was briefly unreachable. | Push the project (README, Phase 2 step 1), then use the control panel's **Settings** > **Import from GitHub** > **Import…**, and publish ([step 7](#step-7-open-the-control-panel-and-check-version-1)). |
| **Anyone** is missing under **Who has access** | The company's Google settings do not allow public web apps. | See the box in [step 8](#step-8-first-check-that-anyone-is-offered): ask IT. Other choices do not work for partners. |
| `?action=health` shows a Google sign-in page | Access is not **Anyone**, or the address contains `/a/macros/meesho.com/`. | See step 11. |
| **Check and save** (the web app address in the control panel) shows a red message | The address is not the web app's `/exec` address, or the web app is not open to **Anyone**. | See the table in [step 10](#step-10-copy-the-web-app-address-and-record-it-in-the-control-panel). |
| `{"ok":false,"error":"bad_preview_key"}` | Someone asked the web app for the unpublished draft (`draft=1`) without the private preview key. | Expected: only preview links from the control panel (**Preview**) carry the key. |
| "Script function not found: doGet" | The web app was deployed before the code was saved. | Save, then **Deploy > Manage deployments > Edit > New version > Deploy**. |
| The smoke test FAILs | See the table in [step 16](#step-16-run-the-smoke-test-against-the-live-backend). | |
| The online form still shows TEST MODE | `web/config/survey.json` still says `"mode": "mock"`, the change is not pushed, or the page is cached. | Do steps 12–13, wait for the green tick in GitHub's **Actions** tab, then reload in a new Incognito window. |
| GitHub's **Actions** tab shows a red cross | `check_config.py` found an error, so GitHub did not publish the form. | Click the run to read the error. Fix it on the Mac, run `python3 scripts/check_config.py` until it says "All good", then commit and push again. |
| A colleague sees "Google Drive would not open … for you … Ask … to open this Sheet and click Partner Pulse > Share the Drive folder with all editors" | They can edit the Sheet, but not the Drive folder **Valmo Partner Pulse**. | Run **Partner Pulse > Share the Drive folder with all editors** yourself ([step 18](#step-18-add-each-colleague-in-two-steps)), then they try again. |
| A colleague runs **Set up or repair** and gets "Set-up stopped" with that same Drive message | Same: they cannot open your folder, and set-up never makes a second one for them. | Same: share the folder (step 18). Only you need to run set-up. |
| A colleague sees **The control panel could not open**, with the same Drive message ("the published questionnaire (version …)") | Same: without the folder, the panel stops opening once Google's short-term copy of the live version has expired (6 hours at most). | Same: share the folder (step 18), then they click **Try again**. |
| **Could not share the Drive folder** | The person who ran the menu item cannot edit the folder. | Run it yourself (the owner who ran set-up). |
| **Nobody to share with** | Google listed no editors of the Sheet. | Share the Sheet first (**Share** button), then run the menu item again. |
| The preview shows "Could not load the draft: showing the form's stored copy" | The preview link lost its end (`&pk=…`) when copied, the draft took Google more than 20 seconds, or the form is not connected yet. | Open the preview again from the panel (copy the **whole** link). Before go-live, do Part D first. |
| "The form address is missing or not valid" (Preview, Make links) | The Settings value **Form address (web link)** is empty or wrong. | Control panel > **Settings** > **Form address**: `https://pranavakellaps37.github.io/NPS-Form-/` (with the `/` at the end). |
| A partner sees "This link is not valid" | The link was cut when it was copied (for example in WhatsApp), or it was made with a different secret. | Send the full link again. Make sure the secret was never changed (see [Safety rules](#safety-rules)). |
| A partner sees "This survey is not open yet" | The round in the link is still a **draft**, or it is a round the backend does not know (the link's `round=…` is mistyped, or the round was never saved in the panel): the backend treats an unknown round as not open yet. | Open the round in the panel (**Rounds > Open the round**). It takes effect straight away. If it is open already, check that `round=…` in the link is exactly the round's code, capitals included. |
| A partner sees "This survey has closed" | The round is **closed**. | Expected after closing. Re-open the round if it was closed by mistake. |
| Answers arrive slowly | Too many partners at the same moment (Google runs only about 30 at once). Each answer waits up to 8 seconds for its turn; if it is still busy, the phone is told "busy, try again" and retries by itself. That answer goes only to the phone: it is not written in the **Executions** log. | Nothing to fix: the form retries by itself. Send links in batches, for example 1,000 an hour. |
| **Download files for the GitHub copy** warns "The web app address isn't recorded yet" (or "No web app address is recorded yet") | Nobody has recorded the web app address in the control panel, so the downloaded `survey.json` would keep the form in test mode. | Record it (step 10), then click **Prepare the files again**. Never put a `survey.json` made with this warning on GitHub: the online form would stop sending answers. |

To see the script's own error messages: Apps Script editor > **Executions** (on the left). Each run is listed, and a failed one shows its error in plain text.

---

## Safety rules

1. **Sharing the Sheet as Editor gives admin rights**, including the link secret. Editors only for trusted Valmo staff. When someone leaves, remove them from the Sheet **and** from the Drive folder.
2. **Never change the link secret while links are out.** Every link already sent would stop working.
3. **Never copy the secret** into chats, documents, email or the project folder. Get it from **Links > Show the link secret** when you need it, and paste it straight into the command.
4. **Preview links carry a private key** (`&pk=…`). Anyone with one can read your unpublished draft (not answers, not partner data). Share them only with colleagues. If one was shared too widely: control panel > **Settings** > **Preview links** > **Make new preview links…**. Every older preview link stops working; partners' links are not affected.
5. **Partner data stays in Google**: the DC list, links, answers, voice notes and data spreadsheets. Never download them into the project folder.
6. **The published questionnaire is public** (anyone can read it through the web app). Never put partner data or secrets in texts or settings.
7. **The web app runs as your account.** Answers are saved in your Drive. If this account is ever going to be closed, ask a developer to move everything to another account first: the web app address would change, and so would the address recorded in the control panel and `web/config/survey.json`.
