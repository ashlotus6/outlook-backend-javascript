// Form filling handlers
const { safeRun, humanPause, sleep } = require('../utils/helpers');
const { waitInAnyFrame, clickNextInFrame, frameHasVisible } = require('../helpers/browser');
const { reactSetValue, typeExact, waitForDOBReady, setDOBField, selectFluentDropdownVerified } = require('../helpers/input');
const { waitForAndSolvePressHold } = require('./captcha');

// Email filling
async function fillEmail(page, emailPrefix) {
  const { frame, selector } = await waitInAnyFrame(page, ['input[type="email"]','input[name="MemberName"]','#MemberName'], 10000);
  const field = await safeRun(() => frame.$(selector));
  if (!field) throw new Error('Email field vanished');
  await safeRun(() => field.click({ clickCount: 3 }));
  await reactSetValue(frame, field, '');
  await humanPause();
  await safeRun(() => field.focus());
  await reactSetValue(frame, field, emailPrefix);
  await humanPause();
  await clickNextInFrame(frame);

  const errSel = await safeRun(() => frame.evaluate(() => {
    const sels = ['[data-bind*="error"]','[role="alert"]','.error','.errorMessage','#usernameError'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && getComputedStyle(el).display !== 'none') return s;
    }
    return null;
  }), null);

  if (errSel) {
    const txt = await safeRun(() => frame.$eval(errSel, el => (el.textContent||'').toLowerCase()), '');
    if (txt.includes('taken') || txt.includes('already') || txt.includes('not available')) return false;
  }
  return true;
}

// Password filling
async function fillPassword(page, password) {
  const { frame, selector } = await waitInAnyFrame(page, ['input[type="password"]','#PasswordInput'], 10000);
  await safeRun(() => frame.click(selector, { clickCount: 3 }));
  await humanPause();
  await safeRun(() => frame.type(selector, password, { delay: 15 }));
  await humanPause();
  await clickNextInFrame(frame);
}

// Name filling
async function fillName(page, firstName, lastName) {
  const { frame } = await waitInAnyFrame(page, ['#firstNameInput','#lastNameInput'], 14000);
  const ready = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 14000) {
      const ok = await safeRun(() => frame.evaluate(() => {
        const fn = document.querySelector('#firstNameInput');
        const ln = document.querySelector('#lastNameInput');
        const vis = (el) => {
          if (!el) return false;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
          if (el.getAttribute('aria-hidden') === 'true') return false;
          const rects = el.getClientRects(); return rects && rects.length > 0;
        };
        const nd = (el) => el && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
        return vis(fn) && vis(ln) && nd(fn) && nd(ln);
      }), false);
      if (ok) return true;
      await sleep(120);
    }
    return false;
  })();
  if (!ready) throw new Error('Name inputs not ready');

  const fSel = '#firstNameInput', lSel = '#lastNameInput';
  const fH = await safeRun(() => frame.$(fSel));
  const lH = await safeRun(() => frame.$(lSel));
  if (!fH || !lH) throw new Error('Name inputs not found');

  await safeRun(() => fH.focus());
  await safeRun(() => fH.click({ clickCount: 3 }));
  await reactSetValue(frame, fH, '');
  await humanPause();
  await reactSetValue(frame, fH, firstName);
  await sleep(200);
  let firstOk = await safeRun(() => frame.$eval(fSel, el => el.value.trim().length > 0), false);
  if (!firstOk) {
    await safeRun(() => fH.click({ clickCount: 3 }));
    await reactSetValue(frame, fH, '');
    await humanPause();
    await safeRun(() => frame.keyboard.type(firstName, { delay: 15 }));
    await sleep(200);
    firstOk = await safeRun(() => frame.$eval(fSel, el => el.value.trim().length > 0), false);
  }

  await safeRun(() => lH.focus());
  await safeRun(() => lH.click({ clickCount: 3 }));
  await reactSetValue(frame, lH, '');
  await humanPause();
  await reactSetValue(frame, lH, lastName);
  await sleep(200);
  let lastOk = await safeRun(() => frame.$eval(lSel, el => el.value.trim().length > 0), false);
  if (!lastOk) {
    await safeRun(() => lH.click({ clickCount: 3 }));
    await reactSetValue(frame, lH, '');
    await humanPause();
    await safeRun(() => frame.keyboard.type(lastName, { delay: 15 }));
    await sleep(200);
    lastOk = await safeRun(() => frame.$eval(lSel, el => el.value.trim().length > 0), false);
  }

  await humanPause(200, 60);
  await clickNextInFrame(frame);

  // Explicitly handle press-and-hold challenge after Name
  console.log('Checking for press-and-hold challenge after Name…');
  const solvedNow = await waitForAndSolvePressHold(page, { appearTimeoutMs: 25000, maxAttempts: 3 });
  if (solvedNow) {
    await sleep(1500);
  }
}

// Date of birth filling
async function fillDOB(page, dob, getStep) {
  const { frame } = await waitInAnyFrame(page, [
    'button#BirthMonthDropdown','button[name="BirthMonth"][role="combobox"]','button[aria-label="Birth month"][role="combobox"]',
    'select#BirthMonth','select[name*="month"]','input#BirthMonth','input[name*="month"]'
  ], 10000);

  const { day, month, year } = dob;
  const monthNames = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];

  await waitForDOBReady(frame);

  const monthBtnSel = 'button#BirthMonthDropdown, button[name="BirthMonth"][role="combobox"], button[aria-label="Birth month"][role="combobox"]';
  const monthNativeSel = 'select[name*="month"], #BirthMonth';
  if (await frameHasVisible(frame, monthNativeSel)) {
    await safeRun(() => frame.select(monthNativeSel, monthNames[month]));
    await humanPause(320, 40);
  } else {
    const r = await selectFluentDropdownVerified(frame, monthBtnSel, { text: monthNames[month], page, getStep });
    if (r === 'step-changed') return;
  }

  await safeRun(() => frame.evaluate(() => document.activeElement && document.activeElement.blur()));
  await humanPause(250 + 120, 40);

  const dayBtnSel = 'button#BirthDayDropdown, button[name="BirthDay"][role="combobox"], button[aria-label="Birth day"][role="combobox"]';
  const dayNativeSel = 'select[name*="day"], #BirthDay';
  if (await frameHasVisible(frame, dayNativeSel)) {
    await safeRun(() => frame.select(dayNativeSel, String(day)));
    await humanPause(320, 40);
  } else {
    const r = await selectFluentDropdownVerified(frame, dayBtnSel, { text: String(day), page, getStep });
    if (r === 'step-changed') return;
  }

  await safeRun(() => frame.evaluate(() => document.activeElement && document.activeElement.blur()));
  await humanPause(250 + 120, 40);

  const yearSelectors = [
    'input[type="number"][name="BirthYear"]',
    '#floatingLabelInput21',
    'input[aria-label="Birth year"]',
    'input[name*="year"]',
    '#BirthYear'
  ];
  let yearSelVisible = null;
  for (const s of yearSelectors) { if (await frameHasVisible(frame, s)) { yearSelVisible = s; break; } }

  if (yearSelVisible) {
    const ok = await typeExact(frame, yearSelVisible, String(year), { verifyLength: 4 });
    await humanPause(320, 40);
    if (!ok) throw new Error('Year input did not accept 4 digits');
  } else {
    const ok = await setDOBField(frame, {
      nativeSelect: 'select[name*="year"], #BirthYear',
      fluentButton: 'button#BirthYearDropdown, button[name="BirthYear"][role="combobox"], button[aria-label="Birth year"][role="combobox"]',
      inputSelector: yearSelectors.join(','),
      valueAsString: String(year),
      verifyDigits: 4,
    });
    if (!ok) throw new Error('Could not set Year');
  }

  await safeRun(() => frame.evaluate(() => document.activeElement && document.activeElement.blur()));
  await humanPause(250 + 150, 60);

  await clickNextInFrame(frame);
}

module.exports = {
  fillEmail,
  fillPassword,
  fillName,
  fillDOB
};
