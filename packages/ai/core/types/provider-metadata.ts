import { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';
import { z } from 'zod';
import { jsonValueSchema } from './json-value';

/**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
export type ProviderMetadata = LanguageModelV1ProviderMetadata;

export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema),
);
