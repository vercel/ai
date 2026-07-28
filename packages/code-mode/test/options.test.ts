import { describe, expect, it } from 'vitest';
import { runCodeMode, setMaxWorkers } from '../dist/index.js';

describe('options validation', () => {
  it.each([
    ['timeoutMs', 0],
    ['memoryLimitBytes', -1],
    ['maxStackSizeBytes', 1.5],
    ['maxResultBytes', Number.NaN],
    ['maxSourceBytes', 0],
    ['maxToolInputBytes', 0],
    ['maxToolOutputBytes', 0],
    ['maxBridgeRequests', 0],
    ['maxInFlightBridgeRequests', 0],
  ] as const)(
    'rejects invalid positive integer option %s',
    async (name, value) => {
      await expect(
        runCodeMode({
          js: "return 'unused';",
          tools: {},
          options: { executionPolicy: { [name]: value } },
        }),
      ).rejects.toThrow(
        new RegExp(`executionPolicy\\.${name} must be a positive integer`),
      );
    },
  );

  it('rejects invalid maxWorkers values', () => {
    expect(() => setMaxWorkers(0)).toThrow(
      /maxWorkers must be a positive integer/,
    );
    expect(() => setMaxWorkers(1.5)).toThrow(
      /maxWorkers must be a positive integer/,
    );
  });

  it('rejects an invalid fetch response size limit', async () => {
    await expect(
      runCodeMode({
        js: "return 'unused';",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('unused'),
            allowedOrigins: ['https://example.test'],
            maxResponseBytes: 0,
          },
        },
      }),
    ).rejects.toThrow(
      /fetchPolicy\.maxResponseBytes must be a positive integer/,
    );
  });

  it('rejects an invalid fetch redirect limit', async () => {
    await expect(
      runCodeMode({
        js: "return 'unused';",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('unused'),
            allowedOrigins: ['https://example.test'],
            maxRedirects: 0,
          },
        },
      }),
    ).rejects.toThrow(/fetchPolicy\.maxRedirects must be a positive integer/);
  });

  it('keeps fetch disabled when fetchPolicy is explicitly false', async () => {
    await expect(
      runCodeMode({
        js: 'return typeof fetch;',
        tools: {},
        options: {
          fetchPolicy: false,
        },
      }),
    ).resolves.toBe('undefined');
  });
});
