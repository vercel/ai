import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/flatten-streamtext-file-properties';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('flatten-streamtext-file-properties', () => {
  it('transforms delta.file.mediaType and delta.file.data to delta.mediaType and delta.data', () => {
    const input = readFileSync(
      join(
        __dirname,
        '__testfixtures__/flatten-streamtext-file-properties.input.ts',
      ),
      'utf8',
    );
    const expected = readFileSync(
      join(
        __dirname,
        '__testfixtures__/flatten-streamtext-file-properties.output.ts',
      ),
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
