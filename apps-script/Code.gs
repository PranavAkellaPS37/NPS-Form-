/* =============================================================================
   Code.gs  -  Valmo Partner Pulse: the engine behind the control Sheet
   =============================================================================

   WHAT THIS FILE IS
     One of the five code files that live inside the Google Sheet
     "Valmo Partner Pulse - Control" (open the Sheet, then Extensions >
     Apps Script). This file does the jobs that are not the control panel's
     screens:
       1. The "Partner Pulse" menu at the top of the Sheet.
       2. "Set up or repair": creates (or fixes) every tab, the Google Drive
          folders and the secret code used in partner links. It is safe to run
          again at any time: it never deletes your content.
       3. Publishing: turns the DRAFT questionnaire in the tabs into a numbered
          version (p1, p2, ...) that partners' phones download straight away,
          and can bring an older version back as the draft ("restore").
       4. Rounds: every survey round gets its own data spreadsheet and its own
          voice-note folder in Google Drive.
       5. The PUBLIC web address (the "web app", ending in /exec) that partners'
          phones talk to. It hands out the published questionnaire and saves
          progress signals ("pings") and finished surveys.
       6. Link tokens: the code inside each partner link that proves the link
          is genuine.
     The other files: PanelServer.gs (what the control panel asks the Sheet to do),
     Model.gs (reading, checking and compiling the questionnaire), Panel.html
     (the control panel's screens) and Flow.gs (the questionnaire's route: the
     same code partners' phones run, generated from the GitHub project by
     node scripts/build_flow_gs.js).

   HOW TO INSTALL IT (copy and paste, no programming needed)
     1. In the Sheet: Extensions > Apps Script.
     2. Create a Script file named exactly "Code" and paste this whole file
        into it (replace anything that is there). Do the same with Model.gs
        (Script file "Model"), PanelServer.gs (Script file "PanelServer": Apps
        Script refuses two files called "Panel"), Flow.gs (Script file "Flow")
        and Panel.html (HTML file "Panel").
     3. Save, close the Apps Script tab, reload the Sheet, then click
        Partner Pulse > Set up or repair. Google asks for permission the first
        time: tick "Select all", then allow it. (If a permission was left
        unticked, every Partner Pulse menu item shows Google's permission
        screen again.)
     4. Set-up ends with a message that explains how to publish the web app
        (Deploy > New deployment > Web app > Execute as: Me > Who has access:
        Anyone), how to copy its /exec address, and where to paste it: the
        control panel, Home (or Settings) > Web app address. The panel checks
        that the address really answers as Partner Pulse before keeping it.
     Full step-by-step guide: apps-script/README.md in the GitHub project.

   HOW TO UPDATE IT LATER
     Paste the new code, save, then Deploy > Manage deployments > pencil icon
     (Edit) > Version: "New version" > Deploy. That keeps the same /exec
     address. Never make a brand-new deployment just to update the code: a new
     deployment gets a NEW address and the form would stop reaching it.

   WHAT IT READS AND WRITES
     - The tabs of this Sheet (see docs/control-panel-design.md, section 3).
       Script-managed tabs: Links, Publish history, _meta (hidden). Please do
       not put formulas in those: the script rewrites them as plain values.
     - Google Drive folder "Valmo Partner Pulse" (owned by whoever ran set-up):
         published/p1.json, p2.json, ...  every published questionnaire
         rounds/<round>/                   that round's data spreadsheet
         rounds/<round>/audio/             that round's voice notes
     - Script Properties (Extensions > Apps Script > Project Settings):
         LINK_SECRET          the secret behind every link token
         FOLDER_ID, PUBLISHED_FOLDER_ID, ROUNDS_FOLDER_ID   the Drive folders
         LIVE_VERSION, LIVE_FILE_ID   the published version partners get
         ROUND:<round id>     each round's status and data spreadsheet
         CONTROL_SHEET_ID     lets the web app find this Sheet (for Preview)
         PREVIEW_KEY          the private key that preview links carry
         OWNER_EMAIL          who ran set-up first (owns the Drive folder)
         WEB_APP_URL          the web app's /exec address, recorded (after a
                              check) in the control panel
         ROUNDS_EVER_OPENED   "1" once any real round has been opened: from
                              then on partners may have answered, so the codes
                              of questions, areas and problems are locked.
                              Test rounds (ids starting with SMOKE, DEMO or
                              TEST) never set it (PP_isTestRound_)
         CODES_EVER_LIVE      every code of every version that was live since
                              the first real round opened (a JSON list such as
                              ["screen:nps", "area:payments", ...], kept by
                              Publish): those codes stay locked even after a
                              question was hidden, published and deleted
     - The script cache (a short-term memory that keeps the web app fast).
     - Each round's data spreadsheet, tabs: responses, function_ratings,
       free_text, events, pings. These tabs are written by the script only.
       Never insert or move columns in them (extra columns on the right are
       fine): the script writes each column in a fixed place. The last column
       of pings, config_version (the questionnaire version the phone showed),
       came on 26 Oct 2026: in a spreadsheet made before that day, the first
       ping after the update adds it as a new column on the right of
       events_json (a column of your own there moves one place right).
     - Files a co-admin creates (a round's data spreadsheet and folders, a
       published version, the main folder if they had to create it) and voice
       notes saved while the web app runs as a co-admin are handed over to
       OWNER_EMAIL when Google allows it, so everything stays in one person's
       Drive (PP_giveToOwner_).

   WHO WAITS FOR WHOM (the "locks")
     - Partners' finished surveys are written one at a time (the SCRIPT
       lock). Each one holds it only briefly: the slow part, saving voice
       notes in Drive, happens before the wait. A survey that waits longer
       than 8 seconds is answered "busy" and the phone simply sends it again.
     - Changes made in the control panel (save, publish, restore, import,
       links, form address, preview key, round status) wait for each other
       (the DOCUMENT lock of this Sheet). Partners never wait for them, and
       they never wait for partners.
     - Two exceptions take the script lock for a moment too: creating a
       round's data spreadsheet (the first time a round opens), so the same
       spreadsheet can never be created twice; and adding the config_version
       column to the pings tab of a spreadsheet made before 26 Oct 2026 (once,
       by the first ping that finds it missing), so it is never added twice.

   SAFETY
     - Partner data (the DC list, links, answers, voice notes) stays in Google.
       Never copy it into the GitHub project.
     - LINK_SECRET makes every partner link unique. NEVER change or delete it
       while links are out: every link already sent would stop working.
     - Anyone with EDIT access to this Sheet can open this code and see the
       secret. Share the Sheet as Editor only with trusted Valmo staff.
     - The web app only ever answers with data (JSON), never with a web page,
       and it checks the token of every message before saving anything.

   THE MANIFEST (appsscript.json)
     Only needed by people who upload the code with the "clasp" tool. It sets
     the time zone (Asia/Kolkata), the modern JavaScript engine (V8), error
     logging, and the web app settings (run as the person who deploys it,
     open to anyone). Copy-paste users do not need it: they choose the same
     web app settings in the Deploy dialog.

   FOR WHOEVER MAINTAINS THIS CODE
     The contract is docs/control-panel-design.md (sections 10-13 and 17-18 are
     this file) plus docs/submission-format.md. Use only the Apps Script
     calls listed in section 2 of the contract (the local test harness
     imitates exactly those). LockService.getDocumentLock and
     ScriptApp.requireAllScopes are looked up first with PP_hasMethod_, so a
     runtime without them falls back to the old behaviour; File/Folder.setOwner
     is best effort. Helper names end with "_" so the control panel cannot
     call them directly.
   ============================================================================= */


// =============================================================================
// 1. Fixed settings
// =============================================================================

/** Everything this file treats as fixed, in one place. */
const PP_SRV = Object.freeze({
  SERVICE_NAME: 'valmo-partner-pulse',
  SCHEMA_VERSION: 1,                         // version of the data format the form sends
  MAX_POST_CHARS: 25 * 1024 * 1024,          // one message, voice notes included (25 MB)
  MAX_VOICE_NOTE_BYTES: 5 * 1024 * 1024,     // one voice note after decoding (5 MB)
  MAX_CELL_CHARS: 49000,                     // Google Sheets refuses cells above 50,000 characters
  SUBMIT_LOCK_MS: 8000,                      // how long a submission waits for its turn to be written
  ADMIN_LOCK_MS: 30000,                      // how long a save / publish waits for its turn
  STORE_LOCK_MS: 30000,                      // how long opening a round waits for answers being written
  PING_LIMIT: 60,                            // pings stored per DC and round ...
  PING_WINDOW_SECONDS: 600,                  // ... in this many seconds (10 minutes)
  ROUND_CACHE_SECONDS: 60,                   // how long a round's status is remembered
  SUB_CACHE_SECONDS: 900,                    // how long a stored submission's id is remembered (15 minutes:
                                             // the cache keeps only about 1,000 items, and the check in
                                             // the responses tab is the real duplicate check)
  LONG_CACHE_SECONDS: 21600,                 // 6 hours: the longest the script cache keeps anything
  CACHE_CHUNK_CHARS: 30000,                  // safely below the cache's 100 KB limit, even for Hindi
  DATA_TAB_START_ROWS: 100,                  // rows a new data tab has at least (PP_ensureRows_ only adds
                                             // rows; Google's new tabs usually have 1,000 already)
  ROW_GROWTH: 500,                           // extra empty rows added when a data tab is full
  NOTE_MAX_CHARS: 500,                       // longest publish note kept
  // A real survey is small. These caps stop one partner link (or a stolen
  // one) from flooding a round's data spreadsheet with junk rows.
  MAX_LIST_ITEMS: { free_text: 64, ratings: 64, events: 400 },
  MAX_ANSWER_KEYS: 100,
  MAX_ANSWERS_CHARS: 200000,                 // the whole message without voice notes
  MAX_SUBMISSIONS_PER_DC: 10,                // stored submissions per DC and round
  MAX_PING_FIELD_CHARS: { session_id: 64, lang: 8, screen: 80, at: 40, mode: 10, stage: 10 },
  MAX_PING_EVENTS: 400,
  MAX_PING_CHARS: 60000,                     // one progress ping, events included
  DRAFT_CACHE_SECONDS: 30,                   // a preview's compiled draft is reused this long
  FORM_PAGE_CACHE_SECONDS: 600,              // Meesho-only mode: the form's index.html and address are reused this long
  FORM_ENGINE_CACHE_SECONDS: 600,            // Publish: a form found new enough (js/flow.js) is trusted this long
  FLOW_ENGINE_NEEDED: 2,                     // the oldest form engine (flow.js ENGINE) that understands a route graph
  EMBED_PARAMS: ['dc', 't', 'round', 'lang', 'preview', 'pk'],   // the link details the survey page passes on to the form
  HEADER_COLOUR: '#EDE7F6',                  // light purple, row 1 of every tab
  TAB_COLOURS: { config: '#7E57C2', operations: '#43A047', system: '#9E9E9E' },
  DEFAULT_IMPORT_URL: 'https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/web/',
  REPO_URL: 'https://github.com/PranavAkellaPS37/NPS-Form-',
  MAIN_FOLDER: 'Valmo Partner Pulse',
  PUBLISHED_FOLDER: 'published',
  ROUNDS_FOLDER: 'rounds',
  AUDIO_FOLDER: 'audio',
  DATA_BOOK_PREFIX: 'Valmo Partner Pulse - data - ',
  DEFAULT_LANGUAGES: ['en', 'hi', 'ta', 'te', 'kn', 'ml'],
  ROUND_STATUSES: ['draft', 'open', 'closed'],
  PING_STAGES: ['opened', 'started', 'progress'],
  ALL_SECTIONS: ['settings', 'languages', 'areas', 'chips', 'support', 'screens', 'texts',
                 'whats_changed', 'clips', 'rounds'],
  CONTENT_SECTIONS: ['settings', 'languages', 'areas', 'chips', 'support', 'screens', 'texts',
                     'whats_changed', 'clips'],
  CONFIG_TABS: ['Settings', 'Languages', 'Areas', 'Chips', 'Support', 'Screens', 'Texts',
                'What changed', 'Audio clips'],
  SUBMISSION_ID_RULE: /^[A-Za-z0-9_-]{1,64}$/,
  DC_OR_ROUND_RULE: /^[A-Za-z0-9_.-]{1,64}$/,
  ROUND_RULE: /^[A-Za-z0-9_-]{1,64}$/,       // a round the panel may OPEN: the checks' rule (Model.gs PP_MDL_ROUND_RE_), no dots
  // A web app address: https://script.google.com/macros/s/<id>/exec, or the
  // company form .../a/macros/<domain>/s/<id>/exec (older: .../a/<domain>/macros/s/...).
  WEB_APP_URL_RULE: /^https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/[^\/\s?#]+\/s|a\/[^\/\s?#]+\/macros\/s)\/([A-Za-z0-9_-]{10,})\/exec$/,
  // Google's words when a permission was left unticked on its permission screen.
  PERMISSION_ERROR_RULE: /Specified permissions are not sufficient|Authorization is required/i,
  // Google's words when Drive itself had a passing problem (not an access problem).
  DRIVE_BUSY_RULE: /service error|server error|try again|unavailable|too many times|timed? ?out|internal error|backend error/i,
  // File extension of a saved voice note, from the recording's format ("mime").
  VOICE_EXTENSIONS: {
    'audio/webm': '.webm', 'video/webm': '.webm',          // Chrome on Android: the usual case
    'audio/ogg': '.ogg', 'application/ogg': '.ogg',        // Firefox
    'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a'   // iPhone / Safari
  },
  // Names of the Script Properties (contract section 18).
  KEYS: {
    SECRET: 'LINK_SECRET',
    FOLDER: 'FOLDER_ID',
    PUBLISHED_FOLDER: 'PUBLISHED_FOLDER_ID',
    ROUNDS_FOLDER: 'ROUNDS_FOLDER_ID',
    LIVE_VERSION: 'LIVE_VERSION',
    LIVE_FILE: 'LIVE_FILE_ID',
    ROUND_PREFIX: 'ROUND:',
    CONTROL_SHEET: 'CONTROL_SHEET_ID',       // lets the web app find this Sheet (used by Preview)
    PREVIEW_KEY: 'PREVIEW_KEY',              // private key that preview links carry (&pk=...)
    OWNER: 'OWNER_EMAIL',                    // who ran set-up first (owns the Drive folder)
    WEB_APP_URL: 'WEB_APP_URL',              // the checked /exec address (recorded in the control panel)
    WEB_APP_ACCESS: 'WEB_APP_ACCESS',        // "anyone", or "domain": open only to people signed in with a company account (Meesho-only mode)
    ROUNDS_EVER_OPENED: 'ROUNDS_EVER_OPENED',  // "1" once a real (not test) round was opened: codes are locked from then on
    CODES_EVER_LIVE: 'CODES_EVER_LIVE',      // JSON list of every code live since then (Model.gs PP_mdlCodesOfDoc_)
    PANEL_SECTION: 'panel_section'           // a User Property: which panel section to open
  }
});

/**
 * The tabs of each round's data spreadsheet and their columns, in order
 * (contract section 11). The script writes each column in exactly this place.
 * A new column only ever goes at the END of a tab, so no column moves:
 * config_version, the last column of pings, came on 26 Oct 2026 (Pranav's
 * decision 11 of the flow-graph work). A round's spreadsheet made before that
 * day gets it from its first ping after the update (PP_pingsTab_).
 */
const PP_DATA_TABS = Object.freeze({
  responses: ['received_at', 'submission_id', 'dc', 'round', 'lang', 'nps', 'support_contacted',
    'late', 'token_valid', 'dc_round_seen_before', 'opened_at', 'started_at', 'submitted_at',
    'sent_at', 'attempt', 'resume_count', 'config_version', 'app_version', 'mode', 'session_id',
    'client_net', 'client_ua', 'client_viewport', 'client_tz_offset_min', 'voice_supported',
    'voice_denied', 'tts_voice', 'answers_json', 'events_count'],
  function_ratings: ['received_at', 'submission_id', 'dc', 'round', 'block', 'item', 'rating',
    'not_applicable', 'threshold', 'below_threshold', 'issue_code'],
  free_text: ['received_at', 'submission_id', 'dc', 'round', 'lang', 'item_id', 'block', 'function',
    'issue_code', 'question_key', 'text', 'audio_url', 'audio_file_id', 'audio_mime',
    'audio_duration_s', 'audio_bytes', 'transcript', 'transcript_lang', 'transcribed_at',
    'cls_function', 'cls_issue_code', 'cls_severity', 'cls_sentiment', 'cls_summary_en',
    'cls_confidence', 'cls_unmapped', 'cls_new_theme_label', 'cls_provider', 'classified_at'],
  events: ['received_at', 'submission_id', 'session_id', 'dc', 'round', 'seq', 'screen', 'at'],
  pings: ['received_at', 'stage', 'dc', 'round', 'session_id', 'lang', 'screen', 'step_index',
    'step_total', 'at', 'token_valid', 'mode', 'client_net', 'events_json', 'config_version']
});

/**
 * Things remembered during ONE run of the script (each run starts empty).
 * holdsScriptLock: this run's admin lock IS the script lock (no document lock
 * was available), so the round-store step must not try to take it again.
 */
const PP_RUN = { props: null, liveLoaded: false, live: null, folderRepair: false, holdsScriptLock: false };


// =============================================================================
// 2. The "Partner Pulse" menu
// =============================================================================

/**
 * Google runs this by itself whenever someone opens the Sheet. It only adds
 * the "Partner Pulse" menu (Google allows this automatic step very little).
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Partner Pulse')
    .addItem('Open control panel', 'ppMenuOpenPanel')
    .addItem('Preview the draft form', 'ppMenuPreview')
    .addItem('Publish…', 'ppMenuPublish')
    .addItem('Generate links…', 'ppMenuLinks')
    .addSeparator()
    .addItem('Share the Drive folder with all editors', 'ppShareFolder')
    .addItem('Set up or repair', 'ppSetup')
    .addItem('Help', 'ppMenuHelp')
    .addToUi();
}

/*
 * Every menu item first calls PP_requireAllPermissions_ (below): if the
 * person left one of Google's permissions unticked, Google shows its
 * permission screen again instead of letting Publish or Rounds fail half-way.
 */

/** Menu: Open control panel (starts on Home). */
function ppMenuOpenPanel() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  PP_openPanelAt_('home');
}

/** Menu: Publish… (opens the panel on its Publish section). */
function ppMenuPublish() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  PP_openPanelAt_('publish');
}

/** Menu: Generate links… (opens the panel on its Links section). */
function ppMenuLinks() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  PP_openPanelAt_('links');
}

/** Leaves a one-time note for the panel saying which section to show first. */
function PP_openPanelAt_(section) {
  PropertiesService.getUserProperties().setProperty(PP_SRV.KEYS.PANEL_SECTION, section);
  panelOpen();
}

/**
 * Asks Google to show its permission screen again when the person using the
 * Sheet left one of the permissions unticked (Google's permission screen has
 * a tick box per permission). Google then stops this run and shows the
 * screen; with every box ticked, nothing happens here. Only Apps Script
 * versions that have ScriptApp.requireAllScopes can do this; elsewhere a
 * missing permission is explained by PP_permissionHelp_ when it gets in the way.
 * Google stops the run with an authorization error to show its screen: that
 * error goes through. Any other failure of this newer Google feature must not
 * break every menu item, so it is only logged and the menu item carries on.
 */
function PP_requireAllPermissions_() {
  if (!PP_hasMethod_(ScriptApp, 'requireAllScopes')) return;
  try {
    ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  } catch (err) {
    // (Not "scope": Google's "Unexpected error while getting the method or
    // property requireAllScopes" must not count as an authorization stop.)
    if (/authori[sz]ation|permission|consent/i.test(PP_rawErrorText_(err))) throw err;
    console.log('Could not ask Google for all permissions; carrying on: ' + PP_rawErrorText_(err));
  }
}

/** Menu: Preview the draft form. Shows a small window with the preview link. */
function ppMenuPreview() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  const ui = SpreadsheetApp.getUi();
  const roundId = PP_roundToPreview_(SpreadsheetApp.getActiveSpreadsheet());
  if (!roundId) {
    ui.alert('Preview the draft form', 'There is no round yet. Add one in the control panel ' +
      '(Rounds), press Save, then try again.', ui.ButtonSet.OK);
    return;
  }
  let url;
  try {
    url = panelPreviewUrl(roundId).url;
  } catch (err) {
    ui.alert('Preview the draft form', PP_errorText_(err), ui.ButtonSet.OK);
    return;
  }
  const html = HtmlService.createHtmlOutput(PP_previewDialogHtml_(roundId, url));
  html.setWidth(480);
  html.setHeight(250);
  ui.showModalDialog(html, 'Preview the draft form');
}

/** The round the menu's preview uses: the first open one, else the first draft, else the first. */
function PP_roundToPreview_(ss) {
  const rounds = PP_roundRows_(ss).filter(r => PP_SRV.DC_OR_ROUND_RULE.test(r.id));
  const pick = rounds.filter(r => r.status === 'open')[0] ||
    rounds.filter(r => r.status === 'draft')[0] || rounds[0];
  return pick ? pick.id : '';
}

function PP_previewDialogHtml_(roundId, url) {
  return '<div style="font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1B1F">' +
    '<p>This opens the <b>saved draft</b> of the form for round <b>' + PP_html_(roundId) + '</b>. ' +
    'Nothing you answer in the preview is saved.</p>' +
    '<p><a href="' + PP_html_(url) + '" target="_blank" rel="noopener" ' +
    'style="color:#4B2E83;font-weight:600">Open the preview</a></p>' +
    '<p style="color:#5F5E6B">Changed something in the control panel? Press Save there first. ' +
    'To preview another round, use the Preview button in the control panel.</p></div>';
}

/** Menu: Help. Shows where the guides are. */
function ppMenuHelp() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  const html = HtmlService.createHtmlOutput(PP_helpDialogHtml_());
  html.setWidth(540);
  html.setHeight(340);
  SpreadsheetApp.getUi().showModalDialog(html, 'Partner Pulse help');
}

function PP_helpDialogHtml_() {
  const base = PP_SRV.REPO_URL + '/blob/main/';
  const link = (href, text) => '<li><a href="' + PP_html_(href) + '" target="_blank" rel="noopener">' +
    PP_html_(text) + '</a></li>';
  return '<div style="font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1B1F">' +
    '<p>The guides are in the GitHub project:</p><ul>' +
    link(base + 'docs/control-panel.md', 'Using the control panel (start here)') +
    link(base + 'apps-script/README.md', 'Setting up this Sheet and the web app') +
    link(base + 'docs/submission-format.md', 'What the form sends and what is saved') +
    link(PP_SRV.REPO_URL + '#readme', 'The whole project') +
    '</ul><p style="color:#5F5E6B">Something looks broken? Run Partner Pulse &gt; Set up or repair ' +
    'first: it fixes missing tabs, folders and settings without deleting anything.</p></div>';
}


// =============================================================================
// 3. Set up or repair
// =============================================================================

/**
 * Menu: Set up or repair. Safe to run as often as you like:
 *   - creates any missing tab (and fixes headers, colours, tick boxes, lists);
 *   - creates the Drive folders and the link secret if they are missing;
 *   - if the questionnaire tabs are empty, offers to copy the questionnaire
 *     from GitHub and to publish it as version 1;
 *   - ends with a message explaining the next steps.
 * It never deletes or overwrites your content.
 */
function ppSetup() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  const ui = PP_uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const notes = [];
  try {
    PP_setUpTabs_(ss, notes);
    if (!PP_props_()[PP_SRV.KEYS.OWNER]) PP_setScriptProp_(PP_SRV.KEYS.OWNER, PP_currentUser_());
    PP_RUN.folderRepair = true;   // only set-up may replace a deleted folder (see PP_folderFromProp_)
    PP_setUpFolders_(notes);
    PP_RUN.folderRepair = false;
    PP_setUpSecret_(notes);
    PP_previewKey_(true);
    PP_setScriptProp_(PP_SRV.KEYS.CONTROL_SHEET, ss.getId());
    PP_writeMeta_(ss, PP_setupMeta_(ss));
    SpreadsheetApp.flush();
  } catch (err) {
    console.error('Set-up stopped: ' + (err && err.stack ? err.stack : err));
    PP_tell_(ui, 'Set-up stopped', 'Set-up could not finish: ' + PP_errorText_(err) + '\n\n' +
      'Nothing was deleted. Wait a minute (Google is sometimes busy), then run ' +
      'Partner Pulse > Set up or repair again.');
    return;
  }
  if (PP_configTabsAreEmpty_(ss)) PP_offerFirstImport_(ss, ui, notes);
  try {
    PP_applySettingsValidation_(ss);   // nice to have: tick boxes and lists in the Settings tab
  } catch (err) {
    console.error('Could not add tick boxes to the Settings tab: ' + err);
  }
  PP_tell_(ui, 'Set-up finished', PP_nextStepsText_(notes));
}

/** The _meta values set-up keeps up to date (never lowers the draft revision). */
function PP_setupMeta_(ss) {
  const meta = PP_readMeta_(ss);
  const values = { sheet_schema: 1, setup_done_at: PP_nowIso_() };
  if (!(parseInt(meta.draft_revision, 10) >= 0)) values.draft_revision = 0;
  return values;
}

/** Creates every missing tab and repairs headers, colours and checks on the others. */
function PP_setUpTabs_(ss, notes) {
  const specs = PP_controlTabSpecs_(PP_languageCodesForHeaders_(ss));
  const created = specs.filter(spec => PP_setUpTab_(ss, spec)).map(spec => spec.name);
  if (created.length) notes.push('Created the tab' + (created.length > 1 ? 's ' : ' ') + created.join(', ') + '.');
  PP_removeEmptyStarterSheet_(ss, specs, notes);
}

/**
 * The control Sheet's tabs (contract section 3), in the order set-up creates
 * them. The column headings come from PP_TABS in Model.gs, so set-up and the
 * code that reads and writes the tabs can never disagree. Per tab:
 *   required    the columns a repair adds back if they are missing
 *               (default: all of them; language columns are added on save)
 *   checkboxes  columns that get tick boxes
 *   lists       columns that get a drop-down list of allowed values
 *   textColumns columns formatted as plain text, so Google Sheets never turns
 *               what people type there into a number or a date (0123 stays 0123)
 *   notes       a short explanation on a header cell (hover to read it)
 */
function PP_controlTabSpecs_(languageCodes) {
  const purple = PP_SRV.TAB_COLOURS.config;
  const green = PP_SRV.TAB_COLOURS.operations;
  const grey = PP_SRV.TAB_COLOURS.system;
  const specs = [
    { name: 'Settings', colour: purple, widths: { setting: 260, value: 300, 'what it does': 520 } },
    { name: 'Languages', colour: purple, checkboxes: ['active'] },
    { name: 'Areas', colour: purple, checkboxes: ['active'],
      notes: { threshold: 'Leave empty to use the standard threshold (Settings > deep_dive.threshold).' } },
    { name: 'Chips', colour: purple, checkboxes: ['active'],
      notes: { chip_code: '"Other" is added by the form automatically: never list it here.' } },
    { name: 'Support', colour: purple, checkboxes: ['active'] },
    { name: 'Screens', colour: purple, checkboxes: ['active'],
      lists: { type: PP_screenTypeNames_(), repeat: ['each_area', 'each_low_area'] },
      notes: { required: 'TRUE, FALSE or empty (empty = the usual for this type of screen).',
        next: 'Where to go after this screen: the code of a LATER row or an ending. Empty = the following row.',
        jumps: 'Exceptions, checked first, written by the control panel: [{"when": rule, "goto": "code of a later row"}].',
        repeat: 'Empty = ask once. each_area = once per area. each_low_area = once per area rated low. ' +
          'Ordinary questions only.' } },
    { name: 'Texts', colour: purple, required: ['key', 'note'], widths: { key: 240 },
      notes: { note: 'Message for translators, for example "English changed: please re-check".' } },
    { name: 'What changed', colour: purple, required: ['round_id', 'order'] },
    { name: 'Audio clips', colour: purple },
    { name: 'Rounds', colour: green, lists: { status: PP_SRV.ROUND_STATUSES },
      notes: { status: 'Open and close rounds in the control panel (Rounds). Typing here does not ' +
        'open or close a round.' } },
    { name: 'DCs', colour: green, tickedCheckboxesWhenNew: ['active'], textColumns: ['dc_id'],
      notes: { dc_id: 'Partner data: stays in this Sheet only. Letters, digits, "-", "_" or "." ' +
        '(at most 64 characters). This column is plain text, so an id such as 0123 keeps its 0. ' +
        'An id that Sheets still shows as a number or a date gets no link: type it again with an ' +
        'apostrophe in front, for example \'0123.',
        language: 'Optional language code for the link, for example hi.',
        active: 'Untick (or write FALSE) to leave a DC out of new links. An empty cell counts as active.' } },
    { name: 'Links', colour: green, notes: { link: 'Filled in by the control panel (Links > Generate links).' } },
    { name: 'Publish history', colour: grey, checkboxes: ['live'],
      notes: { live: 'Filled in by Publish. Exactly one version is live.' } },
    { name: '_meta', colour: grey, hidden: true }
  ];
  specs.forEach(spec => { spec.headers = PP_controlTabHeaders_(spec.name, languageCodes); });
  return specs;
}

/** The headings of a control tab; Texts and What changed get one column per language code. */
function PP_controlTabHeaders_(name, languageCodes) {
  if (name === 'Texts') return ['key'].concat(languageCodes, ['note']);
  if (name === 'What changed') return ['round_id', 'order'].concat(languageCodes);
  return PP_TABS[name].slice();
}

/** The screen types for the Screens tab's drop-down list (from Model.gs). */
function PP_screenTypeNames_() {
  return PP_SCREEN_TYPES.map(entry => entry.type);
}

/** Language codes for the Texts / What changed headers of a NEW tab. */
function PP_languageCodesForHeaders_(ss) {
  const sheet = ss.getSheetByName('Languages');
  const table = sheet ? PP_readTable_(sheet) : null;
  if (!table || !PP_own_(table.col, 'code')) return PP_SRV.DEFAULT_LANGUAGES.slice();
  const codes = table.rows.map(row => PP_text_(row[table.col.code])).filter(code => code);
  return codes.length ? codes : PP_SRV.DEFAULT_LANGUAGES.slice();
}

/** Creates or repairs one tab. Returns true when the tab was new. */
function PP_setUpTab_(ss, spec) {
  let sheet = ss.getSheetByName(spec.name);
  const isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(spec.name, ss.getSheets().length);
  const headers = PP_ensureHeaders_(sheet, isNew ? spec.headers : (spec.required || spec.headers));
  PP_styleHeaderRow_(sheet, Math.max(headers.length, sheet.getLastColumn()));
  sheet.setFrozenRows(1);
  sheet.setTabColor(spec.colour);
  PP_applyColumnChecks_(sheet, spec, headers, isNew);
  PP_applyHeaderNotes_(sheet, spec, headers);
  if (isNew) PP_applyColumnWidths_(sheet, spec, headers);
  if (spec.hidden && !sheet.isSheetHidden()) sheet.hideSheet();
  return isNew;
}

/** Adds any wanted header that is missing from row 1 (after the last used column). */
function PP_ensureHeaders_(sheet, wanted) {
  const width = sheet.getLastColumn();
  const existing = width ? sheet.getRange(1, 1, 1, width).getValues()[0].map(PP_text_) : [];
  const missing = wanted.filter(name => existing.indexOf(name) < 0);
  if (missing.length) sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
  return existing.concat(missing);
}

/** Row 1: bold on light purple. */
function PP_styleHeaderRow_(sheet, width) {
  if (width < 1) return;
  const range = sheet.getRange(1, 1, 1, width);
  range.setFontWeight('bold');
  range.setBackground(PP_SRV.HEADER_COLOUR);
}

/**
 * Tick boxes and drop-down lists. These never change the values already in
 * the cells. Wrong values get a small red warning corner instead of being
 * refused, so the script itself can always write.
 */
function PP_applyColumnChecks_(sheet, spec, headers, isNew) {
  const rows = sheet.getMaxRows() - 1;
  if (rows < 1) return;
  (spec.checkboxes || []).forEach(name => {
    const col = headers.indexOf(name);
    if (col >= 0) sheet.getRange(2, col + 1, rows, 1).setDataValidation(PP_checkboxRule_());
  });
  Object.keys(spec.lists || {}).forEach(name => {
    const col = headers.indexOf(name);
    if (col >= 0) sheet.getRange(2, col + 1, rows, 1).setDataValidation(PP_listRule_(spec.lists[name]));
  });
  // Plain text ("@"): what is typed later stays exactly as typed. Values
  // already in the cells are not changed (an id that is already a number is
  // reported by panelGenerateLinks, which asks for it to be typed again).
  (spec.textColumns || []).forEach(name => {
    const col = headers.indexOf(name);
    if (col >= 0) sheet.getRange(2, col + 1, rows, 1).setNumberFormat('@');
  });
  // A NEW DCs tab starts with ticked boxes, so a pasted DC list counts as active.
  // (Only for a new tab: a repair must never re-tick a box someone unticked.)
  if (!isNew) return;
  (spec.tickedCheckboxesWhenNew || []).forEach(name => {
    const col = headers.indexOf(name);
    if (col < 0) return;
    const range = sheet.getRange(2, col + 1, rows, 1);
    range.insertCheckboxes();
    range.setValue(true);
  });
}

function PP_checkboxRule_() {
  return SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(true).build();
}

function PP_listRule_(values) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(true)
    .setHelpText('Pick one of: ' + values.join(', '))
    .build();
}

function PP_applyHeaderNotes_(sheet, spec, headers) {
  Object.keys(spec.notes || {}).forEach(name => {
    const col = headers.indexOf(name);
    if (col >= 0) sheet.getRange(1, col + 1).setNote(spec.notes[name]);
  });
}

function PP_applyColumnWidths_(sheet, spec, headers) {
  Object.keys(spec.widths || {}).forEach(name => {
    const col = headers.indexOf(name);
    if (col >= 0) sheet.setColumnWidth(col + 1, spec.widths[name]);
  });
}

/** Deletes the empty "Sheet1" a brand-new spreadsheet comes with (never anything with content). */
function PP_removeEmptyStarterSheet_(ss, specs, notes) {
  const ours = specs.map(spec => spec.name);
  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();
    const isEmpty = sheet.getLastRow() === 0 && sheet.getLastColumn() === 0;
    if (ours.indexOf(name) >= 0 || !/^Sheet\d+$/.test(name) || !isEmpty) return;
    if (ss.getSheets().length < 2) return;
    try {
      ss.deleteSheet(sheet);
      notes.push('Removed the empty starter tab "' + name + '".');
    } catch (err) {
      console.log('Could not remove the empty tab ' + name + ': ' + err);
    }
  });
}

/** Settings tab: tick boxes for on/off settings, drop-down lists for choices. */
function PP_applySettingsValidation_(ss) {
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return;
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'setting') || !PP_own_(table.col, 'value')) return;
  const schema = PP_settingsSchemaByKey_();
  table.rows.forEach((row, index) => {
    const key = PP_text_(row[table.col.setting]);
    const entry = PP_own_(schema, key) ? schema[key] : null;
    if (!entry) return;
    const cell = sheet.getRange(index + 2, table.col.value + 1);
    if (entry.type === 'bool') cell.setDataValidation(PP_checkboxRule_());
    if (entry.type === 'choice' && Array.isArray(entry.options) && entry.options.length) {
      cell.setDataValidation(PP_listRule_(entry.options));
    }
  });
}

function PP_settingsSchemaByKey_() {
  const byKey = {};
  PP_SETTINGS_SCHEMA.forEach(entry => { byKey[entry.key] = entry; });
  return byKey;
}

/** Creates the Drive folders if they are missing. */
function PP_setUpFolders_(notes) {
  const names = {};
  names[PP_SRV.KEYS.FOLDER] = PP_SRV.MAIN_FOLDER;
  names[PP_SRV.KEYS.PUBLISHED_FOLDER] = PP_SRV.MAIN_FOLDER + '/' + PP_SRV.PUBLISHED_FOLDER;
  names[PP_SRV.KEYS.ROUNDS_FOLDER] = PP_SRV.MAIN_FOLDER + '/' + PP_SRV.ROUNDS_FOLDER;
  const before = Object.assign({}, PP_props_());   // a copy: the remembered list changes below
  PP_folders_();
  const after = PP_props_();
  Object.keys(names).forEach(key => {
    if (before[key] !== after[key]) notes.push('Created the Google Drive folder "' + names[key] + '".');
  });
}

/**
 * The secret behind every link token: 64 random hex characters, created ONCE.
 * It is never replaced, because every link already sent depends on it.
 */
function PP_setUpSecret_(notes) {
  if (PP_props_()[PP_SRV.KEYS.SECRET]) return;
  const secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PP_setScriptProp_(PP_SRV.KEYS.SECRET, secret);
  notes.push('Created the secret code for partner links (kept in Script Properties). Never change ' +
    'or delete it while links are out.');
}

/** True when every questionnaire tab has nothing below its header row. */
function PP_configTabsAreEmpty_(ss) {
  return PP_SRV.CONFIG_TABS.every(name => {
    const sheet = ss.getSheetByName(name);
    return !sheet || sheet.getLastRow() <= 1;
  });
}

/** First set-up: copy the questionnaire from GitHub, then offer to publish it. */
function PP_offerFirstImport_(ss, ui, notes) {
  if (!ui) {
    notes.push('The questionnaire tabs are empty. Run Partner Pulse > Set up or repair from the ' +
      'Sheet\'s menu to copy the questionnaire from GitHub.');
    return;
  }
  const answer = ui.prompt('Copy the questionnaire from GitHub',
    'The questionnaire tabs are empty. Set-up can copy the current questionnaire from the GitHub ' +
    'project.\n\nPress OK to use the standard address below, or paste another address first:\n' +
    PP_SRV.DEFAULT_IMPORT_URL + '\n\nPress Cancel to skip. You can do it later in the control ' +
    'panel: Settings > Import from GitHub.', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) {
    notes.push('Skipped copying the questionnaire. Do it later in the control panel: Settings > ' +
      'Import from GitHub.');
    return;
  }
  const address = PP_text_(answer.getResponseText()) || PP_SRV.DEFAULT_IMPORT_URL;
  try {
    const result = PP_importFromAddress_(ss, address, PP_currentUser_());
    notes.push('Copied the questionnaire from GitHub (' + PP_countsText_(result.counts) + ').');
  } catch (err) {
    notes.push('Could not copy the questionnaire: ' + PP_errorText_(err) + ' Fix that, then run ' +
      'Partner Pulse > Set up or repair again (or use the control panel: Settings > Import from GitHub).');
    return;
  }
  PP_offerFirstPublish_(ss, ui, notes);
}

/** Asks "Publish version 1 now?" and publishes on Yes. */
function PP_offerFirstPublish_(ss, ui, notes) {
  const reply = ui.alert('Publish version 1 now?',
    'Publishing makes this questionnaire the one partners\' phones download. Nobody can answer yet: ' +
    'a round still has to be opened in the control panel.\n\nPublish version 1 now?', ui.ButtonSet.YES_NO);
  if (reply !== ui.Button.YES) {
    notes.push('Not published yet. When you are ready: Partner Pulse > Publish…');
    return;
  }
  try {
    const user = PP_currentUser_();
    const result = PP_withAdminLock_(() => PP_publish(ss, 'Version 1, copied from GitHub during set-up', user));
    if (result.ok) {
      notes.push('Published version ' + result.version + ' (' + result.config_version + ').');
      // What Publish wants looked at (for example: the form on GitHub could not be checked): never only in the log.
      (Array.isArray(result.warnings) ? result.warnings : []).forEach(warning => notes.push('Please check: ' + warning));
    } else {
      notes.push('Not published yet: ' + result.errors.length + ' problem(s) to fix first, for example: ' +
        result.errors[0].message + ' See the control panel > Publish > Check for problems.');
    }
  } catch (err) {
    notes.push('Could not publish: ' + PP_errorText_(err));
  }
}

/**
 * The closing message of set-up: what happened, then what to do next. The web
 * app address shown is the one recorded in the control panel (Google's own
 * idea of it is often the editors-only /dev address or an old deployment).
 */
function PP_nextStepsText_(notes) {
  const url = PP_webAppUrl_();
  const done = notes.length ? notes.map(note => '- ' + note).join('\n') :
    '- Everything was already in place. Nothing needed fixing.';
  return 'What set-up did:\n' + done + '\n\n' +
    'NEXT STEPS\n' +
    '1. Make the web app (the address partners\' phones talk to). In this Sheet: Extensions > Apps ' +
    'Script. Click Deploy > New deployment. Click the gear icon next to "Select type" and choose ' +
    '"Web app". Description: Partner Pulse. Execute as: Me. Who has access: Anyone. Click Deploy ' +
    'and allow the permissions Google asks for (tick "Select all").\n' +
    '2. Copy the "Web app" URL shown at the end (it ends in /exec). Open the control panel ' +
    '(Partner Pulse > Open control panel) and paste it into Home (or Settings) > Web app address, ' +
    'then press "Check and save": the panel checks that partners\' phones can reach it. Also send ' +
    'it to whoever looks after the GitHub project: it goes into web/config/survey.json.\n' +
    '3. Later code updates: Deploy > Manage deployments > pencil icon > Version: New version > ' +
    'Deploy. This keeps the same /exec address. Never make a second "New deployment" (its address ' +
    'would be new, and would have to be pasted into the panel again).\n\n' +
    'Web app address recorded in the control panel: ' +
    (url || 'none yet (see steps 1 and 2)');
}


// =============================================================================
// 4. Draft bookkeeping (_meta tab) and copying the questionnaire from GitHub
// =============================================================================

/** Reads the hidden _meta tab as { key: value }. */
function PP_readMeta_(ss) {
  const sheet = ss.getSheetByName('_meta');
  const meta = {};
  if (!sheet) return meta;
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'key') || !PP_own_(table.col, 'value')) return meta;
  table.rows.forEach(row => {
    const key = PP_text_(row[table.col.key]);
    if (key) meta[key] = row[table.col.value];
  });
  return meta;
}

/** Updates (or adds) keys in the hidden _meta tab, with one write. */
function PP_writeMeta_(ss, updates) {
  const sheet = PP_requireSheet_(ss, '_meta');
  const table = PP_readTable_(sheet);
  PP_requireColumns_(table, ['key', 'value'], '_meta');
  Object.keys(updates).forEach(key => {
    let row = table.rows.filter(candidate => PP_text_(candidate[table.col.key]) === key)[0];
    if (!row) {
      row = PP_blankRow_(table);
      row[table.col.key] = key;
      table.rows.push(row);
    }
    row[table.col.value] = updates[key];
  });
  PP_writeTableRows_(sheet, table);
}

/** The current draft revision (a whole number that goes up on every save). */
function PP_revisionOf_(meta) {
  return parseInt(meta.draft_revision, 10) || 0;
}

/**
 * The draft compiled for a preview. Reused for 30 seconds, so a preview link
 * shared around cannot make the script re-read the whole Sheet on every
 * visit. Every save clears it (PP_bumpRevision_), so admins see edits at once.
 */
function PP_draftDoc_() {
  const cached = PP_cacheGetChunks_('draft');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {
      console.log('Damaged draft cache, compiling again: ' + err);
    }
  }
  const doc = PP_compile(PP_readModel(PP_controlBook_()), null);
  PP_cachePutChunks_('draft', JSON.stringify(doc), PP_SRV.DRAFT_CACHE_SECONDS);
  return doc;
}

/** Adds 1 to the draft revision and records who saved. Returns the new revision. */
function PP_bumpRevision_(ss, user) {
  try {
    PP_cache_().remove('draft:k');   // the next preview compiles the new draft
  } catch (err) {
    console.log('Could not clear the preview cache: ' + err);
  }
  const revision = PP_revisionOf_(PP_readMeta_(ss)) + 1;
  PP_writeMeta_(ss, { draft_revision: revision, last_saved_by: user || PP_currentUser_(),
    last_saved_at: PP_nowIso_() });
  return revision;
}

/**
 * The answer given when someone else saved in the meantime, or null when the
 * revision the panel started from is still the current one.
 */
function PP_revisionConflict_(ss, baseRevision) {
  const meta = PP_readMeta_(ss);
  const current = PP_revisionOf_(meta);
  if (parseInt(baseRevision, 10) === current) return null;
  return { ok: false, conflict: true, revision: current, saved_by: PP_text_(meta.last_saved_by),
    saved_at: PP_isoText_(meta.last_saved_at) };
}

/** Downloads the four repo files from a base address and makes them the new draft. */
function PP_importFromAddress_(ss, baseUrl, user) {
  const files = PP_fetchStaticFiles_(baseUrl);
  return PP_withAdminLock_(() => PP_importFiles_(ss, files, user));
}

/**
 * Turns the downloaded files into the new draft. Rounds that already exist
 * keep everything (status, data links, notes); the form address is kept too.
 */
function PP_importFiles_(ss, files, user) {
  const model = PP_importStatic(files);
  const current = PP_readModelOrEmpty_(ss);
  model.rounds = PP_mergeImportedRounds_(current.rounds, model.rounds);
  if (current.settings && current.settings.form_url) model.settings.form_url = current.settings.form_url;
  model.rounds = PP_settleRounds_(model.rounds, current.rounds);
  PP_writeModel(ss, model, PP_SRV.ALL_SECTIONS);
  return { revision: PP_bumpRevision_(ss, user), counts: PP_modelCounts_(model) };
}

/** The draft as it is now, or an empty one when the tabs cannot be read yet (first set-up). */
function PP_readModelOrEmpty_(ss) {
  try {
    return PP_readModel(ss);
  } catch (err) {
    console.log('Reading the draft failed (normal on a first set-up): ' + err);
    return { settings: {}, rounds: [] };
  }
}

/** Existing rounds stay exactly as they are; rounds new in the import are added after them. */
function PP_mergeImportedRounds_(currentRounds, importedRounds) {
  const merged = (currentRounds || []).slice();
  const known = merged.map(round => round.id);
  (importedRounds || []).forEach(round => {
    if (known.indexOf(round.id) < 0) merged.push(round);
  });
  return merged;
}

function PP_modelCounts_(model) {
  return { texts: Object.keys(model.texts || {}).length, screens: (model.screens || []).length,
    areas: (model.areas || []).length, chips: (model.chips || []).length };
}

function PP_countsText_(counts) {
  return counts.screens + ' screens, ' + counts.areas + ' areas, ' + counts.chips + ' problem chips, ' +
    counts.texts + ' texts';
}

/**
 * Downloads survey.json, strings.json, whats_changed.json and audio_clips.json
 * from a base address such as
 * https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/web/
 * The first two are required; the other two may be missing.
 */
function PP_fetchStaticFiles_(baseUrl) {
  const base = PP_cleanImportBase_(baseUrl);
  return {
    survey: PP_fetchJson_(base + 'config/survey.json', true),
    strings: PP_fetchJson_(base + 'i18n/strings.json', true),
    whats_changed: PP_fetchJson_(base + 'config/whats_changed.json', false),
    audio_clips: PP_fetchJson_(base + 'config/audio_clips.json', false)
  };
}

function PP_cleanImportBase_(baseUrl) {
  const base = PP_text_(baseUrl) || PP_SRV.DEFAULT_IMPORT_URL;
  if (!/^https:\/\/[^\s"'<>]+$/.test(base)) {
    throw new Error('The import address must start with https:// (for example ' +
      PP_SRV.DEFAULT_IMPORT_URL + ').');
  }
  return base.charAt(base.length - 1) === '/' ? base : base + '/';
}

/** Downloads one JSON file. Optional files give null when they cannot be read. */
function PP_fetchJson_(url, required) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (err) {
    const permission = PP_permissionError_(err);   // a missing permission is not a wrong address
    if (permission) throw permission;
    if (!required) return null;
    throw new Error('Could not reach ' + url + '. Check the address and try again in a minute.');
  }
  const code = response.getResponseCode();
  if (code !== 200) {
    if (!required) return null;
    throw new Error('Could not download ' + url + ' (the server answered ' + code + '). ' +
      (code === 404 ? 'The file is not there: check the address, and that the project is public on GitHub.'
        : 'Try again in a minute.'));
  }
  try {
    return JSON.parse(String(response.getContentText()).replace(/^﻿/, ''));
  } catch (err) {
    if (!required) return null;
    throw new Error('The file ' + url + ' is damaged (it is not valid JSON), so nothing was imported.');
  }
}


// =============================================================================
// 5. Publishing, versions and restoring (contract section 10)
// =============================================================================

/**
 * Publishes the SAVED draft. Callers hold the admin lock (see PP_withAdminLock_).
 * Returns { ok: true, version, config_version } (plus warnings: [text] when
 * something needs a look) or { ok: false, errors }.
 * Order matters: the version only goes live once its file and cache are ready.
 * The file type is written out as 'application/json': Google's MimeType list
 * has no JSON entry.
 * Since 23 Oct 2026 the route ("flow") is published as a graph, which only
 * forms with the new engine understand: Publish first checks the form on
 * GitHub (PP_formEngineGuard_) and refuses while it is older. Once a real
 * round has been opened, every published code is also remembered for good
 * (PP_recordCodesEverLive_), so the codes lock covers hidden questions too;
 * from then on Publish stops with "try again in a minute" while Google Drive
 * cannot read the live version (PP_requireLiveWhileLocked_), instead of
 * publishing without checking and remembering its codes.
 */
function PP_publish(ss, note, user) {
  const draft = PP_readModel(ss);
  const live = PP_liveDocForChecks_();
  PP_requireLiveWhileLocked_(live);
  const check = PP_validate(draft, live, PP_codesEverLiveForChecks_());
  if (check.errors && check.errors.length) return { ok: false, errors: check.errors };
  const version = PP_nextVersion_(ss);
  const stamp = { version: version, published_at: PP_nowIso_(), published_by: user || PP_currentUser_(),
    note: PP_cleanNote_(note) };
  const doc = PP_compile(draft, stamp);
  const warnings = [];
  if (PP_mdlIsGraph_(doc.survey.flow)) {
    const guard = PP_formEngineGuard_(draft.settings.form_url);
    if (!guard.ok) return { ok: false, errors: [{ section: 'settings', ref: 'Settings > form_url', message: guard.message }] };
    if (guard.warning) warnings.push(guard.warning);
  }
  const text = JSON.stringify(doc);
  const file = PP_folders_().published.createFile('p' + version + '.json', text, 'application/json');
  PP_giveToOwner_(file, 'the published version p' + version + '.json');
  PP_makeLive_(version, file.getId(), text);
  PP_recordPublish_(ss, doc, stamp, file.getUrl());
  const kept = PP_recordCodesEverLive_(live, doc);
  if (kept) warnings.push(kept);
  const answer = { ok: true, version: version, config_version: doc.config_version };
  if (warnings.length) {
    warnings.forEach(warning => console.log('Publish p' + version + ': ' + warning));
    answer.warnings = warnings;
  }
  return answer;
}

/**
 * The publish guard for a route graph. The survey on GitHub Pages (form_url)
 * must have the new engine, whose web/js/flow.js says "ENGINE = 2" (or more):
 * an older form treats a graph as unusable and silently shows its own copy.
 * The file is read as text and never run. Answers { ok: true } (a new form,
 * remembered for 10 minutes), { ok: false, message } (an older form: refused),
 * or { ok: true, warning } when the form could not be reached (Publish goes on).
 */
function PP_formEngineGuard_(formUrl) {
  const base = PP_text_(formUrl);
  const needed = Math.max(PP_SRV.FLOW_ENGINE_NEEDED, PP_flowEngine_() || 0);
  const cacheKey = 'form_engine:' + base;
  const known = parseInt(PP_cacheGetOrNull_(cacheKey), 10);
  if (known >= needed) return { ok: true };
  const unreachable = why => ({ ok: true, warning: 'Published, but Partner Pulse could not check that the form on ' +
    'GitHub understands this version (' + why + '). If partners keep seeing the old questions, upload the new form ' +
    'code to GitHub, wait for the green tick, then publish again.' });
  if (!/^https:\/\/[^\s"'<>?#]+\/$/.test(base)) return unreachable('the form address is not valid');
  let response;
  try {
    response = UrlFetchApp.fetch(base + 'js/flow.js', { muteHttpExceptions: true, followRedirects: true });
  } catch (err) {
    const permission = PP_permissionError_(err);
    if (permission) throw permission;
    return unreachable('Google said: ' + PP_rawErrorText_(err));
  }
  const code = response.getResponseCode();
  if (code !== 200) return unreachable(base + 'js/flow.js answered ' + code);
  const match = /\bENGINE\s*=\s*(\d+)/.exec(String(response.getContentText() || ''));
  const engine = match ? parseInt(match[1], 10) : 0;
  if (engine < needed) {
    return { ok: false, message: 'The form on GitHub is older than this control panel: upload the new form code first, ' +
      'wait for the green tick, then publish.' };
  }
  PP_cachePutSafely_(cacheKey, String(engine), PP_SRV.FORM_ENGINE_CACHE_SECONDS);
  return { ok: true };
}

/** The route engine of this control panel (Flow.gs: flow.js's ENGINE), or null without Flow.gs. */
function PP_flowEngine_() {
  try {
    return typeof PP_flowLib_ === 'function' ? PP_flowLib_().flow.ENGINE : null;
  } catch (err) {
    console.error('Flow.gs could not be run: ' + err);
    return null;
  }
}

/** Which route code this script runs (Flow.gs's SHA-256 of its source files), or null without Flow.gs. */
function PP_flowFingerprint_() {
  return typeof PP_FLOW_FINGERPRINT_ === 'string' ? PP_FLOW_FINGERPRINT_ : null;
}

/**
 * Once codes are locked (a real round has opened), Publish needs the live
 * version: its codes are checked against the draft and then remembered for
 * good (CODES_EVER_LIVE). When a version is live but Google Drive could not
 * read it just now (live = null), Publish stops with a plain message instead
 * of going on without those codes, which would let a version partners
 * answered escape the codes lock for good (26 Oct 2026, review finding 9).
 * Nothing is published, so the person simply tries again.
 */
function PP_requireLiveWhileLocked_(live) {
  if (live || !PP_codesLocked_()) return;
  const version = parseInt(PP_props_()[PP_SRV.KEYS.LIVE_VERSION], 10) || 0;
  if (version < 1) return;
  throw new Error('Nothing was published: Google Drive could not read the live version (version ' + version + ') just ' +
    'now, and Publish needs it to protect the codes partners have answered. Try again in a minute. If this keeps ' +
    'happening, check that the file p' + version + '.json is still in the Drive folder "Valmo Partner Pulse/' +
    'published", or ask whoever maintains the scripts.');
}

/** CODES_EVER_LIVE as a list of codes ([] when there is none, or when it is damaged: that is logged). */
function PP_codesEverLive_() {
  const raw = PP_props_()[PP_SRV.KEYS.CODES_EVER_LIVE];
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list.filter(code => typeof code === 'string' && code);
  } catch (err) {
    // reported below
  }
  console.error('Script Property ' + PP_SRV.KEYS.CODES_EVER_LIVE + ' is damaged; it is ignored until the next Publish.');
  return [];
}

/** The codes ever live, for the checks: only once codes are locked (like PP_liveDocForChecks_), else null. */
function PP_codesEverLiveForChecks_() {
  return PP_codesLocked_() ? PP_codesEverLive_() : null;
}

/**
 * After a Publish, once codes are locked: remembers for good every code of
 * the version that was live until now and of the one just published
 * (Script Property CODES_EVER_LIVE). Without this, a question hidden and
 * published could later be deleted unnoticed (the "hide-and-publish hole").
 * Returns a warning when the list is nearly full (Google keeps at most 9 KB
 * in one Script Property) or could not grow, else ''.
 */
function PP_recordCodesEverLive_(previousLive, doc) {
  if (!PP_codesLocked_()) return '';
  const before = PP_codesEverLive_();
  const codes = PP_mdlMergeCodes_(PP_mdlMergeCodes_(before, PP_mdlCodesOfDoc_(previousLive)), PP_mdlCodesOfDoc_(doc));
  const text = JSON.stringify(codes);
  if (text.length > PP_MDL_EVER_LIVE_MAX_CHARS_) {
    return 'The list of codes partners have answered is full (' + text.length + ' characters; Google keeps at most about ' +
      PP_MDL_EVER_LIVE_MAX_CHARS_ + '), so the codes added in this version are not protected yet. Ask whoever maintains ' +
      'the scripts to move the list (Script Property ' + PP_SRV.KEYS.CODES_EVER_LIVE + ').';
  }
  if (codes.length !== before.length || text !== JSON.stringify(before)) PP_setScriptProp_(PP_SRV.KEYS.CODES_EVER_LIVE, text);
  if (text.length >= PP_MDL_EVER_LIVE_WARN_CHARS_) {
    return 'The list of codes partners have answered is nearly full (' + text.length + ' of about ' +
      PP_MDL_EVER_LIVE_MAX_CHARS_ + ' characters). Ask whoever maintains the scripts to move it (Script Property ' +
      PP_SRV.KEYS.CODES_EVER_LIVE + ').';
  }
  return '';
}

function PP_cleanNote_(note) {
  return PP_text_(note).replace(/\s+/g, ' ').slice(0, PP_SRV.NOTE_MAX_CHARS);
}

/** Next version number: one more than the highest live or recorded version. */
function PP_nextVersion_(ss) {
  const live = parseInt(PP_props_()[PP_SRV.KEYS.LIVE_VERSION], 10) || 0;
  const recorded = PP_historyEntries_(ss).reduce((top, entry) => Math.max(top, entry.version), 0);
  return Math.max(live, recorded) + 1;
}

/**
 * Makes a version live. The cache is filled FIRST and the version number is
 * switched LAST, so a phone asking in between never gets a mixed-up answer.
 */
function PP_makeLive_(version, fileId, text) {
  PP_cachePutChunks_('live:' + version, text, PP_SRV.LONG_CACHE_SECONDS);
  PP_setScriptProp_(PP_SRV.KEYS.LIVE_FILE, fileId);
  PP_setScriptProp_(PP_SRV.KEYS.LIVE_VERSION, String(version));
  PP_RUN.liveLoaded = false;
}

/** Adds the new version to Publish history and marks it as the only live one. */
function PP_recordPublish_(ss, doc, stamp, fileUrl) {
  const sheet = PP_requireSheet_(ss, 'Publish history');
  const table = PP_readTable_(sheet);
  PP_requireColumns_(table, ['version', 'config_version', 'published_at', 'published_by', 'note',
    'file', 'live'], 'Publish history');
  table.rows.forEach(row => { row[table.col.live] = false; });
  table.rows.push(PP_rowFromObject_(table, {
    version: stamp.version, config_version: doc.config_version, published_at: stamp.published_at,
    published_by: stamp.published_by, note: stamp.note, file: fileUrl, live: true
  }));
  PP_writeTableRows_(sheet, table);
}

/** Every row of Publish history as { version, config_version, ..., live, file }. */
function PP_historyEntries_(ss) {
  const sheet = ss.getSheetByName('Publish history');
  if (!sheet) return [];
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'version')) return [];
  const get = (row, name) => (PP_own_(table.col, name) ? row[table.col[name]] : '');
  return table.rows.map(row => ({
    version: parseInt(get(row, 'version'), 10) || 0,
    config_version: PP_text_(get(row, 'config_version')),
    published_at: PP_isoText_(get(row, 'published_at')),
    published_by: PP_text_(get(row, 'published_by')),
    note: PP_text_(get(row, 'note')),
    live: PP_isTicked_(get(row, 'live'), false),
    file: PP_text_(get(row, 'file'))
  })).filter(entry => entry.version > 0);
}

/**
 * Brings an old version back as the DRAFT (it does not publish it).
 * PP_modelFromPublished (Model.gs) builds the draft from that version and
 * keeps from the current draft: the rounds (the Rounds tab is not even
 * rewritten), the form address, any setting the old version did not
 * contain, the translators' notes, and everything the version lacks (a
 * language, area, problem, support question or question), SWITCHED OFF, in
 * its place, with its texts and recordings. The "What changed" bullets
 * become the version's: bullets of a round the version did not have are
 * deleted, although the round itself stays.
 */
function PP_restore(ss, version) {
  const wanted = parseInt(version, 10);
  if (!(wanted > 0)) throw new Error('Choose the version number to restore, for example 3.');
  const entry = PP_historyEntries_(ss).filter(candidate => candidate.version === wanted)[0];
  if (!entry) throw new Error('There is no version ' + wanted + ' in Publish history.');
  const doc = PP_readPublishedDoc_(entry);
  const model = PP_modelFromPublished(doc, PP_readModel(ss));
  PP_writeModel(ss, model, PP_SRV.CONTENT_SECTIONS);
  return { ok: true, revision: PP_bumpRevision_(ss, PP_currentUser_()) };
}

/** Loads a published version: from the cache when it is the live one, else from Drive. */
function PP_readPublishedDoc_(entry) {
  const live = PP_liveDocOrNull_();
  if (live && live.version === entry.version) return live;
  const fileId = PP_driveIdFromUrl_(entry.file);
  if (!fileId) {
    throw new Error('Publish history has no file for version ' + entry.version + ', so it cannot be ' +
      'restored. Look for p' + entry.version + '.json in the Drive folder "Valmo Partner Pulse/published".');
  }
  return JSON.parse(PP_driveText_(fileId, 'the saved copy of version ' + entry.version));
}

/** The id inside a Google Drive address (…/d/<id>/… or …?id=<id>). */
function PP_driveIdFromUrl_(url) {
  const match = /\/d\/([A-Za-z0-9_-]{10,})/.exec(url || '') || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url || '');
  return match ? match[1] : '';
}


// =============================================================================
// 6. The live (published) questionnaire: cache first, Drive as the back-up
// =============================================================================

/** The live published document, or null when nothing is published. Throws on Drive errors. */
function PP_liveDoc_() {
  if (PP_RUN.liveLoaded) return PP_RUN.live;
  const props = PP_props_();
  const version = parseInt(props[PP_SRV.KEYS.LIVE_VERSION], 10) || 0;
  let doc = null;
  if (version > 0) {
    doc = PP_liveFromCache_(version) || PP_liveFromDrive_(version, props[PP_SRV.KEYS.LIVE_FILE]);
  }
  PP_RUN.live = doc;
  PP_RUN.liveLoaded = true;
  return doc;
}

/** Like PP_liveDoc_, but gives null instead of failing (for checks that can do without it). */
function PP_liveDocOrNull_() {
  try {
    return PP_liveDoc_();
  } catch (err) {
    console.error('Could not load the live version: ' + err);
    return null;
  }
}

/**
 * The live version for the control panel. Like PP_liveDocOrNull_, except
 * when Google Drive refuses this person (the cached copy has expired and
 * they were never given the Drive folder): then it stops with the plain
 * "ask the owner to share the Drive folder" message. A co-admin learns it as
 * soon as the panel opens, instead of seeing "nothing is published".
 */
function PP_liveDocForAdmin_() {
  try {
    return PP_liveDoc_();
  } catch (err) {
    if (err && err.ppDriveAccess) throw err;
    console.error('Could not load the live version: ' + err);
    return null;
  }
}

/**
 * The live version for the "a code partners answered is missing" warnings,
 * or null while no round has ever been opened: until then no partner can
 * have answered, so every code may still change freely (PP_codesLocked_).
 */
function PP_liveDocForChecks_() {
  return PP_codesLocked_() ? PP_liveDocForAdmin_() : null;
}

function PP_liveFromCache_(version) {
  const text = PP_cacheGetChunks_('live:' + version);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;   // a damaged cache entry: read the Drive copy instead
  }
}

/** Reads the live file from Drive and puts it back in the cache (only if it is that version). */
function PP_liveFromDrive_(version, fileId) {
  if (!fileId) throw new Error('LIVE_FILE_ID is missing from Script Properties.');
  const text = PP_driveText_(fileId, 'the published questionnaire (version ' + version + ')');
  const doc = JSON.parse(text);
  if (doc && doc.version === version) PP_cachePutChunks_('live:' + version, text, PP_SRV.LONG_CACHE_SECONDS);
  return doc;
}

/** Stores a long text in the cache as numbered pieces: <prefix>:k = how many, <prefix>:0, :1, ... */
function PP_cachePutChunks_(prefix, text, seconds) {
  const chunks = PP_splitForCache_(text);
  const entries = {};
  chunks.forEach((chunk, i) => { entries[prefix + ':' + i] = chunk; });
  entries[prefix + ':k'] = String(chunks.length);
  try {
    PP_cache_().putAll(entries, seconds);
  } catch (err) {
    console.error('Could not fill the cache (' + prefix + '): ' + err);   // the Drive copy still works
  }
}

/** Reads back a text stored by PP_cachePutChunks_, or null if any piece is missing. */
function PP_cacheGetChunks_(prefix) {
  try {
    const cache = PP_cache_();
    const count = parseInt(cache.get(prefix + ':k'), 10);
    if (!(count > 0)) return null;
    const keys = [];
    for (let i = 0; i < count; i++) keys.push(prefix + ':' + i);
    const found = cache.getAll(keys);
    const parts = keys.map(key => found[key]);
    return parts.every(part => typeof part === 'string') ? parts.join('') : null;
  } catch (err) {
    return null;
  }
}

/** Cuts a text into cache-sized pieces without splitting an emoji in two. */
function PP_splitForCache_(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + PP_SRV.CACHE_CHUNK_CHARS, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xD800 && last <= 0xDBFF) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}


// =============================================================================
// 7. Rounds and their data spreadsheets (contract section 11)
// =============================================================================

/**
 * Makes sure a round has its Drive folder, its audio/ folder and its data
 * spreadsheet. Creates only what is missing; returns the round's record
 * { status, sheet_id, audio_folder_id } (also kept in Script Property ROUND:<id>).
 * Callers ALWAYS hold the SCRIPT lock: both the control panel (opening a
 * round, see PP_withStoreLock_) and a partner's first answer (PP_openRoundStore_)
 * can get here, and the lock makes sure only one of them creates the store.
 * Whatever a co-admin creates here is handed over to the owner (PP_giveToOwner_).
 */
function PP_ensureRoundStore_(roundId) {
  const info = PP_readRoundProp_(roundId) || { status: 'draft', sheet_id: '', audio_folder_id: '' };
  if (info.sheet_id && info.audio_folder_id) return info;
  const roundFolder = PP_childFolder_(PP_folders_().rounds, roundId);
  const audioFolder = PP_childFolder_(roundFolder, PP_SRV.AUDIO_FOLDER);
  const book = info.sheet_id ? PP_openBook_(info.sheet_id, 'the data spreadsheet of round ' + roundId)
    : PP_createDataBook_(roundId, roundFolder);
  info.sheet_id = book.getId();
  info.audio_folder_id = audioFolder.getId();
  PP_saveRoundProp_(roundId, info);
  PP_writeRoundCells_(roundId, { data_sheet: book.getUrl(), audio_folder: audioFolder.getUrl() });
  return info;
}

/**
 * Creates "Valmo Partner Pulse - data - <round>" inside the round's folder,
 * with the five data tabs.
 * Why exact widths: Google counts EVERY cell of a tab (even empty ones)
 * against the 10 million cell limit of a spreadsheet, and a normal new tab
 * has 26 columns. Each data tab is therefore cut (or widened) to exactly the
 * columns it uses as soon as it is added (PP_addDataTab_, PP_setColumnCount_),
 * and the spreadsheet's empty starter tab is deleted; that keeps a round of
 * 10,000 partners at about 3.5 million cells instead of about 8 million.
 */
function PP_createDataBook_(roundId, folder) {
  try {
    const book = SpreadsheetApp.create(PP_SRV.DATA_BOOK_PREFIX + roundId);
    const file = DriveApp.getFileById(book.getId());
    file.moveTo(folder);
    const first = book.getSheets()[0];
    Object.keys(PP_DATA_TABS).forEach(name => PP_addDataTab_(book, name));
    book.deleteSheet(first);
    PP_giveToOwner_(file, 'the data spreadsheet of round ' + roundId);   // last: once it is complete
    return book;
  } catch (err) {
    const permission = PP_permissionError_(err);
    if (permission) throw permission;
    throw new Error('Google could not create the data spreadsheet for round ' + roundId + ' (' +
      PP_rawErrorText_(err) + '). The round was not opened. Try again in a minute; if it keeps failing, ' +
      'ask whoever maintains the code.');
  }
}

/** Adds one data tab with its header row (bold, frozen), exactly as wide as its columns. */
function PP_addDataTab_(book, name) {
  const sheet = book.insertSheet(name);
  const headers = PP_DATA_TABS[name];
  PP_setColumnCount_(sheet, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  PP_styleHeaderRow_(sheet, headers.length);
  PP_ensureRows_(sheet, PP_SRV.DATA_TAB_START_ROWS);
  sheet.setFrozenRows(1);
  return sheet;
}

/** A data tab of a round's spreadsheet; re-creates it if someone deleted it. */
function PP_dataSheet_(book, name) {
  const sheet = book.getSheetByName(name);
  if (sheet) return sheet;
  try {
    return PP_addDataTab_(book, name);
  } catch (err) {
    const again = book.getSheetByName(name);   // another request created it at the same moment
    if (again) return again;
    throw err;
  }
}

/** The data spreadsheet of a round, creating the store first if it does not exist yet. */
function PP_openRoundStore_(roundId, info) {
  let record = info;
  if (!record.sheet_id || !record.audio_folder_id) {
    record = PP_withScriptLock_(PP_SRV.SUBMIT_LOCK_MS, () => PP_ensureRoundStore_(roundId));
    if (!record) return null;   // busy: the caller answers "try again"
    record.status = info.status;
  }
  return { info: record, book: SpreadsheetApp.openById(record.sheet_id) };
}

/** A round's record from Script Properties, or null if the round was never saved there. */
function PP_readRoundProp_(roundId) {
  const raw = PP_props_()[PP_SRV.KEYS.ROUND_PREFIX + roundId];
  if (!raw) return null;
  try {
    const info = JSON.parse(raw);
    return {
      status: PP_SRV.ROUND_STATUSES.indexOf(info.status) >= 0 ? info.status : 'draft',
      sheet_id: PP_text_(info.sheet_id),
      audio_folder_id: PP_text_(info.audio_folder_id)
    };
  } catch (err) {
    console.error('Script Property ' + PP_SRV.KEYS.ROUND_PREFIX + roundId + ' is damaged: ' + err);
    return null;
  }
}

/** Saves a round's record in Script Properties and refreshes the cached copy at once. */
function PP_saveRoundProp_(roundId, info) {
  const record = { status: info.status, sheet_id: info.sheet_id || '', audio_folder_id: info.audio_folder_id || '' };
  const json = JSON.stringify(record);
  PP_setScriptProp_(PP_SRV.KEYS.ROUND_PREFIX + roundId, json);
  try {
    PP_cache_().put('round:' + roundId, json, PP_SRV.ROUND_CACHE_SECONDS);
  } catch (err) {
    console.error('Could not refresh the cached round status: ' + err);
  }
}

/**
 * A round's status for the web app: from the cache (60 seconds), else from
 * Script Properties. A round that was never saved is "unknown".
 */
function PP_roundInfo_(roundId) {
  const key = 'round:' + roundId;
  try {
    const cached = PP_cache_().get(key);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.log('Round cache unreadable, using Script Properties: ' + err);
  }
  const info = PP_readRoundProp_(roundId) || { status: 'unknown', sheet_id: '', audio_folder_id: '' };
  try {
    PP_cache_().put(key, JSON.stringify(info), PP_SRV.ROUND_CACHE_SECONDS);
  } catch (err) {
    console.log('Could not cache the round status: ' + err);
  }
  return info;
}

/**
 * Are the codes (of questions, areas, problems, support questions, answer
 * options) locked? Only once partners can have answered: from the moment a
 * real round was opened for the first time (Script Property
 * ROUNDS_EVER_OPENED, set by panelSetRoundStatus). A real round that is open
 * or closed today counts too, for rounds opened before that property existed.
 * Test rounds never count (PP_isTestRound_). Until then the placeholder
 * questionnaire can be replaced freely.
 */
function PP_codesLocked_() {
  const props = PP_props_();
  if (props[PP_SRV.KEYS.ROUNDS_EVER_OPENED] === '1') return true;
  return Object.keys(props).some(key => {
    if (key.indexOf(PP_SRV.KEYS.ROUND_PREFIX) !== 0) return false;
    const roundId = key.slice(PP_SRV.KEYS.ROUND_PREFIX.length);
    if (PP_isTestRound_(roundId)) return false;
    const info = PP_readRoundProp_(roundId);
    return Boolean(info && (info.status === 'open' || info.status === 'closed'));
  });
}

/**
 * Is this a test round? Its id starts with SMOKE, DEMO or TEST, in capitals
 * or not (for example SMOKE-R1, which the setup guide's smoke test opens, or
 * DEMO-R1). Opening a test round never locks the codes (Pranav's decision,
 * 21 Oct 2026): only fake DCs answer it, so the placeholder questions and
 * problems can still be replaced afterwards. Its links must never go to real
 * partners. The control panel uses the same rule (Panel.html, isTestRound).
 */
function PP_isTestRound_(roundId) {
  return /^(SMOKE|DEMO|TEST)/i.test(String(roundId || ''));
}

/** Remembers for good that a real round has been opened (see PP_codesLocked_). */
function PP_recordRoundsOpened_() {
  if (PP_props_()[PP_SRV.KEYS.ROUNDS_EVER_OPENED] !== '1') PP_setScriptProp_(PP_SRV.KEYS.ROUNDS_EVER_OPENED, '1');
}

/**
 * Every round of the draft gets a record in Script Properties ("draft") as
 * soon as it is saved. (Its links say "not open yet". So do links for a
 * round with no record: the bootstrap reports such a round as "draft" too.)
 */
function PP_createMissingRoundProps_(rounds) {
  (rounds || []).forEach(round => {
    const id = PP_text_(round && round.id);
    if (!PP_isDcOrRound_(id) || PP_readRoundProp_(id)) return;
    PP_saveRoundProp_(id, { status: 'draft', sheet_id: '', audio_folder_id: '' });
  });
}

/**
 * Rounds sent by the control panel (or an import) are combined with what the
 * script manages itself: the status always comes from Script Properties (it
 * changes only through Open / Close), and the data links are never lost.
 * A round that already collects answers is never dropped from the tab.
 */
function PP_settleRounds_(incoming, current) {
  PP_createMissingRoundProps_(incoming);
  const before = {};
  (current || []).forEach(round => { before[round.id] = round; });
  const seen = {};
  const settled = (incoming || []).map(round => {
    const copy = Object.assign({}, round);
    const old = PP_own_(before, copy.id) ? before[copy.id] : null;
    const record = PP_isDcOrRound_(copy.id) ? PP_readRoundProp_(copy.id) : null;
    copy.status = record ? record.status : (old ? old.status : 'draft');
    copy.data_sheet = old ? old.data_sheet : '';
    copy.audio_folder = old ? old.audio_folder : '';
    seen[copy.id] = true;
    return copy;
  });
  (current || []).forEach(round => {
    const collects = round.data_sheet || (round.status && round.status !== 'draft');
    if (!seen[round.id] && collects) settled.push(round);
  });
  return settled;
}

/** The Rounds tab as simple objects (read directly, for speed). */
function PP_roundRows_(ss) {
  const sheet = ss.getSheetByName('Rounds');
  if (!sheet) return [];
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'round_id')) return [];
  const get = (row, name) => (PP_own_(table.col, name) ? row[table.col[name]] : '');
  return table.rows.map(row => ({
    id: PP_text_(get(row, 'round_id')),
    status: PP_text_(get(row, 'status')) || 'draft',
    opens_on: PP_dateText_(get(row, 'opens_on')),
    closes_on: PP_dateText_(get(row, 'closes_on')),
    data_sheet: PP_text_(get(row, 'data_sheet')),
    audio_folder: PP_text_(get(row, 'audio_folder')),
    notes: PP_text_(get(row, 'notes'))
  })).filter(round => round.id);
}

/** Writes some cells of a round's row in the Rounds tab (columns found by header name). */
function PP_writeRoundCells_(roundId, values) {
  let ss;
  try {
    ss = PP_controlBook_();
  } catch (err) {
    console.error('Could not open the control Sheet to update round ' + roundId + ': ' + err);
    return;
  }
  const sheet = ss.getSheetByName('Rounds');
  if (!sheet) return;
  const table = PP_readTable_(sheet);
  if (!PP_own_(table.col, 'round_id')) return;
  const index = table.rows.findIndex(row => PP_text_(row[table.col.round_id]) === roundId);
  if (index < 0) return;
  Object.keys(values).forEach(name => {
    if (PP_own_(table.col, name)) sheet.getRange(index + 2, table.col[name] + 1).setValue(PP_cell_(values[name]));
  });
}


// =============================================================================
// 8. The public web app: GET requests (contract section 12)
// =============================================================================

/**
 * Answers GET requests from partners' phones (and from smoke tests):
 *   ?action=health
 *   ?action=bootstrap&round=<id>[&draft=1&pk=<preview key>]
 *   ?action=whats_changed&round=<id>
 * Always answers JSON, never a web page.
 */
function doGet(e) {
  const params = PP_params_(e);
  if (PP_wantsFormPage_(params)) return PP_formPage_(params);
  return PP_jsonOut_(PP_answerSafely_(() => PP_answerGet_(params)));
}

/**
 * A partner-style link (?dc=..&t=..&round=.., or a preview link) opened on
 * the web app's own address, without ?action=: the survey page itself
 * (Meesho-only mode, see PP_formPage_).
 */
function PP_wantsFormPage_(params) {
  return !PP_text_(params.action) && ['dc', 'round', 'preview'].some(key => typeof params[key] === 'string');
}

/**
 * MEESHO-ONLY MODE (21 Oct 2026). While the web app is open only to people
 * signed in with a company account ("Anyone within <company>"), the survey
 * on GitHub Pages can't use it: the form never sends a Google login with its
 * background requests, so Google refuses them. So the web app serves the
 * survey page itself, to signed-in colleagues: the form's own index.html,
 * fetched from the form address (Settings > form_url), with every file it
 * loads addressed there, and window.PP_EMBED telling the form to talk to
 * this script through google.script.run (ppFormRequest) instead of fetch().
 * Once "Anyone" is allowed, partners use the GitHub Pages links again.
 */
function PP_formPage_(params) {
  let base;
  let html;
  try {
    base = PP_formBaseUrl_();
    html = PP_formIndexHtml_(base);
  } catch (err) {
    console.error('The survey page could not be built: ' + (err && err.stack ? err.stack : err));
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;margin:24px">The survey could not be ' +
      'loaded just now. Please try again in a minute.</p>').setTitle('Valmo Partner Pulse');
  }
  const embed = { base: base, params: {}, page: '' };
  const query = [];
  PP_SRV.EMBED_PARAMS.forEach(key => {
    if (typeof params[key] !== 'string') return;
    embed.params[key] = params[key].slice(0, 200);
    query.push(encodeURIComponent(key) + '=' + encodeURIComponent(embed.params[key]));
  });
  // This page's own address: reloading Google's inner frame shows a blank page, so the form's
  // "Start again" and "Retry" open this address in the whole window instead (app.js, reloadPage).
  const own = PP_webAppUrl_();
  if (own) embed.page = own + '?' + query.join('&');
  // Safe inside <script>: no "</" (or "<!--") and no line separators can end it early.
  const data = JSON.stringify(embed).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const boot = '<script>window.PP_EMBED = ' + data + ';</script>';
  const page = html
    .replace(/<head([^>]*)>/i, tag => tag + boot)
    .replace(/\b(src|href)="(?![a-z][a-z0-9+.-]*:|\/\/|#)([^"]*)"/gi, (match, attr, path) => attr + '="' + base + path + '"');
  return HtmlService.createHtmlOutput(page)
    .setTitle('Valmo Partner Pulse')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, interactive-widget=resizes-content');
}

/** The form address (Settings > form_url), where the form's own files are; cached 10 minutes. */
function PP_formBaseUrl_() {
  const cached = PP_cacheGetOrNull_('form_base');
  if (cached) return cached;
  const url = PP_requireFormUrl_(PP_readModel(PP_controlBook_()).settings);
  PP_cachePutSafely_('form_base', url, PP_SRV.FORM_PAGE_CACHE_SECONDS);
  return url;
}

/** The form's index.html from the form address; cached 10 minutes. */
function PP_formIndexHtml_(base) {
  const key = 'form_index:' + base;
  const cached = PP_cacheGetOrNull_(key);
  if (cached) return cached;
  const response = UrlFetchApp.fetch(base + 'index.html', { muteHttpExceptions: true, followRedirects: true });
  const html = String(response.getContentText() || '');
  if (response.getResponseCode() !== 200 || !/<head[\s>]/i.test(html)) {
    throw new Error(base + 'index.html answered ' + response.getResponseCode() + ', not the form page.');
  }
  PP_cachePutSafely_(key, html, PP_SRV.FORM_PAGE_CACHE_SECONDS);
  return html;
}

/**
 * The survey page of Meesho-only mode (PP_formPage_) talks to this script
 * here, through google.script.run, instead of fetch(): "bootstrap" answers
 * like GET ?action=bootstrap, and "post" (a ping or a submission, as the
 * same text a phone would POST) like doPost. Public on purpose, like doGet
 * and doPost: it needs no admin rights and does nothing else.
 */
function ppFormRequest(kind, payload) {
  if (kind === 'bootstrap') {
    const p = PP_isPlainObject_(payload) ? payload : {};
    return PP_answerSafely_(() => PP_answerGet_({ action: 'bootstrap', round: PP_text_(p.round),
      draft: p.draft === '1' ? '1' : '', pk: PP_text_(p.pk) }));
  }
  if (kind === 'post') {
    return PP_answerSafely_(() => PP_answerPost_({ postData: { contents: typeof payload === 'string' ? payload : '' } }));
  }
  return PP_badRequest_('Unknown request. Use "bootstrap" or "post".');
}

function PP_answerGet_(params) {
  const action = PP_text_(params.action);
  if (action === 'health') return PP_health_();
  if (action === 'bootstrap') return PP_bootstrap_(PP_text_(params.round), params.draft === '1', PP_text_(params.pk));
  if (action === 'whats_changed') return PP_whatsChangedAnswer_(PP_text_(params.round));
  return PP_badRequest_('Unknown or missing "action". Use ?action=bootstrap&round=<round>, ' +
    '?action=whats_changed&round=<round> or ?action=health.');
}

/**
 * runs_as_owner: true when the web app runs as the person who set Partner
 * Pulse up (OWNER_EMAIL), so the files it creates land in their Drive. The
 * email itself is never sent: this answer is public.
 * flow_engine / flow_fingerprint: which route code this deployment runs
 * (Flow.gs: the engine version and the SHA-256 of its source files), or null
 * when Flow.gs was not pasted.
 */
function PP_health_() {
  const version = parseInt(PP_props_()[PP_SRV.KEYS.LIVE_VERSION], 10) || null;
  return { ok: true, service: PP_SRV.SERVICE_NAME, mode: 'live', time: PP_nowIso_(), live_version: version,
    runs_as_owner: PP_runsAsOwner_(), form_page: true, flow_engine: PP_flowEngine_(), flow_fingerprint: PP_flowFingerprint_() };
}

/**
 * The questionnaire for one round. Normally the PUBLISHED version (served
 * from the cache). With draft=1 (Preview, which also needs the right preview
 * key) the saved tabs are compiled into a draft, which the script cache keeps
 * for 30 seconds; every save clears it (PP_draftDoc_, PP_bumpRevision_).
 * A round the backend has never heard of is reported as "draft", so the form
 * says "not open yet" at once (pings and answers for it get round_not_open).
 */
function PP_bootstrap_(roundId, draft, previewKey) {
  if (!PP_isDcOrRound_(roundId)) {
    return PP_badRequest_('The "round" is missing or not valid. Example: ?action=bootstrap&round=2026-R1');
  }
  // The unpublished draft is shown only to preview links made by the control
  // panel (they carry &pk=<private key>); anyone else gets nothing.
  if (draft) {
    const key = PP_previewKey_(false);
    if (!key || previewKey !== key) return { ok: false, error: 'bad_preview_key' };
  }
  const doc = draft ? PP_draftDoc_() : PP_liveDoc_();
  if (!doc) return { ok: false, error: 'not_published' };
  const status = PP_roundInfo_(roundId).status;
  return {
    ok: true,
    draft: draft,
    round: { id: roundId, status: status === 'unknown' ? 'draft' : status },
    version: draft ? null : doc.version,
    config_version: draft ? 'draft' : doc.config_version,
    survey: doc.survey,
    strings: doc.strings,
    whats_changed: PP_roundNews_(doc, roundId),
    clips: doc.clips || {}
  };
}

/** One round's "What changed" block, or an empty one. */
function PP_roundNews_(doc, roundId) {
  const all = doc.whats_changed || {};
  const block = PP_own_(all, roundId) ? all[roundId] : null;
  if (!block || !Array.isArray(block.items)) return { title: null, items: [] };
  return { title: block.title || null, items: block.items };
}

/** The Phase 1 "What changed" request, kept for compatibility. */
function PP_whatsChangedAnswer_(roundId) {
  if (!PP_isDcOrRound_(roundId)) {
    return PP_badRequest_('The "round" is missing. Example: ?action=whats_changed&round=DEMO-R1');
  }
  const doc = PP_liveDoc_();
  if (!doc) return { ok: false, error: 'not_published' };
  const news = PP_roundNews_(doc, roundId);
  return { ok: true, round: roundId, title: news.title, items: news.items };
}


// =============================================================================
// 9. The public web app: POST messages (pings and finished surveys)
// =============================================================================

/**
 * Receives messages from partners' phones. The body is JSON sent as plain
 * text (docs/submission-format.md, section 1). Always answers JSON with
 * { ok: true | false, ... }.
 */
function doPost(e) {
  return PP_jsonOut_(PP_answerSafely_(() => PP_answerPost_(e)));
}

function PP_answerPost_(e) {
  const body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (body.length > PP_SRV.MAX_POST_CHARS) {
    return PP_badRequest_('The message is ' + PP_megabytes_(body.length) + ' MB, more than the 25 MB limit.');
  }
  const message = PP_parseMessage_(body);
  return message.kind === 'submit' ? PP_handleSubmit_(message) : PP_handlePing_(message);
}

/** Turns the text the phone sent into a message, or stops with bad_request. */
function PP_parseMessage_(body) {
  if (!body.trim()) PP_refuse_('The message was empty.');
  let message;
  try {
    message = JSON.parse(body);
  } catch (err) {
    PP_refuse_('The message is not valid JSON (' + err.message + ').');
  }
  if (!PP_isPlainObject_(message)) PP_refuse_('The message must be a JSON object, like {"kind": "submit", ...}.');
  if (message.kind !== 'submit' && message.kind !== 'ping') PP_refuse_('"kind" must be "submit" or "ping".');
  return message;
}

/** A progress signal (opened / started / progress). Never contains answers. */
function PP_handlePing_(message) {
  PP_checkPing_(message);
  if (!PP_tokenIsValid_(message)) return { ok: false, error: 'bad_token' };
  const round = PP_roundInfo_(message.round);
  if (round.status !== 'open' && round.status !== 'closed') return { ok: false, error: 'round_not_open' };
  if (!PP_pingAllowed_(message.dc, message.round)) return { ok: true };   // over the rate limit: not stored
  const store = PP_openRoundStore_(message.round, round);
  if (!store) return PP_busyAnswer_();
  const pings = PP_pingsTab_(store.book, store.info.sheet_id);
  pings.sheet.appendRow(PP_pingRow_(message).slice(0, pings.width));
  if (message.stage !== 'opened') return { ok: true };
  return { ok: true, token_valid: true, already_submitted: PP_dcHasResponse_(store.book, message.dc),
    round_status: round.status };
}

/** The same checks as scripts/mock_server.py (check_ping). */
function PP_checkPing_(message) {
  if (PP_SRV.PING_STAGES.indexOf(message.stage) < 0) PP_refuse_('"stage" must be "opened", "started" or "progress".');
  PP_checkDcAndRound_(message);
  // Pings are small; these caps stop one link from pumping junk into the pings tab.
  Object.keys(PP_SRV.MAX_PING_FIELD_CHARS).forEach(field => {
    const value = message[field];
    if (value !== undefined && value !== null && String(value).length > PP_SRV.MAX_PING_FIELD_CHARS[field]) {
      PP_refuse_('"' + field + '" is too long.');
    }
  });
  if (message.events !== undefined && message.events !== null) {
    if (!Array.isArray(message.events) || message.events.length > PP_SRV.MAX_PING_EVENTS) {
      PP_refuse_('"events" must be a list of at most ' + PP_SRV.MAX_PING_EVENTS + ' items.');
    }
  }
  if (JSON.stringify(message).length > PP_SRV.MAX_PING_CHARS) PP_refuse_('The ping is too large.');
}

/**
 * Rate limit: at most 60 stored pings per DC and round in 10 minutes. The
 * counter lives in the cache as "count|start time" and the window does not
 * restart with every ping.
 */
function PP_pingAllowed_(dc, roundId) {
  const key = 'pc:' + dc + ':' + roundId;
  const now = Date.now();
  const windowMs = PP_SRV.PING_WINDOW_SECONDS * 1000;
  try {
    const cache = PP_cache_();
    const parts = String(cache.get(key) || '').split('|');
    let count = parseInt(parts[0], 10) || 0;
    let start = parseInt(parts[1], 10) || now;
    if (now - start >= windowMs) {
      count = 0;
      start = now;
    }
    count += 1;
    const secondsLeft = Math.max(1, Math.ceil((start + windowMs - now) / 1000));
    cache.put(key, count + '|' + start, secondsLeft);
    return count <= PP_SRV.PING_LIMIT;
  } catch (err) {
    console.log('Ping counter unavailable, storing the ping anyway: ' + err);   // never lose a ping for this
    return true;
  }
}

/**
 * One row of the pings tab. config_version (the last column) is the
 * questionnaire version the phone showed, as in the responses tab: the
 * published one ("p7-2026-10-21") or the form's own copy ("2026-10-19.1").
 * It lets the dashboard tell which screens a partner who never finished saw.
 */
function PP_pingRow_(message) {
  const client = PP_isPlainObject_(message.client) ? message.client : {};
  const values = {
    received_at: PP_nowIso_(), stage: message.stage, dc: message.dc, round: message.round,
    session_id: message.session_id, lang: message.lang, screen: message.screen,
    step_index: message.step_index, step_total: message.step_total, at: message.at, token_valid: true,
    mode: message.mode, client_net: client.net,
    events_json: Array.isArray(message.events) ? JSON.stringify(message.events) : '',
    config_version: message.config_version
  };
  return PP_DATA_TABS.pings.map(name => PP_cell_(values[name]));
}

/**
 * The pings tab of a round's data spreadsheet, and how many columns of the
 * ping row may be written there: { sheet, width }.
 * A spreadsheet made before 26 Oct 2026 has a pings tab without its last
 * column, config_version. The first ping that finds it missing adds it
 * (PP_addPingVersionColumn_). After that, the script cache remembers for up
 * to 6 hours that this spreadsheet has every column ("pingcols:<spreadsheet
 * id>"), so a ping normally reads nothing extra. If the column cannot be
 * added right now (the lock stays busy for 8 seconds, or Google refuses), the
 * ping is still stored, without its version: a ping is never lost for this,
 * and nothing is ever written into a column that is not config_version.
 */
function PP_pingsTab_(book, bookId) {
  const sheet = PP_dataSheet_(book, 'pings');
  const all = PP_DATA_TABS.pings.length;
  const key = 'pingcols:' + (bookId || book.getId());
  if (PP_cacheGetOrNull_(key) === String(all)) return { sheet: sheet, width: all };
  let ready = false;
  try {
    // Checked again inside the lock: another ping may have added it while this one waited.
    ready = PP_hasPingVersionColumn_(sheet) || PP_withScriptLock_(PP_SRV.SUBMIT_LOCK_MS,
      () => PP_hasPingVersionColumn_(sheet) || PP_addPingVersionColumn_(sheet)) === true;
  } catch (err) {
    console.error('Could not add the config_version column to the pings tab; this ping is stored without it: ' + err);
  }
  if (!ready) return { sheet: sheet, width: PP_DATA_TABS.pings.indexOf('config_version') };
  PP_cachePutSafely_(key, String(all), PP_SRV.LONG_CACHE_SECONDS);
  return { sheet: sheet, width: all };
}

/** True when the pings tab has its config_version column (that header, in its place). */
function PP_hasPingVersionColumn_(sheet) {
  const column = PP_DATA_TABS.pings.indexOf('config_version') + 1;
  return sheet.getMaxColumns() >= column && PP_text_(sheet.getRange(1, column).getValue()) === 'config_version';
}

/**
 * Adds the config_version column to a pings tab made before 26 Oct 2026: a
 * NEW, empty column right after events_json, so nothing is overwritten (a
 * column of the admins' own on the right moves one place right), with its
 * header in row 1 in the header style. The rows already there keep an empty
 * cell. Runs inside the script lock (PP_pingsTab_). Returns true.
 */
function PP_addPingVersionColumn_(sheet) {
  const column = PP_DATA_TABS.pings.indexOf('config_version') + 1;
  const after = Math.min(column - 1, sheet.getMaxColumns());   // a tab that lost columns is widened first
  sheet.insertColumnsAfter(after, column - after);
  const header = sheet.getRange(1, column);
  header.setValue('config_version');
  header.setFontWeight('bold');
  header.setBackground(PP_SRV.HEADER_COLOUR);
  console.log('Added the config_version column to the pings tab of a data spreadsheet made before 26 Oct 2026.');
  return true;
}

/**
 * A finished survey. Steps (contract section 12): check it, check the token,
 * check the round, decode the voice notes, check the short-term memory for a
 * resend, save the voice notes, then - one submission at a time (the lock) -
 * skip it if it was already stored (or if this DC already has 10 stored in
 * this round: answered ok, but not stored, only logged), write all rows, and
 * only then answer ok. Any failure answers server_error, so the phone keeps
 * the answers and sends them again later: a failure never loses answers
 * silently.
 *
 * Why the voice notes are saved BEFORE the lock: saving files in Drive is by
 * far the slowest step, and every other partner waits while one submission
 * holds the lock. When the submission has voice notes, a quick look at the
 * responses tab first skips a resend that is already stored (or a DC over its
 * limit), so it does not leave a second copy of its recordings. Unused
 * voice-note files can still be left behind: by a send that fails after its
 * recordings were saved ("busy", or server_error; the resend saves them again
 * under the same names, which Drive allows), or by a copy that turns out to
 * be a repeat (or over the DC's limit) only once it gets its turn. Only files
 * that a counted free_text row points to (audio_file_id) belong to a stored
 * answer (docs/submission-format.md, section 9).
 */
function PP_handleSubmit_(message) {
  PP_checkSubmit_(message);
  if (!PP_tokenIsValid_(message)) return { ok: false, error: 'bad_token' };
  const round = PP_roundInfo_(message.round);
  if (round.status !== 'open' && round.status !== 'closed') return { ok: false, error: 'round_not_open' };
  // Voice notes are decoded only now, for a genuine link and an open round:
  // decoding megabytes for a forged message would only waste Google's time.
  const voiceNotes = PP_decodeVoiceNotes_(message.free_text);
  const known = PP_cacheGetOrNull_('sub:' + message.submission_id);
  if (known) return PP_storedAnswer_(message, true, known);
  const store = PP_openRoundStore_(message.round, round);
  if (!store) return PP_busyAnswer_();
  const responses = PP_dataSheet_(store.book, 'responses');
  if (voiceNotes.length) {
    const notNew = PP_answerIfNotNew_(message, PP_lookUpEarlier_(responses, message));
    if (notNew) return notNew;   // already stored (or the DC is over its limit): no recording is saved again
  }
  const audio = PP_saveVoiceNotes_(message, voiceNotes, store.info.audio_folder_id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(PP_SRV.SUBMIT_LOCK_MS)) return PP_busyAnswer_();
  try {
    return PP_storeSubmission_(store.book, responses, message, audio, round.status === 'closed');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Runs while holding the lock, so it is kept short: look for an earlier copy
 * (in the two columns that matter only), read where each tab ends, then
 * write the four blocks of rows one after the other (no reads in between,
 * so Google can send the writes together).
 */
function PP_storeSubmission_(book, responses, message, audio, late) {
  const cached = PP_cacheGetOrNull_('sub:' + message.submission_id);   // stored while this one waited?
  if (cached) return PP_storedAnswer_(message, true, cached);
  const earlier = PP_lookUpEarlier_(responses, message);
  const notNew = PP_answerIfNotNew_(message, earlier);
  if (notNew) return notNew;
  const receivedAt = PP_nowIso_();
  const context = { received_at: receivedAt, late: late, seen_before: earlier.fromDc > 0, audio: audio };
  const blocks = PP_rowBlocks_(book, responses, earlier.lastRow, message, context);   // reads only
  blocks.forEach(PP_writeBlock_);                                                     // writes only
  SpreadsheetApp.flush();   // make the rows final before the next submission takes the lock
  PP_cachePutSafely_('sub:' + message.submission_id, receivedAt, PP_SRV.SUB_CACHE_SECONDS);
  console.log('Stored submission ' + message.submission_id + ' for round ' + message.round +
    (late ? ' (late)' : '') + ', voice notes: ' + Object.keys(audio).length);
  return PP_storedAnswer_(message, false, receivedAt);
}

/**
 * What the responses tab already holds for this submission:
 *   lastRow     where the tab ends now
 *   receivedAt  received_at of an earlier copy of it ('' when it is new)
 *   fromDc      how many submissions this DC already has in the round
 */
function PP_lookUpEarlier_(responses, message) {
  const lastRow = responses.getLastRow();
  const receivedAt = PP_findSubmission_(responses, message.submission_id, lastRow);
  const fromDc = receivedAt ? 0 : PP_countInColumn_(responses, 'responses', 'dc', message.dc, lastRow);
  return { lastRow: lastRow, receivedAt: receivedAt, fromDc: fromDc };
}

/**
 * The answer for a submission that must not be stored, or null when it is
 * new: an earlier copy is already stored (a resend: same received_at as the
 * first time), or the DC already has the most submissions one round keeps
 * (answered "ok" so the phone stops sending it, but nothing is stored).
 */
function PP_answerIfNotNew_(message, earlier) {
  if (earlier.receivedAt) {
    PP_cachePutSafely_('sub:' + message.submission_id, earlier.receivedAt, PP_SRV.SUB_CACHE_SECONDS);
    return PP_storedAnswer_(message, true, earlier.receivedAt);
  }
  if (earlier.fromDc >= PP_SRV.MAX_SUBMISSIONS_PER_DC) {
    console.error('Not stored: DC ' + message.dc + ' already has ' + earlier.fromDc + ' submissions in round ' +
      message.round + ' (limit ' + PP_SRV.MAX_SUBMISSIONS_PER_DC + '). Submission ' + message.submission_id);
    return PP_storedAnswer_(message, true, PP_nowIso_());
  }
  return null;
}

/**
 * The submission's rows for each tab, with where that tab ends now (read
 * here, before anything is written). The responses row comes LAST, so a
 * submission counts as stored only once its responses row is there. If
 * anything fails before it, the phone gets server_error and sends again, and
 * the whole submission is written again with a new received_at (resends are
 * recognised in the responses tab only). Rows the failed attempt had already
 * written to events, free_text or function_ratings stay behind: readers count
 * a row in those tabs only when its submission_id AND received_at match a
 * responses row (docs/submission-format.md, section 9).
 */
function PP_rowBlocks_(book, responses, responsesLastRow, message, context) {
  const blocks = [
    { sheet: PP_dataSheet_(book, 'events'), rows: PP_eventRows_(message, context) },
    { sheet: PP_dataSheet_(book, 'free_text'), rows: PP_freeTextRows_(message, context) },
    { sheet: PP_dataSheet_(book, 'function_ratings'), rows: PP_ratingRows_(message, context) },
    { sheet: responses, rows: [PP_responseRow_(message, context)], lastRow: responsesLastRow }
  ].filter(block => block.rows.length);
  blocks.forEach(block => {
    if (block.lastRow === undefined) block.lastRow = block.sheet.getLastRow();
    block.maxRows = block.sheet.getMaxRows();
  });
  return blocks;
}

/** Writes one block below its tab's last row with ONE write, adding empty rows first if the tab is full. */
function PP_writeBlock_(block) {
  const needed = block.lastRow + block.rows.length;
  if (needed > block.maxRows) block.sheet.insertRowsAfter(block.maxRows, needed - block.maxRows + PP_SRV.ROW_GROWTH);
  block.sheet.getRange(block.lastRow + 1, 1, block.rows.length, block.rows[0].length).setValues(block.rows);
}

function PP_storedAnswer_(message, duplicate, receivedAt) {
  return { ok: true, submission_id: message.submission_id, duplicate: duplicate, received_at: receivedAt };
}

function PP_busyAnswer_() {
  return { ok: false, error: 'server_error', message: 'busy, try again' };
}

/**
 * The same checks as scripts/mock_server.py (check_submit), with the same
 * messages, except the voice notes: the mock decodes and checks them inside
 * check_submit, before the token check; here PP_decodeVoiceNotes_ does that
 * later, after the token and round checks (see PP_handleSubmit_). Returns
 * nothing: a wrong message stops with bad_request (PP_refuse_).
 */
function PP_checkSubmit_(message) {
  const version = message.schema_version;
  if (typeof version !== 'number' || version !== PP_SRV.SCHEMA_VERSION) {
    PP_refuse_('"schema_version" must be ' + PP_SRV.SCHEMA_VERSION + '.');
  }
  if (!(typeof message.submission_id === 'string' && PP_SRV.SUBMISSION_ID_RULE.test(message.submission_id))) {
    PP_refuse_('"submission_id" is missing or not valid. It must be 1 to 64 characters: ' +
      'letters, digits, "-" or "_".');
  }
  PP_checkDcAndRound_(message);
  if (typeof message.lang !== 'string') PP_refuse_('"lang" must be text, for example "hi".');
  if (!PP_isPlainObject_(message.answers)) PP_refuse_('"answers" must be an object ({...}).');
  ['ratings', 'free_text', 'events'].forEach(field => {
    if (!Array.isArray(message[field])) PP_refuse_('"' + field + '" must be a list ([...]).');
    const cap = PP_SRV.MAX_LIST_ITEMS[field];
    if (message[field].length > cap) {
      PP_refuse_('"' + field + '" has ' + message[field].length + ' items; a real survey has at most ' + cap + '.');
    }
  });
  if (Object.keys(message.answers).length > PP_SRV.MAX_ANSWER_KEYS) PP_refuse_('"answers" has too many entries.');
  message.free_text.forEach((item, index) => {
    const where = 'free_text[' + index + ']';
    if (!PP_isPlainObject_(item)) PP_refuse_(where + ' must be an object ({...}).');
    if (item.audio !== null && item.audio !== undefined && !PP_isPlainObject_(item.audio)) {
      PP_refuse_(where + '.audio must be null or an object.');
    }
  });
  // Everything except the recordings must stay small (the recordings have their own 5 MB limit).
  const withoutRecordings = JSON.stringify(message, (key, value) => (key === 'base64' ? '' : value));
  if (withoutRecordings.length > PP_SRV.MAX_ANSWERS_CHARS) PP_refuse_('The answers (without voice notes) are too large.');
}

function PP_checkDcAndRound_(message) {
  ['dc', 'round'].forEach(field => {
    if (!PP_isDcOrRound_(message[field])) {
      PP_refuse_('"' + field + '" is missing or not valid. It must be 1 to 64 characters: ' +
        'letters, digits, "-", "_" or ".".');
    }
  });
}

/** Checks every free_text item and decodes the voice notes inside them. */
function PP_decodeVoiceNotes_(freeText) {
  const notes = [];
  freeText.forEach((item, index) => {
    const where = 'free_text[' + index + ']';
    if (!PP_isPlainObject_(item)) PP_refuse_(where + ' must be an object ({...}).');
    const audio = item.audio;
    if (audio === null || audio === undefined) return;   // a typed answer only
    if (!PP_isPlainObject_(audio)) PP_refuse_(where + '.audio must be null or an object.');
    if (typeof item.item_id !== 'string' || !item.item_id) {
      PP_refuse_(where + '.item_id is missing. It is needed to name the voice-note file.');
    }
    notes.push({ index: index, item_id: item.item_id, mime: audio.mime,
      bytes: PP_decodeRecording_(audio.base64, where) });
  });
  return notes;
}

/**
 * Standard base64 (as the form sends it) back into the recording. Accepts
 * exactly what Python's base64.b64decode(..., validate=True) accepts on
 * Python 3.13 and newer: only base64 letters, and "=" only as the correct
 * padding at the very end.
 */
function PP_decodeRecording_(encoded, where) {
  if (typeof encoded !== 'string' || !encoded) PP_refuse_(where + '.audio.base64 is missing or empty.');
  const notBase64 = () => PP_refuse_(where + '.audio.base64 is not valid base64 text.' +
    (encoded.indexOf('data:') === 0 ? " Send only the part after 'base64,'." : ''));
  // Base64 letters, at most two "=" at the end, and a length that is a multiple of 4.
  // (Kept as one simple pattern on purpose: fancier patterns crash on a 7 MB recording.)
  if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) notBase64();
  const size = encoded.length / 4 * 3 - (encoded.length - encoded.replace(/=+$/, '').length);
  if (size > PP_SRV.MAX_VOICE_NOTE_BYTES) {
    PP_refuse_('The voice note in ' + where + ' is ' + PP_megabytes_(size) + ' MB; ' +
      'one voice note may be at most 5 MB.');
  }
  try {
    return Utilities.base64Decode(encoded);
  } catch (err) {
    return notBase64();   // a recording Google cannot decode: retrying would not help
  }
}

/** File extension for a recording format such as "audio/webm;codecs=opus". */
function PP_voiceExtension_(mime) {
  const base = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  return PP_own_(PP_SRV.VOICE_EXTENSIONS, base) ? PP_SRV.VOICE_EXTENSIONS[base] : '.bin';
}

/**
 * Saves each voice note as a private file in rounds/<round>/audio/, named
 * <dc>__<submission_id>__<item_id with ":" turned into "-">.<ext>.
 * Runs BEFORE the submission waits for the lock (see PP_handleSubmit_).
 * Returns { <free_text index>: { url, id, bytes } }.
 */
function PP_saveVoiceNotes_(message, voiceNotes, audioFolderId) {
  const saved = {};
  if (!voiceNotes.length) return saved;
  const folder = DriveApp.getFolderById(audioFolderId);
  const namesTaken = {};
  voiceNotes.forEach(note => {
    const name = PP_voiceNoteName_(message, note, namesTaken);
    const extension = PP_voiceExtension_(note.mime);
    const contentType = extension === '.bin' ? 'application/octet-stream' :
      String(note.mime).split(';')[0].trim().toLowerCase();
    const file = folder.createFile(Utilities.newBlob(note.bytes, contentType, name));
    // When the web app runs as someone other than the owner (a co-admin
    // deployed it), the recording still ends up in the owner's Drive. Nothing
    // happens in the usual case, where the owner deployed the web app.
    PP_giveToOwner_(file, 'the voice note ' + name);
    saved[note.index] = { url: file.getUrl(), id: file.getId(), bytes: note.bytes.length };
  });
  return saved;
}

/** File name of a voice note; a second note with the same name gets -2, -3, ... */
function PP_voiceNoteName_(message, note, namesTaken) {
  const item = note.item_id.replace(/:/g, '-').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 100);
  const stem = message.dc + '__' + message.submission_id + '__' + item;
  const extension = PP_voiceExtension_(note.mime);
  let name = stem + extension;
  let number = 2;
  while (namesTaken[name.toLowerCase()]) {
    name = stem + '-' + number + extension;
    number += 1;
  }
  namesTaken[name.toLowerCase()] = true;
  return name;
}

/** The row of the responses tab. */
function PP_responseRow_(message, context) {
  const answers = message.answers;
  const client = PP_isPlainObject_(message.client) ? message.client : {};
  const values = {
    received_at: context.received_at, submission_id: message.submission_id, dc: message.dc,
    round: message.round, lang: message.lang, nps: answers.nps, support_contacted: answers.support_gate,
    late: context.late, token_valid: true, dc_round_seen_before: context.seen_before,
    opened_at: message.opened_at, started_at: message.started_at, submitted_at: message.submitted_at,
    sent_at: message.sent_at, attempt: message.attempt, resume_count: message.resume_count,
    config_version: message.config_version, app_version: message.app_version, mode: message.mode,
    session_id: message.session_id, client_net: client.net, client_ua: client.ua,
    client_viewport: client.viewport, client_tz_offset_min: client.tz_offset_min,
    voice_supported: client.voice_supported, voice_denied: client.voice_denied, tts_voice: client.tts_voice,
    answers_json: JSON.stringify(answers), events_count: message.events.length
  };
  return PP_DATA_TABS.responses.map(name => PP_cell_(values[name]));
}

/** Rows of the function_ratings tab (area, support and generic 1-5 ratings). */
function PP_ratingRows_(message, context) {
  return message.ratings.filter(PP_isPlainObject_).map(rating => {
    const values = {
      received_at: context.received_at, submission_id: message.submission_id, dc: message.dc,
      round: message.round, block: rating.block, item: rating.item, rating: rating.rating,
      not_applicable: rating.not_applicable, threshold: rating.threshold,
      below_threshold: rating.below_threshold, issue_code: rating.issue_code
    };
    return PP_DATA_TABS.function_ratings.map(name => PP_cell_(values[name]));
  });
}

/** Rows of the free_text tab (typed answers and voice notes). Transcript and cls_* stay empty. */
function PP_freeTextRows_(message, context) {
  return message.free_text.map((item, index) => {
    const audio = PP_isPlainObject_(item.audio) ? item.audio : null;
    const file = PP_own_(context.audio, String(index)) ? context.audio[index] : null;
    const values = {
      received_at: context.received_at, submission_id: message.submission_id, dc: message.dc,
      round: message.round, lang: message.lang, item_id: item.item_id, block: item.block,
      function: item['function'], issue_code: item.issue_code, question_key: item.question_key,
      text: item.text, audio_url: file ? file.url : '', audio_file_id: file ? file.id : '',
      audio_mime: audio ? audio.mime : '', audio_duration_s: audio ? audio.duration_s : '',
      audio_bytes: file ? file.bytes : ''
    };
    return PP_DATA_TABS.free_text.map(name => PP_cell_(values[name]));
  });
}

/** Rows of the events tab (one per screen view). */
function PP_eventRows_(message, context) {
  return message.events.filter(PP_isPlainObject_).map(event => {
    const values = {
      received_at: context.received_at, submission_id: message.submission_id,
      session_id: message.session_id, dc: message.dc, round: message.round, seq: event.seq,
      screen: event.screen, at: event.at
    };
    return PP_DATA_TABS.events.map(name => PP_cell_(values[name]));
  });
}

/**
 * received_at of an already stored submission, or '' when it is new.
 * lastRow (optional): where the responses tab ends, when already known.
 */
function PP_findSubmission_(responses, submissionId, lastRow) {
  const cell = PP_findInColumn_(responses, 'responses', 'submission_id', submissionId, lastRow);
  if (!cell) return '';
  const column = PP_DATA_TABS.responses.indexOf('received_at') + 1;
  return PP_isoText_(responses.getRange(cell.getRow(), column).getValue()) || 'unknown';
}

/** True when this DC already has a stored submission in this round's spreadsheet. */
function PP_dcHasResponse_(book, dc) {
  return Boolean(PP_findInColumn_(PP_dataSheet_(book, 'responses'), 'responses', 'dc', dc));
}

/**
 * One column of a data tab, from row 2 down to lastRow (read from the tab
 * when not given), or null when the tab has no rows yet. Searching only the
 * one column needed, instead of the whole tab, keeps each search short, and
 * with it the time a submission holds the lock.
 */
function PP_columnCells_(sheet, tab, column, lastRow) {
  const last = lastRow === undefined ? sheet.getLastRow() : lastRow;
  if (last < 2) return null;
  return sheet.getRange(2, PP_DATA_TABS[tab].indexOf(column) + 1, last - 1, 1);
}

/**
 * The cells of that column that Google's text finder matches. Its search
 * ignores capitals, so callers check each match again (capitals matter).
 */
function PP_columnMatches_(sheet, tab, column, value, lastRow) {
  const cells = PP_columnCells_(sheet, tab, column, lastRow);
  return cells ? cells.createTextFinder(String(value)).matchEntireCell(true).findAll() : [];
}

/** How many cells of a data-tab column hold exactly this value (capitals matter). */
function PP_countInColumn_(sheet, tab, column, value, lastRow) {
  return PP_columnMatches_(sheet, tab, column, value, lastRow)
    .filter(cell => PP_text_(cell.getValue()) === String(value)).length;
}

/** The first cell of a data-tab column that holds exactly this value, or null. */
function PP_findInColumn_(sheet, tab, column, value, lastRow) {
  const matches = PP_columnMatches_(sheet, tab, column, value, lastRow);
  for (let i = 0; i < matches.length; i++) {
    if (PP_text_(matches[i].getValue()) === String(value)) return matches[i];
  }
  return null;
}

/**
 * Gives a tab exactly n columns. Google counts EVERY cell of a tab (even empty
 * ones) against the 10 million cell limit of a spreadsheet, and a new tab has
 * 26 columns; exact widths keep a 10,000-partner round near 3.5 million cells.
 */
function PP_setColumnCount_(sheet, n) {
  const have = sheet.getMaxColumns();
  if (have > n) sheet.deleteColumns(n + 1, have - n);
  else if (have < n) sheet.insertColumnsAfter(have, n - have);
}

/** Makes sure a tab has at least this many rows (Google refuses to write below the last row). */
function PP_ensureRows_(sheet, needed) {
  const max = sheet.getMaxRows();
  if (needed <= max) return;
  sheet.insertRowsAfter(max, needed - max + PP_SRV.ROW_GROWTH);
}


// =============================================================================
// 10. Link tokens (contract section 17, docs/submission-format.md section 5)
// =============================================================================

/**
 * The token a genuine link carries:
 *   base64url( HMAC-SHA256( key = secret, message = dc + "|" + round ) ),
 *   without the "=" padding, first 22 characters.
 * Exactly the same formula as scripts/mock_server.py and scripts/generate_links.py.
 */
function PP_linkToken_(secret, dc, roundId) {
  const signature = Utilities.computeHmacSha256Signature(dc + '|' + roundId, secret, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '').slice(0, 22);
}

/** True when the message's token "t" matches its dc and round (strict check). */
function PP_tokenIsValid_(message) {
  const secret = PP_props_()[PP_SRV.KEYS.SECRET];
  if (!secret) {
    // Not "bad_token": the links are fine, the backend is not set up. The phone retries later.
    throw new Error('LINK_SECRET is missing. Run Partner Pulse > Set up or repair in the control Sheet.');
  }
  return PP_sameText_(message.t, PP_linkToken_(secret, message.dc, message.round));
}

/** Compares two texts in a time that does not depend on where they differ. */
function PP_sameText_(given, wanted) {
  if (typeof given !== 'string' || given.length !== wanted.length) return false;
  let difference = 0;
  for (let i = 0; i < wanted.length; i++) difference |= given.charCodeAt(i) ^ wanted.charCodeAt(i);
  return difference === 0;
}


// =============================================================================
// 11. Small building blocks
// =============================================================================

/** Runs a web-app answer; turns problems into bad_request / server_error JSON. */
function PP_answerSafely_(work) {
  try {
    return work();
  } catch (err) {
    if (err && err.ppBadRequest) return PP_badRequest_(err.message);
    console.error('Web app problem: ' + (err && err.stack ? err.stack : err));
    return { ok: false, error: 'server_error',
      message: 'The server had a temporary problem. Nothing was lost on the phone; please send again.' };
  }
}

/** Stops with a bad_request answer (the message itself is wrong; retrying will not help). */
function PP_refuse_(text) {
  const err = new Error(text);
  err.ppBadRequest = true;
  throw err;
}

function PP_badRequest_(text) {
  return { ok: false, error: 'bad_request', message: text };
}

/** The answer as JSON text (Apps Script always sends it with HTTP status 200). */
function PP_jsonOut_(answer) {
  return ContentService.createTextOutput(JSON.stringify(answer)).setMimeType(ContentService.MimeType.JSON);
}

function PP_params_(e) {
  return (e && e.parameter) || {};
}

function PP_isDcOrRound_(value) {
  return typeof value === 'string' && PP_SRV.DC_OR_ROUND_RULE.test(value) && value !== '.' && value !== '..';
}

function PP_megabytes_(count) {
  return (count / (1024 * 1024)).toFixed(1);
}

/** All Script Properties, read once per run (one read is cheaper than many). */
function PP_props_() {
  if (!PP_RUN.props) PP_RUN.props = PropertiesService.getScriptProperties().getProperties();
  return PP_RUN.props;
}

function PP_setScriptProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  if (PP_RUN.props) PP_RUN.props[key] = value;
}

function PP_cache_() {
  return CacheService.getScriptCache();
}

function PP_cacheGetOrNull_(key) {
  try {
    return PP_cache_().get(key);
  } catch (err) {
    return null;
  }
}

function PP_cachePutSafely_(key, value, seconds) {
  try {
    PP_cache_().put(key, value, seconds);
  } catch (err) {
    console.error('Could not write ' + key + ' to the cache: ' + err);
  }
}

/**
 * Runs work while holding the SCRIPT lock (the one partners' submissions
 * use); returns null if the lock is busy.
 */
function PP_withScriptLock_(waitMs, work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs)) return null;
  try {
    PP_forgetRemembered_();
    const result = work();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Admin changes (save, publish, restore, import, links, form address,
 * preview key, round status) wait for each other, so two people can never
 * overwrite each other's work by accident. They use the DOCUMENT lock of
 * this Sheet, not the script lock: partners' answers never wait for an admin
 * who is publishing, and admins never wait for answers being written. (Where
 * Google gives no document lock, the script lock is used instead.)
 */
function PP_withAdminLock_(work) {
  const held = PP_adminLock_();
  if (!held.lock.tryLock(PP_SRV.ADMIN_LOCK_MS)) {
    throw new Error('Someone else is changing Partner Pulse right now (saving, publishing, making links ' +
      'or opening a round). Nothing was changed. Please try again in a minute.');
  }
  try {
    PP_RUN.holdsScriptLock = held.isScriptLock;
    PP_forgetRemembered_();
    const result = work();
    SpreadsheetApp.flush();
    return result;
  } finally {
    PP_RUN.holdsScriptLock = false;
    held.lock.releaseLock();
  }
}

/** The lock admin changes wait on: { lock, isScriptLock } (see PP_withAdminLock_). */
function PP_adminLock_() {
  let lock = null;
  if (PP_hasMethod_(LockService, 'getDocumentLock')) {
    try {
      lock = LockService.getDocumentLock();   // null outside the Sheet (for example in the web app)
    } catch (err) {
      console.log('No document lock (' + err + '): using the script lock.');
    }
  }
  return lock ? { lock: lock, isScriptLock: false } : { lock: LockService.getScriptLock(), isScriptLock: true };
}

/**
 * Inside an admin change: runs work (creating or updating a round's data
 * store, PP_ensureRoundStore_) while ALSO holding the script lock for that
 * moment, because a partner's first answer may be creating the same store.
 * Answers already waiting finish first; new ones wait a few seconds.
 */
function PP_withStoreLock_(work) {
  if (PP_RUN.holdsScriptLock) return work();   // the admin lock already is the script lock
  const result = PP_withScriptLock_(PP_SRV.STORE_LOCK_MS, work);
  if (result === null) {
    throw new Error('Many partners\' answers are being saved right now, so the round could not be changed. ' +
      'Nothing was changed. Please try again in a minute.');
  }
  return result;
}

/**
 * True when a Google service object offers this method. It looks the name
 * up before touching it, so code can use a newer Apps Script feature where
 * it exists and carry on without it elsewhere.
 */
function PP_hasMethod_(owner, name) {
  try {
    return Boolean(owner) && (name in owner) && typeof owner[name] === 'function';
  } catch (err) {
    return false;
  }
}

/**
 * Called right after taking the lock: whatever this run remembered (Script
 * Properties, the live version) may have been changed by the run that held
 * the lock before, so it is read again.
 */
function PP_forgetRemembered_() {
  PP_RUN.props = null;
  PP_RUN.liveLoaded = false;
  PP_RUN.live = null;
}

/** The control Sheet: the open one, or (inside the web app) the one set-up remembered. */
function PP_controlBook_() {
  let book = null;
  try {
    book = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    book = null;
  }
  if (book) return book;
  const id = PP_props_()[PP_SRV.KEYS.CONTROL_SHEET];
  if (!id) throw new Error('The web app does not know the control Sheet yet. Run Partner Pulse > Set up or repair.');
  return SpreadsheetApp.openById(id);
}

/**
 * The three Drive folders, creating any that are missing:
 * "Valmo Partner Pulse", and "published" and "rounds" inside it.
 */
function PP_folders_() {
  const main = PP_folderFromProp_(PP_SRV.KEYS.FOLDER, () => {
    const folder = DriveApp.createFolder(PP_SRV.MAIN_FOLDER);
    PP_giveToOwner_(folder, 'the Drive folder "' + PP_SRV.MAIN_FOLDER + '"');   // only if a co-admin made it
    return folder;
  });
  return {
    main: main,
    published: PP_folderFromProp_(PP_SRV.KEYS.PUBLISHED_FOLDER, () => PP_childFolder_(main, PP_SRV.PUBLISHED_FOLDER)),
    rounds: PP_folderFromProp_(PP_SRV.KEYS.ROUNDS_FOLDER, () => PP_childFolder_(main, PP_SRV.ROUNDS_FOLDER))
  };
}

/**
 * The folder whose id is in a Script Property. Makes a new one when no id is
 * recorded yet. When the recorded folder cannot be opened, it stops with a
 * plain-English error (usually "ask the owner to share the Drive folder",
 * PP_driveAccessError_) instead of making a second folder. The one exception
 * is Set up or repair, run by the owner (PP_mayReplaceFolders_): for them
 * the folder was really deleted, so a new one replaces it.
 */
function PP_folderFromProp_(key, create) {
  const id = PP_props_()[key];
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // Usually this person was never given access to the folder. Making a new
      // folder here would quietly split the files between people's Drives, so
      // only set-up, run by the owner, may replace a folder that was deleted.
      if (!PP_mayReplaceFolders_()) throw PP_driveAccessError_('the Drive folder "' + PP_SRV.MAIN_FOLDER + '"', err);
      console.error('Folder ' + key + ' cannot be opened any more (deleted?); creating a new one: ' + err);
    }
  }
  const folder = create();
  PP_setScriptProp_(key, folder.getId());
  return folder;
}

/**
 * A sub-folder with this name, created if it does not exist. A folder a
 * co-admin creates is handed over to the owner (PP_giveToOwner_).
 */
function PP_childFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  if (found.hasNext()) return found.next();
  const folder = parent.createFolder(name);
  PP_giveToOwner_(folder, 'the Drive folder "' + name + '"');
  return folder;
}

/** Address of the Drive folder "Valmo Partner Pulse" ('' if set-up has not run). */
function PP_folderUrl_() {
  const id = PP_props_()[PP_SRV.KEYS.FOLDER];
  if (!id) return '';
  try {
    return DriveApp.getFolderById(id).getUrl();
  } catch (err) {
    return '';
  }
}

/**
 * The web app's public address ending in /exec, as recorded in the control
 * panel (panelSetWebAppUrl checks it first), or '' when nobody has recorded
 * it yet. Google's own answer (ScriptApp.getService().getUrl()) is not used:
 * it is often the editors-only /dev address or an old, archived deployment.
 */
function PP_webAppUrl_() {
  return PP_text_(PP_props_()[PP_SRV.KEYS.WEB_APP_URL]);
}

/**
 * Admin work (every control panel function, set-up, sharing the folder, the
 * menu items) only ever runs from inside the control Sheet: its Partner
 * Pulse menu or the control panel's window. Only people who can edit the
 * Sheet can use those, and only there does Google give the script the
 * Sheet's window (SpreadsheetApp.getUi()). A page the web app serves (the
 * survey in Meesho-only mode) can call every public function too, running
 * as the owner, and it loads the form's scripts from GitHub Pages; there
 * getUi() fails, so those calls are refused for everyone, the owner and
 * editors included (21 Oct 2026, review findings SEC-1 and SEC-2).
 */
function PP_requireAdminCaller_() {
  if (PP_uiOrNull_()) return;
  throw new Error('This can only be done from the Partner Pulse Sheet itself (its menu or the control panel), ' +
    'by someone who can edit the Sheet.');
}

/** Email of the person using the Sheet ('unknown' if Google does not say). */
function PP_currentUser_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (err) {
    console.log('No active user email: ' + err);
  }
  try {
    const email = Session.getEffectiveUser().getEmail();
    if (email) return email;
  } catch (err) {
    console.log('No effective user email: ' + err);
  }
  return 'unknown';
}

/** Email of the account this run works as (in the web app: whoever deployed it), or ''. */
function PP_effectiveUser_() {
  try {
    return PP_text_(Session.getEffectiveUser().getEmail());
  } catch (err) {
    console.log('No effective user email: ' + err);
    return '';
  }
}

/** True when this run works as the owner recorded by set-up (OWNER_EMAIL). */
function PP_runsAsOwner_() {
  const owner = PP_text_(PP_props_()[PP_SRV.KEYS.OWNER]).toLowerCase();
  return Boolean(owner) && PP_effectiveUser_().toLowerCase() === owner;
}

/**
 * A file or folder that was just created by someone other than the owner
 * (for example a co-admin opening a round or publishing) is handed over to
 * the owner, so everything Partner Pulse keeps stays in one Drive. The
 * person who created it keeps edit access. Best effort: when Google refuses
 * (another company, or the owner has to accept first), the item simply
 * stays where it is, still inside the shared folder; the log says so.
 */
function PP_giveToOwner_(item, what) {
  const owner = PP_text_(PP_props_()[PP_SRV.KEYS.OWNER]);
  const me = PP_effectiveUser_();
  if (!owner || !me || owner.toLowerCase() === me.toLowerCase()) return;
  try {
    item.setOwner(owner);
    console.log('Handed ' + what + ' over to ' + owner + ' (created by ' + me + ').');
  } catch (err) {
    console.log('Could not hand ' + what + ' over to ' + owner + '; it stays owned by ' + me + ': ' + err);
  }
}

/** The Sheet's dialog tools, or null when the code runs outside the Sheet (from the editor). */
function PP_uiOrNull_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (err) {
    return null;
  }
}

/** Shows a message box, or writes it to the log when there is no Sheet window. */
function PP_tell_(ui, title, text) {
  if (ui) ui.alert(title, text, ui.ButtonSet.OK);
  else console.log(title + '\n' + text);
}

/** An error as text for a person: Google's permission errors become the plain way to fix them. */
function PP_errorText_(err) {
  return PP_permissionHelp_(err) || PP_rawErrorText_(err);
}

function PP_rawErrorText_(err) {
  return err && err.message ? err.message : String(err);
}

/**
 * When Google refused because of a permission, the plain-English way to fix
 * it; otherwise ''. An error that already carries this explanation gives ''.
 *  - "Specified permissions are not sufficient...": a box was left unticked on
 *    Google's permission screen (or a code update needs one more permission).
 *  - "Authorization is required...": most often Google is using another of
 *    the person's accounts (several are signed in); less often a permission
 *    is missing. One message gives both, the likely one first (Pranav's
 *    decision, 21 Oct 2026). The control panel shows the same words
 *    (Panel.html, MSG_AUTHORIZATION).
 */
function PP_permissionHelp_(err) {
  if (!err || err.ppPermission || !PP_SRV.PERMISSION_ERROR_RULE.test(PP_rawErrorText_(err))) return '';
  const google = ' (Google said: ' + PP_rawErrorText_(err) + ')';
  if (/Authori[sz]ation is required/i.test(PP_rawErrorText_(err))) return PP_MSG_AUTHORIZATION_ + google;
  return 'Google has not given Partner Pulse all the permissions it needs (one was probably left unticked ' +
    'on Google\'s permission screen). Close this window and use the Partner Pulse menu again (for example ' +
    'Partner Pulse > Open control panel). When Google shows its permission screen, tick "Select all", then ' +
    'press Continue.' + google;
}

/** The "Authorization is required" advice, word for word the same as the control panel's. */
const PP_MSG_AUTHORIZATION_ = 'Google says Partner Pulse needs authorization. Usually Google is using another ' +
  'of your Google accounts: open the Sheet in a Chrome profile (or an Incognito window) signed in only with ' +
  'your company account, then try again. If that does not help, a permission was probably left unticked: use ' +
  'the Partner Pulse menu again and tick Select all on Google’s permission screen.';

/** PP_permissionHelp_ as an error to stop with (marked, so it is never explained twice), or null. */
function PP_permissionError_(err) {
  const help = PP_permissionHelp_(err);
  if (!help) return null;
  const error = new Error(help);
  error.ppPermission = true;
  return error;
}

/**
 * A plain-English error for "Google Drive would not open this". It almost
 * always means this person was never given access to the Drive folder (or,
 * when Google says so, that a permission was left unticked). Such an error
 * is marked ppDriveAccess, so the control panel always shows it
 * (PP_liveDocForAdmin_) instead of carrying on as if nothing was published.
 * A passing Drive problem ("server error", "try again") is not an access
 * problem: it gets its own message and is not marked.
 */
function PP_driveAccessError_(what, err) {
  const google = PP_rawErrorText_(err);
  const permission = PP_permissionError_(err);
  if (!permission && PP_SRV.DRIVE_BUSY_RULE.test(google)) {
    return new Error('Google Drive had a passing problem while opening ' + what + '. Nothing was changed. ' +
      'Please try again in a minute. (Google said: ' + google + ')');
  }
  const owner = PP_props_()[PP_SRV.KEYS.OWNER] || 'the person who set up Partner Pulse';
  const error = permission || new Error('Google Drive would not open ' + what + ' for you (' +
    PP_currentUser_() + '). Partner Pulse keeps its files in the Drive folder "' + PP_SRV.MAIN_FOLDER + '". Ask ' +
    owner + ' to open this Sheet and click Partner Pulse > Share the Drive folder with all editors, then try ' +
    'again. (Google said: ' + google + ')');
  error.ppDriveAccess = true;
  return error;
}

/** Opens a spreadsheet by id, with a plain-English error when Drive refuses. */
function PP_openBook_(id, what) {
  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    throw PP_driveAccessError_(what, err);
  }
}

/** Reads a Drive file's text, with a plain-English error when Drive refuses. */
function PP_driveText_(fileId, what) {
  try {
    return DriveApp.getFileById(fileId).getBlob().getDataAsString();
  } catch (err) {
    throw PP_driveAccessError_(what, err);
  }
}

/**
 * May a folder that cannot be opened be replaced by a new one? Only during
 * set-up, and only for the person who ran set-up first (or when nobody is
 * recorded yet): for them, "cannot open" really means the folder was deleted.
 */
function PP_mayReplaceFolders_() {
  if (!PP_RUN.folderRepair) return false;
  const owner = PP_props_()[PP_SRV.KEYS.OWNER];
  return !owner || owner === PP_currentUser_();
}

/**
 * The private key that preview links carry (&pk=...). Without it, nobody can
 * read the unpublished draft through the public web address. create = true
 * makes one the first time it is needed.
 */
function PP_previewKey_(create) {
  let key = PP_props_()[PP_SRV.KEYS.PREVIEW_KEY] || '';
  if (!key && create) {
    key = Utilities.getUuid().replace(/-/g, '');
    PP_setScriptProp_(PP_SRV.KEYS.PREVIEW_KEY, key);
  }
  return key;
}

/**
 * Menu: Share the Drive folder with all editors. Everyone who can edit this
 * Sheet also needs the Drive folder "Valmo Partner Pulse" (published versions,
 * round data, voice notes); otherwise Publish, Rounds and counts stop with an
 * access error. Run it after adding a new editor to the Sheet. It works for
 * whoever can already edit the folder (normally the person who ran set-up).
 */
function ppShareFolder() {
  PP_requireAllPermissions_();
  PP_requireAdminCaller_();   // only people who can edit the Sheet (Meesho-only mode serves a page from this script)
  const ui = PP_uiOrNull_();
  try {
    const emails = SpreadsheetApp.getActiveSpreadsheet().getEditors()
      .map(user => user.getEmail())
      .filter(email => !!email);
    if (!emails.length) {
      PP_tell_(ui, 'Nobody to share with', 'Google did not list any editors of this Sheet. Share the Sheet first ' +
        '(Share button, top right), then run this again.');
      return;
    }
    PP_folders_().main.addEditors(emails);
    PP_tell_(ui, 'Drive folder shared', 'These people can now use the Drive folder "' + PP_SRV.MAIN_FOLDER +
      '" (published versions, round data and voice notes):\n\n' + emails.join('\n') +
      '\n\nThey can now publish, open rounds and see counts in the control panel. Run this again whenever ' +
      'you add someone to the Sheet.');
  } catch (err) {
    PP_tell_(ui, 'Could not share the Drive folder', PP_errorText_(err) + '\n\nOnly someone who can already ' +
      'edit the folder (normally whoever ran set-up) can share it.');
  }
}

/** A tab that must exist; otherwise a plain-English error. */
function PP_requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('The tab "' + name + '" is missing. Run Partner Pulse > Set up or repair, then try again.');
  return sheet;
}

/** Stops with a plain-English error when a tab lacks one of these column headers. */
function PP_requireColumns_(table, names, tabName) {
  const missing = names.filter(name => !PP_own_(table.col, name));
  if (missing.length) {
    throw new Error('The tab "' + tabName + '" is missing the column(s) ' + missing.join(', ') +
      '. Run Partner Pulse > Set up or repair, then try again.');
  }
}

/**
 * A whole tab as { headers, col: { header: column index from 0 }, rows, width }.
 * Columns are found by their header name, so extra columns never get in the way.
 */
function PP_readTable_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headers: [], col: {}, rows: [], width: 0, rowsBefore: 0 };
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(PP_text_);
  const col = {};
  headers.forEach((name, index) => {
    if (name && !PP_own_(col, name)) col[name] = index;
  });
  return { headers: headers, col: col, rows: values.slice(1), width: lastCol, rowsBefore: lastRow - 1 };
}

function PP_blankRow_(table) {
  const row = [];
  for (let i = 0; i < table.width; i++) row.push('');
  return row;
}

/** A new row for a table, filled from { header: value }. */
function PP_rowFromObject_(table, values) {
  const row = PP_blankRow_(table);
  Object.keys(values).forEach(name => {
    if (PP_own_(table.col, name)) row[table.col[name]] = values[name];
  });
  return row;
}

/**
 * Writes all rows of a table back below the header with ONE write (text is
 * protected so Google never turns it into a date, a number or a formula).
 * Rows that are no longer needed are emptied.
 */
function PP_writeTableRows_(sheet, table) {
  const rows = table.rows.map(row => row.map(PP_cell_));
  if (rows.length) {
    PP_ensureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, table.width).setValues(rows);
  }
  if (table.rowsBefore > rows.length) {
    sheet.getRange(rows.length + 2, 1, table.rowsBefore - rows.length, table.width).clearContent();
  }
}

/**
 * Turns a value into what a cell should hold. Text gets a leading apostrophe:
 * Google Sheets then keeps it exactly as text (the apostrophe itself is not
 * stored), so "2026-10-21", "00123" or "=SUM(...)" typed by anyone never
 * become a date, a number or a formula.
 */
function PP_cell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value;
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > PP_SRV.MAX_CELL_CHARS) text = text.slice(0, PP_SRV.MAX_CELL_CHARS) + ' [cut: too long]';
  text = PP_fixHalfCharacters_(text);
  return text === '' ? '' : "'" + text;
}

/** Replaces half an emoji (which a phone can produce when it cuts text) with the "unknown" sign. */
function PP_fixHalfCharacters_(text) {
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, pair => (pair.length === 2 ? pair : '�'));
}

/** A cell value as trimmed text. */
function PP_text_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** A time cell as ISO text (a Date becomes 2026-10-21T08:30:00.000Z). */
function PP_isoText_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString();
  return PP_text_(value);
}

/** A date cell as yyyy-MM-dd (India time), or the text as typed. */
function PP_dateText_(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, 'Asia/Kolkata', 'yyyy-MM-dd');
  }
  return PP_text_(value);
}

/**
 * Reads a tick-box cell. blankMeans = what an empty cell counts as.
 * TRUE / yes / 1 count as ticked, FALSE / no / 0 as unticked.
 */
function PP_isTicked_(value, blankMeans) {
  if (value === true || value === false) return value;
  const text = PP_text_(value).toLowerCase();
  if (!text) return blankMeans;
  return ['true', 'yes', 'y', '1', 'on'].indexOf(text) >= 0;
}

function PP_nowIso_() {
  return new Date().toISOString();
}

function PP_isPlainObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function PP_own_(obj, key) {
  return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

/** Makes text safe to put inside a small HTML dialog. */
function PP_html_(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A copy that contains only plain data (no Dates, functions or patterns), as the panel needs. */
function PP_plain_(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}
