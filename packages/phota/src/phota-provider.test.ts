import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createPhota } from './phota-provider';

const server = createTestServer({
  'https://api.example.com/v1/phota/generate': {
    response: {
      type: 'json-value',
      body: {
        images: ['dGVzdC1pbWFnZQ=='],
        known_subjects: null,
      },
    },
  },
});

describe('Phota provider', () => {
  it('creates image models via .image and .imageModel', () => {
    const provider = createPhota();

    const imageModel = provider.image('generate');
    const imageModel2 = provider.imageModel('edit');

    expect(imageModel.provider).toBe('phota.image');
    expect(imageModel.modelId).toBe('generate');
    expect(imageModel2.modelId).toBe('edit');
    expect(imageModel.specificationVersion).toBe('v4');
  });

  it('configures baseURL and headers correctly', async () => {
    const provider = createPhota({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1/phota',
      headers: {
        'x-extra-header': 'extra',
      },
    });

    const model = provider.image('generate');

    await model.doGenerate({
      prompt: 'A serene mountain landscape',
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      seed: undefined,
      aspectRatio: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://api.example.com/v1/phota/generate',
    );
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestHeaders['x-api-key']).toBe('test-api-key');
    expect(server.calls[0].requestHeaders['x-extra-header']).toBe('extra');
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      prompt: 'A serene mountain landscape',
      num_output_images: 1,
    });

    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/phota/');
  });

  it('sets maxImagesPerCall to 1 for all models', () => {
    const provider = createPhota();

    expect(provider.image('generate').maxImagesPerCall).toBe(1);
    expect(provider.image('edit').maxImagesPerCall).toBe(1);
    expect(provider.image('enhance').maxImagesPerCall).toBe(1);
    expect(provider.image('train').maxImagesPerCall).toBe(1);
    expect(provider.image('status').maxImagesPerCall).toBe(1);
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createPhota();

    expect(() => provider.languageModel('some-id')).toThrowError(
      'No such languageModel',
    );
    expect(() => provider.embeddingModel('some-id')).toThrowError(
      'No such embeddingModel',
    );
  });
});
