// Input handling and form interaction helpers
const { safeRun, humanPause, sleep } = require('../utils/helpers');

// React-safe input helpers
async function reactSetValue(frame, handle, value) {
  await safeRun(() => frame.evaluate((el, val) => {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, String(val));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, handle, String(value)));
}

async function typeExact(frame, selector, value, { verifyLength = null } = {}) {
  const handle = await safeRun(() => frame.$(selector));
  if (!handle) return false;
  await safeRun(() => handle.focus());
  await safeRun(() => handle.click({ clickCount: 3 }));
  await reactSetValue(frame, handle, '');
  await humanPause();
  await reactSetValue(frame, handle, String(value));
  await humanPause();
  if (verifyLength != null) {
    let len = await safeRun(() => frame.evaluate(el => (el.value || '').length, handle), 0);
    if (len !== verifyLength) {
      await safeRun(() => handle.click({ clickCount: 3 }));
      await reactSetValue(frame, handle, '');
      await humanPause();
      await safeRun(() => frame.keyboard.type(String(value), { delay: 20 }));
      await humanPause();
      len = await safeRun(() => frame.evaluate(el => (el.value || '').length, handle), 0);
      return len === verifyLength;
    }
  }
  return true;
}

// Fluent UI dropdown helpers
async function readComboboxText(frame, buttonSelector) {
  return await safeRun(() => frame.$eval(buttonSelector, el => {
    const span = el.querySelector('[data-testid="truncatedSelectedText"]') || el;
    return (span.textContent || '').trim();
  }), '');
}

async function selectFluentDropdownVerified(frame, buttonSelector, { text, maxRetries = 4, page, getStep }) {
  let attempt = 0;
  const wanted = (text || '').trim().toLowerCase();
  while (attempt <= maxRetries) {
    attempt++;
    if (page && getStep) { const { step } = await getStep(); if (step !== 'dob') return 'step-changed'; }
    const visibleBtn = await require('../helpers/browser').frameHasVisible(frame, buttonSelector);
    if (!visibleBtn) { await sleep(300); continue; }
    const btn = await safeRun(() => frame.$(buttonSelector));
    if (!btn) { await sleep(300); continue; }
    const expanded = await safeRun(() => frame.evaluate(el => el.getAttribute('aria-expanded') === 'true', btn), false);
    if (!expanded) { await safeRun(() => btn.click()); await sleep(200); }
    await safeRun(() => frame.waitForSelector('div[role="listbox"]', { visible: true, timeout: 4000 }));
    const options = await safeRun(async () => {
      const lbs = await frame.$$('div[role="listbox"]'); const lb = lbs[lbs.length - 1];
      return lb ? await lb.$$('[role="option"]') : [];
    }, []);
    if (!options || !options.length) { await sleep(300); continue; }
    let target = null;
    for (const h of options) {
      const label = (await safeRun(() => frame.evaluate(el => (el.textContent || '').trim().toLowerCase(), h), ''));
      if (label === wanted || label.includes(wanted)) { target = h; break; }
    }
    if (!target) { await sleep(300); continue; }
    await safeRun(() => target.hover()); await humanPause(90, 40);
    await safeRun(() => target.click()); await sleep(220);
    const current = (await readComboboxText(frame, buttonSelector)).toLowerCase();
    if (current.includes(wanted)) return true;
    await safeRun(() => frame.keyboard.press('Escape')); await sleep(300);
  }
  throw new Error(`Failed to set combobox ${buttonSelector} to "${text}" after ${maxRetries} retries`);
}

// DOB field helpers
async function waitForDOBReady(frame) {
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const ready = await safeRun(() => frame.evaluate(() => {
      const pick = (s) => document.querySelector(s);
      const monthBtn = pick('button#BirthMonthDropdown, button[name="BirthMonth"][role="combobox"], button[aria-label="Birth month"][role="combobox"]');
      const dayBtn   = pick('button#BirthDayDropdown,   button[name="BirthDay"][role="combobox"],   button[aria-label="Birth day"][role="combobox"]');
      const yearInp  = pick('input[type="number"][name="BirthYear"], #floatingLabelInput21, input[aria-label="Birth year"], input[name*="year"], #BirthYear');
      const vis = (el) => {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const rects = el.getClientRects(); return rects && rects.length > 0;
      };
      const nd = (el) => el && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
      return vis(monthBtn) && vis(dayBtn) && vis(yearInp) && nd(monthBtn) && nd(dayBtn) && nd(yearInp);
    }), false);
    if (ready) return true;
    await sleep(150);
  }
  return false;
}

async function setDOBField(frame, { nativeSelect, fluentButton, inputSelector, valueAsString, verifyDigits = null }) {
  if (nativeSelect && await require('../helpers/browser').frameHasVisible(frame, nativeSelect)) {
    await safeRun(() => frame.select(nativeSelect, valueAsString)); await humanPause(); return true;
  }
  if (fluentButton && await require('../helpers/browser').frameHasVisible(frame, fluentButton)) {
    const r = await selectFluentDropdownVerified(frame, fluentButton, { text: valueAsString });
    if (r === 'step-changed') return true; await humanPause(250, 60); return true;
  }
  if (inputSelector && await require('../helpers/browser').frameHasVisible(frame, inputSelector)) {
    if (verifyDigits) {
      const ok = await typeExact(frame, inputSelector, valueAsString, { verifyLength: verifyDigits });
      await sleep(200); await humanPause(250, 60); return ok;
    } else {
      const h = await safeRun(() => frame.$(inputSelector));
      if (h) {
        await safeRun(() => h.click({ clickCount: 3 }));
        await reactSetValue(frame, h, valueAsString);
        await sleep(200);
        await humanPause(250, 60);
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  reactSetValue,
  typeExact,
  readComboboxText,
  selectFluentDropdownVerified,
  waitForDOBReady,
  setDOBField
};
