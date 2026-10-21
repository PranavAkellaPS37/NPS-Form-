/* =============================================================================
   scenarios/fixes.js  -  G: the Google-side fixes of 20 and 21 Oct 2026

   WHAT THIS FILE IS
     Scenarios for the fixes that, until 21 Oct, only the stand-alone checks
     in tests/fixes/ and tests/model/strict/shrink_check.js covered. Each one
     runs the real code inside the pretend Google (fake-gas.js), which now
     offers these Google features strictly, as Google documents them:
       G1  locks: admin changes wait on the Sheet's DOCUMENT lock, partners'
           answers on the SCRIPT lock, so neither waits for the other;
           opening a round takes the script lock for a moment; fallbacks
           when Google gives no document lock
       G2  the permission re-check (ScriptApp.requireAllScopes) at the start
           of every menu item, and its guard: a real permission stop goes
           through, any other failure is only logged
       G3  owner hand-over (File/Folder.setOwner): round folders, the data
           spreadsheet, published files, voice notes and the main folder a
           co-admin creates go to the owner; best effort when Google refuses
       G4  the web app address: recorded only after a check, shown by
           panelLoad, used by the GitHub copy (test mode and a warning
           without it), refused addresses never replace it
       G5  the code lock: test rounds (SMOKE, DEMO, TEST) never lock the
           codes, the first real round does; a passing Drive problem keeps
           every code locked (live_ids_unknown)
       G6  a save that shrinks every list tab (Range.clearContent; Google
           has no Range.clearContents) reads back exactly
       G7  "Authorization is required": one message, word for word the same
           on the server and in the panel (Panel.html MSG_AUTHORIZATION)
       G8  the nps and support_gate questions (a warning if one goes
           missing), and a new, empty round is not an unpublished change
       G9  a DC id Sheets turned into a date gets no link; read-aloud clip
           addresses follow the settings check's rule; a round whose name
           has a dot can't be opened; a real round opened before anything
           is published keeps every code locked

   HOW TO USE IT
     Loaded by run-tests.js (node run-tests.js --only G).

   WHAT IT READS / WRITES
     Reads apps-script/Panel.html (two of its texts, to compare with the
     server). Writes nothing; everything else happens in memory.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const K = require('../lib/testkit');
const C = require('../lib/contract');
const H = require('../lib/helpers');

const P = (h, s, fn, args, opts) => K.call(h, s, fn, args, Object.assign({ context: 'panel' }, opts || {}));
const lastRun = (h) => h.state.executions[h.state.executions.length - 1] || {};
const idx = (m, id) => (m.screens || []).findIndex((x) => x.id === id);
const langs = (en, hi) => ({ en, hi: hi || en, ta: '', te: '', kn: '', ml: '' });
const logsOf = (run) => ((run && run.logs) || []).map((l) => l.text);

const OWNER = 'admin@example.com';          // runs set-up first, so owns the Drive folder (fake account)
const CO = 'coadmin@example.com';           // a co-admin of the same (fake) company
const OUTSIDER = 'agency@example.org';      // a co-admin from another (fake) company
const AUTH = 'Authorization is required to perform that action.';
const DRIVE_BUSY = 'We\'re sorry, a server error occurred. Please wait a bit and try again.';
const MENU_ITEMS = ['ppMenuOpenPanel', 'ppMenuPublish', 'ppMenuLinks', 'ppMenuPreview', 'ppMenuHelp', 'ppShareFolder', 'ppSetup',
  'panelOpen'];

function panelHtml() {
  return fs.readFileSync(path.join(H.config.appsScriptDir, 'Panel.html'), 'utf8');
}

/* The text of  var NAME = '...';  in Panel.html, or null. */
function panelConstant(name) {
  const m = new RegExp(`var ${name} = '([^']*)';`).exec(panelHtml());
  return m ? m[1] : null;
}

/* The panel's own test-round rule (Panel.html, isTestRound) as a RegExp, or null. */
function panelTestRoundRule() {
  const m = /function isTestRound\(id\)\s*\{\s*return\s+\/(.+?)\/([a-z]*)\.test\(/.exec(panelHtml());
  return m ? new RegExp(m[1], m[2]) : null;
}

module.exports = function register(add) {
  add('G1', 'Locks: admin changes wait on the Sheet\'s document lock, partners\' answers on the script lock; neither waits for the other', async (s) => {
    const h = H.setupPublished(s);
    const log = () => (lastRun(h).lockLog || []).slice();
    // 1. A save takes only the document lock.
    let L = P(h, s, 'panelLoad', [], { need: true });
    let sv = P(h, s, 'panelSave', [L.revision, L.model]);
    s.ok(sv && sv.ok, 'panelSave works', K.show(sv));
    s.eq(log(), ['document:30000', 'document:release'], 'panelSave takes only the Sheet\'s document lock (waits up to 30 s), then releases it');
    // 2. Partners' answers hold the script lock: admins can still save and publish.
    h.control.setLockBusy(true);
    L = P(h, s, 'panelLoad', [], { need: true });
    sv = P(h, s, 'panelSave', [L.revision, L.model]);
    s.ok(sv && sv.ok, 'an admin can save while partners\' answers hold the script lock', K.show(sv));
    const pub = P(h, s, 'panelPublish', [sv ? sv.revision : 0, 'Published while partners are busy']);
    s.ok(pub && pub.ok && pub.version === 2, 'and publish (version 2)', K.show(pub));
    s.eq(log(), ['document:30000', 'document:release'], 'publishing takes only the document lock');
    // 3. Opening a round creates its data spreadsheet, which also needs the script lock for a moment
    //    (a partner's first answer may be creating it): refused while partners are busy, nothing changes.
    const refused = h.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel' });
    s.ok(!refused.ok && /answers are being saved/.test(refused.error.message) && H.plainEnglish(refused.error.message),
      'opening a round while partners hold the script lock: refused with a plain "try again in a minute"',
      refused.ok ? K.show(refused.value) : refused.error.message);
    s.eq(log(), ['document:30000', 'script:30000:busy', 'document:release'],
      'it asked for the script lock inside the document lock, then gave up cleanly (both released)');
    const r1 = H.roundInfo(h, '2026-R1') || {};
    s.ok(!h.admin.props.script.get('ROUNDS_EVER_OPENED') && !r1.sheet_id && r1.status !== 'open',
      'nothing changed: the round is not open, has no data spreadsheet, and the codes are not locked', K.show(r1));
    h.control.setLockBusy(false);
    // 4. Free again: the document lock, and inside it the script lock for a moment.
    const opened = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']);
    s.ok(opened && opened.ok, 'the round opens once the script lock is free', K.show(opened));
    s.eq(log(), ['document:30000', 'script:30000', 'script:release', 'document:release'],
      'opening a round: the document lock, and inside it the script lock for a moment');
    // 5. An admin holds the document lock: a partner's answer is stored at once.
    h.control.setDocumentLockBusy(true);
    const secret = H.secretOf(h);
    const sub = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: K.token(secret, 'DC-DEMO-001', '2026-R1'),
      round: '2026-R1', submission_id: 'sub_locks_0001' })), 'submit while an admin holds the document lock');
    s.ok(sub && sub.ok === true && sub.duplicate === false, 'a partner\'s answer is stored while an admin holds the document lock', K.show(sub));
    s.eq(log(), ['script:8000', 'script:release'], 'the answer waits only for the script lock (8 s), never for the document lock');
    // 6. A second admin waits for the first one: a plain message, nothing changes.
    L = P(h, s, 'panelLoad', [], { need: true });
    const second = h.exec('panelSave', [L.revision, L.model], { context: 'panel' });
    s.ok(!second.ok && /Someone else is changing Partner Pulse right now/.test(second.error.message) && H.plainEnglish(second.error.message),
      'a second admin saving at the same moment gets a plain "someone else is changing Partner Pulse" message',
      second.ok ? K.show(second.value) : second.error.message);
    s.eq(Number(H.metaMap(h).draft_revision), L.revision, 'nothing was saved (the draft revision is unchanged)');
    const links = h.exec('panelGenerateLinks', ['2026-R1', { only_missing: true }], { context: 'panel' });
    s.ok(!links.ok && /Someone else is changing Partner Pulse/.test(links.error.message), 'making links waits for the other admin too',
      links.ok ? K.show(links.value) : links.error.message);
    h.control.setDocumentLockBusy(false);
    // 7. Google gives no document lock (getDocumentLock() is null): the script lock instead, taken once.
    h.control.setDocumentLockAvailable(false);
    const closed = P(h, s, 'panelSetRoundStatus', ['2026-R1', 'closed']);
    s.ok(closed && closed.ok, 'the round closes without a document lock', K.show(closed));
    s.eq(log(), ['script:30000', 'script:release'], 'without a document lock: the script lock is used instead, taken only once (no double locking)');
    h.control.setDocumentLockAvailable(true);
    // 8. An older Apps Script without getDocumentLock at all: the same fallback.
    h.control.hidden.add('LockService.getDocumentLock');
    L = P(h, s, 'panelLoad', [], { need: true });
    sv = P(h, s, 'panelSave', [L.revision, L.model]);
    s.ok(sv && sv.ok && K.deepEqual(log(), ['script:30000', 'script:release']),
      'an Apps Script without getDocumentLock: saving falls back to the script lock', K.show({ saved: sv, locks: log() }));
    h.control.hidden.delete('LockService.getDocumentLock');
    const webDoc = h.state.executions.filter((run) => run.context === 'webapp').some((run) => (run.lockLog || []).some((x) => /^document/.test(x)));
    s.ok(!webDoc, 'no web request (partners\' phones) ever took the document lock');
    H.contractClean(s, h);
  });

  add('G2', 'Permissions: every menu item first asks Google to re-check them (requireAllScopes); a real permission stop goes through, any other failure is only logged', async (s) => {
    const h = H.setupPublished(s);
    const during = (fn) => {
      const before = h.admin.ui.log.length;
      const r = h.exec(fn, [], { context: 'menu' });
      return { r, shown: h.admin.ui.log.slice(before) };
    };
    const panelShown = (shown) => shown.some((d) => d.kind === 'dialog' && d.title === 'Partner Pulse control panel');
    // 1. Every menu item (and panelOpen) asks first, with AuthMode.FULL.
    for (const fn of MENU_ITEMS) {
      const { r } = during(fn);
      const first = r.run ? Array.from(r.run.uses.keys())[0] : null;
      s.ok(r.ok && r.run.consentChecks[0] === 'FULL' && first === 'ScriptApp.requireAllScopes',
        `${fn}: the first thing it does is ask Google to check every permission, requireAllScopes(AuthMode.FULL)`,
        r.ok ? K.show({ checks: r.run.consentChecks, first }) : r.error.message);
    }
    const quiet = [K.webGet(h, { action: 'health' }).run, h.exec('panelLoad', [], { context: 'panel' }).run];
    s.ok(quiet.every((run) => run && run.consentChecks.length === 0),
      'only the Sheet\'s menu asks: partners\' requests and the panel\'s own calls (google.script.run) never do',
      K.show(quiet.map((run) => run && run.consentChecks)));
    // 2. A permission left unticked: Google stops the menu item and shows its permission screen.
    h.control.setConsent({ missing: true });
    let out = during('ppMenuOpenPanel');
    s.ok(!out.r.ok && /Authorization is required/.test(out.r.error.message), 'a missing permission stops the menu item with Google\'s "Authorization is required"',
      out.r.ok ? 'it carried on' : out.r.error.message);
    s.ok(out.shown.some((d) => d.kind === 'consent') && !panelShown(out.shown), 'Google shows its permission screen; the control panel does not open',
      K.show(out.shown.map((d) => d.kind)));
    const liveBefore = h.admin.props.script.get('LIVE_VERSION');
    out = during('ppMenuPublish');
    s.ok(!out.r.ok && !panelShown(out.shown) && h.admin.props.script.get('LIVE_VERSION') === liveBefore,
      'Publish… stops the same way (nothing opens, nothing is published)', out.r.ok ? 'it carried on' : out.r.error.message);
    out = during('ppSetup');
    s.ok(!out.r.ok && !out.shown.some((d) => d.kind === 'alert' || d.kind === 'prompt'),
      'Set up or repair stops before doing anything (no questions, no "Set-up stopped" message)', K.show(out.shown.map((d) => d.title)));
    h.control.setConsent(null);
    // 3. Any other failure of the re-check (a newer Google feature misbehaving) is only logged:
    //    every menu item carries on (21 Oct fix).
    h.control.setConsent({ error: 'Unexpected error while getting the method or property requireAllScopes on object ScriptApp.' });
    out = during('ppMenuOpenPanel');
    const said = logsOf(out.r.run).filter((t) => /Could not ask Google for all permissions; carrying on/.test(t));
    s.ok(out.r.ok && panelShown(out.shown) && said.length >= 1, 'an unexpected failure of the re-check is logged ("carrying on") and the control panel still opens',
      out.r.ok ? K.show(said) : out.r.error.message);
    for (const fn of MENU_ITEMS.filter((x) => x !== 'ppMenuOpenPanel')) {
      const res = h.exec(fn, [], { context: 'menu' });
      s.ok(res.ok, `${fn} still works when the re-check fails unexpectedly`, res.ok ? '' : res.error.message);
    }
    // 4. ...but a refusal that names a permission still goes through.
    h.control.setConsent({ error: 'You do not have permission to call ScriptApp.requireAllScopes. Required permissions: ' +
      'https://www.googleapis.com/auth/script.scriptapp' });
    out = during('ppMenuOpenPanel');
    s.ok(!out.r.ok && /permission/.test(out.r.error.message) && !panelShown(out.shown),
      'a failure that names a permission still stops the menu item (Google shows its screen)', out.r.ok ? 'it carried on' : out.r.error.message);
    h.control.setConsent(null);
    // 5. An older Apps Script without requireAllScopes: nothing is asked, every menu item works as before.
    h.control.hidden.add('ScriptApp.requireAllScopes');
    out = during('ppMenuOpenPanel');
    s.ok(out.r.ok && panelShown(out.shown) && out.r.run.consentChecks.length === 0 && !out.r.run.uses.has('ScriptApp.requireAllScopes'),
      'an Apps Script without requireAllScopes: nothing is asked and the panel opens as before',
      out.r.ok ? K.show(Array.from(out.r.run.uses.keys()).slice(0, 3)) : out.r.error.message);
    h.control.hidden.delete('ScriptApp.requireAllScopes');
    H.contractClean(s, h);
  });

  add('G3', 'Owner hand-over: what a co-admin creates (round folders, data spreadsheet, published files, voice notes, the main folder) goes to the owner; best effort', async (s) => {
    const h = H.setupPublished(s);
    const owner = (id) => h.admin.drive.owner(id);
    const at = (p) => h.admin.drive.find(p) || {};
    s.eq(h.admin.props.script.get('OWNER_EMAIL'), OWNER, 'set-up recorded who owns the Drive folder (OWNER_EMAIL)');
    s.eq(h.admin.drive.handovers(), [], 'the owner\'s own set-up hands nothing over (the owner already owns it all)');
    // 1. A co-admin opens a round: its folder, audio folder and data spreadsheet go to the owner.
    const opened = h.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel', user: CO });
    s.need(opened.ok && opened.value && opened.value.ok, 'a co-admin opens round 2026-R1', opened.ok ? K.show(opened.value) : opened.error.message);
    const info = H.roundInfo(h, '2026-R1') || {};
    const folder = at('Valmo Partner Pulse/rounds/2026-R1');
    s.eq([folder.owner, owner(info.audio_folder_id), owner(info.sheet_id)], [OWNER, OWNER, OWNER],
      'the round folder, its audio folder and its data spreadsheet are handed to the owner');
    s.ok([folder.id, info.audio_folder_id, info.sheet_id].every((id) => ((h.admin.drive.byId(id) || {}).editors || []).indexOf(CO) >= 0),
      'the co-admin keeps edit access to all three');
    const handed = logsOf(lastRun(h)).filter((t) => /^Handed .* over to admin@example\.com \(created by coadmin@example\.com\)\.$/.test(t));
    s.eq(handed.length, 3, 'the log says so for each of the three');
    // 2. A co-admin publishes: the published file goes to the owner.
    const L = h.exec('panelLoad', [], { context: 'panel', user: CO });
    const pub = h.exec('panelPublish', [L.ok ? L.value.revision : 0, 'Published by a co-admin'], { context: 'panel', user: CO });
    s.ok(pub.ok && pub.value.ok && pub.value.version === 2, 'a co-admin publishes version 2', pub.ok ? K.show(pub.value) : pub.error.message);
    s.eq(owner(h.admin.props.script.get('LIVE_FILE_ID')), OWNER, 'the published file p2.json is handed to the owner');
    // 3. The owner's own work is not handed over (no setOwner call at all).
    const count = h.admin.drive.handovers().length;
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    const own = P(h, s, 'panelPublish', [L2.revision, 'Published by the owner']);
    s.ok(own && own.ok && h.admin.drive.handovers().length === count && !lastRun(h).uses.has('File.setOwner'),
      'what the owner publishes is not handed over (no setOwner call)', K.show(own));
    // 4. Voice notes. Usual case: the owner deployed the web app (it runs as the owner): nothing to hand over.
    const secret = H.secretOf(h);
    let j = K.webJson(s, K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: K.token(secret, 'DC-DEMO-001', '2026-R1'), round: '2026-R1',
      submission_id: 'sub_owner_0001' })), 'submit (web app deployed by the owner)');
    const usual = h.admin.drive.items().find((x) => /sub_owner_0001/.test(x.name));
    s.ok(j && j.ok && usual && usual.owner === OWNER && !h.admin.drive.handovers().some((x) => x.id === usual.id),
      'web app deployed by the owner: the voice note is the owner\'s from the start (nothing handed over)', K.show(usual && { name: usual.name, owner: usual.owner }));
    // A co-admin deployed the web app (it runs as them): the voice note is handed to the owner.
    const hv = H.setupPublished(s, { ownerEmail: CO });
    P(hv, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    j = K.webJson(s, K.webPost(hv, K.makeSubmission({ dc: 'DC-DEMO-001', t: K.token(H.secretOf(hv), 'DC-DEMO-001', '2026-R1'), round: '2026-R1',
      submission_id: 'sub_coadmin_0001' })), 'submit (web app deployed by a co-admin)');
    const note = hv.admin.drive.items().find((x) => /sub_coadmin_0001/.test(x.name));
    s.ok(j && j.ok && note && note.owner === OWNER && (note.editors || []).indexOf(CO) >= 0,
      'web app deployed by a co-admin: the voice note is handed to the owner (the co-admin keeps edit access)',
      K.show(note && { name: note.name, owner: note.owner, editors: note.editors }));
    const health = K.webJson(s, K.webGet(hv, { action: 'health' }), 'health (web app deployed by a co-admin)');
    s.ok(health && health.runs_as_owner === false && JSON.stringify(health).indexOf('@') < 0, 'health says so (runs_as_owner false) without showing any email', K.show(health));
    H.contractClean(s, hv);
    // 5. The main folder: when a co-admin has to make the Drive folders again, they go to the owner too.
    const hm = H.setupPublished(s);
    for (const key of ['FOLDER_ID', 'PUBLISHED_FOLDER_ID', 'ROUNDS_FOLDER_ID']) hm.admin.props.script.delete(key);
    const Lm = hm.exec('panelLoad', [], { context: 'panel', user: CO });
    const pm = hm.exec('panelPublish', [Lm.ok ? Lm.value.revision : 0, 'Published by a co-admin'], { context: 'panel', user: CO });
    s.ok(pm.ok && pm.value.ok, 'a co-admin publishes when the Drive folders have to be made again', pm.ok ? K.show(pm.value) : pm.error.message);
    s.eq(['FOLDER_ID', 'PUBLISHED_FOLDER_ID', 'ROUNDS_FOLDER_ID', 'LIVE_FILE_ID'].map((key) => hm.admin.drive.owner(hm.admin.props.script.get(key))),
      [OWNER, OWNER, OWNER, OWNER], 'the main folder, published/ and rounds/ a co-admin had to make, and the published file, go to the owner');
    H.contractClean(s, hm);
    // 6. Best effort: Google refuses the hand-over (a co-admin from another company): the work still succeeds.
    const outside = h.exec('panelSetRoundStatus', ['DEMO-R1', 'open', true], { context: 'panel', user: OUTSIDER });
    s.ok(outside.ok && outside.value && outside.value.ok, 'when Google refuses the hand-over (someone from another company), the round still opens',
      outside.ok ? K.show(outside.value) : outside.error.message);
    s.eq(at('Valmo Partner Pulse/rounds/DEMO-R1').owner, OUTSIDER, 'the new folder simply stays with whoever made it (inside the shared folder)');
    const kept = logsOf(lastRun(h)).filter((t) => /^Could not hand .* over to admin@example\.com; it stays owned by agency@example\.org/.test(t));
    s.eq(kept.length, 3, 'the log says so for each item (round folder, audio folder, data spreadsheet)');
    h.control.ownerTransferError = 'The new owner has to accept the transfer first.';
    const L3 = h.exec('panelLoad', [], { context: 'panel', user: CO });
    const refusedPub = h.exec('panelPublish', [L3.ok ? L3.value.revision : 0, 'Hand-over refused'], { context: 'panel', user: CO });
    h.control.ownerTransferError = null;
    s.ok(refusedPub.ok && refusedPub.value.ok && owner(h.admin.props.script.get('LIVE_FILE_ID')) === CO,
      'Google refusing for another reason: the version is still published (the file stays with the co-admin)',
      refusedPub.ok ? K.show(refusedPub.value) : refusedPub.error.message);
    H.contractClean(s, h);
  });

  add('G4', 'The web app address: recorded only after a check, shown by panelLoad, used by the GitHub copy (test mode and a warning without it)', async (s) => {
    const h = H.setupPublished(s);
    const id = 'AKfycbHARNESSdeployment_0001';
    const plain = `https://script.google.com/macros/s/${id}/exec`;
    const echo = 'https://script.googleusercontent.com/macros/echo?user_content_key=HARNESS_G4&lib=FAKE';
    const backendOf = (ex) => { try { return JSON.parse(ex.files['survey.json']).backend; } catch (e) { return {}; } };
    // 1. Nothing recorded yet.
    let L = P(h, s, 'panelLoad', [], { need: true });
    s.eq([L.web_app_url, L.web_app_url_recorded], ['', false], 'nothing recorded yet: web_app_url "" and web_app_url_recorded false');
    let ex = P(h, s, 'panelExport', [], { need: true });
    s.eq([backendOf(ex).mode, backendOf(ex).apps_script_url], ['mock', ''],
      'the GitHub copy without an address stays in test mode ("mock", no address), so GitHub\'s settings check still passes');
    s.ok(H.plainEnglish(ex.warning) && /test mode/.test(ex.warning) && /\/exec/.test(ex.warning), 'with a plain-English warning saying what to do', K.show(ex.warning));
    let told = (H.runSetup(s, h, 'ppSetup (nothing recorded)').last || {}).message || '';
    s.ok(/Web app address recorded in the control panel: none yet/.test(told), 'set-up\'s closing message says no address is recorded yet', told.slice(-200));
    // 2. Record it. It is checked by asking ?action=health from outside, like a partner's phone; here Google's
    //    redirect is imitated, and the answer is this web app's own health answer.
    h.control.routeUrl(plain + '?action=health', { code: 302, location: echo });
    h.control.routeUrl(echo, { code: 200, body: K.webGet(h, { action: 'health' }).text });
    const rec = P(h, s, 'panelSetWebAppUrl', [`  https://script.google.com/a/macros/example.com/s/${id}/exec `]);
    s.ok(rec && rec.ok === true && rec.web_app_url === plain,
      'a company-style address (/a/macros/<domain>/s/<id>/exec, with spaces) is turned into the plain one and recorded', K.show(rec));
    s.eq(h.admin.props.script.get('WEB_APP_URL'), plain, 'Script Property WEB_APP_URL holds it');
    s.eq(h.admin.fetchLog.filter((f) => f.fn === 'panelSetWebAppUrl').map((f) => `${f.url} -> ${f.code}`), [`${plain}?action=health -> 302`, `${echo} -> 200`],
      'it was checked with ?action=health, following Google\'s redirect');
    L = P(h, s, 'panelLoad', [], { need: true });
    s.eq([L.web_app_url, L.web_app_url_recorded], [plain, true], 'panelLoad now shows the recorded address');
    ex = P(h, s, 'panelExport', [], { need: true });
    s.ok(backendOf(ex).mode === 'apps_script' && backendOf(ex).apps_script_url === plain && !ex.warning,
      'the GitHub copy now uses it: mode "apps_script", the recorded address, no warning', K.show({ backend: backendOf(ex).mode, warning: ex.warning }));
    told = (H.runSetup(s, h, 'ppSetup (address recorded)').last || {}).message || '';
    s.ok(told.indexOf('Web app address recorded in the control panel: ' + plain) >= 0, 'set-up\'s closing message shows the recorded address', told.slice(-200));
    h.control.setScriptUrl(`https://script.google.com/macros/s/${id}/dev`);
    L = P(h, s, 'panelLoad', [], { need: true });
    s.eq(L.web_app_url, plain, 'Google\'s own getUrl() (here the editors-only /dev address) is never used');
    // 3. Addresses that are refused, each in plain English; none replaces the recorded one.
    const answer = (code, body) => ({ code, body });
    const REFUSALS = [
      ['an empty address', '', null, /Paste the web app address/],
      ['the /dev test address', `https://script.google.com/macros/s/${id}/dev`, null, /\/dev/],
      ['the address Google forwards to (googleusercontent)', echo, null, /forwards to/],
      ['http:// instead of https://', `http://script.google.com/macros/s/${id}/exec`, null, /not a web app address/],
      ['another website', 'https://example.org/exec', null, /not a web app address/],
      ['a deployment that does not exist (404)', 'https://script.google.com/macros/s/AKfycbNOWHERE00/exec',
        answer(404, 'Sorry, unable to open the file at this time.'), /no web app/],
      ['a web app not open to "Anyone" (Google\'s sign-in page)', 'https://script.google.com/macros/s/AKfycbSIGNIN000/exec',
        answer(200, '<html><head><title>Sign in - Google Accounts</title></head><body>accounts.google.com/v3/signin</body></html>'), /Who has access/],
      ['a web app that refuses visitors (403)', 'https://script.google.com/macros/s/AKfycbFORBID000/exec', answer(403, 'Forbidden'), /Who has access/],
      ['another JSON service', 'https://script.google.com/macros/s/AKfycbOTHER0000/exec',
        answer(200, JSON.stringify({ ok: true, service: 'something-else' })), /not as the Partner Pulse web app/],
      ['a web page', 'https://script.google.com/macros/s/AKfycbHTMLPAGE0/exec',
        answer(200, '<html><body>Script function not found: doGet</body></html>'), /not as the Partner Pulse web app/],
      ['a server error (500)', 'https://script.google.com/macros/s/AKfycbBROKEN000/exec', answer(500, 'oops'), /Could not reach/],
      ['a missing Google permission', 'https://script.google.com/macros/s/AKfycbPERMS0000/exec',
        { error: 'Specified permissions are not sufficient to call UrlFetchApp.fetch. Required permissions: ' +
          'https://www.googleapis.com/auth/script.external_request' }, /Select all/]
    ];
    for (const [label, url, reply, pattern] of REFUSALS) {
      if (reply) h.control.routeUrl(url + '?action=health', reply);
      const r = h.exec('panelSetWebAppUrl', [url], { context: 'panel' });
      const msg = r.ok ? '' : r.error.message;
      s.ok(!r.ok && pattern.test(msg) && H.plainEnglish(msg), `${label}: refused, in plain English`, r.ok ? K.show(r.value) : msg);
    }
    s.eq(h.admin.props.script.get('WEB_APP_URL'), plain, 'refused addresses never replace the recorded one');
    H.contractClean(s, h);
  });

  add('G5', 'The code lock: test rounds (SMOKE, DEMO, TEST) never lock the codes; the first real round does; a passing Drive problem keeps every code locked', async (s) => {
    const h = H.setupPublished(s);
    const facts = C.repoFacts();
    // 1. The rule, the same on both sides.
    const TEST_IDS = ['SMOKE-R1', 'smoke-r1', 'DEMO-R1', 'TEST', 'TEST-2026-10', 'Test_1'];
    const REAL_IDS = ['2026-R1', 'R1-TEST', 'Contest-R1', 'PILOT-DEMO', 'SMOK-R1', ''];
    const server = (id) => { const r = h.exec('PP_isTestRound_', [id], { context: 'panel' }); return r.ok ? r.value : `threw: ${r.error.message}`; };
    s.eq(TEST_IDS.map(server), TEST_IDS.map(() => true), 'PP_isTestRound_: ids starting with SMOKE, DEMO or TEST (in any capitals) are test rounds');
    s.eq(REAL_IDS.map(server), REAL_IDS.map(() => false), 'PP_isTestRound_: every other id is a real round (the word must come first)');
    const rule = panelTestRoundRule();
    s.ok(rule && TEST_IDS.concat(REAL_IDS).every((id) => rule.test(String(id || '')) === server(id)),
      'the control panel uses the same rule (Panel.html isTestRound)', String(rule));
    // 2. Before any round has opened, nothing is locked.
    let L = P(h, s, 'panelLoad', [], { need: true });
    s.eq([L.codes_locked, L.live_ids_unknown, L.live_ids.screens.length], [false, false, 0],
      'before any round has opened: codes_locked false, live_ids empty, live_ids_unknown false');
    const dropped = H.clone(L.model);
    dropped.chips = dropped.chips.filter((c) => !(c.area === 'losses' && c.code === 'wrong_debit'));
    const liveWarnings = () => ((P(h, s, 'panelValidate', [dropped]) || {}).warnings || []).filter((w) => /is live today/.test(w.message));
    s.eq(liveWarnings().length, 0, 'deleting a problem gives no "is live today" warning yet');
    // 3. Test rounds open and close: still nothing locked.
    const m = H.clone(L.model);
    m.rounds.push({ id: 'SMOKE-R1', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'smoke test' });
    m.rounds.push({ id: 'test-r2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' });
    const sv = P(h, s, 'panelSave', [L.revision, m]);
    s.need(sv && sv.ok, 'two test rounds (SMOKE-R1, test-r2) are saved', K.show(sv));
    for (const [id, status, confirm] of [['SMOKE-R1', 'open'], ['SMOKE-R1', 'closed'], ['test-r2', 'open'], ['DEMO-R1', 'open', true]]) {
      const r = P(h, s, 'panelSetRoundStatus', confirm ? [id, status, confirm] : [id, status]);
      s.ok(r && r.ok && !h.admin.props.script.get('ROUNDS_EVER_OPENED'), `test round ${id} ${status === 'open' ? 'opens' : 'closes'}: the codes stay unlocked`,
        K.show({ answer: r, ROUNDS_EVER_OPENED: h.admin.props.script.get('ROUNDS_EVER_OPENED') }));
    }
    L = P(h, s, 'panelLoad', [], { need: true });
    s.eq([L.codes_locked, L.live_ids.screens.length], [false, 0], 'with only test rounds opened (open or closed), panelLoad says codes_locked false');
    s.eq(liveWarnings().length, 0, 'and deleting a problem still gives no "is live today" warning');
    // 4. The first real round locks the codes.
    s.ok(P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open']), 'the first real round, 2026-R1, opens');
    s.eq(h.admin.props.script.get('ROUNDS_EVER_OPENED'), '1', 'ROUNDS_EVER_OPENED = "1" from now on');
    L = P(h, s, 'panelLoad', [], { need: true });
    s.ok(L.codes_locked === true && L.live_ids_unknown === false && K.deepEqual(L.live_ids.screens, facts.flowIds) &&
      K.deepEqual(L.live_ids.chips, facts.chipsByArea), 'codes_locked true, and live_ids lists the live codes', K.show({ locked: L.codes_locked, screens: L.live_ids.screens }));
    const warned = liveWarnings();
    s.ok(warned.length === 1 && warned[0].section === 'chips' && warned[0].ref === 'losses/wrong_debit' && /rename its label/.test(warned[0].message),
      'deleting a live problem now gives the "is live today: rename its label instead" warning', K.show(warned));
    // 5. Locked for good.
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'draft']);
    s.eq((P(h, s, 'panelLoad', []) || {}).codes_locked, true, 'the codes stay locked when that round goes back to draft');
    // 6. A passing Google Drive problem while reading the live version (cache empty): which codes are live is
    //    unknown, so the panel must keep every code locked (live_ids_unknown, 21 Oct). The panel still opens.
    h.admin.cache.clear();
    const liveFile = h.admin.props.script.get('LIVE_FILE_ID');
    h.control.driveError = (item) => (item.id === liveFile ? DRIVE_BUSY : null);
    L = P(h, s, 'panelLoad', [], { need: true });
    h.control.driveError = null;
    s.ok(L.codes_locked === true && L.live_ids_unknown === true && L.live_ids.screens.length === 0,
      'a passing Drive problem: live_ids_unknown true (the panel then keeps every code locked)',
      K.show({ locked: L.codes_locked, unknown: L.live_ids_unknown, screens: L.live_ids.screens.length }));
    s.ok(L.live && L.live.version === 1, 'the panel still opens, with the live version\'s summary from Publish history', K.show(L.live));
    const fresh = H.setupPublished(s);
    fresh.admin.cache.clear();
    const freshFile = fresh.admin.props.script.get('LIVE_FILE_ID');
    fresh.control.driveError = (item) => (item.id === freshFile ? DRIVE_BUSY : null);
    const F = P(fresh, s, 'panelLoad', [], { need: true });
    fresh.control.driveError = null;
    s.eq([F.codes_locked, F.live_ids_unknown], [false, false], 'before any real round, a Drive problem never makes the codes "unknown" (nothing is locked)');
    H.contractClean(s, fresh);
    // 7. Rounds opened before ROUNDS_EVER_OPENED existed: a closed real round counts, a closed test round does not.
    const legacy = H.setupPublished(s);
    legacy.admin.props.script.set('ROUND:TEST-OLD', JSON.stringify({ status: 'closed', sheet_id: '', audio_folder_id: '' }));
    s.eq((P(legacy, s, 'panelLoad', []) || {}).codes_locked, false, 'an old closed TEST round does not lock the codes');
    legacy.admin.props.script.set('ROUND:2026-R1', JSON.stringify({ status: 'closed', sheet_id: '', audio_folder_id: '' }));
    s.eq((P(legacy, s, 'panelLoad', []) || {}).codes_locked, true, 'an old closed real round does');
    H.contractClean(s, legacy);
    H.contractClean(s, h);
  });

  add('G6', 'A save that shrinks every list tab: left-over rows are emptied with Range.clearContent (Google has no Range.clearContents) and it reads back exactly', async (s) => {
    const h = H.setupPublished(s);
    const TABS = ['Areas', 'Chips', 'Support', 'Screens', 'Texts', 'What changed', 'Audio clips', 'Rounds'];
    const lastRows = () => Object.fromEntries(TABS.map((t) => [t, h.admin.findSheet(null, t).lastRow()]));
    let L = P(h, s, 'panelLoad', [], { need: true });
    const big = H.clone(L.model);
    big.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3', ta: 'audio/ta/q.nps.mp3' } };
    s.need((P(h, s, 'panelSave', [L.revision, big]) || {}).ok, 'the full questionnaire (with two audio clips) is saved');
    const before = lastRows();
    // The same small questionnaire as tests/model/strict/shrink_check.js, saved the way the panel saves.
    L = P(h, s, 'panelLoad', [], { need: true });
    const small = H.clone(L.model);
    small.areas = small.areas.slice(0, 1);
    small.chips = small.chips.filter((c) => c.area === small.areas[0].id).slice(0, 2);
    small.support = small.support.slice(0, 1);
    small.screens = small.screens.filter((x) => ['language', 'nps', 'thanks'].indexOf(x.id) >= 0);
    const keep = ['brand.name', 'ui.next', 'q.nps', 'fn.losses.name'];
    Object.keys(small.texts).forEach((k) => { if (keep.indexOf(k) < 0) { delete small.texts[k]; delete small.text_notes[k]; } });
    small.rounds = small.rounds.filter((r) => r.id === 'DEMO-R1');
    small.whats_changed = { 'DEMO-R1': small.whats_changed['DEMO-R1'].slice(0, 1) };
    small.clips = { 'q.nps': { hi: 'audio/hi/q.nps.mp3' } };
    const shrink = h.exec('panelSave', [L.revision, small], { context: 'panel' });
    s.need(shrink.ok && shrink.value && shrink.value.ok, 'the save that shrinks every list tab works (this save crashed before the 20 Oct fix)',
      shrink.ok ? K.show(shrink.value) : `panelSave threw: ${shrink.error.message}${shrink.error.where ? ' at ' + shrink.error.where : ''}`);
    const after = lastRows();
    s.ok(TABS.every((t) => after[t] < before[t]), 'every list tab got shorter', K.show({ before, after }));
    s.eq(after, { Areas: 2, Chips: 3, Support: 2, Screens: 4, Texts: 5, 'What changed': 2, 'Audio clips': 2, Rounds: 2 },
      'each tab now ends right after its last item (header + items): nothing is left below');
    s.ok((shrink.run.uses.get('Range.clearContent') || 0) >= TABS.length, 'the left-over rows were emptied with Range.clearContent',
      K.show(shrink.run.uses.get('Range.clearContent')));
    s.eq(shrink.run.violations.map((v) => v.member), [], 'no [contract] error (Google\'s Range has no clearContents)');
    const back = P(h, s, 'panelLoad', [], { need: true });
    for (const sec of ['areas', 'chips', 'support', 'screens', 'texts', 'text_notes', 'whats_changed', 'clips', 'rounds', 'languages', 'settings']) {
      s.eq(back.model[sec], small[sec], `model.${sec} reads back exactly as saved`);
    }
    const grow = P(h, s, 'panelSave', [back.revision, big]);
    s.ok(grow && grow.ok, 'saving the full questionnaire again works (the tabs grow back)', K.show(grow));
    s.eq(lastRows(), before, 'every tab is back to its full length');
    const again = P(h, s, 'panelLoad', [], { need: true });
    s.ok(['areas', 'chips', 'support', 'screens', 'texts', 'whats_changed', 'clips', 'rounds'].every((sec) => K.deepEqual(again.model[sec], big[sec])),
      'and it reads back exactly too');
    H.contractClean(s, h);
  });

  add('G7', '"Authorization is required": one message, word for word the same on the server and in the panel (Panel.html MSG_AUTHORIZATION)', async (s) => {
    const h = H.setupPublished(s);
    const panelText = panelConstant('MSG_AUTHORIZATION');
    s.need(panelText, 'Panel.html defines MSG_AUTHORIZATION');
    const other = panelText.indexOf('another of your Google accounts');
    s.ok(other > 0 && other < panelText.indexOf('Select all'), 'the message gives the likely cause first (another Google account), then "tick Select all"', panelText);
    // 1. A panel call that Google refuses with "Authorization is required".
    h.control.routeUrl('https://example.org/auth/', { error: AUTH }, true);
    const r = h.exec('panelImport', ['https://example.org/auth/'], { context: 'panel' });
    s.eq(r.ok ? '(no error)' : r.error.message, `${panelText} (Google said: ${AUTH})`,
      'the server explains it in exactly the panel\'s words, then quotes Google');
    // 2. A menu item: "Share the Drive folder" when Google Drive says "Authorization is required".
    h.control.driveError = () => AUTH;
    const before = h.admin.ui.log.length;
    const share = h.exec('ppShareFolder', [], { context: 'menu' });
    h.control.driveError = null;
    const told = h.admin.ui.log.slice(before).filter((d) => d.kind === 'alert').pop() || {};
    s.ok(share.ok && told.title === 'Could not share the Drive folder' && String(told.message).indexOf(`${panelText} (Google said: ${AUTH})`) === 0,
      'a menu item gives the same words (Share the Drive folder)', K.show(told));
    s.eq(String(told.message || '').split(panelText).length - 1, 1, 'the advice is given once, never twice');
    // 3. "Specified permissions are not sufficient" (a box left unticked) gets only the "tick Select all" advice.
    h.control.routeUrl('https://example.org/perm/', { error: 'Specified permissions are not sufficient to call UrlFetchApp.fetch. ' +
      'Required permissions: https://www.googleapis.com/auth/script.external_request' }, true);
    const p = h.exec('panelImport', ['https://example.org/perm/'], { context: 'panel' });
    const pm = p.ok ? '' : p.error.message;
    s.ok(/tick "Select all"/.test(pm) && pm.indexOf('another of your Google accounts') < 0 && (pm.match(/Google has not given/g) || []).length === 1,
      '"Specified permissions are not sufficient": only the "tick Select all" advice, once', pm);
    // 4. Other errors are not explained as permissions.
    h.control.routeUrl('https://example.org/down/', { error: 'Address unavailable: https://example.org/down/config/survey.json' }, true);
    const d = h.exec('panelImport', ['https://example.org/down/'], { context: 'panel' });
    s.ok(!d.ok && d.error.message.indexOf(panelText) < 0 && !/Select all/.test(d.error.message) && H.plainEnglish(d.error.message),
      'other errors are not explained as permissions', d.ok ? K.show(d.value) : d.error.message);
    H.contractClean(s, h);
  });

  add('G8', 'The nps and support_gate questions: a warning if one goes missing (hiding is fine); a new, empty round is not an unpublished change', async (s) => {
    const h = H.setupPublished(s);
    const L = P(h, s, 'panelLoad', [], { need: true });
    const missing = (v, code) => ((v && v.warnings) || []).filter((w) => w.section === 'screens' &&
      w.message.indexOf(`The question with the code "${code}" is missing`) === 0);
    // nps deleted
    const m1 = H.clone(L.model);
    m1.screens = m1.screens.filter((x) => x.id !== 'nps');
    const v1 = P(h, s, 'panelValidate', [m1]);
    const w1 = missing(v1, 'nps');
    s.ok(w1.length === 1 && /nps column/.test(w1[0].message) && /headline score/.test(w1[0].message) && H.plainEnglish(w1[0].message),
      'without the "nps" question: a warning naming its code and the nps column (the dashboard\'s headline score)', K.show(v1 && v1.warnings.filter((w) => w.section === 'screens')));
    s.eq(v1 && v1.errors, [], 'it is only a warning (it never blocks)');
    // support_gate deleted (with the support block's rule that tested it)
    const m2 = H.clone(L.model);
    m2.screens = m2.screens.filter((x) => x.id !== 'support_gate');
    m2.screens[idx(m2, 'support')].show_if = null;
    const v2 = P(h, s, 'panelValidate', [m2]);
    const w2 = missing(v2, 'support_gate');
    s.ok(w2.length === 1 && /support_contacted column/.test(w2[0].message) && H.plainEnglish(w2[0].message),
      'without the "support_gate" question: a warning naming its code and the support_contacted column', K.show(v2 && v2.warnings.filter((w) => w.section === 'screens')));
    s.eq(v2 && v2.errors, [], 'it is only a warning too');
    // hidden, not deleted: no such warning; the full questionnaire has none either
    const m3 = H.clone(L.model);
    m3.screens[idx(m3, 'nps')].active = false;
    m3.screens[idx(m3, 'support_gate')].active = false;
    const v3 = P(h, s, 'panelValidate', [m3]);
    s.ok(v3 && missing(v3, 'nps').length === 0 && missing(v3, 'support_gate').length === 0, 'hiding them is fine: no "is missing" warning',
      K.show(v3 && v3.warnings.filter((w) => /is missing/.test(w.message))));
    const v0 = P(h, s, 'panelValidate', [L.model]);
    s.ok(v0 && missing(v0, 'nps').length + missing(v0, 'support_gate').length === 0, 'the full questionnaire has no such warning');
    // An empty new round is not an unpublished change (21 Oct fix: no needless "Publish first")
    s.eq(L.draft_differs_from_live, false, 'right after set-up the draft is the live version');
    const m4 = H.clone(L.model);
    m4.rounds.push({ id: '2026-R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'Next round' });
    const sv = P(h, s, 'panelSave', [L.revision, m4]);
    s.ok(sv && sv.ok && sv.draft_differs_from_live === false, 'saving a new round without "What changed" bullets: still no unpublished change', K.show(sv));
    const L2 = P(h, s, 'panelLoad', [], { need: true });
    s.ok(L2.draft_differs_from_live === false && L2.model.rounds.some((r) => r.id === '2026-R2'), 'panelLoad agrees, and the new round is saved',
      K.show({ differs: L2.draft_differs_from_live, rounds: L2.model.rounds.map((r) => r.id) }));
    const m5 = H.clone(L2.model);
    m5.whats_changed['2026-R2'] = [langs('Payouts now arrive every Tuesday.', 'भुगतान अब हर मंगलवार आता है।')];
    const sv2 = P(h, s, 'panelSave', [L2.revision, m5]);
    s.ok(sv2 && sv2.ok && sv2.draft_differs_from_live === true, 'a "What changed" bullet in that round is a change (partners would see it)', K.show(sv2));
    H.contractClean(s, h);
  });

  add('G9', 'Later 21 Oct fixes: a DC id Sheets turned into a date is skipped; clip addresses follow the settings check\'s rule; a round name with a dot can\'t be opened; a real round opened before anything is published keeps every code locked', async (s) => {
    const h = H.setupPublished(s);
    P(h, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    // A DC id Google Sheets turned into a date (20 Oct fix; until now only tests/fixes/verify.js checked it)
    h.admin.writeRows(null, 'DCs', 2, [
      ['DC-DEMO-001', 'Demo DC One', 'Karnataka', 'South', 'hi', true],
      [new Date(Date.UTC(2026, 0, 2)), 'A date', 'Bihar', 'East', 'hi', true]
    ]);
    const r = P(h, s, 'panelGenerateLinks', ['2026-R1', { only_missing: true }], { need: true });
    const skipped = (r && r.skipped) || [];
    s.ok(r && r.created === 1 && skipped.length === 1 && /Type the id as text/.test(skipped[0].reason) && H.plainEnglish(skipped[0].reason),
      'an id Sheets holds as a date gets no link: skipped with "Type the id as text"', K.show(r && { created: r.created, skipped }));
    // Read-aloud clips: the same address rule as scripts/check_config.py (STATE item 8)
    const L = P(h, s, 'panelLoad', [], { need: true });
    const clipErrors = (clips) => {
      const m = H.clone(L.model);
      m.clips = clips;
      const v = P(h, s, 'panelValidate', [m]);
      return ((v && v.errors) || []).filter((e) => e.section === 'clips');
    };
    s.eq(clipErrors({ 'q.nps': { hi: 'audio/hi/q.nps.mp3', en: 'https://example.org/q.nps.mp3' } }).length, 0, 'a path inside web/ and an https address are accepted');
    const bad = clipErrors({ 'q.nps': { hi: 'http://example.org/q.nps.mp3' }, 'q.nps_typo': { en: 'audio/en/q.nps.mp3' } });
    s.ok(bad.length === 2 && bad.every((e) => H.plainEnglish(e.message)), 'an http address and a clip for a missing text are errors, in plain English', K.show(bad));
    // A round name with a dot (typed into the Rounds tab) can't be OPENED: the checks refuse such names, and an open
    // round is never dropped from the tab, so it would block every Publish (21 Oct review)
    const m3 = H.clone(L.model);
    m3.rounds.push({ id: '2026.R2', status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: '' });
    P(h, s, 'panelSave', [L.revision, m3], { need: true });
    const dotted = h.exec('panelSetRoundStatus', ['2026.R2', 'open'], { context: 'panel' });
    const refusal = dotted && !dotted.ok ? String(dotted.error && dotted.error.message) : '';
    s.ok(/has a name that is not allowed/.test(refusal) && /no spaces or dots/.test(refusal) && H.plainEnglish(refusal),
      'opening a round whose name has a dot is refused, with the checks\' wording', K.show(dotted && (dotted.ok ? dotted.value : refusal)));
    // A real round opened before anything is published: the live codes are unknown, so every code stays locked
    const h2 = H.harness();
    H.needLoaded(s, h2);
    h2.control.queueAnswer({ match: (d) => d.kind === 'alert' && d.buttons.indexOf('YES') >= 0, button: 'NO' });
    H.runSetup(s, h2);
    s.ok(!h2.admin.props.script.get('LIVE_VERSION'), 'set-up answered No to publishing: nothing is live');
    P(h2, s, 'panelSetRoundStatus', ['2026-R1', 'open'], { need: true });
    const L2 = P(h2, s, 'panelLoad', [], { need: true });
    s.ok(L2.codes_locked === true && L2.live === null && L2.live_ids_unknown === true,
      'a real round open with nothing published: codes_locked, live null, live_ids_unknown (the panel keeps every code locked)',
      K.show({ locked: L2.codes_locked, live: L2.live, unknown: L2.live_ids_unknown }));
    H.contractClean(s, h);
  });
};
