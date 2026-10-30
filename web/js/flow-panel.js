/* =============================================================================
   flow-panel.js: the control panel's side of the questionnaire's route.
   Nothing is drawn here, and partners' phones never load this file.

   WHAT IT IS FOR
     In the control panel the route is ONE ROW PER SCREEN in the Sheet's
     Screens tab (as before), plus three columns:
       next     where to go after this screen; empty = the following row
       jumps    exceptions, checked first: [{"when": <rule>, "goto": "<code>"}]
       repeat   empty = ask once; each_area; each_low_area (rated low)
     The form walks a GRAPH instead (docs/flow-engine.md, format pp-flow/1).
     This file turns one into the other, and writes the graph as text:
       fromRows(screens, survey, opts) -> { graph, warnings }
           Publish: the rows become the graph. It builds the old list from
           the visible rows exactly as Model.gs always did, lets the form's
           own converter PP.flow.fromLegacy (web/js/flow.js) make the graph,
           then adds next, jumps and repeat. A Sheet that uses none of them
           (and no thank-you screen with its own wording) gives EXACTLY
           fromLegacy's graph, so nothing changes for partners.
       toRows(graph, survey) -> { screens, unsupported }
           Import from GitHub and Restore: a graph becomes rows again. A
           graph the panel can't show (custom groups, loops over other
           lists, loops inside loops, settings the rows can't hold) is
           listed in "unsupported", screen by screen, in plain English.
       formatFlow(graph, indent) -> text
           survey.json's "flow" value, always laid out the same way (the
           GitHub copy the panel writes, and later scripts/flow.js migrate).
       surveyTextWithFlow(text, graph) -> text
           a whole survey.json text with its "flow" replaced by formatFlow
           (and its old "_flow_help" note removed): what "migrate" writes.
       FLOW_HELP   the note written at the top of the graph in survey.json.
     "PASTE A ROUTE" (27 Oct 2026): the whole route as ONE TABLE, one row per
     screen, so the owner can write it in Excel or have Claude / ChatGPT write
     it from his notes or a flowchart picture (details: the section "THE ROUTE
     AS A TABLE" below, and docs/flow-engine.md section 9):
       fromTable(text, survey, strings, opts) -> { ok, format, rows, texts,
           problems, warnings, survey }
           the pasted table (from Excel or Google Sheets, a CSV file, or the
           AI's Markdown table) becomes Screens rows and the texts they need,
           with every problem in plain English and its row number.
       toTable(rows, texts, survey, opts) -> text
           the current route as that table ("Copy the current route"); pasting
           it back changes nothing.
       templateCsv(survey, strings, opts) -> text   the Excel template (CSV)
       aiInstruction(survey, strings, opts) -> text   what to tell the AI
       parseRule / ruleText, parseJumps / jumpsText: the small rule language
           of the table ("nps <= 6", "if nps >= 9 go to support_gate").
     Nothing here ever translates: English and the Hindi the owner gives go
     into the texts; every other language gets the project's "[TRANSLATE] "
     + English placeholder until a person translates it.

   RULES fromRows FOLLOWS (contract: docs/flow-engine.md section 9)
     - Arrows ("next" and every jump's "goto") may only point to a LATER row,
       or to an ending (a thank-you screen without a rule), wherever it is:
       an ending goes nowhere, so an arrow to it can never make a circle.
       One that points back to anything else, or to a code no row has, is
       left out with a warning (codes G3 / G2), so the result can never go
       round in circles.
     - An arrow to a HIDDEN row goes where that row would have gone (its own
       "next", else the following visible row), with a warning (code C2).
     - A HIDDEN ENDING still ends the route (26 Oct 2026, review finding 1):
       an arrow to it, or a row whose "following row" lies past it, goes to
       the MAIN thank-you screen (the first visible ending) instead of
       running on into the next visible row, which may start another route
       (for example the detractors' questions). Each such arrow is told with
       a warning (code C2).
     - "repeat" works only on the kinds of question whose description says
       they may be asked once per area ("row": {"repeatable": true} in
       PP.types: the seven ordinary questions of web/js/flow.js, 0-10, faces,
       yes/no, pick one, pick several, voice/typing and information card, plus any kind
       added in web/js/types/ that says so). Anything else is ignored with a
       warning (code F1), as are jumps that can't be read.
     - An ending (thank-you screen) never goes anywhere: its next and jumps
       are ignored (code G4).
     - In "straight after each low rating" mode the problem-screens row is
       not used at all; a "next", jumps or repeat left on it change nothing
       for partners, so that warning (code F1) carries level "warning" and
       says to clear them.
     - A ROUTE THAT RUNS ON INTO ANOTHER (code G5, level "error", 27 Oct
       2026; before that only Model.gs had this rule, and Publish now
       reports this note instead):
       rows below the main thank-you screen (here: the first SHOWN
       thank-you row, with a rule or not, as Model.gs counts it) are other
       routes, each started by a jump. A shown row there that is not a
       thank-you and has no "next" of its own goes on to the next shown row
       (hidden rows are passed over; a hidden thank-you row or the end of
       the list ends the route). When that row is the target of a jump of
       ANOTHER shown row, partners of the first route would run on into the
       second one: an error, so Publish waits. In "straight after each low
       rating" mode the problem-screens row is not checked (not used).
     Warnings are { code, node, row, message } (plus level: "warning" when
     the problem changes nothing for partners, or "error" for G5): row = the
     row's place in the list (0 = first), message = plain English naming the
     question the way the panel does (opts.nameOf(row, index); default
     "question N"), in the route table's words ("then go to", "jumps",
     "ask for", "Correct it in the route table"): they reach Publish and the
     panel's cards as they are.

   READS / WRITES: only what it is given. It needs PP.flow (web/js/flow.js)
   loaded first (under Node it loads ./flow.js itself). fromTable also runs
   the checker PP.flowCheck (web/js/flow-check.js) when it is loaded, as it
   is in the control panel and in Flow.gs.

   TEST (Terminal, project folder): node tests/flow/panel_rows_test.js
   and, for the table: node tests/flow/route_table_test.js
   ES5 only, like flow.js (it also runs inside Apps Script: apps-script/
   Flow.gs is generated from it by node scripts/build_flow_gs.js).
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var panel = PP.flowPanel = {};

  panel.FLOW_HELP = 'The route through the questionnaire (format pp-flow/1, explained in docs/flow-engine.md). ' +
    'nodes = the screens, in the order the control panel lists them. next = where to go after a screen; a list ' +
    'means: the first "when" that is true wins, otherwise "default". show_if = show the screen only when the rule ' +
    'is true. repeat_for = ask it once per area (where = only the areas rated low). Live, the route is edited in ' +
    'the control panel (Questions), which also writes this copy (Publish > Backup copy in GitHub). Codes (id, ' +
    'store_as) are permanent once partners have answered. After any edit here run:  python3 scripts/flow.py check';

  var REPEATS = { each_area: true, each_low_area: true };
  var LOW = { answer: 'fn_rating:{area}', at_most: { 'var': 'area.threshold' } };
  var SKIP_FACTS = {
    language_picker: { skip: 'lang_in_url', cond: { fact: 'lang_in_url', equals: false } },
    whats_changed: { skip: 'empty', cond: { fact: 'whats_changed_count', at_least: 1 } }
  };
  var ROW_TEXT_FIELDS = ['low_label', 'high_label', 'scale_hint', 'body'];

  /* ---- small helpers -------------------------------------------------------- */
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function copy(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function str(x) { return typeof x === 'string' ? x : (x === null || x === undefined ? '' : String(x)); }
  function trim(x) { return str(x).replace(/^\s+|\s+$/g, ''); }
  function spaces(n) { var out = ''; while (out.length < n) out += ' '; return out; }
  function capital(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  /* JSON text with sorted keys, without notes (_...) or the engine's own
     index fields: two graphs that mean the same give the same text. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (isObj(v)) {
      return '{' + Object.keys(v).filter(function (k) {
        return v[k] !== undefined && k.charAt(0) !== '_' && k !== 'byId' && k !== 'legacy';
      }).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function same(a, b) { return canon(a) === canon(b); }

  function engine() {
    var flow = PP.flow;
    if (!flow || typeof flow.fromLegacy !== 'function') {
      throw new Error('flow-panel: the flow engine (web/js/flow.js) must be loaded first: PP.flow is missing.');
    }
    return flow;
  }

  function defaultName(row, index) { return 'question ' + (index + 1); }

  /* ---- which kinds can be asked once per area ("repeat") -------------------- */
  /* The kind's own description says so: "row": {"repeatable": true} in
     PP.types (web/js/flow.js; a kind added in web/js/types/, or taught from
     the catalogue by PP.flowCheck.loadCatalogue, as Model.gs PP_mdlFlowLib_
     and the panel window do). Asked at the time of use, never kept in a
     list, so a kind registered after this file loaded counts too. */
  function repeatable(type) {
    var T = PP.types;
    var d = typeof type === 'string' && T && typeof T.get === 'function' ? T.get(type) : undefined;
    return isObj(d) && isObj(d.row) && d.row.repeatable === true;
  }

  /* ---- one Screens row as a line of the old list --------------------------- */
  /* Exactly what Model.gs PP_mdlCompileFlow_ wrote before the graph: only the
     fields that are filled in. */
  function lineOf(screen) {
    var entry = { id: screen.id, type: screen.type };
    if (screen.text) entry.text = screen.text;
    if (arr(screen.options).length) entry.options = arr(screen.options).slice();
    ROW_TEXT_FIELDS.forEach(function (f) { if (screen[f]) entry[f] = screen[f]; });
    if (typeof screen.required === 'boolean') entry.required = screen.required;
    if (isObj(screen.show_if) && !has(screen.show_if, 'unreadable')) entry.show_if = copy(screen.show_if);
    if (screen.skip_if) entry.skip_if = screen.skip_if;
    return entry;
  }

  /* The jumps of a row: { list, unreadable }. The cell may hold the list
     itself, its JSON text, or { unreadable: "text as typed" }. */
  function jumpsOf(screen) {
    var j = screen.jumps;
    if (j === null || j === undefined) return { list: [] };
    if (typeof j === 'string') {
      if (!trim(j)) return { list: [] };
      try { j = JSON.parse(j); } catch (e) { return { list: [], unreadable: trim(screen.jumps) }; }
    }
    if (isObj(j) && has(j, 'unreadable')) return { list: [], unreadable: str(j.unreadable) };
    if (!Array.isArray(j)) return { list: [], unreadable: JSON.stringify(j) };
    return { list: j };
  }

  /* Does this row use anything the old list could not say? */
  function hasExtras(screen) {
    var j = jumpsOf(screen);
    return Boolean(trim(screen.next) || trim(screen.repeat) || j.list.length || j.unreadable ||
      (screen.type === 'thank_you' && (trim(screen.text) || trim(screen.body))));
  }

  function isEnding(node) { return isObj(node) && node.type === 'thank_you' && !node.show_if; }

  /* ===========================================================================
     fromRows(screens, survey, opts) -> { graph, warnings }
     =========================================================================== */
  panel.fromRows = function (screens, survey, opts) {
    var flow = engine();
    var rows = arr(screens);
    var s = isObj(survey) ? survey : {};
    var nameOf = opts && typeof opts.nameOf === 'function' ? opts.nameOf : defaultName;
    var lines = [];
    var visible = [];          // row index of each line, in order
    rows.forEach(function (row, i) {
      if (isObj(row) && row.active !== false) {
        lines.push(lineOf(row));
        visible.push(i);
      }
    });
    var input = {};
    Object.keys(s).forEach(function (k) { input[k] = s[k]; });
    input.flow = lines;
    var graph = flow.fromLegacy(input);
    var warnings = [];
    if (!visible.some(function (i) { return hasExtras(rows[i]); })) return { graph: graph, warnings: warnings };

    // Which node each visible row became (fromLegacy keeps the order; in
    // "immediate" mode the area ratings row is the group and the problem
    // screens row is dropped). A thank-you it had to add comes last.
    var immediate = isObj(s.deep_dive) && s.deep_dive.when === 'immediate';
    var nodeAt = {};
    var n = 0;
    visible.forEach(function (i) {
      nodeAt[i] = immediate && rows[i].type === 'function_deep_dives' ? null : graph.nodes[n++];
    });
    var autoEnd = n < graph.nodes.length ? graph.nodes[graph.nodes.length - 1] : null;
    var firstAt = {};
    rows.forEach(function (row, i) {
      var id = isObj(row) ? trim(row.id) : '';
      if (id && !has(firstAt, '#' + id)) firstAt['#' + id] = i;
    });
    /* The MAIN ending: the first visible thank-you screen that always ends the
       route (no rule), else the thank-you screen the form adds at the end.
       There always is one: without a visible ending the form adds its own. */
    var mainEnd = null;
    visible.forEach(function (i) {
      if (!mainEnd && rows[i].type === 'thank_you' && isEnding(nodeAt[i])) mainEnd = { node: nodeAt[i], at: i };
    });
    if (!mainEnd && autoEnd) mainEnd = { node: autoEnd, at: -1 };

    function name(i) { return i < 0 ? 'the thank-you screen the form adds at the end' : nameOf(rows[i], i); }
    /* The main ending in a sentence, named like every other row (nameOf), always
       followed by " instead": 'the main thank-you screen, row 10 ("Thank you!"),'. */
    function mainName(at) { return at < 0 ? 'the thank-you screen the form adds at the end' : 'the main thank-you screen, ' + name(at) + ','; }
    var FIX = 'Correct it in the route table (Questions > Paste a route).';
    function codeOf(i) { return '"' + trim(rows[i].id) + '"'; }
    function warn(code, i, message) { warnings.push({ code: code, node: trim(rows[i].id), row: i, message: message }); }
    /* A thank-you screen that is switched off: it still ends the route (at the main ending). */
    function hiddenEnding(k) { return isObj(rows[k]) && rows[k].active === false && rows[k].type === 'thank_you'; }
    /* A visible row that always ends the route: arrows may point at it from anywhere. */
    function endingRow(k) { return Boolean(nodeAt[k]) && isEnding(nodeAt[k]); }

    /* The node shown after row j: the first visible row below it, else the
       added thank-you. A hidden ending on the way still ends the route: then
       the main ending (ending = that hidden ending's row). */
    function following(j) {
      for (var k = j + 1; k < rows.length; k++) {
        if (nodeAt[k]) return { node: nodeAt[k], at: k };
        if (hiddenEnding(k) && mainEnd) return { node: mainEnd.node, at: mainEnd.at, ending: k };
      }
      return autoEnd ? { node: autoEnd, at: -1 } : null;
    }

    /* Where an arrow to "code" (from row "from") really goes:
       { id, at, via: [hidden rows passed], ending: the hidden ending's row (when
       the main ending stands in for it) } or { problem, at } */
    function resolve(code, from, via) {
      if (!has(firstAt, '#' + code)) return { problem: 'unknown' };
      var j = firstAt['#' + code];
      if (j <= from && !endingRow(j)) return { problem: 'earlier', at: j };
      if (nodeAt[j]) return { id: nodeAt[j].id, at: j, via: via };
      var passed = via.concat([j]);
      if (hiddenEnding(j) && mainEnd) return { id: mainEnd.node.id, at: mainEnd.at, via: passed, ending: j };
      var own = trim(rows[j].next);
      if (own) {
        var r = resolve(own, j, passed);
        if (!r.problem) return r;
      }
      var f = following(j);
      if (!f) return { problem: 'nowhere', at: j, via: passed };
      var out = { id: f.node.id, at: f.at, via: passed };
      if (f.ending !== undefined) out.ending = f.ending;
      return out;
    }

    /* An arrow of row i (what = how the message names it), or undefined when it can't be used. */
    function arrow(code, i, what) {
      var r = resolve(code, i, []);
      if (r.problem === 'unknown') {
        warn('G2', i, capital(name(i)) + ': ' + what + ' goes to a question that does not exist, so it is left out. ' +
          FIX + ' (Its code is ' + codeOf(i) + '; it goes to "' + code + '".)');
        return undefined;
      }
      if (r.problem === 'earlier') {
        warn('G3', i, capital(name(i)) + ': ' + what + ' goes back to ' + name(r.at) + '. Arrows may only go forward ' +
          '(to a later row or an ending), so it is left out. (Its code is ' + codeOf(i) + '; it goes to "' + code + '".)');
        return undefined;
      }
      if (r.via.length && r.ending !== undefined) {
        // a hidden ending still ends the route: at the main thank-you screen, never in the next route
        var first = r.via[0];
        var whyEnd = first === r.ending ? 'an ending that is hidden' : 'which is hidden, and the row after it is ' +
          name(r.ending) + ', an ending that is hidden too';
        warn('C2', i, capital(name(i)) + ': ' + what + ' goes to ' + name(first) + ', ' + whyEnd + ', so partners end at ' +
          mainName(r.at) + ' instead. (Its code is ' + codeOf(i) + '; that ' +
          (first === r.ending ? 'ending' : 'question') + '\'s code is ' + codeOf(first) + '.)');
        return r.id;
      }
      if (r.via.length) {
        var hidden = r.via[0];
        // hidden, or (in "straight after each low rating" mode) the problem screens row, which the form does not use
        var why = rows[hidden].active === false ? 'which is hidden' : 'which is not used while the problem screens follow ' +
          'each low rating';
        if (r.problem === 'nowhere') {
          warn('C2', i, capital(name(i)) + ': ' + what + ' goes to ' + name(hidden) + ', ' + why + ', and no shown ' +
            'row comes after it, so it is left out. (Its code is ' + codeOf(i) + '; that question\'s code is ' + codeOf(hidden) + '.)');
          return undefined;
        }
        warn('C2', i, capital(name(i)) + ': ' + what + ' goes to ' + name(hidden) + ', ' + why + ', so it goes to ' +
          name(r.at) + ' instead. (Its code is ' + codeOf(i) + '; that question\'s code is ' + codeOf(hidden) + '.)');
      }
      return r.id;
    }

    /* Where row i goes when nothing else applies (its "following row"): the
       next visible row, as the form's converter made it, except past a
       hidden ending, which still ends the route (at the main ending). */
    function fallThrough(i, node) {
      var f = following(i);
      if (!f || f.ending === undefined) return node.next;
      warn('C2', i, capital(name(i)) + ' goes on to ' + name(f.ending) + ', an ending that is hidden, so partners end at ' +
        mainName(f.at) + ' instead of going on to the rows below it. (Its code is ' +
        codeOf(i) + '; that ending\'s code is ' + codeOf(f.ending) + '.)');
      return f.node.id;
    }

    visible.forEach(function (i) {
      var row = rows[i];
      var node = nodeAt[i];
      if (!hasExtras(row)) {
        // no arrows of its own: only its following row can change (a hidden ending below it)
        if (node && !isEnding(node) && typeof node.next === 'string' && !trim(row.next)) node.next = fallThrough(i, node);
        return;
      }
      if (!node) {
        warnings.push({ code: 'F1', level: 'warning', node: trim(row.id), row: i, message: capital(name(i)) + ': the ' +
          'problem screens follow each low rating (setting "When to ask about problems": straight after each low ' +
          'rating), so this row\'s "then go to", "jumps" and "ask for" are not used. They change nothing ' +
          'for partners: clear them in the route table (Questions > Paste a route), or choose "After all the area ' +
          'ratings" in that setting. (Its code is ' + codeOf(i) + '.)' });
        return;
      }
      if (row.type === 'thank_you') {
        if (trim(row.text)) node.text = trim(row.text);
        if (trim(row.body)) node.body = trim(row.body);
      }
      var j = jumpsOf(row);
      if (j.unreadable) {
        warn('F1', i, capital(name(i)) + ': its "jumps" could not be read, so they are left out. ' + FIX +
          ' (Its code is ' + codeOf(i) + '; its jumps say ' + JSON.stringify(j.unreadable.slice(0, 60)) + '.)');
      }
      if (isEnding(node)) {
        if (trim(row.next) || j.list.length) {
          warn('G4', i, capital(name(i)) + ' is an ending: partners stop there, so its "then go to" and "jumps" are ' +
            'not used. (Its code is ' + codeOf(i) + '.)');
        }
      } else {
        var dflt;
        if (trim(row.next)) {
          var to = arrow(trim(row.next), i, 'its "then go to"');
          if (to !== undefined) dflt = to;
        }
        if (dflt === undefined) dflt = typeof node.next === 'string' ? fallThrough(i, node) : node.next;
        var list = [];
        j.list.forEach(function (jump, k) {
          var what = 'jump ' + (k + 1);
          if (!isObj(jump) || !isObj(jump.when) || !trim(jump['goto'])) {
            warn('F1', i, capital(name(i)) + ': ' + what + ' has no rule or no question to go to, so it is left out. ' +
              FIX + ' (Its code is ' + codeOf(i) + '.)');
            return;
          }
          var target = arrow(trim(jump['goto']), i, what);
          if (target !== undefined) list.push({ when: copy(jump.when), 'goto': target });
        });
        node.next = list.length ? list.concat([{ 'default': dflt }]) : dflt;
      }
      var repeat = trim(row.repeat);
      if (repeat) {
        if (!has(REPEATS, repeat)) {
          warn('F1', i, capital(name(i)) + ': its "ask for" says "' + repeat + '", which the form does not know, so it ' +
            'is asked once. Write one of: once (empty), each area, each area rated low. (Its code is ' + codeOf(i) + '.)');
        } else if (!repeatable(row.type)) {
          var kinds = repeatableKinds();
          warn('F1', i, capital(name(i)) + ': only some kinds of question' + (kinds ? ' (' + kinds + ')' : '') +
            ' can be asked once per area, so its "ask for" is not used here. (Its code is ' +
            codeOf(i) + '; its kind is "' + kindName(row) + '".)');
        } else {
          node.store_as = trim(row.id) + ':{area}';
          node.label = 'fn.{area}.name';
          node.repeat_for = repeat === 'each_low_area' ? { each: 'area', 'in': 'areas', where: copy(LOW) } : { each: 'area', 'in': 'areas' };
        }
      }
    });

    /* G5: a route below the main thank-you that runs on into another route
       (see the top of this file). Exactly the rule Model.gs had until 27 Oct
       2026 (PP_mdlCheckRunIntoRoutes_, now removed): tests/flow/panel_rows_test.js
       keeps a frozen copy of it and compares the two on generated routes. */
    var shown = function (k) { return isObj(rows[k]) && rows[k].active !== false; };
    var mainRow = -1;
    rows.forEach(function (row, k) { if (mainRow < 0 && shown(k) && row.type === 'thank_you') mainRow = k; });
    if (mainRow >= 0) {
      var jumpedTo = {};   // '#code' -> the shown rows whose jumps lead there
      rows.forEach(function (row, k) {
        if (!shown(k)) return;
        jumpsOf(row).list.forEach(function (jump) {
          var to = isObj(jump) ? trim(jump['goto']) : '';
          if (!to) return;
          if (!has(jumpedTo, '#' + to)) jumpedTo['#' + to] = [];
          if (jumpedTo['#' + to].indexOf(k) === -1) jumpedTo['#' + to].push(k);
        });
      });
      rows.forEach(function (row, i) {
        if (i <= mainRow || !shown(i) || row.type === 'thank_you' || trim(row.next)) return;
        if (immediate && row.type === 'function_deep_dives') return;   // not part of the route in that mode
        var k = i + 1;
        while (k < rows.length && !shown(k) && !(isObj(rows[k]) && rows[k].type === 'thank_you')) k++;
        if (k >= rows.length || !shown(k)) return;                   // the end, or a hidden ending: the route ends
        var intoId = trim(rows[k].id);
        var from = (has(jumpedTo, '#' + intoId) ? jumpedTo['#' + intoId] : []).filter(function (at) { return at !== i; });
        if (!intoId || !from.length) return;
        var jumpers = from.map(name);
        warnings.push({ code: 'G5', level: 'error', node: trim(row.id), row: i, message: capital(name(i)) + ' has no ' +
          '"then go to", so partners who answer it go straight on to ' + name(k) + (rows[k].type === 'thank_you' ?
          ', the ending of another route: ' : ', which starts another route: ') + list(jumpers) + ' ' +
          (jumpers.length === 1 ? 'jumps' : 'jump') + ' there. Write where it goes in its "then go to" column, for ' +
          'example its own ending, or add an ending row between them. If both routes should carry on there, write "' +
          intoId + '" in its "then go to" to say so. (Its code is ' + codeOf(i) + '; the code of the row after it is "' +
          intoId + '".)' });
      });
    }
    return { graph: graph, warnings: warnings };
  };

  /* ===========================================================================
     toRows(graph, survey) -> { screens, unsupported }
     =========================================================================== */
  function blankRow(id, type) {
    return { id: str(id), type: str(type), text: '', required: null, show_if: null, skip_if: '', options: [],
      low_label: '', high_label: '', scale_hint: '', body: '', active: true, next: '', jumps: [], repeat: '' };
  }

  /* skip_if comes back from the fact rule fromLegacy made of it. */
  function splitSkip(row, node) {
    var rule = node.show_if;
    var skip = SKIP_FACTS[row.type];
    if (!rule) return;
    if (skip && same(rule, skip.cond)) {
      row.skip_if = skip.skip;
      return;
    }
    if (skip && isObj(rule) && Array.isArray(rule.all) && rule.all.length === 2 && same(rule.all[0], skip.cond) &&
      Object.keys(rule).length === 1) {
      row.skip_if = skip.skip;
      row.show_if = copy(rule.all[1]);
      return;
    }
    row.show_if = copy(rule);
  }

  function genericRow(node) {
    var row = blankRow(node.id, node.type);
    if (typeof node.text === 'string') row.text = node.text;
    ROW_TEXT_FIELDS.forEach(function (f) { if (typeof node[f] === 'string') row[f] = node[f]; });
    if (Array.isArray(node.options)) {
      row.options = node.options.map(function (o) { return isObj(o) ? str(o.code) : str(o); });
    }
    if (typeof node.required === 'boolean') row.required = node.required;
    splitSkip(row, node);
    return row;
  }

  function isAreaLoop(rf) { return isObj(rf) && rf.each === 'area' && rf['in'] === 'areas'; }

  panel.toRows = function (graph, survey) {
    var flow = engine();
    var s = isObj(survey) ? survey : {};
    var unsupported = [];
    var screens = [];
    function refuse(id, message) { unsupported.push({ node: str(id), message: message }); }
    if (!flow.isGraph(graph)) {
      refuse('', 'This is not a route in the pp-flow/1 format, so the control panel cannot read it.');
      return { screens: screens, unsupported: unsupported };
    }
    var immediate = isObj(s.deep_dive) && s.deep_dive.when === 'immediate';
    var rowOfNode = {};            // '#' + node id -> the row it became (arrows are written with row codes)
    var made = [];                 // [{ node, row }] for the nodes that became a row carrying the arrows

    arr(graph.nodes).forEach(function (node) {
      if (!isObj(node) || typeof node.id !== 'string' || !node.id) {
        refuse(isObj(node) ? node.id : '', 'A screen without a code, which the control panel cannot show.');
        return;
      }
      var rf = node.repeat_for;
      var row = null;
      if (node.type === 'group') {
        var body = isObj(node.body) ? node.body : {};
        var parts = arr(body.nodes);
        var rate = parts[0];
        var dive = parts[1];
        var looksImmediate = parts.length === 2 && isAreaLoop(rf) && !rf.where && isObj(rate) && isObj(dive) &&
          rate.type === 'function_rating' && dive.type === 'function_deep_dive' && body.start === rate.id &&
          !rate.repeat_for && !dive.repeat_for;
        if (!looksImmediate) {
          refuse(node.id, 'A group of screens the control panel cannot show (it only shows the area ratings with ' +
            'their problem screen straight after each low rating). Edit it in web/config/survey.json.');
          return;
        }
        if (!immediate) {
          refuse(node.id, 'Problem screens straight after each low rating, but the setting "When to ask about problems" ' +
            'says after all the area ratings (deep_dive.when). Make the two agree.');
          return;
        }
        row = blankRow(rate.id, 'function_ratings');
        if (typeof rate.required === 'boolean') row.required = rate.required;
        if (node.show_if) row.show_if = copy(node.show_if);
        screens.push(row);
        screens.push(blankRow(dive.id, 'function_deep_dives'));
        rowOfNode['#' + node.id] = row.id;
        made.push({ node: node, row: row });
        return;
      }
      if (node.type === 'function_rating' || node.type === 'function_deep_dive') {
        var wantWhere = node.type === 'function_deep_dive';
        if (!isAreaLoop(rf) || (wantWhere ? !same(rf.where, LOW) : Boolean(rf.where))) {
          refuse(node.id, 'Area screens that are not asked the standard way (one per area' +
            (wantWhere ? ', for each area rated low' : '') + '), which the control panel cannot show.');
          return;
        }
        if (immediate) {
          refuse(node.id, 'Problem screens after all the area ratings, but the setting "When to ask about problems" ' +
            'says straight after each low rating (deep_dive.when). Make the two agree.');
          return;
        }
        row = blankRow(node.id, wantWhere ? 'function_deep_dives' : 'function_ratings');
        if (!wantWhere && typeof node.required === 'boolean') row.required = node.required;
        if (node.show_if) row.show_if = copy(node.show_if);
      } else if (node.type === 'support_block') {
        row = blankRow(node.id, 'support_block');
        if (typeof node.text === 'string') row.text = node.text;
        if (typeof node.required === 'boolean') row.required = node.required;
        if (node.show_if) row.show_if = copy(node.show_if);
      } else {
        row = genericRow(node);
        if (rf) {
          if (!repeatable(node.type)) {
            refuse(node.id, 'A screen of the kind "' + node.type + '" asked once per item, which the control panel cannot show.');
            return;
          }
          if (!isAreaLoop(rf)) {
            refuse(node.id, 'Asked once for each item of "' + str(rf['in']) + '"; the control panel can only repeat a ' +
              'question for each area.');
            return;
          }
          row.repeat = rf.where ? 'each_low_area' : 'each_area';
        }
      }
      screens.push(row);
      rowOfNode['#' + node.id] = row.id;
      made.push({ node: node, row: row });
    });

    // What the rows give without arrows: every other setting must come out the same.
    var base = panel.fromRows(screens, s).graph;
    var baseById = {};
    var baseGroup = null;
    arr(base.nodes).forEach(function (b) {
      if (!isObj(b)) return;
      baseById['#' + b.id] = b;
      if (b.type === 'group' && !baseGroup) baseGroup = b;
    });
    function baseOf(node) { return node.type === 'group' ? baseGroup : baseById['#' + node.id]; }
    function withoutNext(node) {
      var out = {};
      Object.keys(node).forEach(function (k) { if (k !== 'next') out[k] = node[k]; });
      if (node.type === 'group' && isObj(node.body)) {
        out.body = { start: node.body.start, nodes: arr(node.body.nodes).map(withoutNext) };
      }
      return out;
    }
    var kept = [];
    made.forEach(function (m) {
      var b = baseOf(m.node);
      var keys = {};
      if (b) {
        var x = withoutNext(m.node);
        var y = withoutNext(b);
        Object.keys(x).concat(Object.keys(y)).forEach(function (k) {
          if (k.charAt(0) !== '_' && k !== 'byId' && !same(x[k], y[k])) keys[k] = true;
        });
        if (m.node.type === 'group' && isObj(m.node.body) && arr(m.node.body.nodes).length === 2) {
          // the arrows inside the group are always rating -> problem screen -> next area
          var inner = m.node.body.nodes;
          if (inner[0].next !== inner[1].id || inner[1].next !== '@next_item') keys.body = true;
        }
      }
      if (!b || Object.keys(keys).length) {
        refuse(m.node.id, 'Settings the control panel cannot show or keep: ' + (b ? Object.keys(keys).join(', ') : 'all of them') + '.');
      } else {
        kept.push(m);
      }
    });

    // The arrows: compare each node with what the rows give without arrows.
    function rowCode(id) { return has(rowOfNode, '#' + id) ? rowOfNode['#' + id] : undefined; }
    kept.forEach(function (m) {
      var node = m.node;
      var b = baseOf(node);
      var dflt = b ? b.next : undefined;
      var next = node.next;
      var wanted = next;
      var jumps = [];
      if (Array.isArray(next)) {
        wanted = undefined;
        next.forEach(function (e) {
          if (isObj(e) && has(e, 'default')) wanted = e['default'];
          else if (isObj(e) && has(e, 'goto')) jumps.push(e);
        });
        if (wanted === undefined || !has(next[next.length - 1], 'default')) {
          refuse(node.id, 'Its list of jumps has no final "default" arrow, which the control panel cannot show.');
          return;
        }
      }
      var bad = false;
      jumps.forEach(function (e) {
        var code = rowCode(e['goto']);
        if (code === undefined) bad = true;
        else m.row.jumps.push({ when: copy(e.when), 'goto': code });
      });
      if (bad) {
        refuse(node.id, 'A jump goes to a screen that is not in the list of screens (inside a group, or missing).');
        return;
      }
      if (wanted !== undefined && wanted !== dflt) {
        var to = rowCode(wanted);
        if (to === undefined) {
          refuse(node.id, 'It goes on to a screen that is not in the list of screens ("' + str(wanted) + '").');
          return;
        }
        m.row.next = to;
      }
      if (wanted === undefined && dflt !== undefined) {
        refuse(node.id, 'It does not say where to go next (and it is not an ending), which the control panel cannot show.');
      }
    });

    // Proof: the rows must give the same graph back; anything else is listed.
    if (!unsupported.length) {
      var back = panel.fromRows(screens, s).graph;
      if (!same(back, graph)) {
        if (back.start !== graph.start) {
          refuse(str(graph.start), 'The route starts at "' + str(graph.start) + '", not at its first screen, which the control panel cannot show.');
        }
        if (!same(back.collections, graph.collections)) {
          refuse('', 'Its lists to repeat over ("collections") differ from the standard ones (the areas, with the low ' +
            'rating ' + inline(back.collections && back.collections.areas && back.collections.areas.defaults) +
            ' from deep_dive.threshold, and the support questions), which the control panel cannot keep.');
        }
        var backById = {};
        arr(back.nodes).forEach(function (b) { if (isObj(b)) backById['#' + b.id] = b; });
        var inGraph = {};
        arr(graph.nodes).forEach(function (node) {
          if (!isObj(node)) return;
          inGraph['#' + node.id] = true;
          var b = backById['#' + node.id];
          if (!b) {
            refuse(node.id, 'The control panel would lose this screen.');
          } else if (!same(b, node)) {
            var keys = {};
            Object.keys(node).concat(Object.keys(b)).forEach(function (k) {
              if (k.charAt(0) !== '_' && k !== 'byId' && !same(node[k], b[k])) keys[k] = true;
            });
            refuse(node.id, 'Settings the control panel cannot show or keep: ' + Object.keys(keys).join(', ') + '.');
          }
        });
        arr(back.nodes).forEach(function (b) {
          if (isObj(b) && !inGraph['#' + b.id]) {
            refuse(b.id, 'The control panel would add this screen (the route must end with a thank-you screen).');
          }
        });
        if (!unsupported.length) refuse('', 'The control panel would change this route.');
      }
    }
    return { screens: screens, unsupported: unsupported };
  };

  /* ===========================================================================
     formatFlow(graph, indent) -> text: survey.json's "flow" value
     The first line is "{"; every other line starts with "indent" spaces (the
     indentation of the line holding "flow"), so it can follow  "flow": .
     =========================================================================== */
  var NODE_GROUPS = [
    ['show_if'],
    ['repeat_for'],
    ['text', 'label', 'help', 'low_label', 'high_label', 'scale_hint', 'body', 'detail_text', 'detail_text_required'],
    ['options'],
    ['rows'],
    ['comment'],
    ['rating_from', 'issue_code_from', 'allow_not_applicable', 'require_choice', 'require_detail_if_other', 'block', 'required']
  ];
  var FIRST_LINE = ['id', 'type', 'store_as'];
  var KNOWN = {};
  FIRST_LINE.concat(['next']).forEach(function (k) { KNOWN[k] = true; });
  NODE_GROUPS.forEach(function (g) { g.forEach(function (k) { KNOWN[k] = true; }); });

  /* Inside a rule, a loop or a list description the keys always come in
     this order (then any others, A to Z): {answer, at_most}, {each, in,
     where}, {list, defaults}, {from, text, other}, {when, goto}. */
  var INNER_ORDER = ['all', 'any', 'not', 'answer', 'fact', 'var', 'each', 'list', 'from', 'equals', 'not_equals',
    'at_most', 'at_least', 'in', 'answered', 'where', 'store_as', 'text', 'other', 'defaults', 'when', 'goto', 'default'];
  function orderedKeys(v) {
    var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined && k !== 'byId'; });
    var known = INNER_ORDER.filter(function (k) { return keys.indexOf(k) !== -1; });
    var notes = keys.filter(function (k) { return k.charAt(0) === '_'; }).sort();
    var rest = keys.filter(function (k) { return known.indexOf(k) === -1 && notes.indexOf(k) === -1; }).sort();
    return notes.concat(known, rest);
  }
  function inline(v) {
    if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
    if (isObj(v)) {
      var keys = orderedKeys(v);
      if (!keys.length) return '{}';
      return '{ ' + keys.map(function (k) { return JSON.stringify(k) + ': ' + inline(v[k]); }).join(', ') + ' }';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function pair(k, v) { return JSON.stringify(k) + ': ' + inline(v); }

  /* One node as lines; pad = the indentation of its first line. */
  function nodeLines(node, pad) {
    if (!isObj(node)) return [pad + inline(node)];
    var inner = pad + '  ';
    var parts = [];                     // each: a list of lines (the first without the "inner" pad)
    var first = FIRST_LINE.filter(function (k) { return node[k] !== undefined; }).map(function (k) { return pair(k, node[k]); });
    var notes = Object.keys(node).filter(function (k) { return k.charAt(0) === '_' && node[k] !== undefined; }).sort();
    if (notes.length) parts.push([notes.map(function (k) { return pair(k, node[k]); }).join(', ')]);
    NODE_GROUPS.forEach(function (group) {
      var found = group.filter(function (k) {
        return node[k] !== undefined && !(k === 'body' && isObj(node[k]));
      });
      if (found.length) parts.push([found.map(function (k) { return pair(k, node[k]); }).join(', ')]);
    });
    var other = Object.keys(node).filter(function (k) {
      return node[k] !== undefined && k.charAt(0) !== '_' && !has(KNOWN, k) && k !== 'byId';
    }).sort();
    if (other.length) parts.push([other.map(function (k) { return pair(k, node[k]); }).join(', ')]);
    if (isObj(node.body)) {
      var b = node.body;
      var lines = ['"body": {'];
      var members = [];
      Object.keys(b).filter(function (k) { return k.charAt(0) === '_' && b[k] !== undefined; }).sort().forEach(function (k) {
        members.push([inner + '  ' + pair(k, b[k])]);
      });
      if (b.start !== undefined) members.push([inner + '  ' + pair('start', b.start)]);
      if (Array.isArray(b.nodes)) {
        var list = [inner + '  "nodes": ['];
        b.nodes.forEach(function (child, i) {
          var cl = nodeLines(child, inner + '    ');
          if (i < b.nodes.length - 1) cl[cl.length - 1] += ',';
          list = list.concat(cl);
        });
        list.push(inner + '  ]');
        members.push(list);
      }
      Object.keys(b).filter(function (k) {
        return b[k] !== undefined && k.charAt(0) !== '_' && k !== 'start' && k !== 'nodes' && k !== 'byId';
      }).sort().forEach(function (k) { members.push([inner + '  ' + pair(k, b[k])]); });
      members.forEach(function (m, i) {
        if (i < members.length - 1) m[m.length - 1] += ',';
        lines = lines.concat(m);
      });
      lines.push(inner + '}');
      parts.push(lines);
    }
    if (node.next !== undefined) {
      if (Array.isArray(node.next)) {
        var arrows = ['"next": ['];
        node.next.forEach(function (e, i) {
          arrows.push(inner + '  ' + inline(e) + (i < node.next.length - 1 ? ',' : ''));
        });
        arrows.push(inner + ']');
        parts.push(arrows);
      } else {
        parts.push([pair('next', node.next)]);
      }
    }
    if (!parts.length) return [pad + (first.length ? '{ ' + first.join(', ') + ' }' : '{}')];
    var out = [pad + (first.length ? '{ ' + first.join(', ') + ',' : '{')];
    parts.forEach(function (lines, i) {
      var last = i === parts.length - 1;
      var block = lines.slice();
      block[0] = inner + block[0];
      block[block.length - 1] += last ? ' }' : ',';
      out = out.concat(block);
    });
    return out;
  }

  panel.formatFlow = function (graph, indent) {
    var g = isObj(graph) ? graph : {};
    var base = spaces(typeof indent === 'number' && indent > 0 ? indent : 0);
    var pad = base + '  ';
    var members = [];
    members.push([pad + pair('_help', panel.FLOW_HELP)]);
    Object.keys(g).filter(function (k) { return k.charAt(0) === '_' && k !== '_help' && g[k] !== undefined; }).sort()
      .forEach(function (k) { members.push([pad + pair(k, g[k])]); });
    ['format', 'start'].forEach(function (k) { if (g[k] !== undefined) members.push([pad + pair(k, g[k])]); });
    if (isObj(g.collections)) {
      var names = Object.keys(g.collections).filter(function (k) { return g.collections[k] !== undefined; }).sort();
      if (!names.length) {
        members.push([pad + '"collections": {}']);
      } else {
        var c = [pad + '"collections": {'];
        names.forEach(function (k, i) { c.push(pad + '  ' + pair(k, g.collections[k]) + (i < names.length - 1 ? ',' : '')); });
        c.push(pad + '}');
        members.push(c);
      }
    } else if (g.collections !== undefined) {
      members.push([pad + pair('collections', g.collections)]);
    }
    if (Array.isArray(g.nodes)) {
      var list = [pad + '"nodes": ['];
      g.nodes.forEach(function (node, i) {
        var lines = nodeLines(node, pad + '  ');
        if (i < g.nodes.length - 1) {
          lines[lines.length - 1] += ',';
          lines.push('');
        }
        list = list.concat(lines);
      });
      list.push(pad + ']');
      members.push(list);
    } else if (g.nodes !== undefined) {
      members.push([pad + pair('nodes', g.nodes)]);
    }
    Object.keys(g).filter(function (k) {
      return g[k] !== undefined && k.charAt(0) !== '_' && ['format', 'start', 'collections', 'nodes', 'byId', 'legacy'].indexOf(k) === -1;
    }).sort().forEach(function (k) { members.push([pad + pair(k, g[k])]); });
    var out = ['{'];
    members.forEach(function (m, i) {
      var lines = m.slice();
      if (i < members.length - 1) lines[lines.length - 1] += ',';
      out = out.concat(lines);
    });
    out.push(base + '}');
    return out.join('\n');
  };

  /* ===========================================================================
     surveyTextWithFlow(text, graph) -> the survey.json text with its "flow"
     value written by formatFlow and its old "_flow_help" note removed. Every
     other byte stays as it was.
     =========================================================================== */
  /* The members of the outer { } of a JSON text: [{ key, start, valueStart, valueEnd }]. */
  function topMembers(text) {
    var i = 0;
    var out = [];
    function space() { while (i < text.length && /\s/.test(text.charAt(i))) i++; }
    function skipString() {
      i++;
      while (i < text.length) {
        var ch = text.charAt(i);
        if (ch === '\\') i += 2;
        else if (ch === '"') { i++; return; }
        else i++;
      }
      throw new Error('flow-panel: a text in survey.json is not closed.');
    }
    function skipValue() {
      var ch = text.charAt(i);
      if (ch === '"') { skipString(); return; }
      if (ch === '{' || ch === '[') {
        var depth = 0;
        while (i < text.length) {
          ch = text.charAt(i);
          if (ch === '"') { skipString(); continue; }
          if (ch === '{' || ch === '[') depth++;
          if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) { i++; return; }
          }
          i++;
        }
        throw new Error('flow-panel: survey.json is not complete.');
      }
      while (i < text.length && !/[\s,}\]]/.test(text.charAt(i))) i++;
    }
    space();
    if (text.charAt(i) !== '{') throw new Error('flow-panel: survey.json does not start with {.');
    i++;
    for (;;) {
      space();
      if (text.charAt(i) === '}') return out;
      if (text.charAt(i) !== '"') throw new Error('flow-panel: survey.json has something unexpected at character ' + i + '.');
      var start = i;
      skipString();
      var key = JSON.parse(text.slice(start, i));
      space();
      if (text.charAt(i) !== ':') throw new Error('flow-panel: survey.json lacks a ":" after "' + key + '".');
      i++;
      space();
      var valueStart = i;
      skipValue();
      out.push({ key: key, start: start, valueStart: valueStart, valueEnd: i });
      space();
      if (text.charAt(i) === ',') i++;
    }
  }

  panel.surveyTextWithFlow = function (text, graph) {
    var source = str(text);
    var members = topMembers(source);
    var at = -1;
    members.forEach(function (m, k) { if (m.key === 'flow' && at < 0) at = k; });
    if (at < 0) throw new Error('flow-panel: survey.json has no "flow".');
    var edits = [];
    var lineStart = source.lastIndexOf('\n', members[at].start) + 1;
    var indent = members[at].start - lineStart;
    edits.push({ from: members[at].valueStart, to: members[at].valueEnd, text: panel.formatFlow(graph, indent) });
    members.forEach(function (m, k) {
      if (m.key !== '_flow_help') return;
      // remove the member with the comma (and line break) that separated it from the one before
      var from = k > 0 ? members[k - 1].valueEnd : m.start;
      var to = k > 0 ? m.valueEnd : (k + 1 < members.length ? members[k + 1].start : m.valueEnd);
      edits.push({ from: from, to: to, text: '' });
    });
    edits.sort(function (a, b) { return b.from - a.from; });
    var out = source;
    edits.forEach(function (e) { out = out.slice(0, e.from) + e.text + out.slice(e.to); });
    return out;
  };

  /* ===========================================================================
     THE ROUTE AS A TABLE: "Paste a route" (27 Oct 2026, format pp-route-table/1)
     ---------------------------------------------------------------------------
     The owner makes or changes the whole route as ONE TABLE, one row per
     screen, instead of question by question:
       - rows copied from Excel or Google Sheets (tab-separated),
       - a CSV file (comma-separated, with "quotes" around texts with commas),
       - or the Markdown table Claude or ChatGPT writes from his notes, his
         Excel or a flowchart picture (with or without words around it and
         ``` fences), using the instruction aiInstruction() gives.
     Header row first; columns in any order; names are forgiving
     ("Question (English)", "question_en", "English" are the same column):
       code | kind | question (English) | question (Hindi) | answers |
       answers (Hindi) | message (English) | message (Hindi) | required |
       show only if | then go to | jumps | ask for | show
     Optional, for 0 to 10 questions: left end, right end, hint (English and
     Hindi). Other languages may have their own columns ("question (Tamil)"),
     but the AI is told never to translate.
     The functions:
       fromTable(text, survey, strings, opts) -> { ok, format, rows, texts,
           problems, warnings, survey }
         rows      the Screens rows in the panel's own shape (blankRow)
         texts     { key: { en, hi, ta, ... } } to add or change (only keys
                   whose words differ from "strings"; every language filled:
                   a language nobody wrote is "[TRANSLATE] " + the English,
                   the project's rule; a real translation already there is
                   kept). Nothing is ever translated here.
         problems  [{ row, column, code, message }]: must be fixed before the
                   route can be used. row = the table's row number, counting
                   the header as row 1 (as Excel shows it); null when the
                   problem is about the whole table.
         warnings  the same shape: worth reading, nothing blocks.
         survey    when there were no problems and the checker is loaded:
                   the survey with "flow" = the graph Publish would make (for
                   the Map and Try a path), checked by PP.flowCheck.check.
         opts.rows       the draft's current Screens rows: their text keys
                         and settings the table has no column for are kept,
                         and a row the table drops is named in a warning;
         opts.liveCodes  codes partners already answered under ("nps", or as
                         Model.gs's CODES_EVER_LIVE has them: "screen:nps",
                         "option:<question>/<answer>"): a table without
                         them is a problem (hide, never delete); a live
                         answer must stay, whatever its question's kind;
         opts.liveKinds  { code: Screens type } of the live version's
                         screens ({ one_fix: 'free_text' }): a live question
                         (here or in liveCodes; its kind then from opts.rows)
                         whose kind stores answers can't change kind;
         opts.rounds     the questionnaire's round ids: a rule on another
                         round is a warning ("did you mean" for other
                         capitals). Without it, rounds are not checked;
         opts.check      false = don't run the checker.
     WHAT THE READING FORGIVES AND WHAT IT TELLS (27 Oct 2026, review W8)
       - A text cell (question, message, answers, ends, hint; any language)
         holding only a filler ("-", "NA", "N/A", "TBD", "[TRANSLATE]",
         "(to be translated)", "<my Hindi>" ...: fillerKind) is an EMPTY
         cell, so the words already there stay, with a warning at the cell.
         One English answer's words "Same", "None" or "Empty" stay words.
       - Never machine-translate: every non-English text the table makes new
         or changes is a warning (old -> new, one per cell); so is a change
         of a built-in screen's English. A text key where words should be
         ("q.nps") is a problem, and the Sheet's own Screens tab is refused.
       - Answers: ";" or a line break separates them, except inside "double
         quotes" (toTable quotes words with ";"); list marks, backticks and
         ** are removed; a shown "pick one" or "pick several" needs 2
         answers at least. "multiple choice" as a kind is a problem: it can
         mean either (28 Oct 2026); so are "multi choice", "Multi-choice",
         "multichoice" and "MCQ" (30 Oct 2026). Only the code multi_choice
         itself is read as "pick several", also inside backticks, asterisks
         or quotes, or next to an invisible character (review of 30 Oct).
       - A row whose kind can't be read is left out with one problem, at its
         kind; rules that test its answers are not told again that no row
         answers them (review of 30 Oct 2026).
       - "always" in "show only if" on the language row shows the language
         buttons even when the link already says the language; on the "what
         changed" row it shows the card even when the round has nothing new
         (its title only). "always show", "show always", "everyone" and "all
         partners" do the same (ALWAYS_RE). An empty cell or "-" keeps those
         standard skips.
       - Only the first "thank you" row is the main thank-you screen (its
         words are thanks.title / .body); a later one with words is read as
         an ending. Endings go below it and have no "show only if".
       - Header words may be in Hindi script; a column the panel doesn't read
         is told (with how many rows have words in it).
       - After the table: a second table with the same columns (or more rows
         after an empty line) is read too, another table is a problem, other
         lines are counted, and the AI's "Left out: ..." line is repeated in
         a warning. A message never says a code is missing when it is only
         in a part of the paste that was left out.
       - fromRows' notes are problems when they block Publish (G2, G3, F1 and
         level "error": G5, a route below the thank-you that runs on into
         another route), at their row; the checker's messages pass through
         tableWords, so no ids, JSON names or rule paths reach the table.
       toTable(rows, texts, survey, opts) -> the same table as text, header
           first (opts.format: "tsv" (default, for Excel), "csv" or
           "markdown"). fromTable(toTable(x)) gives x back.
       templateCsv(survey, strings, opts) -> the CSV for "Download the Excel
           template": the header and today's route (opts.rows, else the
           survey's own route) as example rows, with a BOM so Excel reads
           Hindi correctly.
       aiInstruction(survey, strings, opts) -> the text the owner pastes into
           Claude or ChatGPT before his notes or flowchart picture (its round
           example uses opts.rounds' first id, else "<your round id>").
       parseRule(text, opts) -> { rule } or { problem }; ruleText(rule) ->
           text; parseJumps(text, opts) -> { list, problems }; jumpsText(list)
           -> text: the small rule language of "show only if" and "jumps".
     THE RULE LANGUAGE (stored as the condition JSON of docs/flow-engine.md 2.3)
       nps <= 6                    {"answer": "nps", "at_most": 6}
       nps >= 9                    {"answer": "nps", "at_least": 9}
       support_gate = yes          {"answer": "support_gate", "equals": "yes"}
       support_gate != yes         {"answer": "support_gate", "not_equals": "yes"}
       fn_rating:payments in (1, 2)   {"answer": "fn_rating:payments", "in": [1, 2]}
       one_fix answered / one_fix not answered    {"answered": true / false}
       language = hi               {"fact": "lang", "equals": "hi"}
       round = 2026-R2             {"fact": "round", "equals": "2026-R2"}
       a and b / a or b            {"all": [a, b]} / {"any": [a, b]}
       not (a)                     {"not": a}
       "and" and "or" together need brackets: (a or b) and c. Also read: ==,
       <>, the panel's own signs (the less-or-equal, more-or-equal and not-equal
       signs), "is", "is not", "< 7" (= "<= 6"),
       a quoted value ("Yes" keeps its capital), and a rule written as JSON.
       A jump: "if nps >= 9 go to support_gate", several separated by ";".
     =========================================================================== */
  panel.TABLE_FORMAT = 'pp-route-table/1';

  var CODE_RE = /^[a-z][a-z0-9_]*$/;
  var MAX_CODE = 60;
  var NUMBER_RE = /^-?\d+(\.\d+)?$/;
  var STD_LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
  var LANG_WORDS = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', bn: 'Bengali',
    mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia', as: 'Assamese', ur: 'Urdu' };
  var TODO_TAG = '[TRANSLATE]';

  /* A header, kind or setting as plain words: "Question (English)" ->
     "question english", "Yes/No" -> "yes no", "What's changed" -> "whats changed". */
  function words(x) {
    return str(x).toLowerCase().replace(/[\u2018\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
  }
  function isTodo(v) { return !trim(v) || /^\s*\[TRANSLATE\]/.test(str(v)); }
  function shorten(text, n) { var t = trim(text).replace(/\s+/g, ' '); return t.length <= n ? t : t.slice(0, n - 1) + '\u2026'; }
  function langName(code) { return has(LANG_WORDS, code) ? LANG_WORDS[code] : code; }
  function list(items, word) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' ' + (word || 'and') + ' ' + items[items.length - 1];
  }

  /* FILLERS (review W8 finding 1): what people and AIs type into a cell they
     mean to leave empty. fillerKind(text) -> 'strong' (never real words:
     only dashes, dots or other punctuation; NA, N/A, n.a., TBD, TBA, TBC,
     null, ditto, do, -do-, "to be translated", "translate", "[TRANSLATE]"
     alone), 'weak' (a filler in a whole cell, but a real answer when it is
     one English answer's words: none, nil, same, keep, blank, empty, and a
     few phrases like "no change" or "keep today's words") or ''. Case,
     spaces and the brackets, quotes and marks around it don't count; a
     sentence that merely contains such a word ("None of these", "Same day
     delivery", "No") is real. */
  var FILLERS = { na: 'strong', 'n/a': 'strong', 'n.a': 'strong', 'n. a': 'strong', tbd: 'strong', tba: 'strong',
    tbc: 'strong', 'null': 'strong', ditto: 'strong', 'do': 'strong', 'to be translated': 'strong', translate: 'strong',
    none: 'weak', nil: 'weak', same: 'weak', keep: 'weak', blank: 'weak', empty: 'weak', 'not applicable': 'weak',
    'no change': 'weak', unchanged: 'weak', 'as is': 'weak', 'same as before': 'weak', 'same as above': 'weak',
    'keep as is': 'weak', 'keep today\'s words': 'weak', 'today\'s words': 'weak', 'built-in': 'weak', 'built in': 'weak' };
  var PUNCTUATION_RE = /^[\s\-\u2010-\u2015\u2212._*?!~#\/\\|,;:'"`()\[\]{}<>\u2018-\u201f\u2026\u3003]+$/;
  function fillerKind(text) {
    var t = trim(text);
    if (!t) return '';
    if (PUNCTUATION_RE.test(t) || /^<[^<>]*>$/.test(t)) return 'strong';   // "-", "...", or "<my Hindi>" copied from an example
    var w = t.toLowerCase().replace(/[\u2018\u2019]/g, '\'').replace(/\s+/g, ' ');
    var before;
    do {
      before = w;
      w = w.replace(/^[\s(\[{<"'`*_\-\u201c\u201d]+/, '').replace(/[\s)\]}>"'`*_\-.:\u201c\u201d]+$/, '');
    } while (w !== before);
    return has(FILLERS, w) ? FILLERS[w] : '';
  }
  /* A text key where words should be ("q.nps", "end.low.title"), or a key the texts already have. Web
     addresses (meesho.com) are words. */
  function looksLikeKey(text, known) {
    var t = trim(text);
    if (has(known, t)) return true;
    return /^[a-z][a-z0-9_]*(\.[a-z0-9_{}:-]+)+$/.test(t) && !/\.(com|in|org|net|co|io)$/.test(t);
  }

  /* Header words in the languages' own scripts, read as English words ("prashn (hindi)" = "question (Hindi)"). */
  var NATIVE_WORDS = [
    ['\u0939\u093f\u0902\u0926\u0940', 'hindi'], ['\u0939\u093f\u0928\u094d\u0926\u0940', 'hindi'],
    ['\u0ba4\u0bae\u0bbf\u0bb4\u0bcd', 'tamil'], ['\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41', 'telugu'],
    ['\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', 'kannada'], ['\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02', 'malayalam'],
    ['\u0905\u0902\u0917\u094d\u0930\u0947\u091c\u093c\u0940', 'english'], ['\u0905\u0902\u0917\u094d\u0930\u0947\u095b\u0940', 'english'],
    ['\u0905\u0902\u0917\u094d\u0930\u0947\u091c\u0940', 'english'], ['\u0907\u0902\u0917\u094d\u0932\u093f\u0936', 'english'],
    ['\u092a\u094d\u0930\u0936\u094d\u0928', 'question'], ['\u0938\u0935\u093e\u0932', 'question'],
    ['\u0909\u0924\u094d\u0924\u0930', 'answers'], ['\u091c\u0935\u093e\u092c', 'answers'], ['\u0938\u0902\u0926\u0947\u0936', 'message']
  ];
  /* A header with those words in English; null when other letters of another script are left (an unknown
     column: words() would drop them, so "notes (Hindi)" written in Hindi script would read as "hindi"). */
  function nativeWords(header) {
    var h = str(header);
    NATIVE_WORDS.forEach(function (p) { h = h.split(p[0]).join(' ' + p[1] + ' '); });
    return /[^\x00-\x7f\u00a0\u00b7\u2010-\u2015\u2018-\u201f\u2022\u2026]/.test(h) ? null : h;
  }

  /* A new code made from English words, the control panel's own rule (its
     slug, and Model.gs PP_slug): lower case, every other run of characters
     "_", at most 40 characters, "n" in front of a digit, then _2, _3 ... */
  function slug(text, taken, fallback) {
    var s = str(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    s = s.slice(0, 40).replace(/_+$/, '');
    if (/^[0-9]/.test(s)) s = 'n' + s;
    if (!s) s = fallback || 'item';
    var out = s;
    var n = 2;
    while (has(taken, '#' + out)) { out = s + '_' + n; n++; }
    return out;
  }

  /* How alike two codes are (for "did you mean"): the number of edits. */
  function distance(a, b) {
    var prev = [];
    var i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function closest(word, choices) {
    var best = null;
    var score = 1e9;
    choices.forEach(function (c) {
      var d = distance(word, c);
      if (d < score) { score = d; best = c; }
    });
    return best !== null && score <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
  }

  /* ---- The rule language ---------------------------------------------------- */
  var FACT_OF = { language: 'lang', lang: 'lang', round: 'round', lang_in_url: 'lang_in_url', language_in_link: 'lang_in_url',
    whats_changed_count: 'whats_changed_count', what_changed_items: 'whats_changed_count' };
  var FACT_WORD = { lang: 'language', round: 'round', lang_in_url: 'lang_in_url', whats_changed_count: 'whats_changed_count' };
  var RULE_WORDS = { and: true, or: true, not: true, 'in': true, is: true, answered: true, 'true': true, 'false': true,
    'if': true, then: true, go: true, to: true, goto: true, when: true, always: true };
  var RULE_TESTS = ['equals', 'not_equals', 'at_most', 'at_least', 'in', 'answered'];
  var OPS = ['<=', '>=', '!=', '==', '<>', '&&', '||', '->', '=', '<', '>', '!', '\u2264', '\u2265', '\u2260', '\u2192'];
  var QUOTES = { '"': '"', '\'': '\'', '\u201c': '\u201d', '\u2018': '\u2019' };
  var STOP = '()<>=!,;"\'\u201c\u201d\u2018\u2019\u2264\u2265\u2260\u2192&|';

  /* The pieces of a rule: { list: [{ t: "word" | "str" | "op" | "(" | ")" | "," | ";", v, at, end }] } or { problem }. */
  function ruleTokens(s) {
    var out = [];
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '(' || ch === ')' || ch === ',' || ch === ';') { out.push({ t: ch, v: ch, at: i, end: i + 1 }); i++; continue; }
      if (has(QUOTES, ch)) {
        var close = QUOTES[ch];
        var j = i + 1;
        while (j < s.length && s.charAt(j) !== close) j += ch === '"' && s.charAt(j) === '\\' ? 2 : 1;
        if (j >= s.length) return { problem: 'a text in quotes is not closed (' + s.slice(i, i + 20) + ').' };
        var raw = s.slice(i + 1, j);
        var v = raw;
        if (ch === '"') { try { v = JSON.parse(s.slice(i, j + 1)); } catch (e) { v = raw; } }
        out.push({ t: 'str', v: str(v), at: i, end: j + 1 });
        i = j + 1;
        continue;
      }
      var op = null;
      for (var k = 0; k < OPS.length && !op; k++) if (s.substr(i, OPS[k].length) === OPS[k]) op = OPS[k];
      if (op === '&&' || op === '||') { out.push({ t: 'word', v: op === '&&' ? 'and' : 'or', at: i, end: i + 2 }); i += 2; continue; }
      if (op) { out.push({ t: 'op', v: op, at: i, end: i + op.length }); i += op.length; continue; }
      var w = i;
      while (w < s.length && !/\s/.test(s.charAt(w)) && STOP.indexOf(s.charAt(w)) === -1 &&
        !(s.charAt(w) === '-' && s.charAt(w + 1) === '>')) w++;
      if (w === i) return { problem: 'it has a character the rules do not use: ' + JSON.stringify(ch) + '.' };
      out.push({ t: 'word', v: s.slice(i, w), at: i, end: w });
      i = w;
    }
    return { list: out };
  }

  /* A language code from what was written: "hi", or its English name "Hindi". */
  function langCode(word, langs) {
    var w = str(word).toLowerCase();
    var known = arr(langs);
    if (known.indexOf(w) !== -1 || !known.length && /^[a-z]{2,3}$/.test(w)) return w;
    var found = null;
    Object.keys(LANG_WORDS).forEach(function (code) { if (!found && LANG_WORDS[code].toLowerCase() === w) found = code; });
    return found || w;
  }

  /* The words in "show only if" that mean "every partner sees this row":
     no rule, and on the language and "what changed" rows they also switch
     off the usual skip (fromTable). One list for both (review of 30 Oct
     2026: "all partners" was no rule but kept the skip). "-" and an empty
     cell are an empty cell: no rule, and those two rows keep their skip. */
  var ALWAYS_RE = /^(always|always\s+show|show\s+always|everyone|all\s+partners)$/i;

  /* parseRule(text, opts) -> { rule } (null for an empty cell, "-" or one of
     the words above) or { problem: plain English }. opts.languages: the
     language codes, so "language = Hindi" can become "hi". */
  panel.parseRule = function (text, opts) {
    var s = trim(text);
    var langs = isObj(opts) ? arr(opts.languages) : [];
    if (!s || s === '-' || ALWAYS_RE.test(s)) return { rule: null };
    if (s.charAt(0) === '{') {
      var json;
      try { json = JSON.parse(s); } catch (e) { return { problem: 'it starts like a rule written in JSON, but it cannot be read as JSON.' }; }
      return isObj(json) ? { rule: json } : { problem: 'a rule written in JSON must be one { } group.' };
    }
    var tk = ruleTokens(s);
    if (tk.problem) return { problem: tk.problem };
    var toks = tk.list;
    var pos = 0;
    function peek(k) { return toks[pos + (k || 0)]; }
    function isWord(t, w) { return Boolean(t) && t.t === 'word' && t.v.toLowerCase() === w; }
    function fail(message) { throw { rule: message }; }
    function near() {
      var t = peek();
      return t ? ' (at "' + s.slice(t.at, Math.min(s.length, t.at + 24)) + '")' : ' (at the end)';
    }
    function value(fact) {
      var t = peek();
      if (!t || (t.t !== 'word' && t.t !== 'str')) fail('a value is missing' + near() + '.');
      pos++;
      if (t.t === 'str') return t.v;
      var v = t.v;
      var low = v.toLowerCase();
      if (low === 'true' || low === 'false') return low === 'true';
      if (fact === 'round') return v;
      if (fact === 'lang') return langCode(v, langs);
      if (NUMBER_RE.test(v)) return Number(v);
      return low;
    }
    function values(fact) {
      if (!peek() || peek().t !== '(') fail('"in" needs a list in brackets, for example in (1, 2)' + near() + '.');
      pos++;
      var out = [];
      for (;;) {
        out.push(value(fact));
        var t = peek();
        if (t && t.t === ',') { pos++; continue; }
        if (t && t.t === ')') { pos++; return out; }
        fail('the list after "in" is not closed with ")"' + near() + '.');
      }
    }
    function number(fact, op) {
      var v = value(fact);
      if (typeof v !== 'number') fail('"' + op + '" needs a number' + near() + ', not ' + JSON.stringify(v) + '.');
      return v;
    }
    function condition() {
      var t = peek();
      if (!t || t.t !== 'word' || has(RULE_WORDS, t.v.toLowerCase()) && !has(FACT_OF, t.v.toLowerCase())) {
        fail('a question code is missing' + near() + '. Write for example: nps <= 6');
      }
      if (!/^[A-Za-z][A-Za-z0-9_]*(:[A-Za-z0-9_]+)*$/.test(t.v)) {
        fail('"' + t.v + '" is not a question code' + near() + '. Codes are small letters, digits and _, for example nps or fn_rating:payments.');
      }
      pos++;
      var name = t.v.toLowerCase();
      var fact = has(FACT_OF, name) ? FACT_OF[name] : null;
      var c = {};
      if (fact) c.fact = fact; else c.answer = name;
      var n = peek();
      var notted = false;
      if (isWord(n, 'is')) { pos++; n = peek(); }
      if (isWord(n, 'not') && (isWord(peek(1), 'answered') || isWord(peek(1), 'in') || isWord(toks[pos - 1], 'is'))) {
        notted = true;
        pos++;
        n = peek();
      }
      if (isWord(n, 'answered')) {
        pos++;
        if (fact) fail('"answered" works on answers, not on the ' + FACT_WORD[fact] + '.');
        c.answered = !notted;
        return c;
      }
      if (isWord(n, 'in')) {
        pos++;
        c['in'] = values(fact);
        return notted ? { not: c } : c;
      }
      if (notted) { c.not_equals = value(fact); return c; }
      if (isWord(toks[pos - 1], 'is')) { c.equals = value(fact); return c; }
      if (!n || n.t !== 'op') fail('a comparison (=, !=, <=, >=, in, answered) is missing after "' + t.v + '"' + near() + '.');
      pos++;
      var op = n.v;
      if (op === '=' || op === '==') c.equals = value(fact);
      else if (op === '!=' || op === '<>' || op === '\u2260') c.not_equals = value(fact);
      else if (op === '<=' || op === '\u2264') c.at_most = number(fact, op);
      else if (op === '>=' || op === '\u2265') c.at_least = number(fact, op);
      else if (op === '<' || op === '>') {
        var v = number(fact, op);
        if (Math.floor(v) !== v) fail('"' + op + '" works only with whole numbers here: write <= or >= instead.');
        if (op === '<') c.at_most = v - 1; else c.at_least = v + 1;
      } else fail('"' + op + '" is not a comparison the rules know' + near() + '.');
      return c;
    }
    function unary() {
      var t = peek();
      if (isWord(t, 'not') || (t && t.t === 'op' && t.v === '!')) {
        pos++;
        return { not: unary() };
      }
      if (t && t.t === '(') {
        pos++;
        var inner = expression();
        if (!peek() || peek().t !== ')') fail('a "(" is not closed with ")"' + near() + '.');
        pos++;
        return inner;
      }
      return condition();
    }
    function expression() {
      var first = unary();
      var items = [first];
      var joint = null;
      while (isWord(peek(), 'and') || isWord(peek(), 'or')) {
        var j = peek().v.toLowerCase();
        if (joint && j !== joint) {
          fail('it mixes "and" and "or" without brackets, so it is not clear which goes first. Add brackets, for ' +
            'example: (nps <= 6 and support_gate = yes) or one_fix answered.');
        }
        joint = j;
        pos++;
        items.push(unary());
      }
      if (items.length === 1) return first;
      return joint === 'and' ? { all: items } : { any: items };
    }
    try {
      var rule = expression();
      if (pos < toks.length) fail('there is something after the end of the rule' + near() + '. Join two tests with "and" or "or".');
      return { rule: rule };
    } catch (e) {
      if (e && typeof e.rule === 'string') return { problem: e.rule };
      throw e;
    }
  };

  /* A value as the rule language writes it (quoted when reading it back
     without quotes would give something else). */
  function ruleValue(v, fact) {
    if (typeof v === 'number') return isFinite(v) ? String(v) : null;
    if (typeof v === 'boolean') return String(v);
    if (typeof v !== 'string') return null;
    var bare = /^[A-Za-z0-9_][A-Za-z0-9_.:@\/-]*$/.test(v) && v.indexOf('->') === -1 && !has(RULE_WORDS, v.toLowerCase());
    if (fact !== 'round') bare = bare && v === v.toLowerCase() && !NUMBER_RE.test(v);
    if (fact === 'lang') bare = bare && langCode(v, []) === v;   // "hindi" would be read back as "hi"
    return bare ? v : JSON.stringify(v);
  }

  /* ruleText(rule) -> the rule in the rule language; a rule it can't write
     exactly (a hand-made one) is written as JSON, which parseRule reads back. */
  panel.ruleText = function (rule) {
    if (rule === null || rule === undefined || rule === '') return '';
    if (isObj(rule) && has(rule, 'unreadable') && Object.keys(rule).length === 1) return str(rule.unreadable);
    var out = printRule(rule, false);
    return out === null ? JSON.stringify(rule) : out;
  };
  function printRule(rule, nested) {
    if (!isObj(rule)) return null;
    var keys = Object.keys(rule).filter(function (k) { return rule[k] !== undefined; });
    if (keys.length === 1 && (keys[0] === 'all' || keys[0] === 'any')) {
      var items = rule[keys[0]];
      if (!Array.isArray(items) || items.length < 2) return null;
      var parts = items.map(function (r) { return printRule(r, true); });
      if (parts.some(function (p) { return p === null; })) return null;
      var text = parts.join(keys[0] === 'all' ? ' and ' : ' or ');
      return nested ? '(' + text + ')' : text;
    }
    if (keys.length === 1 && keys[0] === 'not') {
      var inner = printRule(rule.not, false);
      return inner === null ? null : 'not (' + inner + ')';
    }
    if (keys.length !== 2) return null;
    var subject;
    var fact = null;
    if (typeof rule.answer === 'string' && keys.indexOf('answer') !== -1) {
      subject = rule.answer;
      if (!/^[a-z0-9_]+(:[a-z0-9_]+)*$/.test(subject) || has(FACT_OF, subject) || has(RULE_WORDS, subject)) return null;
    } else if (typeof rule.fact === 'string' && has(FACT_WORD, rule.fact) && keys.indexOf('fact') !== -1) {
      fact = rule.fact;
      subject = FACT_WORD[fact];
    } else {
      return null;
    }
    var test = keys.filter(function (k) { return k !== 'answer' && k !== 'fact'; })[0];
    var v = rule[test];
    if (test === 'answered') return typeof v === 'boolean' && !fact ? subject + (v ? ' answered' : ' not answered') : null;
    if (test === 'in') {
      if (!Array.isArray(v) || !v.length) return null;
      var vals = v.map(function (x) { return ruleValue(x, fact); });
      return vals.some(function (x) { return x === null; }) ? null : subject + ' in (' + vals.join(', ') + ')';
    }
    var ops = { equals: ' = ', not_equals: ' != ', at_most: ' <= ', at_least: ' >= ' };
    if (!has(ops, test)) return null;
    if ((test === 'at_most' || test === 'at_least') && typeof v !== 'number') return null;
    var shown = ruleValue(v, fact);
    return shown === null ? null : subject + ops[test] + shown;
  }

  /* Every single test inside a rule ({answer|fact, test}), in order. */
  function testsOf(rule, out) {
    out = out || [];
    if (!isObj(rule)) return out;
    if (Array.isArray(rule.all)) rule.all.forEach(function (r) { testsOf(r, out); });
    else if (Array.isArray(rule.any)) rule.any.forEach(function (r) { testsOf(r, out); });
    else if (has(rule, 'not')) testsOf(rule.not, out);
    else out.push(rule);
    return out;
  }

  /* parseJumps(text, opts) -> { list: [{ when, goto }], problems: [text] }.
     "if nps >= 9 go to support_gate; if nps <= 2 go to why_low". Also read:
     "then", "->" (or the arrow sign), one jump per line, and a JSON list. goto is the code
     as written (lower case); "end" means the main thank-you screen (@end). */
  panel.parseJumps = function (text, opts) {
    var s = trim(text);
    var out = { list: [], problems: [] };
    if (!s) return out;
    if (s.charAt(0) === '[') {
      var json;
      try { json = JSON.parse(s); } catch (e) { out.problems.push('it starts like a list written in JSON, but it cannot be read as JSON.'); return out; }
      if (!Array.isArray(json)) { out.problems.push('a list of jumps written in JSON must be a [ ] list.'); return out; }
      json.forEach(function (j, k) {
        if (isObj(j) && isObj(j.when) && typeof j['goto'] === 'string') out.list.push({ when: j.when, 'goto': j['goto'] });
        else out.problems.push('jump ' + (k + 1) + ' needs "when" (a rule) and "goto" (a code).');
      });
      return out;
    }
    splitTop(s, ';\n').forEach(function (part, k) {
      var p = trim(part);
      if (!p) return;
      var label = 'jump ' + (k + 1) + ' ("' + shorten(p, 40) + '")';
      var tk = ruleTokens(p);
      if (tk.problem) { out.problems.push(label + ': ' + tk.problem); return; }
      var toks = tk.list;
      var start = 0;
      if (toks.length && toks[0].t === 'word' && /^(if|when)$/i.test(toks[0].v)) start = 1;
      var mark = -1;
      var markEnd = -1;
      var depth = 0;
      for (var i = start; i < toks.length && mark < 0; i++) {
        var t = toks[i];
        if (t.t === '(') depth++;
        if (t.t === ')') depth--;
        if (depth) continue;
        var w = t.t === 'word' ? t.v.toLowerCase() : '';
        var nx = toks[i + 1] && toks[i + 1].t === 'word' ? toks[i + 1].v.toLowerCase() : '';
        if (w === 'go' && nx === 'to') { mark = i; markEnd = toks[i + 1].end; }
        else if (w === 'goto') { mark = i; markEnd = t.end; }
        else if (w === 'then' && nx === 'go' && toks[i + 2] && /^to$/i.test(toks[i + 2].v)) { mark = i; markEnd = toks[i + 2].end; }
        else if (w === 'then' && i > start) { mark = i; markEnd = t.end; }
        else if (t.t === 'op' && (t.v === '->' || t.v === '\u2192')) { mark = i; markEnd = t.end; }
      }
      if (mark < 0) { out.problems.push(label + ': it does not say where to go. Write it like: if nps >= 9 go to support_gate'); return; }
      var end = mark;
      while (end > start && (toks[end - 1].t === ',' || (toks[end - 1].t === 'word' && /^then$/i.test(toks[end - 1].v)))) end--;
      if (end <= start) { out.problems.push(label + ': the rule before "go to" is missing.'); return; }
      var ruleText = p.slice(toks[start].at, toks[end - 1].end);
      var r = panel.parseRule(ruleText, opts);
      if (r.problem) { out.problems.push(label + ': ' + r.problem); return; }
      if (!r.rule) { out.problems.push(label + ': the rule before "go to" is missing.'); return; }
      var target = targetCode(p.slice(markEnd));
      if (!target) { out.problems.push(label + ': the code to go to is missing after "go to".'); return; }
      out.list.push({ when: r.rule, 'goto': target });
    });
    return out;
  };

  /* jumpsText(list) -> "if nps >= 9 go to support_gate; if ..." (a list it
     can't write that way is written as JSON). */
  panel.jumpsText = function (jumps) {
    var j = jumps;
    if (j === null || j === undefined || j === '') return '';
    if (typeof j === 'string') {
      if (!trim(j)) return '';
      try { j = JSON.parse(j); } catch (e) { return trim(j); }
    }
    if (isObj(j) && has(j, 'unreadable')) return str(j.unreadable);
    if (!Array.isArray(j)) return JSON.stringify(j);
    if (!j.length) return '';
    var parts = j.map(function (x) {
      if (!isObj(x) || !isObj(x.when) || typeof x['goto'] !== 'string' || !CODE_RE.test(x['goto']) || Object.keys(x).length !== 2) return null;
      var r = printRule(x.when, false);
      return r === null ? null : 'if ' + r + ' go to ' + x['goto'];
    });
    return parts.some(function (p) { return p === null; }) ? JSON.stringify(j) : parts.join('; ');
  };

  /* Splits text at any of the characters in "seps" that are outside quotes and brackets. */
  function splitTop(s, seps) {
    var out = [];
    var cur = '';
    var quote = null;
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (quote) {
        cur += ch;
        if (ch === '\\' && quote === '"' && i + 1 < s.length) { cur += s.charAt(++i); continue; }
        if (ch === QUOTES[quote]) quote = null;
        continue;
      }
      if (has(QUOTES, ch)) { quote = ch; cur += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (!depth && seps.indexOf(ch) !== -1) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  /* "then go to" as written -> a code, "@end" (the main thank-you), or ''. */
  function targetCode(text) {
    var t = trim(str(text).replace(/[`*]/g, '')).replace(/[.;,]+$/, '');
    t = trim(t.replace(/^["'\u201c\u2018]|["'\u201d\u2019]$/g, '')).replace(/^(go\s*to|goto)\s+/i, '');
    var w = words(t);
    if (!w || w === 'next' || w === 'next row' || w === 'the next row' || w === 'following row') return '';
    if (w === 'end' || w === 'the end' || w === 'main ending' || w === 'thank you') return '@end';
    return /\s/.test(trim(t)) ? t : t.toLowerCase();
  }

  /* ---- The columns ------------------------------------------------------------ */
  /* Columns without a language: id, the name toTable writes, other names read. */
  var PLAIN_COLUMNS = [
    { id: 'code', title: 'code', names: ['code', 'id', 'question code', 'screen code'] },
    { id: 'kind', title: 'kind', names: ['kind', 'type', 'question type', 'kind of question', 'screen type', 'question kind', 'kind of screen'] },
    { id: 'required', title: 'required', names: ['required', 'must answer', 'mandatory', 'compulsory'] },
    { id: 'show_if', title: 'show only if', names: ['show only if', 'show if', 'show_if', 'only if', 'condition', 'rule', 'show this question only if'] },
    { id: 'next', title: 'then go to', names: ['then go to', 'go to', 'next', 'usually go to', 'after this go to', 'goto', 'then'] },
    { id: 'jumps', title: 'jumps', names: ['jumps', 'jump', 'jump rules', 'branches', 'branching'] },
    { id: 'repeat', title: 'ask for', names: ['ask for', 'repeat', 'ask', 'asked for', 'ask it for', 'ask this question', 'repeat for'] },
    { id: 'show', title: 'show', names: ['show', 'shown', 'active', 'visible'] }
  ];
  /* Columns in a language ("question (Hindi)"): id + ":" + language code. */
  var TEXT_COLUMNS = [
    { id: 'q', title: 'question', names: ['question', 'question text', 'text', 'title', 'wording'] },
    { id: 'a', title: 'answers', names: ['answers', 'answer', 'options', 'option', 'choices', 'answer options', 'answer choices'] },
    { id: 'm', title: 'message', names: ['message', 'body', 'longer text'] },
    { id: 'low', title: 'left end', names: ['left end', 'low label', 'left label'] },
    { id: 'high', title: 'right end', names: ['right end', 'high label', 'right label'] },
    { id: 'hint', title: 'hint', names: ['hint', 'scale hint'] }
  ];
  /* Columns people keep for themselves: left out without a word. */
  var NOTE_COLUMNS = ['notes', 'note', 'comments', 'remarks', 'no', 'sr no', 's no', 'sl no', 'serial', 'serial no', 'step',
    'order', 'row', 'number', 'question number', 'screen number', 'step number', 'n'];
  var LABEL_COLUMN = { low_label: 'low', high_label: 'high', scale_hint: 'hint' };

  /* Every name a column may have (plain words) -> its id, for these languages. */
  function columnNames(langs) {
    var map = {};
    function add(name, id) { var w = words(name); if (w && !has(map, w)) map[w] = id; }
    PLAIN_COLUMNS.forEach(function (c) { c.names.forEach(function (n) { add(n, c.id); }); });
    langs.forEach(function (L) {
      var nm = langName(L);
      TEXT_COLUMNS.forEach(function (c) {
        c.names.forEach(function (n) {
          add(n + ' ' + nm, c.id + ':' + L);
          add(n + ' ' + L, c.id + ':' + L);
          add(n + ' in ' + nm, c.id + ':' + L);
          add(nm + ' ' + n, c.id + ':' + L);
          if (L === 'en') add(n, c.id + ':en');
        });
      });
      add(nm, 'q:' + L);
      if (STD_LANGS.indexOf(L) !== -1) add(L, 'q:' + L);
      if (L !== 'en') {
        // "Hindi translation" and "translation (Hindi)" are the question's Hindi
        [nm, L].forEach(function (x) { add(x + ' translation', 'q:' + L); add('translation ' + x, 'q:' + L); });
      }
    });
    return map;
  }
  /* A header cell -> a column id, or null. "Ask for (once / each area)" is read as "ask for"; words in the
     languages' own scripts are read in English first (NATIVE_WORDS). */
  function columnOf(header, names) {
    var h = nativeWords(header);
    if (h === null) return null;
    var w = words(h);
    if (w && has(names, w)) return names[w];
    var short = words(h.replace(/\([^)]*\)/g, ' '));
    return short && has(names, short) ? names[short] : null;
  }
  function columnTitle(id) {
    var i;
    for (i = 0; i < PLAIN_COLUMNS.length; i++) if (PLAIN_COLUMNS[i].id === id) return PLAIN_COLUMNS[i].title;
    var parts = id.split(':');
    for (i = 0; i < TEXT_COLUMNS.length; i++) {
      if (TEXT_COLUMNS[i].id === parts[0]) return TEXT_COLUMNS[i].title + (parts[0] === 'a' && parts[1] === 'en' ? '' : ' (' + langName(parts[1]) + ')');
    }
    return id;
  }

  /* ---- Reading the pasted text ------------------------------------------------- */
  var SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  /* The cells of one Markdown table line ("| a | b |"); "\|" is a "|" inside a cell, <br> a line break. */
  function mdCells(line) {
    var t = trim(line);
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|' && t.charAt(t.length - 2) !== '\\') t = t.slice(0, -1);
    var cells = [];
    var cur = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === '\\' && t.charAt(i + 1) === '|') { cur += '|'; i++; continue; }
      if (c === '|') { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    return cells.map(function (x) { return trim(x.replace(/<br\s*\/?>/gi, '\n')); });
  }

  /* Records of tab-, comma- or semicolon-separated text from character "start":
     [[cell, ...], ...]. A cell starting with " is quoted (Excel and Google
     Sheets do that for a cell with a line break; CSV for a comma): "" inside
     is one ". A " that doesn't close before the next separator is just a ". */
  function readRecords(s, start, delim) {
    var recs = [];
    var cells = [];
    var i = start;
    for (;;) {
      var field = null;
      var j = i;
      while (j < s.length && s.charAt(j) === ' ') j++;
      if (s.charAt(j) === '"') {
        var k = j + 1;
        var val = '';
        var closed = false;
        while (k < s.length) {
          var c = s.charAt(k);
          if (c === '"') {
            if (s.charAt(k + 1) === '"') { val += '"'; k += 2; continue; }
            closed = true;
            k++;
            break;
          }
          val += c;
          k++;
        }
        var m = k;
        while (m < s.length && s.charAt(m) === ' ') m++;
        if (closed && (m >= s.length || s.charAt(m) === delim || s.charAt(m) === '\n')) { field = val; i = m; }
      }
      if (field === null) {
        var e = i;
        while (e < s.length && s.charAt(e) !== delim && s.charAt(e) !== '\n') e++;
        field = s.slice(i, e);
        i = e;
      }
      cells.push(trim(field));
      if (i >= s.length) { recs.push(cells); return recs; }
      if (s.charAt(i) === delim) { i++; continue; }
      recs.push(cells);
      cells = [];
      i++;
      if (i >= s.length) return recs;
    }
  }

  /* How many cells of a line name a known column. */
  function knownCells(cells, names) {
    var n = 0;
    cells.forEach(function (c) { if (columnOf(c, names)) n++; });
    return n;
  }

  /* A placeholder copied from the instruction's examples ("round = <your round id>", "fn_rating:<area code>")
     -> the problem in plain words, or ''. */
  function placeholderIn(text) {
    var m = /<[A-Za-z][A-Za-z _]*>/.exec(str(text));
    return m ? 'it still has the placeholder "' + m[0] + '" from the instruction\'s examples: write the real value there (for ' +
      'example the round\'s id, an area\'s code or a question\'s code).' : '';
  }

  /* "Left out: ..." (the line the AI instruction asks for under the table) -> what it names, or null. */
  function leftOutLine(line) {
    var m = /^[\s>*_`#-]*left out\b\s*[:\-]?[*_`\s]*([\s\S]*)$/i.exec(str(line));
    return m ? trim(m[1].replace(/[*_`]+$/, '')) : null;
  }
  function isFence(line) { return /^\s*```/.test(line); }
  /* The Sheet's own Screens tab (id or type, with text_key, skip_if, low_label ...), pasted instead of the
     route table: its cells hold text keys and JSON, not words (review W8 finding 6). */
  var SCREENS_TAB = ['text', 'text_key', 'active', 'skip_if', 'low_label', 'high_label', 'scale_hint', 'body', 'options'];
  function looksLikeScreensTab(header) {
    var cells = header.map(function (h) { return trim(str(h).replace(/[`*]/g, '')).toLowerCase().replace(/\s+/g, '_'); });
    return cells.some(function (h) { return h === 'id' || h === 'screen_id' || h === 'type'; }) &&
      cells.filter(function (h) { return SCREENS_TAB.indexOf(h) !== -1; }).length >= 2;
  }
  function sameColumns(a, b) {
    return a.length === b.length && a.every(function (id, k) { return id === b[k]; });
  }

  /* The table in the pasted text: { format, header, body: [{ num, cells }], before, after, leftOut,
     merged, continued, ignored, problem2 } or { problem }.
     num = the row's number with the header as row 1. before / after = how many lines of other text are
     above / below it (left out). leftOut = what "Left out: ..." lines say. merged = { count, from, to } of a
     second table with the same columns (its rows are added); continued = the numbers of rows read after a
     break inside the table; problem2 = a second table with other columns. ignored = every line left out
     (so no message says a code is missing when it is only in those lines). */
  function readTable(text, names) {
    var s = str(text).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    if (!trim(s)) return { problem: 'The box is empty. Paste the table there: rows copied from Excel or Google Sheets, a CSV file\'s text, or the table Claude or ChatGPT wrote.' };
    var lines = s.split('\n');
    var i;
    var out = { before: 0, after: 0, leftOut: [], merged: null, continued: [], ignored: [], problem2: null };
    function other(line, below) {
      var lo = leftOutLine(line);
      if (lo !== null) { out.leftOut.push(lo); return; }
      out.ignored.push(line);
      if (below) out.after++; else out.before++;
    }
    // 1. A Markdown table (what Claude and ChatGPT write): a line with "|", then a line of dashes.
    var md = null;
    function mdHead(k) { return lines[k].indexOf('|') !== -1 && k + 1 < lines.length && SEPARATOR_RE.test(lines[k + 1]) && lines[k + 1].indexOf('-') !== -1; }
    for (i = 0; i + 1 < lines.length; i++) {
      if (!mdHead(i)) continue;
      var head = mdCells(lines[i]);
      if (head.length < 2) continue;
      var found = { header: head, at: i };
      if (!md) md = found;
      if (knownCells(head, names) >= 2) { md = found; break; }
    }
    if (md) {
      lines.slice(0, md.at).forEach(function (l) { if (trim(l) && !isFence(l)) other(l, false); });
      var ids = md.header.map(function (h) { return columnOf(h, names); });
      var body = [];
      var num = 1;
      var mode = 'first';            // first: the table's own rows; merged: a second table's rows; skip: another table; none
      for (i = md.at + 2; i < lines.length; i++) {
        var line = lines[i];
        if (!trim(line) || isFence(line)) { mode = 'none'; continue; }
        // another table's header (inside the rows, only one naming known columns: else a stray line of dashes)
        if (mdHead(i) && (mode === 'none' || knownCells(mdCells(line), names) >= 2)) {
          var ids2 = mdCells(line).map(function (h) { return columnOf(h, names); });
          i++;                       // its line of dashes
          if (sameColumns(ids, ids2)) {
            mode = 'merged';
            if (!out.merged) out.merged = { count: 0, from: num + 1, to: num };
          } else {
            mode = 'skip';
            out.ignored.push(line);
            if (!out.problem2) out.problem2 = shorten(mdCells(line).join(' | '), 80);
          }
          continue;
        }
        if (line.indexOf('|') !== -1 && !SEPARATOR_RE.test(line)) {
          var cells = mdCells(line);
          if (mode === 'skip') { out.ignored.push(line); continue; }
          if (mode === 'first' || mode === 'merged' || cells.length === md.header.length) {
            body.push({ num: ++num, cells: cells });
            if (mode === 'merged') { out.merged.count++; out.merged.to = num; } else if (mode === 'none') out.continued.push(num);
            continue;
          }
        } else if (SEPARATOR_RE.test(line)) {
          continue;
        }
        mode = 'none';
        other(line, true);
      }
      out.format = 'markdown';
      out.header = md.header;
      out.body = body;
      return out;
    }
    // 2. Text inside ``` fences: the fences that hold a table are read (one after the other); the rest is other text.
    var src = s;
    var blocks = [];
    var open = -1;
    for (i = 0; i < lines.length; i++) {
      if (!isFence(lines[i])) continue;
      if (open < 0) { open = i; continue; }
      blocks.push({ from: open + 1, to: i });
      open = -1;
    }
    var tableBlocks = blocks.filter(function (b) {
      return lines.slice(b.from, b.to).some(function (l) {
        return knownCells(l.split('\t'), names) >= 2 || knownCells(l.split(','), names) >= 2 || knownCells(l.split(';'), names) >= 2;
      });
    });
    if (tableBlocks.length) {
      var inside = {};
      tableBlocks.forEach(function (b) { for (var k = b.from; k < b.to; k++) inside[k] = true; });
      lines.forEach(function (l, k) {
        if (!inside[k] && trim(l) && !isFence(l)) other(l, k > tableBlocks[0].from);
      });
      src = tableBlocks.map(function (b) { return lines.slice(b.from, b.to).join('\n'); }).join('\n');
    }
    // 3. Tab-, comma- or semicolon-separated: the header is the first line naming two known columns.
    var srcLines = src.split('\n');
    var offset = 0;
    for (i = 0; i < srcLines.length; i++) {
      var bestDelim = null;
      var bestScore = 1;
      ['\t', ',', ';'].forEach(function (d) {
        var score = knownCells(srcLines[i].split(d), names);
        if (score > bestScore) { bestScore = score; bestDelim = d; }
      });
      if (bestDelim) {
        var recs = readRecords(src, offset, bestDelim);
        srcLines.slice(0, i).forEach(function (l) { if (trim(l) && !isFence(l)) other(l, false); });
        out.format = bestDelim === '\t' ? 'tsv' : 'csv';
        out.header = recs[0];
        out.body = recs.slice(1).map(function (cells, k) { return { num: k + 2, cells: cells }; });
        out.delim = bestDelim;
        return out;
      }
      offset += srcLines[i].length + 1;
    }
    return { problem: 'The header row could not be found. The first row of the table must name the columns, for ' +
      'example: code, kind, question (English), question (Hindi), answers, required, show only if, then go to, jumps, ' +
      'ask for, show. Copy the header row from the template (or from "Copy the current route") together with your rows.' };
  }

  /* ---- The kinds of row ---------------------------------------------------------- */
  /* name = what toTable writes; type = the Screens tab's kind; code = the
     standard code of a built-in (fixed: it must have exactly that code);
     ending = a thank-you screen with its own words. */
  var KINDS = [
    { name: 'language', type: 'language_picker', code: 'language', builtin: true,
      also: ['languages', 'language picker', 'language buttons', 'language screen', 'choose language', 'language_picker'] },
    { name: 'what changed', type: 'whats_changed', code: 'whats_changed', builtin: true,
      also: ['whats changed', 'what changed card', 'whats changed card', 'what has changed', 'news', 'whats_changed'] },
    { name: 'nps', type: 'nps_0_10', code: 'nps', fixed: true, builtin: true, also: ['headline nps', 'nps question', 'net promoter score'] },
    { name: 'area ratings', type: 'function_ratings', code: 'fn_ratings', builtin: true,
      also: ['area rating', 'areas', 'rate each area', 'function ratings', 'function_ratings', 'fn ratings'] },
    { name: 'problem screens', type: 'function_deep_dives', code: 'fn_deep_dives', builtin: true,
      also: ['problem screen', 'problems', 'main problem', 'deep dive', 'deep dives', 'function deep dives', 'function_deep_dives', 'fn deep dives'] },
    { name: 'support question', type: 'yes_no', code: 'support_gate', fixed: true, builtin: true,
      also: ['support gate', 'support_gate', 'contacted support'] },
    { name: 'support ratings', type: 'support_block', code: 'support', builtin: true,
      also: ['support rating', 'support', 'support block', 'support_block', 'support screen'] },
    { name: 'thank you', type: 'thank_you', code: 'thanks', builtin: true,
      also: ['thanks', 'thank you screen', 'thank_you', 'thankyou', 'main ending'] },
    { name: 'ending', type: 'thank_you', ending: true, also: ['end', 'other ending', 'extra ending', 'another ending', 'end screen', 'endings', 'second ending'] },
    { name: '0 to 10', type: 'nps_0_10', also: ['0-10', '0 10 question', '0 to 10 question', 'nps_0_10', 'scale 0 to 10', 'zero to ten'] },
    { name: 'faces', type: 'rating_1_5', also: ['faces 1 5', 'faces 1 to 5', 'faces question', '1 5', '1 to 5', 'rating 1 5', 'rating_1_5', 'rating', 'smileys', 'smiley'] },
    { name: 'yes/no', type: 'yes_no', also: ['yes or no', 'yes_no', 'yes no question', 'yesno'] },
    { name: 'pick one', type: 'single_choice', also: ['pick one answer', 'single choice', 'single_choice', 'choice', 'choose one', 'select one', 'one answer'] },
    { name: 'pick several', type: 'multi_choice', also: ['pick several answers', 'multi_choice', 'multiple answers',
      'multi select', 'multiselect', 'multi-select', 'select several', 'choose several', 'pick many', 'select all that apply',
      'pick all that apply', 'tick all that apply', 'checkboxes', 'checkbox', 'tick several'] },
    { name: 'voice/typing', type: 'free_text', also: ['voice or typing', 'voice note or typing', 'free text', 'free_text', 'text', 'open text', 'voice', 'typing', 'voice note', 'open question'] },
    { name: 'info card', type: 'info_card', also: ['information card', 'info', 'info_card', 'information'] }
  ];
  /* The kinds web/js/flow.js registers itself (a kind added in web/js/types/ is not among them). */
  var STANDARD_TYPES = ['language_picker', 'whats_changed', 'function_rating', 'function_deep_dive', 'support_block', 'thank_you',
    'nps_0_10', 'rating_1_5', 'yes_no', 'single_choice', 'multi_choice', 'free_text', 'info_card'];
  /* The words partners see on a built-in screen that has no text of its own. */
  var FIXED_TEXT = { language_picker: 'lang.title', whats_changed: 'wc.title', function_ratings: 'q.fn_rating', function_deep_dives: 'q.deep_dive' };
  var SKIP_OF = { language_picker: 'lang_in_url', whats_changed: 'empty' };
  var NPS_LABELS = { low_label: 'nps.low', high_label: 'nps.high', scale_hint: 'nps.scale_hint' };
  var LABEL_SUFFIX = { low_label: '.low', high_label: '.high', scale_hint: '.hint' };
  var LABEL_DEFAULT = { low_label: 'Not at all likely', high_label: 'Extremely likely',
    scale_hint: '0 means not at all likely, 10 means extremely likely.' };
  var ONCE_ONLY = ['language_picker', 'whats_changed', 'function_ratings', 'function_deep_dives', 'support_block'];

  /* A kind of question added in web/js/types/ (its code or its name in the panel): { name, type, added } or null. */
  function addedKind(w) {
    var T = PP.types;
    var found = null;
    (T && typeof T.list === 'function' ? T.list() : []).forEach(function (type) {
      var d = T.get(type);
      if (found || !isObj(d) || !isObj(d.row) || STANDARD_TYPES.indexOf(type) !== -1) return;
      if (words(type) === w || words(d.row.label || d.label) === w) found = { name: type, type: trim(d.row.type) || type, added: true };
    });
    return found;
  }
  /* "Multiple choice" as a kind can mean two things: some people mean pick
     one, others pick several (28 Oct 2026). "Multi choice", "Multi-choice",
     "multichoice" and "MCQ" too (30 Oct 2026): the table asks which one is
     meant. Only the code multi_choice itself, written exactly so (any
     capitals, spaces around it), is pick several. The cell is tested as a
     code first, because words("multi_choice") is "multi choice" too. */
  var AMBIGUOUS_KIND_RE = /^(multiple choice|multiple choices|multiple choice question|multi choice|multichoice|multi choice question|mcq|mcqs|mcq question)$/;
  function ambiguousKind(text) {
    return AMBIGUOUS_KIND_RE.test(words(text)) && bareCode(text) !== 'multi_choice';
  }
  /* A cell read as a code, without what a chat or a web page may add around
     one (review of 30 Oct 2026): invisible characters (zero-width spaces
     and joiners, a byte-order mark) anywhere, and the backticks, asterisks
     and quotes around it. "`multi_choice`" -> "multi_choice". */
  function bareCode(text) {
    return str(text).replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/^[\s`*"'\u2018\u2019\u201c\u201d]+|[\s`*"'\u2018\u2019\u201c\u201d]+$/g, '').toLowerCase();
  }
  function kindByWord(text) {
    var w = words(text);
    if (!w || ambiguousKind(text)) return null;
    for (var i = 0; i < KINDS.length; i++) {
      var k = KINDS[i];
      if (words(k.name) === w || k.also.some(function (a) { return words(a) === w; })) return k;
    }
    return addedKind(w);
  }
  function kindNames() {
    var out = KINDS.map(function (k) { return k.name; });
    var T = PP.types;
    (T && typeof T.list === 'function' ? T.list() : []).forEach(function (type) {
      var d = T.get(type);
      if (isObj(d) && isObj(d.row) && STANDARD_TYPES.indexOf(type) === -1) out.push(type);
    });
    return out;
  }
  /* What toTable writes in "kind" for a row. */
  function kindName(row) {
    var t = row.type;
    var id = trim(row.id);
    if (t === 'nps_0_10') return id === 'nps' ? 'nps' : '0 to 10';
    if (t === 'yes_no') return id === 'support_gate' ? 'support question' : 'yes/no';
    if (t === 'thank_you') return trim(row.text) || trim(row.body) ? 'ending' : 'thank you';
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].type === t) return KINDS[i].name;
    return str(t);
  }
  /* The description of a row kind (PP.types), found by the Screens tab's kind. */
  function rowDesc(rowType) {
    var T = PP.types;
    var out = null;
    (T && typeof T.list === 'function' ? T.list() : []).forEach(function (type) {
      var d = T.get(type);
      if (!out && isObj(d) && isObj(d.row) && (trim(d.row.type) || type) === rowType) out = d;
    });
    return out;
  }
  function rowFields(rowType) { var d = rowDesc(rowType); return d ? arr(d.row.fields) : []; }
  function storesAnswer(rowType) { var d = rowDesc(rowType); return Boolean(d && d.answer); }
  function isEndingRow(row) { return isObj(row) && row.type === 'thank_you' && !row.show_if; }

  /* The language codes of the questionnaire (else the standard six). */
  function languagesOf(s) {
    var out = [];
    arr(s.languages).forEach(function (l) {
      var c = trim(isObj(l) ? l.code : l);
      if (c && (!isObj(l) || l.active !== false) && out.indexOf(c) === -1) out.push(c);
    });
    if (!out.length) out = STD_LANGS.slice();
    if (out.indexOf('en') === -1) out.unshift('en');
    return out;
  }
  function areasOf(s) {
    return arr(s.functions).map(function (f) { return trim(isObj(f) ? f.id : f); }).filter(Boolean);
  }
  function supportItemsOf(s) {
    return isObj(s.support) ? arr(s.support.items).map(function (x) { return trim(isObj(x) ? x.id : x); }).filter(Boolean) : [];
  }

  /* The route's rows when none are given: the survey's own route (a graph
     through toRows, or a list), else the standard route. */
  var STANDARD_ROUTE = [
    { id: 'language', type: 'language_picker', skip_if: 'lang_in_url' },
    { id: 'whats_changed', type: 'whats_changed', skip_if: 'empty' },
    { id: 'nps', type: 'nps_0_10', text: 'q.nps', low_label: 'nps.low', high_label: 'nps.high', scale_hint: 'nps.scale_hint', required: true },
    { id: 'fn_ratings', type: 'function_ratings' },
    { id: 'fn_deep_dives', type: 'function_deep_dives' },
    { id: 'support_gate', type: 'yes_no', text: 'q.support_gate', required: true },
    { id: 'support', type: 'support_block', text: 'q.support_block', show_if: { answer: 'support_gate', equals: 'yes' } },
    { id: 'one_fix', type: 'free_text', text: 'q.one_fix', required: false },
    { id: 'thanks', type: 'thank_you' }
  ];
  function rowOfLine(e) {
    var r = blankRow(trim(e.id), trim(e.type));
    ['text', 'skip_if', 'low_label', 'high_label', 'scale_hint', 'body'].forEach(function (f) { if (typeof e[f] === 'string') r[f] = trim(e[f]); });
    if (typeof e.required === 'boolean') r.required = e.required;
    if (isObj(e.show_if) && Object.keys(e.show_if).length) r.show_if = copy(e.show_if);
    r.options = arr(e.options).map(function (x) { return trim(isObj(x) ? x.code : x); }).filter(Boolean);
    return r;
  }
  function routeRows(s, opts) {
    if (isObj(opts) && Array.isArray(opts.rows)) return opts.rows.filter(isObj);
    var f = s.flow;
    if (PP.flow && typeof PP.flow.isGraph === 'function' && PP.flow.isGraph(f)) {
      try { return panel.toRows(f, s).screens; } catch (e) { /* use the standard route */ }
    }
    if (Array.isArray(f) && f.length) return f.filter(isObj).map(rowOfLine);
    return STANDARD_ROUTE.map(rowOfLine);
  }

  /* ---- Small readers for the cells ---------------------------------------------- */
  /* yes / no / empty -> true / false / null; anything else -> undefined. */
  function yesNo(text) {
    var w = words(text);
    if (!w) return null;
    if (/^(yes|y|true|1|required|must|mandatory|compulsory|show|shown|on|visible)$/.test(w)) return true;
    if (/^(no|n|false|0|optional|not required|hide|hidden|off|skip|can skip)$/.test(w)) return false;
    return undefined;
  }
  /* "ask for" -> '' (once), each_area, each_low_area, or null when it can't be read. */
  function parseRepeat(text) {
    var w = words(text);
    if (!w || /^(once|one time|1|no|single|none|one)$/.test(w)) return '';
    if (/\barea/.test(w) && /\b(low|rated)\b/.test(w)) return 'each_low_area';
    if (/\barea/.test(w)) return 'each_area';
    return null;
  }
  /* The answers of a "pick one" cell: [{ code, label, written, raw, quoted }]
     ("phone: Phone call; app: In the app"; a label without a code gets code '').
     Answers are separated by ";" or line breaks, except inside words written
     in double quotes ("always: "Yes; always"", "" inside = one "), which
     are then taken exactly as written (quoted: true). What AIs add is
     removed: a list mark in front ("- ", "* ", "1. ", "1) ", "a) "), and
     backticks, ** or __ around the code or around the words. A comma
     separates answers only when every part has a code ("a: A, b: B"). */
  var ITEM_RE = /^(`|\*\*|__)?([A-Za-z][A-Za-z0-9_ \-]{0,39}?)\1?\s*[:=]\s*([\s\S]*)$/;
  var MARK_RE = /^\s*(?:[-*\u2022]|\d{1,2}[.)]|[A-Za-z][)])\s+/;
  function unwrap(v) {
    var t = trim(v);
    var m;
    while ((m = /^(\*\*|__|`)([\s\S]*)\1$/.exec(t)) && trim(m[2])) t = trim(m[2]);
    return t;
  }
  /* "words" or a curly-quoted text -> { text, quoted: true }; anything else is kept as it is. */
  function unquote(v) {
    var t = trim(v);
    var a = t.charAt(0);
    var z = t.charAt(t.length - 1);
    if (t.length < 2 || !((a === '"' && z === '"') || (a === '\u201c' && z === '\u201d'))) return { text: t, quoted: false };
    var inner = t.slice(1, -1);
    if (a === '"') {
      if (inner.replace(/""/g, '').indexOf('"') !== -1) return { text: t, quoted: false };   // two quoted bits, not one
      inner = inner.replace(/""/g, '"');
    }
    return { text: inner, quoted: true };
  }
  /* Where the quote at "at" closes: a quote followed by the end of the answer (";", a line break or the end). */
  function closingQuote(t, at) {
    var close = t.charAt(at) === '\u201c' ? '\u201d' : '"';
    for (var k = at + 1; k < t.length; k++) {
      var c = t.charAt(k);
      if (close === '"' && c === '"' && t.charAt(k + 1) === '"') { k++; continue; }
      if (c !== close) continue;
      var m = k + 1;
      while (m < t.length && (t.charAt(m) === ' ' || t.charAt(m) === '\t')) m++;
      if (m >= t.length || t.charAt(m) === ';' || t.charAt(m) === '\n') return k;
    }
    return -1;
  }
  function answerParts(t) {
    var parts = [];
    var cur = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch === ';' || ch === '\n') { parts.push(cur); cur = ''; continue; }
      var before = trim(cur);
      var onlyMark = MARK_RE.test(before + ' ') && !trim((before + ' ').replace(MARK_RE, ''));
      // a quote opens only where an answer's words start: at its start, after a list mark, or after "code:"
      if ((ch === '"' || ch === '\u201c') && (!before || onlyMark ||
          (/[:=]$/.test(before) && before.length <= 60 && before.indexOf('"') === -1))) {
        var end = closingQuote(t, i);
        if (end > i) { cur += t.slice(i, end + 1); i = end; continue; }
      }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  }
  function answerItem(part) {
    var p = unwrap(trim(part).replace(MARK_RE, ''));
    var whole = unquote(p);
    if (whole.quoted) return { code: '', label: whole.text, written: '', raw: whole.text, quoted: true };
    var m = ITEM_RE.exec(p);
    if (!m) return { code: '', label: p, written: '', raw: p, quoted: false };
    var w = trim(m[2]);
    var said = unquote(unwrap(m[3]));
    return { code: CODE_RE.test(w.toLowerCase()) ? w.toLowerCase() : slug(w, {}, 'option'), label: said.text, written: w,
      raw: p, quoted: said.quoted };
  }
  function answerItems(text) {
    var t = str(text);
    var parts = answerParts(t);
    if (parts.length === 1 && t.indexOf(',') !== -1) {
      var byComma = t.split(',');
      if (byComma.every(function (p) { return ITEM_RE.test(unwrap(trim(p).replace(MARK_RE, ''))); })) parts = byComma;
    }
    return parts.filter(function (p) { return trim(p); }).map(answerItem);
  }
  /* An answer's words as toTable writes them: in double quotes when reading them back bare would give
     something else (a ";" or a line break, a quote or marks at an end, spaces at an end, a filler word:
     for English only a "strong" one, see answerFiller). */
  function answerText(v, english) {
    var x = str(v);
    var odd = /[;\n\r]/.test(x) || /^["\u201c`]|["\u201d`]$|^(\*\*|__)|(\*\*|__)$|^\s|\s$/.test(x) || answerFiller(x, english);
    return odd ? '"' + x.replace(/"/g, '""') + '"' : x;
  }
  /* Is an answer's words a filler? In English only a "strong" one: "same", "none" or "empty" can be real answers. */
  function answerFiller(text, english) {
    var f = fillerKind(text);
    return english ? f === 'strong' : Boolean(f);
  }
  /* Which kinds may be asked once per area, in the table's own words. */
  function repeatableKinds() {
    return kindNames().filter(function (n) {
      var k = kindByWord(n);
      return k && !k.builtin && !k.ending && repeatable(k.type);
    }).join(', ');
  }
  /* The codes switched off (the panel's hiddenCodes for the checker, as Model.gs PP_mdlHiddenCodes_ makes them). */
  function hiddenCodesOf(rows, s) {
    var out = [];
    function add(c) { if (c && out.indexOf(c) === -1) out.push(c); }
    rows.forEach(function (r) {
      if (r.active !== false) return;
      add(r.id);
      if (r.type === 'function_ratings') add('fn_rating');
      if (r.type === 'function_deep_dives') add('fn_deep_dive');
      if (r.type === 'support_block') { add('support'); add('support_comment'); }
      arr(r.options).forEach(add);
    });
    if (!(isObj(s.support) && s.support.allow_comment === true)) add('support_comment');
    return out;
  }
  /* A message of the checker (web/js/flow-check.js) in the table's words: no internal ids, JSON names or rule
     paths reach a table user (review W8 finding 14). */
  var OP_SIGN = { at_most: '<=', at_least: '>=', equals: '=', not_equals: '!=' };
  function ordinal(n) {
    var t = n % 100;
    return n + (t >= 11 && t <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th'));
  }
  function tableWords(text) {
    return str(text).replace(/strings\.json/g, 'Texts & translations')
      .replace(/\b([Ss])creen "thanks_auto_*"/g, function (m, s) { return (s === 'S' ? 'T' : 't') + 'he thank-you screen the form adds at the end'; })
      // 'its rule ("show only if") > all > rule 2' -> 'the 2nd part of its rule ("show only if")'
      .replace(/(its rule \("show only if"\)|its "repeat for" filter \("where"\)|its jump to "[^"]*"|its jump \d+ \(to "[^"]*"\))((?: > (?:all|any) > rule \d+| > not)+)/g,
        function (m, label, path) {
          var out = label;
          path.replace(/> (?:all|any) > rule (\d+)/g, function (x, n) { out = 'the ' + ordinal(Number(n)) + ' part of ' + out; return x; });
          return out;
        })
      .replace(/its "repeat for" filter \("where"\)/g, 'its "ask for"').replace(/"repeat_for" > "where"/g, '"ask for"')
      .replace(/ \(([a-z][a-z0-9_]*)\) \(the language buttons\)/g, ' ($1, the language buttons)')
      .replace(/the first screen \("start"\)/g, 'the first row').replace(/ \("start"\)/g, '')
      .replace(/a jump \("next"\)/g, 'a jump (its "jumps" column)')
      .replace(/"usually go to"/g, '"then go to"').replace(/"next"/g, '"then go to"').replace(/"show_if"/g, '"show only if"')
      .replace(/with "(at_most|at_least|not_equals|equals)": /g, function (m, t) { return 'with ' + OP_SIGN[t] + ' '; })
      .replace(/"(at_most|at_least|not_equals|equals)"/g, function (m, t) { return '"' + OP_SIGN[t] + '"'; })
      .replace(/"answered": true or false/g, '"answered" or "not answered"')
      .replace(/an ending \(thank_you\)/g, 'an ending (a thank-you row)').replace(/of an earlier screen/g, 'of an earlier row')
      .replace(/its default is followed/g, 'its "then go to" is followed')
      .replace(/Switch it on again, or/g, 'Show it again (yes in its "show" column), or');
  }

  /* ===========================================================================
     fromTable(text, survey, strings, opts) -> { ok, format, rows, texts,
       problems, warnings, survey } (see the top of this section)
     =========================================================================== */
  panel.fromTable = function (text, survey, strings, opts) {
    var o = isObj(opts) ? opts : {};
    var s = isObj(survey) ? survey : {};
    var known = isObj(strings) ? strings : {};
    var problems = [];
    var warnings = [];
    var out = { ok: false, format: '', rows: [], texts: {}, problems: problems, warnings: warnings, survey: null };
    var langs = languagesOf(s);
    var areas = areasOf(s);
    var items = supportItemsOf(s);
    var current = arr(o.rows).filter(isObj);
    var currentAt = {};
    current.forEach(function (r) { var id = trim(r.id); if (id && !has(currentAt, '#' + id)) currentAt['#' + id] = r; });
    var live = {};
    var liveOptions = [];
    arr(o.liveCodes).forEach(function (c) {
      var code = trim(c).replace(/^screen:/, '');
      var opt = /^option:([a-z][a-z0-9_]*)\/([a-z][a-z0-9_]*)$/.exec(code);
      if (opt) liveOptions.push({ question: opt[1], code: opt[2] });
      else if (CODE_RE.test(code)) live['#' + code] = true;
    });

    function note(listOut, num, column, code, message) {
      var where = num ? 'Row ' + num + (code ? ' (' + code + ')' : '') + (column ? ', ' + column : '') + ': ' : '';
      listOut.push({ row: num || null, column: column || null, code: code || null, message: where + message });
    }
    function problem(num, column, code, message) { note(problems, num, column, code, message); }
    function warn(num, column, code, message) { note(warnings, num, column, code, message); }
    function headerNote(listOut, h, message) { listOut.push({ row: 1, column: h, code: null, message: 'The column "' + h + '" ' + message }); }
    function stored(key) { return has(known, key) && isObj(known[key]) ? known[key] : null; }
    function englishOf(key) {
      if (has(out.texts, key)) return str(out.texts[key].en);
      var v = stored(key);
      return v ? str(v.en) : '';
    }

    // 1. The table and its columns
    var allLangs = STD_LANGS.slice();
    langs.forEach(function (L) { if (allLangs.indexOf(L) === -1) allLangs.push(L); });
    var names = columnNames(allLangs);
    var t = readTable(text, names);
    if (t.problem) { problem(null, null, null, t.problem); return out; }
    out.format = t.format;
    if (looksLikeScreensTab(t.header)) {
      problem(null, null, null, 'This looks like the Sheet\'s Screens tab. In the control panel use Questions > Copy the current ' +
        'route, change that table, and paste it here.');
      return out;
    }
    var ignored = t.ignored.slice();    // the lines left out (see outside())
    if (t.problem2) {
      problem(null, null, null, 'Below the table there is a second table with other columns ("' + t.problem2 + '"). Paste one ' +
        'table only: the route, with one header row.');
    }
    function textLines(n, where) {
      return 'The ' + (n === 1 ? 'line' : n + ' lines') + ' of other text ' + where + ' the table ' + (n === 1 ? 'is' : 'are') + ' left out.';
    }
    if (t.before) warn(null, null, null, textLines(t.before, 'above'));
    if (t.after) warn(null, null, null, textLines(t.after, 'below'));
    if (t.merged && t.merged.count) {
      warn(null, null, null, 'A second table with the same columns follows the first one: its ' + (t.merged.count === 1 ? 'row was' :
        t.merged.count + ' rows were') + ' added after the first table, as ' + (t.merged.count === 1 ? 'row ' + t.merged.from :
        'rows ' + t.merged.from + ' to ' + t.merged.to) + '. Check that it is not an old copy of the route: each code may appear only once.');
    }
    if (t.continued.length) {
      var cn = t.continued;
      warn(null, null, null, (cn.length === 1 ? 'Row ' + cn[0] + ' comes' : 'Rows ' + cn[0] + ' to ' + cn[cn.length - 1] + ' come') +
        ' after an empty line or other text inside the table; ' + (cn.length === 1 ? 'it was' : 'they were') + ' read as rows of the table too.');
    }
    var leftOut = t.leftOut.slice();
    var col = {};
    var everyColumn = PLAIN_COLUMNS.map(function (c) { return c.title; }).concat(['question (English)', 'question (Hindi)',
      'answers', 'answers (Hindi)', 'message (English)', 'message (Hindi)']);
    t.header.forEach(function (h, i) {
      var id = columnOf(h, names);
      if (!id) {
        var used = t.body.filter(function (rec) { return trim(rec.cells[i]); }).length;
        var lost = used ? ', with the words in it (' + (used === 1 ? '1 row' : used + ' rows') + ')' : '';
        if (!trim(h)) {
          if (used) {
            warnings.push({ row: 1, column: null, code: null, message: 'Column ' + (i + 1) + ' has no name in the header row, so it is ' +
              'left out' + lost + '. Name it (the columns are: ' + everyColumn.join(', ') + '), or remove it.' });
          }
          return;
        }
        if (nativeWords(h) !== null && NOTE_COLUMNS.indexOf(words(h)) !== -1) return;   // a column people keep for themselves
        if (!/[^\s\d\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(h)) return;   // "#", "No.": a numbering column
        headerNote(warnings, h, 'is not one the panel reads, so it is left out' + lost + '. The columns are: ' + everyColumn.join(', ') + '.');
        return;
      }
      var L = id.indexOf(':') !== -1 ? id.split(':')[1] : null;
      if (L && langs.indexOf(L) === -1) {
        headerNote(warnings, h, 'is left out: ' + langName(L) + ' is not one of the questionnaire\'s languages (Settings > Languages).');
        return;
      }
      if (has(col, id)) { headerNote(problems, h, 'means the same as the column "' + t.header[col[id]] + '". Keep only one of them.'); return; }
      col[id] = i;
    });
    if (!has(col, 'kind')) {
      problem(null, null, null, 'The table has no "kind" column, so the panel cannot tell what each row is. Add a column ' +
        'named kind (for example: nps, area ratings, yes/no, pick one, thank you).');
      return out;
    }
    var TEXTISH = { q: true, a: true, m: true, low: true, high: true, hint: true };
    var blanked = {};    // '#' + row number + '|' + column id: a text cell read as empty (a filler, or a text key)
    function cell(rec, id) {
      return has(blanked, '#' + rec.num + '|' + id) ? '' : rawCell(rec, id);
    }
    function rawCell(rec, id) {
      if (!has(col, id)) return '';
      var v = trim(rec.cells[col[id]]);
      if (t.format === 'markdown') {
        if (has(TEXTISH, id.split(':')[0])) {
          var wrap = /^(\*\*|__|`)([\s\S]*)\1$/.exec(v);
          if (wrap) v = trim(wrap[2]);
        } else {
          v = trim(v.replace(/[`*]/g, ''));
        }
      }
      return v;
    }
    /* The words of one text in every language the row gives: { en, hi, ... }. */
    function wordsIn(rec, base) {
      var vals = {};
      langs.forEach(function (L) { var v = cell(rec, base + ':' + L); if (v) vals[L] = v; });
      return vals;
    }

    // 2. The rows and their kinds
    /* Words under the table (an AI's "Let me know..."): lines after the last
       real row whose kind is not a kind and whose code is not a code. */
    function looksLikeRow(rec) {
      var kindWords = cell(rec, 'kind');
      return Boolean(kindByWord(kindWords)) || ambiguousKind(kindWords) || CODE_RE.test(cell(rec, 'code').toLowerCase());
    }
    /* Tab- or comma-separated text has no end mark: a header row again inside it starts a second table (the same
       columns: its rows are read too; others: a problem, and its rows are left out until an empty line). */
    function idsOf(cells) {
      var ids = cells.map(function (h) { return columnOf(h, names); });
      while (ids.length && ids[ids.length - 1] === null) ids.pop();
      return ids;
    }
    var mergedAt = [];
    var skipping = false;
    var body = t.body.filter(function (rec) {
      var filled = rec.cells.filter(function (c) { return trim(c); });
      if (!filled.length) { skipping = false; return false; }
      var lo = leftOutLine(filled.join(t.format === 'csv' ? ', ' : ' '));
      if (lo !== null && !looksLikeRow(rec)) { leftOut.push(lo); return false; }
      var named = t.format === 'markdown' ? 0 : knownCells(rec.cells, names);
      if (named >= 2 && sameColumns(idsOf(t.header), idsOf(rec.cells))) { mergedAt.push(rec.num); skipping = false; return false; }
      if (named < 3) {
        if (skipping) ignored.push(filled.join(' '));
        return !skipping;
      }
      if (!t.problem2) {
        t.problem2 = shorten(filled.join(' | '), 80);
        problem(null, null, null, 'Below the table there is a second table with other columns ("' + t.problem2 + '"). Paste one ' +
          'table only: the route, with one header row.');
      }
      ignored.push(filled.join(' '));
      skipping = true;
      return false;
    });
    if (mergedAt.length) {
      warn(null, null, null, 'Row ' + mergedAt[0] + ' repeats the header row, so a second table starts there; its rows were read as ' +
        'rows of the table too. Check that it is not an old copy of the route: each code may appear only once.');
    }
    var lastRow = -1;
    body.forEach(function (rec, i) { if (looksLikeRow(rec)) lastRow = i; });
    var entries = [];
    body.forEach(function (rec, i) {
      var filled = rec.cells.filter(function (c) { return trim(c); });
      if (!filled.length) return;
      var kindCell = cell(rec, 'kind');
      var codeCell = cell(rec, 'code');
      if ((i > lastRow || (!kindCell && filled.length === 1)) && !looksLikeRow(rec)) {
        warn(rec.num, null, null, 'this line is not a row of the table, so it is left out: "' + shorten(filled.join(' '), 60) + '".');
        ignored.push(filled.join(' '));
        return;
      }
      if (rec.cells.slice(t.header.length).some(function (x) { return trim(x); })) {
        problem(rec.num, null, codeCell || null, 'this row has more cells than the header row has columns (' + t.header.length +
          '), so some of its words would be lost. ' + (t.format === 'csv' ? 'Is there a comma inside a text? Put that text in "double quotes".' :
          t.format === 'markdown' ? 'Is there a | inside a text? Write it as \\|.' : 'Is a column name missing in the header row?'));
      }
      var k = kindCell ? kindByWord(kindCell) : null;
      if (!kindCell) {
        var low = codeCell.toLowerCase();
        KINDS.forEach(function (x) { if (!k && x.code && x.code === low && !x.ending) k = x; });
        if (k) warn(rec.num, 'kind', low, 'the kind is empty, so the row is read as "' + k.name + '" (its code says so).');
        else problem(rec.num, 'kind', codeCell || null, 'the kind is empty. Write one of: ' + kindNames().join(', ') + '.');
      } else if (!k && ambiguousKind(kindCell)) {
        problem(rec.num, 'kind', codeCell || null, '"' + kindCell + '" can mean two things: write "pick one" when partners choose ' +
          'one answer, or "pick several" when they may tick more than one.');
      } else if (!k) {
        var all = [];
        var nameOfWord = {};
        KINDS.forEach(function (x) {
          [x.name].concat(x.also).forEach(function (a) {
            var w = words(a);
            if (AMBIGUOUS_KIND_RE.test(w)) return;   // "multi_choice" is "multi choice": never offer a guess for one of those
            all.push(w);
            if (!has(nameOfWord, w)) nameOfWord[w] = x.name;
          });
        });
        var sug = closest(words(kindCell), all);
        problem(rec.num, 'kind', codeCell || null, '"' + kindCell + '" is not a kind the panel knows.' +
          (sug ? ' Did you mean "' + nameOfWord[sug] + '"?' : '') + ' The kinds are: ' + kindNames().join(', ') + '.');
      }
      entries.push({ num: rec.num, rec: rec, kind: k, codeCell: codeCell });
    });
    leftOut.forEach(function (lo) {
      if (lo && !fillerKind(lo) && !/^(nothing|no(thing)? ?(else|more)?)\.?$/i.test(lo)) {
        warn(null, null, null, 'Left out of the table, as the line under it says: "' + shorten(lo, 200) + '". Check whether it is needed.');
      }
    });
    if (!entries.length) { problem(null, null, null, 'The table has its header row but no rows under it.'); return out; }

    // 2b. Text cells that hold no words: a filler ("NA", "-", "TBD" ...) is read as an empty cell, so the words
    //     already there stay (a warning); a text key ("q.nps") is a problem. Both are then empty for what follows.
    var fillerNotes = [];
    entries.forEach(function (x) {
      Object.keys(col).forEach(function (id) {
        var base = id.split(':')[0];
        if (!has(TEXTISH, base)) return;
        var v = rawCell(x.rec, id);
        if (!v) return;
        if (fillerKind(v)) fillerNotes.push({ x: x, id: id, said: v, filler: true });
        else if (base !== 'a' && looksLikeKey(v, known)) fillerNotes.push({ x: x, id: id, said: v, filler: false });
        else return;
        blanked['#' + x.num + '|' + id] = v;
      });
    });

    // 3. Codes: as written (small letters), else made from the English like the panel does
    var tableCodes = {};
    entries.forEach(function (x) { var c = x.codeCell.toLowerCase(); if (c) tableCodes['#' + c] = true; });
    var taken = { '#support_comment': true };
    Object.keys(tableCodes).forEach(function (h) { taken[h] = true; });
    Object.keys(known).forEach(function (key) {
      var m = /^q\.([a-z0-9_]+)(\.|$)/.exec(key) || /^choice\.([a-z0-9_]+)\./.exec(key);
      if (m) taken['#' + m[1]] = true;    // a text of another question already uses it
    });
    var seen = {};
    entries.forEach(function (x) {
      var k = x.kind;
      var num = x.num;
      var c = x.codeCell;
      if (c) {
        var low = c.toLowerCase();
        if (CODE_RE.test(low) && low !== c) warn(num, 'code', low, 'codes are written in small letters, so "' + c + '" is read as "' + low + '".');
        c = low;
        if (!CODE_RE.test(c)) {
          problem(num, 'code', null, '"' + x.codeCell + '" cannot be a code: use small letters a-z, digits and _, starting with a letter ' +
            '(for example "' + slug(x.codeCell, {}, 'question') + '").');
        } else if (c.length > MAX_CODE) {
          problem(num, 'code', c, 'the code is ' + c.length + ' characters long; the most is ' + MAX_CODE + '. Use a shorter one.');
        }
      } else if (k) {
        var en = cell(x.rec, 'q:en');
        if (k.code && !has(tableCodes, '#' + k.code)) {
          c = k.code;
        } else {
          // the panel's own rule: a built-in from its standard code (thanks_2), a question from its English
          c = slug(k.code || en || (k.ending ? 'ending' : k.name), taken, k.ending ? 'ending' : 'question');
          warn(num, 'code', c, 'the code was empty, so the panel made one from ' + (en ? 'the English question' : 'the kind') + ': "' + c +
            '". Answers are saved under it, so keep it from now on.');
        }
        taken['#' + c] = true;
        tableCodes['#' + c] = true;
      }
      x.code = c;
      if (!k || !c || !CODE_RE.test(c) || c.length > MAX_CODE) return;
      if (k.fixed && c !== k.code) {
        x.unusable = true;   // its other cells are not read: one clear problem is enough
        problem(num, 'code', c, 'a "' + k.name + '" row must have the code "' + k.code + '": ' + (k.code === 'nps' ?
          'it fills the nps column of every answers sheet. For another 0 to 10 question use the kind "0 to 10".' :
          'it fills the support_contacted column of every answers sheet. For another yes/no question use the kind "yes/no".'));
      }
      if (has(seen, '#' + c)) {
        x.unusable = true;
        problem(num, 'code', c, 'the same code as row ' + seen['#' + c] + '. Every row needs its own code, because answers are saved under it.');
      } else {
        seen['#' + c] = num;
      }
      if (c === 'support_comment') {
        x.unusable = true;
        problem(num, 'code', c, '"support_comment" is kept for the comment under the support ratings. Use another code.');
      } else if (storesAnswer(k.type) && (has(FACT_OF, c) || has(RULE_WORDS, c))) {
        x.unusable = true;
        problem(num, 'code', c, '"' + c + '" cannot be the code of a question: the rules read it as ' +
          (has(FACT_OF, c) ? 'the ' + FACT_WORD[FACT_OF[c]] : 'one of their own words') + '. Use another code.');
      }
    });

    fillerNotes.forEach(function (f) {
      var code = f.x.code && CODE_RE.test(f.x.code) ? f.x.code : null;
      if (f.filler) {
        warn(f.x.num, columnTitle(f.id), code, '"' + shorten(f.said, 40) + '" was read as an empty cell, so the words stay as they are. ' +
          'Leave a cell empty when you don\'t want to change it.');
      } else {
        problem(f.x.num, columnTitle(f.id), code, 'looks like a text key ("' + shorten(f.said, 40) + '"), not words. Write the words ' +
          'partners should see.');
      }
    });

    /* The main thank-you row: the first "thank you" row (else the first ending). Only it writes thanks.title and
       thanks.body; an ending above it is a problem (step 6). */
    var mainEntry = null;
    entries.forEach(function (x) {
      if (!mainEntry && x.kind && x.kind.type === 'thank_you' && !x.kind.ending && !x.unusable && x.code) mainEntry = x;
    });
    entries.forEach(function (x) {
      if (!mainEntry && x.kind && x.kind.type === 'thank_you' && !x.unusable && x.code) mainEntry = x;
    });

    // 4. Each row's settings and words
    /* Texts of the built-in screens: a question coded "fn_rating" would get q.fn_rating and change them. */
    var builtinKeys = { 'q.fn_rating': 'the area ratings', 'q.deep_dive': 'the problem screens', 'q.tell_more': 'the problem screens',
      'q.tell_more_required': 'the problem screens', 'q.support_block': 'the support ratings', 'q.support_comment': 'the support comment' };
    if (isObj(s.support) && trim(s.support.comment_text)) builtinKeys[trim(s.support.comment_text)] = 'the support comment';
    var rows = [];
    var nums = [];
    var sets = {};
    var setOrder = [];
    /* how = { base: the column the words came from ('q', 'm', 'a', 'low', 'high', 'hint'), answer: the
       answer's code (answers), builtin: a built-in row's words (partners see them in every round) }. */
    function setText(key, values, num, column, code, how) {
      var h = '#' + key;
      if (has(sets, h)) {
        var prev = sets[h];
        var differ = Object.keys(values).filter(function (L) { return has(prev.values, L) && trim(prev.values[L]) !== trim(values[L]); });
        if (differ.length) {
          problem(num, column, code, 'these words go into the same text as row ' + prev.num + ' (' + key + '), but they are different. ' +
            (key.indexOf('thanks.') === 0 ? 'For a second thank-you screen with its own words use the kind "ending".' : 'Make them the same.'));
        } else {
          Object.keys(values).forEach(function (L) { prev.values[L] = values[L]; });
        }
        return;
      }
      sets[h] = { key: key, values: copy(values), num: num, column: column, code: code, how: how || {} };
      setOrder.push(h);
    }
    entries.forEach(function (x) {
      var k = x.kind;
      var c = x.code;
      if (!k || !c || !CODE_RE.test(c) || c.length > MAX_CODE || x.unusable) return;
      var num = x.num;
      var rec = x.rec;
      var type = k.type;
      var cur = has(currentAt, '#' + c) ? currentAt['#' + c] : null;
      var base = cur && cur.type === type ? cur : null;
      var row = base ? copy(base) : blankRow(c, type);
      row.id = c;
      row.type = type;
      if (!Array.isArray(row.options)) row.options = [];
      if (!Array.isArray(row.jumps)) row.jumps = [];
      var d = rowDesc(type);
      var fields = rowFields(type);

      if (has(col, 'show')) {
        var sh = yesNo(cell(rec, 'show'));
        if (sh === undefined) { problem(num, 'show', c, '"' + cell(rec, 'show') + '" is not yes or no.'); sh = true; }
        row.active = sh !== false;
      } else if (!base) {
        row.active = true;
      }
      if (has(col, 'required')) {
        var rq = yesNo(cell(rec, 'required'));
        if (rq === undefined) { problem(num, 'required', c, '"' + cell(rec, 'required') + '" is not yes or no (leave it empty for the usual).'); rq = null; }
        row.required = rq;
        var dFields = d && isObj(d.fields) ? d.fields : {};
        if (rq !== null && !has(dFields, 'required')) warn(num, 'required', c, 'a "' + k.name + '" row has nothing to answer, so "required" changes nothing.');
      }
      if (has(col, 'show_if')) {
        var ruleCell = cell(rec, 'show_if');
        var always = ALWAYS_RE.test(ruleCell);
        if (has(SKIP_OF, type)) row.skip_if = always ? '' : SKIP_OF[type];
        var pr = placeholderIn(ruleCell) ? { problem: placeholderIn(ruleCell) } : panel.parseRule(always ? '' : ruleCell, { languages: langs });
        if (pr.problem) {
          problem(num, 'show only if', c, 'the rule "' + shorten(ruleCell, 60) + '" cannot be read: ' + pr.problem);
          row.show_if = null;
        } else {
          row.show_if = pr.rule;
        }
      } else if (!base && has(SKIP_OF, type)) {
        row.skip_if = SKIP_OF[type];
      }
      if (has(col, 'next')) row.next = targetCode(cell(rec, 'next'));
      if (has(col, 'jumps')) {
        var jumpCell = cell(rec, 'jumps');
        var pj = placeholderIn(jumpCell) ? { list: [], problems: [placeholderIn(jumpCell)] } : panel.parseJumps(jumpCell, { languages: langs });
        pj.problems.forEach(function (p) { problem(num, 'jumps', c, p); });
        row.jumps = pj.list;
      }
      if (has(col, 'repeat')) {
        var rp = parseRepeat(cell(rec, 'repeat'));
        if (rp === null) {
          problem(num, 'ask for', c, '"' + cell(rec, 'repeat') + '" is not one of: once (empty), each area, each area rated low.');
          rp = '';
        } else if (rp && !repeatable(type)) {
          problem(num, 'ask for', c, 'a "' + k.name + '" row is never asked once per area. Only these kinds can be: ' + repeatableKinds() +
            '. Leave "ask for" empty.');
          rp = '';
        }
        row.repeat = rp;
      }

      // the words: the English (and the Hindi given) into the text keys the panel uses
      var q = wordsIn(rec, 'q');
      var m = wordsIn(rec, 'm');
      var aEn = cell(rec, 'a:en');
      /* The words of one text: English (and other languages) given, else the
         words it has; "missing" = the problem when it has none at all (null:
         none needed). how: see setText (base = the column's id). */
      function useText(key, values, column, missing, how) {
        if (!key) return;
        var h = how || {};
        h.builtin = builtinWords;
        if (values.en) { setText(key, values, num, column, c, h); return; }
        var have = trim(englishOf(key));
        if (!have && missing) { problem(num, column, c, missing); return; }
        if (!Object.keys(values).length) return;
        if (have) setText(key, values, num, column, c, h);
        else warn(num, column, c, 'the ' + list(Object.keys(values).map(langName)) + ' words are left out: write the English too.');
      }
      /* An ending's (or info card's) message: the message columns, else (no message column) the answers columns. */
      var mBase = Object.keys(m).length || !(aEn && fields.indexOf('options') === -1) ? 'm' : 'a';
      function messageWords() { return mBase === 'm' ? m : wordsIn(rec, 'a'); }
      /* Only the main thank-you row writes thanks.title / thanks.body (review W8 finding 4): a later "thank you"
         row with its own words is an ending. The main one is always the standard thank-you screen (also when it is
         written "ending" or "end"), unless the draft's row already has texts of its own. */
      var said = Object.keys(q).length || Object.keys(messageWords()).length;
      var ownText = base && (trim(base.text) || trim(base.body));
      var standardThanks = type === 'thank_you' && (x === mainEntry ? !k.ending || !ownText : !k.ending && !said);
      var builtinWords = Boolean(k.builtin) && (type !== 'thank_you' || standardThanks);
      if (type === 'thank_you' && !k.ending && x !== mainEntry && said) {
        warn(num, 'kind', c, 'only the first "thank you" row is the main thank-you screen; this row was read as an "ending" with its ' +
          'own words. Write ending in its kind.');
      }
      if (has(FIXED_TEXT, type)) {
        useText(FIXED_TEXT[type], q, 'question (English)', null, { base: 'q' });
      } else if (standardThanks) {
        row.text = '';
        row.body = '';
        useText('thanks.title', q, 'question (English)', null, { base: 'q' });
        useText('thanks.body', messageWords(), 'message (English)', null, { base: mBase });
      } else {
        var needed = type === 'thank_you' || Boolean(d && d.row && d.row.needs_text);
        var textKey = trim(base && base.text) || (type === 'thank_you' ? 'end.' + c + '.title' : '') ||
          trim(d && d.row && d.row.default_text) || 'q.' + c;
        if (base && !trim(base.text) && !q.en && (type === 'thank_you' || !needed)) {
          textKey = '';   // the draft's row has no words of its own (an ending with the standard title): it keeps that
        } else if (!needed && !q.en && !trim(englishOf(textKey))) {
          textKey = trim(base && base.text);   // a kind that needs no question, and none is given
        }
        if (textKey === 'q.' + c && has(builtinKeys, textKey) && !(base && trim(base.text) === textKey)) {
          problem(num, 'code', c, 'the code "' + c + '" cannot be used here: its question text (' + textKey + ') holds the words of ' +
            builtinKeys[textKey] + '. Use another code.');
          return;
        }
        row.text = textKey;
        useText(textKey, q, 'question (English)', type === 'thank_you' ? 'the ending\'s title (the question column) is empty: write it in English.' :
          (needed ? 'the question is empty: write it in English.' : null), { base: 'q' });
        if (type === 'thank_you' || fields.indexOf('body') !== -1) {
          var mb = messageWords();
          if (Object.keys(mb).length || trim(base && base.body)) {
            row.body = trim(base && base.body) || (type === 'thank_you' ? 'end.' + c + '.body' : 'q.' + c + '.body');
            useText(row.body, mb, 'message (English)', null, { base: mBase });
          } else {
            row.body = '';
          }
        }
        // the ends of a 0 to 10 scale: kept, else the standard ones ("Not at all likely" ...)
        ['low_label', 'high_label', 'scale_hint'].forEach(function (f) {
          if (fields.indexOf(f) === -1) return;
          var given = wordsIn(rec, LABEL_COLUMN[f]);
          var key = base ? trim(base[f]) : null;
          if (key === null || (!key && given.en)) key = c === 'nps' ? NPS_LABELS[f] : 'q.' + c + LABEL_SUFFIX[f];
          row[f] = key;
          if (!key) return;
          var column = columnTitle(LABEL_COLUMN[f] + ':en');
          if (!given.en && !trim(englishOf(key))) {
            // a new label: the standard words, copied as the panel does, then whatever the table gives
            var from = stored(NPS_LABELS[f]);
            var start = from && trim(from.en) ? copy(from) : { en: LABEL_DEFAULT[f] };
            Object.keys(given).forEach(function (L) { start[L] = given[L]; });
            setText(key, start, num, column, c, { base: LABEL_COLUMN[f], given: given });
          } else if (Object.keys(given).length) {
            useText(key, given, column, null, { base: LABEL_COLUMN[f] });
          }
        });
      }
      if (Object.keys(m).length && type !== 'thank_you' && fields.indexOf('body') === -1) {
        warn(num, 'message (English)', c, 'a "' + k.name + '" row shows no message, so it is left out.');
      }

      // the answers of a "pick one" question
      if (fields.indexOf('options') !== -1) {
        var its = [];
        if (!aEn) {
          row.options = base ? arr(base.options).slice() : [];
          if (!row.options.length && row.active !== false) {
            problem(num, 'answers', c, 'a "' + k.name + '" question needs its answers, written like: phone: Phone call; app: In the app');
          }
        } else {
          its = checkAnswers(answerItems(aEn), 'answers', true);
          var optTaken = {};
          its.forEach(function (it) { if (it.code) optTaken['#' + it.code] = true; });
          var madeCodes = [];
          its.forEach(function (it) {
            if (it.code) {
              if (it.written && it.written.toLowerCase() !== it.code) {
                warn(num, 'answers', c, 'the answer code "' + it.written + '" is written "' + it.code + '" (small letters, digits and _).');
              }
              return;
            }
            it.code = slug(it.label, optTaken, 'option');
            optTaken['#' + it.code] = true;
            madeCodes.push(it.code);
          });
          if (madeCodes.length) {
            warn(num, 'answers', c, 'answers without a code got one made from their English: ' + madeCodes.join(', ') +
              '. Answers are saved under these codes, so keep them from now on (write them like: phone: Phone call).');
          }
          var codes = [];
          its.forEach(function (it) {
            if (codes.indexOf(it.code) !== -1) problem(num, 'answers', c, 'two answers have the code "' + it.code + '". Every answer needs its own code.');
            else codes.push(it.code);
          });
          row.options = codes;
          var other = {};
          langs.forEach(function (L) {
            if (L === 'en') return;
            var v = cell(rec, 'a:' + L);
            if (!v) return;
            var column = columnTitle('a:' + L);
            var parts = checkAnswers(answerItems(v), column, false);
            var byCode = parts.some(function (p) { return p.code && codes.indexOf(p.code) !== -1; });
            var map = {};
            parts.forEach(function (p, idx) {
              if (byCode) { if (p.code && codes.indexOf(p.code) !== -1) map['#' + p.code] = p.label; }
              else if (idx < codes.length) map['#' + codes[idx]] = p.raw;
            });
            if (!byCode && parts.length !== codes.length) {
              warn(num, column, c, 'it has ' + parts.length + ' answers but "answers" has ' + codes.length +
                ', so they are matched in order. Write them like: phone: ... ; app: ... to be sure.');
            }
            other[L] = map;
          });
          var worded = {};
          its.forEach(function (it) {
            if (has(worded, '#' + it.code)) return;     // a second answer with the same code: already a problem
            worded['#' + it.code] = true;
            var vals = {};
            if (it.label) vals.en = it.label;
            Object.keys(other).forEach(function (L) { if (has(other[L], '#' + it.code) && trim(other[L]['#' + it.code])) vals[L] = trim(other[L]['#' + it.code]); });
            useText('choice.' + c + '.' + it.code, vals, 'answers', 'the answer "' + it.code + '" has no words: write them in English, like: ' +
              it.code + ': Phone call', { base: 'a', answer: it.code });
          });
        }
        // a "pick one" needs two answers at least (review W8 finding 5); two with one code are already a problem
        var count = aEn ? its.length : row.options.length;
        if (count < 2 && (count || aEn)) {
          var one = its.length === 1 ? its[0].label : '';
          var why = 'a "' + k.name + '" question needs at least 2 answers, separated by ";" (for example: phone: Phone call; app: In the app).' +
            (/[,\/]/.test(one) ? ' Commas and slashes don\'t separate answers: use ";".' : '');
          if (row.active !== false) problem(num, 'answers', c, why);
          else warn(num, 'answers', c, why);
        }
      } else if (aEn && fields.indexOf('body') === -1 && type !== 'thank_you') {
        var yn = type === 'yes_no' && answerItems(aEn).every(function (it) { return /^(yes|no)$/.test(it.code || words(it.label)); });
        if (!yn) warn(num, 'answers', c, 'only "pick one" and "pick several" questions have answers to write here, so this is left out.');
      }
      rows.push(row);
      nums.push(num);

      /* The answers of one answers cell, checked (review W8 findings 1, 5, 6 and 13): a filler is no words (a
         lone English one between answers is no answer at all); formatting marks, a text key, and an answer
         without a code between answers with codes (a ";" inside words?) are problems. */
      function checkAnswers(found, column, english) {
        var blank = [];
        var dropped = [];
        var kept = [];
        found.forEach(function (it) {
          if (!it.quoted && answerFiller(it.label, english)) {
            if (!it.code && english) { dropped.push('"' + shorten(it.label, 20) + '"'); return; }
            blank.push((it.code ? it.code + ': ' : '') + '"' + shorten(it.label, 20) + '"');
            it.label = '';
            it.raw = '';
          }
          kept.push(it);
        });
        if (blank.length) {
          warn(num, column, c, (blank.length === 1 ? blank[0] + ' was' : list(blank) + ' were') + ' read as empty, so the words stay as ' +
            'they are. Leave a cell (or an answer\'s words) empty when you don\'t want to change it.');
        }
        if (dropped.length) {
          warn(num, column, c, list(dropped) + ' between the answers ' + (dropped.length === 1 ? 'is not an answer, so it is' :
            'are not answers, so they are') + ' left out.');
        }
        kept.forEach(function (it, idx) {
          if (it.quoted || !it.label) return;
          var named = '"' + (it.code || shorten(it.label, 40)) + '"';
          if (/^(`|\*\*|__)|(`|\*\*|__)$/.test(it.label)) {
            problem(num, column, c, 'the answer ' + named + ' has formatting marks around its words ("' + shorten(it.label, 40) +
              '"), which partners would see. Write only the words.');
          } else if (looksLikeKey(it.label, known)) {
            problem(num, column, c, 'the answer ' + named + ' looks like a text key ("' + shorten(it.label, 40) + '"), not words. ' +
              'Write the words partners should see.');
          }
          if (it.code) return;
          var before = kept.slice(0, idx).some(function (y) { return y.code; });
          var after = kept.slice(idx + 1).some(function (y) { return y.code; });
          if (before && after) {
            problem(num, column, c, 'the answer "' + shorten(it.label, 40) + '" has no code, but the answers around it have one: is there ' +
              'a ";" inside a label? Put that label in double quotes, like: always: "Yes; always".');
          }
        });
        return kept;
      }
    });

    // 5. Arrows and rules, now that every code is known
    var at = {};
    rows.forEach(function (r, i) { if (!has(at, '#' + r.id)) at['#' + r.id] = i; });
    var mainEnd = -1;
    rows.forEach(function (r, i) { if (mainEnd < 0 && r.type === 'thank_you') mainEnd = i; });
    var keys = {};
    rows.forEach(function (r, i) {
      function add(key) { if (!has(keys, '#' + key)) keys['#' + key] = i; }
      if (r.type === 'function_ratings') areas.forEach(function (a) { add('fn_rating:' + a); });
      else if (r.type === 'function_deep_dives') areas.forEach(function (a) { add('fn_deep_dive:' + a); });
      else if (r.type === 'support_block') {
        items.forEach(function (it) { add('support:' + it); });
        if (!isObj(s.support) || s.support.allow_comment !== false) add('support_comment');
      } else if (storesAnswer(r.type)) {
        if (has(REPEATS, r.repeat) && repeatable(r.type)) areas.forEach(function (a) { add(r.id + ':' + a); });
        else add(r.id);
      }
    });
    /* A row whose kind could not be read (empty, ambiguous or unknown) is left out, and the problem at its kind
       already says why (step 2). So a rule that tests one of its answers is not told again that no row answers it
       (review of 30 Oct 2026). Its answers: its code, "<code>:<area>" when asked for each area, and, for the code
       of a built-in row, that row's answers (fn_rating:<area>, fn_deep_dive:<area>, support:<code>,
       support_comment). */
    var unreadKind = {};
    entries.forEach(function (x) { if (!x.kind && x.code) unreadKind['#' + x.code] = true; });
    var BUILT_IN_OWNER = { fn_rating: 'fn_ratings', fn_deep_dive: 'fn_deep_dives', support_comment: 'support' };
    function answerOfUnreadRow(key) {
      var base = str(key).split(':')[0];
      return has(unreadKind, '#' + key) || has(unreadKind, '#' + base) ||
        (has(BUILT_IN_OWNER, base) && has(unreadKind, '#' + BUILT_IN_OWNER[base]));
    }
    var example = areas[0] || 'payments';
    function unknownAnswer(key) {
      var head = '"' + key + '" is not an answer of any row in this table.';
      if (has(at, '#' + key)) {
        var r = rows[at['#' + key]];
        if (r.type === 'function_ratings') return head + ' Area ratings are tested one area at a time: write fn_rating:<area>, for example fn_rating:' + example + '.';
        if (r.type === 'function_deep_dives') return head + ' Problems are tested one area at a time: write fn_deep_dive:<area>, for example fn_deep_dive:' + example + '.';
        if (r.type === 'support_block') return head + ' Support ratings are tested one at a time: write support:<code>' + (items.length ? ', for example support:' + items[0] : '') + '.';
        if (has(REPEATS, r.repeat)) return head + ' That question is asked once per area, so name the area: ' + key + ':<area>, for example ' + key + ':' + example + '.';
        return head + ' Row ' + nums[at['#' + key]] + ' is a "' + kindName(r) + '" row: it has no answer to test.';
      }
      var mm = /^([a-z0-9_]+):(.*)$/.exec(key);
      if (mm && (mm[1] === 'fn_rating' || mm[1] === 'fn_deep_dive')) {
        return head + (areas.indexOf(mm[2]) === -1 ? ' There is no area "' + mm[2] + '". The areas are: ' + areas.join(', ') + '.' :
          ' The table has no ' + (mm[1] === 'fn_rating' ? 'area ratings' : 'problem screens') + ' row.');
      }
      if (mm && mm[1] === 'support') {
        return head + (items.indexOf(mm[2]) === -1 ? ' There is no support question "' + mm[2] + '". They are: ' + items.join(', ') + '.' :
          ' The table has no support ratings row.');
      }
      if (key === 'fn_rating' || key === 'fn_deep_dive') return head + ' Name the area: ' + key + ':<area>, for example ' + key + ':' + example + '.';
      var sug = closest(key, Object.keys(keys).map(function (h) { return h.slice(1); }));
      return head + (sug ? ' Did you mean "' + sug + '"?' : '') + outside(key.split(':')[0]);
    }
    /* No message may say a code is missing when it is only in a part of the paste that was left out (review W8
       finding 11): ' "why_low" is in the text outside the table ...', or ''. */
    var ignoredText = ignored.join('\n').toLowerCase();
    function outside(code) {
      var w = str(code).toLowerCase();
      for (var pos = w ? ignoredText.indexOf(w) : -1; pos !== -1; pos = ignoredText.indexOf(w, pos + 1)) {
        if (!/[a-z0-9_]/.test(ignoredText.charAt(pos - 1) || ' ') && !/[a-z0-9_]/.test(ignoredText.charAt(pos + w.length) || ' ')) {
          return ' "' + code + '" is in the text outside the table, which was left out: put its row inside the table.';
        }
      }
      return '';
    }
    var roundIds = Array.isArray(o.rounds) ? o.rounds.map(function (x) { return trim(isObj(x) ? x.id : x); }).filter(Boolean) : null;
    function checkRule(i, rule, column) {
      var r = rows[i];
      var say = r.active === false ? warn : problem;
      testsOf(rule).forEach(function (c) {
        if (typeof c.answer === 'string') {
          if (!has(keys, '#' + c.answer) && !answerOfUnreadRow(c.answer)) say(nums[i], column, r.id, unknownAnswer(c.answer));
        } else if (c.fact === 'lang') {
          var vals = has(c, 'in') ? arr(c['in']) : [has(c, 'equals') ? c.equals : c.not_equals];
          vals.forEach(function (v) {
            if (v !== undefined && langs.indexOf(str(v)) === -1) {
              say(nums[i], column, r.id, '"' + v + '" is not one of the questionnaire\'s languages (' + langs.join(', ') + ').');
            }
          });
        } else if (c.fact === 'round' && roundIds) {
          // a round that does not exist (or written in other capitals) never matches (review W8 finding 12)
          (has(c, 'in') ? arr(c['in']) : [has(c, 'equals') ? c.equals : c.not_equals]).forEach(function (v) {
            if (v === undefined || roundIds.indexOf(str(v)) !== -1) return;
            var near = roundIds.filter(function (x) { return x.toLowerCase() === str(v).toLowerCase(); })[0];
            warn(nums[i], column, r.id, 'the rule tests the round "' + v + '", but no round has that id (' + (roundIds.length ?
              'the rounds are: ' + shorten(roundIds.join(', '), 120) : 'there are no rounds yet') + ').' +
              (near ? ' Did you mean "' + near + '"? Round ids must match exactly.' : ''));
          });
        } else if (typeof c.fact === 'string' && !has(FACT_WORD, c.fact)) {
          say(nums[i], column, r.id, '"' + c.fact + '" is not something a rule can test.');
        }
      });
    }
    rows.forEach(function (r, i) {
      var num = nums[i];
      var say = r.active === false ? warn : problem;   // a hidden row's arrows are never used
      function arrow(code, column, label) {
        if (code === '@end') {
          if (has(at, '#end')) code = 'end';
          else if (mainEnd >= 0) code = rows[mainEnd].id;
          else return null;
        }
        if (!has(at, '#' + code)) {
          if (has(tableCodes, '#' + code)) return null;    // that row has its own problem
          var sug = closest(code, rows.map(function (x) { return x.id; }));
          say(num, column, r.id, label + ' goes to "' + code + '", but no row has that code.' + (sug ? ' Did you mean "' + sug + '"?' : '') +
            outside(code));
          return null;
        }
        var j = at['#' + code];
        if (j === i) { say(num, column, r.id, label + ' goes to this row itself. Write a later row or an ending.'); return null; }
        if (j < i && !isEndingRow(rows[j])) {
          say(num, column, r.id, label + ' goes back up to row ' + nums[j] + ' ("' + code + '"). Arrows may only go down the table ' +
            '(to a later row) or to an ending (a thank-you row), so a route can never go round in circles.');
          return null;
        }
        return code;
      }
      if (r.next) { var to = arrow(r.next, 'then go to', '"then go to"'); if (to !== null) r.next = to; }
      arr(r.jumps).forEach(function (j, k) { var go = arrow(j['goto'], 'jumps', 'jump ' + (k + 1)); if (go !== null) j['goto'] = go; });
      if (r.type === 'thank_you' && !r.show_if && (r.next || arr(r.jumps).length)) {
        warn(num, r.next ? 'then go to' : 'jumps', r.id, 'a thank-you row ends the survey, so its "then go to" and jumps are not used.');
      }
      if (r.type === 'thank_you' && r.show_if) {
        say(num, 'show only if', r.id, 'an ending can\'t have a "show only if": partners reach it through a jump or a "then go to". ' +
          'Leave the cell empty.');
      }
      if (r.show_if) checkRule(i, r.show_if, 'show only if');
      arr(r.jumps).forEach(function (j) { checkRule(i, j.when, 'jumps'); });
    });

    // 6. The built-in rows the questionnaire needs
    var firstOf = {};
    rows.forEach(function (r, i) {
      if (ONCE_ONLY.indexOf(r.type) === -1) return;
      if (has(firstOf, r.type)) {
        problem(nums[i], 'kind', r.id, 'there is already a "' + kindName(r) + '" row (row ' + nums[firstOf[r.type]] + '). It can appear only once: remove one of them.');
      } else {
        firstOf[r.type] = i;
      }
    });
    [['nps', 'nps_0_10', 'nps', 'the NPS question', 'nps'], ['support_gate', 'yes_no', 'support question', 'the support question', 'support_contacted']]
      .forEach(function (b) {
        if (has(at, '#' + b[0])) {
          var i = at['#' + b[0]];
          if (rows[i].type !== b[1]) problem(nums[i], 'kind', b[0], 'the code "' + b[0] + '" belongs to ' + b[3] + ', so its kind must be "' + b[2] + '".');
        } else if (!has(tableCodes, '#' + b[0])) {
          problem(null, null, b[0], 'The table has no row with the code "' + b[0] + '" (kind: ' + b[2] + '). ' + capital(b[3]) + ' fills the ' + b[4] +
            ' column of every answers sheet, so it can never be removed: put its row back. To stop asking it, keep the row and write no in "show".' +
            outside(b[0]));
        }
      });
    if (mainEnd < 0) {
      problem(null, null, null, 'The table has no thank-you row. Add one (kind: thank you) after the last question: the answers are sent from it.' +
        (/thank/.test(ignoredText) ? ' A thank-you row is in the text outside the table, which was left out: put it inside the table.' : ''));
    } else if (rows[mainEnd].active === false) {
      problem(nums[mainEnd], 'show', rows[mainEnd].id, 'the first thank-you row ends the main route and sends the answers, so it must be shown: write yes in "show".');
    }
    // endings go below the "thank you" row (review W8 finding 14): above it, an ending would end the main route early
    var mainAt = mainEntry ? nums.indexOf(mainEntry.num) : -1;
    rows.forEach(function (r, i) {
      if (mainAt < 0 || i >= mainAt || r.type !== 'thank_you') return;
      problem(nums[i], 'kind', r.id, 'endings go below the "thank you" row (row ' + nums[mainAt] + '): an ending ends the survey, so ' +
        'partners who reach this row would never see the rows after it. Move it below the "thank you" row.');
    });
    var ri = has(firstOf, 'function_ratings') ? firstOf.function_ratings : -1;
    var di = has(firstOf, 'function_deep_dives') ? firstOf.function_deep_dives : -1;
    if (di >= 0 && rows[di].active !== false && (ri < 0 || rows[ri].active === false)) {
      problem(nums[di], 'kind', rows[di].id, 'the problem screens ask about the areas rated low, but there is no shown "area ratings" row, so nothing is ever rated. Add one above it.');
    } else if (di >= 0 && ri > di) {
      problem(nums[di], 'kind', rows[di].id, 'the problem screens must come after the area ratings (row ' + nums[ri] + '): they depend on those ratings. Move this row below it.');
    }
    Object.keys(live).forEach(function (h) {
      if (!has(tableCodes, h)) {
        problem(null, null, h.slice(1), 'The table has no row with the code "' + h.slice(1) + '", but partners already answered it in a real round, so ' +
          'it can never be removed (the dashboard compares rounds by its code). Put its row back; to stop asking it, write no in "show".' +
          outside(h.slice(1)));
      }
    });
    /* A question partners answered keeps its kind (review W8 finding 3): its answers under the same code would
       change meaning between rounds. The live kind: opts.liveKinds, else the draft's row with that code. */
    var liveKinds = isObj(o.liveKinds) ? o.liveKinds : {};
    rows.forEach(function (r, i) {
      if (!has(live, '#' + r.id) && !has(liveKinds, r.id)) return;
      var was = has(liveKinds, r.id) && trim(liveKinds[r.id]) ? trim(liveKinds[r.id]) : (has(currentAt, '#' + r.id) ? trim(currentAt['#' + r.id].type) : '');
      if (!was || was === r.type || !storesAnswer(was)) return;
      if (problems.some(function (p) { return p.row === nums[i] && p.column === 'kind'; })) return;   // already told (nps, support_gate)
      problem(nums[i], 'kind', r.id, 'partners have already answered it as a question of the kind "' + kindName({ id: r.id, type: was }) +
        '", so its kind can\'t change (the dashboard compares rounds by its code). Keep its kind, or write no in its show column and add ' +
        'the new question in a new row with a new code.');
    });
    liveOptions.forEach(function (lo) {
      if (!has(at, '#' + lo.question)) return;
      var r = rows[at['#' + lo.question]];
      if (arr(r.options).indexOf(lo.code) !== -1) return;   // checked whatever its kind is now
      problem(nums[at['#' + lo.question]], 'answers', r.id, 'the answer "' + lo.code + '" was already picked by partners in a real round, so it ' +
        'must stay (the dashboard compares rounds by its code). Put it back in "answers"; you can still change its words.');
    });
    current.forEach(function (r) {
      var id = trim(r.id);
      if (!id || has(tableCodes, '#' + id) || has(live, '#' + id)) return;
      var en = trim(englishOf(trim(r.text)));
      warn(null, null, id, 'The current questionnaire has a row "' + id + '" (' + (en ? '"' + shorten(en, 50) + '"' : kindName(r)) +
        ') that this table does not have: using the table removes it.' + outside(id));
    });

    // 7. The words: only what changes, every language filled (never translated here)
    /* Never machine-translate (review W8 finding 8): every non-English text the table makes new (there was no
       real one: none, empty or [TRANSLATE]) or changes (from a real one) is told, one warning per cell, with
       the old and new words, so a translation an AI made up never goes in unnoticed. */
    var told = {};        // '#' + row number + '|' + column -> { num, column, code, lang, items: [{ answer, old, given }] }
    var toldOrder = [];
    function sameWords(a, b) { return trim(a).replace(/\s+/g, ' ') === trim(b).replace(/\s+/g, ' '); }
    setOrder.forEach(function (h) {
      var st = sets[h];
      var old = stored(st.key);
      var next = old ? copy(old) : {};
      var en = has(st.values, 'en') ? st.values.en : str(old && old.en);
      if (!trim(en)) return;
      next.en = en;
      var codes = langs.slice();
      if (old) Object.keys(old).forEach(function (L) { if (L.charAt(0) !== '_' && codes.indexOf(L) === -1) codes.push(L); });
      var fromTable = isObj(st.how.given) ? st.how.given : st.values;    // the words the table itself gave
      var kept = [];
      codes.forEach(function (L) {
        if (L === 'en') return;
        var given = has(st.values, L) && !isTodo(st.values[L]) ? st.values[L] : null;
        var had = old && !isTodo(old[L]) ? str(old[L]) : null;
        if (given !== null) next[L] = given;
        else if (had !== null) next[L] = had;
        else next[L] = TODO_TAG + ' ' + en;
        if (had !== null && next[L] === had) kept.push(langName(L));
        if (given !== null && has(fromTable, L) && (had === null || !sameWords(had, given))) {
          var column = columnTitle((st.how.base || 'q') + ':' + L);
          var hc = '#' + st.num + '|' + column;
          if (!has(told, hc)) { told[hc] = { num: st.num, column: column, code: st.code, lang: L, items: [] }; toldOrder.push(hc); }
          told[hc].items.push({ answer: st.how.answer, old: had, given: given });
        }
      });
      var englishChanged = old && trim(old.en) && trim(old.en) !== trim(en);
      var notTranslated = kept.length ? ' The ' + list(kept) + ' did not change: check ' + (kept.length === 1 ? 'it' : 'them') +
        ' in Texts & translations (' + st.key + ').' : '';
      if (englishChanged && st.how.builtin) {
        // a built-in screen's words: partners see them, so the change itself is told
        warn(st.num, st.column, st.code, 'the English of a built-in screen changes: "' + shorten(old.en, 50) + '" -> "' + shorten(en, 50) +
          '". Partners see it, so check that this is what you want.' + notTranslated);
      } else if (englishChanged && kept.length) {
        warn(st.num, st.column, st.code, 'the English changed but the ' + list(kept) + ' did not: check ' + (kept.length === 1 ? 'it' : 'them') +
          ' in Texts & translations (' + st.key + ').');
      }
      if (!old || !same(next, old)) out.texts[st.key] = next;
    });
    toldOrder.forEach(function (hc) {
      var n = told[hc];
      var lang = langName(n.lang);
      var one = n.items.length === 1 && !n.items[0].answer ? n.items[0] : null;
      var parts = n.items.map(function (it) {
        return (it.answer ? it.answer + ': ' : '') + (it.old === null ? '"' + shorten(it.given, 40) + '" (new)' :
          '"' + shorten(it.old, 30) + '" -> "' + shorten(it.given, 30) + '"');
      });
      warn(n.num, n.column, n.code, (one ? (one.old === null ? 'new ' + lang + ' words: "' + shorten(one.given, 60) + '"' : 'the ' + lang +
        ' words change: "' + shorten(one.old, 40) + '" -> "' + shorten(one.given, 40) + '"') : 'the ' + lang + ' words of ' +
        (n.items.length === 1 ? 'an answer' : n.items.length + ' answers') + ' are new or change: ' + parts.join('; ')) +
        '. Keep them only if a person wrote them: the panel never translates, and an AI must not either.');
    });

    // 8. The route Publish would make, checked by the same checker Publish uses
    out.rows = rows;
    if (!problems.length && o.check !== false && PP.flowCheck && typeof PP.flowCheck.check === 'function') {
      var rowAt = {};
      rows.forEach(function (r, i) { if (r.active !== false && !has(rowAt, '#' + r.id)) rowAt['#' + r.id] = i; });
      var nameRow = function (i) {
        var r = rows[i];
        var key = has(FIXED_TEXT, r.type) ? '' : (r.type === 'thank_you' && !trim(r.text) ? 'thanks.title' : trim(r.text));
        var en = key ? trim(englishOf(key)) : '';
        return 'row ' + nums[i] + (en ? ' ("' + shorten(en, 50) + '")' : ' (' + r.id + ')');
      };
      try {
        var draft = {};
        Object.keys(s).forEach(function (k) { if (k !== 'flow') draft[k] = s[k]; });
        var made = panel.fromRows(rows, draft, { nameOf: function (r, i) { return nameRow(i); } });
        draft.flow = made.graph;
        var NOTE_COLUMN = { G5: 'then go to' };
        made.warnings.forEach(function (w) {
          // level "error" (G5: a route that runs on into another) and G2, G3, F1 block; level "warning" never does
          var hard = w.level === 'error' || (w.level !== 'warning' && /^(G2|G3|F1)$/.test(w.code));
          (hard ? problems : warnings).push({ row: typeof w.row === 'number' ? nums[w.row] : null, column: has(NOTE_COLUMN, w.code) ?
            NOTE_COLUMN[w.code] : null, code: w.node || null, message: tableWords(w.message) });
        });
        var rowOfNode = function (node) {
          var id = isObj(node) ? node.id : node;
          if (typeof id !== 'string') return -1;
          if (has(rowAt, '#' + id)) return rowAt['#' + id];
          var g = arr(made.graph.nodes).filter(function (n) { return isObj(n) && n.id === id && n.type === 'group' && isObj(n.body); })[0];
          return g && has(rowAt, '#' + g.body.start) ? rowAt['#' + g.body.start] : -1;
        };
        // the thank-you screen the form adds when the rows end without one: named as such, never by its id
        var added = arr(made.graph.nodes).filter(function (n) { return isObj(n) && n.type === 'thank_you' && !has(rowAt, '#' + n.id); })
          .map(function (n) { return n.id; });
        var res = PP.flowCheck.check(draft, null, { surface: 'panel', hiddenCodes: hiddenCodesOf(rows, s),
          nameOf: function (node) {
            var i = rowOfNode(node);
            if (i >= 0) return nameRow(i);
            return isObj(node) && added.indexOf(node.id) !== -1 ? 'the thank-you screen the form adds at the end' : '';
          } });
        var SITE = { show_if: 'show only if', where: 'ask for', jump: 'jumps', next: 'then go to' };
        arr(res.findings).forEach(function (f) {
          if (!isObj(f) || f.level === 'info' || f.code === 'T1') return;
          var i = rowOfNode(f.node);
          var message = f.message;
          // a language or what-changed row's own rule is the 2nd part of the rule the form tests (its skip comes first)
          if (i >= 0 && has(SKIP_OF, rows[i].type) && trim(rows[i].skip_if) === SKIP_OF[rows[i].type] && rows[i].show_if) {
            message = message.split('its rule ("show only if") > all > rule 2').join('its rule ("show only if")');
          }
          (f.level === 'error' ? problems : warnings).push({ row: i >= 0 ? nums[i] : null, column: has(SITE, f.site) ? SITE[f.site] : null,
            code: i >= 0 ? rows[i].id : (f.node || null), message: tableWords(message) });
        });
        out.survey = draft;
      } catch (e) {
        warnings.push({ row: null, column: null, code: null, message: 'The route could not be checked here (' + ((e && e.message) || e) +
          '). Publish checks it again.' });
      }
    }
    // in the table's order: what is about the whole table first, then row by row
    function byRow(listIn) {
      var tagged = listIn.map(function (n, i) { return { n: n, i: i }; });
      tagged.sort(function (a, b) { return ((a.n.row || 0) - (b.n.row || 0)) || (a.i - b.i); });
      return tagged.map(function (x) { return x.n; });
    }
    out.problems = byRow(problems);
    out.warnings = byRow(warnings);
    out.ok = !problems.length;
    return out;
  };

  /* ===========================================================================
     toTable(rows, texts, survey, opts) -> the route as the table, header first
     (opts.format: "tsv" (default: pastes into Excel and Google Sheets),
     "csv" or "markdown"). Every row is written, hidden ones too (show = no).
     =========================================================================== */
  function tableColumns(langs) {
    var hi = langs.indexOf('hi') !== -1;
    return ['code', 'kind', 'q:en'].concat(hi ? ['q:hi'] : [], ['a:en'], hi ? ['a:hi'] : [], ['m:en'], hi ? ['m:hi'] : [],
      ['required', 'show_if', 'next', 'jumps', 'repeat', 'show']);
  }
  function tableText(lines, format) {
    if (format === 'csv') {
      return lines.map(function (cells) {
        return cells.map(function (v) {
          var x = str(v);
          return /[",\n\r]/.test(x) || /^\s|\s$/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
        }).join(',');
      }).join('\r\n');
    }
    if (format === 'markdown') {
      var md = lines.map(function (cells) {
        return '| ' + cells.map(function (v) { return str(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }).join(' | ') + ' |';
      });
      md.splice(1, 0, '|' + lines[0].map(function () { return ' --- '; }).join('|') + '|');
      return md.join('\n');
    }
    return lines.map(function (cells) {
      return cells.map(function (v) {
        var x = str(v);
        return /[\t\n\r]/.test(x) || x.charAt(0) === '"' ? '"' + x.replace(/"/g, '""') + '"' : x;
      }).join('\t');
    }).join('\n');
  }

  panel.toTable = function (rows, texts, survey, opts) {
    var o = isObj(opts) ? opts : {};
    var s = isObj(survey) ? survey : {};
    var known = isObj(texts) ? texts : {};
    var langs = languagesOf(s);
    var cols = tableColumns(langs);
    function words2(key, L) {
      if (!key || !has(known, key) || !isObj(known[key])) return '';
      var v = str(known[key][L]);
      return L === 'en' || !isTodo(v) ? v : '';
    }
    var lines = [cols.map(columnTitle)];
    arr(rows).forEach(function (r) {
      if (!isObj(r)) return;
      var type = str(r.type);
      var standardThanks = type === 'thank_you' && !trim(r.text) && !trim(r.body);
      var qKey = has(FIXED_TEXT, type) ? FIXED_TEXT[type] : (standardThanks ? 'thanks.title' : trim(r.text));
      var mKey = standardThanks ? 'thanks.body' : trim(r.body);
      var options = rowFields(type).indexOf('options') !== -1 ? arr(r.options) : [];
      var rule = panel.ruleText(r.show_if);
      if (has(SKIP_OF, type) && trim(r.skip_if) !== SKIP_OF[type] && !rule) rule = 'always';
      var cell = {
        code: str(r.id),
        kind: kindName(r),
        'q:en': words2(qKey, 'en'),
        'q:hi': words2(qKey, 'hi'),
        'a:en': options.map(function (oc) { return oc + ': ' + answerText(words2('choice.' + r.id + '.' + oc, 'en'), true); }).join('; '),
        'a:hi': options.filter(function (oc) { return words2('choice.' + r.id + '.' + oc, 'hi'); })
          .map(function (oc) { return oc + ': ' + answerText(words2('choice.' + r.id + '.' + oc, 'hi'), false); }).join('; '),
        'm:en': words2(mKey, 'en'),
        'm:hi': words2(mKey, 'hi'),
        required: r.required === true ? 'yes' : (r.required === false ? 'no' : ''),
        show_if: rule,
        next: str(r.next),
        jumps: panel.jumpsText(r.jumps),
        repeat: r.repeat === 'each_area' ? 'each area' : (r.repeat === 'each_low_area' ? 'each area rated low' : str(r.repeat)),
        show: r.active === false ? 'no' : 'yes'
      };
      lines.push(cols.map(function (c) { return cell[c]; }));
    });
    return tableText(lines, o.format === 'csv' || o.format === 'markdown' ? o.format : 'tsv');
  };

  /* templateCsv(survey, strings, opts) -> "Download the Excel template": the
     header and today's route (opts.rows, else the survey's own route) as a
     CSV that Excel opens with the Hindi intact (it starts with a BOM). */
  panel.templateCsv = function (survey, strings, opts) {
    var s = isObj(survey) ? survey : {};
    return '\ufeff' + panel.toTable(routeRows(s, opts), strings, s, { format: 'csv' }) + '\r\n';
  };

  /* ===========================================================================
     aiInstruction(survey, strings, opts) -> the text the owner pastes into
     Claude or ChatGPT before his notes, his Excel or a flowchart picture:
     what the table is, every column and kind, the rule language with
     examples, today's areas, problem codes, support questions and languages,
     "copy only the Hindi I give you, never translate", "output only one
     table, then a 'Left out:' line", "leave empty cells empty", "exactly one
     thank-you row; every route below it ends", "answers with ';' in double
     quotes", what "always" does on the language and what-changed rows (30
     Oct 2026), a short example and today's route (opts.rows, else the
     survey's). opts.rounds: the round ids (the example rule uses the first).
     =========================================================================== */
  panel.EXAMPLE_TABLE = [
    ['language', 'language', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['nps', 'nps', 'How likely are you to recommend Valmo to another DC owner?', '', '', '', '', '', 'yes', '', '', 'if nps <= 3 go to why_low', '', 'yes'],
    ['fn_ratings', 'area ratings', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['fn_deep_dives', 'problem screens', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['callback', 'yes/no', 'Should someone from Valmo call you about this?', '', '', '', '', '', 'no', '', '', '', 'each area rated low', 'yes'],
    ['support_gate', 'support question', 'In the last 30 days, did you contact Valmo support?', '', '', '', '', '', 'yes', '', '', '', '', 'yes'],
    ['support', 'support ratings', '', '', '', '', '', '', '', 'support_gate = yes', '', '', '', 'yes'],
    ['contact_way', 'pick one', 'How did you contact support?', '', 'phone: Phone call; app: In the app; visit: A visit', '', '', '', 'yes',
      'support_gate = yes', '', '', '', 'yes'],
    ['one_fix', 'voice/typing', 'If Valmo fixes one thing, what should it be?', '', '', '', '', '', 'no', '', '', '', '', 'yes'],
    ['thanks', 'thank you', '', '', '', '', '', '', '', '', '', '', '', 'yes'],
    ['why_low', 'voice/typing', 'What went wrong for you?', '', '', '', '', '', 'no', '', '', '', '', 'yes'],
    ['low_end', 'ending', 'Thank you for telling us', '', '', '', 'Our team will look at what you told us.', '', '', '', '', '', '', 'yes']
  ];

  panel.aiInstruction = function (survey, strings, opts) {
    var s = isObj(survey) ? survey : {};
    var known = isObj(strings) ? strings : {};
    var langs = languagesOf(s);
    var hi = langs.indexOf('hi') !== -1;
    var areas = arr(s.functions).filter(function (f) { return isObj(f) && trim(f.id); });
    var items = supportItemsOf(s);
    // the questionnaire's round ids (opts.rounds, else the survey's own list): the example rule uses the first
    var rounds = arr(isObj(opts) && Array.isArray(opts.rounds) ? opts.rounds : s.rounds)
      .map(function (x) { return trim(isObj(x) ? x.id : x); }).filter(Boolean);
    function en(key) { return has(known, key) && isObj(known[key]) ? trim(known[key].en) : ''; }
    function named(code, key) { var e = en(key); return e ? code + ' (' + e + ')' : code; }
    var header = tableColumns(langs).map(columnTitle);
    var L = [];
    L.push('I am building the route of a short phone survey for Valmo delivery-centre (DC) partners. After this message I will ' +
      'give you my notes, an Excel sheet or a picture of a flowchart. Turn them into ONE table in the exact format below. ' +
      'I will paste your table into our survey\'s control panel ("Paste a route"), which checks it.');
    L.push('');
    L.push('HOW TO ANSWER');
    L.push('1. Output only the table: ONE Markdown table with this header row (plus the optional columns described below, ' +
      'only when needed), and nothing before it. Right after the table write one line that starts with "Left out:" and ' +
      'names anything in my notes that did not fit this format (or "Left out: nothing"). Write nothing else:');
    L.push('   | ' + header.join(' | ') + ' |');
    L.push('2. One row per screen, in the order partners see them. Exactly one row has the kind "thank you": the main ' +
      'end, where the main route ends. Every other end is an "ending" row below it. Rows below the "thank you" row are ' +
      'other routes: partners reach them only through a jump. Each such route must end: its last row needs "then go ' +
      'to" (its ending, or thanks), unless its own ending row comes right after it.');
    L.push('3. Use only the kinds, columns and rule words described here. Do not invent questions, answers or rules that ' +
      'are not in my notes. If something in my notes does not fit this format, leave it out and name it in the ' +
      '"Left out:" line.');
    L.push('4. Codes: small letters a-z, digits and _ only, starting with a letter, at most 60 characters (for example ' +
      'payout_speed). Every row has its own code. Keep the code of every question that is already in the current route ' +
      '(at the end): answers are saved under it. Make a short new code for a new question.');
    L.push('5. Languages: write every question, answer and message in English.' + (hi ? ' Fill the Hindi columns ONLY with ' +
      'Hindi that I give you, copied exactly as I wrote it. Never translate anything yourself and never add other ' +
      'languages: when I give no Hindi for a text, leave its Hindi cell empty (a person will translate it later).' :
      ' Never translate anything yourself and never add other languages.'));
    L.push('6. Never leave out the rows nps, support_gate and the first "thank you": the panel refuses a route without ' +
      'them. To stop asking a question, keep its row and write no in "show".');
    L.push('7. From a flowchart picture: every box that partners see is a row, in the order the arrows go. An arrow that ' +
      'depends on an answer ("if the score is 9 or more") is a jump on the row it leaves; a box that only some partners ' +
      'see can instead get a "show only if" rule. A route that ends somewhere else gets its own "ending" row.');
    L.push('8. Leave a cell completely empty when there is nothing to write in it. Never fill it with -, \u2014, N/A, NA or TBD.');
    L.push('');
    L.push('THE COLUMNS');
    L.push('- code: the row\'s permanent code (rule 4).');
    L.push('- kind: what the row is (see THE KINDS).');
    L.push('- question (English): the question as partners read it; for an "ending", its title. On the built-in rows ' +
      '(language, what changed, area ratings, problem screens, support ratings, thank you) leave it empty to keep ' +
      'today\'s words.');
    if (hi) L.push('- question (Hindi): only Hindi I gave you (rule 5).');
    L.push('- answers: only for "pick one" and "pick several": each answer as code: English words, separated by ; (for example: phone: Phone ' +
      'call; app: In the app). When an answer\'s words contain ";", put them in double quotes (for example: always: ' +
      '"Yes; always").');
    if (hi) L.push('- answers (Hindi): the same answers in Hindi, only if I gave the Hindi (for example: phone: <my Hindi>; app: <my Hindi>).');
    L.push('- message (English)' + (hi ? ', message (Hindi)' : '') + ': the longer text of an "info card" or an "ending".');
    L.push('- required: yes (partners must answer) or no (they may skip); empty = the usual for that kind.');
    L.push('- show only if: a rule (see THE RULES): the row is shown only when it is true. Empty = everyone sees it, except ' +
      'that the language and what changed rows keep their usual skip (see THE KINDS).');
    L.push('- then go to: the code of the row to go to after this one: a later row, or an ending. Empty = the next row.');
    L.push('- jumps: exceptions, checked first, in order: if <rule> go to <code>. Separate several with ; (for example: if ' +
      'nps >= 9 go to support_gate; if nps <= 3 go to why_low). They may go to a later row or to an ending.');
    L.push('- ask for: empty (once), each area, or each area rated low: the question is then asked once per area, with the ' +
      'area\'s name on top. Only for ' + repeatableKinds() + '.');
    L.push('- show: yes, or no to hide the row (a hidden row keeps its code).');
    L.push('- Optional, only when my notes give these words for a "0 to 10" question: left end, right end (the words ' +
      'under 0 and under 10) and hint (a line under the buttons)' + (hi ? ', each also with (Hindi) if I gave the Hindi' : '') +
      '. Without them the standard words are used ("Not at all likely" / "Extremely likely").');
    L.push('');
    L.push('THE KINDS');
    L.push('Built in (at most one of each; keep these codes):');
    L.push('- language (code language): the language buttons; when there is one, it is the first row. Skipped when the ' +
      'link already says the language. Write always in its "show only if" to show the buttons even then; left empty, it ' +
      'keeps that skip.');
    L.push('- what changed (code whats_changed): a card about what Valmo changed since the last round. Skipped when there is ' +
      'nothing new. Write always in its "show only if" to show the card even then (partners see only its title); left ' +
      'empty, it keeps that skip.');
    L.push('- nps (code nps): the headline question from 0 to 10 ("How likely are you to recommend Valmo to another DC owner?").');
    L.push('- area ratings (code fn_ratings): one screen of five faces for each area (the areas are listed below).');
    L.push('- problem screens (code fn_deep_dives): "What is the main problem?" for each area rated low, with that area\'s ' +
      'problems (listed below). It comes after the area ratings.');
    L.push('- support question (code support_gate): the yes/no question "Did you contact Valmo support in the last 30 days?".');
    L.push('- support ratings (code support): the support questions (listed below) on one screen. Usually: show only if ' +
      'support_gate = yes.');
    L.push('- thank you (code thanks): sends the answers and says thank you. Exactly one "thank you" row: it ends the main route.');
    L.push('- ending: another thank-you screen, with its own title (question column) and message, for another route. ' +
      'Endings go below the "thank you" row.');
    L.push('Questions you can add (as many as needed, each with its own code):');
    L.push('- 0 to 10: eleven buttons from 0 to 10.');
    L.push('- faces: five faces, from 1 (very bad) to 5 (very good).');
    L.push('- yes/no: two buttons, Yes and No.');
    L.push('- pick one: a list of answers; the partner taps one (fill "answers").');
    L.push('- pick several: a list of answers; the partner ticks one or more (fill "answers"). Never write "multiple choice", ' +
      '"multi choice" or "MCQ": write "pick one" or "pick several".');
    L.push('- voice/typing: the partner records a voice note or types an answer.');
    L.push('- info card: a title (question column) and an optional message, with nothing to answer.');
    var added = kindNames().filter(function (n) { var k = kindByWord(n); return k && k.added; });
    if (added.length) L.push('- also: ' + added.join(', ') + '.');
    L.push('');
    L.push('THE RULES (for "show only if" and "jumps")');
    L.push('- A test is: <answer> <comparison> <value>. The comparisons: = (is), != (is not), <= (at most), >= (at least), ' +
      'in (a, b) (one of), answered, not answered.');
    L.push('- Join tests with "and" (all must be true) or "or" (one is enough). To use both, add brackets: ' +
      '(nps <= 6 or support_gate = no) and language = hi');
    L.push('- A rule may test only answers given BEFORE its row (a jump may also test its own row\'s answer), plus the ' +
      'partner\'s language and the round.');
    L.push('- What a rule can test:');
    L.push('  nps: 0 to 10. A "0 to 10" question: its code, 0 to 10. A "faces" question: its code, 1 to 5.');
    L.push('  A yes/no question (like support_gate): yes or no. A "pick one" question: one of its answer codes.');
    L.push('  A "pick several" question: one of its answer codes; "= x" means x is one of the answers ticked, "!= x" that it is not.');
    L.push('  A voice/typing question: only answered or not answered.');
    L.push('  An area\'s rating: fn_rating:<area code>, 1 to 5 (or na = "I don\'t handle this").');
    L.push('  The problem picked for an area: fn_deep_dive:<area code>, one of that area\'s problem codes (or other).');
    L.push('  A support rating: support:<support code>, 1 to 5.');
    L.push('  A question asked for each area: <its code>:<area code>.');
    L.push('  language: the partner\'s language code. round: the round\'s id, written exactly' + (rounds.length ? ' (today: ' +
      rounds.join(', ') + ')' : '') + '.');
    L.push('- Examples:');
    ['nps <= 6', 'nps >= 9', 'support_gate = yes', 'fn_rating:' + (areas[0] ? areas[0].id : 'payments') + ' <= 2',
      'fn_rating:' + (areas[0] ? areas[0].id : 'losses') + ' <= 2 or fn_rating:' + (areas[1] ? areas[1].id : 'payments') + ' <= 2',
      'one_fix answered', 'language = hi', 'round = ' + (rounds[0] || '<your round id>')].forEach(function (x) { L.push('  ' + x); });
    L.push('');
    L.push('TODAY\'S AREAS AND THEIR PROBLEM CODES (use these codes exactly; "other" is always there)');
    if (!areas.length) L.push('- (none yet)');
    areas.forEach(function (f) {
      var id = trim(f.id);
      L.push('- ' + named(id, 'fn.' + id + '.name') + ': ' + arr(f.issues).map(function (c) {
        var code = trim(isObj(c) ? c.code || c.id : c);
        return named(code, 'issue.' + id + '.' + code);
      }).concat(['other']).join(', '));
    });
    L.push('TODAY\'S SUPPORT QUESTIONS: ' + (items.length ? items.map(function (c) { return named(c, 'support.' + c); }).join(', ') : '(none yet)'));
    L.push('LANGUAGES: ' + langs.map(function (c) { return c + ' (' + langName(c) + ')'; }).join(', ') + '. Only English' +
      (hi ? ', and Hindi I gave you,' : '') + ' go into the table.');
    L.push('');
    L.push('A SHORT EXAMPLE (made up; it shows the format, not my questions)');
    var cols = tableColumns(langs);
    var full = tableColumns(['en', 'hi']);
    var ex = [header].concat(panel.EXAMPLE_TABLE.map(function (r) {
      return cols.map(function (c) { return r[full.indexOf(c)]; });
    }));
    L.push(tableText(ex, 'markdown'));
    L.push('');
    L.push('THE CURRENT ROUTE (when I ask for changes, start from it and keep its codes)');
    L.push(panel.toTable(routeRows(s, opts), known, s, { format: 'markdown' }));
    return L.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) {
    if (!PP.flow && typeof require === 'function') require('./flow.js');
    module.exports = panel;
  }

}(typeof window !== 'undefined' ? window : globalThis));
