#!/usr/bin/env tsx

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  try {
    const contentDir = join(process.cwd(), '../../content');
    const files = await getAllFiles(contentDir);

    let fullContent = '';
    for (const file of files) {
      const content = await readFile(file, 'utf-8');

      fullContent += content;
      fullContent += '\n\n';
    }

    console.log(`Length (chars        ): ${fullContent.length}`);
    console.log(`Length (approx tokens): ${fullContent.length / 4}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
