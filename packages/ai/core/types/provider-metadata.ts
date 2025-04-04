import { LanguageModelV2ProviderMetadata } from '@ai-sdk/provider';
import { z } from 'zod';
import { jsonValueSchema } from './json-value';

/**
Additional provider-specific metadata that is returned from the provider.

This is needed to enable provider-specific functionality that can be
fully encapsulated in the provider.
 */
export type ProviderMetadata = LanguageModelV2ProviderMetadata;

/**
Additional provider-specific options.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
// TODO change to LanguageModelV2ProviderOptions in language model v2
export type ProviderOptions = LanguageModelV2ProviderMetadata;

export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema),
);
