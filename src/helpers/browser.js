// Browser configuration and frame helpers
const { safeRun, humanPause, sleep } = require('../utils/helpers');
const { WAIT_UI } = require('../utils/constants');

// Human-like browser configuration
async function configureHumanLikeBrowser(page) {
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1, hasTouch: false, isLandscape: true });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => ([
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' }
    ])});
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'permissions', { get: () => ({ query: async () => ({ state: 'granted' }) }) });
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit(537.36) Chrome/120.0.0.0 Safari/537.36');
}

// Frame helpers
async function findFrameWith(page, selectors) {
  for (const frame of page.frames()) {
    const found = await safeRun(() => frame.evaluate((sels) => {
      const vis = (el) => {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const rects = el.getClientRects();
        return rects && rects.length > 0;
      };
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && vis(el)) return s;
      }
      return null;
    }, selectors), null);
    if (found) return { frame, selector: found };
  }
  return { frame: null, selector: null };
}

async function frameHasVisible(frame, selector) {
  return await safeRun(() => frame.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rects = el.getClientRects();
    return rects && rects.length > 0;
  }, selector), false);
}

async function waitInAnyFrame(page, selectors, timeout = WAIT_UI) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const res = await findFrameWith(page, selectors);
    if (res.frame) return res;
    await sleep(40);
  }
  throw new Error(`Timed out waiting (any frame visible) for: ${selectors.join(', ')}`);
}

async function clickNextInFrame(frame) {
  const candidates = ['button[type="submit"]','input[type="submit"]','button#idSIButton9'];
  const t0 = Date.now(), timeout = 8000;
  while (Date.now() - t0 < timeout) {
    const sel = await safeRun(() => frame.evaluate((sels) => {
      const vis = (el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const rects = el.getClientRects();
        return rects && rects.length > 0;
      };
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && vis(el)) return s;
      }
      return null;
    }, candidates), null);
    if (sel) {
      const enabled = await safeRun(() => frame.$eval(sel, el => !el.disabled && el.getAttribute('aria-disabled') !== 'true'), false);
      if (enabled) { await safeRun(() => frame.click(sel)); await humanPause(); return true; }
    }
    await sleep(120);
  }
  await safeRun(() => frame.focus('body'));
  await safeRun(() => frame.keyboard.press('Enter'));
  await humanPause();
  return true;
}

module.exports = {
  configureHumanLikeBrowser,
  findFrameWith,
  frameHasVisible,
  waitInAnyFrame,
  clickNextInFrame
};
