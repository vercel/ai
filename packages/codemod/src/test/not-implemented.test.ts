import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/v5/not-implemented';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('not-implemented', () => {
  it('transforms Message and CreateMessage to UIMessage and CreateUIMessage', () => {
    const input = readFileSync(
      join(__dirname, '__testfixtures__/not-implemented.input.ts'),
      'utf8',
    );
    const expected = readFileSync(
      join(__dirname, '__testfixtures__/not-implemented.output.ts'),
      'utf8',
    );

    const j = jscodeshift.withParser('tsx');

    const result = transform(
      { source: input, path: 'test.ts' },
      {
        jscodeshift: j,
        j: j,
        stats: () => {},
        report: () => {},
      },
      {},
    );

    expect(trim(result || '')).toEqual(trim(expected));
  });
});
