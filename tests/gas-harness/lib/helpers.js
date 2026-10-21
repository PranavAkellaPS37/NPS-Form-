/* =============================================================================
   lib/helpers.js  -  shared steps for the test scenarios

   WHAT THIS FILE IS
     Steps many scenarios need: make a fresh pretend Google with the code
     loaded, run "Set up or repair", find a round's data spreadsheet, check
     that no [contract] error happened, compare dates and colours. Every
     pretend Google made here is remembered, so the final report can list
     every method used outside the contract across all scenarios.

   HOW TO USE IT
     const H = require('./lib/helpers');
     H.configure({ appsScriptDir, verbose });
     const h = H.setupPublished(s);      // set up + version 1 live, or stop

   WHAT IT READS / WRITES
     Nothing on disk.
   ============================================================================= */
'use strict';

const K = require('./testkit');
const { formatJavaDate } = require('./java-date-format');

const path = require('path');
const REPO = path.resolve(__dirname, '..', '..', '..');   // the project folder (three levels up from tests/gas-harness/lib/)
const config = { appsScriptDir: path.join(REPO, 'apps-script'), webDir: path.join(REPO, 'web'), verbose: false };
const ALL = [];          // every harness made during this run

function configure(o) { Object.assign(config, o || {}); }

function harness(extra) {
  const h = K.freshHarness(Object.assign({ appsScriptDir: config.appsScriptDir, echoConsole: config.verbose }, extra || {}));
  ALL.push(h);
  return h;
}

function needLoaded(s, h) {
  s.need(h.loadErrors.length === 0, 'every .gs file loads into one shared scope (like Apps Script)',
    h.loadErrors.map((e) => `${e.file}: ${e.message}${e.where ? ' at ' + e.where : ''}`).join('; '));
}

/* Runs ppSetup from the menu. Returns the dialogs it showed and the last alert. */
function runSetup(s, h, label) {
  const before = h.admin.ui.log.length;
  const r = h.exec('ppSetup', [], { context: 'menu' });
  s.need(r.ok, `${label || 'ppSetup'} runs without an error`,
    r.ok ? '' : `ppSetup threw: ${r.error.message}${r.error.where ? ' at ' + r.error.where : ''}`);
  const dialogs = h.admin.ui.log.slice(before);
  const alerts = dialogs.filter((d) => d.kind === 'alert');
  return { dialogs, last: alerts[alerts.length - 1] || null, ms: r.ms };
}

function describeDialog(d) {
  return d ? `${d.title}: ${String(d.message || '').replace(/\s+/g, ' ').slice(0, 600)}` : '(no message)';
}

/* A fresh pretend Google, set up with every question accepted (import + publish v1). */
function setupPublished(s, extra) {
  const h = harness(extra);
  needLoaded(s, h);
  const { last } = runSetup(s, h);
  const live = h.admin.props.script.get('LIVE_VERSION');
  s.need(live === '1', 'set-up (accepting every question) leaves version 1 live',
    `LIVE_VERSION = ${K.show(live)}. Set-up said: ${describeDialog(last)}`);
  return h;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const secretOf = (h) => h.admin.props.script.get('LINK_SECRET') || '';
const previewKeyOf = (h) => h.admin.props.script.get('PREVIEW_KEY') || '';

function roundInfo(h, roundId) {
  try { return JSON.parse(h.admin.props.script.get('ROUND:' + roundId) || 'null'); } catch (e) { return null; }
}

function roundBookId(h, roundId) {
  const info = roundInfo(h, roundId);
  return info && info.sheet_id ? info.sheet_id : null;
}

function metaMap(h) {
  const t = h.admin.table(null, '_meta');
  const m = {};
  if (t) t.rows.forEach((r) => { m[String(r.key)] = r.value; });
  return m;
}

function contractClean(s, h, label) {
  const v = h.state.violations;
  s.ok(v.length === 0, `no [contract] errors were raised${label ? ' (' + label + ')' : ''}`,
    v.slice(0, 6).map((x) => `${x.member} in ${x.fn} (${x.where})`).join('; '));
}

const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v);
const todayIST = () => formatJavaDate(Date.now(), 'Asia/Kolkata', 'yyyy-MM-dd').text;

/* A message an admin or partner could read: real words, no programming leftovers. */
function plainEnglish(msg) {
  return typeof msg === 'string' && msg.trim().length > 8 &&
    !/undefined|\[object Object\]|\bNaN\b|Cannot read prop|is not a function|is not defined|TypeError|ReferenceError/.test(msg);
}

/* purple / green / grey / other, from a colour such as #7E57C2 or "purple". */
function colourFamily(c) {
  const text = String(c || '').trim().toLowerCase();
  if (!text) return 'none';
  if (['purple', 'violet', 'mediumpurple', 'rebeccapurple'].indexOf(text) >= 0) return 'purple';
  if (['green', 'seagreen', 'forestgreen', 'limegreen'].indexOf(text) >= 0) return 'green';
  if (['grey', 'gray', 'darkgrey', 'darkgray', 'lightgrey', 'lightgray', 'silver'].indexOf(text) >= 0) return 'grey';
  const m = /^#?([0-9a-f]{6})$/.exec(text);
  if (!m) return 'other';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 30) return 'grey';
  if (g > r && g > b) return 'green';
  if (r > g && b > g) return 'purple';
  return 'other';
}

/* Minimal CSV reader (quotes, doubled quotes, commas and new lines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* Only the user's own keys of a repo JSON (notes such as _help removed). */
function withoutNotes(value) {
  return JSON.parse(JSON.stringify(value, (k, v) => (typeof k === 'string' && k.startsWith('_') ? undefined : v)));
}

/* A blank cell: '' (or null if the code chose that). */
const blankish = (v) => v === '' || v === null || v === undefined;

module.exports = { ALL, config, configure, harness, needLoaded, runSetup, describeDialog, setupPublished, clone, secretOf, previewKeyOf,
  roundInfo, roundBookId, metaMap, contractClean, isIso, todayIST, plainEnglish, colourFamily, parseCsv, withoutNotes,
  blankish };
