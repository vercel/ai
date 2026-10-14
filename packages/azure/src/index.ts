import type { DeepSeekLanguageModelChatOptions } from '@ai-sdk/deepseek';

export type AzureDeepSeekLanguageModelOptions = Omit<
  DeepSeekLanguageModelChatOptions,
  'thinking'
>;
/** @deprecated Use `AzureDeepSeekLanguageModelOptions` instead. */
export type AzureDeepSeekChatOptions = AzureDeepSeekLanguageModelOptions;
export type {
  OpenAILanguageModelResponsesOptions,
  OpenAIResponsesSystemMessageOptions,
  /** @deprecated Use `OpenAILanguageModelResponsesOptions` instead. */
  OpenAILanguageModelResponsesOptions as OpenAIResponsesProviderOptions,
  OpenAILanguageModelChatOptions,
  /** @deprecated Use `OpenAILanguageModelChatOptions` instead. */
  OpenAILanguageModelChatOptions as OpenAIChatLanguageModelOptions,
} from '@ai-sdk/openai';

export { azure, createAzure } from './azure-openai-provider';
export type {
  AzureOpenAIProvider,
  AzureOpenAIProviderSettings,
} from './azure-openai-provider';
export type {
  AzureResponsesProviderMetadata,
  AzureResponsesReasoningProviderMetadata,
  AzureResponsesTextProviderMetadata,
  AzureResponsesSourceDocumentProviderMetadata,
} from './azure-openai-provider-metadata';
export { VERSION } from './version';
export type { AzureImageModelOptions } from './azure-image-model-options';
export type { AzureSpeechModelOptions } from './azure-speech-model-options';
export type { AzureTranscriptionModelOptions } from './azure-transcription-model-options';
export type { AzureTranscriptionProviderMetadata } from './azure-transcription-provider-metadata';
