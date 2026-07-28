import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  CodeModeBridgeLimitError,
  CodeModeDetachedBridgeRequestError,
  runCodeMode,
} from '../dist/index.js';
import { deferred, delay, withTimeout } from './helpers.js';

describe('bridge request lifecycle', () => {
  it('rejects unawaited tool calls without starting host work', async () => {
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      runCodeMode({
        js: "tools.expensive({}); return 'done';",
        tools: {
          expensive: tool({
            inputSchema: z.object({}),
            execute,
          }),
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeDetachedBridgeRequestError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not expose the raw tool bridge global to sandbox code', async () => {
    const execute = vi.fn(async () => ({ ok: true }));

    await expect(
      runCodeMode({
        js: `
          let message = "";
          try {
            await globalThis.__codeModeInvokeTool("expensive", "{}");
          } catch (error) {
            message = error.message;
          }
          return {
            identifierType: typeof __codeModeInvokeTool,
            type: typeof globalThis.__codeModeInvokeTool,
            message
          };
        `,
        tools: {
          expensive: tool({
            inputSchema: z.object({}),
            execute,
          }),
        },
      }),
    ).resolves.toEqual({
      identifierType: 'undefined',
      type: 'undefined',
      message: 'not a function',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects unawaited fetch calls without calling host fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));

    await expect(
      runCodeMode({
        js: "fetch('https://api.example.test/data'); return 'done';",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toBeInstanceOf(CodeModeDetachedBridgeRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose the raw fetch bridge global to sandbox code', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));

    await expect(
      runCodeMode({
        js: `
          let message = "";
          try {
            await globalThis.__codeModeFetch(JSON.stringify({
              url: "https://api.example.test/data"
            }));
          } catch (error) {
            message = error.message;
          }
          return {
            identifierType: typeof __codeModeFetch,
            type: typeof globalThis.__codeModeFetch,
            message
          };
        `,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).resolves.toEqual({
      identifierType: 'undefined',
      type: 'undefined',
      message: 'not a function',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts observed detached tool calls', async () => {
    const started = deferred<void>();
    const abortObserved = deferred<void>();
    const releaseAbort = deferred<void>();
    const toolSettled = deferred<void>();

    const tools = {
      wait: tool({
        inputSchema: z.object({}),
        execute: async (_input, { abortSignal }) => {
          started.resolve();
          await new Promise((_resolve, reject) => {
            abortSignal?.addEventListener(
              'abort',
              () => {
                abortObserved.resolve();
                void releaseAbort.promise.then(() => {
                  toolSettled.resolve();
                  reject(new Error('detached tool aborted'));
                });
              },
              { once: true },
            );
          });
        },
      }),
    };

    const run = runCodeMode({
      js: "tools.wait({}).then(() => undefined); return 'done';",
      tools,
    });
    const rejection = expect(run).rejects.toBeInstanceOf(
      CodeModeDetachedBridgeRequestError,
    );

    await withTimeout(started.promise, 1_000);
    await withTimeout(abortObserved.promise, 1_000);
    await rejection;

    releaseAbort.resolve();
    await withTimeout(toolSettled.promise, 1_000);
    await delay(0);

    await expect(
      runCodeMode({
        js: "return 'slot free';",
        tools,
      }),
    ).resolves.toBe('slot free');
  });

  it('enforces maxBridgeRequests across sequential bridge calls', async () => {
    const execute = vi.fn(async ({ id }: { id: string }) => ({ id }));

    await expect(
      runCodeMode({
        js: `
          await tools.echo({ id: 'first' });
          return await tools.echo({ id: 'second' });
        `,
        tools: {
          echo: tool({
            inputSchema: z.object({ id: z.string() }),
            execute,
          }),
        },
        options: { executionPolicy: { maxBridgeRequests: 1 } },
      }),
    ).rejects.toBeInstanceOf(CodeModeBridgeLimitError);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('enforces maxInFlightBridgeRequests for parallel bridge calls', async () => {
    const started = deferred<void>();
    const aborted = deferred<void>();
    const execute = vi.fn(async (_input: { id: string }, { abortSignal }) => {
      started.resolve();
      await new Promise((_resolve, reject) => {
        abortSignal?.addEventListener(
          'abort',
          () => {
            aborted.resolve();
            reject(new Error('slow bridge aborted'));
          },
          { once: true },
        );
      });
    });

    const run = runCodeMode({
      js: `
        return await Promise.all([
          tools.wait({ id: 'a' }),
          tools.wait({ id: 'b' })
        ]);
      `,
      tools: {
        wait: tool({
          inputSchema: z.object({ id: z.string() }),
          execute,
        }),
      },
      options: { executionPolicy: { maxInFlightBridgeRequests: 1 } },
    });
    const rejection = expect(run).rejects.toBeInstanceOf(
      CodeModeBridgeLimitError,
    );

    await withTimeout(started.promise, 1_000);
    await rejection;
    await withTimeout(aborted.promise, 1_000);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
