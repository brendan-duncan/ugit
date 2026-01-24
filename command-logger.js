// Auto-append user commands to all-user-commands.txt
const fs = require('fs');
const path = require('path');

const commandsFile = path.join(__dirname, 'all-user-commands.txt');

// This will be called to append commands
function appendCommand(command) {
  const timestamp = new Date().toISOString();
  const entry = `\n127. ${command}\n`;
  
  fs.appendFileSync(commandsFile, entry, 'utf8');
}

module.exports = { appendCommand };