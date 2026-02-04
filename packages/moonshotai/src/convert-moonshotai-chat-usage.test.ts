import { describe, it, expect } from 'vitest';
import { convertMoonshotAIChatUsage } from './convert-moonshotai-chat-usage';

describe('convertMoonshotAIChatUsage', () => {
  it('should handle null usage', () => {
    const result = convertMoonshotAIChatUsage(null);

    expect(result).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('should handle undefined usage', () => {
    const result = convertMoonshotAIChatUsage(undefined);

    expect(result).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    });
  });

  it('should convert basic usage without caching or reasoning', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    });
  });

  it('should convert usage with total_tokens', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    });
  });

  it('should convert usage with top-level cached_tokens (Moonshot format)', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      cached_tokens: 30,
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: 30,
    });
  });

  it('should convert usage with nested cached_tokens (OpenAI format)', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: {
        cached_tokens: 25,
      },
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: 25,
    });
  });

  it('should prioritize top-level cached_tokens over nested', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      cached_tokens: 40,
      prompt_tokens_details: {
        cached_tokens: 25,
      },
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: 40,
    });
  });

  it('should convert usage with reasoning tokens', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 80,
      completion_tokens_details: {
        reasoning_tokens: 30,
      },
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 80,
      totalTokens: undefined,
      reasoningTokens: 30,
      cachedInputTokens: undefined,
    });
  });

  it('should convert usage with both cached and reasoning tokens', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: 100,
      completion_tokens: 80,
      cached_tokens: 35,
      completion_tokens_details: {
        reasoning_tokens: 30,
      },
    });

    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 80,
      totalTokens: undefined,
      reasoningTokens: 30,
      cachedInputTokens: 35,
    });
  });

  it('should handle null values in usage fields', () => {
    const result = convertMoonshotAIChatUsage({
      prompt_tokens: null,
      completion_tokens: null,
      cached_tokens: null,
    });

    expect(result).toEqual({
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    });
  });
});
