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
   - `acorn` 8.14.0: reads JavaScript for the static checks.

   You need internet for this step once.

## The suites

Run each command from the project folder. Run the browser suites one at a time, because they start local servers.

| Suite | Command | What it checks | Time | Expected today (21 Oct 2026) |
|---|---|---|---|---|
| Flow rules | `node tests/flow/flow_test.js` | Which screen comes next (`web/js/flow.js`) | 1 s | 8/8 |
| Questionnaire logic | `node tests/model/test_model.js` | `apps-script/Model.gs` with fake Sheets: tabs ↔ questionnaire, checks, publish file, import/export, restore | 5 s | 195/195 |
| Shrinking save | `node tests/model/strict/shrink_check.js` | A save that shrinks every tab, inside the strict pretend Google. This is the save that crashed before the 20 Oct fix | 2 s | exit code 0 |
| Fix checks | `node tests/fixes/verify.js` and `node tests/fixes/verify-locks.js` | The 20 and 21 Oct fixes, including the admin lock, the permission re-prompt and handing files to the owner | 2 s | 81/81 and 40/40 |
| Google imitation | `node tests/gas-harness/run-tests.js` | The real Apps Script code in a pretend Google: 43 scenarios, 1,895 checks, including the 20–21 Oct fixes (scenarios G1–G10) | ~40 s | 42 passed, 1 with a warning (S), 0 failed; self-test 41/41 (see below) |
| Control panel bench | `node tests/panel/test.js` | `apps-script/Panel.html` in Chrome against a fake server: 53 steps | ~1 min | 53/53 |
| Form, end to end | `node tests/e2e/e2e.js` | The form in Chrome at phone size, against the local test server: 24 scenarios | ~5 min | 24/24 |

**About the Google imitation's one warning.** Until 21 Oct it showed 5 failures and 2 warnings, all from checks that still expected the code as it was before the 20 Oct fixes. On 21 Oct (item 6 of `docs/STATE.md`) those checks were updated to the intended behaviour, the pretend Google was made strict (no global `MimeType.JSON`, which real Google lacks) and complete (the document lock, the permission re-check, `setOwner`), and scenarios G1–G10 now cover the 20–21 Oct fixes (one small one is still checked only by `tests/fixes/verify.js`: searches that read one column instead of the whole tab). Today:
- the expected result is `42 passed, 1 passed with warnings, 0 failed`;
- the one warning is scenario S: a style rule asks for `const`/`let`, and Model.gs uses `var` for its fixed lists on purpose. Relaxing that rule is open question 14 in `docs/STATE.md` (waiting for Pranav); it never blocks;
- the pretend Google's self-test must show 41/41;
- `python3 tools/plant-bugs.py` (in `tests/gas-harness`) must end with `RESULT: 41 of 41 planted mistakes caught`;
- anything else is news. `tests/gas-harness/README.md` lists every scenario.

**About the fix checks.** `verify-locks.js` was written when the Google imitation could not reach the lock, permission and owner fixes. Since 21 Oct the Google imitation's scenarios G1–G3 and G5 reach them too, and `verify-locks.js` stays as a second, independent check.

The project's other checks live in `scripts/`: `check_config.py` (settings) and `smoke_test.py` (a backend). The main `README.md` explains them.

## Tools (not pass/fail suites)

- **`tests/gas-harness/tools/plant-bugs.py`: do the tests catch real mistakes?** Run it from `tests/gas-harness` (`python3 tools/plant-bugs.py`, about 10 seconds). It copies `apps-script/` into a temporary folder, plants 41 known mistakes one at a time (11 older ones and 30 for the 20–21 Oct fixes), and reports whether the Google imitation caught each one. A mistake counts as caught only when a scenario that passes on the real code fails with it. Expected: 41 of 41 caught.
- **`tests/gas-harness/server.js`: try the whole system by hand** against a pretend Google: the form, the control panel and partner links. See `tests/gas-harness/README.md`, section 3.
- **`tests/panel/smoke.js` and `tests/panel/narrow.js`: control panel screenshots.** `smoke.js` takes them at a window size you give; `narrow.js` checks three small sizes for sideways scrolling.

## What the tests write

Everything stays inside `tests/` and git ignores it:
- screenshots: `e2e/shots/`, `panel/shots/`, `gas-harness/out/shots/`;
- the test server's fake data: `e2e/data-*/`;
- reports: `gas-harness/out/`;
- downloads: `panel/downloads/`;
- a throw-away copy of the form's settings: `model/checkcopy/`.

The tests only **read** `web/`, `apps-script/` and `scripts/`. They never change them.

## Rules for this folder

- **No real data.** Never put real partner data, real links or secrets here: this folder is in the public GitHub repo.
- **No personal paths.** Every file finds the project from its own location (`path.resolve(__dirname, ...)`). Before a commit, run this in the project folder. It must print nothing. It searches every file in `tests/` that git would add, so it skips the reports and screenshots git ignores (they do contain this Mac's paths), and it skips this README, which names the search itself:

  ```
  git grep --untracked -n "/Users/" -- tests ':!tests/README.md'
  ```
- **Match the code.** When the code changes on purpose, update the test that expected the old behaviour in the same piece of work, and say so in `docs/STATE.md`.

## Where these came from

The suites were first built on 19–20 Oct 2026 in a temporary folder outside the project. A restart of the Mac on 21 Oct wiped them. They were rebuilt from the session records the same morning:
- the result matched the files of 20 Oct byte for byte (checked against fingerprints recorded on 20 Oct) and gave the same test results;
- they were then moved here, with only file paths and location notes changed.

`docs/STATE.md` has the details.
