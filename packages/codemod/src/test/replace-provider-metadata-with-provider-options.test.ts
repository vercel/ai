import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/replace-provider-metadata-with-provider-options';

describe('replace-provider-metadata-with-provider-options', () => {
  it('transforms providerMetadata to providerOptions', () => {
    testTransform(
      transformer,
      'replace-provider-metadata-with-provider-options',
    );
  });
});
