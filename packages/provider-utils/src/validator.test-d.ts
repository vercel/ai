import { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expectTypeOf, it } from 'vitest';
import { InferValidator } from './validator';

describe('InferValidator type', () => {
  it('should work with fixed inputSchema', () => {
    type MySchema = StandardSchemaV1<unknown, number>;
    type Result = InferValidator<MySchema>;

    expectTypeOf<Result>().toMatchTypeOf<number>();
  });
});
