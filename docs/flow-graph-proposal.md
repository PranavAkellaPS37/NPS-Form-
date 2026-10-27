# Flow-graph refactor: proposal (not built)

**Status:** proposed on 22 Oct 2026, **awaiting Pranav's approval**. Nothing in this document is built. No code, config or data has changed.

**What this is.** Pranav asked (22 Oct) whether the form's decision tree can be edited from config alone:
- which screen follows which;
- the branch conditions;
- adding or removing screens;
- loops;
- question types.

If not, he asked for a design where the whole flow is one graph in config. This document has the audit's answers and the proposal.

**How it was made:**
- **The audit:** 3 auditors, each checked by an adversarial verifier running experiments, including the real form in headless Chrome (workflow `wf_43b4b1dd-f39`).
- **The design:** two independent designers, each with a working prototype (workflow `wf_7c106537-fc5`). Claude merged them; the planned merging agent got stuck and was stopped.
- **The prototypes are throwaway files** in the session scratchpad, outside the repo. They were re-run by Claude before this was written.

---

## 1. Audit: what is config today, and what is JS

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Where is the screen **order** defined? | **Mostly config** | The `flow` list in `web/config/survey.json` (lines 120–130). Live, it is the control panel's Screens tab, sorted by its `order` column and compiled by `apps-script/Model.gs` `PP_mdlCompileFlow_` (~1934). **JS:** `web/js/flow.js` `buildSteps` walks the list top to bottom, with no next/goto (105–120). It also expands "Area ratings" into one screen per area and "Problem screens" into one per low area (110–116), and forces a thank-you at the end (122–125). All routing *before* the questionnaire is in `web/js/app.js`: bad or incomplete link, draft or closed round, already sent, resume (~345–472). |
| 2 | Where are the **branch conditions**? | **Mixed** | **Config:** `show_if` on any screen, e.g. support only if `support_gate` = yes (survey.json 127), evaluated by `flow.js` `evalCondition` (68–85) with six tests plus all/any. **JS:** "problem chips only if rating ≤ threshold" (`flow.js` 56–58, 99–101; only the threshold *number* is config), "na is never low", and the two meanings of `skip_if` (106–107). The server checks no branch at all. |
| 3a | Reorder screens by config only? | **Partly** | Whole screens: yes (panel arrows or the JSON list). Fixed: nothing can sit between two area screens; thank-you must be last; problem screens after the ratings (`check_config.py` 1108–1130, `Model.gs` 2480–2509). |
| 3b | Add a new screen with its own question type? | **Partly** | A new screen of the 6 basic kinds (0–10, faces, yes/no, pick one, voice/typing, info card): yes, and its answer is sent. A new **kind** of question: **no**. It needs JS in 7+ places; today an unknown type shows as a plain card and its answer is lost. |
| 3c | Make a screen conditional on any earlier answer? | **Partly** | Any earlier answer can show or hide a whole screen. **Not possible:** a rule per area screen; rules on the language, DC or round; a **jump**, so skipping N screens takes N copies of a rule; and the panel builds only one level of all/any. **Bug:** rules read stale answers (§2). |
| 3d | Remove a screen? | **Mostly yes** | Delete it (JSON) or hide it (panel). Exceptions: the thank-you can't go; in "immediate" mode the problem screens can't be removed (silently); removing `nps` or `support_gate` empties their data columns. |
| 3e | A loop, e.g. "repeat this screen for each low-rated area"? | **No** | Only the two built-in per-area blocks, hardcoded in `flow.js` (110–116). A `repeat_for` field is ignored (the panel drops it). The only workaround is one hand-made screen per area, which ignores per-area thresholds. |
| 4 | Question types; new types without touching the renderer core? | **12 types, no** | **Basic:** `nps_0_10`, `rating_1_5`, `yes_no`, `single_choice`, `free_text`, `info_card`. **Built-in:** `language_picker`, `whats_changed`, `function_ratings`, `function_deep_dives`, `support_block`, `thank_you`. **Internal:** `function_rating`, `function_deep_dive`. Drawing is dispatched by name (`app.js` 644–647), but a new type also needs `flow.js` `canProceed` and `buildSubmission`, `Model.gs` `PP_SCREEN_TYPES`, `check_config.py` `FLOW_TYPES`, three "what can a rule test" functions, and a script tag in `index.html`. |

## 2. Problems the audit found (none fixed yet)

1. **Stale answers in rules.** Rules read every answer ever saved, not only answers on the partner's current path (`app.js` ~591–596).
   - A chained follow-up ("ask C if B = yes", where B depends on A) is still asked, and sent, after the partner goes Back and changes A. Reproduced in real Chrome.
   - **Today's questionnaire has no chained rule, so it is not affected.** Any future chain would be.
2. **"Immediate" mode trap.** With `deep_dive.when = immediate`, the Problem-screens line is ignored completely (position, rule, hidden) and nothing warns. The default mode is not affected.
3. **`nps` can be re-typed** (e.g. to faces 1–5) with 0 errors. 1–5 values then land in the `nps` column. Also the known hole: a hidden-then-published `nps` can be deleted after the codes lock.
4. **Order checks are thin.** The language buttons can be moved after the NPS question, and the "What changed" card to the end, with no warning.
5. **The server stores impossible values,** e.g. NPS 42 (it checks the message shape, not the values).

---

## 3. The proposal in brief

- **Where the graph lives:** **one graph per questionnaire**, inside the questionnaire document.
  - In the repo, it is `web/config/survey.json` → `flow`.
  - Live, it is `survey.flow` in each published `p<N>.json`.
  - JSON, not YAML.
  - Pranav keeps editing in the control panel (no JSON); the repo copy is the exported backup, as today.
- **Graph shape:** nodes with explicit `next` arrows, conditional jumps, an optional `show_if`, and loops declared with `repeat_for`. There is one `start` and one or more endings.
- **One engine everywhere.** `web/js/flow.js` (ES5) runs on phones, in the control panel (through a generated copy, `Flow.gs`) and in the command-line tools (validator, map, simulator, comparison), so they can never disagree.
- **Rules see only answers on the current path.** This fixes problem 1; today's questionnaire behaves the same.
- **Day one is identical.** Today's S0–S7 converts to a graph with the same screens and the same data, proven by two prototypes (§11).
- **The checks before the questionnaire stay in code:** link, token, closed round, already sent, resume. They are security rules, so a panel edit must never be able to bypass them. The map shows them read-only.

## 4. The schema

### 4.1 Top level

`survey.flow` (repo: `web/config/survey.json`):

```json
{ "format": "pp-flow/1", "start": "<node id>",
  "collections": { "<name>": { "list": "<dotted path in survey.json>", "defaults": { … } } },
  "nodes": [ … ] }
```

- **`format`** changes only together with every reader. Old forms reject the graph and fall back to their own copy, which is safe (§9).
- **`start`** is the first screen. If there is a language screen, it must be the start (checked).
- **`collections`** are the lists the flow can repeat over:
  - `areas` = `functions`, with default threshold 3;
  - `support_items` = `support.items`.
- **`nodes`** are in display order (panel and map). The arrows decide the route.

### 4.2 Node fields

| Field | Meaning |
|---|---|
| `id` | Permanent code: a–z, 0–9, `_`; unique; locked once partners answered. |
| `type` | A registered question type (§10), or `group`. |
| `store_as` | The answer key (the request's "stores-answer-as"). Defaults to `id`. In a loop it must contain the loop variable, e.g. `fn_rating:{area}`. It is also the screen name in events and pings. |
| `text`, `help`, `label`, `low_label`, `high_label`, `scale_hint`, `body`, … | String keys into the one string table (templates like `fn.{area}.name` allowed). |
| `options` | A list of codes (labels `choice.<id>.<code>`, as today), a list of `{code, text}`, or taken from the loop item: `{"from": "area.issues", "text": "issue.{area}.{code}", "other": "issue.other"}`. |
| `required` | `false` = skippable (a Skip button). Kept under today's name. |
| `show_if` | A condition. When false, the screen is skipped and its default arrow followed. |
| `repeat_for` | `{"each": "area", "in": "areas", "where": <condition>}`: one screen (or one pass through a group) per item, filtered by `where`. |
| `next` | A node id, or an ordered list `[{"when": <condition>, "goto": <id>}, …, {"default": <id>}]`. The first true `when` wins. Every node except an ending has one. |
| type fields | E.g. `allow_not_applicable`, `require_choice`, `require_detail_if_other`, `rows` and `comment` (support), `issue_code_from`, `block`. These are settings that today sit in `deep_dive`, `support` and `rating`, or are hardcoded. |

### 4.3 Conditions

```
Condition := { Subject, Test } | {"all":[…]} | {"any":[…]} | {"not": Condition}
Subject   := "answer": "<key>"      e.g. "nps", "fn_rating:payments", "support:kept_updated", "fn_rating:{area}" in a loop
           | "fact": "lang" | "lang_in_url" | "whats_changed_count" | "round"
           | "var": "area.threshold"                    (a field of the current loop item)
Test      := equals (==) | not_equals (!=) | at_most (<=) | at_least (>=) | in (list) | answered (true = exists)
```

- The stored words are today's, so every existing rule keeps working. The panel, map and simulator show the symbols.
- **What a test sees:**
  - A missing answer makes `not_equals` true, as today.
  - `na` is never a number, so it is never "low".
  - `show_if` sees answers *before* the screen.
  - `next[].when` also sees the screen's own answer.
- **Path-scoped:** a rule sees an answer only if its screen is on the partner's current path.
- **Later (open decision 12):** counts like "2 or more areas rated low", and facts from the DC list (region, state), which need signed link fields.

### 4.4 Loops, groups and endings

- **Repeated node.**
  - `repeat_for` runs over a collection in its order, which is the Areas tab order.
  - `where` filters per item, e.g. `fn_rating:{area}` at most `{"var": "area.threshold"}`. The area's own threshold applies, else the default.
  - Instance ids are `store_as` filled in (`fn_rating:payments`), exactly today's ids.
- **Group.**
  - A `group` repeats a small sequence per item: `body: {start, nodes}`, where the last arrow is `@next_item`.
  - That is how "problem screen straight after each low rating" (immediate mode) is written.
  - Group ids never reach the data.
- **No back-arrows.** Loops exist only as `repeat_for` and groups, so every path ends. An arrow cycle is an error.
- **Endings.**
  - Every `thank_you` node is an ending, and there may be several (e.g. a short ending reached by a jump).
  - Each ending sends the answers.
  - An ending may have its own title and body.

## 5. Today's S0–S7 as a graph

This is the default `deep_dive.when = after_all_ratings`. It is the prototype's tested file, with only the version stamp and the note text changed.

```json
{
  "_help": "The route through the questionnaire. Live, edited in the control panel (Questions). Codes (id, store_as) are permanent once partners have answered. After any edit: python3 scripts/flow.py check",
  "format": "pp-flow/1",
  "start": "language",
  "collections": {
    "areas":         { "list": "functions",     "defaults": { "threshold": 3 } },
    "support_items": { "list": "support.items" }
  },
  "nodes": [
    { "id": "language", "type": "language_picker",
      "show_if": { "fact": "lang_in_url", "equals": false },
      "next": "whats_changed" },

    { "id": "whats_changed", "type": "whats_changed",
      "show_if": { "fact": "whats_changed_count", "at_least": 1 },
      "next": "nps" },

    { "id": "nps", "type": "nps_0_10",
      "text": "q.nps", "low_label": "nps.low", "high_label": "nps.high", "scale_hint": "nps.scale_hint",
      "required": true,
      "next": "fn_ratings" },

    { "id": "fn_ratings", "type": "function_rating",
      "repeat_for": { "each": "area", "in": "areas" },
      "store_as": "fn_rating:{area}",
      "text": "q.fn_rating", "label": "fn.{area}.name", "help": "fn.{area}.help",
      "allow_not_applicable": true,
      "issue_code_from": "fn_deep_dive:{area}",
      "next": "fn_deep_dives" },

    { "id": "fn_deep_dives", "type": "function_deep_dive",
      "repeat_for": { "each": "area", "in": "areas",
                      "where": { "answer": "fn_rating:{area}", "at_most": { "var": "area.threshold" } } },
      "store_as": "fn_deep_dive:{area}",
      "text": "q.deep_dive", "label": "fn.{area}.name", "rating_from": "fn_rating:{area}",
      "options": { "from": "area.issues", "text": "issue.{area}.{code}", "other": "issue.other" },
      "detail_text": "q.tell_more", "detail_text_required": "q.tell_more_required",
      "require_choice": true, "require_detail_if_other": true,
      "next": "support_gate" },

    { "id": "support_gate", "type": "yes_no",
      "text": "q.support_gate", "required": true,
      "next": "support" },

    { "id": "support", "type": "support_block",
      "show_if": { "answer": "support_gate", "equals": "yes" },
      "text": "q.support_block",
      "rows": { "each": "item", "in": "support_items", "store_as": "support:{item}", "text": "support.{item}" },
      "allow_not_applicable": false,
      "comment": { "store_as": "support_comment", "text": "q.support_comment" },
      "next": "one_fix" },

    { "id": "one_fix", "type": "free_text",
      "text": "q.one_fix", "required": false, "block": "one_fix",
      "next": "thanks" },

    { "id": "thanks", "type": "thank_you" }
  ]
}
```

**Immediate mode** (`deep_dive.when = immediate`) replaces the two loops with one group. This was also tested identical:

```json
{ "id": "area_loop", "type": "group",
  "repeat_for": { "each": "area", "in": "areas" },
  "body": { "start": "fn_ratings", "nodes": [
    { "id": "fn_ratings", "type": "function_rating", "store_as": "fn_rating:{area}", "…": "same fields as above",
      "next": "fn_deep_dives" },
    { "id": "fn_deep_dives", "type": "function_deep_dive", "store_as": "fn_deep_dive:{area}", "…": "same fields as above",
      "show_if": { "answer": "fn_rating:{area}", "at_most": { "var": "area.threshold" } },
      "next": "@next_item" } ] },
  "next": "support_gate" }
```

**Examples of what becomes possible with config only:**
- **A jump.** Promoters skip the area questions:
  `"next": [ {"when": {"answer": "nps", "at_least": 9}, "goto": "support_gate"}, {"default": "fn_ratings"} ]`
- **A new loop.** For example, "ask a callback question for each low-rated area": one more node with `repeat_for` over `areas` and the same `where`.
- **A rule on the language:** `{"fact": "lang", "in": ["ta", "te"]}`.

**Where today's hardcoded JS goes:**

| Today | In the graph |
|---|---|
| `skip_if: lang_in_url` / `empty` | `show_if` on a fact |
| One screen per area, ids `fn_rating:<area>` | `repeat_for` + `store_as` |
| `isLow` / `thresholdFor` (`flow.js` 49–58) | `where` with `area.threshold`, default 3 |
| `deep_dive.when` | The graph's structure |
| `require_chip`, `require_detail_if_other` | Fields of the problem node |
| The chip copied into the area's rating row | `issue_code_from` |
| `one_fix` block chosen by its id | `block: "one_fix"` |
| `support:<item>`, `support_comment` | `rows.store_as`, `comment.store_as` |
| Text keys hardcoded in `screens.js` | Explicit string-key fields |
| Thank-you forced last | Explicit endings |

## 6. Engine rules

- **The walk.** The path is a pure function of (graph, saved answers, link facts). It is rebuilt after every answer, as today.
  - A skipped screen follows its default arrow.
  - Unanswered screens ahead are predicted with "no answer"; the progress bar and the "Submit" label use that prediction, as today.
  - A guard stops any walk at 2,000 steps.
- **Answers off the path.**
  - They stay on the phone, so they come back if the partner returns to that branch.
  - They are never tested and never sent. Sending was already limited to answers on the path.
  - The validator lists every chained rule as "info", so you can see which rules the fix touches.
- **Back:** unchanged. It goes to the previous step on the current path, and after a jump that is the screen the partner came from.
- **Resume after a newer version is published:** unchanged. The partner continues at the saved screen if it is still on the path, else at the first unseen or incomplete one. Saved progress keeps working because the answer keys never change.
- **Version guard.**
  - The form declares its engine version.
  - Publish refuses a graph if the form at the form address is older, read as text, never run.
  - An old phone that gets a graph falls back to its own copy instead of walking it wrongly.

## 7. Validator, map and simulator

**The validator** is one JavaScript module (`web/js/flow-check.js`; phones never load it). It blocks the GitHub deploy, blocks Publish in the panel, and runs from one command. It checks:

1. **Unreachable screens**, including screens no answer combination can ever show (contradictory rules).
2. **Dead ends**, arrows to missing screens, and screens from which no ending can be reached.
3. **Missing text keys** in any of the 6 languages (`[TRANSLATE]` stays a warning count, as today).
4. **Conditions on answers that can't exist yet** (a later screen, a screen that never comes before, `{area}` outside a loop), and impossible values (NPS 11, an option that doesn't exist).
5. **Cycles** (only `repeat_for` and groups may repeat).
6. Unknown types and missing fields.
7. Duplicate or over-long codes.
8. **Language buttons first**; "What changed" before the questions.
9. **`nps` must stay `nps_0_10` and `support_gate` `yes_no`.** These fill fixed columns; this fixes problem 3.
10. **The codes lock** covers every code ever published since the first real round. This closes the hide-and-publish hole.
11. The longest path stays within the server's limits (100 answers, 64 ratings, 64 typed/voice items). A warning above 40 screens, for the 90-second target.

**Where the checks run:**

| Where | How |
|---|---|
| GitHub deploy | `check_config.py` calls the checker through Node. GitHub's runner gets Node, pinned like the other actions. |
| Publish in the panel | `Model.gs` calls the same code in `Flow.gs`, so there is no second copy to drift. |
| On the Mac | `python3 scripts/flow.py check`, or `npm run validate-flow`. |

**The map:**
- `python3 scripts/flow.py map` writes **`docs/flow.md`**: a Mermaid diagram that GitHub draws, plus a table of every screen (code, kind, English question, shown when, then where) and three example paths.
- Shapes:
  - boxes are screens;
  - diamonds are "only if" rules;
  - labelled arrows are jumps;
  - framed boxes are loops ("for each area rated low");
  - round boxes are endings;
  - the checks before the questionnaire appear as a fixed, read-only part.
- The panel's **Download files for the GitHub copy** also writes `docs/flow.md`, so the repo picture matches what is live.
- The panel gets a **Map** view of the draft, using a pinned diagram library. **[UNCONFIRMED]** on real Google; the fallback is a text outline.

**The simulator** uses the phone's own engine:
- `python3 scripts/flow.py simulate --set nps=4 --set fn_rating:payments=2 --set support_gate=no [--lang-in-url] [--published p7.json]` prints the numbered screens, why each skipped screen was skipped, and exactly what would be sent.
- `python3 scripts/flow.py paths` lists every distinct route with an example.
- `python3 scripts/flow.py compare A B` checks that two versions show the same screens for the same answers.
- In the panel, **Try a path** offers drop-downs for only the answers that rules test.
- `?simulate=1` is a developer drawer served only by the local test server (outside `web/`), so partners get zero extra bytes.

## 8. Editing in the control panel (no JSON)

**The Screens tab** gains columns, read by name so old Sheets still load:
- `next`;
- `jumps`;
- `repeat_for`;
- `store_as`;
- `group`;
- `fields` (the type settings that differ from the defaults).

The editor writes them; Pranav uses buttons:

| Task | How |
|---|---|
| Add a jump | In the question's editor: "After this question, usually go to [next]" → **+ Add a jump**: "If [answer] [is at least] [9] → go to [a later question or an ending]". Only later screens are offered, so no circles can be built. A sentence previews the result. |
| Add a loop | "Ask this question: once / for each area / for each area rated low". |
| Choose where problem screens go | "After all area ratings / straight after each low rating" (this regroups the rows for him). |
| Add a condition | "Show this question only if…", as today. It gains the partner's language, the round and "any area rated low". |
| Add an ending | "Add an ending screen", reachable by a jump. |
| See it | **Map**, **Try a path**, and badges like "↪ goes to Q9 when NPS ≥ 9", "repeats for each low-rated area" and "⚠ this jump can never happen". |

**Moving per-screen settings.** "Problem chips required", "Other needs detail", the support comment and "I don't handle this" move from Settings into those screens' editors. Pranav's existing values move over automatically on the first open.

## 9. Moving over safely

- **One converter.** `PP.flow.fromLegacy` turns today's list into the graph, keeping every quirk of today's engine. It is used:
  - by phones that receive an old published version (p1…pN are never rewritten);
  - by the panel on an old Sheet;
  - by Restore and Import;
  - by the command-line tools.
- **Old phones** with cached old code get a graph they don't understand. They fall back to their own copy, which works the same.
- **A permanent comparison test** (`tests/flow/legacy_diff.js`), the prototype made permanent:
  - a frozen copy of today's engine;
  - every answer combination for the default questionnaire in both modes;
  - random answer sets over many questionnaire variants (including the audit's 46);
  - Back-button scripts;
  - the existing 24 end-to-end scenarios unchanged, plus new ones for jumps, loops, two endings, the stale-answer fix and `?simulate=1`.
- **First Publish of a graph** runs `compare` against the live version and shows "same screens for N tested answer sets" before it publishes.

## 10. Question types as plug-ins

Each type is described once:
- its label and editor fields (the panel's editor is generated from them);
- what a rule may test;
- how many answers, ratings and typed items it adds (for the server limits);
- `render`, `isComplete`, `collect`.

```js
PP.types.register({ type: 'rating_1_5', label: 'Faces question (1 to 5)',
  fields: { text: { kind: 'text_key', required: true }, required: { kind: 'bool', default: true } },
  answer: { kind: 'number', min: 1, max: 5 }, records: { answers: 1, ratings: 1 }, flags: { auto: true },
  render: function (ctx) { /* PP.ui helpers */ },
  collect: function (step, state, out) { /* answers + one ratings row */ } });
```

- **The 12 types of today** stay in one file (`web/js/types.js`, with the drawing helpers in `web/js/ui.js`). This avoids 12 extra downloads on weak networks.
- **A new type** is **one file `web/js/types/<name>.js` + one `<script>` line** in `index.html`.
- The type catalogue the panel and the checks use (`web/config/types.json`) is generated from those files, and the check refuses a stale copy.
- The panel reads the catalogue from the form's address, so **adding a type needs no Apps Script paste**.
- **Still not pure config:**
  - how a new type looks and behaves;
  - new data columns;
  - new condition tests such as "contains" (for a multi-select);
  - DC facts;
  - repeating over something that isn't a list in `survey.json`.

## 11. Data and dashboard

- **Day one:** submissions, pings and events are **byte-identical** (`schema_version` 1). Backend, Sheet tabs and data contract are untouched.
- **Answers of new screens** go into `answers_json`, as today. The Phase 3 pipeline flattens them into a long table on the Mac; there is no new Sheet tab.
- **Drop-off by node.**
  - `python3 scripts/flow.py screens --published p7.json` returns the screen list of any version: node, instance, English label, ending.
  - The Phase 4 dashboard calls it for each response's `config_version`; no screen list is hardcoded.
  - Rows are nodes, expanded per area. Paths have different lengths, so it shows "reached" and "stopped here" per node.
- **`config_version` on pings.** The phone sends it, but the pings tab doesn't store it, so a non-finisher's version is unknown. Add it as the **last** pings column from a new round (open decision 11).

## 12. Proof so far (prototypes, outside the repo)

| Check | Result |
|---|---|
| Designer A, every answer combination: 6 area ratings (unanswered, na, 1–5) × support yes/no/unanswered × language in link × What-changed. 1,411,788 sets, each through 3 routes (after-all via the converter, after-all via the §5 file, immediate via the converter). | **Same screens as today in all of them.** Re-run by Claude on 22 Oct, 20:11 IST: same. |
| Designer A, Back button: 3,000 random tap scripts per mode, ~35,000 Back taps each | **Same screen at every tap, same final submission** (re-run: same) |
| Designer A, 18 questionnaire variants × 20,000 random answer sets, comparing path, Next-allowed and submission bytes | Identical, except (a) 2 chained-rule variants, identical to "today minus stale answers", and (b) a rule on a later answer, which today's checks already refuse (re-run at 2,000 sets: same) |
| Designer A, the audit's 46 experiment questionnaires | 35 identical. The 11 others differ only where today's checks already refuse the questionnaire, or where the stale-answer fix applies. |
| Designer B, with an independent engine and format: 12 variants, 403,368–1,613,472 states each | 0 differences, except the stale-answer class (intended) |
| Both validators on planted mistakes (unreachable, dead end, missing text, later answer, cycle, language not first, nps re-typed, jump with no default) | All caught; nothing reported on valid files |
| Engine size | 21.9 KB, ES5 (parsed with acorn, `ecmaVersion: 5`) |

## 13. Files

**Stage 1: see and test today's flow (nothing changes for partners)**
- **New:**
  - `scripts/flow.js` (Node, no packages): map, simulate, paths, compare, screens, check;
  - `scripts/flow.py` (Python wrapper for Pranav);
  - `package.json` (root, no dependencies; `npm run validate-flow`);
  - `docs/flow.md` (generated);
  - `tests/flow/legacy/flow_v1.js` (a frozen copy of today's engine);
  - `tests/flow/sim_test.js`.
- **Edited:** `README.md`, `tests/README.md`, `CHANGELOG.md`, `docs/STATE.md`.

**Stage 2: the graph engine on phones (same behaviour)**
- **Edited:**
  - `web/js/flow.js`: rewritten. Graph walk, path-scoped answers, loops, groups, facts, endings, `fromLegacy`, version.
  - `web/js/app.js`: endings, facts, path-scoped rules, the flow from the graph; the gates unchanged.
  - `web/js/net.js`: accepts a list or a graph.
  - `scripts/mock_server.py`, `scripts/smoke_test.py`: they read a graph too.
- **New:** `tests/flow/legacy_diff.js`.
- **Tests:** `tests/flow/flow_test.js` rewritten; `tests/e2e/e2e.js` gets new scenarios.
- **Docs:** `docs/config-guide.md`, `docs/submission-format.md` (the endings note), `docs/spec.md` §4.

**Stage 3: one validator everywhere**
- **New:**
  - `web/js/flow-check.js`;
  - `tests/flow/cases/*.json` (the conformance corpus).
- **Edited:**
  - `scripts/check_config.py`: the old flow checks (~1015–1394) are removed after a parity test; it calls Node.
  - `.github/workflows/deploy-pages.yml`: a pinned Node step.
  - `tests/gas-harness/tools/plant-bugs.py`: new planted mistakes.

**Stage 4: edit the graph in the panel**
- **New:** `apps-script/Flow.gs`, generated with a fingerprint. It is a **fifth file to paste**.
- **Edited:**
  - `apps-script/Model.gs`: the Screens columns, compile to a graph, import/export/restore of both formats, the codes lock over every published code, the per-screen settings move, `PP_validate` → `Flow.gs`.
  - `apps-script/PanelServer.gs`: the engine and checker in the panel window, the type catalogue, the export adds `docs/flow.md`.
  - `apps-script/Code.gs`: the health fingerprint, the publish version guard, a problems count in Preview; submit unchanged.
  - `apps-script/Panel.html`: the jump/loop/ending editors, rule-builder facts, Map, Try a path, badges.
  - `web/config/survey.json`: converted to the graph.
- **Tests:** `tests/model`, `tests/gas-harness`, `tests/panel`, `tests/e2e`.
- **Docs:** `apps-script/README.md` (paste `Flow.gs`), `docs/control-panel.md` (recipes: jump, loop, ending, Map, Try a path), `docs/control-panel-design.md`, `CLAUDE.md`.

**Stage 5: question types as plug-ins**
- **New:**
  - `web/js/types.js` and `web/js/ui.js` (from `screens.js`);
  - `web/js/types/` (new types);
  - `web/config/types.json` (generated).
- **Edited:** `web/index.html`; the readers of the catalogue in `Model.gs`, `Panel.html` and `check_config.py`.
- **Docs:** `docs/config-guide.md` ("how to add a question type").

**Stage 6: data hooks**
- **Edited:**
  - `apps-script/Code.gs`: `config_version` as the last pings column;
  - `scripts/mock_server.py`, `scripts/smoke_test.py`;
  - `docs/submission-format.md` §9;
  - `tests/gas-harness`.
- **Also:** the `screens` command, for the Phase 4 dashboard.

## 14. Effort (working days for one developer, including tests, docs and fixes after each review)

| Stage | What you get | Days |
|---|---|---|
| 1 | The map (`docs/flow.md`) and the simulator, on today's flow. Nothing changes for partners. | 3–5 |
| 2 | The graph engine on phones, proven identical; the stale-answer fix | 7–10 |
| 3 | One validator in CI, Publish and on the Mac; the old checks retired | 4–6 |
| 4 | Jumps, loops and endings editable in the panel; the Map and Try a path in the panel; the repo copy converted | 11–16 |
| 5 | Plug-in question types | 2.5–4 |
| 6 | `config_version` on pings; the dashboard's screen list | 1–2 |
| **Total** | | **≈ 28–43** |

**How the two designs compared:**
- Designer A estimated 20–31 days; designer B, who counted a review stop per stage, estimated 37–54. This merged plan sits between them.
- Stages 1–3 alone (≈ 14–21 days) make the whole flow editable **in the JSON file**, with checks, map and simulator.
- Stage 4 makes it editable **in the panel without JSON**.

Each stage ends with a review stop for Pranav. Stage 4 also needs the five files pasted and a new deployment.

## 15. Where this differs from the request, and why

1. **JSON, not YAML.** No YAML reader exists in the browser, in Apps Script or in Python's standard library without a library.
2. **The graph sits inside the questionnaire file, not a separate `flow.json`** (open decision 2).
   - The flow depends on the areas, chips and support items in the same file.
   - One file means one version stamp, the phone still makes one request, and nothing can get out of step.
   - A separate `web/config/flow.json` is possible if preferred: it costs a version-tie check and one more download on the fallback path.
3. **`show_if` stays on screens,** next to jumps. It is the common case, the panel already speaks it, every existing rule converts 1:1, and it saves repeating one rule on every arrow into a screen.
4. **Operators are stored as today's words** and shown as `==, !=, <=, >=, in, exists`. `not` is added.
5. **"skippable" is `required: false`,** the existing name.
6. **Loops only through `repeat_for` and groups;** an arrow back is an error. Every path then ends, and data keys stay stable.
7. **The checks before the questionnaire stay in code** (security). The map shows them.
8. **The validator is JavaScript, run by Node** from the Python commands and CI. There is no second copy in Python: the audit found today's flow rules written three times.
9. **A fifth Apps Script file,** `Flow.gs`, generated.
10. **A new question type = one file + one `<script>` line;** its "config entry" is the description inside that file.
11. **`?simulate=1` is a developer drawer.** The everyday simulator is the command and the panel's Try a path.
12. **Page weight** goes from ~74% to about 78–80% of the 300 KB budget.

## 16. Open decisions for Pranav (recommendation first)

1. **Scope:** approve all six stages / stages 1–3 first (JSON editing, checks, map, simulator), then decide on the panel / stage 1 only. **Recommended: stages 1–3 first, then stage 4.**
2. **Where the graph lives:** inside `survey.json` and the published version (**recommended**) / a separate `web/config/flow.json`.
3. **The stale-answer fix:** accept (**recommended**; today's questionnaire is unaffected) / keep today's behaviour.
4. **Immediate mode:** keep, as a group (**recommended**; old versions need it anyway) / drop it (saves ~1 day).
5. **Node.js for the checks** on the Mac and in GitHub (**recommended**: one validator) / a Python copy.
6. **`Flow.gs` as a fifth pasted file** (**recommended**) / pasted inside `Model.gs`.
7. **Per-screen settings** move into each screen's editor (**recommended**) / stay under Settings.
8. **Several endings** allowed, each sending the answers (**recommended**) / one thank-you only.
9. **Rules on the language and the round** now (**recommended**) / also DC region and state (needs signed link fields, later).
10. **The panel Map** with a pinned diagram library (**recommended**, to be tested on real Google) / text outline only.
11. **`config_version` on the pings tab** as a last column from a new round (**recommended**) / infer it from the publish times.
12. **Counts in rules** ("2 or more areas rated low"): later (**recommended**) / now.
13. **Quick fixes before the refactor** (about ½ day, current code): the `nps`/`support_gate` type lock, the immediate-mode warning, and "language buttons first". **Recommended: yes**, since the refactor's stage 3 is weeks away. Otherwise they come with stage 3.
