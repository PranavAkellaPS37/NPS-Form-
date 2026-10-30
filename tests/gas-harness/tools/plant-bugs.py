#!/usr/bin/env python3
"""
==============================================================================
 tools/plant-bugs.py  -  proves the tests notice real mistakes
==============================================================================

WHAT THIS FILE IS
  A check of the TEST HARNESS itself ("do the tests bite?"). It copies
  apps-script/ into out/planted/<name>/ (never touching the project),
  plants one known mistake in the copy (for example: a token one character
  short, a swapped column, no token check, test rounds locking the codes
  again), runs the matching scenarios on the copy, and reports:
    CAUGHT       a scenario that passes on the real code now fails, as it should;
    MISSED       nothing failed: the tests did not notice the mistake;
    NOT APPLIED  the code changed, so the mistake's text was not found
                 exactly once: update that line in MUTANTS below.

  First it runs the same scenarios on an unchanged copy (the "baseline").
  Only a scenario that passes there and fails with the mistake counts as
  catching it, so a scenario that already fails can never hide a MISSED.

HOW TO RUN IT (Terminal, in the tests/gas-harness folder of the project)
  python3 tools/plant-bugs.py

  It takes about 30 seconds (no browser). The last line says how many
  mistakes were caught (89 since 30 Oct 2026: 63 when the panel's route
  checks became the one flow checker's, then 7 for config_version, the last
  column of the pings tab, then 8 for the reviewers' fixes: hidden and
  deleted endings, the codes lock per area and per question, Publish during
  a Drive hiccup, set-up's notes and docs/flow.md in the GitHub copy; then 5
  for Panel.html's one exception, the Map's drawing library: its integrity
  hash, its pinned version, its frame's sandbox, and no second library; then
  2 for review W8 of "Paste a route": Flow.gs's run-on note treated as a
  warning, and a live question's kind change not checked. The run-on
  mistake itself moved to Flow.gs that day, where the rule now lives; then
  3 for "pick several" on the Google side: a save that no longer gives the
  Screens tab's type column today's list of kinds, and a list answer
  refused or flattened into one text; then 1 for the review of 30 Oct: a
  save that gives that list only to the rows it writes, not to the empty
  rows below them as set-up does).
  Exit code 0 = every mistake was planted and caught and the baseline had no
  failure; 1 = anything else.

WHAT IT READS / WRITES
  Reads the project's apps-script/ folder. Writes only temporary copies
  in out/planted/ (git ignores out/) and deletes them at the end.

NEEDS
  Python 3.11+ (standard library only) and Node.js (see tests/README.md).
==============================================================================
"""
import os, re, shutil, subprocess, sys

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(os.path.dirname(HARNESS)), 'apps-script')   # the project's apps-script/ (tests/gas-harness/ is two levels down)
WORK = os.path.join(HARNESS, 'out', 'planted')

# (name, file, exact text in the code, what replaces it, scenarios that must catch it, what the mistake means)
# The text must occur exactly once in the file. Texts never include comments, which change more often.
MUTANTS = [
  # ---- the original 11 (19-20 Oct); four texts refreshed on 21 Oct for today's code ----
  ('text-not-protected', 'Code.gs', "return text === '' ? '' : \"'\" + text;", "return text;", 'D8,B3',
   'texts that look like numbers or formulas are no longer kept as text'),
  ('swapped-columns', 'Code.gs', "opened_at: message.opened_at, started_at: message.started_at",
   "opened_at: message.started_at, started_at: message.opened_at", 'D2', 'two columns of the responses tab swapped'),
  ('no-token-check-on-submit', 'Code.gs',
   "  PP_checkSubmit_(message);\n  if (!PP_tokenIsValid_(message)) return { ok: false, error: 'bad_token' };",
   "  PP_checkSubmit_(message);", 'D4', 'a submission with a wrong link token is stored'),
  ('no-row-growth', 'Code.gs',
   "  if (needed > block.maxRows) block.sheet.insertRowsAfter(block.maxRows, needed - block.maxRows + PP_SRV.ROW_GROWTH);\n",
   "", 'D7', 'a full data tab no longer grows'),
  ('token-21-chars', 'Code.gs', ".replace(/=+$/, '').slice(0, 22);", ".replace(/=+$/, '').slice(0, 21);", 'B6',
   'link tokens one character short'),
  ('headers-with-getRange', 'Code.gs',
   "  PP_setColumnCount_(sheet, headers.length);\n  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);",
   "  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);", 'B5,B11',
   'a data tab\'s headers written with getRange before the tab is wide enough'),
  ('draft-ignored', 'Code.gs', "  const doc = draft ? PP_draftDoc_() : PP_liveDoc_();", "  const doc = PP_liveDoc_();", 'C',
   'Preview (draft=1) shows the published version instead of the draft'),
  ('other-chip-allowed', 'Model.gs', "    if (chip.code === 'other') {", "    if (chip.code === 'other-never') {", 'B2',
   'the reserved problem code "other" is accepted'),
  ('no-rate-limit', 'Code.gs', "  if (!PP_pingAllowed_(message.dc, message.round)) return { ok: true };", "", 'D1',
   'pings are no longer limited to 60 per 10 minutes'),
  ('off-contract-method', 'Code.gs', "function PP_answerPost_(e) {", "function PP_answerPost_(e) {\n  SpreadsheetApp.getActive();", 'S,D2',
   'a Google method outside the contract\'s allowed list'),
  ('getUi-in-web-app', 'Code.gs', "function PP_answerPost_(e) {", "function PP_answerPost_(e) {\n  SpreadsheetApp.getUi();", 'D2',
   'a dialog asked for inside the public web app'),
  # ---- the fixes of 20-21 Oct (added 21 Oct) ----
  ('global-MimeType-JSON', 'Code.gs', "'p' + version + '.json', text, 'application/json');",
   "'p' + version + '.json', text, MimeType.JSON);", 'S,A1,B4', 'the 20 Oct publish crash: Google has no MimeType.JSON'),
  ('clearContents-on-a-range', 'Model.gs',
   "    sheet.getRange(count + 2, plan.span.first, plan.lastRow - count - 1, plan.span.width).clearContent();",
   "    sheet.getRange(count + 2, plan.span.first, plan.lastRow - count - 1, plan.span.width).clearContents();", 'G6',
   'the 20 Oct save crash: Google\'s Range has no clearContents'),
  ('admin-uses-script-lock', 'Code.gs', "      lock = LockService.getDocumentLock();", "      lock = null;", 'G1',
   'admins share the partners\' script lock again (no document lock)'),
  ('round-store-without-script-lock', 'PanelServer.gs', "      PP_withStoreLock_(() => PP_saveRoundStatus_(id, status));",
   "      PP_saveRoundStatus_(id, status);", 'G1',
   'opening a round no longer takes the partners\' lock while it creates the data spreadsheet'),
  ('reprompt-never-asked', 'Code.gs', "  if (!PP_hasMethod_(ScriptApp, 'requireAllScopes')) return;", "  return;", 'G2',
   'the menu items never ask Google to re-check the permissions'),
  ('reprompt-guard-removed', 'Code.gs', "    if (/authori[sz]ation|permission|consent/i.test(PP_rawErrorText_(err))) throw err;",
   "    throw err;", 'G2', 'any failure of the permission re-check breaks every menu item'),
  ('no-owner-handover', 'Code.gs', "    item.setOwner(owner);\n", "", 'G3',
   'what a co-admin creates is no longer handed to the owner'),
  ('web-app-url-from-google', 'Code.gs', "  return PP_text_(PP_props_()[PP_SRV.KEYS.WEB_APP_URL]);",
   "  return ScriptApp.getService().getUrl();", 'S,B1,B8,G4', 'the web app address comes from Google\'s getUrl() again'),
  ('export-not-in-test-mode', 'Model.gs', "  const mode = appsScriptUrl ? 'apps_script' : 'mock';", "  const mode = 'apps_script';",
   'B8,G4', 'the GitHub copy without a web app address is no longer in test mode'),
  ('codes-locked-from-the-start', 'Code.gs', "  if (props[PP_SRV.KEYS.ROUNDS_EVER_OPENED] === '1') return true;", "  return true;",
   'B1,B2,G5', 'the codes are locked before any round has opened'),
  ('test-rounds-lock-codes', 'Code.gs', "  return /^(SMOKE|DEMO|TEST)/i.test(String(roundId || ''));", "  return false;", 'G5',
   'test rounds (SMOKE, DEMO, TEST) lock the codes again'),
  ('live-code-warning-gone', 'Code.gs', "  return PP_codesLocked_() ? PP_liveDocForAdmin_() : null;", "  return null;", 'B2,G5',
   'no warning when a code partners have answered disappears from the draft'),
  ('live-ids-never-unknown', 'PanelServer.gs', "      live_ids_unknown: Boolean(locked && !live),",
   "      live_ids_unknown: false,", 'G5', 'a passing Drive problem shows every code as unlocked'),
  ('unpublished-codes-unlocked', 'PanelServer.gs', "      live_ids_unknown: Boolean(locked && !live),",
   "      live_ids_unknown: Boolean(locked && !live && (parseInt(PP_props_()[PP_SRV.KEYS.LIVE_VERSION], 10) || 0) > 0),",
   'G9', 'a real round opened before anything is published shows every code as unlocked'),
  ('clip-check-gone', 'Model.gs', "  PP_mdlCheckClips_(tidy, ctx, report);", "", 'G9',
   'a bad read-aloud clip address passes the panel but fails the GitHub settings check'),
  ('dotted-round-opens', 'PanelServer.gs', "    if ((status === 'open' && !PP_SRV.ROUND_RULE.test(id)) || !PP_isDcOrRound_(id)) {",
   "    if (!PP_isDcOrRound_(id)) {", 'G9', 'a round whose name has a dot can be opened, and then blocks every Publish'),
  ('admin-lock-gone', 'PanelServer.gs', "    PP_requireAdminCaller_();   // Code.gs: only people who can edit the Sheet (21 Oct 2026, Meesho-only mode)",
   "", 'G10', "a web visitor can run the control panel's functions (for example read the link secret) as the owner"),
  ('form-page-gone', 'Code.gs', "  if (PP_wantsFormPage_(params)) return PP_formPage_(params);", "", 'G10',
   'the web app no longer serves the survey page in Meesho-only mode'),
  ('form-page-not-escaped', 'Code.gs', ".replace(/</g, '\\\\u003c')", "", 'G10',
   "link details can break out of the survey page's script"),
  ('company-address-refused', 'PanelServer.gs', "    if (signedIn && signedIn.answer && signedIn.answer.form_page === true) return 'domain';", "", 'G10',
   'Check and save refuses a Meesho-only web app'),
  ('old-code-accepted', 'PanelServer.gs', "    if (signedIn && signedIn.answer && signedIn.answer.form_page === true) return 'domain';",
   "    if (signedIn && signedIn.answer) return 'domain';", 'G10',
   'a Meesho-only web app still running older code is accepted, so its links show raw JSON'),
  ('links-kept-after-switch', 'PanelServer.gs', "  if (row && job.onlyMissing && PP_text_(row[col.link]).indexOf(job.formUrl + '?') === 0) {",
   "  if (row && job.onlyMissing && PP_text_(row[col.link])) {", 'G10',
   'after a switch to or from Meesho-only, "only DCs without a link" keeps links with the old address'),
  ('admin-lock-lets-owner-in', 'Code.gs', "  if (PP_uiOrNull_()) return;",
   "  if (PP_uiOrNull_() || Session.getActiveUser().getEmail() === Session.getEffectiveUser().getEmail()) return;", 'G10',
   "the owner's own visit to a page the web app serves can run admin functions (scripts from GitHub could read the secret)"),
  ('meesho-links-on-github', 'PanelServer.gs', "  return PP_webAppAccess_() === 'domain' ? PP_webAppUrl_() : formUrl;", "  return formUrl;", 'G10',
   "Meesho-only links point at GitHub Pages, which colleagues can't use with a Meesho-only web app"),
  ('date-ids-get-links', 'PanelServer.gs', "    const typedWrong = typeof id === 'number' || id instanceof Date;",
   "    const typedWrong = typeof id === 'number';", 'G9', 'a DC id Sheets turned into a date gets a link'),
  ('auth-message-differs', 'Code.gs',
   "const PP_MSG_AUTHORIZATION_ = 'Google says Partner Pulse needs authorization. Usually Google is using another ' +",
   "const PP_MSG_AUTHORIZATION_ = 'Google says Partner Pulse needs authorization. Most likely Google is using another ' +",
   'G7', 'the "Authorization is required" advice differs between the server and the panel'),
  # refreshed 26 Oct 2026: the nps / support_gate check is the flow checker's D1/D2, told by Model.gs PP_mdlReportDataColumn_
  ('nps-warning-removed', 'Model.gs', "      PP_mdlReportDataColumn_(model, f, report);\n      return;", "      return;", 'G8',
   'nothing said when the nps or support_gate question is deleted, hidden or re-typed'),
  ('empty-round-is-a-change', 'Model.gs',
   "      if (!PP_mdlIsObject_(news) || !Array.isArray(news.items) || !news.items.length) delete doc.whats_changed[roundId];",
   "      if (!PP_mdlIsObject_(news)) delete doc.whats_changed[roundId];", 'G8',
   'a new, empty round counts as an unpublished change again'),
  ('number-ids-get-links', 'PanelServer.gs', "    const typedWrong = typeof id === 'number' || id instanceof Date;",
   "    const typedWrong = false;", 'B6', 'DC ids that Sheets turned into numbers get links again'),
  ('unknown-round-says-unknown', 'Code.gs', "    round: { id: roundId, status: status === 'unknown' ? 'draft' : status },",
   "    round: { id: roundId, status: status },", 'C', 'a round never seen before is not reported as "draft"'),
  # ---- stage 4 of the flow-graph work (23 Oct 2026): the route as a graph ----
  ('publish-guard-gone', 'Code.gs',
   "    if (!guard.ok) return { ok: false, errors: [{ section: 'settings', ref: 'Settings > form_url', message: guard.message }] };\n",
   "", 'G11', 'a graph is published although the form on GitHub is too old to read it'),
  ('guard-needs-no-engine', 'Code.gs', "  const needed = Math.max(PP_SRV.FLOW_ENGINE_NEEDED, PP_flowEngine_() || 0);",
   "  const needed = 0;", 'G11', 'the publish guard accepts a form without ENGINE = 2'),
  ('guard-refuses-unreachable', 'Code.gs', "    return unreachable('Google said: ' + PP_rawErrorText_(err));",
   "    return { ok: false, message: 'The form on GitHub is older than this control panel: upload the new form code first, wait for the green tick, then publish.' };",
   'G11', 'Publish is refused whenever GitHub cannot be reached'),
  ('health-without-route-code', 'Code.gs', ", flow_engine: PP_flowEngine_(), flow_fingerprint: PP_flowFingerprint_() };", " };", 'C,G11',
   'the health answer no longer says which route code the web app runs'),
  ('codes-ever-live-not-recorded', 'Code.gs', "  const kept = PP_recordCodesEverLive_(live, doc);", "  const kept = '';", 'G11',
   'Publish no longer remembers the codes partners answered (the hide-and-publish hole is back)'),
  ('codes-ever-live-misses-previous', 'Code.gs',
   "  const codes = PP_mdlMergeCodes_(PP_mdlMergeCodes_(before, PP_mdlCodesOfDoc_(previousLive)), PP_mdlCodesOfDoc_(doc));",
   "  const codes = PP_mdlMergeCodes_(before, PP_mdlCodesOfDoc_(doc));", 'G11',
   'the codes of the version live until a Publish are not remembered (a question hidden in that Publish loses its lock)'),
  ('union-not-in-panel-lock', 'PanelServer.gs', "      live_ids: PP_liveIdsOf_(locked ? live : null, locked ? PP_codesEverLive_() : null),",
   "      live_ids: PP_liveIdsOf_(locked ? live : null, null),", 'G11', 'the panel unlocks a code that was hidden and published'),
  ('union-not-in-checks', 'PanelServer.gs',
   "    return PP_plain_(PP_validate(PP_normalizedCopy_(model), PP_liveDocForChecks_(), PP_codesEverLiveForChecks_()));",
   "    return PP_plain_(PP_validate(PP_normalizedCopy_(model), PP_liveDocForChecks_()));", 'G11',
   'deleting a question that was hidden and published no longer stops Publish'),
  ('route-columns-not-saved', 'Model.gs',
   "    screen.high_label, screen.scale_hint, screen.body, screen.active, screen.next, PP_mdlJumpsText_(screen.jumps),\n    screen.repeat];",
   "    screen.high_label, screen.scale_hint, screen.body, screen.active, '', '', ''];", 'G11',
   'next, jumps and repeat are lost when the draft is saved'),
  ('flow-still-a-list', 'Model.gs', "  if (Array.isArray(flowNotes)) result.warnings.forEach(note => flowNotes.push(note));\n  return result.graph;",
   "  return PP_mdlList_(model.screens).filter(screen => screen.active).map(screen => ({ id: screen.id, type: screen.type }));",
   'B4,C,G11', 'Publish sends the route as a bare list again (jumps and repeats lost)'),
  ('several-endings-refused', 'Model.gs', "    if (type.builtin && screen.type !== 'thank_you' && PP_mdlHas_(builtins, screen.type)) {",
   "    if (type.builtin && PP_mdlHas_(builtins, screen.type)) {", 'G11', 'a second ending (thank-you screen) is refused again'),
  # refreshed 26 Oct 2026: the unreached rows come from the flow checker's G1, told by Model.gs PP_mdlReportLostRows_
  ('rows-after-ending-unchecked', 'Model.gs', "  PP_mdlReportLostRows_(model, main, lost, report);\n}", "}", 'B2',
   'a question after the thank-you screen that no jump reaches is no longer reported'),
  ('graph-import-refused', 'Model.gs', "  const result = PP_mdlFlowLib_().flowPanel.toRows(flow, survey);",
   "  const result = { screens: [], unsupported: [{ node: '', message: 'Refused.' }] };", 'G11',
   'a GitHub copy or a published version in the graph format can no longer be imported or restored'),
  ('stale-panel-wipes-route', 'PanelServer.gs', "  const draft = PP_normalizedCopy_(PP_carryFlowColumns_(model, previous));",
   "  const draft = PP_normalizedCopy_(model);", 'G11', 'a save from a panel opened before an update wipes next, jumps and repeat'),
  ('flow-gs-edited', 'Flow.gs', "        node.next = list.length ? list.concat([{ 'default': dflt }]) : dflt;\n      }",
   "        node.next = dflt;\n      }", 'S,G11', 'Flow.gs edited by hand (jumps dropped): it no longer matches the form\'s own code'),
  # ---- 26 Oct 2026: the panel's route checks are the one flow checker's (Model.gs PP_mdlCheckRoute_ and Flow.gs) ----
  ('route-checker-not-run', 'Model.gs', "  PP_mdlCheckRoute_(tidy, compiled, report);\n", "",
   'B2', 'the panel no longer checks the route (a rule on a later answer, a free-text answer tested with "equals" pass)'),
  ('hidden-codes-not-passed', 'Model.gs', "hiddenCodes: PP_mdlHiddenCodes_(tidy)", "hiddenCodes: []", 'G8',
   'a hidden nps question counts as deleted: an error instead of a warning'),
  # refreshed 26 Oct 2026 (review finding 2): the codes lock is decided by Model.gs PP_mdlCheckLiveCodes_ on the qualified list
  ('codes-ever-live-not-checked', 'Model.gs', "  earlier.forEach(entry => { if (typeof entry === 'string' && entry) answered['#' + entry] = true; });", "",
   'G11', 'deleting a code partners answered in an earlier version no longer stops Publish'),
  ('route-checked-before-rows-fixed', 'Model.gs', "    if (!route.ready && ['D1', 'D2'].indexOf(f.code) === -1) return;\n", "",
   'B2', 'follow-on route errors while two shown rows share a built-in kind'),
  ('checker-text-check-leaks', 'Model.gs', "    if (f.level === 'info' || f.code === 'T1' || f.added) return;",
   "    if (f.level === 'info' || f.added) return;", 'B2', 'a missing English text is reported twice (also among the questions)'),
  ('deleted-live-code-only-warned', 'Model.gs', "    if (PP_mdlHas_(answered, '#' + entry)) {", "    if (false) {", 'G11',
   'a deleted code partners answered in a real round is only a warning again, and Publish goes on'),
  ('flow-gs-d1-never-error', 'Flow.gs', "        var deleted = c.panel && !isHidden(c, d[0]);\n        c.add(deleted ? 'error' : 'warning', 'D1', null,",
   "        var deleted = false;\n        c.add(deleted ? 'error' : 'warning', 'D1', null,", 'S,G8',
   'Flow.gs edited by hand: a deleted nps question is only a warning'),
  # ---- 26 Oct 2026, flow-graph stage 6: config_version, the last column of the pings tab (Code.gs PP_pingsTab_) ----
  ('ping-version-not-stored', 'Code.gs', ",\n    config_version: message.config_version\n  };", "\n  };", 'D1,D12',
   'a ping\'s questionnaire version is not stored'),
  ('ping-version-not-last', 'Code.gs', "'client_net', 'events_json', 'config_version']", "'client_net', 'config_version', 'events_json']",
   'B5,D12', 'config_version is not the last column of the pings tab (columns of older spreadsheets would shift)'),
  ('old-pings-tab-not-upgraded', 'Code.gs', "  if (PP_cacheGetOrNull_(key) === String(all)) return { sheet: sheet, width: all };",
   "  return { sheet: sheet, width: all };", 'D12', 'a pings tab made before 26 Oct 2026 never gets its config_version header'),
  ('ping-header-over-own-column', 'Code.gs', "  sheet.insertColumnsAfter(after, column - after);\n", "", 'D12',
   'the config_version header is written over whatever is there (an admin\'s own column) instead of a new column'),
  ('ping-column-added-twice', 'Code.gs', "      () => PP_hasPingVersionColumn_(sheet) || PP_addPingVersionColumn_(sheet)) === true;",
   "      () => PP_addPingVersionColumn_(sheet)) === true;", 'D12',
   'two pings arriving together both add a config_version column (no second look inside the lock)'),
  ('ping-written-past-events-json', 'Code.gs', "  pings.sheet.appendRow(PP_pingRow_(message).slice(0, pings.width));",
   "  pings.sheet.appendRow(PP_pingRow_(message));", 'D12',
   'while the column cannot be added, a ping writes a cell without a header after events_json'),
  ('ping-columns-checked-every-time', 'Code.gs', "  PP_cachePutSafely_(key, String(all), PP_SRV.LONG_CACHE_SECONDS);\n", "", 'D12',
   'every ping reads the pings tab\'s header again (the cache never remembers the column)'),
  # ---- 26 Oct 2026: the reviewers' fixes on the Google side (scenario G12) ----
  ('hidden-ending-runs-on', 'Flow.gs', "        if (hiddenEnding(k) && mainEnd) return { node: mainEnd.node, at: mainEnd.at, ending: k };\n", "", 'G12',
   'a question above a hidden ending runs on into the next route (promoters into the detractors\' questions)'),
  ('jump-to-hidden-ending-runs-on', 'Flow.gs', "      if (hiddenEnding(j) && mainEnd) return { id: mainEnd.node.id, at: mainEnd.at, via: passed, ending: j };\n", "", 'G12',
   'a jump to a hidden ending goes on into the next route instead of ending at the main thank-you screen'),
  # moved 27 Oct 2026 (review W8 finding 2): the run-on rule's only home is Flow.gs's note G5 (Model.gs's copy,
  # PP_mdlCheckRunIntoRoutes_, was removed), so the mistake is planted there; the text ends with a real line break,
  # so it matches the running code and not its escaped copy in PP_FLOW_SOURCE_
  ('run-on-not-checked', 'Flow.gs',
   "        warnings.push({ code: 'G5', level: 'error', node: trim(row.id), row: i, message: capital(name(i)) + ' has no ' +\n",
   "        if (false) warnings.push({ code: 'G5', level: 'error', node: trim(row.id), row: i, message: capital(name(i)) + ' has no ' +\n",
   'G12', 'after an ending is deleted, a route that runs on into another one is published without a word (Flow.gs\'s note G5 gone)'),
  ('codes-lock-bare-chip-codes', 'Model.gs', "      const found = model.chips.some(chip => chip.area === area && chip.code === code);   // hidden or not: kept",
   "      const found = model.chips.some(chip => chip.code === code);", 'G12',
   'the codes lock looks for a problem code in every area: one deleted from Payments passes when Line haul has the same code'),
  ('codes-lock-bare-option-codes', 'Model.gs', "    const options = model.screens[screenAt[screenId]].options;",
   "    const options = [].concat.apply([], model.screens.map(screen => screen.options));", 'G12',
   'the codes lock looks for an answer code in every question: one removed from a question passes when another question has it'),
  ('publish-during-drive-hiccup', 'Code.gs', "  PP_requireLiveWhileLocked_(live);\n", "", 'G12',
   'Publish goes on while Google Drive cannot read the live version, so its codes escape the lock for good'),
  ('setup-hides-publish-warnings', 'Code.gs',
   "      (Array.isArray(result.warnings) ? result.warnings : []).forEach(warning => notes.push('Please check: ' + warning));\n", "", 'G12',
   'set-up\'s closing notes no longer say what Publish wants checked (it is only in the log)'),
  ('export-without-flow-map', 'Model.gs', "  files['flow.md'] = PP_mdlFlowMapText_(files['survey.json'], files['strings.json']);\n", "", 'B8,G12',
   'the GitHub copy no longer brings docs/flow.md, so the map in GitHub goes out of date'),
  # ---- 27 Oct 2026: review W8 of "Paste a route" (Model.gs; scenario G12) ----
  ('run-on-only-a-warning', 'Model.gs',
   "    const isError = note.level === 'error' || (note.level !== 'warning' && PP_mdlHas_(PP_MDL_FLOW_ERRORS_, note.code));",
   "    const isError = note.level !== 'warning' && PP_mdlHas_({ G2: true, G3: true, F1: true }, note.code);", 'G12',
   'Publish treats Flow.gs\'s run-on note (G5, marked "error") as a warning again, so the route is published'),
  ('live-kind-change-unchecked', 'Model.gs', "  PP_mdlCheckLiveKinds_(tidy, liveDoc, report);\n", "", 'G12',
   'a question partners answered can change its kind (voice/typing to faces) and Publish goes ahead'),
  # ---- 30 Oct 2026: "pick several" (multi_choice, 28 Oct) on the Google side (scenarios B3 and D2) ----
  ('type-list-not-reapplied', 'Model.gs',
   "      sheet.getRange(2, columnOf.type, below, 1).setDataValidation(PP_listRule_(PP_screenTypeNames_()));\n", "", 'B3',
   'a save no longer gives the Screens tab\'s type column today\'s list of kinds (a Sheet set up before 28 Oct marks a pick-several row as invalid)'),
  ('type-list-only-written-rows', 'Model.gs', "const below = Math.max(count, sheet.getMaxRows() - 1);", "const below = count;", 'B3',
   'a save gives today\'s list of kinds only to the rows it writes: the empty rows below keep an older Sheet\'s list (review of 30 Oct)'),
  ('list-answer-refused', 'Code.gs',
   "  if (Object.keys(message.answers).length > PP_SRV.MAX_ANSWER_KEYS) PP_refuse_('\"answers\" has too many entries.');",
   "  if (Object.keys(message.answers).length > PP_SRV.MAX_ANSWER_KEYS) PP_refuse_('\"answers\" has too many entries.');\n" +
   "  if (Object.keys(message.answers).some(key => Array.isArray(message.answers[key]))) PP_refuse_('\"answers\" must hold one value each.');",
   'D2', 'a pick-several answer (a list of codes) is refused as bad_request'),
  ('list-answer-flattened', 'Code.gs', "answers_json: JSON.stringify(answers),",
   "answers_json: JSON.stringify(answers, (key, value) => (Array.isArray(value) ? value.join(', ') : value)),", 'D2',
   'a pick-several answer is stored as one text ("load, payments") instead of the list'),
  # ---- 26 Oct 2026: Panel.html's one exception, the Map's drawing library (lib/static-checks.js mapException) ----
  ('map-without-sri', 'Panel.html',
   "'s.src = ' + scriptString(MERMAID_URL) + '; s.integrity = ' + scriptString(MERMAID_SRI) + '; s.crossOrigin = \"anonymous\";'",
   "'s.src = ' + scriptString(MERMAID_URL) + '; s.crossOrigin = \"anonymous\";'", 'S',
   'the Map loads Mermaid without its integrity hash (any bytes the address serves would run)'),
  ('map-frame-same-origin', 'Panel.html', "sandbox: 'allow-scripts', title: 'Map of the route: '",
   "sandbox: 'allow-scripts allow-same-origin', title: 'Map of the route: '", 'S',
   'the Map\'s frame gets "allow-same-origin" (Mermaid\'s code could reach the panel, google.script.run and the Sheet)'),
  ('map-frame-not-sandboxed', 'Panel.html', "sandbox: 'allow-scripts', title: 'Map of the route: '", "title: 'Map of the route: '", 'S',
   'the Map\'s frame is not sandboxed at all'),
  ('map-library-not-pinned', 'Panel.html', "var MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';",
   "var MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';", 'S',
   'the Map\'s library is not pinned to one exact version (its integrity hash can\'t fit)'),
  ('map-second-library', 'Panel.html', "'document.head.appendChild(s);' +",
   "'document.head.appendChild(s); var t = document.createElement(\"script\"); t.src = \"https://cdn.example.com/extra.js\"; document.head.appendChild(t);' +", 'S',
   'the page loads a second library from the internet, without a pinned version or a hash'),
]

LINE = re.compile(r'^(PASS|WARN|FAIL|SKIP)\s+(\S+)\s')


def run_scenarios(apps_script_dir, only, out_dir):
    """Runs the Google imitation on one copy; returns {scenario id: status}."""
    out = subprocess.run(['node', 'run-tests.js', '--apps-script-dir', apps_script_dir, '--only', only, '--no-browser',
                          '--out', out_dir], cwd=HARNESS, capture_output=True, text=True, timeout=600)
    statuses = {}
    for line in out.stdout.splitlines():
        m = LINE.match(line)
        if m:
            statuses[m.group(2)] = m.group(1)
    return statuses


def main():
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK, exist_ok=True)
    every = ','.join(sorted({s for m in MUTANTS for s in m[4].split(',')}))
    base_dir = os.path.join(WORK, '_baseline')
    shutil.copytree(SRC, base_dir)
    baseline = run_scenarios(base_dir, every, os.path.join(base_dir, 'report'))
    shutil.rmtree(base_dir, ignore_errors=True)
    broken = sorted(k for k, v in baseline.items() if v == 'FAIL')
    print(f'Baseline (no mistake planted): {len(baseline)} scenarios, ' +
          (f'already FAILING: {", ".join(broken)}' if broken else 'none fails'))
    results = []
    for name, file, old, new, only, what in MUTANTS:
        d = os.path.join(WORK, name)
        shutil.rmtree(d, ignore_errors=True)
        shutil.copytree(SRC, d)
        p = os.path.join(d, file)
        text = open(p, encoding='utf-8').read()
        found = text.count(old)
        if found != 1:
            results.append(('NOT APPLIED', name, f'its text is in {file} {found} times (must be once): update it', what))
            shutil.rmtree(d, ignore_errors=True)
            continue
        open(p, 'w', encoding='utf-8').write(text.replace(old, new, 1))
        statuses = run_scenarios(d, only, os.path.join(d, 'report'))
        caught_by = [k for k, v in statuses.items() if v == 'FAIL' and baseline.get(k) != 'FAIL']
        if caught_by:
            results.append(('CAUGHT', name, 'by ' + ', '.join(caught_by), what))
        else:
            ran = ', '.join(f'{k} {v}' for k, v in statuses.items()) or 'nothing ran'
            results.append(('MISSED', name, ran, what))
        shutil.rmtree(d, ignore_errors=True)
    for verdict, name, detail, what in results:
        print(f'{verdict:11} {name:32} {detail}  ({what})')
    shutil.rmtree(WORK, ignore_errors=True)
    caught = sum(1 for r in results if r[0] == 'CAUGHT')
    print(f'RESULT: {caught} of {len(MUTANTS)} planted mistakes caught' +
          (f'; baseline already failing: {", ".join(broken)}' if broken else ''))
    return 0 if caught == len(MUTANTS) and not broken else 1


if __name__ == '__main__':
    sys.exit(main())
