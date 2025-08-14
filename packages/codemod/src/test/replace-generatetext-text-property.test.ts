import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/v5/replace-generatetext-text-property';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('replace-generatetext-text-property', () => {
  it('transforms generateText result.text to result.text.text', () => {
    const input = readFileSync(
      join(
        __dirname,
        '__testfixtures__/replace-generatetext-text-property.input.ts',
      ),
      'utf8',
    );
    const expected = readFileSync(
      join(
        __dirname,
        '__testfixtures__/replace-generatetext-text-property.output.ts',
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
