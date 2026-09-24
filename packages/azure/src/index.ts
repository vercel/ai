import type { DeepSeekChatOptions } from '@ai-sdk/deepseek';

export type AzureDeepSeekLanguageModelOptions = Omit<
  DeepSeekChatOptions,
  'thinking'
>;
/** @deprecated Use `AzureDeepSeekLanguageModelOptions` instead. */
export type AzureDeepSeekChatOptions = AzureDeepSeekLanguageModelOptions;

<<<<<<< HEAD
=======
export type {
  OpenAILanguageModelResponsesOptions,
  OpenAIResponsesSystemMessageOptions,
  /** @deprecated Use `OpenAILanguageModelResponsesOptions` instead. */
  OpenAILanguageModelResponsesOptions as OpenAIResponsesProviderOptions,
  OpenAILanguageModelChatOptions,
  /** @deprecated Use `OpenAILanguageModelChatOptions` instead. */
  OpenAILanguageModelChatOptions as OpenAIChatLanguageModelOptions,
} from '@ai-sdk/openai';

>>>>>>> 0fb3a22413 (Backport: feat(openai): support message-level reasoning effort updates (#21421))
export { azure, createAzure } from './azure-openai-provider';
export type {
  AzureOpenAIProvider,
  AzureOpenAIProviderSettings,
} from './azure-openai-provider';
export { VERSION } from './version';
