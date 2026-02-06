import { describe, it, expect } from 'vitest';
import { createImageRouter } from './imagerouter-provider';

describe('ImageRouterProvider', () => {
  describe('createImageRouter', () => {
    it('should create a provider with correct specification version', () => {
      const provider = createImageRouter({
        apiKey: 'test-key',
      });

      expect(provider.specificationVersion).toBe('v3');
    });

    it('should create an image model', () => {
      const provider = createImageRouter({
        apiKey: 'test-key',
      });

      const model = provider.image('test/test');
      expect(model).toBeDefined();
      expect(model.specificationVersion).toBe('v3');
      expect(model.modelId).toBe('test/test');
    });

    it('should create an image model using imageModel method', () => {
      const provider = createImageRouter({
        apiKey: 'test-key',
      });

      const model = provider.imageModel('test/test');
      expect(model).toBeDefined();
      expect(model.specificationVersion).toBe('v3');
      expect(model.modelId).toBe('test/test');
    });

    it('should throw error for language model', () => {
      const provider = createImageRouter({
        apiKey: 'test-key',
      });

      expect(() => provider.languageModel('test')).toThrow();
    });

    it('should throw error for embedding model', () => {
      const provider = createImageRouter({
        apiKey: 'test-key',
      });

      expect(() => provider.embeddingModel('test')).toThrow();
    });
  });
});
