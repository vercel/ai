import { convertAnthropicMessagesUsage } from './convert-anthropic-messages-usage';
import { describe, it, expect } from 'vitest';

describe('convertAnthropicMessagesUsage', () => {
  it('should convert basic usage', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 100,
      output_tokens: 50,
    });

    expect(result).toEqual({
      inputTokens: {
        total: 100,
        noCache: 100,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: {
        input_tokens: 100,
        output_tokens: 50,
      },
    });
  });

  it('should set text to output tokens since anthropic has no reasoning breakdown', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 200,
      output_tokens: 150,
    });

    expect(result.outputTokens.text).toBe(150);
    expect(result.outputTokens.total).toBe(150);
    expect(result.outputTokens.reasoning).toBeUndefined();
  });

  it('should convert usage with cache creation tokens', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 500,
    });

    expect(result).toEqual({
      inputTokens: {
        total: 600,
        noCache: 100,
        cacheRead: 0,
        cacheWrite: 500,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 500,
      },
    });
  });

  it('should convert usage with cache read tokens', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 300,
    });

    expect(result).toEqual({
      inputTokens: {
        total: 400,
        noCache: 100,
        cacheRead: 300,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 300,
      },
    });
  });

  it('should convert usage with both cache creation and read tokens', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 300,
    });

    expect(result).toEqual({
      inputTokens: {
        total: 900,
        noCache: 100,
        cacheRead: 300,
        cacheWrite: 500,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 300,
      },
    });
  });

  it('should handle null cache tokens', () => {
    const result = convertAnthropicMessagesUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    });

    expect(result.inputTokens.cacheRead).toBe(0);
    expect(result.inputTokens.cacheWrite).toBe(0);
  });

  it('should preserve raw usage data', () => {
    const rawUsage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 300,
    };

    const result = convertAnthropicMessagesUsage(rawUsage);

    expect(result.raw).toEqual(rawUsage);
  });
});
