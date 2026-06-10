import type { DeepSeekChatOptions } from '@ai-sdk/deepseek';

export type AzureDeepSeekLanguageModelOptions = Omit<
  DeepSeekChatOptions,
  'thinking'
>;
/** @deprecated Use `AzureDeepSeekLanguageModelOptions` instead. */
export type AzureDeepSeekChatOptions = AzureDeepSeekLanguageModelOptions;

export { azure, createAzure } from './azure-openai-provider';
export type {
  AzureOpenAIProvider,
  AzureOpenAIProviderSettings,
} from './azure-openai-provider';
export { VERSION } from './version';
