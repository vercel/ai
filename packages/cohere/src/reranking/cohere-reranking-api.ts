import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.cohere.com/v2/reference/rerank
export type CohereRerankingInput = {
  model: string;
  query: string;
  documents: string[];
  top_n: number | undefined;
  max_tokens_per_doc: number | undefined;
  priority: number | undefined;
};

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const cohereRerankingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      results: z.array(
        z.object({
          index: z.number(),
          relevance_score: z.number(),
        }),
      ),
      meta: z.any(),
    }),
  ),
);
