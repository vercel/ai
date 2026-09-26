import { describe, it, expect } from 'vitest';
import {
  convertMistralUsage,
  mistralUsageSchema,
} from './convert-mistral-usage';

const basicUsage = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
};

describe('convertMistralUsage', () => {
  it('should return undefined values when usage is null', () => {
    expect(convertMistralUsage(null)).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
      raw: undefined,
    });
  });

  it('should map basic usage without cached tokens', () => {
    const usage = basicUsage;

    expect(convertMistralUsage(usage)).toEqual({
      inputTokens: {
        total: 100,
        noCache: 100,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: usage,
    });
  });

  it('should map cached tokens from num_cached_tokens', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      num_cached_tokens: 60,
    };

    expect(convertMistralUsage(usage)).toEqual({
      inputTokens: {
        total: 100,
        noCache: 40,
        cacheRead: 60,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 50,
        text: 50,
        reasoning: undefined,
      },
      raw: usage,
    });
  });

  it('should map cached tokens from prompt_tokens_details.cached_tokens', () => {
    const usage = {
      prompt_tokens: 200,
      completion_tokens: 30,
      total_tokens: 230,
      prompt_tokens_details: { cached_tokens: 80 },
    };

    expect(convertMistralUsage(usage)).toEqual({
      inputTokens: {
        total: 200,
        noCache: 120,
        cacheRead: 80,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 30,
        text: 30,
        reasoning: undefined,
      },
      raw: usage,
    });
  });

  it('should map cached tokens from prompt_token_details.cached_tokens', () => {
    const usage = {
      prompt_tokens: 150,
      completion_tokens: 25,
      total_tokens: 175,
      prompt_token_details: { cached_tokens: 50 },
    };

    expect(convertMistralUsage(usage)).toEqual({
      inputTokens: {
        total: 150,
        noCache: 100,
        cacheRead: 50,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 25,
        text: 25,
        reasoning: undefined,
      },
      raw: usage,
    });
  });

  it('should prefer num_cached_tokens over prompt_tokens_details', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      num_cached_tokens: 40,
      prompt_tokens_details: { cached_tokens: 30 },
    };

    expect(convertMistralUsage(usage)).toEqual({
      inputTokens: {
        total: 100,
        noCache: 60,
        cacheRead: 40,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 20,
        text: 20,
        reasoning: undefined,
      },
      raw: usage,
    });
  });
});

describe('mistralUsageSchema', () => {
  it('should preserve additional usage and token detail fields', () => {
    const usage = {
      ...basicUsage,
      additional_usage_field: { value: true },
      prompt_tokens_details: {
        cached_tokens: 20,
        additional_prompt_field: ['value'],
      },
      prompt_token_details: {
        audio_tokens: 5,
        additional_prompt_token_field: 1,
      },
      completion_tokens_details: {
        reasoning_tokens: 10,
        additional_completion_field: null,
      },
    };

    expect(mistralUsageSchema.parse(usage)).toStrictEqual(usage);
  });

  it.each([
    ['prompt_tokens', { ...basicUsage, prompt_tokens: '100' }],
    ['completion_tokens', { ...basicUsage, completion_tokens: '50' }],
    ['total_tokens', { ...basicUsage, total_tokens: '150' }],
    ['prompt_audio_seconds', { ...basicUsage, prompt_audio_seconds: '10' }],
    ['request_count', { ...basicUsage, request_count: '1' }],
    ['service_tier', { ...basicUsage, service_tier: 1 }],
    ['num_cached_tokens', { ...basicUsage, num_cached_tokens: '20' }],
    [
      'prompt_tokens_details.cached_tokens',
      {
        ...basicUsage,
        prompt_tokens_details: { cached_tokens: '20' },
      },
    ],
    [
      'prompt_tokens_details.audio_tokens',
      {
        ...basicUsage,
        prompt_tokens_details: { audio_tokens: '5' },
      },
    ],
    [
      'prompt_tokens_details.messages',
      {
        ...basicUsage,
        prompt_tokens_details: { messages: {} },
      },
    ],
    [
      'prompt_token_details.cached_tokens',
      {
        ...basicUsage,
        prompt_token_details: { cached_tokens: '20' },
      },
    ],
    [
      'prompt_token_details.audio_tokens',
      {
        ...basicUsage,
        prompt_token_details: { audio_tokens: '5' },
      },
    ],
    [
      'prompt_token_details.messages',
      {
        ...basicUsage,
        prompt_token_details: { messages: {} },
      },
    ],
    [
      'completion_tokens_details.reasoning_tokens',
      {
        ...basicUsage,
        completion_tokens_details: { reasoning_tokens: '10' },
      },
    ],
  ])('should reject an invalid %s value', (_field, usage) => {
    expect(mistralUsageSchema.safeParse(usage).success).toBe(false);
  });
});
