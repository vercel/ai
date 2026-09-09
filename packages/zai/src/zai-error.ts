import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { z } from 'zod/v4';

const zaiErrorDetailsSchema = z.object({
  code: z.union([z.number(), z.string()]).nullish(),
  message: z.string(),
});

const zaiErrorSchema = z.union([
  zaiErrorDetailsSchema,
  z.object({ error: zaiErrorDetailsSchema }),
]);

export type ZaiErrorData = z.infer<typeof zaiErrorSchema>;

export const zaiErrorStructure: ProviderErrorStructure<ZaiErrorData> = {
  errorSchema: zaiErrorSchema,
  errorToMessage: data => ('error' in data ? data.error.message : data.message),
};
