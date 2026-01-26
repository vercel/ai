export type {
  OpenAIResponsesProviderOptions,
  OpenAIChatLanguageModelOptions,
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
