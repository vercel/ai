import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/v5/replace-generatetext-text-property';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('donot-replace-other-text-property', () => {
  it('dont transforms result.text to result.text.text for variables that are not from generateText', () => {
    const input = readFileSync(
      join(
        __dirname,
        '__testfixtures__/replace-generatetext-text-property.extra.input.ts',
      ),
      'utf8',
    );
    const expected = readFileSync(
      join(
        __dirname,
        '__testfixtures__/replace-generatetext-text-property.extra.output.ts',
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
