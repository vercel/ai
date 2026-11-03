import { describe, it } from 'vitest';
import transformer from '../codemods/v7/rename-google-generative-ai-to-google';
import { testTransform } from './test-utils';

describe('rename-google-generative-ai-to-google', () => {
  it('renames imported bindings while preserving explicit aliases', () => {
    testTransform(transformer, 'rename-google-generative-ai-to-google');
  });

  it('preserves provider wrappers and their explicitly aliased imports', () => {
    testTransform(transformer, 'rename-google-generative-ai-to-google-wrapper');
  });

  it('preserves bindings, exports and property names while migrating provider types', () => {
    testTransform(
      transformer,
      'rename-google-generative-ai-to-google-bindings',
    );
  });
});
