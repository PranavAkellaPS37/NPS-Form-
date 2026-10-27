# tests/flow/cases: the flow checker's test questionnaires

**What this folder is for.** Small, obviously fake questionnaires that test the flow checker, `web/js/flow-check.js`. Each one either contains one planted mistake, which the checker must report with the right code (the codes are in [docs/flow-engine.md](../../../docs/flow-engine.md), section 6), or is valid and must give no errors and no warnings. Nothing here is published: GitHub Pages serves only `web/`.

**Who reads it.** Only [`tests/flow/check_test.js`](../check_test.js). Run it in Terminal, in the project folder:

```
node tests/flow/check_test.js
```

You should see one `PASS case ...` line per file, then `N tests passed`. It also fails if a check code has no failing case here.

## The files

| File | What it is |
|---|---|
| `_base.json` | The frozen base: today's screens, areas and support items (`survey`), today's flow in both formats (`flow_list`, `flow_graph`), and a fake text table (`strings`) with every text they show in all six languages. Frozen on 23 Oct 2026, so the cases don't change when the real settings do. |
| `valid-*.json` | Valid questionnaires: today's, in both formats, and the proposal's examples (a jump, a new loop, a rule on the language, two endings, "immediate" mode as a group). |
| `<CODE>-*.json` | One planted mistake each, named after the code it must produce (for example `R1-later-answer.json`). |
| `S1-*.json` | Since 26 Oct 2026: survey.json's own `deep_dive`, `rating` or `support` setting disagrees with the graph's screens (which phones follow). They change `"survey"` (or a node) so the two disagree. `valid-list-own-settings.json` and `valid-graph-na-from-settings.json` show what is not a mistake. |

## How a case file is written

Each case starts from the base and changes only what it needs:

- `"_about"`: what the case checks, in plain English (required).
- `"base"`: `"list"` or `"graph"`, today's flow in that format.
- `"patch"`: a list of edits to the flow, applied in order:
  - `{"op": "set", "node": "<id>", "field": "<name>", "value": ...}` and `{"op": "remove_field", "node": "<id>", "field": "<name>"}`;
  - `{"op": "remove", "node": "<id>"}`, `{"op": "replace", "node": "<id>", "value": {...}}` and `{"op": "add", "after": "<id>", "value": {...}}`;
  - `{"op": "set_flow", "field": "start", "value": ...}` (a field of the graph itself).

  Nodes inside group bodies are found too.
- `"survey"`: top-level fields to replace (for example `"deep_dive"` or `"functions"`).
- `"strings_set"`: `[key, language, text]` lists; `"strings_delete"`: `[key, language]` lists.
- `"opts"`: the checker's options, for example `{"surface": "panel", "everLiveCodes": [...]}`.

What must come out:
- `"expect"`: findings that must be reported, each `{"code", "level", "node"}` (`node` optional).
- `"expect_clean": true`: no errors and no warnings (notes are allowed). Every `valid-*` file has it.
- `"expect_no_errors": true`: no errors (for cases that expect only a warning or a note).
- `"forbid"`: findings that must **not** be reported.

**To add a case:** copy a file with the same code, change `_about`, `patch` and `expect`, then run `node tests/flow/check_test.js`. Use fake content only.
