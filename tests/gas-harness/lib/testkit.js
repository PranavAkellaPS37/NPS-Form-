/* =============================================================================
   lib/testkit.js  -  the small toolkit the scenarios in run-tests.js use

   WHAT THIS FILE IS
     - Scenario: collects checks ("must" = failure blocks, "should" = warning)
       and turns them into PASS / WARN / FAIL with plain-English reasons.
     - call(): runs one Apps Script function in the fake Google and records,
       if it throws, WHICH function failed, with what message, and where.
     - Helpers to talk to the web app (doGet / doPost) like a phone would,
       to compute link tokens, and to build realistic fake submissions.

   HOW TO USE IT
     Only run-tests.js uses it.

   WHAT IT READS / WRITES
     Nothing on disk.
   ============================================================================= */
'use strict';

const crypto = require('crypto');
const util = require('util');
const { loadGas, toClientValue } = require('../load-gas');

class Stop extends Error {}

function show(value, max) {
  let text;
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, (k, v) => (v === undefined ? '(undefined)' : v));
  } catch (e) {
    text = util.inspect(value, { depth: 3 });
  }
  if (text === undefined) text = String(value);
  const limit = max || 300;
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

function deepEqual(a, b) {
  return util.isDeepStrictEqual(JSON.parse(JSON.stringify(a === undefined ? null : a)), JSON.parse(JSON.stringify(b === undefined ? null : b)));
}

class Scenario {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.checks = [];
    this.notes = [];
    this.crash = null;
    this.skipped = null;
    this.started = Date.now();
  }

  /* A check that must hold (FAIL otherwise). Returns the condition. */
  ok(cond, what, detail) {
    this.checks.push({ level: 'must', ok: !!cond, what, detail: cond ? undefined : (detail || '') });
    return !!cond;
  }

  /* A check that should hold (WARN otherwise). */
  soft(cond, what, detail) {
    this.checks.push({ level: 'should', ok: !!cond, what, detail: cond ? undefined : (detail || '') });
    return !!cond;
  }

  eq(actual, expected, what, level) {
    const same = deepEqual(actual, expected);
    const fn = level === 'should' ? this.soft : this.ok;
    return fn.call(this, same, what, same ? undefined : `expected ${show(expected)}, got ${show(actual)}`);
  }

  /* Stop the scenario here when cond is false (the rest cannot work). */
  need(cond, what, detail) {
    if (!this.ok(cond, what, detail)) throw new Stop(what);
  }

  note(text) { this.notes.push(text); }

  status() {
    if (this.skipped) return 'SKIP';
    if (this.crash || this.checks.some((c) => c.level === 'must' && !c.ok)) return 'FAIL';
    if (this.checks.some((c) => !c.ok)) return 'WARN';
    return 'PASS';
  }
}

/* Run fn(scenario) and never let an error escape. */
async function runScenario(list, id, title, fn, onDone) {
  const s = new Scenario(id, title);
  try {
    await fn(s);
  } catch (err) {
    if (!(err instanceof Stop)) s.crash = String((err && err.stack) || err).split('\n').slice(0, 6).join('\n');
  }
  s.ms = Date.now() - s.started;
  list.push(s);
  if (onDone) onDone(s);
  return s;
}

/* -------------------------------------------------------------------------
   Running Apps Script functions
   ------------------------------------------------------------------------- */
function freshHarness(options) {
  return loadGas(Object.assign({ adminEmail: 'admin@example.com' }, options || {}));
}

/* Run a function; on failure record "<fn> threw: message (where)". Returns
   the plain-data result (as the panel would receive it), or undefined.
   opts.context: 'panel' (default), 'menu', 'webapp', 'simpleTrigger'
   opts.need: stop the scenario if it fails
   opts.raw: return the value as the code returned it (no JSON copy) */
function call(h, s, fn, args, opts) {
  const o = Object.assign({ context: 'panel', need: false, raw: false }, opts || {});
  const r = h.exec(fn, args || [], { context: o.context });
  const label = `${fn}(${(args || []).map((a) => show(a, 40)).join(', ')})`;
  if (!r.ok) {
    const where = r.error.where ? ` at ${r.error.where}` : '';
    const what = o.what || `${fn} runs without an error`;
    if (o.need) s.need(false, what, `${label} threw: ${r.error.message}${where}`);
    else s.ok(false, what, `${label} threw: ${r.error.message}${where}`);
    return undefined;
  }
  if (o.raw) return r.value;
  const client = toClientValue(r.value);
  if (o.context === 'panel') {
    s.ok(!client.problems.some((p) => /Date/.test(p)), `${fn} returns plain data (no Date objects; Google would hand the panel null)`,
      client.problems.join('; '));
  }
  return client.value === undefined ? null : client.value;
}

/* -------------------------------------------------------------------------
   The web app, as a phone uses it
   ------------------------------------------------------------------------- */
function getEvent(params) {
  const parameter = Object.assign({}, params);
  const parameters = {};
  Object.keys(parameter).forEach((k) => { parameters[k] = [parameter[k]]; });
  return { parameter, parameters, queryString: new URLSearchParams(parameter).toString(), contextPath: '', contentLength: -1 };
}

function postEvent(body, type) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { parameter: {}, parameters: {}, queryString: '', contextPath: '', contentLength: Buffer.byteLength(text),
    postData: { contents: text, length: Buffer.byteLength(text), type: type || 'text/plain', name: 'postData' } };
}

/* Returns { ok, json, text, mime, error, run } for one web-app call. */
function web(h, fn, event) {
  const r = h.exec(fn, [event], { context: 'webapp' });
  if (!r.ok) return { threw: true, error: r.error, run: r.run };
  const out = h.admin.unwrapOutput(r.value);
  if (!out || out.kind !== 'text') return { threw: false, notText: true, out, run: r.run };
  let json = null;
  try { json = JSON.parse(out.content); } catch (e) { json = null; }
  return { threw: false, json, text: out.content, mime: out.mime ? out.mime.name : null, run: r.run };
}

function webGet(h, params) { return web(h, 'doGet', getEvent(params)); }
function webPost(h, body, type) { return web(h, 'doPost', postEvent(body, type)); }

/* Records the standard checks for any web answer and returns its JSON. */
function webJson(s, res, label) {
  if (res.threw) {
    s.ok(false, `${label}: the web app answers (it must never crash)`, `threw: ${res.error.message}${res.error.where ? ' at ' + res.error.where : ''}`);
    return null;
  }
  if (res.notText) {
    s.ok(false, `${label}: the web app answers with ContentService text`, `returned ${res.out ? res.out.kind : 'nothing'}`);
    return null;
  }
  s.ok(res.json && typeof res.json.ok === 'boolean', `${label}: answer is JSON with "ok"`, show(res.text));
  s.soft(res.mime === 'JSON', `${label}: answer has mime type JSON`, `mime ${res.mime}`);
  return res.json;
}

/* -------------------------------------------------------------------------
   Tokens and fake submissions (fake data only)
   ------------------------------------------------------------------------- */
function token(secret, dc, round) {
  return crypto.createHmac('sha256', secret).update(`${dc}|${round}`).digest('base64url').slice(0, 22);
}

/* A deterministic fake "voice note": a WebM-like header and filler bytes. */
function fakeAudio(bytes) {
  const buf = Buffer.alloc(bytes);
  Buffer.from('1a45dfa3', 'hex').copy(buf, 0);
  for (let i = 4; i < bytes; i += 1) buf[i] = (i * 37 + 11) % 256;
  return buf;
}

function makeSubmission(o) {
  const at = (sec) => new Date(Date.UTC(2026, 9, 20, 5, 0, sec)).toISOString();
  const audio = o.audioBytes === 0 ? null : fakeAudio(o.audioBytes || 2048);
  const ratings = o.ratings || [
    { block: 'function', item: 'losses', rating: 2, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'no_proof' },
    { block: 'function', item: 'payments', rating: 4, not_applicable: false, threshold: 3, below_threshold: false, issue_code: null },
    { block: 'function', item: 'linehaul', rating: 3, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'other' },
    { block: 'function', item: 'consumables', rating: null, not_applicable: true, threshold: 3, below_threshold: false, issue_code: null },
    { block: 'function', item: 'orders', rating: 5, not_applicable: false, threshold: 3, below_threshold: false, issue_code: null },
    { block: 'function', item: 'app', rating: 1, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'app_slow_crash' },
    { block: 'support', item: 'agent_behaviour', rating: 4, not_applicable: false, threshold: null, below_threshold: null, issue_code: null },
    { block: 'support', item: 'understood_problem', rating: 3, not_applicable: false, threshold: null, below_threshold: null, issue_code: null }
  ];
  const freeText = o.free_text || [
    { item_id: 'fn_deep_dive:losses', block: 'function', function: 'losses', issue_code: 'no_proof', question_key: 'q.tell_more',
      text: 'debit aaya par photo proof nahi diya', audio: audio ? { mime: o.mime || 'audio/webm;codecs=opus', duration_s: 2.4, bytes: audio.length, base64: audio.toString('base64') } : null },
    { item_id: 'fn_deep_dive:linehaul', block: 'function', function: 'linehaul', issue_code: 'other', question_key: 'q.tell_more',
      text: o.text2 !== undefined ? o.text2 : 'truck raat 2 baje aata hai 🙏 சரி', audio: null },
    { item_id: 'one_fix', block: 'one_fix', function: null, issue_code: null, question_key: 'q.one_fix', text: 'पेमेंट समय पर आए', audio: null }
  ];
  const events = o.events || ['nps', 'fn_rating:losses', 'fn_rating:payments', 'fn_deep_dive:losses', 'support_gate', 'one_fix', 'thanks']
    .map((screen, i) => ({ seq: i + 1, screen, at: at(10 + i * 5) }));
  const body = {
    kind: 'submit', schema_version: 1, survey_id: 'valmo-partner-pulse', config_version: o.config_version || 'p1-2026-10-20',
    app_version: '0.1.0', submission_id: o.submission_id, session_id: o.session_id || 'ses_harness0000001', dc: o.dc,
    t: o.t, round: o.round, lang: o.lang || 'hi', mode: 'live',
    opened_at: at(0), started_at: at(8), submitted_at: at(55), sent_at: at(56), attempt: o.attempt || 1, resume_count: 0,
    client: { ua: 'Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      viewport: '360x740', tz_offset_min: -330, net: '3g', voice_supported: true, voice_denied: false, tts_voice: true },
    answers: o.answers || { nps: 6, support_gate: 'yes' },
    ratings,
    free_text: freeText,
    events
  };
  if (o.drop) for (const k of o.drop) delete body[k];
  return body;
}

function makePing(o) {
  const body = {
    kind: 'ping', schema_version: 1, stage: o.stage || 'opened', survey_id: 'valmo-partner-pulse', config_version: 'p1-2026-10-20',
    app_version: '0.1.0', dc: o.dc, t: o.t, round: o.round, session_id: o.session_id || 'ses_harnessping001', lang: o.lang || 'hi',
    mode: 'live', screen: o.screen || 'nps', step_index: 2, step_total: 13, at: new Date(Date.UTC(2026, 9, 20, 5, 0, 0)).toISOString()
  };
  if (body.stage === 'opened') body.client = { ua: 'Mozilla/5.0 (Linux; Android 11)', viewport: '360x740', tz_offset_min: -330, net: '4g' };
  if (body.stage === 'progress') body.events = o.events || [{ seq: 1, screen: 'nps', at: body.at }];
  if (o.t === undefined) delete body.t;
  return body;
}

module.exports = { Scenario, Stop, runScenario, freshHarness, call, show, deepEqual, getEvent, postEvent, webGet, webPost,
  webJson, token, fakeAudio, makeSubmission, makePing };
