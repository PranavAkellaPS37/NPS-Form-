# tests/flow/legacy: the old flow engine, frozen, and the questionnaires it is compared on

**What this folder is for.** On 23 Oct 2026 the form's flow engine, `web/js/flow.js` (the code that decides which screen comes next and builds the data sent at the end), was rewritten to walk a graph (contract: [docs/flow-engine.md](../../../docs/flow-engine.md)). Partners must not notice the change. This folder keeps what is needed to prove that, for ever:

| File | What it is |
|---|---|
| `flow_v1.js` | A **byte-for-byte copy** of `web/js/flow.js` as it was before the rewrite (last changed in git commit `1c99b5e`, Phase 2). Never edit it. |
| `variants/` | Fake questionnaires in today's list format that both engines are run on. |
| `screens_before_types.js` | A **byte-for-byte copy** of `web/js/screens.js` as it was on 26 Oct 2026, just before stage 5 split it into `web/js/ui.js` (the drawing helpers) and `web/js/types.js` (the drawing of each built-in kind of screen). Never edit it. |

**Who reads it.** [`tests/flow/legacy_diff.js`](../legacy_diff.js) (and cases of [`tests/flow/flow_test.js`](../flow_test.js)) read the engine and the questionnaires; [`tests/flow/types_test.js`](../types_test.js) reads `screens_before_types.js`. Nothing here is published: GitHub Pages serves only `web/`.

## Why a frozen copy

`legacy_diff.js` loads the old engine from `flow_v1.js` and the new one from `web/js/flow.js`, gives both the same questionnaire and the same answers, and checks that they show the same screens, allow Next in the same places and send byte-identical data. That only proves something if the old engine can't change. So `legacy_diff.js` first checks the file's fingerprint and stops if it differs:

```
SHA-256 of flow_v1.js: 74cf61492d6e7cea067002b82d805538b7c6bdb1105e18a86ceb66385dc12f67
```

If someone edits it by mistake, restore it (Terminal, in the project folder):

```
git show 1c99b5e:web/js/flow.js > tests/flow/legacy/flow_v1.js
```

The old engine is also how old questionnaires behaved: every version published before the rewrite (`published/p1.json` … in Drive) is in the list format, and phones that receive one convert it with `PP.flow.fromLegacy`. This comparison is the proof that the conversion keeps every old rule.

## The questionnaires in `variants/`

All of them are **fake** (made-up areas, chips and screens; no partner data). Each JSON file has a `_source` note saying where it came from.

| File | Where it came from |
|---|---|
| `base.json` | `web/config/survey.json` on 23 Oct 2026 (`config_version` 2026-10-19.1), the last list-format questionnaire. Only the parts the engine reads (`rating`, `deep_dive`, `functions`, `support`, `flow`); the `_help` notes removed. It is frozen here because `web/config/survey.json` itself becomes a graph in stage 4. Since then the tests that edit the flow as a list use its `flow`: `flow_test.js`, `sim_test.js` and the end-to-end scenarios I, X and Z4 (`tests/e2e/e2e.js`). |
| `graph-default.json` | The hand-written graph of today's questionnaire from [docs/flow-graph-proposal.md](../../../docs/flow-graph-proposal.md) §5, copied byte for byte. |
| `form-*.json`, `data-*.json`, `verify-*.json` | The flow audit of 22 Oct 2026 (workflow `wf_43b4b1dd-f39`): 52 questionnaires its auditors and verifiers made to probe the old engine (from their `form/cfgs/`, `data/web-copy/` and `verify-data/variants/` folders). Each file holds only what differs from `base.json` (usually `flow`), plus `_note` (what was changed) and `_expect` (see below). |

More variants (designer A's prototype set of 22 Oct, and a few added on 23 Oct) are written as small edits of `base.json` inside `legacy_diff.js`.

**`_expect` says what the comparison must find:**
- `same`: exactly the old engine's screens, Next rules and data.
- `chained`: a rule reads an answer whose screen is not always on the path. The new engine ignores such answers (the stale-answer fix), so it must equal the old engine run *without* answers to screens off the path.
- `ends_early`: a thank-you that isn't last. Partners finished at the first one, so it must equal the old path cut there.
- `refused`: a rule on a *later* answer. Today's checks already refuse these questionnaires, and rules now only see earlier answers, so differences are expected; the test only checks that nothing breaks.

**To add a variant:** copy a `form-*.json` file, change `flow` (or `functions`, `deep_dive`, `support`, `rating`), write `_source`, `_note` and `_expect`, then run `node tests/flow/legacy_diff.js`. Use obviously fake content only.

## The drawings before stage 5 (`screens_before_types.js`)

On 26 Oct 2026 the kinds of screen became plug-ins (stage 5, [docs/config-guide.md](../../../docs/config-guide.md), "How to add a question type"): `web/js/screens.js` was split into `web/js/ui.js` and `web/js/types.js`. Partners must see exactly the same screens. [`tests/flow/types_test.js`](../types_test.js) draws every built-in screen with the old file and with the new ones (many screens, settings, three languages, taps, Next pressed too early, every sending status) and compares the results element by element. It first checks the frozen copy's fingerprint:

```
SHA-256 of screens_before_types.js: ee709e2a3100c1eab6dbb40efeadfa8e56b74b6e4ff01804915e5fdb639e1cee
```

The copy was made from the working file of that day (not from a commit: stages 2 to 4 were not committed yet), so it cannot be restored from git; if it is ever lost, the comparison test can no longer run and should be retired.
