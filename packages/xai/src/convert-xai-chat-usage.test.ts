import { convertXaiChatUsage } from './convert-xai-chat-usage';
import { describe, it, expect } from 'vitest';

describe('convertXaiChatUsage', () => {
  it('should convert basic usage without caching or reasoning', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 100,
        "outputTokens": 50,
        "reasoningTokens": undefined,
        "totalTokens": 150,
      }
    `);
  });

  it('should convert usage with cached tokens (inclusive reporting)', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 200,
      completion_tokens: 50,
      total_tokens: 250,
      prompt_tokens_details: {
        cached_tokens: 150,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": 150,
        "inputTokens": 200,
        "outputTokens": 50,
        "reasoningTokens": undefined,
        "totalTokens": 250,
      }
    `);
  });

  it('should convert usage with reasoning tokens', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 100,
      completion_tokens: 254,
      total_tokens: 734,
      completion_tokens_details: {
        reasoning_tokens: 380,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 100,
        "outputTokens": 634,
        "reasoningTokens": 380,
        "totalTokens": 734,
      }
    `);
  });

  it('should handle cached_tokens exceeding prompt_tokens (non-inclusive reporting)', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 4142,
      completion_tokens: 254,
      total_tokens: 8724,
      prompt_tokens_details: {
        cached_tokens: 4328,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": 4328,
        "inputTokens": 8470,
        "outputTokens": 254,
        "reasoningTokens": undefined,
        "totalTokens": 8724,
      }
    `);
  });

  it('should handle undefined usage', () => {
    const result = convertXaiChatUsage(undefined);

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": undefined,
        "outputTokens": undefined,
        "reasoningTokens": undefined,
        "totalTokens": undefined,
      }
    `);
  });

  it('should handle null token details', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: null,
      completion_tokens_details: null,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 100,
        "outputTokens": 50,
        "reasoningTokens": undefined,
        "totalTokens": 150,
      }
    `);
  });
});
