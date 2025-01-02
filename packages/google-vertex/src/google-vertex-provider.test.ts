import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertex } from './google-vertex-provider';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', () => ({
  loadSetting: vi.fn().mockImplementation(({ settingValue }) => settingValue),
  generateId: vi.fn().mockReturnValue('mock-id'),
  withoutTrailingSlash: vi.fn().mockImplementation(url => url),
}));

vi.mock('@ai-sdk/google/internal', () => ({
  GoogleGenerativeAILanguageModel: vi.fn(),
}));

vi.mock('./google-vertex-embedding-model', () => ({
  GoogleVertexEmbeddingModel: vi.fn(),
}));

vi.mock('./google-vertex-image-model', () => ({
  GoogleVertexImageModel: vi.fn(),
}));

describe('google-vertex-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a language model with default settings', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      {},
      expect.objectContaining({
        provider: 'google.vertex.chat',
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1/projects/test-project/locations/test-location/publishers/google',
        headers: expect.any(Object),
        generateId: expect.any(Function),
      }),
    );
  });

  it('should throw an error when using new keyword', () => {
    const provider = createVertex({ project: 'test-project' });

    expect(() => new (provider as any)('test-model-id')).toThrow(
      'The Google Vertex AI model function cannot be called with the new keyword.',
    );
  });

  it('should create an embedding model with correct settings', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider.textEmbeddingModel('test-embedding-model');

    expect(GoogleVertexEmbeddingModel).toHaveBeenCalledWith(
      'test-embedding-model',
      {},
      expect.objectContaining({
        provider: 'google.vertex.embedding',
        project: 'test-project',
        region: 'test-location',
        headers: expect.any(Object),
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1/projects/test-project/locations/test-location/publishers/google',
      }),
    );
  });

  it('should pass custom headers to the model constructor', () => {
    const customHeaders = { 'Custom-Header': 'custom-value' };
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
      headers: customHeaders,
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        headers: customHeaders,
      }),
    );
  });

  it('should pass custom generateId function to the model constructor', () => {
    const customGenerateId = () => 'custom-id';
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
      generateId: customGenerateId,
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        generateId: customGenerateId,
      }),
    );
  });

  it('should use languageModel method to create a model', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider.languageModel('test-model-id', { structuredOutputs: true });

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      { structuredOutputs: true },
      expect.any(Object),
    );
  });

  it('should use custom baseURL when provided', () => {
    const customBaseURL = 'https://custom-endpoint.example.com';
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
      baseURL: customBaseURL,
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      {},
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });
});
