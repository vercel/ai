import type { GatewayModelIds } from './gateway-model-catalog';

export type GatewayEmbeddingModelId =
  | GatewayModelIds['embedding']
  | (string & {});
