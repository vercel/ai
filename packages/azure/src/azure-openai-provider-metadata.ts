import {
  ResponsesProviderMetadata,
  ResponsesSourceDocumentProviderMetadata,
  ResponsesTextProviderMetadata,
} from '@ai-sdk/openai/internal';

export type AzureResponsesProviderMetadata = {
  azure: ResponsesProviderMetadata;
};

export type AzureResponsesTextProviderMetadata = {
  azure: ResponsesTextProviderMetadata;
};

export type AzureResponsesSourceDocumentProviderMetadata = {
  azure: ResponsesSourceDocumentProviderMetadata;
};
