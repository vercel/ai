import type { JSONValue } from '@ai-sdk/provider';
import { z } from 'zod/v4';

export const openaiResponsesTextFormatSchema = () =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text') }),
    z.object({
      type: z.literal('json_schema'),
      name: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_-]+$/),
      schema: z.record(z.string(), z.json() as z.ZodType<JSONValue>),
      description: z.string().optional(),
      strict: z.boolean().optional(),
    }),
  ]);

export type OpenAIResponsesTextFormat = z.infer<
  ReturnType<typeof openaiResponsesTextFormatSchema>
>;
