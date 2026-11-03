import type { JSONValue as OriginalJSONValue } from '@ai-sdk/provider';
import { z, type ZodType } from '../util/zod';

export const jsonValueSchema: ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), jsonValueSchema.optional()),
    z.array(jsonValueSchema),
  ]),
);

export type JSONValue = OriginalJSONValue;
