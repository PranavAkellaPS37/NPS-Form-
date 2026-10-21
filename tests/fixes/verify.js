/* =============================================================================
   tests/fixes/verify.js: checks for the 20 Oct fixes in Code.gs and PanelServer.gs.

   WHAT IT CHECKS
     58 checks written by the fix agent on 20 Oct: the publish file type, the
     web app address (recorded, checked, used), searches on one column, the
     codes lock once a round has opened, DC ids kept as text, and the links
     for ids typed as numbers or dates.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/fixes/verify.js
     Each line starts with "ok" or "FAIL"; the last line says "all checks
     passed" (exit code 0) or how many failed (exit code 1).

   WHAT IT READS / WRITES
     Reads apps-script/ and uses the Google imitation in tests/gas-harness
     read-only. Everything else happens in memory. Writes nothing.
   ============================================================================= */
'use strict';
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');                 // the project folder
const HARNESS = path.join(__dirname, '..', 'gas-harness');         // tests/gas-harness
const K = require(HARNESS + '/lib/testkit');

let failures = 0;
function check(cond, what, detail) {
  console.log((cond ? 'ok   ' : 'FAIL ') + what + (cond ? '' : '  -> ' + (detail === undefined ? '' : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) failures += 1;
}
const P = (h, fn, args, user) => h.exec(fn, args || [], { context: 'panel', user: user });
const web = (h, params) => K.webGet(h, params).json;
const post = (h, body) => K.webPost(h, body).json;

function setup() {
  const h = K.freshHarness({ appsScriptDir: path.join(REPO, 'apps-script') });
  if (h.loadErrors.length) throw new Error('load errors: ' + JSON.stringify(h.loadErrors));
  const r = h.exec('ppSetup', [], { context: 'menu' });
  if (!r.ok) throw new Error('ppSetup: ' + r.error.message);
  if (h.admin.props.script.get('LIVE_VERSION') !== '1') throw new Error('version 1 not live');
  return h;
}

// ---- 6. codes lock only once a round was opened ------------------------------------
{
  const h = setup();
  let L = P(h, 'panelLoad');
  check(L.ok, 'panelLoad works', L.error);
  check(L.value.codes_locked === false, 'before any round opened: codes_locked false', L.value.codes_locked);
  check(L.value.live_ids.screens.length === 0 && L.value.live_ids.areas.length === 0 &&
    Object.keys(L.value.live_ids.chips).length === 0, 'before any round opened: live_ids empty', L.value.live_ids);
  const m = JSON.parse(JSON.stringify(L.value.model));
  m.chips = m.chips.filter((c) => !(c.area === 'losses' && c.code === 'wrong_debit'));
  let v = P(h, 'panelValidate', [m]).value;
  check(!v.warnings.some((w) => /is live today/.test(w.message)), 'before any round opened: no "live code missing" warning',
    v.warnings.filter((w) => /live/.test(w.message)));
  check(P(h, 'panelSetRoundStatus', ['2026-R1', 'open']).ok, 'round 2026-R1 opens');
  check(h.admin.props.script.get('ROUNDS_EVER_OPENED') === '1', 'ROUNDS_EVER_OPENED = "1" after opening');
  L = P(h, 'panelLoad');
  check(L.value.codes_locked === true && L.value.live_ids.screens.length > 0 && L.value.live_ids.chips.losses.length > 0,
    'after opening: codes_locked true and live_ids from the live document', { locked: L.value.codes_locked, ids: L.value.live_ids.screens });
  v = P(h, 'panelValidate', [m]).value;
  check(v.warnings.some((w) => /is live today/.test(w.message) && /wrong_debit/.test(w.message)), 'after opening: the "live code missing" warning is given',
    v.warnings.map((w) => w.message.slice(0, 80)));
  check(P(h, 'panelSetRoundStatus', ['2026-R1', 'draft']).ok, 'round goes back to draft');
  check(P(h, 'panelLoad').value.codes_locked === true, 'codes stay locked after the round goes back to draft');
}
{
  // a round opened before ROUNDS_EVER_OPENED existed
  const h = setup();
  h.admin.props.script.set('ROUND:2026-R1', JSON.stringify({ status: 'closed', sheet_id: '', audio_folder_id: '' }));
  check(P(h, 'panelLoad').value.codes_locked === true, 'legacy: a closed round counts as "ever opened"');
  check(P(h, 'panelSetRoundStatus', ['2026-R1', 'draft']).ok, 'legacy round back to draft');
  check(h.admin.props.script.get('ROUNDS_EVER_OPENED') === '1', 'legacy: the lock is recorded when its status changes');
}
{
  // test rounds (ids starting with SMOKE, DEMO or TEST) never lock the codes (Pranav, 21 Oct 2026)
  const h = setup();
  const isTest = (id) => h.exec('PP_isTestRound_', [id]).value;
  check(['SMOKE-R1', 'smoke-r1', 'DEMO-R1', 'TEST', 'TEST-2026-10', 'Test_1'].every(isTest), 'SMOKE..., DEMO..., TEST... (any case) are test rounds');
  check(!['2026-R1', 'R1-TEST', 'Contest-R1', 'PILOT-DEMO', ''].some(isTest), 'other ids are real rounds (the name must start with the word)');
  let L = P(h, 'panelLoad');
  const m = JSON.parse(JSON.stringify(L.value.model));
  m.rounds.push({ id: 'SMOKE-R1', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'smoke test' });
  m.rounds.push({ id: 'test-r2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' });
  const sv = P(h, 'panelSave', [L.value.revision, m]);
  check(sv.ok && sv.value && sv.value.ok, 'two test rounds saved', sv.ok ? sv.value : sv.error);
  check(P(h, 'panelSetRoundStatus', ['SMOKE-R1', 'open']).ok, 'SMOKE-R1 opens');
  check(!h.admin.props.script.get('ROUNDS_EVER_OPENED'), 'opening SMOKE-R1 does not record ROUNDS_EVER_OPENED');
  L = P(h, 'panelLoad');
  check(L.value.codes_locked === false && L.value.live_ids.screens.length === 0, 'after opening SMOKE-R1: codes_locked false, live_ids empty',
    { locked: L.value.codes_locked, screens: L.value.live_ids.screens.length });
  check(P(h, 'panelSetRoundStatus', ['SMOKE-R1', 'closed']).ok && P(h, 'panelSetRoundStatus', ['test-r2', 'open']).ok, 'SMOKE-R1 closes, test-r2 opens');
  check(P(h, 'panelSetRoundStatus', ['DEMO-R1', 'open', true]).ok, 'DEMO-R1 opens (with the DEMO confirmation)');
  check(P(h, 'panelLoad').value.codes_locked === false && !h.admin.props.script.get('ROUNDS_EVER_OPENED'),
    'open and closed test rounds (SMOKE, test, DEMO) still leave the codes unlocked');
  const m2 = JSON.parse(JSON.stringify(P(h, 'panelLoad').value.model));
  m2.chips = m2.chips.filter((c) => !(c.area === 'losses' && c.code === 'wrong_debit'));
  check(!P(h, 'panelValidate', [m2]).value.warnings.some((w) => /is live today/.test(w.message)),
    'with only test rounds opened: no "live code missing" warning');
  check(P(h, 'panelSetRoundStatus', ['2026-R1', 'open']).ok, 'then the first real round, 2026-R1, opens');
  check(h.admin.props.script.get('ROUNDS_EVER_OPENED') === '1' && P(h, 'panelLoad').value.codes_locked === true,
    'the first real round locks the codes');
}

// ---- 21 Oct 2026 (STATE.md item 3): Google-side safety fixes --------------------------
{
  // one "Authorization is required" message, word for word the control panel's (decision 2)
  const h = setup();
  const fs = require('fs');
  const help = (message) => h.exec('PP_permissionHelp_', [{ message: message }]).value;
  const auth = help('Authorization is required to perform that action.');
  const panel = (fs.readFileSync(path.join(REPO, 'apps-script', 'Panel.html'), 'utf8').match(/var MSG_AUTHORIZATION = '([^']*)';/) || [])[1];
  check(typeof auth === 'string' && / \(Google said: Authorization is required to perform that action\.\)$/.test(auth),
    '"Authorization is required" is explained, and Google\'s words are quoted at the end', auth);
  check(typeof panel === 'string' && auth.split(' (Google said: ')[0] === panel, 'the server and the panel give word for word the same advice', [auth, panel]);
  check(auth.indexOf('another of your Google accounts') > 0 && auth.indexOf('another of your Google accounts') < auth.indexOf('Select all'),
    'the likely cause (another Google account) first, then "tick Select all"', auth);
  const perms = help('Specified permissions are not sufficient to call DriveApp.getFolderById.');
  check(/left unticked/.test(perms) && /tick "Select all"/.test(perms) && perms.indexOf('another of your Google accounts') < 0,
    '"Specified permissions are not sufficient": the "tick Select all" advice only', perms);
  check(help('Something else broke') === '', 'other errors are not explained as permissions');
}
{
  // a new round without "What changed" bullets is not an unpublished change
  const h = setup();
  let L = P(h, 'panelLoad').value;
  check(L.draft_differs_from_live === false, 'right after set-up the draft is the live version', L.draft_differs_from_live);
  const m = JSON.parse(JSON.stringify(L.model));
  m.rounds.push({ id: '2026-R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' });
  let sv = P(h, 'panelSave', [L.revision, m]);
  check(sv.ok && sv.value.ok && sv.value.draft_differs_from_live === false, 'saving a new, empty round: the draft still equals the live version', sv.ok ? sv.value : sv.error);
  L = P(h, 'panelLoad').value;
  check(L.draft_differs_from_live === false, 'panelLoad agrees', L.draft_differs_from_live);
  const m2 = JSON.parse(JSON.stringify(L.model));
  m2.whats_changed['2026-R2'] = [{ en: 'Payouts now arrive every Tuesday.' }];
  sv = P(h, 'panelSave', [L.revision, m2]);
  check(sv.ok && sv.value.ok && sv.value.draft_differs_from_live === true, 'a bullet in that round is a change', sv.ok ? sv.value : sv.error);
}

// ---- 2. web app address -------------------------------------------------------------
{
  const h = setup();
  let L = P(h, 'panelLoad').value;
  check(L.web_app_url === '' && L.web_app_url_recorded === false, 'nothing recorded: web_app_url "" and recorded false', [L.web_app_url, L.web_app_url_recorded]);
  let ex = P(h, 'panelExport').value;
  check(JSON.parse(ex.files['survey.json']).backend.apps_script_url === '' && /web app/i.test(ex.warning || ''),
    'export without an address: apps_script_url "" and a warning', ex.warning);
  check(JSON.parse(ex.files['survey.json']).backend.mode === 'mock' && /test mode/.test(ex.warning || ''),
    'export without an address: the form stays in test mode ("mock", passes the settings check), and the warning says so (21 Oct)', ex.warning);
  const id = 'AKfycbxTESTdeployment_id-123';
  const plain = `https://script.google.com/macros/s/${id}/exec`;
  const health = { code: 200, body: JSON.stringify({ ok: true, service: 'valmo-partner-pulse', mode: 'live', time: 'x', live_version: 1 }) };
  h.control.routeUrl(plain + '?action=health', health);
  let r = P(h, 'panelSetWebAppUrl', [`  https://script.google.com/a/macros/example.com/s/${id}/exec `]);
  check(r.ok && r.value.ok === true && r.value.web_app_url === plain, 'company form /a/macros/<domain>/s/<id>/exec is normalised and saved', r.ok ? r.value : r.error.message);
  check(h.admin.props.script.get('WEB_APP_URL') === plain, 'WEB_APP_URL saved');
  L = P(h, 'panelLoad').value;
  check(L.web_app_url === plain && L.web_app_url_recorded === true, 'panelLoad returns the recorded address', [L.web_app_url, L.web_app_url_recorded]);
  ex = P(h, 'panelExport').value;
  check(JSON.parse(ex.files['survey.json']).backend.apps_script_url === plain && !ex.warning, 'export uses WEB_APP_URL, no warning', ex.warning);
  check(JSON.parse(ex.files['survey.json']).backend.mode === 'apps_script', 'with an address: mode "apps_script"', JSON.parse(ex.files['survey.json']).backend.mode);
  const bad = (url, route, pattern, label) => {
    if (route) h.control.routeUrl(url + '?action=health', route);
    const res = P(h, 'panelSetWebAppUrl', [url]);
    check(!res.ok && pattern.test(res.error.message), label, res.ok ? res.value : res.error.message);
  };
  bad('https://script.google.com/macros/s/' + id + '/dev', null, /\/dev/, '/dev address refused');
  bad('https://script.googleusercontent.com/macros/echo?user_content_key=abc', null, /forwards to/, 'googleusercontent address refused');
  bad('http://script.google.com/macros/s/' + id + '/exec', null, /not a web app address/, 'http:// refused');
  bad('https://example.org/exec', null, /not a web app address/, 'another site refused');
  bad('https://script.google.com/macros/s/AKfycbNOWHERE00/exec', { code: 404, body: 'Sorry, unable to open the file at this time.' }, /no web app/, '404: not reachable / no web app');
  bad('https://script.google.com/macros/s/AKfycbSIGNIN000/exec', { code: 200, body: '<html><head><title>Sign in - Google Accounts</title></head><body>accounts.google.com/v3/signin</body></html>' },
    /Who has access/, 'sign-in page: "Who has access" is not Anyone');
  bad('https://script.google.com/macros/s/AKfycbOTHER0000/exec', { code: 200, body: JSON.stringify({ ok: true, service: 'something-else' }) }, /not as the Partner Pulse web app/, 'another JSON service: not our web app');
  bad('https://script.google.com/macros/s/AKfycbHTMLPAGE0/exec', { code: 200, body: '<html><body>Script function not found: doGet</body></html>' }, /not as the Partner Pulse web app/, 'an HTML page: not our web app');
  bad('https://script.google.com/macros/s/AKfycbFORBID000/exec', { code: 403, body: 'Forbidden' }, /Who has access/, '403: access');
  bad('https://script.google.com/macros/s/AKfycbBROKEN000/exec', { code: 500, body: 'oops' }, /Could not reach/, '500: not reachable');
  bad('https://script.google.com/macros/s/AKfycbPERMS0000/exec', { error: 'Specified permissions are not sufficient to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request' },
    /Select all/, 'a missing permission is explained (tick "Select all")');
  check(h.admin.props.script.get('WEB_APP_URL') === plain, 'refused addresses never replace the recorded one');
  const res = P(h, 'panelSetWebAppUrl', ['']);
  check(!res.ok && /Paste the web app address/.test(res.error.message), 'empty address refused in plain English', res.ok ? '' : res.error.message);
  const setupMessage = h.exec('ppSetup', [], { context: 'menu' });
  const last = h.admin.ui.log.filter((d) => d.kind === 'alert').pop();
  check(setupMessage.ok && /Web app address/.test(last.message) && last.message.indexOf(plain) >= 0, 'set-up message: paste into Web app address, shows the recorded one', last.message.slice(-400));
}

// ---- 7. never-seen rounds, health ----------------------------------------------------
{
  const h = setup();
  const j = web(h, { action: 'bootstrap', round: 'NEVER-SEEN-1' });
  check(j.ok && j.round.status === 'draft', 'bootstrap of a never-seen round says "draft"', j.round);
  const secret = h.admin.props.script.get('LINK_SECRET');
  const ping = post(h, K.makePing({ dc: 'DC-DEMO-001', round: 'NEVER-SEEN-1', t: K.token(secret, 'DC-DEMO-001', 'NEVER-SEEN-1') }));
  check(ping.ok === false && ping.error === 'round_not_open', 'ping to a never-seen round: round_not_open', ping);
  const sub = post(h, K.makeSubmission({ dc: 'DC-DEMO-001', round: 'NEVER-SEEN-1', t: K.token(secret, 'DC-DEMO-001', 'NEVER-SEEN-1'), submission_id: 'sub_never_1', audioBytes: 0 }));
  check(sub.ok === false && sub.error === 'round_not_open', 'submit to a never-seen round: round_not_open', sub);
  const health = web(h, { action: 'health' });
  check(health.ok && health.runs_as_owner === true && JSON.stringify(health).indexOf('@') < 0, 'health has runs_as_owner (true) and no email', health);
}

// ---- 3. submit path ------------------------------------------------------------------
{
  const h = setup();
  P(h, 'panelSetRoundStatus', ['2026-R1', 'open']);
  const secret = h.admin.props.script.get('LINK_SECRET');
  const tk = (dc) => K.token(secret, dc, '2026-R1');
  const body = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_v_0001' });
  const res = K.webPost(h, body);
  check(res.json.ok && res.json.duplicate === false, 'a submission with a voice note is stored', res.json);
  check(JSON.stringify(res.run.lockWaits) === '[8000]', 'the submission waits at most 8000 ms for the lock', res.run.lockWaits);
  const life = h.admin.cache.entries().find((e) => e.key === 'sub:sub_v_0001');
  check(life && life.secondsLeft <= 900 && life.secondsLeft > 800, 'sub:<id> is cached for 900 s', life);
  const audioFiles = () => h.admin.drive.items().filter((x) => /sub_v_0001/.test(x.name)).length;
  check(audioFiles() === 1, 'one voice-note file');
  h.admin.cache.clear();
  const againRes = K.webPost(h, Object.assign({}, body, { attempt: 2 }));
  const again = againRes.json;
  const uses = Array.from(againRes.run.uses.keys());
  check(uses.indexOf('Range.createTextFinder') >= 0 && uses.indexOf('Sheet.createTextFinder') < 0, 'searches use a one-column range, never the whole tab', uses.filter((u) => /TextFinder/.test(u)));
  check(again.duplicate === true && again.received_at === res.json.received_at, 'resend after the cache forgot it: duplicate with the original received_at', again);
  check(audioFiles() === 1, 'the resend saved no second voice note (checked before saving)');
  // busy lock: voice notes are saved first, nothing stored, then the retry is stored
  h.control.setLockBusy(true);
  const busyBody = K.makeSubmission({ dc: 'DC-DEMO-002', t: tk('DC-DEMO-002'), round: '2026-R1', submission_id: 'sub_v_busy' });
  const busy = K.webPost(h, busyBody).json;
  check(busy.ok === false && busy.message === 'busy, try again', 'busy answer', busy);
  h.control.setLockBusy(false);
  const retry = K.webPost(h, Object.assign({}, busyBody, { attempt: 2 })).json;
  check(retry.ok && retry.duplicate === false, 'the retry is stored', retry);
  const busyFiles = h.admin.drive.items().filter((x) => /sub_v_busy/.test(x.name)).length;
  check(busyFiles === 2, 'known trade-off: the busy attempt left one unused voice-note file (2 files, 1 row)', busyFiles);
  // ping already_submitted uses the column range too
  const p = K.webPost(h, K.makePing({ dc: 'DC-DEMO-001', round: '2026-R1', t: tk('DC-DEMO-001') }));
  check(p.json.already_submitted === true, 'ping after submitting: already_submitted true', p.json);
  check(Array.from(p.run.uses.keys()).indexOf('Sheet.createTextFinder') < 0, 'the ping search uses a one-column range');
  // per-DC cap with voice notes: no files saved once the DC is over its limit
  for (let i = 0; i < 9; i++) K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_cap_' + i, audioBytes: 0 }));
  const capBody = K.makeSubmission({ dc: 'DC-DEMO-001', t: tk('DC-DEMO-001'), round: '2026-R1', submission_id: 'sub_cap_voice' });
  const cap = K.webPost(h, capBody).json;
  check(cap.ok === true && cap.duplicate === true, 'over the per-DC limit: answered ok, not stored', cap);
  check(h.admin.drive.items().filter((x) => /sub_cap_voice/.test(x.name)).length === 0, 'over the per-DC limit: no voice note saved');
}

// ---- 8. co-admin without Drive access learns it when the panel opens -------------------
{
  const h = setup();
  h.admin.cache.clear();
  h.control.denyDrive = (item, user) => user === 'coadmin@example.com';
  const L = P(h, 'panelLoad', [], 'coadmin@example.com');
  check(!L.ok && /Share the Drive folder with all editors/.test(L.error.message), 'panelLoad (cache expired, no Drive access) stops with the Drive access message', L.ok ? 'it opened' : L.error.message);
  const owner = P(h, 'panelLoad', [], 'admin@example.com');
  check(owner.ok && owner.value.live && owner.value.live.version === 1, 'the owner still opens the panel normally', owner.ok ? owner.value.live : owner.error.message);
  h.control.denyDrive = null;
}

// ---- 9. permission errors in the panel ---------------------------------------------------
{
  const h = setup();
  h.control.routeUrl('https://example.org/perm/', { error: 'Specified permissions are not sufficient to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request' }, true);
  const r = P(h, 'panelImport', ['https://example.org/perm/']);
  check(!r.ok && /Select all/.test(r.error.message) && (r.error.message.match(/Google has not given/g) || []).length === 1,
    'import with a missing permission: plain message to tick "Select all" (once)', r.ok ? '' : r.error.message);
  const auth = h.exec('PP_errorText_', [{ message: 'Authorization is required to perform that action.' }], { context: 'panel' });
  check(auth.ok && /Select all/.test(auth.value), '"Authorization is required" is mapped too', auth.value);
}

// ---- 10. DC ids as numbers or dates ----------------------------------------------------------
{
  const h = setup();
  const dcs = h.admin.findSheet(null, 'DCs');
  const fmt = h.evaluate('SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DCs").getRange(2, 1).getNumberFormat()');
  check(fmt === '@', 'set-up formats the DCs dc_id column as plain text (@)', fmt);
  P(h, 'panelSetRoundStatus', ['2026-R1', 'open']);
  h.evaluate('SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DCs").getRange(2, 1, 1, 6).setValues([["0123", "Typed as text", "S", "R", "hi", true]])');
  h.admin.writeRows(null, 'DCs', 3, [[12345, 'Numeric', 'S', 'R', 'hi', true], [new Date(Date.UTC(2026, 0, 2)), 'A date', 'S', 'R', '', true]]);
  const r = P(h, 'panelGenerateLinks', ['2026-R1', { only_missing: true }]).value;
  check(r.created === 1, 'the id typed as text (0123) gets its link', r);
  const skipped = (r.skipped || []).filter((x) => /Type the id as text/.test(x.reason)).map((x) => x.dc_id);
  check(skipped.length === 2 && skipped.indexOf('12345') >= 0, 'number and date ids are skipped with the "type it as text" reason', r.skipped);
  void dcs;
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
