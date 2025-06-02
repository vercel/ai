import { describe, it } from 'vitest';
import transformer from '../codemods/import-LanguageModelV2-from-provider-package';
import { testTransform } from './test-utils';

describe('import-LanguageModelV2-from-provider-package', () => {
  it('transforms package name correctly', () => {
    testTransform(transformer, 'import-LanguageModelV2-from-provider-package');
  });
  it('transforms import name correctly', () => {
    testTransform(
      transformer,
      'import-LanguageModelV2-from-provider-package-v1',
    );
  });
  it('does not transform non ai package imports', () => {
    testTransform(
      transformer,
      'import-LanguageModelV2-from-provider-package-not-ai',
    );
  });
});
