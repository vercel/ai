import { APICallError } from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] },
];

function apiCallError({
  statusCode,
  responseHeaders,
}: {
  statusCode: number;
  responseHeaders?: Record<string, string>;
}) {
  return new APICallError({
    message: `model call failed with status ${statusCode}`,
    url: 'https://example.com/model',
    requestBodyValues: {},
    statusCode,
    responseHeaders,
  });
}

function successfulStream() {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 0,
            text: 0,
            reasoning: undefined,
          },
        },
      },
    ]),
  };
}

describe('doStreamStep', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resets the current UI step before streaming model output', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'Retried output',
          },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
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
          },
        ]),
      }),
    });
    const writtenParts: unknown[] = [];

    await doStreamStep(
      [{ role: 'user', content: [{ type: 'text', text: 'Retry.' }] }],
      model,
      new WritableStream({
        write(part) {
          writtenParts.push(part);
        },
      }),
    );

    expect(writtenParts[0]).toEqual({ type: 'reset-step' });
    expect(writtenParts).toContainEqual({
      type: 'text-delta',
      id: 'text-1',
      text: 'Retried output',
    });
  });

  it.each([
    { setting: 'zero retries', maxRetries: 0, expectedAttempts: 1 },
    { setting: 'two retries', maxRetries: 2, expectedAttempts: 3 },
    {
      setting: 'the default retry count',
      maxRetries: undefined,
      expectedAttempts: 3,
    },
  ])(
    '$setting makes $expectedAttempts model attempt(s)',
    async ({ maxRetries, expectedAttempts }) => {
      vi.useFakeTimers();
      const model = new MockLanguageModelV4({
        doStream: async () => {
          throw apiCallError({ statusCode: 500 });
        },
      });

      const result = doStreamStep(prompt, model, undefined, undefined, {
        maxRetries,
      });
      const rejection = expect(result).rejects.toThrow(
        'model call failed with status 500',
      );

      await vi.runAllTimersAsync();

      await rejection;
      expect(model.doStreamCalls).toHaveLength(expectedAttempts);
    },
  );

  it('retries rate-limit errors', async () => {
    vi.useFakeTimers();
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw apiCallError({ statusCode: 429 });
      },
    });

    const result = doStreamStep(prompt, model, undefined, undefined, {
      maxRetries: 1,
    });
    const rejection = expect(result).rejects.toThrow(
      'model call failed with status 429',
    );

    await vi.runAllTimersAsync();

    await rejection;
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it.each([400, 401, 403])(
    'does not retry non-retryable status %i errors',
    async statusCode => {
      const error = apiCallError({ statusCode });
      const model = new MockLanguageModelV4({
        doStream: async () => {
          throw error;
        },
      });

      const result = doStreamStep(prompt, model, undefined, undefined, {
        maxRetries: 2,
      });

      await expect(result).rejects.toBe(error);
      expect(model.doStreamCalls).toHaveLength(1);
    },
  );

  it('respects retry-after response headers', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let attempt = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        attempt++;
        if (attempt === 1) {
          throw apiCallError({
            statusCode: 429,
            responseHeaders: { 'retry-after-ms': '25' },
          });
        }
        return successfulStream();
      },
    });

    const result = doStreamStep(prompt, model, undefined, undefined, {
      maxRetries: 1,
    });

    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({
      finish: { finishReason: 'stop' },
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 25);
    expect(model.doStreamCalls).toHaveLength(2);
  });

  it('disables workflow step retries to avoid stacking retry layers', () => {
    expect(doStreamStep.maxRetries).toBe(0);
  });

  it('does not call the model after the absolute deadline has elapsed', async () => {
    const doStream = vi.fn();
    const model = new MockLanguageModelV4({ doStream });

    await expect(
      doStreamStep(prompt, model, undefined, undefined, {
        timeoutAt: Date.now(),
      }),
    ).resolves.toEqual({ aborted: true });
    expect(doStream).not.toHaveBeenCalled();
  });

  it('returns an aborted result when the deadline aborts the model call', async () => {
    const timeoutController = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutController.signal);
    const model = new MockLanguageModelV4({
      doStream: async () => {
        timeoutController.abort(
          new DOMException('The operation timed out.', 'TimeoutError'),
        );
        throw timeoutController.signal.reason;
      },
    });

    try {
      await expect(
        doStreamStep(prompt, model, undefined, undefined, {
          timeoutAt: Date.now() + 5000,
        }),
      ).resolves.toEqual({ aborted: true });
      expect(model.doStreamCalls).toHaveLength(1);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('returns model stream errors as terminal step data', async () => {
    const terminal = new Error('terminal model error');
    const streamedParts: unknown[] = [];
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'error' as const, error: terminal },
          {
            type: 'finish' as const,
            finishReason: { unified: 'error' as const, raw: 'error' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 0,
                text: 0,
                reasoning: undefined,
              },
            },
          },
        ]),
      }),
    });

    const result = await doStreamStep(
      prompt,
      model,
      new WritableStream({
        write(part) {
          streamedParts.push(part);
        },
      }),
    );

    expect(result).toMatchObject({
      terminalError: terminal,
      finish: { finishReason: 'error' },
    });
    expect(streamedParts).toContainEqual({ type: 'error', error: terminal });
  });

  it('records tool input lifecycle events for callbacks outside the step', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          {
            type: 'tool-input-start' as const,
            id: 'call-1',
            toolName: 'search',
          },
          {
            type: 'tool-input-delta' as const,
            id: 'call-1',
            delta: '{"query":"docs"}',
          },
          { type: 'tool-input-end' as const, id: 'call-1' },
          {
            type: 'tool-call' as const,
            toolCallId: 'call-1',
            toolName: 'search',
            input: '{"query":"docs"}',
          },
          {
            type: 'finish' as const,
            finishReason: {
              unified: 'tool-calls' as const,
              raw: 'tool-calls',
            },
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
          },
        ]),
      }),
    });

    const result = await doStreamStep(prompt, model, undefined, {
      search: {
        hasOnInputStart: true,
        hasOnInputDelta: true,
        hasOnInputAvailable: true,
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    });

    expect(result).toMatchObject({
      toolInputLifecycleEvents: [
        ['start', 'call-1', 'search'],
        ['delta', 'call-1', '{"query":"docs"}'],
        ['available', 'call-1'],
      ],
    });
  });

  it('does not retain input deltas for tools without delta callbacks', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          {
            type: 'tool-input-start' as const,
            id: 'call-1',
            toolName: 'search',
          },
          ...Array.from({ length: 1000 }, () => ({
            type: 'tool-input-delta' as const,
            id: 'call-1',
            delta: 'x',
          })),
          { type: 'tool-input-end' as const, id: 'call-1' },
          {
            type: 'tool-call' as const,
            toolCallId: 'call-1',
            toolName: 'search',
            input: '{"query":"docs"}',
          },
          {
            type: 'finish' as const,
            finishReason: {
              unified: 'tool-calls' as const,
              raw: 'tool-calls',
            },
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
          },
        ]),
      }),
    });

    const result = await doStreamStep(prompt, model, undefined, {
      search: {
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    });

    expect(result).toMatchObject({ toolInputLifecycleEvents: [] });
  });
});
