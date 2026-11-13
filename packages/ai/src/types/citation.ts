import type { LanguageModelV4Citation } from '@ai-sdk/provider';
import type { $ZodType } from 'zod/v4/core';
import { z, type ZodType } from '../util/zod';
import {
  providerMetadataSchema,
  type ProviderMetadata,
} from './provider-metadata';

/** A reference supporting a generated text part. */
export type Citation = LanguageModelV4Citation;

/**
 * Creates a citation schema that validates the provider metadata of the
 * source with the given schema.
 */
export function createCitationSchema(
  providerMetadataSchema: $ZodType<ProviderMetadata>,
): ZodType<Citation> {
  return z.object({
    source: z.discriminatedUnion('sourceType', [
      z.object({
        type: z.literal('source'),
        sourceType: z.literal('url'),
        id: z.string(),
        url: z.string(),
        title: z.optional(z.string()),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
      z.object({
        type: z.literal('source'),
        sourceType: z.literal('document'),
        id: z.string(),
        mediaType: z.string(),
        title: z.string(),
        filename: z.optional(z.string()),
        providerMetadata: z.optional(providerMetadataSchema),
      }),
    ]),
    startIndex: z.optional(z.number().check(z.int()).check(z.nonnegative())),
    endIndex: z.optional(z.number().check(z.int()).check(z.nonnegative())),
    citedText: z.optional(z.string()),
  });
}

export const citationSchema: ZodType<Citation> = createCitationSchema(
  providerMetadataSchema,
);
