// Captcha handling functionality
const { safeRun, humanPause, sleep } = require('../utils/helpers');
const { frameHasVisible } = require('../helpers/browser');

// Try to find a press-and-hold button inside a frame
async function findHoldButtonInFrame(frame) {
  // 1) role=button with text
  const el1 = await frame.evaluateHandle(() => {
    const nodes = Array.from(document.querySelectorAll('[role="button"], button'));
    const norm = (s) => (s || '').toLowerCase();
    return nodes.find(n => /press\s*&?\s*hold/.test(norm(n.textContent) || norm(n.getAttribute('aria-label')))) || null;
  }).catch(() => null);
  if (el1 && el1.asElement) return el1.asElement();

  // 2) aria-label contains press & hold
  const el2 = await frame.$('*[role="button"][aria-label*="press" i][aria-label*="hold" i], button[aria-label*="press" i][aria-label*="hold" i]').catch(() => null);
  if (el2) return el2;

  // 3) last resort: any visible clickable inside likely container
  const el3 = await frame.evaluateHandle(() => {
    const isVis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 20 && r.height > 20;
    };
    // pick widest visible button-like node
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], .btn, .button'))
      .filter(isVis)
      .sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    return candidates[0] || null;
  }).catch(() => null);
  return el3 && el3.asElement ? el3.asElement() : null;
}

// Compute absolute page coordinates for an element inside a specific iframe element handle
async function getAbsoluteCenterPoint(page, iframeHandle, elementHandle) {
  const [ifrBox, elBox] = await Promise.all([
    iframeHandle.boundingBox(),
    elementHandle.boundingBox()
  ]);
  if (!ifrBox || !elBox) return null;
  // element boundingBox is already in page coordinates when using ElementHandle.boundingBox(),
  // BUT for consistency across chromium builds, also compute via DOM if needed:
  const x = elBox.x + elBox.width / 2;
  const y = elBox.y + elBox.height / 2;
  return { x, y };
}

// Reuse your iframe search, but also return the iframe element handle
async function getPressHoldContext(page) {
  // Prefer visible iframes with likely titles
  const iframes = await page.$$('iframe[title*="verification" i], iframe[title*="challenge" i], iframe[title*="human" i]').catch(() => []);
  for (const iframeEl of iframes) {
    try {
      const f = await iframeEl.contentFrame();
      if (!f) continue;

      const hasClue = await f.evaluate(() => {
        const t = (document.body.textContent || '').toLowerCase();
        const clue = t.includes('press and hold') || t.includes('press & hold');
        // Or a progressbar-like element
        const barCandidate = Array.from(document.querySelectorAll('div[style*="width"],span[style*="width"]'))
          .some(el => /width:\s*\d+(?:\.\d+)?px/i.test(el.getAttribute('style') || ''));
        return clue || barCandidate;
      }).catch(() => false);

      if (hasClue) {
        const btn = await findHoldButtonInFrame(f).catch(() => null);
        if (btn) {
          const point = await getAbsoluteCenterPoint(page, iframeEl, btn).catch(() => null);
          return { frame: f, clickPoint: point, btn };
        }
        // fallback: center of iframe if button not found yet
        const box = await iframeEl.boundingBox();
        if (box) {
          return { frame: f, clickPoint: { x: box.x + box.width/2, y: box.y + box.height/2 }, btn: null };
        }
      }
    } catch {}
  }

  // Fallback: generic containers
  const container = await page.$('#px-captcha, [id*="captcha" i], [class*="captcha" i]').catch(() => null);
  if (container) {
    const box = await container.boundingBox();
    if (box) {
      return { frame: page.mainFrame(), clickPoint: { x: box.x + box.width/2, y: box.y + box.height/2 }, btn: null };
    }
  }

  const viewport = page.viewport();
  if (viewport) return { frame: page.mainFrame(), clickPoint: { x: viewport.width/2, y: viewport.height/2 }, btn: null };
  return null;
}

// Broad detection that scans page + candidate iframes
async function detectPressAndHoldCaptcha(page) {
  return await safeRun(async () => {
    const ctx = await getPressHoldContext(page);
    if (ctx) return true;
    const textHit = await page.evaluate(() => {
      const t = (document.body.textContent || '').toLowerCase();
      return t.includes('press and hold') || t.includes('press & hold');
    }).catch(() => false);
    return !!textHit;
  }, false);
}

// Read percentage from the dynamic "width: Npx" bar inside the captcha frame
async function getProgressPercent(frame) {
  return await frame.evaluate(() => {
    // Strategy: prefer a growing child inside a button/track region; otherwise use any px-width bar
    function firstGrowingBar() {
      const nodes = Array.from(document.querySelectorAll('div,span,p'));
      const bars = nodes.filter(n => {
        const style = (n.getAttribute('style') || '').toLowerCase();
        if (!/width:\s*\d+(?:\.\d+)?px/.test(style)) return false;
        const r = n.getBoundingClientRect();
        return r.width >= 1 && r.height >= 4 && r.height <= 40;
      });
      return bars[0] || null;
    }

    function findTrack(el) {
      if (!el) return null;
      const bw = el.getBoundingClientRect().width;
      let node = el.parentElement;
      for (let hop = 0; node && hop < 6; hop++, node = node.parentElement) {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        const isTrackish =
          r.width > bw + 4 &&
          r.width >= 40 &&
          (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflow === 'clip');
        if (isTrackish) return node;
      }
      return null;
    }

    const bar = firstGrowingBar();
    if (!bar) return null;
    const track = findTrack(bar);
    if (!track) return null;

    const bw = bar.getBoundingClientRect().width;
    const tw = track.getBoundingClientRect().width;
    if (tw <= 0) return null;

    return Math.max(0, Math.min(100, (bw / tw) * 100));
  }).catch(() => null);
}

// Hold until the progress nears 100% (or stalls high), then release — now clicking exact element coords
async function handlePressAndHoldCaptcha(page, { maxAttempts = 3 } = {}) {
  const MIN_HOLD_MS = 6500;  // backup if we fail to read percent
  const MAX_HOLD_MS = 14000; // slightly higher to tolerate slower bars

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Press & hold challenge detected... (attempt ${attempt}/${maxAttempts})`);

    const ctx = await getPressHoldContext(page);
    if (!ctx) { console.log('Could not locate challenge UI.'); return false; }
    const { frame, clickPoint, btn } = ctx;

    if (!clickPoint) { console.log('No click point available.'); return false; }

    // Move to the exact element center and hold
    await page.mouse.move(clickPoint.x, clickPoint.y, { steps: 8 });
    await humanPause(150, 40);
    console.log('Holding mouse (monitoring progress %)…');
    await page.mouse.down();

    let best = 0;
    let stagnantCount = 0;
    let lastPct = -1;

    const NEAR_DONE = 99;
    const STALL_READS = 14;       // ~1.4s no change at 100ms interval
    const STABLE_DONE_READS = 8;  // ~0.8s stably near 100%

    const t0 = Date.now();
    while (true) {
      // If widget vanished, stop holding
      const gone = !(await detectPressAndHoldCaptcha(page));
      if (gone) { console.log('Challenge disappeared while holding - releasing'); break; }

      // Prefer proper %; otherwise use time fallback
      const pct = await getProgressPercent(frame);
      if (pct != null) {
        const delta = Math.abs(pct - lastPct);
        stagnantCount = delta < 0.25 ? (stagnantCount + 1) : 0;
        lastPct = pct;
        best = Math.max(best, pct);

        if (pct >= NEAR_DONE && stagnantCount >= STABLE_DONE_READS) {
          console.log(`Near 100% and stable (${pct.toFixed(1)}%) - releasing`);
          break;
        }
        if (pct >= 95 && stagnantCount >= STALL_READS) {
          console.log(`High & stagnant (${pct.toFixed(1)}%) - releasing`);
          break;
        }

        console.log(`Progress: ${pct.toFixed(1)}% (best ${best.toFixed(1)}%)`);
      } else {
        const held = Date.now() - t0;
        if (held >= MIN_HOLD_MS) { console.log('No progress metric; min time reached - releasing'); break; }
      }

      const held = Date.now() - t0;
      if (held >= MAX_HOLD_MS) { console.log('Max hold reached - releasing'); break; }

      await sleep(100);
    }

    await page.mouse.up();
    const heldMs = Date.now() - t0;
    console.log(`Released after ${heldMs} ms.`);

    // Let UI finish
    await sleep(1800);

    // Completed if frame disappears or no button remains
    const stillThere = await safeRun(async () => {
      const again = await getPressHoldContext(page);
      if (!again) return false;
      if (again.btn) return true;
      // If we only had an iframe center before, check generic detection:
      return await detectPressAndHoldCaptcha(page);
    }, false);

    if (!stillThere) { console.log('Challenge completed successfully.'); return true; }

    // Check explicit retry text
    const needRetry = await frame.evaluate(() => {
      const el = document.querySelector('[role="alert"], p[role="alert"]');
      const t = el ? (el.textContent || '').toLowerCase() : '';
      return t.includes('please try again') || t.includes('try again');
    }).catch(() => false);

    if (needRetry) { console.log('Challenge says retry; pausing briefly…'); await sleep(900); continue; }

    console.log('Challenge still visible after release; retrying…');
    await sleep(900);
  }

  console.log('All press & hold attempts exhausted.');
  return false;
}

// Wait for a press-and-hold challenge to appear, then solve it.
async function waitForAndSolvePressHold(page, { appearTimeoutMs = 25000, maxAttempts = 3 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < appearTimeoutMs) {
    const seen = await detectPressAndHoldCaptcha(page);
    if (seen) {
      const ok = await handlePressAndHoldCaptcha(page, { maxAttempts });
      return ok;
    }
    await sleep(300);
  }
  return false;
}

module.exports = {
  detectPressAndHoldCaptcha,
  handlePressAndHoldCaptcha,
  waitForAndSolvePressHold
};
