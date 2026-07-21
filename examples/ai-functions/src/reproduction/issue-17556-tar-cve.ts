import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const lockfilePath = resolve(process.cwd(), '../../pnpm-lock.yaml');
  const lockfile = await readFile(lockfilePath, 'utf8');

  if (!lockfile.includes('\n  tar@7.5.15:\n')) {
    console.log(
      'CVE-2026-59873 not reproduced: pnpm-lock.yaml does not resolve tar@7.5.15.',
    );
    return;
  }

  console.error(
    'CVE-2026-59873 reproduced: pnpm-lock.yaml resolves vulnerable tar@7.5.15 (<7.5.19).',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
