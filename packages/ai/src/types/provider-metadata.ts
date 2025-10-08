<<<<<<< HEAD
import { SharedV2ProviderMetadata } from '@ai-sdk/provider';
import { z } from 'zod/v4';
=======
import { SharedV3ProviderMetadata } from '@ai-sdk/provider';
import * as z from 'zod/v4';
>>>>>>> 95f65c281 (chore(ai): load zod schemas lazily (#9275))
import { jsonValueSchema } from './json-value';

/**
Additional provider-specific metadata that is returned from the provider.

This is needed to enable provider-specific functionality that can be
fully encapsulated in the provider.
 */
export type ProviderMetadata = SharedV2ProviderMetadata;

export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema),
);
