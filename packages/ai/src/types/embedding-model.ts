import { EmbeddingModelV2, EmbeddingModelV2Embedding } from '@ai-sdk/provider';

/**
Embedding model that is used by the AI SDK Core functions.
*/
export type EmbeddingModel<VALUE = string> = string | EmbeddingModelV2<VALUE>;

/**
Embedding.
 */
export type Embedding = EmbeddingModelV2Embedding;
