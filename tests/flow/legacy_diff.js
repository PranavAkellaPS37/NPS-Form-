/* =============================================================================
   tests/flow/legacy_diff.js: proves the new flow engine behaves like the old one.

   WHY IT EXISTS
     On 23 Oct 2026 the form's flow engine (web/js/flow.js) was rewritten to
     walk a graph (docs/flow-engine.md). Partners must not notice: for every
     questionnaire written in the old list format, the new engine has to show
     the same screens, allow Next in the same places and send byte-identical
     data. The old engine is kept, frozen, in tests/flow/legacy/flow_v1.js and
     this file compares the two, side by side, on many questionnaires and
     answer sets. The only intended difference is the stale-answer fix: rules
     now ignore answers of screens that are not on the partner's current path.

   WHAT IT COMPARES, for each questionnaire and answer set
     - the screens (ids and types) from every way of asking the new engine:
       path(), buildSteps() the old way and the new way, the questionnaire
       converted with fromLegacy() and sent through JSON, and (for today's
       questionnaire) the hand-written graph of docs/flow-graph-proposal.md §5;
     - Next allowed (canProceed) and "answered" (isAnswered) on every screen,
       also for steps built the old way (without "node");
     - the whole "submit" message, as JSON text (byte for byte).
     The expected answer is the old engine, except:
       chained    : rules that read an answer whose screen is not always shown.
                    Expected = the old engine with answers to screens off the
                    path removed (repeated until nothing changes).
       ends_early : a thank-you that is not last. Expected = the old path cut
                    at the first thank-you (where partners finished).
       refused    : a rule on a LATER answer, which today's checks refuse.
                    Differences are allowed; only checked that nothing breaks.
     Back-button scripts (answer, Next, Skip, Back, change an answer) are
     replayed against both engines through a copy of app.js's goNext/onBack:
     the screen shown must be the same after every tap, and so must the
     message at the end.

   WHAT IT READS / WRITES
     Reads tests/flow/legacy/flow_v1.js (its SHA-256 is checked first, so the
     frozen copy can never be edited unnoticed), web/js/flow.js and the fake
     questionnaires in tests/flow/legacy/variants/. Writes nothing.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/legacy_diff.js          under a minute
     node tests/flow/legacy_diff.js --full   every answer combination of
                                             today's questionnaire (1,411,788
                                             per mode) and 20 times more random
                                             sets (several minutes)
     Each group prints SAME (or DIFF with the first difference). The last line
     says "No differences." and the exit code is 0 when all is well.
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..', '..');
const FROZEN = path.join(HERE, 'legacy', 'flow_v1.js');
const FROZEN_SHA256 = '74cf61492d6e7cea067002b82d805538b7c6bdb1105e18a86ceb66385dc12f67';
const FULL = process.argv.includes('--full');
const started = Date.now();

/* ---- 0. the frozen old engine must be byte-identical to the one recorded ---- */
const sha = crypto.createHash('sha256').update(fs.readFileSync(FROZEN)).digest('hex');
if (sha !== FROZEN_SHA256) {
  console.error('STOP: tests/flow/legacy/flow_v1.js has changed (SHA-256 ' + sha + ').\n' +
    'It must stay a byte-for-byte copy of the engine before the 23 Oct 2026 rewrite. Restore it with:\n' +
    '  git show 1c99b5e:web/js/flow.js > tests/flow/legacy/flow_v1.js');
  process.exit(1);
}
console.log('SAME frozen old engine: SHA-256 ' + sha.slice(0, 16) + '…');

const legacy = require(FROZEN);
const flow = require(path.join(REPO, 'web/js/flow.js'));
if (legacy === flow || typeof flow.path !== 'function') { console.error('STOP: could not load both engines'); process.exit(1); }

/* ---- questionnaires ---------------------------------------------------------- */
const VDIR = path.join(HERE, 'legacy', 'variants');
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(VDIR, f), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const BASE = readJSON('base.json');
const GRAPH = readJSON('graph-default.json').flow;
const ENGINE_KEYS = ['rating', 'deep_dive', 'functions', 'support', 'flow'];

function make(name, cfg, expect, extra) {
  const g = flow.fromLegacy(cfg);
  const json = clone(cfg);
  json.flow = JSON.parse(JSON.stringify(g));            // fromLegacy -> JSON -> load
  if (!flow.isGraph(json.flow) || !flow.supportsFormat(json.flow)) throw new Error(name + ': converted flow is not a graph');
  return Object.assign({ name, cfg, json, expect: expect || 'same' }, extra || {});
}
function variant(name, edit, expect, extra) { const c = clone(BASE); edit(c); return make(name, c, expect, extra); }
const at = (c, id) => c.flow.findIndex((e) => e.id === id);
const insertAfter = (c, id, entry) => c.flow.splice(at(c, id) + 1, 0, entry);

const withGraph = (cfg) => { const s = clone(cfg); s.flow = clone(GRAPH); return s; };

/* Designer A's variants (22 Oct prototype), as edits of the frozen base. */
const DESIGNED = [
  variant('A-C0 today (also the hand-written graph)', () => {}, 'same', { graph: withGraph(BASE) }),
  variant('A-C1 immediate', (c) => { c.deep_dive.when = 'immediate'; }),
  variant('A-C2 thresholds', (c) => { c.deep_dive.threshold = 2; c.functions[1].threshold = 4; c.functions[5].threshold = 1; }),
  variant('A-C3 immediate + thresholds', (c) => { c.deep_dive.when = 'immediate'; c.deep_dive.threshold = 2; c.functions[1].threshold = 4; }),
  variant('A-C4 extra generic screens (no chains)', (c) => {
    insertAfter(c, 'nps', { id: 'intro2', type: 'info_card', text: 'q.x', body: 'q.y' });
    insertAfter(c, 'intro2', { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner', 'manager'], show_if: { answer: 'nps', at_most: 6 } });
    insertAfter(c, 'fn_deep_dives', { id: 'ease', type: 'rating_1_5', text: 'q.ease', required: false,
      show_if: { any: [{ answer: 'fn_rating:payments', at_most: 2 }, { answer: 'nps', at_least: 9 }] } });
    insertAfter(c, 'one_fix', { id: 'callme', type: 'yes_no', text: 'q.callme', show_if: { all: [{ answer: 'one_fix', answered: false }, { answer: 'nps', not_equals: 10 }] } });
  }),
  variant('A-C5 chained rule (role -> callback note -> kept)', (c) => {
    insertAfter(c, 'nps', { id: 'role', type: 'single_choice', text: 'q.role', options: ['owner', 'manager'], show_if: { answer: 'nps', at_most: 6 } });
    insertAfter(c, 'support', { id: 'callback_note', type: 'free_text', text: 'q.cb', required: true, show_if: { answer: 'role', equals: 'manager' } });
    insertAfter(c, 'callback_note', { id: 'kept', type: 'rating_1_5', text: 'q.k', show_if: { answer: 'support:kept_updated', at_most: 2 } });
  }, 'chained'),
  variant('A-C6 show_if on the area ratings (chained)', (c) => { c.flow[at(c, 'fn_ratings')].show_if = { answer: 'nps', at_most: 6 }; }, 'chained'),
  variant('A-C7 support/required/na settings', (c) => {
    c.flow[at(c, 'support')].required = false; c.support.allow_comment = false; c.support.allow_not_applicable = true;
    c.flow[at(c, 'one_fix')].required = true; c.rating.allow_not_applicable = false;
  }),
  variant('A-C8 reordered (one_fix first, language after what-changed)', (c) => {
    const lang = c.flow.splice(at(c, 'language'), 1)[0];
    insertAfter(c, 'whats_changed', lang);
    c.flow.unshift(c.flow.splice(at(c, 'one_fix'), 1)[0]);
  }),
  variant('A-C9 no language/what-changed; show_if on problem screens', (c) => {
    c.flow.splice(at(c, 'language'), 1); c.flow.splice(at(c, 'whats_changed'), 1);
    c.flow[at(c, 'fn_deep_dives')].show_if = { answer: 'nps', not_equals: 10 };
  }),
  variant('A-C10 chips optional', (c) => { c.deep_dive.require_chip = false; c.deep_dive.require_detail_if_other = false; }),
  variant('A-C11 immediate, problem line missing', (c) => { c.deep_dive.when = 'immediate'; c.flow.splice(at(c, 'fn_deep_dives'), 1); }),
  variant('A-C12 immediate, problem line with an ignored show_if', (c) => {
    c.deep_dive.when = 'immediate'; c.flow[at(c, 'fn_deep_dives')].show_if = { answer: 'nps', equals: 99 };
    c.flow[at(c, 'fn_ratings')].show_if = { answer: 'support_gate', not_equals: 'zzz' };
  }),
  variant('A-C13 ignored legacy fields (required on blocks, text on ratings)', (c) => {
    c.flow[at(c, 'fn_ratings')].required = false; c.flow[at(c, 'fn_deep_dives')].required = false;
    c.flow[at(c, 'fn_ratings')].text = 'q.nps'; c.flow[at(c, 'whats_changed')].required = true;
  }),
  variant('A-C14 no thank-you line (safety net)', (c) => { c.flow.splice(at(c, 'thanks'), 1); }),
  variant('A-C15 a thank-you mid flow, hidden by a rule', (c) => {
    insertAfter(c, 'nps', { id: 'thanks_early', type: 'thank_you', show_if: { answer: 'nps', equals: 0 } });
  }, 'ends_early'),
  variant('A-C16 a rule on a LATER answer', (c) => {
    insertAfter(c, 'nps', { id: 'callme', type: 'yes_no', text: 'q.callme', show_if: { answer: 'one_fix', answered: false } });
  }, 'refused'),
  variant('E-1 chained free text (one_fix -> callback -> its follow-up)', (c) => {
    insertAfter(c, 'one_fix', { id: 'callback', type: 'yes_no', text: 'q.cb', show_if: { answer: 'one_fix', answered: true } });
    insertAfter(c, 'callback', { id: 'callback_when', type: 'single_choice', text: 'q.cw', options: ['am', 'pm'], show_if: { answer: 'callback', equals: 'yes' } });
  }, 'chained'),
  variant('E-2 skip_if and show_if on one line, and skip_if on the support block', (c) => {
    const fix = c.flow[at(c, 'one_fix')];
    fix.skip_if = 'lang_in_url';
    fix.show_if = { answer: 'nps', at_least: 5 };
    c.flow[at(c, 'support')].skip_if = 'empty';
  }),
  variant('E-3 defaults: no deep_dive threshold, an area threshold written as text, own comment text', (c) => {
    delete c.deep_dive.threshold;
    c.functions[2].threshold = '2';
    c.support.comment_text = 'q.support_comment_v2';
  }),
  variant('E-4 immediate, thresholds 0 and 5, no "na", chips optional', (c) => {
    c.deep_dive.when = 'immediate'; c.deep_dive.threshold = 0;
    c.functions[0].threshold = 5; c.rating.allow_not_applicable = false; c.deep_dive.require_chip = false;
  })
];

/* The flow audit's corpus (22 Oct), frozen as small override files of base.json. */
const CORPUS = fs.readdirSync(VDIR).filter((f) => /^(form|data|verify)-.*\.json$/.test(f)).sort().map((f) => {
  const v = readJSON(f);
  const cfg = clone(BASE);
  ENGINE_KEYS.forEach((k) => { if (k in v) cfg[k] = v[k]; });
  if (!['same', 'chained', 'ends_early', 'refused'].includes(v._expect)) throw new Error(f + ': bad _expect');
  return make(f.replace(/\.json$/, ''), cfg, v._expect, { note: v._note });
});

/* ---- answer sets ------------------------------------------------------------ */
/* mulberry32: a small, well-mixed 32-bit generator, the same sequence on every run.
   (The 22 Oct prototype's "seed * 1103515245" lost precision above 2^53 and
   repeated after about 10,500 numbers, so its sets cycled after ~300.) */
let seed = 12345;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];
const maybe = (p) => rnd() < p;
const CLIP = (n) => ({ mime: 'audio/webm;codecs=opus', duration_s: n, bytes: 300 * n });
const BUILT_IN = /^(language_picker|whats_changed|function_ratings|function_deep_dives|support_block|thank_you|info_card)$/;

function randomState(cfg) {
  const answers = {}, texts = {}, audio = {};
  (cfg.flow || []).forEach((e) => {
    if (!e || !e.id || maybe(0.2)) return;
    if (e.type === 'nps_0_10') answers[e.id] = pick([0, 1, 5, 6, 7, 8, 9, 10]);
    else if (e.type === 'yes_no') answers[e.id] = pick(['yes', 'no']);
    else if (e.type === 'rating_1_5') answers[e.id] = pick([1, 2, 3, 4, 5]);
    else if (e.type === 'single_choice') answers[e.id] = pick((Array.isArray(e.options) ? e.options : ['x']).concat(['zz']));
    else if (e.type === 'free_text') {
      if (maybe(0.6)) texts[e.id] = pick(['fix payouts', '   ', '']);
      if (maybe(0.2)) audio[e.id] = CLIP(8);
    } else if (!BUILT_IN.test(e.type)) answers[e.id] = pick([1, 73, 'yes']);
  });
  (cfg.functions || []).forEach((fn) => {
    if (maybe(0.9)) answers['fn_rating:' + fn.id] = pick(['na', 1, 2, 3, 4, 5]);
    if (maybe(0.5)) answers['fn_deep_dive:' + fn.id] = pick((fn.issues || []).concat(['other']));
    if (maybe(0.3)) texts['fn_deep_dive:' + fn.id] = pick(['late again', '   ', '']);
    if (maybe(0.15)) audio['fn_deep_dive:' + fn.id] = CLIP(3);
  });
  ((cfg.support && cfg.support.items) || []).forEach((it) => { if (maybe(0.7)) answers['support:' + it] = pick([1, 2, 3, 4, 5, 'na']); });
  if (maybe(0.4)) texts.support_comment = pick(['slow', ' ']);
  if (maybe(0.2)) audio.support_comment = CLIP(5);
  if (maybe(0.2)) answers.ghost = 'yes';                 // an answer no screen stores: never sent
  return {
    answers, texts, audio, lang_chosen: maybe(0.5), submission_id: 'sub_1', session_id: 'ses_1',
    opened_at: '2026-10-23T10:00:00Z', started_at: maybe(0.5) ? '2026-10-23T10:00:05Z' : null,
    submitted_at: '2026-10-23T10:05:00Z', resume_count: 1, events: [{ seq: 1, screen: 'nps', at: '2026-10-23T10:01:00Z' }]
  };
}
const META = { survey_id: 'valmo-partner-pulse', config_version: 'v', app_version: '0.2.0', dc: 'DC-DEMO-001', t: 'x',
  round: 'DEMO-R1', lang: 'hi', mode: 'mock', sent_at: '2026-10-23T10:06:00Z', attempt: 1, client: { net: '4g' } };
const getAudio = (id) => (id.length % 2 ? 'QUJD' : null);   // some recordings are missing from the phone

/* ---- what the old engine says (or its oracle) --------------------------------- */
function legacySteps(cfg, state, ctxOld) {
  return legacy.buildSteps(cfg, Object.assign({ answers: legacy.ruleAnswers(state) }, ctxOld));
}
/* chained: the old engine with answers to screens off the path removed, until nothing changes */
function legacyPruned(cfg, state, ctxOld) {
  let st = clone(state);
  for (let k = 0; k < 20; k++) {
    const steps = legacySteps(cfg, st, ctxOld);
    const keep = {};
    steps.forEach((s) => {
      keep[s.id] = true;
      if (s.type === 'support_block') { ((cfg.support && cfg.support.items) || []).forEach((i) => { keep['support:' + i] = true; }); keep.support_comment = true; }
    });
    const next = clone(state);
    ['answers', 'texts', 'audio'].forEach((part) => Object.keys(next[part]).forEach((key) => { if (!keep[key]) delete next[part][key]; }));
    if (JSON.stringify(next) === JSON.stringify(st)) return { steps, state: st };
    st = next;
  }
  throw new Error('the stale-free oracle did not settle');
}
function expected(v, state, ctxOld) {
  if (v.expect === 'chained') return legacyPruned(v.cfg, state, ctxOld);
  let steps = legacySteps(v.cfg, state, ctxOld);
  if (v.expect === 'ends_early') {
    const k = steps.findIndex((s) => s.type === 'thank_you');
    steps = steps.slice(0, k + 1);
  }
  return { steps, state };
}

const ids = (steps) => steps.map((s) => s.id + '/' + s.type).join(' > ');
const sub = (engine, cfg, state, steps) => JSON.stringify(engine.buildSubmission(cfg, state, steps, META, getAudio));

/* One answer set against one questionnaire. Returns a list of problems. */
function compareOne(v, state, lu, wc, light) {
  const problems = [];
  const facts = { lang: 'hi', lang_in_url: lu, whats_changed_count: wc, round: 'DEMO-R1' };
  const ctxOld = { langInUrl: lu, hasWhatsChanged: wc > 0 };
  const routes = {
    'path()': [v.cfg, flow.path(flow.load(v.cfg), v.cfg, { facts }, state)],
    'fromLegacy->JSON->load': [v.json, flow.path(flow.load(v.json), v.json, { facts }, state)]
  };
  if (!light) {
    routes['buildSteps(old ctx)'] = [v.cfg, flow.buildSteps(v.cfg, Object.assign({ answers: flow.ruleAnswers(state) }, ctxOld))];
    routes['buildSteps(state ctx)'] = [v.cfg, flow.buildSteps(v.cfg, { state, langInUrl: lu, whatsChangedCount: wc, lang: 'hi', round: 'DEMO-R1' })];
  }
  if (v.graph) routes['hand-written graph'] = [v.graph, flow.path(flow.load(v.graph), v.graph, { facts }, state)];
  const main = routes['path()'][1];
  const mainIds = ids(main);
  Object.keys(routes).forEach((r) => { if (ids(routes[r][1]) !== mainIds) problems.push('route ' + r + ' differs from path():\n   ' + ids(routes[r][1]) + '\n   ' + mainIds); });
  const last = main[main.length - 1];
  if (!last || !flow.isEnd(last)) problems.push('the path does not end on an ending');
  if (v.expect === 'refused') {   // only: nothing breaks
    main.forEach((s) => { flow.canProceed(s, state, v.cfg); flow.isAnswered(s, state); });
    sub(flow, v.cfg, state, main);
    return problems;
  }

  const exp = expected(v, state, ctxOld);
  if (ids(exp.steps) !== mainIds) { problems.push('path\n   old: ' + ids(exp.steps) + '\n   new: ' + mainIds); return problems; }
  exp.steps.forEach((s, k) => {
    const want = legacy.canProceed(s, exp.state, v.cfg);
    Object.keys(routes).forEach((r) => {
      const got = flow.canProceed(routes[r][1][k], state, routes[r][0]);
      if (got !== want) problems.push('canProceed ' + s.id + ' (' + r + ') old=' + want + ' new=' + got);
    });
    if (!light && flow.canProceed(s, exp.state, v.cfg) !== want) problems.push('canProceed of an old-style step ' + s.id);
    const ans = legacy.isAnswered(s, exp.state);
    if (flow.isAnswered(main[k], state) !== ans) problems.push('isAnswered ' + s.id);
    if (!light && flow.isAnswered(s, exp.state) !== ans) problems.push('isAnswered of an old-style step ' + s.id);
  });
  const want = sub(legacy, v.cfg, exp.state, exp.steps);
  Object.keys(routes).forEach((r) => {
    const got = sub(flow, routes[r][0], state, routes[r][1]);
    if (got !== want) problems.push('submission (' + r + ')\n   old: ' + want + '\n   new: ' + got);
  });
  if (!light) {
    const got = sub(flow, v.cfg, exp.state, exp.steps);
    if (got !== want) problems.push('submission from old-style steps\n   old: ' + want + '\n   new: ' + got);
  }
  return problems;
}

let failures = 0;
function report(label, n, bad, first, extra) {
  if (bad) failures += bad;
  console.log((bad ? 'DIFF ' : 'SAME ') + label + ': ' + n + (extra || '') + (bad ? ', ' + bad + ' differ. First:\n  ' + first : ''));
}

/* ---- 1. every answer combination of today's questionnaire --------------------- */
/* Default: each area unanswered / na / 3 (low) / 4 (not low). --full: every value. */
const AREA_VALUES = FULL ? [undefined, 'na', 1, 2, 3, 4, 5] : [undefined, 'na', 3, 4];
function* combos(k) {
  if (k === 0) { yield []; return; }
  for (const rest of combos(k - 1)) for (const val of AREA_VALUES) yield rest.concat([val]);
}
function fixedExtras(cfg, answers, texts, audio) {   // the same chips, texts and support answers every time
  cfg.functions.forEach((fn, i) => {
    answers['fn_deep_dive:' + fn.id] = i % 2 ? 'other' : fn.issues[i % fn.issues.length];
    if (i % 3 === 0) texts['fn_deep_dive:' + fn.id] = 'words ' + i;
    if (i % 3 === 1) audio['fn_deep_dive:' + fn.id] = CLIP(i + 1);
  });
  cfg.support.items.forEach((it, i) => { answers['support:' + it] = i === 3 ? 'na' : i + 2; });
  texts.support_comment = 'slow';
  texts.one_fix = ' fix payouts ';
}
const exhaustive = [DESIGNED[0], DESIGNED[1]];   // today's questionnaire, after all ratings and immediate
for (const v of exhaustive) {
  const areas = v.cfg.functions.map((f) => f.id);
  let n = 0, bad = 0, first = null;
  for (const rs of combos(areas.length)) {
    for (const gate of [undefined, 'yes', 'no']) {
      for (const lu of [false, true]) for (const wc of [0, 1]) {
        const answers = { nps: 7 }, texts = {}, audio = {};
        rs.forEach((val, i) => { if (val !== undefined) answers['fn_rating:' + areas[i]] = val; });
        if (gate) answers.support_gate = gate;
        fixedExtras(v.cfg, answers, texts, audio);
        const state = { answers, texts, audio, lang_chosen: true, submission_id: 's', session_id: 'x', events: [] };
        // --full: 2.8 million sets, so only the core checks (path, the JSON route, Next, the message)
        const p = compareOne(v, state, lu, wc, FULL);
        n++;
        if (p.length) { bad++; if (!first) first = p.join('\n  '); }
      }
    }
  }
  report('every combination, ' + v.name, n, bad, first, ' answer sets (' + AREA_VALUES.length + ' values per area)');
}

/* ---- 2. random answer sets on every questionnaire variant ----------------------- */
const N = FULL ? 20000 : 1000;
const counts = { same: 0, chained: 0, ends_early: 0, refused: 0 };
for (const v of DESIGNED.concat(CORPUS)) {
  counts[v.expect]++;
  let bad = 0, first = null, stale = 0, differs = 0;
  const paths = new Set(), sets = new Set();
  for (let i = 0; i < N; i++) {
    const state = randomState(v.cfg);
    const lu = maybe(0.5), wc = pick([0, 0, 1, 3]);
    sets.add(JSON.stringify([state, lu, wc]));
    let p;
    try {
      p = compareOne(v, state, lu, wc, false);
    } catch (e) {
      p = ['threw: ' + (e && e.stack)];
    }
    const neu = flow.path(flow.load(v.cfg), v.cfg, { facts: { lang_in_url: lu, whats_changed_count: wc } }, state);
    paths.add(ids(neu));
    if (v.expect === 'chained' || v.expect === 'refused') {
      const old = legacySteps(v.cfg, state, { langInUrl: lu, hasWhatsChanged: wc > 0 });
      if (ids(old) !== ids(neu)) (v.expect === 'chained' ? stale++ : differs++);
    }
    if (p.length) { bad++; if (!first) first = p.join('\n  '); }
  }
  const extra = ' answer sets (' + sets.size + ' distinct), ' + paths.size + ' distinct paths' +
    (v.expect === 'chained' ? ', ' + stale + ' would show stale answers in the old engine (compared with the stale-free oracle)' : '') +
    (v.expect === 'ends_early' ? ' (compared with the old path cut at the first thank-you)' : '') +
    (v.expect === 'refused' ? ' [refused by today\'s checks: ' + differs + ' differ from the old engine, as expected; checked only that nothing breaks]' : '');
  report('[' + v.expect + '] ' + v.name, N, bad, first, extra);
}

/* ---- 3. Back-button scripts --------------------------------------------------- */
/* A copy of app.js's goNext / onBack / Skip, driven tap by tap. */
function answerFor(step, cfg, act, state) {
  const r = act.r;
  const one = (list) => list[Math.floor(r * list.length)];
  const entry = (cfg.flow || []).find((e) => e && e.id === step.id) || {};
  switch (step.type) {
    case 'language_picker': state.lang_chosen = true; return;
    case 'nps_0_10': state.answers[step.id] = one([0, 3, 6, 7, 9, 10]); return;
    case 'function_rating': state.answers[step.id] = one(['na', 1, 2, 3, 4, 5]); return;
    case 'yes_no': state.answers[step.id] = one(['yes', 'no']); return;
    case 'rating_1_5': state.answers[step.id] = one([1, 2, 3, 4, 5]); return;
    case 'single_choice': state.answers[step.id] = one(entry.options || ['x']); return;
    case 'function_deep_dive': {
      const fn = cfg.functions.find((f) => 'fn_deep_dive:' + f.id === step.id);
      state.answers[step.id] = one(fn.issues.concat(['other']));
      break;
    }
    case 'support_block':
      cfg.support.items.forEach((it, i) => { if ((r * (i + 3) * 7.31) % 1 < 0.85) state.answers['support:' + it] = 1 + Math.floor(((r * (i + 5) * 3.7) % 1) * 5); });
      if (act.text) state.texts.support_comment = 'slow';
      return;
    case 'free_text': break;
    default: return;
  }
  if (act.text) state.texts[step.id] = r < 0.25 ? '  ' : 'words';
  if (act.voice) state.audio[step.id] = CLIP(2);
}
function drive(engine, v, survey, script, lu, wc) {
  const state = { answers: {}, texts: {}, audio: {}, lang_chosen: false, submission_id: 's', session_id: 'x', events: [] };
  const ctxOld = { langInUrl: lu, hasWhatsChanged: wc > 0 };
  let view = null;   // what the old engine (or its oracle) sees
  const build = () => {
    if (engine === 'new') return flow.path(flow.load(survey), survey, { facts: { lang_in_url: lu, whats_changed_count: wc } }, state);
    view = v.expect === 'chained' ? legacyPruned(v.cfg, state, ctxOld) : { steps: legacySteps(v.cfg, state, ctxOld), state };
    return view.steps;
  };
  const can = (step) => engine === 'new' ? flow.canProceed(step, state, survey) : legacy.canProceed(step, view.state, v.cfg);
  let steps = build();
  let current = steps[0];
  const shown = [current.id];
  for (const act of script) {
    if (act.kind === 'answer') {
      answerFor(current, v.cfg, act, state);
    } else if (act.kind === 'next' || act.kind === 'skip') {
      steps = build();
      const idx = steps.findIndex((s) => s.id === current.id);
      if (idx === -1) { current = steps[0]; shown.push('(restart) ' + current.id); continue; }
      if (act.kind === 'next' && !can(steps[idx])) { shown.push('(blocked)'); continue; }
      const target = steps[idx + 1];
      if (!target) continue;
      if (target.type === 'thank_you') { shown.push('FINISH'); break; }
      current = target;
    } else if (act.kind === 'back') {
      steps = build();
      const idx = steps.findIndex((s) => s.id === current.id);
      if (idx > 0) current = steps[idx - 1];
    }
    shown.push(current.id);
  }
  steps = build();
  const message = engine === 'new' ? sub(flow, survey, state, steps) : sub(legacy, v.cfg, view.state, steps);
  return { shown: shown.join(' '), message };
}
const RUNS = FULL ? 3000 : 500;
const backVariants = [
  [DESIGNED[0], 'list'], [DESIGNED[0], 'hand-written graph'], [DESIGNED[0], 'fromLegacy->JSON'], [DESIGNED[1], 'list'],
  [DESIGNED[3], 'list'], [DESIGNED[5], 'list'], [DESIGNED[6], 'list'], [DESIGNED[17], 'list'],
  [CORPUS.find((v) => v.name === 'form-x_c4_show_if_on_chip'), 'list'], [CORPUS.find((v) => v.name === 'verify-x10_chip_chain'), 'list']
];
for (const [v, route] of backVariants) {
  const survey = route === 'hand-written graph' ? v.graph : route === 'fromLegacy->JSON' ? v.json : v.cfg;
  let bad = 0, first = null, backs = 0, changed = 0;
  const scripts = new Set();
  for (let run = 0; run < RUNS; run++) {
    const script = [];
    for (let k = 0; k < 70; k++) {
      const roll = rnd();
      if (roll < 0.45) script.push({ kind: 'answer', r: rnd(), text: rnd() < 0.5, voice: rnd() < 0.15 });
      else if (roll < 0.75) script.push({ kind: 'next' });
      else if (roll < 0.8) script.push({ kind: 'skip' });
      else { script.push({ kind: 'back' }); backs++; }
    }
    const lu = maybe(0.5), wc = pick([0, 1, 3]);
    scripts.add(JSON.stringify([script, lu, wc]));
    const a = drive('old', v, survey, script, lu, wc);
    const b = drive('new', v, survey, script, lu, wc);
    if (v.expect === 'chained') {
      const plain = drive('old', Object.assign({}, v, { expect: 'same' }), survey, script, lu, wc);
      if (plain.shown !== a.shown || plain.message !== a.message) changed++;
    }
    if (a.shown !== b.shown || a.message !== b.message) {
      bad++;
      if (!first) first = 'taps:  ' + a.shown + '\n  new:   ' + b.shown + (a.message !== b.message ? '\n  old message: ' + a.message + '\n  new message: ' + b.message : '');
    }
  }
  report('Back-button scripts [' + v.expect + '] ' + v.name + ' (' + route + ')', RUNS, bad, first,
    ' scripts (' + scripts.size + ' distinct), ' + backs + ' Back taps' + (v.expect === 'chained' ? ', ' + changed + ' where the old engine (with stale answers) would differ' : ''));
}

console.log('\nQuestionnaires: ' + (DESIGNED.length + CORPUS.length) + ' (' + Object.keys(counts).map((k) => counts[k] + ' ' + k).join(', ') + '). ' +
  'Took ' + Math.round((Date.now() - started) / 1000) + ' s' + (FULL ? ' (--full)' : '') + '.');
console.log(failures ? 'DIFFERENCES FOUND: ' + failures : 'No differences.');
process.exitCode = failures ? 1 : 0;
