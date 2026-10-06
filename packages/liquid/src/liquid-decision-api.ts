import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// Based on Liquid's official Decision Models documentation, checked 2026-10-06.
// No public OpenAPI specification was available.
// https://docs.liquid.ai/lfm/models/decision-models
export const liquidDecisionResponseSchema = z.object({
  model: z.string().nullish(),
  answers: z.record(
    z.string(),
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('noul'),
        noul: z.number(),
      }),
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
    ]),
  ),
  usage: z
    .object({
      input_tokens: z.number().nullish(),
      output_tokens: z.number().nullish(),
      cost: z.number().nullish(),
    })
    .nullish(),
});

export const liquidFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.object({
    message: z.string().nullish(),
    detail: z.unknown().nullish(),
    error: z
      .union([z.string(), z.object({ message: z.string().nullish() })])
      .nullish(),
    error_type: z.string().nullish(),
  }),
  errorToMessage: error =>
    error.message ??
    (typeof error.error === 'string' ? error.error : error.error?.message) ??
    (typeof error.detail === 'string'
      ? error.detail
      : error.detail == null
        ? undefined
        : JSON.stringify(error.detail)) ??
    error.error_type ??
    'Liquid request failed',
});
