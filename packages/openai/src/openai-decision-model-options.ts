import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openaiDecisionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** An opaque end-user identifier for safety monitoring, up to 128 characters. */
      safetyIdentifier: z.string().max(128).optional(),
    }),
  ),
);

export type OpenAIDecisionModelOptions = InferSchema<
  typeof openaiDecisionModelOptions
>;
