#!/usr/bin/env node
// Runs a command with a specific Node.js major version first on PATH.
//
// Usage: node tools/with-node.mjs <major> <command> [...args]
//
// Vercel CI runs every task on its image's Node.js. The `test:node22`,
// `test:node24` and `test:node26` tasks use this script to run a package's
// tests on a pinned version instead. Each version is installed by
// `pnpm install` through the `devEngines.runtime` field of tools/node-<major>.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [major, command, ...args] = process.argv.slice(2);

if (!/^\d+$/.test(major ?? '') || command == null) {
  console.error('Usage: node tools/with-node.mjs <major> <command> [...args]');
  process.exit(1);
}

const nodeBinDir = fileURLToPath(
  new URL(`./node-${major}/node_modules/.bin`, import.meta.url),
);

if (!existsSync(join(nodeBinDir, 'node'))) {
  console.error(
    `Node.js ${major} isn't installed in ${nodeBinDir}. Add a tools/node-${major} package and run \`pnpm install\`.`,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: `${nodeBinDir}${delimiter}${process.env.PATH ?? ''}`,
};

const version = execFileSync('node', ['--version'], {
  encoding: 'utf8',
  env,
}).trim();

if (!version.startsWith(`v${major}.`)) {
  console.error(`Expected Node.js ${major}, but PATH resolves to ${version}.`);
  process.exit(1);
}

console.log(
  `Running with Node.js ${version} (${availableParallelism()} CPUs): ${[command, ...args].join(' ')}`,
);

const child = spawn(command, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal != null) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
