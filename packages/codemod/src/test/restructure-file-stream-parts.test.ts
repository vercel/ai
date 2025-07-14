import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/restructure-file-stream-parts';

describe('restructure-file-stream-parts', () => {
  it('transforms file stream parts to nested structure', () => {
    testTransform(transformer, 'restructure-file-stream-parts');
  });
});
