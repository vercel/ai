import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type PerplexityDecisionModelId =
  | 'pplx-decider-v1.2'
  | 'pplx-decider-flash-v1.2'
  | 'pplx-decider-latest'
  | 'pplx-decider-flash-latest'
  | 'perplexity/pplx-decider-latest'
  | 'perplexity/pplx-decider-flash-latest'
  | 'pplx-decider-v1.1-27b'
  | 'pplx-decider-v1-27b'
  | (string & {});

export const perplexityDecisionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** Search the web before answering the questions. */
      mode: z.literal('web_grounding').optional(),
      /** Maximum age in seconds of a fetched page. Does not filter search results. */
      maxStaleness: z.number().int().nonnegative().optional(),
    }),
  ),
);

export type PerplexityDecisionModelOptions = InferSchema<
  typeof perplexityDecisionModelOptions
>;
