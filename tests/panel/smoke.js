/* Quick look: opens the panel, visits every section, screenshots, prints console errors.
   Run (project folder): node tests/panel/smoke.js [width] [height]
   Developer tool; screenshots go to tests/panel/shots/ (ignored by git). */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');   // from tests/node_modules
const { start } = require('./server');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = Number(process.argv[2] || 1100), H = Number(process.argv[3] || 760);
const OUT = path.join(__dirname, 'shots');

(async () => {
  const server = await start(0);
  const port = server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--no-default-browser-check'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:' + port + '/panel', { waitUntil: 'load' });
    await page.waitForSelector('[data-test="nav-home"]', { visible: true, timeout: 8000 });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, `smoke-${W}-home.png`) });
    for (const sec of ['questions', 'areas', 'support', 'texts', 'look', 'rounds', 'links', 'publish', 'settings']) {
      await page.click(`[data-test="nav-${sec}"]`);
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: path.join(OUT, `smoke-${W}-${sec}.png`) });
    }
  } catch (e) {
    errors.push('script: ' + e.stack);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})();
