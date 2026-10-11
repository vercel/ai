import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v7/replace-reasoning-tokens';
import { applyTransform, testTransform } from './test-utils';

describe('replace-reasoning-tokens', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-reasoning-tokens');
  });

  it('preserves executable migrated accesses on repeated runs', () => {
    const once = applyTransform(transformer, 'usage.reasoningTokens');
    const twice = applyTransform(transformer, once);

    expect(once).toBe('usage.outputTokenDetails.reasoningTokens');
    expect(twice).toBe(once);
    expect(
      runInNewContext(twice, {
        usage: { outputTokenDetails: { reasoningTokens: 7 } },
      }),
    ).toBe(7);
  });
});
