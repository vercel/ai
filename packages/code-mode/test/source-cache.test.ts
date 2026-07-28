import { beforeEach, describe, expect, it } from 'vitest';
import {
  CodeModeSourceTooLargeError,
  experimental_runCodeMode as runCodeMode,
} from '../dist/index.js';
import {
  clearTransformedSourceCache,
  getTransformedSourceCacheStats,
  transformSource,
} from '../dist/source-cache.js';

describe('source limits and transform cache', () => {
  beforeEach(() => {
    clearTransformedSourceCache();
  });

  it('rejects oversized source before sandbox execution', async () => {
    await expect(
      runCodeMode({
        js: "return 'too large';",
        tools: {},
        options: { executionPolicy: { maxSourceBytes: 8 } },
      }),
    ).rejects.toBeInstanceOf(CodeModeSourceTooLargeError);
  });

  it('rejects oversized source before type stripping', async () => {
    await expect(
      runCodeMode({
        js: 'const value = 1; return value;',
        tools: {},
        options: { executionPolicy: { maxSourceBytes: 8 } },
      }),
    ).rejects.toBeInstanceOf(CodeModeSourceTooLargeError);
  });

  it('allows source exactly at the byte limit', async () => {
    const js = 'return 1;';
    const maxSourceBytes = new TextEncoder().encode(js).byteLength;

    await expect(
      runCodeMode({
        js,
        tools: {},
        options: { executionPolicy: { maxSourceBytes } },
      }),
    ).resolves.toBe(1);
  });

  it('does not cache transformed sources above the per-entry byte limit', () => {
    const largeSource = `const value = ${JSON.stringify('x'.repeat(70_000))}; return value.length;`;

    transformSource(largeSource);

    expect(getTransformedSourceCacheStats().entries).toBe(0);
  });

  it('evicts transformed source cache entries by total byte size', () => {
    for (let index = 0; index < 90; index++) {
      transformSource(
        `const value = ${JSON.stringify(`${index}:${'x'.repeat(60_000)}`)}; return value.length;`,
      );
    }

    const stats = getTransformedSourceCacheStats();
    expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes);
    expect(stats.entries).toBeLessThan(90);
  });
});
