import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CodeModeAbortedError,
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from '../dist/index.js';
import { deferred, emptyMessages } from './helpers.js';

setMaxWorkers(32);

describe('worker concurrency', () => {
  it('does not let one suspended worker block unrelated workers', async () => {
    let releaseSlow!: () => void;
    const slowStarted = deferred<void>();

    const tools = {
      slow: tool({
        inputSchema: z.object({}),
        execute: async () => {
          slowStarted.resolve();
          await new Promise<void>(resolve => {
            releaseSlow = resolve;
          });
          return { done: true };
        },
      }),
      fast: tool({
        inputSchema: z.object({ id: z.number() }),
        execute: async ({ id }) => ({ id }),
      }),
    };

    const slowRun = runCodeMode({
      js: 'return await tools.slow({});',
      tools,
    });
    await slowStarted.promise;

    const fastRuns = await Promise.all(
      Array.from({ length: 5 }, (_value, id) =>
        runCodeMode({
          js: `return await tools.fast({ id: ${id} });`,
          tools,
        }),
      ),
    );

    expect(fastRuns).toEqual([0, 1, 2, 3, 4].map(id => ({ id })));
    releaseSlow();
    await expect(slowRun).resolves.toEqual({ done: true });
  });

  it('keeps concurrent worker globals isolated while both are suspended', async () => {
    const releases = new Map<string, () => void>();
    const started = new Set<string>();
    const bothStarted = deferred<void>();

    const tools = {
      pause: tool({
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

    const first = runCodeMode({
      js: "globalThis.marker = 'first'; await tools.pause({ id: 'first' }); return globalThis.marker;",
      tools,
    });
    const second = runCodeMode({
      js: "globalThis.marker = 'second'; await tools.pause({ id: 'second' }); return globalThis.marker;",
      tools,
    });

    await bothStarted.promise;
    releases.get('second')?.();
    await expect(second).resolves.toBe('second');
    releases.get('first')?.();
    await expect(first).resolves.toBe('first');
  });

  it('aborting one worker does not abort another worker', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const tools = {
      wait: tool({
        inputSchema: z.object({}),
        execute: async (_input, { abortSignal }) => {
          started.resolve();
          await new Promise((_resolve, reject) => {
            abortSignal?.addEventListener('abort', () =>
              reject(new Error('nested abort observed')),
            );
          });
        },
      }),
    };

    const aborting = runCodeMode({
      js: 'return await tools.wait({});',
      tools,
      toolExecutionOptions: {
        toolCallId: 'outer',
        messages: emptyMessages,
        abortSignal: controller.signal,
      },
    });
    await started.promise;

    const unaffected = runCodeMode({
      js: "return 'still works';",
      tools,
    });

    controller.abort();
    await expect(aborting).rejects.toBeInstanceOf(CodeModeAbortedError);
    await expect(unaffected).resolves.toBe('still works');
  });
});
