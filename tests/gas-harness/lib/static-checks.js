/* =============================================================================
   lib/static-checks.js  -  reads the Apps Script files WITHOUT running them

   WHAT THIS FILE IS
     Checks the coding rules of docs/control-panel-design.md section 2 by
     reading the source text:
       - every .gs file parses as modern JavaScript, without ?. and ??;
       - functions are top-level "function name() {}" declarations, and no
         function name is declared in two files (Google would silently use
         only one of them);
       - every file starts with a plain-English header comment;
       - Apps Script services are only used through allowed methods (a
         SpreadsheetApp.xxx call that is not on the list is reported even if
         no test ever reaches that line);
       - Panel.html has no <? ?> scriptlets, no external libraries, and its
         scripts parse;
       - appsscript.json has the expected time zone, engine and web app
         settings.

   HOW TO USE IT
     const { staticChecks } = require('./lib/static-checks');
     const report = staticChecks(path.resolve(__dirname, '../../../apps-script'));

   WHAT IT READS
     apps-script/*.gs, Panel.html, appsscript.json. Writes nothing.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { ALLOWED } = require('../fake-gas');

function requireAcorn() {
  const candidates = ['acorn'];   // installed once by "npm install" in tests/ (tests/node_modules)
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try the next */ }
  }
  return null;
}

const SERVICE_GLOBALS = ['SpreadsheetApp', 'DriveApp', 'HtmlService', 'CacheService', 'LockService', 'PropertiesService',
  'Utilities', 'ContentService', 'UrlFetchApp', 'Session', 'ScriptApp', 'MimeType', 'Logger'];

/* Every method name a JS engine has built in (Array, String, Object, ...). */
function builtinNames() {
  const names = new Set();
  const sources = [Array.prototype, String.prototype, Object, Object.prototype, Number, Number.prototype, Math, JSON,
    Date, Date.prototype, RegExp.prototype, Map.prototype, Set.prototype, WeakMap.prototype, Promise, Promise.prototype,
    Function.prototype, Array, String, Boolean.prototype, Symbol, Reflect, console, Intl, BigInt.prototype, Error.prototype];
  for (const src of sources) for (const n of Object.getOwnPropertyNames(src)) names.add(n);
  return names;
}

function allowedNames() {
  const names = new Set();
  for (const list of Object.values(ALLOWED)) for (const n of list) names.add(n);
  return names;
}

/* Walk every node of an acorn AST. */
function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit, node));
    else if (child && typeof child.type === 'string') walk(child, visit, node);
  }
}

function staticChecks(dir) {
  const acorn = requireAcorn();
  const out = { files: [], problems: [], warnings: [], notes: [], unknownMethods: {}, functionsByFile: {}, acorn: !!acorn };
  const problem = (file, line, text) => out.problems.push({ file, line, text });
  const warning = (file, line, text) => out.warnings.push({ file, line, text });
  if (!fs.existsSync(dir)) {
    problem('(folder)', 0, `The folder ${dir} does not exist.`);
    return out;
  }
  for (const expected of ['Code.gs', 'Model.gs', 'PanelServer.gs', 'Panel.html']) {
    if (!fs.existsSync(path.join(dir, expected))) problem(expected, 0, `${expected} is missing (contract section 2 lists it).`);
  }
  const builtins = builtinNames();
  const allowed = allowedNames();
  const declaredIn = {};
  const gsFiles = fs.readdirSync(dir).filter((f) => /\.gs$/.test(f)).sort();

  for (const file of gsFiles) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    out.files.push(file);
    const head = source.trimStart();
    const header = /^\/\*[\s\S]*?\*\//.exec(head);
    if (!header || header[0].length < 300) warning(file, 1, 'The file does not start with a long plain-English header comment (contract section 2).');
    if (!acorn) continue;
    let ast;
    try {
      ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: false });
    } catch (err) {
      problem(file, err.loc ? err.loc.line : 0, `Does not parse: ${err.message}`);
      continue;
    }
    const functions = [];
    const topVars = [];
    for (const stmt of ast.body) {
      if (stmt.type === 'FunctionDeclaration') {
        functions.push(stmt.id.name);
        (declaredIn[stmt.id.name] = declaredIn[stmt.id.name] || []).push(file);
        if (stmt.async || stmt.generator) problem(file, stmt.loc.start.line, `function ${stmt.id.name} is async or a generator; Apps Script functions must be plain.`);
      } else if (stmt.type === 'VariableDeclaration') {
        for (const d of stmt.declarations) {
          const init = d.init;
          if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
            warning(file, stmt.loc.start.line, `${d.id.name} is a function stored in a ${stmt.kind}; the contract asks for "function ${d.id.name}() {}" (Google cannot call it from menus or the panel).`);
          }
          if (stmt.kind === 'var') topVars.push(`${d.id && d.id.name} (line ${stmt.loc.start.line})`);
        }
      } else if (stmt.type !== 'EmptyStatement') {
        warning(file, stmt.loc.start.line, `Top-level code (${stmt.type}) runs every time any function runs (every web request too).`);
      }
    }
    if (topVars.length) {
      warning(file, 0, `${topVars.length} top-level "var" declaration(s); the contract asks for V8 syntax (const/let): ` +
        topVars.join(', '));
    }
    out.functionsByFile[file] = functions;
    walk(ast, (node, parent) => {
      // A name used as a property (obj.fetch) or an object key ({ fetch: 1 }) is not a global.
      const isPropertyName = parent && ((parent.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
        (parent.type === 'Property' && parent.key === node && !parent.computed));
      if (node.type === 'ChainExpression') problem(file, node.loc.start.line, 'Uses "?." (optional chaining), which the contract forbids.');
      if ((node.type === 'LogicalExpression' && node.operator === '??') || (node.type === 'AssignmentExpression' && node.operator === '??=')) {
        problem(file, node.loc.start.line, 'Uses "??" (nullish coalescing), which the contract forbids.');
      }
      if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration') problem(file, node.loc.start.line, 'Uses import, which Apps Script does not support.');
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
        const name = node.callee.property.name;
        const obj = node.callee.object;
        if (obj.type === 'Identifier' && SERVICE_GLOBALS.indexOf(obj.name) >= 0) {
          const list = ALLOWED[obj.name] || [];
          if (list.indexOf(name) < 0) problem(file, node.loc.start.line, `${obj.name}.${name}() is not on the contract's allowed list (section 2).`);
        } else if (!allowed.has(name) && !builtins.has(name)) {
          (out.unknownMethods[name] = out.unknownMethods[name] || []).push(`${file}:${node.loc.start.line}`);
        }
      }
      if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' &&
          SERVICE_GLOBALS.indexOf(node.object.name) >= 0 && node.property.name) {
        const list = ALLOWED[node.object.name] || [];
        if (list.indexOf(node.property.name) < 0 && !(node.object.name === 'Utilities' && node.property.name === 'Charset')) {
          problem(file, node.loc.start.line, `${node.object.name}.${node.property.name} is not on the contract's allowed list (section 2).`);
        }
      }
      if (node.type === 'Identifier' && !isPropertyName && ['GmailApp', 'MailApp', 'DocumentApp', 'Browser', 'CalendarApp', 'FormApp', 'Drive', 'Sheets'].indexOf(node.name) >= 0) {
        problem(file, node.loc.start.line, `Uses ${node.name}, a Google service the contract does not allow.`);
      }
      if (node.type === 'Identifier' && !isPropertyName && ['setTimeout', 'setInterval', 'require', 'process', 'fetch', 'window', 'document'].indexOf(node.name) >= 0) {
        warning(file, node.loc.start.line, `Mentions "${node.name}", which does not exist in Apps Script.`);
      }
    });
  }
  // Duplicate problems: one per (file, line, text)
  const seen = new Set();
  out.problems = out.problems.filter((p) => { const k = `${p.file}:${p.line}:${p.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const [name, files] of Object.entries(declaredIn)) {
    if (files.length > 1) problem(files.join(' + '), 0, `function ${name} is declared ${files.length} times (${files.join(', ')}); Google keeps only one of them.`);
  }

  // Panel.html
  const panelFile = path.join(dir, 'Panel.html');
  if (fs.existsSync(panelFile)) {
    const original = fs.readFileSync(panelFile, 'utf8');
    out.panelBytes = Buffer.byteLength(original);
    // HTML comments are blanked out (keeping line numbers): text inside them is not code.
    const html = original.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    const lineOf = (index) => html.slice(0, index).split('\n').length;
    let m;
    const scriptlet = /<\?/g;
    while ((m = scriptlet.exec(html))) problem('Panel.html', lineOf(m.index), 'Contains "<?" (an Apps Script scriptlet); the contract forbids them.');
    const external = /<script[^>]+src\s*=\s*["']?(https?:)?\/\/|<link[^>]+href\s*=\s*["']?(https?:)?\/\/[^"'>]+["']?[^>]*stylesheet|<link[^>]+stylesheet[^>]+href\s*=\s*["']?(https?:)?\/\/|@import\s+url\(\s*["']?https?:/gi;
    while ((m = external.exec(html))) problem('Panel.html', lineOf(m.index), 'Loads an external library or style sheet; the contract says one self-contained file.');
    // Since 21 Oct the contract (sections 2 and 14) allows google.script.host.setHeight / setWidth (the panel
    // shrinks its window on a small screen, only when Google provides them). Any other use is still a warning.
    const hostUse = /google\.script\.host(?!\.set(?:Height|Width)\b)/.exec(html);
    if (hostUse) warning('Panel.html', lineOf(hostUse.index), 'Uses google.script.host for something other than setHeight / setWidth; the contract (sections 2 and 14) allows only google.script.run and those two (the harness stand-in only logs it).');
    if (/window\.open\s*\(/.test(html)) warning('Panel.html', lineOf(html.search(/window\.open\s*\(/)), 'Uses window.open; the contract asks for <a target="_blank"> links (dialogs block pop-ups).');
    const dataTests = (html.match(/data-test|dataset\.test/g) || []).length;
    out.panelDataTests = dataTests;
    if (!dataTests) warning('Panel.html', 0, 'No data-test attributes found (contract section 14, testability).');
    if (acorn) {
      const scripts = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
      let count = 0;
      while ((m = scripts.exec(html))) {
        count += 1;
        const startLine = lineOf(m.index);
        try {
          acorn.parse(m[1], { ecmaVersion: 'latest', sourceType: 'script', locations: true });
        } catch (err) {
          problem('Panel.html', startLine + (err.loc ? err.loc.line - 1 : 0), `A <script> block does not parse: ${err.message}`);
        }
      }
      out.panelScripts = count;
    }
  }

  // appsscript.json
  const manifestFile = path.join(dir, 'appsscript.json');
  if (fs.existsSync(manifestFile)) {
    try {
      const mf = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      out.manifest = mf;
      if (mf.timeZone !== 'Asia/Kolkata') warning('appsscript.json', 0, `timeZone is ${mf.timeZone}, expected Asia/Kolkata.`);
      if (mf.runtimeVersion !== 'V8') problem('appsscript.json', 0, `runtimeVersion is ${mf.runtimeVersion}, expected V8.`);
      if (!mf.webapp || mf.webapp.executeAs !== 'USER_DEPLOYING') warning('appsscript.json', 0, 'webapp.executeAs should be USER_DEPLOYING ("Execute as: Me").');
      if (!mf.webapp || mf.webapp.access !== 'ANYONE_ANONYMOUS') warning('appsscript.json', 0, 'webapp.access should be ANYONE_ANONYMOUS ("Who has access: Anyone").');
    } catch (err) {
      problem('appsscript.json', 0, `Not valid JSON: ${err.message}`);
    }
  } else {
    out.notes.push('appsscript.json is missing (only needed for clasp).');
  }
  return out;
}

module.exports = { staticChecks };
