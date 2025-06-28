import { describe, it } from 'vitest';
import transformer from '../codemods/replace-usage-token-properties';
import { testTransform } from './test-utils';

describe('replace-usage-token-properties', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-usage-token-properties');
  });
});
