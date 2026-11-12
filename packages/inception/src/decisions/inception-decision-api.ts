import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Official OpenAPI 1.0.0: https://api.inceptionlabs.ai/openapi.json
// https://docs.inceptionlabs.ai/api-reference/decisions/create-a-decision
const probability = () => z.number().min(0).max(1);

export const inceptionDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      model: z.string().nullish(),
      answers: z.record(
        z.string(),
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('noul'), noul: probability() }),
          z.object({
            type: z.literal('choice'),
            choice: z.string(),
            probabilities: z.record(z.string(), probability()),
            confidence: probability().nullish(),
          }),
          z.object({
            type: z.literal('score'),
            score: z.number(),
            probabilities: z.record(z.string(), probability()),
            confidence: probability().nullish(),
            legend: z.record(z.string(), z.json()).nullish(),
          }),
        ]),
      ),
      usage: z
        .object({
          input_tokens: z.number().nullish(),
          output_tokens: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

export const inceptionDecisionErrorSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({ error: z.object({ message: z.string() }) }),
      z.object({
        detail: z.union([z.string(), z.array(z.object({ msg: z.string() }))]),
      }),
    ]),
  ),
);
