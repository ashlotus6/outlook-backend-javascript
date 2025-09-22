// File system operations for saving results
const fs = require('fs');
const path = require('path');

// Save completed account information
function saveCompleted(firstName, lastName, emailPrefix, password) {
  const line = `${firstName} ${lastName} ${emailPrefix}@outlook.com ${password}\n`;
  const file = path.resolve(process.cwd(), 'completed.txt');
  fs.appendFileSync(file, line, 'utf8');
  console.log(`Saved to ${file}:\n${line.trim()}`);
}

module.exports = {
  saveCompleted
};
