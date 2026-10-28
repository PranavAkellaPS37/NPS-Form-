/* =============================================================================
   server.js: local test bench for apps-script/Panel.html. TEST TOOLING ONLY.

   Run:   node server.js [port]          (default port 8799)
   Open:  http://localhost:8799/panel    (the panel, with a fake google.script.run)

   What it does
   - GET  /panel        serves the repo's apps-script/Panel.html (read fresh on
                        every request) with <script src="/shim.js"> injected
                        right after <head>, so google.script.run exists first.
   - GET  /shim.js      the fake google.script.run: same chaining API as Google's
                        (withSuccessHandler / withFailureHandler / withUserObject),
                        arguments copied as JSON, calls sent to POST /rpc.
   - POST /rpc          { fn, args } -> fake_backend.callApi -> { ok, result } or
                        { ok:false, error } (a thrown plain-English Error, like
                        PanelServer.gs). Every call waits LATENCY ms, like Google.
   - Test hooks:  POST /control/bump {by, textKey, english}  another admin saved
                  POST /control/fail {fn, message}           next call to fn fails
                  POST /control/open_section {section}       menu hint
                  POST /control/latency {ms}
                  POST /control/webapp {url}                  recorded web app address ('' = none)
                  POST /control/flow_status {form}            what panelFlowStatus finds at the form address:
                                                              'repo' (default), 'unreachable' or a fingerprint
                  POST /control/nohost {}                     next page loads get no google.script.host
                  POST /control/live_unknown {on}             the live codes can't be read (Drive hiccup)
                  POST /control/publish_warnings {warnings}   the next Publish answers these warnings
                  POST /control/model {model}                 a whole draft saved in the Sheet at once
                  POST /control/flow_code {older, failing,    panelFlowCode sends the route code as before 26 Oct 2026,
                           noTable, refused}                  one whose answersAt fails, or one without the route
                                                              table (a Flow.gs from before 27 Oct 2026; the server's
                                                              panelRouteTable then has none either); refused: route
                                                              code the window can't run (panelRouteTable still works,
                                                              unless noTable too)
                  POST /control/screen_types {types}          panelLoad's list of kinds of screen (null: the real one)
                  POST /control/reset
                  GET  /control/state                         server-side state
   Only fake data (DC-DEMO-...) and a bench secret are used.
   ============================================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const backend = require('./fake_backend');

const PANEL = path.join(process.env.PP_REPO || path.resolve(__dirname, '..', '..'), 'apps-script', 'Panel.html');
let LATENCY = Number(process.env.PP_LATENCY || 120);
let NOHOST = false;

const SHIM = () => `/* Fake google.script.run for the local bench (not Google's code). */
(function () {
  var FUNCS = ${JSON.stringify(backend.FUNCTIONS)};
  var NOHOST = ${NOHOST ? 'true' : 'false'};
  /* Asks Panel.html for its read-only test views (see the end of its script). */
  window.__ppTest = {};
  function runner(ok, fail, user) {
    var r = {
      withSuccessHandler: function (f) { return runner(f, fail, user); },
      withFailureHandler: function (f) { return runner(ok, f, user); },
      withUserObject: function (o) { return runner(ok, fail, o); }
    };
    FUNCS.forEach(function (name) {
      r[name] = function () {
        var body = JSON.stringify({ fn: name, args: Array.prototype.slice.call(arguments) });
        window.__ppCalls = (window.__ppCalls || 0) + 1;
        window.__ppPending = (window.__ppPending || 0) + 1;
        fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
          .then(function (res) { return res.json(); })
          .then(function (out) {
            window.__ppPending--;
            if (out.ok) { if (ok) ok(out.result, user); }
            else { var e = new Error(out.error); e.name = 'ScriptError'; if (fail) fail(e, user); }
          }, function () {
            window.__ppPending--;
            if (fail) fail(new Error('NetworkError: Connection failure due to HTTP 0'), user);
          });
      };
    });
    return r;
  }
  /* Google's window controls: the bench only records what the panel asks for
     (window.__ppHost), it prints nothing. */
  window.__ppHost = { height: null, width: null, calls: 0 };
  var host = NOHOST ? undefined : {
    setHeight: function (h) { window.__ppHost.height = h; window.__ppHost.calls++; },
    setWidth: function (w) { window.__ppHost.width = w; window.__ppHost.calls++; },
    close: function () { window.__ppHost.closed = true; }
  };
  window.google = { script: { run: runner(null, null, null), host: host } };
})();
`;

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    /* Collect the raw bytes and decode them once at the end. Decoding each
       network chunk on its own garbled any Hindi (multi-byte) character that
       happened to straddle two chunks, so a saved draft could differ from what
       the panel sent (found and fixed 21 Oct 2026). */
    const parts = [];
    req.on('data', (c) => { parts.push(c); });
    req.on('end', () => {
      const data = Buffer.concat(parts).toString('utf8');
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
    });
  });
}

function panelHtml() {
  const html = fs.readFileSync(PANEL, 'utf8');
  const i = html.indexOf('<head>');
  if (i === -1) throw new Error('Panel.html has no <head>');
  return html.slice(0, i + 6) + '\n<script src="/shim.js"></script>' + html.slice(i + 6);
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/panel') return send(res, 200, 'text/html; charset=utf-8', panelHtml());
  if (req.method === 'GET' && url.pathname === '/shim.js') return send(res, 200, 'text/javascript; charset=utf-8', SHIM());
  if (url.pathname === '/favicon.ico') return send(res, 204, 'image/x-icon', '');
  if (req.method === 'POST' && url.pathname === '/rpc') {
    return readBody(req).then((b) => setTimeout(() => {
      try {
        const result = backend.callApi(b.fn, b.args);
        send(res, 200, 'application/json', JSON.stringify({ ok: true, result }));
      } catch (e) {
        send(res, 200, 'application/json', JSON.stringify({ ok: false, error: e.message }));
      }
    }, LATENCY));
  }
  if (url.pathname.startsWith('/control/')) {
    return readBody(req).then((b) => {
      const what = url.pathname.slice(9);
      let out = { ok: true };
      if (what === 'bump') out = backend.bump(b.by, b.textKey, b.english);
      else if (what === 'fail') backend.failNext(b.fn, b.message || 'Pretend failure from the bench.');
      else if (what === 'open_section') backend.setOpenSection(b.section);
      else if (what === 'latency') LATENCY = Number(b.ms) || 0;
      else if (what === 'webapp') backend.setWebAppUrl(b.url);
      else if (what === 'flow_status') backend.setFormFlow(b.form);
      else if (what === 'nohost') NOHOST = !!(b.on === undefined ? true : b.on);
      else if (what === 'live_unknown') backend.setLiveUnknown(b.on === undefined ? true : b.on);
      else if (what === 'publish_warnings') backend.setPublishWarnings(b.warnings);
      else if (what === 'model') out = backend.setModel(b.model);
      else if (what === 'flow_code') {
        backend.setFlowCode(b.older ? 'older' : b.failing ? 'failing' : b.refused ? (b.noTable ? 'refused_no_table' : 'refused') : b.noTable ? 'no_table' : 'current');
      }
      else if (what === 'screen_types') backend.setScreenTypes(b.types);
      else if (what === 'reset') backend.reset();
      else if (what === 'state') {
        const s = backend.state;
        out = { revision: s.revision, model: s.model, liveVersion: s.liveVersion, webAppUrl: s.webAppUrl, previewKeys: s.previewKeys, published: s.published.map((p) => ({ version: p.version, note: p.doc.note })), links: s.links.length, calls: s.calls.slice(), formFlow: s.formFlow };
      } else return send(res, 404, 'text/plain', 'unknown control');
      send(res, 200, 'application/json', JSON.stringify(out));
    });
  }
  send(res, 404, 'text/plain', 'not found');
}

function start(port) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };

if (require.main === module) {
  const port = Number(process.argv[2] || 8799);
  start(port).then(() => console.log('Panel bench on http://localhost:' + port + '/panel  (Ctrl+C to stop)'));
}
