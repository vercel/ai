import * as fs from 'fs';
import path from 'path';
import { bench } from 'vitest';

import { StreamingParser } from 'fn-stream';
import { parsePartialJson } from '@ai-sdk/ui-utils';

const packageJson = fs.readFileSync(
  path.join(__dirname, '../../package.json'),
  'utf8',
);
const tokens = packageJson.length;

bench(`parsePartialJson - ${tokens} tokens`, () => {
  for (let i = 1; i <= packageJson.length && i <= tokens; i++) {
    parsePartialJson(packageJson.slice(0, i));
  }
});

bench(`streaming parser - ${tokens} tokens`, () => {
  const parser = new StreamingParser({ stream: true });

  for (let i = 0; i < packageJson.length && i < tokens; i++) {
    parser.parseIncremental(packageJson[i]);
  }
});
