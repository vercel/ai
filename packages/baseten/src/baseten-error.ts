import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { z } from 'zod/v4';

export type BasetenErrorData = z.infer<typeof basetenErrorSchema>;

// Model APIs return a string; dedicated deployments may return an
// OpenAI-compatible error object.
const basetenErrorSchema = z.object({
  error: z.union([
    z.string(),
    z.object({
      message: z.string(),
      object: z.string().nullish(),
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  ]),
});

export const basetenErrorStructure: ProviderErrorStructure<BasetenErrorData> = {
  errorSchema: basetenErrorSchema,
  errorToMessage: data =>
    typeof data.error === 'string' ? data.error : data.error.message,
};
