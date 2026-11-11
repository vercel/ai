import { expectTypeOf, it } from 'vitest';
import type { ZodType } from 'zod/v4';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import { modelMessageSchema } from './message';

it('preserves the public classic Zod type and composition methods', () => {
  expectTypeOf(modelMessageSchema).toEqualTypeOf<ZodType<ModelMessage>>();
  expectTypeOf(modelMessageSchema.optional().parse(undefined)).toEqualTypeOf<
    ModelMessage | undefined
  >();
  expectTypeOf(modelMessageSchema.array().parse([])).toEqualTypeOf<
    ModelMessage[]
  >();
});
