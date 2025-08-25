import { createHeroku } from './heroku-provider';

describe('HerokuProvider', () => {
  const provider = createHeroku();

  describe('embedding', () => {
    it('should create embedding model with correct model ID', () => {
      const model = provider.embedding('cohere-embed-multilingual');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('cohere-embed-multilingual');
      expect(model.provider).toBe('heroku.textEmbedding');
    });
  });

  describe('textEmbeddingModel', () => {
    it('should create embedding model with correct model ID', () => {
      const model = provider.textEmbeddingModel('cohere-embed-multilingual');

      expect(model).toBeDefined();
      expect(model.modelId).toBe('cohere-embed-multilingual');
      expect(model.provider).toBe('heroku.textEmbedding');
    });
  });

  describe('languageModel', () => {
    it('should throw error for unsupported model type', () => {
      expect(() => {
        provider.languageModel('gpt-4');
      }).toThrow(/No such languageModel/);
    });
  });

  describe('imageModel', () => {
    it('should throw error for unsupported model type', () => {
      expect(() => {
        provider.imageModel('dall-e-3');
      }).toThrow(/No such imageModel/);
    });
  });

  describe('function call', () => {
    it('should throw error when called with new keyword', () => {
      expect(() => {
        new (provider as any)('model-id');
      }).toThrow('cannot be called with the new keyword');
    });

    it('should throw error for unsupported model type', () => {
      expect(() => {
        (provider as any)('gpt-4');
      }).toThrow(/No such languageModel/i);
    });
  });
});
