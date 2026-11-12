import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const googleDecisionResponseSchema = lazySchema(() => {
  const probability = z.number().min(0).max(1);
  return zodSchema(
    z.object({
      answers: z
        .record(
          z.string(),
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('noul'),
              noul: probability,
              confidence: probability.nullish(),
            }),
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
              confidence: probability.nullish(),
              legend: z.record(z.string(), z.string()).nullish(),
            }),
          ]),
        )
        .nullish(),
      usage: z
        .object({
          total_input_tokens: z.number().nullish(),
          total_output_tokens: z.number().nullish(),
          total_tokens: z.number().nullish(),
          input_tokens_by_modality: z
            .array(z.object({ modality: z.string(), tokens: z.number() }))
            .nullish(),
        })
        .nullish(),
      prompt_feedback: z
        .object({
          block_reason: z.string().nullish(),
          block_reason_message: z.string().nullish(),
        })
        .nullish(),
    }),
  );
});
