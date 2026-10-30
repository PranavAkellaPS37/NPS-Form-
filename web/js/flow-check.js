/* =============================================================================
   flow-check.js: the ONE checker of the questionnaire's flow, with its map,
   simulator, route list, version comparison and screen list.

   WHAT IT IS FOR
     The "flow" says which screen comes after which: the "show only if"
     rules, jumps, loops ("one screen per area rated low") and endings. Before
     a questionnaire reaches partners, this file looks for mistakes in it and
     explains each one in plain English, with how to fix it. It also:
       - draws the flow as a diagram (docs/flow.md, Mermaid, drawn by GitHub);
       - tries out a set of answers: which screens, why others are skipped,
         where Next would be blocked, and exactly what would be sent;
       - lists every distinct route through the questionnaire;
       - compares two versions (same screens, same data for the same answers?);
       - lists the screens for the dashboard's drop-off chart;
       - lists the kinds of screen ("question types") without their code
         (catalogue: web/config/types.json), and teaches the checks the kinds
         of such a list (loadCatalogue; it also says when the list describes
         a kind differently from the code that runs);
       - says which answers a rule at a screen may test (answersAt): exactly
         what its rule checks accept there, for the control panel's rule and
         jump builders.
     Each finding says where on its screen it is when that is one rule or
     arrow (site: "show_if", "where", "jump" or "next"; a jump's target and
     its place in "next"), so the control panel never reads the messages.
     The check codes (G1 ... C2, and S1: survey.json's own deep_dive, rating
     and support settings disagreeing with a graph, which phones follow) and
     the format are in docs/flow-engine.md, sections 2 and 6. Codes and
     answer keys are always looked up as an object's OWN keys, so a legal
     code such as "constructor" is an ordinary code. What each kind of
     screen allows (its settings, what a rule can test, what it sends, its
     default texts) is never written here: it comes from the kinds' own
     descriptions (PP.types, web/js/flow.js and web/js/types/), so a new
     kind needs no change in this file.

   WHO USES IT (never the partners' phones: web/index.html does not load it)
     - The command line: node scripts/flow.js check | map | simulate | paths |
       compare | screens   (or python3 scripts/flow.py ..., which explains
       what to do when Node.js is missing).
     - The settings check, python3 scripts/check_config.py, which GitHub runs
       before every deployment: errors stop the deployment.
     - The control panel (its window and Publish), through the generated
       apps-script/Flow.gs.

   ONE ENGINE
     This file never decides on its own which screen comes next. Every route
     comes from the form's own engine, web/js/flow.js (PP.flow), which must be
     loaded first. So the checker, the map, the simulator and the phones can
     never disagree.

   READS / WRITES
     Only what it is given: the questionnaire (web/config/survey.json or a
     published version), the texts (web/i18n/strings.json) and options. It
     writes, draws on screen and stores nothing.

   HOW TO TEST IT (Terminal, in the project folder)
     node tests/flow/check_test.js     every check code on small fake cases
     node tests/flow/sim_test.js       the command line built on it

   ES5 only (no let, const, arrows, template strings, ?. or ??) and no browser
   or Node features: it must also run inside Google Apps Script.
   ============================================================================= */
(function (root) {
  'use strict';

  var PP = root.PP = root.PP || {};
  var api = PP.flowCheck = {};
  api.VERSION = 1;

  /* ---- the rules' numbers (docs/flow-engine.md 2 and 6) ------------------- */
  var CODE_RE = /^[a-z][a-z0-9_]*$/;              // permanent codes: ids, options, chips
  var NAME_RE = /^[a-z_][a-z0-9_]*$/;             // loop variable names ({area})
  var REF_RE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;   // "area" or "area.threshold"
  var TPL_RE = /\{([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?\}/g;   // the engine's template pattern
  var NUMBER_TEXT_RE = /^\s*-?\d+(\.\d+)?\s*$/;
  var MAX_ID = 60;                                // an id
  var MAX_KEY = 80;                               // an answer key = screen name in pings (Code.gs)
  var LIMITS = { answers: 100, ratings: 64, free_text: 64 };   // Code.gs MAX_ANSWER_KEYS, MAX_LIST_ITEMS
  var MAX_SCREENS = 40;                           // the 90-second target
  var WALK_CAP = 4096;                            // answer sets tried by the "never shown" check
  var FACTS = ['lang', 'lang_in_url', 'whats_changed_count', 'round'];
  var TESTS = ['equals', 'not_equals', 'at_most', 'at_least', 'in', 'answered'];
  var SUBJECTS = ['answer', 'fact', 'var'];
  var DEFAULT_LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
  var LANG_NAMES = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam' };
  var TRANSLATE_TAG = '[TRANSLATE]';
  var SYMBOLS = { equals: '==', not_equals: '!=', at_most: '<=', at_least: '>=', 'in': 'in' };
  var FACT_WORDS = { lang: 'language', lang_in_url: 'language in the link', whats_changed_count: '"what changed" items', round: 'round' };

  /* The list format (today's "flow": [...]): the fields a line may have. Its
     kinds of line are the "row" of each kind of screen in the catalogue. */
  var LIST_KEY_FIELDS = ['text', 'low_label', 'high_label', 'scale_hint', 'body'];
  var LIST_FIELDS = ['id', 'type', 'required', 'show_if', 'skip_if', 'options'].concat(LIST_KEY_FIELDS);

  /* The graph format: the fields every node may have, and a group's
     (docs/flow-engine.md 2.1). What each KIND of screen adds (its own fields,
     what a rule can test, what it sends, the texts it shows by default) is
     never written here: it comes from the type catalogue (see "The kinds of
     screen" below). KEY_FIELDS: the engine's text fields (web/js/flow.js), in
     the order they are checked. */
  var COMMON_FIELDS = ['id', 'type', 'store_as', 'show_if', 'repeat_for', 'next', 'required', 'text', 'help', 'label'];
  var GROUP_FIELDS = ['id', 'type', 'repeat_for', 'body', 'next', 'show_if'];
  var KEY_FIELDS = ['text', 'label', 'help', 'low_label', 'high_label', 'scale_hint', 'body', 'detail_text', 'detail_text_required'];
  /* The texts a screen shows when its node sets none (a kind's "texts"), in the order they are listed. */
  var DEFAULT_FIELDS = ['text', 'body', 'label', 'help', 'detail_text', 'detail_text_required'];
  var DEFAULT_WHY = { text: 'the title of', body: 'the body of', label: 'the label of', help: 'the help line of',
    detail_text: 'the "tell us more" line of', detail_text_required: 'the "tell us more" line of' };

  /* ---- small helpers -------------------------------------------------------- */
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function own(o, k) { return o !== null && o !== undefined && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function names(o) {   // the fields of a { } group, without notes (names starting with _)
    return isObj(o) ? Object.keys(o).filter(function (k) { return k.charAt(0) !== '_'; }) : [];
  }
  function isText(x) { return typeof x === 'string' && x.trim() !== ''; }
  function isVarRef(x) { return isObj(x) && typeof x['var'] === 'string'; }
  function isScalar(x) { return typeof x === 'string' || typeof x === 'boolean' || (typeof x === 'number' && isFinite(x)); }
  function copyJson(x) { try { var s = JSON.stringify(x); return s === undefined ? undefined : JSON.parse(s); } catch (e) { return undefined; } }
  function extend(a, name, value) { var out = {}; Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; }); out[name] = value; return out; }
  function idOf(item) { return isObj(item) ? item.id : item; }
  function q(x) { return '"' + x + '"'; }
  function show(v) {
    if (v === undefined) return 'missing';
    var s;
    try { s = JSON.stringify(v); } catch (e) { s = String(v); }
    if (s === undefined) s = String(v);
    return s.length <= 60 ? s : s.slice(0, 57) + '...';
  }
  function kindOf(v) {
    if (v === undefined) return 'missing';
    if (v === null) return 'null (empty)';
    if (typeof v === 'boolean') return 'true/false';
    if (typeof v === 'number') return 'a number';
    if (typeof v === 'string') return 'text';
    if (Array.isArray(v)) return 'a list [ ... ]';
    return 'a group { ... }';
  }
  function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }
  function quoted(list, limit) {
    limit = limit || 8;
    var shown = list.slice(0, limit).map(q).join(', ');
    return list.length > limit ? shown + ' and ' + (list.length - limit) + ' more' : shown;
  }
  function orList(list) {
    var qs = list.map(q);
    return qs.length < 2 ? qs.join('') : qs.slice(0, -1).join(', ') + ' or ' + qs[qs.length - 1];
  }
  function uniq(list) { var out = []; list.forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); }); return out; }
  /* The list kept under a key of a { } used as a map. Own keys only: a code such as "constructor" must
     never find what every { } inherits. */
  function bucket(map, key) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) map[key] = [];
    return map[key];
  }
  function lookup(obj, dotted) {
    var cur = obj;
    String(dotted).split('.').forEach(function (k) { cur = isObj(cur) ? own(cur, k) : undefined; });
    return cur;
  }
  /* JSON with its keys sorted: the same data written in another order compares equal. */
  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (isObj(x)) return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(x[k]); }).join(',') + '}';
    var s = JSON.stringify(x);
    return s === undefined ? 'null' : s;
  }
  function placeholders(tpl) {   // ["area", ...] used in a template like "fn_rating:{area}"
    var out = [];
    if (typeof tpl !== 'string') return out;
    tpl.replace(TPL_RE, function (m, name) { if (out.indexOf(name) === -1) out.push(name); return m; });
    return out;
  }
  function distance(a, b) {   // edit distance, for "Did you mean ...?"
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function didYouMean(word, choices) {
    if (typeof word !== 'string' || !word) return '';
    var best = null, bestD = Infinity;
    arr(choices).forEach(function (c) {
      if (typeof c !== 'string' || c === word) return;
      var d = distance(word.toLowerCase(), c.toLowerCase());
      if (d < bestD) { bestD = d; best = c; }
    });
    var limit = best === null ? 0 : Math.max(1, Math.floor(Math.max(word.length, best.length) * 0.3));
    return best !== null && bestD <= limit ? ' Did you mean ' + q(best) + '?' : '';
  }
  function random(seed) {   // a small repeatable random generator (same answers on every run)
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul ? Math.imul(t ^ (t >>> 15), t | 1) : (t ^ (t >>> 15)) * (t | 1);
      t ^= t + (Math.imul ? Math.imul(t ^ (t >>> 7), t | 61) : (t ^ (t >>> 7)) * (t | 61));
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function engine() {
    var f = PP.flow;
    if (!f || typeof f.path !== 'function' || typeof f.load !== 'function' || !(f.ENGINE >= 2)) {
      throw new Error('flowCheck: load web/js/flow.js (PP.flow, engine 2 or newer) before web/js/flow-check.js');
    }
    return f;
  }

  /* ---- the kinds of screen: the type catalogue ----------------------------------
     Every kind of screen is described ONCE, where the form registers it
     (PP.types: the built-in kinds in web/js/flow.js, new ones in
     web/js/types/; docs/flow-engine.md 3). This checker keeps no list of
     kinds: it reads those descriptions. The command line and the control
     panel also load web/config/types.json (the same descriptions without
     code, written by  node scripts/flow.js types --write) for kinds whose
     code they do not run: see loadCatalogue below. */
  function registry() {
    var T = PP.types;
    if (!T || typeof T.get !== 'function' || typeof T.list !== 'function' || typeof T.register !== 'function') {
      throw new Error('flowCheck: load web/js/flow.js with its type catalogue (PP.types, 26 Oct 2026 or newer) before web/js/flow-check.js');
    }
    return T;
  }
  function typeSpec(type) { return typeof type === 'string' ? registry().get(type) : undefined; }
  function fieldsOf(d) { return isObj(d) && isObj(d.fields) ? d.fields : {}; }
  function fieldKind(d, f) { var x = own(fieldsOf(d), f); return isObj(x) ? x.kind : undefined; }
  function labelOf(d, type) { return isObj(d) && isText(d.label) ? d.label : String(type); }
  function flag(d, name) { return isObj(d) && isObj(d.flags) && d.flags[name] === true; }
  function textsOf(d) { return isObj(d) && isObj(d.texts) ? d.texts : {}; }
  /* A default text key filled for this screen, or null while a loop item it names is missing. */
  function filledText(F, tpl, vars) {
    if (!isText(tpl)) return null;
    var key = F.fill(tpl, vars || {});
    return placeholders(key).length ? null : key;
  }
  /* Is the answer of a node required? The engine's rule (PP.types.isRequired). */
  function isRequired(d, node, field) { return registry().isRequired(d, node, field); }
  /* The kinds of line of the list format, and the Screens tab's rows: each kind's "row". */
  function rowKinds() {
    var T = registry(), out = [];
    T.list().forEach(function (type) {
      var d = T.get(type);
      if (isObj(d) && isObj(d.row)) out.push({ type: isText(d.row.type) ? d.row.type : type, spec: d, row: d.row });
    });
    return out;
  }

  /* Rules as people read them: "nps >= 9", "support_gate == yes".
     m (optional): the model of the questionnaire the rule belongs to. With
     it, a rule on the answer of a pick-several question (multi_choice: the
     list of the codes ticked) is written the way the engine tests it
     (flow.js evalCondition, 28 Oct 2026), not as if the answer were one code
     (30 Oct 2026):
       equals         "areas includes load"
       not_equals     "areas does not include load"
       in             "areas includes one of [load, app]"
       answered true  "areas has at least one tick"; false: "areas has no tick"
     Every other answer, a fact, a loop item, and any rule written without
     the model keep ==, !=, <=, >=, in and exists, exactly as before. */
  var TICK_WORDS = { equals: 'includes', not_equals: 'does not include', 'in': 'includes one of' };
  function valueText(v) {
    if (isVarRef(v)) return v['var'];
    if (Array.isArray(v)) return '[' + v.map(valueText).join(', ') + ']';
    return typeof v === 'string' ? v : String(v);
  }
  function sentence(c, m) {
    if (!isObj(c)) return '(no rule)';
    if (Array.isArray(c.all)) return c.all.map(function (x) { return inner(x, m); }).join(' AND ');
    if (Array.isArray(c.any)) return c.any.map(function (x) { return inner(x, m); }).join(' OR ');
    if (isObj(c.not)) return 'NOT (' + sentence(c.not, m) + ')';
    var n = names(c).length;
    if (c.fact === 'lang_in_url' && c.equals === false && n === 2) return 'the link has no ?lang=';
    if (c.fact === 'whats_changed_count' && c.at_least === 1 && n === 2) return 'the round has "what changed" items';
    var subject = has(c, 'answer') ? String(c.answer) : has(c, 'fact') ? (own(FACT_WORDS, c.fact) || String(c.fact)) :
      has(c, 'var') ? String(c['var']) : '?';
    var ticks = has(c, 'answer') && ticked(m, c.answer);
    var tests = Object.keys(SYMBOLS);
    for (var i = 0; i < tests.length; i++) {
      if (has(c, tests[i])) return subject + ' ' + (ticks && has(TICK_WORDS, tests[i]) ? TICK_WORDS[tests[i]] : SYMBOLS[tests[i]]) + ' ' + valueText(c[tests[i]]);
    }
    if (has(c, 'answered')) {
      if (ticks) return subject + (c.answered === true ? ' has at least one tick' : ' has no tick');
      return subject + (c.answered === true ? ' exists' : ' not exists');
    }
    return subject + ' ?';
  }
  function inner(x, m) { return isObj(x) && (Array.isArray(x.all) || Array.isArray(x.any)) ? '(' + sentence(x, m) + ')' : sentence(x, m); }
  /* Is this answer (a key, or a template with loop items such as "reasons:{area}") the answer of a
     pick-several question? The model knows which screen stores each answer key (m.producers) and
     what its kind sends (answerKind: "multi"). The screens that store exactly this key or template
     as their own answer (their "store_as", else their id) decide. Only when there are none: a
     template counts when every key it can become is one (review of 30 Oct 2026: with a pick-several
     "{area}_why" and a pick-one "other_why", the pattern alone also took "other_why" in). */
  function ticked(m, tpl) {
    if (!isObj(m) || !m.ok || !isObj(m.producers) || typeof tpl !== 'string') return false;
    var mine = storersOf(m, tpl);
    if (mine.length) return mine.every(function (inst) { return isMulti(inst, inst.id); });
    var keys = has(m.producers, tpl) ? [tpl] : keysLike(m, tpl);
    return keys.length > 0 && keys.every(function (key) {
      var prods = own(m.producers, key) || [];
      return prods.length > 0 && isMulti(prods[0], key);
    });
  }
  function isMulti(inst, key) {
    var kind = answerKind(inst, key);
    return Boolean(kind && kind.multi);
  }
  /* The screens (each time the flow shows one) whose own answer is stored under exactly this key or
     template: "{area}_why" -> the screen with store_as "{area}_why", once per area. Templates are
     compared by their shape, whatever the item is called: "{fn}_why" and "{area.id}_why" both find
     the screen that stores "{area}_why", since the engine fills each with the loop's item (second
     review of 30 Oct 2026); a plain key like "other_why" has no {..} and never matches one. */
  function shapeOf(t) { return String(t).replace(TPL_RE, '{}'); }
  function storersOf(m, tpl) {
    var want = shapeOf(tpl);
    return arr(m.inst).filter(function (inst) {
      var n = inst.entry.node;
      return shapeOf(n.store_as || n.id) === want && inst.stored.indexOf(inst.id) !== -1;
    });
  }
  /* The stored answer keys a template can become: "reasons:{area}" -> "reasons:payments", ... (each
     {item} or {item.field} stands for any text). [] for a plain key. */
  function keysLike(m, tpl) {
    var parts = [], last = 0;
    tpl.replace(TPL_RE, function (match, name, field, at) { parts.push(tpl.slice(last, at)); last = at + match.length; return match; });
    if (!parts.length) return [];
    parts.push(tpl.slice(last));
    var re = new RegExp('^' + parts.map(function (p) { return p.replace(/[\\^$.*+?()[\]{}|\/]/g, '\\$&'); }).join('[\\s\\S]+') + '$');
    return Object.keys(m.producers).filter(function (key) { return re.test(key); });
  }
  /* sentence(cond, survey?) -> the rule in words. survey (optional): the
     questionnaire the rule belongs to, with its "flow"; then a rule on a
     pick-several answer says "includes" (above). Without it, exactly as
     before 30 Oct 2026. sentenceFor(survey) -> function (cond): the same,
     reading the questionnaire once, for many rules (the control panel's
     text outline of the Map). A questionnaire that cannot be read gives the
     plain wording, never an error. */
  api.sentence = function (cond, survey) { return sentence(cond, survey === undefined ? null : modelOrNull(survey)); };
  api.sentenceFor = function (survey) {
    var m = modelOrNull(survey);
    return function (cond) { return sentence(cond, m); };
  };
  function modelOrNull(survey) {
    if (!isObj(survey)) return null;
    try {
      var m = model(survey);
      return m.ok ? m : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------------------
     The model: the flow loaded by the engine, indexed for the checks.
       entries   every node (group bodies included), in display order
       lists     the top level and each group body, with their ids
       out       the arrows, between "e<n>" (a node) and "x<n>" (the end of a
                 pass through group n)
       inst      every screen the flow can show, in display order: the
                 engine's own steps when every screen is shown once
     ------------------------------------------------------------------------- */
  function model(survey) {
    var F = engine();
    var m = { F: F, survey: isObj(survey) ? survey : {}, ok: false };
    var flowValue = m.survey.flow;
    m.legacy = Array.isArray(flowValue);
    if (!isObj(survey) || !F.supportsFormat(flowValue)) return m;
    m.graph = F.load(m.survey);
    m.ok = true;
    var langs = arr(m.survey.languages).map(function (l) { return isObj(l) && isText(l.code) ? l.code : null; }).filter(Boolean);
    m.languages = langs.length ? uniq(langs) : DEFAULT_LANGS.slice();
    m.fallback = m.languages.indexOf(m.survey.fallback_language) !== -1 ? m.survey.fallback_language : 'en';
    m.entries = [];
    m.lists = [];
    function visit(nodes, parent, outer) {
      var list = { owner: parent, map: {}, entries: [] };
      m.lists.push(list);
      arr(nodes).forEach(function (n) {
        if (!isObj(n)) return;
        var rf = isObj(n.repeat_for) && typeof n.repeat_for.each === 'string' ? n.repeat_for : null;
        var inner2 = rf ? outer.concat([rf]) : outer;
        var e = { idx: m.entries.length, node: n, id: typeof n.id === 'string' && n.id ? n.id : null, type: n.type,
          parent: parent, outer: outer, inner: inner2, rf: rf, group: n.type === 'group', list: list, insts: [] };
        m.entries.push(e);
        list.entries.push(e);
        if (e.id !== null) list.map[e.id] = e;   // the last one wins, as in the engine
        if (e.group && isObj(n.body)) e.body = visit(n.body.nodes, e, inner2);
      });
      return list;
    }
    m.top = visit(m.graph.nodes, null, []);
    m.entries.forEach(function (e) {
      e.targets = targetsOf(e.node).map(function (t) { t.res = resolve(e, t.to); return t; });
      e.start = e.group && e.body && isObj(e.node.body) ? own(e.body.map, e.node.body.start) : undefined;
    });
    m.startEntry = typeof m.graph.start === 'string' ? own(m.top.map, m.graph.start) : undefined;
    arrows(m);
    expand(m);
    m.sites = [];
    m.entries.forEach(function (e) { sitesOf(e).forEach(function (s) { m.sites.push(s); }); });
    return m;
  }

  /* Every arrow out of a node: "next", each jump, the default. i = its place
     in the "next" list (inList: false for a plain "next": "<id>"). */
  function targetsOf(n) {
    var out = [];
    if (typeof n.next === 'string') out.push({ to: n.next, def: true, when: undefined, i: 0, inList: false });
    else if (Array.isArray(n.next)) {
      n.next.forEach(function (x, i) {
        if (!isObj(x)) return;
        if (has(x, 'default')) out.push({ to: x['default'], def: true, when: undefined, i: i, inList: true });
        else if (has(x, 'goto')) out.push({ to: x['goto'], def: false, when: x.when, i: i, inList: true, noWhen: !has(x, 'when') });
      });
    }
    return out;
  }
  /* Where an arrow lands, the way the engine looks it up: in the node's own
     list first, then in the lists around it (leaving a loop early). */
  function resolve(e, to) {
    if (to === '@next_item') return e.parent ? { kind: 'pass_end', group: e.parent } : { kind: 'bad_next_item' };
    if (typeof to !== 'string' || !to) return { kind: 'missing' };
    for (var list = e.list; list; list = list.owner ? list.owner.list : null) {
      var t = own(list.map, to);
      if (t) return { kind: 'entry', entry: t, leaves: list !== e.list };
    }
    return { kind: 'missing' };
  }
  function vertexOf(res) {
    if (res.kind === 'entry') return 'e' + res.entry.idx;
    if (res.kind === 'pass_end') return 'x' + res.group.idx;
    return null;
  }
  function itemsOf(m, rf) { return rf ? m.F.items(m.graph, m.survey, rf['in']) : []; }

  /* The arrows as a graph. A group: into its body, and from the end of its
     last pass to its "next"; straight to its "next" too when it may be
     skipped (a rule, a filter, or nothing to repeat over). */
  function arrows(m) {
    var out = {};
    function add(a, b, kind) { (out[a] = out[a] || []).push({ to: b, kind: kind }); }
    m.entries.forEach(function (e) {
      var v = 'e' + e.idx;
      var dests = e.targets.map(function (t) { return { v: vertexOf(t.res), t: t }; }).filter(function (d) { return d.v; });
      if (e.group) {
        if (e.start) add(v, 'e' + e.start.idx, 'enter');
        var skippable = e.node.show_if !== undefined || !e.start || (e.rf && (e.rf.where !== undefined || !itemsOf(m, e.rf).length));
        dests.forEach(function (d) {
          add('x' + e.idx, d.v, 'after');
          if (skippable) add(v, d.v, 'skip');
        });
      } else if (!m.F.isEnd(e.node) || e.node.show_if !== undefined) {   // an ending stops: its arrows count only when it is skipped
        dests.forEach(function (d) { add(v, d.v, d.t.res.leaves ? 'leave' : 'next'); });
      }
    });
    m.out = out;
    m.reachCache = {};
  }
  function reach(m, from, to, skipKinds) {   // is there an arrow path from vertex "from" to vertex "to"?
    var key = from + '|' + (skipKinds || '');
    var seen = m.reachCache[key];
    if (!seen) {
      seen = {};
      var stack = (m.out[from] || []).slice();
      while (stack.length) {
        var edge = stack.pop();
        if (skipKinds && skipKinds.indexOf(edge.kind) !== -1) continue;
        if (seen[edge.to]) continue;
        seen[edge.to] = true;
        (m.out[edge.to] || []).forEach(function (x) { stack.push(x); });
      }
      m.reachCache[key] = seen;
    }
    return Boolean(seen[to]);
  }
  function reachableFrom(m, start, avoid) {   // every vertex reachable from "start" without passing "avoid"
    var seen = {};
    if (!start || start === avoid) return seen;
    seen[start] = true;
    var stack = [start];
    while (stack.length) {
      (m.out[stack.pop()] || []).forEach(function (edge) {
        if (edge.to === avoid || seen[edge.to]) return;
        seen[edge.to] = true;
        stack.push(edge.to);
      });
    }
    return seen;
  }

  /* Every screen the flow can show, in display order, made by the engine
     itself: a copy of the flow in which every node is shown once (rules and
     filters taken out, endings made ordinary) is walked by PP.flow.path. */
  function expand(m) {
    var F = m.F;
    function copyOf(list, after) {
      var nodes = list.entries.map(function (e) {
        var s;
        if (e.group) {
          var kids = e.body ? copyOf(e.body, '@next_item') : [];
          s = { id: 's' + e.idx, type: 'group', body: { start: kids.length ? kids[0].id : '@next_item', nodes: kids } };
        } else {
          s = copyJson(e.node) || {};
          delete s.show_if;
          s.store_as = e.node.store_as || e.node.id;
          s.id = 's' + e.idx;
          s.type = 'pp_check_screen';
          // options given as plain codes are labelled with the node's own id
          // ("choice.<id>.<code>", docs/flow-engine.md 3); keep that label in the copy
          if (Array.isArray(s.options)) {
            s.options = s.options.map(function (o) { return isObj(o) ? o : { code: o, text: 'choice.' + e.node.id + '.' + o }; });
          }
        }
        delete s.repeat_for;
        if (e.rf) s.repeat_for = { each: e.rf.each, 'in': e.rf['in'] };
        s.pp_check = e.idx;
        return s;
      });
      nodes.forEach(function (s, i) { s.next = i + 1 < nodes.length ? nodes[i + 1].id : after; });
      return nodes;
    }
    var nodes = copyOf(m.top, undefined);
    var g = { format: F.FORMAT, start: nodes.length ? nodes[0].id : undefined, collections: copyJson(m.graph.collections) || {}, nodes: nodes };
    var steps = [];
    m.tooBig = false;
    try { steps = F.path(g, m.survey, { facts: {} }, { answers: {}, texts: {}, audio: {} }); } catch (err) { m.tooBig = true; }
    m.inst = [];
    steps.forEach(function (st) {
      var e = isObj(st.node) && typeof st.node.pp_check === 'number' ? m.entries[st.node.pp_check] : null;
      if (!e) return;   // the engine's own closing thank-you
      var spec = typeSpec(e.type);
      var stored = spec && isObj(spec.answer) ? F.keysOf(m.graph, m.survey, e.node, st.vars) : [];
      if (stored.length && spec.answer.kind === 'rows') stored = stored.slice(1);   // a block of rows: its own id stores nothing
      var inst = { entry: e, vars: st.vars || {}, id: st.id, keys: st.keys || {}, stored: stored, n: m.inst.length };
      m.inst.push(inst);
      e.insts.push(inst);
    });
    m.producers = {};
    m.inst.forEach(function (inst) {
      inst.stored.forEach(function (k) { bucket(m.producers, k).push(inst); });
    });
  }

  /* The places where a node has rules: show_if, the loop filter, each jump.
     A site's "at" is where its findings are (site, target, index: see
     place()). Two jumps of one node to the same screen are told apart by
     their number in its "next" list, as the arrow checks number them. */
  function sitesOf(e) {
    var out = [];
    function add(kind, cond, loops, label, t, at) {
      var p = parseCond(cond);
      out.push({ e: e, kind: kind, cond: cond, loops: loops, label: label, target: t, at: at, leaves: p.leaves, problems: p.problems });
    }
    if (e.node.show_if !== undefined) add('show_if', e.node.show_if, e.outer, 'its rule ("show only if")', undefined, place('show_if'));
    if (e.rf && e.rf.where !== undefined) add('where', e.rf.where, e.inner, 'its "repeat for" filter ("where")', undefined, place('where'));
    var jumps = e.targets.filter(function (t) { return !t.def && t.when !== undefined; });
    jumps.forEach(function (t) {
      var twin = jumps.some(function (x) { return x !== t && x.to === t.to; });
      add('when', t.when, e.outer, twin ? 'its jump ' + (t.i + 1) + ' (to ' + q(t.to) + ')' : 'its jump to ' + q(t.to), t, place('jump', t.to, t.i));
    });
    return out;
  }

  /* A rule, taken apart: its single tests ("leaves") and what is wrong with
     its shape (R2). The grammar is docs/flow-engine.md 2.3. */
  function parseCond(cond) {
    var out = { leaves: [], problems: [] };
    function bad(path, text) { out.problems.push({ path: path, text: text }); }
    (function walk(x, path) {
      if (!isObj(x)) { bad(path, 'is ' + kindOf(x) + ', but a rule must be a group like {"answer": "support_gate", "equals": "yes"}.'); return; }
      var keys = names(x);
      var comb = keys.filter(function (k) { return k === 'all' || k === 'any' || k === 'not'; });
      if (comb.length) {
        var k = comb[0];
        if (keys.length !== 1) { bad(path, ': "' + k + '" must be alone inside its { }. Put the other tests inside it, like {"' + k + '": [rule, rule]}.'); return; }
        if (k === 'not') {
          if (!isObj(x.not)) bad(path + ' > not', 'must be one rule, like {"not": {"answer": "nps", "at_most": 6}}.');
          else walk(x.not, path + ' > not');
          return;
        }
        if (!Array.isArray(x[k]) || !x[k].length) { bad(path + ' > ' + k, 'must be a list [ ... ] with at least one rule inside.'); return; }
        x[k].forEach(function (sub, i) { walk(sub, path + ' > ' + k + ' > rule ' + (i + 1)); });
        return;
      }
      var subjects = keys.filter(function (k2) { return SUBJECTS.indexOf(k2) !== -1; });
      var tests = keys.filter(function (k2) { return SUBJECTS.indexOf(k2) === -1; });
      if (subjects.length !== 1) {
        bad(path, subjects.length ? 'tests ' + subjects.map(q).join(' and ') + ' at once: a rule tests one thing. Use {"all": [...]} to combine tests.' :
          'must say what it tests: "answer" (an earlier answer), "fact" (lang, lang_in_url, whats_changed_count, round) or "var" (a loop item), for example {"answer": "support_gate", "equals": "yes"}.');
        return;
      }
      var subj = subjects[0];
      if (tests.length !== 1) {
        bad(path, 'must have exactly one test next to "' + subj + '" (one of: ' + TESTS.join(', ') + ').' +
          (tests.length ? ' It has ' + tests.length + ': ' + tests.join(', ') + '.' : '') + ' To combine tests, use {"all": [...]} or {"any": [...]}.');
        return;
      }
      var test = tests[0];
      if (TESTS.indexOf(test) === -1) { bad(path, ': ' + q(test) + ' is not a test the form knows.' + didYouMean(test, TESTS) + ' Use one of: ' + TESTS.join(', ') + '.'); return; }
      if (subj === 'fact' && FACTS.indexOf(x.fact) === -1) { bad(path, ': the fact ' + show(x.fact) + ' does not exist.' + didYouMean(x.fact, FACTS) + ' Use one of: ' + FACTS.join(', ') + '.'); return; }
      if (subj === 'answer' && !isText(x.answer)) { bad(path, ': "answer" must be the code of an earlier answer in double quotes, for example "support_gate".'); return; }
      if (subj === 'var' && (typeof x['var'] !== 'string' || !REF_RE.test(x['var']))) { bad(path, ': "var" must name a loop item, like "area" or "area.threshold".'); return; }
      var v = x[test];
      if (test === 'answered' && typeof v !== 'boolean') { bad(path, ': "answered" must be true or false, without quotes. Written as "false" in quotes, it would count as true.'); return; }
      if (test === 'in' && (!Array.isArray(v) || !v.length)) { bad(path, ': "in" needs a list of possible values in square brackets, for example ["yes"].'); return; }
      if ((test === 'at_most' || test === 'at_least') && !isVarRef(v) && !(typeof v === 'number' && isFinite(v)) && !(typeof v === 'string' && NUMBER_TEXT_RE.test(v))) {
        bad(path, ': "' + test + '" needs a number (without quotes), but it is ' + show(v) + '.'); return;
      }
      if ((test === 'equals' || test === 'not_equals') && !isScalar(v) && !isVarRef(v)) { bad(path, ': "' + test + '" needs one value (text, a number, true or false), but it is ' + kindOf(v) + '.'); return; }
      if (test === 'in' && v.some(function (y) { return !isScalar(y) && !isVarRef(y); })) { bad(path, ': every value in "in" must be text, a number, true or false.'); return; }
      var refs = [];
      if (subj === 'var') refs.push(x['var']);
      (test === 'in' ? v : [v]).forEach(function (y) { if (isVarRef(y)) refs.push(y['var']); });
      out.leaves.push({ cond: x, path: path, subj: subj, test: test, refs: refs });
    }(cond, ''));
    return out;
  }

  /* All combinations of loop items for a list of loops: [{area: item}, ...]. */
  function combos(m, loops) {
    var list = [{}];
    loops.forEach(function (rf) {
      var items = itemsOf(m, rf);
      var next = [];
      list.forEach(function (vars) { items.forEach(function (item) { next.push(extend(vars, rf.each, item)); }); });
      list = next;
    });
    return list;
  }

  /* What a rule can test about an answer key, from the screen that stores it:
     its kind's "answer" in the catalogue. { what, num, min, max, na, values,
     text, detail, skip (it may be left blank) }, or null (nothing to test). */
  function answerKind(inst, key) {
    var n = inst.entry.node, d = typeSpec(n.type), k = inst.keys || {};
    var a = d && isObj(d.answer) ? d.answer : null;
    if (a && a.kind === 'rows') a = k.comment && k.comment.key === key ? a.comment : a.rows;   // a block: its rows, or its comment
    if (!isObj(a)) return null;
    var out = { what: (isText(a.what) ? a.what : 'the answer to') + ' ' + q(key) };
    if (a.kind === 'number') {
      out.num = true;
      out.min = a.min;
      out.max = a.max;
      if (isText(a.na_by)) out.na = n[a.na_by] === true;
    } else if (a.kind === 'choice' || a.kind === 'choices') {
      out.values = Array.isArray(a.values) ? a.values.map(String) : arr(k.options).map(function (o) { return String(o.code); });
      // "choices" (pick several, 28 Oct 2026): the answer is the list of codes ticked; a rule's
      // "equals" means "is one of them" (flow.js evalCondition), so the same values are allowed.
      if (a.kind === 'choices') out.multi = true;
    } else if (a.kind === 'text') {
      out.text = true;
    } else {
      return null;
    }
    if (a.detail === true) out.detail = true;   // a choice with a "tell us more" box (the problem screens)
    var by = has(a, 'required_by') ? a.required_by : 'required';
    out.skip = a.optional === true || (by !== null && !isRequired(d, n, by));
    return out;
  }

  /* ===========================================================================
     check(survey, strings, opts) -> { findings, stats }
     ======================================================================== */
  function Ctx(m, strings, opts) {
    this.m = m;
    this.F = m.F;
    this.survey = m.survey;
    this.strings = isObj(strings) ? strings : null;
    this.opts = isObj(opts) ? opts : {};
    this.panel = this.opts.surface === 'panel';
    this.hidden = {};
    var self = this;
    arr(this.opts.hiddenCodes).forEach(function (c) { if (typeof c === 'string') self.hidden[c] = true; });
    this.findings = [];
    this.seen = {};
    this.quiet = {};   // node ids whose "never reached" is already explained
    this.stats = { answers: 0, ratings: 0, free_text: 0, longest_path: 0 };
  }
  /* extra (optional): where on the node the finding is (place(), below):
     { site, target, index }, copied onto the finding when given. */
  Ctx.prototype.add = function (level, code, node, message, extra) {
    var id = isObj(node) ? (typeof node.id === 'string' ? node.id : null) : (typeof node === 'string' ? node : null);
    var sig = level + '|' + code + '|' + id + '|' + message;
    if (own(this.seen, sig) === true) return;
    this.seen[sig] = true;
    var f = { level: level, code: code, node: id, message: message };
    if (isObj(extra)) {
      ['site', 'target', 'index'].forEach(function (k) { if (extra[k] !== undefined) f[k] = extra[k]; });
    }
    this.findings.push(f);
  };
  /* Where on a node a finding is, for the control panel (so it never has to
     read the messages): site = "show_if" (its rule), "where" (its loop
     filter), "jump" (one of its jumps: target = where it goes, index = its
     place in the node's "next" list, 0 = first) or "next" (its usual arrow:
     a plain "next", or the "default" of its jump list; target = where it
     goes). The rule checks R1-R5 say show_if, where or jump; the arrow checks
     (G2, G4, L2, C2, and F2 on a line of a jump list) say jump or next. */
  function place(site, target, index) {
    var out = { site: site };
    if (typeof target === 'string') out.target = target;
    if (typeof index === 'number') out.index = index;
    return out;
  }
  function arrowSite(t) { return place(t.def ? 'next' : 'jump', t.to, t.inList ? t.i : undefined); }
  Ctx.prototype.name = function (node) {
    if (typeof this.opts.nameOf === 'function') {
      try { var given = this.opts.nameOf(node); if (isText(given)) return given; } catch (e) { /* use the plain name */ }
    }
    if (!isObj(node)) return 'a screen';
    var kind = node.type === 'group' ? 'group' : 'screen';
    return typeof node.id === 'string' && node.id ? kind + ' ' + q(node.id) : 'a ' + kind + ' without an id';
  };
  function Name(c, node) { var s = c.name(node); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* Panel only: is this code switched off (opts.hiddenCodes)? Own keys only, so a code like
     "constructor" is never mistaken for one. */
  function isHidden(c, code) { return typeof code === 'string' && own(c.hidden, code) === true; }
  /* Panel only: does this answer belong to something switched off: the key itself, or the code
     before or after its ":" (a hidden question's own code, a hidden area or support question)? */
  function hiddenAnswer(c, key) {
    if (!c.panel || typeof key !== 'string') return false;
    if (isHidden(c, key)) return true;
    var at = key.indexOf(':');
    return at > 0 && (isHidden(c, key.slice(0, at)) || isHidden(c, key.slice(at + 1)));
  }

  api.check = function (survey, strings, opts) {
    var m = model(survey);
    var c = new Ctx(m, strings, opts);
    if (!usable(c, survey)) return result(c);
    if (m.legacy) listShape(c); else graphShape(c);
    if (!m.legacy) arrowChecks(c);
    codeChecks(c);
    ruleChecks(c);
    orderChecks(c);
    textChecks(c);
    sizeChecks(c);
    neverShown(c);
    if (!c.panel) settingsChecks(c);
    if (c.panel) panelChecks(c);
    return result(c);
  };

  function result(c) {
    var rank = { error: 0, warning: 1, info: 2 };
    var list = c.findings.map(function (f, i) { return { f: f, i: i }; });
    list.sort(function (a, b) { return (rank[a.f.level] - rank[b.f.level]) || (a.i - b.i); });
    return { findings: list.map(function (x) { return x.f; }), stats: c.stats };
  }

  function usable(c, survey) {
    var F = c.F;
    if (!isObj(survey)) { c.add('error', 'G4', null, 'The questionnaire is ' + kindOf(survey) + ', not a { } group, so there is no flow to check.'); return false; }
    var v = survey.flow;
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) {
      c.add('error', 'G4', null, '"flow" (the screens and their order) is missing or empty, so the form has nothing to show. Put it back from the last version that worked.');
      return false;
    }
    if (!F.supportsFormat(v)) {
      c.add('error', 'G4', null, isObj(v) ? '"flow" says "format": ' + show(v.format) + ', but this form reads only "' + F.FORMAT +
        '" (or the older list of screens), so it would ignore this flow and use its own copy. Write "format": "' + F.FORMAT + '".' :
        '"flow" must be a list of screens or a graph {"format": "' + F.FORMAT + '", "start": ..., "nodes": [...]}, but it is ' + kindOf(v) + '.');
      return false;
    }
    return c.m.ok;
  }

  /* ---- the list format (today's "flow": [...]) -------------------------------
     The list has no arrows: each line's own fields are checked here; the
     rest (rules, codes, texts, sizes) on the graph the engine makes of it. */
  function listShape(c) {
    var lines = c.survey.flow;
    var ids = {};
    var thanks = [];
    var byType = {};
    var kinds = rowKinds();   // the kinds of line: each kind of screen's "row" in the catalogue
    var lineTypes = kinds.map(function (r) { return r.type; });
    function kindOfLine(type) { return kinds.filter(function (r) { return r.type === type; })[0]; }
    lines.forEach(function (line, i) {
      var pos = i + 1;
      if (!isObj(line)) { c.add('error', 'F1', null, 'Flow step ' + pos + ' must be a group { ... } with an "id" and a "type", but it is ' + kindOf(line) + '.'); return; }
      var label = 'Flow step ' + pos + (typeof line.id === 'string' ? ' (' + q(line.id) + ')' : '');
      var id = line.id;
      if (typeof id !== 'string' || !CODE_RE.test(id)) {
        c.add('error', 'F1', line, label + ': the id ' + show(id) + ' is not allowed. Use only lowercase letters a-z, digits and _, starting with a letter, for example "one_fix".');
      } else {
        if (id.length > MAX_ID) c.add('error', 'L1', line, label + ': the id is ' + id.length + ' characters long; the most is ' + MAX_ID + '. Use a shorter code (it is stored with every answer).');
        if (has(ids, id)) c.add('error', 'L1', line, label + ': the id ' + q(id) + ' is already used by flow step ' + ids[id] + '. Every screen needs its own id (it is used in the data).');
        else ids[id] = pos;
      }
      var type = line.type;
      var kind = kindOfLine(type);
      if (!kind) {
        c.add('error', 'F1', line, label + (type === undefined ? ' has no "type".' : ' has the type ' + show(type) + ', which is not a screen type the form knows.') +
          didYouMean(type, lineTypes) + ' Use one of: ' + lineTypes.join(', ') + '.');
      } else {
        bucket(byType, type).push({ line: line, pos: pos });
        if (kind.row.needs_text === true && !has(line, 'text')) {
          c.add('error', 'F1', line, label + ': a ' + type + ' screen needs "text": the name of its question in strings.json, for example "text": "q.one_fix".' +
            (type === 'support_block' ? ' Without it the form stops with an error on this screen.' : ''));
        }
        LIST_KEY_FIELDS.forEach(function (f) {
          if (has(line, f) && !isText(line[f])) c.add('error', 'F1', line, label + ': "' + f + '" is ' + show(line[f]) + ', but it must be the name of a text in strings.json, in double quotes.');
        });
        if (arr(kind.row.fields).indexOf('options') !== -1) listOptions(c, line, label);
        if (has(line, 'skip_if')) {
          var allowed = isText(kind.row.skip_if) ? kind.row.skip_if : undefined;
          if (!allowed) c.add('error', 'F1', line, label + ': skip_if only works on the language screen ("lang_in_url") and the what-changed screen ("empty"). Remove it here, or use show_if.');
          else if (line.skip_if !== allowed) c.add('error', 'F1', line, label + ': skip_if is ' + show(line.skip_if) + ', but on a ' + type + ' screen it can only be "' + allowed + '".');
        }
        if (flag(kind.spec, 'end')) {
          thanks.push({ line: line, pos: pos });
          if (has(line, 'show_if')) c.add('warning', 'F2', line, label + ': show_if has no use on the thank-you screen. The form always ends with a thank-you screen anyway, so remove it.');
        }
      }
      if (has(line, 'required') && typeof line.required !== 'boolean') {
        c.add('error', 'F1', line, label + ': required is ' + show(line.required) + ', but it must be true or false (lowercase, without quotes).');
      }
      names(line).forEach(function (k) {
        if (LIST_FIELDS.indexOf(k) === -1) c.add('warning', 'F2', line, label + ' has ' + q(k) + ', which the form does not use, so it has no effect.' + didYouMean(k, LIST_FIELDS) + ' (For a note, start the name with _.)');
      });
    });
    // The list has exactly one ending: a thank-you as its last screen.
    if (!thanks.length) {
      c.add('error', 'G4', null, 'The flow has no thank_you screen. Add {"id": "thanks", "type": "thank_you"} as the very last screen.');
    } else if (thanks.length > 1) {
      c.add('error', 'G4', thanks[1].line, 'The flow has ' + thanks.length + ' thank_you screens (' + thanks.map(function (t) { return 'flow step ' + t.pos; }).join(', ') +
        '). Keep exactly one, as the last screen.');
    } else if (thanks[0].pos !== lines.length) {
      c.add('error', 'G4', thanks[0].line, 'Flow step ' + thanks[0].pos + ' (' + q(thanks[0].line.id) + ') is a thank_you screen, so it must be the last screen of the flow. Move it to the end.');
    }
    var ended = false;   // screens after an unconditional thank-you are never shown: explained above
    lines.forEach(function (line) {
      if (ended && isObj(line) && typeof line.id === 'string') c.quiet[line.id] = true;
      if (isObj(line) && kindOfLine(line.type) && flag(kindOfLine(line.type).spec, 'end') && !has(line, 'show_if')) ended = true;
    });
    // "immediate" mode: each problem screen follows its own rating; the problem-screens line is ignored
    var dd = isObj(c.survey.deep_dive) ? c.survey.deep_dive : {};
    var dl = byType.function_deep_dives && byType.function_deep_dives[0];
    var rl = byType.function_ratings && byType.function_ratings[0];
    if (dd.when === 'immediate' && dl) {
      var dlabel = 'Flow step ' + dl.pos + ' (' + q(dl.line.id) + ')';
      if (!rl) {
        c.add('error', 'R1', dl.line, dlabel + ' shows problem screens for low-rated areas, but the flow has no function_ratings screen, so nothing is ever rated. Add the area ratings, or remove this screen.');
      } else {
        if (has(dl.line, 'show_if') || has(dl.line, 'skip_if')) {
          c.add('warning', 'P3', dl.line, dlabel + ': deep_dive > when is "immediate", so each problem screen comes straight after its own area rating and the rule on this line is ignored. Put the rule on the area ratings line (flow step ' + rl.pos + '), or set deep_dive > when to "after_all_ratings".');
        }
        if (dl.pos !== rl.pos + 1) {
          c.add('warning', 'P3', dl.line, dlabel + ': deep_dive > when is "immediate", so each problem screen comes straight after its own area rating and the position of this line is ignored. Move it right below the area ratings (flow step ' + rl.pos + ') so the list reads the way the form behaves.');
        }
      }
    }
  }

  function listOptions(c, line, label) {
    var o = line.options;
    if (!Array.isArray(o) || !o.length) {
      c.add('error', 'F1', line, label + ': a ' + line.type + ' screen needs "options": a list of answer codes, like ["daily", "weekly"]. Their labels go in strings.json as choice.' + line.id + '.<code>.');
      return;
    }
    var seen = [];
    o.forEach(function (x) {
      if (typeof x !== 'string' || !CODE_RE.test(x)) c.add('error', 'F1', line, label + ': the option ' + show(x) + ' is not allowed. Use only lowercase letters a-z, digits and _, starting with a letter.');
      else if (seen.indexOf(x) !== -1) c.add('error', 'F1', line, label + ': the option ' + q(x) + ' is listed twice.');
      else seen.push(x);
    });
  }

  /* ---- the graph format: each node's own fields ------------------------------ */
  function graphShape(c) {
    var g = c.survey.flow;
    var F = c.F;
    names(g).forEach(function (k) {
      if (['format', 'start', 'collections', 'nodes'].indexOf(k) === -1) c.add('warning', 'F2', null, 'The flow has ' + q(k) + ', which the form does not use, so it has no effect.' + didYouMean(k, ['format', 'start', 'collections', 'nodes']) + ' (For a note, start the name with _.)');
    });
    if (g.collections !== undefined && !isObj(g.collections)) c.add('error', 'F1', null, '"collections" must be a group like {"areas": {"list": "functions"}}, but it is ' + kindOf(g.collections) + '.');
    names(g.collections).forEach(function (name) {
      var spec = g.collections[name];
      if (!isObj(spec) || !isText(spec.list)) { c.add('error', 'F1', null, 'collections > ' + q(name) + ' must look like {"list": "functions"}: the name of a list in the questionnaire.'); return; }
      names(spec).forEach(function (k) { if (k !== 'list' && k !== 'defaults') c.add('warning', 'F2', null, 'collections > ' + q(name) + ' has ' + q(k) + ', which the form does not use.' + didYouMean(k, ['list', 'defaults'])); });
      if (spec.defaults !== undefined && !isObj(spec.defaults)) c.add('error', 'F1', null, 'collections > ' + q(name) + ' > defaults must be a group like {"threshold": 3}.');
      if (!Array.isArray(lookup(c.survey, spec.list))) c.add('error', 'L1', null, 'collections > ' + q(name) + ' repeats over "' + spec.list + '", which is not a list in the questionnaire, so its loops never show anything.');
    });
    if (!Array.isArray(g.nodes) || !g.nodes.length) { c.add('error', 'G4', null, 'The flow has no "nodes": add the screens as a list, "nodes": [ ... ].'); return; }
    var ids = {};
    var known = registry().list().concat(['group']);
    (function nodes(list, where) {
      list.forEach(function (n, i) {
        if (!isObj(n)) { c.add('error', 'F1', null, 'Node ' + (i + 1) + where + ' must be a group { ... } with an "id" and a "type", but it is ' + kindOf(n) + '.'); return; }
        nodeShape(c, n, ids, known);
        if (n.type === 'group' && groupShape(c, n)) nodes(n.body.nodes, ' in the body of group ' + q(n.id));
      });
    }(g.nodes, ''));
  }

  function nodeShape(c, n, ids, known) {
    var name = Name(c, n);
    var id = n.id;
    if (typeof id !== 'string' || !CODE_RE.test(id)) {
      c.add('error', 'F1', n, name + ': the id ' + show(id) + ' is not allowed. Use only lowercase letters a-z, digits and _, starting with a letter, for example "one_fix".');
    } else {
      if (id.length > MAX_ID) c.add('error', 'L1', n, name + ': the id is ' + id.length + ' characters long; the most is ' + MAX_ID + '. Use a shorter code.');
      if (has(ids, id)) c.add('error', 'L1', n, name + ': the id ' + q(id) + ' is used twice. Every node needs its own id, group bodies included.');
      ids[id] = true;
    }
    var type = n.type;
    if (known.indexOf(type) === -1) {
      c.add('error', 'F1', n, name + (type === undefined ? ' has no "type".' : ' has the type ' + show(type) + ', which is not a kind of screen the form knows.') +
        didYouMean(type, known) + ' Use one of: ' + known.join(', ') + '.');
      return;
    }
    if (has(n, 'required') && typeof n.required !== 'boolean') c.add('error', 'F1', n, name + ': required is ' + show(n.required) + ', but it must be true or false (lowercase, without quotes).');
    repeatShape(c, n, name);
    if (type === 'group') return;
    if (has(n, 'store_as') && !isText(n.store_as)) c.add('error', 'F1', n, name + ': store_as is ' + show(n.store_as) + ', but it must be an answer code in double quotes, like "fn_rating:{area}".');
    var spec = typeSpec(type);
    if (!spec) return;
    // its own settings, as its kind describes them in the catalogue ("fields")
    var fdefs = fieldsOf(spec);
    var fnames = names(fdefs);
    function ofKind(kind) { return fnames.filter(function (f) { return fieldKind(spec, f) === kind; }); }
    fnames.forEach(function (f) {
      if (isObj(fdefs[f]) && fdefs[f].required === true && n[f] === undefined) {
        c.add('error', 'F1', n, name + ': a ' + labelOf(spec, type) + ' (' + type + ') needs ' + q(f) + '.' + (f === 'text' ? ' It is the name of its question in strings.json, for example "text": "q.one_fix".' : ''));
      }
    });
    var allowed = COMMON_FIELDS.concat(fnames.filter(function (f) { return COMMON_FIELDS.indexOf(f) === -1; }));
    names(n).forEach(function (k) {
      if (allowed.indexOf(k) === -1) c.add('warning', 'F2', n, name + ' has ' + q(k) + ', which a ' + type + ' screen does not use, so it has no effect.' + didYouMean(k, allowed) + ' (For a note, start the name with _.)');
    });
    KEY_FIELDS.concat(ofKind('text_key').filter(function (f) { return KEY_FIELDS.indexOf(f) === -1; })).forEach(function (f) {
      if (n[f] !== undefined && allowed.indexOf(f) !== -1 && !isText(n[f])) c.add('error', 'F1', n, name + ': ' + q(f) + ' is ' + show(n[f]) + ', but it must be the name of a text in strings.json, in double quotes.');
    });
    ofKind('bool').forEach(function (f) {   // "required" is checked above, on every node
      if (f !== 'required' && n[f] !== undefined && typeof n[f] !== 'boolean') c.add('error', 'F1', n, name + ': ' + f + ' is ' + show(n[f]) + ', but it must be true or false (without quotes).');
    });
    ofKind('choice').forEach(function (f) {
      var values = arr(fdefs[f].values);
      if (n[f] !== undefined && values.length && values.indexOf(n[f]) === -1) c.add('error', 'F1', n, name + ': ' + f + ' is ' + show(n[f]) + ', but it can only be ' + orList(values) + '.');
    });
    ofKind('number').forEach(function (f) {
      if (n[f] !== undefined && !(typeof n[f] === 'number' && isFinite(n[f]))) c.add('error', 'F1', n, name + ': ' + f + ' is ' + show(n[f]) + ', but it must be a number (without quotes).');
    });
    ofKind('answer_key').forEach(function (f) {
      if (n[f] !== undefined && !isText(n[f])) c.add('error', 'F1', n, name + ': ' + f + ' must be an answer code in double quotes, like "fn_deep_dive:{area}".');
    });
    if (n.options !== undefined && fieldKind(spec, 'options') === 'options') optionsShape(c, n, name);
    if (fieldKind(spec, 'rows') === 'rows' || fieldKind(spec, 'comment') === 'comment') {
      if (n.rows !== undefined && fieldKind(spec, 'rows') === 'rows') {
        var r = n.rows;
        if (!isObj(r) || !NAME_RE.test(String(r.each)) || !isText(r['in']) || !isText(r.store_as) || !isText(r.text)) {
          c.add('error', 'F1', n, name + ': rows must look like {"each": "item", "in": "support_items", "store_as": "support:{item}", "text": "support.{item}"}.');
        } else {
          names(r).forEach(function (k) { if (['each', 'in', 'store_as', 'text'].indexOf(k) === -1) c.add('warning', 'F2', n, name + ': rows has ' + q(k) + ', which the form does not use.'); });
          if (own(c.m.graph.collections, r['in']) === undefined) c.add('error', 'L1', n, name + ': rows repeat over ' + q(r['in']) + ', which is not a collection. Known: ' + quoted(names(c.m.graph.collections)) + '.');
        }
      }
      if (n.comment !== undefined && fieldKind(spec, 'comment') === 'comment' && (!isObj(n.comment) || !isText(n.comment.store_as) || !isText(n.comment.text))) {
        c.add('error', 'F1', n, name + ': comment must look like {"store_as": "support_comment", "text": "q.support_comment"}.');
      }
    }
  }

  function optionsShape(c, n, name) {
    var o = n.options;
    if (Array.isArray(o)) {
      if (!o.length) { c.add('error', 'F1', n, name + ': options is an empty list. Add the answer codes, like ["daily", "weekly"].'); return; }
      var seen = [];
      o.forEach(function (x) {
        var code = isObj(x) ? x.code : x;
        if (isObj(x) && !isText(x.text)) c.add('error', 'F1', n, name + ': the option ' + show(code) + ' needs "text": the name of its label in strings.json.');
        if (typeof code !== 'string' || !CODE_RE.test(code)) c.add('error', 'F1', n, name + ': the option ' + show(code) + ' is not allowed. Use only lowercase letters a-z, digits and _, starting with a letter.');
        else if (seen.indexOf(code) !== -1) c.add('error', 'F1', n, name + ': the option ' + q(code) + ' is listed twice.');
        else seen.push(code);
      });
    } else if (isObj(o)) {
      if (typeof o.from !== 'string' || !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(o.from)) c.add('error', 'F1', n, name + ': options > from must name a list of the loop item, like "area.issues".');
      if (!isText(o.text)) c.add('error', 'F1', n, name + ': options > text must be the text key of each option, like "issue.{area}.{code}".');
      if (o.other !== undefined && !isText(o.other)) c.add('error', 'F1', n, name + ': options > other must be the text key of the Other chip, like "issue.other".');
      names(o).forEach(function (k) { if (['from', 'text', 'other'].indexOf(k) === -1) c.add('warning', 'F2', n, name + ': options has ' + q(k) + ', which the form does not use.'); });
    } else {
      c.add('error', 'F1', n, name + ': options must be a list of codes, a list of {"code", "text"}, or {"from": "area.issues", "text": "issue.{area}.{code}"}.');
    }
  }

  function repeatShape(c, n, name) {
    if (n.repeat_for === undefined) return;
    var rf = n.repeat_for;
    if (!isObj(rf) || typeof rf.each !== 'string' || !NAME_RE.test(rf.each) || typeof rf['in'] !== 'string') {
      c.add('error', 'F1', n, name + ': repeat_for must look like {"each": "area", "in": "areas"} (and optionally "where": a rule).');
      return;
    }
    names(rf).forEach(function (k) { if (['each', 'in', 'where'].indexOf(k) === -1) c.add('warning', 'F2', n, name + ': repeat_for has ' + q(k) + ', which the form does not use.' + didYouMean(k, ['each', 'in', 'where'])); });
    if (own(c.m.graph.collections, rf['in']) === undefined) {
      c.add('error', 'L1', n, name + ' repeats over ' + q(rf['in']) + ', which is not a collection.' + didYouMean(rf['in'], names(c.m.graph.collections)) + ' Known: ' + (quoted(names(c.m.graph.collections)) || 'none') + '.');
    }
  }

  function groupShape(c, n) {
    var name = Name(c, n);
    names(n).forEach(function (k) { if (GROUP_FIELDS.indexOf(k) === -1) c.add('warning', 'F2', n, name + ' has ' + q(k) + ', which a group does not use (groups store nothing), so it has no effect.' + didYouMean(k, GROUP_FIELDS)); });
    var b = n.body;
    if (!isObj(b)) { c.add('error', 'L2', n, name + ' has no "body": a group needs {"body": {"start": "<id>", "nodes": [ ... ]}}.'); return false; }
    names(b).forEach(function (k) { if (k !== 'start' && k !== 'nodes') c.add('warning', 'F2', n, name + ': body has ' + q(k) + ', which the form does not use.'); });
    if (!Array.isArray(b.nodes) || !b.nodes.length) { c.add('error', 'L2', n, name + ': its body has no "nodes", so the group shows nothing. Add the screens it repeats, or remove the group.'); return false; }
    var ok = b.nodes.some(function (x) { return isObj(x) && x.id === b.start; });
    if (!isText(b.start)) c.add('error', 'L2', n, name + ': its body has no "start": write the id of the first screen inside it.');
    else if (!ok) c.add('error', 'L2', n, name + ': its body starts at ' + q(b.start) + ', which is not a node inside the body.' + didYouMean(b.start, b.nodes.map(function (x) { return isObj(x) ? x.id : null; })));
    return true;
  }

  /* ---- arrows: G1 (unreachable), G2, G3, G4, L2 ------------------------------ */
  function arrowChecks(c) {
    var m = c.m, F = c.F, g = m.graph;
    if (!isText(g.start)) c.add('error', 'G4', null, 'The flow has no "start": write the id of the first screen, for example "start": "language".');
    else if (!m.startEntry) c.add('error', 'G4', null, '"start" is ' + q(g.start) + ', but there is no top-level node with that id.' + didYouMean(g.start, m.top.entries.map(function (e) { return e.id; })));
    var endings = m.entries.filter(function (e) { return !e.group && F.isEnd(e.node); });
    if (!endings.length) c.add('error', 'G4', null, 'The flow has no ending (a thank_you node), so partners could never send their answers. Add {"id": "thanks", "type": "thank_you"} and point the last screen at it.');
    var terminal = {};   // vertices where a walk would stop for a reason reported on its own
    m.entries.forEach(function (e) {
      var n = e.node, name = Name(c, n), end = !e.group && F.isEnd(n);
      if (end && n.next !== undefined && n.show_if === undefined) {
        c.add('error', 'G4', n, name + ' is an ending (it sends the answers), so its "next" is never used. Remove "next", or give it a "show_if" if it should sometimes be skipped.', place('next'));
      }
      if (n.next === undefined || n.next === null) {
        if (!end) { c.add('error', 'G2', n, name + ' has no "next", so the questionnaire would stop here without sending anything. Add "next": the id of the screen that follows.', place('next')); terminal['e' + e.idx] = true; }
        else if (n.show_if !== undefined) { c.add('error', 'G2', n, name + ' is an ending with a "show_if": when it is skipped, the questionnaire needs to know where to go. Add "next".', place('next')); terminal['e' + e.idx] = true; }
      } else if (Array.isArray(n.next)) {
        jumpList(c, e, terminal);
      } else if (!isText(n.next)) {
        c.add('error', 'G2', n, name + ': "next" must be the id of the following screen, or a list of jumps ending with {"default": "<id>"}, but it is ' + kindOf(n.next) + '.', place('next'));
        terminal['e' + e.idx] = true;
      }
      e.targets.forEach(function (t) {
        if (t.res.kind === 'bad_next_item') {
          c.add('error', 'G2', n, name + ' leads to "@next_item", which only works inside a group\'s body (it ends one pass of the loop). Point it at a screen instead.', arrowSite(t));
          terminal['e' + e.idx] = true;
        } else if (t.res.kind === 'missing') {
          terminal['e' + e.idx] = true;
          if (c.panel && isHidden(c, t.to)) return;   // C2 explains it
          var elsewhere = m.entries.filter(function (x) { return x.id === t.to; })[0];
          c.add('error', 'G2', n, name + ' leads to ' + show(t.to) + ', which ' + (elsewhere ? 'is inside the body of ' + c.name(elsewhere.parent ? elsewhere.parent.node : null) +
            ': an arrow can only enter a group through the group itself.' : 'does not exist.' + didYouMean(t.to, m.entries.map(function (x) { return x.id; }))), arrowSite(t));
        }
      });
      if (e.group && e.body && !e.start) terminal['e' + e.idx] = true;
    });
    // L2: an arrow out of a group's body must go forward (to a later screen)
    m.entries.forEach(function (e) {
      e.targets.forEach(function (t) {
        if (t.res.kind !== 'entry' || !t.res.leaves) return;
        var to = t.res.entry, anc = e;
        while (anc && anc.list !== to.list) anc = anc.parent;
        if (!anc) return;
        if (to === anc || reach(m, 'e' + to.idx, 'e' + anc.idx, ['leave'])) {
          c.add('error', 'L2', e.node, Name(c, e.node) + ' leaves ' + c.name(anc.node) + ' for ' + q(to.id) + ', which comes before the group (or is the group itself). A loop may only be left forward; to repeat, use "repeat_for".', arrowSite(t));
          (m.out['e' + e.idx] || []).forEach(function (edge) { if (edge.to === 'e' + to.idx) edge.kind = 'back'; });
          m.reachCache = {};
        }
      });
    });
    var cyc = cycles(c);
    // G1: nodes no arrow reaches from the start
    if (m.startEntry) {
      var seen = reachableFrom(m, 'e' + m.startEntry.idx, null);
      m.entries.forEach(function (e) {
        if (seen['e' + e.idx] || own(c.quiet, e.id) === true) return;
        if (e.parent && !seen['e' + e.parent.idx]) return;   // the group itself is reported
        c.add('error', 'G1', e.node, Name(c, e.node) + ' can never be reached: no arrow leads to it from the start' + (e.parent ? ' of its group' : '') +
          '. Point the "next" of an earlier screen at it, or remove it.');
      });
      // G2: nodes from which no ending can be reached
      var good = {};
      Object.keys(terminal).forEach(function (v) { good[v] = true; });
      endings.forEach(function (e) { good['e' + e.idx] = true; });
      var changed = true;
      while (changed) {
        changed = false;
        Object.keys(m.out).forEach(function (v) {
          if (good[v]) return;
          if ((m.out[v] || []).some(function (edge) { return edge.kind !== 'back' && good[edge.to]; })) { good[v] = true; changed = true; }
        });
      }
      var circles = Object.keys(cyc).length > 0;   // a circle or a missing ending already explains dead ends
      m.entries.forEach(function (e) {
        var v = 'e' + e.idx;
        if (circles || !endings.length || !seen[v] || good[v] || terminal[v]) return;
        c.add('error', 'G2', e.node, Name(c, e.node) + ' is a dead end: from it, no route reaches an ending (thank_you), so partners could never send their answers. Give it, or the screens after it, a "next" that leads to an ending.');
      });
    }
  }

  function jumpList(c, e, terminal) {
    var n = e.node, name = Name(c, n), defaults = 0;
    n.next.forEach(function (x, i) {
      var where = name + ': jump ' + (i + 1) + ' of its "next"';
      if (!isObj(x)) { c.add('error', 'G2', n, where + ' must be {"when": <rule>, "goto": "<id>"} or {"default": "<id>"}, but it is ' + kindOf(x) + '.', place('jump', undefined, i)); return; }
      if (has(x, 'default')) {
        defaults++;
        var dat = place('next', x['default'], i);
        if (i !== n.next.length - 1) c.add('error', 'G2', n, where + ' is the {"default": ...}, so it must be the last line: the lines after it are never used.', dat);
        if (!isText(x['default'])) c.add('error', 'G2', n, where + ': "default" must be the id of a screen.', dat);
        names(x).forEach(function (k) { if (k !== 'default') c.add('warning', 'F2', n, where + ' has ' + q(k) + ' next to "default", which is ignored.', dat); });
      } else if (has(x, 'goto')) {
        var jat = place('jump', x['goto'], i);
        if (!has(x, 'when')) c.add('error', 'G2', n, where + ' has no "when", so it would always be taken. Add a rule, or make it the {"default": ...}.', jat);
        if (!isText(x['goto'])) c.add('error', 'G2', n, where + ': "goto" must be the id of a screen.', jat);
        names(x).forEach(function (k) { if (k !== 'goto' && k !== 'when') c.add('warning', 'F2', n, where + ' has ' + q(k) + ', which is ignored.' + didYouMean(k, ['when', 'goto']), jat); });
      } else {
        c.add('error', 'G2', n, where + ' needs "goto" (where to go) and "when" (a rule), or "default".', place('jump', undefined, i));
      }
    });
    if (!defaults) {
      c.add('error', 'G2', n, name + ': its jump list has no final {"default": "<id>"}. When no jump applies, or when the screen is skipped, the questionnaire would stop. Add the default as the last line.', place('next'));
      terminal['e' + e.idx] = true;
    } else if (defaults > 1) {
      c.add('error', 'G2', n, name + ': its jump list has ' + defaults + ' defaults. Keep exactly one, as the last line.', place('next'));
    }
  }

  /* G3: arrows that go round in a circle (loops exist only as repeat_for). */
  function cycles(c) {
    var m = c.m, index = 0, stack = [], on = {}, idx = {}, low = {}, inCycle = {};
    var vertices = [];
    m.entries.forEach(function (e) { vertices.push('e' + e.idx); if (e.group) vertices.push('x' + e.idx); });
    function edges(v) { return (m.out[v] || []).filter(function (x) { return x.kind !== 'back'; }); }
    function strong(v) {   // Tarjan's algorithm
      idx[v] = low[v] = index++;
      stack.push(v);
      on[v] = true;
      edges(v).forEach(function (edge) {
        var w = edge.to;
        if (idx[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      });
      if (low[v] === idx[v]) {
        var comp = [], w;
        do { w = stack.pop(); on[w] = false; comp.push(w); } while (w !== v);
        var self = edges(v).some(function (edge) { return edge.to === v; });
        if (comp.length > 1 || self) {
          comp.forEach(function (x) { inCycle[x] = true; });
          var ids = [];
          comp.reverse().forEach(function (x) {
            var e = m.entries[Number(x.slice(1))];
            if (x.charAt(0) === 'e' && e && ids.indexOf(e.id) === -1) ids.push(e.id);
          });
          var first = m.entries[Number(comp[0].slice(1))];
          c.add('error', 'G3', first ? first.node : null, 'These screens go round in a circle: ' + ids.concat([ids[0]]).map(q).join(' -> ') +
            '. Arrows may only go forward, so every route ends. To ask something again for each area, use "repeat_for" instead of an arrow back.');
        }
      }
    }
    vertices.forEach(function (v) { if (idx[v] === undefined) strong(v); });
    return inCycle;
  }

  /* ---- codes and keys: L1, D1, D2 -------------------------------------------- */
  function codeChecks(c) {
    var m = c.m;
    if (m.tooBig) {
      c.add('error', 'D3', null, 'With every screen shown, this questionnaire would have more than 2,000 screens (a loop over a very long list?). Partners could never finish it; shorten the loops.');
    }
    // store_as must contain every loop variable around the node
    m.entries.forEach(function (e) {
      if (e.group) return;
      var n = e.node, name = Name(c, n);
      var vars = e.inner.map(function (rf) { return rf.each; });
      var tpl = n.store_as || n.id;
      vars.forEach(function (v) {
        if (typeof tpl === 'string' && placeholders(tpl).indexOf(v) === -1) {
          c.add('error', 'L1', n, name + ' repeats for each ' + v + ', so its store_as must contain {' + v + '} (for example "' + (n.id || 'answer') + ':{' + v + '}"). Otherwise every ' + v + '\'s answer overwrites the one before.');
        }
      });
      var spec = typeSpec(n.type);   // a kind whose screens hold rows (support_block) or a comment box
      if (fieldKind(spec, 'rows') === 'rows' && isObj(n.rows) && typeof n.rows.store_as === 'string') {
        vars.concat([n.rows.each]).forEach(function (v) {
          if (placeholders(n.rows.store_as).indexOf(v) === -1) c.add('error', 'L1', n, name + ': rows > store_as must contain {' + v + '}, or every row overwrites the one before.');
        });
      }
      if (fieldKind(spec, 'comment') === 'comment' && isObj(n.comment) && typeof n.comment.store_as === 'string') {
        vars.forEach(function (v) { if (placeholders(n.comment.store_as).indexOf(v) === -1) c.add('error', 'L1', n, name + ': comment > store_as must contain {' + v + '}, or every comment overwrites the one before.'); });
      }
      var unknown = typeof tpl === 'string' ? placeholders(tpl).filter(function (p) { return vars.indexOf(p) === -1; }) : [];
      if (unknown.length) c.add('error', 'L1', n, name + ': its store_as uses {' + unknown[0] + '}, but it is not inside a loop over ' + unknown[0] + '. Remove it, or add "repeat_for".');
      if (e.rf && arr(e.outer).some(function (rf) { return rf.each === e.rf.each; })) c.add('error', 'L1', n, name + ' repeats for each ' + e.rf.each + ' inside another loop with the same name. Give the inner loop another name.');
    });
    // two screens storing one answer key; keys longer than the server allows
    var by = {};
    m.inst.forEach(function (inst) {
      uniq([inst.id].concat(inst.stored)).forEach(function (k) {
        if (typeof k !== 'string') return;
        bucket(by, k).push(inst);
        if (k.length > MAX_KEY && !(k === inst.entry.id && k.length > MAX_ID)) c.add('error', 'L1', inst.entry.node, Name(c, inst.entry.node) + ': the answer code ' + q(k) + ' is ' + k.length + ' characters long. The server refuses progress messages for a screen over ' + MAX_KEY + ' characters, so use a shorter id or store_as.');
      });
    });
    var pairs = {};
    Object.keys(by).forEach(function (k) {
      var es = uniq(by[k].map(function (i) { return i.entry; }));
      for (var i = 0; i < es.length; i++) {
        for (var j = i + 1; j < es.length; j++) {
          if (es[i].id !== null && es[i].id === es[j].id) continue;   // the same id twice: reported with the ids
          var pk = es[i].idx + '|' + es[j].idx;
          (pairs[pk] = pairs[pk] || { a: es[i], b: es[j], keys: [] }).keys.push(k);
        }
      }
    });
    Object.keys(pairs).forEach(function (pk) {
      var p = pairs[pk];
      c.add('error', 'L1', p.b.node, c.name(p.a.node) + ' and ' + c.name(p.b.node) + ' both store the answer ' + quoted(p.keys, 3) +
        ': their answers would overwrite each other in the data. Keep one of them, or give one another id (or store_as).');
    });
    // D1, D2: the two answers with their own data columns
    [['nps', 'nps_0_10', 'nps', 'a 0-10 question'], ['support_gate', 'yes_no', 'support_contacted', 'a yes/no question']].forEach(function (d) {
      var prods = uniq(m.inst.filter(function (inst) { return inst.id === d[0] || inst.stored.indexOf(d[0]) !== -1; }));
      if (!prods.length) {
        var deleted = c.panel && !isHidden(c, d[0]);
        c.add(deleted ? 'error' : 'warning', 'D1', null, 'No screen stores the answer ' + q(d[0]) + ', so the ' + d[2] + ' column of every answers sheet will stay empty' +
          (deleted ? '. It can be hidden, but never deleted or re-coded (decision 8): put it back.' : '. If that is not intended, put the screen back with the id ' + q(d[0]) + '.'));
      }
      uniq(prods.map(function (inst) { return inst.entry; })).forEach(function (e) {
        if (e.type !== d[1]) c.add('error', 'D2', e.node, 'The answer ' + q(d[0]) + ' fills the ' + d[2] + ' column, so it must come from ' + d[3] + ' (' + d[1] + '), but ' +
          c.name(e.node) + ' is of the type ' + e.type + '. Change its type back, or give it another id.');
      });
    });
  }

  /* ---- rules: R1-R5 ------------------------------------------------------------ */
  function ruleChecks(c) {
    var m = c.m;
    m.sites.forEach(function (site) {
      var n = site.e.node, name = Name(c, n);
      site.problems.forEach(function (p) { c.add('error', 'R2', n, name + ': ' + site.label + p.path + (p.text.charAt(0) === ':' ? '' : ' ') + p.text, site.at); });
      var loopVars = site.loops.map(function (rf) { return rf.each; });
      var runs = combos(m, site.loops);
      site.leaves.forEach(function (leaf) {
        var where = name + ': ' + site.label + leaf.path;
        // loop items: only inside their own loop
        var badRef = leaf.refs.filter(function (r) { return loopVars.indexOf(r.split('.')[0]) === -1; })[0];
        if (badRef) {
          var own2 = site.kind === 'show_if' && site.e.rf && site.e.rf.each === badRef.split('.')[0];
          c.add('error', 'R1', n, where + ' uses ' + q(badRef) + (own2 ? ', the loop item of this very node: its show_if is tested once, before the loop. Use "repeat_for" > "where" to filter the items.' :
            ', but it is not inside a loop over ' + badRef.split('.')[0] + '.'), site.at);
          return;
        }
        leaf.refs.forEach(function (r) {
          var parts = r.split('.');
          if (parts.length < 2) return;
          var rf = site.loops.filter(function (x) { return x.each === parts[0]; }).pop();
          var items = itemsOf(m, rf);
          if (items.length && !items.some(function (it) { return isObj(it) && own(it, parts[1]) !== undefined; })) {
            c.add('error', 'R1', n, where + ' uses ' + q(r) + ', but no ' + parts[0] + ' has a field ' + q(parts[1]) + '.', site.at);
          }
        });
        if (leaf.subj === 'fact') { factValues(c, site, leaf, where); return; }
        if (leaf.subj === 'var') { varValues(c, site, leaf, where, runs); return; }
        answerLeaf(c, site, leaf, where, runs, loopVars);
      });
    });
    // R4: jumps on a node that may be skipped, which do not test its own answer
    m.entries.forEach(function (e) {
      if (e.node.show_if === undefined) return;
      var mine = {};   // its own answers (a group's: those stored inside its body)
      m.inst.forEach(function (inst) {
        for (var a = inst.entry; a; a = a.parent) {
          if (a === e) { inst.stored.concat([inst.id]).forEach(function (k) { mine[k] = true; }); return; }
        }
      });
      m.sites.forEach(function (site) {
        if (site.e !== e || site.kind !== 'when') return;
        var testsOwn = site.leaves.some(function (leaf) {
          return leaf.subj === 'answer' && combos(m, site.loops).some(function (vars) { return own(mine, m.F.fill(leaf.cond.answer, vars)) === true; });
        });
        if (!testsOwn) c.add('warning', 'R4', e.node, Name(c, e.node) + ' has a "show_if", and ' + site.label + ' does not test its own answer. Whenever the screen is skipped, its jumps are ignored and its default is followed. If the jump should always apply, move it to the screen before.', site.at);
      });
    });
  }

  function answerLeaf(c, site, leaf, where, runs, loopVars) {
    var m = c.m, F = c.F, tpl = leaf.cond.answer;
    var unknownVars = placeholders(tpl).filter(function (p) { return loopVars.indexOf(p) === -1; });
    if (unknownVars.length) {
      var ownLoop = site.kind === 'show_if' && site.e.rf && site.e.rf.each === unknownVars[0];
      c.add('error', 'R1', site.e.node, where + ' tests ' + q(tpl) + ', but {' + unknownVars[0] + '} ' + (ownLoop ?
        'is this node\'s own loop item: its show_if is tested once, before the loop. Use "repeat_for" > "where" to filter the items.' :
        'is not a loop item here (the rule is not inside a loop over ' + unknownVars[0] + ').'), site.at);
      return;
    }
    var nothing = [], later = [], self = [], fine = 0, chained = [];
    var kind = null, kindKey = null;
    runs.forEach(function (vars) {
      var key = F.fill(tpl, vars);
      var prods = own(m.producers, key) || [];
      if (!prods.length) { nothing.push(key); return; }
      if (!kind) { kind = answerKind(prods[0], key); kindKey = key; }
      var before = prods.filter(function (p) { return precedes(m, site, vars, p); });
      if (!before.length) {
        if (prods.some(function (p) { return p.entry === site.e; }) && site.kind === 'show_if') self.push(key);
        else later.push({ key: key, p: prods[0] });
        return;
      }
      fine++;
      if (!before.some(function (p) { return alwaysBefore(m, site, p); })) chained.push({ key: key, p: before[0] });
    });
    var n = site.e.node;
    if (self.length) {
      c.add('error', 'R2', n, where + ' tests ' + q(self[0]) + ', which is this screen\'s own answer: a screen cannot depend on its own answer. Test an earlier answer, or use a jump ("next") on this screen.', site.at);
      return;
    }
    if (!fine) {
      var off = nothing.filter(function (k) { return hiddenAnswer(c, k); });
      if (nothing.length && !later.length && off.length === nothing.length) {
        // in the panel, a hidden question (or area, or support question) is not a typo: say so
        c.add('error', 'R1', n, where + ' tests ' + q(off[0]) + (off.length > 1 ? ' (and ' + (off.length - 1) + ' more)' : '') +
          ', but what answers it is hidden (switched off), so there is never an answer. Switch it on again, or change the rule.', site.at);
      } else if (nothing.length && !later.length) {
        c.add('error', 'R1', n, where + ' tests ' + q(nothing[0]) + (nothing.length > 1 ? ' (and ' + (nothing.length - 1) + ' more)' : '') + ', but no screen stores that answer.' +
          didYouMean(nothing[0], Object.keys(m.producers)) + noAnswerHint(m, nothing[0]), site.at);
      } else if (later.length) {
        var p = later[0].p;
        c.add('error', 'R1', n, where + ' tests ' + q(later[0].key) + ', which ' + c.name(p.entry.node) + ' answers, but that screen never comes before this ' +
          (site.kind === 'when' ? 'jump' : 'point') + ', so there is no answer yet. Move ' + q(p.entry.id) + ' above ' + q(site.e.id) + ', or test an earlier answer.', site.at);
      }
      return;
    }
    if (nothing.length || later.length) {
      c.add('info', 'R5', n, where + ' tests ' + quoted(nothing.concat(later.map(function (x) { return x.key; })), 3) +
        ', which for some items is not answered (yet) at that point; the rule then sees no answer.', site.at);
    }
    chained.slice(0, 1).forEach(function (x) {
      c.add('info', 'R5', n, where + ' tests ' + q(x.key) + ', and ' + c.name(x.p.entry.node) + ' is not always shown before it. When it is not on the partner\'s route (or the partner went Back and changed an earlier answer), the rule sees no answer: answers of screens off the route are ignored.', site.at);
    });
    if (kind) valueCheck(c, n, where, leaf, kind, site.at);
  }

  function noAnswerHint(m, key) {
    var e = m.entries.filter(function (x) { return x.id === key; })[0];
    if (!e) {
      if (/^(fn_rating|fn_deep_dive):/.test(key)) return ' There is no area ' + q(key.split(':')[1]) + ' (areas: ' + (itemsOf(m, { 'in': 'areas' }).map(idOf).join(', ') || 'none') + ').';
      return ' Use the code of an earlier answer, like "support_gate" or "fn_rating:<area>".';
    }
    if (e.type === 'function_rating') return ' ' + q(key) + ' is the area ratings screen; to test one area, use "fn_rating:<area>", for example "fn_rating:payments".';
    if (e.type === 'function_deep_dive') return ' To test the problem picked for one area, use "fn_deep_dive:<area>".';
    if (e.type === 'support_block') return ' To test one support rating, use "support:<item>", for example "support:kept_updated".';
    return ' The screen ' + q(key) + ' (' + e.type + ') does not record an answer a rule can test.';
  }

  /* Can the producer's answer exist when the rule at "site" is tested? */
  function precedes(m, site, vars, p) {
    var s = site.e, pe = p.entry;
    if (pe === s) {
      if (site.kind === 'when') return true;
      if (site.kind === 'where' && s.rf) return itemIndex(m, s.rf, p.vars[s.rf.each]) < itemIndex(m, s.rf, vars[s.rf.each]);
      return false;
    }
    var g = sharedLoop(pe, s);
    if (g) {
      var a = idOf(p.vars[g.rf.each]), b = idOf(vars[g.rf.each]);
      if (a !== undefined && b !== undefined && a !== b) return itemIndex(m, g.rf, p.vars[g.rf.each]) < itemIndex(m, g.rf, vars[g.rf.each]);
    }
    var target = site.kind === 'when' && s.group ? 'x' + s.idx : 'e' + s.idx;
    return reach(m, 'e' + pe.idx, target);
  }
  function sharedLoop(a, b) {   // the innermost repeated group around both
    var mine = [];
    for (var x = a.parent; x; x = x.parent) mine.push(x);
    for (var y = b.parent; y; y = y.parent) if (mine.indexOf(y) !== -1 && y.rf) return y;
    return null;
  }
  function itemIndex(m, rf, item) {
    var id = idOf(item);
    var list = itemsOf(m, rf);
    for (var i = 0; i < list.length; i++) if (idOf(list[i]) === id) return i;
    return -1;
  }
  /* Is the producer certainly on the route, before the rule? (R5 when not) */
  function alwaysBefore(m, site, p) {
    var pe = p.entry;
    if (pe === site.e) return true;
    if (pe.node.show_if !== undefined || (pe.rf && pe.rf.where !== undefined)) return false;
    for (var a = pe.parent; a; a = a.parent) {
      var shared = false;
      for (var b = site.e.parent; b; b = b.parent) if (b === a) shared = true;
      if (shared) break;
      if (a.node.show_if !== undefined || (a.rf && a.rf.where !== undefined)) return false;
    }
    if (!m.startEntry) return true;
    var target = site.kind === 'when' && site.e.group ? 'x' + site.e.idx : 'e' + site.e.idx;
    m.domCache = m.domCache || {};
    var avoid = 'e' + pe.idx;
    var seen = m.domCache[avoid] || (m.domCache[avoid] = reachableFrom(m, 'e' + m.startEntry.idx, avoid));
    return !seen[target];
  }

  /* R3: values a test can never meet. */
  function valueCheck(c, n, where, leaf, kind, at) {
    var test = leaf.test, v = leaf.cond[test];
    if (kind.text) {
      if (test !== 'answered') c.add('error', 'R3', n, where + ': ' + kind.what + ' is typed or spoken text, so it can only be tested with "answered": true or false.', at);
      return;
    }
    if (test === 'answered') return;
    if (test === 'at_most' || test === 'at_least') {
      if (!kind.num) { c.add('error', 'R3', n, where + ': "' + test + '" compares numbers, but ' + kind.what + ' is never a number. Use "equals", "not_equals" or "in" instead.', at); return; }
      if (isVarRef(v) || kind.max === undefined) return;
      var x = Number(v);
      var all = test === 'at_most' ? x >= kind.max : x <= kind.min;
      var none = test === 'at_most' ? x < kind.min : x > kind.max;
      if (all || none) c.add('warning', 'R3', n, where + ': ' + kind.what + ' is between ' + kind.min + ' and ' + kind.max + ', so with "' + test + '": ' + show(v) + ' ' + (all ? 'every answer passes' : 'no answer passes') + '. Check the number.', at);
      return;
    }
    var allowed = kind.values;
    if (kind.num) {
      allowed = [];
      for (var i = kind.min; i <= kind.max; i++) allowed.push(String(i));
      if (kind.na) allowed.push('na');
    }
    if (!allowed) return;
    var list = test === 'in' ? v : [v];
    var bad = list.filter(function (y) { return !isVarRef(y) && allowed.indexOf(String(y)) === -1; });
    if (!bad.length) return;
    var hint = bad.some(function (y) { return typeof y === 'string' && allowed.indexOf(y.toLowerCase()) !== -1; }) ? ' Capital letters matter: write it exactly as shown.' : '';
    var can = kind.num ? 'a whole number from ' + kind.min + ' to ' + kind.max + (kind.na ? ' or "na" (I don\'t handle this)' : '') : orList(allowed);
    c.add('error', 'R3', n, where + ': ' + kind.what + ' can only be ' + can + ', so ' + bad.map(show).join(', ') + (test === 'not_equals' ? ' is always true.' : ' can never match.') + hint, at);
  }

  function factValues(c, site, leaf, where) {
    var n = site.e.node, f = leaf.cond.fact;
    var kind = null;
    if (f === 'lang') kind = { what: 'the language', values: c.m.languages };
    if (f === 'lang_in_url') kind = { what: '"language in the link"', values: ['true', 'false'] };
    if (f === 'whats_changed_count') kind = { what: 'the number of "what changed" items', num: true, min: 0 };
    if (!kind) return;
    if (f === 'whats_changed_count') {
      if (leaf.test === 'equals' || leaf.test === 'not_equals' || leaf.test === 'in') {
        var vals = leaf.test === 'in' ? leaf.cond['in'] : [leaf.cond[leaf.test]];
        var bad = vals.filter(function (y) { return !isVarRef(y) && !/^\d+$/.test(String(y)); });
        if (bad.length) c.add('error', 'R3', n, where + ': ' + kind.what + ' is a whole number (0 or more), so ' + bad.map(show).join(', ') + ' can never match.', site.at);
      }
      return;
    }
    valueCheck(c, n, where, leaf, kind, site.at);
  }

  function varValues(c, site, leaf, where, runs) {
    var parts = leaf.cond['var'].split('.');
    if (parts.length !== 1) return;
    var rf = site.loops.filter(function (x) { return x.each === parts[0]; }).pop();
    var ids = itemsOf(c.m, rf).map(function (it) { return String(idOf(it)); });
    if (!ids.length) return;
    valueCheck(c, site.e.node, where, leaf, { what: 'the ' + parts[0], values: ids }, site.at);
  }

  /* ---- order: P1, P2 -------------------------------------------------------- */
  /* P1: the kind flagged "first" (the language buttons) is the start, and only
     one; P2: a kind flagged "once" appears once, one flagged "early" (the "what
     changed" card) comes before the questions. The flags are in the catalogue. */
  function orderChecks(c) {
    var m = c.m;
    function flagged(name) { return m.entries.filter(function (e) { return !e.group && flag(typeSpec(e.type), name); }); }
    function ids(list) { return list.map(function (e) { return q(e.id); }).join(', '); }
    var langs = flagged('first');
    if (langs.length > 1) {
      c.add('error', 'P1', langs[1].node, 'The flow has ' + langs.length + ' language screens (' + ids(langs) + '). Keep one, as the first screen.');
    } else if (langs.length === 1 && m.startEntry && langs[0] !== m.startEntry) {
      c.add('error', 'P1', langs[0].node, Name(c, langs[0].node) + ' (the language buttons) must be the first screen' + (m.legacy ? ' of the flow' : ' ("start")') +
        ': otherwise partners read questions before they can choose their language. Move it to the top.');
    }
    var byKind = {};
    flagged('once').forEach(function (e) { if (!flag(typeSpec(e.type), 'first')) bucket(byKind, e.type).push(e); });
    Object.keys(byKind).forEach(function (type) {
      var cards = byKind[type];
      var noun = type === 'whats_changed' ? '"what changed"' : q(labelOf(typeSpec(type), type));
      if (cards.length > 1) c.add('error', 'P2', cards[1].node, 'The flow has ' + cards.length + ' ' + noun + ' screens (' + ids(cards) + '). Only one is allowed.');
    });
    flagged('early').forEach(function (card) {
      var what = card.type === 'whats_changed' ? 'what changed since last time' : labelOf(typeSpec(card.type), card.type);
      var asked = m.inst.filter(function (inst) { return inst.stored.length && reach(m, 'e' + inst.entry.idx, 'e' + card.idx); })[0];
      if (asked) c.add('warning', 'P2', card.node, Name(c, card.node) + ' (' + what + ') comes after the question ' + q(asked.id) + '. Show it before the questions, so partners read the news first.');
    });
  }

  /* ---- texts: T1 ------------------------------------------------------------ */
  /* The texts one screen shows, with why: its node's own text keys, then the
     texts its kind shows when the node sets none (the catalogue's "texts",
     filled in for this screen), then its options, rows and comment. */
  function shownKeys(inst, F) {
    var k = inst.keys || {}, n = inst.entry.node, t = n.type, area = own(inst.vars, 'area');
    var spec = typeSpec(t);
    if (!spec) {   // a kind of screen the form does not know (F1): only its own text fields
      return KEY_FIELDS.filter(function (f) { return typeof n[f] === 'string' && n[f]; }).map(function (f) { return { key: n[f], why: 'the ' + f + ' of the screen ' + q(n.id) }; });
    }
    var where = 'the screen ' + q(n.id) + (area !== undefined && n.id !== null ? ' (area ' + q(idOf(area)) + ')' : '');
    var out = [];
    function push(key, why) { if (typeof key === 'string' && key) out.push({ key: key, why: why }); }
    KEY_FIELDS.forEach(function (f) { if (k[f] !== undefined) push(k[f], 'the ' + f + ' of ' + where); });
    names(fieldsOf(spec)).forEach(function (f) {   // a new kind's own text settings (the engine fills only KEY_FIELDS)
      if (fieldKind(spec, f) === 'text_key' && KEY_FIELDS.indexOf(f) === -1 && isText(n[f])) push(F.fill(n[f], inst.vars || {}), 'the ' + f + ' of ' + where);
    });
    var aid = area !== undefined ? idOf(area) : undefined;
    var texts = textsOf(spec);
    DEFAULT_FIELDS.forEach(function (f) {
      if (k[f] !== undefined) return;
      var key = filledText(F, own(texts, f), inst.vars);
      if (!key) return;
      var ofArea = aid !== undefined && /\{area[.}]/.test(texts[f]);
      push(key, f === 'label' && ofArea ? 'the name of the area ' + q(aid) : f === 'help' && ofArea ? 'the help line of the area ' + q(aid) :
        DEFAULT_WHY[f] + ' ' + where);
    });
    var chips = own(texts, 'options');   // options taken from the loop item (the problem screens' chips)
    if (k.options === undefined && isObj(chips) && isText(chips.from)) {
      var ref = chips.from.split('.');
      var item = own(inst.vars || {}, ref[0]);
      if (isObj(item)) {
        arr(own(item, ref[1])).forEach(function (code) {
          push(F.fill(chips.text, extend(inst.vars || {}, 'code', code)), 'the chip ' + q(code) + ' of the ' + ref[0] + ' ' + q(idOf(item)));
        });
        if (isText(chips.other)) push(chips.other, 'the Other chip');
      }
    }
    arr(k.options).forEach(function (o) {
      push(o.text, o.code === 'other' ? 'the Other chip' : isObj(chips) && aid !== undefined ? 'the chip ' + q(o.code) + ' of the area ' + q(aid) : 'the option ' + q(o.code) + ' of the screen ' + q(n.id));
    });
    arr(k.rows).forEach(function (r) { push(r.text, 'the support item ' + q(r.id)); });
    if (k.comment) push(k.comment.text, 'the comment question of the screen ' + q(n.id));
    return out;
  }

  /* Every text key the flow shows, with why: {key: reason}. */
  function textKeysOf(m) {
    var out = {};
    m.inst.forEach(function (inst) { shownKeys(inst, m.F).forEach(function (x) { if (!has(out, x.key)) out[x.key] = x.why; }); });
    return out;
  }

  function textChecks(c) {
    var m = c.m, s = c.strings;
    if (!s) return;
    var todo = {};
    m.languages.forEach(function (l) { todo[l] = 0; });
    var counted = {};
    var perNode = [];
    m.entries.forEach(function (e) {
      if (e.group) return;
      var missing = [], noLang = {}, tagged = [];
      e.insts.forEach(function (inst) {
        shownKeys(inst, c.F).forEach(function (x) {
          var v = own(s, x.key);
          if (v === undefined) { if (missing.indexOf(x.key) === -1) missing.push(x.key); return; }
          if (!isObj(v)) { if (missing.indexOf(x.key) === -1) missing.push(x.key); return; }
          m.languages.forEach(function (l) {
            var text = own(v, l);
            if (!isText(text)) {
              noLang[l] = noLang[l] || [];
              if (noLang[l].indexOf(x.key) === -1) noLang[l].push(x.key);
            } else if ((l === 'en' || l === m.fallback) && text.indexOf(TRANSLATE_TAG) !== -1) { if (tagged.indexOf(l + ':' + x.key) === -1) tagged.push(l + ':' + x.key); }
            if (own(counted, x.key) !== true && (!isText(text) || text.replace(/^\s+/, '').indexOf(TRANSLATE_TAG) === 0)) todo[l]++;
          });
          counted[x.key] = true;
        });
      });
      perNode.push({ e: e, missing: missing, noLang: noLang, tagged: tagged });
    });
    perNode.forEach(function (p) {
      var name = Name(c, p.e.node);
      if (p.missing.length) {
        c.add('error', 'T1', p.e.node, name + ': ' + (p.missing.length === 1 ? 'the text ' + q(p.missing[0]) + ' is' : plural(p.missing.length, 'text') + ' are') +
          ' missing from strings.json' + (p.missing.length > 1 ? ': ' + quoted(p.missing) : '') + '. Add ' + (p.missing.length === 1 ? 'it' : 'each') + ' with all ' + m.languages.length + ' languages.');
      }
      Object.keys(p.noLang).forEach(function (l) {
        var keys = p.noLang[l];
        c.add('error', 'T1', p.e.node, name + ': no ' + langName(l) + ' text (or an empty one) for ' + quoted(keys) + '. Every text needs all languages; if there is no translation yet, use "[TRANSLATE] " followed by the English.');
      });
      p.tagged.forEach(function (t) {
        var l = t.split(':')[0], key = t.slice(l.length + 1);
        c.add('error', 'T1', p.e.node, name + ': the ' + langName(l) + ' text of ' + q(key) + ' still contains [TRANSLATE]. ' + (l === 'en' ? 'English is the source text' : 'It is the fallback language') + ', so it must be real text.');
      });
    });
    var waiting = Object.keys(todo).filter(function (l) { return todo[l] > 0 && l !== 'en' && l !== m.fallback; });
    if (waiting.length) {
      c.add('info', 'T1', null, 'Texts the questionnaire shows that still need a translation (shown in ' + langName(m.fallback) + ' until then): ' +
        waiting.map(function (l) { return langName(l) + ' ' + todo[l]; }).join(', ') + ' of ' + Object.keys(counted).length + '.');
    }
  }
  function langName(code) { return (own(LANG_NAMES, code) || code) + ' (' + code + ')'; }

  /* ---- sizes: stats, D3, D4 ------------------------------------------------- */
  /* What one screen adds to the message: its kind's "records" in the catalogue
     (a number, or "rows" = one per row, "comment" = one if it has a comment box). */
  function records(inst) {
    var spec = typeSpec(inst.entry.type), k = inst.keys || {};
    var r = { answers: 0, ratings: 0, free_text: 0, screens: 1 };
    if (!spec) { r.answers = 1; return r; }   // a kind nobody described: assume one answer
    var rec = isObj(spec.records) ? spec.records : {};
    ['answers', 'ratings', 'free_text'].forEach(function (what) {
      var v = rec[what];
      r[what] = v === 'rows' ? arr(k.rows).length : v === 'comment' ? (k.comment ? 1 : 0) : (typeof v === 'number' && v > 0 ? v : 0);
    });
    return r;
  }
  function sizes(m) {
    var weight = {};
    m.entries.forEach(function (e) {
      var w = { answers: 0, ratings: 0, free_text: 0, screens: 0 };
      e.insts.forEach(function (inst) { var r = records(inst); Object.keys(w).forEach(function (k) { w[k] += r[k]; }); });
      weight['e' + e.idx] = w;
    });
    var stats = {};
    ['answers', 'ratings', 'free_text', 'screens'].forEach(function (metric) {
      var memo = {}, busy = {};
      function best(v) {
        if (memo[v] !== undefined) return memo[v];
        if (busy[v]) return 0;   // an arrow loop (G3): stop counting
        busy[v] = true;
        var tail = 0;
        (m.out[v] || []).forEach(function (edge) { if (edge.kind !== 'back') tail = Math.max(tail, best(edge.to)); });
        busy[v] = false;
        memo[v] = (weight[v] ? weight[v][metric] : 0) + tail;
        return memo[v];
      }
      var start = m.startEntry ? 'e' + m.startEntry.idx : null;
      stats[metric] = start ? best(start) : 0;
      var hasEnd = m.entries.some(function (e) { return !e.group && m.F.isEnd(e.node); });
      if (metric === 'screens' && !hasEnd) stats[metric] += 1;   // the engine's own closing thank-you
    });
    return { answers: stats.answers, ratings: stats.ratings, free_text: stats.free_text, longest_path: stats.screens };
  }
  function sizeChecks(c) {
    var s = sizes(c.m);
    c.stats = s;
    if (s.answers > LIMITS.answers) c.add('error', 'D3', null, 'One submission could hold up to ' + s.answers + ' answers, more than the ' + LIMITS.answers + ' the server accepts, so it would be refused. Remove questions or shorten loops.');
    if (s.ratings > LIMITS.ratings) c.add('error', 'D3', null, 'One submission could hold up to ' + s.ratings + ' ratings, more than the ' + LIMITS.ratings + ' the server accepts, so it would be refused. Remove ratings or shorten loops.');
    if (s.free_text > LIMITS.free_text) c.add('error', 'D3', null, 'One submission could hold up to ' + s.free_text + ' voice or typed answers, more than the ' + LIMITS.free_text + ' the server accepts, so it would be refused.');
    if (s.longest_path > MAX_SCREENS) c.add('warning', 'D4', null, 'The longest route has ' + s.longest_path + ' screens, more than ' + MAX_SCREENS + ': partners would need well over the 90 seconds the survey aims for. Consider fewer screens or tighter loop filters.');
  }

  /* ---- G1 (warning): screens no answer combination shows ---------------------
     Tries the flow with the engine itself, over the boundary values of every
     answer and fact a rule tests. */
  function neverShown(c) {
    var m = c.m;
    // Only for a flow without errors: a broken rule or arrow already explains a screen that never shows.
    if (!m.startEntry || c.findings.some(function (f) { return f.level === 'error'; })) return;
    var sets = answerSets(m, { cap: WALK_CAP, seed: 7 });
    var shown = {};
    var nodes = m.entries.map(function (e) { return e.node; });
    var failed = false;
    sets.list.forEach(function (set) {
      if (failed) return;
      var steps;
      try { steps = m.F.path(m.graph, m.survey, { facts: set.facts }, set.state); } catch (err) { failed = true; return; }
      steps.forEach(function (st) {
        var i = nodes.indexOf(st.node);
        if (i !== -1) shown[i] = true;
      });
    });
    if (failed) return;   // an arrow loop: G3 explains it
    var start = reachableFrom(m, 'e' + m.startEntry.idx, null);
    var explained = {};   // screens with an error already (a broken rule explains "never shown")
    c.findings.forEach(function (f) { if (f.level === 'error' && f.node) explained[f.node] = true; });
    m.entries.forEach(function (e, i) {
      if (e.group || shown[i] || !start['e' + e.idx] || own(c.quiet, e.id) === true || own(explained, e.id) === true) return;
      if (e.parent && !start['e' + e.parent.idx]) return;
      c.add('warning', 'G1', e.node, Name(c, e.node) + ' is never shown: with every combination of the answers its rules test (' + plural(sets.list.length, 'answer set') +
        (sets.exhaustive ? '' : ', a sample') + '), no route shows it. Its rules may contradict each other (for example nps <= 3 and nps >= 9), or a loop filter is never true.');
    });
  }

  /* Answer sets over the boundary values of every tested answer and fact.
     Returns { list: [{ state, facts, example }], exhaustive, total }. */
  function answerSets(m, opts) {
    opts = opts || {};
    var cap = opts.cap || WALK_CAP;
    var F = m.F;
    var tests = {};      // answer key -> [{ leaf, vars }]
    var factTests = {};  // fact -> [{ leaf, vars }]
    (opts.models || [m]).forEach(function (mm) {
      mm.sites.forEach(function (site) {
        var runs = combos(mm, site.loops);
        site.leaves.forEach(function (leaf) {
          runs.forEach(function (vars) {
            if (leaf.subj === 'answer') bucket(tests, F.fill(leaf.cond.answer, vars)).push({ leaf: leaf, vars: vars });
            if (leaf.subj === 'fact') bucket(factTests, leaf.cond.fact).push({ leaf: leaf, vars: vars });
          });
        });
      });
    });
    var dims = [];
    Object.keys(tests).sort().forEach(function (key) {
      var prod = null;
      (opts.models || [m]).forEach(function (mm) { if (!prod && own(mm.producers, key)) prod = own(mm.producers, key)[0]; });
      if (!prod) return;
      var kind = answerKind(prod, key);
      if (!kind) return;
      var cands = candidates(kind);
      var reps = representatives(F, cands, tests[key], function (cand) { var sc = {}; if (cand.a !== undefined) sc[key] = cand.a; else if (cand.t) sc[key] = true; return { scope: sc, facts: {} }; });
      dims.push({ key: key, values: reps });
    });
    FACTS.forEach(function (f) {
      var cands = factCandidates(m, f, factTests[f] || []);
      var reps = factTests[f] ? representatives(F, cands, factTests[f], function (cand) { var fx = {}; fx[f] = cand.f; return { scope: {}, facts: fx }; }) : [cands[0]];
      dims.push({ fact: f, values: reps });
    });
    var total = dims.reduce(function (n, d) { return n * d.values.length; }, 1);
    var picks = [];
    if (total <= cap) {
      for (var i = 0; i < total; i++) {
        var rest = i, pick = [];
        dims.forEach(function (d) { pick.push(rest % d.values.length); rest = Math.floor(rest / d.values.length); });
        picks.push(pick);
      }
    } else {
      var rnd = random(opts.seed || 1);
      var base = dims.map(function () { return 0; });
      picks.push(base);
      dims.forEach(function (d, di) { d.values.forEach(function (v, vi) { if (vi) { var p = base.slice(); p[di] = vi; picks.push(p); } }); });
      while (picks.length < cap) picks.push(dims.map(function (d) { return Math.floor(rnd() * d.values.length); }));
    }
    var list = picks.map(function (pick) {
      var state = { answers: {}, texts: {}, audio: {}, lang_chosen: true };
      var facts = {}, example = {};
      dims.forEach(function (d, di) {
        var v = d.values[pick[di]];
        if (d.fact) { facts[d.fact] = v.f; return; }
        if (v.a !== undefined) { state.answers[d.key] = v.a; example[d.key] = v.a; } else if (v.t) { state.texts[d.key] = 'typed answer'; example[d.key] = 'text:typed answer'; }
      });
      return { state: state, facts: facts, example: example };
    });
    return { list: list, exhaustive: total <= cap, total: total };
  }
  function candidates(kind) {
    var out = [];
    if (kind.num) for (var i = kind.min; i <= kind.max; i++) out.push({ a: i, label: String(i) });
    if (kind.na) out.push({ a: 'na', label: 'na' });
    if (kind.multi) {
      // pick several: each answer ticked alone, and (with 2 or more) all of them at once
      arr(kind.values).forEach(function (v) { out.push({ a: [v], label: v }); });
      if (arr(kind.values).length > 1) out.push({ a: arr(kind.values).slice(), label: 'all' });
    } else {
      arr(kind.values).forEach(function (v) { out.push({ a: v, label: v }); });
    }
    if (kind.text) out.push({ t: true, label: 'text' });
    if (kind.skip) out.push({ none: true, label: '(blank)' });
    if (!out.length) out.push({ none: true, label: '(blank)' });
    return out;
  }
  function factCandidates(m, f, tests) {
    if (f === 'lang') return m.languages.map(function (l) { return { f: l }; });
    if (f === 'lang_in_url') return [{ f: false }, { f: true }];
    if (f === 'round') {
      var rounds = [];
      tests.forEach(function (t) { var v = t.leaf.cond[t.leaf.test]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (isScalar(x) && rounds.indexOf(String(x)) === -1) rounds.push(String(x)); }); });
      return [{ f: 'SIM-R1' }].concat(rounds.map(function (r) { return { f: r }; }));
    }
    var top = 1;
    tests.forEach(function (t) { var v = t.leaf.cond[t.leaf.test]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (!isVarRef(x) && isFinite(Number(x))) top = Math.max(top, Number(x) + 1); }); });
    var out = [];
    for (var i = 0; i <= Math.min(top, 20); i++) out.push({ f: i });
    return out;
  }
  /* One value per behaviour: values for which every test gives the same answer are alike. */
  function representatives(F, cands, uses, scopeOf) {
    var bySig = {}, out = [];
    cands.forEach(function (cand) {
      var env = scopeOf(cand);
      var sig = uses.map(function (u) { return F.evalCondition(u.leaf.cond, env.scope, { facts: env.facts, vars: u.vars }) ? '1' : '0'; }).join('');
      if (!bySig[sig]) { bySig[sig] = true; out.push(cand); }
    });
    return out;
  }

  /* ---- S1: survey.json's own settings against the graph (not in the panel) ----------
     In the list format the problem screens, area ratings and support screen
     take their settings from survey.json's deep_dive, rating and support
     (fromLegacy copies them in). A graph carries its own copies, on its
     screens and in "collections" (the areas' default threshold), and phones
     follow those. So with a graph, a survey.json setting that says something
     else changes nothing on phones while everything else looks fine: an
     error, naming both values. Only a setting survey.json really has is
     compared. The control panel always makes the screens from its settings,
     so there they cannot disagree. */
  function settingsChecks(c) {
    var m = c.m, s = c.survey;
    if (m.legacy) return;
    var dd = isObj(s.deep_dive) ? s.deep_dive : {};
    var rating = isObj(s.rating) ? s.rating : {};
    var sup = isObj(s.support) ? s.support : {};
    var SAME = 'Make the two the same (change one of them).';
    function bool(v) { return typeof v === 'boolean'; }
    function ofType(type) { return m.entries.filter(function (e) { return !e.group && e.type === type; }); }
    function drift(node, setting, value, theirs, follows, fix) {
      c.add('error', 'S1', node, 'survey.json\'s ' + setting + ' is ' + show(value) + ', but ' + theirs + '. Phones follow ' + follows +
        ', so the setting in survey.json changes nothing on phones. ' + (fix || SAME));
    }
    // the low rating: deep_dive > threshold against the areas' default threshold in "collections" (the
    // collections the area ratings and problem screens repeat over; any over "functions" when there are none)
    var loopedOver = [];
    m.entries.forEach(function (e) {
      if (e.group || (e.type !== 'function_rating' && e.type !== 'function_deep_dive')) return;
      e.inner.forEach(function (rf) { if (typeof rf['in'] === 'string' && loopedOver.indexOf(rf['in']) === -1) loopedOver.push(rf['in']); });
    });
    if (typeof dd.threshold === 'number') {
      names(m.graph.collections).forEach(function (name) {
        var col = own(m.graph.collections, name);
        if (loopedOver.length && loopedOver.indexOf(name) === -1) return;
        if (!isObj(col) || col.list !== 'functions' || !isObj(col.defaults) || !has(col.defaults, 'threshold')) return;
        var t = col.defaults.threshold;
        if (t === dd.threshold) return;
        drift(null, 'deep_dive > threshold', dd.threshold, 'the flow\'s own value, collections > ' + q(name) + ' > defaults > threshold, is ' + show(t),
          'the flow\'s value (' + show(t) + ': an area rated at or below it gets its problem screen, unless the area has its own "threshold")');
      });
    }
    // the problem screens: a chip required; a voice note or text required after "Other"
    var dives = ofType('function_deep_dive');
    [['require_chip', 'require_choice', 'a problem must be picked before Next', 'Next works without picking a problem'],
      ['require_detail_if_other', 'require_detail_if_other', 'a voice note or text is needed after "Other"', '"Other" needs no voice note or text']].forEach(function (x) {
      if (!bool(dd[x[0]])) return;
      dives.forEach(function (e) {
        var mine = e.node[x[1]] !== false;   // the engine's rule: anything but false means yes
        if (mine === dd[x[0]]) return;
        drift(e.node, 'deep_dive > ' + x[0], dd[x[0]], c.name(e.node) + (e.node[x[1]] === undefined ? ' has no ' + q(x[1]) + ', which means true' :
          ' says ' + q(x[1]) + ': ' + show(e.node[x[1]])), 'the screen\'s own value (' + mine + ': ' + (mine ? x[2] : x[3]) + ')');
      });
    });
    // "I don't handle this": rating > allow_not_applicable (area ratings), support > allow_not_applicable
    [['rating', rating, 'function_rating'], ['support', sup, 'support_block']].forEach(function (x) {
      if (!bool(x[1].allow_not_applicable)) return;
      ofType(x[2]).forEach(function (e) {
        if (e.node.allow_not_applicable === undefined) return;   // a screen without its own value follows survey.json
        var mine = e.node.allow_not_applicable === true;
        if (mine === x[1].allow_not_applicable) return;
        drift(e.node, x[0] + ' > allow_not_applicable', x[1].allow_not_applicable, c.name(e.node) + ' says "allow_not_applicable": ' + show(e.node.allow_not_applicable),
          'the screen\'s own value (' + mine + ': the "I don\'t handle this" button is ' + (mine ? 'shown' : 'not shown') + ')');
      });
    });
    // the support comment box and its question
    var blocks = ofType('support_block');
    if (bool(sup.allow_comment)) {
      blocks.forEach(function (e) {
        var box = isObj(e.node.comment);
        if (box === sup.allow_comment) return;
        if (box) {
          drift(e.node, 'support > allow_comment', sup.allow_comment, c.name(e.node) + ' has a comment box ("comment")', 'the screen: they show the comment box',
            'Make the two the same: remove "comment" from the screen, or set allow_comment to true.');
        } else {
          drift(e.node, 'support > allow_comment', sup.allow_comment, c.name(e.node) + ' has no comment box (no "comment")', 'the screen: they show no comment box',
            'Make the two the same: give the screen "comment": {"store_as": "support_comment", "text": "' + (isText(sup.comment_text) ? sup.comment_text : 'q.support_comment') +
            '"}, or set allow_comment to false.');
        }
      });
    }
    if (isText(sup.comment_text) && sup.allow_comment !== false) {
      blocks.forEach(function (e) {
        var mine = isObj(e.node.comment) ? e.node.comment.text : undefined;
        if (!isText(mine) || mine === sup.comment_text) return;
        drift(e.node, 'support > comment_text', sup.comment_text, c.name(e.node) + ' asks ' + q(mine) + ' (comment > text)', 'the screen\'s own question (' + q(mine) + ')');
      });
    }
    // where the problem screens go: deep_dive > when against the shape of the flow
    var inLoop = dives.filter(function (e) { return e.outer.length > 0; });   // inside a group that repeats: straight after each rating
    if (dd.when === 'immediate' && dives.length && !inLoop.length) {
      drift(dives[0].node, 'deep_dive > when', dd.when, 'the flow asks the problem screens (' + c.name(dives[0].node) + ') after all the area ratings',
        'the flow (the problem screens after all the ratings)', 'Make the two the same: set deep_dive > when to "after_all_ratings", or put each area\'s rating ' +
        'and its problem screen in a group that repeats for each area (docs/flow-engine.md, section 5).');
    } else if (dd.when === 'after_all_ratings' && inLoop.length) {
      var group = inLoop[0].parent || inLoop[0];
      drift(group.node, 'deep_dive > when', dd.when, 'the flow asks each problem screen straight after its own area rating (' + c.name(group.node) + ')',
        'the flow (each problem screen straight after its rating)', 'Make the two the same: set deep_dive > when to "immediate", or ask the problem ' +
        'screens after all the ratings (one screen that repeats for each area rated low).');
    }
  }

  /* ---- panel only: C1, C2 ------------------------------------------------------ */
  function panelChecks(c) {
    var m = c.m;
    var codes = {};
    function note(x) { if (typeof x === 'string' && x) codes[x] = true; }
    m.entries.forEach(function (e) {
      note(e.id);
      if (typeof e.node.store_as === 'string') note(e.node.store_as);
      if (isObj(e.node.rows)) note(e.node.rows.store_as);
      if (isObj(e.node.comment)) note(e.node.comment.store_as);
      if (Array.isArray(e.node.options)) e.node.options.forEach(function (o) { note(isObj(o) ? o.code : o); });
    });
    m.inst.forEach(function (inst) { note(inst.id); inst.stored.forEach(note); arr(inst.keys.options).forEach(function (o) { note(o.code); }); arr(inst.keys.rows).forEach(function (r) { note(r.id); }); });
    names(m.graph.collections).forEach(function (name) { m.F.items(m.graph, m.survey, name).forEach(function (it) { note(idOf(it)); arr(it.issues).forEach(note); }); });
    /* C1 compares BARE codes: a code in opts.everLiveCodes counts as still
       there (or hidden) when it appears ANYWHERE in the questionnaire, so a
       problem code deleted from one area while another area keeps the same
       code, or an answer moved to another question, passes. The control
       panel therefore no longer uses C1 (26 Oct 2026, review finding 2):
       Model.gs never passes everLiveCodes, and PP_mdlCheckLiveCodes_ decides
       the codes lock itself, kind by kind, on the QUALIFIED entries of
       CODES_EVER_LIVE ("screen:<id>", "area:<id>", "chip:<area>/<code>",
       "support:<code>", "option:<question>/<code>"). C1 is kept, unchanged,
       for any other caller that passes everLiveCodes (and its tests). */
    arr(c.opts.everLiveCodes).forEach(function (code) {
      if (typeof code !== 'string' || own(codes, code) === true || isHidden(c, code)) return;
      c.add('error', 'C1', null, 'The code ' + q(code) + ' was answered by partners in a real round, so it can never be deleted or re-coded: the data and the dashboard rely on it. Put it back (you may hide it, or reword its text).');
    });
    m.entries.forEach(function (e) {
      e.targets.forEach(function (t) {
        if (isHidden(c, t.to)) {
          c.add('warning', 'C2', e.node, Name(c, e.node) + (t.def ? ' goes to ' : ' jumps to ') + q(t.to) + ', which is hidden, so the route goes to that question\'s own next screen instead. Point the arrow at a visible question.', arrowSite(t));
        }
      });
    });
  }

  /* ===========================================================================
     The other tools: all through the engine (PP.flow), never a second walk.
     ======================================================================== */

  /* Every text key the flow shows, with why: {key: reason}. Used by
     scripts/check_config.py to know which texts the flow needs. */
  api.textKeys = function (survey) {
    var m = model(survey);
    return m.ok ? textKeysOf(m) : {};
  };

  /* answersAt(survey, nodeId, opts) -> what a rule at that node may test:
       { ok, node, site, answers: [...], facts: [...], message (when not ok) }
     It is exactly what the rule checks accept (R1, R2: a rule there that
     tests any other answer is an error), worked out the same way, so the
     control panel's rule and jump builders never have to read a message.
       site: "show_if" (the default): the answers that can exist before the
         node; "jump" (opts.forJump: true): those and the node's own answers
         (a group's: those of its body), as a jump is tested after the node;
         "where" (opts.site: "where"): its loop filter, which also sees the
         answers of its earlier items. Without a nodeId (null): "any", every
         answer the flow can store, wherever it may be tested.
     Each answer: { key, kind, label, what, node, item, own, optional, ... }
       kind      "number", "choice" or "text" (typed or recorded: only
                 "answered" can be tested)
       label     the English question (and the area or support question),
                 when opts.strings has the texts; otherwise their text keys
       what      the checks' own name for it, e.g. 'the 0-10 question "nps"'
       node      the code of the screen that stores it; item its loop item
                 (an area's code), its row (a support question's code) or
                 null; own: it is this node's own answer
       optional  it may be left blank (no answer at all)
       number:   min, max, and na (true when "na", "I don't handle this", is
                 allowed); choice: values (the codes, as text) and, when the
                 screen names them, value_texts { code: text key }.
     Each fact: { fact, kind, label, values or min }: lang (the languages
     switched on), lang_in_url (true or false), whats_changed_count (a whole
     number from 0) and round (opts.rounds when given: the round codes). */
  api.answersAt = function (survey, nodeId, opts) {
    opts = isObj(opts) ? opts : {};
    var m = model(survey);
    var any = nodeId === null || nodeId === undefined;
    var name = any ? 'any' : opts.forJump === true ? 'jump' : opts.site === 'where' ? 'where' : 'show_if';
    var out = { ok: false, node: any ? null : nodeId, site: name, answers: [], facts: factsAt(m, opts) };
    if (!m.ok) { out.message = 'The questionnaire has no usable "flow", so nothing can be tested (run the check).'; return out; }
    var e = null;
    if (!any) {
      e = (typeof nodeId === 'string' ? own(m.top.map, nodeId) : undefined) || m.entries.filter(function (x) { return x.id === nodeId; })[0] || null;
      if (!e) { out.message = 'No screen of this questionnaire has the code ' + show(nodeId) + '.'; return out; }
      if (name === 'where' && !e.rf) { out.message = 'The screen ' + q(e.id) + ' does not repeat ("repeat_for"), so it has no loop filter.'; return out; }
    }
    // the same "site" the rule checks build (sitesOf): what may be tested there is what "precedes" it
    var site = e ? { e: e, kind: name === 'jump' ? 'when' : name, loops: name === 'where' ? e.inner : e.outer } : null;
    var runs = site ? combos(m, site.loops) : [{}];
    Object.keys(m.producers).forEach(function (key) {
      var prods = own(m.producers, key) || [];
      var kind = prods.length ? answerKind(prods[0], key) : null;
      if (!kind) return;
      if (site && !runs.some(function (vars) { return prods.some(function (p) { return precedes(m, site, vars, p); }); })) return;
      out.answers.push(answerEntry(prods[0], key, kind, e ? prods.some(function (p) { return inside(p.entry, e); }) : false, opts.strings));
    });
    out.ok = true;
    return out;
  };
  function inside(entry, e) { for (var a = entry; a; a = a.parent) if (a === e) return true; return false; }
  function answerEntry(inst, key, kind, mine, strings) {
    var row = arr((inst.keys || {}).rows).filter(function (r) { return isObj(r) && r.key === key; })[0];
    var d = { key: key, kind: kind.num ? 'number' : kind.text ? 'text' : kind.multi ? 'choices' : 'choice', label: answerLabel(inst, key, strings), what: kind.what,
      node: inst.entry.id, item: row ? String(row.id) : itemOf(inst), own: mine, optional: kind.skip === true };
    if (kind.num) {
      d.min = kind.min;
      d.max = kind.max;
      d.na = kind.na === true;
    } else if (!kind.text) {
      d.values = arr(kind.values).slice();
      var texts = {}, named = false;
      arr((inst.keys || {}).options).forEach(function (o) {
        if (isObj(o) && isText(o.text) && d.values.indexOf(String(o.code)) !== -1) { texts[String(o.code)] = o.text; named = true; }
      });
      if (named) d.value_texts = texts;
    }
    return d;
  }
  /* The English words of one answer: a support question's own text, the comment question, else the screen's. */
  function answerLabel(inst, key, strings) {
    var k = inst.keys || {};
    var row = arr(k.rows).filter(function (r) { return isObj(r) && r.key === key; })[0];
    if (row && isText(row.text)) return english(strings, row.text) || row.text;
    if (isObj(k.comment) && k.comment.key === key && isText(k.comment.text)) return english(strings, k.comment.text) || k.comment.text;
    return screenLabel(inst, strings) || key;
  }
  function factsAt(m, opts) {
    var rounds = arr(opts.rounds).filter(isText).map(String);
    return [
      { fact: 'lang', kind: 'choice', label: 'the ' + FACT_WORDS.lang, values: (m.languages || DEFAULT_LANGS).slice() },
      { fact: 'lang_in_url', kind: 'choice', label: 'the ' + FACT_WORDS.lang_in_url, values: [true, false] },
      { fact: 'whats_changed_count', kind: 'number', label: 'the number of ' + FACT_WORDS.whats_changed_count, min: 0 },
      { fact: 'round', kind: 'choice', label: 'the ' + FACT_WORDS.round, values: uniq(rounds) }
    ];
  }

  /* catalogue() -> every kind of screen the form knows, in the order they
     were registered, without code: what web/config/types.json holds (written
     by  node scripts/flow.js types --write). Each entry: { type, label,
     description, fields, answer, records, flags, texts, row?, custom }, where
     "custom" names the rules the kind brings itself (isComplete, collect)
     instead of the standard ones. */
  api.catalogue = function () {
    var T = registry();
    return T.list().map(function (type) { return catalogueEntry(type, T.get(type)); });
  };
  function catalogueEntry(type, d) {
    var r = isObj(d.records) ? d.records : {};
    function count(v) { return v === 'rows' || v === 'comment' ? v : (typeof v === 'number' && v > 0 ? v : 0); }
    var flags = {};
    names(d.flags).sort().forEach(function (k) { if (d.flags[k] === true) flags[k] = true; });
    var e = { type: type, label: labelOf(d, type), description: isText(d.description) ? d.description : '',
      fields: copyJson(fieldsOf(d)) || {}, answer: isObj(d.answer) ? copyJson(d.answer) : null,
      records: { answers: count(r.answers), ratings: count(r.ratings), free_text: count(r.free_text) },
      flags: flags, texts: copyJson(textsOf(d)) || {} };
    if (isObj(d.row)) e.row = rowEntry(type, d);
    e.custom = ['isComplete', 'collect'].filter(function (k) { return typeof d[k] === 'function'; });
    return e;
  }
  /* How the control panel's Screens tab offers a kind (apps-script/Model.gs PP_SCREEN_TYPES is made from it). */
  function rowEntry(type, d) {
    var r = d.row;
    var out = { type: isText(r.type) ? r.type : type, label: isText(r.label) ? r.label : labelOf(d, type),
      description: isText(r.description) ? r.description : (isText(d.description) ? d.description : ''),
      builtin: r.builtin === true, needs_text: r.needs_text === true, fields: arr(r.fields).filter(isText),
      required_default: typeof r.required_default === 'boolean' ? r.required_default : null };
    ['skip_if', 'repeatable', 'icon', 'order', 'default_id', 'default_text', 'after_note'].forEach(function (k) {
      if (r[k] !== undefined) out[k] = copyJson(r[k]);
    });
    return out;
  }

  /* loadCatalogue(catalogue, warnings?) -> the types it added. Registers the
     kinds of screen of a catalogue (web/config/types.json: {"types": [...]},
     or the list itself) that this program has no code for, so the checks,
     the map and "Try a path" know them. They follow the standard rules of
     web/js/flow.js; a kind with its own rules ("custom") behaves exactly
     like that only on phones, which load its file.
     A kind this program already knows keeps its code's description (as on
     phones). warnings (optional, a list): one plain-English sentence is
     added for each such kind the catalogue describes differently, which
     means the catalogue is out of date (or was edited by hand). */
  api.loadCatalogue = function (catalogue, warnings) {
    var T = registry(), added = [];
    arr(isObj(catalogue) ? catalogue.types : catalogue).forEach(function (e) {
      if (!isObj(e) || typeof e.type !== 'string' || !CODE_RE.test(e.type) || e.type === 'group') return;
      var known = T.get(e.type);
      if (known) {
        if (!Array.isArray(warnings)) return;
        var code = catalogueEntry(e.type, known);
        var differ = uniq(Object.keys(code).concat(Object.keys(e))).filter(function (k) {
          return k.charAt(0) !== '_' && canonical(own(e, k)) !== canonical(own(code, k));
        });
        if (differ.length) {
          warnings.push('The catalogue of the kinds of screen (web/config/types.json) describes ' + q(e.type) + ' differently from the code that runs here (' +
            (differ.length === 1 ? 'its ' + q(differ[0]) + ' differs' : 'these parts differ: ' + quoted(differ)) + '), so the checks follow the code, as phones do. ' +
            'Make the catalogue again from the code:  node scripts/flow.js types --write');
        }
        return;
      }
      var d = copyJson(e) || {};
      delete d.custom;
      T.register(d);
      added.push(e.type);
    });
    return added;
  };

  function english(strings, key) {
    var v = isObj(strings) ? own(strings, key) : undefined;
    return isObj(v) && isText(own(v, 'en')) ? String(v.en) : null;
  }
  function screenLabel(inst, strings) {
    var k = inst.keys || {}, texts = textsOf(typeSpec(inst.entry.type)), F = engine();
    var text = k.text || filledText(F, texts.text, inst.vars);   // the node's text, else its kind's default (the catalogue)
    var label = k.label || filledText(F, texts.label, inst.vars);
    var parts = [];
    if (label) parts.push(english(strings, label) || label);
    if (text) parts.push(english(strings, text) || text);
    return parts.join(': ');
  }
  function itemOf(inst) {
    var e = inst.entry, rf = e.rf;
    for (var a = e; !rf && a; a = a.parent) rf = a.rf;
    return rf ? (idOf(own(inst.vars, rf.each)) === undefined ? null : String(idOf(own(inst.vars, rf.each)))) : null;
  }

  /* screens(survey, strings?) -> the screen catalogue for the dashboard, in
     display order: [{ screen, node, type, item, label_en, end }]. */
  api.screens = function (survey, strings) {
    var m = model(survey);
    if (!m.ok) return [];
    var out = m.inst.map(function (inst) {
      return { screen: inst.id, node: inst.entry.id, type: inst.entry.type, item: itemOf(inst), label_en: screenLabel(inst, strings), end: Boolean(m.F.isEnd(inst.entry.node)) };
    });
    if (!out.some(function (s) { return s.end; })) out.push({ screen: 'thanks', node: 'thanks', type: 'thank_you', item: null, label_en: english(strings, 'thanks.title') || 'thanks.title', end: true });
    return out;
  };

  /* The phone's saved state for a set of answers written like the command
     line's --set: numbers, codes, "na", "text:..." (typed) or "voice". */
  /* A list given for one answer is its parts: a value, "text:..." (typed) and "voice". For the answer of
     a pick-several question (m, 28 Oct 2026) the values together are the answer: the codes ticked. */
  function stateFrom(answers, m) {
    var state = { answers: {}, texts: {}, audio: {}, lang_chosen: true, submission_id: 'sub_simulated', session_id: 'ses_simulated',
      opened_at: null, started_at: null, submitted_at: null, resume_count: 0, events: [] };
    Object.keys(isObj(answers) ? answers : {}).forEach(function (key) {
      var v = answers[key];
      var prods = m ? own(m.producers, key) || [] : [];
      var kind = prods.length ? answerKind(prods[0], key) : null;
      var ticked = kind && kind.multi ? [] : null;
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        if (typeof x === 'string' && x.indexOf('text:') === 0) state.texts[key] = x.slice(5);
        else if (x === 'voice') state.audio[key] = { mime: 'audio/webm;codecs=opus', duration_s: 5, bytes: 10000 };
        else if (x !== undefined && x !== null && x !== '') { if (ticked) ticked.push(x); else state.answers[key] = x; }
      });
      if (ticked && (ticked.length || Array.isArray(v))) state.answers[key] = ticked;
    });
    return state;
  }
  function factsFrom(survey, facts) {
    facts = isObj(facts) ? facts : {};
    return { lang: facts.lang || survey.default_language || 'en', lang_in_url: Boolean(facts.lang_in_url),
      whats_changed_count: Number(facts.whats_changed_count) || 0, round: facts.round || 'SIM-R1' };
  }
  function scopeOf(m, steps, state) {   // what rules could see on this route
    var scope = {};
    steps.forEach(function (st) {
      if (!isObj(st.node) || m.F.isEnd(st.node)) return;
      m.F.keysOf(m.graph, m.survey, st.node, st.vars || {}).forEach(function (k) {
        if (own(state.answers, k) !== undefined) scope[k] = own(state.answers, k);
        else if (m.F.hasDetail(state, k)) scope[k] = true;
      });
    });
    return scope;
  }
  function testedValues(m, cond, vars, scope) {   // "support_gate is "no"" for an explanation
    var p = parseCond(cond), out = [];
    p.leaves.forEach(function (leaf) {
      if (leaf.subj !== 'answer') return;
      var key = m.F.fill(leaf.cond.answer, vars || {});
      var v = own(scope, key);
      var txt = key + ' is ' + (v === undefined ? 'not answered on this route' : v === true ? 'answered' : show(v));
      if (out.indexOf(txt) === -1) out.push(txt);
    });
    return out.length ? ' (' + out.join(', ') + ')' : '';
  }
  function whySkipped(m, inst, steps, scope, facts) {
    var F = m.F, chain = [];
    for (var a = inst.entry; a; a = a.parent) chain.unshift(a);
    for (var i = 0; i < chain.length; i++) {
      var e = chain[i];
      var outerVars = {};
      e.outer.forEach(function (rf) { if (own(inst.vars, rf.each) !== undefined) outerVars[rf.each] = inst.vars[rf.each]; });
      if (e.node.show_if !== undefined && !F.evalCondition(e.node.show_if, scope, { facts: facts, vars: outerVars })) {
        return (e === inst.entry ? 'only if ' : 'its group ' + q(e.id) + ' only if ') + sentence(e.node.show_if, m) + ': not true here' + testedValues(m, e.node.show_if, outerVars, scope);
      }
      if (e.rf && e.rf.where !== undefined) {
        var v2 = extend(outerVars, e.rf.each, own(inst.vars, e.rf.each));
        if (!F.evalCondition(e.rf.where, scope, { facts: facts, vars: v2 })) {
          return 'only for each ' + e.rf.each + ' where ' + sentence(e.rf.where, m) + ': not true for ' + q(idOf(own(inst.vars, e.rf.each))) + testedValues(m, e.rf.where, v2, scope);
        }
      }
    }
    var last = steps[steps.length - 1];
    var onPath = steps.map(function (st) { return st.node; });
    var from = m.entries.filter(function (e) {
      return onPath.indexOf(e.node) !== -1 && e.targets.some(function (t) { return t.res.kind === 'entry' && chain.indexOf(t.res.entry) !== -1; });
    }).pop();
    if (from) {
      var pos = -1;
      steps.forEach(function (st, k) { if (st.node === from.node) pos = k; });
      var after = steps[pos + 1];
      var taken = from.targets.filter(function (t) { return !t.def && t.res.kind === 'entry' && after && t.res.entry.node === after.node; })[0];
      return 'not on this route: after ' + q(from.id) + ' it went to ' + q(after ? after.id : 'the end') + (taken ? ' (jump: ' + sentence(taken.when, m) + ')' : '');
    }
    if (last && F.isEnd(last.node)) return 'not on this route: it ended at ' + q(last.id) + ' first';
    return 'not on this route';
  }

  function whyShown(m, e, st, prev, scope, facts) {   // --explain: the rules that let this screen in
    var F = m.F, out = [], chain = [];
    for (var a = e; a; a = a.parent) chain.unshift(a);
    chain.forEach(function (x) {
      var outerVars = {};
      x.outer.forEach(function (rf) { if (own(st.vars, rf.each) !== undefined) outerVars[rf.each] = st.vars[rf.each]; });
      if (x.node.show_if !== undefined) out.push((x === e ? '' : 'its group ' + q(x.id) + ': ') + 'only if ' + sentence(x.node.show_if, m) + ': true' + testedValues(m, x.node.show_if, outerVars, scope));
      if (x.rf && x.rf.where !== undefined) out.push('for each ' + x.rf.each + ' where ' + sentence(x.rf.where, m) + ': true for ' + q(idOf(own(st.vars, x.rf.each))) + testedValues(m, x.rf.where, st.vars, scope));
    });
    var from = prev ? m.entries.filter(function (x) { return x.node === prev.node; })[0] : null;
    if (from) {
      var jump = from.targets.filter(function (t) { return !t.def && t.res.kind === 'entry' && chain.indexOf(t.res.entry) !== -1; })[0];
      if (jump && F.evalCondition(jump.when, scope, { facts: facts, vars: {} })) out.push('reached by the jump from ' + q(from.id) + ': ' + sentence(jump.when, m));
    }
    return out;
  }

  /* simulate(survey, answers, facts, opts) -> { steps, skipped, blocked, submission, facts, unknown }
     answers: { key: value }, where a value may also be "text:...", "voice",
     or a list (a chip and its typed detail: ["other", "text:late"]).
     facts: { lang, lang_in_url, whats_changed_count, round }.
     unknown: [{ key, message }] for each answer key no screen stores (a
     typo such as "nsp"): it is simply ignored, so the command line warns. */
  api.simulate = function (survey, answers, facts, opts) {
    opts = isObj(opts) ? opts : {};
    var m = model(survey);
    if (!m.ok) throw new Error('flowCheck.simulate: the questionnaire has no usable "flow" (run the check).');
    var F = m.F, state = stateFrom(answers, m), f = factsFrom(m.survey, facts);
    var steps = F.path(m.graph, m.survey, { facts: f }, state);
    var scope = scopeOf(m, steps, state);
    var blocked = [];
    var list = steps.map(function (st, i) {
      var end = Boolean(F.isEnd(st.node));
      var ok = end || F.canProceed(st, state, m.survey);
      if (!ok) blocked.push(st.id);
      var e = m.entries.filter(function (x) { return x.node === st.node; })[0];
      var keys = isObj(st.node) && !end ? F.keysOf(m.graph, m.survey, st.node, st.vars || {}) : [];
      var given = {};
      keys.forEach(function (k) {
        if (own(state.answers, k) !== undefined) given[k] = own(state.answers, k);
        if (F.hasDetail(state, k)) given[k + ' (text/voice)'] = own(state.audio, k) ? 'voice' : 'text:' + String(own(state.texts, k)).trim();
      });
      var row = { n: i + 1, screen: st.id, node: e ? e.id : st.id, type: st.type, item: e ? itemOf({ entry: e, vars: st.vars || {} }) : null,
        label_en: e ? screenLabel({ entry: e, keys: st.keys || {}, vars: st.vars || {} }, opts.strings) : '', answers: given, blocked: !ok, end: end };
      if (opts.explain) row.why = e ? whyShown(m, e, st, steps[i - 1], scope, f) : ['added by the form: the route ran out of arrows, so it ends here'];
      return row;
    });
    var onPath = {};
    steps.forEach(function (st) { onPath[st.id] = true; });
    var skipped = [];
    m.inst.forEach(function (inst) {
      if (own(onPath, inst.id) === true) return;
      skipped.push({ id: inst.id, node: inst.entry.id, reason: whySkipped(m, inst, steps, scope, f) });
    });
    var meta = { survey_id: m.survey.survey_id, config_version: m.survey.config_version, app_version: 'simulate', dc: 'DC-SIM-001', t: '',
      round: f.round, lang: f.lang, mode: 'simulate', sent_at: '2000-01-01T00:00:00.000Z', attempt: 1, client: { simulated: true } };
    var submission = F.buildSubmission(m.survey, state, steps, meta, function (itemId) { return own(state.audio, itemId) ? 'U0lNVUxBVEVE' : null; });
    var stored = Object.keys(m.producers);
    var unknown = Object.keys(isObj(answers) ? answers : {}).filter(function (k) { return !has(m.producers, k); }).map(function (k) {
      // a near spelling, or the same letters in another order ("nsp" for "nps")
      var sorted = k.split('').sort().join('');
      var swapped = stored.filter(function (x) { return x !== k && x.length === k.length && x.split('').sort().join('') === sorted; })[0];
      var hint = didYouMean(k, stored) || (swapped ? ' Did you mean ' + q(swapped) + '?' : '');
      return { key: k, message: 'No screen of this questionnaire stores the answer ' + q(k) + ', so it was ignored.' + hint };
    });
    return { steps: list, skipped: skipped, blocked: blocked, submission: submission, facts: f, unknown: unknown };
  };

  /* paths(survey, opts) -> { routes: [{ nodes, screens, count, example }], sets, exhaustive }
     A route = the nodes shown, in order (repeats of a looped screen
     counted in "repeats"); opts.screens = true compares screen by screen.
     opts.limit = at most this many routes (the most common first). */
  api.paths = function (survey, opts) {
    opts = isObj(opts) ? opts : {};
    var m = model(survey);
    if (!m.ok) return { routes: [], sets: 0, exhaustive: true };
    var sets = answerSets(m, { cap: opts.cap || WALK_CAP, seed: 11 });
    var by = {}, order = [];
    sets.list.forEach(function (set) {
      var steps = m.F.path(m.graph, m.survey, { facts: set.facts }, set.state);
      var nodes = [], repeats = {};
      steps.forEach(function (st) {
        var e = m.entries.filter(function (x) { return x.node === st.node; })[0];
        var id = e ? e.id : st.id;
        if (nodes.indexOf(id) === -1) nodes.push(id);
        repeats[id] = (own(repeats, id) || 0) + 1;
      });
      var sig = opts.screens ? steps.map(function (st) { return st.id; }).join(' ') : nodes.join(' ');
      if (!has(by, sig)) {
        by[sig] = { nodes: nodes, screens: steps.map(function (st) { return st.id; }), count: 0, example: { answers: set.example, facts: set.facts }, repeats: {} };
        order.push(sig);
      }
      var r = by[sig];
      r.count++;
      Object.keys(repeats).forEach(function (id) {
        var x = own(r.repeats, id) || (r.repeats[id] = [repeats[id], repeats[id]]);
        x[0] = Math.min(x[0], repeats[id]);
        x[1] = Math.max(x[1], repeats[id]);
      });
    });
    var routes = order.map(function (sig, i) { by[sig].first = i; return by[sig]; });
    routes.sort(function (x, y) { return (y.count - x.count) || (x.first - y.first); });   // the most common first
    routes.forEach(function (r) { delete r.first; });
    var total = routes.length;
    if (opts.limit > 0) routes = routes.slice(0, opts.limit);
    return { routes: routes, total: total, sets: sets.list.length, exhaustive: sets.exhaustive };
  };

  /* compare(surveyA, surveyB, opts) -> { same, sets, differences, count }
     The same answers through both: do they show the same screens and send
     the same answers, ratings and typed/voice items? opts.samples = extra
     random answer sets (default 200); opts.limit = differences kept (20). */
  api.compare = function (surveyA, surveyB, opts) {
    opts = isObj(opts) ? opts : {};
    var a = model(surveyA), b = model(surveyB);
    if (!a.ok || !b.ok) throw new Error('flowCheck.compare: ' + (!a.ok ? 'the first' : 'the second') + ' questionnaire has no usable "flow".');
    var F = a.F;
    var sets = answerSets(a, { cap: opts.cap || WALK_CAP, seed: 3, models: [a, b] }).list;
    var keys = uniq(Object.keys(a.producers).concat(Object.keys(b.producers))).sort();
    var rnd = random(opts.seed || 5);
    var samples = opts.samples === undefined ? 200 : Number(opts.samples) || 0;
    for (var i = 0; i < samples; i++) {
      var state = { answers: {}, texts: {}, audio: {}, lang_chosen: true }, example = {};
      keys.forEach(function (key) {
        var prod = (own(a.producers, key) || own(b.producers, key))[0];
        var kind = answerKind(prod, key);
        if (!kind) return;
        var cands = candidates(kind).concat(kind.text ? [] : [{ none: true }]);
        var v = cands[Math.floor(rnd() * cands.length)];
        if (v.a !== undefined) { state.answers[key] = v.a; example[key] = v.a; }
        if (v.t || (kind.detail && rnd() < 0.3)) {   // a picked problem may come with its typed or spoken detail
          if (rnd() < 0.5) { state.texts[key] = 'typed ' + i; example[key + ' (detail)'] = 'text:typed ' + i; } else { state.audio[key] = { mime: 'audio/webm;codecs=opus', duration_s: 3, bytes: 900 }; example[key + ' (detail)'] = 'voice'; }
        }
      });
      var facts = { lang: a.languages[Math.floor(rnd() * a.languages.length)], lang_in_url: rnd() < 0.5, whats_changed_count: Math.floor(rnd() * 3), round: 'SIM-R1' };
      sets.push({ state: state, facts: facts, example: example });
    }
    var meta = { survey_id: 'compare', config_version: 'compare', app_version: 'compare', dc: 'DC-SIM-001', t: '', round: 'SIM-R1', lang: 'en',
      mode: 'simulate', sent_at: '2000-01-01T00:00:00.000Z', attempt: 1, client: {} };
    function run(mm, set) {
      var state = copyJson(set.state);
      state.submission_id = 'sub'; state.session_id = 'ses'; state.events = [];
      var steps = F.path(mm.graph, mm.survey, { facts: set.facts }, state);
      var sub = F.buildSubmission(mm.survey, state, steps, meta, function (id) { return state.audio[id] ? 'QUJD' : null; });
      return { screens: steps.map(function (s) { return s.id; }), data: JSON.stringify({ answers: sub.answers, ratings: sub.ratings, free_text: sub.free_text }) };
    }
    var diffs = [], count = 0, limit = opts.limit || 20;
    sets.forEach(function (set) {
      var ra = run(a, set), rb = run(b, set);
      var sameScreens = ra.screens.join(' ') === rb.screens.join(' ');
      if (sameScreens && ra.data === rb.data) return;
      count++;
      if (diffs.length < limit) {
        diffs.push({ answers: set.example, facts: set.facts, what: sameScreens ? 'data' : 'screens', screens_a: ra.screens, screens_b: rb.screens,
          data_a: sameScreens ? JSON.parse(ra.data) : undefined, data_b: sameScreens ? JSON.parse(rb.data) : undefined });
      }
    });
    return { same: count === 0, sets: sets.length, count: count, differences: diffs };
  };

  /* ---- the map: Mermaid and docs/flow.md ----------------------------------------- */
  function mmText(s) {   // text inside a Mermaid "quoted" label
    return String(s).replace(/#/g, '#35;').replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')
      .replace(/\{/g, '#123;').replace(/\}/g, '#125;').replace(/`/g, '#96;').replace(/\|/g, '#124;').replace(/[\r\n]+/g, ' ');
  }
  function mmId(prefix, id) { return prefix + String(id === null || id === undefined ? 'unnamed' : id).replace(/[^A-Za-z0-9_]/g, '_'); }
  function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function kindLabel(type) { var d = typeSpec(type); return d ? labelOf(d, type) : type === 'group' ? 'Group' : String(type); }
  function nodeQuestion(m, e, strings) {   // the English question of a node (templates left as {area})
    var n = e.node;
    var key = isText(n.text) ? n.text : textsOf(typeSpec(n.type)).text;
    if (!key) return '';
    return placeholders(key).length ? key : (english(strings, key) || key);
  }

  /* toMermaid(survey, strings) -> Mermaid "flowchart TD" text. */
  api.toMermaid = function (survey, strings) {
    var m = model(survey);
    var L = ['flowchart TD'];
    if (!m.ok) { L.push('  START(["The flow cannot be read: run the check"])'); return L.join('\n'); }
    var F = m.F;
    function nid(e) { return mmId('n_', e.id !== null ? e.id : 'idx' + e.idx); }
    function entryOf(e) {   // where an arrow into this node lands (its rule first)
      if (e.node.show_if !== undefined) return nid(e) + '_if';
      if (e.group) return mmId('L_', e.id) + '_start';
      return nid(e);
    }
    function dest(e, t) {
      if (t.res.kind === 'entry') return entryOf(t.res.entry);
      if (t.res.kind === 'pass_end') return mmId('L_', t.res.group.id) + '_pass';
      var missing = mmId('missing_', t.to);
      L.push('  ' + missing + '{{"' + mmText('missing: ' + show(t.to)) + '"}}');
      return missing;
    }
    function box(e) {
      var n = e.node, end = F.isEnd(n);
      var question = nodeQuestion(m, e, strings);
      var code = n.store_as || n.id;
      var label = '<b>' + mmText(end ? 'Ending' : kindLabel(n.type)) + '</b>' + (question ? '<br/>' + mmText(cut(question, 70)) : '') +
        '<br/><small>' + mmText(code === undefined || code === null ? '' : code) + (end ? ': sends the answers' : '') + '</small>';
      return end ? nid(e) + '(["' + label + '"])' : nid(e) + '["' + label + '"]';
    }
    function loopTitle(e) {
      var rf = e.rf, items = itemsOf(m, rf).map(idOf);
      return 'For each ' + rf.each + ' (' + items.length + (items.length ? ': ' + cut(items.join(', '), 60) : '') + ')' +
        (rf.where !== undefined ? ' where ' + sentence(rf.where, m) : '');
    }
    function arrowsOf(e, pad, from) {
      var hasJumps = e.targets.some(function (t) { return !t.def; });
      e.targets.forEach(function (t) {
        var to = dest(e, t);
        if (!t.def) L.push(pad + from + ' -->|"' + mmText('if ' + sentence(t.when, m)) + '"| ' + to);
        else L.push(pad + from + (hasJumps ? ' -->|otherwise| ' : ' --> ') + to);
      });
    }
    function draw(list, pad) {
      list.entries.forEach(function (e) {
        var n = e.node;
        if (n.show_if !== undefined) {
          L.push(pad + nid(e) + '_if{"' + mmText('only if ' + sentence(n.show_if, m)) + '"}');
          L.push(pad + nid(e) + '_if -->|yes| ' + (e.group ? mmId('L_', e.id) + '_start' : nid(e)));
          var d = e.targets.filter(function (t) { return t.def; })[0];
          if (d) L.push(pad + nid(e) + '_if -.->|"no: skipped"| ' + dest(e, d));
        }
        if (e.group) {
          var title = e.rf ? loopTitle(e) : 'Group ' + e.id;
          L.push(pad + 'subgraph ' + mmId('L_', e.id) + ' ["' + mmText(title) + '"]');
          L.push(pad + '  ' + mmId('L_', e.id) + '_start(("' + mmText(e.rf ? 'each ' + e.rf.each : 'start') + '"))');
          if (e.start) L.push(pad + '  ' + mmId('L_', e.id) + '_start --> ' + entryOf(e.start));
          if (e.body) draw(e.body, pad + '  ');
          L.push(pad + '  ' + mmId('L_', e.id) + '_pass(("' + mmText(e.rf ? 'next ' + e.rf.each : 'end of group') + '"))');
          L.push(pad + 'end');
          var hasJumps = e.targets.some(function (t) { return !t.def; });
          e.targets.forEach(function (t) {
            var to = dest(e, t);
            var label = !t.def ? 'if ' + sentence(t.when, m) : (e.rf ? 'after the last ' + e.rf.each : (hasJumps ? 'otherwise' : ''));
            L.push(pad + mmId('L_', e.id) + '_pass ' + (label ? '-->|"' + mmText(label) + '"| ' : '--> ') + to);
          });
          return;
        }
        if (e.rf) {
          L.push(pad + 'subgraph ' + mmId('L_', e.id) + ' ["' + mmText(loopTitle(e)) + '"]');
          L.push(pad + '  ' + box(e));
          L.push(pad + 'end');
        } else {
          L.push(pad + box(e));
        }
        arrowsOf(e, pad, nid(e));
      });
    }
    L.push('  START(["' + mmText('Partner opens the link (after the checks above)') + '"])');
    if (m.startEntry) L.push('  START --> ' + entryOf(m.startEntry));
    draw(m.top, '  ');
    if (!m.entries.some(function (e) { return !e.group && F.isEnd(e.node); })) L.push('  AUTO_END(["' + mmText('Ending added by the form: sends the answers') + '"])');
    return L.join('\n');
  };

  var BEFORE = [
    'flowchart TD',
    '  A(["Partner opens the link"])',
    '  B{"Does the link have dc, t and round?"}',
    '  X1[["Message: this link is incomplete"]]',
    '  C["Load the questionnaire published in the control panel<br/>(the form#39;s own copy if Google does not answer in time)"]',
    '  D{"Round status?"}',
    '  X2[["Message: this survey is not open yet"]]',
    '  X3[["Message: this survey has closed"]]',
    '  E{"On this phone ..."}',
    '  X4[["Message: your answers were already received"]]',
    '  X5[["Thank-you screen: sends the answers again"]]',
    '  X6[["Message: this link is not valid"]]',
    '  F(["The questionnaire below: its start,<br/>or where the partner left off"])',
    '  A --> B',
    '  B -->|"no"| X1',
    '  B -->|"yes"| C',
    '  C --> D',
    '  D -->|"draft"| X2',
    '  D -->|"closed, nothing started or unsent on this phone"| X3',
    '  D -->|"open, or closed but started on this phone"| E',
    '  E -->|"already sent"| X4',
    '  E -->|"finished but not sent"| X5',
    '  E -->|"refused before"| X6',
    '  E -->|"otherwise"| F',
    '  F -.->|"Google answers the opened message: wrong token"| X6'
  ].join('\n');

  function mdText(s) { return String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\r\n]+/g, ' '); }
  function md(s) { return '`' + String(s).replace(/`/g, "'") + '`'; }

  /* toMarkdown(survey, strings, opts) -> the whole of docs/flow.md.
     opts.source = where the questionnaire came from (shown at the top). */
  api.toMarkdown = function (survey, strings, opts) {
    opts = isObj(opts) ? opts : {};
    var m = model(survey);
    var source = opts.source || 'web/config/survey.json';
    var out = [];
    out.push('<!-- GENERATED by  node scripts/flow.js map --write  (or python3 scripts/flow.py map --write) from ' + source + '. Do not edit by hand: python3 scripts/check_config.py warns when it is out of date. -->');
    out.push('# The questionnaire as a map');
    out.push('');
    out.push('**What this is.** A picture of every route a partner can take through the questionnaire, made by the same engine the phones run (`web/js/flow.js`), so it cannot disagree with the form.');
    out.push('');
    out.push('- **Source:** ' + md(source) + ', ' + (survey && survey.config_version ? 'config_version ' + md(survey.config_version) + ', ' : '') +
      (m.legacy ? 'today\'s list format, shown as the graph the engine makes of it.' : 'graph format ' + md(m.F.FORMAT) + '.'));
    out.push('- **Regenerate it** after every change to the flow (Terminal, in the project folder): `python3 scripts/flow.py map --write`.');
    out.push('- **Check it:** `python3 scripts/flow.py check`. **Try answers:** `python3 scripts/flow.py simulate --set nps=4 --set support_gate=no`.');
    out.push('- How the flow format works: [flow-engine.md](flow-engine.md); in plain English: [config-guide.md](config-guide.md).');
    out.push('');
    out.push('## 1. Before the questionnaire (fixed, in the form\'s code)');
    out.push('');
    out.push('These checks are security rules, so they stay in `web/js/app.js` and no settings change can skip them.');
    out.push('');
    out.push('```mermaid');
    out.push(BEFORE);
    out.push('```');
    out.push('');
    out.push('## 2. The questionnaire');
    out.push('');
    out.push('Boxes are screens, diamonds are "only if" rules (a "no" skips the screen), labelled arrows are jumps, framed boxes are loops, round boxes are endings (they send the answers).');
    out.push('');
    out.push('```mermaid');
    out.push(api.toMermaid(survey, strings));
    out.push('```');
    out.push('');
    out.push('## 3. Every screen');
    out.push('');
    if (!m.ok) {
      out.push('The flow cannot be read. Run `python3 scripts/flow.py check`.');
      return out.join('\n') + '\n';
    }
    out.push('| Code | Kind | Question (English) | Shown | Then | Answers stored as |');
    out.push('|---|---|---|---|---|---|');
    m.entries.forEach(function (e) {
      var n = e.node, F = m.F;
      var shown = [];
      if (n.show_if !== undefined) shown.push('only if ' + sentence(n.show_if, m));
      if (e.rf) shown.push('for each ' + e.rf.each + ' (' + itemsOf(m, e.rf).length + ')' + (e.rf.where !== undefined ? ' where ' + sentence(e.rf.where, m) : ''));
      var then = e.targets.map(function (t) {
        var to = t.to === '@next_item' ? 'next ' + (e.parent && e.parent.rf ? e.parent.rf.each : 'pass') : String(t.to);
        return (t.def ? (e.targets.length > 1 ? 'otherwise → ' : '') : 'if ' + sentence(t.when, m) + ' → ') + to;
      }).join('; ');
      if (F.isEnd(n) && !then) then = 'the end: sends the answers';
      var stored = [];
      if (!e.group) {
        var inst = e.insts[0];
        var spec = typeSpec(n.type);
        if (!spec || isObj(spec.answer)) {
          if (!spec || spec.answer.kind !== 'rows') stored.push(md(n.store_as || n.id));   // a block of rows stores only its rows
          if (isObj(n.rows) && n.rows.store_as) stored.push(md(n.rows.store_as) + (inst ? ' (' + plural(arr(inst.keys.rows).length, 'item') + ')' : ''));
          if (isObj(n.comment) && n.comment.store_as) stored.push(md(n.comment.store_as));
        }
      }
      var question = e.group ? '' : nodeQuestion(m, e, strings);
      out.push('| ' + (e.parent ? '↳ ' : '') + md(e.id) + ' | ' + mdText(kindLabel(n.type)) + ' | ' + mdText(question) + ' | ' + mdText(shown.join('; ') || 'always') +
        ' | ' + mdText(then || '—') + ' | ' + (stored.length ? stored.join(', ') : '—') + ' |');
    });
    out.push('');
    out.push('## 4. Example routes');
    out.push('');
    var routes = api.paths(survey, {}).routes;
    var picks = [];
    if (routes.length) {
      var longest = routes[0], shortest = routes[0];
      routes.forEach(function (r) {
        if (r.screens.length > longest.screens.length) longest = r;
        if (r.screens.length < shortest.screens.length) shortest = r;
      });
      picks.push({ title: 'The route most answer combinations take', r: routes[0] });
      if (longest !== routes[0]) picks.push({ title: 'The longest route', r: longest });
      if (shortest !== routes[0] && shortest !== longest) picks.push({ title: 'The shortest route', r: shortest });
    }
    out.push('Made by `simulate` with the answers shown (answers no rule tests are left out). ' + plural(routes.length, 'distinct route') +
      ' in total; list them with `python3 scripts/flow.py paths`.');
    picks.forEach(function (p, i) {
      out.push('');
      var ans = Object.keys(p.r.example.answers).map(function (k) { return k + '=' + valueText(p.r.example.answers[k]); });
      var facts = p.r.example.facts;
      var bits = [];
      if (facts.lang_in_url) bits.push('a link with ?lang=');
      if (facts.whats_changed_count) bits.push(facts.whats_changed_count + ' "what changed" item' + (facts.whats_changed_count === 1 ? '' : 's'));
      if (facts.lang && facts.lang !== ((isObj(survey) && survey.default_language) || 'en')) bits.push('language ' + facts.lang);
      out.push('**' + (i + 1) + '. ' + p.title + '** (' + plural(p.r.screens.length, 'screen') + '): ' + (ans.length ? mdText(ans.join(', ')) : 'no answers needed') + (bits.length ? '; ' + mdText(bits.join(', ')) : '') + '.');
      out.push('');
      var sim = api.simulate(survey, p.r.example.answers, p.r.example.facts, { strings: strings });
      sim.steps.forEach(function (st) {
        out.push(st.n + '. ' + md(st.screen) + (st.label_en ? ': ' + mdText(cut(st.label_en, 90)) : ''));
      });
    });
    return out.join('\n') + '\n';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

}(typeof window !== 'undefined' ? window : globalThis));
