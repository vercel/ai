export type {
  OpenAIResponsesProviderOptions,
  OpenAIChatLanguageModelOptions,
} from '@ai-sdk/openai';

export { azure, createAzure } from './azure-openai-provider';
export type {
  AzureOpenAIProvider,
  AzureOpenAIProviderSettings,
} from './azure-openai-provider';
export {
  azureResponsesOutputTextProviderMetadataSchema,
  azureResponsesSourceDocumentProviderMetadataSchema,
} from './azure-openai-provider-metadata';
export { VERSION } from './version';
