import { convertXaiResponsesUsage } from './convert-xai-responses-usage';
import { describe, it, expect } from 'vitest';

describe('convertXaiResponsesUsage', () => {
  it('should convert basic usage without caching or reasoning', () => {
    const result = convertXaiResponsesUsage({
      input_tokens: 100,
      output_tokens: 50,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 100,
        "outputTokens": 50,
        "reasoningTokens": undefined,
        "totalTokens": undefined,
      }
    `);
  });

  it('should convert usage with cached tokens (inclusive reporting)', () => {
    const result = convertXaiResponsesUsage({
      input_tokens: 200,
      output_tokens: 50,
      total_tokens: 250,
      input_tokens_details: {
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
    const result = convertXaiResponsesUsage({
      input_tokens: 100,
      output_tokens: 583,
      total_tokens: 683,
      output_tokens_details: {
        reasoning_tokens: 380,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": undefined,
        "inputTokens": 100,
        "outputTokens": 583,
        "reasoningTokens": 380,
        "totalTokens": 683,
      }
    `);
  });

  it('should handle cached_tokens exceeding input_tokens (non-inclusive reporting)', () => {
    const result = convertXaiResponsesUsage({
      input_tokens: 4142,
      output_tokens: 254,
      input_tokens_details: {
        cached_tokens: 4328,
      },
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": 4328,
        "inputTokens": 8470,
        "outputTokens": 254,
        "reasoningTokens": undefined,
        "totalTokens": undefined,
      }
    `);
  });

  it('should handle undefined usage', () => {
    const result = convertXaiResponsesUsage(undefined);

    expect(result).toMatchInlineSnapshot(`
      {
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
      }
    `);
  });

  it('should handle null usage', () => {
    const result = convertXaiResponsesUsage(null);

    expect(result).toMatchInlineSnapshot(`
      {
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
      }
    `);
  });
});
