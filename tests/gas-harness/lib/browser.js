/* =============================================================================
   lib/browser.js  -  driving Chrome like a partner's phone (for run-tests.js)

   WHAT THIS FILE IS
     Small helpers around puppeteer-core (a remote control for Chrome):
     open a page at phone size, wait for a screen of the form, tap answers,
     read texts. The form records the screen on view in history.state.pp, and
     ignores taps for half a second after a screen appears (double-tap guard),
     so every helper waits 600 ms after a screen change, as in the Phase 1
     browser tests.

   HOW TO USE IT
     const B = require('./lib/browser');
     const browser = await B.launch();
     const { page, context } = await B.newPage(browser);
     await page.goto(link); await B.waitScreen(page, 'nps');

   NEEDS
     puppeteer-core (installed once by "npm install" in tests/) and Google
     Chrome in /Applications (or set CHROME_PATH).

   WHAT IT READS / WRITES
     Screenshots in out/shots/ (only when asked). Nothing else.
   ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SHOTS = path.join(__dirname, '..', 'out', 'shots');

function requirePuppeteer() {
  const candidates = ['puppeteer-core'];   // installed once by "npm install" in tests/ (tests/node_modules)
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try the next */ }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(options) {
  const puppeteer = requirePuppeteer();
  if (!puppeteer) throw new Error('puppeteer-core is not installed: run "npm install" once in the tests/ folder.');
  if (!fs.existsSync(CHROME)) throw new Error('Google Chrome was not found at ' + CHROME);
  return puppeteer.launch({
    executablePath: CHROME,
    headless: !(options && options.headful),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--lang=en-IN']
  });
}

/* A fresh, private browser context (like a different phone) with a log of console messages. */
async function newPage(browser, opts) {
  const o = opts || {};
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  if (o.desktop) {
    await page.setViewport({ width: o.width || 1100, height: o.height || 760 });
  } else {
    await page.setUserAgent(ANDROID_UA);
    await page.setViewport({ width: o.width || 360, height: o.height || 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  }
  page.consoleMessages = [];
  page.on('console', async (m) => {
    let text = m.text();
    if (/JSHandle@/.test(text)) {   // an Error or object was logged: show its message instead
      try {
        const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => (v instanceof Error ? v.name + ': ' + v.message
          : v && typeof v === 'object' ? JSON.stringify(v) : String(v)))));
        text = parts.join(' ');
      } catch (e) { /* keep Chrome's text */ }
    }
    page.consoleMessages.push(`${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => page.consoleMessages.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.consoleMessages.push(`requestfailed: ${r.url()} ${r.failure() ? r.failure().errorText : ''}`));
  page.badResponses = [];
  page.on('response', (r) => { if (r.status() >= 400) page.badResponses.push(`${r.status()} ${r.url()}`); });
  return { page, context };
}

/* Console errors, minus noise that has nothing to do with the code under test. */
function consoleErrors(page) {
  const bad = (page.badResponses || []).filter((u) => !/favicon/.test(u));
  return page.consoleMessages.filter((m) => /^(error|pageerror)/.test(m) && !/favicon/.test(m))
    // Chrome's "Failed to load resource" line has no address: keep it only when a
    // non-favicon request really failed, and then name the address(es).
    .filter((m) => !/Failed to load resource/.test(m) || bad.length > 0)
    .map((m) => (/Failed to load resource/.test(m) ? `${m} [${bad.join(', ')}]` : m));
}

const screenId = (page) => page.evaluate(() => (history.state && history.state.pp) || null);

async function waitScreen(page, id, timeout) {
  try {
    await page.waitForFunction((want) => history.state && history.state.pp === want, { timeout: timeout || 10000 }, id);
  } catch (e) {
    const final = await finalText(page);
    throw new Error(`expected the screen "${id}", but the form shows "${await screenId(page)}"` +
      (final ? ` with the message: ${final.slice(0, 200)}` : ''));
  }
  await sleep(600); // the form ignores taps for 500 ms after a screen appears
}

async function clickNth(page, selector, index) {
  await page.waitForSelector(selector, { timeout: 8000 });
  const els = await page.$$(selector);
  if (!els[index]) throw new Error(`no element ${selector} [${index}] (found ${els.length})`);
  await els[index].evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await els[index].click();
}

const tap = (page, selector) => clickNth(page, selector, 0);

async function text(page, selector) {
  return page.$eval(selector, (e) => e.textContent.trim());
}

async function finalText(page) {
  try {
    return await page.evaluate(() => (document.querySelector('.final') ? document.querySelector('.final').textContent.trim() : ''));
  } catch (e) {
    return '';
  }
}

async function waitFinal(page, regex, timeout) {
  try {
    await page.waitForFunction((src) => {
      const el = document.querySelector('.final');
      return !!el && new RegExp(src).test(el.textContent);
    }, { timeout: timeout || 15000, polling: 200 }, regex.source);
  } catch (e) {
    throw new Error(`expected the end screen to say ${regex}, but it shows "${(await finalText(page)).slice(0, 200)}" ` +
      `(screen "${await screenId(page)}")`);
  }
}

async function shot(page, name) {
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });
  } catch (e) { /* a missing screenshot never fails a test */ }
}

/* Type into the free-text box of the current screen (reveals it first if needed). */
async function typeText(page, value) {
  const visible = await page.$('.text-input:not([hidden])');
  if (!visible) await tap(page, '.type-row .link-btn');
  await page.waitForSelector('.text-input:not([hidden])', { timeout: 5000 });
  await page.type('.text-input', value);
}

module.exports = { launch, newPage, consoleErrors, screenId, waitScreen, clickNth, tap, text, finalText, waitFinal, shot,
  typeText, sleep, CHROME, SHOTS };
