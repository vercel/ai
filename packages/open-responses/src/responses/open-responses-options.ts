import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openResponsesOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      reasoningEffort: z
        .enum(['none', 'low', 'medium', 'high', 'xhigh'])
        .nullish(),
      /**
       * Controls reasoning summary output from the model.
       * Valid values: 'concise', 'detailed', 'auto'.
       */
      reasoningSummary: z.enum(['concise', 'detailed', 'auto']).nullish(),
    }),
  ),
);

export type OpenResponsesOptions = InferSchema<
  typeof openResponsesOptionsSchema
>;
