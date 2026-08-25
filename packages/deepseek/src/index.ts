export { createDeepSeek, deepseek } from './deepseek-provider';
export type {
  DeepSeekProvider,
  DeepSeekProviderSettings,
} from './deepseek-provider';
export { VERSION } from './version';
export type {
<<<<<<< HEAD
  DeepSeekLanguageModelOptions,
  /** @deprecated Use `DeepSeekLanguageModelOptions` instead. */
  DeepSeekLanguageModelOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-options';
=======
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekLanguageModelOptions,
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-language-model-options';
>>>>>>> f70bd8af37 (feat: support DeepSeek assistant prefix completion (#19402))
export type { DeepSeekErrorData } from './chat/deepseek-chat-api-types';
