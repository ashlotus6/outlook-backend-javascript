// Main entry point for Outlook account creation
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');

// Import modules
const { configureHumanLikeBrowser, frameHasVisible } = require('./helpers/browser');
const { emailVariations, numberedEmail, randomDOB, safeRun, humanPause, sleep } = require('./utils/helpers');
const { fillEmail, fillPassword, fillName, fillDOB } = require('./handlers/form');
const { handlePressAndHoldCaptcha } = require('./handlers/captcha');
const { detectStepAnyFrame, waitForSuccess, waitForInitialStep } = require('./utils/detection');
const { saveCompleted } = require('./utils/storage');
const { 
  WAIT_NAV, 
  WAIT_UI, 
  PASSWORD, 
  BROWSER_ARGS,
  OUTLOOK_SIGNUP_URL,
  ALTERNATE_SIGNUP_URL 
} = require('./utils/constants');

// Use stealth plugin
puppeteer.use(StealthPlugin());

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Main account creation function
async function createOutlookAccount(firstName, lastName) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: BROWSER_ARGS
  });
  
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(WAIT_NAV);
  page.setDefaultTimeout(WAIT_UI);

  // Configure human-like browser
  await configureHumanLikeBrowser(page);

  const completed = { email: false, password: false, name: false, dob: false };
  const chosenDOB = randomDOB(18, 40);
  let chosenPrefix = null;

  const getStep = async () => detectStepAnyFrame(page);

  try {
    console.log('Navigating to Outlook signup…');
    await page.goto(OUTLOOK_SIGNUP_URL, { waitUntil: 'domcontentloaded', timeout: WAIT_NAV });

    const firstStep = await waitForInitialStep(page);
    console.log('Initial step detected:', firstStep);

    // EMAIL selection
    const variants = emailVariations(firstName, lastName);
    for (const v of variants) {
      const { step, frame: curFrame } = await getStep();
      if (step !== 'email' && curFrame && await frameHasVisible(curFrame, 'button#idBtn_Back, a.backButton')) {
        await safeRun(() => curFrame.click('button#idBtn_Back, a.backButton'));
        await humanPause(160, 60);
      }
      console.log(`Trying ${v}@outlook.com`);
      if (await fillEmail(page, v)) { chosenPrefix = v; completed.email = true; break; }
    }
    if (!chosenPrefix) {
      chosenPrefix = numberedEmail(firstName, lastName, 1);
      console.log(`All variants taken; using ${chosenPrefix}@outlook.com`);
      const { step } = await getStep();
      if (step !== 'email') {
        await safeRun(() => page.goto(ALTERNATE_SIGNUP_URL, { waitUntil: 'domcontentloaded', timeout: WAIT_NAV }));
        await humanPause(250, 60);
      }
      if (await fillEmail(page, chosenPrefix)) completed.email = true;
    }

    // Step loop
    for (let i = 0; i < 20; i++) {
      const { step } = await getStep();
      console.log(`Current step: ${step}`);

      if ((step === 'password') && !completed.password) {
        console.log('Setting password…');
        await fillPassword(page, PASSWORD);
        completed.password = true;
        continue;
      }

      if ((step === 'name') && !completed.name) {
        console.log('Entering name…');
        await fillName(page, firstName, lastName);
        completed.name = true;
        continue;
      }

      if ((step === 'dob') && !completed.dob) {
        console.log('Filling DOB…');
        await fillDOB(page, chosenDOB, getStep);
        console.log(`DOB used: ${chosenDOB.day}/${chosenDOB.month}/${chosenDOB.year}`);
        completed.dob = true;
        continue;
      }

      if (step === 'press_and_hold_captcha') {
        const success = await handlePressAndHoldCaptcha(page, { maxAttempts: 3 });
        if (success) await sleep(1500);
        continue;
      }

      if (step === 'mailbox' || step === 'account') break;

      await sleep(700);
    }

    // Success
    const ok = await waitForSuccess(page);
    if (ok) {
      console.log('Signup looks successful.');
      if (chosenPrefix) saveCompleted(firstName, lastName, chosenPrefix, PASSWORD);
    } else {
      console.log('Could not confirm success automatically. If the mailbox loaded, you can save manually.');
    }

    console.log('Flow complete. Browser will remain open.');
  } catch (err) {
    console.error('Flow error:', err.message);
    console.log('You can finish manually in the open browser.');
  } finally {
    rl.close();
  }
}

// CLI interface
(async function main() {
  let [firstName, lastName] = process.argv.slice(2);
  if (!firstName) firstName = await new Promise(r => rl.question('Enter first name: ', r));
  if (!lastName)  lastName  = await new Promise(r => rl.question('Enter last name: ', r));
  console.log(`Creating account for: ${firstName} ${lastName}`);
  await createOutlookAccount(firstName, lastName);
})();
