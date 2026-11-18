import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

// https://docs.parallel.ai/api-reference/decisions/make-web-grounded-typed-decisions
export const parallelDecisionResponseSchema = lazySchema(() => {
  const probability = z.number().min(0).max(1);
  return zodSchema(
    z.object({
      answers: z.record(
        z.string(),
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('noul'), noul: probability }),
          z.object({
            type: z.literal('choice'),
            choice: z.string(),
            probabilities: z.record(z.string(), probability),
            confidence: probability.nullish(),
          }),
          z.object({
            type: z.literal('score'),
            score: z.number(),
            probabilities: z.record(z.string(), probability),
            legend: z.record(z.string(), z.string()),
            confidence: probability.nullish(),
          }),
          z.object({ type: z.literal('refusal') }),
        ]),
      ),
      citations: z.array(
        z.object({
          url: z.string(),
          title: z.string().nullish(),
          excerpts: z.array(z.string()),
        }),
      ),
      decision_id: z.string(),
      mode: z.string(),
      usage: z.object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.literal(0),
      }),
    }),
  );
});

export const parallelErrorSchema = lazySchema(() =>
  zodSchema(z.object({ error: z.object({ message: z.string() }) })),
);
