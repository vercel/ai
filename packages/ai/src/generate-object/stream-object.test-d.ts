import { JSONValue } from '@ai-sdk/provider';
import { expectTypeOf } from 'vitest';
import { z } from 'zod/v4';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { FinishReason } from '../types';
import { streamObject } from './stream-object';

describe('streamObject', () => {
  it('should have finishReason property with correct type', () => {
    const result = streamObject({
      schema: z.object({ number: z.number() }),
      model: undefined!,
    });

    expectTypeOf<typeof result.finishReason>().toEqualTypeOf<
      Promise<FinishReason>
    >();
  });

  it('should support enum types', async () => {
    const result = await streamObject({
      output: 'enum',
      enum: ['a', 'b', 'c'] as const,
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<
      Promise<'a' | 'b' | 'c'>
    >;

    for await (const text of result.partialObjectStream) {
      expectTypeOf(text).toEqualTypeOf<string>();
    }
  });

  it('should support schema types', async () => {
    const result = streamObject({
      schema: z.object({ number: z.number() }),
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<
      Promise<{ number: number }>
    >();
  });

  it('should support no-schema output mode', async () => {
    const result = streamObject({
      output: 'no-schema',
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<Promise<JSONValue>>();
  });

  it('should support array output mode', async () => {
    const result = streamObject({
      output: 'array',
      schema: z.number(),
      model: undefined!,
    });

    expectTypeOf<typeof result.partialObjectStream>().toEqualTypeOf<
      AsyncIterableStream<number[]>
    >();
    expectTypeOf<typeof result.object>().toEqualTypeOf<Promise<number[]>>();
  });
});
