import {
  TypeValidationError,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { streamObject } from '../generate-object/stream-object';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import * as Output from './output';
import { isStepCount } from './stop-condition';
import { streamText, streamTextLowMemory } from './stream-text';

function modelFor(text: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: 'text-start', id: '1' },
        ...Array.from(text, delta => ({
          type: 'text-delta' as const,
          id: '1',
          delta,
        })),
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ]),
    }),
  });
}

describe.each(['streamText', 'streamObject'] as const)(
  '%s array streaming',
  api => {
    it.each(['v3', 'v4'] as const)(
      'validates each completed element once, then validates the final output with Zod %s',
      async version => {
        const validate = vi.fn();
        const schema =
          version === 'v3'
            ? z3.object({ value: z3.string() }).superRefine(validate)
            : z4.object({ value: z4.string() }).superRefine(validate);
        const values = Array.from({ length: 20 }, (_, i) => ({
          value: `value ${i}`,
        }));
        const model = modelFor(JSON.stringify({ elements: values }));
        const result =
          api === 'streamText'
            ? streamText({
                model,
                prompt: 'Return elements',
                output: Output.array({ element: schema }),
              })
            : streamObject({
                model,
                prompt: 'Return elements',
                output: 'array',
                schema,
              });

        expect(await convertAsyncIterableToArray(result.elementStream)).toEqual(
          values,
        );
        expect(
          await (api === 'streamText'
            ? (result as ReturnType<typeof streamText>).output
            : (result as ReturnType<typeof streamObject>).object),
        ).toEqual(values);
        expect(validate).toHaveBeenCalledTimes(values.length * 2);
      },
    );

    it('hands published array state back to the existing parser without duplicate partials or text', async () => {
      const schema = z4.number();
      const createResult = () => {
        const model = modelFor('{"elements":[1,2],"other":3}');
        return api === 'streamText'
          ? streamText({
              model,
              prompt: 'Return elements',
              output: Output.array({ element: schema }),
            })
          : streamObject({
              model,
              prompt: 'Return elements',
              output: 'array',
              schema,
            });
      };
      // Legacy streamObject exposes a single-consumer stream.
      const partialResult = createResult();
      const partialStream =
        'partialOutputStream' in partialResult
          ? partialResult.partialOutputStream
          : partialResult.partialObjectStream;
      const [partials, elements, text] = await Promise.all([
        convertAsyncIterableToArray(partialStream),
        convertAsyncIterableToArray(createResult().elementStream),
        convertAsyncIterableToArray(createResult().textStream),
      ]);
      expect(partials).toEqual([[], [1], [1, 2]]);
      expect(elements).toEqual([1, 2]);
      expect(text.join('')).toBe(
        api === 'streamText' ? '{"elements":[1,2],"other":3}' : '[1,2]',
      );
    });

    it('retains compatibility with nonstandard envelopes through the existing parser', async () => {
      const schema = z4.object({ value: z4.number() });
      const model = modelFor(
        '{"other": [], "elements": [{"value":1}, {"value":2}]}',
      );
      const result =
        api === 'streamText'
          ? streamText({
              model,
              prompt: 'Return elements',
              output: Output.array({ element: schema }),
            })
          : streamObject({
              model,
              prompt: 'Return elements',
              output: 'array',
              schema,
            });
      expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
        { value: 1 },
        { value: 2 },
      ]);
    });
  },
);

it('isolates concurrent streams that reuse an Output.array specification', async () => {
  const output = Output.array({ element: z4.number() });
  const results = [1, 2].map(value =>
    streamText({
      model: modelFor(JSON.stringify({ elements: [value] })),
      prompt: 'Return elements',
      output,
    }),
  );
  expect(
    await Promise.all(
      results.map(result => convertAsyncIterableToArray(result.elementStream)),
    ),
  ).toEqual([[1], [2]]);
});

it('resets incremental parsing after a failed stream attempt', async () => {
  const successful = modelFor('{"elements":[2]}');
  let calls = 0;
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async options =>
        calls++ === 0
          ? {
              stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: '{"elements":[1,' },
                { type: 'error', error: new Error('retry') },
              ]),
            }
          : successful.doStream(options),
    }),
    prompt: 'Return elements',
    output: Output.array({ element: z4.number() }),
    streamRetries: 1,
    onError: () => {},
  });
  expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([2]);
  expect(await result.output).toEqual([2]);
});

it('honors an overridden partial parser on a built-in array output', async () => {
  const output = Output.array({ element: z4.number() });
  output.parsePartialOutput = vi.fn(async () => ({ partial: [99] }));
  const result = streamText({
    model: modelFor('{"elements":[1]}'),
    prompt: 'Return elements',
    output,
  });
  expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([99]);
  expect(output.parsePartialOutput).toHaveBeenCalled();
});

describe('Output.array elementStream resets on retries and step boundaries', () => {
  const testUsage = {
    inputTokens: {
      total: 3,
      noCache: 3,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
  };

  function finishPart(
    unified: 'stop' | 'tool-calls' = 'stop',
  ): LanguageModelV4StreamPart {
    return {
      type: 'finish',
      finishReason: { unified, raw: unified },
      usage: testUsage,
    };
  }

  function arrayModelWithAttempts(
    attempts: Array<Array<LanguageModelV4StreamPart>>,
  ) {
    let callCount = 0;
    return new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream(attempts[callCount++] ?? []),
      }),
    });
  }

  it('emits all recovered elements after a mid-stream retry', async () => {
    const model = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":[' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-1"},' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-2"},' },
        { type: 'text-delta', id: '1', delta: '{"na' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        { type: 'text-delta', id: '2', delta: '{"elements":[' },
        { type: 'text-delta', id: '2', delta: '{"name":"a"},' },
        { type: 'text-delta', id: '2', delta: '{"name":"b"},' },
        { type: 'text-delta', id: '2', delta: '{"name":"c"}' },
        { type: 'text-delta', id: '2', delta: ']}' },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ]);

    const result = streamText({
      model,
      prompt: 'test-input',
      output: Output.array({ element: z4.object({ name: z4.string() }) }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    const [elements, partials, output] = await Promise.all([
      convertAsyncIterableToArray(result.elementStream),
      convertAsyncIterableToArray(result.partialOutputStream),
      result.output,
    ]);

    expect(elements).toEqual([
      { name: 'stale-1' },
      { name: 'stale-2' },
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    expect(partials.at(-1)).toEqual([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    expect(output).toEqual([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
  });

  it('emits recovered elements when the retry produces fewer elements than already published', async () => {
    const model = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":[' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-1"},' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-2"},' },
        { type: 'text-delta', id: '1', delta: '{"na' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        { type: 'text-delta', id: '2', delta: '{"elements":[{"name":"a"}]}' },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ]);

    const result = streamText({
      model,
      prompt: 'test-input',
      output: Output.array({ element: z4.object({ name: z4.string() }) }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      { name: 'stale-1' },
      { name: 'stale-2' },
      { name: 'a' },
    ]);
    expect(await result.output).toEqual([{ name: 'a' }]);
  });

  it('emits recovered elements across multiple consecutive stream retries', async () => {
    const model = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":["s1","s2","' },
        { type: 'error', error: new Error('error 1') },
      ],
      [
        { type: 'text-start', id: '2' },
        { type: 'text-delta', id: '2', delta: '{"elements":[' },
        { type: 'error', error: new Error('error 2') },
      ],
      [
        { type: 'text-start', id: '3' },
        { type: 'text-delta', id: '3', delta: '{"elements":["m1","' },
        { type: 'error', error: new Error('error 3') },
      ],
      [
        { type: 'text-start', id: '4' },
        { type: 'text-delta', id: '4', delta: '{"elements":["a","b"]}' },
        { type: 'text-end', id: '4' },
        finishPart(),
      ],
    ]);

    const result = streamText({
      model,
      prompt: 'test-input',
      output: Output.array({ element: z4.string() }),
      maxRetries: 0,
      streamRetries: 3,
      onError: () => {},
    });

    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      's1',
      's2',
      'm1',
      'a',
      'b',
    ]);
    expect(await result.output).toEqual(['a', 'b']);
  });

  it('applies maxItems per attempt across stream retries', async () => {
    const passingModel = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":["s1","s2","' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        { type: 'text-delta', id: '2', delta: '{"elements":["a","b"]}' },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ]);

    const passingResult = streamText({
      model: passingModel,
      prompt: 'test-input',
      output: Output.array({ element: z4.string(), maxItems: 2 }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    expect(
      await convertAsyncIterableToArray(passingResult.elementStream),
    ).toEqual(['s1', 's2', 'a', 'b']);
    expect(await passingResult.output).toEqual(['a', 'b']);

    const failingModel = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":["s1","' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        { type: 'text-delta', id: '2', delta: '{"elements":[' },
        { type: 'text-delta', id: '2', delta: '"a",' },
        { type: 'text-delta', id: '2', delta: '"b",' },
        { type: 'text-delta', id: '2', delta: '"c"]}' },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ]);

    const failingResult = streamText({
      model: failingModel,
      prompt: 'test-input',
      output: Output.array({ element: z4.string(), maxItems: 2 }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    const collected: string[] = [];
    let streamError: unknown;
    try {
      for await (const el of failingResult.elementStream) {
        collected.push(el);
      }
    } catch (error) {
      streamError = error;
    }

    expect(collected).toEqual(['s1', 'a', 'b']);
    expect(TypeValidationError.isInstance(streamError)).toBe(true);
    await expect(failingResult.output).rejects.toMatchObject({
      name: 'AI_NoObjectGeneratedError',
    });
  });

  it('resets elementStream on start-step in multi-step tool flows', async () => {
    const model = arrayModelWithAttempts([
      [
        { type: 'text-start', id: 't1' },
        {
          type: 'text-delta',
          id: 't1',
          delta: '{"elements":[{"name":"p1"},{"name":"p2"}]}',
        },
        { type: 'text-end', id: 't1' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'lookup',
          input: '{}',
        },
        finishPart('tool-calls'),
      ],
      [
        { type: 'text-start', id: 't2' },
        {
          type: 'text-delta',
          id: 't2',
          delta: '{"elements":[{"name":"a"},{"name":"b"},{"name":"c"}]}',
        },
        { type: 'text-end', id: 't2' },
        finishPart('stop'),
      ],
    ]);

    const result = streamText({
      model,
      tools: {
        lookup: tool({
          inputSchema: z4.object({}),
          execute: async () => 'ok',
        }),
      },
      output: Output.array({ element: z4.object({ name: z4.string() }) }),
      prompt: 'test-input',
      stopWhen: isStepCount(2),
    });

    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      { name: 'p1' },
      { name: 'p2' },
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    expect(await result.output).toEqual([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
  });

  it('emits recovered elements when parsePartialOutput is overridden (fallback parser path)', async () => {
    const output = Output.array({ element: z4.object({ name: z4.string() }) });
    const originalParsePartialOutput = output.parsePartialOutput;
    output.parsePartialOutput = vi.fn(originalParsePartialOutput);

    const model = arrayModelWithAttempts([
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":[' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-1"},' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-2"},' },
        { type: 'text-delta', id: '1', delta: '{"na' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        {
          type: 'text-delta',
          id: '2',
          delta: '{"elements":[{"name":"a"},{"name":"b"},{"name":"c"}]}',
        },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ]);

    const result = streamText({
      model,
      prompt: 'test-input',
      output,
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      { name: 'stale-1' },
      { name: 'stale-2' },
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    expect(output.parsePartialOutput).toHaveBeenCalled();
    expect(await result.output).toEqual([
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
  });

  it('emits recovered elements for concurrent teed consumers and streamTextLowMemory', async () => {
    const makeAttempts = (): Array<Array<LanguageModelV4StreamPart>> => [
      [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: '{"elements":[' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-1"},' },
        { type: 'text-delta', id: '1', delta: '{"name":"stale-2"},' },
        { type: 'text-delta', id: '1', delta: '{"na' },
        { type: 'error', error: new Error('provider error') },
      ],
      [
        { type: 'text-start', id: '2' },
        {
          type: 'text-delta',
          id: '2',
          delta: '{"elements":[{"name":"a"},{"name":"b"},{"name":"c"}]}',
        },
        { type: 'text-end', id: '2' },
        finishPart(),
      ],
    ];

    const teedResult = streamText({
      model: arrayModelWithAttempts(makeAttempts()),
      prompt: 'test-input',
      output: Output.array({ element: z4.object({ name: z4.string() }) }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    const [elements1, elements2] = await Promise.all([
      convertAsyncIterableToArray(teedResult.elementStream),
      convertAsyncIterableToArray(teedResult.elementStream),
    ]);

    const expected = [
      { name: 'stale-1' },
      { name: 'stale-2' },
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ];
    expect(elements1).toEqual(expected);
    expect(elements2).toEqual(expected);

    const lowMemoryResult = streamTextLowMemory({
      model: arrayModelWithAttempts(makeAttempts()),
      prompt: 'test-input',
      output: Output.array({ element: z4.object({ name: z4.string() }) }),
      maxRetries: 0,
      streamRetries: 1,
      onError: () => {},
    });

    expect(
      await convertAsyncIterableToArray(lowMemoryResult.elementStream),
    ).toEqual(expected);
  });
});
