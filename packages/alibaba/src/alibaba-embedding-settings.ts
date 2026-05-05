export type AlibabaEmbeddingModelId =
  | 'text-embedding-v4'
  | 'text-embedding-v3'
  | (string & {});

export const modelMaxEmbeddingsPerCall: Record<string, number> = {
  'text-embedding-v4': 10,
  'text-embedding-v3': 50,
};
