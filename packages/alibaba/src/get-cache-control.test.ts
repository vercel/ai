import { describe, it, expect } from 'vitest';
import { CacheControlValidator } from './get-cache-control';

describe('CacheControlValidator', () => {
  it('should extract cacheControl from providerMetadata', () => {
    const validator = new CacheControlValidator();

    const result = validator.getCacheControl({
      alibaba: {
        cacheControl: { type: 'ephemeral' },
      },
    });

    expect(result).toEqual({ type: 'ephemeral' });
  });

  it('should warn and return undefined when exceeding 4 cache breakpoints', () => {
    const validator = new CacheControlValidator();

    // Add 4 valid breakpoints
    for (let i = 0; i < 4; i++) {
      validator.getCacheControl({
        alibaba: { cacheControl: { type: 'ephemeral' } },
      });
    }

    // 5th breakpoint should be rejected
    const result = validator.getCacheControl({
      alibaba: { cacheControl: { type: 'ephemeral' } },
    });

    expect(result).toBeUndefined();
    expect(validator.getWarnings()).toHaveLength(1);
    expect(validator.getWarnings()[0]).toMatchInlineSnapshot(`
      {
        "details": "Maximum 4 cache breakpoints exceeded (found 5). This breakpoint will be ignored.",
        "feature": "cacheControl breakpoint limit",
        "type": "unsupported",
      }
    `);
  });

  it('should return undefined when no cache control is present', () => {
    const validator = new CacheControlValidator();

    const result = validator.getCacheControl({
      alibaba: {},
    });

    expect(result).toBeUndefined();
  });
});
