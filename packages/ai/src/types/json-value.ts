import { JSONValue as OriginalJSONValue } from '@ai-sdk/provider';
import { z } from 'zod/v4';
import { JSONValueLoose as OriginalJSONValueLoose } from '@ai-sdk/provider';

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), jsonValueSchema),
    z.array(jsonValueSchema),
  ]),
);

export const jsonValueLooseSchema: z.ZodType<JSONValueLoose> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), z.union([jsonValueLooseSchema, z.undefined()])),
    z.array(z.union([jsonValueLooseSchema, z.undefined()])),
  ]),
);

export type JSONValue = OriginalJSONValue;
export type JSONValueLoose = OriginalJSONValueLoose;
