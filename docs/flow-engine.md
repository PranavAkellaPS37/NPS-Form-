# Flow engine: the graph format and the engine's contract

**Who this is for:** developers and build agents. Pranav doesn't need to read it: he edits the flow in the control panel. The plain-English guides are [control-panel.md](control-panel.md) (the panel) and [config-guide.md](config-guide.md) (the files), and the reasons are in [flow-graph-proposal.md](flow-graph-proposal.md).

**What it covers:**
- the flow format `pp-flow/1` (§1–3, 5);
- the engine `web/js/flow.js`, on every phone, with the registry of question kinds `PP.types` (§4);
- the checker `web/js/flow-check.js`, never on phones (§6);
- the command `scripts/flow.js` (§7) and compatibility (§8);
- the control panel's side: `web/js/flow-panel.js`, the generated `apps-script/Flow.gs`, and what Model.gs, Code.gs, PanelServer.gs and Panel.html do with them (§9);
- question kinds as plug-ins: `web/js/types/<code>.js` and `web/config/types.json` (§10).

**Status:** built 23–26 Oct 2026 in five stages, approved by Pranav on 23 Oct (spec §4), then reviewed and fixed on 26 Oct. This file describes what was built; where the build differs from the proposal, the difference is stated.

**The rule behind everything:**
- There is **one** engine (`flow.js`), **one** checker (`flow-check.js`) and **one** rows-to-graph converter (`flow-panel.js`).
- Phones, the control panel (its window and Publish, through `Flow.gs`), the command line and GitHub's deploy check all run the same files.
- Never write a second copy of any rule.

---

## 1. Where the flow lives

| Surface | Where | Format |
|---|---|---|
| Live | `survey.flow` inside each published `published/p<N>.json`, delivered by the bootstrap | the graph (`pp-flow/1`): Publish always compiles one since stage 4 |
| Form's own copy | `web/config/survey.json` → `flow` | the graph since 26 Oct 2026 (`scripts/flow.js migrate --write`, §7) |
| Old versions p1…pN | Drive, never rewritten | the list format, converted on read for ever |

The engine accepts both shapes everywhere:
- **A list** is the old format ("legacy"). `flow.fromLegacy` converts it to a graph (§5).
- **An object with `"format": "pp-flow/1"`** is a graph.

Anything else, an unknown `format`, or a graph a phone can't run (`PP.flow.isUsable`, §4.2) is unusable. The form then uses its own copy.

## 2. The graph format `pp-flow/1`

```json
{ "format": "pp-flow/1",
  "start": "language",
  "collections": { "areas": { "list": "functions", "defaults": { "threshold": 3 } },
                   "support_items": { "list": "support.items" } },
  "nodes": [ … ] }
```

| Key | Meaning |
|---|---|
| `format` | Exactly `"pp-flow/1"`. Change it only together with every reader. |
| `start` | The id of the first top-level node. It must name a top-level node, or phones don't use the graph (§4.2). |
| `collections` | The lists a node can repeat over. `list` is a dotted path into the survey object (`functions`, `support.items`). An item that is a plain string becomes `{ "id": "<string>" }`; an object item is copied. `defaults` fills a field that is missing **or of another kind**: an area without a numeric `threshold` gets the collection's default. In a graph that default, not `deep_dive.threshold`, is what phones use (check S1, §6). |
| `nodes` | The top-level nodes in display order (panel, map). Arrows (`next`) decide the route, not the order. |
| `_help`, `_note`, any key starting with `_` | Notes for humans, anywhere. Ignored. The repo copy carries `_help` = `PP.flowPanel.FLOW_HELP`. |

### 2.1 Fields every node can have

| Field | Meaning |
|---|---|
| `id` | Permanent code `^[a-z][a-z0-9_]*$`, at most 60 characters, unique in the whole graph (group bodies included). Locked once partners have answered under it. Names such as `constructor` or `toString` are ordinary codes (§4.5). |
| `type` | A registered kind (§4.7, §10) or `group`. |
| `store_as` | The answer key. Default: `id`. In a loop it **must** contain every loop variable around it (`fn_rating:{area}`). After filling, it is the step id, the answer key and the screen name in `events` and pings: at most 80 characters, which is the ping limit (Code.gs `MAX_PING_FIELD_CHARS.screen`). |
| `show_if` | A condition (§2.3). False means the node is skipped and its **default** arrow is followed. On a repeated node it is tested once, before the loop, and may not use the node's own loop variable. |
| `repeat_for` | `{ "each": "<var>", "in": "<collection>", "where": <condition> }`: one step (or one pass through a group body) per item, in collection order. Items whose `where` is false are left out. `where` sees the item as `{<var>}` / `{"var": "<var>.<field>"}` and every answer before the node. |
| `next` | Where to go after the node: a node id, **or** an ordered list `[ {"when": <cond>, "goto": "<id>"}, …, {"default": "<id>"} ]`. The first true `when` wins. Exactly one `default`, and it comes last. Every node except an ending must have `next`. An ending with a `show_if` needs a `next` for when it is skipped. |
| `required` | `false` = the partner may skip. The default comes from the kind's description (`PP.types.isRequired`, §4.7). |
| `text`, `help`, `label` | String keys (into `web/i18n/strings.json`). Templates are allowed: `fn.{area}.name`. |

### 2.2 Groups, loops and special targets

- **Group:** `{ "id", "type": "group", "repeat_for"?, "body": { "start": "<id>", "nodes": [ … ] }, "next" }`.
  - The body is a small flow, run once (or once per item).
  - A body arrow may point to a body node, to `"@next_item"` (this pass is over), or to a **later top-level node** (leave the loop early).
  - Group ids never reach the data and aren't locked codes.
- **No back arrows.** Repeating exists only through `repeat_for`. Any arrow cycle is an error (checker G3), so every path ends.
- **Safety net:** the engine stops a walk at 2,000 steps and throws. A checked flow can't reach that.

### 2.3 Conditions

```
Condition := { Subject, Test } | {"all":[Condition,…]} | {"any":[Condition,…]} | {"not": Condition}
Subject   := "answer": "<key>"          (templates allowed inside loops: "fn_rating:{area}")
           | "fact": "lang" | "lang_in_url" | "whats_changed_count" | "round"
           | "var": "<loopvar>.<field>" (a field of the current loop item; "<loopvar>" alone = its id)
Test      := "equals" V | "not_equals" V | "at_most" N | "at_least" N | "in" [V,…] | "answered" true|false
V, N      := a literal, or {"var": "<loopvar>.<field>"}
```

**What each test does.** This is exactly the old `evalCondition`. Do not "improve" it, because published rules depend on it.
- A value "exists" when it is not `undefined`, `null` or `""`.
- `equals`: it exists and `String(value) === String(V)`.
- `not_equals`: it doesn't exist, **or** `String(value) !== String(V)`.
- `at_most` / `at_least`: the value is a number (`typeof === 'number'`) and the comparison holds. `"na"` is never a number, so it is never "low".
- `in`: it exists and `String(value)` is among the list's values as text.
- `answered: true|false`: it exists, or it doesn't.
- Free text counts as `true` when there is non-blank text or a voice note.
- An unknown test is **true** (the screen shows), as before; the checker refuses it (R2).
- **Symbols.** The panel, map and simulator show `==  !=  <=  >=  in  exists`; only the words above are stored.
- **Own keys only.** Answers, facts and loop items are read as the object's own properties (`own()` in flow.js), so an answer key equal to a name every JavaScript object inherits (`constructor`, `toString`, `valueOf`) is never "answered" before a tap (26 Oct 2026).

**What a condition can see (path-scoped answers):**

| Condition | Sees |
|---|---|
| `show_if` | answers of steps **before** the node on the current path |
| `repeat_for.where` | the same, plus the loop item |
| `show_if` inside a group body | the same, plus this item's earlier body answers |
| `next[].when` | everything up to **and including** the node's own answer(s) |

**How the scope is built:**
- When a step is emitted, every key it stores (`flow.keysOf`: `store_as`, each row's key, the comment key) is added to the scope.
- The value is the saved answer, or `true` for typed or voice text.
- Answers of steps that are **not** on the current path are invisible. They stay saved on the phone, so going back to that branch restores them, but they are never tested and never sent. This is the stale-answer fix (proposal §2 problem 1).

**Facts:**
- `lang`: the language shown now. A rule on it can take the screen on show off the route when the partner switches language with the header button; app.js then carries on as a resumed visit would (§8).
- `lang_in_url`: the link had a valid `?lang=`.
- `whats_changed_count`: the number of "what changed" items for this round.
- `round`: the round id.

### 2.4 Endings

- Every node of a kind whose description has `flags.end` (today only `thank_you`) is an ending. A path stops at the first ending it reaches, and reaching one sends the answers.
- There may be several endings; each may have its own `text` and `body` keys (default `thanks.title` / `thanks.body`). The data shows which one: the `events` end at that ending's id (docs/submission-format.md).
- In the control panel, extra endings are rows below the main thank-you, reached only by jumps (§9.1).
- **Safety net, as before:** if a walk runs off the graph without reaching an ending, the engine appends `{id: "thanks", type: "thank_you"}`.

## 3. Types: what each one stores and when Next is allowed

The table is the **old behaviour, unchanged**: `canProceed` and `buildSubmission` of web/js/flow.js before the refactor. The frozen copy is `tests/flow/legacy/flow_v1.js`. Since stage 5 each kind is described once in the registry (§4.7). Five built-in kinds (`nps_0_10`, `rating_1_5`, `yes_no`, `single_choice`, `free_text`) bring no rules of their own: they get the **standard rules** worked out from their description, and `tests/flow/legacy_diff.js` plus the drawing comparison in `tests/flow/types_test.js` prove nothing changed.

| Type | Answer (key = step id) | Next allowed when | Adds to the submission |
|---|---|---|---|
| `language_picker` | — (`state.lang_chosen`) | a language was chosen | — |
| `whats_changed` | — | always | — |
| `nps_0_10` | 0–10 | `required === false` or answered | `answers[id]` |
| `yes_no` | `"yes"` / `"no"` | same | `answers[id]` |
| `single_choice` | an option code | same | `answers[id]` |
| `rating_1_5` | 1–5 | same | `answers[id]` + ratings row `{block:"question", item:id, rating, not_applicable:false, threshold:null, below_threshold:null, issue_code:null}` |
| `free_text` | text/voice under `texts[id]` / `audio[id]` | `required !== true` or has text/voice | free_text row `{item_id:id, block: node.block or "question", function:null, issue_code:null, question_key: node.text or null, text, audio}` |
| `info_card` | — | always | — |
| `function_rating` | 1–5 or `"na"` | answered (`required` is ignored, as before: it only shows a Skip button) | ratings row `{block:"function", item: area.id, rating (null if na), not_applicable, threshold: the area's, below_threshold: !na && number && rating ≤ threshold, issue_code: the chip at fill(issue_code_from) if that step is on the path, else null}` |
| `function_deep_dive` | a chip code (`"other"` allowed) | chip chosen unless `require_choice === false`; if `"other"` and `require_detail_if_other !== false`, text/voice needed | free_text row `{item_id:id, block:"function", function: area.id, issue_code: chip, question_key: node.detail_text or "q.tell_more", text, audio}` (only if text or voice exists) |
| `support_block` | one 1–5 (or `"na"`) per row key, plus the comment | `required === false`, or every row answered | ratings rows `{block:"support", item: row item id, …}` in row order; comment free_text row `{item_id: comment.store_as, block:"support", question_key: comment.text}` |
| `thank_you` | — | always | — (an **ending**) |

**Type-specific fields** (all optional unless marked ★):
- `nps_0_10`: `text`★, `low_label`, `high_label`, `scale_hint`.
- `rating_1_5`, `yes_no`, `free_text`: `text`★. `free_text` also has `block` (`"question"` or `"one_fix"`).
- `single_choice`: `text`★ and `options`★, which is one of:
  - a list of codes, labelled `choice.<id>.<code>`;
  - a list of `{code, text}`;
  - `{ "from": "<loopvar>.<field>", "text": "<template with {code}>", "other": "<key>" }`.
- `info_card`: `text`★, `body`.
- `function_rating`: `text`, `label`, `help`, `allow_not_applicable`, `issue_code_from`.
- `function_deep_dive`: `text`, `label`, `rating_from`, `options` (from the area), `detail_text`, `detail_text_required`, `require_choice`, `require_detail_if_other`.
- `support_block`: `text`★, `rows`★ `{each, in, store_as, text}`, `allow_not_applicable`, `comment` `{store_as, text}`.
- `thank_you`: `text`, `body`.

The machine-readable version of these fields is each kind's `fields` in `web/config/types.json` (§10.2).

**The node's settings win.** A graph carries its own copies of the problem-screen, rating and support settings (`require_choice`, `require_detail_if_other`, `allow_not_applicable`, `comment`, and the areas' default threshold in `collections`). Phones follow those, and use survey.json's `deep_dive`, `rating` and `support` only where a node sets nothing (web/js/ui.js `nodeSetting`). Check S1 (§6) makes a disagreement an error in the repo copy.

**Byte-identical data.** Object key order in `answers`, the ratings rows and the free_text rows must equal the old engine's. Submissions are compared as `JSON.stringify` output.

## 4. The engine: `web/js/flow.js` (ES5, global `PP.flow`, `module.exports = PP.flow` under Node)

### 4.1 File rules

- **ES5 only** (Chrome 61): no `let`, `const`, arrows, `?.`, `??` or template strings. It must parse with acorn `ecmaVersion: 5`; `node scripts/flow.js es5` checks it, with every other script phones load (§7).
- **No DOM**, so it runs in Node, in Apps Script and on phones.
- **The file is one IIFE** that ends with exactly `}(typeof window !== 'undefined' ? window : globalThis));`. `scripts/build_flow_gs.js` and the panel window rely on this (§9.5).
- **Size.** flow.js is about 40 KB (41,405 bytes on 26 Oct 2026; 13 KB before the refactor): the engine, the registry and the descriptions of the 12 built-in kinds. About 5.6 KB of that is panel-only text (labels, descriptions, row settings) that every phone downloads. The whole page is 267.6 KB, **89% of the 300 KB budget** (`python3 scripts/check_config.py` prints it). If the budget gets tight, the panel-only text can move to a tools-only file that `build_flow_gs.js` and the `types` command include but `index.html` doesn't.

### 4.2 Constants

- `PP.flow.ENGINE = 2`: Publish's guard reads this number as text from the form on GitHub (§9.5).
- `PP.flow.FORMAT = 'pp-flow/1'`.
- `PP.flow.supportsFormat(flowValue)`: true for a non-empty list (legacy) or any object with `format === FORMAT`. It looks at the format only.
- `PP.flow.isUsable(flowValue)`: can a phone run it at all? True for a non-empty list, or a graph whose `start` is a non-empty string naming one of its **top-level** nodes. A graph without nodes, or whose start names nothing, would show an empty screen that sends nothing, so the form treats it like an unknown format (§8).

### 4.3 Loading

- **`PP.flow.load(survey)` → graph**, normalised and indexed:
  - `graph.byId` holds the top-level nodes, and every group gets `body.byId`;
  - `graph.legacy` is `true` when it came from a list.
  - The result is cached per survey object (and its `flow` value), so calling it on every navigation is cheap. Editing a flow's nodes in place and loading the same survey again returns the cached graph; tools that edit must use a fresh copy.
  - A malformed graph doesn't throw: the walk's safety net still ends the path. The one exception is an arrow loop (checker G3), which the 2,000-step guard of §2.2 stops with an `Error` whose message starts with `flow:`.
- **`PP.flow.fromLegacy(survey)` → graph** (§5).
- **`PP.flow.isGraph(value)`**.
- **`PP.flow.hasType(survey, type)`**: is there a node of this type anywhere, group bodies included? app.js uses it for `whats_changed`.

### 4.4 The walk

**`PP.flow.path(graph, survey, ctx, state)` → steps.**
- `ctx = { facts: { lang, lang_in_url, whats_changed_count, round } }`.
- `state` is what the phone saved: `{ answers, texts, audio, lang_chosen, … }`.

A step is:

```js
{ id, type, node, entry /* = node, for older code */, vars /* loop variables */,
  fn /* vars.area if the node loops over areas, else undefined: renderers use fn.id / fn.issues */,
  keys /* resolved string keys, see 4.6 */ }
```

**`PP.flow.buildSteps(config, ctx)` is kept for older callers and the existing tests.**
- `ctx` may be the old `{ answers, langInUrl, hasWhatsChanged }`, or `{ state, langInUrl, whatsChangedCount, lang, round }`.
- Without `ctx.state`, it builds `{ answers: ctx.answers || {}, texts: {}, audio: {} }`.
- `hasWhatsChanged` is mapped to a count of 1 or 0.

### 4.5 Answers and the submission

- `PP.flow.canProceed(step, state, config)`: a kind nobody described → true; otherwise the kind's own `isComplete`, else the standard rule (§4.7).
- `PP.flow.isAnswered(step, state)`: `language_picker` → `state.lang_chosen`, else `answers[step.id]` is an own key that isn't `undefined`.
- `PP.flow.buildSubmission(config, state, steps, meta, getAudio)`: the old message, byte-identical, `schema_version` 1. For each step: the kind's own `collect`, else the standard one (§4.7); a kind nobody described adds nothing.
- `PP.flow.evalCondition(cond, scope, env)` works both ways:
  - called with two arguments `(cond, answers)`, it behaves exactly like before;
  - `env = { facts, vars }`.
- Helpers kept: `indexOf`, `hasDetail`, `thresholdFor`, `isLow`, `ruleAnswers(state)` (no longer used by app.js, which passes `state`).
- New helpers:
  - `keysOf(graph, survey, node, vars)`: every key a node stores;
  - `items(graph, survey, name)`;
  - `fill(template, vars)`;
  - `isEnd(step)`: the step's kind has `flags.end`.
- **Own-key lookups everywhere.** `state.answers`, `state.texts`, `state.audio`, the rule scope and the registry are read with `own()` (`Object.prototype.hasOwnProperty`). app.js also keeps those maps free of inherited names. `tests/flow/flow_test.js` (the `constructor` / `toString` / `valueOf` case) and e2e scenario Z9 prove it.

### 4.6 `step.keys`

The resolved string keys a renderer needs, with templates filled. A field is **absent** when the node doesn't set it; the drawing then falls back to its kind's default key (`ui.keyOf(step, field, fallback)` in web/js/ui.js; the defaults are the kind's `texts`), so both formats look identical.

| Field | Type(s) | Default when absent (the kind's `texts`, drawn by web/js/types.js) |
|---|---|---|
| `text` | every question | `node.text` (generic types), `q.fn_rating`, `q.deep_dive`, `q.support_block`… |
| `label`, `help` | `function_rating`, `function_deep_dive` | `fn.<area>.name`, `fn.<area>.help` |
| `low_label`, `high_label`, `scale_hint`, `body` | as the node has them | as before |
| `options` | `single_choice`, `function_deep_dive` | `[{code, text}]`, e.g. `issue.<area>.<code>`, then Other `issue.other` |
| `detail_text`, `detail_text_required` | `function_deep_dive` | `q.tell_more`, `q.tell_more_required` |
| `rows` | `support_block` | `[{id, key, text}]`, e.g. `{id:"kept_updated", key:"support:kept_updated", text:"support.kept_updated"}` |
| `comment` | `support_block` | `{key:"support_comment", text:"q.support_comment"}` |

### 4.7 The registry of question kinds: `PP.types`

Every kind of screen is described **once**, with `PP.types.register(description)`. The phones, the checker, the command line and the control panel all read that description; nothing else keeps a list of kinds.

| Function | Does |
|---|---|
| `PP.types.register(d)` | Adds a kind, or adds to one already registered (fields merge; `undefined` values are skipped). Throws when `d.type` isn't a code `^[a-z][a-z0-9_]*$` or is `group`. Sets `end` from `flags.end`. A `render` function makes `PP.screens[type]` (the drawing app.js calls; `auto` defaults to `flags.auto`). |
| `PP.types.get(type)` | The description (own key), or `undefined`. |
| `PP.types.list()` | The types in registration order: the 6 built-in blocks first (`language_picker` … `thank_you`), then `nps_0_10`, `rating_1_5`, `yes_no`, `single_choice`, `free_text`, `info_card`, then added kinds. The checker's "Use one of" list follows it; the panel sorts its "Add a question" list by each kind's `row.order`. |
| `PP.types.isRequired(d, node, field)` | Is the answer required? The node's own true/false `field` (usually `required`), else that field's `default` in the kind's `fields`, else true. The checker asks this too. `d` may be a description or a type name. |

`PP.flow.types` is the same map (type → description), kept for older code.

**A description** (the full field list, with an example, is in config-guide.md "How to add a question type"):

| Field | Meaning |
|---|---|
| `type` | The permanent code. |
| `label`, `description` | Names for the map, the checker's messages and the panel. |
| `fields` | Its settings: `{ name: { kind, required?, default? } }`, kinds `text_key`, `bool`, `choice` (with `values`), `number`, `answer_key`, `options`, `rows`, `comment`. Anything not listed (and not common, §2.1) is checker F2. |
| `answer` | What a rule can test, or `null` (nothing to answer): `{ kind: "number", min, max, na_by? }`, `{ kind: "choice", values | values_from }`, `{ kind: "text" }` (only `answered`), or `rows` (a block). `what` names it in messages; `required_by` names the setting that makes it required (`null` = always); `optional: true` = never required. |
| `records` | What it sends: `answers` (1 = `answers[id]`), `ratings` (1 = one `question` ratings row; only for answers from 1 to 5, §10.3), `free_text` (1 = the typed text or voice note). Counted by check D3. |
| `flags` | `end` (an ending), `auto` (one tap answers it), `first` (must be the start: P1), `once` (at most one: P2), `early` (before the questions: P2). |
| `texts` | Its default text keys, with templates (`fn.{area}.name`). |
| `row` | How the panel's Screens tab offers it: `label`, `icon`, `order`, `fields` (the editor's settings), `needs_text`, `required_default`, `repeatable` (may be asked once per area, §9.1), `builtin`, `skip_if`, `default_id`, `default_text`, `after_note`, and a list-format `type` for the area blocks (`function_ratings`, `function_deep_dives`). |
| `isComplete(step, state, graph, survey)`, `collect(step, answers, out, helpers, graph, survey, state)` | Its own rules, only when the standard ones don't fit. |
| `render(ctx)` | Phones only: the drawing (web/js/types.js describes `ctx`). |

**The standard rules** (a kind without its own `isComplete` / `collect`):
- **Next:** allowed when there is nothing to answer (`answer` null, or `optional`), when the answer isn't required (`required_by`, `isRequired`), or when it is given: text or a voice note for `kind: "text"`, else an own answer under the step id.
- **Data:** `records.answers` → `answers[id]`; `records.ratings === 1` → one `question` ratings row; `kind: "text"` with `records.free_text` → one free_text row (block `node.block` or `question`, `question_key` = the step's `text` key).

**Where the code lives:**
- `web/js/flow.js`: the registry and the 12 built-in descriptions with their own rules (they must be in Flow.gs, which is built from flow.js, flow-panel.js and flow-check.js only).
- `web/js/types.js`: the built-in kinds' drawings only (`render`), registered as additions. Until 26 Oct this was `web/js/screens.js`.
- `web/js/ui.js`: the shared drawing helpers (`PP.ui`).
- `web/js/types/<code>.js`: one file per added kind, with its whole description (§10).

## 5. `fromLegacy`: the old list as a graph (keeps every quirk)

**Areas and support:**
- `collections.areas = { list: "functions", defaults: { threshold: Number(deep_dive.threshold) || 3 } }`.
- `collections.support_items = { list: "support.items" }`.

**`skip_if` and `show_if`:**
- `skip_if: "lang_in_url"` → `show_if {fact: "lang_in_url", equals: false}`.
- `skip_if: "empty"` → `show_if {fact: "whats_changed_count", at_least: 1}`.
- A line's own `show_if` is combined with these by `all`.

**The area blocks:**
- **`function_ratings` line, after-all mode:** becomes a `function_rating` node with `repeat_for {each: "area", in: "areas"}` and `store_as "fn_rating:{area}"`.
- **`function_deep_dives` line, after-all mode:** becomes a `function_deep_dive` node with `repeat_for … where {answer: "fn_rating:{area}", at_most: {var: "area.threshold"}}` and `store_as "fn_deep_dive:{area}"`. `require_choice` / `require_detail_if_other` come from `deep_dive`.
- **`deep_dive.when === "immediate"`:**
  - The ratings line becomes a group `area_loop` (renamed if taken) with `repeat_for` over areas. Its body is [rating → problem screen with the "low" rule as its `show_if` → `@next_item`].
  - The problem-screens line is **dropped**, because the old engine ignored it entirely: its position, its rule and its hidden state.

**Other lines:**
- **`support_block`:**
  - rows over `support_items`, with `store_as "support:{item}"` and text `support.{item}`;
  - `allow_not_applicable` from `support`;
  - a comment `{store_as: "support_comment", text: support.comment_text or "q.support_comment"}` unless `support.allow_comment === false`.
- **Generic lines:** keep only the fields the old engine or screens read for that type, so nothing new appears on screen:
  - `nps_0_10`: `text`, `low_label`, `high_label`, `scale_hint`, `required`;
  - `rating_1_5`, `yes_no`, `free_text`: `text`, `required`; `single_choice`: `text`, `options`, `required`;
  - `info_card`: `text`, `body`; `language_picker`: `required`; `whats_changed` and `thank_you`: none;
  - an unknown type: all seven (`text`, `body`, `options`, `low_label`, `high_label`, `scale_hint`, `required`).
- **`required` on the area ratings line is kept** on the rating node: the form shows a Skip button on a one-tap screen when it is `false` (app.js `updateNav`), although Next still needs an answer (§3). Dropped: `required` on the problem-screens line and `text` on the ratings line, which nothing reads.
- **The id `one_fix`** with type `free_text` gets `block: "one_fix"`.

**Arrows and the start:**
- **Thank-you:** as before, a `thanks` ending is appended when the list doesn't end in an unconditional thank-you. It becomes `thanks_auto` if `thanks` is taken.
- **`next`:** each node's `next` is the following node; an unconditional ending has none (a thank-you with a `show_if` gets one).
- **Start:** `start` is the first node.

**Proof:**
- `tests/flow/legacy_diff.js` compares the old engine (`tests/flow/legacy/flow_v1.js`) with the new engine over every answer combination and over Back-button scripts, on 73 questionnaires.
- Any difference must be in the stale-answer class: the old engine with off-path answers removed must then agree.

## 6. The checker: `web/js/flow-check.js` (ES5, `PP.flowCheck`; never loaded by `index.html`)

**`PP.flowCheck.check(survey, strings, opts)`** returns `{ findings, stats }`.
- Each finding is `{ level, code, node, message }`, plus `site`, `target` and `index` when it is about one rule or arrow:
  - `level` is `error`, `warning` or `info`; findings are sorted errors first.
  - `site`: `"show_if"` (its rule), `"where"` (its loop filter), `"jump"` (one of its jumps) or `"next"` (its usual arrow: a plain `next`, or the `default` of its jump list).
  - `target`: where that arrow goes. `index`: the jump's place in the node's `next` list (0 = first).
  - The rule checks R1–R5 give `show_if`, `where` or `jump`. The arrow checks G2, G4, L2, C2, and F2 on a line of a jump list, give `jump` or `next`. Two jumps of one node to the same screen are worded "its jump N (to "x")".
  - Identical messages are merged (`level|code|node|message`), so of two arrow findings with the same words only the first carries `site`.
- `stats` = `{ answers, ratings, free_text, longest_path }`: the most one submission can hold.
- `opts`:
  - `surface`: `"repo"` (the default) or `"panel"`. S1 runs only on the repo surface; C1 and C2 only on the panel surface.
  - `hiddenCodes` (panel): codes switched off but kept. An answer of a hidden item is not "missing", and an arrow to a hidden code is C2.
  - `everLiveCodes` (panel, optional): bare codes for C1. **The control panel does not pass it** (§9.4).
  - `nameOf(node)`: lets the panel say *question 6 "In the last 30 days…"*. The command line says *screen "support_gate"*.

Messages are plain English and say how to fix the problem.

| Code | Check | Level |
|---|---|---|
| G1 | A node no arrow can reach from `start`; a screen no answer combination can ever show (walks over boundary values of every tested answer) | error; "never shown" is a warning |
| G2 | Dead end: a non-ending without `next`; an arrow to a missing id; a jump list without a final `default`; `@next_item` outside a group body; a node from which no ending can be reached | error |
| G3 | An arrow cycle (loops only through `repeat_for`) | error |
| G4 | `flow` missing, empty or of an unknown format; `start` missing or unknown; no ending; an ending with `next` but no `show_if` | error |
| T1 | A string key a node shows (templates expanded over the current items) missing from strings.json, or missing a language. `[TRANSLATE]` values are counted as an info, not errors | error; info for the counts |
| R1 | A condition tests an answer that can't exist yet: a later screen, a screen that never comes before, a key nothing stores; `{var}` outside its loop | error |
| R2 | A `show_if` testing its own node; an empty `all`/`any`; an unknown test or fact; more or fewer than one test; a malformed rule | error |
| R3 | An impossible value for the answer's kind: NPS 11, yes/no "maybe", a chip or option that doesn't exist, `at_most` on a choice, `equals` on free text | error; a number test every answer passes, or none does, is a warning |
| R4 | Jumps on a node with a `show_if` that don't test its own answer: they are ignored whenever it is skipped | warning |
| R5 | A chained rule: one testing an answer whose screen isn't always shown before it. This is where the stale-answer fix changes behaviour | info |
| F1 | Unknown type; a missing ★ field; a field of the wrong kind; `required` not true/false | error |
| F2 | An unknown field | warning |
| L1 | `repeat_for` over an unknown collection; `store_as` missing a loop variable; two steps that can store one key; a key over 80 characters; an id over 60 | error |
| L2 | A group without a body or start; a body arrow that leaves to an earlier top-level node | error |
| D1 | `nps` or `support_gate` absent | warning; error on the panel surface when the code is deleted rather than hidden (decision 8) |
| D2 | `nps` not of type `nps_0_10`, or `support_gate` not `yes_no`: they fill fixed data columns | error |
| D3 | The longest possible path exceeds the server's limits: 100 answer keys, 64 ratings, 64 free-text items (Code.gs `MAX_ANSWER_KEYS`, `MAX_LIST_ITEMS`) | error |
| D4 | The longest path is over 40 screens (the 90-second target) | warning |
| P1 | A kind with `flags.first` (the language buttons) that isn't the start node, or more than one | error |
| P2 | A kind with `flags.early` (the "what changed" card) after a question; more than one of a kind with `flags.once` | warning / error |
| P3 | List input in immediate mode whose problem-screens line has a rule or a position the engine ignores | warning |
| S1 | **Repo surface, graph format only.** survey.json's own settings disagree with the graph, which phones follow: `deep_dive.threshold` vs the areas' default in `collections` (only the collections the area screens repeat over); `deep_dive.require_chip` vs the problem screens' `require_choice`; `deep_dive.require_detail_if_other`; `rating.allow_not_applicable` and `support.allow_not_applicable` vs a screen's own value (a screen without one follows survey.json); `support.allow_comment` vs whether the support screen has a `comment`; `support.comment_text` vs `comment.text`; `deep_dive.when` vs the graph's shape (an `area_loop`-style group or not). Only settings survey.json really has are compared. The message names both values | error |
| C1 | Panel surface, only when `opts.everLiveCodes` is given: a code partners answered under is deleted or re-coded. It compares **bare** codes (a code anywhere in the questionnaire counts as present), so the panel no longer uses it (§9.4) | error |
| C2 | Panel surface: an arrow to a hidden question (it goes to that question's own next screen instead) | warning |

`flow-panel.js` reports problems it finds while building the graph from rows with the same codes (G2, G3, G4, F1, C2: §9.2).

**Other functions on `PP.flowCheck`** (all through the engine, never a second walk):

| Function | Returns |
|---|---|
| `VERSION` | `1` |
| `answersAt(survey, nodeId, opts)` | What a rule at that node may test: `{ ok, node, site, answers: [...], facts: [...], message? }`. Exactly what R1/R2 accept there. `site` is `show_if` (default: answers before the node), `jump` (`opts.forJump: true`: those plus the node's own), `where` (`opts.site: "where"`: its loop filter) or `any` (`nodeId` null: every stored answer). Each answer is `{ key, kind (number / choice / text), label, what, node, item, own, optional }`, plus `min`, `max`, `na` for numbers and `values`, `value_texts` for choices. Facts: `lang` (the languages switched on), `lang_in_url`, `whats_changed_count`, `round` (`opts.rounds`). The panel's rule and jump builders use it. |
| `catalogue()` | Every registered kind without code, in registration order: `[{ type, label, description, fields, answer, records, flags, texts, row?, custom }]`; `custom` lists its own rules (`isComplete`, `collect`). What `web/config/types.json` holds (§10.2). |
| `loadCatalogue(catalogue, warnings?)` | Registers the kinds of a catalogue (`{types: [...]}` or the list) that this program has no code for, so the checks, the map and Try a path know them, with the standard rules. Returns the types added. A kind it already knows keeps its code's description; with a `warnings` list, a sentence is added for each such kind the catalogue describes differently (a stale or hand-edited catalogue). |
| `textKeys(survey)` | Every text key the flow shows, with why (`check_config.py` reads it through `check --json`). |
| `sentence(cond)` | A condition in words, for messages and the map. |
| `toMermaid(survey, strings)` | Mermaid `flowchart TD` text |
| `toMarkdown(survey, strings, opts)` | the whole `docs/flow.md` (§7); `opts.source` names where the questionnaire came from |
| `simulate(survey, answers, facts, opts)` | `{ steps, skipped: [{id, reason}], blocked: [ids], submission, facts, unknown }`; `unknown` lists answer keys no screen stores (a typo such as `nsp`), which are ignored |
| `paths(survey, opts)` | `{ routes: [{ nodes, screens, count, example, repeats }], total, sets, exhaustive }`, the most common route first |
| `compare(surveyA, surveyB, opts)` | `{ same, sets, differences, count }`: the answer sets where the screens or the submission differ |
| `screens(survey, strings?)` | The screen catalogue for the dashboard: `[{screen, node, type, item, label_en, end}]` in display order. `screen` equals what pings and the `events` tab call the screen (e.g. `fn_rating:losses`). |

**For the Phase 4 dashboard:** join a ping's or an `events` row's `config_version` to `node scripts/flow.js screens --published p<N>.json` (the published version it names), and match on `screen`. Pings carry `config_version` since 26 Oct 2026 (docs/submission-format.md §9).

## 7. The command: `scripts/flow.js` (Node 16+, no npm packages) and `scripts/flow.py` (Python standard library)

`python3 scripts/flow.py <command> …` runs `node scripts/flow.js <command> …`, and explains what to do if Node is missing (`PP_NODE` picks a Node binary). The root `package.json` (no dependencies) adds `npm run validate-flow` (`check`), `npm run flow-map` (`map --write`) and `npm run simulate`. The header of `scripts/flow.js` is the full reference.

| Command | Does |
|---|---|
| `check [--root web] [--published p.json] [--json]` | Runs the checker. Exit 0 = no errors, 1 = errors, 2 = it could not run. `--json` is what `scripts/check_config.py` reads. |
| `map [--write] [--out file] [--check file] [--published p.json]` | Prints, or with `--write` writes, `docs/flow.md` from `web/config` (or `--published`). `--check file`: is that file up to date? (exit 1 if not) |
| `simulate --set key=value … [--answers file-or-json] [--lang hi] [--lang-in-url] [--round R] [--whats-changed N] [--published p.json] [--explain] [--submission] [--json]` | Numbered screens, why each skipped screen was skipped, the screens where Next would be blocked, and what would be sent. Typed text is `text:…`; a voice note is `voice`. A `--set` key no screen stores is ignored with a note naming the nearest real key. |
| `paths [--limit N] [--screens] [--json]` | Every distinct route over the boundary values of each tested answer, with one example and a count. |
| `compare A B [--samples N] [--json]` | Do two questionnaires (a survey.json, a `p<N>.json` or a web folder) show the same screens and send the same data for the same answers? |
| `screens [--published p.json]` | The screen catalogue as JSON (for the Phase 4 dashboard). Works on graph and list versions. |
| `migrate [--write] [--root web]` | Converts `web/config/survey.json`'s list into the graph with `PP.flowPanel.surveyTextWithFlow` (§9.3): every other byte stays, the old `_flow_help` note goes (the graph carries `FLOW_HELP`). Before writing it runs `compare` and writes nothing if the screens or the data differ. Writes only with `--write`; refuses `--published`; a file that is already the graph is only re-laid out when needed. Done for the repo on 26 Oct 2026. |
| `build-gs [--check]` | Runs `scripts/build_flow_gs.js`: generates `apps-script/Flow.gs` from flow.js, flow-panel.js and flow-check.js with their SHA-256 fingerprint (§9.5). `--check` changes nothing (exit 1 when out of date). |
| `types [--write] [--check] [--json] [--root web]` | The catalogue of question kinds (§10). Prints it; `--write` saves `web/config/types.json` and the GENERATED block of `apps-script/Model.gs` (`PP_ADDED_TYPES_`, `PP_SCREEN_TYPES`); `--check` says whether both are up to date. Refuses a file in `web/js/types/` that registers or changes an existing kind, and a kind that sends a ratings row without a 1–5 answer. |
| `es5 [--root web] [--json]` | Every script `web/index.html` loads, every `web/js/types/*.js` and every `scripts/dev/*.js` must parse as ES5 (acorn `ecmaVersion: 5`). acorn comes from `tests/node_modules` (`cd tests && npm install` once) or the folder in `ACORN_PATH` (GitHub installs acorn 8.14.0 there). Exit 1 names each file and line; exit 2 when acorn is missing. |

**Stray file names are refused.** Every command except `compare` takes its file with an option (`--published`, `--root`). A bare file name (`check p7.json`) exits 2 with "did you mean --published <file>?", so a check never runs on the wrong questionnaire by mistake.

**Exit codes:** 0 = all good, 1 = problems found, 2 = it could not run (a missing or broken file, a wrong option, a stray file name, or for `es5` no acorn).

**Writes, only when asked:** `map --write` (docs/flow.md or `--out`), `migrate --write` (survey.json), `build-gs` without `--check` (Flow.gs), `types --write` (types.json and Model.gs's GENERATED block). Everything else only reads.

`docs/flow.md` holds:
1. a fixed "Before the questionnaire" diagram (the link and round checks of app.js, which stay in code);
2. the flow's Mermaid diagram, where boxes are screens, diamonds are "only if" rules, labelled arrows are jumps, framed boxes are loops, and round boxes are endings;
3. a table of every node: code, kind, English question, shown when, then where, keys stored;
4. three example routes from `simulate`.

**What `check_config.py` (and so GitHub before every deployment) runs:** `check --json` (errors stop the deployment; T1 is left to its own text checks), `map --check docs/flow.md` (a warning when out of date), `types --check --json` (a missing or stale types.json is an error, a stale Model.gs list a warning) and `es5 --json` (an error; locally, without acorn, a warning that says to run `cd tests && npm install`). It does **not** check Flow.gs: the tests do (§9.5).

## 8. Compatibility

- **`net.js` `usableBootstrap`** accepts a published survey only when `PP.flow.isUsable(survey.flow)` (plus languages and strings). An older form that receives a graph, or any form that receives a graph it can't run, uses its own copy. That is safe.
- **`app.js` `checkRoute()`**, run when the questionnaire is prepared: a route whose first step is an ending while nothing has been answered has nothing to ask (every screen skipped). It throws, so `prepare()` falls back to the form's own copy; in a preview the panel says the draft is broken. A partner with saved progress is not affected by this check.
- **A screen that drops off the route while on show** (a rule on `lang`, after a language switch): `place()` in app.js treats it as sitting just before the first screen not seen yet or not complete. Next goes where a resumed visit would, Back to the screen before that, and the browser history keeps working; the route never restarts (e2e scenario Z7).
- **Publish guard:** Publish refuses a graph unless the form at the form address declares `ENGINE >= 2` (§9.5). The server reads `js/flow.js` as text with a regular expression and never runs it.
- **Saved progress:** partners' saved state (`v: 1`) needs no change, because answer keys and step ids are unchanged.
- **The gates before the questionnaire stay in app.js:** incomplete link, refused token, draft or closed round with the late-finish exception, already sent, unsent resend, and resume. A panel edit must never be able to bypass them.
- **Release order:** forms cached from before an upload don't understand a newer format. Stages 1–4 went up together because no partner links were out yet. **A later format change must ship the engine first and the new format at least a day later.**

## 9. The control panel

Jumps, loops and endings are edited in the panel without JSON. **Design rule:** the Sheet keeps one row per screen, as before, plus 3 columns. Publish builds the graph from the rows with the **same converter** phones use for old lists (`PP.flow.fromLegacy`), then adds the arrows: there is no second compiler.

### 9.1 The Screens tab

Three columns at the end, after `active` (Model.gs schema: `… body, active, next, jumps, repeat`). They are read by header name, so old Sheets still load, and Set up or repair adds the headers. A panel window that sends no `next`/`jumps`/`repeat` field for a screen keeps the saved values (PanelServer.gs `PP_carryFlowColumns_`).

| Column | Values | Panel wording |
|---|---|---|
| `next` | Empty = the following row. Otherwise a screen code: a **later** row, or an ending (a thank-you without a rule) anywhere. | "After this question: Usually go to …" |
| `jumps` | JSON list `[{"when": <condition>, "goto": "<code>"}]`, written by the jump builder and checked in order before `next` | "Add a jump: If … go to …" |
| `repeat` | empty / `each_area` / `each_low_area`, only on kinds whose description says `row.repeatable: true` (the six ordinary questions: 0–10, faces, yes/no, pick one, voice/typing, information card, plus any added kind that says so) | "Ask this question: once / for each area / for each area rated low" |

**Rows after the main thank-you** are reachable **only by jumps**: an ending has no `next`. This is how branches and extra endings are laid out (the panel shows them under "Other routes and endings"):

```
… main path …, one_fix, thanks (the main ending)
short_q (reached by a jump), short_end (an ending)
```

- **Arrows may only point to LATER rows, or to an ending.** An ending goes nowhere, so an arrow to it, even backwards, can never make a circle. Anything else is left out with a G3 warning; the checker still checks hand edits.
- **The main ending** is the first visible thank-you without a rule (else the thank-you the form adds at the end).
- **New endings** get their own text keys `end.<id>.title` and `end.<id>.body`. New keys follow the usual rules: English first, the other languages `[TRANSLATE]`; never machine-translate.

### 9.2 Compile: `PP.flowPanel.fromRows` (called by Model.gs `PP_mdlCompileFlow_`, from `PP_mdlCompileSurvey_`)

`fromRows(screens, survey, opts) → { graph, warnings }`:
1. **Build the list exactly as Model.gs always did** from the visible rows (only the filled-in fields), and let `PP.flow.fromLegacy` make the graph. A Sheet that uses none of the three columns (and no thank-you with its own wording) gives **exactly** `fromLegacy`'s graph, so nothing changes for partners.
2. **Add the arrows:** `next` becomes the node's default arrow; `jumps` becomes `next: [...jumps, {default}]`.
3. **Repeat:** `each_area` becomes `repeat_for {each: "area", in: "areas"}`, and `each_low_area` adds `where` "rated low" (`fn_rating:{area}` at most the area's threshold), with `store_as "<id>:{area}"` and `label "fn.{area}.name"`. On a kind that isn't repeatable it is ignored (F1).
4. **Arrows to hidden rows** go where that row would have gone (its own `next`, else the following visible row), with a C2 warning.
5. **A hidden ending still ends the route** (26 Oct 2026, review finding 1). An arrow to a hidden thank-you, or a row whose following row lies past one, ends at the **main thank-you** instead of running on into the next visible row (which may start another route). Each is a C2 warning naming both.
6. **Other notes:** an arrow to a code no row has (G2) or back to an earlier non-ending row (G3) is left out; an ending's `next` and jumps are ignored (G4); unreadable jumps or an unknown `repeat` value (F1). In "straight after each low rating" mode the problem-screens row is compiled away, so a `next`, jumps or repeat left on it change nothing: that note keeps code F1 but carries `level: "warning"` and says to clear them (the panel's editor has **Clear them**).

Notes are `{ code, node, row, message, level? }` (`row` = the row's place, 0 = first). Model.gs reports G2, G3 and F1 as **errors** (`PP_MDL_FLOW_ERRORS_`), except a note marked `level: "warning"`; C2 and G4 are warnings.

The published `survey.flow` is always a graph. `survey.deep_dive`, `survey.support` and `survey.rating` keep their values; the problem, support and rating settings stay in the Settings tab, and the panel shows them inside those screens' editors (decision 7).

### 9.3 Export, import and restore

- **Export ("Backup copy in GitHub", PanelServer.gs `panelExport` → Model.gs `PP_exportStatic`)** gives **5 files**: the 4 under `web/` (survey.json, strings.json, whats_changed.json, audio_clips.json) plus `flow.md`, which goes to `docs/flow.md` (made by `PP.flowCheck.toMarkdown`, the same text as `node scripts/flow.js map`). survey.json's `flow` is written by **`PP.flowPanel.formatFlow(graph)`**, deterministic text, inside **`PP.flowPanel.surveyTextWithFlow`**, the same functions `scripts/flow.js migrate --write` uses. `PP_exportStatic(PP_importStatic(the repo files))` equals the repo files byte for byte (tests/model).
- **Import and Restore** (`PP_importStatic`, Restore): a graph becomes Screens rows through **`PP.flowPanel.toRows(graph, survey)`** (`{ screens, unsupported }`), the inverse of compile for what the panel can show: ordinary nodes with an optional area repeat, the built-in blocks, `next` and jumps, endings, and the immediate-mode group. A graph outside that (custom groups, other collections, nested loops, settings the rows can't hold) is refused with a plain message listing the screens the panel can't show; nothing changes. A list (an old version) imports as before.
- **Round trips (tests/flow/panel_rows_test.js, tests/model):** rows → graph → rows is identical; the repo graph → rows → graph is byte-identical; Publish → Restore keeps every row.
- **As built, the draft's names differ:** the contract named `PP.flowCheck.formatFlow` and `PP.flowCheck.toPanelRows`; they are `PP.flowPanel.formatFlow` and `PP.flowPanel.toRows`.

### 9.4 Checks

- **`PP_validate`** keeps its other checks (settings, languages, areas, chips, support, texts, news, clips, rounds) and the Screens tab's own row checks (`PP_mdlCheckScreens_`, on every row, hidden ones too: a missing, disallowed or duplicate code, an unknown kind, a built-in kind used twice (thank-you screens excepted); on shown rows: a wrong skip setting, a non-true/false `required`, a rule that can't be read; and a missing or hidden main thank-you). Rows that can't be told apart would cause follow-on errors, so while one exists only D1/D2 of the route are reported.
- **The route is checked by `PP_mdlCheckRoute_`** with the one checker: `PP_mdlRouteFindings_` calls `PP_flowLib_().flowCheck.check(compiled survey, strings, { surface: "panel", hiddenCodes: PP_mdlHiddenCodes_(…), nameOf })`. Each finding is reported at its row (`report.error|warn('screens', 'screen N', …)`). Left out on purpose: T1 (Model.gs's own text checks cover every text) and every `info` finding. D1/D2 are worded by `PP_mdlReportDataColumn_`, naming the data column (a deleted `nps`/`support_gate` is an error, a hidden one a warning). A row below the main thank-you that nothing reaches (G1) keeps the panel's own wording.
- **The wording layer** (`PP_mdlReportRouteFinding_`, review finding 6): `PP_mdlPanelWords_` turns the checker's words into the panel's ("strings.json" → "Texts & translations", "next" → "usually go to", an id → a code), and `PP_mdlThisQuestion_` moves the row's own code out of the sentence into a closing "(Its code is "…".)".
- **Replaced** (deleted from Model.gs on 26 Oct): `PP_mdlCheckScreenOrder_`, `PP_mdlReachedIds_`, `PP_mdlCheckRules_` through `PP_mdlCheckNumberTest_`, `PP_mdlCheckOptions_`, `PP_mdlCheckDataColumns_`, and the text and options parts of `PP_mdlCheckScreenFields_`. A parity test (tests/model group 13) ran the frozen old Model.gs (`tests/model/legacy/`) against the new one on 221 drafts: all 126 old route problems are still reported at the same question.
- **`PP_mdlCheckRunIntoRoutes_`** (new error): a shown row below the main thank-you with no "usually go to", whose following row starts **another** route (another question jumps there), would let partners run on into that route. Publish waits until its "usually go to" is set or an ending is put between them.
- **The codes lock covers every code ever published** (this closes the hide-and-publish hole). On every Publish once codes are locked, Code.gs `PP_recordCodesEverLive_` adds the codes of the version that was live and of the new one to the Script Property **`CODES_EVER_LIVE`**, as **qualified** entries (`PP_mdlCodesOfDoc_`): `screen:<id>`, `area:<id>`, `chip:<area>/<code>`, `support:<code>`, `option:<question>/<code>`. **`PP_mdlCheckLiveCodes_`** decides the lock itself, kind by kind, on those entries (review finding 2): a problem is looked for in its own area and an answer in its own question, and a hidden one there counts as kept. A code in `CODES_EVER_LIVE` that is gone is an **error**; a code only live today is a warning, as in Phase 2. An answer option can't be hidden, so its message says to put it back (the panel's Remove is locked for live options). The checker's C1 is not used. Near 8,000 characters the list gives a warning; past 9,000 (the property limit) new codes aren't recorded and Publish says so.
- **Publish while Drive can't read the live version:** once codes are locked, Code.gs `PP_requireLiveWhileLocked_` stops Publish with "try again in a minute" instead of publishing without checking and recording that version's codes.

### 9.5 `Flow.gs` (generated: `node scripts/build_flow_gs.js`, or `python3 scripts/flow.py build-gs`)

The fifth Apps Script code file. It carries web/js/flow.js, flow-panel.js and flow-check.js, in that order:

```
var PP_FLOW_FINGERPRINT_ = '<SHA-256 of the three files' bytes, one after the other>';
var PP_FLOW_SOURCE_ = "<the three files' text, as one JSON string, for the panel window>";
function PP_flowLib_() { /* the three files copied in as ordinary code, each with a private root
                            (their IIFE footers become }(root));), run once per execution; returns root.PP */ }
```

- **Server use:** Model.gs `PP_mdlFlowLib_()` returns `PP_flowLib_()` and, once per run, teaches it the added kinds (`loadCatalogue(PP_ADDED_TYPES_)`, §10.4). Without Flow.gs every route action (compile, Check, Publish, Import, Restore, Preview) stops with "The script file "Flow" is missing…" and how to add it.
- **Freshness:** `node scripts/build_flow_gs.js --check` (exit 1 when out of date). tests/model, the panel bench and the Google imitation fail while Flow.gs is older than the three files. check_config.py doesn't check it.
- **Health:** `?action=health` adds `flow_engine` (Flow.gs's `ENGINE`) and `flow_fingerprint`.
- **Home banner:** `panelFlowStatus(formUrl)` (PanelServer.gs) reads `<form address>js/flow.js`, `js/flow-panel.js` and `js/flow-check.js` as text, hashes their UTF-8 bytes with its own SHA-256 (`PP_utf8Bytes_`, `PP_sha256Hex_`; `Utilities.computeDigest` isn't on the allowed-method list) and compares with `PP_FLOW_FINGERPRINT_`. It remembers the answer for 10 minutes. The panel shows a red banner when they differ, and nothing when the form can't be reached. The form address comes from the window (Settings > form_url as shown), not a Sheet read.
- **Publish guard (Code.gs `PP_formEngineGuard_`):** before writing a graph, Publish reads `<form_url>js/flow.js` as text and finds `ENGINE = <n>`. Below 2 (or below the panel's own ENGINE), Publish is refused: "The form on GitHub is older than this control panel: upload the new form code first, wait for the green tick, then publish." A new-enough form is remembered for 10 minutes. If GitHub can't be reached (or answers non-200, or the address is invalid), Publish goes on with a warning.
- **Publish warnings are shown:** `PP_publish` returns `warnings` (the guard's, the `CODES_EVER_LIVE` size warnings), and the panel shows them in the "Version N is live" dialog under "Please check…"; set-up's first publish puts them in its closing notes (review finding 3).

### 9.6 The panel window (Panel.html)

**How the route code reaches the window (as built: not a template).** The draft said `panelOpen` would inject `PP_FLOW_SOURCE_` with a template. Instead the window asks the guarded call **`panelFlowCode()`** once (`{ source, fingerprint }`) and runs the source with **`new Function('root', …)`** and a private root, exactly as `PP_flowLib_` does (`runFlowCode`). Reasons: Panel.html contains no `<?` (the harness forbids template tags, and the bench serves the file as it is), and the page (about 400 KB) doesn't carry the route code's 240 KB on every open. **[UNCONFIRMED]** on real Google that `new Function` runs in the HtmlService frame; if it can't, the rest of the panel works and Questions shows a short note.

There is no second copy of any rule: the window builds the draft's route with `flowPanel.fromRows`, checks it with `PP.flowCheck`, and asks `PP.flowCheck.answersAt` which answers a rule or jump may test (`routeAnswers`). Badges and jump problems match findings by `site`, `target` and `index`; they read the message only with a Flow.gs older than 26 Oct. If `answersAt` is missing or throws, the builders offer the earlier rows. Added kinds come with the Sheet's list of kinds (each added row's `catalogue`) and are taught to the window's route code (`teachKinds`, `kindAnswer`).

| Where | What the panel does |
|---|---|
| Questions list | Badges: "↪ goes to …", "Repeats for each area" (or "… rated low"), "Ends the survey", "⚠ this jump can never happen" (jumps fromRows leaves out, and R1/R2/R3 on the jump's condition), "⚠ nothing leads here: add a jump to it". Rows after the main thank-you show under "Other routes and endings", with **Add an ending**. Hiding, deleting or moving a row that arrows point at warns first; hiding an ending says partners then end at the main thank-you. |
| Editor: "After this question" | "Usually go to [▼]": the following row by default; later rows and endings allowed. "+ Add a jump" opens "If [answer ▼] [is ▼] [value ▼] → go to [later question or ending ▼]". The answers on offer come from `answersAt` (earlier answers, this screen's own, the language and the round). |
| Editor: "Show this question only if" | The rule builder, offering earlier answers plus the language and the round (`SHOW_IF_FACTS = true`). |
| Editor: "Repeat" | "Ask this question: once / for each area / for each area rated low", on repeatable kinds only (`canRepeat`: the kind's `repeatable`). |
| Problem / support / area-rating editors | Show the Settings values: where problem screens go (after all ratings / straight after each low rating), a problem must be picked, Other needs detail, support "doesn't apply", the comment box and its question, "I don't handle this". In "straight after" mode the problem-screens row's route controls are hidden, and leftovers are named with **Clear them**. |
| Add a question | Its "Put it after" also offers places below the main thank-you, for a question on another route. The kinds come from `PP_SCREEN_TYPES` (the catalogue), not a hand-kept list. |
| Map (Questions > Map) | `PP.flowCheck.toMermaid` of the draft (or of the live version, from `panelLiveSurvey()`). A text outline shows at once, with an "Open in mermaid.live" link. The drawing is made by **Mermaid 11.4.1** from cdn.jsdelivr.net (`MERMAID_URL`), pinned with Subresource Integrity (`MERMAID_SRI`, sha384), inside a **sandboxed `srcdoc` frame** (`sandbox="allow-scripts"`, no `allow-same-origin`), which can't reach the page or `google.script.run` and only posts back "drawn" or "failed" (with a token the page checks). The drawing replaces the outline when it says "drawn"; after 6 s a note says it is still loading (`MAP_SLOW_MS`); after **20 s** (`MAP_WAIT_MS`) or "failed", the outline stays. This is the page's one external library: the harness static check `mapException` enforces it. **[UNCONFIRMED]** on real Google that the library loads inside the nested frame. |
| Try a path | Drop-downs for every answer a rule, jump or repeat filter tests, plus language, link-has-language and what-changed. It shows the screens, why skipped ones were skipped, and what would be sent (`PP.flowCheck.simulate`). |
| Home | The red banner when the form on GitHub runs different route code (§9.5). |

### 9.7 Tests

- **tests/flow/panel_rows_test.js:** `fromRows` / `toRows` rules and round trips (14 tests).
- **tests/model:** compile, import, export and restore round trips with jumps, repeats, several endings and the immediate group; the parity group 13; group 14 (hidden endings, the qualified codes lock, live options, wording, immediate-mode leftovers, the GitHub copy's `flow.md`); group 15 (an added kind known to Publish).
- **tests/gas-harness:** `Flow.gs` loads in the strict fake and is fresh; scenario G11 (publish a graph, the publish guard, the fingerprint, the health fields); G12 (hidden endings, the qualified lock, Drive hiccup refusal, Publish warnings in set-up); the Map exception (`mapException`); planted mistakes for each.
- **tests/panel:** the jump builder, the repeat selector, endings, the Map (outline first, the 6 s note, the swap, the 20 s fallback), Try a path, badges, Publish warnings, "Show this question only if" on language and round.
- **tests/e2e:** the repo graph and a panel-compiled graph served by the mock server; I2, Z7, Z8, Z9 (§8).

Commands and expected results: [tests/README.md](../tests/README.md).

## 10. Question kinds as plug-ins

A new kind of question is **one file** plus one line; no other code changes. The step-by-step guide, with a tested example (`tests/flow/fixtures/types/stars_1_10.js`), is config-guide.md "How to add a question type".

### 10.1 The file: `web/js/types/<code>.js`

- One ES5 IIFE (the same footer as flow.js) that calls `PP.types.register({...})` with the kind's whole description (§4.7), `render` included.
- One `<script defer src="js/types/<code>.js"></script>` line in `web/index.html`, after `js/types.js` and before `js/app.js` (the place is marked there).
- **It may only add a new kind.** A file that registers a type that already exists (built in, or from another file), or changes an existing description, is refused by the `types` command (and so by check_config.py and GitHub), because phones would then behave differently from what every check says.
- **A ratings row needs a 1–5 answer.** `records.ratings: 1` is refused unless the answer is a number from 1 to 5 (the data contract's ratings are 1–5). Other scales send `records.answers` only, like the 0–10 question.
- **ES5 gate:** `node scripts/flow.js es5` (run by check_config.py and GitHub) refuses newer syntax. A file Chrome 61 can't parse would silently never register, and its screens would be drawn as information cards with their answers not sent. The gate checks syntax only, not newer built-in functions.

### 10.2 The catalogue: `web/config/types.json` (format `pp-types/1`)

```json
{ "_help": "GENERATED by node scripts/flow.js types --write …",
  "format": "pp-types/1",
  "types": [ { "type", "label", "description", "fields", "answer", "records", "flags", "texts", "row", "custom" }, … ] }
```

- Generated by `node scripts/flow.js types --write` from the kinds the form registers (`PP.flowCheck.catalogue()`), loading flow.js, ui.js, types.js and every `web/js/types/*.js` that index.html loads. Never edit it by hand.
- `records` counts are numbers (0 = none) or `"rows"` / `"comment"` (the support block). `row` is the panel's entry (§4.7) with every field filled in. `custom` names the kind's own rules.
- **Who reads it:** the command line, for kinds whose code it doesn't run (`loadCatalogue`); check_config.py (`types --check`: missing or stale is an error). Phones never load it.

### 10.3 What the tools know about an added kind

- **Phones:** everything, from the file.
- **The checker, the command line, the panel's checks, the Map and Try a path:** the description from the catalogue, with the **standard rules** (§4.7). A kind with its own `isComplete` / `collect` behaves exactly like that only on phones; `simulate` and Try a path show the standard data for it.
- **Repeat per area:** when its `row.repeatable` is true (flow-panel.js and Panel.html both read the flag).

### 10.4 The control panel: `PP_ADDED_TYPES_` in Model.gs

- `types --write` also rewrites the GENERATED block of `apps-script/Model.gs` (between the `BEGIN GENERATED` / `END GENERATED` marks): **`PP_SCREEN_TYPES`** (the panel's list of kinds, from the catalogue's `row`s) and **`PP_ADDED_TYPES_`** (the whole catalogue entry of each added kind; `[]` today). Each added row in `PP_SCREEN_TYPES` carries its entry as `catalogue`.
- Model.gs `PP_mdlFlowLib_` calls `loadCatalogue(PP_ADDED_TYPES_)` once per run, so Publish's checks, compile and Restore know the kind; the panel window teaches it from the rows (`teachKinds`).
- **After adding a kind:** run `types --write`, paste Model.gs into the Apps Script project, and deploy. Flow.gs doesn't change (it holds only the built-in kinds).
- `types --check` warns when Model.gs's list is stale; the Google imitation's scenario S reports Model.gs's top-level `var` lists (`PP_SCREEN_TYPES`, `PP_ADDED_TYPES_`) as its known warning.
