/* fake_sheets.js: a small in-memory imitation of Google Sheets, for testing
   apps-script/Model.gs on a computer (Node.js). Developer test helper in
   tests/model/; never part of the published form.

   It imitates what matters for PP_readModel / PP_writeModel:
   - getRange(row, col, numRows, numCols) with getValues / setValues /
     clearContent (and the cosmetic calls, which are just recorded). Like
     Google, a Range has NO clearContents() (only a Sheet has that), so
     calling it fails here too;
   - getMaxRows / insertRowsAfter, getMaxColumns / insertColumnsAfter;
   - refusing writes to one tab, like a protected tab in Google
     (book.refuseWritesTo = 'Texts'), to test a save that fails half-way;
   - getLastRow / getLastColumn (last row / column with content);
   - getMaxRows / insertRowsAfter, and a fixed width of 26 columns: writing
     outside the sheet throws like Google does;
   - how Google turns typed text into other things: "12" -> 12, "TRUE" ->
     true, "2026-10-21" -> a date (midnight India time), "=..." -> a formula
     (stored as "#ERROR!"), and a leading apostrophe keeps text as text (the
     apostrophe is not stored);
   - an empty cell with a tick box reads as false (and does not count as
     content for getLastRow);
   - more than 50,000 characters in a cell is refused.
*/
'use strict';

const IST_OFFSET_MS = 330 * 60 * 1000;
const MAX_CELL_CHARS = 50000;

function isDate(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** What Google Sheets stores when a script writes this value. */
function sheetsParse(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('Cannot write a non-finite number');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (isDate(value)) return new Date(value.getTime());
  if (typeof value !== 'string') throw new Error('Fake Sheets: cannot write a ' + typeof value + ' into a cell: ' + JSON.stringify(value));
  if (value.length > MAX_CELL_CHARS) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
  if (value === '') return '';
  if (value.charAt(0) === "'") return value.slice(1);     // quote prefix: text stays text
  const trimmed = value.trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  const date = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (date) return new Date(Date.UTC(+date[1], +date[2] - 1, +date[3]) - IST_OFFSET_MS);
  if (value.charAt(0) === '=') return '#ERROR!';
  return value;
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (!(Number.isInteger(row) && Number.isInteger(col) && row >= 1 && col >= 1)) {
      throw new Error(`Fake Sheets: bad range start ${row},${col}`);
    }
    if (!(Number.isInteger(numRows) && Number.isInteger(numCols) && numRows >= 1 && numCols >= 1)) {
      throw new Error(`Fake Sheets: the number of rows/columns in the range must be at least 1 (got ${numRows} x ${numCols})`);
    }
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  _inside() {
    if (this.row + this.numRows - 1 > this.sheet.maxRows || this.col + this.numCols - 1 > this.sheet.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
  }

  _each(fn) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) fn(this.row + r, this.col + c, r, c);
    }
  }

  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numCols; }

  getValues() {
    this._inside();
    this.sheet.book.calls.getValues++;
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet._read(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }

  getValue() { return this.getValues()[0][0]; }

  _writable() {
    if (this.sheet.book.refuseWritesTo === this.sheet.name) {
      throw new Error('You are trying to edit a protected cell or object. Please contact the spreadsheet owner to remove protection if you need to edit.');
    }
  }

  setValues(values) {
    this._inside();
    this._writable();
    this.sheet.book.calls.setValues++;
    if (!Array.isArray(values) || values.length !== this.numRows) {
      throw new Error(`The number of rows in the data does not match the number of rows in the range. The data has ${values.length} but the range has ${this.numRows}.`);
    }
    values.forEach(line => {
      if (!Array.isArray(line) || line.length !== this.numCols) {
        throw new Error(`The number of columns in the data does not match the number of columns in the range. The data has ${line.length} but the range has ${this.numCols}.`);
      }
    });
    const parsed = values.map(line => line.map(sheetsParse));   // all-or-nothing, like Google
    this._each((r, c, i, j) => this.sheet._write(r, c, parsed[i][j]));
    return this;
  }

  setValue(value) { return this.setValues([[value]]); }

  clearContent() {
    this._inside();
    this._writable();
    this.sheet.book.calls.clearContent++;
    this._each((r, c) => this.sheet._write(r, c, ''));
    return this;
  }

  setDataValidation(rule) {
    this._inside();
    this.sheet.book.calls.format++;
    this._each((r, c) => this.sheet._cell(r, c).validation = rule || null);
    return this;
  }

  setNumberFormat(format) { this.sheet.book.calls.format++; this._each((r, c) => this.sheet._cell(r, c).format = format); return this; }
  setFontWeight() { this.sheet.book.calls.format++; return this; }
  setBackground() { this.sheet.book.calls.format++; return this; }
  setFontColor() { this.sheet.book.calls.format++; return this; }
  setWrap() { this.sheet.book.calls.format++; return this; }
  setNote() { this.sheet.book.calls.format++; return this; }
}

class FakeSheet {
  constructor(book, name) {
    this.book = book;
    this.name = name;
    this.maxRows = 1000;
    this.maxCols = 26;
    this.cells = new Map();   // "row:col" -> { value, validation, format }
    this.frozenRows = 0;
    this.tabColor = null;
  }

  _key(r, c) { return r + ':' + c; }

  _cell(r, c) {
    const key = this._key(r, c);
    if (!this.cells.has(key)) this.cells.set(key, { value: '', validation: null, format: null });
    return this.cells.get(key);
  }

  _read(r, c) {
    const cell = this.cells.get(this._key(r, c));
    if (!cell) return '';
    if (cell.value === '' && cell.validation && cell.validation.kind === 'checkbox') return false;
    return isDate(cell.value) ? new Date(cell.value.getTime()) : cell.value;
  }

  _write(r, c, value) { this._cell(r, c).value = value; }

  getName() { return this.name; }

  getRange(row, col, numRows, numCols) {
    return new FakeRange(this, row, col, numRows === undefined ? 1 : numRows, numCols === undefined ? 1 : numCols);
  }

  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  getLastRow() {
    let last = 0;
    this.cells.forEach((cell, key) => { if (cell.value !== '') last = Math.max(last, Number(key.split(':')[0])); });
    return last;
  }

  getLastColumn() {
    let last = 0;
    this.cells.forEach((cell, key) => { if (cell.value !== '') last = Math.max(last, Number(key.split(':')[1])); });
    return last;
  }

  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }

  insertColumnsAfter(after, howMany) {
    if (!(after >= 1 && after <= this.maxCols)) throw new Error('Those columns are out of bounds.');
    this.book.calls.insertColumns++;
    const moved = new Map();
    this.cells.forEach((cell, key) => {
      const [r, c] = key.split(':').map(Number);
      moved.set(this._key(r, c > after ? c + howMany : c), cell);
    });
    this.cells = moved;
    this.maxCols += howMany;
  }

  /** Sheet.clearContents() exists in Google (Range.clearContents() does not). */
  clearContents() { this.cells.forEach(cell => { cell.value = ''; }); return this; }

  insertRowsAfter(after, howMany) {
    this.book.calls.insertRows++;
    const moved = new Map();
    this.cells.forEach((cell, key) => {
      const [r, c] = key.split(':').map(Number);
      moved.set(this._key(r > after ? r + howMany : r, c), cell);
    });
    this.cells = moved;
    this.maxRows += howMany;
  }

  setFrozenRows(n) { this.frozenRows = n; }
  setTabColor(color) { this.tabColor = color; }

  /** Test helper: the used area as a 2D array of stored values. */
  dump() {
    const rows = this.getLastRow();
    const cols = this.getLastColumn();
    if (!rows || !cols) return [];
    return this.getRange(1, 1, rows, cols).getValues();
  }

  /** Test helper: write a grid as if a person typed it (Google's conversions apply). */
  type(grid, startRow, startCol) {
    grid.forEach((line, i) => line.forEach((value, j) => this._write((startRow || 1) + i, (startCol || 1) + j, sheetsParse(value))));
  }
}

class FakeSpreadsheet {
  constructor() {
    this.sheets = [];
    this.calls = { getValues: 0, setValues: 0, clearContent: 0, format: 0, insertRows: 0, insertColumns: 0 };
    this.refuseWritesTo = null;   // a tab name: writes to it fail like a protected tab
  }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error('A sheet with the name "' + name + '" already exists.');
    const sheet = new FakeSheet(this, name);
    this.sheets.push(sheet);
    return sheet;
  }
  getId() { return 'fake-control-sheet'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/fake-control-sheet/edit'; }
  getName() { return 'Valmo Partner Pulse - Control (fake)'; }
}

/** SpreadsheetApp.newDataValidation() builder, enough for Model.gs. */
function fakeSpreadsheetApp() {
  return {
    newDataValidation() {
      const rule = { kind: null, list: null, allowInvalid: false, help: '' };
      const builder = {
        requireCheckbox() { rule.kind = 'checkbox'; return builder; },
        requireValueInList(list, showDropdown) { rule.kind = 'list'; rule.list = list.slice(); rule.dropdown = showDropdown; return builder; },
        setAllowInvalid(flag) { rule.allowInvalid = flag; return builder; },
        setHelpText(text) { rule.help = text; return builder; },
        build() { return Object.assign({}, rule); }
      };
      return builder;
    },
    flush() {}
  };
}

module.exports = { FakeSpreadsheet, FakeSheet, FakeRange, fakeSpreadsheetApp, sheetsParse };
