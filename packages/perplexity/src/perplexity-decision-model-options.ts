import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { PerplexityModelIds } from './perplexity-model-catalog';

export type PerplexityDecisionModelId =
  | PerplexityModelIds['decision']
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
