/* Test-only helper for shrink_check.js (tests/model/strict/). Never copy it
   into Apps Script. It lets a Node script call PP_writeModel / PP_readModel
   on the fake bound spreadsheet. */
function zzWrite(model, sections) {
  return PP_writeModel(SpreadsheetApp.getActiveSpreadsheet(), model, sections || null);
}
function zzRead() {
  return PP_readModel(SpreadsheetApp.getActiveSpreadsheet());
}
function zzLastRows() {
  const out = {};
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(sheet => { out[sheet.getName()] = sheet.getLastRow(); });
  return out;
}
