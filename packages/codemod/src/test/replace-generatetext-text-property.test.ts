import { describe, it } from 'vitest';
import transformer from '../codemods/v5/replace-generatetext-text-property';
import { testTransform } from './test-utils';

describe('replace-generatetext-text-property', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-generatetext-text-property');
  });
});
