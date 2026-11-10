import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
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
import { streamText } from './stream-text';

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
