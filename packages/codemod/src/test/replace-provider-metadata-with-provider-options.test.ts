import { describe, it } from 'vitest';
import transformer from '../codemods/v5/replace-provider-metadata-with-provider-options';
import { testTransform } from './test-utils';

describe('replace-provider-metadata-with-provider-options', () => {
  it('renames request options while preserving returned metadata', () => {
    testTransform(
      transformer,
      'replace-provider-metadata-with-provider-options',
    );
  });
});
