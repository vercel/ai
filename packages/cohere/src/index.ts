export type {
  CohereLanguageModelOptions,
  /** @deprecated Use `CohereLanguageModelOptions` instead. */
  CohereLanguageModelOptions as CohereChatModelOptions,
} from './cohere-chat-options';
export { cohere, createCohere } from './cohere-provider';
export type { CohereProvider, CohereProviderSettings } from './cohere-provider';
export type { CohereEmbeddingModelOptions } from './cohere-embedding-options';
export type {
  CohereRerankingModelOptions,
  /** @deprecated Use `CohereRerankingModelOptions` instead. */
  CohereRerankingModelOptions as CohereRerankingOptions,
} from './reranking/cohere-reranking-options';
export { VERSION } from './version';
