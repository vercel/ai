import { RerankingModelV3 } from '@ai-sdk/provider';
export type { RerankedDocument } from '@ai-sdk/provider';

/**
Reranking model that is used by the AI SDK Core functions.
*/
export type RerankingModel<VALUE> = RerankingModelV3<VALUE>;
