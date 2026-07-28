import { AsyncLocalStorage } from 'node:async_hooks';
import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { experimental_runCodeMode as runCodeMode } from '../dist/index.js';

// Workers are pooled and reused across invocations. A worker's `message` event
// fires under the async context in which its MessagePort was created — i.e. the
// invocation that first created the worker. These tests assert that host-side
// callbacks dispatched from the bridge (tool `execute`, `needsApproval`, and
// lifecycle hooks) still observe the *current* invocation's AsyncLocalStorage,
// not the context of whichever invocation happened to create the pooled worker.
describe('async context preservation across the worker bridge', () => {
  it("runs tool execute under the invocation's context when the pooled worker is reused", async () => {
    const als = new AsyncLocalStorage<{ id: string }>();
    const observed: string[] = [];

    const tools = {
      whoami: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const id = als.getStore()?.id ?? '<none>';
          observed.push(id);
          return { id };
        },
      }),
    };

    const run = (id: string) =>
      als.run({ id }, () =>
        runCodeMode({ js: 'return await tools.whoami({});', tools }),
      );

    // First invocation creates and pools the worker under "first".
    await expect(run('first')).resolves.toEqual({ id: 'first' });
    // Second invocation reuses that pooled worker but must observe "second".
    await expect(run('second')).resolves.toEqual({ id: 'second' });

    expect(observed).toEqual(['first', 'second']);
  });

  it("runs needsApproval under the invocation's context when the pooled worker is reused", async () => {
    const als = new AsyncLocalStorage<{ id: string }>();
    const observed: string[] = [];

    const tools = {
      guarded: tool({
        inputSchema: z.object({}),
        needsApproval: async () => {
          observed.push(als.getStore()?.id ?? '<none>');
          return false;
        },
        execute: async () => ({ ok: true }),
      }),
    };

    const run = (id: string) =>
      als.run({ id }, () =>
        runCodeMode({ js: 'return await tools.guarded({});', tools }),
      );

    await run('first');
    await run('second');

    expect(observed).toEqual(['first', 'second']);
  });

  it("runs lifecycle hooks under the invocation's context when the pooled worker is reused", async () => {
    const als = new AsyncLocalStorage<{ id: string }>();
    const observed: string[] = [];

    const tools = {
      noop: tool({
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    };

    const run = (id: string) =>
      als.run({ id }, () =>
        runCodeMode({
          js: 'return await tools.noop({});',
          tools,
          options: {
            lifecycle: {
              onNestedToolResult: () => {
                observed.push(als.getStore()?.id ?? '<none>');
              },
            },
          },
        }),
      );

    await run('first');
    await run('second');

    expect(observed).toEqual(['first', 'second']);
  });
});
