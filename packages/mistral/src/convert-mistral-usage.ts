import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const mistralPromptTokensDetailsSchema = z
  .object({
    messages: z.array(z.json()).nullish(),
    cached_tokens: z.number().nullish(),
    audio_tokens: z.number().nullish(),
  })
  .catchall(z.json());

const mistralCompletionTokensDetailsSchema = z
  .object({
    reasoning_tokens: z.number().nullish(),
  })
  .catchall(z.json());

export const mistralUsageSchema = z
  .object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
    prompt_audio_seconds: z.number().nullish(),
    request_count: z.number().nullish(),
    service_tier: z.string().nullish(),
    num_cached_tokens: z.number().nullish(),
    prompt_tokens_details: mistralPromptTokensDetailsSchema.nullish(),
    prompt_token_details: mistralPromptTokensDetailsSchema.nullish(),
    completion_tokens_details: mistralCompletionTokensDetailsSchema.nullish(),
  })
  .catchall(z.json());

export type MistralUsage = z.infer<typeof mistralUsageSchema>;

export function convertMistralUsage(
  usage: MistralUsage | undefined | null,
): LanguageModelV4Usage {
  if (usage == null) {
    return createNullLanguageModelUsage();
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  const cacheReadTokens =
    usage.num_cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens ??
    usage.prompt_token_details?.cached_tokens ??
    0;

  return {
    inputTokens: {
      total: promptTokens,
      noCache: promptTokens - cacheReadTokens,
      cacheRead: cacheReadTokens || undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completionTokens,
      text: completionTokens,
      reasoning: undefined,
    },
    raw: usage,
  };
}
