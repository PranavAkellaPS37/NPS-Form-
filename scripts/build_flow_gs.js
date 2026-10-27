#!/usr/bin/env node
/* =============================================================================
   scripts/build_flow_gs.js: makes apps-script/Flow.gs from the form's own
   route code, so the control panel and Publish run EXACTLY the code that
   partners' phones run.

   WHAT IT IS FOR
     Google Apps Script can't load files from the web/ folder, so the route
     code is copied into a fifth Apps Script file, Flow.gs, by this script:
       web/js/flow.js        the engine (the same file every phone runs)
       web/js/flow-panel.js  the control panel's helpers (rows <-> graph)
       web/js/flow-check.js  the checker (included once it exists; until
                             then this script says so and leaves it out)
     Flow.gs then holds:
       PP_FLOW_FINGERPRINT_  the SHA-256 of those files' bytes, one after the
                             other in the order above (the web app's health
                             answer shows it, so anyone can see which code a
                             deployment runs)
       PP_FLOW_SOURCE_       the files' text as one string (the control panel
                             window will run it, so it uses the same rules)
       PP_flowLib_()         runs each file once (per Google execution) with
                             a private "root" instead of the browser's window,
                             and returns root.PP: { flow, flowPanel, ... }
     The files' code is copied INTO PP_flowLib_ as ordinary code (only each
     file's last line, "}(typeof window !== 'undefined' ? window : globalThis));",
     becomes "}(root));"), so Apps Script checks it when the file is saved and
     nothing is run from text at run time.

   HOW TO RUN IT (Terminal, in the project folder)
     node scripts/build_flow_gs.js           writes apps-script/Flow.gs
     node scripts/build_flow_gs.js --check   changes nothing; exit code 1 if
                                             Flow.gs is out of date
     You should see "Wrote apps-script/Flow.gs (... KB, fingerprint ...)".
     Run it after ANY change to web/js/flow.js, flow-panel.js or
     flow-check.js, then paste the new Flow.gs into the Apps Script project
     (+ > Script, name it Flow; the setup guide explains it). The tests fail
     while Flow.gs is out of date.

   WHAT IT READS / WRITES
     Reads the three files above. Writes only apps-script/Flow.gs (not with
     --check). Uses Node.js only (no packages).
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const OUT = 'apps-script/Flow.gs';
const SOURCES = [
  { file: 'web/js/flow.js', required: true },
  { file: 'web/js/flow-panel.js', required: true },
  { file: 'web/js/flow-check.js', required: false }
];
const FOOTER = "}(typeof window !== 'undefined' ? window : globalThis));";

/* The files that go into Flow.gs now: [{ file, text, bytes }] (notes lists what was left out). */
function readSources(root, notes) {
  const base = root || REPO;
  const out = [];
  SOURCES.forEach((src) => {
    const full = path.join(base, src.file);
    if (!fs.existsSync(full)) {
      if (src.required) throw new Error(src.file + ' is missing: Flow.gs cannot be made without it.');
      if (notes) notes.push(src.file + ' does not exist yet, so Flow.gs is made without the checker. Run this again once it exists.');
      return;
    }
    const bytes = fs.readFileSync(full);
    out.push({ file: src.file, bytes, text: bytes.toString('utf8') });
  });
  return out;
}

/* SHA-256 (hex) of the files' bytes, one after the other. */
function fingerprintOf(sources) {
  const hash = crypto.createHash('sha256');
  sources.forEach((s) => hash.update(s.bytes));
  return hash.digest('hex');
}

/* The copy that runs inside PP_flowLib_: the footer becomes "}(root));". */
function evaluatedCopy(src) {
  const text = src.text.replace(/\s+$/, '');
  const at = text.lastIndexOf(FOOTER);
  if (at < 0 || at !== text.length - FOOTER.length || text.indexOf(FOOTER) !== at) {
    throw new Error(src.file + ' must end with exactly this line (and have it only once), because Flow.gs relies on it:\n  ' + FOOTER);
  }
  return text.slice(0, at) + '}(root));';
}

/* A JSON string literal that is also safe inside an HTML <script> (no "</", no line separators). */
function scriptSafeString(text) {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  return JSON.stringify(text).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
}

/* The whole text of Flow.gs for these sources (always the same for the same files). */
function build(sources) {
  const fingerprint = fingerprintOf(sources);
  const list = sources.map((s) => '       ' + s.file).join('\n');
  const header = [
    '/* =============================================================================',
    '   Flow.gs  -  Valmo Partner Pulse: the questionnaire\'s route, for the control',
    '               panel and Publish (GENERATED FILE: do not edit it)',
    '   =============================================================================',
    '',
    '   GENERATED: do not edit this file by hand. Re-make it with (Terminal, in the',
    '   project folder):  node scripts/build_flow_gs.js',
    '',
    '   WHAT THIS FILE IS',
    '     The fifth code file of the Apps Script project (with Code, Model,',
    '     PanelServer and Panel). It carries the SAME code as these files of the',
    '     GitHub project, in this order:',
    list,
    '     so the control panel and Publish turn the Screens tab into the route',
    '     (the "graph" partners\' phones walk) with exactly the rules the phones',
    '     use. Nothing here talks to Google, the Sheet or the internet.',
    '',
    '   WHAT IS IN IT',
    '     PP_FLOW_FINGERPRINT_  SHA-256 of the files above (their bytes, one after',
    '                           the other). The web app\'s ?action=health shows it',
    '                           as flow_fingerprint.',
    '     PP_FLOW_SOURCE_       the files\' text as one string, for the control',
    '                           panel\'s window.',
    '     PP_flowLib_()         runs the files once per Google execution (each one',
    '                           with a private "root" instead of the browser\'s',
    '                           window) and returns { flow, flowPanel, ... }.',
    '                           Model.gs and Code.gs call it.',
    '',
    '   HOW TO INSTALL IT',
    '     In the Sheet: Extensions > Apps Script. If there is no file called',
    '     "Flow": + > Script, name it Flow. Replace everything in it with this',
    '     whole file and save. Then Deploy > Manage deployments > pencil icon >',
    '     Version: New version > Deploy, so the web app uses it too. Paste it',
    '     again whenever this file changes (the GitHub project says so).',
    '',
    '   WHAT IT READS AND WRITES',
    '     Nothing: it only answers when Model.gs or Code.gs ask.',
    '   ============================================================================= */',
    ''
  ].join('\n');
  const body = sources.map((s) => [
    '',
    '  /* ---- ' + s.file + ' (copied as it is; only its last line differs: "}(root));") ---- */',
    evaluatedCopy(s)
  ].join('\n')).join('\n');
  return header +
    'var PP_FLOW_FINGERPRINT_ = \'' + fingerprint + '\';\n\n' +
    'var PP_FLOW_SOURCE_ = ' + scriptSafeString(sources.map((s) => s.text).join('\n')) + ';\n\n' +
    '/** The route code ({ flow, flowPanel, ... }), made once per Google execution. */\n' +
    'function PP_flowLib_() {\n' +
    '  if (PP_flowLib_.lib) return PP_flowLib_.lib;\n' +
    '  var root = {};\n' +
    body + '\n\n' +
    '  PP_flowLib_.lib = root.PP;\n' +
    '  return root.PP;\n' +
    '}\n';
}

/* { fresh, expected, actual, fingerprint, notes } for the files under root (default: this project). */
function status(root) {
  const base = root || REPO;
  const notes = [];
  const sources = readSources(base, notes);
  const expected = build(sources);
  const outFile = path.join(base, OUT);
  const actual = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
  return { fresh: actual === expected, expected, actual, fingerprint: fingerprintOf(sources), files: sources.map((s) => s.file), notes };
}

function main(argv) {
  const check = argv.indexOf('--check') !== -1;
  let st;
  try {
    st = status(REPO);
  } catch (err) {
    console.error('Could not make Flow.gs: ' + err.message);
    return 2;
  }
  st.notes.forEach((n) => console.log('Note: ' + n));
  if (check) {
    console.log(st.fresh ? OUT + ' is up to date (fingerprint ' + st.fingerprint.slice(0, 12) + '...).'
      : OUT + ' is OUT OF DATE: run  node scripts/build_flow_gs.js  then paste the new Flow.gs into Apps Script.');
    return st.fresh ? 0 : 1;
  }
  fs.writeFileSync(path.join(REPO, OUT), st.expected);
  console.log('Wrote ' + OUT + ' (' + Math.round(Buffer.byteLength(st.expected) / 1024) + ' KB, fingerprint ' +
    st.fingerprint.slice(0, 12) + '..., from ' + st.files.join(', ') + ').' +
    (st.fresh ? ' It was already up to date.' : ' Paste it into the Apps Script project (file "Flow").'));
  return 0;
}

module.exports = { build, status, readSources, fingerprintOf, evaluatedCopy, FOOTER, OUT, SOURCES };

if (require.main === module) process.exit(main(process.argv.slice(2)));
