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

  It takes about 10 seconds (no browser). The last line says how many
  mistakes were caught. Exit code 0 = every mistake was planted and caught
  and the baseline had no failure; 1 = anything else.

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
  ('date-ids-get-links', 'PanelServer.gs', "    const typedWrong = typeof id === 'number' || id instanceof Date;",
   "    const typedWrong = typeof id === 'number';", 'G9', 'a DC id Sheets turned into a date gets a link'),
  ('auth-message-differs', 'Code.gs',
   "const PP_MSG_AUTHORIZATION_ = 'Google says Partner Pulse needs authorization. Usually Google is using another ' +",
   "const PP_MSG_AUTHORIZATION_ = 'Google says Partner Pulse needs authorization. Most likely Google is using another ' +",
   'G7', 'the "Authorization is required" advice differs between the server and the panel'),
  ('nps-warning-removed', 'Model.gs', "    if (model.screens.some(screen => screen.id === item.id)) return;", "    return;", 'G8',
   'no warning when the nps or support_gate question goes missing'),
  ('empty-round-is-a-change', 'Model.gs',
   "      if (!PP_mdlIsObject_(news) || !Array.isArray(news.items) || !news.items.length) delete doc.whats_changed[roundId];",
   "      if (!PP_mdlIsObject_(news)) delete doc.whats_changed[roundId];", 'G8',
   'a new, empty round counts as an unpublished change again'),
  ('number-ids-get-links', 'PanelServer.gs', "    const typedWrong = typeof id === 'number' || id instanceof Date;",
   "    const typedWrong = false;", 'B6', 'DC ids that Sheets turned into numbers get links again'),
  ('unknown-round-says-unknown', 'Code.gs', "    round: { id: roundId, status: status === 'unknown' ? 'draft' : status },",
   "    round: { id: roundId, status: status },", 'C', 'a round never seen before is not reported as "draft"'),
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
