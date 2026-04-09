import {
  ResponsesProviderMetadata,
  ResponsesReasoningProviderMetadata,
  ResponsesSourceDocumentProviderMetadata,
  ResponsesTextProviderMetadata,
} from '@ai-sdk/openai/internal';

export type AzureAIFoundryResponsesProviderMetadata = {
  azureAIFoundry: ResponsesProviderMetadata;
};

export type AzureAIFoundryResponsesReasoningProviderMetadata = {
  azureAIFoundry: ResponsesReasoningProviderMetadata;
};

export type AzureAIFoundryResponsesTextProviderMetadata = {
  azureAIFoundry: ResponsesTextProviderMetadata;
};

export type AzureAIFoundryResponsesSourceDocumentProviderMetadata = {
  azureAIFoundry: ResponsesSourceDocumentProviderMetadata;
};
