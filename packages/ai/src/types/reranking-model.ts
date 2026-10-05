import type { GatewayRerankingModelId } from '@ai-sdk/gateway';
import type { RerankingModelV3, RerankingModelV4 } from '@ai-sdk/provider';

/**
 * Reranking model that is used by the AI SDK.
 */
export type RerankingModel =
  | GatewayRerankingModelId
  | RerankingModelV4
  | RerankingModelV3;
