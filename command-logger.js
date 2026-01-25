// Auto-append user commands to all-user-commands.txt
const fs = require('fs');
const path = require('path');

const commandsFile = path.join(__dirname, 'all-user-commands.txt');

// This will be called to append commands
function appendCommand(command) {
  const timestamp = new Date().toISOString();
  
  // Read the file to determine the next command number
  let nextNumber = 1;
  try {
    if (fs.existsSync(commandsFile)) {
      const content = fs.readFileSync(commandsFile, 'utf8');
      const lines = content.split('\n');
      
      // Find the last line with a command number
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(/^(\d+)\./);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
          break;
        }
      }
    }
  } catch (error) {
    console.error('Error reading command file:', error);
  }
  
  const entry = `\n${nextNumber}. ${command}\n`;
  fs.appendFileSync(commandsFile, entry, 'utf8');
}

module.exports = { appendCommand };