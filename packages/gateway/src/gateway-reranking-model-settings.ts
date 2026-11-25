import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayRerankingModelId =
  | GatewayModelIds['reranking']
  | (string & {});
