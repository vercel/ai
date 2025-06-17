import { describe, it } from 'vitest';
import transformer from '../codemods/replace-textdelta-with-text';
import { testTransform } from './test-utils';

describe('replace-textdelta-with-text', () => {
  it('transforms delta.textDelta to delta.text and text-delta case to text case', () => {
    testTransform(transformer, 'replace-textdelta-with-text');
  });
}); 