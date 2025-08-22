import { createHeroku } from './heroku-provider';

describe('createHeroku', () => {
  it('should create provider with default settings', () => {
    const provider = createHeroku();
    
    expect(provider).toBeDefined();
    expect(typeof provider.embedding).toBe('function');
    expect(typeof provider.textEmbeddingModel).toBe('function');
  });

  it('should create provider with custom API key', () => {
    const provider = createHeroku({ apiKey: 'custom-api-key' });
    
    expect(provider).toBeDefined();
  });

  it('should create provider with custom base URL', () => {
    const provider = createHeroku({ 
      baseURL: 'https://custom-heroku-api.com/v1' 
    });
    
    expect(provider).toBeDefined();
  });

  it('should create provider with custom headers', () => {
    const provider = createHeroku({ 
      headers: { 'X-Custom-Header': 'custom-value' } 
    });
    
    expect(provider).toBeDefined();
  });

  it('should create provider with custom fetch function', () => {
    const customFetch = fetch;
    const provider = createHeroku({ fetch: customFetch });
    
    expect(provider).toBeDefined();
  });
});

describe('HerokuProvider', () => {
  const provider = createHeroku({ apiKey: 'test-api-key' });

  describe('embedding', () => {
    it('should create embedding model with correct model ID', () => {
      const model = provider.embedding('cohere-embed-multilingual-v3.0');
      
      expect(model).toBeDefined();
      expect(model.modelId).toBe('cohere-embed-multilingual-v3.0');
      expect(model.provider).toBe('heroku.textEmbedding');
    });

    it('should create embedding model with custom model ID', () => {
      const model = provider.embedding('custom-model-id');
      
      expect(model).toBeDefined();
      expect(model.modelId).toBe('custom-model-id');
    });
  });

  describe('textEmbeddingModel', () => {
    it('should create embedding model with correct model ID', () => {
      const model = provider.textEmbeddingModel('cohere-embed-multilingual-v3.0');
      
      expect(model).toBeDefined();
      expect(model.modelId).toBe('cohere-embed-multilingual-v3.0');
      expect(model.provider).toBe('heroku.textEmbedding');
    });

    it('should create embedding model with custom model ID', () => {
      const model = provider.textEmbeddingModel('custom-model-id');
      
      expect(model).toBeDefined();
      expect(model.modelId).toBe('custom-model-id');
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
