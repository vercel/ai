import { describe, it, expect } from 'vitest';
import { convertAlibabaUsage } from './convert-alibaba-usage';

describe('convertAlibabaUsage', () => {
  it('should correctly map token fields', () => {
    const result = convertAlibabaUsage({
      prompt_tokens: 200,
      completion_tokens: 75,
      total_tokens: 275,
      prompt_tokens_details: {
        cached_tokens: 120,
        cache_creation_input_tokens: 50,
      },
      completion_tokens_details: {
        reasoning_tokens: 25,
      },
    });

    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(75);
    expect(result.totalTokens).toBe(275);
    expect(result.cachedInputTokens).toBe(170);
    expect(result.reasoningTokens).toBe(25);
  });

  it('should return undefined for cachedInputTokens when both cache fields are absent', () => {
    const result = convertAlibabaUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });

    expect(result.cachedInputTokens).toBeUndefined();
  });
});
