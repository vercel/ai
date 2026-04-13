import { describe, expect, it } from 'vitest';
import { serializeModelOptions } from './serialize-model';

type TestConfig = Record<string, unknown> & {
  headers?: () => Record<string, string | undefined>;
};

describe('serializeModelOptions', () => {
  it('returns modelId and serializable config', () => {
    const result = serializeModelOptions({
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
        headers: { 'x-api-key': 'sk-test' },
        supportsNativeStructuredOutput: true,
        supportsStrictTools: false,
      },
    });
  });

  it('resolves headers functions but filters out other functions', () => {
    const result = serializeModelOptions({
      modelId: 'gpt-4',
      config: {
        provider: 'openai',
        headers: () => ({ authorization: 'Bearer sk-test' }),
        url: () => 'https://api.openai.com/v1/chat/completions',
      },
    });

    expect(result).toEqual({
      modelId: 'gpt-4',
      config: {
        provider: 'openai',
        headers: { authorization: 'Bearer sk-test' },
      },
    });
  });

  it('filters out objects containing functions', () => {
    const config: TestConfig = {
      provider: 'openai-compatible',
      errorStructure: {
        errorSchema: {},
        errorToMessage: () => 'error',
      },
      metadataExtractor: {
        extractMetadata: async () => undefined,
        createStreamExtractor: () => ({}),
      },
    };

    const result = serializeModelOptions({
      modelId: 'model',
      config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'openai-compatible' },
    });
  });

  it('keeps arrays of primitives', () => {
    const config: TestConfig = {
      provider: 'test',
      tags: ['a', 'b'],
      fn: () => {},
    };

    const result = serializeModelOptions({
      modelId: 'model',
      config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test', tags: ['a', 'b'] },
    });
  });

  it('filters out class instances', () => {
    const config: TestConfig = {
      provider: 'test',
      date: new Date(),
      regex: /test/,
    };

    const result = serializeModelOptions({
      modelId: 'model',
      config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test' },
    });
  });
});
