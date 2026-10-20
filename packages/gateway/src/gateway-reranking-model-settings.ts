export type GatewayRerankingModelId =
  | 'cohere/rerank-v3.5'
  | 'cohere/rerank-v4-fast'
  | 'cohere/rerank-v4-pro'
  | 'voyage/rerank-2.5'
  | 'voyage/rerank-2.5-lite'
  | 'voyage/rerank-3'
  | 'voyage/rerank-3-lite'
  | (string & {});
