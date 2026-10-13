import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bundle } from '../lib/upgrade';

const codemodsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../codemods',
);

describe('upgrade bundle', () => {
  it('only registers available transforms', () => {
    const missingTransforms = bundle.filter(
      codemod => !existsSync(resolve(codemodsDirectory, `${codemod}.ts`)),
    );

    expect(missingTransforms).toEqual([]);
  });
});
