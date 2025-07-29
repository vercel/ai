export type GatewayEmbeddingModelId =
  | 'openai/text-embedding-3-small'
  | 'openai/text-embedding-3-large'
  | 'openai/text-embedding-ada-002'
  | 'amazon/titan-embed-text-v2:0'
  | (string & {});
