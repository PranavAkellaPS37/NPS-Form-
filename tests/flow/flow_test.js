/* =============================================================================
   tests/flow/flow_test.js: checks the form's question-flow rules.

   WHAT IT CHECKS
     web/js/flow.js decides which screen comes next (the language picker, the
     "What changed" card, one rating screen per area, a problem screen for
     each low rating, the support questions, show_if rules). This file builds
     the screen list for 8 situations from web/config/survey.json and checks
     the order is exactly right.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/flow_test.js
     You should see 8 lines starting with PASS, then "8 tests passed".
     Any mistake stops it with an error that names the expected screens.

   WHAT IT READS / WRITES
     Reads web/js/flow.js and web/config/survey.json. Writes nothing.
   ============================================================================= */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/flow/)
const flow = require(path.join(REPO, 'web/js/flow.js'));
const config = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const ids = (steps) => steps.map((s) => s.id);
let n = 0; const ok = (name) => { n++; console.log('PASS', name); };

// 1. defaults
let steps = flow.buildSteps(config, { answers: {}, langInUrl: false, hasWhatsChanged: true });
assert.deepStrictEqual(ids(steps), ['language','whats_changed','nps','fn_rating:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_rating:app','support_gate','one_fix','thanks']);
ok('default path');

// 2. lang in url + no what-changed
steps = flow.buildSteps(config, { answers: {}, langInUrl: true, hasWhatsChanged: false });
assert.strictEqual(ids(steps)[0], 'nps'); ok('skip_if language + empty what-changed');

// 3. low ratings -> deep dives after all ratings
const answers = { 'fn_rating:losses': 2, 'fn_rating:payments': 3, 'fn_rating:linehaul': 4, 'fn_rating:consumables': 'na', 'fn_rating:orders': 1, 'fn_rating:app': 5, support_gate: 'yes' };
steps = flow.buildSteps(config, { answers, langInUrl: true, hasWhatsChanged: false });
assert.deepStrictEqual(ids(steps), ['nps','fn_rating:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_rating:app','fn_deep_dive:losses','fn_deep_dive:payments','fn_deep_dive:orders','support_gate','support','one_fix','thanks']);
ok('deep dives after all ratings + support block on yes');

// 4. immediate mode + per-area threshold
const cfg2 = JSON.parse(JSON.stringify(config));
cfg2.deep_dive.when = 'immediate';
cfg2.functions[1].threshold = 2; // payments: 3 is no longer low
steps = flow.buildSteps(cfg2, { answers, langInUrl: true, hasWhatsChanged: false });
assert.deepStrictEqual(ids(steps).slice(0, 9), ['nps','fn_rating:losses','fn_deep_dive:losses','fn_rating:payments','fn_rating:linehaul','fn_rating:consumables','fn_rating:orders','fn_deep_dive:orders','fn_rating:app']);
ok('immediate mode + per-area threshold override');

// 5. conditions
const A = { nps: 6, support_gate: 'yes', 'fn_rating:payments': 2 };
assert(flow.evalCondition({ answer: 'nps', at_most: 6 }, A));
assert(!flow.evalCondition({ answer: 'nps', at_least: 7 }, A));
assert(flow.evalCondition({ answer: 'support_gate', equals: 'yes' }, A));
assert(flow.evalCondition({ answer: 'support_gate', not_equals: 'no' }, A));
assert(flow.evalCondition({ answer: 'fn_rating:payments', in: [1, 2] }, A));
assert(flow.evalCondition({ answer: 'one_fix', answered: false }, A));
assert(flow.evalCondition({ all: [{ answer: 'nps', at_most: 6 }, { any: [{ answer: 'support_gate', equals: 'no' }, { answer: 'fn_rating:payments', at_most: 2 }] }] }, A));
assert(!flow.evalCondition({ answer: 'missing', equals: 'x' }, A));
assert(!flow.evalCondition({ answer: 'fn_rating:payments', at_most: 'x' }, { 'fn_rating:payments': 'na' }));
ok('show_if conditions');

// 6. canProceed
const st = { answers: {}, texts: {}, audio: {} };
const dd = { id: 'fn_deep_dive:losses', type: 'function_deep_dive', entry: {}, fn: config.functions[0] };
assert(!flow.canProceed(dd, st, config));
st.answers['fn_deep_dive:losses'] = 'other';
assert(!flow.canProceed(dd, st, config), 'other needs detail');
st.texts['fn_deep_dive:losses'] = '   ';
assert(!flow.canProceed(dd, st, config), 'blank text is not detail');
st.audio['fn_deep_dive:losses'] = { mime: 'audio/webm', duration_s: 3, bytes: 100 };
assert(flow.canProceed(dd, st, config));
const sup = { id: 'support', type: 'support_block', entry: {} };
assert(!flow.canProceed(sup, st, config));
['agent_behaviour','understood_problem','time_to_resolve','kept_updated'].forEach((i) => st.answers['support:' + i] = 4);
assert(flow.canProceed(sup, st, config));
assert(flow.canProceed({ id: 'one_fix', type: 'free_text', entry: { required: false } }, st, config));
assert(!flow.canProceed({ id: 'nps', type: 'nps_0_10', entry: { required: true } }, st, config));
ok('canProceed');

// 7. submission: only final-path answers
const state = {
  submission_id: 'sub_x', session_id: 'ses_x', opened_at: 'o', started_at: 's', submitted_at: 'f', resume_count: 1,
  answers: Object.assign({}, answers, { nps: 4, support_gate: 'no', 'support:agent_behaviour': 2,
    'fn_deep_dive:losses': 'no_proof', 'fn_deep_dive:linehaul': 'late_arrival', 'fn_deep_dive:orders': 'other' }),
  texts: { 'fn_deep_dive:losses': 'no photo proof', 'fn_deep_dive:linehaul': 'stale answer', 'support_comment': 'stale', 'one_fix': ' faster payouts ' , 'fn_deep_dive:orders': ''},
  audio: { 'fn_deep_dive:orders': { mime: 'audio/webm;codecs=opus', duration_s: 4.2, bytes: 3000 } },
  events: [{ seq: 1, screen: 'nps', at: 'x' }]
};
steps = flow.buildSteps(config, { answers: state.answers, langInUrl: true, hasWhatsChanged: false });
const sub = flow.buildSubmission(config, state, steps, { survey_id: 'valmo-partner-pulse', config_version: 'v', app_version: '0.1.0', dc: 'DC-DEMO-001', t: 'tok', round: 'DEMO-R1', lang: 'hi', mode: 'mock', sent_at: 'now', attempt: 1, client: {} }, (id) => id === 'fn_deep_dive:orders' ? 'QUJD' : null);
assert.deepStrictEqual(sub.answers, { nps: 4, support_gate: 'no' });
const fr = sub.ratings.filter((r) => r.block === 'function');
assert.strictEqual(fr.length, 6);
assert.deepStrictEqual(fr.find((r) => r.item === 'losses'), { block: 'function', item: 'losses', rating: 2, not_applicable: false, threshold: 3, below_threshold: true, issue_code: 'no_proof' });
assert.strictEqual(fr.find((r) => r.item === 'linehaul').issue_code, null, 'linehaul rated 4: stale chip dropped');
assert.deepStrictEqual(fr.find((r) => r.item === 'consumables'), { block: 'function', item: 'consumables', rating: null, not_applicable: true, threshold: 3, below_threshold: false, issue_code: null });
assert.strictEqual(sub.ratings.filter((r) => r.block === 'support').length, 0, 'support dropped when gate = no');
const items = sub.free_text.map((f) => f.item_id);
assert.deepStrictEqual(items, ['fn_deep_dive:losses', 'fn_deep_dive:orders', 'one_fix']);
const orders = sub.free_text.find((f) => f.item_id === 'fn_deep_dive:orders');
assert.deepStrictEqual(orders.audio, { mime: 'audio/webm;codecs=opus', duration_s: 4.2, bytes: 3000, base64: 'QUJD' });
assert.strictEqual(orders.text, '');
assert.strictEqual(orders.issue_code, 'other');
assert.strictEqual(sub.free_text.find((f) => f.item_id === 'one_fix').text, 'faster payouts');
assert.strictEqual(sub.free_text.find((f) => f.item_id === 'one_fix').block, 'one_fix');
assert.strictEqual(sub.kind, 'submit'); assert.strictEqual(sub.schema_version, 1); assert.strictEqual(sub.resume_count, 1);
ok('submission keeps only final-path answers');
console.log(n, 'tests passed');

// 8. show_if can test free-text screens via ruleAnswers
const cfg3 = JSON.parse(JSON.stringify(config));
cfg3.flow.splice(cfg3.flow.length - 1, 0, { id: 'callback', type: 'yes_no', text: 'q.support_gate', show_if: { answer: 'one_fix', answered: true } });
const st3 = { answers: { nps: 8, support_gate: 'no' }, texts: { one_fix: '' }, audio: {} };
let s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(!ids(s3).includes('callback'), 'hidden while one_fix empty');
st3.texts.one_fix = 'faster payouts';
s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(ids(s3).includes('callback'), 'shown once one_fix has text');
st3.texts.one_fix = ''; st3.audio.one_fix = { mime: 'audio/webm', duration_s: 2, bytes: 10 };
s3 = flow.buildSteps(cfg3, { answers: flow.ruleAnswers(st3), langInUrl: true, hasWhatsChanged: false });
assert(ids(s3).includes('callback'), 'shown once one_fix has a voice note');
assert.strictEqual(flow.ruleAnswers({ answers: { 'fn_deep_dive:x': 'other' }, texts: { 'fn_deep_dive:x': 'hi' }, audio: {} })['fn_deep_dive:x'], 'other', 'chip value wins over text marker');
const subm = flow.buildSubmission(cfg3, Object.assign({ submission_id: 's', session_id: 's', events: [] }, st3, { answers: Object.assign({ callback: 'yes' }, st3.answers) }), s3, { client: {} }, () => 'QQ==');
assert.deepStrictEqual(Object.keys(subm.answers).sort(), ['callback', 'nps', 'support_gate'], 'markers never leak into answers');
ok('free-text screens can be tested by show_if');
console.log(n, 'tests passed');
