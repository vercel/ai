import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function readTextFile(filePath: string): Promise<string> {
  return readFile(resolve(repoRoot, filePath), 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(resolve(repoRoot, filePath))).isFile();
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false;
    }
    throw error;
  }
}
