/* =============================================================================
   real_server.js: loads the REAL apps-script/Model.gs, Flow.gs and
   PanelServer.gs into Node, in a fresh, private space, so the bench can run
   PanelServer.gs's own route-table function (panelRouteTable) and its
   live-kinds helper (PP_liveIdsOf_) exactly as Google would. TEST TOOLING ONLY
   (tests/panel/; never published).

   Why a fresh space for every use: Google runs every call of the panel in a
   new, empty copy of the script, so nothing one call teaches the route code
   (a kind of question added in web/js/types/) is left over for the next.

   What it stands in for: the few Code.gs helpers these functions use
   (PP_requireAdminCaller_, PP_permissionError_, PP_text_, PP_isPlainObject_,
   PP_own_, PP_plain_). Nothing here talks to Google, a Sheet or the internet.

   Use:
     const { loadRealServer } = require('./real_server');
     const server = loadRealServer(repo, {
       flowText,      // optional: another Flow.gs text (for example one from before the route table)
       noFlow,        // optional: true = the Apps Script project has no Flow file at all
       addedTypes,    // optional: Model.gs's PP_ADDED_TYPES_ as "node scripts/flow.js types --write"
                      // would make it with a kind added in web/js/types/ (the kinds' "catalogue" entries)
       admin          // optional: false = the caller is not allowed (PP_requireAdminCaller_ refuses)
     });
     server.call('panelRouteTable', [{ tool: 'status' }]);   // a JSON copy of the answer; errors are thrown
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* The message Code.gs PP_requireAdminCaller_ stops with outside the Sheet (21 Oct 2026). */
const NOT_ADMIN = 'This can only be done from the Partner Pulse Sheet itself (its menu or the control panel), ' +
  'by someone who can edit the Sheet.';

function loadRealServer(repo, opts) {
  const o = opts || {};
  const read = (name) => fs.readFileSync(path.join(repo, 'apps-script', name), 'utf8');
  const ctx = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    PP_requireAdminCaller_() { if (o.admin === false) throw new Error(NOT_ADMIN); },
    PP_permissionError_() { return null; },
    PP_text_(v) { return v === null || v === undefined ? '' : String(v); },
    PP_isPlainObject_(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); },
    PP_own_(obj, key) { return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key); },
    PP_plain_(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  });
  vm.runInContext(read('Model.gs'), ctx, { filename: 'Model.gs' });
  if (!o.noFlow) vm.runInContext(typeof o.flowText === 'string' ? o.flowText : read('Flow.gs'), ctx, { filename: 'Flow.gs' });
  vm.runInContext(read('PanelServer.gs'), ctx, { filename: 'PanelServer.gs' });
  if (Array.isArray(o.addedTypes)) ctx.PP_ADDED_TYPES_ = JSON.parse(JSON.stringify(o.addedTypes));
  /* Arguments and answers cross as JSON copies, as google.script.run sends them. */
  const call = (name, args) => {
    const fn = ctx[name];
    if (typeof fn !== 'function') throw new Error('PanelServer.gs, Model.gs or Flow.gs has no function ' + name);
    const out = fn.apply(null, JSON.parse(JSON.stringify(args || [])));
    return out === undefined ? null : JSON.parse(JSON.stringify(out));
  };
  return { call, ctx };
}

module.exports = { loadRealServer, NOT_ADMIN };
