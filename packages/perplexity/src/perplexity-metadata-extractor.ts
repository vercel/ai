import { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const buildPerplexityMetadata = (
  citations: string[] | undefined,
  images: z.infer<typeof perplexityImageSchema>[] | undefined,
  usage: z.infer<typeof perplexityUsageSchema> | undefined,
) => {
  return citations || images || usage
    ? {
        perplexity: {
          ...(citations && { citations }),
          ...(images && {
            images: images.map(image => ({
              imageUrl: image.image_url,
              originUrl: image.origin_url,
              height: image.height,
              width: image.width,
            })),
          }),
          ...(usage && {
            usage: {
              citationTokens: usage.citation_tokens ?? NaN,
              numSearchQueries: usage.num_search_queries ?? NaN,
            },
          }),
        },
      }
    : undefined;
};

export const perplexityMetadataExtractor: MetadataExtractor = {
  extractMetadata: ({ parsedBody }: { parsedBody: unknown }) => {
    const parsed = safeValidateTypes({
      value: parsedBody,
      schema: perplexityResponseSchema,
    });

    return !parsed.success
      ? undefined
      : buildPerplexityMetadata(
          parsed.value.citations ?? undefined,
          parsed.value.images ?? undefined,
          parsed.value.usage ?? undefined,
        );
  },

  createStreamExtractor: () => {
    let citations: string[] | undefined;
    let images: z.infer<typeof perplexityImageSchema>[] | undefined;
    let usage: z.infer<typeof perplexityUsageSchema> | undefined;

    return {
      processChunk: (chunk: unknown) => {
        const parsed = safeValidateTypes({
          value: chunk,
          schema: perplexityStreamChunkSchema,
        });

        if (parsed.success) {
          // Update citations and usage with latest data from each chunk
          if (parsed.value.citations) {
            citations = parsed.value.citations;
          }
          if (parsed.value.images) {
            images = parsed.value.images;
          }
          if (parsed.value.usage) {
            usage = parsed.value.usage;
          }
        }
      },
      buildMetadata: () => buildPerplexityMetadata(citations, images, usage),
    };
  },
};

// Schema for citations
const perplexityCitationSchema = z.array(z.string());

const perplexityImageSchema = z.object({
  image_url: z.string(),
  origin_url: z.string(),
  height: z.number(),
  width: z.number(),
});

const perplexityUsageSchema = z.object({
  citation_tokens: z.number().nullish(),
  num_search_queries: z.number().nullish(),
});

// Update response schema to include usage
const perplexityResponseSchema = z.object({
  citations: perplexityCitationSchema.nullish(),
  images: z.array(perplexityImageSchema).nullish(),
  usage: perplexityUsageSchema.nullish(),
});

// Update stream chunk schema to match example format
const perplexityStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        delta: z
          .object({
            role: z.string(),
            content: z.string(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  citations: perplexityCitationSchema.nullish(),
  images: z.array(perplexityImageSchema).nullish(),
  usage: perplexityUsageSchema.nullish(),
});
