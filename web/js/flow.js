/* =============================================================================
   flow.js: the "brain" of the questionnaire. Nothing is drawn here.

   WHAT IT IS FOR. From the questionnaire (published from the control panel,
   or the form's own copy in web/config/survey.json) and the answers so far:
     1. path / buildSteps: which screens this partner sees, in which order;
     2. canProceed: may the partner press Next on this screen?
     3. buildSubmission: the message sent at the end (docs/submission-format.md,
        schema_version 1, unchanged). Only answers on the FINAL path are sent.
     4. PP.types: the kinds of screen, each described once (the 12 built-in
        ones at the bottom; drawn by web/js/types.js; a new kind is one file
        in web/js/types/: docs/config-guide.md, "How to add a question type").

   "flow" HAS TWO SHAPES
     - A LIST of screens: today's format and every published version so far.
       fromLegacy() turns it into a graph that behaves exactly like the old
       engine (frozen in tests/flow/legacy/flow_v1.js).
     - A GRAPH { "format": "pp-flow/1", start, collections, nodes }: screens
       with arrows ("next", or jumps: the first true "when" wins), show_if
       rules, loops ("repeat_for": e.g. one screen per area rated low) and
       endings (every thank_you). Contract: docs/flow-engine.md.
   This one file runs on phones, in the control panel (apps-script/Flow.gs is
   generated from it) and in the command-line tools: they never disagree.

   RULES SEE ONLY THE CURRENT PATH: a show_if sees answers of screens before
   it on the path being built (a jump also sees its own screen's answer).
   Answers off the path stay on the phone (Back to that branch restores them)
   but are never tested or sent.

   ANSWERS (state.answers, keyed by screen id; unchanged): "nps" = 7,
   "fn_rating:payments" = 2 (or "na"), "fn_deep_dive:payments" = a chip code,
   "support_gate" = "yes", "support:kept_updated" = 4. Typed text is in
   state.texts[id], voice notes in state.audio[id] (recordings: voice.js).
   They are always read as the object's OWN keys (own()), so a legal code
   such as "constructor" never finds what every JavaScript object inherits.

   USABLE OR NOT: isUsable(flow) says whether a phone can run a flow at all
   (a non-empty list, or a graph whose "start" names one of its nodes); the
   form uses a published questionnaire only then (web/js/net.js).

   READS / WRITES: only what it is given (the questionnaire, the answers, the
   link's facts: language, round, ?lang=, number of "what changed" items).
   It writes, draws and stores nothing.

   TEST (Terminal, project folder): node tests/flow/flow_test.js, and
   node tests/flow/legacy_diff.js (proves it behaves like the old engine).
   ES5 only (Chrome 61): no let, const, arrows, template strings, ?. or ??.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var flow = PP.flow = {};
  var types = flow.types = {};   // the kinds of screen, type -> description (PP.types, at the bottom)
  var LIMIT = 2000;              // safety net: no walk is ever longer than this
  var cache = [];                // the last few questionnaires load() prepared
  var DONE = { k: 'done' }, STUCK = { k: 'stuck' }, END = { k: 'end' };

  flow.ENGINE = 2;               // Publish reads this (as text) before sending a graph to the form
  flow.FORMAT = 'pp-flow/1';

  /* ---- small helpers ------------------------------------------------------ */
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function own(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function copy(x) {   // a deep copy of JSON data (undefined if it can't be copied)
    try { var s = JSON.stringify(x); return s === undefined ? undefined : JSON.parse(s); } catch (e) { return undefined; }
  }
  function extend(vars, name, value) {
    var out = {};
    Object.keys(vars || {}).forEach(function (k) { out[k] = vars[k]; });
    out[name] = value;
    return out;
  }
  function lookup(obj, dotted) {   // "support.items" -> survey.support.items
    var cur = obj;
    String(dotted).split('.').forEach(function (k) { cur = isObj(cur) ? own(cur, k) : undefined; });
    return cur;
  }
  /* A loop variable: "area" = the item's id, "area.threshold" = one field. */
  function field(item, name) { return name ? (isObj(item) ? own(item, name) : undefined) : (isObj(item) ? item.id : item); }
  function varValue(ref, vars) {
    var parts = String(ref).split('.');
    var item = own(vars, parts[0]);
    return item === undefined ? undefined : field(item, parts[1]);
  }
  function arg(x, vars) { return isObj(x) && 'var' in x ? varValue(x['var'], vars) : x; }

  /* "fn_rating:{area}" -> "fn_rating:payments". Unknown names stay as they are. */
  var TPL = /\{([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?\}/g;
  function fill(tpl, vars) {
    if (typeof tpl !== 'string') return tpl;
    return tpl.replace(TPL, function (m, name, f) {
      var item = own(vars, name);
      return item === undefined ? m : String(field(item, f));
    });
  }
  flow.fill = fill;

  /* The threshold for one area: its own "threshold" if set, else deep_dive.threshold. */
  flow.thresholdFor = function (config, fn) {
    if (fn && typeof fn.threshold === 'number') return fn.threshold;
    var t = config.deep_dive && Number(config.deep_dive.threshold);
    return t || 3;
  };

  /* Is this rating at or below the area's threshold? ("na" is never low.) */
  flow.isLow = function (config, fn, value) {
    return typeof value === 'number' && value <= flow.thresholdFor(config, fn);
  };

  /* ---------------------------------------------------------------------------
     Rules (show_if, repeat_for.where, jumps), e.g.
       { "answer": "fn_rating:{area}", "at_most": { "var": "area.threshold" } }
       { "fact": "lang", "in": ["ta", "te"] }    { "all" / "any": [...] }, { "not": rule }
     Each test means exactly what it meant before: published rules depend on
     it. scope = the answers the rule may see; env = { facts, vars }.
     evalCondition(rule, answers) behaves exactly like the old engine.
     ------------------------------------------------------------------------- */
  flow.evalCondition = function (cond, scope, env) {
    if (!isObj(cond)) return true;
    var test = function (c) { return flow.evalCondition(c, scope, env); };
    if (Array.isArray(cond.all)) return cond.all.every(test);
    if (Array.isArray(cond.any)) return cond.any.some(test);
    if (isObj(cond.not)) return !test(cond.not);

    var vars = env && env.vars;
    var value;
    if ('fact' in cond) value = env ? own(env.facts, cond.fact) : undefined;
    else if ('var' in cond) value = varValue(cond['var'], vars);
    else value = own(scope, fill(cond.answer, vars));
    var has = value !== undefined && value !== null && value !== '';

    if ('equals' in cond) return has && String(value) === String(arg(cond.equals, vars));
    if ('not_equals' in cond) return !has || String(value) !== String(arg(cond.not_equals, vars));
    if ('at_most' in cond) return typeof value === 'number' && value <= Number(arg(cond.at_most, vars));
    if ('at_least' in cond) return typeof value === 'number' && value >= Number(arg(cond.at_least, vars));
    if ('in' in cond) {
      return has && Array.isArray(cond['in']) &&
        cond['in'].map(function (x) { return String(arg(x, vars)); }).indexOf(String(value)) !== -1;
    }
    if ('answered' in cond) return has === Boolean(cond.answered);
    return true; // unknown test: show the screen (the checks report the mistake)
  };

  /* A collection's items (e.g. "areas" = functions). A plain string becomes
     { id }; "defaults" fills a field that is missing or of another kind. */
  flow.items = function (graph, survey, name) {
    var spec = isObj(graph) ? own(graph.collections, name) : undefined;
    var list = isObj(spec) ? lookup(survey, spec.list) : undefined;
    if (!Array.isArray(list)) return [];
    var defs = isObj(spec.defaults) ? spec.defaults : {};
    return list.map(function (raw) {
      var item = isObj(raw) ? extend(raw, 'id', raw.id) : { id: raw };
      Object.keys(defs).forEach(function (k) { if (typeof own(item, k) !== typeof defs[k]) item[k] = defs[k]; });
      return item;
    });
  };

  /* load(survey) -> the graph, indexed (graph.byId, body.byId per group) and
     remembered per survey object. A list is converted (graph.legacy = true);
     anything unusable gives an empty graph (path: just the thank-you). */
  flow.isGraph = function (value) { return isObj(value) && value.format === flow.FORMAT; };
  flow.supportsFormat = function (value) { return (Array.isArray(value) && value.length > 0) || flow.isGraph(value); };
  /* Can a phone run this flow at all? A non-empty list, or a graph whose
     "start" names one of its top-level nodes (so it has nodes). A graph
     without nodes, or whose start is missing, would show an empty screen
     that sends nothing, so the form treats it like an unknown format and
     uses its own copy instead (web/js/net.js usableBootstrap). */
  flow.isUsable = function (value) {
    if (Array.isArray(value)) return value.length > 0;
    if (!flow.isGraph(value) || typeof value.start !== 'string' || !value.start) return false;
    return arr(value.nodes).some(function (n) { return isObj(n) && n.id === value.start; });
  };

  function index(list) {
    var byId = {};
    list.forEach(function (n) {
      if (!isObj(n) || !n.id) return;
      byId[n.id] = n;
      if (n.type === 'group' && isObj(n.body)) {
        n.body.nodes = arr(n.body.nodes);
        n.body.byId = index(n.body.nodes);
      }
    });
    return byId;
  }
  function prepare(g) {
    g = isObj(g) ? g : { format: flow.FORMAT, nodes: [] };
    g.nodes = arr(g.nodes);
    g.byId = index(g.nodes);
    return g;
  }

  flow.load = function (survey) {
    if (!isObj(survey)) return prepare(null);
    for (var i = 0; i < cache.length; i++) if (cache[i].s === survey && cache[i].f === survey.flow) return cache[i].g;
    var legacy = Array.isArray(survey.flow);
    var g = prepare(legacy ? flow.fromLegacy(survey) : (flow.isGraph(survey.flow) ? copy(survey.flow) : null));
    g.legacy = legacy;
    cache.unshift({ s: survey, f: survey.flow, g: g });
    if (cache.length > 4) cache.pop();
    return g;
  };

  /* Is there a node of this type anywhere (group bodies included)? */
  flow.hasType = function (survey, type) {
    function any(list) {
      return list.some(function (n) { return isObj(n) && (n.type === type || (isObj(n.body) && any(arr(n.body.nodes)))); });
    }
    return any(flow.load(survey).nodes);
  };

  /* step.keys: the text keys a screen shows, templates filled in; absent when
     the node doesn't set them (the screen then uses its old key).
     options [{code, text}], rows [{id, key, text}], comment {key, text}. */
  var KEY_FIELDS = ['text', 'label', 'help', 'low_label', 'high_label', 'scale_hint', 'body', 'detail_text', 'detail_text_required'];

  function optionsOf(node, vars) {
    var o = node.options;
    if (Array.isArray(o)) {
      return o.map(function (x) { return isObj(x) ? { code: x.code, text: fill(x.text, vars) } : { code: x, text: 'choice.' + node.id + '.' + x }; });
    }
    if (!isObj(o)) return [];
    var list = arr(varValue(o.from, vars)).map(function (code) { return { code: code, text: fill(o.text, extend(vars, 'code', code)) }; });
    if (o.other) list.push({ code: 'other', text: o.other });
    return list;
  }
  function keysFor(graph, survey, node, vars) {
    var k = {};
    KEY_FIELDS.forEach(function (f) { if (node[f] !== undefined) k[f] = fill(node[f], vars); });
    if (node.options !== undefined) k.options = optionsOf(node, vars);
    var rows = node.rows;
    if (isObj(rows)) {
      k.rows = flow.items(graph, survey, rows['in']).map(function (item) {
        var v = extend(vars, rows.each, item);
        return { id: item.id, key: fill(rows.store_as, v), text: fill(rows.text, v) };
      });
    }
    if (isObj(node.comment)) k.comment = { key: fill(node.comment.store_as, vars), text: fill(node.comment.text, vars) };
    return k;
  }

  /* Every answer key a screen stores: its own (store_as, else its id), one
     per support row, and its comment box. A group stores nothing. */
  function storedKeys(id, k) {
    var out = [id];
    (k.rows || []).forEach(function (r) { out.push(r.key); });
    if (k.comment && k.comment.key !== undefined) out.push(k.comment.key);
    return out;
  }
  flow.keysOf = function (graph, survey, node, vars) {
    if (!isObj(node) || node.type === 'group') return [];
    return storedKeys(fill(node.store_as || node.id, vars), keysFor(graph, survey, node, vars));
  };

  /* ---------------------------------------------------------------------------
     path(graph, survey, ctx, state) -> the steps on this partner's path.
     ctx = { facts: { lang, lang_in_url, whats_changed_count, round } };
     state = what the phone saved ({ answers, texts, audio, lang_chosen }).
     A step = { id, type, node, entry (= node, for older code), vars (loop
     items), fn (the area, in a loop over areas), keys }.
     ------------------------------------------------------------------------- */
  /* where to go after a node; env = null: its default arrow (it was skipped) */
  function nextOf(next, scope, env) {
    if (!Array.isArray(next)) return typeof next === 'string' ? next : undefined;
    for (var i = 0; i < next.length; i++) {
      var e = next[i];
      if (isObj(e) && 'default' in e) return e['default'];
      if (isObj(e) && env && flow.evalCondition(e.when, scope, env)) return e['goto'];
    }
  }

  flow.path = function (graph, survey, ctx, state) {
    if (!isObj(graph) || !graph.byId) graph = prepare(copy(graph));
    survey = isObj(survey) ? survey : {};
    state = isObj(state) ? state : {};
    var answers = state.answers || {};
    var given = isObj(ctx && ctx.facts) ? ctx.facts : {};
    var facts = extend(given, 'lang_in_url', Boolean(given.lang_in_url));
    facts.whats_changed_count = Number(given.whats_changed_count) || 0;
    var steps = [];
    var scope = {};   // what rules may see: answers of steps already on the path

    function emit(node, vars) {
      var step = { id: fill(node.store_as || node.id, vars), type: node.type, node: node, entry: node,
        vars: vars, fn: own(vars, 'area'), keys: keysFor(graph, survey, node, vars) };
      steps.push(step);
      if (steps.length > LIMIT) throw new Error('flow: the path is longer than ' + LIMIT + ' screens (an arrow loop?)');
      storedKeys(step.id, step.keys).forEach(function (k) {
        var v = own(answers, k);
        if (v !== undefined) scope[k] = v;
        else if (flow.hasDetail(state, k)) scope[k] = true;   // typed text or a voice note
      });
      return flow.isEnd(node) ? END : null;
    }
    function visit(node, vars) {
      if (node.type !== 'group') return emit(node, vars);
      var r = walk(node.body, isObj(node.body) ? node.body.start : undefined, vars);
      return r === DONE ? null : r;
    }
    function walk(body, id, vars) {   // one list of nodes: the top level, or a group's body
      var byId = isObj(body) && isObj(body.byId) ? body.byId : {};
      for (var guard = 0; ; guard++) {
        if (guard > LIMIT) throw new Error('flow: going round in circles at "' + id + '"');
        if (id === '@next_item') return DONE;
        var node = typeof id === 'string' ? own(byId, id) : undefined;
        if (!node) return id === undefined || id === null ? STUCK : { k: 'jump', to: id };
        var env = { facts: facts, vars: vars };
        if (node.show_if && !flow.evalCondition(node.show_if, scope, env)) {
          id = nextOf(node.next, scope, null);
          continue;
        }
        var out = null;
        var rf = node.repeat_for;
        if (rf) {
          var list = flow.items(graph, survey, rf['in']);
          for (var i = 0; i < list.length && !out; i++) {
            var v2 = extend(vars, rf.each, list[i]);
            if (!rf.where || flow.evalCondition(rf.where, scope, { facts: facts, vars: v2 })) out = visit(node, v2);
          }
        } else {
          out = visit(node, vars);
        }
        if (out) {
          if (out.k === 'jump' && own(byId, out.to)) { id = out.to; continue; }   // left a loop early
          return out;
        }
        id = nextOf(node.next, scope, env);
      }
    }

    if (walk(graph, graph.start, {}) !== END) {   // as before: every path ends on a thank-you
      var thanks = { id: 'thanks', type: 'thank_you' };
      steps.push({ id: 'thanks', type: 'thank_you', node: thanks, entry: thanks, vars: {}, fn: undefined, keys: {} });
    }
    return steps;
  };

  /* The older call (kept). ctx = { answers, langInUrl, hasWhatsChanged }, or
     { state, langInUrl, whatsChangedCount, lang, round }. */
  flow.buildSteps = function (config, ctx) {
    ctx = ctx || {};
    var state = ctx.state || { answers: ctx.answers || {}, texts: {}, audio: {} };
    var count = 'whatsChangedCount' in ctx ? ctx.whatsChangedCount : (ctx.hasWhatsChanged ? 1 : 0);
    var facts = { lang: ctx.lang, lang_in_url: Boolean(ctx.langInUrl), whats_changed_count: Number(count) || 0, round: ctx.round };
    return flow.path(flow.load(config), config, { facts: facts }, state);
  };

  /* Kept for older callers: the answers, plus free-text items with text or
     a voice note as true. */
  flow.ruleAnswers = function (state) {
    var out = {};
    var a = state.answers || {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(state.texts || {}).concat(Object.keys(state.audio || {})).forEach(function (id) {
      if (own(out, id) === undefined && flow.hasDetail(state, id)) out[id] = true;
    });
    return out;
  };

  flow.indexOf = function (steps, id) {
    for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return i;
    return -1;
  };

  /* Does this item have typed text or a voice note? */
  flow.hasDetail = function (state, itemId) {
    var text = own(state.texts, itemId);
    return Boolean((text && String(text).trim()) || own(state.audio, itemId));
  };

  /* Has the partner given an answer on this screen (used to show Next after Back)? */
  flow.isAnswered = function (step, state) {
    if (step.type === 'language_picker') return Boolean(state.lang_chosen);
    return own(state.answers, step.id) !== undefined;
  };

  /* Is this step (or node) an ending? Reaching one sends the answers. */
  flow.isEnd = function (step) {
    var t = isObj(step) ? own(types, step.type) : undefined;
    return Boolean(t && t.end);
  };

  /* A step made the old way, without "node" (by hand, in older code or
     tests) gets what fromLegacy() would give it. */
  function norm(step, config) {
    if (!isObj(step) || step.node) return step;
    var s = isObj(config) ? config : {};
    var e = isObj(step.entry) ? step.entry : {};
    var vars = {};
    var node;
    if (step.fn) vars.area = extend(step.fn, 'threshold', flow.thresholdFor(s, step.fn));
    if (step.type === 'function_rating') node = ratingNode(e.id || 'fn_ratings', s, e);
    else if (step.type === 'function_deep_dive') node = diveNode(e.id || 'fn_deep_dives', s);
    else if (step.type === 'support_block') node = supportNode(e, s);
    else node = genericNode(e, step.id, step.type);
    return { id: step.id, type: step.type, node: node, entry: step.entry, vars: vars, fn: step.fn,
      keys: keysFor({ collections: legacyCollections(s) }, s, node, vars) };
  }

  /* Can the partner move on from this screen? (A kind of screen nobody
     described: yes. One without its own rule: the standard rule, below.) */
  flow.canProceed = function (step, state, config) {
    var s = norm(step, config);
    var t = own(types, s.type);
    if (!t) return true;
    var rule = typeof t.isComplete === 'function' ? t.isComplete : standardComplete;
    return Boolean(rule(s, state || {}, flow.load(config), config));
  };

  /* The "submit" message, byte-identical to before (docs/submission-format.md).
     meta = what app.js decides (ids, link, times, client); getAudio(itemId) =
     the recording as base64 text, or null. */
  flow.buildSubmission = function (config, state, steps, meta, getAudio) {
    var a = state.answers || {};
    var out = { answers: {}, ratings: [], free_text: [] };
    var onPath = {};
    steps.forEach(function (s) { onPath[s.id] = true; });
    var graph = flow.load(config);
    var helpers = {
      onPath: onPath,
      addText: function (itemId, block, fnId, issueCode, questionKey) {
        var text = String(own(state.texts, itemId) || '').trim();
        var clip = own(state.audio, itemId) || null;
        var audio = null;
        if (clip) {
          var b64 = getAudio ? getAudio(itemId) : null;
          if (b64) audio = { mime: clip.mime, duration_s: clip.duration_s, bytes: clip.bytes, base64: b64 };
        }
        if (!text && !audio) return;
        out.free_text.push({ item_id: itemId, block: block, 'function': fnId || null, issue_code: issueCode || null,
          question_key: questionKey || null, text: text, audio: audio });
      }
    };
    steps.forEach(function (step) {
      var s = norm(step, config);
      var t = own(types, s.type);
      var add = t ? (typeof t.collect === 'function' ? t.collect : standardCollect) : null;
      if (add) add(s, a, out, helpers, graph, config || {}, state);
    });
    return {
      kind: 'submit', schema_version: 1, survey_id: meta.survey_id, config_version: meta.config_version,
      app_version: meta.app_version, submission_id: state.submission_id, session_id: state.session_id,
      dc: meta.dc, t: meta.t, round: meta.round, lang: meta.lang, mode: meta.mode,
      opened_at: state.opened_at || null, started_at: state.started_at || null, submitted_at: state.submitted_at || null,
      sent_at: meta.sent_at, attempt: meta.attempt, resume_count: state.resume_count || 0, client: meta.client,
      answers: out.answers, ratings: out.ratings, free_text: out.free_text, events: (state.events || []).slice()
    };
  };

  /* ---------------------------------------------------------------------------
     THE KINDS OF SCREEN ("question types"). PP.types.register(description)
     describes one kind once, for phones, the checks and the control panel:
     type, label, description, fields (its settings), answer (what a rule can
     test), records (what it sends), flags (end, auto, first, once, early),
     texts (its default text keys), row (the Screens tab), isComplete and
     collect (else the standard rules below), render (phones only). The
     fields are explained in docs/flow-engine.md 3 and docs/config-guide.md
     ("How to add a question type"). Registering a type again adds to it
     (web/js/types.js adds the drawings of the 12 built-in kinds below).
     ------------------------------------------------------------------------- */
  var T = PP.types = {};
  var order = [];                  // the types, in the order they were registered
  var screens = PP.screens = {};   // type -> its drawing (web/js/app.js reads PP.screens)
  var TYPE_RE = /^[a-z][a-z0-9_]*$/;

  T.register = function (d) {
    if (!isObj(d) || typeof d.type !== 'string' || !TYPE_RE.test(d.type) || d.type === 'group') {
      throw new Error('PP.types.register: a description needs "type", a code like "stars_1_10" (a-z, 0-9 and _)');
    }
    var cur = own(types, d.type);
    if (!cur) {
      cur = types[d.type] = { type: d.type };
      order.push(d.type);
    }
    Object.keys(d).forEach(function (k) { if (k !== 'type' && d[k] !== undefined) cur[k] = d[k]; });
    cur.end = Boolean(isObj(cur.flags) && cur.flags.end);
    if (typeof cur.render === 'function') screens[d.type] = drawing(d.type);
    return cur;
  };
  T.get = function (type) { return typeof type === 'string' ? own(types, type) : undefined; };
  T.list = function () { return order.slice(); };

  /* A type's drawing, for app.js; "auto" comes from flags.auto when render leaves it out. */
  function drawing(type) {
    return function (ctx) {
      var d = types[type];
      var out = d.render(ctx);
      if (isObj(out) && out.auto === undefined) out.auto = Boolean(isObj(d.flags) && d.flags.auto);
      return out;
    };
  }

  /* The standard rules (a kind without its own isComplete / collect). Next:
     nothing to answer, an optional or not-required answer, or one given (text
     or voice for "text"). Sent: records.answers = the answer; ratings = 1:
     one "question" ratings row; free_text = 1: the typed text or voice note. */
  function keysOfStep(step) { return step.keys || {}; }
  /* Is a screen's answer required? Its own true/false setting (field, e.g.
     "required"), else that setting's default in the kind's "fields", else yes.
     d = the kind's description (or its type). The checker asks this too. */
  T.isRequired = function (d, node, field) {
    if (typeof d === 'string') d = own(types, d);
    if (isObj(node) && typeof node[field] === 'boolean') return node[field];
    var f = isObj(d) && isObj(d.fields) ? own(d.fields, field) : undefined;
    return isObj(f) && typeof f['default'] === 'boolean' ? f['default'] : true;
  };
  function standardComplete(step, state) {
    var d = own(types, step.type);
    var a = d && isObj(d.answer) ? d.answer : null;
    if (!a || a.optional === true) return true;
    var by = 'required_by' in a ? a.required_by : 'required';
    if (by !== null && !T.isRequired(d, step.node, by)) return true;
    return a.kind === 'text' ? flow.hasDetail(state, step.id) : own(state.answers, step.id) !== undefined;
  }
  function standardCollect(step, a, out, h) {
    var d = own(types, step.type);
    var an = d && isObj(d.answer) ? d.answer : null;
    var rec = d && isObj(d.records) ? d.records : {};
    if (!an) return;
    if (an.kind === 'text') {
      if (rec.free_text) h.addText(step.id, step.node.block || 'question', null, null, keysOfStep(step).text || null);
      return;
    }
    var v = own(a, step.id);
    if (v === undefined) return;
    if (rec.answers) out.answers[step.id] = v;
    if (rec.ratings === 1) {
      out.ratings.push({ block: 'question', item: step.id, rating: v, not_applicable: false,
        threshold: null, below_threshold: null, issue_code: null });
    }
  }

  /* ---- The 12 built-in kinds: exactly the old behaviour (docs/flow-engine.md 3;
     their drawings: web/js/types.js). "row" = the control panel's Screens tab. */
  var KEY = { kind: 'text_key' };
  var KEY_NEEDED = { kind: 'text_key', required: true };
  var FLAG = { kind: 'bool' };
  var REQUIRED = { kind: 'bool', 'default': true };
  var ANSWER_KEY = { kind: 'answer_key' };
  var reg = T.register;

  reg({ type: 'language_picker', label: 'Language buttons',
    description: 'The partner picks their language. Skipped when the link already says which language.',
    fields: { required: FLAG }, answer: null, flags: { auto: true, first: true }, texts: { text: 'lang.title' },
    row: { builtin: true, fields: ['skip_if'], skip_if: 'lang_in_url', icon: '🌐', order: 70, default_id: 'language' },
    isComplete: function (step, state) { return Boolean(state.lang_chosen); } });

  reg({ type: 'whats_changed', label: '"What changed" card',
    description: 'Shows what Valmo changed since the last round (edited under Rounds). Skipped when the round has nothing to show.',
    answer: null, flags: { early: true, once: true }, texts: { text: 'wc.title' },
    row: { builtin: true, fields: ['skip_if'], skip_if: 'empty', icon: '📰', order: 80, default_id: 'whats_changed' } });

  reg({ type: 'function_rating', label: 'Area rating (faces)',
    description: 'Five faces for one area (one screen per area), with "I don\'t handle this" when it is switched on.',
    fields: { text: KEY, label: KEY, help: KEY, allow_not_applicable: FLAG, issue_code_from: ANSWER_KEY, required: FLAG },
    // required_by null: Next needs a face or "na" ("required" only shows a Skip button, as before)
    answer: { kind: 'number', min: 1, max: 5, what: 'the area rating', required_by: null, na_by: 'allow_not_applicable' },
    records: { ratings: 1 }, flags: { auto: true },
    texts: { text: 'q.fn_rating', label: 'fn.{area}.name', help: 'fn.{area}.help' },
    row: { type: 'function_ratings', label: 'Area ratings', builtin: true,
      description: 'One screen of five faces for each area that is switched on (Areas & problems).',
      fields: [], icon: '⭐', order: 90, default_id: 'fn_ratings', after_note: ' (one screen per area)' },
    collect: function (step, a, out, h, graph, survey) {
      var v = own(a, step.id);
      if (v === undefined) return;
      var area = step.fn || {};
      var na = v === 'na';
      var threshold = flow.thresholdFor(survey, area);
      var dd = fill(step.node.issue_code_from, step.vars);
      out.ratings.push({ block: 'function', item: area.id, rating: na ? null : v, not_applicable: na,
        threshold: threshold, below_threshold: !na && typeof v === 'number' && v <= threshold,
        issue_code: dd && own(h.onPath, dd) && own(a, dd) ? own(a, dd) : null });
    } });

  reg({ type: 'function_deep_dive', label: 'Main problem + tell us more',
    description: '"What is the main problem?" for one area rated low: its problem buttons and Other, then a voice note or text.',
    fields: { text: KEY, label: KEY, rating_from: ANSWER_KEY, options: { kind: 'options' }, detail_text: KEY,
      detail_text_required: KEY, require_choice: REQUIRED, require_detail_if_other: REQUIRED },
    answer: { kind: 'choice', values_from: 'options', what: 'the problem picked for', required_by: 'require_choice', detail: true },
    records: { free_text: 1 },
    texts: { text: 'q.deep_dive', label: 'fn.{area}.name', detail_text: 'q.tell_more', detail_text_required: 'q.tell_more_required',
      options: { from: 'area.issues', text: 'issue.{area}.{code}', other: 'issue.other' } },
    row: { type: 'function_deep_dives', label: 'Problem screens', builtin: true,
      description: '"What is the main problem?" for every area rated low, with that area\'s problem buttons and an optional voice ' +
        'note or text. Must come after the area ratings.',
      fields: [], icon: '🔍', order: 100, default_id: 'fn_deep_dives', after_note: ' (one screen per area rated low)' },
    isComplete: function (step, state) {
      var chip = own(state.answers, step.id);
      if (step.node.require_choice !== false && !chip) return false;
      return !(chip === 'other' && step.node.require_detail_if_other !== false && !flow.hasDetail(state, step.id));
    },
    collect: function (step, a, out, h) {
      h.addText(step.id, 'function', (step.fn || {}).id, own(a, step.id), keysOfStep(step).detail_text || 'q.tell_more');
    } });

  reg({ type: 'support_block', label: 'Support ratings',
    description: 'The support questions on one screen, each with five faces, plus an optional comment.',
    fields: { text: KEY_NEEDED, rows: { kind: 'rows', required: true }, allow_not_applicable: FLAG, comment: { kind: 'comment' },
      required: REQUIRED },
    answer: { kind: 'rows', rows: { kind: 'number', min: 1, max: 5, what: 'the support rating', na_by: 'allow_not_applicable' },
      comment: { kind: 'text', what: 'the support comment', optional: true } },
    records: { ratings: 'rows', free_text: 'comment' },
    row: { builtin: true, needs_text: true, fields: [], required_default: true, icon: '🎧', order: 110, default_id: 'support',
      default_text: 'q.support_block', after_note: ' (all support questions on one screen)' },
    isComplete: function (step, state) {
      return step.node.required === false || (keysOfStep(step).rows || []).every(function (r) { return own(state.answers, r.key) !== undefined; });
    },
    collect: function (step, a, out, h) {
      var k = keysOfStep(step);
      (k.rows || []).forEach(function (r) {
        var v = own(a, r.key);
        if (v !== undefined) {
          out.ratings.push({ block: 'support', item: r.id, rating: v === 'na' ? null : v, not_applicable: v === 'na',
            threshold: null, below_threshold: null, issue_code: null });
        }
      });
      if (k.comment && k.comment.key !== undefined) h.addText(k.comment.key, 'support', null, null, k.comment.text);
    } });

  reg({ type: 'thank_you', label: 'Thank you (sends the answers)',
    description: 'An ending: it says thank you and sends the answers. There may be several, each reached by its own route.',
    fields: { text: KEY, body: KEY }, answer: null, flags: { end: true }, texts: { text: 'thanks.title', body: 'thanks.body' },
    row: { label: 'Thank-you screen', builtin: true,
      description: 'Sends the answers and says thank you. The main one comes after the last question; another ending may ' +
        'follow it, reached only by a jump.',
      fields: [], icon: '🙏', order: 120, default_id: 'thanks' } });

  reg({ type: 'nps_0_10', label: '0-10 question', description: 'Eleven buttons from 0 to 10, with a label under each end.',
    fields: { text: KEY_NEEDED, low_label: KEY, high_label: KEY, scale_hint: KEY, required: REQUIRED },
    answer: { kind: 'number', min: 0, max: 10, what: 'the 0-10 question' }, records: { answers: 1 }, flags: { auto: true },
    row: { label: '0 to 10 question', needs_text: true, fields: ['low_label', 'high_label', 'scale_hint', 'required'],
      required_default: true, repeatable: true, icon: '🔟', order: 10 } });

  reg({ type: 'rating_1_5', label: 'Faces question (1-5)', description: 'One row of five faces, from very bad to very good.',
    fields: { text: KEY_NEEDED, required: REQUIRED },
    answer: { kind: 'number', min: 1, max: 5, what: 'the 1-5 rating' }, records: { answers: 1, ratings: 1 }, flags: { auto: true },
    row: { label: 'Faces question (1 to 5)', needs_text: true, fields: ['required'], required_default: true, repeatable: true,
      icon: '🙂', order: 20 } });

  reg({ type: 'yes_no', label: 'Yes / No question', description: 'Two big buttons: Yes and No.',
    fields: { text: KEY_NEEDED, required: REQUIRED },
    answer: { kind: 'choice', values: ['yes', 'no'], what: 'the yes/no question' }, records: { answers: 1 }, flags: { auto: true },
    row: { needs_text: true, fields: ['required'], required_default: true, repeatable: true, icon: '👍', order: 30 } });

  reg({ type: 'single_choice', label: 'Pick-one question', description: 'A list of answers; the partner taps one.',
    fields: { text: KEY_NEEDED, options: { kind: 'options', required: true }, required: REQUIRED },
    answer: { kind: 'choice', values_from: 'options', what: 'the choice question' }, records: { answers: 1 }, flags: { auto: true },
    row: { label: 'Pick one answer', needs_text: true, fields: ['options', 'required'], required_default: true, repeatable: true,
      icon: '☑️', order: 40 } });

  reg({ type: 'free_text', label: 'Voice or typing', description: 'The partner records a voice note or types an answer.',
    fields: { text: KEY_NEEDED, block: { kind: 'choice', values: ['question', 'one_fix'] }, required: { kind: 'bool', 'default': false } },
    answer: { kind: 'text', what: 'the voice or typed answer' }, records: { free_text: 1 },
    row: { label: 'Voice note or typing', needs_text: true, fields: ['required'], required_default: false, repeatable: true,
      icon: '🎙️', order: 50 } });

  reg({ type: 'info_card', label: 'Information card', description: 'A title and an optional longer text, with nothing to answer.',
    fields: { text: KEY_NEEDED, body: KEY }, answer: null,
    row: { needs_text: true, fields: ['body'], repeatable: true, icon: 'ℹ️', order: 60 } });

  /* fromLegacy(survey): today's "flow" list (and every published p1..pN) as a
     graph keeping every quirk of the old engine (docs/flow-engine.md 5). */
  var LEGACY_FIELDS = {   // what the old engine and screens read from each kind of line
    nps_0_10: ['text', 'low_label', 'high_label', 'scale_hint', 'required'],
    rating_1_5: ['text', 'required'], yes_no: ['text', 'required'], single_choice: ['text', 'options', 'required'],
    free_text: ['text', 'required'], info_card: ['text', 'body'], language_picker: ['required'],
    whats_changed: [], thank_you: []
  };
  var GENERIC_FIELDS = ['text', 'body', 'options', 'low_label', 'high_label', 'scale_hint', 'required'];
  var LOW = { answer: 'fn_rating:{area}', at_most: { 'var': 'area.threshold' } };

  function legacyCollections(s) {
    var dd = isObj(s.deep_dive) ? s.deep_dive : {};
    return { areas: { list: 'functions', defaults: { threshold: Number(dd.threshold) || 3 } }, support_items: { list: 'support.items' } };
  }
  function genericNode(e, id, type) {
    var node = { id: id, type: type };
    (own(LEGACY_FIELDS, type) || GENERIC_FIELDS).forEach(function (f) { if (f in e) node[f] = copy(e[f]); });
    if (type === 'free_text' && id === 'one_fix') node.block = 'one_fix';
    return node;
  }
  function ratingNode(id, s, e) {
    var node = { id: id, type: 'function_rating', store_as: 'fn_rating:{area}', text: 'q.fn_rating',
      label: 'fn.{area}.name', help: 'fn.{area}.help', allow_not_applicable: Boolean(s.rating && s.rating.allow_not_applicable),
      issue_code_from: 'fn_deep_dive:{area}' };
    if ('required' in e) node.required = e.required;   // the form's Skip button reads it
    return node;
  }
  function diveNode(id, s) {
    var dd = isObj(s.deep_dive) ? s.deep_dive : {};
    return { id: id, type: 'function_deep_dive', store_as: 'fn_deep_dive:{area}', text: 'q.deep_dive',
      label: 'fn.{area}.name', rating_from: 'fn_rating:{area}',
      options: { from: 'area.issues', text: 'issue.{area}.{code}', other: 'issue.other' },
      detail_text: 'q.tell_more', detail_text_required: 'q.tell_more_required',
      require_choice: dd.require_chip !== false, require_detail_if_other: dd.require_detail_if_other !== false };
  }
  function supportNode(e, s) {
    var sp = isObj(s.support) ? s.support : {};
    var node = { id: e.id, type: 'support_block' };
    if ('text' in e) node.text = copy(e.text);
    node.rows = { each: 'item', 'in': 'support_items', store_as: 'support:{item}', text: 'support.{item}' };
    node.allow_not_applicable = sp.allow_not_applicable === true;
    if ('required' in e) node.required = e.required;
    if (sp.allow_comment !== false) node.comment = { store_as: 'support_comment', text: sp.comment_text || 'q.support_comment' };
    return node;
  }

  flow.fromLegacy = function (survey) {
    var s = isObj(survey) ? survey : {};
    var immediate = isObj(s.deep_dive) && s.deep_dive.when === 'immediate';
    var lines = arr(s.flow);
    var used = {};
    var diveId = 'fn_deep_dives';
    var out = [];
    lines.forEach(function (e) {
      if (!isObj(e) || !e.id) return;
      used[e.id] = true;
      if (e.type === 'function_deep_dives') diveId = e.id;
    });

    lines.forEach(function (e) {
      if (!isObj(e)) return;
      var node;
      var conds = [];
      if (e.skip_if === 'lang_in_url') conds.push({ fact: 'lang_in_url', equals: false });
      if (e.skip_if === 'empty') conds.push({ fact: 'whats_changed_count', at_least: 1 });
      if (e.show_if) conds.push(copy(e.show_if));

      if (e.type === 'function_ratings' && immediate) {
        // one group per area: its rating, then its problem screen if rated low
        var rate = ratingNode(e.id, s, e);
        var dive = diveNode(diveId, s);
        rate.next = dive.id;
        dive.show_if = copy(LOW);
        dive.next = '@next_item';
        var gid = 'area_loop';
        while (used[gid]) gid += '_';
        used[gid] = true;
        node = { id: gid, type: 'group', repeat_for: { each: 'area', 'in': 'areas' }, body: { start: rate.id, nodes: [rate, dive] } };
      } else if (e.type === 'function_ratings') {
        node = ratingNode(e.id, s, e);
        node.repeat_for = { each: 'area', 'in': 'areas' };
      } else if (e.type === 'function_deep_dives') {
        if (immediate) return;   // the old engine ignored this line in immediate mode
        node = diveNode(e.id, s);
        node.repeat_for = { each: 'area', 'in': 'areas', where: copy(LOW) };
      } else if (e.type === 'support_block') {
        node = supportNode(e, s);
      } else {
        node = genericNode(e, e.id, e.type);
      }
      if (conds.length) node.show_if = conds.length === 1 ? conds[0] : { all: conds };
      out.push(node);
    });

    // As before, the path always ends on a thank-you screen.
    var last = out[out.length - 1];
    if (!last || last.type !== 'thank_you' || last.show_if) {
      var tid = used.thanks ? 'thanks_auto' : 'thanks';
      while (used[tid]) tid += '_';
      out.push({ id: tid, type: 'thank_you' });
    }
    out.forEach(function (n, i) { if (n.type !== 'thank_you' || n.show_if) n.next = out[i + 1].id; });
    return { format: flow.FORMAT, start: out[0].id, collections: legacyCollections(s), nodes: out };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = flow;

}(typeof window !== 'undefined' ? window : globalThis));
