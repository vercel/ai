import {
  ResponsesCompactionProviderMetadata,
  ResponsesProviderMetadata,
  ResponsesReasoningProviderMetadata,
  ResponsesSourceDocumentProviderMetadata,
  ResponsesTextProviderMetadata,
} from '@ai-sdk/openai/internal';

export type AzureResponsesProviderMetadata = {
  azure: ResponsesProviderMetadata;
};

export type AzureResponsesReasoningProviderMetadata = {
  azure: ResponsesReasoningProviderMetadata;
};

export type AzureResponsesCompactionProviderMetadata = {
  azure: ResponsesCompactionProviderMetadata;
};

export type AzureResponsesTextProviderMetadata = {
  azure: ResponsesTextProviderMetadata;
};

export type AzureResponsesSourceDocumentProviderMetadata = {
  azure: ResponsesSourceDocumentProviderMetadata;
};
