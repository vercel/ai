import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['tsx', 'reproductions/reproduce-14442.ts'], {
  cwd: 'packages/ai',
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
