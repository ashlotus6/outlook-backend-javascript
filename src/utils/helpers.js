// Utility functions
const { ACTION_DELAY_MS, ACTION_JITTER_MS } = require('./constants');

// Tiny utils
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (base, j) => base + Math.floor(Math.random() * (j * 2 + 1)) - j;

async function humanPause(base = ACTION_DELAY_MS, j = ACTION_JITTER_MS) { 
  await sleep(jitter(base, j)); 
}

async function safeRun(fn, fallback = null) { 
  try { 
    return await fn(); 
  } catch { 
    return fallback; 
  } 
}

// Email generation functions
function emailVariations(firstName, lastName) {
  const f = firstName.toLowerCase(), l = lastName.toLowerCase(), i = f[0];
  return [`${f}.${l}`, `${i}.${l}`, `${f}${l}`, `${i}${l}`, `${l}.${f}`, `${l}${f}`, `${f}_${l}`, `${i}_${l}`];
}

function numberedEmail(firstName, lastName, n) { 
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${n}`; 
}

// Date of birth generation
function randomDOB(minAge, maxAge) {
  const y = new Date().getFullYear();
  const minY = y - maxAge, maxY = y - minAge;
  const year = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
  const month = Math.floor(Math.random() * 12) + 1;
  const maxDay = new Date(year, month, 0).getDate();
  const day = Math.floor(Math.random() * maxDay) + 1;
  return { day, month, year };
}

// Month names for dropdown selection
const monthNames = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];

module.exports = {
  sleep,
  jitter,
  humanPause,
  safeRun,
  emailVariations,
  numberedEmail,
  randomDOB,
  monthNames
};
