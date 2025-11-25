import { z } from 'zod/v4';
import {
  responsesOutputTextProviderMetadataSchema,
  responsesSourceDocumentProviderMetadataSchema,
} from '@ai-sdk/openai/internal';

// zod parse for text providerMetadata come from annotation(ex.code interpreter)
export const azureResponsesOutputTextProviderMetadataSchema = z.object({
  azure: responsesOutputTextProviderMetadataSchema,
});

// zod parse for source-document providerMetadata come from annotation(ex.code interpreter)
export const azureResponsesSourceDocumentProviderMetadataSchema = z.object({
  azure: responsesSourceDocumentProviderMetadataSchema,
});
