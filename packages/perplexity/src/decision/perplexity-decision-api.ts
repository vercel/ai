import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const perplexityDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      model: z.enum(['pplx-decider-v1-27b', 'pplx-decider-v1.1-27b']),
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
            confidence: z.number(),
            probabilities: z.record(z.string(), z.number()),
          }),
          z.object({
            type: z.literal('score'),
            score: z.number(),
            confidence: z.number(),
            legend: z.record(z.string(), z.string()),
            probabilities: z.record(z.string(), z.number()),
          }),
        ]),
      ),
      usage: z.object({
        input_tokens: z.number().nullish(),
        output_tokens: z.number().nullish(),
      }),
    }),
  ),
);

export const perplexitySuccessfulResponseHandler = createJsonResponseHandler(
  perplexityDecisionResponseSchema,
);

const perplexityErrorResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        type: z.string(),
        param: z.string().nullish().optional(),
        code: z.string().nullish().optional(),
      }),
    }),
  ),
);

export const perplexityFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: perplexityErrorResponseSchema,
  errorToMessage: error => error.error.message,
});
