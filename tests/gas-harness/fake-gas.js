/* =============================================================================
   fake-gas.js  -  a pretend "Google Apps Script", in memory, for tests on a Mac
   =============================================================================

   WHAT THIS FILE IS
     The Partner Pulse back end (apps-script/*.gs in the project) normally runs
     inside Google: it reads and writes Google Sheets, Drive files, Script
     Properties and so on. To test that code on this Mac WITHOUT Google, this
     file imitates exactly the Google services the project is allowed to use
     (the list in docs/control-panel-design.md, section 2). Everything lives in
     memory and disappears when the test ends. Nothing is ever sent to Google.

   HOW TO USE IT
     You normally do not use this file directly: load-gas.js loads it together
     with the .gs files, and run-tests.js / server.js use load-gas.js.
     For a developer:
        const { createFakeGas } = require('./fake-gas');
        const gas = createFakeGas({ realm });   // realm = built-ins of the vm
        gas.globals  -> SpreadsheetApp, DriveApp, ... (installed as globals)
        gas.admin    -> look inside the fake Google (tests use this)
        gas.control  -> steer it (scripted dialog answers, busy lock, clock)

   HOW STRICT IT IS (on purpose)
     - A method that is NOT on the contract's allowed list and NOT implemented
       here throws an Error whose message starts with "[contract]". So if the
       code uses something Google has but the contract does not allow, the
       test fails loudly instead of quietly passing.
     - Things real Google does NOT have are not here either. Example: Google's
       global MimeType list has no JSON, so MimeType.JSON is a [contract]
       error here (the code writes the text 'application/json').
     - A few extra harmless methods ARE implemented (for example
       Sheet.setName). Each use is recorded and listed in the test report
       under "outside the contract's list", so the integrator can decide.
     - The newer Google features the code uses on purpose (21 Oct 2026) are
       imitated as Google documents them:
         * LockService.getDocumentLock: the Sheet's own lock, separate from
           the script lock (each can be made "busy" on its own); it is null
           inside the web app, as Google gives no document lock there;
         * ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL): quiet when
           every permission is granted; with one missing, Google stops the
           run ("Authorization is required...") and shows its permission
           screen. A test can also make it fail in an unexpected way;
         * File.setOwner / Folder.setOwner: hand an item to someone else in
           the same company (the giver keeps edit access). Every hand-over is
           recorded; another company is refused, as Google does;
         * UrlFetchApp.fetch follows redirects (option followRedirects).
       A test can also hide a member (control.hidden) to imitate an older
       Apps Script that does not have it: "name in Service" is then false.
     - It copies Google's real limits and quirks that often break scripts:
         * a new tab has 1000 rows x 26 columns; getRange() outside that grid
           throws "The coordinates of the range are outside the dimensions of
           the sheet." (appendRow grows the grid; insertRowsAfter adds rows);
         * getRange(r, c, 0, n) throws (zero rows), setValues() with the wrong
           number of rows or columns throws;
         * text written to a cell is read like typed input: "123" becomes the
           number 123, "TRUE" becomes true, "2026-10-21" becomes a date, and
           text starting with "=" becomes a formula (unless the cell's number
           format is "@" = plain text, or the text starts with an apostrophe);
         * insertCheckboxes() sets the cells to FALSE (as Google documents);
         * one cell holds at most 50,000 characters;
         * the cache keeps at most 100 KB per value and at most 6 hours;
         * Script Properties keep at most 9 KB per value;
         * TextFinder ignores upper/lower case unless matchCase(true);
         * every call to getSheets()/getRange() returns a NEW object, like Google
           (so comparing two sheet objects with === is always false);
         * getUi() fails inside the public web app (doGet/doPost);
         * DriveApp, UrlFetchApp, openById and create fail inside the simple
           trigger onOpen (Google needs authorisation for those).

   WHAT IT READS
     - apps-script/<name>.html, when the code asks HtmlService for a file.
     - Files under web/ (or any folder you map), when the code fetches a URL
       with UrlFetchApp (for "import from GitHub").
   WHAT IT WRITES
     Nothing on disk. Everything is in memory (server.js can save a copy).

   SAFETY
     Test data only (fake DCs such as DC-DEMO-001). It never contacts Google.
   ============================================================================= */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/gas-harness/)
const { formatJavaDate, wallClockToMs } = require('./lib/java-date-format');

/* ---------------------------------------------------------------------------
   The contract's allowed list: exactly the table of
   docs/control-panel-design.md, section 2, which since 21 Oct 2026 lists
   what the code calls today (keep the two in step: change both together).
   Anything implemented here but NOT in this list counts as "outside the
   contract" and is reported; the static checks (scenario S) fail on a
   service call that is not listed.
   Added on 21 Oct 2026 (the code uses them on purpose; Code.gs header):
   LockService.getDocumentLock, ScriptApp.requireAllScopes with
   ScriptApp.AuthMode.FULL, File.setOwner and Folder.setOwner.
   On the contract's "never use" list, so nothing on them is allowed: the
   global MimeType (Google's has no JSON entry: the 20 Oct publish crash;
   here MimeType.JSON does not exist at all), ScriptApp.getService (often
   the /dev address) and Logger. Methods the code does not call were
   removed on 21 Oct too (for example Sheet.clearContents, Lock.hasLock,
   DriveApp.getRootFolder); the fakes still have them, so a new use shows
   up in the report instead of crashing. This list alone decides what is
   "outside the contract": the "---- outside the contract ----" markers
   inside the fake objects below date from the longer list before 21 Oct.
   --------------------------------------------------------------------------- */
const ALLOWED = {
  SpreadsheetApp: ['getActiveSpreadsheet', 'openById', 'create', 'getUi', 'flush', 'newDataValidation'],
  Spreadsheet: ['getId', 'getUrl', 'getSheetByName', 'getSheets', 'insertSheet', 'deleteSheet', 'getEditors'],
  Sheet: ['getName', 'getRange', 'getLastRow', 'getLastColumn', 'getMaxRows', 'getMaxColumns', 'appendRow',
    'insertRowsAfter', 'insertColumnsAfter', 'deleteColumns', 'setFrozenRows', 'setTabColor', 'setColumnWidth',
    'hideSheet', 'isSheetHidden'],
  Range: ['getValues', 'setValues', 'getValue', 'setValue', 'getRow', 'clearContent', 'setFontWeight', 'setBackground',
    'setNumberFormat', 'setDataValidation', 'setNote', 'insertCheckboxes', 'createTextFinder'],
  TextFinder: ['matchEntireCell', 'findAll'],
  DataValidationBuilder: ['requireValueInList', 'requireCheckbox', 'setAllowInvalid', 'setHelpText', 'build'],
  DataValidation: [],
  Ui: ['createMenu', 'alert', 'prompt', 'showModalDialog', 'ButtonSet', 'Button'],
  'Ui.ButtonSet': ['OK', 'OK_CANCEL', 'YES_NO'],
  'Ui.Button': ['OK', 'YES'],
  Menu: ['addItem', 'addSeparator', 'addToUi'],
  PromptResponse: ['getResponseText', 'getSelectedButton'],
  HtmlService: ['createHtmlOutputFromFile', 'createHtmlOutput'],
  HtmlOutput: ['setWidth', 'setHeight', 'setTitle', 'addMetaTag'],
  DriveApp: ['getFolderById', 'getFileById', 'createFolder'],
  Folder: ['getId', 'getUrl', 'createFolder', 'getFoldersByName', 'createFile', 'addEditors', 'setOwner'],
  FolderIterator: ['hasNext', 'next'],
  File: ['getId', 'getUrl', 'getBlob', 'moveTo', 'setOwner'],
  Blob: ['getDataAsString'],
  CacheService: ['getScriptCache'],
  Cache: ['get', 'getAll', 'put', 'putAll', 'remove'],
  LockService: ['getScriptLock', 'getDocumentLock'],
  Lock: ['tryLock', 'releaseLock'],
  PropertiesService: ['getScriptProperties', 'getUserProperties'],
  Properties: ['getProperty', 'setProperty', 'getProperties', 'deleteProperty'],
  Utilities: ['computeHmacSha256Signature', 'base64EncodeWebSafe', 'base64Decode', 'newBlob', 'getUuid', 'formatDate',
    'Charset'],
  'Utilities.Charset': ['UTF_8'],
  ContentService: ['createTextOutput', 'MimeType'],
  'ContentService.MimeType': ['JSON'],
  TextOutput: ['setMimeType'],
  UrlFetchApp: ['fetch'],
  HTTPResponse: ['getResponseCode', 'getContentText'],
  Session: ['getActiveUser', 'getEffectiveUser'],
  User: ['getEmail'],
  ScriptApp: ['requireAllScopes', 'AuthMode', 'getOAuthToken'],
  'ScriptApp.AuthMode': ['FULL'],
  Service: [],
  MimeType: [],
  console: ['log', 'error'],
  Logger: []
};

// Property names that are never "method calls" (JS internals, JSON, promises).
const SAFE_PROPS = new Set(['toString', 'valueOf', 'toJSON', 'then', 'constructor', 'inspect', 'toLocaleString',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', '__proto__', 'nodeType', 'asymmetricMatch',
  '$$typeof', '@@__IMMUTABLE_ITERABLE__@@', 'length']);

// Apps Script services the contract does NOT allow at all.
const FORBIDDEN_GLOBALS = ['Browser', 'GmailApp', 'MailApp', 'DocumentApp', 'SlidesApp', 'FormApp', 'CalendarApp',
  'Drive', 'Sheets', 'Charts', 'Jdbc', 'XmlService', 'Maps', 'ContactsApp', 'GroupsApp', 'LanguageApp',
  'CardService', 'BigQuery', 'AdminDirectory', 'People', 'Gmail', 'Calendar', 'Docs', 'Slides', 'Forms', 'Tasks',
  'YouTube', 'DataStudioApp', 'SitesApp', 'LinearOptimizationService', 'Analytics', 'ScriptProperties',
  'UserProperties', 'DocsList', 'UiApp', 'SoapService'];

const DEFAULTS = {
  appsScriptDir: path.join(REPO, 'apps-script'),
  urlMap: {
    'https://raw.githubusercontent.com/PranavAkellaPS37/NPS-Form-/main/web/': path.join(REPO, 'web') + '/',
    // GitHub Pages serves the same folder (the Meesho-only survey page fetches index.html from there)
    'https://pranavakellaps37.github.io/NPS-Form-/': path.join(REPO, 'web') + '/'
  },
  scriptUrl: 'https://script.google.com/macros/s/AKfycbFAKE-harness-deployment/exec',
  adminEmail: 'admin@example.com',   // fake admin; override with --user
  ownerEmail: null,                   // who deployed the web app (defaults to adminEmail)
  timeZone: 'Asia/Kolkata',
  locale: 'en_IN',
  coerceText: true,                   // read written text like typed input (Google does)
  checkboxesResetValues: true,        // insertCheckboxes() sets FALSE (Google's documented behaviour)
  maxSleepMs: 20,                     // Utilities.sleep really waits at most this long in tests
  echoConsole: false,                 // also print the code's console.log on this Mac's screen
  webappActiveSpreadsheet: 'bound',   // 'null' = getActiveSpreadsheet() gives null inside doGet/doPost
  enforceValidation: false,           // true = refuse writes that break a "reject input" (setAllowInvalid(false)) rule
  boundSpreadsheetName: 'Valmo Partner Pulse - Control'
};

/* Stored cell values that are not plain JS values. */
class CellDate { constructor(ms) { this.ms = ms; } }
class CellFormula { constructor(text) { this.text = text; } }

function colLetter(c) {
  let s = '';
  let n = c;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function typeLabel(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'Object[]';
  if (isDate(v)) return 'Date';
  if (typeof v === 'string') return 'String';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'Boolean';
  if (typeof v === 'function') return 'Function';
  return '(class)';
}

function createFakeGas(userOptions) {
  const opts = Object.assign({}, DEFAULTS, userOptions || {});
  opts.ownerEmail = opts.ownerEmail || opts.adminEmail;
  // The built-ins (Array, Date, ...) of the code's current JavaScript world.
  // Google gives every execution a fresh world, so load-gas.js switches this
  // with control.setRealm() at the start of each execution.
  let R = opts.realm || { Array, Object, Date, JSON, Error };

  /* -------------------------------------------------------------------------
     Book-keeping: what the code used, what went wrong, what it printed.
     ------------------------------------------------------------------------- */
  const state = {
    uses: new Map(),          // "Sheet.getRange" -> count
    offContract: new Map(),   // "Sheet.setName" -> { count, where }
    violations: [],           // [contract] errors and other contract problems
    warnings: [],             // quirks worth a look (e.g. a date written as text)
    logs: [],                 // console.log / console.error of the code
    executions: [],           // finished executions (most recent last, capped)
    current: null             // the execution running now
  };
  const control = {
    context: 'editor',
    users: { active: opts.adminEmail, effective: opts.adminEmail },
    // busy = another execution holds the SCRIPT lock (partners' answers);
    // documentBusy = another execution holds the Sheet's DOCUMENT lock (an admin);
    // noDocument = Google gives no document lock at all (getDocumentLock() is null);
    // beforeTryLock = a test's (kind, ms) => {...}, run at the start of every tryLock,
    // to imitate another request finishing something while this one waits (26 Oct 2026)
    lock: { busy: false, documentBusy: false, noDocument: false, beforeTryLock: null },
    clockOffsetMs: 0,
    ui: { queue: [], policy: 'accept' },
    fetchRoutes: [],          // [{ prefix, response }] checked before the url map
    scriptUrl: opts.scriptUrl,
    // Members to hide, as "Service.member" (for example "ScriptApp.requireAllScopes"):
    // imitates an older Apps Script without them ("name in Service" is false).
    hidden: new Set(),
    // ScriptApp.requireAllScopes: missing = a permission was left unticked (Google
    // stops the run and shows its permission screen); error = it fails with this text.
    consent: { missing: false, error: null, stopMessage: 'Authorization is required to perform that action.' },
    // File/Folder.setOwner refused: a text, or (item, toEmail) => text or null.
    ownerTransferError: null,
    // A passing Google Drive problem: (item, activeUser, method) => error text or null.
    driveError: null
  };

  function now() { return Date.now() + control.clockOffsetMs; }

  function where() {
    const stack = String(new Error().stack || '').split('\n');
    const line = stack.find((l) => /\.(gs|html)[:)]/.test(l) || /\.gs:\d+/.test(l));
    return line ? line.trim().replace(/^at\s+/, '') : '(not inside a .gs file)';
  }

  let quiet = 0;   // > 0 while the harness itself writes (admin helpers): no warnings then
  function warn(text) {
    if (quiet > 0) return;
    const entry = { text, where: where(), fn: state.current ? state.current.fn : null };
    state.warnings.push(entry);
    if (state.current) state.current.warnings.push(entry);
  }

  function gasError(message) {
    const e = new R.Error(message);
    e.name = 'Exception';
    return e;
  }

  function contractError(member, extra) {
    const message = `[contract] ${member} is not available. It is not on the list of allowed Apps Script ` +
      `methods (docs/control-panel-design.md, section 2)${extra ? ' ' + extra : ''}. Use an allowed method ` +
      'instead, or extend the contract and this test harness together.';
    const e = new R.Error(message);
    e.name = 'ContractError';
    const entry = { member, message, where: where(), fn: state.current ? state.current.fn : null };
    state.violations.push(entry);
    if (state.current) state.current.violations.push(entry);
    return e;
  }

  function paramsError(method, args) {
    return gasError(`The parameters (${Array.from(args).map(typeLabel).join(',')}) don't match the method ` +
      `signature for ${method}.`);
  }

  function noteUse(type, member) {
    const key = type + '.' + member;
    state.uses.set(key, (state.uses.get(key) || 0) + 1);
    if (state.current) state.current.uses.set(key, (state.current.uses.get(key) || 0) + 1);
    const allowed = ALLOWED[type];
    if (allowed && allowed.indexOf(member) === -1) {
      const rec = state.offContract.get(key) || { count: 0, where: where(), fns: new Set() };
      rec.count += 1;
      if (state.current) rec.fns.add(state.current.fn);
      state.offContract.set(key, rec);
    }
  }

  /* A member a test has hidden (control.hidden), to imitate an older Apps
     Script that does not have it. */
  function isHidden(type, prop) {
    return typeof prop === 'string' && control.hidden.size > 0 && control.hidden.has(`${type}.${prop}`);
  }

  /* Wrap an object so that every unknown property throws a [contract] error.
     Known members are counted (and flagged when outside the contract).
     explain: { member: 'why' } adds an explanation to the [contract] error of
     a member that real Google does not have either (for example MimeType.JSON).
     A hidden member (control.hidden) is simply absent, as on an older Apps
     Script: "name in object" is false and reading it gives undefined. */
  function strictObject(type, impl, explain) {
    return new Proxy(impl, {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol' || SAFE_PROPS.has(prop)) return Reflect.get(target, prop, receiver);
        if (isHidden(type, prop)) return undefined;
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
          noteUse(type, prop);
          return target[prop];
        }
        throw contractError(`${type}.${String(prop)}`, explain && explain[prop]);
      },
      has(target, prop) {
        if (isHidden(type, prop)) return false;
        return Reflect.has(target, prop);
      },
      set(target, prop, value) {
        warn(`The code set a property "${String(prop)}" on a ${type} object (Apps Script objects do not keep these).`);
        target[prop] = value;
        return true;
      }
    });
  }

  function realmArray(list) {
    const a = new R.Array();
    for (const x of list) a.push(x);
    return a;
  }

  function toRealm(value) {
    if (value === undefined) return undefined;
    return R.JSON.parse(JSON.stringify(value));
  }

  function requireContext(what, scope) {
    if (control.context === 'simpleTrigger') {
      throw gasError(`You do not have permission to call ${what}. Required permissions: ${scope}`);
    }
  }

  /* -------------------------------------------------------------------------
     IDs and URLs (fake, but shaped like Google's)
     ------------------------------------------------------------------------- */
  let idCounter = 0;
  function newId(kind) {
    idCounter += 1;
    const base = `1Fake${kind}${String(idCounter).padStart(4, '0')}`;
    const length = kind === 'Folder' ? 33 : 44;
    return (base + '_harnessIdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').slice(0, length);
  }
  const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;
  const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
  const sheetFileUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit?usp=drivesdk`;
  const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

  /* =========================================================================
     DRIVE (folders and files)
     ========================================================================= */
  // Every Drive item has an owner: whoever's account created it (inside the
  // web app, the account that deployed it). handovers lists every setOwner.
  const drive = { items: new Map(), rootId: '0AFakeRootFolder_harness', handovers: [] };
  drive.items.set(drive.rootId, { id: drive.rootId, kind: 'folder', name: 'My Drive', parentId: null,
    mimeType: 'application/vnd.google-apps.folder', created: now(), updated: now(), owner: opts.adminEmail, editors: [] });

  const unwrapFolder = new WeakMap();
  const unwrapFile = new WeakMap();
  const unwrapBlob = new WeakMap();
  const unwrapUser = new WeakMap();

  function driveItem(id, kind, method) {
    const item = typeof id === 'string' ? drive.items.get(id) : null;
    // control.denyDrive(item, activeUser) -> true imitates "this person has no access"
    const denied = item && typeof control.denyDrive === 'function' && control.denyDrive(item, control.users.active);
    if (!item || denied || (kind && item.kind !== kind)) {
      throw gasError('No item with the given ID could be found. Or perhaps you do not have permission to access it.');
    }
    // control.driveError(item, activeUser, method) -> text imitates a passing Google Drive problem
    const failure = typeof control.driveError === 'function' ? control.driveError(item, control.users.active, method) : null;
    if (failure) throw gasError(String(failure));
    return item;
  }

  function addDriveItem(fields) {
    const item = Object.assign({ created: now(), updated: now(),
      owner: control.users.effective || opts.adminEmail, editors: [] }, fields);
    drive.items.set(item.id, item);
    return item;
  }

  const domainOf = (email) => String(email || '').toLowerCase().split('@')[1] || '';

  /* File.setOwner / Folder.setOwner, as Google documents them: the item gets
     a new owner and the previous owner keeps edit access. Only the owner can
     give an item away, and (in a Google Workspace company) only to someone of
     the same company. control.ownerTransferError makes Google refuse. */
  function setOwnerOf(item, who, method, proxy) {
    requireContext(method, 'https://www.googleapis.com/auth/drive');
    const email = typeof who === 'string' ? who : unwrapUser.get(who);
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(email)) throw paramsError(method, [who]);
    const by = control.users.effective || '';
    const refusal = typeof control.ownerTransferError === 'function' ? control.ownerTransferError(item, email)
      : control.ownerTransferError;
    if (refusal) throw gasError(String(refusal));
    if (String(item.owner || '').toLowerCase() !== by.toLowerCase()) {
      throw gasError(`[harness] Only the owner of "${item.name}" (${item.owner}) can give it to someone else; ` +
        `this run works as ${by || 'nobody'}. Google refuses this too.`);
    }
    if (domainOf(email) !== domainOf(item.owner)) {
      throw gasError(`[harness] Google refuses to hand "${item.name}" from ${item.owner} to ${email}: ownership ` +
        'can only go to someone in the same company (Google Workspace domain) as the current owner.');
    }
    const from = item.owner;
    item.editors = Array.from(new Set((item.editors || []).concat([from])));
    item.owner = email;
    item.updated = now();
    const record = { id: item.id, name: item.name, kind: item.kind, path: drivePath(item.id), from, to: email,
      fn: state.current ? state.current.fn : null };
    drive.handovers.push(record);
    if (state.current) state.current.handovers.push(record);
    return proxy;
  }

  function drivePath(id) {
    const parts = [];
    let item = drive.items.get(id);
    while (item && item.parentId) {
      parts.unshift(item.name);
      item = drive.items.get(item.parentId);
    }
    return parts.join('/');
  }

  function wrapFolder(item) {
    const impl = {
      getId: () => item.id,
      getUrl: () => folderUrl(item.id),
      getName: () => item.name,
      createFolder: (name) => {
        requireContext('DriveApp.Folder.createFolder', 'https://www.googleapis.com/auth/drive');
        if (typeof name !== 'string' || !name) throw paramsError('DriveApp.Folder.createFolder', [name]);
        return wrapFolder(addDriveItem({ id: newId('Folder'), kind: 'folder', name, parentId: item.id,
          mimeType: 'application/vnd.google-apps.folder' }));
      },
      createFile: (...args) => {
        requireContext('DriveApp.Folder.createFile', 'https://www.googleapis.com/auth/drive');
        return wrapFile(createFileIn(item, args));
      },
      getFoldersByName: (name) => {
        requireContext('DriveApp.Folder.getFoldersByName', 'https://www.googleapis.com/auth/drive');
        if (typeof name !== 'string') throw paramsError('DriveApp.Folder.getFoldersByName', [name]);
        const found = Array.from(drive.items.values()).filter((x) => x.kind === 'folder' && x.parentId === item.id &&
          x.name === name);
        return makeIterator('FolderIterator', found.map(wrapFolder));
      },
      addEditors: (emails) => {
        requireContext('DriveApp.Folder.addEditors', 'https://www.googleapis.com/auth/drive');
        if (!Array.isArray(emails)) throw paramsError('DriveApp.Folder.addEditors', [emails]);
        item.editors = Array.from(new Set((item.editors || []).concat(emails.map(String))));
        return proxy;
      },
      setOwner: (who) => setOwnerOf(item, who, 'DriveApp.Folder.setOwner', proxy),
      // ---- outside the contract (recorded) ----
      getFilesByName: (name) => makeIterator('FileIterator', Array.from(drive.items.values())
        .filter((x) => x.kind === 'file' && x.parentId === item.id && x.name === name).map(wrapFile)),
      getFiles: () => makeIterator('FileIterator', Array.from(drive.items.values())
        .filter((x) => x.kind === 'file' && x.parentId === item.id).map(wrapFile)),
      getFolders: () => makeIterator('FolderIterator', Array.from(drive.items.values())
        .filter((x) => x.kind === 'folder' && x.parentId === item.id).map(wrapFolder)),
      getParents: () => makeIterator('FolderIterator', item.parentId ? [wrapFolder(drive.items.get(item.parentId))] : []),
      setName: (name) => { item.name = String(name); item.updated = now(); return proxy; },
      toString: () => item.name
    };
    const proxy = strictObject('Folder', impl);
    unwrapFolder.set(proxy, item);
    return proxy;
  }

  function createFileIn(folder, args) {
    let name;
    let bytes;
    let mimeType;
    if (args.length === 1) {
      const blob = unwrapBlob.get(args[0]);
      if (!blob) throw paramsError('DriveApp.Folder.createFile', args);
      if (!blob.name) throw gasError('Blob object must have non-null name for this operation.');
      name = blob.name;
      bytes = Buffer.from(blob.bytes);
      mimeType = blob.contentType || 'application/octet-stream';
    } else if (args.length === 2 || args.length === 3) {
      if (typeof args[0] !== 'string' || typeof args[1] !== 'string') throw paramsError('DriveApp.Folder.createFile', args);
      if (args.length === 3 && typeof args[2] !== 'string') {
        throw gasError('createFile(name, content, mimeType): mimeType must be text such as "application/json". ' +
          '(Google\'s MimeType list has no JSON entry, and ContentService.MimeType values do not work here.)');
      }
      name = args[0];
      bytes = Buffer.from(args[1], 'utf8');
      mimeType = args.length === 3 ? args[2] : 'text/plain';
      if (/^application\/vnd\.google-apps\./.test(mimeType)) {
        throw gasError('Invalid argument: file.contentType (a Google Docs/Sheets type cannot be created from text).');
      }
    } else {
      throw paramsError('DriveApp.Folder.createFile', args);
    }
    if (bytes.length > 50 * 1024 * 1024) throw gasError('File size exceeds the maximum allowed (50 MB).');
    return addDriveItem({ id: newId('File'), kind: 'file', name, parentId: folder.id, mimeType, bytes });
  }

  function wrapFile(item) {
    const isSheet = item.mimeType === 'application/vnd.google-apps.spreadsheet';
    const impl = {
      getId: () => item.id,
      getUrl: () => (isSheet ? sheetFileUrl(item.id) : fileUrl(item.id)),
      getName: () => item.name,
      getBlob: () => {
        if (isSheet) throw gasError('[harness] getBlob() of a Google Sheet (a PDF export) is not supported.');
        return makeBlob(Buffer.from(item.bytes), item.mimeType, item.name);
      },
      setContent: (text) => {
        if (isSheet) throw gasError('Cannot set the content of a Google Sheets file.');
        if (typeof text !== 'string') throw paramsError('DriveApp.File.setContent', [text]);
        const bytes = Buffer.from(text, 'utf8');
        if (bytes.length > 10 * 1024 * 1024) throw gasError('File content exceeds the 10 MB limit of setContent.');
        item.bytes = bytes;
        item.updated = now();
        return proxy;
      },
      moveTo: (folderProxy) => {
        requireContext('DriveApp.File.moveTo', 'https://www.googleapis.com/auth/drive');
        const folder = unwrapFolder.get(folderProxy);
        if (!folder) throw paramsError('DriveApp.File.moveTo', [folderProxy]);
        item.parentId = folder.id;
        item.updated = now();
        return proxy;
      },
      setOwner: (who) => setOwnerOf(item, who, 'DriveApp.File.setOwner', proxy),
      // ---- outside the contract (recorded) ----
      getMimeType: () => item.mimeType,
      getSize: () => (item.bytes ? item.bytes.length : 0),
      getLastUpdated: () => new R.Date(item.updated),
      getDateCreated: () => new R.Date(item.created),
      setName: (name) => { item.name = String(name); item.updated = now(); return proxy; },
      getParents: () => makeIterator('FolderIterator', item.parentId ? [wrapFolder(drive.items.get(item.parentId))] : []),
      toString: () => item.name
    };
    const proxy = strictObject('File', impl);
    unwrapFile.set(proxy, item);
    return proxy;
  }

  function makeIterator(type, list) {
    let i = 0;
    return strictObject(type, {
      hasNext: () => i < list.length,
      next: () => {
        if (i >= list.length) throw gasError('Cannot retrieve the next object: iterator has reached the end.');
        return list[i++];
      },
      getContinuationToken: () => null,
      toString: () => type
    });
  }

  const DriveApp = strictObject('DriveApp', {
    getFolderById: (id) => {
      requireContext('DriveApp.getFolderById', 'https://www.googleapis.com/auth/drive');
      return wrapFolder(driveItem(id, 'folder', 'getFolderById'));
    },
    getFileById: (id) => {
      requireContext('DriveApp.getFileById', 'https://www.googleapis.com/auth/drive');
      return wrapFile(driveItem(id, 'file', 'getFileById'));
    },
    createFolder: (name) => {
      requireContext('DriveApp.createFolder', 'https://www.googleapis.com/auth/drive');
      if (typeof name !== 'string' || !name) throw paramsError('DriveApp.createFolder', [name]);
      return wrapFolder(addDriveItem({ id: newId('Folder'), kind: 'folder', name, parentId: drive.rootId,
        mimeType: 'application/vnd.google-apps.folder' }));
    },
    getRootFolder: () => {
      requireContext('DriveApp.getRootFolder', 'https://www.googleapis.com/auth/drive');
      return wrapFolder(drive.items.get(drive.rootId));
    },
    toString: () => 'DriveApp'
  });

  /* =========================================================================
     SPREADSHEETS
     ========================================================================= */
  const books = new Map();      // id -> book
  let boundId = null;
  let sheetIdCounter = 100;

  class SheetModel {
    constructor(book, name, rows, cols) {
      this.book = book;
      this.name = name;
      this.sheetId = (sheetIdCounter += 1);
      this.maxRows = rows;
      this.maxCols = cols;
      this.rows = [];            // rows[r-1][c-1] = stored value; missing = empty
      this.fmt = new Map();      // "r:c" -> { numberFormat, fontWeight, background, fontColor, wrap }
      this.notes = new Map();    // "r:c" -> note text
      this.rules = new Map();    // "r:c" -> data validation rule
      this.frozenRows = 0;
      this.frozenCols = 0;
      this.hidden = false;
      this.tabColor = null;
      this.colWidths = {};
      this.deleted = false;
    }

    get(r, c) {
      const row = this.rows[r - 1];
      if (!row) return '';
      const v = row[c - 1];
      return v === undefined ? '' : v;
    }

    setRaw(r, c, v) {
      let row = this.rows[r - 1];
      if (!row) {
        if (v === '') return;
        row = this.rows[r - 1] = [];
      }
      row[c - 1] = v;
    }

    lastRow() {
      for (let r = this.rows.length; r >= 1; r -= 1) {
        const row = this.rows[r - 1];
        if (row && row.some((v) => v !== '' && v !== undefined)) return r;
      }
      return 0;
    }

    lastCol() {
      let last = 0;
      for (const row of this.rows) {
        if (!row) continue;
        for (let c = row.length; c > last; c -= 1) {
          if (row[c - 1] !== '' && row[c - 1] !== undefined) { last = c; break; }
        }
      }
      return last;
    }

    fmtOf(r, c) { return this.fmt.get(r + ':' + c) || {}; }

    setFmt(r, c, prop, value) {
      const key = r + ':' + c;
      const f = Object.assign({}, this.fmt.get(key));
      if (value === null || value === undefined) delete f[prop];
      else f[prop] = value;
      if (Object.keys(f).length) this.fmt.set(key, f);
      else this.fmt.delete(key);
    }

    /* Move format/note/validation maps when rows are inserted or deleted. */
    shiftRows(fromRow, delta) {
      for (const name of ['fmt', 'notes', 'rules']) {
        const next = new Map();
        for (const [key, value] of this[name]) {
          const [r, c] = key.split(':').map(Number);
          if (r < fromRow) next.set(key, value);
          else if (delta < 0 && r < fromRow - delta) continue;      // deleted rows
          else next.set((r + delta) + ':' + c, value);
        }
        this[name] = next;
      }
    }

    insertRowsAfter(after, count) {
      if (after < this.rows.length) this.rows.splice(after, 0, ...new Array(count));
      this.shiftRows(after + 1, count);
      // New rows look like the row above them (Google copies the formatting).
      if (after >= 1) {
        for (let c = 1; c <= this.maxCols; c += 1) {
          const f = this.fmt.get(after + ':' + c);
          const rule = this.rules.get(after + ':' + c);
          for (let r = after + 1; r <= after + count; r += 1) {
            if (f) this.fmt.set(r + ':' + c, Object.assign({}, f));
            if (rule) this.rules.set(r + ':' + c, rule);
          }
        }
      }
      this.maxRows += count;
    }

    deleteRows(position, count) {
      this.rows.splice(position - 1, count);
      this.shiftRows(position + count, -count);
      this.maxRows -= count;
    }
  }

  function makeBook(name, rows, cols, parentId) {
    const id = newId('Sheet');
    const book = { id, name, sheets: [] };
    book.sheets.push(new SheetModel(book, 'Sheet1', rows || 1000, cols || 26));
    books.set(id, book);
    addDriveItem({ id, kind: 'file', name, parentId: parentId || drive.rootId,
      mimeType: 'application/vnd.google-apps.spreadsheet', bytes: null, isSheet: true });
    return book;
  }

  boundId = makeBook(opts.boundSpreadsheetName).id;

  /* ---- Turning a written value into what Google stores ---------------------- */
  function parseTyped(text, r, c, sheet) {
    if (text.startsWith("'")) return text.slice(1);           // apostrophe = keep as text
    if (text.length > 1 && text.startsWith('=')) {
      warn(`Text written to ${sheet.name}!${colLetter(c)}${r} starts with "=", so Google Sheets turns it into a ` +
        `formula (it shows #ERROR!). Text: ${JSON.stringify(text.slice(0, 60))}`);
      return new CellFormula(text);
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
    if (/^[+-]?(\d+\.?\d*|\.\d+)%$/.test(text)) return Number(text.slice(0, -1)) / 100;
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        warn(`Text written to ${sheet.name}!${colLetter(c)}${r} looks like a date (${text}), so Google Sheets stores ` +
          'a DATE, and getValues() returns a Date object (not text).');
        return new CellDate(wallClockToMs(opts.timeZone, y, mo, d, Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)));
      }
    }
    m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
      warn(`Text written to ${sheet.name}!${colLetter(c)}${r} looks like a time (${text}); Google Sheets stores a time.`);
      return new CellDate(wallClockToMs(opts.timeZone, 1899, 12, 30, Number(m[1]), Number(m[2]), Number(m[3] || 0)));
    }
    return text;
  }

  function storeValue(value, sheet, r, c) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        warn(`The number ${value} was written to ${sheet.name}!${colLetter(c)}${r}; Google Sheets shows #NUM!.`);
        return '#NUM!';
      }
      return value;
    }
    if (isDate(value)) {
      const ms = value.getTime();
      if (Number.isNaN(ms)) throw gasError('Invalid date written to a cell.');
      return new CellDate(ms);
    }
    if (typeof value === 'string') {
      if (value.length > 50000) {
        throw gasError('Your input contains more than the maximum of 50000 characters in a single cell.');
      }
      const format = sheet.fmtOf(r, c).numberFormat;
      if (!opts.coerceText || format === '@' || value === '') return value;
      return parseTyped(value, r, c, sheet);
    }
    throw gasError(`[harness] A cell value must be text, a number, true/false, a date or empty, but ` +
      `${sheet.name}!${colLetter(c)}${r} was given ${Array.isArray(value) ? 'a list' : typeof value}. ` +
      '(Did you forget JSON.stringify or String()?)');
  }

  function displayOf(v) {
    if (v === '') return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
    if (v instanceof CellDate) {
      const withTime = formatJavaDate(v.ms, opts.timeZone, 'HH:mm:ss').text !== '00:00:00';
      return formatJavaDate(v.ms, opts.timeZone, withTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd').text;
    }
    if (v instanceof CellFormula) return '#ERROR!';
    return String(v);
  }

  function valueForCode(v) {
    if (v instanceof CellDate) return new R.Date(v.ms);
    if (v instanceof CellFormula) return '#ERROR!';
    return v;
  }

  function checkRule(sheet, r, c, stored) {
    // Data validation is recorded; refusing invalid writes is optional (enforceValidation).
    if (!opts.enforceValidation) return;
    const rule = sheet.rules.get(r + ':' + c);
    if (!rule || rule.allowInvalid !== false || stored === '') return;
    let ok = true;
    if (rule.type === 'checkbox') ok = typeof stored === 'boolean';
    else if (rule.type === 'list') ok = rule.list.indexOf(displayOf(stored)) !== -1;
    if (!ok) {
      throw gasError(`The data you entered in cell ${colLetter(c)}${r} violates the data validation rules set on this cell.`);
    }
  }

  function noteWrite(sheet, kind) {
    if (!state.current) return;
    const key = sheet.book.name + ' / ' + sheet.name;
    const w = state.current.writes.get(key) || { setValues: 0, setValue: 0, appendRow: 0 };
    w[kind] += 1;
    state.current.writes.set(key, w);
  }

  const unwrapSheet = new WeakMap();
  const unwrapRule = new WeakMap();
  const unwrapOutput = new WeakMap();

  function ensureLive(sheet) {
    if (sheet.deleted) throw gasError(`The sheet "${sheet.name}" has been deleted.`);
  }

  /* ---- Range ---------------------------------------------------------------- */
  function wrapRange(sheet, r, c, nr, nc) {
    const cells = (fn) => {
      for (let i = 0; i < nr; i += 1) for (let j = 0; j < nc; j += 1) fn(r + i, c + j, i, j);
    };
    const writeAll = (values, kind) => {
      ensureLive(sheet);
      const stored = values.map((row, i) => row.map((v, j) => storeValue(v, sheet, r + i, c + j)));
      stored.forEach((row, i) => row.forEach((v, j) => checkRule(sheet, r + i, c + j, v)));
      stored.forEach((row, i) => row.forEach((v, j) => sheet.setRaw(r + i, c + j, v)));
      noteWrite(sheet, kind);
    };
    const fmtAll = (prop, value) => { ensureLive(sheet); cells((rr, cc) => sheet.setFmt(rr, cc, prop, value)); return proxy; };
    const impl = {
      getValues: () => {
        ensureLive(sheet);
        const out = new R.Array();
        for (let i = 0; i < nr; i += 1) {
          const row = new R.Array();
          for (let j = 0; j < nc; j += 1) row.push(valueForCode(sheet.get(r + i, c + j)));
          out.push(row);
        }
        return out;
      },
      setValues: (values) => {
        if (!Array.isArray(values)) throw paramsError('SpreadsheetApp.Range.setValues', [values]);
        if (values.length !== nr) {
          throw gasError(`The number of rows in the data does not match the number of rows in the range. ` +
            `The data has ${values.length} but the range has ${nr}.`);
        }
        for (const row of values) {
          if (!Array.isArray(row)) throw paramsError('SpreadsheetApp.Range.setValues', [values]);
          if (row.length !== nc) {
            throw gasError(`The number of columns in the data does not match the number of columns in the range. ` +
              `The data has ${row.length} but the range has ${nc}.`);
          }
        }
        writeAll(Array.from(values, (row) => Array.from(row)), 'setValues');
        return proxy;
      },
      getValue: () => { ensureLive(sheet); return valueForCode(sheet.get(r, c)); },
      setValue: (value) => {
        if (Array.isArray(value)) {
          throw gasError('[harness] setValue() was given a list. Use setValues([[...]]) for several cells.');
        }
        const grid = [];
        for (let i = 0; i < nr; i += 1) grid.push(new Array(nc).fill(value));
        writeAll(grid, 'setValue');
        return proxy;
      },
      getRow: () => r,
      getColumn: () => c,
      getNumRows: () => nr,
      clearContent: () => { ensureLive(sheet); cells((rr, cc) => sheet.setRaw(rr, cc, '')); return proxy; },
      setFontWeight: (w) => {
        if (w !== null && w !== 'bold' && w !== 'normal') throw gasError(`Invalid font weight "${w}" (use "bold" or "normal").`);
        return fmtAll('fontWeight', w);
      },
      setBackground: (color) => fmtAll('background', color),
      setFontColor: (color) => fmtAll('fontColor', color),
      setWrap: (wrap) => fmtAll('wrap', !!wrap),
      setNumberFormat: (format) => {
        if (typeof format !== 'string') throw paramsError('SpreadsheetApp.Range.setNumberFormat', [format]);
        return fmtAll('numberFormat', format);
      },
      setDataValidation: (rule) => {
        ensureLive(sheet);
        if (rule === null) { cells((rr, cc) => sheet.rules.delete(rr + ':' + cc)); return proxy; }
        const model = unwrapRule.get(rule);
        if (!model) {
          throw gasError('The parameters (' + typeLabel(rule) + ") don't match the method signature for " +
            'SpreadsheetApp.Range.setDataValidation. (Did you forget .build() on the rule builder?)');
        }
        cells((rr, cc) => sheet.rules.set(rr + ':' + cc, model));
        return proxy;
      },
      setNote: (note) => {
        ensureLive(sheet);
        cells((rr, cc) => { if (note === null || note === '') sheet.notes.delete(rr + ':' + cc); else sheet.notes.set(rr + ':' + cc, String(note)); });
        return proxy;
      },
      insertCheckboxes: (...args) => {
        ensureLive(sheet);
        if (args.length) warn('insertCheckboxes() was called with custom values; the contract uses plain checkboxes.');
        const rule = { type: 'checkbox', allowInvalid: true, fromInsertCheckboxes: true };
        cells((rr, cc) => {
          sheet.rules.set(rr + ':' + cc, rule);
          const v = sheet.get(rr, cc);
          if (opts.checkboxesResetValues || typeof v !== 'boolean') sheet.setRaw(rr, cc, false);
        });
        return proxy;
      },
      createTextFinder: (text) => makeTextFinder(sheet, r, c, nr, nc, text),
      // ---- outside the contract (recorded) ----
      getNumColumns: () => nc,
      getLastRow: () => r + nr - 1,
      getLastColumn: () => c + nc - 1,
      getSheet: () => wrapSheet(sheet),
      getA1Notation: () => (nr === 1 && nc === 1 ? `${colLetter(c)}${r}` : `${colLetter(c)}${r}:${colLetter(c + nc - 1)}${r + nr - 1}`),
      getDisplayValues: () => {
        const out = new R.Array();
        for (let i = 0; i < nr; i += 1) {
          const row = new R.Array();
          for (let j = 0; j < nc; j += 1) row.push(displayOf(sheet.get(r + i, c + j)));
          out.push(row);
        }
        return out;
      },
      getDisplayValue: () => displayOf(sheet.get(r, c)),
      getNote: () => sheet.notes.get(r + ':' + c) || '',
      getBackground: () => sheet.fmtOf(r, c).background || '#ffffff',
      getFontWeight: () => sheet.fmtOf(r, c).fontWeight || 'normal',
      getNumberFormat: () => sheet.fmtOf(r, c).numberFormat || 'General',
      getDataValidation: () => {
        const rule = sheet.rules.get(r + ':' + c);
        return rule ? makeRuleObject(rule) : null;
      },
      offset: (dr, dc, nr2, nc2) => makeRange(sheet, [r + dr, c + dc, nr2 === undefined ? nr : nr2, nc2 === undefined ? nc : nc2], 'Range.offset'),
      getCell: (i, j) => makeRange(sheet, [r + i - 1, c + j - 1, 1, 1], 'Range.getCell'),
      activate: () => proxy,
      isChecked: () => (sheet.get(r, c) === true),
      toString: () => 'Range'
    };
    const proxy = strictObject('Range', impl);
    return proxy;
  }

  function makeRange(sheet, args, method) {
    ensureLive(sheet);
    if (args.length === 1 && typeof args[0] === 'string') {
      throw contractError(`Sheet.getRange("${args[0]}")`, '(A1 notation such as "A1:C3" is not used by this ' +
        'project: use getRange(row, column, numRows, numColumns))');
    }
    if (args.length < 2 || args.length > 4 || args.some((a) => typeof a !== 'number')) {
      throw paramsError(`SpreadsheetApp.Sheet.${method}`, args);
    }
    const [row, col, nr = 1, nc = 1] = args;
    for (const value of [row, col, nr, nc]) {
      if (!Number.isInteger(value)) throw gasError(`[harness] getRange() was given ${value}, which is not a whole number.`);
    }
    if (row < 1) throw gasError('The starting row of the range is too small.');
    if (col < 1) throw gasError('The starting column of the range is too small.');
    if (nr < 1) throw gasError('The number of rows in the range must be at least 1.');
    if (nc < 1) throw gasError('The number of columns in the range must be at least 1.');
    if (row + nr - 1 > sheet.maxRows || col + nc - 1 > sheet.maxCols) {
      throw gasError('The coordinates of the range are outside the dimensions of the sheet.');
    }
    return wrapRange(sheet, row, col, nr, nc);
  }

  /* ---- TextFinder --------------------------------------------------------- */
  function makeTextFinder(sheet, r, c, nr, nc, text) {
    if (text === null || text === undefined || String(text) === '') {
      throw gasError('Invalid argument: findText (the text to find is empty).');
    }
    const wanted = String(text);
    const opt = { entire: false, matchCase: false, regex: false };
    let cursor = -1;
    const order = () => {
      const lastR = Math.min(r + nr - 1, Math.max(sheet.lastRow(), 0));
      const list = [];
      for (let rr = r; rr <= lastR; rr += 1) for (let cc = c; cc < c + nc; cc += 1) list.push([rr, cc]);
      return list;
    };
    const matches = (rr, cc) => {
      let shown = displayOf(sheet.get(rr, cc));
      if (shown === '') return false;
      if (opt.regex) {
        const re = new RegExp(opt.entire ? `^(?:${wanted})$` : wanted, opt.matchCase ? '' : 'i');
        return re.test(shown);
      }
      let target = wanted;
      if (!opt.matchCase) { shown = shown.toLowerCase(); target = target.toLowerCase(); }
      return opt.entire ? shown === target : shown.indexOf(target) !== -1;
    };
    const impl = {
      matchEntireCell: (b) => { opt.entire = !!b; return proxy; },
      findAll: () => realmArray(order().filter(([rr, cc]) => matches(rr, cc)).map(([rr, cc]) => wrapRange(sheet, rr, cc, 1, 1))),
      findNext: () => {
        ensureLive(sheet);
        const list = order();
        for (let i = cursor + 1; i < list.length; i += 1) {
          if (matches(list[i][0], list[i][1])) { cursor = i; return wrapRange(sheet, list[i][0], list[i][1], 1, 1); }
        }
        return null;
      },
      // ---- outside the contract (recorded) ----
      matchCase: (b) => { opt.matchCase = !!b; return proxy; },
      useRegularExpression: (b) => { opt.regex = !!b; return proxy; },
      ignoreDiacritics: () => proxy,
      matchFormulaText: () => proxy,
      toString: () => 'TextFinder'
    };
    const proxy = strictObject('TextFinder', impl);
    return proxy;
  }

  /* ---- Data validation ---------------------------------------------------- */
  function makeRuleObject(rule) {
    const impl = {
      getCriteriaType: () => (rule.type === 'checkbox' ? 'CHECKBOX' : 'VALUE_IN_LIST'),
      getCriteriaValues: () => realmArray(rule.type === 'list' ? [realmArray(rule.list), rule.showDropdown] : []),
      getHelpText: () => rule.helpText || '',
      getAllowInvalid: () => rule.allowInvalid !== false,
      toString: () => 'DataValidation'
    };
    const proxy = strictObject('DataValidation', impl);
    unwrapRule.set(proxy, rule);
    return proxy;
  }

  function newValidationBuilder() {
    const rule = { type: null, list: null, showDropdown: true, allowInvalid: true, helpText: '' };
    const impl = {
      requireValueInList: (list, showDropdown) => {
        if (!Array.isArray(list)) throw paramsError('SpreadsheetApp.DataValidationBuilder.requireValueInList', [list, showDropdown]);
        rule.type = 'list';
        rule.list = Array.from(list, (x) => String(x));
        rule.showDropdown = showDropdown !== false;
        return proxy;
      },
      requireCheckbox: (...args) => {
        if (args.length) warn('requireCheckbox() was given custom values; the contract uses plain TRUE/FALSE checkboxes.');
        rule.type = 'checkbox';
        return proxy;
      },
      setAllowInvalid: (b) => { rule.allowInvalid = !!b; return proxy; },
      setHelpText: (text) => { rule.helpText = String(text); return proxy; },
      build: () => {
        if (!rule.type) throw gasError('[harness] build() was called before choosing a rule (requireValueInList or requireCheckbox).');
        return makeRuleObject(Object.assign({}, rule));
      },
      toString: () => 'DataValidationBuilder'
    };
    const proxy = strictObject('DataValidationBuilder', impl);
    return proxy;
  }

  /* ---- Sheet ---------------------------------------------------------------- */
  function wrapSheet(sheet) {
    const book = sheet.book;
    const impl = {
      getName: () => sheet.name,
      getRange: (...args) => makeRange(sheet, args, 'getRange'),
      getDataRange: () => {
        ensureLive(sheet);
        return wrapRange(sheet, 1, 1, Math.max(sheet.lastRow(), 1), Math.max(sheet.lastCol(), 1));
      },
      getLastRow: () => { ensureLive(sheet); return sheet.lastRow(); },
      getLastColumn: () => { ensureLive(sheet); return sheet.lastCol(); },
      getMaxRows: () => { ensureLive(sheet); return sheet.maxRows; },
      appendRow: (values) => {
        ensureLive(sheet);
        if (!Array.isArray(values)) throw paramsError('SpreadsheetApp.Sheet.appendRow', [values]);
        if (!values.length) { warn('appendRow([]) was called with an empty row; nothing was added.'); return proxy; }
        const row = sheet.lastRow() + 1;
        if (row > sheet.maxRows) sheet.insertRowsAfter(sheet.maxRows, row - sheet.maxRows);
        if (values.length > sheet.maxCols) sheet.maxCols = values.length;
        const stored = Array.from(values, (v, j) => storeValue(v, sheet, row, j + 1));
        stored.forEach((v, j) => checkRule(sheet, row, j + 1, v));
        stored.forEach((v, j) => sheet.setRaw(row, j + 1, v));
        noteWrite(sheet, 'appendRow');
        return proxy;
      },
      clearContents: () => { ensureLive(sheet); sheet.rows = []; return proxy; },
      clear: (options) => {
        ensureLive(sheet);
        if (options && typeof options === 'object') {
          warn('Sheet.clear(options) was used; the contract lists clear() and clearContents().');
          if (options.contentsOnly) { sheet.rows = []; return proxy; }
          if (options.formatOnly) { sheet.fmt = new Map(); return proxy; }
        }
        sheet.rows = [];
        sheet.fmt = new Map();
        sheet.notes = new Map();
        return proxy;
      },
      setFrozenRows: (n) => {
        if (!Number.isInteger(n) || n < 0) throw paramsError('SpreadsheetApp.Sheet.setFrozenRows', [n]);
        if (n >= sheet.maxRows) throw gasError('Sorry, it is not possible to freeze all rows.');
        sheet.frozenRows = n;
        return proxy;
      },
      hideSheet: () => {
        const visible = book.sheets.filter((s) => !s.hidden && s !== sheet);
        if (!visible.length) throw gasError("You can't hide all the sheets in a document.");
        sheet.hidden = true;
        return proxy;
      },
      showSheet: () => { sheet.hidden = false; return proxy; },
      isSheetHidden: () => sheet.hidden,
      setTabColor: (color) => {
        if (color !== null && typeof color !== 'string') throw paramsError('SpreadsheetApp.Sheet.setTabColor', [color]);
        sheet.tabColor = color;
        return proxy;
      },
      setColumnWidth: (col, width) => {
        if (!Number.isInteger(col) || typeof width !== 'number') throw paramsError('SpreadsheetApp.Sheet.setColumnWidth', [col, width]);
        if (col < 1 || col > sheet.maxCols) throw gasError('Those columns are out of bounds.');
        sheet.colWidths[col] = width;
        return proxy;
      },
      deleteRows: (position, count) => {
        ensureLive(sheet);
        if (!Number.isInteger(position) || !Number.isInteger(count)) throw paramsError('SpreadsheetApp.Sheet.deleteRows', [position, count]);
        if (position < 1 || count < 1 || position + count - 1 > sheet.maxRows) throw gasError('Those rows are out of bounds.');
        if (sheet.maxRows - count <= sheet.frozenRows) {
          throw gasError(sheet.frozenRows ? 'Sorry, it is not possible to delete all non-frozen rows.'
            : "You can't delete all the rows on the sheet.");
        }
        sheet.deleteRows(position, count);
        return proxy;
      },
      insertRowsAfter: (after, count) => {
        ensureLive(sheet);
        if (!Number.isInteger(after) || !Number.isInteger(count)) throw paramsError('SpreadsheetApp.Sheet.insertRowsAfter', [after, count]);
        if (after < 1 || after > sheet.maxRows) throw gasError('Those rows are out of bounds.');
        if (count < 1) throw gasError('The number of rows to insert must be at least 1.');
        sheet.insertRowsAfter(after, count);
        return proxy;
      },
      createTextFinder: (text) => {
        ensureLive(sheet);
        return makeTextFinder(sheet, 1, 1, sheet.maxRows, sheet.maxCols, text);
      },
      // ---- outside the contract (recorded) ----
      setName: (name) => {
        if (typeof name !== 'string' || !name) throw paramsError('SpreadsheetApp.Sheet.setName', [name]);
        if (book.sheets.some((s) => s !== sheet && s.name.toLowerCase() === name.toLowerCase())) {
          throw gasError(`A sheet with the name "${name}" already exists. Please enter another name.`);
        }
        sheet.name = name;
        return proxy;
      },
      getSheetId: () => sheet.sheetId,
      getIndex: () => book.sheets.indexOf(sheet) + 1,
      getParent: () => wrapBook(book),
      activate: () => proxy,
      getMaxColumns: () => sheet.maxCols,
      getFrozenRows: () => sheet.frozenRows,
      getTabColor: () => sheet.tabColor,
      getColumnWidth: (col) => sheet.colWidths[col] || 100,
      setFrozenColumns: (n) => { sheet.frozenCols = n; return proxy; },
      insertColumnsAfter: (after, count) => {
        if (after < 1 || after > sheet.maxCols) throw gasError('Those columns are out of bounds.');
        for (const row of sheet.rows) if (row && row.length > after) row.splice(after, 0, ...new Array(count).fill(''));
        sheet.maxCols += count;
        return proxy;
      },
      deleteColumns: (position, count) => {
        for (const row of sheet.rows) if (row) row.splice(position - 1, count);
        sheet.maxCols -= count;
        return proxy;
      },
      insertRowsBefore: (before, count) => {
        if (before < 1 || before > sheet.maxRows) throw gasError('Those rows are out of bounds.');
        sheet.rows.splice(before - 1, 0, ...new Array(count));
        sheet.shiftRows(before, count);
        sheet.maxRows += count;
        return proxy;
      },
      autoResizeColumns: () => proxy,
      toString: () => 'Sheet'
    };
    const proxy = strictObject('Sheet', impl);
    unwrapSheet.set(proxy, sheet);
    return proxy;
  }

  /* ---- Spreadsheet ---------------------------------------------------------- */
  function wrapBook(book) {
    const impl = {
      getId: () => book.id,
      getUrl: () => sheetUrl(book.id),
      getName: () => book.name,
      getSheetByName: (name) => {
        if (typeof name !== 'string') throw paramsError('SpreadsheetApp.Spreadsheet.getSheetByName', [name]);
        const sheet = book.sheets.find((s) => s.name === name);
        return sheet ? wrapSheet(sheet) : null;
      },
      getSheets: () => realmArray(book.sheets.map(wrapSheet)),
      // control.sheetEditors (kept between executions) lists the Sheet's editors; default: whoever is active
      getEditors: () => realmArray((control.sheetEditors || [control.users.active]).filter(Boolean).map(makeUser)),
      // insertSheet([name], [index], [options]); options.template = a sheet of this
      // spreadsheet to copy (size, values, formats, checks), as Google documents.
      insertSheet: (...args) => {
        const rest = args.slice();
        const name0 = typeof rest[0] === 'string' ? rest.shift() : null;
        const index = typeof rest[0] === 'number' ? rest.shift() : null;
        const options = rest.length && rest[0] && typeof rest[0] === 'object' ? rest.shift() : null;
        if (rest.length) throw paramsError('SpreadsheetApp.Spreadsheet.insertSheet', args);
        let template = null;
        if (options) {
          for (const k of Object.keys(options)) if (k !== 'template') warn(`insertSheet option "${k}" is ignored by the harness.`);
          if (options.template !== undefined) {
            template = unwrapSheet.get(options.template);
            if (!template || template.book !== book || template.deleted) {
              throw gasError('[harness] insertSheet({ template }) needs a sheet of the same spreadsheet.');
            }
          }
        }
        let name = name0;
        if (name === null) {
          let n = book.sheets.length + 1;
          while (book.sheets.some((s) => s.name === 'Sheet' + n)) n += 1;
          name = 'Sheet' + n;
        }
        if (!name.trim()) throw gasError('Sheet names cannot be blank.');
        if (book.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          throw gasError(`A sheet with the name "${name}" already exists. Please enter another name.`);
        }
        const sheet = new SheetModel(book, name, template ? template.maxRows : 1000, template ? template.maxCols : 26);
        if (template) {
          sheet.rows = template.rows.map((row) => (row ? row.slice() : row));
          sheet.fmt = new Map(Array.from(template.fmt.entries(), ([k, v]) => [k, Object.assign({}, v)]));
          sheet.notes = new Map(template.notes);
          sheet.rules = new Map(template.rules);
          sheet.frozenRows = template.frozenRows;
          sheet.colWidths = Object.assign({}, template.colWidths);
        }
        if (index === null || index >= book.sheets.length) book.sheets.push(sheet);
        else book.sheets.splice(Math.max(index, 0), 0, sheet);
        return wrapSheet(sheet);
      },
      deleteSheet: (sheetProxy) => {
        const sheet = unwrapSheet.get(sheetProxy);
        if (!sheet) throw paramsError('SpreadsheetApp.Spreadsheet.deleteSheet', [sheetProxy]);
        if (sheet.book !== book || sheet.deleted) throw gasError('[harness] deleteSheet(): that sheet is not in this spreadsheet.');
        if (book.sheets.length === 1) throw gasError("You can't remove all the sheets in a document.");
        if (!book.sheets.some((s) => s !== sheet && !s.hidden)) throw gasError("You can't remove all the visible sheets in a document.");
        book.sheets.splice(book.sheets.indexOf(sheet), 1);
        sheet.deleted = true;
      },
      // ---- outside the contract (recorded) ----
      getActiveSheet: () => wrapSheet(book.sheets[0]),
      setActiveSheet: (s) => s,
      getSpreadsheetTimeZone: () => opts.timeZone,
      getSpreadsheetLocale: () => opts.locale,
      rename: (name) => { book.name = String(name); const f = drive.items.get(book.id); if (f) f.name = book.name; },
      toast: (msg) => { uiRecord({ kind: 'toast', message: String(msg) }); },
      toString: () => 'Spreadsheet'
    };
    return strictObject('Spreadsheet', impl);
  }

  function bookById(id) {
    const book = typeof id === 'string' ? books.get(id) : null;
    const item = book ? drive.items.get(id) : null;
    if (!book || !item) {
      throw gasError('Unexpected error while getting the method or property openById on object SpreadsheetApp. ' +
        `(No spreadsheet with id "${String(id).slice(0, 60)}".)`);
    }
    return book;
  }

  /* =========================================================================
     UI: menus, alerts, prompts, dialogs (answers come from a script)
     ========================================================================= */
  const ui = { log: [], menus: new Map() };

  function uiRecord(entry) {
    const full = Object.assign({ at: new Date(now()).toISOString(), context: control.context,
      fn: state.current ? state.current.fn : null }, entry);
    ui.log.push(full);
    if (state.current) state.current.ui.push(full);
    return full;
  }

  function enumValue(type, name) { return Object.freeze({ toString: () => name, name, enumType: type }); }
  const BUTTON = {};
  for (const name of ['OK', 'CANCEL', 'YES', 'NO', 'CLOSE']) BUTTON[name] = enumValue('Button', name);
  const BUTTON_SETS = {
    OK: Object.freeze({ toString: () => 'OK', name: 'OK', buttons: ['OK'] }),
    OK_CANCEL: Object.freeze({ toString: () => 'OK_CANCEL', name: 'OK_CANCEL', buttons: ['OK', 'CANCEL'] }),
    YES_NO: Object.freeze({ toString: () => 'YES_NO', name: 'YES_NO', buttons: ['YES', 'NO'] }),
    YES_NO_CANCEL: Object.freeze({ toString: () => 'YES_NO_CANCEL', name: 'YES_NO_CANCEL', buttons: ['YES', 'NO', 'CANCEL'] })
  };
  const buttonSetList = Object.values(BUTTON_SETS);
  const ButtonSetObj = strictObject('Ui.ButtonSet', Object.assign({}, BUTTON_SETS));
  const ButtonObj = strictObject('Ui.Button', Object.assign({}, BUTTON));

  /* Pick the scripted answer for a dialog (or the default policy). */
  function answerFor(kind, title, message, set) {
    const text = (title ? title + '\n' : '') + message;
    const queue = control.ui.queue;
    const info = { kind, title, message, buttons: set.buttons };
    let idx = queue.findIndex((a) => !a.match ||
      (typeof a.match === 'function' ? a.match(info) : a.match instanceof RegExp ? a.match.test(text) : text.indexOf(a.match) !== -1));
    let answer = idx >= 0 ? queue.splice(idx, 1)[0] : null;
    if (answer && typeof answer.respond === 'function') answer = Object.assign({}, answer, answer.respond(info));
    let button = answer && answer.button;
    if (!button) {
      const accept = control.ui.policy !== 'cancel';
      if (accept) button = set.buttons[0];
      else button = set.buttons.indexOf('CANCEL') !== -1 ? 'CANCEL' : (set.buttons.indexOf('NO') !== -1 ? 'NO' : 'CLOSE');
    }
    if (button !== 'CLOSE' && set.buttons.indexOf(button) === -1) {
      throw new Error(`[harness] The scripted answer "${button}" is not one of the buttons (${set.buttons.join(', ')}) ` +
        `of the dialog: ${text.slice(0, 120)}`);
    }
    return { button, text: answer && typeof answer.text === 'string' ? answer.text : '', scripted: !!answer };
  }

  function parseDialogArgs(method, args) {
    const isSet = (x) => buttonSetList.indexOf(x) !== -1;
    if (args.length === 1 && typeof args[0] === 'string') return { title: '', message: args[0], set: BUTTON_SETS.OK };
    if (args.length === 2 && typeof args[0] === 'string' && isSet(args[1])) return { title: '', message: args[0], set: args[1] };
    if (args.length === 3 && typeof args[0] === 'string' && typeof args[1] === 'string' && isSet(args[2])) {
      return { title: args[0], message: args[1], set: args[2] };
    }
    throw paramsError(`Ui.${method}`, args);
  }

  function makeUi() {
    const impl = {
      createMenu: (caption) => {
        if (typeof caption !== 'string') throw paramsError('Ui.createMenu', [caption]);
        const menu = { caption, items: [] };
        const menuImpl = {
          addItem: (label, fn) => {
            if (typeof label !== 'string' || typeof fn !== 'string') throw paramsError('Menu.addItem', [label, fn]);
            menu.items.push({ label, fn });
            return menuProxy;
          },
          addSeparator: () => { menu.items.push({ separator: true }); return menuProxy; },
          addToUi: () => { ui.menus.set(caption, menu); uiRecord({ kind: 'menu', title: caption, items: menu.items.slice() }); },
          addSubMenu: (sub) => { menu.items.push({ submenu: sub }); return menuProxy; },
          toString: () => 'Menu'
        };
        const menuProxy = strictObject('Menu', menuImpl);
        return menuProxy;
      },
      alert: (...args) => {
        const d = parseDialogArgs('alert', args);
        const a = answerFor('alert', d.title, d.message, d.set);
        uiRecord({ kind: 'alert', title: d.title, message: d.message, buttons: d.set.name, answer: a.button, scripted: a.scripted });
        return BUTTON[a.button];
      },
      prompt: (...args) => {
        const d = parseDialogArgs('prompt', args);
        const a = answerFor('prompt', d.title, d.message, d.set);
        uiRecord({ kind: 'prompt', title: d.title, message: d.message, buttons: d.set.name, answer: a.button,
          text: a.text, scripted: a.scripted });
        return strictObject('PromptResponse', {
          getResponseText: () => a.text,
          getSelectedButton: () => BUTTON[a.button],
          toString: () => 'PromptResponse'
        });
      },
      showModalDialog: (output, title) => {
        const out = unwrapOutput.get(output);
        if (!out || out.kind !== 'html' || typeof title !== 'string') throw paramsError('Ui.showModalDialog', [output, title]);
        uiRecord({ kind: 'dialog', title, width: out.width, height: out.height, htmlTitle: out.title,
          content: out.content, file: out.file });
      },
      ButtonSet: ButtonSetObj,
      Button: ButtonObj,
      toString: () => 'Ui'
    };
    return strictObject('Ui', impl);
  }

  /* =========================================================================
     SpreadsheetApp
     ========================================================================= */
  const SpreadsheetApp = strictObject('SpreadsheetApp', {
    // In the web app a bound script normally still sees its Sheet; the option
    // webappActiveSpreadsheet: 'null' imitates the case where it does not.
    getActiveSpreadsheet: () => (control.context === 'webapp' && opts.webappActiveSpreadsheet === 'null'
      ? null : wrapBook(books.get(boundId))),
    openById: (id) => {
      requireContext('SpreadsheetApp.openById', 'https://www.googleapis.com/auth/spreadsheets');
      return wrapBook(bookById(id));
    },
    create: (name, rows, cols) => {
      requireContext('SpreadsheetApp.create', 'https://www.googleapis.com/auth/spreadsheets');
      if (typeof name !== 'string' || !name) throw paramsError('SpreadsheetApp.create', [name, rows, cols]);
      if ((rows !== undefined && !Number.isInteger(rows)) || (cols !== undefined && !Number.isInteger(cols))) {
        throw paramsError('SpreadsheetApp.create', [name, rows, cols]);
      }
      return wrapBook(makeBook(name, rows, cols));
    },
    getUi: () => {
      if (control.context === 'webapp') throw gasError('Cannot call SpreadsheetApp.getUi() from this context.');
      return makeUi();
    },
    flush: () => { /* nothing to wait for in memory */ },
    newDataValidation: () => newValidationBuilder(),
    // ---- outside the contract (recorded) ----
    getActive: () => wrapBook(books.get(boundId)),
    toString: () => 'SpreadsheetApp'
  });

  /* =========================================================================
     HtmlService
     ========================================================================= */
  function makeOutput(kind, content, file) {
    const out = { kind, content: String(content || ''), title: '', width: null, height: null, file: file || null,
      mime: null, meta: {} };
    const impl = {
      setWidth: (n) => { if (typeof n !== 'number') throw paramsError('HtmlOutput.setWidth', [n]); out.width = n; return proxy; },
      setHeight: (n) => { if (typeof n !== 'number') throw paramsError('HtmlOutput.setHeight', [n]); out.height = n; return proxy; },
      setTitle: (t) => { out.title = String(t); return proxy; },
      addMetaTag: (name, content) => {
        if (typeof name !== 'string' || typeof content !== 'string') throw paramsError('HtmlOutput.addMetaTag', [name, content]);
        out.meta[name] = content;
        return proxy;
      },
      // ---- outside the contract (recorded) ----
      getContent: () => out.content,
      getMetaTag: (name) => out.meta[name],
      getTitle: () => out.title,
      getWidth: () => out.width,
      getHeight: () => out.height,
      append: (more) => { out.content += String(more); return proxy; },
      setContent: (c) => { out.content = String(c); return proxy; },
      toString: () => 'HtmlOutput'
    };
    const proxy = strictObject('HtmlOutput', impl);
    unwrapOutput.set(proxy, out);
    return proxy;
  }

  const HtmlService = strictObject('HtmlService', {
    createHtmlOutputFromFile: (name) => {
      if (typeof name !== 'string') throw paramsError('HtmlService.createHtmlOutputFromFile', [name]);
      const file = path.join(opts.appsScriptDir, /\.html$/i.test(name) ? name : name + '.html');
      if (!fs.existsSync(file)) throw gasError(`No HTML file named ${name} was found.`);
      const content = fs.readFileSync(file, 'utf8');
      if (/<\?[=!]?/.test(content)) {
        warn(`${path.basename(file)} contains "<?" scriptlets; createHtmlOutputFromFile does not run them (contract: no scriptlets).`);
      }
      return makeOutput('html', content, file);
    },
    createHtmlOutput: (html) => makeOutput('html', html === undefined ? '' : html),
    toString: () => 'HtmlService'
  });

  /* =========================================================================
     CacheService (100 KB per value, 6 hours maximum, may forget anything)
     ========================================================================= */
  const cache = new Map();   // key -> { value, expiresAt }
  const CACHE_MAX_BYTES = 100 * 1024;
  const CACHE_MAX_SECONDS = 21600;

  function cacheKeyCheck(key, method) {
    if (typeof key !== 'string') throw paramsError(`Cache.${method}`, [key]);
    if (key.length > 250) throw gasError('Argument too large: key');
  }

  function cachePut(key, value, seconds, method) {
    cacheKeyCheck(key, method);
    let text = value;
    if (typeof value !== 'string') {
      warn(`Cache.${method}("${key}") was given ${typeof value}, not text; it is stored as String(value).`);
      text = String(value);
    }
    if (Buffer.byteLength(text, 'utf8') > CACHE_MAX_BYTES) {
      throw gasError(`Argument too large: value (cache key "${key}" holds ${Buffer.byteLength(text, 'utf8')} bytes; ` +
        'the limit is 100 KB per value, counted in bytes: Hindi/Tamil letters take 3 bytes each)');
    }
    let secs = seconds === undefined ? 600 : seconds;
    if (typeof secs !== 'number' || Number.isNaN(secs)) throw paramsError(`Cache.${method}`, [key, value, seconds]);
    if (secs > CACHE_MAX_SECONDS) { warn(`Cache.${method}("${key}") asked for ${secs} s; Google keeps values at most 21600 s (6 h).`); secs = CACHE_MAX_SECONDS; }
    if (secs < 1) secs = 1;
    cache.set(key, { value: text, expiresAt: now() + secs * 1000 });
  }

  function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) { cache.delete(key); return null; }
    return entry.value;
  }

  const scriptCache = strictObject('Cache', {
    get: (key) => { cacheKeyCheck(key, 'get'); return cacheGet(key); },
    getAll: (keys) => {
      if (!Array.isArray(keys)) throw paramsError('Cache.getAll', [keys]);
      const out = {};
      for (const k of keys) { cacheKeyCheck(k, 'getAll'); const v = cacheGet(k); if (v !== null) out[k] = v; }
      return toRealm(out);
    },
    put: (key, value, seconds) => { cachePut(key, value, seconds, 'put'); },
    putAll: (values, seconds) => {
      if (!values || typeof values !== 'object') throw paramsError('Cache.putAll', [values, seconds]);
      for (const k of Object.keys(values)) cachePut(k, values[k], seconds, 'putAll');
    },
    remove: (key) => { cacheKeyCheck(key, 'remove'); cache.delete(key); },
    removeAll: (keys) => {
      if (!Array.isArray(keys)) throw paramsError('Cache.removeAll', [keys]);
      for (const k of keys) cache.delete(k);
    },
    toString: () => 'Cache'
  });

  const CacheService = strictObject('CacheService', {
    getScriptCache: () => scriptCache,
    toString: () => 'CacheService'
  });

  /* =========================================================================
     LockService: two separate locks, as in Google.
       - the SCRIPT lock (getScriptLock): one for the whole project;
       - the DOCUMENT lock (getDocumentLock): one for the Sheet. Google gives
         none (null) outside a containing document, for example in the web app.
     Tests can make either one "busy" (held by another execution) on its own.
     Every execution logs what it did in run.lockLog, for example
     ["document:30000", "script:30000", "script:release", "document:release"]
     (":busy" is added when the lock could not be taken), and run.lockWaits
     lists every tryLock wait in ms.
     ========================================================================= */
  function makeLock(kind) {
    const busy = () => (kind === 'script' ? control.lock.busy : control.lock.documentBusy);
    const lockImpl = {
      tryLock: (ms) => {
        if (typeof ms !== 'number') throw paramsError('Lock.tryLock', [ms]);
        if (typeof control.lock.beforeTryLock === 'function') control.lock.beforeTryLock(kind, ms);
        const run = state.current;
        const refused = busy() && !(run && run.held[kind]);
        if (run) {
          run.lockWaits.push(ms);
          run.lockLog.push(`${kind}:${ms}${refused ? ':busy' : ''}`);
        }
        if (refused) return false;
        if (run) run.held[kind] = true;
        return true;
      },
      releaseLock: () => {
        const run = state.current;
        if (!run) return;
        run.held[kind] = false;
        run.lockLog.push(`${kind}:release`);
      },
      hasLock: () => !!(state.current && state.current.held[kind]),
      // ---- outside the contract (recorded) ----
      waitLock: (ms) => {
        const run = state.current;
        if (run) run.lockLog.push(`${kind}:wait:${ms}${busy() ? ':busy' : ''}`);
        if (busy() && !(run && run.held[kind])) throw gasError('Lock timeout: another process was holding the lock for too long.');
        if (run) run.held[kind] = true;
        return ms;
      },
      toString: () => 'Lock'
    };
    return strictObject('Lock', lockImpl);
  }

  const LockService = strictObject('LockService', {
    getScriptLock: () => makeLock('script'),
    // Google: "If this method is called outside of the context of a containing
    // document (such as from a standalone script or webapp), null is returned."
    getDocumentLock: () => (control.context === 'webapp' || control.lock.noDocument ? null : makeLock('document')),
    toString: () => 'LockService'
  });

  /* =========================================================================
     PropertiesService (script + per-user), 9 KB per value, 500 KB per store
     ========================================================================= */
  const scriptProps = new Map();
  const userProps = new Map();   // email -> Map

  function propsStore(kind) {
    if (kind === 'script') return scriptProps;
    const email = control.users.active || control.users.effective || '(anonymous)';
    if (!userProps.has(email)) userProps.set(email, new Map());
    return userProps.get(email);
  }

  function makeProperties(kind) {
    const store = () => propsStore(kind);
    const impl = {
      getProperty: (key) => {
        if (typeof key !== 'string') throw paramsError('Properties.getProperty', [key]);
        const v = store().get(key);
        return v === undefined ? null : v;
      },
      setProperty: (key, value) => {
        if (typeof key !== 'string' || !key) throw paramsError('Properties.setProperty', [key, value]);
        let text = value;
        if (typeof value !== 'string') {
          warn(`setProperty("${key}") was given ${value === null ? 'null' : typeof value}, not text. Google stores text ` +
            '(numbers can come back as "5.0"): pass String(value).');
          text = String(value);
        }
        if (Buffer.byteLength(key + text, 'utf8') > 9 * 1024) throw gasError('Argument too large: value (Script/User Properties hold at most 9 KB per value)');
        const s = store();
        let total = 0;
        for (const [k, v] of s) if (k !== key) total += Buffer.byteLength(k + v, 'utf8');
        if (total + Buffer.byteLength(key + text, 'utf8') > 500 * 1024) {
          throw gasError('You have exceeded the property storage quota. Please remove some properties and try again.');
        }
        s.set(key, text);
        return proxy;
      },
      getProperties: () => toRealm(Object.fromEntries(store())),
      deleteProperty: (key) => { store().delete(key); return proxy; },
      // ---- outside the contract (recorded) ----
      setProperties: (obj, deleteAllOthers) => {
        if (deleteAllOthers) store().clear();
        for (const k of Object.keys(obj || {})) impl.setProperty(k, obj[k]);
        return proxy;
      },
      getKeys: () => realmArray(Array.from(store().keys())),
      deleteAllProperties: () => { store().clear(); return proxy; },
      toString: () => 'Properties'
    };
    const proxy = strictObject('Properties', impl);
    return proxy;
  }

  const PropertiesService = strictObject('PropertiesService', {
    getScriptProperties: () => makeProperties('script'),
    getUserProperties: () => makeProperties('user'),
    toString: () => 'PropertiesService'
  });

  /* =========================================================================
     Utilities (HMAC, base64 with Google's signed bytes, blobs, dates, sleep)
     ========================================================================= */
  const CHARSET = { UTF_8: Object.freeze({ toString: () => 'UTF_8', enc: 'utf8' }),
    US_ASCII: Object.freeze({ toString: () => 'US_ASCII', enc: 'latin1' }) };
  const CharsetObj = strictObject('Utilities.Charset', Object.assign({}, CHARSET));

  function encodingOf(charset, method) {
    if (charset === undefined) return 'utf8';
    if (charset === CHARSET.UTF_8 || charset === CHARSET.US_ASCII) return charset.enc;
    throw paramsError(`Utilities.${method}`, [charset]);
  }

  function bytesFrom(data, charset, method) {
    if (typeof data === 'string') return Buffer.from(data, encodingOf(charset, method));
    if (Array.isArray(data)) {
      const out = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i += 1) {
        const b = data[i];
        if (typeof b !== 'number' || !Number.isInteger(b) || b < -128 || b > 255) {
          throw gasError(`[harness] Utilities.${method}: item ${i} of the byte list is ${String(b)}, not a byte (-128..127).`);
        }
        out[i] = b & 0xff;
      }
      return out;
    }
    const blob = unwrapBlob.get(data);
    if (blob) return Buffer.from(blob.bytes);
    throw paramsError(`Utilities.${method}`, [data]);
  }

  function signedBytes(buf) {
    const out = new R.Array(buf.length);
    for (let i = 0; i < buf.length; i += 1) out[i] = buf[i] > 127 ? buf[i] - 256 : buf[i];
    return out;
  }

  function makeBlob(bytes, contentType, name) {
    const blob = { bytes: Buffer.from(bytes), contentType: contentType || null, name: name || null };
    const impl = {
      getDataAsString: (charset) => blob.bytes.toString(encodingOf(charset, 'Blob.getDataAsString')),
      // ---- outside the contract (recorded) ----
      getBytes: () => signedBytes(blob.bytes),
      getContentType: () => blob.contentType,
      getName: () => blob.name,
      setName: (n) => { blob.name = String(n); return proxy; },
      setContentType: (t) => { blob.contentType = String(t); return proxy; },
      setDataFromString: (s) => { blob.bytes = Buffer.from(String(s), 'utf8'); return proxy; },
      copyBlob: () => makeBlob(blob.bytes, blob.contentType, blob.name),
      toString: () => 'Blob'
    };
    const proxy = strictObject('Blob', impl);
    unwrapBlob.set(proxy, blob);
    return proxy;
  }

  function decodeBase64(text, alphabet, method) {
    if (typeof text !== 'string') throw paramsError(`Utilities.${method}`, [text]);
    const ok = alphabet === 'web' ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
    const body = text.replace(/=+$/, '');
    if (!ok.test(text) || body.length % 4 === 1) throw gasError('Could not decode string.');
    return Buffer.from(alphabet === 'web' ? body.replace(/-/g, '+').replace(/_/g, '/') : body, 'base64');
  }

  const sleepCell = new Int32Array(new SharedArrayBuffer(4));
  const Utilities = strictObject('Utilities', {
    computeHmacSha256Signature: (value, key, charset) => {
      if (value === undefined || key === undefined) throw paramsError('Utilities.computeHmacSha256Signature', [value, key]);
      const v = bytesFrom(value, charset, 'computeHmacSha256Signature');
      const k = bytesFrom(key, charset, 'computeHmacSha256Signature');
      return signedBytes(crypto.createHmac('sha256', k).update(v).digest());
    },
    base64EncodeWebSafe: (data, charset) => bytesFrom(data, charset, 'base64EncodeWebSafe').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_'),
    base64Encode: (data, charset) => bytesFrom(data, charset, 'base64Encode').toString('base64'),
    base64Decode: (text, charset) => {
      if (charset !== undefined) encodingOf(charset, 'base64Decode');
      return signedBytes(decodeBase64(text, 'std', 'base64Decode'));
    },
    newBlob: (data, contentType, name) => {
      if (data === undefined) throw paramsError('Utilities.newBlob', []);
      return makeBlob(bytesFrom(data, undefined, 'newBlob'), contentType, name);
    },
    getUuid: () => crypto.randomUUID(),
    formatDate: (date, tz, pattern) => {
      if (!isDate(date) || typeof tz !== 'string' || typeof pattern !== 'string') {
        throw paramsError('Utilities.formatDate', [date, tz, pattern]);
      }
      const ms = date.getTime();
      if (Number.isNaN(ms)) throw gasError('Invalid argument: date (an invalid Date was given to formatDate).');
      let result;
      try {
        result = formatJavaDate(ms, tz, pattern);
      } catch (e) {
        if (e.badPattern) throw gasError(`Invalid argument: pattern (${e.message})`);
        throw e;
      }
      if (result.unknownZone) warn(`Utilities.formatDate: unknown time zone "${tz}". Google quietly uses GMT.`);
      return result.text;
    },
    sleep: (ms) => {
      if (typeof ms !== 'number') throw paramsError('Utilities.sleep', [ms]);
      if (state.current) state.current.sleptMs += ms;
      Atomics.wait(sleepCell, 0, 0, Math.min(Math.max(ms, 0), opts.maxSleepMs));
    },
    Charset: CharsetObj,
    // ---- outside the contract (recorded) ----
    base64DecodeWebSafe: (text) => signedBytes(decodeBase64(text, 'web', 'base64DecodeWebSafe')),
    toString: () => 'Utilities'
  });

  /* =========================================================================
     ContentService (what doGet/doPost return)
     ========================================================================= */
  const CONTENT_MIME = {};
  for (const [name, mime] of Object.entries({ ATOM: 'application/atom+xml', CSV: 'text/csv', ICAL: 'text/calendar',
    JAVASCRIPT: 'application/javascript', JSON: 'application/json', RSS: 'application/rss+xml', TEXT: 'text/plain',
    VCARD: 'text/vcard', XML: 'text/xml' })) {
    CONTENT_MIME[name] = Object.freeze({ toString: () => name, name, mime });
  }
  const contentMimeList = Object.values(CONTENT_MIME);
  const ContentMimeObj = strictObject('ContentService.MimeType', Object.assign({}, CONTENT_MIME));

  const ContentService = strictObject('ContentService', {
    createTextOutput: (content) => {
      const out = { kind: 'text', content: content === undefined ? '' : String(content), mime: CONTENT_MIME.TEXT };
      if (content !== undefined && typeof content !== 'string') warn('createTextOutput() was given a non-text value.');
      const impl = {
        setMimeType: (m) => {
          if (contentMimeList.indexOf(m) === -1) {
            throw gasError(`The parameters (${typeLabel(m)}) don't match the method signature for ` +
              'ContentService.TextOutput.setMimeType. (Use ContentService.MimeType.JSON: setMimeType takes only ' +
              'ContentService\'s own types, never text such as "application/json".)');
          }
          out.mime = m;
          return proxy;
        },
        // ---- outside the contract (recorded) ----
        getContent: () => out.content,
        getMimeType: () => out.mime,
        setContent: (c) => { out.content = String(c); return proxy; },
        append: (c) => { out.content += String(c); return proxy; },
        toString: () => 'TextOutput'
      };
      const proxy = strictObject('TextOutput', impl);
      unwrapOutput.set(proxy, out);
      return proxy;
    },
    MimeType: ContentMimeObj,
    toString: () => 'ContentService'
  });

  /* =========================================================================
     UrlFetchApp (serves files from folders on this Mac; never the internet)
     ========================================================================= */
  const fetchLog = [];
  function lookupUrl(url, params) {
    for (const route of control.fetchRoutes) {
      if (url === route.url || (route.prefix && url.startsWith(route.prefix))) {
        return typeof route.response === 'function' ? route.response(url, params || {}) : route.response;
      }
    }
    for (const prefix of Object.keys(opts.urlMap)) {
      if (!url.startsWith(prefix)) continue;
      const rest = decodeURIComponent(url.slice(prefix.length).split('?')[0].split('#')[0]);
      if (rest.split('/').some((p) => p === '..' || p.startsWith('.'))) return { code: 404, body: '404: Not Found' };
      const file = path.join(opts.urlMap[prefix], rest);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return { code: 200, body: fs.readFileSync(file) };
      return { code: 404, body: '404: Not Found' };
    }
    return { code: 404, body: '404: Not Found', note: 'no route in the harness for this address' };
  }

  // The fetch options the code uses on purpose (contract section 2): muteHttpExceptions,
  // and followRedirects (true is also Google's default: a 3xx answer is followed).
  const FETCH_OPTIONS = ['muteHttpExceptions', 'followRedirects', 'headers'];
  const UrlFetchApp = strictObject('UrlFetchApp', {
    fetch: (url, params) => {
      requireContext('UrlFetchApp.fetch', 'https://www.googleapis.com/auth/script.external_request');
      if (typeof url !== 'string') throw paramsError('UrlFetchApp.fetch', [url, params]);
      if (!/^https?:\/\//i.test(url)) throw gasError(`Invalid argument: ${url}`);
      const p = params || {};
      for (const k of Object.keys(p)) {
        if (FETCH_OPTIONS.indexOf(k) < 0) warn(`UrlFetchApp.fetch option "${k}" is outside the contract (${FETCH_OPTIONS.join(', ')}).`);
      }
      let res = lookupUrl(url, p);
      fetchLog.push({ url, code: res.error ? null : res.code, fn: state.current ? state.current.fn : null });
      // A route answer { code: 302, location } is a redirect; Google follows it unless followRedirects is false.
      for (let hops = 0; !res.error && res.code >= 300 && res.code < 400 && res.location && p.followRedirects !== false; hops += 1) {
        if (hops >= 10) throw gasError(`[harness] More than 10 redirects starting at ${url}.`);
        const next = String(res.location);
        res = lookupUrl(next, p);
        fetchLog.push({ url: next, code: res.error ? null : res.code, fn: state.current ? state.current.fn : null, redirectedFrom: url });
      }
      if (res.error) throw gasError(res.error);
      const body = Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.body || ''), 'utf8');
      if (res.code >= 400 && !p.muteHttpExceptions) {
        const host = url.replace(/^https?:\/\/([^/]+).*$/, '$1');
        throw gasError(`Request failed for https://${host} returned code ${res.code}. Truncated server response: ` +
          `${body.toString('utf8').slice(0, 100)} (use muteHttpExceptions option to examine full response)`);
      }
      return strictObject('HTTPResponse', {
        getResponseCode: () => res.code,
        getContentText: (charset) => body.toString(charset ? 'utf8' : 'utf8'),
        // ---- outside the contract (recorded) ----
        getContent: () => signedBytes(body),
        getHeaders: () => toRealm(Object.assign({ 'Content-Type': res.contentType || 'text/plain; charset=utf-8' },
          res.location ? { Location: String(res.location) } : {})),
        getBlob: () => makeBlob(body, res.contentType || 'text/plain', url.split('/').pop()),
        toString: () => 'HTTPResponse'
      });
    },
    toString: () => 'UrlFetchApp'
  });

  /* =========================================================================
     Session, ScriptApp, MimeType, console, Logger
     ========================================================================= */
  function makeUser(email) {
    const user = strictObject('User', { getEmail: () => email || '', toString: () => email || '' });
    unwrapUser.set(user, email || '');
    return user;
  }
  const Session = strictObject('Session', {
    getActiveUser: () => makeUser(control.users.active),
    getEffectiveUser: () => makeUser(control.users.effective),
    // ---- outside the contract (recorded) ----
    getScriptTimeZone: () => opts.timeZone,
    getTemporaryActiveUserKey: () => 'fake-temp-user-key',
    toString: () => 'Session'
  });

  /* ScriptApp.requireAllScopes(authMode), as Google documents it: "Validates
     if the user has granted consent for all of the scopes requested by the
     script. If any consents are missing, then this method ends the current
     execution and renders an authorization prompt to request the missing
     consents." Here: quiet by default (everything granted); with
     control.consent.missing the run stops with Google's "Authorization is
     required" error and the permission screen is recorded (kind "consent");
     with control.consent.error it fails with that text instead. Every call is
     logged in run.consentChecks and admin.consentLog. */
  const AUTH_MODE = {};
  for (const name of ['NONE', 'CUSTOM_FUNCTION', 'LIMITED', 'FULL']) AUTH_MODE[name] = enumValue('AuthMode', name);
  const authModeList = Object.values(AUTH_MODE);
  const AuthModeObj = strictObject('ScriptApp.AuthMode', Object.assign({}, AUTH_MODE));
  const consentLog = [];

  const ScriptApp = strictObject('ScriptApp', {
    getService: () => strictObject('Service', {
      getUrl: () => control.scriptUrl,
      isEnabled: () => !!control.scriptUrl,
      toString: () => 'Service'
    }),
    // A token for the account this run works as (a test can check it in a route's params.headers).
    getOAuthToken: () => 'fake-oauth-token:' + (control.users.effective || ''),
    requireAllScopes: (mode) => {
      if (authModeList.indexOf(mode) === -1) throw paramsError('ScriptApp.requireAllScopes', [mode]);
      const entry = { mode: mode.name, fn: state.current ? state.current.fn : null, context: control.context,
        user: control.users.active, outcome: 'granted' };
      consentLog.push(entry);
      if (state.current) state.current.consentChecks.push(mode.name);
      if (control.consent.error) {
        entry.outcome = 'failed';
        throw gasError(String(control.consent.error));
      }
      if (control.consent.missing) {
        entry.outcome = 'asked';
        uiRecord({ kind: 'consent', title: 'Google permission screen',
          message: `Google asks ${control.users.active || 'the person'} again for the permissions that were left unticked.` });
        throw gasError(control.consent.stopMessage);
      }
    },
    AuthMode: AuthModeObj,
    toString: () => 'ScriptApp'
  });

  // Google's global MimeType: the Drive file types. It has NO JSON entry.
  const MimeType = strictObject('MimeType', {
    PLAIN_TEXT: 'text/plain',
    HTML: 'text/html',
    CSV: 'text/csv',
    GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet',
    FOLDER: 'application/vnd.google-apps.folder',
    toString: () => 'MimeType'
  }, { JSON: '(Google\'s MimeType list has no JSON entry: on Google, MimeType.JSON is undefined and a file ' +
    'created with it fails. Write the text \'application/json\' instead)' });

  function formatLogArgs(args) {
    return Array.from(args).map((a) => {
      if (typeof a === 'string') return a;
      try {
        if (a && typeof a === 'object' && a.stack && a.message) return `${a.name || 'Error'}: ${a.message}`;
        return JSON.stringify(a);
      } catch (e) {
        return String(a);
      }
    }).join(' ');
  }
  function logLine(level, args) {
    const entry = { level, text: formatLogArgs(args), fn: state.current ? state.current.fn : null, at: new Date(now()).toISOString() };
    state.logs.push(entry);
    if (state.logs.length > 5000) state.logs.shift();
    if (state.current) state.current.logs.push(entry);
    if (opts.echoConsole) process.stdout.write(`    [${entry.fn || 'load'}] console.${level}: ${entry.text}\n`);
  }
  const consoleObj = strictObject('console', {
    log: (...a) => logLine('log', a),
    error: (...a) => logLine('error', a),
    // ---- outside the contract (recorded) ----
    warn: (...a) => logLine('warn', a),
    info: (...a) => logLine('info', a),
    debug: (...a) => logLine('debug', a),
    toString: () => 'console'
  });
  const Logger = strictObject('Logger', {
    log: (...a) => { logLine('Logger', a); return Logger; },
    toString: () => 'Logger'
  });

  /* =========================================================================
     All globals for the vm
     ========================================================================= */
  const globals = {
    SpreadsheetApp, DriveApp, HtmlService, CacheService, LockService, PropertiesService, Utilities,
    ContentService, UrlFetchApp, Session, ScriptApp, MimeType, console: consoleObj, Logger
  };
  for (const name of FORBIDDEN_GLOBALS) {
    globals[name] = new Proxy({}, {
      get(target, prop) {
        if (typeof prop === 'symbol' || SAFE_PROPS.has(prop)) return undefined;
        throw contractError(`${name}.${String(prop)}`, `(the ${name} service is not allowed at all)`);
      }
    });
  }

  /* =========================================================================
     CONTROL: steer the fake (used by load-gas.js, server.js and the tests)
     ========================================================================= */
  Object.assign(control, {
    /* Start one "execution", like Google does for each menu click, web
       request or google.script.run call. */
    begin(info) {
      const context = info.context || 'editor';
      control.context = context;
      if (context === 'webapp') control.users = { active: info.activeUser || '', effective: opts.ownerEmail };
      else control.users = { active: info.user || opts.adminEmail, effective: info.user || opts.adminEmail };
      // uses: Map "Service.member" -> count, in the order first used (the first key is the first Google call)
      state.current = { fn: info.fn, context, started: Date.now(), uses: new Map(), writes: new Map(), logs: [],
        warnings: [], violations: [], ui: [], held: { script: false, document: false }, lockWaits: [], lockLog: [],
        consentChecks: [], handovers: [], sleptMs: 0 };
      return state.current;
    },
    end() {
      const run = state.current;
      if (!run) return null;
      run.ms = Date.now() - run.started;
      const leftHeld = Object.keys(run.held).filter((kind) => run.held[kind]);
      if (leftHeld.length) {
        run.lockLeftHeld = leftHeld;   // Google releases it when the execution ends, but say so
        for (const kind of leftHeld) run.held[kind] = false;
      }
      state.executions.push(run);
      if (state.executions.length > 400) state.executions.shift();
      state.current = null;
      control.context = 'editor';
      return run;
    },
    queueAnswer(answer) { control.ui.queue.push(answer); },
    clearAnswers() { control.ui.queue.length = 0; },
    setAnswerPolicy(policy) { control.ui.policy = policy; },
    advanceClock(ms) { control.clockOffsetMs += ms; },
    /* The SCRIPT lock (partners' answers) is held by another execution. */
    setLockBusy(busy) { control.lock.busy = !!busy; },
    /* The Sheet's DOCUMENT lock (admin changes) is held by another execution. */
    setDocumentLockBusy(busy) { control.lock.documentBusy = !!busy; },
    /* false: Google gives no document lock (getDocumentLock() returns null). */
    setDocumentLockAvailable(available) { control.lock.noDocument = !available; },
    /* fn(kind, ms) runs at the start of every tryLock, as if another request did
       something while this one waited for the lock; null = nothing (the default). */
    onTryLock(fn) { control.lock.beforeTryLock = typeof fn === 'function' ? fn : null; },
    /* requireAllScopes: { missing: true } or { error: 'text' }; null = every permission granted. */
    setConsent(o) {
      control.consent.missing = !!(o && o.missing);
      control.consent.error = (o && o.error) || null;
      if (o && o.stopMessage) control.consent.stopMessage = o.stopMessage;
      if (!o) control.consent.stopMessage = 'Authorization is required to perform that action.';
    },
    routeUrl(urlOrPrefix, response, isPrefix) {
      control.fetchRoutes.unshift(isPrefix ? { prefix: urlOrPrefix, response } : { url: urlOrPrefix, response });
    },
    clearRoutes() { control.fetchRoutes.length = 0; },
    setScriptUrl(url) { control.scriptUrl = url; },
    setRealm(realm) { R = realm; }
  });

  /* =========================================================================
     ADMIN: look inside the fake Google (tests and the debug pages use this;
     these calls are NOT counted as the code's use of Apps Script)
     ========================================================================= */
  function findBook(idOrName) {
    if (!idOrName) return books.get(boundId);
    if (books.has(idOrName)) return books.get(idOrName);
    const m = /\/d\/([^/]+)/.exec(String(idOrName));
    if (m && books.has(m[1])) return books.get(m[1]);
    for (const b of books.values()) if (b.name === idOrName) return b;
    return null;
  }

  function plainCell(v) {
    if (v instanceof CellDate) return new Date(v.ms);
    if (v instanceof CellFormula) return '#ERROR!';
    return v;
  }

  function jsonCell(v) {
    if (v instanceof CellDate) return { date: new Date(v.ms).toISOString() };
    if (v instanceof CellFormula) return { formula: v.text };
    return v;
  }

  const admin = {
    options: opts,
    state,
    ui,
    fetchLog,
    boundId: () => boundId,
    bound: () => books.get(boundId),
    books: () => Array.from(books.values()),
    findBook,
    findSheet(bookIdOrName, sheetName) {
      const book = findBook(bookIdOrName);
      return book ? book.sheets.find((s) => s.name === sheetName) || null : null;
    },
    /* All values of a tab (up to its last row/column), dates as Date objects. */
    values(bookIdOrName, sheetName) {
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      if (!sheet) return null;
      const out = [];
      const lr = sheet.lastRow();
      const lc = sheet.lastCol();
      for (let r = 1; r <= lr; r += 1) {
        const row = [];
        for (let c = 1; c <= lc; c += 1) row.push(plainCell(sheet.get(r, c)));
        out.push(row);
      }
      return out;
    },
    /* A tab as { headers, rows: [{header: value}], blankRowsSkipped } using row 1 as headers. */
    table(bookIdOrName, sheetName) {
      const values = admin.values(bookIdOrName, sheetName);
      if (!values) return { headers: [], rows: [], blankRowsSkipped: 0, missing: true };
      const headers = (values[0] || []).map((h) => String(h));
      const rows = [];
      let blank = 0;
      for (let i = 1; i < values.length; i += 1) {
        if (values[i].every((v) => v === '' || v === false)) { blank += 1; continue; }
        const obj = { __row: i + 1 };
        headers.forEach((h, j) => { obj[h] = values[i][j] === undefined ? '' : values[i][j]; });
        rows.push(obj);
      }
      return { headers, rows, blankRowsSkipped: blank };
    },
    /* Write a block of cells at (row, col) as if an admin typed them
       (text is interpreted like typing). The grid grows when needed. */
    writeRange(bookIdOrName, sheetName, startRow, startCol, rows) {
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      if (!sheet) throw new Error(`[harness] no tab "${sheetName}"`);
      const width = Math.max(...rows.map((r) => r.length));
      if (startRow + rows.length - 1 > sheet.maxRows) sheet.insertRowsAfter(sheet.maxRows, startRow + rows.length - 1 - sheet.maxRows);
      if (startCol + width - 1 > sheet.maxCols) sheet.maxCols = startCol + width - 1;
      quiet += 1;
      try {
        rows.forEach((row, i) => row.forEach((v, j) => sheet.setRaw(startRow + i, startCol + j,
          storeValue(v, sheet, startRow + i, startCol + j))));
      } finally {
        quiet -= 1;
      }
    },
    /* Write whole rows (from column A) as if an admin typed them. */
    writeRows(bookIdOrName, sheetName, startRow, rows) {
      admin.writeRange(bookIdOrName, sheetName, startRow, 1, rows);
    },
    /* One cell as stored (dates as Date objects, formulas as #ERROR!). */
    cell(bookIdOrName, sheetName, row, col) {
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      return sheet ? plainCell(sheet.get(row, col)) : undefined;
    },
    /* Append rows after the last row (as an admin would paste them). */
    appendRows(bookIdOrName, sheetName, rows) {
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      if (!sheet) throw new Error(`[harness] no tab "${sheetName}"`);
      admin.writeRows(bookIdOrName, sheetName, sheet.lastRow() + 1, rows);
    },
    deleteSheet(bookIdOrName, sheetName) {
      const book = findBook(bookIdOrName);
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      if (!book || !sheet) return false;
      book.sheets.splice(book.sheets.indexOf(sheet), 1);
      sheet.deleted = true;
      return true;
    },
    sheetInfo(bookIdOrName, sheetName) {
      const sheet = admin.findSheet(bookIdOrName, sheetName);
      if (!sheet) return null;
      const lc = Math.max(sheet.lastCol(), 1);
      const header = [];
      for (let c = 1; c <= lc; c += 1) header.push(Object.assign({ value: plainCell(sheet.get(1, c)) }, sheet.fmtOf(1, c)));
      const validationByColumn = {};
      for (const [key, rule] of sheet.rules) {
        const [, c] = key.split(':').map(Number);
        const name = String(plainCell(sheet.get(1, c)));
        validationByColumn[name] = validationByColumn[name] || rule.type;
      }
      return { name: sheet.name, hidden: sheet.hidden, tabColor: sheet.tabColor, frozenRows: sheet.frozenRows,
        maxRows: sheet.maxRows, maxCols: sheet.maxCols, lastRow: sheet.lastRow(), lastCol: sheet.lastCol(),
        header, validationByColumn, notes: Object.fromEntries(sheet.notes) };
    },
    drive: {
      items: () => Array.from(drive.items.values()),
      byId: (id) => drive.items.get(id) || null,
      path: (id) => drivePath(id),
      find: (p) => Array.from(drive.items.values()).find((x) => drivePath(x.id) === p) || null,
      children: (id) => Array.from(drive.items.values()).filter((x) => x.parentId === id),
      text: (id) => { const x = drive.items.get(id); return x && x.bytes ? x.bytes.toString('utf8') : null; },
      bytes: (id) => { const x = drive.items.get(id); return x && x.bytes ? Buffer.from(x.bytes) : null; },
      owner: (id) => { const x = drive.items.get(id); return x ? x.owner || null : null; },
      handovers: () => drive.handovers.slice(),     // every File/Folder.setOwner: { id, name, kind, path, from, to, fn }
      rootId: drive.rootId
    },
    consentLog,                                      // every ScriptApp.requireAllScopes call
    lock: control.lock,
    props: {
      script: scriptProps,
      user: (email) => userProps.get(email || opts.adminEmail) || new Map(),
      setUser: (email, key, value) => {
        const e = email || opts.adminEmail;
        if (!userProps.has(e)) userProps.set(e, new Map());
        userProps.get(e).set(key, value);
      }
    },
    cache: {
      entries: () => Array.from(cache.entries()).filter(([, e]) => e.expiresAt > now())
        .map(([k, e]) => ({ key: k, bytes: Buffer.byteLength(e.value, 'utf8'), secondsLeft: Math.round((e.expiresAt - now()) / 1000), value: e.value })),
      get: (k) => cacheGet(k),
      clear: () => cache.clear(),
      remove: (k) => cache.delete(k),
      set: (k, v, s) => cache.set(k, { value: v, expiresAt: now() + (s || 600) * 1000 })
    },
    unwrapOutput: (o) => unwrapOutput.get(o) || null,
    /* Everything, as JSON-safe data, for /debug pages and failure reports. */
    dump() {
      return {
        spreadsheets: Array.from(books.values()).map((b) => admin.dumpBook(b.id)),
        drive: admin.dumpDrive(),
        scriptProperties: Object.fromEntries(scriptProps),
        userProperties: Object.fromEntries(Array.from(userProps.entries()).map(([e, m]) => [e, Object.fromEntries(m)])),
        cache: admin.cache.entries().map((e) => ({ key: e.key, bytes: e.bytes, secondsLeft: e.secondsLeft,
          value: e.value.length > 300 ? e.value.slice(0, 300) + '…' : e.value }))
      };
    },
    dumpBook(id) {
      const b = findBook(id);
      if (!b) return null;
      return {
        id: b.id, name: b.name, url: sheetUrl(b.id), drivePath: drivePath(b.id),
        sheets: b.sheets.map((s) => {
          const lr = s.lastRow();
          const lc = s.lastCol();
          const values = [];
          for (let r = 1; r <= lr; r += 1) {
            const row = [];
            for (let c = 1; c <= lc; c += 1) row.push(jsonCell(s.get(r, c)));
            values.push(row);
          }
          return { name: s.name, hidden: s.hidden, tabColor: s.tabColor, frozenRows: s.frozenRows,
            maxRows: s.maxRows, maxCols: s.maxCols, lastRow: lr, lastCol: lc, values };
        })
      };
    },
    dumpDrive() {
      return Array.from(drive.items.values()).map((x) => ({ id: x.id, path: drivePath(x.id) || '(My Drive)', kind: x.kind,
        mimeType: x.mimeType, bytes: x.bytes ? x.bytes.length : null,
        preview: x.bytes && /json|text/.test(x.mimeType || '') ? x.bytes.toString('utf8').slice(0, 200) : undefined }));
    },
    /* Save / restore the whole fake Google (server.js --state). */
    exportState() {
      const tag = (v) => (v instanceof CellDate ? { $date: v.ms } : v instanceof CellFormula ? { $formula: v.text } : v);
      return {
        format: 1, idCounter, sheetIdCounter, boundId,
        drive: Array.from(drive.items.values()).map((x) => Object.assign({}, x, { bytes: x.bytes ? x.bytes.toString('base64') : null })),
        books: Array.from(books.values()).map((b) => ({ id: b.id, name: b.name, sheets: b.sheets.map((s) => ({
          name: s.name, sheetId: s.sheetId, maxRows: s.maxRows, maxCols: s.maxCols, frozenRows: s.frozenRows,
          hidden: s.hidden, tabColor: s.tabColor, colWidths: s.colWidths,
          rows: s.rows.map((row) => (row ? Array.from(row, (v) => (v === undefined ? '' : tag(v))) : null)),
          fmt: Array.from(s.fmt.entries()), notes: Array.from(s.notes.entries()), rules: Array.from(s.rules.entries())
        })) })),
        scriptProps: Array.from(scriptProps.entries()),
        userProps: Array.from(userProps.entries()).map(([e, m]) => [e, Array.from(m.entries())]),
        cache: Array.from(cache.entries()),
        handovers: drive.handovers.slice()
      };
    },
    importState(data) {
      if (!data || data.format !== 1) throw new Error('[harness] unknown state file format');
      const untag = (v) => (v && typeof v === 'object' && '$date' in v ? new CellDate(v.$date)
        : v && typeof v === 'object' && '$formula' in v ? new CellFormula(v.$formula) : v);
      idCounter = data.idCounter;
      sheetIdCounter = data.sheetIdCounter;
      boundId = data.boundId;
      drive.items.clear();
      for (const x of data.drive) drive.items.set(x.id, Object.assign({}, x, { bytes: x.bytes ? Buffer.from(x.bytes, 'base64') : null }));
      books.clear();
      for (const b of data.books) {
        const book = { id: b.id, name: b.name, sheets: [] };
        for (const s of b.sheets) {
          const sheet = new SheetModel(book, s.name, s.maxRows, s.maxCols);
          Object.assign(sheet, { sheetId: s.sheetId, frozenRows: s.frozenRows, hidden: s.hidden, tabColor: s.tabColor, colWidths: s.colWidths });
          sheet.rows = s.rows.map((row) => (row ? row.map(untag) : undefined));
          sheet.fmt = new Map(s.fmt);
          sheet.notes = new Map(s.notes);
          sheet.rules = new Map(s.rules);
          book.sheets.push(sheet);
        }
        books.set(book.id, book);
      }
      scriptProps.clear();
      for (const [k, v] of data.scriptProps) scriptProps.set(k, v);
      userProps.clear();
      for (const [e, entries] of data.userProps) userProps.set(e, new Map(entries));
      cache.clear();
      for (const [k, e] of data.cache) cache.set(k, e);
      drive.handovers.length = 0;
      for (const x of data.handovers || []) drive.handovers.push(x);
    }
  };

  return { globals, control, admin, state, ALLOWED };
}

module.exports = { createFakeGas, ALLOWED, FORBIDDEN_GLOBALS, colLetter };
