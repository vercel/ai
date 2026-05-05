import { describe, expect, it } from 'vitest';
import { convertBaiduChatUsage } from './convert-baidu-chat-usage';

describe('convertBaiduChatUsage', () => {
  it('should return the default usage shape for undefined input', () => {
    expect(convertBaiduChatUsage(undefined)).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": undefined,
          "cacheWrite": undefined,
          "noCache": undefined,
          "total": undefined,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": undefined,
          "total": undefined,
        },
        "raw": undefined,
      }
    `);
  });

  it('should return the default usage shape for null input', () => {
    expect(convertBaiduChatUsage(null)).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": undefined,
          "cacheWrite": undefined,
          "noCache": undefined,
          "total": undefined,
        },
        "outputTokens": {
          "reasoning": undefined,
          "text": undefined,
          "total": undefined,
        },
        "raw": undefined,
      }
    `);
  });

  it('should convert standard OpenAI-compatible usage', () => {
    expect(
      convertBaiduChatUsage({
        prompt_tokens: 120,
        completion_tokens: 45,
        total_tokens: 165,
        prompt_tokens_details: {
          cached_tokens: 20,
        },
        completion_tokens_details: {
          reasoning_tokens: 5,
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 20,
          "cacheWrite": undefined,
          "noCache": 100,
          "total": 120,
        },
        "outputTokens": {
          "reasoning": 5,
          "text": 40,
          "total": 45,
        },
        "raw": {
          "completion_tokens": 45,
          "completion_tokens_details": {
            "reasoning_tokens": 5,
          },
          "prompt_tokens": 120,
          "prompt_tokens_details": {
            "cached_tokens": 20,
          },
          "total_tokens": 165,
        },
      }
    `);
  });

  it('should preserve the raw usage object', () => {
    const usage = {
      prompt_tokens: 9,
      completion_tokens: 3,
      total_tokens: 12,
      prompt_tokens_details: {
        cached_tokens: 1,
      },
      completion_tokens_details: {
        reasoning_tokens: 2,
      },
    };

    expect(convertBaiduChatUsage(usage).raw).toBe(usage);
  });
});
