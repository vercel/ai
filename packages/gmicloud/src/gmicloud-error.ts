import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
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

// The parsed value is only read, never merged, so a guarded parse
// (secureJsonParse) is not required here; the v5 provider-utils package does
// not re-export it.
function tryParseDetails(details: string): unknown {
  try {
    return JSON.parse(details);
  } catch {
    return undefined;
  }
}

function unwrapDetailsMessage(details: string | null | undefined) {
  if (details == null || details === '') {
    return undefined;
  }
  const message = (
    tryParseDetails(details) as { error?: { message?: unknown } } | undefined
  )?.error?.message;
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
