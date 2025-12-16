import { z } from 'zod/v4';

export type BedrockEmbeddingModelId =
  | 'amazon.titan-embed-text-v1'
  | 'amazon.titan-embed-text-v2:0'
  | 'cohere.embed-english-v3'
  | 'cohere.embed-multilingual-v3'
  | (string & {});

export const bedrockEmbeddingProviderOptions = z.object({
  /**
The number of dimensions the resulting output embeddings should have (defaults to 1024).
Only supported in amazon.titan-embed-text-v2:0.
   */
  dimensions: z
    .union([z.literal(1024), z.literal(512), z.literal(256)])
    .optional(),

  /**
Flag indicating whether or not to normalize the output embeddings. Defaults to true
Only supported in amazon.titan-embed-text-v2:0.
 */
  normalize: z.boolean().optional(),

  /**
Input type for Cohere embedding models on Bedrock.
Common values: `search_document`, `search_query`, `classification`, `clustering`.
If not set, the provider defaults to `search_document`.
   */
  inputType: z
    .enum(['search_document', 'search_query', 'classification', 'clustering'])
    .optional(),

  /**
Truncation behavior for Cohere embedding models on Bedrock.
   */
  truncate: z.enum(['NONE', 'START', 'END']).optional(),
});
