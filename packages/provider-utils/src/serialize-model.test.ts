import { describe, it, expect } from 'vitest';
import { serializeModel } from './serialize-model';

describe('serializeModel', () => {
  it('returns modelId and serializable config', () => {
    const result = serializeModel({
      modelId: 'claude-sonnet-4-20250514',
      config: {
        provider: 'anthropic.messages',
        baseURL: 'https://api.anthropic.com/v1',
        headers: () => ({ 'x-api-key': 'sk-test' }),
        fetch: undefined,
        generateId: () => 'id',
        supportedUrls: () => ({}),
        supportsNativeStructuredOutput: true,
        supportsStrictTools: false,
      },
    });
    expect(result).toEqual({
      modelId: 'claude-sonnet-4-20250514',
      config: {
        provider: 'anthropic.messages',
        baseURL: 'https://api.anthropic.com/v1',
        fetch: undefined,
        supportsNativeStructuredOutput: true,
        supportsStrictTools: false,
      },
    });
  });

  it('filters out functions', () => {
    const result = serializeModel({
      modelId: 'gpt-4',
      config: {
        provider: 'openai',
        headers: () => ({ authorization: 'Bearer sk-test' }),
        url: () => 'https://api.openai.com/v1/chat/completions',
      },
    });
    expect(result).toEqual({
      modelId: 'gpt-4',
      config: { provider: 'openai' },
    });
  });

  it('filters out objects containing functions', () => {
    const result = serializeModel({
      modelId: 'model',
      config: {
        provider: 'openai-compatible',
        errorStructure: {
          errorSchema: {},
          errorToMessage: () => 'error',
        },
        metadataExtractor: {
          extractMetadata: async () => undefined,
          createStreamExtractor: () => ({}),
        },
      },
    });
    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'openai-compatible' },
    });
  });

  it('keeps arrays of primitives', () => {
    const result = serializeModel({
      modelId: 'model',
      config: {
        provider: 'test',
        tags: ['a', 'b'],
        fn: () => {},
      },
    });
    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test', tags: ['a', 'b'] },
    });
  });

  it('filters out class instances', () => {
    const result = serializeModel({
      modelId: 'model',
      config: {
        provider: 'test',
        date: new Date(),
        regex: /test/,
      },
    });
    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test' },
    });
  });
});
