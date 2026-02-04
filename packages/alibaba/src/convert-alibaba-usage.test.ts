import { describe, it, expect } from 'vitest';
import { convertAlibabaUsage } from './convert-alibaba-usage';

describe('convertAlibabaUsage', () => {
  it('should map cache_creation_input_tokens to cacheWrite', () => {
    const result = convertAlibabaUsage({
      prompt_tokens: 200,
      completion_tokens: 75,
      prompt_tokens_details: {
        cached_tokens: 150,
        cache_creation_input_tokens: 50,
      },
      completion_tokens_details: {
        reasoning_tokens: 25,
      },
    });

    expect(result.inputTokens.cacheWrite).toBe(50);
  });
});
