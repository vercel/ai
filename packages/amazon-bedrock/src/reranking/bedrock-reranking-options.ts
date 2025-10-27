import { z } from 'zod/v4';

export type BedrockRerankingModelId =
  | 'amazon.rerank-v1:0'
  | 'cohere.rerank-v3-5:0'
  | (string & {});

export const bedrockRerankingProviderOptions = z.object({
  /**
   * If the total number of results was greater than could fit in a response, a token is returned in the nextToken field. You can enter that token in this field to return the next batch of results.
   */
  nextToken: z.string().optional(),

  /**
   * Additional model request fields to pass to the model.
   */
  additionalModelRequestFields: z.record(z.string(), z.any()).optional(),
});
