# tests/model/legacy: Model.gs as it was before the route checks moved to the one checker

**What this folder is for.** On 26 Oct 2026 the control panel's check of the questions' route (the order of the screens, the "Show this question only if…" rules, the thank-you screens, the problem screens) stopped being written out in `apps-script/Model.gs` and moved to the project's one flow checker, `web/js/flow-check.js` (which reaches Apps Script through the generated `apps-script/Flow.gs`). The rule behind it: there is one checker, never a second copy of its rules ([docs/flow-engine.md](../../../docs/flow-engine.md), section 6).

Pranav must not lose a single warning or error because of that move. This folder keeps what is needed to prove it, for ever:

| File | What it is |
|---|---|
| `Model_before_flowcheck.gs` | A **byte-for-byte copy** of `apps-script/Model.gs` as it was on 26 Oct 2026 just before the change (stage 4 of the flow-graph work, with its own route checks `PP_mdlCheckScreenOrder_`, `PP_mdlCheckRules_` … `PP_mdlCheckNumberTest_`). Never edit it. |

**Who reads it.** Only group 13 of [`tests/model/test_model.js`](../test_model.js). It loads this old file (with today's `apps-script/Flow.gs`) next to today's `Model.gs`, runs both `PP_validate`s on a corpus of flawed questionnaires (the model tests' own breakages, `tests/flow/cases`, and `tests/flow/legacy/variants`, each turned into a control-panel draft), and checks that every problem the old checks reported is still reported at the same question. It also lists the problems that are new on purpose (for example "the language buttons must come first", or a jump's rule that tests a later answer). Nothing here is published: GitHub Pages serves only `web/`. It contains no partner data.

**Its fingerprint.** The test stops if the file differs from this:

```
SHA-256 of Model_before_flowcheck.gs: f8f6b4c7e9cc0954456ab2f12df86849ece29a1648a22d6b79e349db264615af
```

Run the test (Terminal, in the project folder): `node tests/model/test_model.js`. Group 13 prints the intended new problems it found.
