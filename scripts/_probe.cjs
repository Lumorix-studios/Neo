const fs = require('fs');

const lines = fs.readFileSync('src/ide/AgentPanel.tsx', 'utf8').split(/\r?\n/);
console.log('LINE15=' + JSON.stringify(lines[14]));

for (const p of ['@hugeicons/core-free-icons', '@hugeicons/react']) {
  try {
    console.log(p + ' => ' + require('../node_modules/' + p + '/package.json').version);
  } catch (e) {
    console.log(p + ' => NOT INSTALLED');
  }
}
