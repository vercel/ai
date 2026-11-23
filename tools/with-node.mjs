#!/usr/bin/env node
// Runs a command with a specific Node.js major version first on PATH.
//
// Usage: node tools/with-node.mjs <major> <command> [...args]
//
// Vercel CI runs every task on one Node.js version. The `test:node22` and
// `test:node26` tasks use this script to run a package's tests on other
// versions. pnpm downloads the requested Node.js runtime on first use.

import { execFileSync, spawn } from 'node:child_process';
import { delimiter } from 'node:path';

const [major, command, ...args] = process.argv.slice(2);

if (!/^\d+$/.test(major ?? '') || command == null) {
  console.error('Usage: node tools/with-node.mjs <major> <command> [...args]');
  process.exit(1);
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const nodeBinDir = execFileSync(
  pnpm,
  [
    'dlx',
    `node@runtime:${major}`,
    '-p',
    'require("node:path").dirname(process.execPath)',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
)
  .trim()
  .split('\n')
  .at(-1);

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

console.log(`Running with Node.js ${version}: ${[command, ...args].join(' ')}`);

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
