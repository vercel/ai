import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// OpenAPI 1.0.0: https://docs.scaledown.ai/api-reference/openapi.json
// The prose reference additionally documents the "classify" model alias:
// https://docs.scaledown.ai/api-reference/decisions
export const scaledownDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      model: z.string().nullish(),
      answers: z.record(
        z.string(),
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('noul'), noul: z.number() }),
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
            legend: z.record(z.string(), z.string()).nullish(),
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
    }),
  ),
);
