export {
  createDeepSeek,
  deepSeek,
  /** @deprecated Use `deepSeek` instead. */
  deepSeek as deepseek,
} from './deepseek-provider';
export type {
  DeepSeekProvider,
  DeepSeekProviderSettings,
} from './deepseek-provider';
export { VERSION } from './version';
export type {
  DeepSeekLanguageModelChatOptions,
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekLanguageModelOptions,
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-language-model-options';
export type { DeepSeekLanguageModelResponsesOptions } from './responses/deepseek-responses-language-model-options';
export { deepseekTools, webSearch } from './tool';
export type { DeepSeekErrorData } from './chat/deepseek-chat-api-types';
export type { DeepSeekFilesOptions } from './files/deepseek-files-options';
