import { expectTypeOf } from 'vitest';
import { generateObject } from './generate-object';
import { z } from 'zod/v4';
import { JSONValue } from '@ai-sdk/provider';

describe('generateObject', () => {
  it('should support enum types', async () => {
    const result = await generateObject({
      output: 'enum',
      enum: ['a', 'b', 'c'] as const,
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<'a' | 'b' | 'c'>;
  });

  it('should support schema types', async () => {
    const result = await generateObject({
      schema: z.object({ number: z.number() }),
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<{ number: number }>();
  });

  it('should support no-schema output mode', async () => {
    const result = await generateObject({
      output: 'no-schema',
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<JSONValue>();
  });

  it('should support array output mode', async () => {
    const result = await generateObject({
      output: 'array',
      schema: z.number(),
      model: undefined!,
    });

    expectTypeOf<typeof result.object>().toEqualTypeOf<number[]>();
  });
});
