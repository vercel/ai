import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.voyageai.com/docs/embeddings
export type VoyageEmbeddingInput = {
  model: string;
  input: string[];
  input_type: 'query' | 'document' | undefined;
  truncation: boolean | undefined;
  output_dimension: number | undefined;
  output_dtype: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary' | undefined;
};

export const voyageEmbeddingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      object: z.string().optional(),
      data: z.array(
        z.object({
          object: z.string().optional(),
          index: z.number(),
          embedding: z.array(z.number()),
        }),
      ),
      model: z.string().optional(),
      usage: z.object({
        total_tokens: z.number(),
      }),
    }),
  ),
);
