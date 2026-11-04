import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v7/rename-google-generative-ai-to-google';
import { applyTransform, readFixture, testTransform } from './test-utils';

describe('rename-google-generative-ai-to-google', () => {
  it('preserves comments on migrated specifiers', () => {
    const result = applyTransform(
      transformer,
      "import { /* Keep this binding name. */ createGoogleGenerativeAI } from '@ai-sdk/google';",
    );
    expect(result).toContain('/* Keep this binding name. */');
    expect(result).toContain('createGoogle as createGoogleGenerativeAI');
  });

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
  it.each(['', '-wrapper', '-bindings'])(
    'is idempotent for the %s fixture',
    suffix => {
      const { content } = readFixture(
        `rename-google-generative-ai-to-google${suffix}`,
        'output',
      );
      expect(applyTransform(transformer, content)).toBe(content);
    },
  );
});
