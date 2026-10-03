'use strict';
/** Copies the web build (repo-root dist/) into desktop/app, which is what the Electron app loads. */
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'dist');
const target = path.join(__dirname, 'app');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`No web build at ${source}. Run \`npm run build\` in the repo root first.`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Copied ${source} -> ${target}`);
