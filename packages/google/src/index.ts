export type { GoogleErrorData } from './google-error';
export type {
  GoogleLanguageModelOptions,
  /** @deprecated Use `GoogleLanguageModelOptions` instead. */
  GoogleLanguageModelOptions as GoogleGenerativeAIProviderOptions,
} from './google-options';
export type {
  GoogleProviderMetadata,
  /** @deprecated Use `GoogleProviderMetadata` instead. */
  GoogleProviderMetadata as GoogleGenerativeAIProviderMetadata,
} from './google-prompt';
export type {
  GoogleImageModelOptions,
  /** @deprecated Use `GoogleImageModelOptions` instead. */
  GoogleImageModelOptions as GoogleGenerativeAIImageProviderOptions,
} from './google-image-model';
export type {
  GoogleEmbeddingModelOptions,
  /** @deprecated Use `GoogleEmbeddingModelOptions` instead. */
  GoogleEmbeddingModelOptions as GoogleGenerativeAIEmbeddingProviderOptions,
} from './google-embedding-options';
export type {
  GoogleVideoModelOptions,
  /** @deprecated Use `GoogleVideoModelOptions` instead. */
  GoogleVideoModelOptions as GoogleGenerativeAIVideoProviderOptions,
} from './google-video-model';
export type {
  GoogleVideoModelId,
  /** @deprecated Use `GoogleVideoModelId` instead. */
  GoogleVideoModelId as GoogleGenerativeAIVideoModelId,
} from './google-video-settings';
export type { GoogleFilesUploadOptions } from './google-files';
export {
  createGoogle,
  google,
  /** @deprecated Use `createGoogle` instead. */
  createGoogle as createGoogleGenerativeAI,
} from './google-provider';
export type {
  GoogleProvider,
  GoogleProviderSettings,
  /** @deprecated Use `GoogleProvider` instead. */
  GoogleProvider as GoogleGenerativeAIProvider,
  /** @deprecated Use `GoogleProviderSettings` instead. */
  GoogleProviderSettings as GoogleGenerativeAIProviderSettings,
} from './google-provider';

export { VERSION } from './version';
