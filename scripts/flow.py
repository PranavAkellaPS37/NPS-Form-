#!/usr/bin/env python3
"""
flow.py: runs the questionnaire's flow tools (scripts/flow.js) for you
======================================================================

WHAT THIS IS FOR
    The flow tools check, draw and try out the questionnaire's flow: which
    screens a partner sees, in which order, and what is sent at the end.
    They are written in JavaScript, so they run on Node.js: the same code as
    the partners' phones, which is why they can never disagree with the form.
    This small Python file finds Node.js on this Mac and runs them, and if
    Node.js is missing it explains, step by step, how to install it.

HOW TO RUN (Terminal, in the project folder, the one with web/ and scripts/)
    python3 scripts/flow.py check
        Looks for mistakes in the flow. "All good: no errors." is what you
        want to see.
    python3 scripts/flow.py simulate --set nps=4 --set fn_rating:payments=2 --set support_gate=no
        Shows what a partner with these answers would see, which screens are
        skipped and why, and exactly what would be sent.
    python3 scripts/flow.py map --write
        Writes docs/flow.md: the flow as a picture (GitHub draws it).
    python3 scripts/flow.py paths       every distinct route, with examples
    python3 scripts/flow.py es5         every script phones load is ES5 (needs
                                        acorn: cd tests && npm install, once)
    python3 scripts/flow.py help        all commands and options

    Every command and option is passed to scripts/flow.js unchanged; its
    header describes them all.

WHAT IT READS AND WRITES
    Nothing itself: it runs scripts/flow.js, which reads web/config/survey.json,
    web/i18n/strings.json, web/config/types.json, web/index.html, web/js/ and
    scripts/dev/ (or a published version given with --published). Most
    commands only read and print. These four write files, and only when asked:
        map --write       docs/flow.md (or the file given with --out)
        migrate --write   web/config/survey.json (its "flow" becomes the graph)
        build-gs          apps-script/Flow.gs (not with --check)
        types --write     web/config/types.json and the PP_SCREEN_TYPES part
                          of apps-script/Model.gs

EXIT CODE (for automation)
    The flow tool's own: 0 = all good, 1 = problems found, 2 = could not run.
    2 also when Node.js is missing or too old.

NODE.JS
    Needs Node.js 16 or newer (free, from https://nodejs.org). It is looked
    for in the usual places. To use one in an unusual place, set PP_NODE:
        PP_NODE=/path/to/node python3 scripts/flow.py check
    (With PP_NODE set, only that one is used.)

Python 3.11 or newer, standard library only. scripts/check_config.py uses
find_node() from this file too.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FLOW_JS = HERE / "flow.js"
MIN_NODE = 16   # tested on 16, 20 and 24 (GitHub uses 20)

INSTALL_HELP = """\
The flow tools need Node.js (free), and it was not found on this Mac.

How to install it (once, about 5 minutes):
  1. Open https://nodejs.org in your browser and download the "LTS" version for macOS.
  2. Open the downloaded file and click through the installer (Continue, Agree, Install).
  3. Close this Terminal window, open a new one, and go back to the project folder:
         cd ~/NPSF
  4. Check it worked: type  node --version  and press Enter. You should see a
     version number such as v20.18.0 (any version from v16 up is fine).
  5. Run your command again.

(If you use Homebrew, "brew install node" works too. If Node.js is installed
somewhere unusual, tell the scripts where:  PP_NODE=/path/to/node python3 scripts/flow.py check)"""


def _version_key(folder: Path):
    """v20.18.0 -> (20, 18, 0), so the newest Node.js installed by nvm comes first."""
    numbers = re.findall(r"\d+", folder.name)
    return tuple(int(n) for n in numbers[:3]) if numbers else (0,)


def find_node() -> str | None:
    """The path of a Node.js program on this Mac, or None when there is none."""
    explicit = os.environ.get("PP_NODE", "").strip()
    if explicit:   # the person chose one: use exactly that, nothing else
        return explicit if os.path.isfile(explicit) and os.access(explicit, os.X_OK) else None
    candidates = [shutil.which("node"), "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
    nvm = Path.home() / ".nvm" / "versions" / "node"
    if nvm.is_dir():
        for folder in sorted(nvm.iterdir(), key=_version_key, reverse=True):
            candidates.append(str(folder / "bin" / "node"))
    candidates += [str(Path.home() / ".volta" / "bin" / "node"), str(Path.home() / ".local" / "bin" / "node")]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def node_version(node: str):
    """(major, minor, patch) of that Node.js, or None if it does not answer."""
    try:
        answer = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.match(r"v?(\d+)\.(\d+)\.(\d+)", answer.stdout.strip())
    return tuple(int(part) for part in match.groups()) if match else None


def node_problem(node: str | None) -> str | None:
    """None when this Node.js can run the flow tools, otherwise what to tell the person."""
    if node is None:
        return INSTALL_HELP
    version = node_version(node)
    if version is None:
        return (f"Node.js was found at {node}, but it did not answer when asked its version.\n\n" + INSTALL_HELP)
    if version[0] < MIN_NODE:
        return (f"The Node.js on this Mac is version {'.'.join(map(str, version))}, which is too old: the flow "
                f"tools need version {MIN_NODE} or newer.\n\n" + INSTALL_HELP)
    return None


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else list(argv)
    node = find_node()
    problem = node_problem(node)
    if problem:
        print(problem)
        return 2
    try:
        return subprocess.call([node, str(FLOW_JS)] + args)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
