import { MetadataProcessor } from '@ai-sdk/openai-compatible';
import { z } from 'zod';

const buildDeepseekMetadata = (
  usage: z.infer<typeof DeepSeekUsageSchema> | undefined,
) => {
  if (usage) {
    return {
      deepseek: {
        promptCacheHitTokens: usage.prompt_cache_hit_tokens ?? NaN,
        promptCacheMissTokens: usage.prompt_cache_miss_tokens ?? NaN,
      },
    };
  }
  return undefined;
};

export const DeepSeekMetadataProcessor: MetadataProcessor = {
  buildMetadataFromResponse: (response: unknown) => {
    const parsed = DeepSeekResponseSchema.safeParse(response);
    if (!parsed.success || !parsed.data.usage) return undefined;
    return buildDeepseekMetadata(parsed.data.usage);
  },
  createStreamingMetadataProcessor: () => {
    let finalUsage: z.infer<typeof DeepSeekUsageSchema> | undefined;

    return {
      processChunk: (chunk: unknown) => {
        const parsed = DeepSeekStreamChunkSchema.safeParse(chunk);
        if (!parsed.success) return;

        if (
          parsed.data.choices?.[0]?.finish_reason === 'stop' &&
          parsed.data.usage
        ) {
          finalUsage = parsed.data.usage;
        }
      },
      buildFinalMetadata: () => buildDeepseekMetadata(finalUsage),
    };
  },
};

const DeepSeekUsageSchema = z.object({
  prompt_cache_hit_tokens: z.number().nullish(),
  prompt_cache_miss_tokens: z.number().nullish(),
});

const DeepSeekResponseSchema = z.object({
  usage: DeepSeekUsageSchema.nullish(),
});

const DeepSeekStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: DeepSeekUsageSchema.nullish(),
});
