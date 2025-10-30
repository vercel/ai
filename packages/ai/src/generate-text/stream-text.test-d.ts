import { JSONValue } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Output, streamText } from '../generate-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';

describe('streamText types', () => {
  describe('output', () => {
    it('should infer text output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<Promise<string>>();
    });

    it('should infer object output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        Promise<{ value: string }>
      >();
    });

    it('should infer array output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<Promise<string[]>>();
    });

    it('should infer choice output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        Promise<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<Promise<JSONValue>>();
    });
  });
});
