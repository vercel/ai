export { createDeepSeek, deepseek } from './deepseek-provider';
export type {
  DeepSeekProvider,
  DeepSeekProviderSettings,
} from './deepseek-provider';
export { VERSION } from './version';
export type {
  DeepSeekLanguageModelOptions,
  /** @deprecated Use `DeepSeekLanguageModelOptions` instead. */
  DeepSeekLanguageModelOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-options';
export type { DeepSeekErrorData } from './chat/deepseek-chat-api-types';
