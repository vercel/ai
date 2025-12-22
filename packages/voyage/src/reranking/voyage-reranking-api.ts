import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.voyageai.com/docs/reranker
export type VoyageRerankingInput = {
  model: string;
  query: string;
  documents: string[];
  top_k: number | undefined;
  truncation: boolean | undefined;
};

export const voyageRerankingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      object: z.string().optional(),
      data: z.array(
        z.object({
          index: z.number(),
          relevance_score: z.number(),
          document: z.string().optional(),
        }),
      ),
      model: z.string().optional(),
      usage: z
        .object({
          total_tokens: z.number(),
        })
        .optional(),
    }),
  ),
);
