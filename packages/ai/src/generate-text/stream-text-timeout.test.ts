import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { DelayedPromise } from '@ai-sdk/provider-utils';
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
