import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * GMI Cloud's edge proxy wraps backend rejections in a generic banner:
 *
 * ```json
 * {"error":{"message":"Backend request failed with status 400",
 *           "type":"backend_error","code":400,
 *           "details":"{\"error\":{\"message\":\"The request is invalid:
 *             Invalid max_tokens value, the valid range of max_tokens is
 *             [1, 393216]. ...\"}}"}}
 * ```
 *
 * The default OpenAI-compatible error structure lifts `error.message`, which
 * is the banner; the engine's actual diagnostic sits in `error.details`, a
 * stringified JSON document with its own `error.message`. Envelope verified
 * live against api.gmi-serving.com across max_tokens, thinking-mode
 * tool_choice, and image-input rejections (2026-08).
 *
 * This schema extends the default with `details`, and `errorToMessage`
 * unwraps the inner engine message. Anything unexpected (absent, non-JSON,
 * or misshapen details) falls back to the outer message, matching default
 * behavior.
 */
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
