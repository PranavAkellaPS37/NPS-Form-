#!/usr/bin/env node
/* =============================================================================
   server.js  -  a local "Google" for the Partner Pulse form and control panel

   WHAT THIS FILE IS
     A small web server on this Mac that plays Google's part, so the whole
     Phase 2 system can be tried end to end without a Google account:
       - the PUBLIC WEB APP (Apps Script's /exec address): GET and POST
         requests are handed to doGet(e) / doPost(e) of the project's .gs
         files, exactly shaped like Google's (e.parameter, e.postData ...),
         and the answer comes back as JSON with Access-Control-Allow-Origin: *.
         Like Google, it answers with a redirect (302) to a second address that
         serves the JSON, and it refuses CORS "preflight" (OPTIONS) requests.
       - THE FORM: the files of web/ at http://127.0.0.1:<port>/ . The file
         config/survey.json is changed on the fly (only in what is sent to the
         browser, never on disk) so the form talks to this server's /exec.
       - THE CONTROL PANEL: apps-script/Panel.html at /panel, with a stand-in
         for google.script.run: every call goes to /rpc/<function> and runs
         that function of the .gs files as the admin user.
       - LOOKING INSIDE: /debug lists pages that show the fake spreadsheets,
         Drive files, Script Properties, cache, dialogs and logs as JSON.

   HOW TO RUN IT (Terminal, in this folder)
       node server.js --setup --open-round 2026-R1 --dcs 5
     then open the printed links in Chrome. Stop it with Ctrl+C.
     Options:
       --port 8790          main port (form, panel, /debug); the web app uses
                            port+1 and the redirect target port+2
       --setup              run "Set up or repair" first (accepts every question)
       --open-round ID      open that round (creates its data spreadsheet); a
                            round not in the Rounds list yet (for example
                            SMOKE-R1) is added first
       --dcs N              add N fake DCs (DC-DEMO-001 ...) and make their links
       --state FILE         keep the fake Google in FILE between runs
       --no-redirect        answer /exec directly instead of with a redirect
       --user EMAIL         the admin's email (default admin@example.com)
       --apps-script-dir D  test another copy of the .gs files
       --echo-console       also print the code's console.log lines here

   WHAT IT READS
     the project's web/ (the form) and apps-script/ (the code). It never
     changes them.
   WHAT IT WRITES
     Only the --state file, if you ask for one. Everything else is in memory.

   SAFETY
     Listens on 127.0.0.1 only (this Mac). Use fake DCs only. The secret it
     shows is a test secret created by the code's own set-up, in memory.
   ============================================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadGas, toClientValue } = require('./load-gas');

const REPO = path.resolve(__dirname, '..', '..');   // the project folder (two levels up from tests/gas-harness/)
const DEFAULT_WEB = path.join(REPO, 'web');
const DEFAULT_GAS = path.join(REPO, 'apps-script');
const FORM_URL = 'https://pranavakellaps37.github.io/NPS-Form-/';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

/* The stand-in for google.script.run injected into Panel.html. */
function panelShim(user) {
  return `<script>
/* ---- Test harness stand-in for google.script.run (not part of Panel.html) ----
   Each call becomes POST /rpc/<function> on the local test server, which runs
   that function of the .gs files as ${user}. Like Google, results arrive later
   (asynchronously); a failure without a failure handler is printed as an error. */
(function () {
  function illegal(value, seen) {
    if (value === null || typeof value !== 'object') return typeof value === 'function';
    if (Object.prototype.toString.call(value) === '[object Date]') return true;
    if (seen.indexOf(value) >= 0) return false;
    seen.push(value);
    return Object.keys(value).some(function (k) { return illegal(value[k], seen); });
  }
  function runner(opts) {
    return new Proxy({}, {
      get: function (target, name) {
        if (name === 'withSuccessHandler') return function (fn) { return runner(Object.assign({}, opts, { ok: fn })); };
        if (name === 'withFailureHandler') return function (fn) { return runner(Object.assign({}, opts, { fail: fn })); };
        if (name === 'withUserObject') return function (obj) { return runner(Object.assign({}, opts, { user: obj })); };
        if (typeof name !== 'string' || name === 'then') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          var fail = function (err) {
            if (opts.fail) opts.fail(err, opts.user);
            else console.error('google.script.run.' + name + ' failed and the panel has no failure handler: ' + err.message);
          };
          if (illegal(args, [])) {
            setTimeout(function () { fail(new Error('Failed due to illegal value in an argument of ' + name + ' (Dates and functions cannot be sent).')); }, 0);
            return;
          }
          window.__harnessRpc = (window.__harnessRpc || 0) + 1;
          fetch('/rpc/' + encodeURIComponent(name), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: args })
          }).then(function (r) { return r.json(); }).then(function (res) {
            window.__harnessRpc -= 1;
            if (res.ok) { if (opts.ok) opts.ok(res.value, opts.user); }
            else { var e = new Error(res.error && res.error.message || 'Unknown error'); e.name = (res.error && res.error.name) || 'ScriptError'; fail(e); }
          }, function (netErr) {
            window.__harnessRpc -= 1;
            fail(new Error('NetworkError: Connection failure due to HTTP 0 (' + netErr + ')'));
          });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runner({});
  /* google.script.host: setHeight/setWidth may be used (only if present) to shrink the dialog
     on a small screen (Panel.html fitToScreen, 20 Oct fix); the sizes asked for are kept in
     window.__harnessHostSizes. close() and editor.focus() are not in the contract. */
  window.__harnessHostSizes = [];
  window.google.script.host = {
    close: function () { console.warn('[harness] google.script.host.close() was called (not in the contract)'); window.__harnessClosed = true; },
    setHeight: function (n) { window.__harnessHostSizes.push(['height', n]); console.info('[harness] google.script.host.setHeight(' + n + ') was called (fits the window to the screen)'); },
    setWidth: function (n) { window.__harnessHostSizes.push(['width', n]); console.info('[harness] google.script.host.setWidth(' + n + ') was called (fits the window to the screen)'); },
    editor: { focus: function () { console.warn('[harness] google.script.host.editor.focus() was called (not in the contract)'); } }
  };
})();
</script>`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { tooLarge: true })); req.destroy(); return; }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function htmlEscape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Build the server. Returns { start(), stop(), harness, ... }. */
function createHarnessServer(options) {
  const o = Object.assign({
    port: 8790, apiPort: null, echoPort: null, host: '127.0.0.1', webDir: DEFAULT_WEB,
    appsScriptDir: DEFAULT_GAS, googleRedirect: true, user: 'admin@example.com', quiet: false,
    stateFile: null, echoConsole: false
  }, options || {});
  const harness = o.harness || loadGas({ appsScriptDir: o.appsScriptDir, adminEmail: o.user, echoConsole: o.echoConsole });
  const requests = [];      // every /exec request
  const rpcCalls = [];      // every /rpc call
  const problems = [];      // contract problems seen by the server (HTML answers, Dates to the panel ...)
  const echoStore = new Map();
  const servers = [];
  const ports = { main: null, api: null, echo: null };
  let saveTimer = null;

  const log = (line) => { if (!o.quiet) process.stdout.write(`${new Date().toTimeString().slice(0, 8)}  ${line}\n`); };
  const execUrl = () => `http://${o.host}:${ports.api}/exec`;
  const baseUrl = () => `http://${o.host}:${ports.main}/`;

  if (o.stateFile && fs.existsSync(o.stateFile)) {
    harness.admin.importState(JSON.parse(fs.readFileSync(o.stateFile, 'utf8')));
    log(`Loaded the saved fake Google from ${o.stateFile}`);
  }
  function saveSoon() {
    if (!o.stateFile) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(o.stateFile, JSON.stringify(harness.admin.exportState())); } catch (e) { log('Could not save state: ' + e.message); }
    }, 300);
  }

  function send(res, status, type, body, extra) {
    res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {}));
    res.end(body);
  }
  const sendJson = (res, status, data, extra) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data, null, 1), extra);

  /* ---- the web app (/exec) ---------------------------------------------- */
  function makeEvent(url, req, body) {
    const parameter = {};
    const parameters = {};
    const add = (k, v) => { if (!(k in parameter)) parameter[k] = v; (parameters[k] = parameters[k] || []).push(v); };
    for (const [k, v] of url.searchParams) add(k, v);
    const e = { parameter, parameters, queryString: url.search.slice(1), contextPath: '', contentLength: -1 };
    if (body !== null) {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
      const text = body.toString('utf8');
      e.postData = { contents: text, length: body.length, type, name: 'postData' };
      e.contentLength = body.length;
      if (type === 'application/x-www-form-urlencoded') for (const [k, v] of new URLSearchParams(text)) add(k, v);
    }
    return e;
  }

  function interpret(fn, result) {
    if (!result.ok) {
      const where = result.error.where ? ` (${result.error.where})` : '';
      problems.push({ kind: 'threw', fn, message: result.error.message, where: result.error.where });
      return { status: 200, type: 'text/html; charset=utf-8', ok: false,
        summary: `${fn} THREW: ${result.error.message}${where}`,
        body: `<!DOCTYPE html><html><head><title>Error</title></head><body><div>${htmlEscape(result.error.name)}: ` +
          `${htmlEscape(result.error.message)}${htmlEscape(where)}</div></body></html>` };
    }
    const out = harness.admin.unwrapOutput(result.value);
    if (out && out.kind === 'text') {
      let summary = '';
      try { const j = JSON.parse(out.content); summary = j.ok ? 'ok' : `ok:false ${j.error || ''}${j.message ? ' (' + j.message + ')' : ''}`; } catch (e) { summary = 'not JSON'; }
      if (!out.mime || out.mime.name !== 'JSON') problems.push({ kind: 'mime', fn, message: `${fn} answered with mime type ${out.mime && out.mime.name} instead of JSON` });
      return { status: 200, type: `${out.mime ? out.mime.mime : 'text/plain'}; charset=utf-8`, body: out.content, ok: true, summary };
    }
    if (out && out.kind === 'html') {
      problems.push({ kind: 'html', fn, message: `${fn} returned a web page; the contract says JSON only` });
      return { status: 200, type: 'text/html; charset=utf-8', body: out.content, ok: false, summary: 'returned HTML' };
    }
    problems.push({ kind: 'nothing', fn, message: `${fn} returned nothing (Google shows "The script completed but did not return anything.")` });
    return { status: 200, type: 'text/html; charset=utf-8', ok: false, summary: 'returned nothing',
      body: '<!DOCTYPE html><html><body>The script completed but did not return anything.</body></html>' };
  }

  async function handleExec(req, res, url) {
    if (req.method === 'OPTIONS') {
      requests.push({ at: new Date().toISOString(), method: 'OPTIONS', path: url.pathname, summary: 'preflight refused' });
      problems.push({ kind: 'preflight', fn: 'browser', message: 'The browser sent a CORS preflight (OPTIONS) to /exec. Google cannot answer these, so the real request would be blocked.' });
      log('EXEC OPTIONS  refused (Google does not answer CORS preflight requests)');
      return send(res, 405, 'text/plain; charset=utf-8', 'Apps Script does not answer OPTIONS (CORS preflight) requests.');
    }
    if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, 'text/plain', 'Method not allowed');
    let body = null;
    if (req.method === 'POST') {
      try { body = await readBody(req, 60 * 1024 * 1024); } catch (e) { return send(res, 413, 'text/plain', 'Too large'); }
    }
    const event = makeEvent(url, req, body);
    const fn = req.method === 'GET' ? 'doGet' : 'doPost';
    const result = harness.exec(fn, [event], { context: 'webapp' });
    const out = interpret(fn, result);
    let label = '';
    if (fn === 'doGet') label = `action=${event.parameter.action || ''} round=${event.parameter.round || ''}${event.parameter.draft ? ' draft=' + event.parameter.draft : ''}`;
    else { try { const m = JSON.parse(event.postData.contents); label = `${m.kind}${m.stage ? ' ' + m.stage : ''} ${m.dc || ''} ${m.round || ''}`; } catch (e) { label = `(${event.postData.length} bytes, not JSON)`; } }
    const entry = { at: new Date().toISOString(), method: req.method, fn, label, ms: result.ms, summary: out.summary,
      bytes: body ? body.length : 0, params: event.parameter, origin: req.headers.origin || null, type: event.postData ? event.postData.type : null };
    requests.push(entry);
    if (requests.length > 2000) requests.shift();
    log(`EXEC ${req.method.padEnd(4)} ${label.padEnd(40)} -> ${out.summary} (${result.ms} ms)`);
    saveSoon();
    const cors = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
    if (o.googleRedirect) {
      const key = crypto.randomBytes(12).toString('base64url');
      echoStore.set(key, { out, expires: Date.now() + 60000 });
      for (const [k, v] of echoStore) if (v.expires < Date.now()) echoStore.delete(k);
      res.writeHead(302, Object.assign({ Location: `http://${o.host}:${ports.echo}/macros/echo?user_content_key=${key}&lib=FAKE`,
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate' }, cors));
      return res.end();
    }
    return send(res, out.status, out.type, out.body, cors);
  }

  function handleEcho(req, res, url) {
    const item = echoStore.get(url.searchParams.get('user_content_key') || '');
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (!item || item.expires < Date.now()) return send(res, 404, 'text/html', '<p>Sorry, unable to open the file at this time.</p>', cors);
    return send(res, item.out.status, item.out.type, item.out.body, cors);
  }

  /* ---- the form ---------------------------------------------------------- */
  function serveWeb(req, res, pathname) {
    const decoded = decodeURIComponent(pathname);
    const parts = decoded.split('/').filter(Boolean);
    if (parts.some((p) => p.startsWith('.')) || decoded.includes('\0')) return send(res, 404, 'text/plain', 'Not found');
    let file = path.join(o.webDir, ...parts);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(o.webDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'text/plain', 'Not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (parts.join('/') === 'config/survey.json') {
      try {
        const survey = JSON.parse(fs.readFileSync(file, 'utf8'));
        survey.backend = Object.assign({}, survey.backend, { mode: 'apps_script', apps_script_url: execUrl() });
        return send(res, 200, type, JSON.stringify(survey, null, 2));
      } catch (e) {
        return send(res, 500, 'text/plain', 'web/config/survey.json is not valid JSON: ' + e.message);
      }
    }
    return send(res, 200, type, req.method === 'HEAD' ? '' : fs.readFileSync(file));
  }

  /* ---- the control panel --------------------------------------------------- */
  function servePanel(res) {
    const file = path.join(o.appsScriptDir, 'Panel.html');
    if (!fs.existsSync(file)) return send(res, 404, 'text/html; charset=utf-8', '<p>apps-script/Panel.html does not exist yet.</p>');
    let html = fs.readFileSync(file, 'utf8');
    const shim = panelShim(o.user);
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + '\n' + shim);
    else html = shim + html;
    return send(res, 200, 'text/html; charset=utf-8', html);
  }

  async function handleRpc(req, res, name) {
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'POST only');
    let args = [];
    try {
      const body = JSON.parse((await readBody(req, 60 * 1024 * 1024)).toString('utf8') || '{}');
      args = Array.isArray(body.args) ? body.args : [];
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: { name: 'Error', message: 'The harness could not read the call: ' + e.message } });
    }
    let reply;
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || /_$/.test(name)) {
      reply = { ok: false, error: { name: 'ScriptError', message: `Script function not found: ${name}` } };
    } else {
      const result = harness.exec(name, args, { context: 'panel', user: o.user });
      if (result.ok) {
        const client = toClientValue(result.value);
        if (client.problems.length) {
          problems.push({ kind: 'panel-value', fn: name, message: `${name} returned ${client.problems.join(', ')}` +
            (client.value === null ? ' (Google then delivers null to the panel)' : '') });
        }
        reply = { ok: true, value: client.value, problems: client.problems };
      } else {
        reply = { ok: false, error: { name: result.error.name, message: result.error.message, where: result.error.where } };
      }
      rpcCalls.push({ at: new Date().toISOString(), name, ms: result.ms, ok: result.ok, error: result.ok ? null : result.error.message,
        where: result.ok ? null : result.error.where, problems: reply.problems || [] });
      if (rpcCalls.length > 2000) rpcCalls.shift();
      log(`RPC  ${name.padEnd(24)} -> ${result.ok ? 'ok' : 'THREW: ' + result.error.message} (${result.ms} ms)`);
      saveSoon();
    }
    return sendJson(res, 200, reply);
  }

  /* ---- looking inside -------------------------------------------------------- */
  function debugIndex(res) {
    const links = [
      ['/', 'The form (needs ?dc=..&t=..&round=.. from a generated link)'],
      ['/panel', 'The control panel (Panel.html with the google.script.run stand-in)'],
      ['/debug/spreadsheets', 'All fake spreadsheets (list)'], ['/debug/spreadsheet?name=Valmo%20Partner%20Pulse%20-%20Control', 'The control Sheet (all tabs)'],
      ['/debug/drive', 'Fake Google Drive'], ['/debug/properties', 'Script and user properties'], ['/debug/cache', 'Script cache'],
      ['/debug/requests', 'Requests to /exec'], ['/debug/rpc', 'Control panel calls'], ['/debug/ui', 'Menus and dialogs'],
      ['/debug/logs', 'console.log of the code'], ['/debug/contract', 'Contract problems and methods outside the list'],
      ['/debug/executions', 'Recent executions'], ['/debug/state', 'Everything at once']
    ];
    const items = links.map(([href, text]) => `<li><a href="${href}">${htmlEscape(href)}</a> ${htmlEscape(text)}</li>`).join('');
    send(res, 200, 'text/html; charset=utf-8', `<!doctype html><meta charset="utf-8"><title>Partner Pulse test harness</title>
      <body style="font:15px/1.5 system-ui;margin:24px;max-width:900px"><h1>Partner Pulse: local test harness</h1>
      <p>Web app (Apps Script /exec stand-in): <code>${htmlEscape(execUrl())}</code></p><ul>${items}</ul>
      <p>POST /debug/run/&lt;function&gt; with {"args": [...]} runs any function as the admin (menu context).</p></body>`);
  }

  async function handleDebug(req, res, url) {
    const what = url.pathname.replace(/^\/debug\/?/, '');
    const A = harness.admin;
    if (req.method === 'POST' && what.startsWith('run/')) {
      const name = what.slice(4);
      let args = [];
      try { args = JSON.parse((await readBody(req, 10 * 1024 * 1024)).toString('utf8') || '{}').args || []; } catch (e) { /* none */ }
      const r = harness.exec(name, args, { context: 'menu', user: o.user });
      saveSoon();
      return sendJson(res, 200, r.ok ? { ok: true, value: toClientValue(r.value).value, ms: r.ms } : { ok: false, error: r.error });
    }
    switch (what) {
      case '': return debugIndex(res);
      case 'state': return sendJson(res, 200, A.dump());
      case 'spreadsheets': return sendJson(res, 200, A.books().map((b) => ({ id: b.id, name: b.name, tabs: b.sheets.map((s) => s.name),
        drivePath: A.drive.path(b.id), link: `/debug/spreadsheet?id=${encodeURIComponent(b.id)}` })));
      case 'spreadsheet': return sendJson(res, 200, A.dumpBook(url.searchParams.get('id') || url.searchParams.get('name')) || { error: 'not found' });
      case 'drive': return sendJson(res, 200, A.dumpDrive());
      case 'file': {
        const item = A.drive.byId(url.searchParams.get('id') || '');
        if (!item || !item.bytes) return send(res, 404, 'text/plain', 'No such file');
        return send(res, 200, item.mimeType || 'application/octet-stream', item.bytes);
      }
      case 'properties': return sendJson(res, 200, { script: Object.fromEntries(A.props.script),
        user: Object.fromEntries(Array.from(new Set([o.user])).map((e) => [e, Object.fromEntries(A.props.user(e))])) });
      case 'cache': return sendJson(res, 200, A.cache.entries().map((e) => Object.assign({}, e, { value: e.value.length > 500 ? e.value.slice(0, 500) + '…' : e.value })));
      case 'requests': return sendJson(res, 200, requests.slice(-300));
      case 'rpc': return sendJson(res, 200, rpcCalls.slice(-300));
      case 'ui': return sendJson(res, 200, { menus: Array.from(A.ui.menus.values()), log: A.ui.log.map((x) => Object.assign({}, x, { content: x.content ? `(${x.content.length} characters)` : undefined })) });
      case 'logs': return sendJson(res, 200, harness.state.logs.slice(-500));
      case 'contract': return sendJson(res, 200, { violations: harness.state.violations, serverProblems: problems,
        outsideContract: Array.from(harness.state.offContract.entries()).map(([k, v]) => ({ method: k, count: v.count, where: v.where, functions: Array.from(v.fns) })),
        warnings: harness.state.warnings.filter((w) => w.fn) });
      case 'executions': return sendJson(res, 200, harness.state.executions.slice(-100).map((r) => ({ fn: r.fn, context: r.context, ms: r.ms,
        uses: Object.fromEntries(r.uses), writes: Object.fromEntries(r.writes), lockLeftHeld: !!r.lockLeftHeld })));
      default: return send(res, 404, 'text/plain', 'Unknown debug page. See /debug');
    }
  }

  async function route(req, res, which) {
    const url = new URL(req.url, `http://${req.headers.host || o.host}`);
    try {
      if (url.pathname === '/exec' || url.pathname === '/exec/') return await handleExec(req, res, url);
      if (url.pathname === '/macros/echo') return handleEcho(req, res, url);
      if (which !== 'main') return send(res, 404, 'text/plain', 'Not found');
      // Browsers ask for /favicon.ico by themselves (Google's dialog never does): answer "nothing".
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (url.pathname === '/panel' || url.pathname === '/panel/') return servePanel(res);
      if (url.pathname.startsWith('/rpc/')) return await handleRpc(req, res, decodeURIComponent(url.pathname.slice(5)));
      if (url.pathname === '/debug' || url.pathname.startsWith('/debug/') || url.pathname === '/harness') return await handleDebug(req, res, url);
      return serveWeb(req, res, url.pathname);
    } catch (err) {
      log('HARNESS ERROR ' + (err && err.stack));
      return send(res, 500, 'text/plain', 'Harness error: ' + (err && err.message));
    }
  }

  function listen(which, port) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => { route(req, res, which); });
      srv.keepAliveTimeout = 1000;
      srv.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          err.message = `Port ${err.port} is already used by another program on this Mac. Use another port (--port).`;
        }
        reject(err);
      });
      srv.listen(port || 0, o.host, () => { servers.push(srv); resolve(srv.address().port); });
    });
  }

  async function start() {
    ports.main = await listen('main', o.port);
    ports.api = await listen('api', o.apiPort !== null ? o.apiPort : (o.port ? o.port + 1 : 0));
    ports.echo = await listen('echo', o.echoPort !== null ? o.echoPort : (o.port ? o.port + 2 : 0));
    harness.control.setScriptUrl(execUrl());
    return { base: baseUrl(), exec: execUrl(), panel: baseUrl() + 'panel', debug: baseUrl() + 'debug' };
  }

  async function stop() {
    clearTimeout(saveTimer);
    if (o.stateFile) { try { fs.writeFileSync(o.stateFile, JSON.stringify(harness.admin.exportState())); } catch (e) { /* ignore */ } }
    await Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections && s.closeAllConnections(); s.close(() => r()); })));
    servers.length = 0;
  }

  /* A link made by the panel (https://pranavakellaps37.github.io/NPS-Form-/?...)
     rewritten to this server (http://127.0.0.1:<port>/?...). */
  function localLink(link) {
    const i = String(link).indexOf('?');
    return baseUrl() + (i >= 0 ? link.slice(i) : '');
  }

  return { start, stop, harness, requests, rpcCalls, problems, ports, execUrl, baseUrl, localLink, options: o };
}

/* ---------------------------------------------------------------------------
   Command line
   --------------------------------------------------------------------------- */
function parseArgs(argv) {
  const a = { port: 8790, setup: false, openRound: null, dcs: 0, state: null, redirect: true, user: 'admin@example.com',
    appsScriptDir: DEFAULT_GAS, webDir: DEFAULT_WEB, echoConsole: false };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--port') a.port = Number(next());
    else if (k === '--setup') a.setup = true;
    else if (k === '--open-round') a.openRound = next();
    else if (k === '--dcs') a.dcs = Number(next());
    else if (k === '--state') a.state = path.resolve(next());
    else if (k === '--no-redirect') a.redirect = false;
    else if (k === '--user') a.user = next();
    else if (k === '--apps-script-dir') a.appsScriptDir = path.resolve(next());
    else if (k === '--web-dir') a.webDir = path.resolve(next());
    else if (k === '--echo-console') a.echoConsole = true;
    else if (k === '--help' || k === '-h') { a.help = true; }
    else { process.stderr.write(`Unknown option ${k}. Try --help\n`); process.exit(2); }
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  process.on('uncaughtException', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      process.stderr.write(`Port ${err.port} is already used by another program on this Mac. ` +
        `Start again with another port, for example: node server.js --port ${a.port + 10}\n`);
      process.exit(1);
    }
    throw err;
  });
  if (a.help) {
    const header = fs.readFileSync(__filename, 'utf8').split('*/')[0];
    process.stdout.write(header.replace(/^\/\*/, '') + '\n');
    return;
  }
  const srv = createHarnessServer({ port: a.port, googleRedirect: a.redirect, user: a.user, appsScriptDir: a.appsScriptDir,
    webDir: a.webDir, stateFile: a.state, echoConsole: a.echoConsole });
  const h = srv.harness;
  if (h.loadErrors.length) {
    for (const e of h.loadErrors) process.stdout.write(`PROBLEM loading ${e.file}: ${e.message} ${e.where || ''}\n`);
  }
  const urls = await srv.start();
  const run = (fn, args) => {
    const r = h.exec(fn, args || [], { context: fn === 'ppSetup' ? 'menu' : 'panel', user: a.user });
    process.stdout.write(`${fn}: ${r.ok ? 'done' : 'FAILED: ' + r.error.message + (r.error.where ? ' at ' + r.error.where : '')}\n`);
    return r;
  };
  if (a.setup) {
    run('ppSetup');
    const last = h.admin.ui.log.filter((x) => x.kind === 'alert').slice(-1)[0];
    if (last) process.stdout.write(`  Set-up said: ${String(last.message).split('\n').slice(0, 6).join(' | ')}\n`);
  }
  const secret = h.admin.props.script.get('LINK_SECRET');
  if (secret) process.stdout.write(`Link secret (a test secret made by set-up in memory; for the smoke test's --secret): ${secret}\n`);
  if (a.dcs > 0) {
    const langs = ['hi', 'en', 'ta', 'te', 'kn', 'ml'];
    const rows = [];
    for (let i = 1; i <= a.dcs; i += 1) rows.push([`DC-DEMO-${String(i).padStart(3, '0')}`, `Demo DC ${i}`, 'Demo State', 'Demo Region', langs[(i - 1) % langs.length], true]);
    h.admin.writeRows(null, 'DCs', 2, rows);
    process.stdout.write(`Added ${a.dcs} fake DCs to the DCs tab.\n`);
  }
  if (a.openRound) {
    // A round that is not in the Rounds list yet (for example SMOKE-R1 for the
    // smoke test) is added first, the way an admin adds it in the panel.
    const loaded = h.exec('panelLoad', [], { context: 'panel', user: a.user });
    if (loaded.ok && !loaded.value.model.rounds.some((r) => r.id === a.openRound)) {
      const model = loaded.value.model;
      model.rounds.push({ id: a.openRound, status: 'draft', opens_on: '', closes_on: '', data_sheet: '', audio_folder: '', notes: 'added by server.js --open-round' });
      run('panelSave', [loaded.value.revision, model]);
    }
    run('panelSetRoundStatus', [a.openRound, 'open', /DEMO/i.test(a.openRound)]);
    if (a.dcs > 0) {
      const r = run('panelGenerateLinks', [a.openRound, { only_missing: true }]);
      if (r.ok && r.value && r.value.csv) {
        const lines = String(r.value.csv).trim().split('\n').slice(1, 4);
        process.stdout.write('Some partner links (rewritten to this Mac):\n');
        for (const line of lines) {
          const link = line.split(',').pop().replace(/^"|"$/g, '');
          process.stdout.write('  ' + srv.localLink(link) + '\n');
        }
      }
    }
  }
  process.stdout.write(`\nForm:           ${urls.base}  (open a partner link like the ones above)\n`);
  process.stdout.write(`Control panel:  ${urls.panel}\n`);
  process.stdout.write(`Web app (/exec): ${urls.exec}\n`);
  process.stdout.write(`Look inside:    ${urls.debug}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n\n');
  const shutdown = async () => { process.stdout.write('\nStopping...\n'); await srv.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write((e && e.code === 'EADDRINUSE' ? e.message : String(e && e.stack)) + '\n');
    process.exit(1);
  });
}

module.exports = { createHarnessServer, panelShim, FORM_URL };
