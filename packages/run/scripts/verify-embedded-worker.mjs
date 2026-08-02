import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workerSourcePath = join(packageRoot, 'dist/runtime/worker-source.js');
const workerSource = await readFile(workerSourcePath, 'utf8');

if (
  workerSource.includes('inline worker source was not generated') ||
  workerSource.length < 500_000
) {
  throw new Error(
    'The run package contains the placeholder worker instead of the embedded runtime.',
  );
}
