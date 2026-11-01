#!/usr/bin/env node

import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredStatements = [
  "await fs.copyFile('src/bridge/package.json', 'dist/bridge/package.json');",
  "await fs.copyFile('src/bridge/pnpm-lock.yaml', 'dist/bridge/pnpm-lockfile.yaml');",
];
const errors = [];
let checkedPackages = 0;

for (const file of globSync('packages/*/package.json', { cwd: repoRoot }).sort()) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, file), 'utf8'));
  const script = manifest.scripts?.['copy-bridge-assets'];

  if (script === undefined) continue;

  const statements =
    file === 'packages/harness-acp/package.json'
      ? [
          "await fs.copyFile('src/v1/bridge/package.json', dir + '/package.json');",
          "await fs.copyFile('src/v1/bridge/pnpm-lock.yaml', dir + '/pnpm-lockfile.yaml');",
        ]
      : requiredStatements;

  checkedPackages++;
  for (const statement of statements) {
    if (typeof script !== 'string' || !script.includes(statement)) {
      errors.push(`${file}: copy-bridge-assets must include ${statement}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Found ${errors.length} bridge asset script violation(s):\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(`\nChecked ${checkedPackages} copy-bridge-assets scripts.\n`);
  process.exitCode = 1;
} else {
  console.log(`✓ Verified ${checkedPackages} copy-bridge-assets scripts.`);
}
