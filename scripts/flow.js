#!/usr/bin/env node
/* =============================================================================
   scripts/flow.js: the questionnaire's flow tools on the command line.

   WHAT IT IS FOR
     The "flow" decides which screens a partner sees and in which order (the
     "show only if" rules, jumps, loops and endings). This command lets you
     check it, see it as a map, and try it out with made-up answers, on this
     Mac, before anything reaches partners. It uses the form's own engine
     (web/js/flow.js) and the one checker (web/js/flow-check.js), so what it
     says is exactly what phones will do.

   HOW TO RUN IT (Terminal, in the project folder, the one with web/ and scripts/)
     Easiest, through Python (explains what to do if Node.js is missing):
         python3 scripts/flow.py check
     or directly with Node.js:
         node scripts/flow.js check

   THE COMMANDS
     check     [--root web] [--published p.json] [--json]
               Looks for mistakes. Prints ERRORS (must fix), WARNINGS and NOTES.
     map       [--write] [--out file] [--check file] [--published p.json]
               The map of the flow (docs/flow.md): printed, or with --write
               saved as docs/flow.md. --check file: is that file up to date?
     simulate  --set key=value ... [--answers file-or-json] [--lang hi]
               [--lang-in-url] [--round R] [--whats-changed N]
               [--published p.json] [--explain] [--submission] [--json]
               "What would this partner see?" Prints the screens in order, why
               each other screen is skipped, where Next would be blocked, and
               what would be sent. Values: a number (nps=4), a code
               (support_gate=no), na, text:typed words, or voice. An answer
               no screen stores (a typo such as nsp=4) is ignored, with a
               note saying so. Example:
                 python3 scripts/flow.py simulate --set nps=4 --set fn_rating:payments=2 --set support_gate=no
     paths     [--limit N] [--screens] [--json]
               Every distinct route, with one example and how often it occurs.
     compare   A B [--samples N] [--json]
               Do two versions (a survey.json, a published p<N>.json, or a web
               folder) show the same screens and send the same data?
     screens   [--published p.json]
               The list of screens as JSON (for the dashboard).
     migrate   [--write] [--root web]
               Turns the "flow" of web/config/survey.json from the old list of
               screens into the graph (format pp-flow/1), laid out exactly as
               the control panel's GitHub copy writes it. Every other byte of
               the file stays as it is (the old "_flow_help" note goes: the
               graph carries its own note). Before writing, it proves that the
               graph shows the same screens and sends the same data as the
               list, for every answer set "compare" tries. Without --write it
               only says what it would do. A file that is already a graph is
               only re-laid out when needed.
     build-gs  [--check]
               Makes apps-script/Flow.gs (the fifth Apps Script file) from
               web/js/flow.js, flow-panel.js and flow-check.js, with their
               SHA-256 fingerprint (it runs scripts/build_flow_gs.js). With
               --check it changes nothing and says whether Flow.gs is up to
               date. After a new Flow.gs: paste it into the Apps Script project.
     types     [--write] [--check] [--json] [--root web]
               The catalogue of the kinds of screen ("question types"): what
               each kind is called, its settings, what a rule can test about
               its answer, what it sends. It is made from the kinds the form
               itself registers (web/js/flow.js for the built-in ones, and
               every web/js/types/<name>.js that web/index.html loads) and
               kept as web/config/types.json, which the checks, this command
               and the control panel read (phones never load it). The control
               panel's own list of kinds, PP_SCREEN_TYPES in
               apps-script/Model.gs, is made from it too, with
               PP_ADDED_TYPES_: the whole description of each kind added in
               web/js/types/ (Flow.gs holds only the built-in ones), which
               Publish's checks and the control panel's window learn the kind
               from (its row carries it as "catalogue").
               Without options it prints the catalogue. --write saves both
               (then paste Model.gs into Apps Script when it changed);
               --check changes nothing and says whether both are up to date
               (python3 scripts/check_config.py runs it). How to add a kind:
               docs/config-guide.md, "How to add a question type".
               A file in web/js/types/ may only add NEW kinds: one that
               registers or changes a kind that already exists (a built-in
               one, or one from another file) is refused, because phones
               would then behave differently from what every check says.
               A kind that sends a ratings row needs an answer from 1 to 5
               (the ratings in the data are 1 to 5).
     es5       [--root web] [--json]
               Checks that every script phones load (each <script> of
               web/index.html), every web/js/types/*.js and scripts/dev/*.js
               is plain ES5, the JavaScript old Android phones (Chrome 61)
               understand: a file with newer syntax (let, const, =>, ?., ??,
               template strings ...) is skipped whole on such a phone, so its
               screens would silently not work. It uses the "acorn" parser:
               from tests/node_modules (run  cd tests && npm install  once),
               or from the folder in the ACORN_PATH setting (GitHub's
               deployment installs acorn 8.14.0 there).
               python3 scripts/check_config.py runs it.

     Every command except compare takes its file with an option (--published
     or --root); a bare file name is refused (exit 2), so a check never runs
     on the wrong questionnaire by mistake.

   WHAT YOU SHOULD SEE
     Plain-English results. The exit code tells scripts what happened:
       0 = all good (check: no errors; compare: the same; map --check: up to
           date; migrate: done or nothing to do; build-gs --check: up to date;
           types --check: both copies up to date; es5: every file is ES5)
       1 = problems found (check: errors; compare: differences; map --check:
           out of date; migrate: the graph would behave differently, so
           nothing was written; build-gs --check: Flow.gs is out of date;
           types: a description with a mistake, or --check: a copy that is
           out of date; es5: a file that is not ES5)
       2 = it could not run (a missing or broken file, a wrong option or a
           stray file name; es5: acorn is not installed)

   READS
     web/config/survey.json, web/i18n/strings.json and web/config/types.json
     (or the folder given with --root, or a published version with
     --published), web/js/flow.js, web/js/flow-check.js and
     web/js/flow-panel.js; "types" also web/index.html, web/js/ui.js,
     web/js/types.js, web/js/types/*.js and apps-script/Model.gs; "es5"
     web/index.html, the scripts it loads, web/js/types/*.js,
     scripts/dev/*.js and acorn (tests/node_modules, or ACORN_PATH).
   WRITES
     Only these four, and only when asked:
       "map --write": docs/flow.md (or the file given with --out);
       "migrate --write": web/config/survey.json (or the one under --root);
       "build-gs" (without --check): apps-script/Flow.gs;
       "types --write": web/config/types.json and the generated part of
         apps-script/Model.gs (PP_ADDED_TYPES_ and PP_SCREEN_TYPES).
     Every other command only reads and prints.

   Needs Node.js 16 or newer and no packages (nothing to install with npm;
   the es5 command alone needs acorn, see above).
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..');
const ENGINE_FILE = path.join(REPO, 'web', 'js', 'flow.js');
const CHECKER_FILE = path.join(REPO, 'web', 'js', 'flow-check.js');
const PANEL_FILE = path.join(REPO, 'web', 'js', 'flow-panel.js');
const BUILD_GS_FILE = path.join(REPO, 'scripts', 'build_flow_gs.js');
const TYPES_REL = path.join('config', 'types.json');               // inside a web folder
const TYPES_FORMAT = 'pp-types/1';
const LIMITS = { answers: 100, ratings: 64, free_text: 64, screens: 40 };   // as in web/js/flow-check.js

class Stop extends Error {}   // "could not run": exit code 2, message for a person
function stop(message) { throw new Stop(message); }

/* ---- reading the command line ---------------------------------------------- */
const COMMANDS = ['check', 'map', 'simulate', 'paths', 'compare', 'screens', 'migrate'];   // read by parse(); build-gs, types and es5 read their own
const FLAGS = new Set(['--json', '--write', '--lang-in-url', '--explain', '--submission', '--screens', '--help', '-h']);
const TYPES_FLAGS = new Set(['--write', '--check', '--json']);   // "types --check" is a flag, "map --check file" takes a value
const VALUES = new Set(['--root', '--published', '--out', '--check', '--set', '--answers', '--lang', '--round', '--whats-changed', '--limit', '--samples']);

function parse(argv) {
  const opts = { set: [], positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS.has(a)) { opts[a.replace(/^-+/, '')] = true; continue; }
    const eq = a.indexOf('=');
    const name = a.startsWith('--') && eq !== -1 ? a.slice(0, eq) : a;
    if (VALUES.has(name)) {
      const value = eq !== -1 && a.startsWith('--') ? a.slice(eq + 1) : argv[++i];
      if (value === undefined) stop(`${name} needs a value after it, for example ${name === '--set' ? '--set nps=4' : name + ' ...'}.`);
      if (name === '--set') opts.set.push(value);
      else opts[name.slice(2)] = value;
      continue;
    }
    if (a.startsWith('-')) stop(`"${a}" is not an option this command knows. Run  node scripts/flow.js help  to see them.`);
    opts.positional.push(a);
  }
  return opts;
}

/* ---- reading the questionnaire --------------------------------------------------- */
function readJson(file, what) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { stop(`Could not read ${what || 'the file'} ${shown(file)}: ${e.code === 'ENOENT' ? 'it does not exist' : e.message}.`); }
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) {
    stop(`${shown(file)} is not valid JSON (${e.message}). Run  python3 scripts/check_config.py  for a plain-English explanation of the mistake.`);
  }
}
function shown(file) {   // a path as people see it: relative to the project when inside it
  const rel = path.relative(REPO, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file;
}
function webDir(root) {
  if (!root) return path.join(REPO, 'web');
  const r = path.resolve(root);
  if (fs.existsSync(path.join(r, 'config', 'survey.json'))) return r;
  if (fs.existsSync(path.join(r, 'web', 'config', 'survey.json'))) return path.join(r, 'web');
  stop(`No questionnaire found in ${r}: --root must be a web folder (with config/survey.json inside), or the project folder.`);
}
function readStrings(web, problems) {
  const file = path.join(web, 'i18n', 'strings.json');
  if (!fs.existsSync(file)) return null;
  if (!problems) return readJson(file, 'the texts');
  try { return readJson(file, 'the texts'); } catch (e) {   // check: go on without the texts (the settings check reports the file)
    if (!(e instanceof Stop)) throw e;
    problems.push(e.message + ' So the texts were not checked.');
    return null;
  }
}
/* A source: { survey, strings, label (for people), docLabel (for docs/flow.md: never a personal path) }.
   problems (optional): a list that collects a broken strings.json instead of stopping. */
function source(spec, root, problems) {
  if (spec) {
    const file = path.resolve(spec);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return source(null, file, problems);
    const doc = readJson(file, 'the questionnaire');
    if (doc && typeof doc === 'object' && doc.survey && typeof doc.survey === 'object') {
      return { survey: doc.survey, strings: doc.strings || readStrings(webDir(root), problems), label: shown(file) + (doc.version ? ` (published version ${doc.version})` : ''),
        docLabel: 'published/' + path.basename(file), typesWeb: webDir(root) };
    }
    if (doc && typeof doc === 'object' && doc.flow !== undefined) {
      return { survey: doc, strings: readStrings(webDir(root), problems), label: shown(file), docLabel: path.basename(file), typesWeb: webDir(root) };
    }
    stop(`${shown(file)} is neither a published version (it has no "survey") nor a survey.json (it has no "flow").`);
  }
  const web = webDir(root);
  const file = path.join(web, 'config', 'survey.json');
  return { survey: readJson(file, 'the questionnaire'), strings: readStrings(web, problems), label: shown(file), docLabel: 'web/config/survey.json', web, typesWeb: web };
}

/* The kinds of screen of web/config/types.json that this program has no code for (a new kind in
   web/js/types/): registered from the catalogue, so the checks know them (docs/flow-engine.md 3).
   problems (optional): a list that collects an unreadable catalogue instead of ignoring it.
   notes (optional): a list that collects each kind the catalogue describes differently from the
   code that runs here (the checks follow the code; the catalogue is out of date). Without a list
   the notes are printed as "Note: ..." lines on the error output, so printed JSON stays clean. */
function useCatalogue(check, web, problems, notes) {
  const file = path.join(web || path.join(REPO, 'web'), TYPES_REL);
  if (!fs.existsSync(file)) return [];
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
    if (problems) problems.push(`${shown(file)} could not be read (${e.message}), so only the built-in kinds of screen are known. Make it again with  node scripts/flow.js types --write .`);
    return [];
  }
  const found = [];
  const added = check.loadCatalogue(doc, found);
  if (notes) found.forEach((n) => notes.push(n));
  else found.forEach((n) => { if (!PRINTED.has(n)) { PRINTED.add(n); console.error(wrap('Note: ' + n, '      ')); } });
  return added;
}
const PRINTED = new Set();   // notes already printed (compare reads two questionnaires)

function tools() {
  const flow = require(ENGINE_FILE);
  const check = require(CHECKER_FILE);
  if (!flow || !check || typeof check.check !== 'function') stop('web/js/flow.js or web/js/flow-check.js could not be loaded.');
  return { flow, check };
}

/* ---- printing ------------------------------------------------------------------------ */
function wrap(text, indent, width) {
  width = width || Math.max(60, Math.min((process.stdout.columns || 100) - 1, 110));
  const lines = [];
  String(text).split('\n').forEach((para) => {
    let line = '';
    para.split(/\s+/).forEach((word) => {
      if (!word) return;
      if (line && (indent + line + ' ' + word).length > width) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word;
    });
    lines.push(line);
  });
  return lines.map((l, i) => (i === 0 ? '' : indent) + l).join('\n');
}
function plural(n, word, many) { return `${n} ${n === 1 ? word : (many || word + 's')}`; }
function valueText(v) { return typeof v === 'string' ? v : JSON.stringify(v); }

/* ---- check ------------------------------------------------------------------------------ */
function cmdCheck(opts) {
  const { flow, check } = tools();
  const problems = [];
  const notes = [];
  const src = source(opts.published, opts.root, problems);
  useCatalogue(check, src.typesWeb, problems, notes);
  const result = check.check(src.survey, src.strings, { surface: 'repo' });
  const count = (level) => result.findings.filter((f) => f.level === level).length;
  const errors = count('error');
  if (opts.json) {
    const out = {
      tool: 'scripts/flow.js check', engine: flow.ENGINE, format: flow.FORMAT, source: src.label,
      flow_format: Array.isArray(src.survey.flow) ? 'list' : 'graph', config_version: src.survey.config_version || null,
      errors, warnings: count('warning'), infos: count('info'),
      findings: result.findings, stats: result.stats, limits: LIMITS, text_keys: check.textKeys(src.survey),
      strings_problem: problems[0] || null, catalogue_notes: notes
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return errors ? 1 : 0;
  }
  console.log('');
  console.log('Valmo Partner Pulse: flow check');
  console.log(`Questionnaire: ${src.label}` + (src.survey.config_version ? ` (config_version ${src.survey.config_version})` : '') +
    (Array.isArray(src.survey.flow) ? ', list format, read as the graph the engine makes of it' : ''));
  problems.concat(notes).forEach((p) => console.log(wrap('Note: ' + p, '  ')));
  console.log('');
  [['error', 'ERRORS (must fix)'], ['warning', 'WARNINGS (worth a look)'], ['info', 'NOTES']].forEach(([level, title]) => {
    const list = result.findings.filter((f) => f.level === level);
    if (level === 'info' && !list.length) return;
    console.log(`${title}: ${list.length}`);
    list.forEach((f, i) => console.log(`  ${i + 1}. [${f.code}] ` + wrap(f.message, '       ')));
    console.log('');
  });
  const s = result.stats;
  console.log(wrap(`Size: the longest route has ${plural(s.longest_path, 'screen')}; one submission holds at most ${plural(s.answers, 'answer')}, ` +
    `${plural(s.ratings, 'rating')} and ${plural(s.free_text, 'voice or typed answer')} (the server accepts ${LIMITS.answers}, ${LIMITS.ratings} and ${LIMITS.free_text}).`, '  '));
  console.log('');
  if (errors) console.log('Please fix the errors above, then run the check again:  python3 scripts/flow.py check');
  else console.log(count('warning') ? 'No errors. The warnings are worth a look, but will not break the form.' : 'All good: no errors.');
  console.log('Codes like [R1] are explained in docs/flow-engine.md, section 6.');
  return errors ? 1 : 0;
}

/* ---- map ---------------------------------------------------------------------------------- */
function cmdMap(opts) {
  const { check } = tools();
  const src = source(opts.published, opts.root);
  useCatalogue(check, src.typesWeb);
  const text = check.toMarkdown(src.survey, src.strings, { source: src.docLabel });
  if (opts.check) {
    const file = path.resolve(opts.check);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === text) { console.log(`${shown(file)} is up to date.`); return 0; }
    console.log(`${shown(file)} is ${current === null ? 'missing' : 'out of date'}. To make it again:  python3 scripts/flow.py map --write`);
    return 1;
  }
  if (opts.write) {
    const file = opts.out ? path.resolve(opts.out) : path.join(src.web ? path.dirname(src.web) : REPO, 'docs', 'flow.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log(`Wrote ${shown(file)} (${text.split('\n').length - 1} lines). Commit it together with the questionnaire.`);
    return 0;
  }
  process.stdout.write(text);
  return 0;
}

/* ---- simulate --------------------------------------------------------------------------- */
function answerValue(raw) {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw;   // a code, "na", "text:...", "voice"
}
function collectAnswers(opts) {
  let answers = {};
  if (opts.answers) {
    const given = opts.answers.trim().startsWith('{') ? (() => { try { return JSON.parse(opts.answers); } catch (e) { stop(`--answers is not valid JSON: ${e.message}`); } })() :
      readJson(path.resolve(opts.answers), 'the answers file');
    if (!given || typeof given !== 'object' || Array.isArray(given)) stop('--answers must be a { } group like {"nps": 4, "support_gate": "no"}.');
    answers = Object.assign({}, given);
  }
  opts.set.forEach((pair) => {
    const eq = pair.indexOf('=');
    if (eq <= 0) stop(`--set ${pair}: write it as key=value, for example --set nps=4 or --set fn_rating:payments=2.`);
    const key = pair.slice(0, eq), value = answerValue(pair.slice(eq + 1));
    if (answers[key] === undefined) answers[key] = value;
    else answers[key] = [].concat(answers[key], value);   // a chip and its typed detail
  });
  return answers;
}
function cmdSimulate(opts) {
  const { check } = tools();
  const src = source(opts.published, opts.root);
  useCatalogue(check, src.typesWeb);
  const answers = collectAnswers(opts);
  const wc = opts['whats-changed'];
  if (wc !== undefined && !/^\d+$/.test(wc)) stop('--whats-changed must be a whole number (how many "what changed" items the round has).');
  const facts = { lang: opts.lang, lang_in_url: Boolean(opts['lang-in-url']), whats_changed_count: wc === undefined ? 0 : Number(wc), round: opts.round };
  const r = check.simulate(src.survey, answers, facts, { strings: src.strings, explain: Boolean(opts.explain) });
  // an answer no screen stores (a typo such as nsp=4) is ignored: say so (on the error output with --json)
  const unknown = (r.unknown || []).map((u) => 'Note: ' + u.message);
  if (opts.json) {
    unknown.forEach((u) => console.error(wrap(u, '      ')));
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return 0;
  }
  const f = r.facts;
  console.log('');
  console.log(`Simulated partner (${src.label}): language ${f.lang}, ${f.lang_in_url ? 'link with ?lang=' : 'link without ?lang='}, round ${f.round}, ` +
    `${plural(f.whats_changed_count, '"what changed" item')}.`);
  const given = Object.keys(answers).map((k) => `${k}=${[].concat(answers[k]).map(valueText).join('+')}`);
  console.log(wrap('Answers given: ' + (given.length ? given.join(', ') : 'none'), '  '));
  unknown.forEach((u) => console.log('  ' + wrap(u, '        ')));
  console.log('');
  console.log(`Screens, in order (${r.steps.length}):`);
  r.steps.forEach((st) => {
    const ans = Object.keys(st.answers).map((k) => (k.endsWith(' (text/voice)') ? st.answers[k] : `= ${valueText(st.answers[k])}`)).join(', ');
    const quiet = st.type === 'language_picker' ? `language chosen: ${f.lang}` : (st.type === 'whats_changed' || st.type === 'info_card') ? 'nothing to answer' : 'no answer (optional)';
    const note = st.end ? 'the end: sends the answers' : st.blocked ? (ans ? ans + '   <- Next is blocked here' : 'not answered: Next is blocked') : (ans || quiet);
    console.log(`  ${String(st.n).padStart(3)}. ${st.screen.padEnd(26)} ${note}`);
    if (st.label_en) console.log(`       ${wrap(st.label_en.length > 100 ? st.label_en.slice(0, 99) + '…' : st.label_en, '       ')}`);
    (st.why || []).forEach((w) => console.log('       why: ' + wrap(w, '            ')));
  });
  console.log('');
  console.log(`Not on this route (${r.skipped.length}):`);
  if (!r.skipped.length) console.log('  none');
  r.skipped.forEach((s) => console.log('  - ' + wrap(`${s.id}: ${s.reason}`, '    ')));
  console.log('');
  console.log(r.blocked.length ? wrap(`Next would be blocked on ${plural(r.blocked.length, 'screen')} (no answer yet, or an answer that is not enough): ${r.blocked.join(', ')}`, '  ') :
    'Next would not be blocked anywhere: a partner with these answers can finish.');
  console.log('');
  const sub = r.submission;
  if (opts.submission) {
    console.log('What would be sent (the whole message, docs/submission-format.md):');
    console.log(JSON.stringify(sub, null, 2));
    return 0;
  }
  console.log('What would be sent (add --submission for the whole message):');
  console.log('  answers:   ' + JSON.stringify(sub.answers));
  console.log('  ratings:   ' + (sub.ratings.length ? wrap(sub.ratings.map((x) => `${x.block}:${x.item}=${x.not_applicable ? 'na' : x.rating}` +
    (x.issue_code ? ` (problem: ${x.issue_code})` : '')).join(', '), '             ') : 'none'));
  console.log('  free_text: ' + (sub.free_text.length ? wrap(sub.free_text.map((x) => `${x.item_id}${x.audio ? ' [voice]' : ''}${x.text ? ` "${x.text}"` : ''}`).join(', '), '             ') : 'none'));
  return 0;
}

/* ---- paths -------------------------------------------------------------------------------- */
function cmdPaths(opts) {
  const { check } = tools();
  const src = source(opts.published, opts.root);
  useCatalogue(check, src.typesWeb);
  const limit = opts.limit === undefined ? 20 : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 0) stop('--limit must be a whole number (0 = all routes).');
  const r = check.paths(src.survey, { limit, screens: Boolean(opts.screens) });
  if (opts.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return 0; }
  console.log('');
  console.log(wrap(`${plural(r.total, 'distinct route')} through ${src.label}, from ${plural(r.sets, 'answer set')} over the boundary values of every answer a rule tests` +
    (r.exhaustive ? ' (every combination).' : ' (a sample: there are too many combinations to try them all).'), ''));
  if (r.routes.length < r.total) console.log(`Showing the ${r.routes.length} most common; add --limit 0 for all.`);
  r.routes.forEach((route, i) => {
    console.log('');
    const steps = route.nodes.map((id) => {
      const rep = route.repeats[id];
      return rep && rep[1] > 1 ? `${id} x${rep[0] === rep[1] ? rep[0] : rep[0] + '-' + rep[1]}` : id;
    });
    console.log(`${i + 1}. ${plural(route.count, 'answer set')} of ${r.sets} (${Math.round(100 * route.count / r.sets)}%), ${plural(route.screens.length, 'screen')} for the example:`);
    console.log('   ' + wrap(opts.screens ? route.screens.join(' > ') : steps.join(' > '), '   '));
    const ex = Object.keys(route.example.answers).map((k) => `${k}=${valueText(route.example.answers[k])}`);
    const fx = route.example.facts;
    console.log('   example: ' + wrap((ex.length ? ex.join(', ') : 'no answers needed') + `; ${fx.lang_in_url ? 'link with ?lang=' : 'link without ?lang='}, ` +
      `${plural(fx.whats_changed_count, '"what changed" item')}, language ${fx.lang}`, '            '));
  });
  return 0;
}

/* ---- compare ------------------------------------------------------------------------------ */
function cmdCompare(opts) {
  const { check } = tools();
  if (opts.positional.length !== 2) stop('compare needs two questionnaires, for example:  node scripts/flow.js compare old/p7.json web/config/survey.json');
  const a = source(opts.positional[0], opts.root), b = source(opts.positional[1], opts.root);
  useCatalogue(check, a.typesWeb);
  useCatalogue(check, b.typesWeb);
  const samples = opts.samples === undefined ? 200 : Number(opts.samples);
  if (!Number.isInteger(samples) || samples < 0) stop('--samples must be a whole number.');
  const r = check.compare(a.survey, b.survey, { samples });
  if (opts.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return r.same ? 0 : 1; }
  console.log('');
  console.log(`A: ${a.label}`);
  console.log(`B: ${b.label}`);
  if (r.same) {
    console.log(wrap(`The same screens and the same data for all ${r.sets} answer sets tried (the boundary values of every tested answer, plus ${samples} random sets).`, ''));
    return 0;
  }
  console.log(wrap(`Different for ${r.count} of ${r.sets} answer sets. The first ${r.differences.length}:`, ''));
  r.differences.forEach((d, i) => {
    console.log('');
    const ex = Object.keys(d.answers).map((k) => `${k}=${valueText(d.answers[k])}`);
    console.log(`${i + 1}. ` + wrap((ex.length ? ex.join(', ') : 'no answers') + `; ${d.facts.lang_in_url ? 'link with ?lang=' : 'link without ?lang='}, ` +
      `${plural(d.facts.whats_changed_count, '"what changed" item')}`, '   '));
    if (d.what === 'screens') {
      console.log('   A shows: ' + wrap(d.screens_a.join(' > '), '            '));
      console.log('   B shows: ' + wrap(d.screens_b.join(' > '), '            '));
    } else {
      console.log('   Same screens, different data:');
      console.log('   A sends: ' + wrap(JSON.stringify(d.data_a), '            '));
      console.log('   B sends: ' + wrap(JSON.stringify(d.data_b), '            '));
    }
  });
  return 1;
}

/* ---- screens -------------------------------------------------------------------------------- */
function cmdScreens(opts) {
  const { check } = tools();
  const src = source(opts.published, opts.root);
  useCatalogue(check, src.typesWeb);
  process.stdout.write(JSON.stringify(check.screens(src.survey, src.strings), null, 2) + '\n');
  return 0;
}

/* ---- migrate: survey.json's list -> the graph ------------------------------------------------- */
/* The new text of survey.json: its "flow" as the graph, written by PP.flowPanel.surveyTextWithFlow
   (the same layout as the control panel's GitHub copy); every other byte unchanged. */
function cmdMigrate(opts) {
  if (opts.published) {
    stop('migrate converts the project\'s own copy (web/config/survey.json) only. Published versions (p1.json, p2.json ... in the ' +
      'control panel\'s Drive folder) are never rewritten: phones convert an old list when they read it.');
  }
  const { flow, check } = tools();
  const panel = require(PANEL_FILE);
  if (!panel || typeof panel.surveyTextWithFlow !== 'function') stop('web/js/flow-panel.js could not be loaded.');
  const web = webDir(opts.root);
  const file = path.join(web, 'config', 'survey.json');
  const survey = readJson(file, 'the questionnaire');
  const text = fs.readFileSync(file, 'utf8');
  const value = survey.flow;
  let graph;
  if (Array.isArray(value) && value.length) graph = flow.fromLegacy(survey);
  else if (flow.isGraph(value)) graph = value;
  else {
    stop(`"flow" in ${shown(file)} is ${Array.isArray(value) ? 'an empty list' : 'neither a list of screens nor a graph with "format": "' + flow.FORMAT + '"'}, ` +
      'so there is nothing to convert. Put the last working version back from git first.');
  }
  let out;
  try { out = panel.surveyTextWithFlow(text, graph); } catch (e) { stop(`${shown(file)} could not be rewritten: ${e.message}`); }
  if (out === text) {
    console.log(`${shown(file)} already holds the flow as the graph (format ${flow.FORMAT}), laid out as the control panel writes it: nothing to do.`);
    return 0;
  }
  let after;
  try { after = JSON.parse(out); } catch (e) {
    stop('the converted file would not be valid JSON (' + e.message + '). This is a bug in web/js/flow-panel.js; nothing was written.');
  }
  // Proof before writing: the converted questionnaire must behave exactly like the original.
  const proof = check.compare(survey, after, { samples: 200 });
  const was = Array.isArray(value) ? `a list of ${plural(value.length, 'screen')}` : 'a graph in another layout';
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  console.log('');
  console.log(`Questionnaire: ${shown(file)}` + (survey.config_version ? ` (config_version ${survey.config_version})` : ''));
  console.log(wrap(`The flow is ${was}. It becomes the graph (format ${flow.FORMAT}, ${plural(nodes, 'node')}), written exactly as the ` +
    'control panel\'s GitHub copy writes it.' + (Object.prototype.hasOwnProperty.call(survey, '_flow_help') ? ' The old note "_flow_help" goes: the graph carries its own note.' : '') +
    ' Every other part of the file stays byte for byte the same.', '  '));
  if (!proof.same) {
    console.log('');
    console.log(wrap(`NOT converted: the graph would behave differently for ${proof.count} of ${proof.sets} answer sets tried ` +
      '(different screens, or different data sent). Nothing was written. Please send this to whoever maintains the scripts.', '  '));
    proof.differences.slice(0, 3).forEach((d, i) => {
      const ex = Object.keys(d.answers).map((k) => `${k}=${valueText(d.answers[k])}`);
      console.log(`  ${i + 1}. ` + wrap((ex.length ? ex.join(', ') : 'no answers') + `: ${d.what === 'screens' ? 'different screens' : 'different data'}`, '     '));
    });
    return 1;
  }
  console.log(wrap(`Checked: the same screens and the same data for all ${proof.sets} answer sets tried (the boundary values of every ` +
    'tested answer, plus 200 random sets).', '  '));
  console.log('');
  if (!opts.write) {
    console.log('Nothing was written. To save the conversion, run:  python3 scripts/flow.py migrate --write');
    return 0;
  }
  fs.writeFileSync(file, out);
  console.log(`Wrote ${shown(file)} (${out.split('\n').length - 1} lines).`);
  console.log(wrap('Next: make the map again with  python3 scripts/flow.py map --write , then run  python3 scripts/check_config.py , ' +
    'and commit them together.', ''));
  return 0;
}

/* ---- build-gs: apps-script/Flow.gs --------------------------------------------------------------- */
/* Runs scripts/build_flow_gs.js (the one generator), passing --check through, with its output and exit code. */
function cmdBuildGs(args) {
  const bad = args.filter((a) => a !== '--check');
  if (bad.length) stop(`build-gs takes only --check, not "${bad[0]}". Run  node scripts/flow.js help  to see the commands.`);
  if (!fs.existsSync(BUILD_GS_FILE)) stop('scripts/build_flow_gs.js is missing. Put it back from git.');
  const r = require('child_process').spawnSync(process.execPath, [BUILD_GS_FILE].concat(args), { cwd: REPO, stdio: 'inherit' });
  if (r.error) stop('Node.js could not run scripts/build_flow_gs.js (' + r.error.message + ').');
  return typeof r.status === 'number' ? r.status : 2;
}

/* ---- types: the catalogue of the kinds of screen (web/config/types.json) ---------------------------
   Made from the kinds the form itself registers (PP.types): web/js/flow.js describes the built-in ones,
   web/js/types.js draws them, and each web/js/types/<name>.js that web/index.html loads adds a new one.
   The files run here in a sealed space (no page, no network); only their descriptions are written. */
const TYPES_HELP = 'GENERATED by  node scripts/flow.js types --write  from the kinds of screen ("question types") the form ' +
  'registers: the built-in ones in web/js/flow.js and every web/js/types/<name>.js that web/index.html loads. Do not edit ' +
  'it by hand: python3 scripts/check_config.py refuses a copy that no longer matches. The checks, the command line and ' +
  'the control panel read it; phones never load it. What each part means: docs/config-guide.md, "How to add a question type".';
const FIELD_KINDS = ['text_key', 'bool', 'choice', 'number', 'answer_key', 'options', 'rows', 'comment'];
const ANSWER_KINDS = ['number', 'choice', 'choices', 'text', 'rows'];   // choices = pick several: the list of codes ticked (28 Oct 2026)
const KNOWN_FLAGS = ['end', 'auto', 'first', 'once', 'early'];
const MODEL_BEGIN = '// BEGIN GENERATED by  node scripts/flow.js types --write  from web/config/types.json: do not edit by hand';
const MODEL_END = '// END GENERATED (PP_ADDED_TYPES_ and PP_SCREEN_TYPES)';
const MODEL_END_BEFORE = '// END GENERATED (PP_SCREEN_TYPES)';   // the end mark until 26 Oct 2026: still found, and replaced
const ROW_KEYS = ['type', 'label', 'builtin', 'needs_text', 'description', 'fields', 'required_default', 'skip_if', 'repeatable',
  'icon', 'order', 'default_id', 'default_text', 'after_note', 'node_type'];

function parseTypes(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (TYPES_FLAGS.has(a)) { opts[a.slice(2)] = true; continue; }
    if (a === '--root' || a.startsWith('--root=')) {
      const value = a === '--root' ? argv[++i] : a.slice(7);
      if (!value) stop('--root needs a folder after it: a web folder, or the project folder.');
      opts.root = value;
      continue;
    }
    stop(`types takes --write, --check, --json and --root, not "${a}". Run  node scripts/flow.js help  to see the commands.`);
  }
  if (opts.write && opts.check) stop('types takes --write or --check, not both.');
  return opts;
}

/* JSON on one line, with a space after each ":" and ",", for the generated files. */
function inlineJson(v) {
  if (Array.isArray(v)) return '[' + v.map(inlineJson).join(', ') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    return keys.length ? '{ ' + keys.map((k) => JSON.stringify(k) + ': ' + inlineJson(v[k])).join(', ') + ' }' : '{}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* The <script> tags of web/index.html (comments left out): [{ src, defer }] in page order. */
function pageScripts(web) {
  const file = path.join(web, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  const re = /<script\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (src) out.push({ src: src[1].trim().replace(/^\.?\//, ''), defer: /\bdefer\b/i.test(m[1]) });
  }
  return out;
}

/* Runs in the sealed space next to the form's code (ES5): around each web/js/types/ file it notes which
   kinds the file registered again or changed. before() remembers every kind (its catalogue entry and its
   own code: render, isComplete, collect); after() says, as JSON, which of them the file registered again
   ("again") or changed in any other way ("changed"), and which kinds it added. */
const PLUGIN_GUARD = `
(function (root) {
  var T = root.PP.types, C = root.PP.flowCheck, before = null, again = [];
  var register = T.register;
  T.register = function (d) {
    if (before && d && typeof d.type === 'string' && Object.prototype.hasOwnProperty.call(before, d.type) && again.indexOf(d.type) === -1) again.push(d.type);
    return register.apply(T, arguments);
  };
  function look() {
    var out = {};
    C.catalogue().forEach(function (e) {
      var d = T.get(e.type);
      out[e.type] = { entry: JSON.stringify(e), render: d.render, isComplete: d.isComplete, collect: d.collect };
    });
    return out;
  }
  root.__ppGuard = {
    before: function () { before = look(); again = []; },
    after: function () {
      var now = look(), changed = [], added = [];
      Object.keys(now).forEach(function (t) {
        if (!before || !Object.prototype.hasOwnProperty.call(before, t)) { added.push(t); return; }
        var a = before[t], b = now[t];
        if (a.entry !== b.entry || a.render !== b.render || a.isComplete !== b.isComplete || a.collect !== b.collect) changed.push(t);
      });
      var out = JSON.stringify({ again: again, changed: changed, added: added });
      before = null;
      again = [];
      return out;
    }
  };
}(this));`;

/* Runs the form's type files in a sealed space and returns { entries, builtin, files, problems, warnings }. */
function buildCatalogue(web) {
  const problems = [];
  const warnings = [];
  const scripts = pageScripts(web);
  if (!scripts) stop(`${shown(path.join(web, 'index.html'))} is missing, so the kinds of screen the form loads are unknown.`);
  const srcs = scripts.map((s) => s.src);
  const at = (src) => srcs.indexOf(src);
  // a new kind: js/types/<name>.js, loaded with "defer" after js/types.js and before js/app.js
  const added = scripts.filter((s) => /^js\/types\//.test(s.src));
  added.forEach((s) => {
    const where = `web/index.html loads ${s.src}`;
    if (!/^js\/types\/[a-z][a-z0-9_]*\.js$/.test(s.src)) problems.push(`${where}: name the file after its kind's code, like js/types/stars_1_10.js (lowercase letters, digits and _).`);
    if (!s.defer) problems.push(`${where} without "defer", so it would run before the form's code exists. Write it as <script defer src="${s.src}"></script>.`);
    if (at('js/types.js') === -1 || at(s.src) < at('js/types.js') || (at('js/app.js') !== -1 && at(s.src) > at('js/app.js'))) {
      problems.push(`${where} in the wrong place: put its line after js/types.js and before js/app.js.`);
    }
  });
  const folder = path.join(web, 'js', 'types');
  if (fs.existsSync(folder)) {
    fs.readdirSync(folder).filter((f) => f.endsWith('.js')).sort().forEach((f) => {
      if (srcs.indexOf('js/types/' + f) === -1) {
        warnings.push(`web/js/types/${f} is not loaded by web/index.html, so phones never get it (and it is not in the catalogue). ` +
          `Add <script defer src="js/types/${f}"></script> after js/types.js, or delete the file.`);
      }
    });
  }
  const sandbox = { console: { log() {}, info() {}, warn() {}, error() {} } };
  const ctx = vm.createContext(sandbox);
  function run(rel, required) {
    const file = path.join(web, rel);
    if (!fs.existsSync(file)) {
      if (required) stop(`${shown(file)} is missing: the catalogue cannot be made without it.`);
      problems.push(`web/index.html loads ${rel}, which does not exist.`);
      return false;
    }
    try {
      vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel, timeout: 5000 });
      return true;
    } catch (e) {
      if (required) stop(`${shown(file)} could not be run: ${e.message}`);
      problems.push(`${rel} could not be read outside a browser (${e.message}). Keep everything that touches the page inside render(ctx), and check the file for typing mistakes.`);
      return false;
    }
  }
  run('js/flow.js', true);
  run('js/flow-check.js', true);
  const builtin = vm.runInContext('PP.types.list()', ctx).slice();
  // the drawings: ui.js and types.js (built-in kinds), then every new kind, in page order. A new
  // kind's file may only ADD kinds: one that registers or changes a kind that already exists is refused.
  vm.runInContext(PLUGIN_GUARD, ctx, { filename: 'scripts/flow.js (plug-in guard)' });
  const firstBy = {};   // kind -> the file that added it
  builtin.forEach((t) => { firstBy[t] = 'a built-in kind, described in web/js/flow.js'; });
  scripts.forEach((s) => {
    const plugin = /^js\/types\//.test(s.src);
    if (s.src !== 'js/ui.js' && s.src !== 'js/types.js' && !plugin) return;
    if (plugin) vm.runInContext('__ppGuard.before()', ctx);
    const ran = run(s.src, false);
    if (!plugin) return;
    const seen = JSON.parse(vm.runInContext('__ppGuard.after()', ctx));
    if (!ran) return;
    seen.again.concat(seen.changed.filter((t) => seen.again.indexOf(t) === -1)).forEach((t) => {
      const how = seen.again.indexOf(t) !== -1 ? 'registers' : 'changes';
      problems.push(`web/${s.src} ${how} the kind "${t}", which already exists (${firstBy[t] || 'added earlier'}). A file in web/js/types/ may only add ` +
        `NEW kinds: changing an existing one would make phones behave differently from what the checks, the map and the control panel say. ` +
        `Give the new kind its own code (its "type", for example "stars_1_10", and name the file after it), or remove the file.`);
    });
    seen.added.forEach((t) => { if (!firstBy[t]) firstBy[t] = `added by web/${s.src}`; });
  });
  const entries = JSON.parse(JSON.stringify(vm.runInContext('PP.flowCheck.catalogue()', ctx)));
  const drawn = JSON.parse(vm.runInContext('JSON.stringify(PP.types.list().filter(function (t) { return typeof PP.types.get(t).render === "function"; }))', ctx));
  entries.forEach((e) => {
    describeProblems(e, builtin.indexOf(e.type) !== -1, problems, warnings);
    if (drawn.indexOf(e.type) === -1) problems.push(`The kind "${e.type}" has no render(ctx), so phones would show its screens as an information card. Give it one (docs/config-guide.md, "How to add a question type").`);
  });
  return { entries, builtin, added: entries.map((e) => e.type).filter((t) => builtin.indexOf(t) === -1), problems, warnings };
}

/* Mistakes in one kind's description, in plain English (problems stop --write; warnings do not). */
function describeProblems(e, isBuiltin, problems, warnings) {
  const who = `The kind "${e.type}"`;
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const text = (x) => typeof x === 'string' && x.trim() !== '';
  if (!text(e.label)) problems.push(`${who} needs a "label": its name in the map, the checks and the control panel.`);
  if (!text(e.description)) warnings.push(`${who} has no "description": one plain sentence about it helps whoever picks it in the control panel.`);
  Object.keys(e.fields).forEach((f) => {
    const spec = e.fields[f];
    if (!/^[a-z_][a-z0-9_]*$/.test(f)) problems.push(`${who}: the setting "${f}" is not a usable name (lowercase letters, digits and _).`);
    if (!isObj(spec) || FIELD_KINDS.indexOf(spec.kind) === -1) {
      problems.push(`${who}: the setting "${f}" needs "kind", one of: ${FIELD_KINDS.join(', ')}.`);
      return;
    }
    if (spec.required !== undefined && typeof spec.required !== 'boolean') problems.push(`${who}: "required" of the setting "${f}" must be true or false.`);
    if (spec.kind === 'choice' && (!Array.isArray(spec.values) || !spec.values.length)) problems.push(`${who}: the setting "${f}" is a choice, so it needs "values": the list of what it may be.`);
    if (spec.kind === 'bool' && spec['default'] !== undefined && typeof spec['default'] !== 'boolean') problems.push(`${who}: the default of the setting "${f}" must be true or false.`);
  });
  function answerProblems(a, where) {
    if (!isObj(a) || ANSWER_KINDS.indexOf(a.kind) === -1) { problems.push(`${who}: ${where} needs "kind", one of: ${ANSWER_KINDS.join(', ')}.`); return; }
    if (a.kind === 'number' && !(typeof a.min === 'number' && typeof a.max === 'number' && a.min <= a.max)) {
      problems.push(`${who}: ${where} is a number, so it needs "min" and "max" (the lowest and highest answer).`);
    }
    if ((a.kind === 'choice' || a.kind === 'choices') && !Array.isArray(a.values) && a.values_from !== 'options') {
      problems.push(`${who}: ${where} is a choice, so it needs "values" (the list of codes) or "values_from": "options".`);
    }
    if (a.kind !== 'rows' && !text(a.what)) warnings.push(`${who}: ${where} has no "what" (how messages name it, like "the 1-5 rating").`);
    if (a.required_by !== undefined && a.required_by !== null && !(typeof a.required_by === 'string' && isObj(e.fields[a.required_by]) && e.fields[a.required_by].kind === 'bool')) {
      problems.push(`${who}: "required_by" of ${where} must name one of its true/false settings (or be null: always required).`);
    }
  }
  if (e.answer !== null) {
    answerProblems(e.answer, 'its answer');
    if (isObj(e.answer) && e.answer.kind === 'rows') {
      answerProblems(e.answer.rows, 'its answer\'s "rows"');
      if (e.answer.comment !== undefined) answerProblems(e.answer.comment, 'its answer\'s "comment"');
    }
    if (e.flags.end) problems.push(`${who} is an ending (flags.end), so it cannot also have an answer: it sends the answers.`);
    if (!e.records.answers && !e.records.ratings && !e.records.free_text && e.custom.indexOf('collect') === -1) {
      warnings.push(`${who} has an answer but "records" says it sends nothing, so its answer would never reach the data.`);
    }
  }
  ['answers', 'ratings', 'free_text'].forEach((k) => {
    const v = e.records[k];
    if (!(typeof v === 'number' && v >= 0) && v !== 'rows' && v !== 'comment') problems.push(`${who}: records > ${k} must be a number, "rows" or "comment".`);
  });
  // A ratings row holds a rating from 1 to 5 (docs/submission-format.md), averaged with the area and
  // support ratings: only an answer that is a number from 1 to 5 may send one.
  const rr = e.records.ratings;
  if (rr === 'rows' || rr === 'comment' || (typeof rr === 'number' && rr > 0)) {
    const a = !isObj(e.answer) ? null : rr === 'rows' ? e.answer.rows : rr === 'comment' ? e.answer.comment : e.answer;
    const fits = isObj(a) && a.kind === 'number' && typeof a.min === 'number' && typeof a.max === 'number' && a.min >= 1 && a.max <= 5;
    if (!fits) {
      const what = !isObj(a) ? 'missing' : a.kind === 'number' ? `a number from ${a.min} to ${a.max}` : `of the kind "${a.kind}"`;
      problems.push(`${who} sends a ratings row (records > ratings), but its answer is ${what}. A ratings row holds a rating from 1 to 5 ` +
        '(docs/submission-format.md; the dashboard averages them with the area and support ratings). Send this answer as an answer ' +
        'only, with "records": {"answers": 1}, or make its answer a number from 1 to 5.');
    }
  }
  if (!isBuiltin && e.custom.indexOf('collect') === -1 && (e.records.ratings > 1 || e.records.free_text > 1 || e.records.answers > 1)) {
    problems.push(`${who}: the standard rules send at most one answer, one rating and one typed or voice item; give it its own collect() for more.`);
  }
  Object.keys(e.flags).forEach((f) => {
    if (KNOWN_FLAGS.indexOf(f) === -1) warnings.push(`${who} has the flag "${f}", which nothing reads. Known flags: ${KNOWN_FLAGS.join(', ')}.`);
  });
  Object.keys(e.texts).forEach((f) => {
    if (!text(e.texts[f]) && !isObj(e.texts[f])) problems.push(`${who}: texts > ${f} must be the name of a text in strings.json.`);
  });
  if (e.row) {
    if (!text(e.row.label)) problems.push(`${who}: its "row" needs a "label" (its name in the control panel).`);
    if (!/^[a-z][a-z0-9_]*$/.test(e.row.type)) problems.push(`${who}: its "row" type "${e.row.type}" is not a usable code.`);
  }
}

/* The text of web/config/types.json for these entries (always the same for the same entries). */
function catalogueText(entries) {
  const lines = ['{', '  "_help": ' + JSON.stringify(TYPES_HELP) + ',', '  "format": ' + JSON.stringify(TYPES_FORMAT) + ',', '  "types": ['];
  entries.forEach((e, i) => {
    const keys = Object.keys(e);
    lines.push('    {');
    keys.forEach((k, j) => lines.push('      ' + JSON.stringify(k) + ': ' + inlineJson(e[k]) + (j < keys.length - 1 ? ',' : '')));
    lines.push('    }' + (i < entries.length - 1 ? ',' : ''));
  });
  lines.push('  ]', '}');
  return lines.join('\n') + '\n';
}

/* The control panel's lists of kinds (apps-script/Model.gs, between the GENERATED marks):
     PP_ADDED_TYPES_  the whole catalogue entry of each kind ADDED in web/js/types/ (added = the codes of
                      those kinds). Flow.gs carries only the built-in kinds, so Model.gs PP_mdlFlowLib_
                      teaches it these (PP.flowCheck.loadCatalogue) and Publish's checks know them.
     PP_SCREEN_TYPES  one row per kind that has a "row" (the Screens tab and "Add a question"). The row of
                      an added kind also carries its entry ("catalogue": PP_ADDED_TYPES_[n]), which reaches
                      the control panel's window with the list, so its badges, Map and "Try a path" know
                      the kind too (Panel.html teachKinds). */
function screenTypesBlock(entries, added) {
  added = added || [];
  const extra = entries.filter((e) => added.indexOf(e.type) !== -1);
  const rows = entries.filter((e) => e.row).map((e) => {
    const r = Object.assign({}, e.row, e.row.type !== e.type ? { node_type: e.type } : {});
    const out = {};
    ROW_KEYS.forEach((k) => { if (r[k] !== undefined) out[k] = r[k]; });
    Object.keys(r).forEach((k) => { if (out[k] === undefined && r[k] !== undefined) out[k] = r[k]; });
    return { row: out, at: extra.indexOf(e) };
  });
  const pair = (r, k) => JSON.stringify(k) + ': ' + inlineJson(r[k]);
  const body = rows.map((x, i) => {
    const r = x.row;
    const first = ['type', 'label', 'builtin', 'needs_text'].filter((k) => r[k] !== undefined).map((k) => pair(r, k)).join(', ');
    const rest = Object.keys(r).filter((k) => ['type', 'label', 'builtin', 'needs_text', 'description'].indexOf(k) === -1).map((k) => pair(r, k)).join(', ');
    const kind = x.at === -1 ? '' : ',\n    "catalogue": PP_ADDED_TYPES_[' + x.at + ']';
    return '  { ' + first + ',\n    ' + pair(r, 'description') + ',\n    ' + rest + kind + ' }' + (i < rows.length - 1 ? ',' : '');
  });
  const kinds = extra.map((e, i) => '  ' + inlineJson(e) + (i < extra.length - 1 ? ',' : ''));
  return [MODEL_BEGIN, '/* The kinds of screen added in web/js/types/, as web/config/types.json describes them (none: []). */',
    'var PP_ADDED_TYPES_ = [' + (kinds.length ? '\n' + kinds.join('\n') + '\n' : '') + '];',
    'var PP_SCREEN_TYPES = [', body.join('\n'), '];', MODEL_END].join('\n');
}

/* { state: fresh | stale | absent | no_markers, file, text (the whole new Model.gs) } */
function modelStatus(web, entries, added) {
  const file = path.join(path.dirname(web), 'apps-script', 'Model.gs');
  if (!fs.existsSync(file)) return { state: 'absent', file };
  const current = fs.readFileSync(file, 'utf8');
  const begin = current.indexOf(MODEL_BEGIN);
  let end = MODEL_END;
  let endAt = current.indexOf(end);
  if (endAt === -1) { end = MODEL_END_BEFORE; endAt = current.indexOf(end); }
  if (begin === -1 || endAt === -1 || endAt < begin || current.indexOf(MODEL_BEGIN, begin + 1) !== -1) return { state: 'no_markers', file };
  const text = current.slice(0, begin) + screenTypesBlock(entries, added) + current.slice(endAt + end.length);
  return { state: text === current ? 'fresh' : 'stale', file, text };
}

function cmdTypes(argv) {
  const opts = parseTypes(argv);
  const web = webDir(opts.root);
  const built = buildCatalogue(web);
  const text = catalogueText(built.entries);
  const file = path.join(web, TYPES_REL);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const typesState = current === null ? 'missing' : (current === text ? 'fresh' : 'stale');
  const model = modelStatus(web, built.entries, built.added);
  const summary = `${plural(built.entries.length, 'kind')} of screen: ${built.builtin.length} built in` +
    (built.added.length ? `, ${built.added.length} added (${built.added.join(', ')})` : ', none added');
  if (opts.json) {
    process.stdout.write(JSON.stringify({ tool: 'scripts/flow.js types', format: TYPES_FORMAT, types: built.entries.length,
      builtin: built.builtin, added: built.added, types_json: typesState, model_gs: model.state,
      problems: built.problems, warnings: built.warnings }, null, 2) + '\n');
    return built.problems.length || (opts.check && (typesState !== 'fresh' || model.state === 'stale' || model.state === 'no_markers')) ? 1 : 0;
  }
  const report = () => {
    built.problems.forEach((p, i) => console.log(`  ${i + 1}. ` + wrap(p, '     ')));
    built.warnings.forEach((w) => console.log('  Note: ' + wrap(w, '        ')));
  };
  if (built.problems.length) {
    console.log(`The descriptions of the kinds of screen have ${plural(built.problems.length, 'mistake')}${opts.write ? ', so nothing was written' : ''}:`);
    report();
    return 1;
  }
  if (opts.check) {
    const say = { fresh: 'is up to date', stale: 'is OUT OF DATE', missing: 'is MISSING' };
    console.log(`${shown(file)} ${say[typesState]} (${summary}).`);
    if (model.state === 'fresh') console.log(`${shown(model.file)}: its list of kinds (PP_SCREEN_TYPES) is up to date.`);
    if (model.state === 'stale') console.log(`${shown(model.file)}: its list of kinds (PP_SCREEN_TYPES) is OUT OF DATE.`);
    if (model.state === 'no_markers') console.log(`${shown(model.file)}: the GENERATED marks around PP_SCREEN_TYPES are missing, so its list of kinds cannot be checked.`);
    built.warnings.forEach((w) => console.log('Note: ' + wrap(w, '      ')));
    const ok = typesState === 'fresh' && model.state !== 'stale' && model.state !== 'no_markers';
    if (!ok) console.log('To make them again:  node scripts/flow.js types --write  (then paste Model.gs into Apps Script if it changed).');
    return ok ? 0 : 1;
  }
  if (opts.write) {
    if (typesState !== 'fresh') fs.writeFileSync(file, text);
    console.log(`${typesState === 'fresh' ? 'Already up to date' : 'Wrote'}: ${shown(file)} (${summary}).`);
    if (model.state === 'stale') {
      fs.writeFileSync(model.file, model.text);
      console.log(`Wrote: ${shown(model.file)} (its list of kinds, PP_SCREEN_TYPES). Paste Model.gs into the Apps Script project.`);
    } else if (model.state === 'fresh') {
      console.log(`Already up to date: ${shown(model.file)} (PP_SCREEN_TYPES).`);
    } else if (model.state === 'no_markers') {
      console.log(wrap(`Not changed: ${shown(model.file)} has no GENERATED marks around PP_SCREEN_TYPES. Put them back from git.`, '  '));
      return 1;
    }
    built.warnings.forEach((w) => console.log('Note: ' + wrap(w, '      ')));
    return 0;
  }
  process.stdout.write(text);
  return 0;
}

/* ---- es5: every script phones load must be plain ES5 (old Android phones, Chrome 61) ------------------
   A file with newer syntax is skipped whole by such a phone: a new kind of question in it would never
   register, its screens would show as information cards and their answers would not be sent. */
const ACORN_HELP = 'run  cd tests && npm install  once (in the project folder), then run this again';

/* acorn, the JavaScript parser the tests pin: from ACORN_PATH when that is set (GitHub's deployment
   installs it there), else from tests/node_modules. { acorn, version, from, given } (acorn null: none). */
function findAcorn() {
  const given = (process.env.ACORN_PATH || '').trim();
  const tries = given ? [given, path.join(given, 'node_modules', 'acorn')] : [path.join(REPO, 'tests', 'node_modules', 'acorn')];
  for (const p of tries) {
    try {
      const a = require(path.resolve(p));
      if (a && typeof a.parse === 'function') return { acorn: a, version: a.version || 'unknown', from: given ? 'ACORN_PATH' : 'tests/node_modules/acorn', given: Boolean(given) };
    } catch (e) { /* not there: try the next place */ }
  }
  return { acorn: null, version: null, from: given ? 'ACORN_PATH' : 'tests/node_modules/acorn', given: Boolean(given) };
}

function parseEs5(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--root' || a.startsWith('--root=')) {
      const value = a === '--root' ? argv[++i] : a.slice(7);
      if (!value) stop('--root needs a folder after it: a web folder, or the project folder.');
      opts.root = value;
      continue;
    }
    if (!a.startsWith('-')) stop(`es5 does not take a file name on its own ("${a}"): it checks the scripts of a web folder. Did you mean --root ${a}?`);
    stop(`es5 takes --root and --json, not "${a}". Run  node scripts/flow.js help  to see the commands.`);
  }
  return opts;
}

/* The files to check, as paths: the scripts web/index.html loads (inline ones as "index.html, script N"),
   every web/js/types/*.js, and the project's scripts/dev/*.js (the test server's developer drawer). */
function es5Files(web) {
  const out = [];
  const notes = [];
  const index = path.join(web, 'index.html');
  if (fs.existsSync(index)) {
    const html = fs.readFileSync(index, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m, inline = 0;
    while ((m = re.exec(html))) {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
      if (!src) {
        inline++;
        if (m[2].trim() && !/\btype\s*=\s*["'](application\/json|application\/ld\+json|text\/template)["']/i.test(m[1])) {
          out.push({ label: `web/index.html (inline script ${inline})`, text: m[2] });
        }
        continue;
      }
      const ref = src[1].trim().split('#')[0].split('?')[0];
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) { notes.push(`web/index.html loads ${ref} from another website, which this check cannot read.`); continue; }
      const file = path.join(web, ref.replace(/^\.?\//, ''));
      if (!fs.existsSync(file)) { notes.push(`web/index.html loads ${ref}, which does not exist (the page weight check reports it too).`); continue; }
      out.push({ file });
    }
  } else {
    notes.push('web/index.html is missing, so only web/js/types/ and scripts/dev/ were checked.');
  }
  const add = (folder) => {
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).filter((f) => f.endsWith('.js')).sort().forEach((f) => {
      const file = path.join(folder, f);
      if (!out.some((x) => x.file === file)) out.push({ file });
    });
  };
  add(path.join(web, 'js', 'types'));
  if (path.basename(web) === 'web') add(path.join(path.dirname(web), 'scripts', 'dev'));
  return { files: out, notes };
}

function cmdEs5(argv) {
  const opts = parseEs5(argv);
  const web = webDir(opts.root);
  const project = path.basename(web) === 'web' ? path.dirname(web) : web;
  const label = (f) => f.label || path.relative(project, f.file).split(path.sep).join('/');
  const found = findAcorn();
  const { files, notes } = es5Files(web);
  const report = { tool: 'scripts/flow.js es5', acorn: { found: Boolean(found.acorn), version: found.version, from: found.from, given: found.given },
    files: files.map(label), problems: [], notes };
  if (!found.acorn) {
    const why = found.given ? `ACORN_PATH is set, but acorn could not be loaded from it (${process.env.ACORN_PATH}).` :
      'acorn is not installed (tests/node_modules/acorn is missing).';
    report.message = `ES5 check skipped: ${why} To check that phones can run every script, ${found.given ? 'install acorn 8.14.0 there' : ACORN_HELP}.`;
    if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else console.error(wrap(report.message, '  '));
    return 2;
  }
  files.forEach((f) => {
    const text = f.text !== undefined ? f.text : fs.readFileSync(f.file, 'utf8');
    try {
      found.acorn.parse(text, { ecmaVersion: 5, sourceType: 'script', locations: true });
    } catch (e) {
      const at = e.loc ? { line: e.loc.line, column: e.loc.column + 1 } : { line: null, column: null };
      const what = String(e.message || e).replace(/\s*\(\d+:\d+\)\s*$/, '');
      report.problems.push({ file: label(f), line: at.line, column: at.column,
        message: `${label(f)}${at.line ? `, line ${at.line}, column ${at.column}` : ''}: this is newer JavaScript than old Android phones (Chrome 61) ` +
          `understand (the parser says: ${what}). Such a phone skips the whole file, so what it does (for example a new kind of question) would ` +
          'silently not work. Write it in ES5: var instead of let and const, function () { } instead of =>, no template strings `...`, no ?. or ??, ' +
          'no classes, no ... spread.' });
    }
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.problems.length ? 1 : 0;
  }
  console.log(wrap(`ES5 check: ${plural(files.length, 'file')} (every script web/index.html loads, web/js/types/*.js and scripts/dev/*.js), ` +
    `parsed by acorn ${found.version} from ${found.from}.`, '  '));
  notes.forEach((n) => console.log(wrap('Note: ' + n, '      ')));
  if (!report.problems.length) {
    console.log('All ES5: old Android phones (Chrome 61) can run every one of them.');
    return 0;
  }
  console.log(`Not ES5 (${report.problems.length}):`);
  report.problems.forEach((p, i) => console.log(`  ${i + 1}. ` + wrap(p.message, '     ')));
  return 1;
}

const HELP = `Valmo Partner Pulse: the questionnaire's flow tools

Usage (in the project folder):  python3 scripts/flow.py <command> [options]
                           or:  node scripts/flow.js <command> [options]

  check      look for mistakes in the flow             [--root web] [--published p.json] [--json]
  map        the map of the flow (docs/flow.md)        [--write] [--out file] [--check file]
  simulate   what a partner with these answers sees    --set nps=4 --set support_gate=no ...
             [--answers file-or-json] [--lang hi] [--lang-in-url] [--round R]
             [--whats-changed N] [--explain] [--submission] [--json]
  paths      every distinct route, with examples       [--limit N] [--screens] [--json]
  compare    two versions: same screens, same data?    A B [--samples N] [--json]
  screens    the screen list as JSON (for the dashboard)
  migrate    survey.json's old list becomes the graph  [--write] [--root web]
  build-gs   make apps-script/Flow.gs from web/js      [--check]
  types      the kinds of screen (web/config/types.json and Model.gs's list)
                                                       [--write] [--check] [--json] [--root web]
  es5        every script phones load is ES5 (old Android phones; needs acorn: cd tests && npm install)
                                                       [--root web] [--json]

Answers for --set: a number (nps=4), a code (support_gate=no), na, text:typed words, or voice.
check, map, simulate, paths and screens take --published p.json (a version from the control panel's Drive folder).
Only compare takes file names on their own; every other command refuses them (use --published or --root).
Exit codes: 0 all good, 1 problems found, 2 could not run.
More: the header of scripts/flow.js, and docs/flow-engine.md (sections 6 and 7).`;

/* A file name given on its own to a command that does not take one: refused, because the command would
   otherwise quietly run on web/config/survey.json and say "all good" about the wrong questionnaire. */
function strayArgument(command, value) {
  const option = command === 'migrate' ? `--root ${value}` : `--published ${value}`;
  stop(`${command} does not take a file name on its own ("${value}"): it would run on web/config/survey.json instead. ` +
    `Did you mean ${option}?`);
}

function main(argv) {
  const command = argv[0];
  try {
    if (command === 'build-gs' && argv.indexOf('--help') === -1 && argv.indexOf('-h') === -1) return cmdBuildGs(argv.slice(1));
    if (command === 'types' && argv.indexOf('--help') === -1 && argv.indexOf('-h') === -1) return cmdTypes(argv.slice(1));
    if (command === 'es5' && argv.indexOf('--help') === -1 && argv.indexOf('-h') === -1) return cmdEs5(argv.slice(1));
    const opts = parse(argv.slice(1));
    if (!command) { console.log(HELP); return 2; }   // nothing asked: show how to use it
    if (command === 'help' || command === '--help' || command === '-h' || opts.help) { console.log(HELP); return 0; }
    if (command !== 'compare' && opts.positional.length && COMMANDS.indexOf(command) !== -1) strayArgument(command, opts.positional[0]);
    switch (command) {
      case 'check': return cmdCheck(opts);
      case 'map': return cmdMap(opts);
      case 'simulate': return cmdSimulate(opts);
      case 'paths': return cmdPaths(opts);
      case 'compare': return cmdCompare(opts);
      case 'screens': return cmdScreens(opts);
      case 'migrate': return cmdMigrate(opts);
      default:
        stop(`"${command}" is not a command this tool knows. Run  node scripts/flow.js help  to see them.`);
    }
  } catch (e) {
    if (e instanceof Stop) { console.error(wrap('Could not run: ' + e.message, '  ')); return 2; }
    console.error('Sorry: the flow tool ran into something it did not expect. This is a bug in scripts/flow.js or web/js/flow-check.js,');
    console.error('not necessarily in your settings. Please send these lines to whoever maintains the scripts:');
    console.error('    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : String(e)));
    return 2;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
