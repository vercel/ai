import { describe, expectTypeOf, it } from 'vitest';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import type { $ZodType } from 'zod/v4/core';
import {
  asSchema,
  zodSchema,
  type InferSchema,
  type StandardSchema,
} from './schema';
import { tool } from './types/tool';
import type { InferToolInput } from './types/infer-tool-input';
import type { InferToolOutput } from './types/infer-tool-output';

describe('InferSchema type', () => {
  it('should work with StandardSchema', () => {
    type MySchema = StandardSchema<number>;
    type Result = InferSchema<MySchema>;

    expectTypeOf<Result>().toMatchTypeOf<number>();
  });

  it('infers transformed Zod 3 output through Standard Schema', () => {
    const schema = z3.object({
      value: z3.string().transform(value => value.length),
      label: z3.string().optional(),
    });

    expectTypeOf<InferSchema<typeof schema>>().toEqualTypeOf<{
      value: number;
      label?: string;
    }>();
    expectTypeOf(asSchema(schema)._type).toEqualTypeOf<{
      value: number;
      label?: string;
    }>();
    expectTypeOf(zodSchema(schema)._type).toEqualTypeOf<{
      value: number;
      label?: string;
    }>();
  });

  it('infers transformed Zod 4 output', () => {
    const schema = z4.string().transform(value => value.length);

    expectTypeOf<InferSchema<typeof schema>>().toEqualTypeOf<number>();
    expectTypeOf(asSchema(schema)._type).toEqualTypeOf<number>();
    expectTypeOf(zodSchema(schema)._type).toEqualTypeOf<number>();
  });

  it('supports Zod core schemas without the classic methods', () => {
    type CoreSchema = $ZodType<{ value: number }, { value: string }>;
    expectTypeOf<InferSchema<CoreSchema>>().toEqualTypeOf<{ value: number }>();
  });

  it('infers Zod 3 tool inputs and generator yields', () => {
    const weather = tool({
      inputSchema: z3.object({ city: z3.string() }),
      async *execute({ city }) {
        expectTypeOf(city).toEqualTypeOf<string>();
        yield { state: 'loading' as const };
        yield { state: 'ready' as const, weather: city };
      },
    });

    expectTypeOf<InferToolInput<typeof weather>>().toEqualTypeOf<{
      city: string;
    }>();
    expectTypeOf<InferToolOutput<typeof weather>>().toEqualTypeOf<
      | { state: 'loading'; weather?: never }
      | { state: 'ready'; weather: string }
    >();
  });
});
