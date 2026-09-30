import type { JSONValue } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  Output,
  streamText,
  type StreamTextEndEvent,
  type StreamTextOnEndCallback,
} from '../generate-text';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import type { AsyncIterableStream } from '../util';
import type { DeepPartial } from '../util/deep-partial';

describe('streamText types', () => {
  describe('onFinish', () => {
    it('should infer structured output for reusable callbacks', () => {
      const output = Output.object({
        schema: z.object({ value: z.string() }),
      });
      const onFinish: StreamTextOnEndCallback<{}, typeof output> = event => {
        expectTypeOf(event).toEqualTypeOf<
          StreamTextEndEvent<{}, typeof output>
        >();
        expectTypeOf(event.output).toEqualTypeOf<
          { value: string } | undefined
        >();
      };

      streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello',
        tools: {},
        output,
        onFinish,
      });
    });

    it('should infer structured output', () => {
      streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello',
        output: Output.object({
          schema: z.object({ value: z.string() }),
        }),
        onFinish: event => {
          expectTypeOf(event.output).toEqualTypeOf<
            { value: string } | undefined
          >();
        },
      });
    });
  });
  describe('output', () => {
    it('should infer text output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer text output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<PromiseLike<string>>();
    });

    it('should infer object output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<{ value: string }>
      >();
    });

    it('should infer array output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<string[]>
      >();
    });

    it('should infer choice output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.output>().toEqualTypeOf<
        PromiseLike<JSONValue>
      >();
    });
  });

  describe('partialOutputStream', () => {
    it('should infer text partial output type (default)', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer text partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string>
      >();
    });

    it('should infer object partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<DeepPartial<{ value: string }>>
      >();
    });

    it('should infer array partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.string() }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<string[]>
      >();
    });

    it('should infer choice partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.choice({ options: ['a', 'b', 'c'] as const }),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<'a' | 'b' | 'c'>
      >();
    });

    it('should infer json partial output type', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.json(),
      });

      expectTypeOf<typeof result.partialOutputStream>().toEqualTypeOf<
        AsyncIterableStream<JSONValue>
      >();
    });
  });

  describe('elementStream', () => {
    it('should infer element type for array output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.array({ element: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<{ value: string }>
      >();
    });

    it('should infer never for text output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.text(),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for object output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
        output: Output.object({ schema: z.object({ value: z.string() }) }),
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });

    it('should infer never for default output', async () => {
      const result = streamText({
        model: new MockLanguageModelV3(),
        prompt: 'Hello, world!',
      });

      expectTypeOf<typeof result.elementStream>().toEqualTypeOf<
        AsyncIterableStream<never>
      >();
    });
  });

  it('should support model call settings in prepareStep', () => {
    streamText({
      model: new MockLanguageModelV3(),
      prompt: 'Hello, world!',
      prepareStep: async () => ({
        maxOutputTokens: 100,
        temperature: 0,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0,
        frequencyPenalty: -0.2,
        stopSequences: [],
        seed: 0,
      }),
    });
  });
});
