import { describe, expect, it } from 'vitest';
import { convertAnthropicMessagesUsage } from './convert-anthropic-messages-usage';

describe('convertAnthropicMessagesUsage', () => {
  it('should use usage as raw when rawUsage is not provided', () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 20,
    };

    const result = convertAnthropicMessagesUsage({ usage });

    expect(result.raw).toBe(usage);
  });

  it('should use rawUsage as raw when provided', () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 20,
    };
    const rawUsage = {
      input_tokens: 10,
      output_tokens: 20,
      service_tier: 'standard',
      inference_geo: 'not_available',
      cache_creation: {
        ephemeral_5m_input_tokens: 0,
        ephemeral_1h_input_tokens: 0,
      },
    };

    const result = convertAnthropicMessagesUsage({ usage, rawUsage });

    expect(result.raw).toBe(rawUsage);
  });

  it('should compute token totals correctly with cache tokens', () => {
    const result = convertAnthropicMessagesUsage({
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 3,
      },
    });

    expect(result.inputTokens).toEqual({
      total: 18,
      noCache: 10,
      cacheRead: 3,
      cacheWrite: 5,
    });
    expect(result.outputTokens).toEqual({
      total: 20,
      text: undefined,
      reasoning: undefined,
    });
  });
});
