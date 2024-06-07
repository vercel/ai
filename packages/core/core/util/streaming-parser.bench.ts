import * as fs from 'fs';
import path from 'path';
import { bench } from 'vitest';

import { StreamingParser } from 'fn-stream';

const packageJson = fs.readFileSync(
  path.join(__dirname, '../../package.json'),
  'utf8',
);

for (const tokens of [250, 500, 1000, 2000, 4000, packageJson.length]) {
  bench(`streaming parser - ${tokens} tokens`, () => {
    const parser = new StreamingParser({ stream: true });

    for (let i = 0; i < packageJson.length && i < tokens; i++) {
      parser.parseIncremental(packageJson[i]);
    }
  });
}
