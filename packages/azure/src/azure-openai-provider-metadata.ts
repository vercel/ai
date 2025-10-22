import {
  openaiResponsesTextUIPartProviderMetadataSchema,
  openaiSourceExecutionFileProviderMetadataSchema,
} from '@ai-sdk/openai';
import { z } from 'zod/v4';

export const azureResponsesTextUIPartProviderMetadataSchema = z.object({
  azure: openaiResponsesTextUIPartProviderMetadataSchema.shape.openai,
});

export const azureSourceExecutionFileProviderMetadataSchema = z.object({
  azure: openaiSourceExecutionFileProviderMetadataSchema.shape.openai,
});
