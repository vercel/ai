import type { LanguageModelV4Citation } from '@ai-sdk/provider';
import { z, type ZodType } from '../util/zod';
import { providerMetadataSchema } from './provider-metadata';

/** A reference supporting a generated text part. */
export type Citation = LanguageModelV4Citation;

export const citationSchema: ZodType<Citation> = z.object({
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
