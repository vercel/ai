import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// Verified against the official SDK at 66880ccded6cb642dc1809620c2b108c33730214.
// https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/types.ts
export const typesafeEvaluationResponseSchema = z.object({
  model: z.string().nullish(),
  answers: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('choice'),
        choice: z.string(),
        probabilities: z.record(z.string(), z.number()),
        confidence: z.number().nullish(),
      }),
      z.object({
        type: z.literal('score'),
        score: z.number(),
        probabilities: z.record(z.string(), z.number()),
        confidence: z.number().nullish(),
      }),
      z.object({ type: z.literal('noul'), noul: z.number() }),
    ]),
  ),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
    })
    .nullish(),
});

export const typesafeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.object({
    message: z.string().nullish(),
    detail: z.unknown().nullish(),
    error: z
      .union([z.string(), z.object({ message: z.string().nullish() })])
      .nullish(),
    // TypeSafe reports several failures, `max_tokens_exceeded` among them, as
    // a bare code with no prose field.
    error_type: z.string().nullish(),
  }),
  errorToMessage: error =>
    error.message ??
    (typeof error.error === 'string' ? error.error : error.error?.message) ??
    (typeof error.detail === 'string'
      ? error.detail
      : JSON.stringify(error.detail)) ??
    error.error_type ??
    'TypeSafe request failed',
});
