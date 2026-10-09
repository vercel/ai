import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { Output } from './index';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';
import { streamTextWithMinimalRetention } from './stream-text-with-minimal-retention';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
};
function finish(
  reason: 'stop' | 'tool-calls' = 'stop',
): LanguageModelV4StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: reason },
    usage,
  };
}
function textParts(text = 'hello'): LanguageModelV4StreamPart[] {
  return [
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: text },
    { type: 'text-end', id: 'text' },
  ];
}
function modelWithSteps(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    doStream: steps.map(parts => ({
      stream: convertArrayToReadableStream(parts),
    })),
  });
}

// The same behavioral checks run against both facades of the execution engine.
describe.each([
  ['streamText', streamText],
  ['experimental_streamText', streamTextWithMinimalRetention],
] as const)('%s behavior', (_name, generate) => {
  it('executes tools and sends complete history into the next step', async () => {
    const execute = vi.fn(
      async ({ city }: { city: string }) => `${city}: sunny`,
    );
    const model = modelWithSteps(
      [
        ...textParts('Checking.'),
        {
          type: 'tool-call',
          toolCallId: 'call',
          toolName: 'weather',
          input: '{"city":"Paris"}',
        },
        finish('tool-calls'),
      ],
      [...textParts('It is sunny.'), finish()],
    );
    const onStepEnd = vi.fn();
    const result = generate({
      model,
      prompt: 'Weather?',
      tools: {
        weather: tool({ inputSchema: z.object({ city: z.string() }), execute }),
      },
      stopWhen: isStepCount(2),
      onStepEnd,
    });
    const parts = await convertAsyncIterableToArray(result.stream);
    expect(execute).toHaveBeenCalledOnce();
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-result', output: 'Paris: sunny' }),
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].prompt).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([{ type: 'text', text: 'Checking.' }]),
      }),
    );
    expect(onStepEnd.mock.calls.map(([step]) => step.text)).toEqual([
      'Checking.',
      'It is sunny.',
    ]);
    expect(await result.totalUsage).toMatchObject({
      inputTokens: 6,
      outputTokens: 4,
    });
    expect(await result.finishReason).toBe('stop');
  });

  it('preserves approval requests and does not execute an unapproved tool', async () => {
    const execute = vi.fn(async () => 'done');
    const result = generate({
      model: modelWithSteps([
        {
          type: 'tool-call',
          toolCallId: 'call',
          toolName: 'action',
          input: '{}',
        },
        finish('tool-calls'),
      ]),
      prompt: 'Act',
      tools: {
        action: tool({
          inputSchema: z.object({}),
          needsApproval: true,
          execute,
        }),
      },
    });
    const parts = await convertAsyncIterableToArray(result.stream);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        toolCall: expect.objectContaining({ toolName: 'action' }),
      }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('delivers complete lifecycle callback content in order', async () => {
    const events: string[] = [];
    const result = generate({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
      onStart: () => {
        events.push('start');
      },
      onLanguageModelCallStart: () => {
        events.push('model-start');
      },
      onLanguageModelCallEnd: event => {
        expect(event.content).toContainEqual(
          expect.objectContaining({ type: 'text', text: 'hello' }),
        );
        events.push('model-end');
      },
      onStepEnd: event => {
        expect(event.text).toBe('hello');
        events.push('step-end');
      },
      onEnd: event => {
        expect(event.text).toBe('hello');
        events.push('end');
      },
    });
    expect(await convertAsyncIterableToArray(result.textStream)).toEqual([
      'hello',
    ]);
    expect(events).toEqual([
      'start',
      'model-start',
      'model-end',
      'step-end',
      'end',
    ]);
  });

  it('preserves per-call telemetry completion events and their content', async () => {
    const onEnd = vi.fn();
    const onLanguageModelCallEnd = vi.fn();
    const result = generate({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
      telemetry: { integrations: { onEnd, onLanguageModelCallEnd } },
    });
    await result.consumeStream();
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello' }),
    );
    expect(onLanguageModelCallEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ text: 'hello' }),
        ]),
      }),
    );
  });

  it('supports structured partial output and parsed output in onEnd', async () => {
    const onEnd = vi.fn();
    const result = generate({
      model: modelWithSteps([...textParts('{"answer":42}'), finish()]),
      prompt: 'test',
      output: Output.object({ schema: z.object({ answer: z.number() }) }),
      onEnd,
    });
    expect(
      await convertAsyncIterableToArray(result.partialOutputStream),
    ).toEqual([{ answer: 42 }]);
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { answer: 42 },
        text: '{"answer":42}',
      }),
    );
  });

  it('supports element streams', async () => {
    const result = generate({
      model: modelWithSteps([
        ...textParts('{"elements":[{"value":1},{"value":2}]}'),
        finish(),
      ]),
      prompt: 'test',
      output: Output.array({ element: z.object({ value: z.number() }) }),
    });
    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      { value: 1 },
      { value: 2 },
    ]);
  });

  it('supports stream transforms and text responses', async () => {
    const result = generate({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
      experimental_transform: () =>
        new TransformStream({
          transform(part, controller) {
            controller.enqueue(
              part.type === 'text-delta'
                ? { ...part, text: part.text.toUpperCase() }
                : part,
            );
          },
        }),
    });
    expect(await result.toTextStreamResponse().text()).toBe('HELLO');
  });

  it('supports UI message conversion and completion callbacks', async () => {
    const onEnd = vi.fn();
    const result = generate({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
    });
    const parts = await convertAsyncIterableToArray(
      result.toUIMessageStream({ onEnd }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'text-delta', delta: 'hello' }),
    );
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMessage: expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'hello' }),
          ]),
        }),
      }),
    );
  });

  it('preserves stream error delivery and onError callbacks', async () => {
    const error = new Error('provider failed');
    const onError = vi.fn();
    const result = generate({
      model: modelWithSteps([...textParts(), { type: 'error', error }]),
      prompt: 'test',
      onError,
    });
    const parts = await convertAsyncIterableToArray(result.stream);
    expect(parts).toContainEqual({ type: 'error', error });
    expect(onError).toHaveBeenCalledWith({ error });
  });

  it('preserves stream retries', async () => {
    const model = modelWithSteps(
      [
        {
          type: 'error',
          error: { message: 'overloaded', statusCode: 503, isRetryable: true },
        },
      ],
      [...textParts('recovered'), finish()],
    );
    const result = generate({
      model,
      prompt: 'test',
      streamRetries: 1,
      onError: () => {},
    });
    expect(await convertAsyncIterableToArray(result.textStream)).toEqual([
      'recovered',
    ]);
    expect(model.doStreamCalls).toHaveLength(2);
  });
});

describe('streaming-only contract', () => {
  it('rejects a duplicate consumeStream without corrupting metadata', async () => {
    const result = streamTextWithMinimalRetention({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
    });
    const stream = result.textStream;
    await expect(result.consumeStream()).rejects.toThrow('one stream consumer');
    expect(await convertAsyncIterableToArray(stream)).toEqual(['hello']);
    expect(await result.finishReason).toBe('stop');
  });

  it('cancels the upstream stream and rejects metadata when iteration stops early', async () => {
    const cancel = vi.fn();
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text' });
          },
          pull(controller) {
            controller.enqueue({
              type: 'text-delta',
              id: 'text',
              delta: 'hello',
            });
          },
          cancel,
        }),
      }),
    });
    const result = streamTextWithMinimalRetention({ model, prompt: 'test' });
    const assertion = expect(result.totalUsage).rejects.toMatchObject({
      name: 'AbortError',
    });
    for await (const delta of result.textStream) {
      expect(delta).toBe('hello');
      break;
    }
    await assertion;
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('honors abort signals and preserves onAbort lifecycle delivery', async () => {
    const abort = new AbortController();
    const onAbort = vi.fn();
    const cancel = vi.fn();
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text',
              delta: 'hello',
            });
          },
          cancel,
        }),
      }),
    });
    const result = streamTextWithMinimalRetention({
      model,
      prompt: 'test',
      abortSignal: abort.signal,
      onAbort,
    });
    const parts = [];
    for await (const part of result.stream) {
      parts.push(part);
      if (part.type === 'text-delta') abort.abort('stop');
    }
    expect(parts).toContainEqual({ type: 'abort', reason: 'stop' });
    expect(onAbort).toHaveBeenCalledOnce();
    expect(onAbort).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'stop' }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('applies backpressure to a slow consumer', async () => {
    let emitted = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text' });
          },
          pull(controller) {
            emitted++;
            controller.enqueue({
              type: 'text-delta',
              id: 'text',
              delta: 'hello',
            });
            if (emitted === 1000) controller.close();
          },
        }),
      }),
    });
    const result = streamTextWithMinimalRetention({ model, prompt: 'test' });
    const reader = result.textStream.getReader();
    await reader.read();
    await new Promise(resolve => setTimeout(resolve, 10));
    // The existing orchestration has several bounded stream stages.
    expect(emitted).toBeLessThan(30);
    await reader.cancel();
    reader.releaseLock();
  });
  it('allows metadata to be requested before, during, and after consumption without claiming a stream', async () => {
    const result = streamTextWithMinimalRetention({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
    });
    const usageBefore = result.totalUsage;
    const reasonBefore = result.finishReason;
    const reader = result.textStream.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 'hello' });
    const usageDuring = result.usage;
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    reader.releaseLock();
    expect(await usageBefore).toEqual(await usageDuring);
    expect(await reasonBefore).toBe('stop');
    expect(await result.totalUsage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
    });
    expect('text' in result).toBe(false);
    expect('steps' in result).toBe(false);
  });

  it('rejects a second projection without affecting the first', async () => {
    const result = streamTextWithMinimalRetention({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
    });
    const stream = result.textStream;
    expect(() => result.stream).toThrow('one stream consumer');
    expect(await convertAsyncIterableToArray(stream)).toEqual(['hello']);
    expect(() => result.textStream).toThrow('one stream consumer');
    expect(await result.finishReason).toBe('stop');
  });

  it('requires an explicit output specification for cumulative partial output', async () => {
    const result = streamTextWithMinimalRetention({
      model: modelWithSteps([...textParts(), finish()]),
      prompt: 'test',
    });
    expect(() => result.partialOutputStream).toThrow(
      'explicit output specification',
    );
    expect(await convertAsyncIterableToArray(result.textStream)).toEqual([
      'hello',
    ]);
  });

  it('supports cumulative text partials when explicitly requested', async () => {
    const result = streamTextWithMinimalRetention({
      model: modelWithSteps([
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'a' },
        { type: 'text-delta', id: 'text', delta: 'b' },
        { type: 'text-end', id: 'text' },
        finish(),
      ]),
      prompt: 'test',
      output: Output.text(),
    });
    expect(
      await convertAsyncIterableToArray(result.partialOutputStream),
    ).toEqual(['a', 'ab']);
  });

  it('retains content required by global telemetry', async () => {
    const previous = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
    const onEnd = vi.fn();
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [{ onEnd }];
    try {
      const result = streamTextWithMinimalRetention({
        model: modelWithSteps([...textParts(), finish()]),
        prompt: 'test',
      });
      await result.consumeStream();
      expect(onEnd).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello' }),
      );
    } finally {
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previous;
    }
  });
});
