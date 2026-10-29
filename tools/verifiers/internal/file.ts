import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function readTextFile(filePath: string): Promise<string> {
  return readFile(resolve(repoRoot, filePath), 'utf8');
}
