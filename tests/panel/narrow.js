/* Checks the control panel at small window sizes (720x420, 800x480, 944x543): no sideways
   scrolling, no overlapping top-bar buttons, every section reachable.
   Run (project folder): node tests/panel/narrow.js   Prints one line per size and section
   ("ok" or "PROBLEM"). Developer tool; screenshots go to tests/panel/shots/ (ignored by git). */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');   // from tests/node_modules
const { start } = require('./server');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async () => {
  const server = await start(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const out = [];
  try {
    for (const [w, hgt] of [[720, 420], [800, 480], [944, 543]]) {
      const page = await browser.newPage();
      const errs = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
      page.on('pageerror', (e) => errs.push(e.message));
      await page.setViewport({ width: w, height: hgt });
      await page.goto(base + '/panel');
      await page.waitForSelector('[data-test="nav-home"]', { visible: true });
      await new Promise((r) => setTimeout(r, 600));
      for (const sec of ['home', 'questions', 'areas', 'support', 'texts', 'look', 'rounds', 'links', 'publish', 'settings']) {
        await page.$eval('[data-test="nav-' + sec + '"]', (e) => e.click());
        await new Promise((r) => setTimeout(r, 400));
        const m = await page.evaluate(() => {
          const d = document.scrollingElement, main = document.getElementById('main'), nav = document.getElementById('nav');
          const bar = Array.from(document.querySelectorAll('#topbar > *')).filter((e) => e.offsetParent !== null && !e.classList.contains('spacer')).map((e) => e.getBoundingClientRect());
          return { docX: d.scrollWidth - d.clientWidth, docY: d.scrollHeight - d.clientHeight, mainX: main.scrollWidth - main.clientWidth,
            barOverlap: bar.some((k, i) => i && bar[i - 1].right > k.left + 1), barRight: Math.round(bar[bar.length - 1].right),
            navHidden: nav.scrollHeight - nav.clientHeight };
        });
        const bad = m.docX > 0 || m.docY > 0 || m.mainX > 0 || m.barOverlap || m.barRight > w;
        out.push(w + 'x' + hgt + ' ' + sec + ': ' + (bad ? 'PROBLEM ' : 'ok ') + JSON.stringify(m));
      }
      await page.screenshot({ path: path.join(__dirname, 'shots', 'narrow-' + w + '.png') });
      if (errs.length) out.push('console: ' + errs.join(' | '));
      await page.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log(out.join('\n'));
})();
