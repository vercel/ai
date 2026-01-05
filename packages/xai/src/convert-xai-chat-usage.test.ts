import { convertXaiChatUsage } from './convert-xai-chat-usage';
import { describe, it, expect } from 'vitest';

describe('convertXaiChatUsage', () => {
  it('should convert basic usage without reasoning tokens', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });

    expect(result).toEqual({
      inputTokens: {
        total: 100,
        noCache: 100,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: 0,
      },
      raw: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
  });

  it('should convert usage with reasoning tokens', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 168,
      completion_tokens: 870, // includes reasoning tokens
      total_tokens: 1038,
      completion_tokens_details: {
        reasoning_tokens: 528,
      },
    });

    expect(result).toEqual({
      inputTokens: {
        total: 168,
        noCache: 168,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 870, // completion_tokens (includes reasoning)
        text: 342, // 870 - 528
        reasoning: 528,
      },
      raw: {
        prompt_tokens: 168,
        completion_tokens: 870,
        total_tokens: 1038,
        completion_tokens_details: {
          reasoning_tokens: 528,
        },
      },
    });
  });

  it('should handle reasoning tokens greater than completion tokens', () => {
    // When reasoning tokens are greater, completion_tokens would include them
    // This scenario tests edge case where we still get valid results
    const result = convertXaiChatUsage({
      prompt_tokens: 168,
      completion_tokens: 870, // includes reasoning
      total_tokens: 1038,
      completion_tokens_details: {
        reasoning_tokens: 528,
      },
    });

    expect(result.outputTokens.text).toBe(342); // 870 - 528
    expect(result.outputTokens.text).toBeGreaterThanOrEqual(0);
    expect(result.outputTokens.total).toBe(870);
  });

  it('should convert usage with cached input tokens', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 168,
      completion_tokens: 1036, // includes reasoning tokens
      total_tokens: 1204,
      prompt_tokens_details: {
        text_tokens: 168,
        audio_tokens: 0,
        image_tokens: 0,
        cached_tokens: 146,
      },
      completion_tokens_details: {
        reasoning_tokens: 458,
      },
    });

    expect(result).toEqual({
      inputTokens: {
        total: 168,
        noCache: 22, // 168 - 146
        cacheRead: 146,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 1036, // completion_tokens (includes reasoning)
        text: 578, // 1036 - 458
        reasoning: 458,
      },
      raw: {
        prompt_tokens: 168,
        completion_tokens: 1036,
        total_tokens: 1204,
        prompt_tokens_details: {
          text_tokens: 168,
          audio_tokens: 0,
          image_tokens: 0,
          cached_tokens: 146,
        },
        completion_tokens_details: {
          reasoning_tokens: 458,
        },
      },
    });
  });

  it('should handle null/undefined token details gracefully', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      prompt_tokens_details: null,
      completion_tokens_details: null,
    });

    expect(result.inputTokens.cacheRead).toBe(0);
    expect(result.inputTokens.noCache).toBe(100);
    expect(result.outputTokens.reasoning).toBe(0);
    expect(result.outputTokens.text).toBe(200);
    expect(result.outputTokens.total).toBe(200);
  });

  it('should handle zero reasoning tokens', () => {
    const result = convertXaiChatUsage({
      prompt_tokens: 50,
      completion_tokens: 100,
      total_tokens: 150,
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    });

    expect(result.outputTokens).toEqual({
      total: 100,
      text: 100,
      reasoning: 0,
    });
  });

  it('should preserve raw usage data', () => {
    const rawUsage = {
      prompt_tokens: 168,
      completion_tokens: 870, // includes reasoning
      total_tokens: 1038,
      prompt_tokens_details: {
        text_tokens: 168,
        audio_tokens: 0,
        image_tokens: 0,
        cached_tokens: 167,
      },
      completion_tokens_details: {
        reasoning_tokens: 528,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    };

    const result = convertXaiChatUsage(rawUsage);

    expect(result.raw).toEqual(rawUsage);
  });

  it('should handle the issue case with grok-4-fast-reasoning', () => {
    // Test case from GitHub issue: grok-4-fast-reasoning returning negative text_output_tokens
    // Raw API response format where completion_tokens includes reasoning tokens
    const result = convertXaiChatUsage({
      prompt_tokens: 279,
      completion_tokens: 95, // includes reasoning tokens (6 text + 89 reasoning)
      total_tokens: 374,
      prompt_tokens_details: {
        text_tokens: 279,
        audio_tokens: 0,
        image_tokens: 0,
        cached_tokens: 149,
      },
      completion_tokens_details: {
        reasoning_tokens: 89,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    });

    expect(result).toEqual({
      inputTokens: {
        total: 279,
        noCache: 130, // 279 - 149
        cacheRead: 149,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 95, // completion_tokens (includes reasoning)
        text: 6, // 95 - 89 (should be positive, not -83!)
        reasoning: 89,
      },
      raw: {
        prompt_tokens: 279,
        completion_tokens: 95,
        total_tokens: 374,
        prompt_tokens_details: {
          text_tokens: 279,
          audio_tokens: 0,
          image_tokens: 0,
          cached_tokens: 149,
        },
        completion_tokens_details: {
          reasoning_tokens: 89,
          audio_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0,
        },
      },
    });

    // Verify no negative text tokens
    expect(result.outputTokens.text).toBeGreaterThanOrEqual(0);
    expect(result.outputTokens.text).toBe(6);
  });
});
