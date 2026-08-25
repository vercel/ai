import { describe, expect, it } from 'vitest';
import { resolveInputTokenUsage } from './resolve-input-token-usage';

describe('resolveInputTokenUsage', () => {
  describe('cache-inclusive providers (cached <= reported)', () => {
    it('subtracts the cache breakdown from the reported total', () => {
      expect(
        resolveInputTokenUsage({
          reportedInputTokens: 1000,
          cachedTokens: 900,
        }),
      ).toEqual({ total: 1000, noCache: 100 });
    });

    it('treats a fully cached prompt as zero uncached tokens', () => {
      expect(
        resolveInputTokenUsage({
          reportedInputTokens: 1000,
          cachedTokens: 1000,
        }),
      ).toEqual({ total: 1000, noCache: 0 });
    });

    it('passes the reported total through when nothing was cached', () => {
      expect(
        resolveInputTokenUsage({ reportedInputTokens: 1000, cachedTokens: 0 }),
      ).toEqual({ total: 1000, noCache: 1000 });
    });
  });

  describe('cache-exclusive providers (cached > reported)', () => {
    it('treats the reported count as uncached and sums for the total', () => {
      expect(
        resolveInputTokenUsage({
          reportedInputTokens: 12,
          cachedTokens: 4100,
        }),
      ).toEqual({ total: 4112, noCache: 12 });
    });

    it('never returns a negative noCache, the regression this guards', () => {
      const { noCache } = resolveInputTokenUsage({
        reportedInputTokens: 100,
        cachedTokens: 5000,
      });

      expect(noCache).toBe(100);
      expect(noCache).toBeGreaterThanOrEqual(0);
    });

    it('handles a zero reported count against a non-zero cache', () => {
      expect(
        resolveInputTokenUsage({ reportedInputTokens: 0, cachedTokens: 500 }),
      ).toEqual({ total: 500, noCache: 0 });
    });
  });

  describe('malformed provider input', () => {
    it('clamps a negative reported count rather than propagating it', () => {
      expect(
        resolveInputTokenUsage({ reportedInputTokens: -5, cachedTokens: 0 }),
      ).toEqual({ total: 0, noCache: 0 });
    });

    it('clamps a negative cache breakdown', () => {
      expect(
        resolveInputTokenUsage({ reportedInputTokens: 100, cachedTokens: -5 }),
      ).toEqual({ total: 100, noCache: 100 });
    });
  });

  it('keeps the cache breakdown a partition of the total', () => {
    // `total` is the authoritative input-token count and noCache/cacheRead/
    // cacheWrite are its breakdown, so they must sum back to it. The bug this
    // guards produced noCache < 0 and cacheRead > total, violating both halves.
    for (const reportedInputTokens of [0, 1, 12, 100, 1000, 5000]) {
      for (const cachedTokens of [0, 1, 50, 900, 4100, 1_000_000]) {
        const { total, noCache } = resolveInputTokenUsage({
          reportedInputTokens,
          cachedTokens,
        });

        expect(noCache + cachedTokens).toBe(total);
        expect(noCache).toBeGreaterThanOrEqual(0);
        expect(total).toBeGreaterThanOrEqual(cachedTokens);
      }
    }
  });

  it('always returns non-negative counts, even for malformed input', () => {
    const cases = [
      { reportedInputTokens: 0, cachedTokens: 0 },
      { reportedInputTokens: 1, cachedTokens: 1_000_000 },
      { reportedInputTokens: 1_000_000, cachedTokens: 1 },
      { reportedInputTokens: -100, cachedTokens: -100 },
    ];

    for (const input of cases) {
      const { total, noCache } = resolveInputTokenUsage(input);

      expect(total).toBeGreaterThanOrEqual(0);
      expect(noCache).toBeGreaterThanOrEqual(0);
      expect(noCache).toBeLessThanOrEqual(total);
    }
  });
});
