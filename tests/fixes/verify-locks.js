/* =============================================================================
   tests/fixes/verify-locks.js: checks of the 20 and 21 Oct lock, permission and owner fixes.

   WHAT IT CHECKS
     40 checks of the document lock (admins and partners don't wait for each
     other), ScriptApp.requireAllScopes (the permission re-prompt),
     File/Folder.setOwner (handing files to the owner) and the code lock when
     the live codes are unknown. It was written when the Google imitation
     could not reach these paths; since 21 Oct its scenarios G1-G3 and G5 do,
     and this file stays as a second, independent check. The richer fakes it
     needs live only in this script's memory; no harness file is changed.

   HOW TO RUN IT (Terminal, in the project folder)
     node tests/fixes/verify-locks.js
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
  console.log((cond ? 'ok   ' : 'FAIL ') + what + (cond ? '' : '  -> ' + JSON.stringify(detail === undefined ? '' : detail).slice(0, 400)));
  if (!cond) failures += 1;
}

function setup() {
  const h = K.freshHarness({ appsScriptDir: path.join(REPO, 'apps-script') });
  const r = h.exec('ppSetup', [], { context: 'menu' });
  if (!r.ok || h.admin.props.script.get('LIVE_VERSION') !== '1') throw new Error('set-up failed');
  return h;
}

/* Two independent locks; busy flags and a log of who took what. */
function installLocks(h) {
  const state = { scriptBusy: false, documentBusy: false, documentNull: false, log: [] };
  const make = (kind) => ({
    tryLock: (ms) => {
      const busy = kind === 'script' ? state.scriptBusy : state.documentBusy;
      state.log.push(kind + ':' + ms + (busy ? ':busy' : ''));
      return !busy;
    },
    releaseLock: () => state.log.push(kind + ':release'),
    hasLock: () => true
  });
  h.gas.globals.LockService = {
    getScriptLock: () => make('script'),
    getDocumentLock: () => (state.documentNull ? null : make('document'))
  };
  return state;
}

{
  const h = setup();
  const locks = installLocks(h);
  const P = (fn, args) => h.exec(fn, args || [], { context: 'panel' });
  // admin save uses the document lock only
  const L = P('panelLoad').value;
  locks.log.length = 0;
  let r = P('panelSave', [L.revision, L.model]);
  check(r.ok && r.value.ok, 'panelSave works with a document lock', r.ok ? r.value : r.error.message);
  check(locks.log.join(' ') === 'document:30000 document:release', 'panelSave takes only the document lock', locks.log);
  // partners flooding the script lock do not block an admin save
  locks.scriptBusy = true;
  const L2 = P('panelLoad').value;
  r = P('panelSave', [L2.revision, L2.model]);
  check(r.ok && r.value.ok, 'an admin can save while the script lock is busy', r.ok ? r.value : r.error.message);
  // ... but opening a round (creating its store) needs the script lock for a moment
  r = P('panelSetRoundStatus', ['2026-R1', 'open']);
  check(!r.ok && /answers are being saved/.test(r.error.message), 'opening a round while the script lock is busy: plain "try again"', r.ok ? r.value : r.error.message);
  check(!h.admin.props.script.get('ROUNDS_EVER_OPENED'), 'a refused opening does not lock the codes');
  locks.scriptBusy = false;
  locks.log.length = 0;
  r = P('panelSetRoundStatus', ['2026-R1', 'open']);
  check(r.ok && r.value.ok, 'the round opens when the script lock is free', r.ok ? r.value : r.error.message);
  check(locks.log.join(' ') === 'document:30000 script:30000 script:release document:release',
    'opening a round: document lock, then the script lock briefly inside it', locks.log);
  // an admin holding the document lock does not block partners
  locks.documentBusy = true;
  const secret = h.admin.props.script.get('LINK_SECRET');
  const sub = K.webPost(h, K.makeSubmission({ dc: 'DC-DEMO-001', t: K.token(secret, 'DC-DEMO-001', '2026-R1'), round: '2026-R1', submission_id: 'sub_doc_busy' })).json;
  check(sub.ok === true && sub.duplicate === false, 'a submission is stored while an admin holds the document lock', sub);
  const L3 = P('panelLoad').value;
  r = P('panelSave', [L3.revision, L3.model]);
  check(!r.ok && /Someone else is changing Partner Pulse/.test(r.error.message), 'a second admin waits for the first one (plain message)', r.ok ? r.value : r.error.message);
  locks.documentBusy = false;
  // no document lock (null): falls back to the script lock, and the store step does not lock twice
  locks.documentNull = true;
  locks.log.length = 0;
  r = P('panelSetRoundStatus', ['2026-R1', 'closed']);
  check(r.ok && locks.log.join(' ') === 'script:30000 script:release', 'without a document lock: the script lock is used once (no double locking)', locks.log);
}

{
  // requireAllScopes is called first by the menu items and panelOpen
  const h = setup();
  const calls = [];
  const real = h.gas.globals.ScriptApp;
  h.gas.globals.ScriptApp = {
    getService: () => real.getService(),
    requireAllScopes: (mode) => calls.push(mode),
    AuthMode: { FULL: 'FULL', LIMITED: 'LIMITED' }
  };
  for (const fn of ['ppMenuOpenPanel', 'ppMenuPublish', 'ppMenuLinks', 'ppMenuPreview', 'ppMenuHelp', 'ppShareFolder', 'ppSetup', 'panelOpen']) {
    calls.length = 0;
    const r = h.exec(fn, [], { context: 'menu' });
    check(r.ok && calls.length >= 1 && calls[0] === 'FULL', fn + ' asks requireAllScopes(AuthMode.FULL) first', r.ok ? calls : r.error.message);
  }
  // when Google stops the run to show its permission screen, nothing else happens
  h.gas.globals.ScriptApp.requireAllScopes = () => { throw new Error('Authorization is required to perform that action.'); };
  const before = h.admin.ui.log.length;
  const r = h.exec('ppMenuOpenPanel', [], { context: 'menu' });
  check(!r.ok && h.admin.ui.log.length === before, 'if requireAllScopes stops the run, the panel is not opened');
  // any other failure of requireAllScopes must not break the menu (21 Oct): logged, and the panel opens
  h.gas.globals.ScriptApp.requireAllScopes = () => { throw new Error('Unexpected error while getting the method or property requireAllScopes on object ScriptApp.'); };
  const before2 = h.admin.ui.log.length;
  const r2 = h.exec('ppMenuOpenPanel', [], { context: 'menu' });
  const notes = (r2.run && r2.run.logs || []).map((l) => l.text).filter((t) => /Could not ask Google for all permissions/.test(t));
  check(r2.ok && h.admin.ui.log.length > before2 && notes.length >= 1, 'an unexpected requireAllScopes failure is logged (by each step that asks) and the panel still opens',
    r2.ok ? notes : r2.error.message);
  h.gas.globals.ScriptApp.requireAllScopes = () => { throw new Error('You do not have permission to call ScriptApp.requireAllScopes.'); };
  const r3 = h.exec('ppMenuOpenPanel', [], { context: 'menu' });
  check(!r3.ok, 'a permission stop still goes through (Google shows its permission screen)', r3.ok ? 'ran on' : r3.error.message);
}

{
  // a co-admin opening a round: the new folders and spreadsheet are handed to the owner
  const h = setup();
  const handed = [];
  const realDrive = h.gas.globals.DriveApp;
  const realSheets = h.gas.globals.SpreadsheetApp;
  const inner = new WeakMap();
  const unwrap = (a) => (a && typeof a === 'object' && inner.has(a) ? inner.get(a) : a);
  const wrapItem = (item, kind) => { const p = new Proxy(item, {
    get(target, prop) {
      if (prop === 'setOwner') return (email) => { handed.push(kind + ' -> ' + email); };
      if (prop === 'createFolder') return (name) => wrapItem(target.createFolder(name), 'folder ' + name);
      if (prop === 'getFoldersByName') return (name) => { const it = target.getFoldersByName(name); return { hasNext: () => it.hasNext(), next: () => wrapItem(it.next(), 'folder ' + name) }; };
      if (prop === 'createFile') return (...a) => wrapItem(target.createFile(...a), 'file');
      const v = target[prop];
      return typeof v === 'function' ? (...a) => v.apply(target, a.map(unwrap)) : v;
    }
  }); inner.set(p, item); return p; };
  h.gas.globals.DriveApp = {
    getFolderById: (id) => wrapItem(realDrive.getFolderById(id), 'folder ' + id),
    getFileById: (id) => wrapItem(realDrive.getFileById(id), 'spreadsheet file'),
    createFolder: (n) => realDrive.createFolder(n),
    getRootFolder: () => realDrive.getRootFolder()
  };
  void realSheets;
  const r = h.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel', user: 'coadmin@example.com' });
  check(r.ok && r.value.ok, 'a co-admin opens a round', r.ok ? r.value : r.error.message);
  check(handed.some((x) => /^folder 2026-R1 -> admin@example.com$/.test(x)) && handed.some((x) => /^folder audio -> admin@example.com$/.test(x)) &&
    handed.some((x) => /^spreadsheet file -> admin@example.com$/.test(x)), 'round folder, audio folder and data spreadsheet are handed to OWNER_EMAIL', handed);
  handed.length = 0;
  const L = h.exec('panelLoad', [], { context: 'panel', user: 'coadmin@example.com' }).value;
  const pub = h.exec('panelPublish', [L.revision, 'by a co-admin'], { context: 'panel', user: 'coadmin@example.com' });
  check(pub.ok && pub.value.ok && handed.indexOf('file -> admin@example.com') >= 0, 'a version published by a co-admin is handed to OWNER_EMAIL', pub.ok ? handed : pub.error.message);
  handed.length = 0;
  const own = h.exec('panelPublish', [h.exec('panelLoad', [], { context: 'panel' }).value.revision, 'by the owner'], { context: 'panel', user: 'admin@example.com' });
  check(own.ok && handed.length === 0, 'the owner\'s own files are not handed over', handed);
  // setOwner refused by Google: best effort, logged, nothing fails. Since 21 Oct
  // the imitation's own Drive has setOwner, so make it refuse.
  h.gas.globals.DriveApp = realDrive;
  h.control.ownerTransferError = 'The new owner has to accept the transfer first.';
  const r2 = h.exec('panelSetRoundStatus', ['DEMO-R1', 'open', true], { context: 'panel', user: 'coadmin@example.com' });
  h.control.ownerTransferError = null;
  const logs = (r2.run && r2.run.logs || []).map((l) => l.text).filter((t) => /hand/.test(t));
  check(r2.ok && r2.value.ok && logs.length >= 1 && /Could not hand/.test(logs[0]), 'when setOwner fails the round still opens and the log says so', r2.ok ? logs : r2.error.message);
}

{
  // 21 Oct: voice notes saved while the web app runs as a co-admin, and a main folder a
  // co-admin had to make, are handed to the owner too
  const h = setup();
  check(h.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel' }).value.ok, 'round 2026-R1 opens (by the owner)');
  const info = JSON.parse(h.admin.props.script.get('ROUND:2026-R1'));
  const handed = [];
  const realDrive = h.gas.globals.DriveApp;
  const inner = new WeakMap();
  const unwrap = (a) => (a && typeof a === 'object' && inner.has(a) ? inner.get(a) : a);
  const wrapItem = (item, kind) => { const p = new Proxy(item, {
    get(target, prop) {
      if (prop === 'setOwner') return (email) => { handed.push(kind + ' -> ' + email); };
      if (prop === 'createFile') return (...a) => wrapItem(target.createFile(...a), 'file');
      const v = target[prop];
      return typeof v === 'function' ? (...a) => v.apply(target, a.map(unwrap)) : v;
    }
  }); inner.set(p, item); return p; };
  h.gas.globals.DriveApp = {
    getFolderById: (id) => wrapItem(realDrive.getFolderById(id), 'folder ' + id),
    getFileById: (id) => wrapItem(realDrive.getFileById(id), 'file ' + id),
    createFolder: (n) => wrapItem(realDrive.createFolder(n), 'folder ' + n),
    getRootFolder: () => realDrive.getRootFolder()
  };
  const msg = { dc: 'DC-DEMO-001', submission_id: 'sub-handover-1', round: '2026-R1' };
  const notes = [{ index: 0, item_id: 'fn_detail:losses', mime: 'audio/webm;codecs=opus', bytes: [1, 2, 3, 4] }];
  const v = h.exec('PP_saveVoiceNotes_', [msg, notes, info.audio_folder_id], { context: 'panel', user: 'coadmin@example.com' });
  check(v.ok && handed.indexOf('file -> admin@example.com') >= 0, 'a voice note saved while the web app runs as a co-admin is handed to OWNER_EMAIL',
    v.ok ? handed : v.error.message);
  handed.length = 0;
  const own = h.exec('PP_saveVoiceNotes_', [Object.assign({}, msg, { submission_id: 'sub-handover-2' }), notes, info.audio_folder_id], { context: 'panel', user: 'admin@example.com' });
  check(own.ok && handed.length === 0, 'the owner\'s own voice notes are not handed over', own.ok ? handed : own.error.message);
  h.admin.props.script.delete('FOLDER_ID');
  const f = h.exec('PP_folders_', [], { context: 'panel', user: 'coadmin@example.com' });
  check(f.ok && handed.indexOf('folder Valmo Partner Pulse -> admin@example.com') >= 0, 'a main folder a co-admin had to make is handed to OWNER_EMAIL',
    f.ok ? handed : f.error.message);
  h.gas.globals.DriveApp = realDrive;
}

{
  // 21 Oct: codes are locked, but a passing Drive problem hides which codes are live:
  // panelLoad says so (live_ids_unknown), and the panel then keeps every code locked
  const h = setup();
  check(h.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel' }).value.ok, 'round 2026-R1 opens (the codes lock)');
  let L = h.exec('panelLoad', [], { context: 'panel' }).value;
  check(L.codes_locked === true && L.live_ids_unknown === false && L.live_ids.screens.length > 0, 'normally the live codes are known', L);
  h.admin.cache.clear();
  const realDrive = h.gas.globals.DriveApp;
  h.gas.globals.DriveApp = {
    getFolderById: (id) => realDrive.getFolderById(id),
    getFileById: () => { throw new Error("We're sorry, a server error occurred. Please wait a bit and try again."); },
    createFolder: (n) => realDrive.createFolder(n),
    getRootFolder: () => realDrive.getRootFolder()
  };
  L = h.exec('panelLoad', [], { context: 'panel' }).value;
  check(L.codes_locked === true && L.live_ids_unknown === true && L.live_ids.screens.length === 0,
    'a passing Drive problem: live_ids_unknown true', { locked: L.codes_locked, unknown: L.live_ids_unknown, screens: L.live_ids.screens.length });
  h.gas.globals.DriveApp = realDrive;
  const fresh = setup();
  check(fresh.exec('panelLoad', [], { context: 'panel' }).value.live_ids_unknown === false, 'before any real round, never "unknown" (nothing is locked)');

  // 21 Oct (the contract writer's finding): a real round opened with "Open anyway"
  // before anything was published. Partners answer with the form's own copy,
  // whose codes the panel can't see, so every code must stay locked.
  const unpublished = K.freshHarness({ appsScriptDir: path.join(REPO, 'apps-script') });
  unpublished.control.queueAnswer({ match: (d) => d.kind === 'alert' && d.buttons.indexOf('YES') >= 0, button: 'NO' });
  const s = unpublished.exec('ppSetup', [], { context: 'menu' });
  check(s.ok && !unpublished.admin.props.script.get('LIVE_VERSION'), 'set-up answering No to publishing: nothing is live', s.ok ? unpublished.admin.props.script.get('LIVE_VERSION') : s.error.message);
  L = unpublished.exec('panelLoad', [], { context: 'panel' }).value;
  check(L.codes_locked === false && L.live_ids_unknown === false, 'nothing published and no round open: nothing locked, not "unknown"', { locked: L.codes_locked, unknown: L.live_ids_unknown });
  check(unpublished.exec('panelSetRoundStatus', ['2026-R1', 'open'], { context: 'panel' }).value.ok, 'a real round opens before anything is published');
  L = unpublished.exec('panelLoad', [], { context: 'panel' }).value;
  check(L.codes_locked === true && L.live === null && L.live_ids_unknown === true, 'a real round open with nothing published: live_ids_unknown true (every code stays locked)',
    { locked: L.codes_locked, live: L.live, unknown: L.live_ids_unknown });
}

{
  // a passing Drive problem while the cache is empty: the panel still opens (no "ask the owner")
  const h = setup();
  h.admin.cache.clear();
  const realDrive = h.gas.globals.DriveApp;
  h.gas.globals.DriveApp = {
    getFolderById: (id) => realDrive.getFolderById(id),
    getFileById: () => { throw new Error("We're sorry, a server error occurred. Please wait a bit and try again."); },
    createFolder: (n) => realDrive.createFolder(n),
    getRootFolder: () => realDrive.getRootFolder()
  };
  const L = h.exec('panelLoad', [], { context: 'panel' });
  check(L.ok && L.value.live && L.value.live.version === 1, 'a passing Drive error does not block the panel (live summary from history)', L.ok ? L.value.live : L.error.message);
  const e = h.exec('PP_driveAccessError_', ['the file', { message: "We're sorry, a server error occurred. Please wait a bit and try again." }], { context: 'panel' });
  check(e.ok && /passing problem/.test(e.value.message) && !e.value.ppDriveAccess, 'a passing Drive error gets the "try again" message, unmarked', e.ok ? e.value.message : e.error.message);
  h.gas.globals.DriveApp = realDrive;
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
