import {
  lazySchema,
  zodSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export const zirnayDecisionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string().nullish(),
      object: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      decision: z
        .object({
          selected_candidate_id: z.string().nullish(),
          confidence: z.number().nullish(),
          calibrated_probability: z.number().nullish(),
          margin_over_second: z.number().nullish(),
        })
        .nullish(),
      candidate_scores: z
        .array(
          z.object({
            candidate_id: z.string(),
            raw_logit: z.number().nullish(),
            calibrated_prob: z.number().nullish(),
            utility_score: z.number().nullish(),
          }),
        )
        .nullish(),
      audit_trail: z
        .object({
          reasoning_code: z.string().nullish(),
          explanation: z.string().nullish(),
          citations: z
            .array(
              z.object({
                source: z.string().nullish(),
                id: z.string().nullish(),
                relevance: z.number().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
      telemetry: z
        .object({
          latency_ms: z.number().nullish(),
          expected_calibration_error: z.number().nullish(),
          permutation_rounds: z.number().nullish(),
          data_retention: z.string().nullish(),
        })
        .nullish(),
      usage: z
        .object({
          input_tokens: z.number().nullish(),
          output_tokens: z.number().nullish(),
        })
        .nullish(),
    }),
  ),
);

export const zirnayFeedbackResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      feedback_id: z.string().nullish(),
      request_id: z.string().nullish(),
      model_slug: z.string().nullish(),
      predicted_outcome: z.string().nullish(),
      actual_outcome: z.union([z.string(), z.number(), z.boolean()]).nullish(),
      feedback_type: z.string().nullish(),
      cache_cleared: z.boolean().nullish(),
      ingested_to_buffer: z.boolean().nullish(),
      created_at: z.string().nullish(),
    }),
  ),
);

export const zirnayFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.object({
    message: z.string().nullish(),
    detail: z.unknown().nullish(),
    error: z
      .union([z.string(), z.object({ message: z.string().nullish() })])
      .nullish(),
  }),
  errorToMessage: error =>
    error.message ??
    (typeof error.error === 'string' ? error.error : error.error?.message) ??
    (typeof error.detail === 'string'
      ? error.detail
      : JSON.stringify(error.detail)) ??
    'Zirnay request failed',
});
