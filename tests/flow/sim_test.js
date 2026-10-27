/* =============================================================================
   tests/flow/sim_test.js: tests the flow tools on the command line.

   WHAT IT CHECKS
     Every command of scripts/flow.js (docs/flow-engine.md section 7): check,
     map, simulate, paths, compare, screens, migrate (the old list of
     screens in survey.json becomes the graph, byte for byte the file in the
     project), build-gs (apps-script/Flow.gs, only --check here) and types
     (the catalogue of the kinds of screen, web/config/types.json, and the
     control panel's list made from it; with a new kind added to a copy:
     tests/flow/fixtures/types/stars_1_10.js, whose whole description
     Model.gs then also keeps, PP_ADDED_TYPES_, for Publish's checks and the
     panel's window; an older Model.gs is brought up to date; a plug-in file that registers
     or changes a kind that already exists is refused, and so is a kind
     that sends a ratings row for an answer outside 1 to 5) and es5 (every
     script phones load is ES5, with acorn; without acorn it says how to
     install it), with and without --json: what they print, and their exit
     codes (0 = all good, 1 = problems found, 2 = could not run). Every
     command but compare refuses a stray file name ("did you mean
     --published ...?"), simulate notes an answer no screen stores, and
     check notes a catalogue that describes a known kind differently from
     the code. Since 26 Oct 2026 the project's survey.json holds the graph;
     the old list it held until then is the frozen copy in
     tests/flow/legacy/variants/base.json.
     Also:
       - scripts/flow.py (the Python wrapper), including what it says when
         Node.js is missing;
       - the root package.json (npm run validate-flow, no packages);
       - scripts/check_config.py running the flow check: flow errors stop
         it, a missing Node.js is explained, and an out-of-date docs/flow.md
         is a warning; an out-of-date web/config/types.json stops it; a
         script that is not ES5 stops it; without acorn it warns (an error
         when ACORN_PATH was given, as on GitHub);
       - .github/workflows/deploy-pages.yml installs acorn 8.14.0 and passes
         ACORN_PATH to the settings check; scripts/flow.py's header lists
         every command that writes a file.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/flow/sim_test.js
     You should see one PASS line per check, then "N tests passed" (about 20
     seconds). A failure stops with a message naming what was expected.

   WHAT IT READS / WRITES
     Runs the commands on the project (read-only) and on throw-away copies of
     web/ in the computer's temporary folder, which it deletes at the end.
     It never changes anything in the project.
   ============================================================================= */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const FLOW = path.join(REPO, 'scripts', 'flow.js');
const CHECK_CONFIG = path.join(REPO, 'scripts', 'check_config.py');
const STARS = path.join(REPO, 'tests', 'flow', 'fixtures', 'types', 'stars_1_10.js');   // the guide's example of a new kind
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-flow-sim-'));
let passed = 0;
const ok = (name) => { passed++; console.log('PASS', name); };

function run(args, opts) {
  opts = opts || {};
  const r = spawnSync(opts.cmd || process.execPath, opts.cmd ? args : [FLOW].concat(args),
    { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, opts.env || {}), timeout: 120000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}
const json = (r, what) => { try { return JSON.parse(r.out); } catch (e) { assert.fail(`${what}: not JSON:\n${r.all.slice(0, 400)}`); } };
const flat = (s) => s.replace(/\s+/g, ' ');   // long messages are wrapped to the terminal width
const has = (r, text, what) => assert(flat(r.all).includes(flat(text)), `${what}: expected "${text}" in:\n${r.all.slice(0, 1200)}`);
/* A throw-away project copy: web/ and docs/flow.md, with optional edits of survey.json. */
function copyProject(name, edit) {
  const dir = path.join(TMP, name);
  fs.cpSync(path.join(REPO, 'web'), path.join(dir, 'web'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'docs', 'flow.md'), path.join(dir, 'docs', 'flow.md'));
  if (edit) {
    const file = path.join(dir, 'web', 'config', 'survey.json');
    const survey = JSON.parse(fs.readFileSync(file, 'utf8'));
    edit(survey);
    fs.writeFileSync(file, JSON.stringify(survey, null, 2));
  }
  return dir;
}
const today = JSON.parse(fs.readFileSync(path.join(REPO, 'web/config/survey.json'), 'utf8'));
const graphFlow = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/flow/legacy/variants/graph-default.json'), 'utf8')).flow;
// today's flow as the old list (frozen on 23 Oct 2026, before survey.json became a graph)
const listFlow = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/flow/legacy/variants/base.json'), 'utf8')).flow;
/* One screen of a flow, in either format (a graph's nodes, or the old list's lines). */
const node = (s, id) => (Array.isArray(s.flow) ? s.flow : s.flow.nodes).find((n) => n.id === id);

try {
  /* ---- check -------------------------------------------------------------------- */
  {
    const r = run(['check']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'Valmo Partner Pulse: flow check', 'check');
    has(r, 'ERRORS (must fix): 0', 'check');
    has(r, 'All good: no errors.', 'check');
    has(r, 'the longest route has 19 screens', 'check');
    ok('check: today\'s questionnaire, exit 0, "All good", the size line');
  }
  {
    const r = run(['check', '--json']);
    assert.strictEqual(r.code, 0, r.all);
    const j = json(r, 'check --json');
    ['tool', 'engine', 'format', 'source', 'flow_format', 'config_version', 'errors', 'warnings', 'infos', 'findings', 'stats', 'limits', 'text_keys']
      .forEach((k) => assert(k in j, 'check --json has ' + k));
    assert.strictEqual(j.engine, 2);
    assert.strictEqual(j.format, 'pp-flow/1');
    assert.strictEqual(j.flow_format, 'graph', 'survey.json holds the graph since 26 Oct 2026 (migrate --write)');
    assert.strictEqual(j.errors, 0);
    assert.deepStrictEqual(j.stats, { answers: 2, ratings: 10, free_text: 8, longest_path: 19 });
    assert.strictEqual(j.text_keys['q.nps'], 'the text of the screen "nps"');
    assert.strictEqual(j.text_keys['fn.payments.name'], 'the label of the screen "fn_ratings" (area "payments")');
    ok('check --json: the fields check_config.py reads (findings, stats, text_keys), exit 0');
  }
  {
    const dir = copyProject('broken', (s) => {
      node(s, 'nps').show_if = { answer: 'support_gate', equals: 'yes' };
      node(s, 'one_fix').required = 'false';
    });
    const r = run(['check', '--root', path.join(dir, 'web')]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'ERRORS (must fix): 2', 'broken check');
    has(r, '[R1] Screen "nps"', 'broken check');
    has(r, '[F1] Screen "one_fix": required is "false"', 'broken check');
    has(r, 'Please fix the errors above', 'broken check');
    const j = json(run(['check', '--root', dir, '--json']), 'broken --json (project folder as --root)');
    assert.strictEqual(j.errors, 2);
    assert.deepStrictEqual(j.findings.filter((f) => f.level === 'error').map((f) => f.code + '@' + f.node), ['F1@one_fix', 'R1@nps']);
    ok('check on a broken copy: exit 1, both errors with their codes; --root takes the web folder or the project folder');
  }
  {
    const r = run(['check', '--root', path.join(TMP, 'nothing-here')]);
    assert.strictEqual(r.code, 2, r.all);
    has(r, 'Could not run', 'missing root');
    const bad = path.join(TMP, 'bad.json');
    fs.writeFileSync(bad, '{ "survey": ');
    const r2 = run(['check', '--published', bad]);
    assert.strictEqual(r2.code, 2, r2.all);
    has(r2, 'is not valid JSON', 'bad published');
    const r3 = run(['check', '--bogus']);
    assert.strictEqual(r3.code, 2, r3.all);
    has(r3, '"--bogus" is not an option', 'bad option');
    ok('check could not run (missing folder, broken JSON, unknown option): exit 2 with a plain explanation');
  }
  {
    const doc = { version: 7, config_version: 'p7-2026-10-23', survey: Object.assign({}, today, { flow: graphFlow }),
      strings: JSON.parse(fs.readFileSync(path.join(REPO, 'web/i18n/strings.json'), 'utf8')) };
    const file = path.join(TMP, 'p7.json');
    fs.writeFileSync(file, JSON.stringify(doc));
    const r = run(['check', '--published', file]);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'published version 7', 'published');
    assert.strictEqual(json(run(['check', '--published', file, '--json']), 'published json').flow_format, 'graph');
    ok('check --published p7.json (a graph): exit 0, says which version');
  }

  /* ---- map ------------------------------------------------------------------------ */
  {
    const r = run(['map']);
    assert.strictEqual(r.code, 0, r.all);
    assert(r.out.startsWith('<!-- GENERATED by'), r.out.slice(0, 100));
    assert.strictEqual(r.out, fs.readFileSync(path.join(REPO, 'docs/flow.md'), 'utf8'), 'docs/flow.md in the project is up to date');
    const r2 = run(['map', '--check', path.join(REPO, 'docs/flow.md')]);
    assert.strictEqual(r2.code, 0, r2.all);
    has(r2, 'is up to date', 'map --check');
    const stale = path.join(TMP, 'stale.md');
    fs.writeFileSync(stale, 'old');
    const r3 = run(['map', '--check', stale]);
    assert.strictEqual(r3.code, 1, r3.all);
    has(r3, 'out of date', 'stale map');
    const r4 = run(['map', '--check', path.join(TMP, 'none.md')]);
    assert.strictEqual(r4.code, 1, r4.all);
    has(r4, 'missing', 'missing map');
    ok('map: prints docs/flow.md exactly; --check says up to date (0), out of date or missing (1)');
  }
  {
    const out = path.join(TMP, 'map-out.md');
    const r = run(['map', '--write', '--out', out]);
    assert.strictEqual(r.code, 0, r.all);
    assert.strictEqual(fs.readFileSync(out, 'utf8'), run(['map']).out);
    const dir = copyProject('mapwrite', (s) => { node(s, 'one_fix').required = true; });
    fs.rmSync(path.join(dir, 'docs', 'flow.md'));
    const r2 = run(['map', '--write', '--root', path.join(dir, 'web')]);
    assert.strictEqual(r2.code, 0, r2.all);
    assert(fs.existsSync(path.join(dir, 'docs', 'flow.md')), 'map --write --root writes that project\'s docs/flow.md');
    assert(!/\/Users\/|\/private\/|\/var\/folders|\/tmp\//.test(fs.readFileSync(path.join(dir, 'docs', 'flow.md'), 'utf8')), 'no personal or temporary paths in the map');
    ok('map --write: to --out, or to the docs/ next to --root; never a personal path in the file');
  }

  /* ---- simulate --------------------------------------------------------------------- */
  {
    const r = run(['simulate', '--set', 'nps=4', '--set', 'fn_rating:payments=2', '--set', 'support_gate=no']);
    assert.strictEqual(r.code, 0, r.all);
    ['Screens, in order (12):', '2. nps', '= 4', 'fn_rating:losses           not answered: Next is blocked', 'Not on this route (7):',
      'support: only if support_gate == yes: not true here (support_gate is "no")', 'Next would be blocked on 6 screens',
      'What would be sent', 'answers:   {"nps":4,"support_gate":"no"}', 'ratings:   function:payments=2']
      .forEach((t) => has(r, t, 'simulate'));
    ok('simulate (the proposal\'s example): numbered screens, why others are skipped, where Next is blocked, what is sent');
  }
  {
    const r = run(['simulate', '--set', 'nps=4', '--set', 'fn_rating:payments=2', '--set', 'support_gate=no', '--json']);
    assert.strictEqual(r.code, 0, r.all);
    const j = json(r, 'simulate --json');
    ['steps', 'skipped', 'blocked', 'submission', 'facts'].forEach((k) => assert(k in j, 'simulate --json has ' + k));
    assert.strictEqual(j.submission.schema_version, 1);
    assert.strictEqual(j.submission.kind, 'submit');
    assert.deepStrictEqual(j.submission.answers, { nps: 4, support_gate: 'no' });
    assert.deepStrictEqual(j.steps[0], { n: 1, screen: 'language', node: 'language', type: 'language_picker', item: null,
      label_en: 'Choose your language', answers: {}, blocked: false, end: false });
    assert(j.skipped.every((s) => s.id && s.reason), 'every skipped screen has a reason');
    ok('simulate --json: steps, skipped (with reasons), blocked and the submission (schema_version 1)');
  }
  {
    const r = run(['simulate', '--answers', '{"nps": 10, "fn_rating:losses": 1, "fn_deep_dive:losses": "other"}', '--set', 'fn_deep_dive:losses=text:no proof given',
      '--lang-in-url', '--whats-changed', '2', '--lang', 'hi', '--round', 'DEMO-R9', '--explain', '--submission']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'language hi, link with ?lang=, round DEMO-R9, 2 "what changed" items', 'facts');
    has(r, '1. whats_changed', 'the language screen is skipped with ?lang=');
    has(r, 'why: for each area where fn_rating:{area} <= area.threshold: true for "losses"', 'explain');
    has(r, '"kind": "submit"', 'submission');
    has(r, '"text": "no proof given"', 'typed detail sent');
    ok('simulate with --answers, a typed detail, facts, --explain and --submission (the whole message)');
  }
  {
    const r = run(['simulate', '--set', 'nps']);
    assert.strictEqual(r.code, 2, r.all);
    has(r, 'write it as key=value', 'bad --set');
    const r2 = run(['simulate', '--whats-changed', 'many']);
    assert.strictEqual(r2.code, 2, r2.all);
    const r3 = run(['simulate', '--answers', '{nps: 4}']);
    assert.strictEqual(r3.code, 2, r3.all);
    ok('simulate with a badly written --set, --whats-changed or --answers: exit 2 with an explanation');
  }

  /* ---- paths ------------------------------------------------------------------------- */
  {
    const r = run(['paths']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, '16 distinct routes', 'paths');
    has(r, 'from 512 answer sets', 'paths');
    has(r, 'fn_deep_dives x1-6', 'paths');
    const j = json(run(['paths', '--json']), 'paths --json');
    assert.strictEqual(j.total, 16);
    assert.strictEqual(j.routes.length, 16);
    assert.strictEqual(j.routes.reduce((n, x) => n + x.count, 0), 512);
    assert.strictEqual(json(run(['paths', '--json', '--limit', '2']), 'limit').routes.length, 2);
    assert.strictEqual(run(['paths', '--limit', 'x']).code, 2);
    ok('paths: 16 routes for today with examples and counts; --json, --limit; a bad --limit is exit 2');
  }

  /* ---- compare ----------------------------------------------------------------------- */
  {
    const graphFile = path.join(TMP, 'today-graph.json');
    fs.writeFileSync(graphFile, JSON.stringify(Object.assign({}, today, { flow: graphFlow })));
    const listFile = path.join(TMP, 'today-list.json');
    fs.writeFileSync(listFile, JSON.stringify(Object.assign({}, today, { flow: listFlow })));
    const r = run(['compare', listFile, 'web/config/survey.json', '--samples', '100']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'The same screens and the same data', 'compare same');
    const r0 = run(['compare', 'web/config/survey.json', graphFile, '--samples', '50']);
    assert.strictEqual(r0.code, 0, r0.all);
    const changed = JSON.parse(JSON.stringify(today));
    node(changed, 'support').show_if = { answer: 'support_gate', equals: 'no' };
    const changedFile = path.join(TMP, 'changed.json');
    fs.writeFileSync(changedFile, JSON.stringify(changed));
    const r2 = run(['compare', 'web/config/survey.json', changedFile, '--samples', '50']);
    assert.strictEqual(r2.code, 1, r2.all);
    has(r2, 'Different for', 'compare different');
    has(r2, 'A shows:', 'compare different');
    const j = json(run(['compare', graphFile, changedFile, '--json', '--samples', '20']), 'compare --json');
    assert(j.same === false && j.count > 0 && Array.isArray(j.differences), 'compare --json shape');
    assert.strictEqual(run(['compare', graphFile]).code, 2);
    const r3 = run(['compare', path.join(REPO, 'web'), graphFile, '--samples', '10']);
    assert.strictEqual(r3.code, 0, r3.all);
    ok('compare: the old list, the project\'s graph and the hand-written graph of today are the same (0); a changed rule differs (1); --json; one file only is exit 2; a folder works too');
  }

  /* ---- screens, migrate, build-gs, help --------------------------------------------------- */
  {
    const r = run(['screens']);
    assert.strictEqual(r.code, 0, r.all);
    const j = json(r, 'screens');
    assert.strictEqual(j.length, 19);
    assert.deepStrictEqual(j[4], { screen: 'fn_rating:payments', node: 'fn_ratings', type: 'function_rating', item: 'payments',
      label_en: j[4].label_en, end: false });
    assert(j[18].end && j[18].screen === 'thanks');
    ok('screens: the 19 screens of today as JSON (screen, node, type, item, label_en, end)');
  }
  {
    // migrate: the project's own copy is already the graph, laid out as the control panel writes it
    const file0 = path.join(REPO, 'web/config/survey.json');
    const repoText = fs.readFileSync(file0, 'utf8');
    const r = run(['migrate']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'already holds the flow as the graph', 'migrate on the project');
    assert.strictEqual(fs.readFileSync(file0, 'utf8'), repoText, 'migrate without --write never writes');
    // the same file as it was until 26 Oct 2026 (the old list, then its "_flow_help" note) converts to exactly the project's file
    const at = repoText.indexOf('\n  "flow": {\n');
    assert(at > 0 && repoText.endsWith('\n  }\n}\n'), 'survey.json ends with its flow');
    const oldText = repoText.slice(0, at + 1) + '  "flow": ' + JSON.stringify(listFlow) + ',\n  "_flow_help": "The screens, in order."\n}\n';
    const dir = copyProject('migrate');
    const file = path.join(dir, 'web', 'config', 'survey.json');
    fs.writeFileSync(file, oldText);
    const dry = run(['migrate', '--root', path.join(dir, 'web')]);
    assert.strictEqual(dry.code, 0, dry.all);
    ['The flow is a list of 9 screens', 'pp-flow/1', '"_flow_help" goes', 'the same screens and the same data for all', 'Nothing was written']
      .forEach((t) => has(dry, t, 'migrate (dry run)'));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), oldText, 'without --write the file is unchanged');
    const w = run(['migrate', '--write', '--root', dir]);   // the project folder works as --root too
    assert.strictEqual(w.code, 0, w.all);
    has(w, 'Wrote', 'migrate --write');
    has(w, 'map --write', 'migrate --write says what to do next');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), repoText, 'the converted copy is byte for byte the project\'s survey.json');
    has(run(['migrate', '--root', dir]), 'nothing to do', 'migrate twice');
    // could not run: a flow that is neither a list nor a graph, a published version, a missing folder
    fs.writeFileSync(file, repoText.slice(0, at + 1) + '  "flow": 7\n}\n');
    const bad = run(['migrate', '--write', '--root', dir]);
    assert.strictEqual(bad.code, 2, bad.all);
    has(bad, 'nothing to convert', 'migrate on a broken flow');
    assert(fs.readFileSync(file, 'utf8').endsWith('"flow": 7\n}\n'), 'a broken file is left alone');
    const pub = run(['migrate', '--published', path.join(TMP, 'p7.json')]);
    assert.strictEqual(pub.code, 2, pub.all);
    has(pub, 'never rewritten', 'migrate --published');
    assert.strictEqual(run(['migrate', '--root', path.join(TMP, 'nothing-here')]).code, 2);
    ok('migrate: the project is already the graph (nothing to do); the old list converts to exactly the project\'s file, proved by compare; ' +
      'nothing written without --write; a broken flow or --published: exit 2');
  }
  {
    const b = run(['build-gs', '--check']);
    assert.strictEqual(b.code, 0, b.all);
    has(b, 'apps-script/Flow.gs is up to date', 'build-gs --check');
    const b2 = run([path.join(REPO, 'scripts/flow.py'), 'build-gs', '--check'], { cmd: 'python3' });
    assert.strictEqual(b2.code, 0, b2.all);
    const b3 = run(['build-gs', '--write']);
    assert.strictEqual(b3.code, 2, b3.all);
    has(b3, 'build-gs takes only --check', 'build-gs with a wrong option');
    ok('build-gs --check: Flow.gs is up to date (exit 0), also through scripts/flow.py; a wrong option is exit 2');
  }
  {
    const unknown = run(['bogus']);
    assert.strictEqual(unknown.code, 2);
    has(unknown, 'not a command this tool knows', 'unknown command');
    const none = run([]);
    assert.strictEqual(none.code, 2);
    has(none, 'Usage', 'no command');
    const help = run(['help']);
    assert.strictEqual(help.code, 0);
    ['check', 'map', 'simulate', 'paths', 'compare', 'screens', 'migrate', 'build-gs', 'types'].forEach((c) => has(help, '  ' + c, 'help'));
    has(help, 'make apps-script/Flow.gs', 'help');
    ok('unknown or no command: exit 2; help lists every command, migrate, build-gs and types included (exit 0)');
  }

  /* ---- types: the catalogue of the kinds of screen ------------------------------------------------ */
  {
    const r = run(['types', '--check']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'web/config/types.json is up to date (12 kinds of screen: 12 built in, none added).', 'types --check');
    has(r, 'apps-script/Model.gs: its list of kinds (PP_SCREEN_TYPES) is up to date.', 'types --check');
    const printed = run(['types']);
    assert.strictEqual(printed.code, 0, printed.all);
    assert.strictEqual(printed.out, fs.readFileSync(path.join(REPO, 'web/config/types.json'), 'utf8'), 'types prints exactly web/config/types.json');
    const j = json(run(['types', '--json']), 'types --json');
    assert.deepStrictEqual([j.types, j.added, j.types_json, j.model_gs, j.problems], [12, [], 'fresh', 'fresh', []]);
    assert.strictEqual(j.builtin.length, 12);
    const bad = run(['types', '--bogus']);
    assert.strictEqual(bad.code, 2, bad.all);
    has(bad, 'types takes --write, --check, --json and --root', 'types with a wrong option');
    assert.strictEqual(run(['types', '--write', '--check']).code, 2);
    ok('types: prints web/config/types.json exactly; --check and --json: it and Model.gs\'s list are up to date (0); a wrong option is exit 2');
  }
  {
    // a new kind: one file in web/js/types/ plus one line in index.html (a copy of the project)
    const dir = copyProject('types-new');
    fs.mkdirSync(path.join(dir, 'apps-script'));
    fs.copyFileSync(path.join(REPO, 'apps-script', 'Model.gs'), path.join(dir, 'apps-script', 'Model.gs'));
    const web = path.join(dir, 'web');
    fs.mkdirSync(path.join(web, 'js', 'types'));
    fs.copyFileSync(STARS, path.join(web, 'js', 'types', 'stars_1_10.js'));
    let r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'web/js/types/stars_1_10.js is not loaded by web/index.html, so phones never get it', 'types: a file index.html does not load');
    const indexFile = path.join(web, 'index.html');
    const page = fs.readFileSync(indexFile, 'utf8');
    fs.writeFileSync(indexFile, page.replace('  <script defer src="js/app.js"></script>', '  <script defer src="js/types/stars_1_10.js"></script>\n  <script defer src="js/app.js"></script>'));
    r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'is OUT OF DATE (13 kinds of screen: 12 built in, 1 added (stars_1_10))', 'types --check: a new kind');
    has(r, 'its list of kinds (PP_SCREEN_TYPES) is OUT OF DATE', 'types --check: Model.gs');
    const stale = run([CHECK_CONFIG, '--root', dir], { cmd: 'python3' });
    assert.strictEqual(stale.code, 1, stale.all);
    has(stale, 'no longer matches the form\'s code', 'check_config: an out-of-date catalogue is an error');
    has(stale, 'PP_SCREEN_TYPES in apps-script/Model.gs) is out of date', 'check_config: Model.gs is a warning');
    r = run(['types', '--write', '--root', web]);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'Paste Model.gs into the Apps Script project', 'types --write');
    const cat = JSON.parse(fs.readFileSync(path.join(web, 'config', 'types.json'), 'utf8'));
    assert.deepStrictEqual(cat.types.map((e) => e.type).slice(-1), ['stars_1_10']);
    assert.deepStrictEqual(cat.types.slice(-1)[0].custom, []);
    const gen = fs.readFileSync(path.join(dir, 'apps-script', 'Model.gs'), 'utf8');
    assert(gen.includes('{ "type": "stars_1_10", "label": "Stars (1 to 10)", "builtin": false, "needs_text": true,'),
      'the control panel\'s list has the new kind');
    // since 26 Oct 2026 Model.gs also keeps the added kind's whole description, for Publish's checks (PP_ADDED_TYPES_),
    // and its row carries it to the control panel's window ("catalogue")
    assert(/var PP_ADDED_TYPES_ = \[\n  \{ "type": "stars_1_10", "label": "Stars \(1 to 10\)", "description": /.test(gen), 'Model.gs keeps its description: PP_ADDED_TYPES_');
    assert(gen.includes(',\n    "catalogue": PP_ADDED_TYPES_[0] }'), 'its row in PP_SCREEN_TYPES carries it');
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
    vm.runInContext(gen, ctx, { filename: 'Model.gs' });
    const added = JSON.parse(vm.runInContext('JSON.stringify(PP_ADDED_TYPES_)', ctx));
    assert.deepStrictEqual(added, [cat.types.find((e) => e.type === 'stars_1_10')], 'PP_ADDED_TYPES_ = the catalogue entry of web/config/types.json');
    assert(vm.runInContext('PP_SCREEN_TYPES.filter(function (r) { return r.catalogue; }).length === 1 && PP_SCREEN_TYPES[PP_SCREEN_TYPES.length - 1].catalogue === PP_ADDED_TYPES_[0]', ctx),
      'only the added row carries it');
    assert.strictEqual(run(['types', '--check', '--root', web]).code, 0);
    // a questionnaire that uses it: the checks know it from web/config/types.json; simulate sends its standard data
    const surveyFile = path.join(web, 'config', 'survey.json');
    const survey = JSON.parse(fs.readFileSync(surveyFile, 'utf8'));
    survey.flow.nodes.find((n) => n.id === 'one_fix').next = 'stars';
    survey.flow.nodes.splice(survey.flow.nodes.findIndex((n) => n.id === 'thanks'), 0, { id: 'stars', type: 'stars_1_10', text: 'q.one_fix', next: 'thanks' });
    fs.writeFileSync(surveyFile, JSON.stringify(survey, null, 2));
    const chk = json(run(['check', '--root', web, '--json']), 'check with a new kind');
    assert(!chk.findings.some((f) => f.level === 'error'), JSON.stringify(chk.findings));
    const sim = json(run(['simulate', '--root', web, '--set', 'nps=9', '--set', 'support_gate=no', '--set', 'stars=8', '--json']), 'simulate with a new kind');
    assert.deepStrictEqual(sim.submission.answers, { nps: 9, support_gate: 'no', stars: 8 });
    assert(!sim.submission.ratings.some((x) => x.item === 'stars'), 'the example sends its answer only: a ratings row holds 1 to 5');
    assert.deepStrictEqual(sim.unknown, [], 'every answer given is stored by a screen');
    const fresh = run([CHECK_CONFIG, '--root', dir], { cmd: 'python3' });
    assert.strictEqual(fresh.code, 0, fresh.all);
    has(fresh, 'Kinds of screen: 13 in web/config/types.json (12 built in, 1 added in web/js/types/ (stars_1_10)).', 'check_config summary');
    has(fresh, 'web/js/types/stars_1_10.js', 'the page weight counts the new file');
    // taken out again: Model.gs goes back to no added kind
    fs.unlinkSync(path.join(web, 'js', 'types', 'stars_1_10.js'));
    fs.writeFileSync(indexFile, page);
    assert.strictEqual(run(['types', '--write', '--root', web]).code, 0);
    assert(/var PP_ADDED_TYPES_ = \[\];\nvar PP_SCREEN_TYPES = \[/.test(fs.readFileSync(path.join(dir, 'apps-script', 'Model.gs'), 'utf8')), 'removed: PP_ADDED_TYPES_ is empty again');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'apps-script', 'Model.gs'), 'utf8'), fs.readFileSync(path.join(REPO, 'apps-script', 'Model.gs'), 'utf8'), 'and Model.gs is the project\'s again');
    ok('a new kind (stars_1_10.js + one line in index.html): types --check sees it (1), check_config.py refuses the old catalogue, ' +
      'types --write updates both copies (Model.gs: its row, and its whole description in PP_ADDED_TYPES_), then check, simulate and check_config.py know it; removed, both go back');
  }
  {
    // a Model.gs written before 26 Oct 2026 (its generated part ended "END GENERATED (PP_SCREEN_TYPES)" and had no
    // PP_ADDED_TYPES_): types --check calls it out of date, not lost, and --write brings it up to date
    const dir = copyProject('types-old-marks');
    fs.mkdirSync(path.join(dir, 'apps-script'));
    const now = fs.readFileSync(path.join(REPO, 'apps-script', 'Model.gs'), 'utf8');
    const before = now.replace(/\/\* The kinds of screen added in web\/js\/types\/[^\n]*\nvar PP_ADDED_TYPES_ = \[\];\n/, '')
      .replace('// END GENERATED (PP_ADDED_TYPES_ and PP_SCREEN_TYPES)', '// END GENERATED (PP_SCREEN_TYPES)');
    assert(before !== now && !/PP_ADDED_TYPES_ = /.test(before), 'the older Model.gs');
    fs.writeFileSync(path.join(dir, 'apps-script', 'Model.gs'), before);
    const web = path.join(dir, 'web');
    const r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'its list of kinds (PP_SCREEN_TYPES) is OUT OF DATE', 'an older Model.gs');
    assert.strictEqual(run(['types', '--write', '--root', web]).code, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'apps-script', 'Model.gs'), 'utf8'), now, '--write makes it the project\'s Model.gs');
    ok('types: a Model.gs from before PP_ADDED_TYPES_ (older end mark) is out of date, and --write brings it up to date');
  }
  {
    // mistakes in new kinds: each explained, and nothing is written
    const dir = copyProject('types-bad');
    const web = path.join(dir, 'web');
    fs.mkdirSync(path.join(web, 'js', 'types'));
    fs.writeFileSync(path.join(web, 'js', 'types', 'broken_kind.js'), "document.title = 'x';\nPP.types.register({ type: 'broken_kind', label: 'B' });\n");
    fs.writeFileSync(path.join(web, 'js', 'types', 'no_render.js'), "PP.types.register({ type: 'no_render', label: 'No drawing', answer: { kind: 'number', min: 1 } });\n");
    const indexFile = path.join(web, 'index.html');
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/broken_kind.js"></script>\n  <script src="js/types/no_render.js"></script>\n  <script defer src="js/app.js"></script>'));
    const before = fs.readFileSync(path.join(web, 'config', 'types.json'), 'utf8');
    const r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'js/types/broken_kind.js could not be read outside a browser', 'a kind that touches the page while loading');
    has(r, 'loads js/types/no_render.js without "defer"', 'a line without defer');
    has(r, 'The kind "no_render" has no render(ctx)', 'a kind without a drawing');
    has(r, 'its answer is a number, so it needs "min" and "max"', 'an answer without max');
    const w = run(['types', '--write', '--root', web]);
    assert.strictEqual(w.code, 1, w.all);
    has(w, 'so nothing was written', 'types --write with mistakes');
    assert.strictEqual(fs.readFileSync(path.join(web, 'config', 'types.json'), 'utf8'), before);
    ok('types: a kind that touches the page while loading, a line without defer, no render, an incomplete answer: explained (1), nothing written');
  }

  {
    // a file in web/js/types/ may only ADD kinds: registering or changing one that exists is refused (26 Oct 2026)
    const dir = copyProject('types-override');
    const web = path.join(dir, 'web');
    fs.mkdirSync(path.join(web, 'js', 'types'));
    // the guide's example, copied with its "type" not renamed: it would replace the 0-10 question on phones
    fs.writeFileSync(path.join(web, 'js', 'types', 'my_nps.js'), fs.readFileSync(STARS, 'utf8').replace("type: 'stars_1_10'", "type: 'nps_0_10'"));
    // a file that quietly changes a built-in kind without registering it
    fs.writeFileSync(path.join(web, 'js', 'types', 'sneaky.js'), "(function (root) { root.PP.types.get('yes_no').answer.values = ['yes', 'no', 'maybe']; }(globalThis));\n");
    const indexFile = path.join(web, 'index.html');
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/my_nps.js"></script>\n  <script defer src="js/types/sneaky.js"></script>\n  <script defer src="js/app.js"></script>'));
    const before = fs.readFileSync(path.join(web, 'config', 'types.json'), 'utf8');
    const r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'web/js/types/my_nps.js registers the kind "nps_0_10", which already exists (a built-in kind, described in web/js/flow.js)', 'a re-registered built-in kind');
    has(r, 'web/js/types/sneaky.js changes the kind "yes_no", which already exists', 'a built-in kind changed without register');
    has(r, 'may only add NEW kinds', 'the plain explanation');
    const w = run(['types', '--write', '--root', web]);
    assert.strictEqual(w.code, 1, w.all);
    has(w, 'so nothing was written', 'types --write refuses');
    assert.strictEqual(fs.readFileSync(path.join(web, 'config', 'types.json'), 'utf8'), before, 'types.json unchanged');
    const cc = run([CHECK_CONFIG, '--root', dir], { cmd: 'python3' });
    assert.strictEqual(cc.code, 1, cc.all);
    has(cc, 'registers the kind "nps_0_10", which already exists', 'check_config: an error');
    // the same kind registered by two files: the second one is refused
    const dir2 = copyProject('types-twice');
    const web2 = path.join(dir2, 'web');
    fs.mkdirSync(path.join(web2, 'js', 'types'));
    fs.copyFileSync(STARS, path.join(web2, 'js', 'types', 'stars_1_10.js'));
    fs.copyFileSync(STARS, path.join(web2, 'js', 'types', 'stars_again.js'));
    const index2 = path.join(web2, 'index.html');
    fs.writeFileSync(index2, fs.readFileSync(index2, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/stars_1_10.js"></script>\n  <script defer src="js/types/stars_again.js"></script>\n  <script defer src="js/app.js"></script>'));
    const r2 = run(['types', '--check', '--root', web2]);
    assert.strictEqual(r2.code, 1, r2.all);
    has(r2, 'web/js/types/stars_again.js registers the kind "stars_1_10", which already exists (added by web/js/types/stars_1_10.js)', 'a kind registered twice');
    ok('types: a plug-in file that registers or changes a kind that already exists (built in, or from another file) is refused; --write and check_config.py stop');
  }
  {
    // a ratings row holds 1 to 5: a kind whose answer goes beyond is refused if it sends one (the guide's example sends its answer only)
    const dir = copyProject('types-ratings');
    const web = path.join(dir, 'web');
    fs.mkdirSync(path.join(web, 'js', 'types'));
    fs.writeFileSync(path.join(web, 'js', 'types', 'stars_1_10.js'), fs.readFileSync(STARS, 'utf8').replace('records: { answers: 1 },', 'records: { answers: 1, ratings: 1 },'));
    const indexFile = path.join(web, 'index.html');
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/stars_1_10.js"></script>\n  <script defer src="js/app.js"></script>'));
    const r = run(['types', '--check', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'The kind "stars_1_10" sends a ratings row (records > ratings), but its answer is a number from 1 to 10. A ratings row holds a rating from 1 to 5', 'ratings 1-10');
    has(r, 'with "records": {"answers": 1}', 'what to do instead');
    assert(!/stars_1_10" sends a ratings row/.test(run(['types', '--check']).all), 'the built-in kinds that send ratings rows (1 to 5) pass');
    ok('types: a kind that sends a ratings row needs an answer from 1 to 5 (the example with ratings and 1 to 10 is refused)');
  }

  /* ---- a stray file name, and an answer no screen stores ------------------------------------------- */
  {
    [['check', 'p7.json', '--published p7.json'], ['screens', 'p7.json', '--published p7.json'], ['map', 'p7.json', '--published p7.json'],
      ['paths', 'x.json', '--published x.json'], ['simulate', 'x.json', '--published x.json'], ['migrate', 'web', '--root web'], ['es5', 'web', '--root web']
    ].forEach(([command, file, option]) => {
      const r = run([command, file]);
      assert.strictEqual(r.code, 2, command + ': ' + r.all);
      has(r, `Did you mean ${option}?`, command + ' with a stray file name');
      assert(!/All good/.test(r.all), command + ': never "all good" about the wrong questionnaire');
    });
    has(run(['check', 'p7.json']), 'it would run on web/config/survey.json instead', 'why it is refused');
    assert.strictEqual(run(['check', '--json', 'x']).code, 2, 'also after an option');
    const both = run(['compare', 'web/config/survey.json', 'web/config/survey.json', '--samples', '5']);
    assert.strictEqual(both.code, 0, 'compare still takes its two files: ' + both.all);
    ok('every command but compare refuses a stray file name (exit 2, "Did you mean --published <file>?", --root for migrate and es5)');
  }
  {
    const r = run(['simulate', '--set', 'nsp=4', '--set', 'support_gate=no']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'Note: No screen of this questionnaire stores the answer "nsp", so it was ignored. Did you mean "nps"?', 'a typo');
    has(r, 'nps                        not answered: Next is blocked', 'the typo really is not an answer');
    const j = run(['simulate', '--set', 'nsp=4', '--set', 'fn_rating:payment=2', '--json']);
    assert.strictEqual(j.code, 0, j.all);
    assert.deepStrictEqual(json(j, 'simulate --json').unknown.map((u) => u.key), ['nsp', 'fn_rating:payment']);
    assert(/Did you mean "fn_rating:payments"\?/.test(json(j, 'unknown').unknown[1].message), 'a near spelling');
    assert(/Note: No screen of this questionnaire stores the answer "nsp"/.test(j.err), 'with --json the note goes to the error output');
    const fine = run(['simulate', '--set', 'nps=4', '--json']);
    assert.deepStrictEqual(json(fine, 'no typo').unknown, []);
    assert(!/Note:/.test(fine.err), 'no note when every answer is stored');
    ok('simulate: an answer no screen stores (a typo like nsp=4) gives a note, with a suggestion; it is listed as "unknown" in --json');
  }

  /* ---- es5: every script phones load is ES5 ------------------------------------------------------------ */
  {
    const r = run(['es5']);
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'All ES5: old Android phones (Chrome 61) can run every one of them.', 'es5 on the project');
    const j = json(run(['es5', '--json']), 'es5 --json');
    assert.strictEqual(j.acorn.found, true);
    assert.strictEqual(j.acorn.version, '8.14.0', 'the pinned acorn of tests/package.json');
    ['web/js/core.js', 'web/js/flow.js', 'web/js/net.js', 'web/js/ui.js', 'web/js/types.js', 'web/js/app.js', 'scripts/dev/simulate.js']
      .forEach((f) => assert(j.files.includes(f), 'es5 checks ' + f + ': ' + j.files));
    assert(!j.files.includes('web/js/flow-check.js'), 'flow-check.js is not loaded by phones');
    assert.deepStrictEqual(j.problems, []);
    // ACORN_PATH: the acorn package folder, or a folder with node_modules/acorn (as GitHub installs it)
    assert.strictEqual(run(['es5'], { env: { ACORN_PATH: path.join(REPO, 'tests', 'node_modules', 'acorn') } }).code, 0);
    const pre = run(['es5'], { env: { ACORN_PATH: path.join(REPO, 'tests') } });
    assert.strictEqual(pre.code, 0, pre.all);
    has(pre, 'from ACORN_PATH', 'es5 with ACORN_PATH');
    const bad = run(['es5'], { env: { ACORN_PATH: path.join(TMP, 'no-acorn-here') } });
    assert.strictEqual(bad.code, 2, bad.all);
    has(bad, 'ACORN_PATH is set, but acorn could not be loaded from it', 'a wrong ACORN_PATH');
    ok('es5: every script index.html loads, web/js/types/ and scripts/dev/ parse as ES5 with acorn 8.14.0 (tests/node_modules, or ACORN_PATH)');
  }
  {
    // newer syntax in a new kind (loaded by index.html), in an unloaded file of web/js/types/, and in scripts/dev/
    const dir = copyProject('es5-bad');
    const web = path.join(dir, 'web');
    fs.mkdirSync(path.join(web, 'js', 'types'));
    fs.writeFileSync(path.join(web, 'js', 'types', 'stars_1_10.js'), fs.readFileSync(STARS, 'utf8').replace("var step = ctx.step;", "var step = ctx.step;\n      var odd = step.node?.low_label ?? '';"));
    fs.writeFileSync(path.join(web, 'js', 'types', 'later.js'), 'const later = () => 1;\n');
    fs.mkdirSync(path.join(dir, 'scripts', 'dev'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'dev', 'drawer.js'), 'let x = `${1}`;\n');
    const indexFile = path.join(web, 'index.html');
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, 'utf8').replace('  <script defer src="js/app.js"></script>',
      '  <script defer src="js/types/stars_1_10.js"></script>\n  <script defer src="js/app.js"></script>'));
    const r = run(['es5', '--root', web]);
    assert.strictEqual(r.code, 1, r.all);
    has(r, 'Not ES5 (3):', 'three files');
    const j = json(run(['es5', '--root', web, '--json']), 'es5 --json on a bad copy');
    const oddLine = fs.readFileSync(path.join(web, 'js', 'types', 'stars_1_10.js'), 'utf8').split('\n').findIndex((l) => l.includes('step.node?.')) + 1;
    assert.deepStrictEqual(j.problems.map((p) => [p.file, p.line]), [['web/js/types/stars_1_10.js', oddLine], ['web/js/types/later.js', 1], ['scripts/dev/drawer.js', 1]]);
    assert(/newer JavaScript than old Android phones \(Chrome 61\) understand/.test(j.problems[0].message) && /no \?\. or \?\?/.test(j.problems[0].message), j.problems[0].message);
    const cc = run([CHECK_CONFIG, '--root', dir], { cmd: 'python3' });
    assert.strictEqual(cc.code, 1, cc.all);
    has(cc, `web/js/types/stars_1_10.js, line ${oddLine}, column`, 'check_config names the file and line');
    has(cc, '[ES5 check]', 'check_config marks it');
    ok('es5: a file with ?., ??, const, => or a template string is named with its line (exit 1); check_config.py makes it an error');
  }
  {
    // without acorn: the command says how to install it (exit 2); check_config.py warns (it does not fail) unless ACORN_PATH was given
    const dir = copyProject('es5-noacorn');
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    ['flow.js', 'flow.py', 'check_config.py', 'build_flow_gs.js'].forEach((f) => fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(dir, 'scripts', f)));
    const local = (args, env) => run([path.join(dir, 'scripts', 'flow.js')].concat(args), { cmd: process.execPath, env });
    const r = local(['es5']);
    assert.strictEqual(r.code, 2, r.all);
    has(r, 'ES5 check skipped: acorn is not installed', 'no acorn');
    has(r, 'cd tests && npm install', 'how to install it');
    const cc = run([path.join(dir, 'scripts', 'check_config.py')], { cmd: 'python3' });
    assert.strictEqual(cc.code, 0, cc.all);
    has(cc, 'ES5 check skipped', 'check_config: a warning');
    has(cc, 'cd tests && npm install', 'check_config: how to install it');
    const given = run([path.join(dir, 'scripts', 'check_config.py')], { cmd: 'python3', env: { ACORN_PATH: path.join(TMP, 'no-acorn-here') } });
    assert.strictEqual(given.code, 1, 'ACORN_PATH given but broken (GitHub): an error: ' + given.all);
    has(given, 'ACORN_PATH is set, but acorn could not be loaded from it', 'check_config: ACORN_PATH broken');
    ok('es5 without acorn: exit 2 with "cd tests && npm install"; check_config.py warns, and fails only when ACORN_PATH was given (GitHub)');
  }
  {
    // the deployment always runs the gate: it installs exactly acorn 8.14.0 and points ACORN_PATH at it for the settings check
    const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
    const install = yml.indexOf('acorn@8.14.0');
    const check = yml.indexOf('run: python3 scripts/check_config.py');
    assert(install > 0 && check > install, 'acorn 8.14.0 is installed before the settings check');
    assert(/npm install --no-save[^\n]*--prefix "\$RUNNER_TEMP\/acorn"[^\n]*acorn@8\.14\.0/.test(yml), 'pinned, outside the project, not saved');
    assert(/ACORN_PATH: \$\{\{ runner\.temp \}\}\/acorn\/node_modules\/acorn/.test(yml.slice(install, check + 60)), 'ACORN_PATH passed to the settings check');
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.devDependencies.acorn, '8.14.0', 'the same version as tests/package.json');
    ok('deploy-pages.yml installs acorn 8.14.0 (the version tests/ pins) and passes ACORN_PATH to the settings check');
  }
  {
    // scripts/flow.py's header names every command that writes a file
    const head = fs.readFileSync(path.join(REPO, 'scripts', 'flow.py'), 'utf8').split('"""')[1];
    const part = head.slice(head.indexOf('WHAT IT READS AND WRITES'), head.indexOf('EXIT CODE'));
    ['map --write', 'migrate --write', 'build-gs', 'types --write', 'docs/flow.md', 'web/config/survey.json', 'apps-script/Flow.gs',
      'web/config/types.json', 'apps-script/Model.gs'].forEach((t) => assert(part.includes(t), 'flow.py header names ' + t));
    ok('scripts/flow.py: its header lists every command that writes a file, and which file');
  }
  {
    // check: a catalogue that describes a built-in kind differently from the code gives a note (the checks follow the code)
    const dir = copyProject('catalogue-note');
    const file = path.join(dir, 'web', 'config', 'types.json');
    const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
    cat.types.find((e) => e.type === 'nps_0_10').answer.max = 11;
    fs.writeFileSync(file, JSON.stringify(cat, null, 2));
    const j = json(run(['check', '--root', dir, '--json']), 'check --json with an edited catalogue');
    assert.strictEqual(j.catalogue_notes.length, 1, JSON.stringify(j.catalogue_notes));
    assert(/describes "nps_0_10" differently from the code that runs here \(its "answer" differs\)/.test(j.catalogue_notes[0]), j.catalogue_notes[0]);
    has(run(['check', '--root', dir]), 'Note: The catalogue of the kinds of screen (web/config/types.json) describes "nps_0_10" differently', 'check');
    has(run(['screens', '--root', dir]), 'Note: The catalogue', 'other commands print it on the error output');
    assert.deepStrictEqual(json(run(['check', '--json']), 'project').catalogue_notes, [], 'the project\'s catalogue matches its code');
    ok('check: a catalogue entry that differs from the code of a known kind gives a note (catalogue_notes in --json)');
  }

  /* ---- the Python wrapper and npm ----------------------------------------------------------- */
  {
    const r = run([path.join(REPO, 'scripts/flow.py'), 'check'], { cmd: 'python3' });
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'All good: no errors.', 'flow.py check');
    const r2 = run([path.join(REPO, 'scripts/flow.py'), 'check', '--root', path.join(TMP, 'nothing-here')], { cmd: 'python3' });
    assert.strictEqual(r2.code, 2, r2.all);
    const missing = run([path.join(REPO, 'scripts/flow.py'), 'check'], { cmd: 'python3', env: { PP_NODE: path.join(TMP, 'no-node-here') } });
    assert.strictEqual(missing.code, 2, missing.all);
    has(missing, 'need Node.js', 'node missing');
    has(missing, 'https://nodejs.org', 'node missing');
    ok('scripts/flow.py: passes commands and exit codes through; explains how to install Node.js when it is missing (exit 2)');
  }
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    ['validate-flow', 'flow-map', 'simulate'].forEach((s) => assert(pkg.scripts && pkg.scripts[s], 'package.json script ' + s));
    assert(!pkg.dependencies && !pkg.devDependencies, 'the root package.json installs nothing');
    assert.strictEqual(pkg.private, true);
    const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' });
    if (npm.status === 0) {
      const r = spawnSync('npm', ['run', '--silent', 'validate-flow'], { cwd: REPO, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
      assert((r.stdout || '').includes('All good: no errors.'));
      ok('package.json: validate-flow, flow-map and simulate, no packages; npm run validate-flow passes');
    } else {
      ok('package.json: validate-flow, flow-map and simulate, no packages (npm not found, so not run)');
    }
  }

  /* ---- scripts/check_config.py runs the flow check ---------------------------------------------- */
  {
    const r = run([path.join(REPO, 'scripts/check_config.py')], { cmd: 'python3' });
    assert.strictEqual(r.code, 0, r.all);
    has(r, 'Found: 0 errors', 'check_config on the project');
    has(r, 'Flow: the longest route has 19 screens', 'check_config summary');
    const dir = copyProject('cc-broken', (s) => { node(s, 'nps').show_if = { answer: 'support_gate', equals: 'yes' }; });
    const r2 = run([path.join(REPO, 'scripts/check_config.py'), '--root', dir], { cmd: 'python3' });
    assert.strictEqual(r2.code, 1, r2.all);
    has(r2, '[flow check R1]', 'check_config flow error');
    has(r2, 'docs/flow.md', 'stale map warning');
    has(r2, 'out of date', 'stale map warning');
    const r3 = run([path.join(REPO, 'scripts/check_config.py'), '--root', copyProject('cc-nonode')], { cmd: 'python3', env: { PP_NODE: path.join(TMP, 'no-node-here') } });
    assert.strictEqual(r3.code, 1, r3.all);
    has(r3, 'could not be checked', 'check_config without Node.js');
    has(r3, 'nodejs.org', 'check_config without Node.js');
    ok('check_config.py: flow errors stop it (exit 1, "[flow check R1]"), an old docs/flow.md is a warning, a missing Node.js is an explained error');
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(passed, 'tests passed');
