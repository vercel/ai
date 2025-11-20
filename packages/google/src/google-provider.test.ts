import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import { GoogleGenerativeAIEmbeddingModel } from './google-generative-ai-embedding-model';
import { GoogleGenerativeAIImageModel } from './google-generative-ai-image-model';

// Mock the imported modules using a partial mock to preserve original exports
vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const mod = await importOriginal<typeof import('@ai-sdk/provider-utils')>();
  return {
    ...mod,
    loadApiKey: vi.fn().mockImplementation(({ apiKey }) => apiKey),
    generateId: vi.fn().mockReturnValue('mock-id'),
    withoutTrailingSlash: vi.fn().mockImplementation(url => url),
  };
});

vi.mock('./google-generative-ai-language-model', () => ({
  GoogleGenerativeAILanguageModel: vi.fn(),
}));

vi.mock('./google-generative-ai-embedding-model', () => ({
  GoogleGenerativeAIEmbeddingModel: vi.fn(),
}));
vi.mock('./google-generative-ai-image-model', () => ({
  GoogleGenerativeAIImageModel: vi.fn(),
}));
vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));
describe('google-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a language model with default settings', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'gemini-pro',
      expect.objectContaining({
        provider: 'google.generative-ai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        headers: expect.any(Function),
        generateId: expect.any(Function),
        supportedUrls: expect.any(Function),
      }),
    );
  });

  it('should throw an error when using new keyword', () => {
    const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });

    expect(() => new (provider as any)('gemini-pro')).toThrow(
      'The Google Generative AI model function cannot be called with the new keyword.',
    );
  });

  it('should create an embedding model with correct settings', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    provider.textEmbeddingModel('embedding-001');

    expect(GoogleGenerativeAIEmbeddingModel).toHaveBeenCalledWith(
      'embedding-001',
      expect.objectContaining({
        provider: 'google.generative-ai',
        headers: expect.any(Function),
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      }),
    );
  });

  it('should pass custom headers to the model constructor', () => {
    const customHeaders = { 'Custom-Header': 'custom-value' };
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: customHeaders,
    });
    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.any(Function),
      }),
    );

    const options = (GoogleGenerativeAILanguageModel as any).mock.calls[0][1];
    const headers = options.headers();
    expect(headers).toEqual({
      'x-goog-api-key': 'test-api-key',
      'custom-header': 'custom-value',
      'user-agent': 'ai-sdk/google/0.0.0-test',
    });
  });

  it('should pass custom generateId function to the model constructor', () => {
    const customGenerateId = () => 'custom-id';
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: customGenerateId,
    });
    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        generateId: customGenerateId,
      }),
    );
  });

  it('should use chat method to create a model', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    provider.chat('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'gemini-pro',
      expect.any(Object),
    );
  });

  it('should use custom baseURL when provided', () => {
    const customBaseURL = 'https://custom-endpoint.example.com';
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      baseURL: customBaseURL,
    });
    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'gemini-pro',
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });

  it('should create an image model with default settings', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    provider.image('imagen-3.0-generate-002');

    expect(GoogleGenerativeAIImageModel).toHaveBeenCalledWith(
      'imagen-3.0-generate-002',
      {},
      expect.objectContaining({
        provider: 'google.generative-ai',
        headers: expect.any(Function),
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      }),
    );
  });

  it('should create an image model with custom maxImagesPerCall', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    const imageSettings = {
      maxImagesPerCall: 3,
    };
    provider.image('imagen-3.0-generate-002', imageSettings);

    expect(GoogleGenerativeAIImageModel).toHaveBeenCalledWith(
      'imagen-3.0-generate-002',
      imageSettings,
      expect.objectContaining({
        provider: 'google.generative-ai',
        headers: expect.any(Function),
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      }),
    );
  });

  it('should support deprecated methods', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });

    provider.generativeAI('gemini-pro');
    provider.embedding('embedding-001');
    provider.textEmbedding('embedding-001');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledTimes(1);
    expect(GoogleGenerativeAIEmbeddingModel).toHaveBeenCalledTimes(2);
  });

  it('should include YouTube URLs in supportedUrls', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });
    provider('gemini-pro');

    const call = vi.mocked(GoogleGenerativeAILanguageModel).mock.calls[0];
    const supportedUrlsFunction = call[1].supportedUrls;

    expect(supportedUrlsFunction).toBeDefined();

    const supportedUrls = supportedUrlsFunction!() as Record<string, RegExp[]>;
    const patterns = supportedUrls['*'];

    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);

    const testResults = {
      supportedUrls: [
        'https://generativelanguage.googleapis.com/v1beta/files/test123',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
      ].map(url => ({
        url,
        isSupported: patterns.some((pattern: RegExp) => pattern.test(url)),
      })),
      unsupportedUrls: [
        'https://example.com',
        'https://vimeo.com/123456789',
        'https://youtube.com/channel/UCdQw4w9WgXcQ',
      ].map(url => ({
        url,
        isSupported: patterns.some((pattern: RegExp) => pattern.test(url)),
      })),
    };

    expect(testResults).toMatchInlineSnapshot(`
      {
        "supportedUrls": [
          {
            "isSupported": true,
            "url": "https://generativelanguage.googleapis.com/v1beta/files/test123",
          },
          {
            "isSupported": true,
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
          {
            "isSupported": true,
            "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
          },
          {
            "isSupported": true,
            "url": "https://youtu.be/dQw4w9WgXcQ",
          },
        ],
        "unsupportedUrls": [
          {
            "isSupported": false,
            "url": "https://example.com",
          },
          {
            "isSupported": false,
            "url": "https://vimeo.com/123456789",
          },
          {
            "isSupported": false,
            "url": "https://youtube.com/channel/UCdQw4w9WgXcQ",
          },
        ],
      }
    `);
  });
});

describe('google provider - custom provider name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use custom provider name when specified', () => {
    const provider = createGoogleGenerativeAI({
      name: 'my-gemini-proxy',
      apiKey: 'test-api-key',
    });

    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'gemini-pro',
      expect.objectContaining({
        provider: 'my-gemini-proxy',
      }),
    );
  });

  it('should default to google.generative-ai when name not specified', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
    });

    provider('gemini-pro');

    expect(GoogleGenerativeAILanguageModel).toHaveBeenCalledWith(
      'gemini-pro',
      expect.objectContaining({
        provider: 'google.generative-ai',
      }),
    );
  });
});
