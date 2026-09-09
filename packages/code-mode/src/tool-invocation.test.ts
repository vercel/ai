import { generateText, tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import {
  DIRECT_TOOL_CALL,
  experimental_codeModeTool as codeModeTool,
  experimental_createCodeModeTool as createCodeModeTool,
  experimental_runCodeMode as runCodeMode,
} from '../dist/index.js';
import { deferred, emptyMessages } from './utils/test-helpers.js';

describe('AI SDK tool bridge', () => {
  it('exports a serializable direct tool call marker', () => {
    expect(DIRECT_TOOL_CALL).toBe('AI_SDK_DIRECT_TOOL_CALL');
    expect(JSON.stringify(DIRECT_TOOL_CALL)).toBe('"AI_SDK_DIRECT_TOOL_CALL"');
  });

  it('calls an AI SDK tool with validated input', async () => {
    const add = vi.fn(async ({ a, b }: { a: number; b: number }) => ({
      sum: a + b,
    }));

    await expect(
      runCodeMode({
        js: 'return await tools.add({ a: 1, b: 2 });',
        tools: {
          add: tool({
            inputSchema: z.object({ a: z.number(), b: z.number() }),
            execute: add,
          }),
        },
      }),
    ).resolves.toEqual({ sum: 3 });
    expect(add).toHaveBeenCalledOnce();
  });

  it('chains multiple tool calls', async () => {
    const tools = {
      add: tool({
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: async ({ a, b }) => ({ value: a + b }),
      }),
      double: tool({
        inputSchema: z.object({ value: z.number() }),
        execute: async ({ value }) => ({ value: value * 2 }),
      }),
    };

    await expect(
      runCodeMode({
        js: 'const first = await tools.add({ a: 2, b: 3 }); return await tools.double(first);',
        tools,
      }),
    ).resolves.toEqual({ value: 10 });
  });

  it('round-trips undefined tool outputs', async () => {
    await expect(
      runCodeMode({
        js: 'const value = await tools.nothing({}); return { type: typeof value };',
        tools: {
          nothing: tool({
            inputSchema: z.object({}),
            execute: async () => undefined,
          }),
        },
      }),
    ).resolves.toEqual({ type: 'undefined' });
  });

  it('uses the final output from async iterable tools', async () => {
    await expect(
      runCodeMode({
        js: 'return await tools.stream({});',
        tools: {
          stream: tool({
            inputSchema: z.object({}),
            execute: async function* () {
              yield { step: 1 };
              yield { step: 2 };
            },
          }),
        },
      }),
    ).resolves.toEqual({ step: 2 });
  });

  it('resets Date.now to host time after async tool calls', async () => {
    const result = await runCodeMode({
      js: `
        const before = Date.now();
        const toolResult = await tools.wait({});
        const after = Date.now();
        return { before, hostNow: toolResult.hostNow, after };
      `,
      tools: {
        wait: tool({
          inputSchema: z.object({}),
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 80));
            return { hostNow: Date.now() };
          },
        }),
      },
    });

    expect(result).toEqual({
      before: expect.any(Number),
      hostNow: expect.any(Number),
      after: expect.any(Number),
    });
    const times = result as { before: number; hostNow: number; after: number };
    expect(times.after - times.before).toBeGreaterThanOrEqual(30);
    expect(Math.abs(times.after - times.hostNow)).toBeLessThan(1_000);
  });

  it('forwards context to nested tools', async () => {
    const seenContexts: unknown[] = [];

    await expect(
      runCodeMode({
        js: 'return await tools.context({});',
        tools: {
          context: tool({
            inputSchema: z.object({}),
            execute: async (_input, { context }) => {
              seenContexts.push(context);
              return context;
            },
          }),
        },
        toolExecutionOptions: {
          toolCallId: 'outer',
          messages: emptyMessages,
          context: { requestId: 'req-1' },
        },
      }),
    ).resolves.toEqual({ requestId: 'req-1' });

    expect(seenContexts).toEqual([{ requestId: 'req-1' }]);
  });

  it('passes abort signals to nested tools', async () => {
    const controller = new AbortController();
    const started = deferred<void>();

    const run = runCodeMode({
      js: 'return await tools.wait({});',
      tools: {
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
      },
      toolExecutionOptions: {
        toolCallId: 'outer',
        messages: emptyMessages,
        abortSignal: controller.signal,
      },
    });

    await started.promise;
    controller.abort();
    await expect(run).rejects.toThrow(/aborted|nested abort observed/i);
  });

  it('returns an AI SDK tool that executes code mode', async () => {
    const codeMode = createCodeModeTool({
      add: tool({
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: async ({ a, b }) => ({ sum: a + b }),
      }),
    });

    await expect(
      codeMode.execute?.(
        { js: 'return await tools.add({ a: 4, b: 6 });' },
        { toolCallId: 'code', messages: emptyMessages, context: {} },
      ),
    ).resolves.toEqual({ sum: 10 });
  });

  it('late-binds host tools through generateText', async () => {
    const result = await generateText({
      model: {
        specificationVersion: 'v4',
        provider: 'test',
        modelId: 'test',
        supportedUrls: Promise.resolve({}),
        doGenerate: async options => {
          expect(options.tools?.map(tool => tool.name)).toEqual(['code_mode']);

          return {
            content: [
              {
                type: 'tool-call' as const,
                toolCallType: 'function' as const,
                toolCallId: 'code-call',
                toolName: 'code_mode',
                input: '{"js":"return await tools.add({ a: 4, b: 6 });"}',
              },
            ],
            finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
            warnings: [],
          };
        },
        doStream: async () => {
          throw new Error('not implemented');
        },
      },
      tools: {
        code_mode: codeModeTool(),
        add: tool({
          inputSchema: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }) => ({ sum: a + b }),
        }),
      },
      experimental_toolCallers: {
        add: ['code_mode'],
      },
      prompt: 'Add the numbers.',
    });

    expect(result.toolResults[0]?.output).toEqual({ sum: 10 });
  });
});
