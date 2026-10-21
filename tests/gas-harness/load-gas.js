/* =============================================================================
   load-gas.js  -  load the project's Apps Script files into the pretend Google

   WHAT THIS FILE IS
     Google Apps Script runs all the .gs files of a project in ONE shared
     space: a function written in Model.gs can be called from Code.gs. And
     every "execution" (a menu click, a google.script.run call from the panel,
     one web request) starts with a FRESH copy of that space: Google loads the
     files again, so nothing kept in a global variable survives from one
     execution to the next. Only the Google services (Sheets, Drive,
     properties, cache) remember things.

     This file recreates exactly that on this Mac: it reads every
     apps-script/*.gs file (Code, Model, PanelServer first, in the order the setup
     guide creates them), and for every execution runs them in a new sealed-off
     JavaScript space ("vm context") together with the pretend Google services
     from fake-gas.js, which keep their data between executions.

   HOW TO USE IT
     const { loadGas } = require('./load-gas');
     const h = loadGas({ appsScriptDir: path.resolve(__dirname, '../../apps-script') });
     if (h.loadErrors.length) console.log(h.loadErrors);   // a file did not load
     const r = h.exec('panelLoad', [], { context: 'panel' });
     // r = { ok: true, value, ms, run } or { ok: false, error: { message, where } }
     h.admin   -> look inside the fake spreadsheets, Drive, properties, cache
     h.control -> scripted dialog answers, busy lock, clock

   CONTEXTS (how the code is being run, like in Google)
     'menu'          a menu item / the Apps Script editor (dialogs allowed)
     'panel'         a google.script.run call from the control panel
     'webapp'        the public web app (doGet/doPost): no dialogs, no user
     'simpleTrigger' onOpen when the Sheet opens: no Drive, no UrlFetch

   WHAT IT READS
     apps-script/*.gs (the code under test) and apps-script/appsscript.json
     (only to learn the script's time zone). It never changes them.
   WHAT IT WRITES
     Nothing.

   SAFETY
     The code runs in a sealed space: it cannot reach this Mac's files, the
     network or Node.js. It only sees the pretend Google services.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createFakeGas } = require('./fake-gas');

const DEFAULT_DIR = path.resolve(__dirname, '..', '..', 'apps-script');   // the project's apps-script/ folder
const FIRST_FILES = ['Code.gs', 'Model.gs', 'PanelServer.gs'];

/* The .gs files in the order Google would load them for a copy-paste setup. */
function listGsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const all = fs.readdirSync(dir).filter((f) => /\.gs$/i.test(f)).sort();
  const first = FIRST_FILES.filter((f) => all.indexOf(f) !== -1);
  return first.concat(all.filter((f) => first.indexOf(f) === -1)).map((f) => path.join(dir, f));
}

/* The first line of an error's stack that points into a .gs file. */
function gsWhere(err) {
  const lines = String((err && err.stack) || '').split('\n');
  const line = lines.find((l) => /\.gs:\d+/.test(l));
  return line ? line.trim().replace(/^at\s+/, '') : null;
}

function describeError(err) {
  if (!err || typeof err !== 'object') return { name: 'Error', message: String(err), where: null };
  return {
    name: err.name || 'Error',
    message: String(err.message),
    where: gsWhere(err),
    stack: String(err.stack || '').split('\n').filter((l) => /\.gs:\d+|harness/.test(l)).slice(0, 8).join('\n')
  };
}

/* What google.script.run delivers to the browser: Google sends JSON-like data
   only. If the result contains a Date anywhere, the browser receives null
   (a classic Apps Script surprise), so we copy that and report it. */
function toClientValue(value) {
  const problems = [];
  const seen = new Set();
  (function walk(v, at) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function') problems.push(`a function at ${at}`);
      if (typeof v === 'number' && !Number.isFinite(v)) problems.push(`the number ${v} at ${at}`);
      return;
    }
    if (Object.prototype.toString.call(v) === '[object Date]') { problems.push(`a Date object at ${at}`); return; }
    if (seen.has(v)) return;
    seen.add(v);
    for (const k of Object.keys(v)) walk(v[k], at + (Array.isArray(v) ? `[${k}]` : `.${k}`));
  })(value, 'result');
  const hasDate = problems.some((p) => /Date/.test(p));
  if (value === undefined) return { value: null, problems };
  return { value: hasDate ? null : JSON.parse(JSON.stringify(value)), problems };
}

function readTimeZone(dir) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'appsscript.json'), 'utf8'));
    return manifest.timeZone || null;
  } catch (e) {
    return null;
  }
}

/* Build a fresh pretend Google with the project's code loaded into it. */
function loadGas(options) {
  const o = Object.assign({ appsScriptDir: DEFAULT_DIR, freshGlobals: true }, options || {});
  const tz = o.timeZone || readTimeZone(o.appsScriptDir) || 'Asia/Kolkata';
  // Apps Script's own clock follows the script's time zone (new Date().getHours()).
  if (o.setProcessTimeZone !== false) process.env.TZ = tz;

  const gas = createFakeGas(Object.assign({}, o, { timeZone: tz }));

  // Compile every file once (Google also checks the syntax when you save).
  const files = listGsFiles(o.appsScriptDir);
  const sources = {};
  const compiled = [];
  const compileErrors = [];
  for (const file of files) {
    const name = path.basename(file);
    const source = fs.readFileSync(file, 'utf8');
    sources[name] = source;
    try {
      compiled.push({ name, script: new vm.Script(source, { filename: name }) });
    } catch (err) {
      compileErrors.push(Object.assign({ file: name }, describeError(err)));
    }
  }

  /* A brand-new global space with the fake services and every file run in it,
     like the start of one Google execution. */
  function newWorld() {
    const sandbox = {};
    const ctx = vm.createContext(sandbox, { name: 'Apps Script (fake)', codeGeneration: { strings: true, wasm: false } });
    const realm = vm.runInContext('({ Array: Array, Object: Object, Date: Date, JSON: JSON, Error: Error })', ctx);
    gas.control.setRealm(realm);
    for (const [name, value] of Object.entries(gas.globals)) sandbox[name] = value;
    const errors = [];
    for (const c of compiled) {
      try {
        c.script.runInContext(ctx, { timeout: 10000 });
      } catch (err) {
        errors.push(Object.assign({ file: c.name }, describeError(err)));
      }
    }
    return { ctx, sandbox, realm, errors };
  }

  gas.control.begin({ fn: '(loading the .gs files)', context: 'editor' });
  let world = newWorld();
  const loadRun = gas.control.end();
  const loadErrors = compileErrors.concat(world.errors);

  function has(name) {
    try {
      return vm.runInContext(`typeof ${name}`, world.ctx) !== 'undefined';
    } catch (e) {
      return false;
    }
  }

  /* The value of a global name (works for const/let too), or undefined. */
  function get(name) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('[harness] get() needs a plain name');
    try {
      return vm.runInContext(`typeof ${name} === 'undefined' ? undefined : ${name}`, world.ctx);
    } catch (e) {
      return undefined;
    }
  }

  /* Run one global function the way Google would: a fresh execution (new
     globals, files loaded again), in a given context. args are copied into
     the code's own JavaScript world first. */
  function exec(fnName, args, execOptions) {
    const eo = Object.assign({ context: 'menu' }, execOptions || {});
    gas.control.begin({ fn: fnName, context: eo.context, user: eo.user, activeUser: eo.activeUser });
    if (o.freshGlobals) world = newWorld();
    const fn = world.sandbox[fnName];
    if (typeof fn !== 'function') {
      let lexical = false;
      try { lexical = vm.runInContext(`typeof ${fnName} === 'function'`, world.ctx); } catch (e) { /* not declared */ }
      const run = gas.control.end();
      const loadProblem = world.errors.length
        ? ` (a .gs file did not load: ${world.errors.map((e) => `${e.file}: ${e.message}`).join('; ')})` : '';
      const message = lexical
        ? `Script function ${fnName} is declared with const/let. Google can only call top-level "function ${fnName}() {}" declarations from menus, google.script.run and the web app.`
        : `Script function not found: ${fnName}${loadProblem}`;
      return { ok: false, error: { name: 'Error', message, where: null }, ms: 0, run, missing: true };
    }
    const realmArgs = (args || []).map((a) => (a === undefined ? undefined : world.realm.JSON.parse(JSON.stringify(a))));
    const started = Date.now();
    try {
      const value = fn.apply(undefined, realmArgs);
      const ms = Date.now() - started;
      const run = gas.control.end();
      return { ok: true, value, ms, run };
    } catch (err) {
      const ms = Date.now() - started;
      const run = gas.control.end();
      return { ok: false, error: describeError(err), ms, run };
    }
  }

  /* The names of all top-level functions the .gs files declare. */
  function functionNames() {
    return Object.keys(world.sandbox).filter((k) => typeof world.sandbox[k] === 'function' && !(k in gas.globals));
  }

  const harness = {
    gas, admin: gas.admin, control: gas.control, state: gas.state,
    files, sources, loadErrors, loadRun, timeZone: tz,
    exec, has, get, functionNames, toClientValue,
    evaluate: (code) => vm.runInContext(code, world.ctx)
  };
  // The current execution's global space (each exec() makes a new one).
  Object.defineProperty(harness, 'sandbox', { get: () => world.sandbox, enumerable: true });
  Object.defineProperty(harness, 'ctx', { get: () => world.ctx, enumerable: true });
  Object.defineProperty(harness, 'realm', { get: () => world.realm, enumerable: true });
  return harness;
}

module.exports = { loadGas, listGsFiles, describeError, toClientValue, DEFAULT_DIR };
