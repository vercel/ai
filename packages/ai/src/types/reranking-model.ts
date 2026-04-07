import { RerankingModelV3 } from '@ai-sdk/provider';

/**
 * Reranking model that is used by the AI SDK.
 */
<<<<<<< HEAD
export type RerankingModel = RerankingModelV3;
=======
export type RerankingModel = string | RerankingModelV4 | RerankingModelV3;
>>>>>>> 664a0eb8d (feat(ai/core): support plain string model IDs in rerank() (#14203))
