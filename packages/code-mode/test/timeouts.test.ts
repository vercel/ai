import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runCodeMode } from '../dist/index.js';
import { deferred, withTimeout } from './helpers.js';

describe('timeouts and infinite loops', () => {
  it('terminates a direct infinite loop', async () => {
    await expect(
      runCodeMode({
        js: 'while (true) {}',
        tools: {},
        options: { executionPolicy: { timeoutMs: 150 } },
      }),
    ).rejects.toThrow(/timed out|interrupted/i);
  });

  it('terminates an infinite loop after a tool call resumes', async () => {
    await expect(
      runCodeMode({
        js: `
          await tools.ready({});
          for (;;) {}
        `,
        tools: {
          ready: tool({
            inputSchema: z.object({}),
            execute: async () => ({ ok: true }),
          }),
        },
        options: { executionPolicy: { timeoutMs: 200 } },
      }),
    ).rejects.toThrow(/timed out|interrupted/i);
  });

  it('terminates an infinite loop inside nested function calls', async () => {
    await expect(
      runCodeMode({
        js: `
          function spin() {
            return spin();
          }
          return spin();
        `,
        tools: {},
        options: {
          executionPolicy: { timeoutMs: 200, maxStackSizeBytes: 64 * 1024 },
        },
      }),
    ).rejects.toThrow(/stack|recursion|interrupted|timed out/i);
  });

  it('aborts a pending nested tool when the invocation times out', async () => {
    const started = deferred<void>();
    const aborted = deferred<void>();

    const run = runCodeMode({
      js: 'return await tools.wait({});',
      tools: {
        wait: tool({
          inputSchema: z.object({}),
          execute: async (_input, { abortSignal }) => {
            started.resolve();
            await new Promise((_resolve, reject) => {
              abortSignal?.addEventListener(
                'abort',
                () => {
                  aborted.resolve();
                  reject(new Error('tool observed timeout abort'));
                },
                { once: true },
              );
            });
          },
        }),
      },
      options: { executionPolicy: { timeoutMs: 1_000 } },
    });

    await withTimeout(started.promise, 2_000);
    await expect(run).rejects.toThrow(/timed out/i);
    await withTimeout(aborted.promise, 2_000);
  });

  it('continues to run later invocations after repeated infinite-loop timeouts', async () => {
    for (let index = 0; index < 3; index++) {
      await expect(
        runCodeMode({
          js: 'while (true) {}',
          tools: {},
          options: { executionPolicy: { timeoutMs: 120 } },
        }),
      ).rejects.toThrow(/timed out|interrupted/i);
    }

    await expect(
      runCodeMode({
        js: "return 'recovered';",
        tools: {},
      }),
    ).resolves.toBe('recovered');
  });
});
