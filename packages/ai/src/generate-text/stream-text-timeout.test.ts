import {
  APICallError,
  type LanguageModelV4StreamPart,
  type LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { delay, DelayedPromise } from '@ai-sdk/provider-utils';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

describe('streamText first chunk timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should abort when only non-output chunks arrive before firstChunkMs', async () => {
    let receivedAbortSignal: AbortSignal | undefined;
    let textError: unknown;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          receivedAbortSignal = abortSignal;

          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.enqueue({
                  type: 'response-metadata',
                  id: 'response-1',
                });
                controller.enqueue({ type: 'text-start', id: '1' });
                controller.enqueue({
                  type: 'text-delta',
                  id: '1',
                  delta: '',
                  providerMetadata: {
                    testProvider: { signature: 'test-signature' },
                  },
                });
                controller.enqueue({ type: 'reasoning-start', id: '2' });
                controller.enqueue({
                  type: 'reasoning-delta',
                  id: '2',
                  delta: '',
                });
                controller.enqueue({
                  type: 'tool-input-start',
                  id: 'call-1',
                  toolName: 'tool1',
                });
                controller.enqueue({
                  type: 'tool-input-delta',
                  id: 'call-1',
                  delta: '',
                });
                controller.enqueue({ type: 'raw', rawValue: ': ping' });

                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      }),
      prompt: 'test-input',
      timeout: { firstChunkMs: 50 },
      onError: () => {},
    });

    const handledTextPromise = Promise.resolve(result.text).catch(error => {
      textError = error;
    });

    await vi.advanceTimersByTimeAsync(100);
    await handledTextPromise;

    expect(receivedAbortSignal?.aborted).toBe(true);
    expect((receivedAbortSignal?.reason as Error)?.name).toBe('TimeoutError');
    expect((receivedAbortSignal?.reason as Error)?.message).toBe(
      'First chunk timeout of 50ms exceeded',
    );
    expect(textError).toHaveProperty('name', 'TimeoutError');
  });

  const outputCases: Array<{
    name: string;
    chunks: LanguageModelV4StreamPart[];
  }> = [
    {
      name: 'text delta',
      chunks: [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'Hello' },
      ],
    },
    {
      name: 'reasoning delta',
      chunks: [
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '1', delta: 'Thinking' },
      ],
    },
    {
      name: 'tool input delta',
      chunks: [
        { type: 'tool-input-start', id: 'call-1', toolName: 'tool1' },
        { type: 'tool-input-delta', id: 'call-1', delta: '{"value":' },
      ],
    },
    {
      name: 'file',
      chunks: [
        {
          type: 'file',
          data: { type: 'data', data: 'Hello World' },
          mediaType: 'text/plain',
        },
      ],
    },
    {
      name: 'reasoning file',
      chunks: [
        {
          type: 'reasoning-file',
          data: { type: 'data', data: 'Thinking' },
          mediaType: 'text/plain',
        },
      ],
    },
    {
      name: 'tool call',
      chunks: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          input: '{"value":"test"}',
        },
      ],
    },
  ];

  for (const { name, chunks } of outputCases) {
    it(`should disarm firstChunkMs before forwarding the first ${name}`, async () => {
      let receivedAbortSignal: AbortSignal | undefined;
      const finishStream = new DelayedPromise<void>();

      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            receivedAbortSignal = abortSignal;

            return {
              stream: new ReadableStream({
                start(controller) {
                  for (const chunk of chunks) {
                    controller.enqueue(chunk);
                  }

                  finishStream.promise.then(() => {
                    controller.enqueue({
                      type: 'finish',
                      finishReason: { unified: 'stop', raw: 'stop' },
                      usage: testUsage,
                    });
                    controller.close();
                  });
                },
              }),
            };
          },
        }),
        prompt: 'test-input',
        timeout: { firstChunkMs: 50 },
        onError: () => {},
      });

      const consumePromise = result.consumeStream();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      expect(receivedAbortSignal?.aborted).toBe(false);

      finishStream.resolve(undefined);
      await consumePromise;
    });
  }

  it('should re-arm firstChunkMs for each model-call step', async () => {
    const receivedAbortSignals: AbortSignal[] = [];
    const secondStepStarted = new DelayedPromise<void>();
    let stepCount = 0;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          receivedAbortSignals.push(abortSignal!);
          stepCount++;

          if (stepCount === 1) {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  input: '{"value":"test"}',
                },
                {
                  type: 'finish',
                  finishReason: {
                    unified: 'tool-calls',
                    raw: 'tool-calls',
                  },
                  usage: testUsage,
                },
              ]),
            };
          }

          secondStepStarted.resolve(undefined);

          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  type: 'response-metadata',
                  id: 'response-2',
                });
                controller.enqueue({ type: 'text-start', id: '2' });

                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      }),
      tools: {
        tool1: {
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'tool result',
        },
      },
      prompt: 'test-input',
      timeout: { firstChunkMs: 50 },
      stopWhen: isStepCount(2),
      onError: () => {},
    });

    const consumePromise = result.consumeStream();

    await secondStepStarted.promise;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(stepCount).toBe(2);
    expect(receivedAbortSignals[1].aborted).toBe(true);
    expect((receivedAbortSignals[1].reason as Error).name).toBe('TimeoutError');

    await consumePromise;
  });

  it('should clear firstChunkMs when the provider stream errors', async () => {
    let receivedAbortSignal: AbortSignal | undefined;
    const providerError = new Error('simulated provider stream error');

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          receivedAbortSignal = abortSignal;

          return {
            stream: new ReadableStream({
              start(controller) {
                controller.error(providerError);
              },
            }),
          };
        },
      }),
      prompt: 'test-input',
      timeout: { firstChunkMs: 50 },
    });

    const textPromise = result.text;

    await result.consumeStream();
    await expect(textPromise).rejects.toThrow(providerError);

    expect(receivedAbortSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(100);

    expect(receivedAbortSignal?.aborted).toBe(false);
  });

  it('should clear firstChunkMs when the registered step stream is cancelled', async () => {
    let receivedAbortSignal: AbortSignal | undefined;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          receivedAbortSignal = abortSignal;

          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.enqueue({
                  type: 'response-metadata',
                  id: 'response-1',
                });
              },
            }),
          };
        },
      }),
      prompt: 'test-input',
      timeout: { firstChunkMs: 50 },
      experimental_transform: ({ stopStream }) =>
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === 'start-step') {
              stopStream();
            }
            controller.enqueue(chunk);
          },
        }),
    });

    await result.consumeStream();

    expect(receivedAbortSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(100);

    expect(receivedAbortSignal?.aborted).toBe(false);
  });
});

describe('streamText chunk timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not reset chunkMs for non-output chunks', async () => {
    let receivedAbortSignal: AbortSignal | undefined;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          receivedAbortSignal = abortSignal;

          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-start', id: '1' });
                controller.enqueue({
                  type: 'text-delta',
                  id: '1',
                  delta: 'Hello',
                });

                setTimeout(() => {
                  controller.enqueue({
                    type: 'response-metadata',
                    id: 'response-1',
                  });
                }, 20);
                setTimeout(() => {
                  controller.enqueue({ type: 'raw', rawValue: ': ping' });
                }, 40);

                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      }),
      prompt: 'test-input',
      timeout: { chunkMs: 50 },
      onError: () => {},
    });

    const consumePromise = result.consumeStream();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60);

    expect(receivedAbortSignal?.aborted).toBe(true);
    expect((receivedAbortSignal?.reason as Error)?.name).toBe('TimeoutError');

    await consumePromise;
  });
});

describe('streamText model output timeout boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const finish: LanguageModelV4StreamPart = {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: testUsage,
  };
  const textChunks: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta: 'Hello' },
    { type: 'text-end', id: '1' },
    finish,
  ];
  const toolChunks: LanguageModelV4StreamPart[] = [
    { type: 'tool-call', toolCallId: 'call-1', toolName: 'slow', input: '{}' },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage: testUsage,
    },
  ];

  it('should include pending doStream in firstChunkMs', async () => {
    let signal: AbortSignal | undefined;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          await delay(200, { abortSignal });
          return { stream: convertArrayToReadableStream(textChunks) };
        },
      }),
      prompt: 'test',
      timeout: { firstChunkMs: 50 },
      onError: () => {},
    });
    const consuming = result.consumeStream();

    await vi.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason.message).toBe('First chunk timeout of 50ms exceeded');
    await vi.advanceTimersByTimeAsync(200);
    await consuming;
  });

  it('should use one firstChunkMs budget for request setup and first output', async () => {
    let signal: AbortSignal | undefined;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          await delay(30, { abortSignal });
          return {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              async start(controller) {
                await delay(30, { abortSignal });
                for (const chunk of textChunks) controller.enqueue(chunk);
                controller.close();
              },
            }),
          };
        },
      }),
      prompt: 'test',
      timeout: { firstChunkMs: 50 },
      onError: () => {},
    });
    const consuming = result.consumeStream();

    await vi.advanceTimersByTimeAsync(100);
    expect(signal?.reason.message).toBe('First chunk timeout of 50ms exceeded');
    await consuming;
  });

  it('should start firstChunkMs after step preparation', async () => {
    let signal: AbortSignal | undefined;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          return { stream: convertArrayToReadableStream(textChunks) };
        },
      }),
      prepareStep: async () => {
        await delay(100);
        return {};
      },
      prompt: 'test',
      timeout: { firstChunkMs: 50 },
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(200);
    await consuming;
    expect(signal?.aborted).toBe(false);
    expect(await result.text).toBe('Hello');
  });

  for (const streamRetries of [0, 1]) {
    it(`should clear chunkMs before a long streaming tool (streamRetries: ${streamRetries})`, async () => {
      let signal: AbortSignal | undefined;
      const parts: string[] = [];
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            return { stream: convertArrayToReadableStream(toolChunks) };
          },
        }),
        tools: {
          slow: {
            inputSchema: z.object({}),
            execute: async function* (_, { abortSignal }) {
              for (let i = 0; i < 4; i++) {
                await delay(40, { abortSignal });
                yield i;
              }
            },
          },
        },
        prompt: 'test',
        streamRetries,
        timeout: { firstChunkMs: 50, chunkMs: 50 },
      });
      const consuming = (async () => {
        for await (const part of result.fullStream) parts.push(part.type);
      })();

      await vi.advanceTimersByTimeAsync(250);
      await consuming;
      expect(signal?.aborted).toBe(false);
      expect(parts.filter(type => type === 'tool-result')).toHaveLength(5);
      expect(parts.slice(-2)).toEqual(['finish-step', 'finish']);
    });
  }

  for (const budget of ['stepMs', 'totalMs'] as const) {
    it(`should keep ${budget} active during local tool execution`, async () => {
      // Native AbortSignal.timeout (used by totalMs) does not use fake timers.
      if (budget === 'totalMs') vi.useRealTimers();
      let signal: AbortSignal | undefined;
      const parts: string[] = [];
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            return { stream: convertArrayToReadableStream(toolChunks) };
          },
        }),
        tools: {
          slow: {
            inputSchema: z.object({}),
            execute: async (_, { abortSignal }) => {
              await delay(200, { abortSignal });
              return 'done';
            },
          },
        },
        prompt: 'test',
        timeout: { [budget]: 100, firstChunkMs: 50, chunkMs: 50 },
        onError: () => {},
      });
      const consuming = (async () => {
        for await (const part of result.fullStream) parts.push(part.type);
      })();

      if (budget === 'stepMs') await vi.advanceTimersByTimeAsync(150);
      await consuming;
      expect(signal?.reason.name).toBe('TimeoutError');
      if (budget === 'stepMs') {
        expect(signal?.reason.message).toBe('Step timeout of 100ms exceeded');
      } else {
        expect(signal?.reason.message).not.toContain('Chunk');
      }
      expect(parts.at(-1)).toBe('abort');
    });
  }

  it('should keep toolMs active after the model finishes', async () => {
    // Exercise the native AbortSignal.timeout used by toolMs.
    vi.useRealTimers();
    let signal: AbortSignal | undefined;
    const parts: string[] = [];
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          return { stream: convertArrayToReadableStream(toolChunks) };
        },
      }),
      tools: {
        slow: {
          inputSchema: z.object({}),
          execute: async (_, { abortSignal }) => {
            await delay(200, { abortSignal });
            return 'done';
          },
        },
      },
      prompt: 'test',
      timeout: { toolMs: 100, firstChunkMs: 50, chunkMs: 50 },
    });
    const consuming = (async () => {
      for await (const part of result.fullStream) parts.push(part.type);
    })();
    await consuming;
    expect(signal?.aborted).toBe(false);
    expect(parts).toContain('tool-error');
    expect(parts.at(-1)).toBe('finish');
  });

  for (const terminal of ['finish', 'error', 'close'] as const) {
    it(`should clear output timers on ${terminal} before slow stream processing`, async () => {
      let signal: AbortSignal | undefined;
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            return {
              stream: convertArrayToReadableStream(
                terminal === 'finish'
                  ? [finish]
                  : terminal === 'error'
                    ? [{ type: 'error', error: new Error('provider error') }]
                    : textChunks.slice(0, -1),
              ),
            };
          },
        }),
        prompt: 'test',
        timeout: { firstChunkMs: 50, chunkMs: 50 },
        onError: async () => {
          await delay(100);
        },
        onStepEnd: async () => {
          await delay(100);
        },
      });
      const consuming = result.consumeStream();
      await vi.advanceTimersByTimeAsync(250);
      await consuming;
      expect(signal?.aborted).toBe(false);
    });
  }

  for (const retryKind of ['request', 'stream', 'callback'] as const) {
    it(`should give a ${retryKind} retry a fresh firstChunkMs budget`, async () => {
      let attempts = 0;
      let signal: AbortSignal | undefined;
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            attempts++;
            if (attempts === 1) {
              if (retryKind === 'request') {
                await delay(40, { abortSignal });
                throw new APICallError({
                  message: 'retryable error',
                  url: 'https://example.com',
                  requestBodyValues: {},
                  statusCode: 429,
                  responseHeaders: { 'retry-after-ms': '100' },
                  isRetryable: true,
                });
              }
              return {
                stream: new ReadableStream<LanguageModelV4StreamPart>({
                  async start(controller) {
                    await delay(40, { abortSignal });
                    controller.enqueue({
                      type: 'error',
                      error: new Error('retryable stream error'),
                    });
                    controller.close();
                  },
                }),
              };
            }
            await delay(40, { abortSignal });
            return { stream: convertArrayToReadableStream(textChunks) };
          },
        }),
        prompt: 'test',
        maxRetries: 1,
        streamRetries: retryKind === 'stream' ? 1 : 0,
        timeout: { firstChunkMs: 50, chunkMs: 50 },
        onError: () => (retryKind === 'callback' ? { retry: true } : undefined),
      });
      const consuming = result.consumeStream();
      await vi.advanceTimersByTimeAsync(250);
      await consuming;
      expect(attempts).toBe(2);
      expect(signal?.aborted).toBe(false);
      expect(await result.text).toBe('Hello');
    });
  }

  for (const continuation of ['step', 'retry'] as const) {
    it(`should start chunkMs only after output begins in the next ${continuation}`, async () => {
      let attempts = 0;
      let signal: AbortSignal | undefined;
      const parts: string[] = [];
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            attempts++;
            if (attempts === 1) {
              return {
                stream: convertArrayToReadableStream(
                  continuation === 'step'
                    ? toolChunks
                    : [
                        ...textChunks.slice(0, -1),
                        { type: 'error', error: new Error('retryable error') },
                      ],
                ),
              };
            }
            return {
              stream: new ReadableStream<LanguageModelV4StreamPart>({
                async start(controller) {
                  await delay(100, { abortSignal });
                  controller.enqueue({ type: 'text-start', id: '2' });
                  controller.enqueue({
                    type: 'text-delta',
                    id: '2',
                    delta: 'Next',
                  });
                  abortSignal?.addEventListener(
                    'abort',
                    () => controller.error(abortSignal.reason),
                    { once: true },
                  );
                },
              }),
            };
          },
        }),
        tools: {
          slow: {
            inputSchema: z.object({}),
            execute: async (_, { abortSignal }) => {
              await delay(100, { abortSignal });
              return 'done';
            },
          },
        },
        prompt: 'test',
        timeout: { firstChunkMs: 150, chunkMs: 50 },
        streamRetries: continuation === 'retry' ? 1 : 0,
        stopWhen: isStepCount(2),
        onError: () => {},
      });
      const consuming = (async () => {
        for await (const part of result.fullStream) parts.push(part.type);
      })();
      await vi.advanceTimersByTimeAsync(continuation === 'step' ? 225 : 125);
      expect(attempts).toBe(2);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(50);
      await consuming;
      expect(signal?.reason.message).toBe('Chunk timeout of 50ms exceeded');
      expect(parts.at(-1)).toBe('abort');
    });
  }

  it('should re-arm firstChunkMs after retrying an attempt that produced output', async () => {
    let attempts = 0;
    let signal: AbortSignal | undefined;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          attempts++;
          if (attempts === 1) {
            return {
              stream: convertArrayToReadableStream([
                ...textChunks.slice(0, -1),
                { type: 'error', error: new Error('retryable error') },
              ]),
            };
          }
          return {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              start(controller) {
                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      }),
      prompt: 'test',
      timeout: { firstChunkMs: 50 },
      streamRetries: 1,
      onError: () => {},
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(2);
    expect(signal?.reason.message).toBe('First chunk timeout of 50ms exceeded');
    await consuming;
  });

  for (const retryKind of ['request', 'stream'] as const) {
    it(`should keep stepMs cumulative across ${retryKind} retries`, async () => {
      let attempts = 0;
      let signal: AbortSignal | undefined;
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async ({ abortSignal }) => {
            signal = abortSignal;
            attempts++;
            await delay(40, { abortSignal });
            if (attempts === 1) {
              const error = new APICallError({
                message: 'retryable error',
                url: 'https://example.com',
                requestBodyValues: {},
                statusCode: 429,
                responseHeaders: { 'retry-after-ms': '0' },
                isRetryable: true,
              });
              if (retryKind === 'request') throw error;
              return {
                stream: convertArrayToReadableStream([
                  { type: 'error', error },
                ]),
              };
            }
            return { stream: convertArrayToReadableStream(textChunks) };
          },
        }),
        prompt: 'test',
        timeout: { stepMs: 60, firstChunkMs: 50 },
        maxRetries: 1,
        streamRetries: retryKind === 'stream' ? 1 : 0,
        onError: () => {},
      });
      const consuming = result.consumeStream();
      await vi.advanceTimersByTimeAsync(100);
      await consuming;
      expect(attempts).toBe(2);
      expect(signal?.reason.message).toBe('Step timeout of 60ms exceeded');
    });
  }

  it('should keep chunkMs active during provider-executed tools without resetting on their results', async () => {
    let signal: AbortSignal | undefined;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ abortSignal }) => {
          signal = abortSignal;
          return {
            stream: new ReadableStream<LanguageModelV4StreamPart>({
              async start(controller) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'slow',
                  input: '{}',
                  providerExecuted: true,
                });
                await delay(40, { abortSignal });
                controller.enqueue({
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'slow',
                  result: 'progress',
                  preliminary: true,
                });
                abortSignal?.addEventListener(
                  'abort',
                  () => controller.error(abortSignal.reason),
                  { once: true },
                );
              },
            }),
          };
        },
      }),
      tools: { slow: { inputSchema: z.object({}) } },
      prompt: 'test',
      timeout: { chunkMs: 50 },
      onError: () => {},
    });
    const consuming = result.consumeStream();
    await vi.advanceTimersByTimeAsync(60);
    await consuming;
    expect(signal?.reason.message).toBe('Chunk timeout of 50ms exceeded');
  });
});
