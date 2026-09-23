import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const p of ['@hugeicons/core-free-icons', '@hugeicons/react']) {
  try {
    const j = require(`${p}/package.json`);
    console.log('OK', p, j.version);
  } catch {
    const fs = await import('node:fs');
    const raw = fs.readFileSync(`node_modules/${p}/package.json`, 'utf8');
    console.log('OK', p, JSON.parse(raw).version);
  }
}
