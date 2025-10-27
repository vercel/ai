import { z } from 'zod/v4';

// see https://docs.together.ai/docs/serverless-models#rerank-models
export type TogetherAIRerankingModelId =
  | 'Salesforce/Llama-Rank-v1'
  | 'mixedbread-ai/Mxbai-Rerank-Large-V2'
  | (string & {});

export const togetheraiRerankingOptions = z.object({
  /**
   * List of keys in the JSON Object document to rank by.
   * Defaults to use all supplied keys for ranking.
   *
   * @example ["title", "text"]
   */
  rankFields: z.array(z.string()).optional(),
});

export type TogetherAIRerankingOptions = z.infer<
  typeof togetheraiRerankingOptions
>;
