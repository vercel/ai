import { z } from 'zod/v4';

export type OpenAIEmbeddingModelId =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | (string & {});

export const openaiEmbeddingProviderOptions = z.object({
  /**
The number of dimensions the resulting output embeddings should have.
Only supported in text-embedding-3 and later models.
   */
  dimensions: z.number().optional(),

  /**
A unique identifier representing your end-user, which can help OpenAI to
monitor and detect abuse. Learn more.
*/
  user: z.string().optional(),
});

export type OpenAIEmbeddingProviderOptions = z.infer<
  typeof openaiEmbeddingProviderOptions
>;
