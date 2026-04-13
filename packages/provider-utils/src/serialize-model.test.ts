import { describe, expect, it } from 'vitest';
import { deserializeModel, serializeModel } from './serialize-model';

class TestModel {
  constructor(
    readonly modelId: string,
    readonly config: Record<string, unknown>,
  ) {}
}

describe('serializeModel', () => {
  it('returns modelId and serializable config', () => {
    const model = new TestModel('claude-sonnet-4-20250514', {
      provider: 'anthropic.messages',
      baseURL: 'https://api.anthropic.com/v1',
      headers: () => ({ 'x-api-key': 'sk-test' }),
      fetch: undefined,
      generateId: () => 'id',
      supportedUrls: () => ({}),
      supportsNativeStructuredOutput: true,
      supportsStrictTools: false,
    });

    const result = serializeModel({
      model,
      getConfig: model => model.config,
    });

    expect(result).toEqual({
      modelId: 'claude-sonnet-4-20250514',
      config: {
        provider: 'anthropic.messages',
        baseURL: 'https://api.anthropic.com/v1',
        headers: { 'x-api-key': 'sk-test' },
        fetch: undefined,
        supportsNativeStructuredOutput: true,
        supportsStrictTools: false,
      },
    });
  });

  it('resolves headers functions but filters out other functions', () => {
    const model = new TestModel('gpt-4', {
      provider: 'openai',
      headers: () => ({ authorization: 'Bearer sk-test' }),
      url: () => 'https://api.openai.com/v1/chat/completions',
    });

    const result = serializeModel({
      model,
      getConfig: model => model.config,
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
    const model = new TestModel('model', {
      provider: 'openai-compatible',
      errorStructure: {
        errorSchema: {},
        errorToMessage: () => 'error',
      },
      metadataExtractor: {
        extractMetadata: async () => undefined,
        createStreamExtractor: () => ({}),
      },
    });

    const result = serializeModel({
      model,
      getConfig: model => model.config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'openai-compatible' },
    });
  });

  it('keeps arrays of primitives', () => {
    const model = new TestModel('model', {
      provider: 'test',
      tags: ['a', 'b'],
      fn: () => {},
    });

    const result = serializeModel({
      model,
      getConfig: model => model.config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test', tags: ['a', 'b'] },
    });
  });

  it('filters out class instances', () => {
    const model = new TestModel('model', {
      provider: 'test',
      date: new Date(),
      regex: /test/,
    });

    const result = serializeModel({
      model,
      getConfig: model => model.config,
    });

    expect(result).toEqual({
      modelId: 'model',
      config: { provider: 'test' },
    });
  });
});

describe('deserializeModel', () => {
  it('constructs a model instance from serialized options', () => {
    const config = {
      provider: 'test',
      baseURL: 'https://example.com',
      headers: { authorization: 'Bearer sk-test' },
    };

    const model = deserializeModel({
      ModelClass: TestModel,
      options: {
        modelId: 'gpt-4.1',
        config,
      },
    });

    expect(model).toBeInstanceOf(TestModel);
    expect(model.modelId).toBe('gpt-4.1');
    expect(model.config).toEqual(config);
  });

  it('passes the config through unchanged', () => {
    const headers = { 'x-api-key': 'sk-test' };

    const model = deserializeModel({
      ModelClass: TestModel,
      options: {
        modelId: 'claude-sonnet-4-20250514',
        config: {
          provider: 'anthropic.messages',
          headers,
        },
      },
    });

    expect(model.config).toEqual({
      provider: 'anthropic.messages',
      headers,
    });
  });
});
