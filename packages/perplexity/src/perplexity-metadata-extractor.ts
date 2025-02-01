import { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod';

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
    let images: PerplexityImageData[] | undefined;
    let usage: PerplexityUsageData | undefined;

    return {
      processChunk: (chunk: unknown) => {
        const parsed = safeValidateTypes({
          value: chunk,
          schema: perplexityStreamChunkSchema,
        });

        if (parsed.success) {
          citations = parsed.value.citations ?? citations;
          images = parsed.value.images ?? images;
          usage = parsed.value.usage ?? usage;
        }
      },
      buildMetadata: () => buildPerplexityMetadata(citations, images, usage),
    };
  },
};

const buildPerplexityMetadata = (
  citations: string[] | undefined,
  images: PerplexityImageData[] | undefined,
  usage: PerplexityUsageData | undefined,
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

const perplexityCitationSchema = z.array(z.string());

const perplexityImageSchema = z.object({
  image_url: z.string(),
  origin_url: z.string(),
  height: z.number(),
  width: z.number(),
});

type PerplexityImageData = z.infer<typeof perplexityImageSchema>;

const perplexityUsageSchema = z.object({
  citation_tokens: z.number().nullish(),
  num_search_queries: z.number().nullish(),
});

type PerplexityUsageData = z.infer<typeof perplexityUsageSchema>;

const perplexityResponseSchema = z.object({
  citations: perplexityCitationSchema.nullish(),
  images: z.array(perplexityImageSchema).nullish(),
  usage: perplexityUsageSchema.nullish(),
});

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
