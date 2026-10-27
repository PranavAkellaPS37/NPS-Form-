/* =============================================================================
   lib/contract.js  -  what the contract says, written down once for the tests

   WHAT THIS FILE IS
     The expected tab names, column headers, settings, screen types and data
     columns, copied from docs/control-panel-design.md (sections 3, 5, 6, 11)
     so the tests compare the code against the CONTRACT, not against itself.
     It also reads the repo's own files (survey.json, strings.json, ...) to
     know what an import from GitHub should produce. Since 23 Oct 2026 (stage 4
     of the flow-graph work) the published route is a graph, and since 26 Oct
     2026 web/config/survey.json holds that graph too (written by "python3
     scripts/flow.py migrate --write"): repoFacts().graph is the repo's graph
     without its note, and repoFacts().migrated is the repo file itself. (For
     a project copy whose flow is still the old list, both are made in memory
     with web/js/flow.js and web/js/flow-panel.js, as before.)

   HOW TO USE IT
     const C = require('./lib/contract');  C.CONTROL_TABS['Texts'] ...

   WHAT IT READS
     the project's web/config/*.json, web/i18n/strings.json,
     web/js/flow.js, web/js/flow-panel.js and scripts/check_config.py (for
     FIXED_STRING_KEYS). Never writes anything.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');   // the project folder (three levels up from tests/gas-harness/lib/)
const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];

// Section 3: the control spreadsheet's tabs and columns, in order.
const CONTROL_TABS = {
  Settings: ['setting', 'value', 'what it does'],
  Languages: ['order', 'code', 'bcp47', 'native_name', 'active'],
  Areas: ['order', 'area_id', 'threshold', 'active'],
  Chips: ['area_id', 'order', 'chip_code', 'active'],
  Support: ['order', 'item_code', 'active'],
  // stage 4 of the flow-graph work (23 Oct 2026): next, jumps, repeat after active (docs/flow-engine.md 9.1)
  Screens: ['order', 'screen_id', 'type', 'text_key', 'required', 'show_if', 'skip_if', 'options', 'low_label',
    'high_label', 'scale_hint', 'body', 'active', 'next', 'jumps', 'repeat'],
  Texts: ['key'].concat(LANGS, ['note']),
  'What changed': ['round_id', 'order'].concat(LANGS),
  'Audio clips': ['key', 'lang', 'url'],
  Rounds: ['round_id', 'status', 'opens_on', 'closes_on', 'data_sheet', 'audio_folder', 'notes'],
  DCs: ['dc_id', 'dc_name', 'state', 'region', 'language', 'active'],
  Links: ['round_id', 'dc_id', 'dc_name', 'state', 'region', 'language', 'link', 'generated_at', 'generated_by'],
  'Publish history': ['version', 'config_version', 'published_at', 'published_by', 'note', 'file', 'live'],
  _meta: ['key', 'value']
};
const TAB_GROUPS = {
  purple: ['Settings', 'Languages', 'Areas', 'Chips', 'Support', 'Screens', 'Texts', 'What changed', 'Audio clips'],
  green: ['Rounds', 'Links', 'DCs'],
  grey: ['Publish history', '_meta']
};
const CHECKBOX_COLUMNS = { Languages: 'active', Areas: 'active', Chips: 'active', Support: 'active', Screens: 'active',
  DCs: 'active', 'Publish history': 'live' };

// Section 11: each round's data spreadsheet.
const DATA_TABS = {
  responses: ['received_at', 'submission_id', 'dc', 'round', 'lang', 'nps', 'support_contacted', 'late', 'token_valid',
    'dc_round_seen_before', 'opened_at', 'started_at', 'submitted_at', 'sent_at', 'attempt', 'resume_count',
    'config_version', 'app_version', 'mode', 'session_id', 'client_net', 'client_ua', 'client_viewport',
    'client_tz_offset_min', 'voice_supported', 'voice_denied', 'tts_voice', 'answers_json', 'events_count'],
  function_ratings: ['received_at', 'submission_id', 'dc', 'round', 'block', 'item', 'rating', 'not_applicable',
    'threshold', 'below_threshold', 'issue_code'],
  free_text: ['received_at', 'submission_id', 'dc', 'round', 'lang', 'item_id', 'block', 'function', 'issue_code',
    'question_key', 'text', 'audio_url', 'audio_file_id', 'audio_mime', 'audio_duration_s', 'audio_bytes', 'transcript',
    'transcript_lang', 'transcribed_at', 'cls_function', 'cls_issue_code', 'cls_severity', 'cls_sentiment',
    'cls_summary_en', 'cls_confidence', 'cls_unmapped', 'cls_new_theme_label', 'cls_provider', 'classified_at'],
  events: ['received_at', 'submission_id', 'session_id', 'dc', 'round', 'seq', 'screen', 'at'],
  // config_version: the LAST column since 26 Oct 2026 (flow-graph stage 6, Pranav's decision 11;
  // docs/submission-format.md section 9). Older spreadsheets get it from their first ping (scenario D12).
  pings: ['received_at', 'stage', 'dc', 'round', 'session_id', 'lang', 'screen', 'step_index', 'step_total', 'at',
    'token_valid', 'mode', 'client_net', 'events_json', 'config_version']
};

// Section 5: every Settings row. [key, type, default, min, max, options]
const SETTINGS = [
  ['survey_id', 'text', 'valmo-partner-pulse'],
  ['form_url', 'url', 'https://pranavakellaps37.github.io/NPS-Form-/'],
  ['default_language', 'lang', 'en'],
  ['fallback_language', 'lang', 'en'],
  ['branding.logo', 'text', ''],
  ['branding.colors.primary', 'color', '#4B2E83'],
  ['branding.colors.on_primary', 'color', '#FFFFFF'],
  ['branding.colors.background', 'color', '#FFFFFF'],
  ['branding.colors.surface', 'color', '#F3F0F8'],
  ['branding.colors.text', 'color', '#1B1B1F'],
  ['branding.colors.muted', 'color', '#5F5E6B'],
  ['branding.colors.border', 'color', '#D9D4E3'],
  ['branding.colors.error', 'color', '#B3261E'],
  ['branding.colors.success', 'color', '#1B7F3B'],
  ['navigation.auto_advance', 'bool', true],
  ['navigation.auto_advance_delay_ms', 'int', 350, 0, 2000],
  ['rating.faces', 'faces', '😠 🙁 😐 🙂 😄'],
  ['rating.allow_not_applicable', 'bool', true],
  ['deep_dive.threshold', 'int', 3, 1, 5],
  ['deep_dive.when', 'choice', 'after_all_ratings', null, null, ['after_all_ratings', 'immediate']],
  ['deep_dive.require_chip', 'bool', true],
  ['deep_dive.require_detail_if_other', 'bool', true],
  ['support.allow_not_applicable', 'bool', false],
  ['support.allow_comment', 'bool', true],
  ['support.comment_text', 'key', 'q.support_comment'],
  ['voice.enabled', 'bool', true],
  ['voice.gesture', 'choice', 'hold', null, null, ['hold', 'tap']],
  ['voice.max_seconds', 'int', 60, 5, 300],
  ['voice.min_seconds', 'number', 1],
  ['voice.bitrate', 'int', 16000, 6000, 64000],
  ['voice.mime_types', 'list', 'audio/webm;codecs=opus, audio/ogg;codecs=opus, audio/webm, audio/mp4'],
  ['text.max_chars', 'int', 1500, 50, 10000],
  ['read_aloud.enabled', 'bool', true],
  ['whats_changed.timeout_seconds', 'number', 4, 1, 20],
  ['telemetry.enabled', 'bool', true],
  ['backend.request_timeout_seconds', 'number', 90, 10, 600],
  ['backend.slow_upload_bytes_per_second', 'number', 1000, 100, 100000],
  ['backend.retry_delays_seconds', 'numlist', '2, 5, 10, 20, 40, 60, 60, 120, 120, 300']
];
const SETTINGS_GROUPS = ['Form address', 'Languages', 'Look & feel', 'Moving between screens', 'Ratings', 'Problem screens',
  'Support questions', 'Voice notes', 'Typing', 'Read aloud', 'What changed', 'Progress messages', 'Sending'];

// Section 6: the screen-type catalogue.
const SCREEN_TYPES = {
  language_picker: { builtin: true, needs_text: false, fields: ['skip_if'] },
  whats_changed: { builtin: true, needs_text: false, fields: ['skip_if'] },
  function_ratings: { builtin: true, needs_text: false, fields: [] },
  function_deep_dives: { builtin: true, needs_text: false, fields: [] },
  support_block: { builtin: true, needs_text: true, fields: [] },
  thank_you: { builtin: true, needs_text: false, fields: [] },
  nps_0_10: { builtin: false, needs_text: true, fields: ['low_label', 'high_label', 'scale_hint', 'required'] },
  rating_1_5: { builtin: false, needs_text: true, fields: ['required'] },
  yes_no: { builtin: false, needs_text: true, fields: ['required'] },
  single_choice: { builtin: false, needs_text: true, fields: ['options', 'required'] },
  free_text: { builtin: false, needs_text: true, fields: ['required'] },
  info_card: { builtin: false, needs_text: true, fields: ['body'] }
};

const MODEL_SECTIONS = ['settings', 'languages', 'areas', 'chips', 'support', 'screens', 'texts', 'text_notes',
  'whats_changed', 'clips', 'rounds'];
const PHASE2_KEYS = ['round.closed_title', 'round.closed_body', 'round.not_open_title', 'round.not_open_body',
  'dev.preview_banner', 'dev.preview_done'];
const DEFAULT_IMPORT_URL = 'https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/web/';
const FORM_URL = 'https://pranavakellaps37.github.io/NPS-Form-/';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
}

/* The form's route engine and the panel's helpers, as phones and the command line load them. */
const FLOW = require(path.join(REPO, 'web/js/flow.js'));
const FLOW_PANEL = require(path.join(REPO, 'web/js/flow-panel.js'));

/* "node scripts/flow.js map" for a web folder (default: the project's web/): docs/flow.md as that command
   writes it (read only: it prints to stdout). The panel's GitHub copy must give exactly this text. */
const mapCache = {};
function flowMap(webDir) {
  const root = webDir || path.join(REPO, 'web');
  if (!Object.prototype.hasOwnProperty.call(mapCache, root)) {
    mapCache[root] = require('child_process').execFileSync('node', [path.join(REPO, 'scripts/flow.js'), 'map', '--root', root],
      { encoding: 'utf8', cwd: REPO });
  }
  return mapCache[root];
}

/* A copy without the notes for humans (keys starting with "_"), at every level. */
function withoutNotes(value) {
  return JSON.parse(JSON.stringify(value, (k, v) => (typeof k === 'string' && k.startsWith('_') ? undefined : v)));
}

/* The screen codes of a route, in order: the old list, or a graph's nodes (a group: its own code). */
function flowIdsOf(flow) {
  if (Array.isArray(flow)) return flow.map((s) => s.id);
  return flow && Array.isArray(flow.nodes) ? flow.nodes.map((n) => n.id) : [];
}

/* What the repo's web/ files contain (the expected result of an import). */
function repoFacts() {
  const survey = readJson('web/config/survey.json');
  const strings = readJson('web/i18n/strings.json');
  const wc = readJson('web/config/whats_changed.json');
  const clips = readJson('web/config/audio_clips.json');
  const raw = {
    'survey.json': fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'),
    'strings.json': fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8'),
    'whats_changed.json': fs.readFileSync(path.join(REPO, 'web/config/whats_changed.json'), 'utf8'),
    'audio_clips.json': fs.readFileSync(path.join(REPO, 'web/config/audio_clips.json'), 'utf8')
  };
  const isList = Array.isArray(survey.flow);
  // The route as the control panel publishes it (no notes inside): the repo's graph (since 26 Oct 2026),
  // or exactly PP.flow.fromLegacy of an old list.
  const graph = isList ? JSON.parse(JSON.stringify(FLOW.fromLegacy(survey))) : withoutNotes(survey.flow);
  // survey.json with its flow as the graph: the repo file itself (made in memory only for an old list).
  const migratedRaw = isList ? FLOW_PANEL.surveyTextWithFlow(raw['survey.json'], graph) : raw['survey.json'];
  return {
    survey, strings, whats_changed: wc, audio_clips: clips, raw, graph,
    migrated: { survey: JSON.parse(migratedRaw), raw: migratedRaw },
    languages: survey.languages.map((l) => l.code),
    areas: survey.functions.map((f) => f.id),
    chips: survey.functions.reduce((n, f) => n + f.issues.length, 0),
    chipsByArea: Object.fromEntries(survey.functions.map((f) => [f.id, f.issues])),
    support: survey.support.items,
    // the Screens rows: one per list line, or the rows the panel makes of the graph
    flowIds: isList ? flowIdsOf(survey.flow) : FLOW_PANEL.toRows(survey.flow, survey).screens.map((s) => s.id),
    textKeys: Object.keys(strings).filter((k) => !k.startsWith('_')),
    rounds: Object.keys(wc.rounds || {}).filter((k) => !k.startsWith('_'))
  };
}

/* FIXED_STRING_KEYS as written in scripts/check_config.py. */
function fixedStringKeys() {
  const text = fs.readFileSync(path.join(REPO, 'scripts/check_config.py'), 'utf8');
  const m = /FIXED_STRING_KEYS\s*=\s*"""([\s\S]*?)"""/.exec(text);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

module.exports = { REPO, LANGS, CONTROL_TABS, TAB_GROUPS, CHECKBOX_COLUMNS, DATA_TABS, SETTINGS, SETTINGS_GROUPS,
  SCREEN_TYPES, MODEL_SECTIONS, PHASE2_KEYS, DEFAULT_IMPORT_URL, FORM_URL, repoFacts, fixedStringKeys, flowIdsOf,
  FLOW, FLOW_PANEL, flowMap };
