import type { CompletionTokenUsage as CompletionTokenUsageOriginal } from './token-usage';

export * from './embedding-model';
export * from './language-model';

/**
 * @deprecated Use CompletionTokenUsage instead.
 */
export type TokenUsage = CompletionTokenUsageOriginal;
export type CompletionTokenUsage = CompletionTokenUsageOriginal;

export type { EmbeddingTokenUsage } from './token-usage';
