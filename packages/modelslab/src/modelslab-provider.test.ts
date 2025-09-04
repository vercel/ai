import { describe, it, expect } from 'vitest';
import { createModelslab } from './modelslab-provider';

describe('ModelsLab Provider', () => {
  it('should create a provider instance', () => {
    const provider = createModelslab();
    expect(provider).toBeDefined();
    expect(provider.image).toBeDefined();
    expect(provider.imageModel).toBeDefined();
  });

  it('should create image model with correct ID', () => {
    const provider = createModelslab();
    const model = provider.image('realtime-text2img');
    expect(model.modelId).toBe('realtime-text2img');
    expect(model.provider).toBe('modelslab.image');
  });

  it('should throw error for unsupported models', () => {
    const provider = createModelslab();
    expect(() => provider.languageModel('test')).toThrow();
    expect(() => provider.textEmbeddingModel('test')).toThrow();
  });
});
