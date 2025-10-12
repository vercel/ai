import { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const buildAI21Metadata = (
  usage: z.infer<typeof ai21UsageSchema> | undefined,
) => {
  return usage == null
    ? undefined
    : {
        ai21: {
          promptCacheHitTokens: usage.prompt_cache_hit_tokens ?? NaN,
          promptCacheMissTokens: usage.prompt_cache_miss_tokens ?? NaN,
        },
      };
};

export const ai21MetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }: { parsedBody: unknown }) => {
    const parsed = await safeValidateTypes({
      value: parsedBody,
      schema: ai21ResponseSchema,
    });

    return !parsed.success || parsed.value.usage == null
      ? undefined
      : buildAI21Metadata(parsed.value.usage);
  },

  createStreamExtractor: () => {
    let usage: z.infer<typeof ai21UsageSchema> | undefined;

    return {
      processChunk: async (chunk: unknown) => {
        const parsed = await safeValidateTypes({
          value: chunk,
          schema: ai21StreamChunkSchema,
        });

        if (
          parsed.success &&
          parsed.value.choices?.[0]?.finish_reason === 'stop' &&
          parsed.value.usage
        ) {
          usage = parsed.value.usage;
        }
      },
      buildMetadata: () => buildAI21Metadata(usage),
    };
  },
};

const ai21UsageSchema = z.object({
  prompt_cache_hit_tokens: z.number().nullish(),
  prompt_cache_miss_tokens: z.number().nullish(),
});

const ai21ResponseSchema = z.object({
  usage: ai21UsageSchema.nullish(),
});

const ai21StreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: ai21UsageSchema.nullish(),
});
