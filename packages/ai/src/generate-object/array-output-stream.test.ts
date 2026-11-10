import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { streamObject } from './stream-object';

function modelFor(text: string) {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV2StreamPart>([
        { type: 'text-start', id: '1' },
        ...Array.from(text, delta => ({
          type: 'text-delta' as const,
          id: '1',
          delta,
        })),
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      ]),
    }),
  });
}

describe('streamObject array streaming', () => {
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
      const result = streamObject({
        model: modelFor(JSON.stringify({ elements: values })),
        prompt: 'Return elements',
        output: 'array',
        schema,
      });
      expect(await convertAsyncIterableToArray(result.elementStream)).toEqual(
        values,
      );
      expect(await result.object).toEqual(values);
      expect(validate).toHaveBeenCalledTimes(values.length * 2);
    },
  );

  it('hands published array state back to the existing parser without duplicate partials or text', async () => {
    const createResult = () =>
      streamObject({
        model: modelFor('{"elements":[1,2],"other":3}'),
        prompt: 'Return elements',
        output: 'array',
        schema: z4.number(),
      });
    // Legacy streamObject exposes a single-consumer stream.
    const [partials, elements, text] = await Promise.all([
      convertAsyncIterableToArray(createResult().partialObjectStream),
      convertAsyncIterableToArray(createResult().elementStream),
      convertAsyncIterableToArray(createResult().textStream),
    ]);
    expect(partials).toEqual([[], [1], [1, 2]]);
    expect(elements).toEqual([1, 2]);
    expect(text.join('')).toBe('[1,2]');
  });

  it('retains compatibility with nonstandard envelopes through the existing parser', async () => {
    const result = streamObject({
      model: modelFor('{"other": [], "elements": [{"value":1}, {"value":2}]}'),
      prompt: 'Return elements',
      output: 'array',
      schema: z4.object({ value: z4.number() }),
    });
    expect(await convertAsyncIterableToArray(result.elementStream)).toEqual([
      { value: 1 },
      { value: 2 },
    ]);
  });
});
