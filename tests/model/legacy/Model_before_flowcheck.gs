/* =============================================================================
   Model.gs  -  Valmo Partner Pulse: the questionnaire "model"
   =============================================================================

   WHAT THIS FILE IS
     One of the four code files inside the Google Sheet "Valmo Partner Pulse -
     Control" (open the Sheet, then Extensions > Apps Script). This one
     understands the QUESTIONNAIRE. It:
       1. reads the questionnaire tabs of the Sheet (Settings, Languages, Areas,
          Chips, Support, Screens, Texts, What changed, Audio clips, Rounds)
          into one tidy object called the "model" (PP_readModel), and writes a
          model back into those tabs (PP_writeModel);
       2. checks a model for mistakes and explains each one in plain English
          (PP_validate). Errors block Publish; warnings never do;
       3. turns a model into the single document that partners' phones
          download (PP_compile). Publish saves it as published/p<N>.json;
       4. reads the questionnaire files of the GitHub project
          (PP_importStatic) and writes them back in exactly the same layout
          (PP_exportStatic), so the copy in GitHub can be refreshed;
       5. turns an old published version back into a model
          (PP_modelFromPublished), for "Restore this version as the draft".
          Anything the draft has that the old version lacks (hidden items,
          or items added since) is kept, switched off, in its place;
       6. helps translators whenever texts are saved
          (PP_applyTranslationHelpers).
     The other files: Code.gs (menu, set-up, publishing, the public web
     address), PanelServer.gs (what the control panel asks for), Panel.html (the
     control panel's screens) and Flow.gs (the questionnaire's ROUTE: the same
     code partners' phones run, generated from web/js/flow.js and
     web/js/flow-panel.js; this file calls it through PP_flowLib_).

   THE ROUTE (since 23 Oct 2026, docs/flow-engine.md section 9)
     The Screens tab still has one row per screen, plus three columns:
     next (where to go after it; empty = the following row), jumps (exceptions,
     checked first: [{"when": rule, "goto": code}]) and repeat (empty, each_area
     or each_low_area). Compiling turns the rows into a graph ("flow" with
     format pp-flow/1) through Flow.gs: a Sheet that uses none of the three
     columns gives exactly the graph phones make of the old list, so nothing
     changes for partners. Import and Restore accept both the old list and a
     graph; the GitHub copy writes the graph.

   HOW TO USE IT
     You never run anything in this file by hand: the control panel, set-up
     and Publish call it. To install or update it: open the Sheet, then
     Extensions > Apps Script, open the script file called "Model" (if it is
     missing: + > Script, and name it Model) and replace everything in it with
     this whole file. Save. If the web app is already deployed, also do
     Deploy > Manage deployments > pencil icon > Version: New version > Deploy,
     so the public web address keeps working with the new code.

   WHAT IT READS AND WRITES
     - Only PP_readModel and PP_writeModel touch the Sheet, and only the ten
       questionnaire tabs listed above. Columns are found by their heading in
       row 1, so the order of the columns does not matter.
     - It never touches the DCs, Links, Publish history or _meta tabs, the
       answers, Google Drive, the internet or the script's stored properties.
     - Everything else in this file only works on the objects it is given
       (it is "pure"), which is why it can be tested on a computer.

   SAFETY
     - Your own extra columns are allowed: put them on the RIGHT of the last
       heading and they are never touched. (A column squeezed in between two
       headings is kept and moves with its row, but a formula in it becomes a
       plain value when the panel saves.)
     - Saving first checks everything it can and works out every change
       WITHOUT writing (values too long for a cell, tabs that cannot be read,
       a tab whose name differs only in capital letters, tabs that must
       grow). Only then does it write, tab by tab: the new rows first, and
       only then the left-over old rows are emptied, so a Google hiccup
       half-way can never leave a tab blank. If Google still refuses a write
       half-way (for example a protected tab), the message says that the
       draft may be only partly changed and that the panel should be
       reloaded.
     - Text is written so that Google keeps it exactly as typed: "2026-10-21"
       never becomes a date, "007" never becomes 7 and "=..." never becomes a
       formula.
     - If the key heading of a tab is missing (for example "key" in Texts),
       reading stops with a plain message instead of guessing, so nothing is
       lost.
     - Everything in the questionnaire is published and anyone can read it.
       Never put partner data or secrets in texts or settings.

   THE MODEL (what the control panel edits)
     { settings:   { "deep_dive.threshold": 3, "rating.faces": "😠 🙁 😐 🙂 😄", ... },
       languages:  [ { code, bcp47, native_name, active } ]           in order
       areas:      [ { id, threshold (a number, or null), active } ]  in order
       chips:      [ { area, code, active } ]      grouped by area, in order
       support:    [ { code, active } ]                               in order
       screens:    [ { id, type, text, required (true / false / null),
                       show_if (a rule, or null), skip_if, options [codes],
                       low_label, high_label, scale_hint, body, active,
                       next ("" = the following row), jumps ([] or
                       [{ when, goto }]), repeat ("", each_area,
                       each_low_area) } ]
       texts:      { key: { en: "...", hi: "...", ... } }   one value per language
       text_notes: { key: "message for translators" }
       whats_changed: { round_id: [ { en: "...", hi: "...", ... } ] }
       clips:      { key: { lang: "https://... or a path inside web/" } }
       rounds:     [ { id, status, opens_on, closes_on, data_sheet,
                       audio_folder, notes } ]
       config_version: optional, kept in memory only (see PP_exportStatic) }
     Settings of the kinds "faces", "list" and "numlist" are kept as the text
     shown in the Settings tab ("😠 🙁 😐 🙂 😄", "2, 5, 10"). They become
     lists only in the published document. A rule that cannot be read is kept
     as { unreadable: "the text as typed" } so that the check can point at it.
     The full rules are in docs/control-panel-design.md, sections 3 to 10.

   FOR WHOEVER MAINTAINS THIS CODE
     - The contract is docs/control-panel-design.md. Keep this file in step
       with it, and PP_FORM_TEXT_KEYS in step with FIXED_STRING_KEYS in
       scripts/check_config.py. The notes in PP_SURVEY_HELP and
       PP_REPO_FILE_HELP must match the GitHub files word for word, otherwise
       "Download files for the GitHub copy" would change them.
     - Apps Script runs all files in ONE shared space, so two functions with
       the same name in two files silently replace each other. That is why
       every private helper here starts with "PP_mdl" and ends with "_" (the
       "_" also hides it from the control panel's google.script.run).
     - Constants use "var" so that other files and the local test harness can
       see them as global names.
     - Modern JavaScript (V8), but no "?." and no "??".
   ============================================================================= */


// =============================================================================
// 1. The catalogue: settings, screen types, texts the form needs, tab layout
// =============================================================================

/** The parts ("sections") of the model, in the order they are saved. */
var PP_MODEL_SECTIONS = ['settings', 'languages', 'areas', 'chips', 'support', 'screens',
  'texts', 'whats_changed', 'clips', 'rounds'];

/** Which tab holds which section. text_notes live in the Texts tab ("note" column). */
var PP_SECTION_TABS = {
  settings: 'Settings',
  languages: 'Languages',
  areas: 'Areas',
  chips: 'Chips',
  support: 'Support',
  screens: 'Screens',
  texts: 'Texts',
  whats_changed: 'What changed',
  clips: 'Audio clips',
  rounds: 'Rounds'
};

/**
 * Every tab of the control Sheet and its column headings, in order (contract
 * section 3). Texts and What changed have one column per language CODE, in
 * the order of the Languages tab; the lists below show the six standard
 * languages. PP_tabHeaders(tab, codes) builds them for any language list.
 */
var PP_TABS = {
  'Settings': ['setting', 'value', 'what it does'],
  'Languages': ['order', 'code', 'bcp47', 'native_name', 'active'],
  'Areas': ['order', 'area_id', 'threshold', 'active'],
  'Chips': ['area_id', 'order', 'chip_code', 'active'],
  'Support': ['order', 'item_code', 'active'],
  'Screens': ['order', 'screen_id', 'type', 'text_key', 'required', 'show_if', 'skip_if', 'options',
    'low_label', 'high_label', 'scale_hint', 'body', 'active', 'next', 'jumps', 'repeat'],
  'Texts': ['key', 'en', 'hi', 'ta', 'te', 'kn', 'ml', 'note'],
  'What changed': ['round_id', 'order', 'en', 'hi', 'ta', 'te', 'kn', 'ml'],
  'Audio clips': ['key', 'lang', 'url'],
  'Rounds': ['round_id', 'status', 'opens_on', 'closes_on', 'data_sheet', 'audio_folder', 'notes'],
  'DCs': ['dc_id', 'dc_name', 'state', 'region', 'language', 'active'],
  'Links': ['round_id', 'dc_id', 'dc_name', 'state', 'region', 'language', 'link', 'generated_at',
    'generated_by'],
  'Publish history': ['version', 'config_version', 'published_at', 'published_by', 'note', 'file', 'live'],
  '_meta': ['key', 'value']
};

/**
 * Every row of the Settings tab (contract section 5). Each entry:
 *   key      where the value goes in the published survey (form_url is the
 *            exception: it is only used for links and Preview)
 *   type     text | url | color | bool | int | number | choice | lang | key |
 *            faces | list | numlist
 *   default  the value used when the cell is empty
 *   min/max  limits for numbers (null = no limit)
 *   options  the allowed values of a "choice" (null for other types)
 *   help     plain English, shown in the "what it does" column and the panel
 *   group    the heading it is shown under in the control panel
 *   label    a short plain-English name (used in messages and the panel)
 */
var PP_SETTINGS_SCHEMA = [
  PP_mdlSetting_('survey_id', 'text', 'valmo-partner-pulse', 'Form address', 'Survey code',
    'The survey\'s permanent code name; every answer is stamped with it. Lowercase letters, digits, - and _ ' +
    'only. Change it only before the first round starts.'),
  PP_mdlSetting_('form_url', 'url', 'https://pranavakellaps37.github.io/NPS-Form-/', 'Form address',
    'Form address (web link)',
    'The web address where partners open the form (the GitHub Pages address). Partner links and Preview ' +
    'are built from it. It must start with https:// and end with /. It is not part of the published ' +
    'questionnaire.'),
  PP_mdlSetting_('default_language', 'lang', 'en', 'Languages', 'Starting language',
    'The language the form uses until the partner picks one (and for links without a language). It must ' +
    'be a language that is switched on.'),
  PP_mdlSetting_('fallback_language', 'lang', 'en', 'Languages', 'Backup language',
    'Shown (and read aloud) whenever a text is missing, or still marked [TRANSLATE], in the partner\'s ' +
    'language. It must be switched on; English is recommended.'),
  PP_mdlSetting_('branding.logo', 'text', '', 'Look & feel', 'Logo',
    'Optional logo picture: an https:// address, or a file path inside the web folder such as ' +
    'assets/logo.svg. Leave it empty to show the product name as text instead (change the name under ' +
    'Look & feel).'),
  PP_mdlSetting_('branding.colors.primary', 'color', '#4B2E83', 'Look & feel', 'Main colour',
    'Buttons and selected answers. A colour code: # followed by 6 characters from 0-9 and A-F, for ' +
    'example #4B2E83.'),
  PP_mdlSetting_('branding.colors.on_primary', 'color', '#FFFFFF', 'Look & feel', 'Text on the main colour',
    'The colour of text on buttons in the main colour. A colour code such as #FFFFFF (white).'),
  PP_mdlSetting_('branding.colors.background', 'color', '#FFFFFF', 'Look & feel', 'Page background',
    'The colour of the page background. A colour code such as #FFFFFF (white).'),
  PP_mdlSetting_('branding.colors.surface', 'color', '#F3F0F8', 'Look & feel', 'Answer buttons',
    'The background colour of the answer buttons. A colour code such as #F3F0F8.'),
  PP_mdlSetting_('branding.colors.text', 'color', '#1B1B1F', 'Look & feel', 'Main text',
    'The colour of the main text. A colour code such as #1B1B1F (almost black).'),
  PP_mdlSetting_('branding.colors.muted', 'color', '#5F5E6B', 'Look & feel', 'Secondary text',
    'The colour of secondary, less important text. A colour code such as #5F5E6B (grey).'),
  PP_mdlSetting_('branding.colors.border', 'color', '#D9D4E3', 'Look & feel', 'Outlines',
    'The colour of the outlines of buttons and boxes. A colour code such as #D9D4E3.'),
  PP_mdlSetting_('branding.colors.error', 'color', '#B3261E', 'Look & feel', 'Error messages',
    'The colour of error messages. A colour code such as #B3261E (red).'),
  PP_mdlSetting_('branding.colors.success', 'color', '#1B7F3B', 'Look & feel', 'Success messages',
    'The colour of success messages. A colour code such as #1B7F3B (green).'),
  PP_mdlSetting_('navigation.auto_advance', 'bool', true, 'Moving between screens', 'Move on after a tap',
    'On: after a tap on a single-answer question (0-10, faces, yes/no, pick one) the form moves on by ' +
    'itself. Off: the partner taps Next.'),
  PP_mdlSetting_('navigation.auto_advance_delay_ms', 'int', 350, 'Moving between screens',
    'Pause before moving on (milliseconds)',
    'How long the form waits before moving on, so the partner sees what they tapped. 1000 = 1 second.',
    { min: 0, max: 2000 }),
  PP_mdlSetting_('rating.faces', 'faces', '😠 🙁 😐 🙂 😄', 'Look & feel', 'Rating faces',
    'The five faces used for every rating, from 1 (worst) to 5 (best), separated by spaces. The words ' +
    'under them, from "Very bad" to "Very good", are in Texts & translations.'),
  PP_mdlSetting_('rating.allow_not_applicable', 'bool', true, 'Ratings', '"I don\'t handle this" option',
    'On: adds a small "I don\'t handle this" option under each area rating (its wording: the text ' +
    '"I don\'t handle this" in Texts & translations). Those answers are left out of averages.'),
  PP_mdlSetting_('deep_dive.threshold', 'int', 3, 'Problem screens', 'Low rating (at or below)',
    'An area rated at or below this number gets a "What is the main problem?" screen. 3 means ratings 1, ' +
    '2 and 3. One area can have its own number (Areas & problems).', { min: 1, max: 5 }),
  PP_mdlSetting_('deep_dive.when', 'choice', 'after_all_ratings', 'Problem screens',
    'When to ask about problems',
    '"After all the area ratings" (recommended): the problem screens come after all the area ratings, so ' +
    'partners cannot learn half-way that a low score means extra questions. "Straight after each low ' +
    'rating": each problem screen comes right after its low rating.',
    { options: ['after_all_ratings', 'immediate'] }),
  PP_mdlSetting_('deep_dive.require_chip', 'bool', true, 'Problem screens', 'A problem must be picked',
    'On: the partner must pick a problem before Next.'),
  PP_mdlSetting_('deep_dive.require_detail_if_other', 'bool', true, 'Problem screens',
    '"Other" needs an explanation',
    'On: if the partner picks Other, a voice note or typed text is required.'),
  PP_mdlSetting_('support.allow_not_applicable', 'bool', false, 'Support questions',
    '"Doesn\'t apply" option',
    'On: adds a small "Doesn\'t apply" option under each support question (its wording: the text ' +
    '"Doesn\'t apply" in Texts & translations). Off: every row needs a face.'),
  PP_mdlSetting_('support.allow_comment', 'bool', true, 'Support questions', 'Comment box',
    'On: adds an optional voice note or typed comment under the support ratings.'),
  PP_mdlSetting_('support.comment_text', 'key', 'q.support_comment', 'Support questions', 'Comment question',
    'Which text from Texts & translations is asked as the comment question. Normally the text ' +
    '"Anything else about support? (optional)".'),
  PP_mdlSetting_('voice.enabled', 'bool', true, 'Voice notes', 'Voice notes',
    'On: partners can leave voice notes. Off: typing only. If a phone cannot record, or the partner ' +
    'blocks the microphone, the form quietly offers typing instead.'),
  PP_mdlSetting_('voice.gesture', 'choice', 'hold', 'Voice notes', 'How to record',
    '"Press and hold to talk": the partner holds the button down while speaking and lets go to stop (like ' +
    'WhatsApp). "Tap to start and stop": one tap starts the recording, a second tap stops it.',
    { options: ['hold', 'tap'] }),
  PP_mdlSetting_('voice.max_seconds', 'int', 60, 'Voice notes', 'Longest voice note (seconds)',
    'The hard limit for one voice note. A countdown shows while recording.', { min: 5, max: 300 }),
  PP_mdlSetting_('voice.min_seconds', 'number', 1, 'Voice notes', 'Shortest voice note (seconds)',
    'Shorter notes are thrown away as accidental taps. It must be below the longest voice note.',
    { min: 0 }),
  PP_mdlSetting_('voice.bitrate', 'int', 16000, 'Voice notes', 'Recording quality (bits per second)',
    '16000 keeps a 60-second note around 120 KB, which suits slow mobile data.', { min: 6000, max: 64000 }),
  PP_mdlSetting_('voice.mime_types', 'list', 'audio/webm;codecs=opus, audio/ogg;codecs=opus, audio/webm, audio/mp4',
    'Voice notes', 'Audio formats to try',
    'The audio formats to try, best first, separated by commas. Leave them as they are unless a developer ' +
    'asks.'),
  PP_mdlSetting_('text.max_chars', 'int', 1500, 'Typing', 'Longest typed answer (characters)',
    'The maximum length of one typed answer. Any language or script is accepted, including Hindi or Tamil ' +
    'typed in English letters.', { min: 50, max: 10000 }),
  PP_mdlSetting_('read_aloud.enabled', 'bool', true, 'Read aloud', 'Speaker button',
    'On: a speaker button reads each question aloud, using a recorded clip (Audio clips tab) when there is ' +
    'one, otherwise the phone\'s own voice. It hides itself when neither is available.'),
  PP_mdlSetting_('whats_changed.timeout_seconds', 'number', 4, 'What changed',
    'Wait for the live questionnaire (seconds)',
    'How long the form waits for Google to send the published questionnaire and the "What changed" news ' +
    'before it uses the copy in GitHub instead (plus 2 seconds when the form opens).', { min: 1, max: 20 }),
  PP_mdlSetting_('telemetry.enabled', 'bool', true, 'Progress messages', 'Progress messages',
    'On: the form sends small progress messages (started, which screen the partner reached) so the ' +
    'dashboard can show where partners stop. They never contain answers. The "opened" message is always ' +
    'sent, because it also checks that the link is genuine.'),
  PP_mdlSetting_('backend.request_timeout_seconds', 'number', 90, 'Sending', 'Wait for one send (seconds)',
    'How long one attempt to send the answers may take before it is tried again. Bigger sends (with voice ' +
    'notes) automatically get more time.', { min: 10, max: 600 }),
  PP_mdlSetting_('backend.slow_upload_bytes_per_second', 'number', 1000, 'Sending',
    'Slowest upload speed planned for (bytes per second)',
    'Sends with voice notes get extra time, assuming the phone uploads at least this fast. 1000 = very ' +
    'weak 2G.', { min: 100, max: 100000 }),
  PP_mdlSetting_('backend.retry_delays_seconds', 'numlist', '2, 5, 10, 20, 40, 60, 60, 120, 120, 300',
    'Sending', 'Waits before each retry (seconds)',
    'How long to wait before each automatic retry when sending fails: 1 to 20 numbers above 0, separated ' +
    'by commas. After the last one, the partner still has a Send now button.')
];

/**
 * The kinds of screens (contract section 6). "builtin" screens may appear
 * only once and cannot be deleted; "fields" are the extra fields the panel's
 * editor shows (the question text is shown when needs_text is true);
 * "required_default" is what an empty "required" means for that type.
 */
var PP_SCREEN_TYPES = [
  { type: 'language_picker', label: 'Language buttons', builtin: true, needs_text: false,
    description: 'The partner picks their language. Skipped when the link already says which language.',
    fields: ['skip_if'], required_default: null },
  { type: 'whats_changed', label: '"What changed" card', builtin: true, needs_text: false,
    description: 'Shows what Valmo changed since the last round (edited under Rounds). Skipped when the ' +
      'round has nothing to show.',
    fields: ['skip_if'], required_default: null },
  { type: 'function_ratings', label: 'Area ratings', builtin: true, needs_text: false,
    description: 'One screen of five faces for each area that is switched on (Areas & problems).',
    fields: [], required_default: null },
  { type: 'function_deep_dives', label: 'Problem screens', builtin: true, needs_text: false,
    description: '"What is the main problem?" for every area rated low, with that area\'s problem ' +
      'buttons and an optional voice note or text. Must come after the area ratings.',
    fields: [], required_default: null },
  { type: 'support_block', label: 'Support ratings', builtin: true, needs_text: true,
    description: 'The support questions on one screen, each with five faces, plus an optional comment.',
    fields: [], required_default: true },
  { type: 'thank_you', label: 'Thank-you screen', builtin: true, needs_text: false,
    description: 'Sends the answers and says thank you. The main one comes after the last question; another ' +
      'ending may follow it, reached only by a jump.',
    fields: [], required_default: null },
  { type: 'nps_0_10', label: '0 to 10 question', builtin: false, needs_text: true,
    description: 'Eleven buttons from 0 to 10, with a label under each end.',
    fields: ['low_label', 'high_label', 'scale_hint', 'required'], required_default: true },
  { type: 'rating_1_5', label: 'Faces question (1 to 5)', builtin: false, needs_text: true,
    description: 'One row of five faces, from very bad to very good.',
    fields: ['required'], required_default: true },
  { type: 'yes_no', label: 'Yes / No question', builtin: false, needs_text: true,
    description: 'Two big buttons: Yes and No.',
    fields: ['required'], required_default: true },
  { type: 'single_choice', label: 'Pick one answer', builtin: false, needs_text: true,
    description: 'A list of answers; the partner taps one.',
    fields: ['options', 'required'], required_default: true },
  { type: 'free_text', label: 'Voice note or typing', builtin: false, needs_text: true,
    description: 'The partner records a voice note or types an answer.',
    fields: ['required'], required_default: false },
  { type: 'info_card', label: 'Information card', builtin: false, needs_text: true,
    description: 'A title and an optional longer text, with nothing to answer.',
    fields: ['body'], required_default: null }
];

/**
 * The texts the form's own code uses (buttons, messages). The same list, in
 * the same order, as FIXED_STRING_KEYS in scripts/check_config.py (which
 * already includes the Phase 2 keys round.* and dev.preview_*).
 */
var PP_FORM_TEXT_KEYS = [
  'brand.name', 'ui.next', 'ui.back', 'ui.skip', 'ui.continue', 'ui.submit', 'ui.yes', 'ui.no',
  'ui.language', 'ui.close', 'ui.listen', 'ui.stop_listening', 'ui.answer_all', 'ui.choose_one',
  'lang.title', 'wc.title', 'q.fn_rating', 'rating.1', 'rating.2', 'rating.3', 'rating.4', 'rating.5',
  'rating.na', 'q.deep_dive', 'dd.your_rating', 'q.tell_more', 'dd.other_needs_detail', 'issue.other',
  'voice.hold', 'voice.tap_start', 'voice.recording', 'voice.recording_tap', 'voice.too_short_tap',
  'voice.starting', 'voice.seconds_left', 'voice.saved', 'voice.not_saved', 'voice.play', 'voice.pause',
  'voice.delete', 'voice.redo', 'voice.too_short', 'voice.consent', 'voice.consent_ok',
  'voice.ready', 'voice.ready_tap', 'voice.denied', 'text.type_instead', 'text.placeholder', 'text.required',
  'thanks.title', 'thanks.body', 'thanks.close', 'submit.sending', 'submit.failed',
  'submit.retrying_in', 'submit.retry_now', 'submit.error', 'submit.bad_link',
  'already.title', 'already.body', 'link.bad_title', 'link.incomplete', 'resume.notice',
  'net.offline', 'dev.mock_banner', 'dev.untranslated', 'dev.start_over',
  'round.closed_title', 'round.closed_body', 'round.not_open_title', 'round.not_open_body',
  'dev.preview_banner', 'dev.preview_done',
  'q.tell_more_required', 'ui.start_again', 'dev.preview_fallback', 'dev.preview_broken'
];

/**
 * The notes for humans inside web/config/survey.json, word for word, so that
 * PP_exportStatic writes them back unchanged. The name says where each note
 * sits: "_help" at the top, "branding._help" inside "branding", and so on.
 * "_flow_help" belongs to the old list format of "flow" only: a route in the
 * graph format carries its own note (Flow.gs, PP.flowPanel.FLOW_HELP).
 */
var PP_SURVEY_HELP = {
  '_help': 'Main settings for the Valmo Partner Pulse questionnaire. Keys that start with an underscore (_) are notes for humans; the app ignores them. Every word shown to partners lives in web/i18n/strings.json, not here. After ANY edit, run:  python3 scripts/check_config.py',
  '_config_version_help': 'Change this (for example bump the last number) whenever you change questions, areas or chips. Every submission is stamped with it, so the dashboard knows which version of the questionnaire a partner saw.',
  'branding._help': 'Colours are hex codes (#RRGGBB). primary = buttons and selected answers. on_primary = text on primary buttons. surface = background of answer buttons. muted = secondary text. border = outlines. error / success = status messages. logo = optional image path inside web/ (for example assets/logo.svg); leave empty to show the product name as text. The product name itself is the string brand.name.',
  'backend._help': 'Where answers are sent. mode = mock -> the local test server on this Mac (python3 scripts/mock_server.py). mode = apps_script -> Google Apps Script (set up in Phase 2; paste its /exec URL into apps_script_url). Adding ?mock=1 to any link forces mock mode. retry_delays_seconds = how long to wait before each automatic re-try when sending fails (after the last one, the partner still has a Retry button). request_timeout_seconds = how long one send may take before it is tried again; bigger sends (voice notes) automatically get more time, assuming the phone uploads at least slow_upload_bytes_per_second (1000 = very weak 2G).',
  'links._help': 'Every real link carries ?dc=<DC_ID>&t=<token>&round=<round_id>. In live mode a link missing any of these shows an \'incomplete link\' message. In mock mode the defaults below are used so you can test without a real link.',
  '_languages_help': 'Order = order of buttons on the language screen. code = the key used in strings.json and in ?lang= links. bcp47 = language tag used for the read-aloud voice. native_name = the language\'s name written in its own script.',
  '_fallback_language_help': 'If a string is missing or still marked [TRANSLATE] for the chosen language, the fallback language\'s text is shown (and read aloud with the fallback language\'s voice).',
  'navigation._help': 'auto_advance = move to the next screen as soon as a single-answer question is tapped (NPS, faces, yes/no). The short delay lets the partner see what they tapped.',
  'rating._help': 'The 1-5 faces used for area ratings and support ratings, from 1 (worst) to 5 (best). Labels under the faces are strings rating.1 ... rating.5. allow_not_applicable adds a small "I don\'t handle this" option under area ratings (string rating.na); those answers are left out of averages.',
  'deep_dive._help': 'Every area rated at or below threshold gets a \'What is the main problem?\' screen with that area\'s chips, plus an optional voice note or text. when = after_all_ratings asks the problem screens after all six ratings (recommended: partners cannot learn mid-survey that a low score means extra questions). when = immediate asks right after each low rating. require_chip = a chip must be picked before Next. require_detail_if_other = if the partner picks Other, a voice note or text is required.',
  '_functions_help': 'The areas partners rate, one screen each, in this order. id and issue codes are permanent codes: the sheet, classifier and dashboard use them, so keep them the same from round to round (you may freely reword their labels). Labels live in strings.json as fn.<id>.name, fn.<id>.help and issue.<id>.<code>. An \'Other\' chip (code other, string issue.other) is added automatically. Use 4-6 chips per area. To give one area its own threshold add  "threshold": 2  next to its id.',
  'support._help': 'Shown only to partners who answer Yes to the support question. items = the four things rated 1-5 on one screen (labels: support.<item> in strings.json). allow_comment adds an optional voice/text comment (question string: comment_text).',
  'voice._help': 'Voice notes. gesture = hold (press and hold to record, release to stop) or tap (tap to start, tap again to stop). max_seconds = hard cap per note. min_seconds = shorter notes are thrown away as accidental taps. bitrate = bits per second (16000 keeps a 60 s note around 120 KB). mime_types = audio formats to try, best first. If the phone cannot record or the partner blocks the microphone, the form quietly falls back to typing.',
  'text._help': 'Free-text boxes accept any language or script, including Hindi/Tamil written in English letters. max_chars = maximum length of one answer.',
  'read_aloud._help': 'Speaker button on each question. Uses a pre-recorded clip if one exists for that text and language, otherwise the phone\'s built-in voice. The button hides itself when neither is available for the chosen language. In live mode the clips come with the published questionnaire (the Sheet\'s Audio clips tab, published from the control panel); config/audio_clips.json is used only when that doesn\'t arrive in time, and by the local test server.',
  'whats_changed._help': 'The \'What changed since last time\' screen. In live mode its content comes with the published questionnaire (control panel, Rounds), in the form\'s first request; the form waits at most timeout_seconds + 2 seconds for it, then uses its own copy, including config/whats_changed.json (the local test server uses that file too). If there are no items for the round, the screen is skipped.',
  'telemetry._help': 'Small \'progress\' messages (started / which screen the partner reached) so the dashboard can show drop-off per screen. They never contain answers. The \'opened\' message is always sent, even when this is false, because it also checks that the link is genuine.',
  '_flow_help': 'The screens, in order. id = permanent code for the screen (used in the data). type = what kind of screen. Built-in types: language_picker, whats_changed, function_ratings (one screen per area), function_deep_dives (problem screens for low-rated areas), support_block, thank_you (must be last). Generic types you can add freely: nps_0_10, rating_1_5, yes_no, single_choice (needs "options": [codes], labels in strings as choice.<id>.<code>), free_text, info_card (needs "text" and optional "body"). text = string key of the question. required = false adds a Skip button. show_if = only show this screen when an earlier answer matches, e.g. {"answer": "support_gate", "equals": "yes"}. Other tests: not_equals, at_most, at_least, in (a list), answered (true/false); combine with {"all": [...]} or {"any": [...]}. Area ratings can be tested too, e.g. {"answer": "fn_rating:payments", "at_most": 2}. skip_if: lang_in_url (language screen) or empty (what-changed screen).'
};

/** The notes at the top of the other three GitHub files, word for word (for PP_exportStatic). */
var PP_REPO_FILE_HELP = {
  'strings.json': 'Every word shown on screen, in all six languages: one key -> six values (en, hi, ta, te, kn, ml). Text that still needs a native speaker starts with "[TRANSLATE] " followed by the English; replace the whole value (including the [TRANSLATE] tag) with the real translation. {s} and {n} are numbers filled in by the app: keep them. Keys starting with _ are notes. Tip: python3 scripts/strings_csv.py export makes a spreadsheet translators can fill in. After editing run: python3 scripts/check_config.py',
  'whats_changed.json': 'Content for the \'What changed since your last feedback\' screen, one block per round. The block name must match the round=... value in the partner links. If a round has no items (or is missing), the screen is skipped. Each item needs all six languages; untranslated ones start with [TRANSLATE]. title is optional: leave it null to use the standard title (string wc.title). In live mode (Phase 2) the Google Apps Script serves this content, so you can change it without redeploying the form; this file is the backup. DEMO-R1 is fake test content: never use it for a real round.',
  'audio_clips.json': 'OPTIONAL pre-recorded audio for the read-aloud (speaker) button. Map a string key from web/i18n/strings.json to one mp3 per language, for example  "q.nps": { "hi": "audio/hi/q.nps.mp3", "ta": "audio/ta/q.nps.mp3" }. Paths are relative to the web/ folder. When a clip exists for a text in the partner\'s language it is played instead of the phone\'s built-in voice. Keep clips short and small (mono, 32-48 kbps mp3) because partners are on slow data. Leave clips empty to rely on the phone\'s voice only.'
};

// ---- Fixed rules used by the checks and by reading/writing (private) --------

/** Permanent codes (area, problem, screen, answer codes) end up in the data, so they stay simple. */
var PP_MDL_CODE_RE_ = /^[a-z][a-z0-9_]*$/;
var PP_MDL_CODE_RULE_ = 'only lowercase letters a-z, digits and _, starting with a letter';
var PP_MDL_LANG_RE_ = /^[a-z]{2,3}$/;
var PP_MDL_ROUND_RE_ = /^[A-Za-z0-9_-]{1,64}$/;
var PP_MDL_HEX_RE_ = /^#[0-9A-Fa-f]{6}$/;
var PP_MDL_BCP47_RE_ = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
var PP_MDL_SURVEY_ID_RE_ = /^[a-z][a-z0-9_-]*$/;
/** Same rule as PanelServer.gs: https://, no spaces, quotes, "?" or "#", and a final "/". */
var PP_MDL_FORM_URL_RE_ = /^https:\/\/[^\s"'<>?#]+\/$/;
var PP_MDL_TAG_ = '[TRANSLATE]';
var PP_MDL_MAX_COMPILED_CHARS_ = 200000;
/** Google Sheets refuses cells above 50,000 characters. */
var PP_MDL_MAX_CELL_CHARS_ = 49000;
var PP_MDL_SHOW_IF_TESTS_ = ['equals', 'not_equals', 'at_most', 'at_least', 'in', 'answered'];
/** The words the control panel's rule builder uses for each test. */
var PP_MDL_TEST_NAMES_ = { equals: 'is', not_equals: 'is not', at_most: 'is at most',
  at_least: 'is at least', in: 'is one of', answered: 'was answered' };
/** The only skip_if value each screen type accepts (empty is always fine). */
var PP_MDL_SKIP_IF_ = { language_picker: 'lang_in_url', whats_changed: 'empty' };
/** What the skip_if values mean, in the control panel's own words. */
var PP_MDL_SKIP_IF_NAMES_ = {
  lang_in_url: 'Skip this screen when the partner’s link already says the language',
  empty: 'Skip this screen when the round has nothing to show'
};
/** Plain names for the values of the "choice" settings (as in the control panel's lists). */
var PP_MDL_OPTION_NAMES_ = {
  'deep_dive.when': { after_all_ratings: 'After all the area ratings', immediate: 'Straight after each low rating' },
  'voice.gesture': { hold: 'Press and hold to talk', tap: 'Tap to start and stop' }
};
/** Messages name a question, area or problem by its English text, cut to about this many characters. */
var PP_MDL_NAME_CHARS_ = 60;
/** Screen fields that hold the NAME of a text. */
var PP_MDL_SCREEN_TEXT_FIELDS_ = ['text', 'low_label', 'high_label', 'scale_hint', 'body'];
var PP_MDL_FIELD_NAMES_ = { text: 'question text', low_label: 'label under 0', high_label: 'label under 10',
  scale_hint: 'hint under the scale', body: 'longer text' };
/**
 * Texts the form's code asks for although they are not in PP_FORM_TEXT_KEYS
 * (scripts/check_config.py finds them by reading the code). They never count
 * as "not used by anything".
 */
var PP_MDL_CODE_TEXT_KEYS_ = ['q.tell_more_required', 'support.not_applicable', 'q.support_comment'];
/** How messages describe a text the form's own code uses. */
var PP_MDL_FORM_TEXT_REASON_ = 'one of the form\'s own texts (its buttons and messages)';
var PP_MDL_LANGUAGE_NAMES_ = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
  ml: 'Malayalam', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia',
  as: 'Assamese', ur: 'Urdu' };
var PP_MDL_DEMO_NOTE_ = 'Fake demo content: never use for real links';
/** survey.json "links" in the GitHub copy: the Phase 1 test-mode defaults (fake ids only). */
var PP_MDL_REPO_LINKS_ = { mock_defaults: { dc: 'DC-DEMO-001', round: 'DEMO-R1', t: '' } };
var PP_MDL_HEADER_COLOUR_ = '#EDE7F6';
var PP_MDL_TAB_COLOURS_ = { config: '#7E57C2', operations: '#43A047' };
/** Headings a tab must have before it can be read safely (when it has rows). */
var PP_MDL_KEY_HEADERS_ = {
  'Settings': ['setting', 'value'], 'Languages': ['code'], 'Areas': ['area_id'],
  'Chips': ['area_id', 'chip_code'], 'Support': ['item_code'], 'Screens': ['screen_id', 'type'],
  'Texts': ['key'], 'What changed': ['round_id'], 'Audio clips': ['key', 'lang', 'url'],
  'Rounds': ['round_id']
};
/** What identifies one row of each tab (used to keep your own extra columns with their row). */
var PP_MDL_ROW_IDENTITY_ = {
  'Settings': ['setting'], 'Languages': ['code'], 'Areas': ['area_id'], 'Chips': ['area_id', 'chip_code'],
  'Support': ['item_code'], 'Screens': ['screen_id'], 'Texts': ['key'], 'What changed': ['round_id'],
  'Audio clips': ['key', 'lang'], 'Rounds': ['round_id']
};
/** Columns that alone never make a row count as "filled in" (an order number or a tick box). */
var PP_MDL_FLAG_COLUMNS_ = { order: true, active: true, required: true };
/**
 * Problems Flow.gs reports while it turns the rows into the route
 * (PP.flowPanel.fromRows) that block Publish: an arrow to a code no row has
 * (G2) or back to an earlier row (G3), and settings it had to leave out (F1).
 * The others are warnings: an arrow to a hidden row (C2), an ending's arrows (G4).
 */
var PP_MDL_FLOW_ERRORS_ = { G2: true, G3: true, F1: true };
/**
 * The answer keys built-in area screens use, which the panel never changes:
 * a published route's node "fn_ratings" stores fn_rating:<area>, and so on.
 */
var PP_MDL_IMPLIED_PREFIX_ = { function_rating: 'fn_rating', function_deep_dive: 'fn_deep_dive',
  function_ratings: 'fn_rating', function_deep_dives: 'fn_deep_dive' };
/** The route's own screen kinds, as the Screens tab names them (for messages). */
var PP_MDL_NODE_TYPES_ = { function_rating: 'function_ratings', function_deep_dive: 'function_deep_dives' };
/**
 * Every code partners have ever answered under (Script Property
 * CODES_EVER_LIVE, kept by Code.gs) must fit in one Script Property, which
 * Google limits to 9 KB: from 8,000 characters the checks warn.
 */
var PP_MDL_EVER_LIVE_WARN_CHARS_ = 8000;
var PP_MDL_EVER_LIVE_MAX_CHARS_ = 9000;


/** Builds one PP_SETTINGS_SCHEMA entry with every field present. */
function PP_mdlSetting_(key, type, defaultValue, group, label, help, limits) {
  const extra = limits || {};
  return {
    key: key,
    type: type,
    default: defaultValue,
    min: extra.min === undefined ? null : extra.min,
    max: extra.max === undefined ? null : extra.max,
    options: extra.options || null,
    help: help,
    group: group,
    label: label
  };
}

/**
 * The column headings of a tab. For Texts and What changed the language
 * columns follow the given language codes (default: the six standard ones).
 */
function PP_tabHeaders(tab, languageCodes) {
  if (!PP_mdlHas_(PP_TABS, tab)) throw new Error('There is no tab called "' + tab + '" in the Partner Pulse layout.');
  const codes = Array.isArray(languageCodes) ? PP_mdlUnique_(languageCodes) : ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
  if (tab === 'Texts') return ['key'].concat(codes, ['note']);
  if (tab === 'What changed') return ['round_id', 'order'].concat(codes);
  return PP_TABS[tab].slice();
}


// =============================================================================
// 2. Small helpers
// =============================================================================

function PP_mdlHas_(obj, key) {
  return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
}

/** A plain { } object (works for objects that come from another file or test harness too). */
function PP_mdlIsObject_(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function PP_mdlIsDate_(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

function PP_mdlIsNumber_(value) {
  return typeof value === 'number' && isFinite(value);
}

function PP_mdlIsWhole_(value) {
  return PP_mdlIsNumber_(value) && Math.floor(value) === value;
}

/** Text with something in it. */
function PP_mdlIsFilled_(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Any cell value as text (a date cell becomes yyyy-MM-dd, India time). Not trimmed. */
function PP_mdlText_(value) {
  if (value === null || value === undefined) return '';
  if (PP_mdlIsDate_(value)) return PP_dateIST(value);
  return String(value);
}

function PP_mdlTrim_(value) {
  return PP_mdlText_(value).trim();
}

/** A deep copy of plain data. */
function PP_mdlCopy_(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Trimmed, non-empty, without repeats, in order. */
function PP_mdlUnique_(list) {
  const out = [];
  (list || []).forEach(item => {
    const text = PP_mdlTrim_(item);
    if (text && out.indexOf(text) === -1) out.push(text);
  });
  return out;
}

/** "__proto__" would change how a JavaScript object behaves, so it is never used as a name. */
function PP_mdlSafeKey_(key) {
  return key !== '__proto__';
}

/**
 * The date in India (yyyy-MM-dd) of a moment, given as a Date, an ISO text or
 * a number. India has no summer time, so Indian time is always UTC + 5:30.
 * Returns "" when the moment cannot be read.
 */
function PP_dateIST(date) {
  let when = date;
  if (typeof when === 'string' || typeof when === 'number') when = new Date(when);
  if (!PP_mdlIsDate_(when) || isNaN(when.getTime())) return '';
  const india = new Date(when.getTime() + 330 * 60 * 1000);
  return india.getUTCFullYear() + '-' + PP_mdlPad2_(india.getUTCMonth() + 1) + '-' + PP_mdlPad2_(india.getUTCDate());
}

function PP_mdlPad2_(number) {
  return (number < 10 ? '0' : '') + number;
}

/** The form's own rule: empty, or still starting with [TRANSLATE], means "not translated yet". */
function PP_mdlNeedsTranslation_(text) {
  return !PP_mdlIsFilled_(text) || /^\s*\[TRANSLATE\]/.test(text);
}

/** The {s}, {n} ... marks in a text, sorted, without repeats. */
function PP_mdlPlaceholders_(text) {
  return PP_mdlUnique_(PP_mdlText_(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();
}

/** A value as a person reads it in a message: "abc", 60, on/off, or empty. */
function PP_mdlShow_(value) {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return String(value);
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > 60) text = text.slice(0, 57) + '...';
  return '"' + text + '"';
}

/** A value written the way it looks in a rule (JSON), shortened when long. */
function PP_mdlShowJson_(value) {
  const text = JSON.stringify(value === undefined ? null : value);
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

function PP_mdlPlural_(count, word, many) {
  return count + ' ' + (count === 1 ? word : (many || word + 's'));
}

/** '"a", "b" and 3 more': keeps long lists short. */
function PP_mdlQuotedList_(items, limit) {
  const max = limit || 8;
  const shown = items.slice(0, max).map(item => '"' + item + '"').join(', ');
  const rest = items.length - max;
  return shown + (rest > 0 ? ' and ' + rest + ' more' : '');
}

/** '"yes" or "no"'. */
function PP_mdlOrList_(items) {
  return PP_mdlWordList_(items.map(item => '"' + item + '"'), 'or');
}

/** 'English, Hindi or Tamil' (joiner "or" or "and"). */
function PP_mdlWordList_(items, joiner) {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(', ') + ' ' + joiner + ' ' + items[items.length - 1];
}

function PP_mdlCapital_(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A text on one line, for naming things in messages. One a little longer than
 * PP_MDL_NAME_CHARS_ is kept whole; a longer one is cut at a space near that
 * length and ends with "...".
 */
function PP_mdlShorten_(text) {
  const line = PP_mdlText_(text).replace(/\s+/g, ' ').trim();
  if (line.length <= PP_MDL_NAME_CHARS_ + 5) return line;
  let cut = line.slice(0, PP_MDL_NAME_CHARS_);
  const space = cut.lastIndexOf(' ');
  if (space > PP_MDL_NAME_CHARS_ - 15) cut = cut.slice(0, space);
  return cut.replace(/[\s,.;:!?-]+$/, '') + '...';
}

/** The text of an error from Google, without its final full stop (it is quoted inside a sentence). */
function PP_mdlErrorText_(err) {
  const text = PP_mdlText_(err && err.message ? err.message : err).trim();
  return text.replace(/[.\s]+$/, '') || 'no reason given';
}

/** ' Did you mean "payments"?' when a close spelling exists, otherwise ''. */
function PP_mdlDidYouMean_(word, choices) {
  const best = PP_mdlClosest_(word, choices, 0.7);
  return best ? ' Did you mean "' + best + '"?' : '';
}

/**
 * The choice most similar to word, if at least "cutoff" alike. Likeness is
 * 2 x (letters in common, in order) / (both lengths added): 1 = the same,
 * 0 = nothing alike. This is close to what scripts/check_config.py uses, so
 * both suggest the same corrections ("loss" -> "losses").
 */
function PP_mdlClosest_(word, choices, cutoff) {
  if (typeof word !== 'string' || !word) return '';
  let best = '';
  let bestScore = -1;
  (choices || []).forEach(choice => {
    if (typeof choice !== 'string' || !choice || choice === word) return;
    const score = 2 * PP_mdlCommonLength_(word, choice) / (word.length + choice.length);
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  });
  return bestScore >= cutoff ? best : '';
}

/** How many letters a and b have in common, in the same order (longest common subsequence). */
function PP_mdlCommonLength_(a, b) {
  let previous = [];
  for (let j = 0; j <= b.length; j++) previous.push(0);
  for (let i = 1; i <= a.length; i++) {
    const current = [0];
    for (let j = 1; j <= b.length; j++) {
      current.push(a.charAt(i - 1) === b.charAt(j - 1) ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The value at a dotted path such as "voice.max_seconds", or undefined. */
function PP_mdlGetPath_(obj, path) {
  let node = obj;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i++) {
    if (!PP_mdlIsObject_(node) || !PP_mdlHas_(node, parts[i])) return undefined;
    node = node[parts[i]];
  }
  return node;
}

function PP_mdlSetPath_(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!PP_mdlIsObject_(node[parts[i]])) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/** Only the { } entries of a list (anything else is ignored). */
function PP_mdlList_(value) {
  return Array.isArray(value) ? value.filter(PP_mdlIsObject_) : [];
}

/** The language codes of a language list, in order (optionally only those switched on). */
function PP_mdlLanguageCodes_(languages, activeOnly) {
  return PP_mdlUnique_(languages.filter(language => !activeOnly || language.active).map(language => language.code));
}

/**
 * A language as people know it: its English name ("Tamil"), else its name in
 * its own script, else its code in quotes ('"sat"').
 */
function PP_mdlLanguageName_(code, model) {
  if (PP_mdlHas_(PP_MDL_LANGUAGE_NAMES_, code)) return PP_MDL_LANGUAGE_NAMES_[code];
  let native = '';
  model.languages.forEach(language => {
    if (language.code === code && !native) native = language.native_name;
  });
  return native || '"' + PP_mdlText_(code) + '"';
}

function PP_mdlScreenType_(type) {
  for (let i = 0; i < PP_SCREEN_TYPES.length; i++) {
    if (PP_SCREEN_TYPES[i].type === type) return PP_SCREEN_TYPES[i];
  }
  return null;
}

function PP_mdlTypeNames_() {
  return PP_SCREEN_TYPES.map(entry => entry.type);
}

/** True for the built-in kinds of screen (each may appear only once). */
function PP_mdlIsBuiltin_(type) {
  const entry = PP_mdlScreenType_(type);
  return Boolean(entry && entry.builtin);
}

/** The value as JavaScript's String() writes it: how the form compares rule values. */
function PP_mdlJsText_(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return null;   // lists and groups never match anything
}


// =============================================================================
// 3. Settings: turning cell values into proper values, and checking them
// =============================================================================

function PP_mdlSettingEntry_(key) {
  for (let i = 0; i < PP_SETTINGS_SCHEMA.length; i++) {
    if (PP_SETTINGS_SCHEMA[i].key === key) return PP_SETTINGS_SCHEMA[i];
  }
  return null;
}

/**
 * One setting's value in its proper type. An empty cell means "use the
 * default". A value that cannot be understood is kept (as text) so the check
 * can show the person exactly what is wrong, instead of silently replacing it.
 */
function PP_mdlCoerceSetting_(entry, given) {
  const value = PP_mdlIsDate_(given) ? PP_dateIST(given) : given;
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return PP_mdlCopy_(entry.default);
  }
  switch (entry.type) {
    case 'bool': return PP_mdlCoerceFlag_(value);
    case 'int':
    case 'number': return PP_mdlCoerceNumber_(value);
    case 'faces': return PP_mdlListText_(value, /[\s,]+/, ' ');
    case 'list':
    case 'numlist': return PP_mdlListText_(value, /\s*,\s*/, ', ');
    default: return PP_mdlTrim_(value);
  }
}

function PP_mdlCoerceFlag_(value) {
  if (typeof value === 'boolean') return value;
  const text = PP_mdlTrim_(value).toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return PP_mdlTrim_(value);   // not on/off: kept so the check can explain it
}

/** "60" becomes 60; anything that is not a plain number is kept as text. */
function PP_mdlCoerceNumber_(value) {
  if (typeof value === 'number') return value;
  const text = PP_mdlTrim_(value);
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

/** A list (or text) as tidy text: "a, b, c" (or "😠 🙁 😐 🙂 😄" for faces). */
function PP_mdlListText_(value, splitter, joiner) {
  const items = Array.isArray(value) ? value.map(PP_mdlTrim_) : PP_mdlTrim_(value).split(splitter);
  return items.map(item => item.trim()).filter(item => item !== '').join(joiner);
}

/** The separate items of a faces / list / numlist setting. */
function PP_mdlSettingItems_(entry, value) {
  const text = PP_mdlTrim_(value);
  if (!text) return [];
  const splitter = entry.type === 'faces' ? /[\s,]+/ : /\s*,\s*/;
  return text.split(splitter).map(item => item.trim()).filter(item => item !== '');
}

/**
 * What is wrong with one setting on its own, in plain English ('' when
 * nothing is). "lang" and "key" settings also need the rest of the model:
 * see PP_mdlSettingContextProblem_.
 */
function PP_mdlSettingProblem_(entry, value) {
  const now = ' Right now it is ' + PP_mdlShow_(value) + '.';
  switch (entry.type) {
    case 'bool':
      return typeof value === 'boolean' ? '' : PP_mdlSettingName_(entry) + ' must be on or off (a ticked or unticked box).' + now;
    case 'int':
    case 'number':
      return PP_mdlNumberProblem_(entry, value);
    case 'color':
      return PP_MDL_HEX_RE_.test(PP_mdlText_(value)) ? '' : PP_mdlSettingName_(entry) + ' must be a colour code like "#4B2E83": ' +
        'a # followed by exactly 6 characters from 0-9 and A-F.' + now;
    case 'choice':
      return entry.options.indexOf(value) !== -1 ? '' : PP_mdlSettingName_(entry) + ' must be ' +
        PP_mdlOrList_(entry.options.map(option => PP_mdlOptionName_(entry, option))) + '.' + now +
        ' (In the Settings tab: ' + entry.options.join(' or ') + '.' + PP_mdlDidYouMean_(PP_mdlText_(value), entry.options) + ')';
    case 'faces': {
      const count = PP_mdlSettingItems_(entry, value).length;
      return count === 5 ? '' : PP_mdlSettingName_(entry) + ' must be exactly 5 faces separated by spaces, from worst (1) to ' +
        'best (5). Right now there ' + (count === 1 ? 'is 1' : 'are ' + count) + '.';
    }
    case 'list':
      return PP_mdlSettingItems_(entry, value).length ? '' : PP_mdlSettingName_(entry) + ' needs at least one entry. Separate ' +
        'entries with commas.' + now;
    case 'numlist':
      return PP_mdlNumberListProblem_(entry, value);
    case 'url':
      return PP_MDL_FORM_URL_RE_.test(PP_mdlText_(value)) ? '' : PP_mdlSettingName_(entry) + ' must be a full web address that ' +
        'starts with https:// and ends with /, without spaces, "?" or "#", for example "' + entry.default + '".' + now;
    case 'text':
      return PP_mdlTextSettingProblem_(entry, value);
    default:
      return '';
  }
}

/** A setting's plain name in quotes, to start a message: '"Longest voice note (seconds)"'. */
function PP_mdlSettingName_(entry) {
  return '"' + entry.label + '"';
}

/** A choice setting's value in plain words ("After all the area ratings"), as the control panel lists it. */
function PP_mdlOptionName_(entry, option) {
  const names = PP_mdlHas_(PP_MDL_OPTION_NAMES_, entry.key) ? PP_MDL_OPTION_NAMES_[entry.key] : {};
  return PP_mdlHas_(names, option) ? names[option] : option;
}

function PP_mdlNumberProblem_(entry, value) {
  const whole = entry.type === 'int';
  const isRightKind = whole ? PP_mdlIsWhole_(value) : PP_mdlIsNumber_(value);
  const tooLow = isRightKind && entry.min !== null && value < entry.min;
  const tooHigh = isRightKind && entry.max !== null && value > entry.max;
  if (isRightKind && !tooLow && !tooHigh) return '';
  return PP_mdlSettingName_(entry) + ' must be ' + (whole ? 'a whole number' : 'a number') + PP_mdlRangeText_(entry) +
    ', typed without quotes or units. Right now it is ' + PP_mdlShow_(value) + '.';
}

function PP_mdlRangeText_(entry) {
  if (entry.min !== null && entry.max !== null) return ' from ' + entry.min + ' to ' + entry.max;
  if (entry.min !== null) return ' of ' + entry.min + ' or more';
  if (entry.max !== null) return ' of at most ' + entry.max;
  return '';
}

function PP_mdlNumberListProblem_(entry, value) {
  const items = PP_mdlSettingItems_(entry, value);
  if (items.length < 1 || items.length > 20) {
    return PP_mdlSettingName_(entry) + ' must be 1 to 20 numbers separated by commas, for example "2, 5, 10, 20". Right now ' +
      'there ' + (items.length === 1 ? 'is 1' : 'are ' + items.length) + '.';
  }
  const bad = items.filter(item => !/^\d+(\.\d+)?$/.test(item) || Number(item) <= 0);
  return bad.length ? PP_mdlSettingName_(entry) + ' may only contain numbers above 0, separated by commas. These are not: ' +
    bad.join(', ') + '.' : '';
}

function PP_mdlTextSettingProblem_(entry, value) {
  const text = PP_mdlText_(value);
  const now = ' Right now it is ' + PP_mdlShow_(value) + '.';
  if (entry.key === 'survey_id' && !PP_MDL_SURVEY_ID_RE_.test(text)) {
    return PP_mdlSettingName_(entry) + ' may only use lowercase letters a-z, digits, - and _, and must start with a letter, ' +
      'for example "valmo-partner-pulse".' + now;
  }
  if (entry.key === 'branding.logo') {
    const problem = PP_mdlLogoProblem_(text);
    if (problem) return PP_mdlSettingName_(entry) + ' ' + problem + now;
  }
  return '';
}

/** The logo is optional: an https:// address or a path inside web/ (never outside it). */
function PP_mdlLogoProblem_(text) {
  return PP_mdlWebFileProblem_(text, 'assets/logo.svg');
}

/**
 * A picture or sound the form loads: an https:// address, or a file path
 * inside web/ (never outside it). The same rule as scripts/check_config.py,
 * which also checks that such a file really exists in web/ (the panel can't
 * see GitHub's files). example: shown in the message.
 */
function PP_mdlWebFileProblem_(text, example) {
  if (text === '') return '';
  if (/\s/.test(text)) return 'must not contain spaces.';
  if (/^https:\/\/\S+$/i.test(text)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return 'must be an https:// address (a secure web address), or a file path inside the web folder such as ' +
      example + '.';
  }
  if (text.charAt(0) === '/' || text.indexOf('\\') !== -1 || text.split('/').indexOf('..') !== -1) {
    return 'must be a file path inside the web folder, written with forward slashes and without a leading / ' +
      'or .., for example ' + example + '.';
  }
  return '';
}

/**
 * A setting in the form the published survey needs. A value that is wrong
 * gets the default instead, so that Preview still works while there are
 * errors (Publish is blocked by the check anyway).
 */
function PP_mdlTypedSetting_(entry, value) {
  const usable = PP_mdlSettingProblem_(entry, value) ? entry.default : value;
  if (entry.type === 'faces' || entry.type === 'list') return PP_mdlSettingItems_(entry, usable);
  if (entry.type === 'numlist') return PP_mdlSettingItems_(entry, usable).map(Number);
  return usable;
}


// =============================================================================
// 4. The model: an empty one, and tidying ("normalising") any model
// =============================================================================

/** A model with every setting at its default and nothing else. */
function PP_emptyModel() {
  const settings = {};
  PP_SETTINGS_SCHEMA.forEach(entry => { settings[entry.key] = PP_mdlCopy_(entry.default); });
  return {
    settings: settings,
    languages: [],
    areas: [],
    chips: [],
    support: [],
    screens: [],
    texts: {},
    text_notes: {},
    whats_changed: {},
    clips: {},
    rounds: []
  };
}

/**
 * A tidy copy of a model: every field present with its proper type,
 * defaults filled in, junk (empty rows, unknown fields) dropped. It never
 * changes the model it is given, and tidying twice gives the same result.
 * Values that are present but wrong (for example a threshold of "abc") are
 * kept, so PP_validate can point at them.
 */
function PP_normalizeModel(model) {
  const source = PP_mdlIsObject_(model) ? model : {};
  const out = PP_emptyModel();
  out.settings = PP_mdlNormalizeSettings_(source.settings);
  out.languages = PP_mdlNormalizeList_(source.languages, PP_mdlNormalizeLanguage_);
  out.areas = PP_mdlNormalizeList_(source.areas, PP_mdlNormalizeArea_);
  out.chips = PP_mdlOrderChips_(PP_mdlNormalizeList_(source.chips, PP_mdlNormalizeChip_), out.areas);
  out.support = PP_mdlNormalizeList_(source.support, PP_mdlNormalizeSupportItem_);
  out.screens = PP_mdlNormalizeList_(source.screens, PP_mdlNormalizeScreen_);
  const codes = PP_mdlLanguageCodes_(out.languages, false);
  out.texts = PP_mdlNormalizeTexts_(source.texts, codes);
  out.text_notes = PP_mdlNormalizeNotes_(source.text_notes, out.texts);
  out.rounds = PP_mdlNormalizeList_(source.rounds, PP_mdlNormalizeRound_);
  out.whats_changed = PP_mdlNormalizeNews_(source.whats_changed, codes, out.rounds);
  out.clips = PP_mdlNormalizeClips_(source.clips);
  if (PP_mdlIsFilled_(source.config_version)) out.config_version = source.config_version.trim();
  return out;
}

function PP_mdlNormalizeSettings_(settings) {
  const source = PP_mdlIsObject_(settings) ? settings : {};
  const out = {};
  PP_SETTINGS_SCHEMA.forEach(entry => {
    out[entry.key] = PP_mdlCoerceSetting_(entry, PP_mdlHas_(source, entry.key) ? source[entry.key] : undefined);
  });
  return out;
}

function PP_mdlNormalizeList_(list, normalizeOne) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach(item => {
    const clean = normalizeOne(item);
    if (clean) out.push(clean);
  });
  return out;
}

/** On/off for "active" columns: an empty cell counts as on (only an unticked box hides). */
function PP_mdlFlag_(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  const text = PP_mdlTrim_(value).toLowerCase();
  if (text === 'true' || text === 'yes') return true;
  if (text === 'false' || text === 'no') return false;
  return fallback;
}

function PP_mdlNormalizeLanguage_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const language = {
    code: PP_mdlTrim_(item.code),
    bcp47: PP_mdlTrim_(item.bcp47),
    native_name: PP_mdlTrim_(item.native_name),
    active: PP_mdlFlag_(item.active, true)
  };
  return (language.code || language.bcp47 || language.native_name) ? language : null;
}

function PP_mdlNormalizeArea_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const area = { id: PP_mdlTrim_(item.id), threshold: PP_mdlThreshold_(item.threshold), active: PP_mdlFlag_(item.active, true) };
  return (area.id || area.threshold !== null) ? area : null;
}

/** An area's own threshold: a number, null (= use the standard one), or the text as typed when wrong. */
function PP_mdlThreshold_(value) {
  if (PP_mdlIsNumber_(value)) return value;
  const text = PP_mdlTrim_(value);
  if (text === '') return null;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

function PP_mdlNormalizeChip_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const chip = { area: PP_mdlTrim_(item.area), code: PP_mdlTrim_(item.code), active: PP_mdlFlag_(item.active, true) };
  return (chip.area || chip.code) ? chip : null;
}

/**
 * Problems are kept grouped by area, in the order of the areas, so the Chips
 * tab always reads the same way. Within an area the order never changes.
 */
function PP_mdlOrderChips_(chips, areas) {
  const rank = {};
  areas.forEach((area, index) => {
    if (!PP_mdlHas_(rank, '#' + area.id)) rank['#' + area.id] = index;
  });
  const groups = {};
  const order = [];
  chips.forEach(chip => {
    const key = '#' + chip.area;
    if (!PP_mdlHas_(groups, key)) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(chip);
  });
  const known = order.filter(key => PP_mdlHas_(rank, key)).sort((a, b) => rank[a] - rank[b]);
  const unknown = order.filter(key => !PP_mdlHas_(rank, key));
  return known.concat(unknown).reduce((all, key) => all.concat(groups[key]), []);
}

function PP_mdlNormalizeSupportItem_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const support = { code: PP_mdlTrim_(item.code), active: PP_mdlFlag_(item.active, true) };
  return support.code ? support : null;
}

function PP_mdlNormalizeScreen_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const screen = {
    id: PP_mdlTrim_(item.id),
    type: PP_mdlTrim_(item.type),
    text: PP_mdlTrim_(item.text),
    required: PP_mdlRequiredValue_(item.required),
    show_if: PP_mdlRuleValue_(item.show_if),
    skip_if: PP_mdlTrim_(item.skip_if),
    options: PP_mdlOptionList_(item.options),
    low_label: PP_mdlTrim_(item.low_label),
    high_label: PP_mdlTrim_(item.high_label),
    scale_hint: PP_mdlTrim_(item.scale_hint),
    body: PP_mdlTrim_(item.body),
    active: PP_mdlFlag_(item.active, true),
    next: PP_mdlTrim_(item.next),
    jumps: PP_mdlJumpsValue_(item.jumps),
    repeat: PP_mdlTrim_(item.repeat)
  };
  const hasContent = screen.id || screen.type || screen.text || screen.skip_if || screen.options.length ||
    screen.low_label || screen.high_label || screen.scale_hint || screen.body || screen.show_if ||
    screen.next || screen.repeat || PP_mdlJumpsText_(screen.jumps);
  return hasContent ? screen : null;
}

/**
 * A row's jumps: [] (none), a list of { when, goto } as the control panel
 * builds them, or { unreadable: "the text as typed" } when the jumps column
 * cannot be read (the check then points at it, and Publish waits).
 */
function PP_mdlJumpsValue_(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return PP_mdlCopy_(value);
  if (PP_mdlIsObject_(value)) {
    return { unreadable: PP_mdlHas_(value, 'unreadable') ? PP_mdlText_(value.unreadable) : JSON.stringify(value) };
  }
  const text = PP_mdlTrim_(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    // Not a list of jumps: kept below, so the check can show it.
  }
  return { unreadable: text };
}

/** The jumps as the text in the Screens tab's jumps column ('' when there are none). */
function PP_mdlJumpsText_(jumps) {
  if (Array.isArray(jumps)) return jumps.length ? JSON.stringify(jumps) : '';
  if (PP_mdlIsObject_(jumps) && PP_mdlHas_(jumps, 'unreadable')) return PP_mdlText_(jumps.unreadable);
  return '';
}

/** true, false, or null (= the usual for this type). Anything else is kept for the check to explain. */
function PP_mdlRequiredValue_(value) {
  if (typeof value === 'boolean') return value;
  const text = PP_mdlTrim_(value);
  if (text === '') return null;
  if (text.toLowerCase() === 'true') return true;
  if (text.toLowerCase() === 'false') return false;
  return text;
}

/**
 * A show_if rule as an object, or null for "always show". Text from the
 * Screens tab is read as JSON; text that cannot be read is kept as
 * { unreadable: "..." } (the same marker the control panel uses).
 */
function PP_mdlRuleValue_(value) {
  if (value === null || value === undefined) return null;
  if (PP_mdlIsObject_(value)) return Object.keys(value).length ? PP_mdlCopy_(value) : null;
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (PP_mdlIsObject_(parsed)) return Object.keys(parsed).length ? parsed : null;
  } catch (err) {
    // Not valid rule text: kept below, so the check can show it.
  }
  return { unreadable: text };
}

/** Answer codes from a list or from text like "a, b, c". */
function PP_mdlOptionList_(value) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (value !== null && value !== undefined) items = PP_mdlText_(value).split(',');
  return items.map(PP_mdlTrim_).filter(item => item !== '');
}

/** Every text gets exactly one value per language of the model ("" when missing). Notes (_...) are dropped. */
function PP_mdlNormalizeTexts_(texts, codes) {
  const out = {};
  if (!PP_mdlIsObject_(texts)) return out;
  Object.keys(texts).forEach(rawKey => {
    const key = rawKey.trim();
    if (!key || key.charAt(0) === '_' || !PP_mdlSafeKey_(key) || PP_mdlHas_(out, key)) return;
    const source = PP_mdlIsObject_(texts[rawKey]) ? texts[rawKey] : {};
    const values = {};
    codes.forEach(code => { values[code] = PP_mdlText_(source[code]); });
    out[key] = values;
  });
  return out;
}

function PP_mdlNormalizeNotes_(notes, texts) {
  const out = {};
  Object.keys(texts).forEach(key => {
    out[key] = PP_mdlIsObject_(notes) && PP_mdlHas_(notes, key) ? PP_mdlText_(notes[key]) : '';
  });
  return out;
}

/**
 * "What changed" bullets per round. Every round of the Rounds list gets an
 * entry (an empty list when it has no bullets), in the order of the rounds;
 * rounds that only exist in What changed follow, if they have bullets.
 */
function PP_mdlNormalizeNews_(news, codes, rounds) {
  const source = PP_mdlIsObject_(news) ? news : {};
  const lists = {};
  const order = [];
  Object.keys(source).forEach(rawId => {
    const roundId = rawId.trim();
    if (!roundId || !PP_mdlSafeKey_(roundId)) return;
    const block = source[rawId];
    const items = Array.isArray(block) ? block : (PP_mdlIsObject_(block) && Array.isArray(block.items) ? block.items : []);
    const clean = items.map(item => PP_mdlNormalizeBullet_(item, codes)).filter(Boolean);
    if (!PP_mdlHas_(lists, roundId)) {
      lists[roundId] = [];
      order.push(roundId);
    }
    lists[roundId] = lists[roundId].concat(clean);
  });
  const out = {};
  rounds.forEach(round => {
    if (PP_mdlSafeKey_(round.id) && !PP_mdlHas_(out, round.id)) out[round.id] = PP_mdlHas_(lists, round.id) ? lists[round.id] : [];
  });
  order.forEach(roundId => {
    if (!PP_mdlHas_(out, roundId) && lists[roundId].length) out[roundId] = lists[roundId];
  });
  return out;
}

function PP_mdlNormalizeBullet_(item, codes) {
  if (!PP_mdlIsObject_(item)) return null;
  const bullet = {};
  let filled = false;
  codes.forEach(code => {
    bullet[code] = PP_mdlText_(item[code]);
    if (bullet[code].trim()) filled = true;
  });
  return filled ? bullet : null;
}

function PP_mdlNormalizeClips_(clips) {
  const out = {};
  if (!PP_mdlIsObject_(clips)) return out;
  Object.keys(clips).forEach(rawKey => {
    const key = rawKey.trim();
    const perLanguage = clips[rawKey];
    if (!key || key.charAt(0) === '_' || !PP_mdlSafeKey_(key) || !PP_mdlIsObject_(perLanguage)) return;
    Object.keys(perLanguage).forEach(rawLang => {
      const lang = rawLang.trim();
      const url = PP_mdlTrim_(perLanguage[rawLang]);
      if (!lang || lang.charAt(0) === '_' || !PP_mdlSafeKey_(lang) || !url) return;
      if (!PP_mdlHas_(out, key)) out[key] = {};
      if (!PP_mdlHas_(out[key], lang)) out[key][lang] = url;
    });
  });
  return out;
}

function PP_mdlNormalizeRound_(item) {
  if (!PP_mdlIsObject_(item)) return null;
  const round = {
    id: PP_mdlTrim_(item.id),
    status: PP_mdlTrim_(item.status).toLowerCase() || 'draft',
    opens_on: PP_mdlTrim_(item.opens_on),
    closes_on: PP_mdlTrim_(item.closes_on),
    data_sheet: PP_mdlTrim_(item.data_sheet),
    audio_folder: PP_mdlTrim_(item.audio_folder),
    notes: PP_mdlTrim_(item.notes)
  };
  return round.id ? round : null;
}


// =============================================================================
// 5. Reading the questionnaire tabs (PP_readModel)
// =============================================================================

/**
 * Reads the ten questionnaire tabs into a tidy model. A missing tab simply
 * gives an empty section (settings at their defaults). Throws a plain-English
 * error when a tab with rows has lost its key heading.
 */
function PP_readModel(ss) {
  PP_mdlRequireBook_(ss);
  const raw = PP_emptyModel();
  raw.settings = PP_mdlReadSettings_(ss);
  raw.languages = PP_mdlSortByOrder_(PP_mdlReadRows_(ss, 'Languages', null)).map(row => ({
    code: row.code, bcp47: row.bcp47, native_name: row.native_name, active: row.active }));
  const codes = PP_mdlUnique_(raw.languages.map(language => language.code));
  raw.areas = PP_mdlSortByOrder_(PP_mdlReadRows_(ss, 'Areas', null)).map(row => ({
    id: row.area_id, threshold: row.threshold, active: row.active }));
  raw.chips = PP_mdlChipRowsInOrder_(PP_mdlReadRows_(ss, 'Chips', null)).map(row => ({
    area: row.area_id, code: row.chip_code, active: row.active }));
  raw.support = PP_mdlSortByOrder_(PP_mdlReadRows_(ss, 'Support', null)).map(row => ({
    code: row.item_code, active: row.active }));
  raw.screens = PP_mdlSortByOrder_(PP_mdlReadRows_(ss, 'Screens', null)).map(PP_mdlScreenFromRow_);
  PP_mdlReadTexts_(ss, codes, raw);
  raw.whats_changed = PP_mdlReadNews_(ss, codes);
  raw.clips = PP_mdlReadClips_(ss);
  raw.rounds = PP_mdlReadRows_(ss, 'Rounds', null).map(row => ({
    id: row.round_id, status: row.status, opens_on: row.opens_on, closes_on: row.closes_on,
    data_sheet: row.data_sheet, audio_folder: row.audio_folder, notes: row.notes }));
  const model = PP_normalizeModel(raw);
  // An invisible mark meaning "this is the draft as saved in the Sheet". It is
  // not copied, not saved and not sent to the panel; PP_applyTranslationHelpers
  // uses it as a safety net (see there).
  Object.defineProperty(model, 'PP_fromSheet', { value: true, enumerable: false });
  return model;
}

function PP_mdlRequireBook_(ss) {
  if (!ss || typeof ss.getSheetByName !== 'function') {
    throw new Error('The control spreadsheet could not be opened. Open the control panel from the ' +
      'Partner Pulse menu inside the Sheet, then try again.');
  }
}

/**
 * The filled-in rows of a tab as { heading: value } objects (plus _row, the
 * row's position). Columns are found by heading, ignoring capital letters and
 * extra spaces. A row counts only if something other than its order number
 * or tick boxes is filled in.
 */
function PP_mdlReadRows_(ss, tab, codes) {
  const sheet = ss.getSheetByName(tab);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  const grid = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const columns = PP_mdlHeaderColumns_(grid[0]);
  if (lastRow >= 2) PP_mdlRequireKeyHeaders_(tab, columns);
  const headers = PP_tabHeaders(tab, codes);
  const rows = [];
  for (let r = 1; r < grid.length; r++) {
    const row = { _row: r };
    let filled = false;
    headers.forEach(header => {
      const name = header.toLowerCase();
      const value = PP_mdlHas_(columns, name) ? grid[r][columns[name]] : '';
      row[header] = value;
      if (!PP_mdlHas_(PP_MDL_FLAG_COLUMNS_, header) && PP_mdlTrim_(value) !== '') filled = true;
    });
    if (filled) rows.push(row);
  }
  return rows;
}

/** Heading (lower case, trimmed) -> column position from 0. The first of two equal headings wins. */
function PP_mdlHeaderColumns_(headerRow) {
  const columns = {};
  (headerRow || []).forEach((cell, index) => {
    const name = PP_mdlTrim_(cell).toLowerCase();
    if (name && PP_mdlSafeKey_(name) && !PP_mdlHas_(columns, name)) columns[name] = index;
  });
  return columns;
}

/** Stops (changing nothing) when a tab that has rows lacks a heading it cannot be read without. */
function PP_mdlRequireKeyHeaders_(tab, columns) {
  const needed = PP_mdlHas_(PP_MDL_KEY_HEADERS_, tab) ? PP_MDL_KEY_HEADERS_[tab] : [];
  const missing = needed.filter(header => !PP_mdlHas_(columns, header));
  if (!missing.length) return;
  throw new Error('The "' + tab + '" tab has no column headed ' + missing.map(h => '"' + h + '"').join(' and ') +
    ' in row 1, so it cannot be read safely. Someone may have renamed or deleted that heading. Type it back ' +
    'into row 1 above the right column (exactly as written here), then try again. Nothing was changed.');
}

/**
 * Rows in the order of their "order" numbers. A row without a number stays
 * right after the row above it, so a row inserted without a number does not
 * jump to the end.
 */
function PP_mdlSortByOrder_(rows) {
  let carried = -Infinity;
  const keyed = rows.map(row => {
    const order = PP_mdlCoerceNumber_(row.order);
    if (PP_mdlIsNumber_(order)) carried = order;
    return { row: row, order: carried };
  });
  keyed.sort((a, b) => {
    if (a.order === b.order) return a.row._row - b.row._row;
    return a.order < b.order ? -1 : 1;
  });
  return keyed.map(item => item.row);
}

/** Chips: grouped by area (first appearance), each area's rows in "order" order. */
function PP_mdlChipRowsInOrder_(rows) {
  const groups = {};
  const order = [];
  rows.forEach(row => {
    const key = '#' + PP_mdlTrim_(row.area_id);
    if (!PP_mdlHas_(groups, key)) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(row);
  });
  return order.reduce((all, key) => all.concat(PP_mdlSortByOrder_(groups[key])), []);
}

function PP_mdlReadSettings_(ss) {
  const settings = {};
  PP_mdlReadRows_(ss, 'Settings', null).forEach(row => {
    const key = PP_mdlTrim_(row.setting);
    if (key && PP_mdlSafeKey_(key) && !PP_mdlHas_(settings, key)) settings[key] = row.value;
  });
  return settings;
}

function PP_mdlScreenFromRow_(row) {
  return {
    id: row.screen_id, type: row.type, text: row.text_key, required: row.required, show_if: row.show_if,
    skip_if: row.skip_if, options: row.options, low_label: row.low_label, high_label: row.high_label,
    scale_hint: row.scale_hint, body: row.body, active: row.active, next: row.next, jumps: row.jumps,
    repeat: row.repeat
  };
}

/** Texts tab: one row per key. If a key appears twice, the first row is used. */
function PP_mdlReadTexts_(ss, codes, raw) {
  PP_mdlReadRows_(ss, 'Texts', codes).forEach(row => {
    const key = PP_mdlTrim_(row.key);
    if (!key || key.charAt(0) === '_' || !PP_mdlSafeKey_(key) || PP_mdlHas_(raw.texts, key)) return;
    const values = {};
    codes.forEach(code => { values[code] = row[code]; });
    raw.texts[key] = values;
    raw.text_notes[key] = row.note;
  });
}

/** What changed tab: rows grouped by round, each round's bullets in "order" order. */
function PP_mdlReadNews_(ss, codes) {
  const groups = {};
  const order = [];
  PP_mdlReadRows_(ss, 'What changed', codes).forEach(row => {
    const roundId = PP_mdlTrim_(row.round_id);
    if (!roundId || !PP_mdlSafeKey_(roundId)) return;
    if (!PP_mdlHas_(groups, roundId)) {
      groups[roundId] = [];
      order.push(roundId);
    }
    groups[roundId].push(row);
  });
  const news = {};
  order.forEach(roundId => {
    news[roundId] = PP_mdlSortByOrder_(groups[roundId]).map(row => {
      const bullet = {};
      codes.forEach(code => { bullet[code] = row[code]; });
      return bullet;
    });
  });
  return news;
}

function PP_mdlReadClips_(ss) {
  const clips = {};
  PP_mdlReadRows_(ss, 'Audio clips', null).forEach(row => {
    const key = PP_mdlTrim_(row.key);
    const lang = PP_mdlTrim_(row.lang);
    const url = PP_mdlTrim_(row.url);
    if (!key || !lang || !url || !PP_mdlSafeKey_(key) || !PP_mdlSafeKey_(lang)) return;
    if (!PP_mdlHas_(clips, key)) clips[key] = {};
    if (!PP_mdlHas_(clips[key], lang)) clips[key][lang] = url;
  });
  return clips;
}


// =============================================================================
// 6. Writing the questionnaire tabs (PP_writeModel)
// =============================================================================

/**
 * Writes the listed sections of a model into their tabs (all sections when
 * "sections" is left out). It works in two steps, so that a problem found
 * early never leaves the draft half-saved:
 *   1. CHECK AND PLAN, without writing anything: every value fits in a cell,
 *      every tab can be read (or can be created), where each column goes,
 *      and which lines each tab gets;
 *   2. WRITE, tab by tab: the tab is created or made bigger when needed,
 *      missing headings are added on the right, all rows are written with
 *      ONE write, then left-over old rows are emptied.
 * If Google still refuses a write half-way (for example a protected tab),
 * the error says that the draft may be only partly changed and that the
 * control panel should be reloaded. Columns this file does not know are left
 * alone.
 */
function PP_writeModel(ss, model, sections) {
  PP_mdlRequireBook_(ss);
  const tidy = PP_normalizeModel(model);
  const tables = PP_mdlSectionsToWrite_(sections).map(section => PP_mdlTableFor_(section, tidy));
  tables.forEach(PP_mdlCheckCellSizes_);
  const plans = tables.map(table => PP_mdlPlanTable_(ss, table));   // still nothing written
  plans.forEach(plan => {
    try {
      PP_mdlWritePlan_(ss, plan);
    } catch (err) {
      throw new Error(PP_mdlWriteFailedMessage_(plan.table.tab, err));
    }
  });
  return { ok: true, sections: tables.map(table => table.section) };
}

/** The message when Google refuses a write after saving has started. */
function PP_mdlWriteFailedMessage_(tab, err) {
  return 'Saving stopped half-way: Google Sheets would not change the "' + tab + '" tab (it said: "' +
    PP_mdlErrorText_(err) + '"). The draft may be only partly changed now: some tabs may have your new version ' +
    'and others the old one. Reload the control panel (close it, then Partner Pulse > Open control panel) to ' +
    'see what was saved, then make your last changes again and save. If this happens again, check that the "' +
    tab + '" tab is not protected (Data > Protect sheets and ranges).';
}

function PP_mdlSectionsToWrite_(sections) {
  if (sections === null || sections === undefined) return PP_MODEL_SECTIONS.slice();
  const asked = Array.isArray(sections) ? sections : [sections];
  const out = [];
  asked.forEach(name => {
    const section = name === 'text_notes' ? 'texts' : String(name);
    if (PP_MODEL_SECTIONS.indexOf(section) === -1) {
      throw new Error('Cannot save "' + name + '": the parts that can be saved are ' + PP_MODEL_SECTIONS.join(', ') + '.');
    }
    if (out.indexOf(section) === -1) out.push(section);
  });
  return out;
}

/** The headings and rows one section becomes. */
function PP_mdlTableFor_(section, model) {
  const codes = PP_mdlLanguageCodes_(model.languages, false);
  const tab = PP_SECTION_TABS[section];
  let rows;
  switch (section) {
    case 'settings':
      rows = PP_SETTINGS_SCHEMA.map(entry => [entry.key, model.settings[entry.key], entry.help]);
      break;
    case 'languages':
      rows = model.languages.map((l, i) => [i + 1, l.code, l.bcp47, l.native_name, l.active]);
      break;
    case 'areas':
      rows = model.areas.map((a, i) => [i + 1, a.id, a.threshold === null ? '' : a.threshold, a.active]);
      break;
    case 'chips':
      rows = PP_mdlChipRows_(model.chips);
      break;
    case 'support':
      rows = model.support.map((s, i) => [i + 1, s.code, s.active]);
      break;
    case 'screens':
      rows = model.screens.map(PP_mdlScreenRow_);
      break;
    case 'texts':
      rows = Object.keys(model.texts).map(key =>
        [key].concat(codes.map(code => model.texts[key][code]), [model.text_notes[key] || '']));
      break;
    case 'whats_changed':
      rows = PP_mdlNewsRows_(model.whats_changed, codes);
      break;
    case 'clips':
      rows = PP_mdlClipRows_(model.clips);
      break;
    default:
      rows = model.rounds.map(r => [r.id, r.status, r.opens_on, r.closes_on, r.data_sheet, r.audio_folder, r.notes]);
  }
  return { section: section, tab: tab, headers: PP_tabHeaders(tab, codes), rows: rows };
}

/** Chips: the order number restarts at 1 for every area. */
function PP_mdlChipRows_(chips) {
  const counter = {};
  return chips.map(chip => {
    const key = '#' + chip.area;
    counter[key] = (PP_mdlHas_(counter, key) ? counter[key] : 0) + 1;
    return [chip.area, counter[key], chip.code, chip.active];
  });
}

function PP_mdlScreenRow_(screen, index) {
  return [index + 1, screen.id, screen.type, screen.text, screen.required === null ? '' : screen.required,
    PP_mdlRuleText_(screen.show_if), screen.skip_if, screen.options.join(', '), screen.low_label,
    screen.high_label, screen.scale_hint, screen.body, screen.active, screen.next, PP_mdlJumpsText_(screen.jumps),
    screen.repeat];
}

/** A rule as the text that goes into the show_if column. */
function PP_mdlRuleText_(rule) {
  if (!rule) return '';
  if (PP_mdlHas_(rule, 'unreadable')) return PP_mdlText_(rule.unreadable);
  return JSON.stringify(rule);
}

function PP_mdlNewsRows_(news, codes) {
  const rows = [];
  Object.keys(news).forEach(roundId => {
    news[roundId].forEach((bullet, index) => {
      rows.push([roundId, index + 1].concat(codes.map(code => bullet[code])));
    });
  });
  return rows;
}

function PP_mdlClipRows_(clips) {
  const rows = [];
  Object.keys(clips).forEach(key => {
    Object.keys(clips[key]).forEach(lang => rows.push([key, lang, clips[key][lang]]));
  });
  return rows;
}

/** Google Sheets cannot keep more than 50,000 characters in a cell: say so before writing anything. */
function PP_mdlCheckCellSizes_(table) {
  table.rows.forEach(row => row.forEach(value => {
    if (typeof value === 'string' && value.length > PP_MDL_MAX_CELL_CHARS_) {
      throw new Error('One entry for the "' + table.tab + '" tab is ' + value.length + ' characters long, more than ' +
        'Google Sheets can keep in one cell (' + PP_MDL_MAX_CELL_CHARS_ + '). It starts with: "' + value.slice(0, 60) +
        '...". Shorten it and save again. Nothing was saved.');
    }
  }));
}

/**
 * Step 1 for one tab, WITHOUT changing anything: finds the tab (null when it
 * must be created), reads what is in it, works out where each heading is or
 * will go, and builds the lines to write.
 */
function PP_mdlPlanTable_(ss, table) {
  const sheet = PP_mdlFindTab_(ss, table.tab);
  const grid = sheet ? PP_mdlReadGrid_(sheet, table.tab) : [];
  const lastCol = grid.length ? grid[0].length : 0;
  const placed = PP_mdlPlaceHeaders_(table, grid.length ? grid[0] : [], lastCol);
  const span = PP_mdlSpan_(table.headers.map(header => placed.columnOf[header]));
  return {
    table: table,
    sheet: sheet,
    lastRow: grid.length,
    lastCol: lastCol,
    columnOf: placed.columnOf,
    newHeaders: placed.missing,
    firstNew: placed.first,
    span: span,
    lines: PP_mdlBuildLines_(table, placed.columnOf, span, grid),
    settingsMoved: PP_mdlSettingsMoved_(table, grid)
  };
}

/**
 * The tab with exactly this name, or null when there is none yet (it is then
 * created in step 2). A tab whose name differs only in capital letters or
 * spaces ("texts") would stop Google from creating the right one half-way
 * through a save, so that is refused here, before anything is written.
 */
function PP_mdlFindTab_(ss, tab) {
  const sheet = ss.getSheetByName(tab);
  if (sheet) return sheet;
  const lookalike = ss.getSheets().map(other => other.getName())
    .filter(name => PP_mdlTrim_(name).toLowerCase() === tab.toLowerCase())[0];
  if (lookalike === undefined) return null;
  throw new Error('There is a tab called "' + lookalike + '", but it must be called "' + tab + '" exactly ' +
    '(capital letters and spaces matter). Rename that tab to "' + tab + '" (double-click its name at the ' +
    'bottom of the Sheet), then save again. Nothing was changed.');
}

/** Everything in a tab as a grid of values (empty grid for an empty tab). Runs before anything is written. */
function PP_mdlReadGrid_(sheet, tab) {
  try {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    return lastRow > 0 && lastCol > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
  } catch (err) {
    throw new Error('Could not read the "' + tab + '" tab before saving (Google Sheets said: "' +
      PP_mdlErrorText_(err) + '"). Nothing was changed. Try again in a minute.');
  }
}

/**
 * Heading -> column number (from 1). Headings that are missing go after the
 * last used column, so no existing column ever moves. Nothing is written here.
 */
function PP_mdlPlaceHeaders_(table, headerRow, lastCol) {
  const columns = PP_mdlHeaderColumns_(headerRow);
  const columnOf = {};
  const missing = [];
  table.headers.forEach(header => {
    const name = header.toLowerCase();
    if (PP_mdlHas_(columns, name)) columnOf[header] = columns[name] + 1;
    else missing.push(header);
  });
  missing.forEach((header, n) => { columnOf[header] = lastCol + 1 + n; });
  return { columnOf: columnOf, missing: missing, first: lastCol + 1 };
}

/** Step 2 for one tab: carries out its plan (see PP_writeModel for the order of the steps). */
function PP_mdlWritePlan_(ss, plan) {
  const sheet = plan.sheet || PP_mdlCreateTab_(ss, plan.table.tab);
  const count = plan.lines.length;
  PP_mdlEnsureSize_(sheet, plan, count + 1, plan.span.last);
  if (plan.newHeaders.length) {
    sheet.getRange(1, plan.firstNew, 1, plan.newHeaders.length).setValues([plan.newHeaders.map(PP_mdlCell_)]);
    PP_mdlStyleHeader_(sheet, plan.firstNew, plan.newHeaders.length);
  }
  // New rows first, left-overs second: if Google fails in between, the tab still has every row.
  if (count) sheet.getRange(2, plan.span.first, count, plan.span.width).setValues(plan.lines);
  if (plan.lastRow > count + 1) {
    sheet.getRange(count + 2, plan.span.first, plan.lastRow - count - 1, plan.span.width).clearContent();
  }
  PP_mdlApplyChecks_(sheet, plan.table, plan.columnOf, count, !plan.sheet || plan.settingsMoved);
}

/** Creates a missing tab, coloured like the other questionnaire tabs (the colour is only cosmetic). */
function PP_mdlCreateTab_(ss, tab) {
  const sheet = ss.insertSheet(tab);
  try {
    sheet.setTabColor(tab === 'Rounds' ? PP_MDL_TAB_COLOURS_.operations : PP_MDL_TAB_COLOURS_.config);
  } catch (err) {
    console.log('Partner Pulse: could not colour the new tab ' + tab + ': ' + err);
  }
  return sheet;
}

/**
 * Adds empty rows at the bottom and empty columns on the right when the tab
 * is too small for what is about to be written. Google is only asked for the
 * tab's size when the part already in use is smaller than what is needed.
 */
function PP_mdlEnsureSize_(sheet, plan, rows, cols) {
  if (rows > plan.lastRow) {
    const maxRows = sheet.getMaxRows();
    if (rows > maxRows) sheet.insertRowsAfter(maxRows, rows - maxRows);
  }
  if (cols > plan.lastCol) {
    const maxCols = sheet.getMaxColumns();
    if (cols > maxCols) sheet.insertColumnsAfter(maxCols, cols - maxCols);
  }
}

/** Bold, light purple, frozen: like every heading row (only cosmetic, so a failure is just logged). */
function PP_mdlStyleHeader_(sheet, first, count) {
  try {
    const range = sheet.getRange(1, first, 1, count);
    range.setFontWeight('bold');
    range.setBackground(PP_MDL_HEADER_COLOUR_);
    sheet.setFrozenRows(1);
  } catch (err) {
    console.log('Partner Pulse: could not style the new headings: ' + err);
  }
}

/** The block of columns from the first to the last known heading. */
function PP_mdlSpan_(columns) {
  const first = Math.min.apply(null, columns);
  const last = Math.max.apply(null, columns);
  return { first: first, last: last, width: last - first + 1 };
}

/**
 * The rows to write, covering the whole block of known columns. A column of
 * yours that sits inside that block keeps its value for the same item (for
 * example the same text key), wherever that item moves.
 */
function PP_mdlBuildLines_(table, columnOf, span, grid) {
  const known = {};   // column number -> position of its heading in table.headers
  table.headers.forEach((header, index) => { known[columnOf[header]] = index; });
  const extra = [];
  for (let col = span.first; col <= span.last; col++) {
    if (!PP_mdlHas_(known, col)) extra.push(col);
  }
  const oldRows = extra.length ? PP_mdlOldRowsByIdentity_(table, grid) : {};
  const counter = {};
  return table.rows.map(values => {
    const line = [];
    for (let col = span.first; col <= span.last; col++) {
      line.push(PP_mdlHas_(known, col) ? PP_mdlCell_(values[known[col]]) : '');
    }
    if (extra.length) {
      const identity = PP_mdlIdentity_(table.tab, header => values[table.headers.indexOf(header)], counter);
      const old = PP_mdlHas_(oldRows, identity) ? oldRows[identity] : null;
      extra.forEach(col => { line[col - span.first] = old ? PP_mdlCell_(old[col - 1]) : ''; });
    }
    return line;
  });
}

/** What identifies a row ("q.nps", "payments/late", ...), plus "#2" for its second appearance. */
function PP_mdlIdentity_(tab, valueOf, counter) {
  const base = '#' + PP_MDL_ROW_IDENTITY_[tab].map(header => PP_mdlTrim_(valueOf(header))).join('|');
  counter[base] = (PP_mdlHas_(counter, base) ? counter[base] : 0) + 1;
  return base + '#' + counter[base];
}

function PP_mdlOldRowsByIdentity_(table, grid) {
  const out = {};
  if (grid.length < 2) return out;
  const columns = PP_mdlHeaderColumns_(grid[0]);
  const counter = {};
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const identity = PP_mdlIdentity_(table.tab, header => (PP_mdlHas_(columns, header) ? row[columns[header]] : ''), counter);
    if (!PP_mdlHas_(out, identity)) out[identity] = row;
  }
  return out;
}

/**
 * What a cell should hold. Text gets a leading apostrophe: Google Sheets then
 * keeps it exactly as text (the apostrophe itself is not stored), so
 * "2026-10-21", "007" or "=..." never become a date, a number or a formula.
 * (Code.gs writes text the same way.)
 */
function PP_mdlCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return isFinite(value) ? value : '';
  if (PP_mdlIsDate_(value)) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text === '' ? '' : "'" + text;
}

/** True when the Settings tab's rows were in a different order (or missing) before this write. */
function PP_mdlSettingsMoved_(table, grid) {
  if (table.tab !== 'Settings') return false;
  const columns = PP_mdlHeaderColumns_(grid.length ? grid[0] : []);
  if (!PP_mdlHas_(columns, 'setting')) return true;
  const before = grid.slice(1).map(row => PP_mdlTrim_(row[columns.setting]));
  return PP_SETTINGS_SCHEMA.some((entry, index) => before[index] !== entry.key);
}

/**
 * Tick boxes for on/off columns and a TRUE / FALSE list for "required". These
 * only make the tab easier to use (the values are already saved), so a
 * failure here is logged and never stops the save. Skipped when Google
 * Sheets is not available (local tests).
 */
function PP_mdlApplyChecks_(sheet, table, columnOf, count, settingsMoved) {
  if (!count || typeof SpreadsheetApp === 'undefined' || !SpreadsheetApp ||
    typeof SpreadsheetApp.newDataValidation !== 'function') return;
  try {
    if (table.tab === 'Settings') {
      if (settingsMoved) PP_mdlApplySettingChecks_(sheet, columnOf.value);
      return;
    }
    if (PP_mdlHas_(columnOf, 'active')) {
      sheet.getRange(2, columnOf.active, count, 1).setDataValidation(PP_mdlCheckboxRule_());
    }
    if (PP_mdlHas_(columnOf, 'required')) {
      sheet.getRange(2, columnOf.required, count, 1).setDataValidation(PP_mdlListRule_(['TRUE', 'FALSE'],
        'TRUE = partners must answer. FALSE = they can skip. Empty = the usual for this kind of screen.'));
    }
  } catch (err) {
    console.log('Partner Pulse: could not add tick boxes or lists to the ' + table.tab + ' tab: ' + err);
  }
}

/** Settings: a tick box for every on/off setting and a list for every choice. */
function PP_mdlApplySettingChecks_(sheet, valueColumn) {
  PP_SETTINGS_SCHEMA.forEach((entry, index) => {
    const cell = sheet.getRange(index + 2, valueColumn, 1, 1);
    if (entry.type === 'bool') cell.setDataValidation(PP_mdlCheckboxRule_());
    else if (entry.type === 'choice') cell.setDataValidation(PP_mdlListRule_(entry.options, PP_mdlChoiceHelp_(entry)));
    else cell.setDataValidation(null);
  });
}

/** 'Pick one: after_all_ratings (After all the area ratings) or immediate (Straight after each low rating).' */
function PP_mdlChoiceHelp_(entry) {
  return 'Pick one: ' + PP_mdlWordList_(entry.options.map(option => {
    const name = PP_mdlOptionName_(entry, option);
    return name === option ? option : option + ' (' + name + ')';
  }), 'or') + '.';
}

/** Wrong values get a small red corner instead of being refused, so the script can always write. */
function PP_mdlCheckboxRule_() {
  return SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(true).build();
}

function PP_mdlListRule_(values, help) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true)
    .setHelpText(help).build();
}


// =============================================================================
// 7. Compiling: the model becomes the published document (PP_compile)
// =============================================================================

/**
 * The document partners' phones download (contract section 7). stamp =
 * { version, published_at, published_by, note } when publishing, or null for
 * a draft / Preview. Hidden items are always left out. The same model always
 * gives the same document (apart from the stamp). Its survey.flow is the
 * route as a graph (format pp-flow/1), made by Flow.gs from the Screens rows.
 * flowNotes (optional, a list): receives what Flow.gs had to say while
 * making the route ({ code, node, row, message }; PP_validate reports them).
 */
function PP_compile(model, stamp, flowNotes) {
  const tidy = PP_normalizeModel(model);
  const codes = PP_mdlLanguageCodes_(tidy.languages, true);
  const configVersion = stamp ? 'p' + stamp.version + '-' + PP_dateIST(stamp.published_at) : 'draft';
  return {
    format: 1,
    version: stamp ? stamp.version : null,
    config_version: configVersion,
    published_at: stamp ? PP_mdlIsoTime_(stamp.published_at) : null,
    published_by: stamp ? PP_mdlText_(stamp.published_by) : null,
    note: stamp ? PP_mdlText_(stamp.note) : null,
    survey: PP_mdlCompileSurvey_(tidy, configVersion, flowNotes),
    strings: PP_mdlCompileStrings_(tidy, codes),
    whats_changed: PP_mdlCompileNews_(tidy, codes),
    clips: PP_mdlCompileClips_(tidy, codes)
  };
}

function PP_mdlIsoTime_(value) {
  if (PP_mdlIsDate_(value)) return isNaN(value.getTime()) ? '' : value.toISOString();
  return PP_mdlText_(value);
}

/** The "survey" part: the same structure as web/config/survey.json, without backend addresses and links. */
function PP_mdlCompileSurvey_(model, configVersion, flowNotes) {
  const settings = PP_mdlSettingsTree_(model.settings);
  const survey = {
    survey_id: PP_mdlTypedSetting_(PP_mdlSettingEntry_('survey_id'), model.settings.survey_id),
    config_version: configVersion,
    branding: settings.branding,
    backend: settings.backend,
    languages: model.languages.filter(l => l.active && l.code).map(l => ({ code: l.code, bcp47: l.bcp47, native_name: l.native_name })),
    default_language: model.settings.default_language,
    fallback_language: model.settings.fallback_language,
    navigation: settings.navigation,
    rating: settings.rating,
    deep_dive: settings.deep_dive,
    functions: PP_mdlCompileAreas_(model),
    support: Object.assign({ items: model.support.filter(s => s.active).map(s => s.code) }, settings.support),
    voice: settings.voice,
    text: settings.text,
    read_aloud: settings.read_aloud,
    whats_changed: settings.whats_changed,
    telemetry: settings.telemetry
  };
  // A settings group added to the schema later still reaches the form.
  Object.keys(settings).forEach(name => {
    if (!PP_mdlHas_(survey, name)) survey[name] = settings[name];
  });
  survey.flow = PP_mdlCompileFlow_(model, survey, flowNotes);
  return survey;
}

/** Every dotted setting ("voice.max_seconds") as nested groups, with proper types. */
function PP_mdlSettingsTree_(settings) {
  const tree = {};
  PP_SETTINGS_SCHEMA.forEach(entry => {
    if (entry.key.indexOf('.') === -1) return;   // survey_id, the languages and form_url are placed by hand
    PP_mdlSetPath_(tree, entry.key, PP_mdlTypedSetting_(entry, settings[entry.key]));
  });
  return tree;
}

function PP_mdlCompileAreas_(model) {
  return model.areas.filter(area => area.active && area.id).map(area => {
    const out = {
      id: area.id,
      issues: model.chips.filter(chip => chip.active && chip.code && chip.area === area.id).map(chip => chip.code)
    };
    if (PP_mdlIsNumber_(area.threshold)) out.threshold = area.threshold;
    return out;
  });
}

/**
 * The route partners walk: Flow.gs (PP.flowPanel.fromRows) builds the old
 * list from the screens partners see (in order, only the fields that are
 * filled in, exactly as this file always did), lets the form's own converter
 * turn it into the graph, and adds next, jumps and repeat. Without those
 * three columns the graph is exactly what phones make of the old list.
 * survey = the survey being compiled (its settings decide the problem-screen
 * mode). flowNotes (optional): receives Flow.gs's notes, see PP_compile.
 */
function PP_mdlCompileFlow_(model, survey, flowNotes) {
  const result = PP_mdlFlowLib_().flowPanel.fromRows(model.screens, survey,
    { nameOf: (screen, index) => PP_mdlQuestionName_(model, screen, index) });
  if (Array.isArray(flowNotes)) result.warnings.forEach(note => flowNotes.push(note));
  return result.graph;
}

/**
 * The route code of Flow.gs ({ flow, flowPanel, ... }), or a plain message
 * when that fifth file was never pasted into the Apps Script project.
 */
function PP_mdlFlowLib_() {
  if (typeof PP_flowLib_ !== 'function') {
    throw new Error('The script file "Flow" is missing from the Apps Script project, so the questions\' route ' +
      'cannot be made. In the Sheet: Extensions > Apps Script > + > Script, name it Flow, paste the whole of ' +
      'apps-script/Flow.gs from the GitHub project into it and save. Then try again.');
  }
  return PP_flowLib_();
}

/** True for a route in the graph format (pp-flow/1), false for the old list. */
function PP_mdlIsGraph_(flow) {
  return PP_mdlIsObject_(flow) && flow.format === 'pp-flow/1';
}

function PP_mdlCompileStrings_(model, codes) {
  const out = {};
  Object.keys(model.texts).forEach(key => { out[key] = PP_mdlFillLanguages_(model.texts[key], codes); });
  return out;
}

/**
 * One value per language that is switched on. A missing or empty translation
 * becomes "[TRANSLATE] " + the English, so the form shows English instead.
 */
function PP_mdlFillLanguages_(values, codes) {
  const english = PP_mdlText_(values.en);
  const out = {};
  codes.forEach(code => {
    const value = PP_mdlText_(values[code]);
    out[code] = code === 'en' || PP_mdlIsFilled_(value) ? value : PP_MDL_TAG_ + ' ' + english;
  });
  return out;
}

function PP_mdlCompileNews_(model, codes) {
  const out = {};
  Object.keys(model.whats_changed).forEach(roundId => {
    out[roundId] = { title: null, items: model.whats_changed[roundId].map(bullet => PP_mdlFillLanguages_(bullet, codes)) };
  });
  return out;
}

function PP_mdlCompileClips_(model, codes) {
  const out = {};
  Object.keys(model.clips).forEach(key => {
    const clips = {};
    Object.keys(model.clips[key]).forEach(lang => {
      if (codes.indexOf(lang) !== -1) clips[lang] = model.clips[key][lang];
    });
    if (Object.keys(clips).length) out[key] = clips;
  });
  return out;
}

/**
 * The published content without its stamp (version, date, author, note), as
 * one text in a fixed order, so two of them can be compared with === to see
 * whether the draft differs from the live version. Accepts a model (it is
 * compiled first) or an already published document.
 */
function PP_compileForCompare(modelOrDoc) {
  const doc = PP_mdlIsCompiledDoc_(modelOrDoc) ? PP_mdlCopy_(modelOrDoc) : PP_compile(modelOrDoc, null);
  ['version', 'config_version', 'published_at', 'published_by', 'note'].forEach(name => { delete doc[name]; });
  if (PP_mdlIsObject_(doc.survey)) delete doc.survey.config_version;
  // A version published as the old list compares as the graph phones make of
  // it: changing only the format is not a change partners would see.
  if (PP_mdlIsObject_(doc.survey) && Array.isArray(doc.survey.flow)) {
    doc.survey.flow = PP_mdlFlowLib_().flow.fromLegacy(doc.survey);
  }
  // A round with no "What changed" bullets shows partners nothing, exactly
  // like a round that isn't there: a new, empty round is not a change.
  if (PP_mdlIsObject_(doc.whats_changed)) {
    Object.keys(doc.whats_changed).forEach(roundId => {
      const news = doc.whats_changed[roundId];
      if (!PP_mdlIsObject_(news) || !Array.isArray(news.items) || !news.items.length) delete doc.whats_changed[roundId];
    });
  }
  return PP_mdlCanonicalJson_(doc);
}

/** True when publishing the draft would change what partners see (always true when nothing is live). */
function PP_draftDiffersFromLive(model, liveDoc) {
  if (!PP_mdlIsCompiledDoc_(liveDoc)) return true;
  return PP_compileForCompare(model) !== PP_compileForCompare(liveDoc);
}

function PP_mdlIsCompiledDoc_(value) {
  return PP_mdlIsObject_(value) && PP_mdlHas_(value, 'format') && PP_mdlIsObject_(value.survey);
}

/** JSON with the names of every group sorted, so the order things were typed in never matters. */
function PP_mdlCanonicalJson_(value) {
  if (Array.isArray(value)) return '[' + value.map(PP_mdlCanonicalJson_).join(',') + ']';
  if (PP_mdlIsObject_(value)) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + PP_mdlCanonicalJson_(value[key])).join(',') + '}';
  }
  return JSON.stringify(value === undefined ? null : value);
}


// =============================================================================
// 8. Checking (PP_validate)
// =============================================================================

/**
 * Checks a model (contract section 9). Returns
 *   { errors: [issue], warnings: [issue], summary }
 * where issue = { section, ref, message }. Errors block Publish; warnings never
 * do. "ref" points at the item, for the control panel's "Go there": a setting
 * ("Settings > voice.max_seconds"), a code ("payments",
 * "payments/payout_delayed", "ta"), a text key, a round ("2026-R1" or
 * "2026-R1 item 2") or a screen ("screen 4", counted from 1; live codes that
 * are gone use the code itself). The message is for people: it names things
 * the way the control panel shows them ("question 4" followed by its English
 * text, areas, problems and support questions by their English labels,
 * languages by their English names) and mentions codes only in brackets at
 * the end. liveDoc = the live published document, or null. everLive
 * (optional) = every code partners have answered under since the first real
 * round (Code.gs keeps it in the Script Property CODES_EVER_LIVE), or null.
 */
function PP_validate(model, liveDoc, everLive) {
  const tidy = PP_normalizeModel(model);
  const ctx = PP_mdlCheckContext_(tidy);
  const report = PP_mdlNewReport_();
  const flowNotes = [];
  const compiled = PP_compile(tidy, null, flowNotes);
  ctx.flowGraph = compiled.survey.flow;
  PP_mdlCheckSettings_(tidy, ctx, report);
  PP_mdlCheckLanguages_(tidy, ctx, report);
  PP_mdlCheckAreas_(tidy, ctx, report);
  PP_mdlCheckChips_(tidy, ctx, report);
  PP_mdlCheckSupport_(tidy, ctx, report);
  PP_mdlCheckScreens_(tidy, ctx, report);
  PP_mdlReportFlowNotes_(flowNotes, report);
  PP_mdlCheckRules_(tidy, ctx, report);
  PP_mdlCheckTexts_(tidy, ctx, report);
  PP_mdlCheckNews_(tidy, ctx, report);
  PP_mdlCheckClips_(tidy, ctx, report);
  PP_mdlCheckRounds_(tidy, report);
  PP_mdlCheckLiveCodes_(tidy, liveDoc, report, everLive);
  PP_mdlCheckEverLiveSize_(everLive, report);
  const compiledChars = JSON.stringify(compiled).length;
  if (compiledChars > PP_MDL_MAX_COMPILED_CHARS_) {
    report.error('texts', '', 'The published questionnaire would be ' + compiledChars + ' characters long, more than ' +
      'the limit of ' + PP_MDL_MAX_COMPILED_CHARS_ + '. Partners download it on slow mobile data. Delete texts ' +
      'nothing uses, or shorten very long texts.');
  }
  return { errors: report.errors, warnings: report.warnings, summary: PP_mdlSummary_(tidy, ctx, compiledChars) };
}

function PP_mdlNewReport_() {
  const report = { errors: [], warnings: [] };
  report.error = (section, ref, message) => { report.errors.push({ section: section, ref: ref, message: message }); };
  report.warn = (section, ref, message) => { report.warnings.push({ section: section, ref: ref, message: message }); };
  return report;
}

/** Look-ups the checks need: languages switched on, areas, problems, screens by code, ... */
function PP_mdlCheckContext_(model) {
  const ctx = {
    model: model,
    codes: PP_mdlLanguageCodes_(model.languages, true),
    allCodes: PP_mdlLanguageCodes_(model.languages, false),
    fallback: PP_mdlTrim_(model.settings.fallback_language),
    areaIds: {},
    activeAreas: {},
    areaChips: {},
    activeSupport: [],
    byId: {},
    firstActive: {},
    roundIds: {}
  };
  model.areas.forEach(area => {
    if (!area.id || !PP_mdlSafeKey_(area.id)) return;
    ctx.areaIds[area.id] = true;
    if (!area.active) return;
    ctx.activeAreas[area.id] = true;
    if (!PP_mdlHas_(ctx.areaChips, area.id)) ctx.areaChips[area.id] = [];
  });
  model.chips.forEach(chip => {
    const list = chip.active && chip.code && PP_mdlHas_(ctx.areaChips, chip.area) ? ctx.areaChips[chip.area] : null;
    if (list && list.indexOf(chip.code) === -1) list.push(chip.code);
  });
  model.support.forEach(item => {
    if (item.active && ctx.activeSupport.indexOf(item.code) === -1) ctx.activeSupport.push(item.code);
  });
  model.screens.forEach((screen, index) => {
    if (screen.id && PP_mdlSafeKey_(screen.id) && !PP_mdlHas_(ctx.byId, screen.id)) ctx.byId[screen.id] = index;
    if (screen.active && screen.type && PP_mdlSafeKey_(screen.type) && !PP_mdlHas_(ctx.firstActive, screen.type)) {
      ctx.firstActive[screen.type] = index;
    }
  });
  model.rounds.forEach(round => {
    if (PP_mdlSafeKey_(round.id)) ctx.roundIds[round.id] = true;
  });
  return ctx;
}

// ---- How messages name things ----------------------------------------------------

/** The English of a text, on one line and shortened ('' when the text or its English is missing). */
function PP_mdlEnglishOf_(model, key) {
  if (!PP_mdlIsFilled_(key) || !PP_mdlHas_(model.texts, key)) return '';
  return PP_mdlShorten_(model.texts[key].en);
}

/**
 * 'question 3 ("How likely are you to recommend Valmo to another DC owner?")':
 * the screen's place in the list (as the control panel counts it) and its
 * English text, or its kind when it has no text ('question 4 (Area ratings)').
 */
function PP_mdlQuestionName_(model, screen, index) {
  const place = 'question ' + (index + 1);
  const text = PP_mdlEnglishOf_(model, screen.text);
  if (text) return place + ' ("' + text + '")';
  const type = PP_mdlScreenType_(screen.type);
  return type ? place + ' (' + type.label + ')' : place;
}

/**
 * 'the area "Payments / Payouts"' (its English name), or 'area 2' (its place
 * in the list) when it has no name yet. index = its place, or -1 to look it up.
 */
function PP_mdlAreaName_(model, id, index) {
  const name = PP_mdlEnglishOf_(model, 'fn.' + id + '.name');
  if (name) return 'the area "' + name + '"';
  let place = index;
  if (place < 0) model.areas.forEach((area, n) => { if (place < 0 && area.id === id) place = n; });
  return place >= 0 ? 'area ' + (place + 1) : 'an area that does not exist';
}

/** 'the problem "Payout delayed"' (its English label), or 'problem 3 of the area "Payments / Payouts"'. */
function PP_mdlChipName_(model, chip, index) {
  const label = PP_mdlEnglishOf_(model, 'issue.' + chip.area + '.' + chip.code);
  if (label) return 'the problem "' + label + '"';
  if (!model.areas.some(area => area.id === chip.area)) return 'a problem';
  return 'problem ' + PP_mdlChipPlace_(model, index) + ' of ' + PP_mdlAreaName_(model, chip.area, -1);
}

/** A problem's place within its own area (1 = the first problem of that area). */
function PP_mdlChipPlace_(model, index) {
  const area = model.chips[index].area;
  return model.chips.slice(0, index + 1).filter(chip => chip.area === area).length;
}

/** 'the support question "Kept me updated"' (its English label), or 'support question 4'. */
function PP_mdlSupportName_(model, item, index) {
  const label = PP_mdlEnglishOf_(model, 'support.' + item.code);
  return label ? 'the support question "' + label + '"' : 'support question ' + (index + 1);
}

/** ' (Its code is "One Fix"; "one_fix" would work.)': ends a message about a code that is not allowed. */
function PP_mdlBadCodeNote_(code, taken) {
  return ' (Its code is ' + PP_mdlShow_(code) + '; "' + PP_slug(code, taken) + '" would work.)';
}

/** 'Tamil' (its English name), or 'language 7 (ᱥᱟᱱᱛᱟᱲᱤ)' / 'language 7' for one without an English name. */
function PP_mdlLanguageLabel_(language, index) {
  if (PP_mdlHas_(PP_MDL_LANGUAGE_NAMES_, language.code)) return PP_MDL_LANGUAGE_NAMES_[language.code];
  return 'language ' + (index + 1) + (language.native_name ? ' (' + language.native_name + ')' : '');
}

// ---- Settings and languages --------------------------------------------------

function PP_mdlCheckSettings_(model, ctx, report) {
  PP_SETTINGS_SCHEMA.forEach(entry => {
    const value = model.settings[entry.key];
    const problem = PP_mdlSettingProblem_(entry, value) || PP_mdlSettingContextProblem_(entry, value, model, ctx);
    if (problem) report.error('settings', 'Settings > ' + entry.key, problem);
  });
  const shortest = model.settings['voice.min_seconds'];
  const longest = model.settings['voice.max_seconds'];
  const bothFine = !PP_mdlSettingProblem_(PP_mdlSettingEntry_('voice.min_seconds'), shortest) &&
    !PP_mdlSettingProblem_(PP_mdlSettingEntry_('voice.max_seconds'), longest);
  if (bothFine && shortest >= longest) {
    report.error('settings', 'Settings > voice.min_seconds', 'The shortest voice note (' + shortest + ' seconds) ' +
      'must be shorter than the longest voice note (' + longest + ' seconds), otherwise every voice note would be ' +
      'thrown away.');
  }
}

/** Checks that need the rest of the model: languages must be switched on, the comment text must exist. */
function PP_mdlSettingContextProblem_(entry, value, model, ctx) {
  if (entry.type === 'lang' && ctx.codes.indexOf(value) === -1) {
    const on = ctx.codes.map(code => PP_mdlLanguageName_(code, model));
    return PP_mdlSettingName_(entry) + ' must be a language that is switched on' +
      (on.length ? ': ' + PP_mdlWordList_(on, 'or') : '') + '. ' + PP_mdlLanguageNow_(value, model, ctx);
  }
  if (entry.key === 'support.comment_text' && model.settings['support.allow_comment'] === true &&
    !PP_mdlHas_(model.texts, PP_mdlText_(value))) {
    return PP_mdlSettingName_(entry) + ' names a text that is not in Texts & translations. Add that text, choose ' +
      'an existing one, or switch the comment box off. (The missing text is called ' + PP_mdlShow_(value) + '.)';
  }
  return '';
}

/** 'Right now it is Tamil, which is switched off.' */
function PP_mdlLanguageNow_(value, model, ctx) {
  if (!PP_mdlIsFilled_(value)) return 'Right now it is empty.';
  const listed = ctx.allCodes.indexOf(value) !== -1;
  const name = listed || PP_mdlHas_(PP_MDL_LANGUAGE_NAMES_, value) ? PP_mdlLanguageName_(value, model) : PP_mdlShow_(value);
  return 'Right now it is ' + name + ', which is ' + (listed ? 'switched off.' : 'not in the language list.');
}

function PP_mdlCheckLanguages_(model, ctx, report) {
  const seen = {};
  model.languages.forEach((language, index) => {
    const ref = language.code || ('language ' + (index + 1));
    const name = PP_mdlCapital_(PP_mdlLanguageLabel_(language, index));
    if (!language.code) {
      report.error('languages', ref, name + ' has no code. Add the 2 or 3 lowercase letters that stand for the ' +
        'language. (For example "ta" for Tamil.)');
    } else if (!PP_MDL_LANG_RE_.test(language.code)) {
      report.error('languages', ref, 'The code of ' + PP_mdlLanguageLabel_(language, index) + ' is not allowed: use ' +
        'the 2 or 3 lowercase letters that stand for the language. (Right now it is ' + PP_mdlShow_(language.code) +
        '; for example "ta" stands for Tamil.)');
    } else if (PP_mdlHas_(seen, language.code)) {
      report.error('languages', ref, name + ' is listed twice in the language list. Each language may appear only ' +
        'once: delete one of them. (Its code is "' + language.code + '".)');
    }
    if (PP_mdlSafeKey_(language.code)) seen[language.code] = true;
    if (!language.bcp47) {
      report.error('languages', ref, name + ' needs its voice tag, such as "ta-IN": the phone uses it to find the ' +
        'read-aloud voice. (In the Languages tab it goes in the bcp47 column.)');
    } else if (!PP_MDL_BCP47_RE_.test(language.bcp47)) {
      report.warn('languages', ref, name + ': the voice tag "' + language.bcp47 + '" does not look like a language ' +
        'tag such as "ta-IN", so the phone may not find a read-aloud voice.');
    }
    if (!language.native_name) {
      report.error('languages', ref, name + ' needs its name written in its own script, such as "தமிழ்": it is ' +
        'shown on the language button. (In the Languages tab it goes in the native_name column.)');
    }
  });
  if (!ctx.codes.length) {
    report.error('languages', '', 'No language is switched on. Switch on at least one language (normally English).');
  }
  if (model.languages.length && ctx.allCodes.indexOf('en') === -1) {
    report.error('languages', 'en', 'English is not in the language list. Every text is written in English first ' +
      '(translators work from it), so add English back. It may stay switched off if partners should not see it. ' +
      '(Its code is "en".)');
  }
}

// ---- Areas, problems (chips) and support questions ---------------------------

function PP_mdlCheckAreas_(model, ctx, report) {
  const seen = {};
  model.areas.forEach((area, index) => {
    const ref = area.id || ('area ' + (index + 1));
    const name = PP_mdlAreaName_(model, area.id, index);
    if (!area.id) {
      report.error('areas', ref, PP_mdlCapital_(name) + ' has no code. Give it one: the data and the dashboard use ' +
        'it. (For example "payments".)');
    } else if (!PP_MDL_CODE_RE_.test(area.id)) {
      report.error('areas', ref, PP_mdlCapital_(name) + ' has a code that is not allowed: use ' + PP_MDL_CODE_RULE_ +
        '.' + PP_mdlBadCodeNote_(area.id, model.areas.map(other => other.id)));
    } else if (PP_mdlHas_(seen, area.id)) {
      report.error('areas', ref, PP_mdlCapital_(name) + ' is listed twice. Every area needs its own code, because ' +
        'the data and the dashboard use it: delete one of them, or give it another code. (Its code is "' +
        area.id + '".)');
    }
    if (PP_mdlSafeKey_(area.id)) seen[area.id] = true;
    const threshold = area.threshold;
    if (threshold !== null && !(PP_mdlIsWhole_(threshold) && threshold >= 1 && threshold <= 5)) {
      report.error('areas', ref, 'The low-rating number of ' + name + ' is ' + PP_mdlShow_(threshold) + '. Leave it ' +
        'empty to use the standard (' + PP_mdlShow_(model.settings['deep_dive.threshold']) + '), or use a whole ' +
        'number from 1 to 5.');
    }
  });
  if (PP_mdlHas_(ctx.firstActive, 'function_ratings') && !Object.keys(ctx.activeAreas).length) {
    report.error('areas', '', 'The area ratings screen is switched on, but no area is. Switch on at least one ' +
      'area, or hide the area ratings screen.');
  }
}

function PP_mdlCheckChips_(model, ctx, report) {
  const seen = {};
  model.chips.forEach((chip, index) => {
    const ref = (chip.area || '?') + '/' + (chip.code || 'problem ' + (index + 1));
    const name = PP_mdlChipName_(model, chip, index);
    if (!PP_mdlHas_(ctx.areaIds, chip.area)) PP_mdlReportLostChip_(model, ctx, chip, ref, name, report);
    const key = '#' + chip.area + '/' + chip.code;
    if (chip.code === 'other') {
      report.error('chips', ref, PP_mdlCapital_(name) + ' is an extra "Other" button. Delete it: the form adds the ' +
        'Other button to every area by itself. (Its code, "other", is kept for that button.)');
    } else if (!chip.code) {
      report.error('chips', ref, PP_mdlCapital_(name) + ' has no code. Give it one: the data and the dashboard use ' +
        'it. (For example "late_supply".)');
    } else if (!PP_MDL_CODE_RE_.test(chip.code)) {
      report.error('chips', ref, PP_mdlCapital_(name) + ' has a code that is not allowed: use ' + PP_MDL_CODE_RULE_ +
        '.' + PP_mdlBadCodeNote_(chip.code, model.chips.filter(other => other.area === chip.area).map(other => other.code)));
    } else if (PP_mdlHas_(seen, key)) {
      report.error('chips', ref, PP_mdlCapital_(name) + ' is listed twice in ' + PP_mdlAreaName_(model, chip.area, -1) +
        '. Delete one of them. (Its code is "' + chip.code + '".)');
    }
    seen[key] = true;
  });
  const warned = {};
  model.areas.forEach((area, index) => {
    if (!area.active || !PP_mdlHas_(ctx.areaChips, area.id) || PP_mdlHas_(warned, area.id)) return;
    warned[area.id] = true;
    const count = ctx.areaChips[area.id].filter(code => code !== 'other').length;
    if (count < 4 || count > 6) {
      report.warn('chips', area.id, PP_mdlCapital_(PP_mdlAreaName_(model, area.id, index)) + ' has ' +
        PP_mdlPlural_(count, 'problem') + ' switched on (plus Other). 4 to 6 works best: fewer gives partners too ' +
        'little choice, more is hard to read on a small phone.');
    }
  });
}

/** A problem whose area code matches no area. */
function PP_mdlReportLostChip_(model, ctx, chip, ref, name, report) {
  const best = PP_mdlClosest_(chip.area, Object.keys(ctx.areaIds), 0.7);
  const hint = best ? ' Did you mean "' + best + '" (' + PP_mdlAreaName_(model, best, -1) + ')?' : '';
  report.error('chips', ref, PP_mdlCapital_(name) + ' belongs to an area that does not exist. Move it to an ' +
    'existing area, or delete it. (Its area code is ' + PP_mdlShow_(chip.area) + ' and its own code is ' +
    PP_mdlShow_(chip.code) + '.' + hint + ')');
}

function PP_mdlCheckSupport_(model, ctx, report) {
  const seen = {};
  model.support.forEach((item, index) => {
    const name = PP_mdlCapital_(PP_mdlSupportName_(model, item, index));
    if (!PP_MDL_CODE_RE_.test(item.code)) {
      report.error('support', item.code, name + ' has a code that is not allowed: use ' + PP_MDL_CODE_RULE_ + '.' +
        PP_mdlBadCodeNote_(item.code, model.support.map(other => other.code)));
    } else if (PP_mdlHas_(seen, item.code)) {
      report.error('support', item.code, name + ' is listed twice. Delete one of them. (Its code is "' +
        item.code + '".)');
    }
    if (PP_mdlSafeKey_(item.code)) seen[item.code] = true;
  });
  if (PP_mdlHas_(ctx.firstActive, 'support_block') && !ctx.activeSupport.length) {
    report.warn('support', '', 'The support ratings screen is switched on, but no support question is, so that ' +
      'screen would be empty. Switch on at least one support question, or hide the screen.');
  }
}

// ---- Screens -------------------------------------------------------------------

/** Codes, types and built-in screens are checked for every screen; the rest only for screens partners see. */
function PP_mdlCheckScreens_(model, ctx, report) {
  const seenIds = {};
  const builtins = {};
  model.screens.forEach((screen, index) => {
    const ref = 'screen ' + (index + 1);
    const label = PP_mdlCapital_(PP_mdlQuestionName_(model, screen, index));
    const ids = model.screens.map(other => other.id);
    if (!screen.id) {
      report.error('screens', ref, label + ' has no code. Give it one: its answers are saved under it. (For ' +
        'example "' + PP_slug(PP_mdlEnglishOf_(model, screen.text) || screen.type || 'question', ids) + '".)');
    } else if (!PP_MDL_CODE_RE_.test(screen.id)) {
      report.error('screens', ref, label + ' has a code that is not allowed: use ' + PP_MDL_CODE_RULE_ + '.' +
        PP_mdlBadCodeNote_(screen.id, ids));
    } else if (PP_mdlHas_(seenIds, screen.id)) {
      const first = seenIds[screen.id];
      report.error('screens', ref, label + ' has the same code as ' + PP_mdlQuestionName_(model, model.screens[first],
        first) + '. Every question needs its own code, because its answers are saved under it: give one of them ' +
        'another code. (The code is "' + screen.id + '".)');
    } else {
      seenIds[screen.id] = index;
    }
    const type = PP_mdlScreenType_(screen.type);
    if (!type) {
      report.error('screens', ref, PP_mdlUnknownTypeMessage_(label, screen.type));
      return;
    }
    // Several thank-you screens are allowed: extra endings, reached by a jump (docs/flow-engine.md 9.1).
    if (type.builtin && screen.type !== 'thank_you' && PP_mdlHas_(builtins, screen.type)) {
      report.error('screens', ref, label + ': there is already a "' + type.label + '" screen (question ' +
        builtins[screen.type] + '). This kind of screen can appear only once: delete one of them.');
    } else if (type.builtin) {
      builtins[screen.type] = index + 1;
    }
    if (screen.active) PP_mdlCheckScreenFields_(model, screen, type, ref, label, report);
  });
  PP_mdlCheckScreenOrder_(model, ctx, report);
  PP_mdlCheckDataColumns_(model, report);
}

/**
 * Two questions fill their own columns of every round's answers sheet:
 * "nps" (the 0 to 10 score: column nps, which the dashboard's headline score
 * reads) and "support_gate" (did the partner contact support: column
 * support_contacted). The control panel never deletes them or changes their
 * codes (Pranav's decision, 21 Oct 2026). This warns when one went missing
 * anyway, for example after the Screens tab was edited by hand. Hiding
 * them is fine.
 */
function PP_mdlCheckDataColumns_(model, report) {
  [{ id: 'nps', column: 'nps', reader: ', which the dashboard\'s headline score reads' },
    { id: 'support_gate', column: 'support_contacted', reader: '' }].forEach(item => {
    if (model.screens.some(screen => screen.id === item.id)) return;
    report.warn('screens', '', 'The question with the code "' + item.id + '" is missing. Its answers fill the ' +
      item.column + ' column of every round\'s answers sheet' + item.reader + '. Undo the change, or add the ' +
      'question back with exactly that code.');
  });
}

function PP_mdlUnknownTypeMessage_(label, type) {
  const known = 'Known types: ' + PP_mdlTypeNames_().join(', ') + '.';
  if (!type) {
    return label + ' does not say what kind of screen it is. Fill in its type in the Screens tab, or delete it ' +
      'and add it again with "Add a question". (' + known + ')';
  }
  return label + ' is a kind of screen the form does not know. Correct its type in the Screens tab, or delete it ' +
    'and add it again with "Add a question". (Its type is ' + PP_mdlShow_(type) + '.' +
    PP_mdlDidYouMean_(type, PP_mdlTypeNames_()) + ' ' + known + ')';
}

function PP_mdlCheckScreenFields_(model, screen, type, ref, label, report) {
  if (type.needs_text && !screen.text) {
    report.error('screens', ref, label + ' has no question text. Choose or add one in the control panel. (In the ' +
      'Screens tab, the name of its text goes in the text_key column.)');
  }
  if (screen.type === 'single_choice') PP_mdlCheckOptions_(model, screen, ref, label, report);
  const allowed = PP_mdlHas_(PP_MDL_SKIP_IF_, screen.type) ? PP_MDL_SKIP_IF_[screen.type] : '';
  if (screen.skip_if && !allowed) {
    report.error('screens', ref, label + ' is set to be skipped, but only the language buttons and the "What ' +
      'changed" card can be skipped that way. Clear that setting. To show this question only to some partners, ' +
      'give it a rule ("Show this question only if…") instead. (In the Screens tab, its skip_if column says ' +
      PP_mdlShow_(screen.skip_if) + '.)');
  } else if (screen.skip_if && screen.skip_if !== allowed) {
    report.error('screens', ref, label + ' has a skip setting the form does not know. Choose "' +
      PP_MDL_SKIP_IF_NAMES_[allowed] + '", or switch skipping off. (In the Screens tab, its skip_if column must be "' +
      allowed + '" or empty; right now it is ' + PP_mdlShow_(screen.skip_if) + '.)');
  }
  if (screen.required !== null && typeof screen.required !== 'boolean') {
    report.error('screens', ref, label + ' has "required" set to ' + PP_mdlShow_(screen.required) + '. In the ' +
      'Screens tab, write TRUE (partners must answer), FALSE (they can skip) or leave it empty (the usual for this ' +
      'kind of question).');
  }
  // With one ending, a rule on it has no use; with several, a rule can choose between them.
  const endings = model.screens.filter(other => other.type === 'thank_you').length;
  if (screen.type === 'thank_you' && screen.show_if && endings === 1) {
    report.warn('screens', ref, label + ' has a rule ("Show this question only if…"), which has no use there: the ' +
      'form always ends with the thank-you screen. Remove the rule.');
  }
}

function PP_mdlCheckOptions_(model, screen, ref, label, report) {
  if (!screen.options.length) {
    report.error('screens', ref, label + ' is a "pick one" question with no answers to pick from. Add at least ' +
      'two. (Their labels are the texts choice.' + (screen.id || '<code>') + '.<answer code>.)');
    return;
  }
  const seen = [];
  screen.options.forEach(option => {
    if (!PP_MDL_CODE_RE_.test(option)) {
      report.error('screens', ref, label + ': one of its answers has a code that is not allowed: use ' +
        PP_MDL_CODE_RULE_ + '.' + PP_mdlBadCodeNote_(option, screen.options).replace('(Its code', '(The answer code'));
    } else if (seen.indexOf(option) !== -1) {
      const answer = PP_mdlEnglishOf_(model, 'choice.' + screen.id + '.' + option);
      report.error('screens', ref, label + ': ' + (answer ? 'the answer "' + answer + '"' : 'an answer') + ' is ' +
        'listed twice. Delete one of them. (Its code is "' + option + '".)');
    }
    seen.push(option);
  });
}

/**
 * The first thank-you screen is the main ending: it must exist and be shown.
 * Rows after it are other routes and endings, which partners reach only
 * through a jump (docs/flow-engine.md 9.1): a shown row there that no arrow
 * of the route can reach is never seen, so it is reported.
 */
function PP_mdlCheckScreenOrder_(model, ctx, report) {
  const thanks = [];
  model.screens.forEach((screen, index) => { if (screen.type === 'thank_you') thanks.push(index); });
  if (!thanks.length) {
    report.error('screens', '', 'There is no thank-you screen. Add one as the very last question: the answers are ' +
      'sent from it. (In the Screens tab its type is thank_you.)');
  } else {
    const at = thanks[0];
    if (!model.screens[at].active) {
      report.error('screens', 'screen ' + (at + 1), 'The thank-you screen (question ' + (at + 1) + ') is hidden. ' +
        'Show it again: the answers are sent from it.');
    }
    const reached = PP_mdlReachedIds_(ctx.flowGraph);
    const shown = [];
    const lost = [];
    model.screens.forEach((screen, index) => {
      if (index <= at || !screen.active) return;
      shown.push(index);
      if (!PP_mdlHas_(reached, '#' + screen.id)) lost.push(index);
    });
    if (lost.length && lost.length === shown.length) {
      const after = lost.length;
      report.error('screens', 'screen ' + (at + 1), 'The thank-you screen (question ' + (at + 1) + ') must be the ' +
        'last one, but ' + (after === 1 ? '1 question comes' : after + ' questions come') + ' after it, and no jump ' +
        'leads there, so partners never see ' + (after === 1 ? 'it' : 'them') + '. Move the thank-you screen to the ' +
        'end, or move ' + (after === 1 ? 'that question' : 'those questions') + ' above it.');
    } else {
      lost.forEach(index => {
        report.error('screens', 'screen ' + (index + 1), PP_mdlCapital_(PP_mdlQuestionName_(model, model.screens[index], index)) +
          ' comes after the thank-you screen (question ' + (at + 1) + '), but no jump leads to it, so partners never ' +
          'see it. Add a jump to it, move it above the thank-you screen, or hide it.');
      });
    }
  }
  const ratings = PP_mdlHas_(ctx.firstActive, 'function_ratings') ? ctx.firstActive.function_ratings : -1;
  const dives = PP_mdlHas_(ctx.firstActive, 'function_deep_dives') ? ctx.firstActive.function_deep_dives : -1;
  if (dives >= 0 && ratings < 0) {
    report.error('screens', 'screen ' + (dives + 1), 'The problem screens (question ' + (dives + 1) + ') ask about ' +
      'areas rated low, but the area ratings screen is missing or hidden, so nothing is ever rated. Add or show ' +
      'the area ratings screen above them.');
  } else if (dives >= 0 && dives < ratings) {
    report.error('screens', 'screen ' + (dives + 1), 'The problem screens (question ' + (dives + 1) + ') must come ' +
      'after the area ratings (question ' + (ratings + 1) + '): they depend on those ratings. Move them below.');
  }
}

/**
 * The codes of every screen some arrow of the route can reach from its start
 * ({ '#code': true }), whatever the answers: a skipped screen's arrow, every
 * jump and every default count. A group (problem screens straight after each
 * low rating) brings the screens inside it.
 */
function PP_mdlReachedIds_(graph) {
  const reached = {};
  if (!PP_mdlIsGraph_(graph)) return reached;
  const byId = {};
  PP_mdlList_(graph.nodes).forEach(node => { if (!PP_mdlHas_(byId, '#' + node.id)) byId['#' + node.id] = node; });
  const targets = next => {
    if (typeof next === 'string') return [next];
    return PP_mdlList_(next).map(entry => (PP_mdlHas_(entry, 'default') ? entry.default : entry.goto));
  };
  const todo = [graph.start];
  while (todo.length) {
    const id = todo.pop();
    if (typeof id !== 'string' || !PP_mdlHas_(byId, '#' + id) || PP_mdlHas_(reached, '#' + id)) continue;
    reached['#' + id] = true;
    const node = byId['#' + id];
    if (node.type === 'group' && PP_mdlIsObject_(node.body)) {
      PP_mdlList_(node.body.nodes).forEach(inner => {
        reached['#' + inner.id] = true;
        targets(inner.next).forEach(to => todo.push(to));   // a body arrow may leave the loop early
      });
    }
    targets(node.next).forEach(to => todo.push(to));
  }
  return reached;
}

/**
 * What Flow.gs said while it made the route from the rows (PP_compile's
 * flowNotes), as errors (PP_MDL_FLOW_ERRORS_) or warnings, at their row.
 */
function PP_mdlReportFlowNotes_(notes, report) {
  notes.forEach(note => {
    const ref = typeof note.row === 'number' && note.row >= 0 ? 'screen ' + (note.row + 1) : '';
    if (PP_mdlHas_(PP_MDL_FLOW_ERRORS_, note.code)) report.error('screens', ref, note.message);
    else report.warn('screens', ref, note.message);
  });
}

/** A warning when the list of codes partners have answered nears the 9 KB limit of one Script Property. */
function PP_mdlCheckEverLiveSize_(everLive, report) {
  if (!Array.isArray(everLive)) return;
  const size = JSON.stringify(everLive).length;
  if (size < PP_MDL_EVER_LIVE_WARN_CHARS_) return;
  report.warn('screens', '', 'The list of every code partners have answered under is ' + size + ' characters long; ' +
    'Google keeps at most about ' + PP_MDL_EVER_LIVE_MAX_CHARS_ + ' in one setting. When it is full, codes added after ' +
    'that are no longer protected. Ask whoever maintains the scripts to move the list (Script Property CODES_EVER_LIVE).');
}

// ---- Rules ("Show this question only if…") -------------------------------------

function PP_mdlCheckRules_(model, ctx, report) {
  model.screens.forEach((screen, index) => {
    if (!screen.active || !screen.show_if) return;
    const site = { index: index, ref: 'screen ' + (index + 1),
      label: PP_mdlCapital_(PP_mdlQuestionName_(model, screen, index)), report: report };
    PP_mdlCheckCondition_(screen.show_if, site, 'the rule', ctx);
  });
}

function PP_mdlRuleError_(site, where, text) {
  site.report.error('screens', site.ref, site.label + ': ' + where + ' ' + text);
}

function PP_mdlRuleWarning_(site, where, text) {
  site.report.warn('screens', site.ref, site.label + ': ' + where + ' ' + text);
}

/** One condition (and, through "all of these" / "any of these", the ones inside it). */
function PP_mdlCheckCondition_(cond, site, where, ctx) {
  if (!PP_mdlIsObject_(cond)) {
    PP_mdlRuleError_(site, where, 'is not a condition the form can read. Build it again with the rule builder. ' +
      '(Right now it is ' + PP_mdlShowJson_(cond) + '.)');
    return;
  }
  if (PP_mdlHas_(cond, 'unreadable')) {
    PP_mdlRuleError_(site, where, 'could not be read. Open this question in the control panel and build the rule ' +
      'again. (In the Screens tab, show_if says ' + PP_mdlShowJson_(PP_mdlText_(cond.unreadable)) + ', but it must ' +
      'be written like {"answer": "support_gate", "equals": "yes"}.)');
    return;
  }
  const names = Object.keys(cond).filter(name => name.charAt(0) !== '_');
  const combiners = names.filter(name => name === 'all' || name === 'any');
  if (combiners.length) {
    PP_mdlCheckCombined_(cond, names, combiners[0], site, where, ctx);
    return;
  }
  if (names.indexOf('answer') === -1) {
    PP_mdlRuleError_(site, where, 'does not say which earlier answer it tests. Pick one in the rule builder.');
    return;
  }
  const tests = names.filter(name => name !== 'answer');
  if (tests.length !== 1) {
    PP_mdlRuleError_(site, where, 'must have exactly one test for its answer, such as "is" or "is at most"; it has ' +
      tests.length + '. To combine tests, use "all of these" or "any of these".' +
      (tests.length ? ' (The tests it has: ' + tests.join(', ') + '.)' : ''));
    return;
  }
  const test = tests[0];
  if (PP_MDL_SHOW_IF_TESTS_.indexOf(test) === -1) {
    PP_mdlRuleError_(site, where, 'uses a test the form does not know. Use one of: ' + PP_mdlTestList_() + '. (It ' +
      'uses "' + test + '".' + PP_mdlDidYouMean_(test, PP_MDL_SHOW_IF_TESTS_) + ' In the Screens tab the tests are ' +
      'written ' + PP_mdlWordList_(PP_MDL_SHOW_IF_TESTS_, 'and') + '.)');
    return;
  }
  const answer = PP_mdlFindAnswer_(cond.answer, site, where, ctx);
  if (answer) PP_mdlCheckTestValue_(test, cond[test], answer, site, where);
}

/** '"is", "is not", ... or "was answered"' (the rule builder's words). */
function PP_mdlTestList_() {
  return PP_mdlOrList_(PP_MDL_SHOW_IF_TESTS_.map(test => PP_MDL_TEST_NAMES_[test]));
}

function PP_mdlCheckCombined_(cond, names, combiner, site, where, ctx) {
  const friendly = combiner === 'all' ? '"all of these"' : '"any of these"';
  if (names.length !== 1) {
    PP_mdlRuleError_(site, where, 'mixes ' + friendly + ' with other tests. Put the other tests inside its list, or ' +
      'build the rule again with the rule builder. (In the Screens tab: {"' + combiner + '": [test, test]}.)');
    return;
  }
  const parts = cond[combiner];
  if (!Array.isArray(parts) || !parts.length) {
    PP_mdlRuleError_(site, where, 'has an empty ' + friendly + ' group. Add at least one condition to it, or remove ' +
      'the rule.');
    return;
  }
  parts.forEach((part, n) => PP_mdlCheckCondition_(part, site, 'condition ' + (n + 1) + ' of ' + where, ctx));
}

/** Which earlier answer a condition tests. Returns what that answer can be, or null after saying why it cannot work. */
function PP_mdlFindAnswer_(ref, site, where, ctx) {
  if (!PP_mdlIsFilled_(ref)) {
    PP_mdlRuleError_(site, where, 'does not say which earlier answer it tests. Pick one in the rule builder.');
    return null;
  }
  if (ref.indexOf('fn_rating:') === 0 || ref.indexOf('fn_deep_dive:') === 0) return PP_mdlAreaAnswer_(ref, site, where, ctx);
  if (ref.indexOf('support:') === 0) return PP_mdlSupportAnswer_(ref, site, where, ctx);
  if (ref === 'support_comment' && !PP_mdlHas_(ctx.byId, ref)) return PP_mdlSupportCommentAnswer_(site, where, ctx);
  const repeated = PP_mdlRepeatAnswer_(ref, site, where, ctx);
  if (repeated !== undefined) return repeated;
  const model = ctx.model;
  if (!PP_mdlHas_(ctx.byId, ref)) {
    const earlier = model.screens.slice(0, site.index).filter(s => s.active && s.id).map(s => s.id);
    PP_mdlRuleError_(site, where, 'tests an answer that does not exist: no question has that code. Pick an earlier ' +
      'answer in the rule builder. (It tests "' + ref + '".' +
      PP_mdlDidYouMean_(ref, earlier.length ? earlier : Object.keys(ctx.byId)) + ')');
    return null;
  }
  const targetIndex = ctx.byId[ref];
  const target = model.screens[targetIndex];
  const targetName = PP_mdlQuestionName_(model, target, targetIndex);
  if (targetIndex === site.index) {
    PP_mdlRuleError_(site, where, 'tests the answer to this same question. A question cannot depend on its own ' +
      'answer: test an earlier answer.');
    return null;
  }
  if (targetIndex > site.index) {
    PP_mdlRuleError_(site, where, 'tests the answer to ' + targetName + ', which comes later, so there is no answer ' +
      'yet when this question is shown. Move that question above this one, or test an earlier answer.');
    return null;
  }
  if (!target.active) {
    PP_mdlRuleError_(site, where, 'tests the answer to ' + targetName + ', which is hidden, so it never has an ' +
      'answer. Show that question again, or change the rule.');
    return null;
  }
  return PP_mdlScreenAnswer_(model, target, targetIndex, site, where);
}

/**
 * What an answer can be: describe = how messages name it; values = the
 * answers as the form stores them (null = typed text or a voice note);
 * numeric = compared as numbers from low to high; words = values that are
 * plain words ("yes", "no") rather than codes.
 */
function PP_mdlAnswer_(describe, values, numeric, low, high, words) {
  return { describe: describe, values: values, numeric: numeric, low: low, high: high, words: Boolean(words) };
}

/** What a generic screen's answer can be. */
function PP_mdlScreenAnswer_(model, target, index, site, where) {
  const question = PP_mdlQuestionName_(model, target, index);
  const describe = 'the answer to ' + question;
  const numbers = [];
  for (let n = 0; n <= 10; n++) numbers.push(String(n));
  switch (target.type) {
    case 'nps_0_10': return PP_mdlAnswer_(describe, numbers, true, 0, 10);
    case 'rating_1_5': return PP_mdlAnswer_(describe, numbers.slice(1, 6), true, 1, 5);
    case 'yes_no': return PP_mdlAnswer_(describe, ['yes', 'no'], false, 0, 0, true);
    case 'single_choice':
      return target.options.length ? PP_mdlAnswer_(describe, target.options.slice(), false, 0, 0) : null;
    case 'free_text': return PP_mdlAnswer_(describe, null, false, 0, 0);
    default: break;
  }
  const type = PP_mdlScreenType_(target.type);
  if (!type) return null;   // already reported as an unknown type
  const hints = {
    function_ratings: ' To test how one area was rated, pick that area\'s rating in the rule builder. (In the ' +
      'Screens tab: "fn_rating:<area code>", for example "fn_rating:payments".)',
    function_deep_dives: ' To test the problem picked for one area, pick that area\'s problem in the rule ' +
      'builder. (In the Screens tab: "fn_deep_dive:<area code>".)',
    support_block: ' To test one support rating or the support comment, pick it in the rule builder. (In the ' +
      'Screens tab: "support:<code>", for example "support:kept_updated", or "support_comment".)'
  };
  const kind = PP_mdlEnglishOf_(model, target.text) ? ' (it is a screen of the kind "' + type.label + '")' : '';
  PP_mdlRuleError_(site, where, 'tests ' + question + kind + ', which does not record an answer a rule can test.' +
    (PP_mdlHas_(hints, target.type) ? hints[target.type] : ''));
  return null;
}

/**
 * "<code>:<area>": one area's answer to a question asked once per area
 * (its "repeat" is each_area or each_low_area). Gives undefined when ref is
 * not such an answer (the usual checks then run), null after saying why it
 * cannot work, else what the answer can be.
 */
function PP_mdlRepeatAnswer_(ref, site, where, ctx) {
  const colon = ref.indexOf(':');
  if (colon < 1) return undefined;
  const id = ref.slice(0, colon);
  if (!PP_mdlHas_(ctx.byId, id)) return undefined;
  const index = ctx.byId[id];
  const model = ctx.model;
  const target = model.screens[index];
  if (!target.repeat) return undefined;
  const area = ref.slice(colon + 1);
  const targetName = PP_mdlQuestionName_(model, target, index);
  if (!PP_mdlHas_(ctx.areaIds, area)) {
    const ids = Object.keys(ctx.areaIds);
    PP_mdlRuleError_(site, where, 'tests ' + targetName + ' for an area that does not exist. Pick the area again in ' +
      'the rule builder. (It tests "' + ref + '"; the area codes are ' + (ids.join(', ') || 'none') + '.' +
      PP_mdlDidYouMean_(area, ids) + ')');
    return null;
  }
  if (!PP_mdlHas_(ctx.activeAreas, area)) {
    PP_mdlRuleError_(site, where, 'tests ' + targetName + ' for ' + PP_mdlAreaName_(model, area, -1) + ', but that ' +
      'area is hidden, so it is never asked. Switch the area on, or change the rule.');
    return null;
  }
  if (index >= site.index) {
    PP_mdlRuleError_(site, where, 'tests the answer to ' + targetName + ', which ' + (index === site.index ? 'is this ' +
      'same question' : 'comes later') + ', so there is no answer yet when this question is shown. Test an earlier answer.');
    return null;
  }
  if (!target.active) {
    PP_mdlRuleError_(site, where, 'tests the answer to ' + targetName + ', which is hidden, so it never has an ' +
      'answer. Show that question again, or change the rule.');
    return null;
  }
  return PP_mdlScreenAnswer_(model, target, index, site, where);
}

/** "fn_rating:<area>" (1-5 or "na") and "fn_deep_dive:<area>" (one of the area's problems, or "other"). */
function PP_mdlAreaAnswer_(ref, site, where, ctx) {
  const colon = ref.indexOf(':');
  const prefix = ref.slice(0, colon);
  const area = ref.slice(colon + 1);
  const model = ctx.model;
  if (!PP_mdlHas_(ctx.areaIds, area)) {
    const ids = Object.keys(ctx.areaIds);
    PP_mdlRuleError_(site, where, 'tests an area that does not exist. Pick the area again in the rule builder. (It ' +
      'tests "' + ref + '"; the area codes are ' + (ids.join(', ') || 'none') + '.' + PP_mdlDidYouMean_(area, ids) + ')');
    return null;
  }
  const areaName = PP_mdlAreaName_(model, area, -1);
  const what = (prefix === 'fn_rating' ? 'the rating of ' : 'the problem picked for ') + areaName;
  if (!PP_mdlHas_(ctx.activeAreas, area)) {
    PP_mdlRuleError_(site, where, 'tests ' + what + ', but that area is hidden, so it is never rated. Switch the ' +
      'area on, or change the rule.');
    return null;
  }
  if (!PP_mdlComesBefore_(ctx, 'function_ratings', site, where, 'the rating of ' + areaName)) return null;
  if (prefix === 'fn_rating') return PP_mdlAnswer_(what, ['1', '2', '3', '4', '5', 'na'], true, 1, 5);
  // In "immediate" mode each problem screen follows its own rating; otherwise
  // they all come at the problem-screens step, which must then be earlier.
  if (model.settings['deep_dive.when'] !== 'immediate' &&
    !PP_mdlComesBefore_(ctx, 'function_deep_dives', site, where, what)) {
    return null;
  }
  return PP_mdlAnswer_(what, ctx.areaChips[area].concat(['other']), false, 0, 0);
}

/** Is the (first, switched-on) screen of this built-in type earlier than the screen with the rule? */
function PP_mdlComesBefore_(ctx, type, site, where, what) {
  const label = PP_mdlScreenType_(type).label;
  if (!PP_mdlHas_(ctx.firstActive, type)) {
    PP_mdlRuleError_(site, where, 'tests ' + what + ', but the "' + label + '" screen is missing or hidden, so there ' +
      'is never an answer.');
    return false;
  }
  const index = ctx.firstActive[type];
  if (index >= site.index) {
    PP_mdlRuleError_(site, where, 'tests ' + what + ', but the "' + label + '" screen comes later (question ' +
      (index + 1) + '), so there is no answer yet when this question is shown. Move this question below question ' +
      (index + 1) + '.');
    return false;
  }
  return true;
}

function PP_mdlSupportAnswer_(ref, site, where, ctx) {
  const model = ctx.model;
  const item = ref.slice('support:'.length);
  if (ctx.activeSupport.indexOf(item) === -1) {
    PP_mdlRuleError_(site, where, 'tests a support question that does not exist or is switched off. Pick it again ' +
      'in the rule builder, or switch that support question on. (It tests "' + ref + '".' +
      PP_mdlDidYouMean_(item, ctx.activeSupport) + ')');
    return null;
  }
  let index = -1;
  model.support.forEach((entry, n) => { if (index < 0 && entry.code === item) index = n; });
  const what = 'the rating of ' + PP_mdlSupportName_(model, model.support[index], index);
  if (!PP_mdlComesBefore_(ctx, 'support_block', site, where, what)) return null;
  const values = ['1', '2', '3', '4', '5'].concat(model.settings['support.allow_not_applicable'] === true ? ['na'] : []);
  return PP_mdlAnswer_(what, values, true, 1, 5);
}

/** The comment box under the support ratings: like an open question, it can only be tested with "answered". */
function PP_mdlSupportCommentAnswer_(site, where, ctx) {
  if (ctx.model.settings['support.allow_comment'] !== true) {
    PP_mdlRuleError_(site, where, 'tests the support comment, but the comment box is switched off (setting ' +
      '"Comment box"), so there is never a comment.');
    return null;
  }
  if (!PP_mdlComesBefore_(ctx, 'support_block', site, where, 'the support comment')) return null;
  return PP_mdlAnswer_('the support comment', null, false, 0, 0);
}

function PP_mdlAllowedText_(answer) {
  if (answer.numeric) {
    return 'a whole number from ' + answer.low + ' to ' + answer.high +
      (answer.values.indexOf('na') !== -1 ? ' or "na" (does not apply)' : '');
  }
  return PP_mdlOrList_(answer.values);
}

/** Can this test ever be true? The form compares answers as text (6 and "6" are the same); capitals matter. */
function PP_mdlCheckTestValue_(test, value, answer, site, where) {
  if (test === 'answered') {
    if (typeof value !== 'boolean') {
      PP_mdlRuleError_(site, where, 'uses "was answered" with ' + PP_mdlShowJson_(value) + '. It must be true or ' +
        'false, without quotes ("false" in quotes would count as true).');
    }
    return;
  }
  if (answer.values === null) {
    PP_mdlRuleError_(site, where, 'tests ' + answer.describe + ', which is a voice note or typed answer, so it can ' +
      'only use "was answered".');
    return;
  }
  if (test === 'at_most' || test === 'at_least') {
    PP_mdlCheckNumberTest_(test, value, answer, site, where);
    return;
  }
  if (test === 'in' && (!Array.isArray(value) || !value.length)) {
    PP_mdlRuleError_(site, where, 'uses "is one of", which needs a list of possible answers. Pick them again in the ' +
      'rule builder. (For example [' + PP_mdlShowJson_(answer.values[0] || 'yes') + '].)');
    return;
  }
  const candidates = test === 'in' ? value : [value];
  const impossible = candidates.filter(item => answer.values.indexOf(PP_mdlJsText_(item)) === -1);
  if (!impossible.length) return;
  const outcome = test === 'not_equals' ? 'is always true' : 'can never match';
  const shown = impossible.map(PP_mdlShowJson_).join(', ');
  const caseHint = impossible.some(item => typeof item === 'string' && answer.values.indexOf(item.toLowerCase()) !== -1) ?
    ' Capital letters matter: write it exactly as shown.' : '';
  if (answer.numeric || answer.words) {
    PP_mdlRuleError_(site, where, 'tests ' + answer.describe + ', which can only be ' + PP_mdlAllowedText_(answer) +
      ', so ' + shown + ' ' + outcome + '.' + caseHint);
    return;
  }
  PP_mdlRuleError_(site, where, 'tests ' + answer.describe + ', but ' + shown + ' is not one of its answers, so the ' +
    'rule ' + outcome + '. Pick the answer again in the rule builder.' + caseHint + ' (Its answers are ' +
    PP_mdlOrList_(answer.values) + '.)');
}

function PP_mdlCheckNumberTest_(test, value, answer, site, where) {
  const name = '"' + PP_MDL_TEST_NAMES_[test] + '"';
  if (!answer.numeric) {
    PP_mdlRuleError_(site, where, 'uses ' + name + ', which compares numbers, but ' + answer.describe + ' is never a ' +
      'number. Use "is", "is not" or "is one of" instead.');
    return;
  }
  let number = PP_mdlIsNumber_(value) ? value : null;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) number = Number(value);   // the form turns "6" into 6
  if (number === null) {
    PP_mdlRuleError_(site, where, 'uses ' + name + ' with ' + PP_mdlShowJson_(value) + ', but it needs a number ' +
      '(without quotes).');
    return;
  }
  const letsAll = test === 'at_most' ? number >= answer.high : number <= answer.low;
  const letsNone = test === 'at_most' ? number < answer.low : number > answer.high;
  if (letsAll || letsNone) {
    PP_mdlRuleWarning_(site, where, 'tests ' + answer.describe + ', which is between ' + answer.low + ' and ' +
      answer.high + ', so ' + name + ' ' + PP_mdlShowJson_(value) + ' lets ' + (letsAll ? 'every answer' : 'no answer') +
      ' through. Check the number.');
  }
}

// ---- Texts -----------------------------------------------------------------------

function PP_mdlCheckTexts_(model, ctx, report) {
  const keys = Object.keys(model.texts);
  const unused = PP_mdlUnusedTextKeys_(model, keys);
  const needed = PP_mdlRequiredTextKeys_(model);
  const known = PP_mdlKnownTextReasons_(model);
  const commentKey = model.settings['support.allow_comment'] === true ? PP_mdlTrim_(model.settings['support.comment_text']) : '';
  Object.keys(needed).forEach(key => {
    if (PP_mdlHas_(model.texts, key) || key === commentKey) return;   // the comment question is reported under Settings
    report.error('texts', key, 'A text is missing: ' + needed[key] + '. Add it in Texts & translations, with at ' +
      'least the English. (Its name there must be "' + key + '".' + PP_mdlRenameHint_(key, unused) + ')');
  });
  const english = ctx.allCodes.indexOf('en') !== -1;
  const backup = ctx.fallback !== 'en' && ctx.codes.indexOf(ctx.fallback) !== -1 ? ctx.fallback : '';
  keys.forEach(key => {
    const values = model.texts[key];
    const purpose = PP_mdlHas_(known, key) ? known[key] : 'a text';
    const shown = PP_mdlShorten_(values.en);
    const name = { what: purpose, of: shown ? '"' + shown + '"' : purpose, english: 'The English text "' + shown + '"',
      tail: ' (Text name: "' + key + '".)' };
    if (english) PP_mdlCheckSourceText_(report, 'texts', key, 'en', values.en, name, model);
    if (backup) PP_mdlCheckSourceText_(report, 'texts', key, backup, values[backup], name, model);
    PP_mdlCheckPlaceholders_(report, key, values, ctx, model);
  });
  PP_mdlWarnUntranslated_(report, model, ctx, keys);
  if (unused.length) {
    const one = unused.length === 1;
    report.warn('texts', unused[0], PP_mdlPlural_(unused.length, 'text') + ' ' + (one ? 'is' : 'are') + ' not used by ' +
      'any question, area, problem, support question or the form itself (probably left over after something was ' +
      'deleted or renamed). You can delete ' + (one ? 'it' : 'them') + '; leaving ' + (one ? 'it' : 'them') + ' does ' +
      'no harm. (' + (one ? 'Text name: ' : 'Text names: ') + PP_mdlQuotedList_(unused) + '.)');
  }
}

/**
 * English (and the backup language) must be real text: they are shown
 * whenever a translation is missing. name = how the message names the text:
 * name.what (said when the English is empty, for example "one of the form's
 * own texts"), name.of ('"Next"', or 'item 2 of "What changed" for ...'),
 * name.english (optional: how to name the English itself) and name.tail
 * (added at the very end, for example the text's name in brackets).
 */
function PP_mdlCheckSourceText_(report, section, ref, code, text, name, model) {
  const isEnglish = code === 'en';
  const language = PP_mdlLanguageName_(code, model);
  const why = isEnglish ? 'English is what translators work from and the backup for every language' :
    language + ' is the backup language (setting "Backup language"), shown whenever a translation is missing';
  const version = isEnglish ? (name.english || 'The English of ' + name.of) : 'The ' + language + ' version of ' + name.of;
  if (!PP_mdlIsFilled_(text)) {
    report.error(section, ref, (isEnglish ? PP_mdlCapital_(name.what) + ' has no English' : version + ' is empty') +
      '. ' + why + ', so fill it in.' + name.tail);
  } else if (text.indexOf(PP_MDL_TAG_) !== -1) {
    report.error(section, ref, version + ' still has the [TRANSLATE] tag. ' + why + ', so it must be ' +
      (isEnglish ? 'real text: remove the tag.' : 'a real translation: replace it.') + name.tail);
  }
}

/** {s} and {n} are replaced by numbers on screen, so every finished translation must keep exactly the same ones. */
function PP_mdlCheckPlaceholders_(report, key, values, ctx, model) {
  if (!PP_mdlIsFilled_(values.en)) return;
  const expected = PP_mdlPlaceholders_(values.en);
  ctx.codes.forEach(code => {
    const text = values[code];
    if (code === 'en' || PP_mdlNeedsTranslation_(text)) return;
    const found = PP_mdlPlaceholders_(text);
    const missing = expected.filter(mark => found.indexOf(mark) === -1);
    const extra = found.filter(mark => expected.indexOf(mark) === -1);
    if (!missing.length && !extra.length) return;
    const problems = [];
    if (missing.length) problems.push('is missing ' + missing.join(' '));
    if (extra.length) problems.push('has ' + extra.join(' ') + ', which the English does not have');
    report.error('texts', key + ' (' + code + ')', 'The ' + PP_mdlLanguageName_(code, model) + ' version of "' +
      PP_mdlShorten_(values.en) + '" ' + problems.join(' and ') + '. Marks in curly brackets such as {s} and {n} are ' +
      'replaced by numbers on screen, so every language needs exactly the same ones as the English. (Text name: "' +
      key + '".)');
  });
}

function PP_mdlWarnUntranslated_(report, model, ctx, keys) {
  const backupName = PP_mdlLanguageName_(ctx.fallback, model);
  ctx.codes.forEach(code => {
    if (code === 'en' || code === ctx.fallback) return;   // those are errors, reported above
    const todo = keys.filter(key => PP_mdlNeedsTranslation_(model.texts[key][code])).length;
    if (!todo) return;
    const name = PP_mdlLanguageName_(code, model);
    report.warn('texts', code, name + ': ' + todo + ' of ' + keys.length + ' texts still need translating (empty ' +
      'or marked [TRANSLATE]). Until then, partners who choose ' + name + ' see the backup language, ' + backupName +
      ', for those texts.');
  });
}

/** Every text that must exist, with what it is for: texts of items switched on, plus the form's own texts. */
function PP_mdlRequiredTextKeys_(model) {
  const needed = PP_mdlTextKeyReasons_(model, false);
  PP_FORM_TEXT_KEYS.forEach(key => {
    if (!PP_mdlHas_(needed, key)) needed[key] = PP_MDL_FORM_TEXT_REASON_;
  });
  return needed;
}

/** What every known text is for (items switched off too), to name a text whose English is empty. */
function PP_mdlKnownTextReasons_(model) {
  const known = PP_mdlTextKeyReasons_(model, true);
  PP_FORM_TEXT_KEYS.concat(PP_MDL_CODE_TEXT_KEYS_).forEach(key => {
    if (!PP_mdlHas_(known, key)) known[key] = PP_MDL_FORM_TEXT_REASON_;
  });
  return known;
}

/** Texts nothing refers to, not even a hidden item (those are kept for when it is switched back on). */
function PP_mdlUnusedTextKeys_(model, keys) {
  const used = PP_mdlTextKeyReasons_(model, true);
  PP_FORM_TEXT_KEYS.concat(PP_MDL_CODE_TEXT_KEYS_).forEach(key => { used[key] = true; });
  const comment = PP_mdlTrim_(model.settings['support.comment_text']);
  if (comment && PP_mdlSafeKey_(comment)) used[comment] = true;
  return keys.filter(key => !PP_mdlHas_(used, key) && key.indexOf('rating.') !== 0);
}

/**
 * The texts the questionnaire's items need (contract section 6, "derived text
 * keys"), each with what it is for, in plain English ("the help line of the
 * area "Payments / Payouts""). includeHidden = also the texts of items that
 * are switched off.
 */
function PP_mdlTextKeyReasons_(model, includeHidden) {
  const reasons = {};
  const add = (key, why) => {
    if (key && PP_mdlSafeKey_(key) && !PP_mdlHas_(reasons, key)) reasons[key] = why;
  };
  const shownAreas = {};
  model.areas.forEach((area, index) => {
    if (!area.id || !PP_mdlSafeKey_(area.id) || !(includeHidden || area.active)) return;
    shownAreas[area.id] = true;
    add('fn.' + area.id + '.name', 'the name of area ' + (index + 1));
    add('fn.' + area.id + '.help', 'the help line of ' + PP_mdlAreaName_(model, area.id, index));
  });
  model.chips.forEach((chip, index) => {
    if (!chip.code || !PP_mdlHas_(shownAreas, chip.area) || !(includeHidden || chip.active)) return;
    add('issue.' + chip.area + '.' + chip.code, 'the label of problem ' + PP_mdlChipPlace_(model, index) + ' of ' +
      PP_mdlAreaName_(model, chip.area, -1));
  });
  if (Object.keys(shownAreas).length) add('issue.other', 'the label of the "Other" problem button');
  model.support.forEach((item, index) => {
    if (item.code && (includeHidden || item.active)) add('support.' + item.code, 'the label of support question ' + (index + 1));
  });
  if (model.settings['support.allow_not_applicable'] === true) {
    add('support.not_applicable', 'the "Doesn\'t apply" option of the support questions');
  }
  if (model.settings['support.allow_comment'] === true) {
    add(PP_mdlTrim_(model.settings['support.comment_text']), 'the support comment question (setting "Comment question")');
  }
  model.screens.forEach((screen, index) => {
    if (!(includeHidden || screen.active)) return;
    const question = PP_mdlQuestionName_(model, screen, index);
    PP_MDL_SCREEN_TEXT_FIELDS_.forEach(field => {
      if (screen[field]) add(screen[field], 'the ' + PP_MDL_FIELD_NAMES_[field] + ' of ' + question);
    });
    if (screen.type === 'single_choice') {
      screen.options.forEach((option, n) => add('choice.' + screen.id + '.' + option, 'the label of answer ' + (n + 1) +
        ' of ' + question));
    }
  });
  return reasons;
}

/**
 * When a code was renamed but its text was not, the old text is now unused
 * and differs from the missing one in exactly one part
 * (fn.app.name -> fn.tech.name). Point at it.
 */
function PP_mdlRenameHint_(missingKey, unused) {
  const parts = missingKey.split('.');
  const renamed = unused.filter(key => {
    const other = key.split('.');
    return other.length === parts.length && other.filter((part, i) => part !== parts[i]).length === 1;
  });
  const best = renamed.length ? PP_mdlClosest_(missingKey, renamed, 0) : PP_mdlClosest_(missingKey, unused, 0.7);
  return best ? ' Did you rename a code? Then give the old text "' + best + '" this name.' : '';
}

// ---- What changed, rounds and codes that are live today ------------------------

function PP_mdlCheckNews_(model, ctx, report) {
  const english = ctx.allCodes.indexOf('en') !== -1;
  const backup = ctx.fallback !== 'en' && ctx.codes.indexOf(ctx.fallback) !== -1 ? ctx.fallback : '';
  Object.keys(model.whats_changed).forEach(roundId => {
    const items = model.whats_changed[roundId];
    const isDemo = /demo/i.test(roundId);
    if (!PP_mdlHas_(ctx.roundIds, roundId) && !PP_MDL_ROUND_RE_.test(roundId)) {
      report.error('whats_changed', roundId, 'The round "' + roundId + '" in What changed has a name that is not ' +
        'allowed. Use 1 to 64 letters, digits, - or _ (no spaces), exactly as in the partner links, for example ' +
        '"2026-R1".');
    }
    items.forEach((item, n) => {
      const ref = roundId + ' item ' + (n + 1);
      const subject = 'item ' + (n + 1) + ' of "What changed" for the round "' + roundId + '"';
      const name = { what: subject, of: subject, tail: '' };
      if (english) PP_mdlCheckSourceText_(report, 'whats_changed', ref, 'en', item.en, name, model);
      if (backup) PP_mdlCheckSourceText_(report, 'whats_changed', ref, backup, item[backup], name, model);
      const sample = Object.keys(item).some(code => PP_mdlText_(item[code]).indexOf('[SAMPLE]') !== -1);
      if (!isDemo && sample) {
        report.warn('whats_changed', ref, PP_mdlCapital_(subject) + ' still contains the example tag [SAMPLE]. ' +
          'Replace it with the real change before sending links for this round.');
      }
    });
    const isOpen = model.rounds.some(round => round.id === roundId && round.status === 'open');
    if (isDemo && items.length && !isOpen) {
      report.warn('whats_changed', roundId, 'The round "' + roundId + '" is fake demo content (its name contains ' +
        'DEMO). That is fine for testing, but never open it or send its links to real partners.');
    }
  });
}

/**
 * Read-aloud clips (the Audio clips tab) by the same rules as the GitHub
 * copy's settings check (scripts/check_config.py), so a copy the panel
 * accepts passes there too. Only languages that are switched on are
 * published, so only those are checked.
 */
function PP_mdlCheckClips_(model, ctx, report) {
  Object.keys(model.clips).forEach(key => {
    Object.keys(model.clips[key]).forEach(lang => {
      if (ctx.codes.indexOf(lang) === -1) return;
      const ref = key + ' (' + lang + ')';
      const where = 'The read-aloud clip for the text "' + key + '" in ' + lang + ' (Audio clips tab)';
      if (!PP_mdlHas_(model.texts, key)) {
        report.error('clips', ref, where + ' is for a text that does not exist, so it would never play. Use the ' +
          'exact name of the text it reads aloud, as in Texts & translations.' + PP_mdlDidYouMean_(key, Object.keys(model.texts)));
      }
      const problem = PP_mdlWebFileProblem_(PP_mdlText_(model.clips[key][lang]), 'audio/hi/q.nps.mp3');
      if (problem) report.error('clips', ref, where + ' ' + problem);
    });
  });
}

function PP_mdlCheckRounds_(model, report) {
  const seen = {};
  model.rounds.forEach(round => {
    if (!PP_MDL_ROUND_RE_.test(round.id)) {
      report.error('rounds', round.id, 'The round "' + round.id + '" has a name that is not allowed. Use 1 to 64 ' +
        'letters, digits, - or _ (no spaces), for example "2026-R1": it goes into every partner link.');
    } else if (PP_mdlHas_(seen, round.id)) {
      report.warn('rounds', round.id, 'The round "' + round.id + '" is listed twice in the Rounds tab. Delete the extra ' +
        'row.');
    }
    if (PP_mdlSafeKey_(round.id)) seen[round.id] = true;
    if (['draft', 'open', 'closed'].indexOf(round.status) === -1) {
      report.warn('rounds', round.id, 'The round "' + round.id + '" has the status "' + round.status + '", which the ' +
        'form does not know. Use the Open / Close buttons in the control panel (Rounds) to set it.');
    }
    if (round.status === 'open' && /demo/i.test(round.id)) {
      report.warn('rounds', round.id, 'The round "' + round.id + '" is OPEN, but its name contains DEMO, so it is fake ' +
        'demo content. Close it unless you are testing, and never send its links to real partners.');
    }
  });
}

/**
 * Codes partners already answered must not disappear: the dashboard compares
 * rounds by them. That is every code of the live version, plus (everLive)
 * every code of the versions live since the first real round, so hiding a
 * question, publishing and then deleting it is noticed too. Hidden items are
 * fine. Things that are gone from the draft are named by their texts in the
 * live version.
 */
function PP_mdlCheckLiveCodes_(model, liveDoc, report, everLive) {
  const hasDoc = PP_mdlIsCompiledDoc_(liveDoc);
  const earlier = Array.isArray(everLive) ? everLive : [];
  if (!hasDoc && !earlier.length) return;
  const doc = hasDoc ? liveDoc : null;
  const today = PP_liveIds(doc);
  const live = PP_liveIds(doc, earlier);
  const english = key => (doc ? PP_mdlLiveEnglish_(doc, key) : '');
  const why = ' Partners have already answered it, and the dashboard compares rounds by its code. To reword it, ' +
    'rename its label (its text) and keep the code; to stop asking it, hide it instead of deleting it.';
  const gone = (section, ref, subject, code, isToday) => {
    report.warn(section, ref, subject + (isToday ? ' is live today but is no longer in the draft.' :
      ' was answered in an earlier published version but is no longer in the draft.') + why + ' (Its code is "' + code + '".)');
  };
  const screenAt = {};
  const screenCodes = {};
  model.screens.forEach((screen, index) => {
    if (screen.id && PP_mdlSafeKey_(screen.id) && !PP_mdlHas_(screenAt, screen.id)) screenAt[screen.id] = index;
    screenCodes['#' + screen.id] = true;
    if (PP_mdlHas_(PP_MDL_IMPLIED_PREFIX_, screen.type)) screenCodes['#' + PP_MDL_IMPLIED_PREFIX_[screen.type]] = true;
  });
  live.screens.forEach(id => {
    if (PP_mdlHas_(screenCodes, '#' + id)) return;
    const isToday = today.screens.indexOf(id) !== -1;
    const name = PP_mdlLiveScreenName_(doc, id);
    gone('screens', id, PP_mdlCapital_(!isToday && name === 'a screen' ? 'a question' : name), id, isToday);
  });
  const areas = model.areas.map(area => area.id);
  const areaName = id => (english('fn.' + id + '.name') ? 'the area "' + english('fn.' + id + '.name') + '"' : 'an area');
  live.areas.forEach(id => {
    if (areas.indexOf(id) === -1) gone('areas', id, PP_mdlCapital_(areaName(id)), id, today.areas.indexOf(id) !== -1);
  });
  Object.keys(live.chips).forEach(area => {
    if (areas.indexOf(area) === -1) return;   // the whole area is reported above
    live.chips[area].forEach(code => {
      const label = english('issue.' + area + '.' + code);
      const found = model.chips.some(chip => chip.area === area && chip.code === code);
      const isToday = PP_mdlHas_(today.chips, area) && today.chips[area].indexOf(code) !== -1;
      if (!found) gone('chips', area + '/' + code, (label ? 'The problem "' + label + '"' : 'A problem') + ' of ' + areaName(area), code, isToday);
    });
  });
  const support = model.support.map(item => item.code);
  live.support.forEach(code => {
    const label = english('support.' + code);
    if (support.indexOf(code) === -1) {
      gone('support', code, label ? 'The support question "' + label + '"' : 'A support question', code, today.support.indexOf(code) !== -1);
    }
  });
  Object.keys(live.options).forEach(screenId => {
    if (!PP_mdlHas_(screenAt, screenId)) return;   // the whole screen is reported above
    const options = model.screens[screenAt[screenId]].options;
    live.options[screenId].forEach(code => {
      const label = english('choice.' + screenId + '.' + code);
      const isToday = PP_mdlHas_(today.options, screenId) && today.options[screenId].indexOf(code) !== -1;
      if (options.indexOf(code) === -1) {
        gone('screens', screenId + '/' + code, (label ? 'The answer "' + label + '"' : 'An answer') + ' of ' +
          PP_mdlLiveScreenName_(doc, screenId), code, isToday);
      }
    });
  });
}

/** The English of a text in the live version, shortened ('' when it has none). */
function PP_mdlLiveEnglish_(liveDoc, key) {
  const strings = PP_mdlIsObject_(liveDoc.strings) ? liveDoc.strings : {};
  return PP_mdlHas_(strings, key) && PP_mdlIsObject_(strings[key]) ? PP_mdlShorten_(strings[key].en) : '';
}

/**
 * 'the question "..."' (its English text in the live version), or 'the
 * "Thank-you screen" screen'. The live version may be the old list or a
 * graph (then the code may also be an answer key's start, like a store_as).
 */
function PP_mdlLiveScreenName_(liveDoc, id) {
  const entry = (liveDoc ? PP_mdlLiveScreen_(liveDoc.survey.flow, id) : null) || {};
  const text = liveDoc ? PP_mdlLiveEnglish_(liveDoc, PP_mdlText_(entry.text)) : '';
  if (text) return 'the question "' + text + '"';
  const type = PP_mdlScreenType_(PP_mdlHas_(PP_MDL_NODE_TYPES_, entry.type) ? PP_MDL_NODE_TYPES_[entry.type] : entry.type);
  return type ? 'the "' + type.label + '" screen' : 'a screen';
}

/** The screen (list entry or graph node, group bodies included) with this code or answer-key start, or null. */
function PP_mdlLiveScreen_(flow, id) {
  if (Array.isArray(flow)) return PP_mdlList_(flow).filter(screen => screen.id === id)[0] || null;
  if (!PP_mdlIsGraph_(flow)) return null;
  let found = null;
  PP_mdlGraphNodes_(flow).forEach(node => {
    if (!found && (node.id === id || PP_mdlStorePrefix_(node) === id)) found = node;
  });
  return found;
}

/** Every node of a graph that is a screen (group bodies included; the groups themselves are not). */
function PP_mdlGraphNodes_(graph) {
  const out = [];
  PP_mdlList_(graph.nodes).forEach(node => {
    if (node.type === 'group') {
      if (PP_mdlIsObject_(node.body)) PP_mdlList_(node.body.nodes).forEach(inner => out.push(inner));
    } else {
      out.push(node);
    }
  });
  return out;
}

/** The start of a node's answer key (store_as "fn_rating:{area}" gives "fn_rating"), or ''. */
function PP_mdlStorePrefix_(node) {
  if (!PP_mdlIsFilled_(node.store_as)) return '';
  const key = node.store_as.trim();
  const colon = key.indexOf(':');
  return colon < 0 ? key : key.slice(0, colon);
}

function PP_mdlSummary_(model, ctx, compiledChars) {
  const keys = Object.keys(model.texts);
  return {
    screens: model.screens.filter(screen => screen.active).length,
    areas: model.areas.filter(area => area.active && area.id).length,
    chips: model.chips.filter(chip => chip.active && chip.code && PP_mdlHas_(ctx.activeAreas, chip.area)).length,
    support: model.support.filter(item => item.active).length,
    languages: ctx.codes.map(code => ({
      code: code,
      total: keys.length,
      untranslated: keys.filter(key => PP_mdlNeedsTranslation_(model.texts[key][code])).length
    })),
    compiled_chars: compiledChars
  };
}


// =============================================================================
// 9. The GitHub copy: import (PP_importStatic) and export (PP_exportStatic)
// =============================================================================

/**
 * Turns the four questionnaire files of the GitHub project into a model
 * (contract section 8). files = { survey, strings, whats_changed, audio_clips }:
 * the files' contents, already read as JSON (the last two may be null).
 * Everything comes in switched on; every round in whats_changed.json becomes a
 * "draft" round. The survey's config_version is remembered in the model (in
 * memory only) so that exporting straight away gives the same files back.
 */
function PP_importStatic(files) {
  const given = PP_mdlIsObject_(files) ? files : {};
  const survey = PP_mdlIsObject_(given.survey) ? given.survey : {};
  const news = PP_mdlIsObject_(given.whats_changed) && PP_mdlIsObject_(given.whats_changed.rounds) ? given.whats_changed.rounds : {};
  const clips = PP_mdlIsObject_(given.audio_clips) && PP_mdlIsObject_(given.audio_clips.clips) ? given.audio_clips.clips : {};
  const model = PP_emptyModel();
  model.settings = PP_mdlSettingsFromSurvey_(survey);
  model.languages = PP_mdlList_(survey.languages).map(l => ({ code: l.code, bcp47: l.bcp47, native_name: l.native_name, active: true }));
  PP_mdlList_(survey.functions).forEach(area => {
    model.areas.push({ id: area.id, threshold: PP_mdlHas_(area, 'threshold') ? area.threshold : null, active: true });
    (Array.isArray(area.issues) ? area.issues : []).forEach(code => model.chips.push({ area: area.id, code: code, active: true }));
  });
  const support = PP_mdlIsObject_(survey.support) ? survey.support : {};
  model.support = (Array.isArray(support.items) ? support.items : []).map(code => ({ code: code, active: true }));
  model.screens = PP_mdlScreensFromFlow_(survey);
  model.texts = PP_mdlIsObject_(given.strings) ? given.strings : {};   // tidying drops the _help note
  Object.keys(news).forEach(roundId => {
    if (roundId.charAt(0) === '_') return;
    const block = news[roundId];
    model.whats_changed[roundId] = PP_mdlIsObject_(block) && Array.isArray(block.items) ? block.items : [];
    model.rounds.push(PP_mdlNewRound_(roundId));
  });
  model.clips = clips;
  if (PP_mdlIsFilled_(survey.config_version)) model.config_version = survey.config_version;
  return PP_normalizeModel(model);
}

/** Settings found in survey.json (lists are turned into Settings-tab text when the model is tidied). */
function PP_mdlSettingsFromSurvey_(survey) {
  const settings = {};
  PP_SETTINGS_SCHEMA.forEach(entry => {
    if (entry.key === 'form_url') return;   // not part of survey.json: keeps its default
    const value = PP_mdlGetPath_(survey, entry.key);
    if (value !== undefined) settings[entry.key] = value;
  });
  return settings;
}

/**
 * The Screens rows of a survey's "flow": the old list one line per row, as
 * always; a graph (pp-flow/1) through Flow.gs (PP.flowPanel.toRows, the
 * inverse of compiling). A graph the control panel cannot show (its own
 * groups, loops over other lists, settings the rows cannot hold) is refused,
 * naming each screen, so nothing is half imported.
 */
function PP_mdlScreensFromFlow_(survey) {
  const flow = survey.flow;
  if (!PP_mdlIsObject_(flow)) return PP_mdlList_(flow).map(PP_mdlScreenFromFlow_);
  if (!PP_mdlIsGraph_(flow)) {
    throw new Error('The questions\' route ("flow" in survey.json) is neither a list of screens nor a route in the ' +
      'pp-flow/1 format, so it cannot be read. Nothing was changed. (Its "format" is ' + PP_mdlShow_(flow.format) + '.)');
  }
  const result = PP_mdlFlowLib_().flowPanel.toRows(flow, survey);
  if (result.unsupported.length) {
    const list = result.unsupported.slice(0, 8).map(item => (item.node ? '"' + item.node + '": ' : '') + item.message);
    throw new Error('The questions\' route has ' + PP_mdlPlural_(result.unsupported.length, 'part') + ' the control ' +
      'panel cannot show, so nothing was changed. Fix ' + (result.unsupported.length === 1 ? 'it' : 'them') + ' in ' +
      'web/config/survey.json (docs/flow-engine.md explains the format), then try again. ' + list.join(' ') +
      (result.unsupported.length > 8 ? ' (and ' + (result.unsupported.length - 8) + ' more)' : ''));
  }
  return result.screens;
}

function PP_mdlScreenFromFlow_(entry) {
  return {
    id: entry.id, type: entry.type, text: entry.text,
    required: PP_mdlHas_(entry, 'required') ? entry.required : null,
    show_if: PP_mdlHas_(entry, 'show_if') ? entry.show_if : null,
    skip_if: entry.skip_if, options: entry.options, low_label: entry.low_label, high_label: entry.high_label,
    scale_hint: entry.scale_hint, body: entry.body, active: true
  };
}

function PP_mdlNewRound_(roundId) {
  return { id: roundId, status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '',
    notes: /demo/i.test(roundId) ? PP_MDL_DEMO_NOTE_ : '' };
}

/**
 * The four files for the GitHub copy (the form's backup when Google is slow),
 * in exactly the layout of the files in the project: { "survey.json": text,
 * "strings.json": text, "whats_changed.json": text, "audio_clips.json": text }.
 * The content is what Publish would publish (hidden items left out).
 * opts = { apps_script_url, config_version }: config_version is optional; it
 * defaults to the one remembered by an import or restore, else "draft".
 * Tip: pass the live version's config_version (for example "p7-2026-10-21")
 * when the draft equals the live version.
 */
function PP_exportStatic(model, opts) {
  const tidy = PP_normalizeModel(model);
  const options = PP_mdlIsObject_(opts) ? opts : {};
  const doc = PP_compile(tidy, null);
  const configVersion = PP_mdlTrim_(options.config_version) || tidy.config_version || 'draft';
  return {
    'survey.json': PP_mdlSurveyFileText_(doc.survey, PP_mdlTrim_(options.apps_script_url), configVersion),
    'strings.json': PP_mdlStringsFileText_(doc.strings),
    'whats_changed.json': JSON.stringify({ _help: PP_REPO_FILE_HELP['whats_changed.json'], rounds: doc.whats_changed }, null, 2) + '\n',
    'audio_clips.json': JSON.stringify({ _help: PP_REPO_FILE_HELP['audio_clips.json'], clips: doc.clips }, null, 2) + '\n'
  };
}

/**
 * survey.json, laid out exactly like the hand-written file: groups separated
 * by an empty line, one line per language and area, columns lined up. The
 * route ("flow") is the graph, written by Flow.gs (PP.flowPanel.formatFlow,
 * the same layout "python3 scripts/flow.py migrate" writes), with its own
 * note inside; the old list (one line per screen, then "_flow_help") is only
 * written for a survey whose flow is still a list.
 */
function PP_mdlSurveyFileText_(survey, appsScriptUrl, configVersion) {
  const help = PP_SURVEY_HELP;
  const line = (key, value) => JSON.stringify(key) + ': ' + PP_mdlInlineJson_(value);
  const block = (key, pairs) => JSON.stringify(key) + ': ' + PP_mdlBlockJson_(pairs, 2);
  const pairsOf = group => Object.keys(group || {}).map(name => [name, PP_mdlInlineJson_(group[name])]);
  const helpPair = name => ['_help', JSON.stringify(help[name + '._help'])];
  const section = name => block(name, [helpPair(name)].concat(pairsOf(survey[name])));
  const branding = survey.branding || {};
  // Without a web app address the form could not reach Google, and the
  // settings check (which GitHub runs before publishing the form) refuses
  // "apps_script" with an empty address. So the copy stays in test mode
  // ("mock"), like the project's own copy before go-live, and passes the check.
  const mode = appsScriptUrl ? 'apps_script' : 'mock';
  const backend = [helpPair('backend'), ['mode', JSON.stringify(mode)], ['mock_url', '"/api"'],
    ['apps_script_url', JSON.stringify(appsScriptUrl)]].concat(pairsOf(survey.backend));
  const groups = [
    [line('_help', help._help)],
    [line('survey_id', survey.survey_id), line('config_version', configVersion),
      line('_config_version_help', help._config_version_help)],
    [block('branding', [helpPair('branding'), ['logo', PP_mdlInlineJson_(branding.logo)],
      ['colors', PP_mdlBlockJson_(pairsOf(branding.colors), 4)]])],
    [block('backend', backend)],
    [block('links', [helpPair('links')].concat(pairsOf(PP_MDL_REPO_LINKS_)))],
    [JSON.stringify('languages') + ': ' + PP_mdlLinesJson_((survey.languages || []).map(PP_mdlInlineJson_), 2),
      line('_languages_help', help._languages_help), line('default_language', survey.default_language),
      line('fallback_language', survey.fallback_language), line('_fallback_language_help', help._fallback_language_help)],
    [section('navigation')],
    [section('rating')],
    [section('deep_dive')],
    [JSON.stringify('functions') + ': ' + PP_mdlLinesJson_(PP_mdlAreaLines_(survey.functions || []), 2),
      line('_functions_help', help._functions_help)],
    [section('support')],
    [section('voice')],
    [section('text')],
    [section('read_aloud')],
    [section('whats_changed')],
    [section('telemetry')],
    PP_mdlIsGraph_(survey.flow) ?
      [JSON.stringify('flow') + ': ' + PP_mdlFlowLib_().flowPanel.formatFlow(survey.flow, 2)] :
      [JSON.stringify('flow') + ': ' + PP_mdlLinesJson_(PP_mdlFlowLines_(PP_mdlList_(survey.flow)), 2),
        line('_flow_help', help._flow_help)]
  ];
  return '{\n' + groups.map(group => group.map(member => '  ' + member).join(',\n')).join(',\n\n') + '\n}\n';
}

/** strings.json: the note first, then one line per text, like the file in the project. */
function PP_mdlStringsFileText_(strings) {
  const lines = ['  "_help": ' + JSON.stringify(PP_REPO_FILE_HELP['strings.json'])];
  Object.keys(strings).forEach(key => {
    const values = strings[key];
    const inner = Object.keys(values).map(code => JSON.stringify(code) + ': ' + JSON.stringify(values[code])).join(', ');
    lines.push('  ' + JSON.stringify(key) + ': {' + inner + '}');
  });
  return '{\n' + lines.join(',\n') + '\n}\n';
}

/** A value on one line: [1, 2] and { "a": 1, "b": 2 }. */
function PP_mdlInlineJson_(value) {
  if (Array.isArray(value)) return '[' + value.map(PP_mdlInlineJson_).join(', ') + ']';
  if (PP_mdlIsObject_(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return '{ ' + keys.map(key => JSON.stringify(key) + ': ' + PP_mdlInlineJson_(value[key])).join(', ') + ' }';
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** A group with one member per line. pairs = [[name, value already written as text]]. */
function PP_mdlBlockJson_(pairs, indent) {
  if (!pairs.length) return '{}';
  const pad = ' '.repeat(indent + 2);
  return '{\n' + pairs.map(pair => pad + JSON.stringify(pair[0]) + ': ' + pair[1]).join(',\n') + '\n' + ' '.repeat(indent) + '}';
}

/** A list with one entry per line. */
function PP_mdlLinesJson_(lines, indent) {
  if (!lines.length) return '[]';
  const pad = ' '.repeat(indent + 2);
  return '[\n' + lines.map(text => pad + text).join(',\n') + '\n' + ' '.repeat(indent) + ']';
}

/** { "id": "losses",      "issues": [...] }  with the "issues" lined up. */
function PP_mdlAreaLines_(functions) {
  const width = functions.reduce((most, area) => Math.max(most, JSON.stringify(area.id).length), 0);
  return functions.map(area => {
    const id = JSON.stringify(area.id);
    let text = '{ "id": ' + id + ',' + ' '.repeat(Math.max(0, 1 + width - id.length)) + '"issues": ' + PP_mdlInlineJson_(area.issues);
    if (PP_mdlHas_(area, 'threshold')) text += ', "threshold": ' + PP_mdlInlineJson_(area.threshold);
    return text + ' }';
  });
}

/** { "id": "nps",           "type": "nps_0_10",        "text": ... }  with "type" and what follows lined up. */
function PP_mdlFlowLines_(flow) {
  const restOf = entry => Object.keys(entry).filter(key => key !== 'id' && key !== 'type');
  const idWidth = flow.reduce((most, entry) => Math.max(most, JSON.stringify(entry.id).length), 0);
  const typeWidth = flow.reduce((most, entry) => (restOf(entry).length ? Math.max(most, JSON.stringify(entry.type).length) : most), 0);
  return flow.map(entry => {
    const id = JSON.stringify(entry.id);
    const type = JSON.stringify(entry.type);
    const rest = restOf(entry).map(key => JSON.stringify(key) + ': ' + PP_mdlInlineJson_(entry[key]));
    let text = '{ "id": ' + id + ',' + ' '.repeat(Math.max(0, 1 + idWidth - id.length)) + '"type": ' + type;
    if (rest.length) text += ',' + ' '.repeat(Math.max(0, 1 + typeWidth - type.length)) + rest.join(', ');
    return text + ' }';
  });
}


// =============================================================================
// 10. Published versions: restore, live codes, texts the items need
// =============================================================================

/**
 * Turns a published document back into a model, for "Restore this version as
 * the draft" (contract section 10). It keeps from currentModel: the rounds,
 * the form address (form_url), any setting the old version did not have, and
 * the translators' notes of texts that still exist.
 *
 * A published version leaves out everything that was hidden, so restoring it
 * on its own would lose hidden things (and things added since). Therefore
 * everything the current draft has that the version lacks - a language, area,
 * problem, support question or question (built-in screens too) - comes back
 * SWITCHED OFF, in the place it has in the draft (right after the item it
 * follows there), with its texts and recordings; a language that comes back
 * keeps its translations. Nothing comes back switched on, so partners see
 * exactly the restored version until someone switches something on and
 * publishes. (A built-in kind of screen that the version already has is not
 * added a second time.)
 *
 * currentModel may be left out (everything then starts from the defaults).
 * todayIso (optional, default: today in India) dates the usual note "English
 * changed on ...: please re-check the translations." that a kept translation
 * gets when the restored English differs from the English it was made for.
 */
function PP_modelFromPublished(doc, currentModel, todayIso) {
  if (!PP_mdlIsCompiledDoc_(doc)) {
    throw new Error('This published version cannot be read: it is not a Partner Pulse questionnaire file. Choose ' +
      'another version, or ask whoever maintains the scripts.');
  }
  const current = PP_normalizeModel(currentModel);
  const restored = PP_importStatic({
    survey: doc.survey,
    strings: PP_mdlIsObject_(doc.strings) ? doc.strings : {},
    whats_changed: { rounds: PP_mdlIsObject_(doc.whats_changed) ? doc.whats_changed : {} },
    audio_clips: { clips: PP_mdlIsObject_(doc.clips) ? doc.clips : {} }
  });
  PP_SETTINGS_SCHEMA.forEach(entry => {
    if (entry.key === 'form_url' || PP_mdlGetPath_(doc.survey, entry.key) === undefined) {
      restored.settings[entry.key] = current.settings[entry.key];
    }
  });
  restored.rounds = current.rounds;
  const recheck = PP_mdlKeepHiddenItems_(restored, current);
  Object.keys(restored.texts).forEach(key => {
    restored.text_notes[key] = PP_mdlHas_(current.text_notes, key) ? current.text_notes[key] : '';
  });
  const today = PP_mdlDayText_(todayIso === undefined || todayIso === null ? new Date() : todayIso);
  recheck.forEach(key => { restored.text_notes[key] = PP_mdlEnglishChangedNote_(today, restored.text_notes[key]); });
  if (PP_mdlIsFilled_(doc.config_version)) restored.config_version = doc.config_version;
  return PP_normalizeModel(restored);
}

/**
 * Adds to the restored model, switched off, everything of the current draft
 * that the restored version lacks (see PP_modelFromPublished), with its texts.
 * Returns the texts whose kept translations need a re-check.
 */
function PP_mdlKeepHiddenItems_(restored, current) {
  const kept = { languages: [], areas: [], chips: [], support: [], screens: [] };
  const byField = field => item => item[field];
  restored.languages = PP_mdlMergeHidden_(restored.languages, current.languages, byField('code'), null, kept.languages);
  restored.areas = PP_mdlMergeHidden_(restored.areas, current.areas, byField('id'), null, kept.areas);
  restored.chips = PP_mdlMergeHiddenChips_(restored.chips, current.chips, kept.chips);
  restored.support = PP_mdlMergeHidden_(restored.support, current.support, byField('code'), null, kept.support);
  restored.screens = PP_mdlThanksLast_(PP_mdlMergeHidden_(restored.screens, current.screens, byField('id'),
    PP_mdlOnceOnly_(restored.screens), kept.screens));
  const keptKeys = PP_mdlKeepItemTexts_(restored, current, kept);
  const codes = PP_mdlUnique_(kept.languages.map(language => language.code)).filter(PP_mdlSafeKey_);
  PP_mdlKeepNewsTranslations_(restored, current, codes);
  PP_mdlKeepClips_(restored, current, codes, keptKeys);
  return PP_mdlKeepTranslations_(restored, current, codes, keptKeys);
}

/**
 * restoredList plus every item of currentList that it lacks (same key): each
 * one as a switched-off copy, placed right after the item it follows in
 * currentList (or first, when nothing before it is in restoredList). An item
 * without a key is always kept this way. canCarry (optional) can refuse an
 * item. Every kept copy is also added to "kept".
 */
function PP_mdlMergeHidden_(restoredList, currentList, keyOf, canCarry, kept) {
  const present = {};
  restoredList.forEach(item => { present['#' + keyOf(item)] = true; });
  const after = {};   // '#key' of a restored item -> the copies that follow it ('' = before everything)
  let anchor = '';
  currentList.forEach(item => {
    const key = keyOf(item);
    if (key && PP_mdlHas_(present, '#' + key)) {
      anchor = '#' + key;
      return;
    }
    if (canCarry && !canCarry(item)) return;
    const copy = PP_mdlCopy_(item);
    copy.active = false;
    kept.push(copy);
    if (!PP_mdlHas_(after, anchor)) after[anchor] = [];
    after[anchor].push(copy);
  });
  const merged = PP_mdlHas_(after, '') ? after[''].slice() : [];
  restoredList.forEach(item => {
    merged.push(item);
    const key = '#' + keyOf(item);
    if (!PP_mdlHas_(after, key)) return;
    after[key].forEach(copy => merged.push(copy));
    delete after[key];   // an item listed twice gets its followers only once
  });
  return merged;
}

/** Problems are matched within their own area, so a kept one lands next to its neighbours there. */
function PP_mdlMergeHiddenChips_(restoredChips, currentChips, kept) {
  const areas = [];
  restoredChips.concat(currentChips).forEach(chip => { if (areas.indexOf(chip.area) === -1) areas.push(chip.area); });
  return areas.reduce((all, area) => all.concat(PP_mdlMergeHidden_(
    restoredChips.filter(chip => chip.area === area), currentChips.filter(chip => chip.area === area),
    chip => chip.code, null, kept)), []);
}

/**
 * Built-in kinds of screen appear only once: one the restored version
 * already has is not kept twice. Thank-you screens are the exception: there
 * may be several endings, so the draft's other endings are kept (hidden).
 */
function PP_mdlOnceOnly_(restoredScreens) {
  const taken = {};
  restoredScreens.forEach(screen => { if (PP_mdlIsBuiltin_(screen.type)) taken['#' + screen.type] = true; });
  return screen => {
    if (!PP_mdlIsBuiltin_(screen.type) || screen.type === 'thank_you') return true;
    if (PP_mdlHas_(taken, '#' + screen.type)) return false;
    taken['#' + screen.type] = true;
    return true;
  };
}

/**
 * A kept (switched-off) screen does not end up after the main thank-you
 * screen, so that switching it on later puts it on the usual route. Rows
 * after the thank-you that belong to another route (an ending, or a row some
 * jump or "next" goes to) stay where they are: that is where they were in
 * the draft.
 */
function PP_mdlThanksLast_(screens) {
  let at = -1;
  screens.forEach((screen, index) => { if (at < 0 && screen.type === 'thank_you' && screen.active) at = index; });
  const after = at < 0 ? [] : screens.slice(at + 1);
  if (!after.length || after.some(screen => screen.active)) return screens;
  const targets = {};
  screens.forEach(screen => {
    if (PP_mdlIsFilled_(screen.next)) targets['#' + screen.next.trim()] = true;
    PP_mdlList_(screen.jumps).forEach(jump => { if (PP_mdlIsFilled_(jump.goto)) targets['#' + jump.goto.trim()] = true; });
  });
  if (after.some(screen => screen.type === 'thank_you' || PP_mdlHas_(targets, '#' + screen.id))) return screens;
  return screens.slice(0, at).concat(after, [screens[at]]);
}

/**
 * The texts the kept items use, copied from the draft when the restored
 * version does not have them (the version's own wording wins when it has
 * them). Returns the copied keys.
 */
function PP_mdlKeepItemTexts_(restored, current, kept) {
  const keys = {};
  const keep = key => {
    if (!PP_mdlIsFilled_(key) || !PP_mdlSafeKey_(key) || PP_mdlHas_(restored.texts, key) ||
      !PP_mdlHas_(current.texts, key)) return;
    restored.texts[key] = PP_mdlCopy_(current.texts[key]);
    keys[key] = true;
  };
  kept.areas.forEach(area => { keep('fn.' + area.id + '.name'); keep('fn.' + area.id + '.help'); });
  kept.chips.forEach(chip => keep('issue.' + chip.area + '.' + chip.code));
  kept.support.forEach(item => keep('support.' + item.code));
  kept.screens.forEach(screen => {
    PP_MDL_SCREEN_TEXT_FIELDS_.forEach(field => keep(screen[field]));
    screen.options.forEach(option => keep('choice.' + screen.id + '.' + option));
  });
  return keys;
}

/**
 * A language that comes back keeps its translations of the restored texts.
 * Returns the texts where a kept (real) translation was made for different
 * English than the restored one: they need a re-check.
 */
function PP_mdlKeepTranslations_(restored, current, codes, keptKeys) {
  const recheck = [];
  if (!codes.length) return recheck;
  Object.keys(restored.texts).forEach(key => {
    if (PP_mdlHas_(keptKeys, key) || !PP_mdlHas_(current.texts, key)) return;   // copied whole, or nothing to keep
    const before = current.texts[key];
    let real = false;
    codes.forEach(code => {
      if (!PP_mdlIsFilled_(before[code])) return;
      restored.texts[key][code] = before[code];
      if (!PP_mdlNeedsTranslation_(before[code])) real = true;
    });
    if (real && PP_mdlTrim_(before.en) !== PP_mdlTrim_(restored.texts[key].en)) recheck.push(key);
  });
  return recheck;
}

/** "What changed" items keep a returning language's translation when their English is the same. */
function PP_mdlKeepNewsTranslations_(restored, current, codes) {
  if (!codes.length) return;
  Object.keys(restored.whats_changed).forEach(roundId => {
    const before = PP_mdlHas_(current.whats_changed, roundId) ? current.whats_changed[roundId] : [];
    restored.whats_changed[roundId].forEach(item => {
      const english = PP_mdlTrim_(item.en);
      const same = english ? before.filter(old => PP_mdlTrim_(old.en) === english)[0] : null;
      if (same) codes.forEach(code => { if (PP_mdlIsFilled_(same[code])) item[code] = same[code]; });
    });
  });
}

/** The recordings of kept texts, and those of a returning language, are kept too. */
function PP_mdlKeepClips_(restored, current, codes, keptKeys) {
  Object.keys(current.clips).forEach(key => {
    Object.keys(current.clips[key]).forEach(lang => {
      if (!PP_mdlHas_(keptKeys, key) && codes.indexOf(lang) === -1) return;
      if (!PP_mdlHas_(restored.clips, key)) restored.clips[key] = {};
      if (!PP_mdlHas_(restored.clips[key], lang)) restored.clips[key][lang] = current.clips[key][lang];
    });
  });
}

/**
 * The codes partners answered in a published version:
 * { screens: [ids], areas: [ids], chips: { area: [codes] }, support: [codes],
 *   options: { screen: [codes] } }. Empty lists when doc is null.
 * The route may be the old list or a graph: then "screens" holds every
 * screen's code (group bodies included; a group itself is no code) and the
 * start of every answer key (store_as "cb:{area}" gives "cb") that is not
 * already its screen's code or a built-in key (fn_rating, fn_deep_dive).
 * everLive (optional): every code partners answered since the first real
 * round (Script Property CODES_EVER_LIVE, see PP_mdlCodesOfDoc_), added after
 * the document's own codes.
 */
function PP_liveIds(doc, everLive) {
  const ids = { screens: [], areas: [], chips: {}, support: [], options: {} };
  const survey = PP_mdlIsObject_(doc) && PP_mdlIsObject_(doc.survey) ? doc.survey : null;
  if (survey) {
    const screen = (code, options) => {
      if (!PP_mdlIsFilled_(code) || !PP_mdlSafeKey_(code)) return;
      if (ids.screens.indexOf(code) === -1) ids.screens.push(code);
      const list = (Array.isArray(options) ? options : [])
        .map(option => (PP_mdlIsObject_(option) ? option.code : option)).filter(PP_mdlIsFilled_);
      if (list.length) ids.options[code] = list;
    };
    if (PP_mdlIsGraph_(survey.flow)) {
      PP_mdlGraphNodes_(survey.flow).forEach(node => {
        screen(node.id, node.options);
        const prefix = PP_mdlStorePrefix_(node);
        const implied = PP_mdlHas_(PP_MDL_IMPLIED_PREFIX_, node.type) ? PP_MDL_IMPLIED_PREFIX_[node.type] : node.id;
        if (prefix && prefix !== node.id && prefix !== implied) screen(prefix, null);
      });
    } else {
      PP_mdlList_(survey.flow).forEach(entry => screen(entry.id, entry.options));
    }
    PP_mdlList_(survey.functions).forEach(area => {
      if (!PP_mdlIsFilled_(area.id) || !PP_mdlSafeKey_(area.id)) return;
      if (ids.areas.indexOf(area.id) === -1) ids.areas.push(area.id);
      ids.chips[area.id] = (Array.isArray(area.issues) ? area.issues : []).filter(PP_mdlIsFilled_);
    });
    const support = PP_mdlIsObject_(survey.support) && Array.isArray(survey.support.items) ? survey.support.items : [];
    ids.support = support.filter(PP_mdlIsFilled_);
  }
  if (Array.isArray(everLive)) PP_mdlAddIds_(ids, PP_mdlIdsOfCodes_(everLive));
  return ids;
}

/**
 * A published version's codes as one flat list, the form kept in the Script
 * Property CODES_EVER_LIVE: "screen:<code>", "area:<code>",
 * "chip:<area>/<code>", "support:<code>", "option:<screen>/<code>".
 */
function PP_mdlCodesOfDoc_(doc) {
  const ids = PP_liveIds(doc);
  const out = [];
  ids.screens.forEach(code => out.push('screen:' + code));
  ids.areas.forEach(code => out.push('area:' + code));
  Object.keys(ids.chips).forEach(area => ids.chips[area].forEach(code => out.push('chip:' + area + '/' + code)));
  ids.support.forEach(code => out.push('support:' + code));
  Object.keys(ids.options).forEach(screen => ids.options[screen].forEach(code => out.push('option:' + screen + '/' + code)));
  return out;
}

/** Two flat code lists together: the first one's order, then what only the second has. */
function PP_mdlMergeCodes_(first, second) {
  const out = [];
  const seen = {};
  (Array.isArray(first) ? first : []).concat(Array.isArray(second) ? second : []).forEach(code => {
    if (typeof code !== 'string' || !code || PP_mdlHas_(seen, '#' + code)) return;
    seen['#' + code] = true;
    out.push(code);
  });
  return out;
}

/** A flat code list (PP_mdlCodesOfDoc_) back in the shape of PP_liveIds. Unknown entries are skipped. */
function PP_mdlIdsOfCodes_(codes) {
  const ids = { screens: [], areas: [], chips: {}, support: [], options: {} };
  (Array.isArray(codes) ? codes : []).forEach(entry => {
    const text = typeof entry === 'string' ? entry : '';
    const colon = text.indexOf(':');
    const kind = text.slice(0, colon);
    const rest = text.slice(colon + 1);
    const slash = rest.indexOf('/');
    if (colon < 1 || !rest || !PP_mdlSafeKey_(rest)) return;
    if (kind === 'screen') ids.screens.push(rest);
    else if (kind === 'area') ids.areas.push(rest);
    else if (kind === 'support') ids.support.push(rest);
    else if ((kind === 'chip' || kind === 'option') && slash > 0) {
      const owner = rest.slice(0, slash);
      const code = rest.slice(slash + 1);
      const group = kind === 'chip' ? ids.chips : ids.options;
      if (!code || !PP_mdlSafeKey_(owner)) return;
      if (!PP_mdlHas_(group, owner)) group[owner] = [];
      group[owner].push(code);
    }
  });
  return ids;
}

/** Adds the codes of "more" to ids (both in the shape of PP_liveIds), without repeats. */
function PP_mdlAddIds_(ids, more) {
  const add = (list, code) => { if (list.indexOf(code) === -1) list.push(code); };
  more.screens.forEach(code => add(ids.screens, code));
  more.areas.forEach(code => add(ids.areas, code));
  more.support.forEach(code => add(ids.support, code));
  ['chips', 'options'].forEach(group => {
    Object.keys(more[group]).forEach(owner => {
      if (!PP_mdlHas_(ids[group], owner)) ids[group][owner] = [];
      more[group][owner].forEach(code => add(ids[group][owner], code));
    });
  });
  return ids;
}

/**
 * The text keys the items that are switched on need (contract section 6):
 * fn.<area>.name/.help, issue.<area>.<code> (+ issue.other), support.<code>,
 * support.not_applicable and the comment question when they are on, and each
 * screen's texts (with choice.<screen>.<option>). The form's own texts
 * (PP_FORM_TEXT_KEYS) are not included.
 */
function PP_derivedTextKeys(model) {
  return Object.keys(PP_mdlTextKeyReasons_(PP_normalizeModel(model), false));
}


// =============================================================================
// 11. Helpers for the control panel: translation help on save, new codes
// =============================================================================

/**
 * The translation helpers applied when the panel saves (contract section 13,
 * panelSave). Returns a tidy copy of newModel in which:
 *   - an empty translation of a text that has English becomes
 *     "[TRANSLATE] " + the English;
 *   - a translation that still starts with [TRANSLATE] is updated to the
 *     current English;
 *   - when the English changed (compared with oldModel, the draft as saved
 *     before) and a real translation exists, the text's note says
 *     "English changed on <date>: please re-check the translations." (any
 *     other note is kept after it).
 * The "What changed" bullets get the same [TRANSLATE] help (they have no notes).
 * todayIso = today's date in India, "yyyy-MM-dd" (a Date or a full ISO time
 * also works). Argument order: OLD model first, NEW model second.
 *
 * Safety net: the model read from the Sheet (PP_readModel) is always the OLD
 * one. If a caller passes it SECOND and the other model first, the two are
 * swapped (and a line is logged), so a save can never throw away the edits
 * someone just made.
 */
function PP_applyTranslationHelpers(oldModel, newModel, todayIso) {
  const swap = PP_mdlFromSheet_(newModel) && !PP_mdlFromSheet_(oldModel);
  if (swap) {
    console.log('Partner Pulse: PP_applyTranslationHelpers got the saved draft as its second argument; ' +
      'treating it as the old model (the argument order is old, new).');
  }
  const before = PP_normalizeModel(swap ? newModel : oldModel);
  const model = PP_normalizeModel(swap ? oldModel : newModel);
  const today = PP_mdlDayText_(todayIso);
  const others = PP_mdlLanguageCodes_(model.languages, false).filter(code => code !== 'en');
  Object.keys(model.texts).forEach(key => {
    const values = model.texts[key];
    const english = PP_mdlText_(values.en);
    if (!english.trim()) return;
    PP_mdlMarkUntranslated_(values, others, english);
    const oldEnglish = PP_mdlHas_(before.texts, key) ? PP_mdlText_(before.texts[key].en).trim() : '';
    const changed = oldEnglish !== '' && oldEnglish !== english.trim();
    if (changed && others.some(code => !PP_mdlNeedsTranslation_(values[code]))) {
      model.text_notes[key] = PP_mdlEnglishChangedNote_(today, model.text_notes[key]);
    }
  });
  Object.keys(model.whats_changed).forEach(roundId => {
    model.whats_changed[roundId].forEach(bullet => {
      const english = PP_mdlText_(bullet.en);
      if (english.trim()) PP_mdlMarkUntranslated_(bullet, others, english);
    });
  });
  return model;
}

/** True for a model that PP_readModel returned (the draft as saved in the Sheet). */
function PP_mdlFromSheet_(model) {
  return Boolean(model && model.PP_fromSheet === true);
}

/** Empty or [TRANSLATE] values become "[TRANSLATE] " + the current English. */
function PP_mdlMarkUntranslated_(values, codes, english) {
  codes.forEach(code => {
    const value = values[code];
    if (!PP_mdlIsFilled_(value) || /^\s*\[TRANSLATE\]/.test(value)) values[code] = PP_MDL_TAG_ + ' ' + english;
  });
}

/** One "English changed" sentence, with any other note kept after it. */
function PP_mdlEnglishChangedNote_(today, note) {
  const sentence = 'English changed on ' + today + ': please re-check the translations.';
  const rest = PP_mdlText_(note).replace(/English changed on [^:]*: please re-check the translations\.\s*/g, '').trim();
  return rest ? sentence + ' ' + rest : sentence;
}

function PP_mdlDayText_(value) {
  if (PP_mdlIsDate_(value)) return PP_dateIST(value);
  const text = PP_mdlTrim_(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return PP_dateIST(text) || text;
}

/**
 * A new code made from a text (contract section 6): lowercase, every run of
 * other characters becomes "_", no "_" at either end, at most 40 characters,
 * "n" in front if it starts with a digit, "item" if nothing is left, and
 * "_2", "_3" ... added until it is not in takenList. Same rule as the
 * control panel uses in the browser.
 */
function PP_slug(text, takenList) {
  let base = PP_mdlText_(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  base = base.slice(0, 40).replace(/_+$/, '');
  if (/^[0-9]/.test(base)) base = 'n' + base;
  if (!base) base = 'item';
  const taken = {};
  const list = Array.isArray(takenList) ? takenList : Object.keys(PP_mdlIsObject_(takenList) ? takenList : {});
  list.forEach(item => { taken['#' + PP_mdlText_(item)] = true; });
  if (!taken['#' + base]) return base;
  let n = 2;
  while (taken['#' + base + '_' + n]) n++;
  return base + '_' + n;
}
