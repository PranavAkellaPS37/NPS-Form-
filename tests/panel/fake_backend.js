/* =============================================================================
   fake_backend.js: an in-memory stand-in for apps-script/PanelServer.gs (and the bits
   of Model.gs it needs), so apps-script/Panel.html can be tested in a normal
   browser. Developer test helper in tests/panel/; never published.

   - Builds the starting model from the repo's web/config/survey.json,
     web/i18n/strings.json, web/config/whats_changed.json, audio_clips.json
     (a small version of PP_importStatic).
   - Implements every panel* function with the return shapes of
     docs/control-panel-design.md section 13, including save conflicts,
     the translation helpers on save, publish / history / restore, rounds,
     link generation (same token formula as the real backend) and export.
   - Validation is a reduced PP_validate: enough errors and warnings, in the
     contract's { section, ref, message } shape, to exercise the panel.
   - Only fake data: DCs are DC-DEMO-001 ... and the secret is a bench secret.
   - Like PanelServer.gs (October 2026): panelLoad also sends codes_locked (false
     until a round has opened; live_ids are then empty), web_app_url ('' until
     recorded) and web_app_url_recorded; panelSetWebAppUrl checks and records the
     address; panelNewPreviewKey exists. The bench starts with no address recorded.
   - Since stage 4 of the flow-graph work (26 Oct 2026), like PanelServer.gs:
       panelFlowCode    the route code for the panel window: PP_FLOW_SOURCE_ and
                        PP_FLOW_FINGERPRINT_ read from the repo's real
                        apps-script/Flow.gs (made by scripts/build_flow_gs.js)
       panelFlowStatus  does "the form" run the same route code? By default the
                        form is the repo's own web/js files (SHA-256 the same way
                        build_flow_gs.js computes it); the bench can pretend
                        another fingerprint or an unreachable form
                        (setFormFlow, POST /control/flow_status)
       panelLiveSurvey  the live version's survey and strings, for the Map
   - Since the reviewers' fixes (26 Oct 2026): panelPublish can answer
     "warnings" like PP_publish does (the bench sets them: setPublishWarnings,
     POST /control/publish_warnings), the bench can put a whole draft in the
     Sheet at once (setModel, POST /control/model), and panelExport brings
     docs/flow.md ("flow.md") because it is the real Model.gs PP_exportStatic.
   - Also since 26 Oct 2026: the bench can hand the panel an OLDER route code
     (setFlowCode('older'), POST /control/flow_code {older: true}): the
     repo's Flow.gs as it was before the checker said where each finding is
     and had answersAt, so the panel's fallbacks are tested; or one whose
     answersAt fails (setFlowCode('failing'), {failing: true}); and another list
     of kinds of screen (setScreenTypes, POST /control/screen_types {types}),
     for example the one "node scripts/flow.js types --write" makes with a
     kind added in web/js/types/ (its row carries the kind's "catalogue").
   - Since 27 Oct 2026 ("Paste a route"): the bench can also hand the panel a
     route code from before the route table (setFlowCode('no_table'), POST
     /control/flow_code {noTable: true}): the repo's Flow.gs without
     PP.flowPanel.fromTable, so the panel must say the Flow file needs updating.
   - Since the 27 Oct 2026 review (W8):
       panelRouteTable  the route table's tools on the server, for a window that
                        can't run the route code: the REAL PanelServer.gs
                        function, run with the real Model.gs and Flow.gs in a
                        fresh space for every call, as Google does
                        (real_server.js). A list of kinds set with
                        setScreenTypes stands for a Model.gs made with them
                        (its PP_ADDED_TYPES_).
       setFlowCode('refused')  the window gets route code that refuses to run
                        (as if Google's window refused it; POST
                        /control/flow_code {refused: true}); the server still
                        runs the real Flow.gs. 'refused_no_table' ({refused:
                        true, noTable: true}): and the server's Flow.gs is from
                        before the route table too ('no_table' also takes the
                        table from the server's Flow.gs).
       panelLoad's live_ids.kinds  the live version's kinds, from the real
                        PanelServer.gs PP_liveIdsOf_ (Model.gs PP_mdlLiveKinds_;
                        only while codes are locked).
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const REPO = process.env.PP_REPO || path.resolve(__dirname, '..', '..');   // the project folder
/* When apps-script/Model.gs exists, the bench uses its REAL logic (catalogue,
   import, normaliser, validator, compiler, translation helpers, restore,
   export). Set PP_STANDIN=1 to use the stand-ins in this file instead. */
const REAL = process.env.PP_STANDIN ? null : require('./real_model').loadRealModel(REPO);
/* PanelServer.gs's own functions, with the real Model.gs and Flow.gs (a fresh space per use). */
const { loadRealServer } = require('./real_server');
const FORM_URL = 'https://pranavakellaps37.github.io/NPS-Form-/';

const C = (key, def, help) => ({ key, type: 'color', default: def, group: 'Look & feel', help });
const SETTINGS_SCHEMA = [
  { key: 'survey_id', type: 'text', default: 'valmo-partner-pulse', group: 'Form address', help: 'The survey’s code. It is stamped on every answer. Change it only before launch.' },
  { key: 'form_url', type: 'url', default: FORM_URL, group: 'Form address', help: 'Where the form lives (GitHub Pages). Used to build partner links and the preview. Must start with https:// and end with /.' },
  { key: 'default_language', type: 'lang', default: 'en', group: 'Languages', help: 'The language the form starts in when the link does not say one.' },
  { key: 'fallback_language', type: 'lang', default: 'en', group: 'Languages', help: 'Shown when a text is not translated yet.' },
  { key: 'branding.logo', type: 'text', default: '', group: 'Look & feel', help: 'An https address, or a path inside web/. Empty = show the product name.' },
  C('branding.colors.primary', '#4B2E83', 'Buttons and selected answers.'),
  C('branding.colors.on_primary', '#FFFFFF', 'Text on buttons.'),
  C('branding.colors.background', '#FFFFFF', 'Page background.'),
  C('branding.colors.surface', '#F3F0F8', 'Answer buttons.'),
  C('branding.colors.text', '#1B1B1F', 'Main text.'),
  C('branding.colors.muted', '#5F5E6B', 'Secondary text.'),
  C('branding.colors.border', '#D9D4E3', 'Outlines.'),
  C('branding.colors.error', '#B3261E', 'Error messages.'),
  C('branding.colors.success', '#1B7F3B', 'Success messages.'),
  { key: 'navigation.auto_advance', type: 'bool', default: true, group: 'Moving between screens', help: 'Move to the next screen as soon as a one-tap question is answered.' },
  { key: 'navigation.auto_advance_delay_ms', type: 'int', default: 350, min: 0, max: 2000, group: 'Moving between screens', help: 'A short pause so partners see what they tapped (1000 = one second).' },
  { key: 'rating.faces', type: 'faces', default: '😠 🙁 😐 🙂 😄', group: 'Ratings', help: 'Five faces from worst to best, separated by spaces.' },
  { key: 'rating.allow_not_applicable', type: 'bool', default: true, group: 'Ratings', help: 'Adds a small “I don’t handle this” option under area ratings.' },
  { key: 'deep_dive.threshold', type: 'int', default: 3, min: 1, max: 5, group: 'Problem screens', help: 'Areas rated at or below this get a “main problem” screen.' },
  { key: 'deep_dive.when', type: 'choice', default: 'after_all_ratings', options: ['after_all_ratings', 'immediate'], group: 'Problem screens', help: 'Ask about problems after all ratings (recommended) or right after each low rating.' },
  { key: 'deep_dive.require_chip', type: 'bool', default: true, group: 'Problem screens', help: 'Partners must pick a problem before Next.' },
  { key: 'deep_dive.require_detail_if_other', type: 'bool', default: true, group: 'Problem screens', help: 'Picking Other needs a voice note or typed detail.' },
  { key: 'support.allow_not_applicable', type: 'bool', default: false, group: 'Support questions', help: 'Adds “Doesn’t apply” to each support row.' },
  { key: 'support.allow_comment', type: 'bool', default: true, group: 'Support questions', help: 'Adds an optional voice or typed comment after the support ratings.' },
  { key: 'support.comment_text', type: 'key', default: 'q.support_comment', group: 'Support questions', help: 'The text used as the comment question.' },
  { key: 'voice.enabled', type: 'bool', default: true, group: 'Voice notes', help: 'Let partners record voice notes.' },
  { key: 'voice.gesture', type: 'choice', default: 'hold', options: ['hold', 'tap'], group: 'Voice notes', help: 'Hold the button to record, or tap to start and tap to stop.' },
  { key: 'voice.max_seconds', type: 'int', default: 60, min: 5, max: 300, group: 'Voice notes', help: 'Longest voice note, in seconds.' },
  { key: 'voice.min_seconds', type: 'number', default: 1, min: 0, group: 'Voice notes', help: 'Shorter notes are thrown away as accidental taps.' },
  { key: 'voice.bitrate', type: 'int', default: 16000, min: 6000, max: 64000, group: 'Voice notes', help: '16000 keeps a 60-second note around 120 KB.' },
  { key: 'voice.mime_types', type: 'list', default: 'audio/webm;codecs=opus, audio/ogg;codecs=opus, audio/webm, audio/mp4', group: 'Voice notes', help: 'Audio formats to try, best first, separated by commas.' },
  { key: 'text.max_chars', type: 'int', default: 1500, min: 50, max: 10000, group: 'Typing', help: 'Longest typed answer.' },
  { key: 'read_aloud.enabled', type: 'bool', default: true, group: 'Read aloud', help: 'Show the speaker button on each question.' },
  { key: 'whats_changed.timeout_seconds', type: 'number', default: 4, min: 1, max: 20, group: 'What changed', help: 'How long the phone waits for the latest questionnaire before using the GitHub copy.' },
  { key: 'telemetry.enabled', type: 'bool', default: true, group: 'Progress messages', help: 'Small messages that show where partners stop. They never contain answers.' },
  { key: 'backend.request_timeout_seconds', type: 'number', default: 90, min: 10, max: 600, group: 'Sending', help: 'How long one send may take before it is tried again.' },
  { key: 'backend.slow_upload_bytes_per_second', type: 'number', default: 1000, min: 100, max: 100000, group: 'Sending', help: 'The slowest upload speed to allow for (1000 = very weak 2G).' },
  { key: 'backend.retry_delays_seconds', type: 'numlist', default: '2, 5, 10, 20, 40, 60, 60, 120, 120, 300', group: 'Sending', help: 'Waits before each automatic re-try, separated by commas.' }
];

const SCREEN_TYPES = [
  { type: 'language_picker', label: 'Language choice', description: 'Partners pick their language. Skipped when the link already says it.', builtin: true, needs_text: false, fields: ['skip_if'] },
  { type: 'whats_changed', label: 'What changed', description: 'Shows what Valmo changed since the last round.', builtin: true, needs_text: false, fields: ['skip_if'] },
  { type: 'function_ratings', label: 'Area ratings', description: 'One faces screen for each area.', builtin: true, needs_text: false, fields: [] },
  { type: 'function_deep_dives', label: 'Problem screens', description: '“What is the main problem?” for each area rated low.', builtin: true, needs_text: false, fields: [] },
  { type: 'support_block', label: 'Support ratings', description: 'Partners rate the support items on one screen.', builtin: true, needs_text: true, fields: [] },
  { type: 'thank_you', label: 'Thank you', description: 'The last screen. It sends the answers.', builtin: true, needs_text: false, fields: [] },
  { type: 'nps_0_10', label: '0 to 10 scale', description: 'Numbers from 0 to 10, like “How likely are you to recommend…”.', builtin: false, needs_text: true, fields: ['low_label', 'high_label', 'scale_hint', 'required'] },
  { type: 'rating_1_5', label: 'Faces rating (1 to 5)', description: 'Five faces, from very bad to very good.', builtin: false, needs_text: true, fields: ['required'] },
  { type: 'yes_no', label: 'Yes / No question', description: 'Two big buttons: Yes and No.', builtin: false, needs_text: true, fields: ['required'] },
  { type: 'single_choice', label: 'Pick one answer', description: 'A list of answers. The partner taps one.', builtin: false, needs_text: true, fields: ['options', 'required'] },
  { type: 'free_text', label: 'Voice note or typing', description: 'The partner records a voice note or types an answer.', builtin: false, needs_text: true, fields: ['required'] },
  { type: 'info_card', label: 'Information card', description: 'A message with no answer, for example an instruction.', builtin: false, needs_text: true, fields: ['body'] }
];
const TYPES = Object.fromEntries(SCREEN_TYPES.map((t) => [t.type, t]));

/* The keys the form's code uses directly: FIXED_STRING_KEYS in scripts/check_config.py. */
function readFormTextKeys() {
  const src = fs.readFileSync(path.join(REPO, 'scripts/check_config.py'), 'utf8');
  const m = /FIXED_STRING_KEYS = """([\s\S]*?)"""/.exec(src);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}
const FORM_TEXT_KEYS = readFormTextKeys();

/* ---- small helpers ---------------------------------------------------------- */
const clone = (x) => JSON.parse(JSON.stringify(x));
const nowIso = () => new Date().toISOString();
function getPath(o, key) { return key.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o); }
function setPath(o, key, v) {
  const parts = key.split('.');
  let cur = o;
  parts.slice(0, -1).forEach((k) => { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
  cur[parts[parts.length - 1]] = v;
}
function istDate(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 10);
}
const isTodo = (v) => !v || !String(v).trim() || String(v).trim().startsWith('[TRANSLATE]');
const placeholders = (t) => (String(t || '').match(/\{[A-Za-z0-9_]+\}/g) || []).sort().join(' ');

function readRepoFiles() {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, 'web', rel), 'utf8'));
  return { survey: read('config/survey.json'), strings: read('i18n/strings.json'), whats_changed: read('config/whats_changed.json'), audio_clips: read('config/audio_clips.json') };
}

/* ---- The route code (Flow.gs) and "the form's" copy of it --------------------- */
/* PP_FLOW_SOURCE_ and PP_FLOW_FINGERPRINT_ of the repo's real apps-script/Flow.gs
   (read on every call, so a freshly built Flow.gs is used at once). */
function readFlowGs() {
  const file = path.join(REPO, 'apps-script', 'Flow.gs');
  if (!fs.existsSync(file)) return null;
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'Flow.gs' });
  return { source: vm.runInContext('PP_FLOW_SOURCE_', ctx), fingerprint: vm.runInContext('PP_FLOW_FINGERPRINT_', ctx) };
}
/* The SHA-256 of the form's route files as scripts/build_flow_gs.js computes it:
   web/js/flow.js, flow-panel.js, flow-check.js, their bytes one after the other. */
function repoFormFingerprint() {
  const hash = crypto.createHash('sha256');
  ['flow.js', 'flow-panel.js', 'flow-check.js'].forEach((f) => {
    const file = path.join(REPO, 'web', 'js', f);
    if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  });
  return hash.digest('hex');
}

/* ---- PP_importStatic (reduced) --------------------------------------------- */
function importStatic(files) {
  const sv = files.survey;
  const settings = {};
  for (const sc of SETTINGS_SCHEMA) {
    if (sc.key === 'form_url') { settings[sc.key] = sc.default; continue; }
    let v = getPath(sv, sc.key);
    if (v === undefined) v = sc.default;
    if (sc.type === 'faces' && Array.isArray(v)) v = v.join(' ');
    if ((sc.type === 'list' || sc.type === 'numlist') && Array.isArray(v)) v = v.join(', ');
    settings[sc.key] = v;
  }
  const languages = sv.languages.map((l) => ({ code: l.code, bcp47: l.bcp47, native_name: l.native_name, active: true }));
  const areas = sv.functions.map((f) => ({ id: f.id, threshold: typeof f.threshold === 'number' ? f.threshold : null, active: true }));
  const chips = [];
  sv.functions.forEach((f) => f.issues.forEach((code) => chips.push({ area: f.id, code, active: true })));
  const support = sv.support.items.map((code) => ({ code, active: true }));
  /* Since 26 Oct 2026 the repo's flow may be the graph: the form's own converter makes it rows. */
  const lines = Array.isArray(sv.flow) ? sv.flow : require(path.join(REPO, 'web', 'js', 'flow-panel.js')).toRows(sv.flow, sv).screens;
  const screens = lines.map((e) => ({
    id: e.id, type: e.type, text: e.text || '', required: typeof e.required === 'boolean' ? e.required : null,
    show_if: e.show_if || null, skip_if: e.skip_if || '', options: e.options || [], low_label: e.low_label || '',
    high_label: e.high_label || '', scale_hint: e.scale_hint || '', body: e.body || '', active: true
  }));
  const texts = {}, text_notes = {};
  for (const [k, v] of Object.entries(files.strings)) { if (k.startsWith('_')) continue; texts[k] = Object.assign({}, v); text_notes[k] = ''; }
  const wc = (files.whats_changed && files.whats_changed.rounds) || {};
  const whats_changed = {};
  for (const [r, b] of Object.entries(wc)) whats_changed[r] = (b.items || []).map((it) => Object.assign({}, it));
  const clips = Object.assign({}, (files.audio_clips && files.audio_clips.clips) || {});
  const rounds = Object.keys(wc).map((id) => ({ id, status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: id.includes('DEMO') ? 'Fake demo content: never use for real links' : '' }));
  return { settings, languages, areas, chips, support, screens, texts, text_notes, whats_changed, clips, rounds };
}

/* ---- PP_compile (reduced, deterministic) ----------------------------------- */
function fillLangs(row, codes) {
  const o = {};
  codes.forEach((c) => { const v = row[c]; o[c] = v && String(v).trim() ? v : '[TRANSLATE] ' + (row.en || ''); });
  return o;
}
function compile(model, stamp) {
  const act = model.languages.filter((l) => l.active);
  const codes = act.map((l) => l.code);
  const s = model.settings;
  const survey = { survey_id: s.survey_id, config_version: stamp ? 'p' + stamp.version + '-' + istDate(stamp.published_at) : 'draft' };
  for (const sc of SETTINGS_SCHEMA) {
    if (['form_url', 'survey_id', 'default_language', 'fallback_language'].includes(sc.key) || sc.key.startsWith('support.')) continue;
    let v = s[sc.key];
    if (v === undefined) v = sc.default;
    if (sc.type === 'faces') v = Array.isArray(v) ? v : String(v).trim().split(/\s+/);
    if (sc.type === 'list') v = Array.isArray(v) ? v : String(v).split(',').map((x) => x.trim()).filter(Boolean);
    if (sc.type === 'numlist') v = Array.isArray(v) ? v : String(v).split(',').map((x) => Number(x.trim())).filter((x) => !isNaN(x));
    setPath(survey, sc.key, v);
  }
  survey.languages = act.map((l) => ({ code: l.code, bcp47: l.bcp47, native_name: l.native_name }));
  survey.default_language = s.default_language;
  survey.fallback_language = s.fallback_language;
  survey.functions = model.areas.filter((a) => a.active).map((a) => {
    const f = { id: a.id, issues: model.chips.filter((c) => c.area === a.id && c.active).map((c) => c.code) };
    if (typeof a.threshold === 'number') f.threshold = a.threshold;
    return f;
  });
  survey.support = { items: model.support.filter((x) => x.active).map((x) => x.code), allow_not_applicable: !!s['support.allow_not_applicable'], allow_comment: !!s['support.allow_comment'], comment_text: s['support.comment_text'] };
  survey.flow = model.screens.filter((x) => x.active).map((x) => {
    const e = { id: x.id, type: x.type };
    if (x.text) e.text = x.text;
    if (typeof x.required === 'boolean') e.required = x.required;
    if (x.show_if && typeof x.show_if === 'object') e.show_if = x.show_if;
    if (x.skip_if) e.skip_if = x.skip_if;
    if (x.options && x.options.length) e.options = x.options;
    ['low_label', 'high_label', 'scale_hint', 'body'].forEach((f) => { if (x[f]) e[f] = x[f]; });
    return e;
  });
  const strings = {};
  for (const [k, row] of Object.entries(model.texts)) strings[k] = fillLangs(row, codes);
  const whats_changed = {};
  for (const [r, items] of Object.entries(model.whats_changed)) whats_changed[r] = { title: null, items: items.map((it) => fillLangs(it, codes)) };
  const clips = {};
  for (const [k, m] of Object.entries(model.clips || {})) {
    const o = {};
    codes.forEach((c) => { if (m && m[c]) o[c] = m[c]; });
    if (Object.keys(o).length) clips[k] = o;
  }
  return {
    format: 1, version: stamp ? stamp.version : null, config_version: survey.config_version,
    published_at: stamp ? stamp.published_at : null, published_by: stamp ? stamp.published_by : null, note: stamp ? stamp.note : null,
    survey, strings, whats_changed, clips
  };
}
function contentOf(doc) {
  const d = clone(doc);
  ['version', 'config_version', 'published_at', 'published_by', 'note'].forEach((k) => delete d[k]);
  delete d.survey.config_version;
  return JSON.stringify(d);
}

/* ---- PP_modelFromPublished (reduced) --------------------------------------- */
function modelFromPublished(doc, current) {
  const sv = doc.survey;
  const m = clone(current);
  for (const sc of SETTINGS_SCHEMA) {
    if (sc.key === 'form_url') continue;
    let v = sc.key.startsWith('support.') ? sv.support[sc.key.slice(8)] : getPath(sv, sc.key);
    if (v === undefined) continue;
    if (sc.type === 'faces' && Array.isArray(v)) v = v.join(' ');
    if ((sc.type === 'list' || sc.type === 'numlist') && Array.isArray(v)) v = v.join(', ');
    m.settings[sc.key] = v;
  }
  m.languages = sv.languages.map((l) => ({ code: l.code, bcp47: l.bcp47, native_name: l.native_name, active: true }));
  m.areas = sv.functions.map((f) => ({ id: f.id, threshold: typeof f.threshold === 'number' ? f.threshold : null, active: true }));
  m.chips = [];
  sv.functions.forEach((f) => f.issues.forEach((code) => m.chips.push({ area: f.id, code, active: true })));
  m.support = sv.support.items.map((code) => ({ code, active: true }));
  m.screens = sv.flow.map((e) => ({
    id: e.id, type: e.type, text: e.text || '', required: typeof e.required === 'boolean' ? e.required : null, show_if: e.show_if || null,
    skip_if: e.skip_if || '', options: e.options || [], low_label: e.low_label || '', high_label: e.high_label || '',
    scale_hint: e.scale_hint || '', body: e.body || '', active: true
  }));
  m.texts = clone(doc.strings);
  m.text_notes = Object.fromEntries(Object.keys(m.texts).map((k) => [k, '']));
  m.whats_changed = Object.fromEntries(Object.entries(doc.whats_changed).map(([r, b]) => [r, clone(b.items)]));
  m.clips = clone(doc.clips || {});
  return m;
}

/* ---- PP_validate (reduced) --------------------------------------------------- */
function validate(model, liveDoc) {
  const errors = [], warnings = [];
  const E = (section, ref, message) => errors.push({ section, ref, message });
  const W = (section, ref, message) => warnings.push({ section, ref, message });
  const s = model.settings;
  const act = model.languages.filter((l) => l.active);
  const codes = act.map((l) => l.code);

  for (const sc of SETTINGS_SCHEMA) {
    const v = s[sc.key] === undefined ? sc.default : s[sc.key];
    const ref = 'Settings > ' + sc.key;
    if (sc.type === 'int' || sc.type === 'number') {
      if (typeof v !== 'number' || isNaN(v)) E('settings', ref, 'This must be a number.');
      else if (sc.type === 'int' && Math.floor(v) !== v) E('settings', ref, 'Use a whole number.');
      else if ((sc.min !== undefined && v < sc.min) || (sc.max !== undefined && v > sc.max)) E('settings', ref, 'Use a number from ' + sc.min + ' to ' + sc.max + '.');
    }
    if (sc.type === 'color' && !/^#[0-9A-Fa-f]{6}$/.test(String(v))) E('settings', ref, 'Use a colour code like #4B2E83.');
    if (sc.type === 'bool' && typeof v !== 'boolean') E('settings', ref, 'This must be on or off.');
  }
  if (!codes.includes(s.default_language)) E('settings', 'Settings > default_language', 'The first language must be one of the languages that are switched on.');
  if (!codes.includes(s.fallback_language)) E('settings', 'Settings > fallback_language', 'The backup language must be one of the languages that are switched on.');
  if (String(s['rating.faces'] || '').trim().split(/\s+/).filter(Boolean).length !== 5) E('settings', 'Settings > rating.faces', 'There must be exactly 5 faces.');
  if (!/^https:\/\/\S+\/$/.test(String(s.form_url || ''))) E('settings', 'Settings > form_url', 'The form address must start with https:// and end with /.');
  if (s['support.allow_comment'] && !model.texts[s['support.comment_text']]) E('settings', 'Settings > support.comment_text', 'The support comment question text does not exist in Texts.');

  const seenLang = {};
  model.languages.forEach((l) => {
    if (!/^[a-z]{2,3}$/.test(l.code) || seenLang[l.code]) E('languages', l.code, 'Each language needs its own 2 or 3 letter code.');
    seenLang[l.code] = true;
    if (!l.bcp47 || !l.native_name) E('languages', l.code, 'Fill in the read-aloud tag and the name of this language.');
  });
  if (!act.length) E('languages', '', 'Switch on at least one language.');

  const seenArea = {};
  model.areas.forEach((a) => {
    if (!/^[a-z][a-z0-9_]*$/.test(a.id) || seenArea[a.id]) E('areas', a.id, 'Each area needs its own code (lower-case letters, digits, _).');
    seenArea[a.id] = true;
    if (a.threshold !== null && a.threshold !== undefined && !(a.threshold >= 1 && a.threshold <= 5)) E('areas', a.id, 'The limit must be blank or 1 to 5.');
  });
  const activeAreas = model.areas.filter((a) => a.active);
  if (!activeAreas.length && model.screens.some((x) => x.type === 'function_ratings' && x.active)) E('areas', '', 'Show at least one area, or hide the area ratings screen.');
  const seenChip = {};
  model.chips.forEach((c) => {
    const ref = c.area + '/' + c.code;
    if (!seenArea[c.area]) E('chips', ref, 'This problem belongs to an area that does not exist.');
    if (c.code === 'other') E('chips', ref, '“other” is added by the form itself. Use another code.');
    else if (!/^[a-z][a-z0-9_]*$/.test(c.code) || seenChip[ref]) E('chips', ref, 'Each problem needs its own code within its area.');
    seenChip[ref] = true;
  });
  activeAreas.forEach((a) => {
    const n = model.chips.filter((c) => c.area === a.id && c.active).length;
    if (n < 4 || n > 6) W('chips', a.id, 'This area shows ' + n + ' problems. 4 to 6 work best.');
  });
  const seenSup = {};
  model.support.forEach((x) => {
    if (!/^[a-z][a-z0-9_]*$/.test(x.code) || seenSup[x.code]) E('support', x.code, 'Each support item needs its own code.');
    seenSup[x.code] = true;
  });

  const seenScreen = {}, builtinSeen = {};
  model.screens.forEach((x, i) => {
    const ref = 'screen ' + (i + 1);
    const t = TYPES[x.type];
    if (!/^[a-z][a-z0-9_]*$/.test(x.id) || seenScreen[x.id]) E('screens', ref, 'Each question needs its own code.');
    seenScreen[x.id] = true;
    if (!t) { E('screens', ref, 'Unknown kind of screen: ' + x.type + '.'); return; }
    if (t.builtin) { if (builtinSeen[x.type]) E('screens', ref, 'This built-in screen appears twice.'); builtinSeen[x.type] = true; }
    if (t.needs_text && x.active && (!x.text || !model.texts[x.text] || !String(model.texts[x.text].en || '').trim())) E('screens', ref, 'This question has no English text. Write it in English.');
    if (x.type === 'single_choice' && x.active && (!x.options || x.options.length < 1)) E('screens', ref, 'Add at least one answer partners can pick.');
    if (x.skip_if && !['language_picker', 'whats_changed'].includes(x.type)) E('screens', ref, 'Skipping is only for the language and what-changed screens.');
    if (x.required !== null && x.required !== undefined && x.required !== '' && typeof x.required !== 'boolean') E('screens', ref, 'Required must be on, off or blank.');
  });
  const last = model.screens[model.screens.length - 1];
  const thanks = model.screens.find((x) => x.type === 'thank_you');
  if (!thanks || !thanks.active || last !== thanks) E('screens', thanks ? 'screen ' + (model.screens.indexOf(thanks) + 1) : '', 'The thank-you screen must exist, be shown and be last.');
  const ir = model.screens.findIndex((x) => x.type === 'function_ratings');
  const id = model.screens.findIndex((x) => x.type === 'function_deep_dives');
  if (ir !== -1 && id !== -1 && id < ir) E('screens', 'screen ' + (id + 1), 'The problem screens must come after the area ratings.');

  // show_if: earlier and shown
  model.screens.forEach((x, i) => {
    if (!x.show_if) return;
    const ok = {};
    model.screens.slice(0, i).forEach((y) => {
      if (!y.active) return;
      if (['nps_0_10', 'rating_1_5', 'yes_no', 'single_choice', 'free_text'].includes(y.type)) ok[y.id] = true;
      if (y.type === 'function_ratings') activeAreas.forEach((a) => { ok['fn_rating:' + a.id] = true; if (s['deep_dive.when'] === 'immediate') ok['fn_deep_dive:' + a.id] = true; });
      if (y.type === 'function_deep_dives') activeAreas.forEach((a) => { ok['fn_deep_dive:' + a.id] = true; });
      if (y.type === 'support_block') { model.support.filter((it) => it.active).forEach((it) => { ok['support:' + it.code] = true; }); if (s['support.allow_comment']) ok.support_comment = true; }
    });
    (function walk(r) {
      if (!r || typeof r !== 'object') { E('screens', 'screen ' + (i + 1), 'The rule could not be read.'); return; }
      if (Array.isArray(r.all) || Array.isArray(r.any)) {
        const list = r.all || r.any;
        if (!list.length) E('screens', 'screen ' + (i + 1), 'A rule group is empty.');
        list.forEach(walk);
        return;
      }
      const tests = Object.keys(r).filter((k) => k !== 'answer');
      if (tests.length !== 1 || !['equals', 'not_equals', 'at_most', 'at_least', 'in', 'answered'].includes(tests[0])) { E('screens', 'screen ' + (i + 1), 'The rule must have exactly one test.'); return; }
      if (!ok[r.answer]) E('screens', 'screen ' + (i + 1) + ' > show_if', 'The rule tests “' + r.answer + '”, which is not an earlier, shown answer. Pick another answer or move the question.');
    })(x.show_if);
  });

  // Texts
  const need = new Set(FORM_TEXT_KEYS);
  activeAreas.forEach((a) => { need.add('fn.' + a.id + '.name'); need.add('fn.' + a.id + '.help'); });
  model.chips.filter((c) => c.active).forEach((c) => need.add('issue.' + c.area + '.' + c.code));
  model.support.filter((x) => x.active).forEach((x) => need.add('support.' + x.code));
  if (s['support.allow_not_applicable']) need.add('support.not_applicable');
  model.screens.filter((x) => x.active).forEach((x) => {
    ['text', 'low_label', 'high_label', 'scale_hint', 'body'].forEach((f) => { if (x[f]) need.add(x[f]); });
    if (x.type === 'single_choice') (x.options || []).forEach((o) => need.add('choice.' + x.id + '.' + o));
  });
  need.forEach((k) => { if (!model.texts[k]) E('texts', k, 'This text is needed but missing. Create it in Texts & translations.'); });
  const fb = s.fallback_language;
  Object.entries(model.texts).forEach(([k, row]) => {
    if (!need.has(k)) return;
    const en = String(row.en || '');
    if (!en.trim() || en.includes('[TRANSLATE]')) E('texts', k, 'The English text is empty. Write it in English.');
    if (fb !== 'en' && isTodo(row[fb])) E('texts', k + ' (' + fb + ')', 'The backup language text is missing.');
    codes.forEach((c) => {
      if (c === 'en' || isTodo(row[c])) return;
      if (placeholders(row[c]) !== placeholders(en)) E('texts', k + ' (' + c + ')', 'The ' + c + ' text must keep the same {s}/{n} markers as the English.');
    });
  });
  // What changed
  Object.entries(model.whats_changed).forEach(([r, items]) => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(r)) E('whats_changed', r, 'Round codes use only letters, digits, - and _.');
    items.forEach((it, n) => { if (!String(it.en || '').trim()) E('whats_changed', r + ' > bullet ' + (n + 1), 'This bullet has no English text.'); });
    if (!r.includes('DEMO') && items.some((it) => Object.values(it).some((v) => String(v).includes('[SAMPLE]')))) W('whats_changed', r, 'Some bullets still contain [SAMPLE].');
  });
  // Warnings
  const keys = Object.keys(model.texts);
  const summaryLangs = act.map((l) => ({ code: l.code, total: keys.length, untranslated: l.code === 'en' ? 0 : keys.filter((k) => isTodo(model.texts[k][l.code])).length }));
  summaryLangs.forEach((x) => { if (x.code !== 'en' && x.untranslated) W('texts', x.code, x.untranslated + ' texts are not translated into ' + x.code + ' yet (partners see English).'); });
  if (liveDoc) {
    const sv = liveDoc.survey;
    sv.flow.forEach((e) => { if (!model.screens.some((x) => x.id === e.id)) W('screens', e.id, 'The live question “' + e.id + '” is missing from the draft. Rename the label instead, so rounds stay comparable.'); });
    sv.functions.forEach((f) => {
      if (!model.areas.some((a) => a.id === f.id)) W('areas', f.id, 'The live area “' + f.id + '” is missing from the draft. Rename the label instead.');
      f.issues.forEach((c) => { if (!model.chips.some((x) => x.area === f.id && x.code === c)) W('chips', f.id + '/' + c, 'The live problem “' + c + '” is missing from the draft. Rename the label instead.'); });
    });
  }
  model.rounds.forEach((r) => { if (r.status === 'open' && r.id.includes('DEMO')) W('rounds', r.id, 'A demo round is open. Close it before sending real links.'); });
  const compiledChars = JSON.stringify(compile(model, null)).length;
  if (compiledChars > 200000) E('size', '', 'The questionnaire is too big for slow phones.');
  return {
    errors, warnings,
    summary: {
      screens: model.screens.filter((x) => x.active).length, areas: activeAreas.length, chips: model.chips.filter((c) => c.active).length,
      support: model.support.filter((x) => x.active).length, languages: summaryLangs, compiled_chars: compiledChars
    }
  };
}

/* ---- which logic the bench uses -------------------------------------------------- */
const logic = REAL ? {
  name: 'real Model.gs',
  schema: REAL.SETTINGS_SCHEMA, types: REAL.SCREEN_TYPES, formKeys: REAL.FORM_TEXT_KEYS, newerTexts: REAL.NEWER_TEXTS,
  importStatic: (files) => REAL.importStatic(files),
  prepareSave: (prev, model) => REAL.applyTranslationHelpers(prev, REAL.normalizeModel(model), istDate(nowIso())) || REAL.normalizeModel(model),
  validate: (model, live) => REAL.validate(REAL.normalizeModel(model), live),
  compile: (model, stamp) => REAL.compile(model, stamp),
  differs: (model, live) => (live ? REAL.compileForCompare(model) !== REAL.compileForCompare(live) : true),
  fromPublished: (doc, current) => REAL.modelFromPublished(doc, current),
  liveIds: (doc) => REAL.liveIds(doc),
  exportFiles: (model, url) => REAL.exportStatic(model, { apps_script_url: url })
} : {
  name: 'bench stand-in',
  schema: SETTINGS_SCHEMA, types: SCREEN_TYPES, formKeys: FORM_TEXT_KEYS, newerTexts: {},
  importStatic: (files) => importStatic(files),
  prepareSave: (prev, model) => { const m = clone(model); applyTranslationHelpers(m, prev); return m; },
  validate: (model, live) => validate(model, live),
  compile: (model, stamp) => compile(model, stamp),
  differs: (model, live) => (live ? contentOf(compile(model, null)) !== contentOf(live) : true),
  fromPublished: (doc, current) => modelFromPublished(doc, current),
  liveIds: null,
  exportFiles: null
};

/* Rounds keep the status and data links that only the script may change (PanelServer.gs PP_settleRounds_). */
function settleRounds(rounds, previous) {
  return rounds.map((r) => {
    const old = previous.find((p) => p.id === r.id);
    return old ? Object.assign({}, r, { status: old.status, data_sheet: old.data_sheet, audio_folder: old.audio_folder }) : Object.assign({}, r, { status: 'draft', data_sheet: '', audio_folder: '' });
  });
}

/* ---- the fake Sheet ------------------------------------------------------------ */
function fakeDcs() {
  const states = ['Karnataka', 'Tamil Nadu', 'Telangana', 'Kerala', 'Uttar Pradesh', 'Maharashtra'];
  const langs = ['kn', 'ta', 'te', 'ml', 'hi', '', 'en', 'xx'];
  const dcs = [];
  for (let i = 1; i <= 40; i++) {
    const n = String(i).padStart(3, '0');
    dcs.push({ dc_id: 'DC-DEMO-' + n, dc_name: 'Demo DC ' + i, state: states[i % states.length], region: i % 2 ? 'South' : 'North', language: langs[i % langs.length], active: i % 10 !== 0 });
  }
  dcs.push({ dc_id: 'DC DEMO 041', dc_name: 'Demo DC with a space', state: 'Kerala', region: 'South', language: 'ml', active: true });
  dcs.push({ dc_id: 'DC/DEMO/042', dc_name: 'Demo DC with slashes', state: 'Kerala', region: 'South', language: '', active: true });
  return dcs;
}

function fresh() {
  return {
    revision: 1, model: logic.importStatic(readRepoFiles()), saved_by: 'setup@example.com', saved_at: nowIso(),
    published: [], liveVersion: null, dcs: fakeDcs(), links: [], secret: 'bench-secret-not-real-0123456789abcdef',
    openSection: null, user: 'tester@example.com', failNext: {}, calls: [],
    webAppUrl: '',          // recorded web app address ('' = not recorded yet), see panelSetWebAppUrl
    previewKeys: 0,         // how many times panelNewPreviewKey ran
    liveUnknown: false,     // pretend Drive had a passing problem: the live codes are unknown (live_ids_unknown)
    formFlow: 'repo',       // panelFlowStatus: 'repo' (the repo's web/js files), 'unreachable', or a fingerprint to pretend
    publishWarnings: [],    // what the next successful panelPublish answers as "warnings" (like PP_publish)
    flowCode: 'current',    // panelFlowCode: 'current' (the repo's Flow.gs), 'older' (as before 26 Oct 2026, see olderFlowSource), 'failing',
                            // 'no_table', 'refused' (the window can't run it) or 'refused_no_table' (and the server has no route table)
    screenTypes: null       // panelLoad's list of kinds of screen: null = the real Model.gs PP_SCREEN_TYPES
  };
}

/* The repo's route code as a Flow.gs from before 26 Oct 2026 would send it: the checker
   without answersAt, findings without their place (site, target, index), and every jump
   called "its jump to ..." (two jumps to one screen were not told apart). Each change must
   apply exactly once; when the code moved on, this says so instead of testing nothing. */
function olderFlowSource(source) {
  const changes = [
    ['  api.answersAt = function (survey, nodeId, opts) {', '  api.answersAtNotYet = function (survey, nodeId, opts) {'],
    ["    if (isObj(extra)) {\n      ['site', 'target', 'index'].forEach(", "    if (false) {\n      ['site', 'target', 'index'].forEach("],
    ["twin ? 'its jump ' + (t.i + 1) + ' (to ' + q(t.to) + ')' : 'its jump to ' + q(t.to)", "'its jump to ' + q(t.to)"]
  ];
  return changes.reduce((text, [from, to]) => {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error('The bench\'s older route code (fake_backend.js olderFlowSource) no longer applies: "' + from.slice(0, 50) + '" is in Flow.gs ' + n + ' times. Update it.');
    return text.replace(from, to);
  }, source);
}
/* The repo's route code as a Flow.gs from before 27 Oct 2026: no route table (fromTable). */
function noTableFlowSource(source) {
  const from = '  panel.fromTable = function (text, survey, strings, opts) {';
  if (source.split(from).length !== 2) throw new Error('The bench\'s route code without the table (fake_backend.js noTableFlowSource) no longer applies: update it.');
  return source.replace(from, '  panel.fromTableNotYet = function (text, survey, strings, opts) {');
}
/* The repo's route code with an answersAt that always fails (the panel must keep its route tools). */
function failingFlowSource(source) {
  const from = '  api.answersAt = function (survey, nodeId, opts) {';
  if (source.split(from).length !== 2) throw new Error('The bench\'s failing route code (fake_backend.js failingFlowSource) no longer applies: update it.');
  return source.replace(from, from + "\n    throw new Error('The bench makes answersAt fail.');");
}
/* The route code as a window that refuses to run code made from text would meet it: running it stops at
   once with the browser's own words (the panel must then paste routes through the server). */
const REFUSED = "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script (the bench pretends).";
function refusedFlowSource(source) {
  return 'throw new EvalError(' + JSON.stringify(REFUSED) + ');\n' + source;
}
/* The text of Flow.gs the SERVER runs (panelRouteTable): the repo's, or, while the bench pretends a Flow.gs from
   before the route table, that file without PP.flowPanel.fromTable (in its code and in PP_FLOW_SOURCE_). */
function serverFlowText() {
  const text = fs.readFileSync(path.join(REPO, 'apps-script', 'Flow.gs'), 'utf8');
  if (state.flowCode !== 'no_table' && state.flowCode !== 'refused_no_table') return text;
  const from = '  panel.fromTable = function (text, survey, strings, opts) {';
  if (text.split(from).length !== 3) throw new Error('The bench\'s server Flow.gs without the table (fake_backend.js serverFlowText) no longer applies: update it.');
  return text.split(from).join('  panel.fromTableNotYet = function (text, survey, strings, opts) {');
}
/* PP_ADDED_TYPES_ of a Model.gs made with the bench's list of kinds (setScreenTypes): the "catalogue" of
   each kind added in web/js/types/, as "node scripts/flow.js types --write" writes both lists together.
   undefined = the repo's own Model.gs. */
function addedTypes() {
  if (!state.screenTypes) return undefined;
  return state.screenTypes.filter((t) => t && t.catalogue && typeof t.catalogue === 'object' && !Array.isArray(t.catalogue)).map((t) => clone(t.catalogue));
}
let state = fresh();

function liveDoc() { const p = state.published.find((x) => x.version === state.liveVersion); return p ? p.doc : null; }
/* Like PanelServer.gs PP_liveIdsOf_: the live codes, and (since 27 Oct 2026) their kinds (the real PP_liveIdsOf_'s). */
function liveIds() {
  const d = liveDoc();
  if (!d) return { screens: [], areas: [], chips: {}, support: [], options: {} };
  const kinds = loadRealServer(REPO).call('PP_liveIdsOf_', [d, null]).kinds;
  if (logic.liveIds) return Object.assign(logic.liveIds(d), { kinds });
  const sv = d.survey;
  const options = {};
  sv.flow.forEach((e) => { if (e.options) options[e.id] = e.options.slice(); });
  return {
    screens: sv.flow.map((e) => e.id), areas: sv.functions.map((f) => f.id),
    chips: Object.fromEntries(sv.functions.map((f) => [f.id, f.issues.slice()])), support: sv.support.items.slice(), options, kinds
  };
}
function differs() { return logic.differs(state.model, liveDoc()); }
/* Codes lock once the first real round has opened (status open or closed, or a data sheet made).
   Test rounds (SMOKE..., DEMO..., TEST...) never count, as in Code.gs PP_codesLocked_ (21 Oct 2026). */
function codesLocked() {
  return state.model.rounds.some((r) => !/^(SMOKE|DEMO|TEST)/i.test(r.id) && (r.status === 'open' || r.status === 'closed' || !!r.data_sheet));
}
function token(dc, round) {
  return crypto.createHmac('sha256', state.secret).update(dc + '|' + round).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22);
}

/* Translation helpers applied on save (design doc section 13, panelSave). */
function applyTranslationHelpers(model, before) {
  const codes = model.languages.map((l) => l.code);
  const today = istDate(nowIso());
  Object.entries(model.texts).forEach(([k, row]) => {
    const en = String(row.en || '');
    const oldEn = before && before.texts[k] ? String(before.texts[k].en || '') : null;
    if (oldEn !== null && oldEn !== en && en && codes.some((c) => c !== 'en' && !isTodo(row[c]))) {
      model.text_notes[k] = 'English changed on ' + today + ': please re-check the translations.';
    }
    if (!en) return;
    codes.forEach((c) => { if (c !== 'en' && isTodo(row[c])) row[c] = '[TRANSLATE] ' + en; });
  });
  Object.values(model.whats_changed).forEach((items) => items.forEach((it) => {
    const en = String(it.en || '');
    if (!en) return;
    codes.forEach((c) => { if (c !== 'en' && isTodo(it[c])) it[c] = '[TRANSLATE] ' + en; });
  }));
  Object.keys(model.texts).forEach((k) => { if (model.text_notes[k] === undefined) model.text_notes[k] = ''; });
}

function roundById(id) { return state.model.rounds.find((r) => r.id === id); }

/* ---- the panel* functions ------------------------------------------------------- */
const api = {
  panelLoad() {
    const section = state.openSection;
    state.openSection = null;
    const d = liveDoc();
    /* Like PanelServer.gs (21 Oct 2026): codes locked, but the live codes can't be read (Drive could
       not read the live version, or a real round was opened before anything was published). */
    const unknown = codesLocked() && (!d || state.liveUnknown);
    return {
      revision: state.revision, model: clone(state.model),
      catalog: { settings_schema: clone(logic.schema), screen_types: clone(state.screenTypes || logic.types), form_text_keys: logic.formKeys.slice(),
        newer_texts: clone(logic.newerTexts || {}) },
      live: d ? { version: d.version, config_version: d.config_version, published_at: d.published_at, published_by: d.published_by, note: d.note } : null,
      live_ids: codesLocked() && !unknown ? liveIds() : { screens: [], areas: [], chips: {}, support: [], options: {} },
      live_ids_unknown: unknown,
      codes_locked: codesLocked(), draft_differs_from_live: differs(), user: state.user,
      spreadsheet_url: 'https://docs.google.com/spreadsheets/d/FAKE-BENCH-CONTROL/edit', folder_url: 'https://drive.google.com/drive/folders/FAKE-BENCH-FOLDER',
      web_app_url: state.webAppUrl, web_app_url_recorded: !!state.webAppUrl,
      web_app_access: state.webAppUrl ? (state.webAppAccess || 'anyone') : '',
      dc_count: state.dcs.length, active_dc_count: state.dcs.filter((x) => x.active).length, open_section: section
    };
  },
  panelSave(baseRevision, model) {
    if (baseRevision !== state.revision) return { ok: false, conflict: true, revision: state.revision, saved_by: state.saved_by, saved_at: state.saved_at };
    if (!model || !Array.isArray(model.screens)) throw new Error('The draft that arrived was incomplete, so nothing was saved. Please try again.');
    const m = logic.prepareSave(state.model, model);
    m.rounds = settleRounds(m.rounds, state.model.rounds);
    state.model = m;
    state.revision += 1;
    state.saved_by = state.user;
    state.saved_at = nowIso();
    return { ok: true, revision: state.revision, draft_differs_from_live: differs() };
  },
  panelValidate(model) { return logic.validate(model, liveDoc()); },
  panelPublish(baseRevision, note) {
    if (baseRevision !== state.revision) return { ok: false, conflict: true, revision: state.revision, saved_by: state.saved_by, saved_at: state.saved_at };
    const v = logic.validate(state.model, liveDoc());
    if (v.errors.length) return { ok: false, errors: v.errors };
    const version = (state.liveVersion || 0) + 1;
    const stamp = { version, published_at: nowIso(), published_by: state.user, note: String(note || '') };
    const doc = logic.compile(state.model, stamp);
    state.published.push({ version, doc, file: 'https://drive.google.com/file/d/FAKE-P' + version + '/view' });
    state.liveVersion = version;
    const answer = { ok: true, version, config_version: doc.config_version };
    /* Like PP_publish: what needs a look (the form on GitHub could not be checked, the codes list is nearly full). */
    if (state.publishWarnings.length) { answer.warnings = state.publishWarnings.slice(); state.publishWarnings = []; }
    return answer;
  },
  panelHistory() {
    return state.published.slice().reverse().map((p) => ({
      version: p.version, config_version: p.doc.config_version, published_at: p.doc.published_at, published_by: p.doc.published_by,
      note: p.doc.note, live: p.version === state.liveVersion, file: p.file
    }));
  },
  panelRestore(version) {
    const p = state.published.find((x) => x.version === Number(version));
    if (!p) throw new Error('Version ' + version + ' was not found in the published folder.');
    state.model = logic.fromPublished(p.doc, state.model);
    state.revision += 1;
    state.saved_by = state.user;
    state.saved_at = nowIso();
    return { ok: true, revision: state.revision };
  },
  panelSetRoundStatus(roundId, status, confirmDemo) {
    const r = roundById(roundId);
    if (!r) throw new Error('There is no round called ' + roundId + ' in the Sheet. Save first, then try again.');
    if (!['draft', 'open', 'closed'].includes(status)) throw new Error('Unknown round status: ' + status + '.');
    if (status === 'open' && roundId.includes('DEMO') && confirmDemo !== true) throw new Error(roundId + ' is a demo round. Confirm that it is only for testing.');
    if (status === 'open' && !r.data_sheet) {
      r.data_sheet = 'https://docs.google.com/spreadsheets/d/FAKE-DATA-' + roundId + '/edit';
      r.audio_folder = 'https://drive.google.com/drive/folders/FAKE-AUDIO-' + roundId;
    }
    r.status = status;
    return { ok: true, round: clone(r) };
  },
  panelRoundCounts(roundId) {
    const r = roundById(roundId);
    if (!r) throw new Error('There is no round called ' + roundId + '.');
    const links = state.links.filter((l) => l.round_id === roundId).length;
    if (!r.data_sheet) return { links, opened: 0, started: 0, submitted: 0, by_lang: {}, last_submission_at: '' };
    const submitted = Math.round(links * 0.5);
    return { links, opened: Math.round(links * 0.8), started: Math.round(links * 0.65), submitted, by_lang: submitted ? { hi: Math.ceil(submitted / 2), ta: Math.floor(submitted / 2) } : {}, last_submission_at: submitted ? new Date(Date.now() - 3600e3).toISOString() : '' };
  },
  panelGenerateLinks(roundId, options) {
    const r = roundById(roundId);
    if (!r) throw new Error('There is no round called ' + roundId + ' in the Sheet. Save first, then try again.');
    const onlyMissing = !options || options.only_missing !== false;
    const active = state.model.languages.filter((l) => l.active).map((l) => l.code);
    let created = 0, updated = 0, kept = 0;
    const skipped = [];
    state.dcs.filter((d) => d.active).forEach((d) => {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(d.dc_id)) { skipped.push({ dc_id: d.dc_id, reason: 'The DC code has characters that are not allowed. Use only letters, digits, -, _ or . (at most 64).' }); return; }
      const lang = active.includes(d.language) ? d.language : '';
      const link = state.model.settings.form_url + '?dc=' + encodeURIComponent(d.dc_id) + '&t=' + token(d.dc_id, roundId) + '&round=' + encodeURIComponent(roundId) + (lang ? '&lang=' + lang : '');
      const existing = state.links.find((l) => l.round_id === roundId && l.dc_id === d.dc_id);
      if (existing && onlyMissing) { kept++; return; }
      const row = { round_id: roundId, dc_id: d.dc_id, dc_name: d.dc_name, state: d.state, region: d.region, language: lang, link, generated_at: nowIso(), generated_by: state.user };
      if (existing) { Object.assign(existing, row); updated++; } else { state.links.push(row); created++; }
    });
    const q = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    const rows = state.links.filter((l) => l.round_id === roundId);
    const csv = ['dc_id,dc_name,state,region,language,link'].concat(rows.map((l) => [l.dc_id, l.dc_name, l.state, l.region, l.language, l.link].map(q).join(','))).join('\n') + '\n';
    return { ok: true, created, updated, kept, skipped, csv };
  },
  panelPreviewUrl(roundId) {
    return { url: state.model.settings.form_url + '?preview=1&dc=DC-PREVIEW&round=' + encodeURIComponent(roundId) + '&lang=' + state.model.settings.default_language };
  },
  /* Like PanelServer.gs: checks the address, records it, answers { ok, web_app_url }; a plain-English error otherwise. */
  panelSetWebAppUrl(url) {
    const text = String(url || '').trim().replace(/\/a\/macros\/[^/]+\/s\//, '/macros/s/');
    if (/\/dev$/.test(text)) throw new Error('This is the test address (it ends with /dev) and only works for editors. Copy the address that ends with /exec: Deploy > Manage deployments.');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(text)) {
      throw new Error('That is not a web app address. It looks like https://script.google.com/macros/s/…/exec (Deploy > Manage deployments > Web app > URL).');
    }
    state.webAppUrl = text;
    /* Like PanelServer.gs (21 Oct 2026): an address the bench calls ...COMPANYONLY... stands for a web app
       open only to signed-in colleagues, recorded as Meesho-only ("domain"). */
    state.webAppAccess = /COMPANYONLY/.test(text) ? 'domain' : 'anyone';
    return { ok: true, web_app_url: text, web_app_access: state.webAppAccess };
  },
  panelNewPreviewKey() {
    state.previewKeys += 1;
    return { ok: true };
  },
  panelGetSecret(confirm) {
    if (confirm !== 'SHOW') throw new Error('Type SHOW to confirm.');
    return { secret: state.secret };
  },
  panelImport(baseUrl) {
    if (!/^https:\/\//.test(String(baseUrl || ''))) throw new Error('The GitHub address must start with https://.');
    const m = logic.importStatic(readRepoFiles());
    const old = state.model.rounds;
    m.rounds = old.concat(m.rounds.filter((r) => !old.some((o) => o.id === r.id)));
    m.settings.form_url = state.model.settings.form_url;
    state.model = m;
    state.revision += 1;
    state.saved_by = state.user;
    state.saved_at = nowIso();
    return { ok: true, revision: state.revision, counts: { texts: Object.keys(m.texts).length, screens: m.screens.length, areas: m.areas.length, chips: m.chips.length } };
  },
  panelExport() {
    /* The same warning as PanelServer.gs while no web app address is recorded (21 Oct 2026). */
    const warning = state.webAppUrl ? undefined : 'No web app address is recorded yet, so survey.json keeps the form in test mode ' +
      '("mock"): with these files the form would not send answers to Google. Deploy the web app, paste ' +
      'its address (ending in /exec) into Home > Quick links or Settings, click Check and save, then ' +
      'prepare the files again.';
    if (logic.exportFiles) return { files: logic.exportFiles(state.model, state.webAppUrl), warning };
    const doc = compile(state.model, null);
    const survey = Object.assign({}, doc.survey);
    survey.backend = Object.assign({ mode: 'apps_script', mock_url: '/api', apps_script_url: state.webAppUrl }, survey.backend);
    survey.links = { mock_defaults: { dc: 'DC-DEMO-001', round: 'DEMO-R1', t: '' } };
    const wc = { rounds: doc.whats_changed };
    return { files: {
      'survey.json': JSON.stringify(survey, null, 2) + '\n',
      'strings.json': JSON.stringify(doc.strings, null, 1) + '\n',
      'whats_changed.json': JSON.stringify(wc, null, 2) + '\n',
      'audio_clips.json': JSON.stringify({ clips: doc.clips }, null, 2) + '\n'
    } };
  },
  panelSetFormUrl(url) {
    state.model.settings.form_url = String(url);
    state.revision += 1;
    return { ok: true };
  },
  /* Like PanelServer.gs: the text of Flow.gs's route files, for the panel window. */
  panelFlowCode() {
    const flow = readFlowGs();
    if (!flow) throw new Error('The script file "Flow" is missing from the Apps Script project, so the control panel cannot paste a route or show the map and "Try a path".');
    const source = state.flowCode === 'older' ? olderFlowSource(flow.source) : state.flowCode === 'failing' ? failingFlowSource(flow.source)
      : state.flowCode === 'no_table' ? noTableFlowSource(flow.source)
      : state.flowCode === 'refused' || state.flowCode === 'refused_no_table' ? refusedFlowSource(flow.source) : flow.source;
    return { source, fingerprint: flow.fingerprint };
  },
  /* The real PanelServer.gs panelRouteTable (the route table's tools on the server), in a fresh space. */
  panelRouteTable(request) {
    return loadRealServer(REPO, { flowText: serverFlowText(), addedTypes: addedTypes() }).call('panelRouteTable', [request]);
  },
  /* Like PanelServer.gs: does the form at formUrl run the same route code as the panel? */
  panelFlowStatus(formUrl) {
    const flow = readFlowGs();
    const panel = flow ? flow.fingerprint : '';
    const base = String(formUrl || '').trim();
    const out = { panel, form: null, same: null, form_url: base, checked_at: nowIso(), problem: '' };
    if (!/^https:\/\/[^\s"'<>?#]+\/$/.test(base)) { out.problem = 'The form address is missing or not valid.'; return out; }
    if (state.formFlow === 'unreachable') { out.problem = 'Could not reach ' + base + 'js/flow.js (the bench pretends).'; return out; }
    out.form = state.formFlow === 'repo' ? repoFormFingerprint() : String(state.formFlow);
    out.same = !!panel && out.form === panel;
    return out;
  },
  /* Like PanelServer.gs: the live version's questionnaire and texts (for the Map). */
  panelLiveSurvey() {
    const d = liveDoc();
    if (!d || !d.survey) return { live: null };
    return { live: { version: d.version, config_version: d.config_version }, survey: d.survey, strings: d.strings || {} };
  }
};

/* Runs one panel* call the way google.script.run would: errors become a
   plain-English message, everything else a JSON copy. */
function callApi(fn, args) {
  state.calls.push(fn);
  if (!Object.prototype.hasOwnProperty.call(api, fn)) throw new Error('Script function not found: ' + fn);
  if (state.failNext[fn]) { const msg = state.failNext[fn]; delete state.failNext[fn]; throw new Error(msg); }
  const result = api[fn].apply(null, clone(args || []));
  return result === undefined ? null : clone(result);
}

module.exports = {
  callApi,
  get state() { return state; },
  reset() { state = fresh(); },
  /* Pretends another admin saved: revision +1, optional text change. */
  bump(by, textKey, english) {
    if (textKey && state.model.texts[textKey]) state.model.texts[textKey].en = english;
    state.revision += 1;
    state.saved_by = by || 'asha@example.com';
    state.saved_at = nowIso();
    return { revision: state.revision };
  },
  setOpenSection(s) { state.openSection = s; },
  setWebAppUrl(url) { state.webAppUrl = String(url || ''); },
  /* What panelFlowStatus finds at the form address: 'repo', 'unreachable' or a fingerprint. */
  setFormFlow(value) { state.formFlow = value === undefined || value === null || value === '' ? 'repo' : String(value); },
  setLiveUnknown(on) { state.liveUnknown = !!on; },
  /* The next successful panelPublish answers these warnings (PP_publish's "warnings"). */
  setPublishWarnings(list) { state.publishWarnings = Array.isArray(list) ? list.map(String) : []; },
  /* panelFlowCode hands the window the repo's route code ('current'), an older one ('older', olderFlowSource),
     one whose answersAt fails ('failing'), or one without the route table ('no_table', noTableFlowSource). */
  setFlowCode(which) { state.flowCode = ['older', 'failing', 'no_table', 'refused', 'refused_no_table'].indexOf(which) !== -1 ? which : 'current'; },
  /* panelLoad's list of kinds of screen (null: the real one); for example with a kind added in web/js/types/. */
  setScreenTypes(list) { state.screenTypes = Array.isArray(list) ? clone(list) : null; },
  /* Puts a whole draft in the Sheet (as if saved by someone): tidied like panelSave does, revision + 1. */
  setModel(model) {
    state.model = REAL ? REAL.normalizeModel(clone(model)) : clone(model);
    state.revision += 1;
    state.saved_by = 'bench@example.com';
    state.saved_at = nowIso();
    return { revision: state.revision };
  },
  failNext(fn, message) { state.failNext[fn] = message; },
  FUNCTIONS: Object.keys(api),
  LOGIC: logic.name,
  REAL,
  _internals: { compile, validate, importStatic, readRepoFiles, token, readFlowGs, repoFormFingerprint }
};
