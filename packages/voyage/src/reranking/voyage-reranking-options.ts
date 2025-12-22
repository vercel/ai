import { FlexibleSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.voyageai.com/docs/reranker
export type VoyageRerankingModelId =
  | 'rerank-2.5'
  | 'rerank-2.5-lite'
  | 'rerank-2'
  | 'rerank-2-lite'
  | 'rerank-1'
  | 'rerank-lite-1'
  | (string & {});

export type VoyageRerankingOptions = {
  /**
   * Whether to truncate the input to satisfy the context length limit.
   * If true, the input will be truncated to fit the context length limit.
   * If false, an error will be raised if the input exceeds the context length limit.
   *
   * @default true
   */
  truncation?: boolean;
};

export const voyageRerankingOptionsSchema: FlexibleSchema<VoyageRerankingOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        truncation: z.boolean().optional(),
      }),
    ),
  );
