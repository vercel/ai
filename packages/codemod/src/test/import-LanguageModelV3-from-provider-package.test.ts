import { describe, it } from 'vitest';
import transformer from '../codemods/v5/import-LanguageModelV3-from-provider-package';
import { testTransform } from './test-utils';

describe('import-LanguageModelV3-from-provider-package', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'import-LanguageModelV3-from-provider-package');
  });
});
