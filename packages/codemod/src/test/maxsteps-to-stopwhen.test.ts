import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/v5/move-maxsteps-to-stopwhen';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('maxsteps-to-stopwhen', () => {
  it('transforms maxSteps to to stopWhen', () => {
    const input = readFileSync(
      join(__dirname, '__testfixtures__/maxsteps-to-stopwhen.input.ts'),
      'utf8',
    );
    const expected = readFileSync(
      join(__dirname, '__testfixtures__/maxsteps-to-stopwhen.output.ts'),
      'utf8',
    );

    const result = transform(
      { source: input, path: 'test.ts' },
      {
        jscodeshift,
        j: jscodeshift,
        stats: () => {},
        report: () => {},
      },
      {},
    );

    expect(trim(result || '')).toEqual(trim(expected));
  });
});
