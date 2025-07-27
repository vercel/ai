import { RerankingModelV2, RerankingModelV2Result } from '@ai-sdk/provider';

/**
Reranking model that is used by the AI SDK Core functions.
*/
export type RerankingModel<VALUE> = RerankingModelV2<VALUE>;

/**Reranked index that contains the index of the document and its relevance score.
 */
export type RerankedResultIndex = RerankingModelV2Result;
