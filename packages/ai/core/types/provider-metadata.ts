import {
  SharedV2ProviderMetadata,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider';
import { z } from 'zod';
import { jsonValueSchema } from './json-value';

/**
Additional provider-specific metadata that is returned from the provider.

This is needed to enable provider-specific functionality that can be
fully encapsulated in the provider.
 */
export type ProviderMetadata = SharedV2ProviderMetadata;

/**
Additional provider-specific options.

They are passed through to the provider from the AI SDK and enable
provider-specific functionality that can be fully encapsulated in the provider.
 */
export type ProviderOptions = SharedV2ProviderOptions;

/**
Additional provider-specific request options.

They are NOT passed through to the provider from the AI SDK, they are used to
change how requests are sent, e.g. how many requests and at what intervval.
 */
export type ProviderRequestOptions = SharedV2ProviderOptions;

export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema),
);
