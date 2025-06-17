import { join } from 'path';
import { readFileSync } from 'fs';
import jscodeshift from 'jscodeshift';
import transform from '../codemods/replace-image-type-with-file-type';

function trim(str: string) {
  return str.replace(/^\s+|\s+$/, '');
}

describe('replace-image-type-with-file-type', () => {
  it('transforms type: image to type: file in message content arrays', () => {
    const input = readFileSync(
      join(__dirname, '__testfixtures__/replace-image-type-with-file-type.input.ts'),
      'utf8',
    );
    const expected = readFileSync(
      join(__dirname, '__testfixtures__/replace-image-type-with-file-type.output.ts'),
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