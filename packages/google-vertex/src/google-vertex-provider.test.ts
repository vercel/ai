import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createVertex } from './google-vertex-provider';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';
import { GoogleVertexImageModel } from './google-vertex-image-model';
import { GoogleVertexVideoModel } from './google-vertex-video-model';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@ai-sdk/provider-utils')>();
  return {
    ...actual,
    loadSetting: vi.fn().mockImplementation(({ settingValue }) => settingValue),
    loadOptionalSetting: vi
      .fn()
      .mockImplementation(({ settingValue, environmentVariableName }) => {
        if (settingValue) return settingValue;
        if (
          environmentVariableName === 'GOOGLE_VERTEX_API_KEY' &&
          process.env.GOOGLE_VERTEX_API_KEY
        ) {
          return process.env.GOOGLE_VERTEX_API_KEY;
        }
        return undefined;
      }),
    generateId: vi.fn().mockReturnValue('mock-id'),
    withoutTrailingSlash: vi.fn().mockImplementation(url => url),
    resolve: vi.fn().mockImplementation(async value => {
      if (typeof value === 'function') return value();
      return value;
    }),
    withUserAgentSuffix: vi.fn().mockImplementation(headers => headers),
  };
});

vi.mock('@ai-sdk/google/internal', () => ({
  GoogleGenerativeAILanguageModel: vi.fn(),
  googleTools: {
    googleSearch: vi.fn(),
    urlContext: vi.fn(),
    fileSearch: vi.fn(),
    codeExecution: vi.fn(),
  },
}));

vi.mock('./google-vertex-embedding-model', () => ({
  GoogleVertexEmbeddingModel: vi.fn(),
}));

vi.mock('./google-vertex-image-model', () => ({
  GoogleVertexImageModel: vi.fn(),
}));

vi.mock('./google-vertex-video-model', () => ({
  GoogleVertexVideoModel: vi.fn(),
}));

describe('google-vertex-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_VERTEX_API_KEY;
  });

  afterEach(() => {
    delete process.env.GOOGLE_VERTEX_API_KEY;
  });

  it('should create a language model with default settings', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        provider: 'google.vertex.chat',
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/test-location/publishers/google',
        headers: expect.any(Function),
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
    provider.embeddingModel('test-embedding-model');

    expect(GoogleVertexEmbeddingModel).toHaveBeenCalledWith(
      'test-embedding-model',
      expect.objectContaining({
        provider: 'google.vertex.embedding',
        headers: expect.any(Function),
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/test-location/publishers/google',
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
      expect.objectContaining({
        headers: expect.any(Function),
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
    provider.languageModel('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
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
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });

  it('should create an image model with default settings', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider.image('imagen-3.0-generate-002');

    expect(GoogleVertexImageModel).toHaveBeenCalledWith(
      'imagen-3.0-generate-002',
      expect.objectContaining({
        provider: 'google.vertex.image',
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/test-location/publishers/google',
        headers: expect.any(Function),
      }),
    );
  });

  it('should use correct URL for global region', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'global',
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        provider: 'google.vertex.chat',
        baseURL:
          'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google',
        headers: expect.any(Function),
        generateId: expect.any(Function),
      }),
    );
  });

  it('should use correct URL for global region with embedding model', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'global',
    });
    provider.embeddingModel('test-embedding-model');

    expect(GoogleVertexEmbeddingModel).toHaveBeenCalledWith(
      'test-embedding-model',
      expect.objectContaining({
        provider: 'google.vertex.embedding',
        headers: expect.any(Function),
        baseURL:
          'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google',
      }),
    );
  });

  it('should use correct URL for global region with image model', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'global',
    });
    provider.image('imagen-3.0-generate-002');

    expect(GoogleVertexImageModel).toHaveBeenCalledWith(
      'imagen-3.0-generate-002',
      expect.objectContaining({
        provider: 'google.vertex.image',
        baseURL:
          'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google',
        headers: expect.any(Function),
      }),
    );
  });

  it('should expose tools', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });

    expect(provider.tools).toBeDefined();
    expect(provider.tools.googleSearch).toBeDefined();
    expect(provider.tools.urlContext).toBeDefined();
    expect(provider.tools.codeExecution).toBeDefined();
  });

  it('should use region-prefixed URL for non-global regions', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'us-central1',
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        provider: 'google.vertex.chat',
        baseURL:
          'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/publishers/google',
        headers: expect.any(Function),
        generateId: expect.any(Function),
      }),
    );
  });

  it('should use express mode base URL when apiKey is provided', () => {
    const provider = createVertex({
      apiKey: 'test-api-key',
    });
    provider('test-model-id');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        baseURL: 'https://aiplatform.googleapis.com/v1/publishers/google',
      }),
    );
  });

  it('should add API key as query parameter via custom fetch', async () => {
    const provider = createVertex({
      apiKey: 'test-api-key',
    });
    provider('test-model-id');

    const calledConfig = vi.mocked(GoogleGenerativeAILanguageModel).mock
      .calls[0][1];
    const customFetch = calledConfig.fetch;

    expect(customFetch).toBeDefined();

    const mockResponse = new Response('{}');
    const originalFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', originalFetch);

    await customFetch!(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:streamGenerateContent',
      {},
    );

    expect(originalFetch).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro:streamGenerateContent',
      {
        headers: {
          'x-goog-api-key': 'test-api-key',
        },
      },
    );

    vi.unstubAllGlobals();
  });

  it('should create a video model with default settings', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
    });
    provider.video('veo-2.0-generate-001');

    expect(GoogleVertexVideoModel).toHaveBeenCalledWith(
      'veo-2.0-generate-001',
      expect.objectContaining({
        provider: 'google.vertex.video',
        baseURL:
          'https://test-location-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/test-location/publishers/google',
        headers: expect.any(Function),
        generateId: expect.any(Function),
      }),
    );
  });

  it('should use correct URL for global region with video model', () => {
    const provider = createVertex({
      project: 'test-project',
      location: 'global',
    });
    provider.video('veo-3.0-generate-001');

    expect(GoogleVertexVideoModel).toHaveBeenCalledWith(
      'veo-3.0-generate-001',
      expect.objectContaining({
        provider: 'google.vertex.video',
        baseURL:
          'https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google',
        headers: expect.any(Function),
      }),
    );
  });

  it('should use custom baseURL for video model when provided', () => {
    const customBaseURL = 'https://custom-endpoint.example.com';
    const provider = createVertex({
      project: 'test-project',
      location: 'test-location',
      baseURL: customBaseURL,
    });
    provider.video('veo-2.0-generate-001');

    expect(GoogleVertexVideoModel).toHaveBeenCalledWith(
      'veo-2.0-generate-001',
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });
});
