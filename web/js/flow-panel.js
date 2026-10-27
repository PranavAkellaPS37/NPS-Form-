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
       PP.types: the six ordinary questions of web/js/flow.js, 0-10, faces,
       yes/no, pick one, voice/typing and information card, plus any kind
       added in web/js/types/ that says so). Anything else is ignored with a
       warning (code F1), as are jumps that can't be read.
     - An ending (thank-you screen) never goes anywhere: its next and jumps
       are ignored (code G4).
     - In "straight after each low rating" mode the problem-screens row is
       not used at all; a "next", jumps or repeat left on it change nothing
       for partners, so that warning (code F1) carries level "warning" and
       says to clear them.
     Warnings are { code, node, row, message } (plus level: "warning" when
     the problem changes nothing for partners): row = the row's place in the
     list (0 = first), message = plain English naming the question the way
     the panel does (opts.nameOf(row, index); default "question N").

   READS / WRITES: only what it is given. It needs PP.flow (web/js/flow.js)
   loaded first (under Node it loads ./flow.js itself).

   TEST (Terminal, project folder): node tests/flow/panel_rows_test.js
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
  /* Their names as the control panel lists them, in its "Add a question"
     order: "0 to 10 question, Faces question (1 to 5), ...". */
  function repeatableNames() {
    var T = PP.types;
    var kinds = [];
    (T && typeof T.list === 'function' ? T.list() : []).forEach(function (type, i) {
      if (!repeatable(type)) return;
      var d = T.get(type);
      var label = trim(d.row.label) || trim(d.label) || type;
      kinds.push({ label: label, order: typeof d.row.order === 'number' ? d.row.order : 1e6, i: i });
    });
    kinds.sort(function (a, b) { return (a.order - b.order) || (a.i - b.i); });
    return kinds.map(function (k) { return k.label; }).join(', ');
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
    /* The main ending in a sentence: 'the main thank-you screen (question 9)'. */
    function mainName(at) { return at < 0 ? 'the thank-you screen the form adds at the end' : 'the main thank-you screen (question ' + (at + 1) + ')'; }
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
          'Pick the question again in the control panel. (Its code is ' + codeOf(i) + '; it goes to "' + code + '".)');
        return undefined;
      }
      if (r.problem === 'earlier') {
        warn('G3', i, capital(name(i)) + ': ' + what + ' goes back to ' + name(r.at) + '. Arrows may only go forward ' +
          '(to a later question or an ending), so it is left out. (Its code is ' + codeOf(i) + '; it goes to "' + code + '".)');
        return undefined;
      }
      if (r.via.length && r.ending !== undefined) {
        // a hidden ending still ends the route: at the main thank-you screen, never in the next route
        var first = r.via[0];
        var whyEnd = first === r.ending ? 'an ending that is hidden' : 'which is hidden, and the next screen after it is ' +
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
          warn('C2', i, capital(name(i)) + ': ' + what + ' goes to ' + name(hidden) + ', ' + why + ', and there is no ' +
            'question after it, so it is left out. (Its code is ' + codeOf(i) + '; that question\'s code is ' + codeOf(hidden) + '.)');
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
        mainName(f.at) + ' instead of going on to the screens below it. (Its code is ' +
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
          'rating), so this row\'s "usually go to", jumps and "ask for each area" are not used. They change nothing ' +
          'for partners: clear them (Edit this question > Clear them), or choose "After all the area ratings". ' +
          '(Its code is ' + codeOf(i) + '.)' });
        return;
      }
      if (row.type === 'thank_you') {
        if (trim(row.text)) node.text = trim(row.text);
        if (trim(row.body)) node.body = trim(row.body);
      }
      var j = jumpsOf(row);
      if (j.unreadable) {
        warn('F1', i, capital(name(i)) + ': its jumps could not be read, so they are left out. Build them again in ' +
          'the control panel. (Its code is ' + codeOf(i) + '; in the Screens tab its jumps column says ' +
          JSON.stringify(j.unreadable.slice(0, 60)) + '.)');
      }
      if (isEnding(node)) {
        if (trim(row.next) || j.list.length) {
          warn('G4', i, capital(name(i)) + ' is an ending: partners stop there, so its "next" and jumps are not ' +
            'used. (Its code is ' + codeOf(i) + '.)');
        }
      } else {
        var dflt;
        if (trim(row.next)) {
          var to = arrow(trim(row.next), i, 'its "usually go to" arrow');
          if (to !== undefined) dflt = to;
        }
        if (dflt === undefined) dflt = typeof node.next === 'string' ? fallThrough(i, node) : node.next;
        var list = [];
        j.list.forEach(function (jump, k) {
          var what = 'jump ' + (k + 1);
          if (!isObj(jump) || !isObj(jump.when) || !trim(jump['goto'])) {
            warn('F1', i, capital(name(i)) + ': ' + what + ' has no rule or no question to go to, so it is left out. ' +
              'Build it again in the control panel. (Its code is ' + codeOf(i) + '.)');
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
          warn('F1', i, capital(name(i)) + ': "repeat" says something the form does not know, so it is asked once. ' +
            'Choose: once, for each area, or for each area rated low. (Its code is ' + codeOf(i) + '; in the Screens ' +
            'tab, repeat must be empty, each_area or each_low_area, not "' + repeat + '".)');
        } else if (!repeatable(row.type)) {
          var kinds = repeatableNames();
          warn('F1', i, capital(name(i)) + ': only some kinds of question' + (kinds ? ' (' + kinds + ')' : '') +
            ' can be asked once per area, so "repeat" is not used here. (Its code is ' +
            codeOf(i) + '; its type is "' + row.type + '".)');
        } else {
          node.store_as = trim(row.id) + ':{area}';
          node.label = 'fn.{area}.name';
          node.repeat_for = repeat === 'each_low_area' ? { each: 'area', 'in': 'areas', where: copy(LOW) } : { each: 'area', 'in': 'areas' };
        }
      }
    });
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

  if (typeof module !== 'undefined' && module.exports) {
    if (!PP.flow && typeof require === 'function') require('./flow.js');
    module.exports = panel;
  }

}(typeof window !== 'undefined' ? window : globalThis));
