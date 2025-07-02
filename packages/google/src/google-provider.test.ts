import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import { GoogleGenerativeAIEmbeddingModel } from './google-generative-ai-embedding-model';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockImplementation(({ apiKey }) => apiKey),
  generateId: vi.fn().mockReturnValue('mock-id'),
  withoutTrailingSlash: vi.fn().mockImplementation(url => url),
}));

vi.mock('./google-generative-ai-language-model', () => ({
  GoogleGenerativeAILanguageModel: vi.fn(),
}));

vi.mock('./google-generative-ai-embedding-model', () => ({
  GoogleGenerativeAIEmbeddingModel: vi.fn(),
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
      'Custom-Header': 'custom-value',
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
});
