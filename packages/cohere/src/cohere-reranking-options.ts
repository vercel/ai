import { z } from 'zod/v4';

export type CohereRerankingModelId =
  | 'rerank-v3.5'
  | 'rerank-english-v3.0'
  | 'rerank-multilingual-v3.0'
  | 'rerank-english-v2.0'
  | 'rerank-multilingual-v2.0'
  | (string & {});

export const cohereRerankingOptions = z.object({
  /**
   * Long documents will be automatically truncated to the specified number of tokens.
   *
   * @default 4096
   */
  maxTokensPerDoc: z.number().optional(),
});

export type cohereRerankingOptions = z.infer<typeof cohereRerankingOptions>;
