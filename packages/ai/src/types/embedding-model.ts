import { EmbeddingModelV2, EmbeddingModelV3, EmbeddingModelV3Embedding } from '@ai-sdk/provider';

/**
Embedding model that is used by the AI SDK Core functions.
*/
export type EmbeddingModel<VALUE = string> = string | EmbeddingModelV3<VALUE> | EmbeddingModelV2<VALUE>;

/**
Embedding.
 */
export type Embedding = EmbeddingModelV3Embedding;
