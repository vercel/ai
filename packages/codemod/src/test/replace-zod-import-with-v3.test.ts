import { describe, it } from 'vitest';
import transformer from '../codemods/v5/replace-zod-import-with-v3';
import { testTransform } from './test-utils';

describe('replace-zod-import-with-v3', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-zod-import-with-v3');
  });
});
