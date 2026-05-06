export type { GoogleErrorData } from './google-error';
export type {
  GoogleLanguageModelOptions,
  /** @deprecated Use `GoogleLanguageModelOptions` instead. */
  GoogleLanguageModelOptions as GoogleGenerativeAIProviderOptions,
} from './google-generative-ai-options';
export type { GoogleGenerativeAIProviderMetadata } from './google-generative-ai-prompt';
export type {
  GoogleImageModelOptions,
  /** @deprecated Use `GoogleImageModelOptions` instead. */
  GoogleImageModelOptions as GoogleGenerativeAIImageProviderOptions,
} from './google-generative-ai-image-model';
export type {
  GoogleEmbeddingModelOptions,
  /** @deprecated Use `GoogleEmbeddingModelOptions` instead. */
  GoogleEmbeddingModelOptions as GoogleGenerativeAIEmbeddingProviderOptions,
} from './google-generative-ai-embedding-options';
export type {
  GoogleVideoModelOptions,
  /** @deprecated Use `GoogleVideoModelOptions` instead. */
  GoogleVideoModelOptions as GoogleGenerativeAIVideoProviderOptions,
} from './google-generative-ai-video-model';
export type { GoogleGenerativeAIVideoModelId } from './google-generative-ai-video-settings';
export type {
  GoogleLanguageModelInteractionsOptions,
  GoogleInteractionsModelId,
} from './interactions/google-interactions-language-model-options';
export type { GoogleInteractionsProviderMetadata } from './interactions/google-interactions-provider-metadata';
export type { GoogleInteractionsAgentName } from './interactions/google-interactions-agent';
export { createGoogleGenerativeAI, google } from './google-provider';
export type {
  GoogleGenerativeAIProvider,
  GoogleGenerativeAIProviderSettings,
} from './google-provider';
export { VERSION } from './version';
