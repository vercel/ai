import type { SharedV4ProviderMetadata } from '@ai-sdk/provider';
import { z, type ZodType } from '../util/zod';
import { jsonValueSchema } from './json-value';

/**
 * Additional provider-specific metadata that is returned from the provider.
 *
 * This is needed to enable provider-specific functionality that can be
 * fully encapsulated in the provider.
 */
export type ProviderMetadata = SharedV4ProviderMetadata;

export const providerMetadataSchema: ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema.optional()),
);
