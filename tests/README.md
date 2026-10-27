# Developer tests

These tests check Valmo Partner Pulse on this Mac. They're for whoever maintains the code.

- **Partners never see them.** GitHub Pages publishes only `web/`.
- **Nothing here contacts Google.** The Google side is tested inside a pretend Google that lives in memory.
- **Fake data only:** DC ids such as `DC-DEMO-001` and `DC-E2E-001`, and the test secret `mock-dev-secret-not-for-production`.

## One-time setup

1. **Node.js 18 or newer.** In Terminal, `node --version` should print `v18` or higher. Python 3.11+ is needed too; the project's `scripts/` already use it.
2. **Google Chrome** in `/Applications`. A Chrome somewhere else works if you set `CHROME_PATH` to it.
3. **Install the two helper packages.** In Terminal, go to the project folder, then run:

   ```
   cd tests && npm install && cd ..
   ```

   It downloads two packages into `tests/node_modules/`, which git ignores. Their versions are pinned in `package.json`:
   - `puppeteer-core` 23.11.1: a remote control for Chrome;
   - `acorn` 8.14.0: reads JavaScript. The static checks use it, and so does the **ES5 gate** (`node scripts/flow.js es5`, which `python3 scripts/check_config.py` runs): without it the gate is skipped on this Mac with a warning saying to run this step. GitHub installs its own acorn 8.14.0, so the deployment always runs the gate.

   You need internet for this step once.

## The suites

Run each command from the project folder. **Run the browser suites one at a time** (the Google imitation, the panel bench and its two helpers, and the end-to-end suite): they start local servers and Chrome, and two at once make each other slow and flaky. On this Mac the helper `local_data/tools/lockrun.py` makes sure of that: `python3 local_data/tools/lockrun.py node tests/panel/test.js` waits until no other browser suite runs, then runs the command and passes on its exit code. It lives in the git-ignored `local_data/` folder and isn't part of the project; without it, just start the browser suites one after another.

Times are rough guides for this Mac (M4 Pro), measured on 26–27 Oct 2026 where a run was timed; a busy Mac is slower.

### The flow (`web/js/flow.js`, `flow-check.js`, `flow-panel.js`, `scripts/flow.js`)

No browser; each needs only Node.

| Suite | Command | What it checks | Time | Expected |
|---|---|---|---|---|
| Flow rules | `node tests/flow/flow_test.js` | Which screen comes next and what is sent: the old list cases (on the frozen list), the repo's graph against that list, `PP.flow.isUsable`, answer keys such as `constructor` | 1 s | `26 tests passed` |
| Old vs new engine | `node tests/flow/legacy_diff.js` | The frozen old engine against the new one on 73 questionnaires, over every answer combination and Back-button scripts: same screens, same Next, byte-identical data | ~1.5 min | `No differences.` (73 questionnaires) |
| Checker | `node tests/flow/check_test.js` | Every check code (G1–C2 and S1) on the small cases in `tests/flow/cases/`, the findings' `site` / `target` / `index`, `answersAt`, the map, the screen list | 4 s | `99 tests passed` |
| Command line | `node tests/flow/sim_test.js` | `scripts/flow.js` and `flow.py`: check, map, simulate, paths, compare, screens, migrate, build-gs, types, es5; stray file names refused; `check_config.py`'s use of them | 15 s | `34 tests passed` |
| Question kinds | `node tests/flow/types_test.js` | `PP.types`, the catalogue, the guide's example kind (`tests/flow/fixtures/types/stars_1_10.js`), and every built-in screen drawn by the new files compared element by element with the old `screens.js` | 2 s | `10 tests passed` |
| Panel rows | `node tests/flow/panel_rows_test.js` | `PP.flowPanel.fromRows` / `toRows` (jumps, "usually go to", repeat, endings, hidden endings), round trips, `formatFlow`, `surveyTextWithFlow` | 1 s | `14 tests passed` |

### The Google side (`apps-script/`)

| Suite | Command | What it checks | Time | Expected |
|---|---|---|---|---|
| Questionnaire logic | `node tests/model/test_model.js` | `apps-script/Model.gs` with the real `Flow.gs` and fake Sheets: tabs ↔ questionnaire, checks, the publish file, import/export (byte for byte with the repo files), restore. Group 13 is the parity test against the frozen old Model.gs; group 14 the reviewers' fixes of 26 Oct; group 15 an added question kind known to Publish. Fails while `Flow.gs` is out of date | 20 s | `TOTAL: 227/227 passed, 0 failed` |
| Shrinking save | `node tests/model/strict/shrink_check.js` | A save that shrinks every tab, inside the strict pretend Google (the save that crashed before the 20 Oct fix) | 2 s | `read back equals the saved model: true`, exit code 0 |
| Fix checks | `node tests/fixes/verify.js` and `node tests/fixes/verify-locks.js` | The 20 and 21 Oct fixes, including the admin lock, the permission re-prompt and handing files to the owner | 2 s | 81 and 40 `ok` lines, each ending `all checks passed` |
| Google imitation | `node tests/gas-harness/run-tests.js` (browser) | The real Apps Script code in a pretend Google: 46 scenarios, about 2,100 checks, including the route as a graph (G11), the reviewers' fixes (G12) and `config_version` on pings (D12). Details: [gas-harness/README.md](gas-harness/README.md) | ~1 min | `45 passed, 1 passed with warnings, 0 failed` (the warning is scenario S, see below); self-test 41/41 |
| Planted mistakes | `python3 tools/plant-bugs.py` (in `tests/gas-harness`) | Do the Google imitation's tests bite? 83 known mistakes, planted one at a time in temporary copies | ~2 min | `RESULT: 83 of 83 planted mistakes caught` |
| Control panel bench | `node tests/panel/test.js` (browser) | `apps-script/Panel.html` in Chrome against a fake server (`server.js`, with the real Model.gs and Flow.gs): 71 steps, including the route tools (jumps, repeat, endings, Map, Try a path, Home banner) and the 26 Oct fixes. The Map step waits 20 s on purpose | ~4 min | `71 passed, 0 failed` |
| Panel at small sizes | `node tests/panel/narrow.js` (browser) | Every section at 720×420, 800×480 and 944×543: no sideways scrolling, the top bar intact | ~30 s | 30 of 30 size/section lines `ok` |
| Panel screenshots | `node tests/panel/smoke.js [width] [height]` (browser) | Screenshots of every section at one size | ~20 s | no console errors |

### The form and the whole system

| Suite | Command | What it checks | Time | Expected |
|---|---|---|---|---|
| Form, end to end | `node tests/e2e/e2e.js` (browser) | The form in Chrome at phone size against the local test server: 34 scenarios, including the repo's graph (I2), a language switch that takes the screen on show off the route (Z7), an unusable published graph (Z8) and the code `constructor` (Z9) | ~8 min | `34/34` scenarios passed |
| Settings check | `python3 scripts/check_config.py` | The config and texts, the flow (through `scripts/flow.js check`), `docs/flow.md` and `web/config/types.json` up to date, the **ES5 gate**, page weight. GitHub runs it before every deployment | 1 s | `Found: 0 errors, 1 warning.` (the DEMO-R1 round note); `All ES5`; page weight 89% |
| ES5 gate alone | `node scripts/flow.js es5` | Every script `web/index.html` loads, `web/js/types/*.js` and `scripts/dev/*.js` parse as ES5 (Chrome 61). Needs acorn (setup step 3) | 1 s | `All ES5` (9 files), exit code 0 |
| Generated files | `node scripts/build_flow_gs.js --check`, `node scripts/flow.js types --check`, `node scripts/flow.js map --check docs/flow.md` | `apps-script/Flow.gs`, `web/config/types.json` with Model.gs's list, and `docs/flow.md` match the code | 2 s | each says up to date, exit code 0 |
| Smoke test | `python3 scripts/smoke_test.py` (mock server running), or against the Google imitation's server (see [gas-harness/README.md](gas-harness/README.md) §3) | 9 checks of a backend over the network | 5 s | `All 9 checks passed.` |

**About the Google imitation's one warning.** Scenario S warns that Model.gs uses `var` for its 42 fixed lists (a style rule asks for `const`/`let`; the lists are `var` on purpose, including the generated `PP_SCREEN_TYPES` and `PP_ADDED_TYPES_`). Relaxing that rule is open question 14 in `docs/STATE.md`; it never blocks. Anything other than `45 passed, 1 passed with warnings, 0 failed` is news.

**About the fix checks.** `verify-locks.js` was written when the Google imitation could not reach the lock, permission and owner fixes. Since 21 Oct the Google imitation's scenarios G1–G3 and G5 reach them too, and `verify-locks.js` stays as a second, independent check.

### Last full run (26 Oct 2026)

The counts below are from the final regression run of 26 Oct 2026, saved on this Mac in `local_data/regress-final-26oct.log` (git-ignored):
- flow_test 26, legacy_diff `No differences` (73 questionnaires, 87 s), check_test 99, sim_test 34, types_test 10, panel_rows_test 14: all passed;
- model 227/227, shrink `true`, fixes 81 + 40 `all checks passed`;
- check_config 0 errors, 1 warning, ES5 gate `All ES5` (9 files, acorn 8.14.0);
- Google imitation 45 passed + 1 known warning (S), 0 failed (46 scenarios, 62 s); planted mistakes 83 of 83 caught;
- panel narrow sizes: the log keeps only the last lines, and they are `ok`;
- **panel bench: 48 passed, 23 failed in that combined run, then 71 passed, 0 failed when rerun alone right after (27 Oct ~00:10 IST, with the lock tool, same files).** The failing steps in the combined run included old Phase 2 steps (for example "rule builder at 900 px") as well as new ones, and Chrome had stalled; the rerun on the unchanged files is green. If the bench ever fails like that, rerun it alone before looking for a bug.
- end to end: 34/34 scenarios passed.

## Shortcuts while working on one thing

A full run (no shortcut) is the real result.

- **Panel bench:** `PP_STEPS='route|Map|Try a path' node tests/panel/test.js` runs only the steps whose name matches. `PP_STANDIN=1` uses a simplified stand-in instead of the real Model.gs (the route steps assume the real one). The bench's fake server takes test hooks such as `POST /control/publish_warnings`, `/control/model`, `/control/flow_code` (an older or failing route code) and `/control/screen_types`; `tests/panel/server.js` lists them all.
- **End to end:** `ONLY=Z7,Z8 node tests/e2e/e2e.js` runs just those scenarios.
- **Google imitation:** `node run-tests.js --only G11,G12` (in `tests/gas-harness`), or `--no-browser` for everything without Chrome.

## Frozen copies (never edit them)

Some tests compare today's code with the code it replaced. The old code is kept, byte for byte, with its SHA-256 checked before use:

| Folder | What is frozen | Read by |
|---|---|---|
| `tests/flow/legacy/` | `flow_v1.js` (the flow engine before 23 Oct, git commit `1c99b5e`), `screens_before_types.js` (`web/js/screens.js` before stage 5 split it into `ui.js` and `types.js`), and `variants/`: fake questionnaires in the old list format, `base.json` being the last list-format `survey.json` | `legacy_diff.js`, `flow_test.js`, `sim_test.js`, `types_test.js`, e2e scenarios I, X and Z4 |
| `tests/model/legacy/` | `Model_before_flowcheck.gs`: Model.gs before its route checks were replaced by the one flow checker | `test_model.js` group 13 (all 126 old route problems are still reported, on 221 drafts) |

Each folder's `README.md` says how to restore a file edited by mistake.

## Tools (not pass/fail suites)

- **`tests/gas-harness/tools/plant-bugs.py`: do the tests catch real mistakes?** See the table above and `tests/gas-harness/README.md`. A mistake counts as caught only when a scenario that passes on the real code fails with it. A `NOT APPLIED` line means the code changed and that mistake's text needs updating.
- **`tests/gas-harness/server.js`: try the whole system by hand** against a pretend Google: the form, the control panel and partner links. See `tests/gas-harness/README.md`, section 3.
- **`scripts/flow.py simulate …`**: try answers on the questionnaire and see the screens and the data (the header of `scripts/flow.js` has every option).

## What the tests write

Everything stays inside `tests/` and git ignores it:
- screenshots: `e2e/shots/`, `panel/shots/`, `gas-harness/out/shots/` (the Google imitation writes its screenshots there even with `--out`);
- the test server's fake data: `e2e/data-*/` (an interrupted run leaves some behind; delete them freely);
- reports: `gas-harness/out/`;
- downloads: `panel/downloads/`;
- throw-away copies: `model/checkcopy/`; `tests/flow/sim_test.js` and `test_model.js` group 15 copy the form into the system's temporary folder and delete it afterwards.

The tests only **read** `web/`, `apps-script/`, `scripts/` and `docs/`. They never change them.

## Rules for this folder

- **No real data.** Never put real partner data, real links or secrets here: this folder is in the public GitHub repo.
- **No personal paths.** Every file finds the project from its own location (`path.resolve(__dirname, ...)`). Before a commit, run this in the project folder. It must print nothing. It searches every file in `tests/` that git would add, so it skips the reports and screenshots git ignores (they do contain this Mac's paths), and it skips this README, which names the search itself:

  ```
  git grep --untracked -n "/Users/" -- tests ':!tests/README.md'
  ```
- **Match the code.** When the code changes on purpose, update the test that expected the old behaviour in the same piece of work (mark it `CHANGED EXPECTATION` with the date and why), and say so in `docs/STATE.md`.
- **After a change to `web/js/flow.js`, `flow-panel.js` or `flow-check.js`:** run `node scripts/build_flow_gs.js` first. tests/model, the panel bench and the Google imitation fail while `apps-script/Flow.gs` is out of date.

## Where these came from

The suites were first built on 19–20 Oct 2026 in a temporary folder outside the project. A restart of the Mac on 21 Oct wiped them. They were rebuilt from the session records the same morning:
- the result matched the files of 20 Oct byte for byte (checked against fingerprints recorded on 20 Oct) and gave the same test results;
- they were then moved here, with only file paths and location notes changed.

The flow suites (`tests/flow/`) were added from 23 Oct 2026 with the flow-graph work ([docs/flow-engine.md](../docs/flow-engine.md)). `docs/STATE.md` has the details.
