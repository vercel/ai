import { MetadataExtractor } from '@ai-sdk/openai-compatible';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const buildDeepseekMetadata = (
  usage: z.infer<typeof deepSeekUsageSchema> | undefined,
) => {
  return usage == null
    ? undefined
    : {
        deepseek: {
          promptCacheHitTokens: usage.prompt_cache_hit_tokens ?? NaN,
          promptCacheMissTokens: usage.prompt_cache_miss_tokens ?? NaN,
        },
      };
};

export const deepSeekMetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }: { parsedBody: unknown }) => {
    const parsed = await safeValidateTypes({
      value: parsedBody,
      schema: deepSeekResponseSchema,
    });

    return !parsed.success || parsed.value.usage == null
      ? undefined
      : buildDeepseekMetadata(parsed.value.usage);
  },

  createStreamExtractor: () => {
    let usage: z.infer<typeof deepSeekUsageSchema> | undefined;

    return {
      processChunk: async (chunk: unknown) => {
        const parsed = await safeValidateTypes({
          value: chunk,
          schema: deepSeekStreamChunkSchema,
        });

        if (
          parsed.success &&
          parsed.value.choices?.[0]?.finish_reason === 'stop' &&
          parsed.value.usage
        ) {
          usage = parsed.value.usage;
        }
      },
      buildMetadata: () => buildDeepseekMetadata(usage),
    };
  },
};

const deepSeekUsageSchema = z.object({
  prompt_cache_hit_tokens: z.number().nullish(),
  prompt_cache_miss_tokens: z.number().nullish(),
});

const deepSeekResponseSchema = z.object({
  usage: deepSeekUsageSchema.nullish(),
});

const deepSeekStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
      }),
    )
    .nullish(),
  usage: deepSeekUsageSchema.nullish(),
});
