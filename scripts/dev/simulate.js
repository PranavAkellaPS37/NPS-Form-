/* =============================================================================
   scripts/dev/simulate.js: the survey form's developer drawer (?simulate=1).

   WHAT IT IS FOR
   While you test the questionnaire on this Mac, it shows what the form's flow
   engine (web/js/flow.js) decides, next to the form itself:
     1. Route ahead: every screen this partner's answers lead to, in order,
        with the answer given so far, "Next blocked" where an answer is still
        missing, the screen on show, and a "Go" button to jump to any screen of
        the route (endings excepted: reaching an ending sends the answers, so
        use Next for that).
     2. Jumps taken: each arrow with a rule ("when") that sent the route
        somewhere other than the usual next screen, and the rule.
     3. Skipped screens, and why: "only shown if support_gate == "yes"
        (now: "no")", "left out for payments: only if fn_rating:payments <= 3
        (now: 5)", or "not reached: no arrow on this route leads here" (for
        example the screens a jump went past, or an ending not taken).
     4. The facts rules can test: the language, whether the link carried
        ?lang=, the number of "What changed" items, the round.
     5. Paste answers: set many answers at once, then see the route change.
   It uses the page's own flow engine (PP.flow), so it can never disagree with
   what partners would see. The reasons in section 3 are worked out from the
   screens' own rules (show_if, the loops' "where") with that same engine;
   a jump on a group's own arrow is not listed in section 2.

   WHERE IT RUNS: ONLY IN TEST (MOCK) MODE
   The form (web/js/app.js, loadSimulator) loads this file only when the link
   is in test mode AND carries &simulate=1. It comes from the local test
   server (scripts/mock_server.py serves it at /dev/simulate.js). It is not in
   web/, so it is never published to GitHub Pages: partners download nothing
   extra and live links never load it.

   HOW TO OPEN IT
     1. In Terminal, in the project folder:  python3 scripts/mock_server.py
     2. Open the link it prints under "developer drawer" (any printed test
        link with &simulate=1 added works too).
     3. Tap "Simulator: route ahead" in the yellow strip at the top.

   THE "PASTE ANSWERS" BOX accepts either
     - one answer per line, like the command line's --set:
           nps=9
           support_gate=no
           fn_rating:payments=2
           fn_deep_dive:payments=other
           fn_deep_dive:payments=text:the truck comes at 2 am
       Numbers become numbers; "text:..." is typed text (a voice note can't be
       pasted: record one on the screen); "key=" with nothing after it
       removes that answer, and "key=text:" removes the typed text;
     - or a JSON object: {"nps": 9, "support_gate": "no", "one_fix": "text:call me"}
       (null removes an answer).
   "Copy current answers" fills the box with what is saved now (one per line).

   READS / WRITES
     Reads: the questionnaire in use and the answers saved on this phone,
     through PP.dev (set up by web/js/app.js in test mode only: config(),
     state(), context(), steps(), current(), changed(), go(id)), and PP.flow.
     Writes: nothing until you press Apply or Go. Apply changes the answers
     saved on this phone (in this browser's storage), as tapping would, then
     calls changed() so the form saves and redraws; Go shows another screen.
     The drawer itself sends nothing (as with a real tap, the first change of
     answers sends the form's usual "started" ping).

   ES5 only (old Android Chrome can open test links too): no let, const,
   arrows, template strings, ?. or ??. Text is only ever set as text (PP.h),
   never as HTML.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP;
  if (!PP || !PP.dev || !PP.flow || !PP.h || PP.simulator) return;
  var dev = PP.dev;
  var flow = PP.flow;
  var h = PP.h;
  var POLL_MS = 800;   // while open, look for new answers or a new screen this often

  var ui = {};         // the drawer's elements
  var timer = null;    // the refresh while the drawer is open
  var lastSeen = '';   // what the drawer shows now (it is redrawn only when this changes)

  PP.simulator = { open: openDrawer, close: closeDrawer, refresh: function () { refresh(true); } };

  addStyle();
  addToggle();

  /* ---- small helpers ------------------------------------------------------ */
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function withVar(vars, name, value) {
    var out = {};
    Object.keys(vars || {}).forEach(function (k) { out[k] = vars[k]; });
    out[name] = value;
    return out;
  }

  function withoutVar(vars, name) {
    var out = {};
    Object.keys(vars || {}).forEach(function (k) { if (k !== name) out[k] = vars[k]; });
    return out;
  }

  /* A value as short text, e.g. 9, "no", "fn_rating:payments". */
  function short(value) {
    var text;
    try { text = JSON.stringify(value); } catch (e) { text = String(value); }
    if (text === undefined) text = String(value);
    return text.length > 48 ? text.slice(0, 45) + '...' : text;
  }

  function itemName(item) { return isObj(item) ? String(item.id) : String(item); }

  /* The facts a rule can test, from what app.js gives the engine (the same
     mapping as PP.flow.buildSteps, docs/flow-engine.md section 4.4). */
  function factsOf(ctx) {
    ctx = ctx || {};
    return {
      lang: ctx.lang,
      lang_in_url: Boolean(ctx.langInUrl),
      whats_changed_count: Number(ctx.whatsChangedCount) || 0,
      round: ctx.round
    };
  }

  /* What rules on the route can see: the answers of the screens on it (typed
     text or a voice note counts as true), as docs/flow-engine.md 2.3 says. */
  function scopeOf(graph, survey, steps, state) {
    var scope = {};
    var answers = state.answers || {};
    steps.forEach(function (step) {
      flow.keysOf(graph, survey, step.node, step.vars).forEach(function (key) {
        if (answers[key] !== undefined) scope[key] = answers[key];
        else if (flow.hasDetail(state, key)) scope[key] = true;
      });
    });
    return scope;
  }

  /* ---- a rule, in words ------------------------------------------------------ */
  var TESTS = [['equals', '=='], ['not_equals', '!='], ['at_most', '<='], ['at_least', '>='], ['in', 'in']];

  function shownValue(value, vars) {
    if (Array.isArray(value)) return '[' + value.map(function (x) { return shownValue(x, vars); }).join(', ') + ']';
    if (isObj(value) && 'var' in value) return value['var'] + ' = ' + flow.fill('{' + value['var'] + '}', vars);
    return short(value);
  }

  /* e.g. 'support_gate == "yes" (now: "no")' */
  function describe(cond, vars, scope, facts) {
    if (!isObj(cond)) return 'always';
    var part = function (c) { return describe(c, vars, scope, facts); };
    if (Array.isArray(cond.all)) return '(' + cond.all.map(part).join(' and ') + ')';
    if (Array.isArray(cond.any)) return '(' + cond.any.map(part).join(' or ') + ')';
    if (isObj(cond.not)) return 'not ' + part(cond.not);
    var subject;
    var now;
    if ('fact' in cond) {
      subject = String(cond.fact);
      now = facts ? facts[cond.fact] : undefined;
    } else if ('var' in cond) {
      subject = String(cond['var']);
      now = flow.fill('{' + cond['var'] + '}', vars);
    } else {
      subject = String(flow.fill(cond.answer, vars));
      now = scope ? scope[subject] : undefined;
    }
    var test = null;
    for (var i = 0; i < TESTS.length && test === null; i++) {
      if (TESTS[i][0] in cond) test = TESTS[i][1] + ' ' + shownValue(cond[TESTS[i][0]], vars);
    }
    if (test === null && 'answered' in cond) test = cond.answered ? 'exists' : 'does not exist';
    if (test === null) test = '(unknown test: always true)';
    return subject + ' ' + test + ' (now: ' + (now === undefined ? 'nothing on this route' : short(now)) + ')';
  }

  /* ---- what the engine decided, explained ------------------------------------ */

  /* Arrows with a rule that sent the route elsewhere: [{from, to, why}]. */
  function jumpsOf(steps, scope, facts) {
    var out = [];
    for (var i = 0; i + 1 < steps.length; i++) {
      var node = steps[i].node || {};
      if (!Array.isArray(node.next) || steps[i + 1].node === node) continue; // another round of the same loop
      // A repeated screen follows its arrow once, after the loop, without its loop item.
      var vars = isObj(node.repeat_for) ? withoutVar(steps[i].vars, node.repeat_for.each) : steps[i].vars;
      for (var j = 0; j < node.next.length; j++) {
        var arrow = node.next[j];
        if (!isObj(arrow) || 'default' in arrow) break;
        if (flow.evalCondition(arrow.when, scope, { facts: facts, vars: vars })) {
          out.push({ from: steps[i].id, to: String(arrow['goto']), why: describe(arrow.when, vars, scope, facts) });
          break;
        }
      }
    }
    return out;
  }

  /* Every screen of the questionnaire that is not on the route, and why. */
  function skippedOf(graph, survey, steps, scope, facts) {
    var onRoute = {};
    steps.forEach(function (step) { onRoute[step.id] = true; });
    var out = [];

    function visit(nodes, vars, outerReason) {
      (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
        if (!isObj(node) || !node.id) return;
        // show_if: tested once, before any loop, without the node's own loop item
        var hidden = outerReason ||
          (node.show_if && !flow.evalCondition(node.show_if, scope, { facts: facts, vars: vars }) ?
            'only shown if ' + describe(node.show_if, vars, scope, facts) : null);
        var rf = isObj(node.repeat_for) ? node.repeat_for : null;
        var items = rf ? flow.items(graph, survey, rf['in']) : [undefined];
        if (rf && !items.length) {
          out.push({ id: node.id, reason: hidden || 'repeats over "' + rf['in'] + '", which has no items' });
          return;
        }
        items.forEach(function (item) {
          var v = rf ? withVar(vars, rf.each, item) : vars;
          var reason = hidden;
          if (!reason && rf && rf.where && !flow.evalCondition(rf.where, scope, { facts: facts, vars: v })) {
            reason = 'left out for ' + itemName(item) + ': only if ' + describe(rf.where, v, scope, facts);
          }
          if (node.type === 'group') {
            visit(isObj(node.body) ? node.body.nodes : [], v, reason ? 'group ' + node.id + ': ' + reason : null);
            return;
          }
          var id = flow.fill(node.store_as || node.id, v);
          if (onRoute[id]) return;
          out.push({ id: String(id), reason: reason || 'not reached: no arrow on this route leads here' });
        });
      });
    }

    visit(graph.nodes, {}, null);
    return out;
  }

  /* A route step's answer so far, and whether Next is blocked there. */
  function stepNote(step, state, survey) {
    if (flow.isEnd(step)) return { cls: 'sim-muted', text: 'ending: reaching it sends the answers' };
    var parts = [];
    var answers = state.answers || {};
    if (answers[step.id] !== undefined) parts.push('= ' + short(answers[step.id]));
    if (flow.hasDetail(state, step.id)) parts.push(state.audio && state.audio[step.id] ? 'voice note' : 'typed text');
    var rows = (step.keys && step.keys.rows) || [];
    if (rows.length) {
      var done = rows.filter(function (r) { return answers[r.key] !== undefined; }).length;
      parts.push(done + ' of ' + rows.length + ' rows');
    }
    var blocked = !flow.canProceed(step, state, survey);
    if (blocked) parts.push('Next blocked: an answer is missing');
    return parts.length ? { cls: blocked ? 'sim-warn' : 'sim-muted', text: parts.join(', ') } : null;
  }

  /* ---- the drawer --------------------------------------------------------- */
  function addStyle() {
    var style = document.createElement('style');
    style.textContent = [
      '#pp-sim-bar{display:flex;justify-content:flex-end;padding:4px 16px;background:#FFF4C2;border-bottom:1px solid #E8D27A}',
      '#pp-sim-toggle{font:inherit;font-size:.8rem;padding:4px 12px;border:1.5px solid #4A3B00;border-radius:999px;background:#fff;color:#4A3B00;cursor:pointer}',
      '#pp-sim{position:fixed;top:0;right:0;bottom:0;z-index:30;width:460px;max-width:94vw;overflow:auto;padding:12px 14px 48px;' +
        'background:#fff;color:#1B1B1F;border-left:2px solid #4A3B00;box-shadow:-4px 0 16px rgba(0,0,0,.2);font-size:14px;line-height:1.4}',
      '#pp-sim h2{margin:14px 0 6px;font-size:15px}',
      '#pp-sim .sim-head{display:flex;align-items:center;justify-content:space-between}',
      '#pp-sim ol,#pp-sim ul{margin:0;padding-left:22px}',
      '#pp-sim li{margin:3px 0;word-break:break-word}',
      '#pp-sim .sim-here{background:#FFF4C2;font-weight:700}',
      '#pp-sim .sim-muted{color:#5F5E6B}',
      '#pp-sim .sim-warn{color:#B3261E}',
      '#pp-sim code{padding:0 3px;border-radius:3px;background:#F3F0F8;font-size:12px}',
      '#pp-sim button{margin-left:6px;padding:2px 10px;border:1px solid #5F5E6B;border-radius:999px;background:#fff;font:inherit;font-size:12px;cursor:pointer}',
      '#pp-sim textarea{width:100%;min-height:110px;padding:6px;border:1px solid #D9D4E3;border-radius:6px;font:12px/1.4 ui-monospace,Menlo,monospace}',
      '#pp-sim .sim-actions button{margin:6px 6px 0 0;padding:4px 12px;font-size:13px}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* The thin strip with the drawer's button, just under the test-mode strip
     (it scrolls with the page, so it never covers the Back / Next bar). */
  function addToggle() {
    ui.bar = h('div', { id: 'pp-sim-bar' }, [
      h('button', { type: 'button', id: 'pp-sim-toggle', on: { click: toggle } }, 'Simulator: route ahead')
    ]);
    var banner = document.getElementById('dev-banner');
    if (banner && banner.parentNode) banner.parentNode.insertBefore(ui.bar, banner.nextSibling);
    else document.body.insertBefore(ui.bar, document.body.firstChild);
  }

  function buildPanel() {
    ui.facts = h('p', { id: 'pp-sim-facts', 'class': 'sim-muted' });
    ui.route = h('ol', { id: 'pp-sim-route' });
    ui.jumps = h('ul', { id: 'pp-sim-jumps' });
    ui.skipped = h('ul', { id: 'pp-sim-skipped' });
    ui.box = h('textarea', {
      id: 'pp-sim-answers',
      spellcheck: 'false',
      'aria-label': 'Answers to apply',
      placeholder: 'nps=9\nsupport_gate=no\none_fix=text:call me\n(or a JSON object)'
    });
    ui.msg = h('p', { id: 'pp-sim-msg', 'class': 'sim-muted', role: 'status' });
    ui.panel = h('aside', { id: 'pp-sim', role: 'dialog', 'aria-label': 'Simulator' }, [
      h('div', { 'class': 'sim-head' }, [
        h('strong', { text: 'Simulator (test mode only)' }),
        h('button', { type: 'button', id: 'pp-sim-close', on: { click: closeDrawer } }, 'Close')
      ]),
      ui.facts,
      h('h2', { text: 'Route ahead' }), ui.route,
      h('h2', { text: 'Jumps taken' }), ui.jumps,
      h('h2', { text: 'Skipped screens, and why' }), ui.skipped,
      h('h2', { text: 'Paste answers' }),
      h('p', { 'class': 'sim-muted', text: 'One per line (key=value; text:... for typed text; key= removes it), ' +
        'or a JSON object. Apply saves them on this phone, as tapping would.' }),
      ui.box,
      h('div', { 'class': 'sim-actions' }, [
        h('button', { type: 'button', id: 'pp-sim-apply', on: { click: applyBox } }, 'Apply'),
        h('button', { type: 'button', id: 'pp-sim-copy', on: { click: copyAnswers } }, 'Copy current answers')
      ]),
      ui.msg
    ]);
    ui.panel.hidden = true;
    document.body.appendChild(ui.panel);
  }

  function openDrawer() {
    if (!ui.panel) buildPanel();
    ui.panel.hidden = false;
    refresh(true);
    clearInterval(timer);
    timer = setInterval(function () { refresh(false); }, POLL_MS);
  }

  function closeDrawer() {
    if (ui.panel) ui.panel.hidden = true;
    clearInterval(timer);
    timer = null;
  }

  function toggle() {
    if (ui.panel && !ui.panel.hidden) closeDrawer();
    else openDrawer();
  }

  function note(text, isProblem) {
    if (!ui.msg) return;
    ui.msg.textContent = text;
    ui.msg.className = isProblem ? 'sim-warn' : 'sim-muted';
  }

  /* Redraw when the screen, the answers or the language changed (or force). */
  function refresh(force) {
    if (!ui.panel || ui.panel.hidden) return;
    var seen;
    try {
      var st = dev.state() || {};
      var cur = dev.current();
      seen = JSON.stringify([cur && cur.id, st.answers, st.texts, st.audio, st.lang, st.lang_chosen, st.finished]);
    } catch (e) {
      seen = String(Date.now());
    }
    if (!force && seen === lastSeen) return;
    lastSeen = seen;
    try {
      render();
    } catch (err) {
      PP.clear(ui.route);
      ui.route.appendChild(h('li', { 'class': 'sim-warn', text: 'The simulator could not work out the route: ' + err.message }));
    }
  }

  function render() {
    var survey = dev.config();
    var state = dev.state() || { answers: {}, texts: {}, audio: {} };
    var graph = flow.load(survey);
    var steps = dev.steps();
    var current = dev.current();
    var facts = factsOf(dev.context());
    var scope = scopeOf(graph, survey, steps, state);
    var locked = !editable();

    ui.facts.textContent = 'Questionnaire ' + (survey.config_version || '?') + ': ' +
      (graph.legacy ? 'a list of screens (read as a graph by the engine)' : 'a flow graph (' + flow.FORMAT + ')') +
      '. Facts: lang=' + facts.lang + ', lang_in_url=' + facts.lang_in_url +
      ', whats_changed_count=' + facts.whats_changed_count + ', round=' + facts.round + '.' +
      (locked ? ' The answers are final or the form shows an end screen: nothing can be changed here.' : '');

    PP.clear(ui.route);
    steps.forEach(function (step) {
      var here = Boolean(current && current.id === step.id);
      var bits = [h('code', { text: step.id }), ' ', h('span', { 'class': 'sim-muted', text: step.type })];
      var info = stepNote(step, state, survey);
      if (info) bits.push(' ', h('span', { 'class': info.cls, text: info.text }));
      if (here) bits.push(' ', h('strong', { text: '< on screen' }));
      if (!locked && !flow.isEnd(step)) {
        bits.push(h('button', { type: 'button', 'class': 'sim-go', 'data-go': step.id, on: { click: function () { go(step.id); } } }, 'Go'));
      }
      ui.route.appendChild(h('li', { 'class': here ? 'sim-here' : null, 'data-step': step.id }, bits));
    });

    PP.clear(ui.jumps);
    var jumps = jumpsOf(steps, scope, facts);
    if (!jumps.length) ui.jumps.appendChild(h('li', { 'class': 'sim-muted', text: 'none: every screen went to its usual next one' }));
    jumps.forEach(function (j) {
      ui.jumps.appendChild(h('li', { 'data-from': j.from }, [h('code', { text: j.from }), ' -> ', h('code', { text: j.to }),
        h('span', { 'class': 'sim-muted', text: ' because ' + j.why })]));
    });

    PP.clear(ui.skipped);
    var skipped = skippedOf(graph, survey, steps, scope, facts);
    if (!skipped.length) ui.skipped.appendChild(h('li', { 'class': 'sim-muted', text: 'none' }));
    skipped.forEach(function (s) {
      ui.skipped.appendChild(h('li', { 'data-skipped': s.id }, [h('code', { text: s.id }), h('span', { 'class': 'sim-muted', text: ' ' + s.reason })]));
    });
  }

  /* ---- Go and Paste answers --------------------------------------------------- */

  /* May the drawer change anything? Not once the answers are final (sent or
     being sent), and not while the form shows an end screen (an ending, or a
     message such as "This survey has closed"). */
  function editable() {
    var state = dev.state();
    var cur = dev.current();
    return Boolean(state && !state.finished && !state.submitted && cur && !flow.isEnd(cur));
  }

  /* Show a screen of the route (not an ending: reaching one sends). */
  function go(id) {
    var steps = dev.steps();
    var i = flow.indexOf(steps, id);
    if (!editable() || i === -1 || flow.isEnd(steps[i])) {
      note('Can\'t go to ' + id + ' now: it is not on the route any more, or the form shows an end screen.', true);
      refresh(true);
      return;
    }
    try { dev.go(id); } catch (e) { note('Could not go to ' + id + ': ' + e.message, true); return; }
    note('');
    closeDrawer();
  }

  /* "nps=9" -> 9, "no" -> "no", "" -> "" (remove). */
  function lineValue(text) {
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    if (text === 'null') return null;
    return text;
  }

  /* The box's text -> { answers, texts, count }. Throws an Error with a plain message. */
  function parseAnswers(text) {
    var out = { answers: {}, texts: {}, count: 0 };
    var put = function (key, value) {
      if (!key) throw new Error('an answer without a name (the part before "=")');
      if (typeof value === 'string' && value.indexOf('text:') === 0) out.texts[key] = value.slice(5);
      else if (value === 'voice') throw new Error('a voice note can\'t be pasted (' + key + '): record one on the screen');
      else out.answers[key] = value;
      out.count += 1;
    };
    var s = String(text || '').trim();
    if (!s) throw new Error('the box is empty');
    if (s.charAt(0) === '{') {
      var obj;
      try { obj = JSON.parse(s); } catch (e) { throw new Error('the JSON is not valid (' + e.message + ')'); }
      if (!isObj(obj)) throw new Error('the JSON must be an object, like {"nps": 9}');
      Object.keys(obj).forEach(function (k) { put(k, obj[k]); });
      return out;
    }
    s.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var eq = line.indexOf('=');
      if (eq < 1) throw new Error('"' + line + '" is not key=value');
      put(line.slice(0, eq).trim(), lineValue(line.slice(eq + 1).trim()));
    });
    return out;
  }

  function applyBox() {
    var parsed;
    try {
      parsed = parseAnswers(ui.box.value);
    } catch (e) {
      note('Not applied: ' + e.message + '.', true);
      return;
    }
    if (!editable()) {
      note('Not applied: the answers are final, or the form shows an end screen.', true);
      return;
    }
    var state = dev.state();
    state.texts = state.texts || {};
    Object.keys(parsed.answers).forEach(function (k) {
      var v = parsed.answers[k];
      if (v === null || v === undefined || v === '') delete state.answers[k];
      else state.answers[k] = v;
    });
    Object.keys(parsed.texts).forEach(function (k) {
      var v = parsed.texts[k] === null || parsed.texts[k] === undefined ? '' : String(parsed.texts[k]);
      if (v === '') delete state.texts[k];
      else state.texts[k] = v;
    });
    try { dev.changed(); } catch (e2) { note('Applied, but the screen could not be drawn again: ' + e2.message, true); return; }
    note('Applied ' + parsed.count + ' answer(s). The route is worked out again.');
    refresh(true);
  }

  /* The answers saved now, one per line (typed text as text:...). */
  function copyAnswers() {
    var state = dev.state() || {};
    var lines = [];
    Object.keys(state.answers || {}).forEach(function (k) {
      var v = state.answers[k];
      lines.push(k + '=' + (typeof v === 'string' ? v : short(v)));
    });
    Object.keys(state.texts || {}).forEach(function (k) {
      var v = String(state.texts[k] || '').replace(/\s+/g, ' ').trim();
      if (v) lines.push(k + '=text:' + v);
    });
    ui.box.value = lines.join('\n');
    note(lines.length ? 'The box now holds the ' + lines.length + ' answer(s) saved on this phone.' : 'No answers saved yet.');
  }

}(typeof window !== 'undefined' ? window : globalThis));
