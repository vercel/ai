import { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expectTypeOf, it } from 'vitest';
import { InferSchema } from './schema';

describe('InferSchema type', () => {
  it('should work with fixed inputSchema', () => {
    type MySchema = StandardSchemaV1<unknown, number>;
    type Result = InferSchema<MySchema>;

    expectTypeOf<Result>().toMatchTypeOf<number>();
  });
});
