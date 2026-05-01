import { describe, expect, it } from 'vitest';
import { convertMistralUsage } from './convert-mistral-usage';

describe('convertMistralUsage', () => {
  it('should account for num_cached_tokens', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      num_cached_tokens: 30,
    };

    const result = convertMistralUsage(usage);

    expect(result.inputTokens.total).toBe(100);
    expect(result.inputTokens.cacheRead).toBe(30);
    expect(result.inputTokens.noCache).toBe(70);
    expect(result.raw).toBe(usage);
  });

  it('should read singular prompt token details', () => {
    const result = convertMistralUsage({
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      prompt_token_details: {
        cached_tokens: 45,
      },
    });

    expect(result.inputTokens.cacheRead).toBe(45);
    expect(result.inputTokens.noCache).toBe(55);
  });

  it('should read plural prompt token details', () => {
    const result = convertMistralUsage({
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      prompt_tokens_details: {
        cached_tokens: 80,
      },
    });

    expect(result.inputTokens.cacheRead).toBe(80);
    expect(result.inputTokens.noCache).toBe(20);
  });

  it('should prefer num_cached_tokens when multiple cache fields are present', () => {
    const result = convertMistralUsage({
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      num_cached_tokens: 30,
      prompt_token_details: {
        cached_tokens: 45,
      },
      prompt_tokens_details: {
        cached_tokens: 80,
      },
    });

    expect(result.inputTokens.cacheRead).toBe(30);
    expect(result.inputTokens.noCache).toBe(70);
  });

  it('should preserve existing usage behavior when cache fields are absent', () => {
    const result = convertMistralUsage({
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
    });

    expect(result.inputTokens.cacheRead).toBeUndefined();
    expect(result.inputTokens.noCache).toBe(100);
  });

  it('should clamp cached tokens to avoid negative no-cache counts', () => {
    const result = convertMistralUsage({
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      num_cached_tokens: 120,
    });

    expect(result.inputTokens.cacheRead).toBe(100);
    expect(result.inputTokens.noCache).toBe(0);
  });
});
