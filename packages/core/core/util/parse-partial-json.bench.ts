import * as fs from 'fs';
import path from 'path';
import { bench } from 'vitest';

import { parsePartialJson } from '@ai-sdk/ui-utils';

const packageJson = fs.readFileSync(
  path.join(__dirname, '../../package.json'),
  'utf8',
);

for (const tokens of [250, 500, 1000, 2000, 4000, packageJson.length]) {
  bench(`parsePartialJson - ${tokens} tokens`, () => {
    for (let i = 1; i <= packageJson.length && i <= tokens; i++) {
      parsePartialJson(packageJson.slice(0, i));
    }
  });
}
