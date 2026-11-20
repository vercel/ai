import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pack } from './pack.mjs';
import { vercelContext } from './shared.mjs';
import { assemble } from './site.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));
const input = join(directory, 'packed');
const output = join(directory, 'dist');
const c = vercelContext();
await rm(input, { recursive: true, force: true });
await rm(output, { recursive: true, force: true });
try {
  await pack(root, input, c);
  await assemble(input, output, c);
} finally {
  await rm(input, { recursive: true, force: true });
}
