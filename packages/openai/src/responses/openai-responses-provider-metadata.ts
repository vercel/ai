import { z } from 'zod/v4';
import {
  responsesOutputTextProviderMetadataSchema,
  responsesSourceDocumentProviderMetadataSchema,
} from './openai-responses-api';

// zod parse for text providerMetadata come from annotation(ex.code interpreter)
export const openaiResponsesOutputTextProviderMetadataSchema = z.object({
  openai: responsesOutputTextProviderMetadataSchema,
});

// zod parse for source-document providerMetadata come from annotation(ex.code interpreter)
export const openaiResponsesSourceDocumentProviderMetadataSchema = z.object({
  openai: responsesSourceDocumentProviderMetadataSchema,
});
