/* =============================================================================
   tests/model/strict/shrink_check.js: a save that shrinks every tab.

   WHAT IT CHECKS
     Saves a big questionnaire, then a much smaller one, through the real
     Model.gs inside the Google imitation (tests/gas-harness), where a Range
     has no clearContents() - exactly like real Google. That is the save which
     crashed before the 20 Oct fix (Range.clearContents -> clearContent). Then
     it reads the tabs back and compares them with what was saved.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/model/strict/shrink_check.js                 (the project's Model.gs)
     node tests/model/strict/shrink_check.js <Model.gs path> (another copy)
     Expected: both saves "ok", "read back equals the saved model: true",
     exit code 0. Exit code 1 means the shrinking save failed.

   WHAT IT READS / WRITES
     Reads apps-script/Model.gs (or the given copy), apps-script/Flow.gs (the
     route code Model.gs uses since 23 Oct 2026; needed once the repo's
     survey.json holds the route as a graph), ZZ_check.gs next to this file,
     and web/config + web/i18n. Writes a temporary run-* folder here and
     deletes it at the end.
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HARNESS = path.join(__dirname, '..', '..', 'gas-harness');   // tests/gas-harness
const REPO = path.resolve(__dirname, '..', '..', '..');            // the project folder
const { loadGas } = require(path.join(HARNESS, 'load-gas.js'));
const modelFile = process.argv[2] || path.join(REPO, 'apps-script', 'Model.gs');
const flowFile = path.join(REPO, 'apps-script', 'Flow.gs');
const dir = fs.mkdtempSync(path.join(__dirname, 'run-'));
fs.copyFileSync(modelFile, path.join(dir, 'Model.gs'));
fs.copyFileSync(flowFile, path.join(dir, 'Flow.gs'));
fs.copyFileSync(path.join(__dirname, 'ZZ_check.gs'), path.join(dir, 'ZZ_check.gs'));
// The models are built with the same Model.gs (and Flow.gs) in a plain Node space.
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(modelFile, 'utf8'), ctx);
vm.runInContext(fs.readFileSync(flowFile, 'utf8'), ctx);
const web = path.join(REPO, 'web') + '/';
const read = p => JSON.parse(fs.readFileSync(web + p, 'utf8'));
const files = { survey: read('config/survey.json'), strings: read('i18n/strings.json'), whats_changed: read('config/whats_changed.json'), audio_clips: read('config/audio_clips.json') };
const big = JSON.parse(JSON.stringify(ctx.PP_importStatic(files)));
big.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', ta: 'audio/ta/q.nps.mp3' } };
const small = JSON.parse(JSON.stringify(big));
small.areas = small.areas.slice(0, 1);
small.chips = small.chips.filter(c => c.area === small.areas[0].id).slice(0, 2);
small.support = small.support.slice(0, 1);
small.screens = small.screens.filter(s => ['language', 'nps', 'thanks'].indexOf(s.id) !== -1);
const keep = ['brand.name', 'ui.next', 'q.nps', 'fn.losses.name'];
Object.keys(small.texts).forEach(k => { if (keep.indexOf(k) === -1) { delete small.texts[k]; delete small.text_notes[k]; } });
small.rounds = small.rounds.filter(r => r.id === 'DEMO-R1');
small.whats_changed = { 'DEMO-R1': small.whats_changed['DEMO-R1'].slice(0, 1) };
small.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3' } };
small.languages = small.languages.slice();   // same languages, so no column is left behind

const h = loadGas({ appsScriptDir: dir });
if (h.loadErrors && h.loadErrors.length) { console.log('LOAD ERRORS', h.loadErrors); process.exit(2); }
const w1 = h.exec('zzWrite', [big], { context: 'panel' });
console.log('first save (all tabs created):', w1.ok ? 'ok' : 'FAILED: ' + w1.error.message);
const rowsBefore = h.exec('zzLastRows', [], { context: 'panel' }).value;
const w2 = h.exec('zzWrite', [small], { context: 'panel' });
console.log('second save (every tab shrinks):', w2.ok ? 'ok' : 'FAILED: ' + w2.error.message + (w2.error.where ? '  at ' + w2.error.where : ''));
const rowsAfter = h.exec('zzLastRows', [], { context: 'panel' }).value;
console.log('rows before:', JSON.stringify(rowsBefore));
console.log('rows after: ', JSON.stringify(rowsAfter));
const back = h.exec('zzRead', [], { context: 'panel' });
const expected = JSON.parse(JSON.stringify(ctx.PP_normalizeModel(small)));
delete expected.config_version;
const same = back.ok && JSON.stringify(back.value) === JSON.stringify(expected);
console.log('read back equals the saved model:', same);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(w2.ok && same ? 0 : 1);
