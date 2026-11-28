export { createDeepSeek, deepseek } from './deepseek-provider';
export type {
  DeepSeekProvider,
  DeepSeekProviderSettings,
} from './deepseek-provider';
export { VERSION } from './version';
export type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelOptions,
  DeepSeekMessageProviderOptions,
<<<<<<< HEAD
  /** @deprecated Use `DeepSeekLanguageModelOptions` instead. */
  DeepSeekLanguageModelOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-options';
=======
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekLanguageModelOptions,
  /** @deprecated Use `DeepSeekLanguageModelChatOptions` instead. */
  DeepSeekLanguageModelChatOptions as DeepSeekChatOptions,
} from './chat/deepseek-chat-language-model-options';
export type { DeepSeekLanguageModelResponsesOptions } from './responses/deepseek-responses-language-model-options';
>>>>>>> f9d43bdaa7 (feat(provider/deepseek): add Responses API model and web search tool (#24304))
export type { DeepSeekErrorData } from './chat/deepseek-chat-api-types';
export type { DeepSeekFilePartProviderOptions } from './chat/deepseek-file-part-options';
