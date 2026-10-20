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
      title: z.string().optional(),
      providerMetadata: providerMetadataSchema.optional(),
    }),
    z.object({
      type: z.literal('source'),
      sourceType: z.literal('document'),
      id: z.string(),
      mediaType: z.string(),
      title: z.string(),
      filename: z.string().optional(),
      providerMetadata: providerMetadataSchema.optional(),
    }),
  ]),
  startIndex: z.number().int().nonnegative().optional(),
  endIndex: z.number().int().nonnegative().optional(),
  citedText: z.string().optional(),
});
