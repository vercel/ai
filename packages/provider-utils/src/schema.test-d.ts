import { describe, expectTypeOf, it } from 'vitest';
import { InferSchema, StandardSchema } from './schema';

describe('InferSchema type', () => {
  it('should work with StandardSchema', () => {
    type MySchema = StandardSchema<number>;
    type Result = InferSchema<MySchema>;

    expectTypeOf<Result>().toMatchTypeOf<number>();
  });
});
