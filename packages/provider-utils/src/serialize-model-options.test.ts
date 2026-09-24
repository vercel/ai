import { describe, expect, it } from 'vitest';
import { serializeModelOptions } from './serialize-model-options';
import { SerializationError } from './serialization-error';

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

  it('throws when headers resolve asynchronously', () => {
    expect(() =>
      serializeModelOptions({
        modelId: 'model',
        config: {
          provider: 'test',
          headers: async () => ({ 'x-api-key': 'sk-test' }),
        },
      }),
    ).toThrow(SerializationError);
  });

  it('throws when headers is a function returning a Promise', () => {
    expect(() =>
      serializeModelOptions({
        modelId: 'model',
        config: {
          provider: 'test',
          headers: () => Promise.resolve({ 'x-api-key': 'sk-test' }),
        },
      }),
    ).toThrow('Cannot serialize asynchronous model options.');
  });

  it('marks serialization errors for cross-realm detection', () => {
    let serializationError: unknown;

    try {
      serializeModelOptions({
        modelId: 'model',
        config: {
          headers: async () => ({}),
        },
      });
    } catch (error) {
      serializationError = error;
    }

    expect(SerializationError.isInstance(serializationError)).toBe(true);
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
