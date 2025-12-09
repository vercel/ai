import { describe, it, expect } from 'vitest';
import { createFiremoon } from './firemoon-provider';
import { FiremoonImageModel } from './firemoon-image-model';

describe('createFiremoon', () => {
  it('creates a provider with required settings', () => {
    const provider = createFiremoon({ apiKey: 'test-api-key' });
    expect(provider.image).toBeDefined();
  });

  it('creates a provider with custom settings', () => {
    const provider = createFiremoon({
      apiKey: 'test-api-key',
      baseURL: 'https://custom.firemoon.studio',
    });
    expect(provider.image).toBeDefined();
  });

  it('creates an image model instance', () => {
    const provider = createFiremoon({ apiKey: 'test-api-key' });
    const model = provider.image('flux/dev');
    expect(model).toBeInstanceOf(FiremoonImageModel);
  });

  it('creates a provider with default settings', () => {
    const provider = createFiremoon();
    expect(provider.specificationVersion).toBe('v3');
  });

  it('throws error for unsupported language model', () => {
    const provider = createFiremoon({ apiKey: 'test-api-key' });
    expect(() => provider.languageModel('test-model')).toThrow();
  });

  it('throws error for unsupported embedding model', () => {
    const provider = createFiremoon({ apiKey: 'test-api-key' });
    expect(() => provider.embeddingModel('test-model')).toThrow();
  });
});
