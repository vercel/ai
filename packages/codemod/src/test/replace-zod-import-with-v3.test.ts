import { describe, it } from 'vitest';
import transformer from '../codemods/v5/replace-zod-import-with-v3';
import { testTransform } from './test-utils';

describe('replace-zod-import-with-v3', () => {
  it('transforms named imports correctly', () => {
    testTransform(transformer, 'replace-zod-import-with-v3');
  });

  it('transforms default imports correctly', () => {
    testTransform(transformer, 'replace-zod-import-with-v3-default');
  });

  it('aliases non-z default imports to the z export', () => {
    testTransform(transformer, 'replace-zod-import-with-v3-default-aliased');
  });
});
