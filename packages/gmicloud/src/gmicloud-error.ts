import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const gmicloudErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
    details: z.string().nullish(),
  }),
});

export type GmicloudErrorData = z.infer<typeof gmicloudErrorDataSchema>;

function unwrapDetailsMessage(details: string | null | undefined) {
  if (details == null || details === '') {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = secureJsonParse(details);
  } catch {
    return undefined;
  }
  const message = (parsed as { error?: { message?: unknown } })?.error?.message;
  return typeof message === 'string' && message.trim() !== ''
    ? message
    : undefined;
}

export const gmicloudErrorStructure: ProviderErrorStructure<GmicloudErrorData> =
  {
    errorSchema: gmicloudErrorDataSchema,
    errorToMessage: data =>
      unwrapDetailsMessage(data.error.details) ?? data.error.message,
  };
