// Step detection and success monitoring
const { safeRun, sleep } = require('./helpers');
const { findFrameWith } = require('../helpers/browser');
const { detectPressAndHoldCaptcha } = require('../handlers/captcha');

// Step detection
async function detectStepAnyFrame(page) {
  const emailSel = ['input[type="email"]','input[name="MemberName"]','#MemberName'];
  const passSel  = ['input[type="password"]','#PasswordInput'];
  const nameSel  = ['#firstNameInput','#lastNameInput','input[name*="first"]','#FirstName','input[name*="last"]','#LastName'];
  const dobSel   = [
    'button#BirthMonthDropdown[role="combobox"]','button[name="BirthMonth"][role="combobox"]','button[aria-label="Birth month"][role="combobox"]',
    'button#BirthDayDropdown[role="combobox"]','button[name="BirthDay"][role="combobox"]','button[aria-label="Birth day"][role="combobox"]',
    'button#BirthYearDropdown[role="combobox"]','button[name="BirthYear"][role="combobox"]','button[aria-label="Birth year"][role="combobox"]',
    'select#BirthMonth','select[name*="month"]','input#BirthMonth','input[name*="month"]',
    'select#BirthDay','select[name*="day"]','input#BirthDay','input[name*="day"]',
    'select#BirthYear','select[name*="year"]','input#BirthYear','input[name*="year"]',
    'input[type="number"][name="BirthYear"]','#floatingLabelInput21','input[aria-label="Birth year"]'
  ];

  let res = await findFrameWith(page, emailSel);
  if (res.frame) return { step: 'email', frame: res.frame };

  res = await findFrameWith(page, passSel);
  if (res.frame) return { step: 'password', frame: res.frame };

  res = await findFrameWith(page, nameSel);
  if (res.frame) return { step: 'name', frame: res.frame };

  res = await findFrameWith(page, dobSel);
  if (res.frame) return { step: 'dob', frame: res.frame };

  const cap = await detectPressAndHoldCaptcha(page);
  if (cap) return { step: 'press_and_hold_captcha', frame: page.mainFrame() };

  const href = await safeRun(() => page.url(), '');
  if (/outlook\.live\.com\/mail/i.test(href)) return { step: 'mailbox', frame: page.mainFrame() };
  if (/account\.microsoft\.com/i.test(href)) return { step: 'account', frame: page.mainFrame() };

  return { step: 'unknown', frame: page.mainFrame() };
}

async function waitForInitialStep(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const { step } = await detectStepAnyFrame(page);
    if (step !== 'unknown') return step;
    await sleep(60);
  }
  const { step } = await detectStepAnyFrame(page);
  return step;
}

// Success detection
async function waitForSuccess(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ok = await safeRun(() => page.evaluate(() => {
      const href = location.href;
      if (/outlook\.live\.com\/mail/i.test(href) || /account\.microsoft\.com/i.test(href)) return true;
      if (document.querySelector('[data-app-launcher-part-id], #O365_MainLink_NavMenu')) return true;
      return false;
    }), false);
    if (ok) return true;
    await sleep(220);
  }
  return false;
}

module.exports = {
  detectStepAnyFrame,
  waitForInitialStep,
  waitForSuccess
};
