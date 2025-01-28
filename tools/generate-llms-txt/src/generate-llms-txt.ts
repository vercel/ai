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

const exclusionPrefixes = [
  'cookbook/20-rsc',
  'docs/01-introduction',
  'docs/02-foundations',
  'docs/02-guides',
  'docs/05-ai-sdk-rsc',
  'docs/07-reference/03-ai-sdk-rsc',
  'docs/07-reference/04-stream-helpers',
  'docs/08-migration-guides',
  'providers/03-community-providers',
  'providers/04-adapters',
  'providers/05-observability',
];

async function main() {
  try {
    const contentDir = join(process.cwd(), '../../content');
    const files = await getAllFiles(contentDir);

    const filteredFiles = files.filter(file => {
      for (const prefix of exclusionPrefixes) {
        if (file.includes(prefix)) {
          return false;
        }
      }
      return true;
    });

    let fullContent = '';
    for (const file of filteredFiles) {
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
