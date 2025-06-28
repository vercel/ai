import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/restructure-source-stream-parts';

describe('restructure-source-stream-parts', () => {
  it('transforms nested source stream parts to flat structure', () => {
    testTransform(transformer, 'restructure-source-stream-parts');
  });
});
