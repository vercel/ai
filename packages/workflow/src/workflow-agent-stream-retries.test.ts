import { APICallError, type LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function failedAttempt(
  attempt: number,
  error: unknown = { message: 'Service temporarily unavailable' },
): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: `partial-${attempt}` },
    { type: 'error', error },
    {
      type: 'finish',
      finishReason: { unified: 'error', raw: 'error' },
      usage,
    },
  ];
}

function successfulAttempt(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];
}

function createModel(attempts: LanguageModelV4StreamPart[][]) {
  let call = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(
        attempts[Math.min(call++, attempts.length - 1)],
      ),
    }),
  });
}

function createWritable() {
  const parts: Array<{ type: string; error?: unknown }> = [];
  return {
    parts,
    writable: new WritableStream({
      write(part) {
        parts.push(part);
      },
    }),
  };
}

describe('WorkflowAgent.stream streamRetries', () => {
  it('should retry the current step after a provider error stream part', async () => {
    const model = createModel([failedAttempt(1), successfulAttempt('ok')]);
    const { parts, writable } = createWritable();
    const onError = vi.fn();

    const result = await new WorkflowAgent({ model }).stream({
      prompt: 'retry the stream',
      writable,
      streamRetries: 1,
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(result.error).toBeUndefined();
    expect(result.finishReason).toBe('stop');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].text).toBe('ok');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Service temporarily unavailable',
      }),
    });
    expect(parts.filter(part => part.type === 'reset-step')).toHaveLength(2);
    expect(parts.filter(part => part.type === 'error')).toHaveLength(0);
  });

  it('should not retry from an existing onError observer without streamRetries', async () => {
    const model = createModel([failedAttempt(1), successfulAttempt('ok')]);
    const onError = vi.fn().mockReturnValue({ retry: true });

    const result = await new WorkflowAgent({ model, maxRetries: 2 }).stream({
      prompt: 'do not retry the stream',
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(result.finishReason).toBe('error');
    expect(result.error).toMatchObject({
      message: 'Service temporarily unavailable',
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('should emit the final error after stream retries are exhausted', async () => {
    const model = createModel([
      failedAttempt(1, { message: 'first failure' }),
      failedAttempt(2, { message: 'second failure' }),
    ]);
    const { parts, writable } = createWritable();
    const onError = vi.fn();

    const result = await new WorkflowAgent({ model }).stream({
      prompt: 'exhaust the retries',
      writable,
      streamRetries: 1,
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(result.finishReason).toBe('error');
    expect(result.error).toMatchObject({ message: 'second failure' });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].text).toBe('partial-2');
    expect(onError.mock.calls).toEqual([
      [{ error: expect.objectContaining({ message: 'first failure' }) }],
      [{ error: expect.objectContaining({ message: 'second failure' }) }],
    ]);
    expect(parts.filter(part => part.type === 'error')).toEqual([
      {
        type: 'error',
        error: expect.objectContaining({ message: 'second failure' }),
      },
    ]);
    // The held-back suffix keeps its original order.
    const types = parts.map(part => part.type);
    expect(types.slice(types.lastIndexOf('reset-step'))).toEqual([
      'reset-step',
      'model-call-start',
      'text-start',
      'text-delta',
      'error',
      'model-call-end',
      'finish',
    ]);
  });

  it('should retry the current step when onError requests a retry', async () => {
    const model = createModel([failedAttempt(1), successfulAttempt('ok')]);

    const result = await new WorkflowAgent({ model }).stream({
      prompt: 'retry from onError',
      streamRetries: 0,
      onError: () => ({ retry: true }),
    });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(result.error).toBeUndefined();
    expect(result.steps[0].text).toBe('ok');
  });

  it('should allow at most one callback-directed retry per logical step', async () => {
    const model = createModel([failedAttempt(1)]);
    const onError = vi.fn().mockReturnValue({ retry: true });

    const result = await new WorkflowAgent({ model }).stream({
      prompt: 'keep failing',
      streamRetries: 1,
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(3);
    expect(onError).toHaveBeenCalledTimes(3);
    expect(result.finishReason).toBe('error');
  });

  it('should discard tool calls from a failed attempt', async () => {
    const execute = vi.fn().mockResolvedValue('weather');
    const model = createModel([
      [
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Berlin"}',
        },
        { type: 'error', error: { message: 'stream failed' } },
        {
          type: 'finish',
          finishReason: { unified: 'error', raw: 'error' },
          usage,
        },
      ],
      successfulAttempt('no tools needed'),
    ]);

    const result = await new WorkflowAgent({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute,
        }),
      },
    }).stream({
      prompt: 'discard the failed tool call',
      streamRetries: 1,
    });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(execute).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toolCalls).toEqual([]);
    expect(result.steps[0].text).toBe('no tools needed');
  });

  it('should not retry a tool choice violation', async () => {
    const model = createModel([successfulAttempt('no tool call')]);
    const onError = vi.fn().mockReturnValue({ retry: true });

    const result = await new WorkflowAgent({
      model,
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          execute: async () => 'weather',
        }),
      },
    }).stream({
      prompt: 'violate the tool choice',
      toolChoice: 'required',
      streamRetries: 2,
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(result.error).toMatchObject({
      name: 'AI_ToolChoiceViolationError',
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('should not retry a stream that ended without output', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
        ]),
      }),
    });
    const onError = vi.fn();

    const result = await new WorkflowAgent({ model }).stream({
      prompt: 'end without output',
      streamRetries: 2,
      onError,
    });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(result.error).toMatchObject({
      name: 'AI_NoOutputGeneratedError',
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  describe('failed stream reads', () => {
    function failedReadAttempt(attempt: number) {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: `partial-${attempt}` },
      ];
      // What provider-utils produces when the socket drops after HTTP 200.
      const error = new APICallError({
        message: `Failed to process successful response ${attempt}`,
        url: 'https://example.com/model',
        requestBodyValues: {},
        statusCode: 200,
        isRetryable: true,
      });
      return new ReadableStream<LanguageModelV4StreamPart>({
        pull(controller) {
          const part = parts.shift();
          if (part != null) {
            controller.enqueue(part);
          } else {
            controller.error(error);
          }
        },
      });
    }

    function createFailedReadModel(failuresBeforeSuccess: number) {
      let call = 0;
      return new MockLanguageModelV4({
        doStream: async () => {
          call++;
          return {
            stream:
              call <= failuresBeforeSuccess
                ? failedReadAttempt(call)
                : convertArrayToReadableStream(successfulAttempt('ok')),
          };
        },
      });
    }

    it('should retry the current step after a failed read of the response stream', async () => {
      const model = createFailedReadModel(1);
      const { parts, writable } = createWritable();
      const onError = vi.fn();

      const result = await new WorkflowAgent({ model }).stream({
        prompt: 'retry the failed read',
        writable,
        streamRetries: 1,
        onError,
      });

      expect(model.doStreamCalls).toHaveLength(2);
      expect(result.error).toBeUndefined();
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].text).toBe('ok');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(parts.filter(part => part.type === 'reset-step')).toHaveLength(2);
      expect(parts.filter(part => part.type === 'error')).toHaveLength(0);
    });

    it('should reject with the original error after stream retries are exhausted', async () => {
      const model = createFailedReadModel(5);
      const onError = vi.fn();

      await expect(
        new WorkflowAgent({ model }).stream({
          prompt: 'exhaust the retries',
          streamRetries: 1,
          onError,
        }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'Failed to process successful response 2',
      });
      expect(model.doStreamCalls).toHaveLength(2);
      expect(onError.mock.calls).toEqual([
        [
          {
            error: expect.objectContaining({
              message: 'Failed to process successful response 1',
            }),
          },
        ],
        [
          {
            error: expect.objectContaining({
              message: 'Failed to process successful response 2',
            }),
          },
        ],
      ]);
    });

    it('should not retry a failed read without streamRetries', async () => {
      const model = createFailedReadModel(1);
      const onError = vi.fn().mockReturnValue({ retry: true });

      await expect(
        new WorkflowAgent({ model, maxRetries: 2 }).stream({
          prompt: 'do not retry the failed read',
          onError,
        }),
      ).rejects.toMatchObject({ name: 'AI_APICallError' });
      expect(model.doStreamCalls).toHaveLength(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  it('should use the constructor streamRetries default', async () => {
    const model = createModel([failedAttempt(1), successfulAttempt('ok')]);

    const result = await new WorkflowAgent({
      model,
      streamRetries: 1,
    }).stream({ prompt: 'retry with the constructor default' });

    expect(model.doStreamCalls).toHaveLength(2);
    expect(result.steps[0].text).toBe('ok');
  });

  it('should let the stream call override the constructor streamRetries', async () => {
    const model = createModel([failedAttempt(1), successfulAttempt('ok')]);

    const result = await new WorkflowAgent({
      model,
      streamRetries: 1,
    }).stream({ prompt: 'disable retries', streamRetries: 0 });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(result.finishReason).toBe('error');
  });

  it.each([-1, 1.5])(
    'should reject invalid streamRetries value %s',
    async streamRetries => {
      const model = createModel([successfulAttempt('ok')]);

      await expect(
        new WorkflowAgent({ model }).stream({
          prompt: 'invalid',
          streamRetries,
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidArgumentError',
        parameter: 'streamRetries',
      });
      expect(model.doStreamCalls).toHaveLength(0);
    },
  );
});
