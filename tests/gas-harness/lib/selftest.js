/* =============================================================================
   lib/selftest.js  -  checks that the pretend Google itself behaves correctly

   WHAT THIS FILE IS
     Before the harness judges the real Apps Script code, this file checks the
     harness: that the fake spreadsheets, cache, tokens, dates, dialogs, Drive
     hand-overs (setOwner), the two locks, the permission re-check
     (requireAllScopes) and redirects behave like Google's (as documented),
     and that what Google lacks (the global MimeType.JSON) is missing here
     too. 41 checks. If one of these fails, a failure in the real tests could
     be the harness's fault, not the code's.

   HOW TO USE IT
     node lib/selftest.js            (or: node run-tests.js --self-test)
     Prints PASS/FAIL per check and exits with 1 if anything failed.

   WHAT IT READS / WRITES
     Nothing on disk (it loads an empty Apps Script project).
   ============================================================================= */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadGas } = require('../load-gas');

function runSelfTest(print) {
  const say = print || ((line) => process.stdout.write(line + '\n'));
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-empty-'));
  const h = loadGas({ appsScriptDir: emptyDir });
  const results = [];
  const run = (code, context) => {
    h.control.begin({ fn: 'selftest', context: context || 'menu' });
    try {
      return { ok: true, value: h.evaluate(code) };
    } catch (e) {
      return { ok: false, error: String(e && e.message) };
    } finally {
      h.control.end();
    }
  };
  const check = (name, cond, detail) => {
    results.push({ name, ok: !!cond, detail });
    say(`${cond ? 'PASS' : 'FAIL'}  self-test: ${name}${cond ? '' : '  -> ' + (detail || '')}`);
  };

  // 1. Token formula = Node's HMAC (and therefore = mock_server.py / generate_links.py)
  const secret = 'mock-dev-secret-not-for-production';
  const want = crypto.createHmac('sha256', secret).update('DC-DEMO-001|DEMO-R1').digest('base64url').slice(0, 22);
  const got = run(`Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('DC-DEMO-001|DEMO-R1', ` +
    `'${secret}', Utilities.Charset.UTF_8)).replace(/=+$/, '').slice(0, 22)`);
  check('link token formula matches Node HMAC', got.ok && got.value === want, JSON.stringify(got) + ' vs ' + want);
  const padded = run(`Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('a', 'b', Utilities.Charset.UTF_8))`);
  check('base64EncodeWebSafe keeps "=" padding like Google', padded.ok && /=$/.test(padded.value), JSON.stringify(padded));
  const signed = run(`Utilities.computeHmacSha256Signature('a', 'b', Utilities.Charset.UTF_8).some(function (b) { return b < 0; })`);
  check('HMAC bytes are signed (-128..127) like Google', signed.ok && signed.value === true, JSON.stringify(signed));
  const dec = run(`(function () { var b = Utilities.base64Decode('/w=='); return [b.length, b[0]]; })()`);
  check('base64Decode returns signed bytes', dec.ok && dec.value[0] === 1 && dec.value[1] === -1, JSON.stringify(dec));
  const badDec = run(`Utilities.base64Decode('ab-_')`);
  check('base64Decode refuses web-safe characters', !badDec.ok && /decode/.test(badDec.error), JSON.stringify(badDec));

  // 2. Grid limits and setValues shape
  const sheetCode = (body) => `(function () { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheets()[0]; ${body} })()`;
  const outside = run(sheetCode('sh.getRange(1, 1, 1, 27); return "no error";'));
  check('getRange beyond 26 columns throws', !outside.ok && /outside the dimensions/.test(outside.error), JSON.stringify(outside));
  const zeroRows = run(sheetCode('sh.getRange(2, 1, 0, 3); return "no error";'));
  check('getRange with 0 rows throws', !zeroRows.ok && /at least 1/.test(zeroRows.error), JSON.stringify(zeroRows));
  const wrongShape = run(sheetCode('sh.getRange(1, 1, 2, 2).setValues([[1, 2]]); return "no error";'));
  check('setValues with wrong row count throws', !wrongShape.ok && /number of rows/.test(wrongShape.error), JSON.stringify(wrongShape));
  const a1 = run(sheetCode('sh.getRange("A1"); return "no error";'));
  check('A1 notation is refused as outside the contract', !a1.ok && /\[contract\]/.test(a1.error), JSON.stringify(a1));
  const widen = run(sheetCode('var row = []; for (var i = 0; i < 30; i++) row.push("h" + i); sh.appendRow(row); return [sh.getLastColumn(), sh.getRange(1, 30).getValue()];'));
  check('appendRow widens the grid', widen.ok && widen.value[0] === 30 && widen.value[1] === 'h29', JSON.stringify(widen));

  // 3. Values are read like typed input
  const typed = run(sheetCode(`sh.getRange(5, 1, 1, 7).setValues([["123", "'00123", "2026-10-21", "TRUE", "=1+1 text", "2026-10-21T08:30:00.000Z", "hello"]]);
    var v = sh.getRange(5, 1, 1, 7).getValues()[0];
    return [typeof v[0], v[1], v[2] instanceof Date, v[3], v[4], v[5], v[6]];`));
  check('text is read like typed input (number, apostrophe, date, boolean, formula, ISO text)',
    typed.ok && JSON.stringify(typed.value) === JSON.stringify(['number', '00123', true, true, '#ERROR!', '2026-10-21T08:30:00.000Z', 'hello']),
    JSON.stringify(typed));
  const plainText = run(sheetCode('var r = sh.getRange(6, 1); r.setNumberFormat("@"); r.setValue("00123"); return r.getValue();'));
  check('number format "@" keeps text as text', plainText.ok && plainText.value === '00123', JSON.stringify(plainText));
  const longCell = run(sheetCode('sh.getRange(7, 1).setValue(new Array(50002).join("x")); return "no error";'));
  check('a cell refuses more than 50,000 characters', !longCell.ok && /50000/.test(longCell.error), JSON.stringify(longCell));
  const objCell = run(sheetCode('sh.getRange(7, 1).setValue({ a: 1 }); return "no error";'));
  check('an object written to a cell is refused (harness strictness)', !objCell.ok, JSON.stringify(objCell));

  // 4. Checkboxes, last row, delete rows
  const boxes = run(sheetCode('sh.getRange(10, 2, 3, 1).setValues([[true], [true], ["x"]]); sh.getRange(10, 2, 3, 1).insertCheckboxes(); return [sh.getRange(10, 2, 3, 1).getValues().join(","), sh.getLastRow()];'));
  check('insertCheckboxes sets the cells to FALSE (Google documents this)', boxes.ok && boxes.value[0] === 'false,false,false' && boxes.value[1] === 12, JSON.stringify(boxes));
  const delAll = run(sheetCode('sh.setFrozenRows(1); sh.deleteRows(2, sh.getMaxRows() - 1); return "no error";'));
  check('deleting all non-frozen rows throws', !delAll.ok && /non-frozen/.test(delAll.error), JSON.stringify(delAll));

  // 5. TextFinder
  const finder = run(sheetCode(`sh.getRange(20, 3, 3, 1).setValues([["'DC-Demo-1"], ["'dc-demo-1"], ["'DC-DEMO-10"]]);
    var all = sh.createTextFinder("DC-DEMO-1").matchEntireCell(true).findAll();
    var first = sh.createTextFinder("DC-DEMO-1").matchEntireCell(true).findNext();
    return [all.length, first.getRow(), first.getColumn()];`));
  check('TextFinder: exact cell, ignores capitals by default', finder.ok && finder.value.join() === '2,20,3', JSON.stringify(finder));

  // 6. Template copy, sheet identity
  const tmpl = run(`(function () { var ss = SpreadsheetApp.create("x", 2, 1); var seed = ss.getSheets()[0];
    var t = ss.insertSheet("t", { template: seed }); return [t.getMaxRows(), ss.getSheets()[0] === ss.getSheets()[0]]; })()`);
  check('insertSheet({template}) copies the size; sheet objects are new each time', tmpl.ok && tmpl.value[0] === 2 && tmpl.value[1] === false, JSON.stringify(tmpl));

  // 7. Cache limits
  const big = run(`CacheService.getScriptCache().put("k", new Array(40001).join("\\u0939"), 60); "stored"`);
  check('cache refuses more than 100 KB (Hindi letters count 3 bytes)', !big.ok && /too large/.test(big.error), JSON.stringify(big));
  const cacheOk = run(`var c = CacheService.getScriptCache(); c.putAll({a: "1", b: "2"}, 21600); JSON.stringify(c.getAll(["a", "b", "z"]))`);
  check('cache putAll/getAll', cacheOk.ok && cacheOk.value === '{"a":"1","b":"2"}', JSON.stringify(cacheOk));

  // 8. Dates
  const date = run(`Utilities.formatDate(new Date(Date.UTC(2026, 9, 20, 20, 0, 0)), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX EEE d MMM")`);
  check('formatDate in Asia/Kolkata', date.ok && date.value === '2026-10-21T01:30:00.000+05:30 Wed 21 Oct', JSON.stringify(date));

  // 9. Dialogs and contexts
  const twoStrings = run(`SpreadsheetApp.getUi().alert("Title", "Message"); "no error"`);
  check('ui.alert(title, message) without a ButtonSet throws like Google', !twoStrings.ok && /don't match/.test(twoStrings.error), JSON.stringify(twoStrings));
  h.control.queueAnswer({ match: 'Name?', button: 'OK', text: 'Asha' });
  const prompt = run(`(function () { var ui = SpreadsheetApp.getUi(); var r = ui.prompt("Q", "Name?", ui.ButtonSet.OK_CANCEL); return [r.getSelectedButton() === ui.Button.OK, r.getResponseText()]; })()`);
  check('scripted prompt answers', prompt.ok && prompt.value[0] === true && prompt.value[1] === 'Asha', JSON.stringify(prompt));
  const webUi = run(`SpreadsheetApp.getUi(); "no error"`, 'webapp');
  check('getUi() fails inside the web app', !webUi.ok && /from this context/.test(webUi.error), JSON.stringify(webUi));
  const trig = run(`DriveApp.getRootFolder(); "no error"`, 'simpleTrigger');
  check('DriveApp fails inside the simple trigger onOpen', !trig.ok && /permission/.test(trig.error), JSON.stringify(trig));
  const notAllowed = run(`SpreadsheetApp.openByUrl("x"); "no error"`);
  check('a method outside the contract throws [contract]', !notAllowed.ok && /\[contract\]/.test(notAllowed.error), JSON.stringify(notAllowed));
  const gmail = run(`GmailApp.sendEmail("a", "b", "c"); "no error"`);
  check('a forbidden service throws [contract]', !gmail.ok && /\[contract\]/.test(gmail.error), JSON.stringify(gmail));
  const mime = run(`ContentService.createTextOutput("{}").setMimeType("application/json"); "no error"`);
  check('setMimeType takes only ContentService.MimeType values (text such as "application/json" is refused, like Google)',
    !mime.ok && /don't match/.test(mime.error) && /ContentService.MimeType.JSON/.test(mime.error), JSON.stringify(mime));
  const noJson = run(`MimeType.JSON`);
  check('the global MimeType has no JSON entry (like Google): using it is a [contract] error',
    !noJson.ok && /\[contract\] MimeType\.JSON/.test(noJson.error) && /application\/json/.test(noJson.error), JSON.stringify(noJson));

  // 10. Drive
  const blob = run(`DriveApp.getRootFolder().createFile(Utilities.newBlob([1, 2, 3], "audio/webm")); "no error"`);
  check('createFile(blob) without a name throws like Google', !blob.ok && /non-null name/.test(blob.error), JSON.stringify(blob));
  const file = run(`(function () { var f = DriveApp.getRootFolder().createFolder("x").createFile("p1.json", "{\\"a\\":1}", "application/json"); return DriveApp.getFileById(f.getId()).getBlob().getDataAsString(); })()`);
  check('Drive text files round-trip', file.ok && file.value === '{"a":1}', JSON.stringify(file));
  const owned = run(`(function () { var f = DriveApp.getRootFolder().createFolder("handed"); f.setOwner("boss@example.com"); return f.getId(); })()`);
  const handed = owned.ok ? h.admin.drive.byId(owned.value) : null;
  check('setOwner hands an item to someone of the same company; the giver keeps edit access (recorded)',
    handed && handed.owner === 'boss@example.com' && handed.editors.indexOf('admin@example.com') >= 0 &&
    h.admin.drive.handovers().some((x) => x.id === owned.value && x.from === 'admin@example.com'), JSON.stringify(owned));
  const otherCompany = run(`DriveApp.getRootFolder().createFolder("kept").setOwner("someone@example.org"); "no error"`);
  check('setOwner to another company (domain) is refused, as Google refuses it', !otherCompany.ok && /same company/.test(otherCompany.error),
    JSON.stringify(otherCompany));

  // 11. Locks: the script lock and the Sheet's document lock are separate
  h.control.setLockBusy(true);
  const locks = run(`(function () { var d = LockService.getDocumentLock(), s = LockService.getScriptLock();
    return [d.tryLock(10), s.tryLock(10), d.hasLock(), s.hasLock()]; })()`);
  h.control.setLockBusy(false);
  h.control.setDocumentLockBusy(true);
  const locks2 = run(`(function () { var d = LockService.getDocumentLock(), s = LockService.getScriptLock();
    return [d.tryLock(10), s.tryLock(10)]; })()`);
  h.control.setDocumentLockBusy(false);
  check('the document lock and the script lock are separate (each can be busy on its own)',
    locks.ok && locks.value.join() === 'true,false,true,false' && locks2.ok && locks2.value.join() === 'false,true',
    JSON.stringify([locks, locks2]));
  const webLock = run(`LockService.getDocumentLock() === null`, 'webapp');
  check('getDocumentLock() is null in the web app (Google gives no document lock outside the Sheet)', webLock.ok && webLock.value === true,
    JSON.stringify(webLock));

  // 12. The permission re-check (ScriptApp.requireAllScopes)
  const granted = run(`ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); "granted"`);
  h.control.setConsent({ missing: true });
  const before = h.admin.ui.log.length;
  const missing = run(`ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); "carried on"`);
  const screen = h.admin.ui.log.slice(before).some((d) => d.kind === 'consent');
  h.control.setConsent(null);
  check('requireAllScopes(AuthMode.FULL): quiet when every permission is granted; with one missing, Google stops the run and shows its permission screen',
    granted.ok && granted.value === 'granted' && !missing.ok && /Authorization is required/.test(missing.error) && screen,
    JSON.stringify([granted, missing, screen]));
  const badMode = run(`ScriptApp.requireAllScopes("FULL"); "no error"`);
  check('requireAllScopes refuses anything but a ScriptApp.AuthMode value', !badMode.ok && /don't match/.test(badMode.error), JSON.stringify(badMode));

  // 13. An older Apps Script without a member (control.hidden)
  h.control.hidden.add('ScriptApp.requireAllScopes');
  const hidden = run(`['requireAllScopes' in ScriptApp, typeof ScriptApp.requireAllScopes, 'getService' in ScriptApp]`);
  h.control.hidden.delete('ScriptApp.requireAllScopes');
  const shown = run(`'requireAllScopes' in ScriptApp && 'getDocumentLock' in LockService`);
  check('a member can be hidden to imitate an older Apps Script ("name in Service" is then false)',
    hidden.ok && hidden.value.join() === 'false,undefined,true' && shown.ok && shown.value === true, JSON.stringify([hidden, shown]));

  // 14. UrlFetchApp follows redirects (followRedirects, true by default as in Google)
  h.control.routeUrl('https://example.org/hop-1', { code: 302, location: 'https://example.org/hop-2' });
  h.control.routeUrl('https://example.org/hop-2', { code: 200, body: 'arrived' });
  const hops = run(`[UrlFetchApp.fetch("https://example.org/hop-1", { muteHttpExceptions: true, followRedirects: true }).getContentText(),
    UrlFetchApp.fetch("https://example.org/hop-1", { muteHttpExceptions: true, followRedirects: false }).getResponseCode()]`);
  check('UrlFetchApp follows a redirect (unless followRedirects is false)', hops.ok && hops.value.join() === 'arrived,302', JSON.stringify(hops));

  // 15. Values crossing into the code's world are the code's own type
  const realmDate = run(sheetCode('sh.getRange(30, 1).setValue(new Date(0)); return sh.getRange(30, 1).getValue() instanceof Date && Array.isArray(sh.getRange(30, 1, 1, 2).getValues());'));
  check('dates and arrays from the fakes pass instanceof inside the code', realmDate.ok && realmDate.value === true, JSON.stringify(realmDate));

  // 16. Every execution starts with fresh globals (Google loads the files again)
  const gsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-fresh-'));
  fs.writeFileSync(path.join(gsDir, 'Code.gs'), 'var counter = 0;\nfunction bump() { counter += 1; return counter; }\n');
  const h2 = loadGas({ appsScriptDir: gsDir });
  const first = h2.exec('bump', [], { context: 'menu' });
  const second = h2.exec('bump', [], { context: 'menu' });
  check('each execution starts with fresh globals (like Google)', first.ok && second.ok && first.value === 1 && second.value === 1,
    JSON.stringify([first.value, second.value]));

  try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  try { fs.rmSync(gsDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, failed: failed.length, results };
}

if (require.main === module) {
  const out = runSelfTest();
  process.stdout.write(`\n${out.total - out.failed}/${out.total} self-test checks passed\n`);
  process.exit(out.failed ? 1 : 0);
}

module.exports = { runSelfTest };
