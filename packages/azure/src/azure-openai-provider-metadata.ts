import {
  ResponsesSourceDocumentProviderMetadata,
  ResponsesTextProviderMetadata,
} from '@ai-sdk/openai/internal';

export type AzureResponsesTextProviderMetadata = {
  azure: ResponsesTextProviderMetadata;
};

export type AzureResponsesSourceDocumentProviderMetadata = {
  azure: ResponsesSourceDocumentProviderMetadata;
};
