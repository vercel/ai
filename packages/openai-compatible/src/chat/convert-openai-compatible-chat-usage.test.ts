import { createNullLanguageModelUsage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertOpenAICompatibleChatUsage } from './convert-openai-compatible-chat-usage';

describe('convertOpenAICompatibleChatUsage', () => {
  it('returns null usage when usage is missing', () => {
    expect(convertOpenAICompatibleChatUsage(undefined)).toEqual(
      createNullLanguageModelUsage(),
    );
  });

  it('splits completion tokens into text and reasoning', () => {
    expect(
      convertOpenAICompatibleChatUsage({
        prompt_tokens: 10,
        completion_tokens: 20,
        completion_tokens_details: { reasoning_tokens: 5 },
      }),
    ).toEqual({
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: { total: 20, text: 15, reasoning: 5 },
      raw: {
        prompt_tokens: 10,
        completion_tokens: 20,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    });
  });

  it('clamps text tokens at 0 when reasoning exceeds completion', () => {
    // Provider-inconsistent usage (Baseten Kimi-K3, finish_reason 'length'):
    // completion_tokens undercounts the actual generation, so
    // completion_tokens_details.reasoning_tokens > completion_tokens.
    const usage = {
      prompt_tokens: 951,
      completion_tokens: 6000,
      total_tokens: 6952,
      prompt_tokens_details: { cached_tokens: 60 },
      completion_tokens_details: { reasoning_tokens: 6001 },
    };

    expect(convertOpenAICompatibleChatUsage(usage)).toEqual({
      inputTokens: {
        total: 951,
        noCache: 891,
        cacheRead: 60,
        cacheWrite: undefined,
      },
      outputTokens: { total: 6000, text: 0, reasoning: 6001 },
      raw: usage,
    });
  });

  it('uses top-level prompt cache hit tokens as cache read tokens', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 40,
    };

    expect(convertOpenAICompatibleChatUsage(usage)).toEqual({
      inputTokens: {
        total: 100,
        noCache: 60,
        cacheRead: 40,
        cacheWrite: undefined,
      },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
      raw: usage,
    });
  });

  it('prefers prompt token details cache tokens over top-level cache hits', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 40,
      prompt_tokens_details: { cached_tokens: 10 },
    };

    expect(convertOpenAICompatibleChatUsage(usage)).toEqual({
      inputTokens: {
        total: 100,
        noCache: 90,
        cacheRead: 10,
        cacheWrite: undefined,
      },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
      raw: usage,
    });
  });
});
