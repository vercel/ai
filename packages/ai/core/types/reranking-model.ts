import {
  RerankingModelV1,
  RerankingModelV1DocumentIndex,
} from '@ai-sdk/provider';

/**
Reranking model that is used by the AI SDK Core functions.
*/
export type RerankingModel<VALUE> = RerankingModelV1<VALUE>;

/**
RerankedDocumentIndex is a index of reranked documents.
 */
export type RerankedDocumentIndex = RerankingModelV1DocumentIndex;
