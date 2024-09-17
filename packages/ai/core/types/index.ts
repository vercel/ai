import type {
  LanguageModelUsage as LanguageModelUsageOriginal,
  EmbeddingModelUsage as EmbeddingModelUsageOriginal,
} from './usage';

export * from './embedding-model';
export * from './language-model';
export type { Provider } from './provider';
export type { ProviderMetadata } from './provider-metadata';

/**
 * @deprecated Use LanguageModelUsage instead.
 */
export type TokenUsage = LanguageModelUsageOriginal;
/**
 * @deprecated Use LanguageModelUsage instead.
 */
export type CompletionTokenUsage = LanguageModelUsageOriginal;
export type LanguageModelUsage = LanguageModelUsageOriginal;

/**
 * @deprecated Use EmbeddingModelUsage instead.
 */
export type EmbeddingTokenUsage = EmbeddingModelUsageOriginal;
export type EmbeddingModelUsage = EmbeddingModelUsageOriginal;
