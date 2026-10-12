import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v7/replace-anthropic-cache-creation-input-tokens';
import { applyTransform, testTransform } from './test-utils';

describe('replace-anthropic-cache-creation-input-tokens', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-anthropic-cache-creation-input-tokens');
  });

  it('preserves optional access behavior', () => {
    const transformed = applyTransform(
      transformer,
      'return result?.providerMetadata?.anthropic?.cacheCreationInputTokens;',
    );
    const readCacheWriteTokens = new Function('result', transformed);

    expect(readCacheWriteTokens(undefined)).toBeUndefined();
    expect(readCacheWriteTokens(null)).toBeUndefined();
    expect(readCacheWriteTokens({})).toBeUndefined();
    expect(
      readCacheWriteTokens({
        usage: { inputTokenDetails: { cacheWriteTokens: 7 } },
      }),
    ).toBe(7);
  });
});
