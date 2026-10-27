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
         scripts parse; its ONE exception, the Map's drawing library, is
         checked to be exactly what Panel.html's header promises (mapException,
         26 Oct 2026): every web address in its code is the pinned Mermaid
         (MERMAID_URL: one exact version from cdn.jsdelivr.net) or one it
         never loads (KNOWN_URLS, each with what it is for); the Map's frame
         loads Mermaid only with Subresource Integrity (MERMAID_SRI, a
         sha384 or sha512 hash, and crossOrigin "anonymous"); and every frame
         the page makes is sandboxed without "allow-same-origin";
       - appsscript.json has the expected time zone, engine and web app
         settings;
       - Flow.gs (generated from web/js by scripts/build_flow_gs.js, 23 Oct
         2026) is present and is exactly what the generator makes from the
         form's files today (flowFreshness). Being generated, it may keep its
         "var" names (other files and the tests need them as global names)
         and the shared files' Node/browser hooks (typeof module / require,
         never taken in Apps Script); every other rule applies to it too.

   HOW TO USE IT
     const { staticChecks, flowFreshness } = require('./lib/static-checks');
     const report = staticChecks(path.resolve(__dirname, '../../../apps-script'));
     const fresh = flowFreshness(appsScriptDir, webDir);   // { fresh, problem }

   WHAT IT READS
     apps-script/*.gs, Panel.html, appsscript.json; for flowFreshness also
     web/js/flow.js, flow-panel.js, flow-check.js and scripts/build_flow_gs.js.
     Writes nothing.
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

/* ---- Panel.html's one exception: the Map's drawing library --------------------------------------
   Panel.html's header promises that the page loads nothing from the internet except Mermaid, inside
   the Map's sandboxed frame, pinned and with its integrity hash. mapException checks that promise in the
   code (a reviewer's request of 26 Oct 2026), so a change that breaks it stops scenario S:
     1. every web address in the page's code (its strings) is MERMAID_URL, or one of KNOWN_URLS, which
        the page never loads (each says what it is for). Words like "starts with https://" and
        placeholders with "…" are not addresses;
     2. MERMAID_URL is Mermaid at one exact version from cdn.jsdelivr.net, written once; the frame loads
        it only as  s.src = MERMAID_URL; s.integrity = MERMAID_SRI; s.crossOrigin = "anonymous";
        (Subresource Integrity: the browser refuses any file whose bytes differ), MERMAID_SRI is a
        sha384 or sha512 hash, and MERMAID_URL is used nowhere else;
     3. every frame the page makes, h('iframe', ...), has its own sandbox without "allow-same-origin"
        (with it, Mermaid's code could reach this page, google.script.run and the Sheet); nothing else
        adds that token, changes or removes a sandbox, or makes a frame another way. */
const MERMAID_URL_RE = /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@\d+\.\d+\.\d+\/dist\/mermaid\.min\.js$/;
const SRI_RE = /^sha(384|512)-[A-Za-z0-9+/]{64,}={0,2}$/;
const KNOWN_URLS = [
  { re: /^https:\/\/raw\.githubusercontent\.com\/[^\s]+\/web\/$/, what: 'the default address of "Import from GitHub": the server fetches it (panelImport), never the page' },
  { re: /^https:\/\/mermaid\.live\/edit#base64:$/, what: 'the Map\'s "Open in mermaid.live" link: the owner may click it (a new tab); the page loads nothing from it' }
];
const MAP_LOADER = 's.src = «MERMAID_URL»; s.integrity = «MERMAID_SRI»; s.crossOrigin = "anonymous";';

/* The web addresses in a text: a host name after http(s)://, not a placeholder ("…"). */
function webAddresses(text) {
  const out = [];
  String(text).replace(/https?:\/\/[^\s'"`<>()\\]*/g, (token) => {
    const host = token.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
    if (token.indexOf('…') === -1 && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(host)) out.push(token);
    return token;
  });
  return out;
}

/* Checks the Map's exception in one parsed <script> of Panel.html (startLine: where it starts in the
   file). problem(line, text) reports a broken rule. Returns what it found, for the report. */
function mapException(ast, startLine, problem) {
  const line = (node) => startLine + (node && node.loc ? node.loc.start.line - 1 : 0);
  const decl = {};        // MERMAID_URL and MERMAID_SRI: { node, value }
  const addresses = [];   // { url, node }
  const urlUses = [];     // MERMAID_URL used (not declared): { node, parents }
  const frames = [];      // h('iframe', props)
  const chains = [];      // the outermost "a + b + c" of each concatenation
  const isCall = (node, name) => node && node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
    !node.callee.computed && node.callee.property.name === name;
  (function visit(node, parents) {
    if (!node || typeof node.type !== 'string') return;
    const parent = parents[parents.length - 1];
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && (node.id.name === 'MERMAID_URL' || node.id.name === 'MERMAID_SRI')) {
      decl[node.id.name] = { node, value: node.init && node.init.type === 'Literal' ? node.init.value : undefined };
    }
    const text = node.type === 'Literal' && typeof node.value === 'string' ? node.value : node.type === 'TemplateElement' ? node.value.cooked : null;
    if (text !== null) {
      webAddresses(text).forEach((url) => addresses.push({ url, node }));
      if (/allow-same-origin/i.test(text)) problem(line(node), 'Gives a frame "allow-same-origin" ("' + text.slice(0, 60) + '"): with it, the Map\'s drawing library could reach this page, google.script.run and the Sheet. A frame stays sandboxed without it.');
      if (text.toLowerCase() === 'iframe' && !(parent && parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && parent.callee.name === 'h' && parent.arguments[0] === node)) {
        problem(line(node), 'Makes a frame another way than h(\'iframe\', { sandbox: ... }), so its sandbox can\'t be checked.');
      }
    }
    if (node.type === 'Identifier' && node.name === 'MERMAID_URL' && !(parent && parent.type === 'VariableDeclarator' && parent.id === node)) urlUses.push({ node, parents: parents.slice() });
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'h' && node.arguments[0] &&
      node.arguments[0].type === 'Literal' && node.arguments[0].value === 'iframe') frames.push(node);
    if (node.type === 'BinaryExpression' && node.operator === '+' && !(parent && parent.type === 'BinaryExpression' && parent.operator === '+')) chains.push(node);
    if ((isCall(node, 'setAttribute') || isCall(node, 'removeAttribute') || isCall(node, 'toggleAttribute')) && node.arguments[0] &&
      node.arguments[0].type === 'Literal' && String(node.arguments[0].value).toLowerCase() === 'sandbox') {
      problem(line(node), 'Changes or removes a frame\'s sandbox (' + node.callee.property.name + '): a frame gets its sandbox only where it is made, h(\'iframe\', { sandbox: ... }).');
    }
    if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'sandbox') {
      problem(line(node), 'Changes a frame\'s sandbox (.sandbox): a frame gets its sandbox only where it is made, h(\'iframe\', { sandbox: ... }).');
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c, parents.concat([node])));
      else if (child && typeof child.type === 'string') visit(child, parents.concat([node]));
    }
  }(ast, []));
  const known = (url) => KNOWN_URLS.some((k) => k.re.test(url));
  addresses.forEach((a) => {
    if (known(a.url) || /mermaid/i.test(a.url)) return;
    problem(line(a.node), 'Mentions the web address ' + a.url + '. The page loads nothing from the internet except the Map\'s pinned Mermaid (MERMAID_URL), ' +
      'so any other address must be one it never loads: then add it to KNOWN_URLS in tests/gas-harness/lib/static-checks.js, saying what it is for.');
  });
  const mermaid = addresses.filter((a) => /mermaid/i.test(a.url) && !known(a.url));
  if (!mermaid.length && !decl.MERMAID_URL) return { mermaid: false, frames: frames.length };
  const url = decl.MERMAID_URL ? decl.MERMAID_URL.value : undefined;
  if (!decl.MERMAID_URL) problem(line(mermaid[0].node), 'The Map\'s library is loaded from ' + mermaid[0].url + ' without var MERMAID_URL: keep its one address there.');
  mermaid.forEach((a) => {
    if (decl.MERMAID_URL && a.node !== decl.MERMAID_URL.node.init) problem(line(a.node), 'The Mermaid address appears again (' + a.url + '): write it only once, as MERMAID_URL.');
  });
  if (decl.MERMAID_URL && !MERMAID_URL_RE.test(String(url))) {
    problem(line(decl.MERMAID_URL.node), 'MERMAID_URL must be Mermaid at one exact version from cdn.jsdelivr.net (like https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js), so MERMAID_SRI fits it; it is ' + JSON.stringify(url) + '.');
  }
  if (!decl.MERMAID_SRI || !SRI_RE.test(String(decl.MERMAID_SRI.value))) {
    problem(decl.MERMAID_SRI ? line(decl.MERMAID_SRI.node) : 0, 'MERMAID_SRI must be the sha384 (or sha512) hash of exactly that file, "sha384-..." (Subresource Integrity); it is ' +
      JSON.stringify(decl.MERMAID_SRI ? decl.MERMAID_SRI.value : undefined) + '.');
  }
  // the frame's own script, read from its pieces: the strings, and scriptString(NAME) as «NAME»
  const pieces = (node, out) => {
    if (node.type === 'BinaryExpression' && node.operator === '+') { pieces(node.left, out); pieces(node.right, out); } else out.push(node);
    return out;
  };
  const shape = (chain) => pieces(chain, []).map((p) => (p.type === 'Literal' && typeof p.value === 'string' ? p.value :
    p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'scriptString' && p.arguments.length === 1 &&
      p.arguments[0].type === 'Identifier' ? '«' + p.arguments[0].name + '»' : '«?»')).join('').replace(/\s+/g, ' ');
  const loaders = chains.filter((c) => shape(c).indexOf('«MERMAID_URL»') !== -1);
  if (!loaders.some((c) => shape(c).indexOf(MAP_LOADER) !== -1)) {
    problem(line(loaders[0] || (decl.MERMAID_URL && decl.MERMAID_URL.node)), 'The Map\'s frame must load Mermaid exactly as  s.src = MERMAID_URL; s.integrity = MERMAID_SRI; s.crossOrigin = "anonymous";  ' +
      '(Subresource Integrity: the browser then refuses any file whose bytes differ). Put the integrity hash back.');
  }
  urlUses.forEach((u) => {
    if (!u.parents.some((p) => loaders.indexOf(p) !== -1)) problem(line(u.node), 'MERMAID_URL is used outside the Map frame\'s loader: Mermaid may only be loaded there, with its integrity hash, inside the sandboxed frame.');
  });
  if (!frames.length) problem(line(decl.MERMAID_URL && decl.MERMAID_URL.node), 'The page loads Mermaid, but no sandboxed frame (h(\'iframe\', { sandbox: \'allow-scripts\', ... })) was found: it may only run inside one.');
  const sandboxes = frames.map((f) => {
    const props = f.arguments[1];
    const prop = props && props.type === 'ObjectExpression' ? props.properties.find((p) => p.key && (p.key.name === 'sandbox' || p.key.value === 'sandbox')) : null;
    const value = prop && prop.value.type === 'Literal' && typeof prop.value.value === 'string' ? prop.value.value : null;
    if (value === null) problem(line(f), 'A frame without its own sandbox: make it with h(\'iframe\', { sandbox: \'allow-scripts\', ... }), never without one.');
    return value;
  });
  return { mermaid: true, url, sri: decl.MERMAID_SRI && decl.MERMAID_SRI.value, frames: frames.length, sandboxes };
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
  for (const expected of ['Code.gs', 'Model.gs', 'PanelServer.gs', 'Flow.gs', 'Panel.html']) {
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
    // A generated file (Flow.gs): its "var" names and the shared files' Node/browser hooks are on purpose.
    const generated = Boolean(header && /\bGENERATED\b/.test(header[0]) && /do not edit/i.test(header[0]));
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
    if (topVars.length && !generated) {
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
      if (node.type === 'Identifier' && !isPropertyName && !generated && ['setTimeout', 'setInterval', 'require', 'process', 'fetch', 'window', 'document'].indexOf(node.name) >= 0) {
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
    // markup outside the scripts: a frame written as HTML must be sandboxed without "allow-same-origin" too
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (c) => c.replace(/[^\n]/g, ' '));
    const tag = /<iframe\b[^>]*>/gi;
    while ((m = tag.exec(markup))) {
      const sandbox = /\bsandbox\s*=\s*["']([^"']*)["']/i.exec(m[0]);
      if (!sandbox || /allow-same-origin/i.test(sandbox[1])) problem('Panel.html', lineOf(m.index), 'A frame in the page\'s markup without a sandbox, or with "allow-same-origin".');
    }
    if (acorn) {
      const scripts = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
      let count = 0;
      while ((m = scripts.exec(html))) {
        count += 1;
        const startLine = lineOf(m.index);
        let ast = null;
        try {
          ast = acorn.parse(m[1], { ecmaVersion: 'latest', sourceType: 'script', locations: true });
        } catch (err) {
          problem('Panel.html', startLine + (err.loc ? err.loc.line - 1 : 0), `A <script> block does not parse: ${err.message}`);
        }
        if (ast) {
          const found = mapException(ast, startLine, (line, text) => problem('Panel.html', line, text));
          if (found.mermaid || !out.panelMap) out.panelMap = found;
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

/*
 * Is apps-script/Flow.gs exactly what scripts/build_flow_gs.js makes from the
 * form's files today? appsScriptDir = the code under test (may be a copy),
 * webDir = the form's web/ folder. Returns { fresh, problem, fingerprint, files }.
 */
function flowFreshness(appsScriptDir, webDir) {
  const repo = path.resolve(__dirname, '..', '..', '..');
  let gen;
  try {
    gen = require(path.join(repo, 'scripts', 'build_flow_gs.js'));
  } catch (err) {
    return { fresh: false, problem: 'scripts/build_flow_gs.js could not be loaded: ' + err.message };
  }
  const sources = [];
  for (const src of gen.SOURCES) {
    const full = path.join(webDir, path.relative('web', src.file));
    if (!fs.existsSync(full)) {
      if (src.required) return { fresh: false, problem: src.file + ' is missing.' };
      continue;
    }
    const bytes = fs.readFileSync(full);
    sources.push({ file: src.file, bytes, text: bytes.toString('utf8') });
  }
  let expected;
  try {
    expected = gen.build(sources);
  } catch (err) {
    return { fresh: false, problem: 'Flow.gs could not be made: ' + err.message };
  }
  const file = path.join(appsScriptDir, 'Flow.gs');
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const fingerprint = gen.fingerprintOf(sources);
  if (actual === expected) return { fresh: true, problem: '', fingerprint, files: sources.map((x) => x.file) };
  return { fresh: false, fingerprint, files: sources.map((x) => x.file),
    problem: actual === null ? 'apps-script/Flow.gs is missing.' : 'apps-script/Flow.gs is not what node scripts/build_flow_gs.js makes from ' +
      sources.map((x) => x.file).join(', ') + ' today (out of date, or edited by hand): run that command.' };
}

module.exports = { staticChecks, flowFreshness, mapException, webAddresses, KNOWN_URLS };
