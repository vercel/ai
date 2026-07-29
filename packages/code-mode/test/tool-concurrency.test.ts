import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { experimental_runCodeMode as runCodeMode } from '../dist/index.js';
import { deferred } from './helpers.js';

describe('tool concurrency inside a worker', () => {
  it('supports Promise.all over multiple host tool calls in one sandbox', async () => {
    const releases = new Map<string, () => void>();
    const started = new Set<string>();
    const bothStarted = deferred<void>();

    const tools = {
      wait: tool({
        inputSchema: z.object({ id: z.string() }),
        execute: async ({ id }) => {
          started.add(id);
          if (started.size === 2) {
            bothStarted.resolve();
          }
          await new Promise<void>(resolve => releases.set(id, resolve));
          return { id };
        },
      }),
    };

    const run = runCodeMode({
      js: `
        const [a, b] = await Promise.all([
          tools.wait({ id: 'a' }),
          tools.wait({ id: 'b' })
        ]);
        return [a, b];
      `,
      tools,
    });

    await bothStarted.promise;
    releases.get('b')?.();
    releases.get('a')?.();
    await expect(run).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('assigns unique nested tool call IDs to parallel calls', async () => {
    const toolCallIds: string[] = [];

    const tools = {
      id: tool({
        inputSchema: z.object({ n: z.number() }),
        execute: async ({ n }, { toolCallId }) => {
          toolCallIds.push(toolCallId);
          return { n, toolCallId };
        },
      }),
    };

    const result = await runCodeMode({
      js: `
        return await Promise.all([
          tools.id({ n: 1 }),
          tools.id({ n: 2 }),
          tools.id({ n: 3 })
        ]);
      `,
      tools,
      toolExecutionOptions: { toolCallId: 'outer', messages: [] },
    });

    expect(result).toEqual([
      { n: 1, toolCallId: 'outer:tool-1' },
      { n: 2, toolCallId: 'outer:tool-2' },
      { n: 3, toolCallId: 'outer:tool-3' },
    ]);
    expect(new Set(toolCallIds).size).toBe(3);
  });

  it('rejects promptly when one parallel tool call fails', async () => {
    const slowStarted = deferred<void>();
    const tools = {
      fail: tool({
        inputSchema: z.object({}),
        execute: async (): Promise<unknown> => {
          throw new Error('parallel failure');
        },
      }),
      slow: tool({
        inputSchema: z.object({}),
        execute: async (_input, { abortSignal }) => {
          slowStarted.resolve();
          await new Promise((_resolve, reject) => {
            abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('slow call aborted')),
              { once: true },
            );
          });
        },
      }),
    };

    const run = runCodeMode({
      js: `
        return await Promise.all([
          tools.slow({}),
          tools.fail({})
        ]);
      `,
      tools,
      options: { executionPolicy: { timeoutMs: 2_000 } },
    });
    const rejection = expect(run).rejects.toThrow('Host tool failed.');

    await slowStarted.promise;
    await rejection;
  });

  it('executes many parallel tool calls without dropping responses', async () => {
    const execute = vi.fn(async ({ n }: { n: number }) => ({
      n,
      square: n * n,
    }));
    const tools = {
      square: tool({
        inputSchema: z.object({ n: z.number() }),
        execute,
      }),
    };

    const result = await runCodeMode({
      js: `
        const inputs = Array.from({ length: 12 }, (_, n) => n);
        return await Promise.all(inputs.map((n) => tools.square({ n })));
      `,
      tools,
    });

    expect(result).toEqual(
      Array.from({ length: 12 }, (_value, n) => ({ n, square: n * n })),
    );
    expect(execute).toHaveBeenCalledTimes(12);
  });
});
