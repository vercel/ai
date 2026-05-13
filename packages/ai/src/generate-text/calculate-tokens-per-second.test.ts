import { describe, expect, it } from 'vitest';
import { calculateTokensPerSecond } from './calculate-tokens-per-second';

describe('calculateTokensPerSecond', () => {
  it('should calculate average output tokens per second', () => {
    expect(
      calculateTokensPerSecond({
        outputTokens: 10,
        responseTimeMs: 500,
      }),
    ).toBe(20);
  });

  it('should return 0 when output token count is unknown', () => {
    expect(
      calculateTokensPerSecond({
        outputTokens: undefined,
        responseTimeMs: 500,
      }),
    ).toBe(0);
  });

  it('should return 0 when response time is 0', () => {
    expect(
      calculateTokensPerSecond({
        outputTokens: 10,
        responseTimeMs: 0,
      }),
    ).toBe(0);
  });

  it('should return 0 when response time is 0 and output tokens are unknown', () => {
    expect(
      calculateTokensPerSecond({
        outputTokens: undefined,
        responseTimeMs: 0,
      }),
    ).toBe(0);
  });

  it('should return 0 when computed tokens per second is not JSON-serializable', () => {
    expect(
      calculateTokensPerSecond({
        outputTokens: Number.POSITIVE_INFINITY,
        responseTimeMs: 500,
      }),
    ).toBe(0);

    expect(
      calculateTokensPerSecond({
        outputTokens: Number.NaN,
        responseTimeMs: 500,
      }),
    ).toBe(0);
  });
});
