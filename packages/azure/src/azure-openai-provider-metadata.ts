import { z } from 'zod/v4';
import {
  responsesOutputTextProviderMetadataSchema,
  responsesSourceDocumentProviderMetadataSchema,
} from '@ai-sdk/openai/internal';

/**
 * TODO:
 * After PR #10252 is merged, the keys of these Zod objects will need to be changed from `openai` to `azure`.
 * With Zod parsing, the provider can be identified more reliably, making it easier to determine which endpoint should be used.
 */

// zod parse for text providerMetadata come from annotation(ex.code interpreter)
export const azureResponsesOutputTextProviderMetadataSchema = z.object({
  openai: responsesOutputTextProviderMetadataSchema,
});

// zod parse for source-document providerMetadata come from annotation(ex.code interpreter)
export const azureResponsesSourceDocumentProviderMetadataSchema = z.object({
  openai: responsesSourceDocumentProviderMetadataSchema,
});
