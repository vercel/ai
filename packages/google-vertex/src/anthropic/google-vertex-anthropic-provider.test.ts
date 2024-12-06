import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVertexAnthropic } from './google-vertex-anthropic-provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import {
  AnthropicMessagesLanguageModel,
  anthropicTools,
} from '@ai-sdk/anthropic/internal';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', () => ({
  loadOptionalSetting: vi
    .fn()
    .mockImplementation(({ settingValue }) => settingValue),
  withoutTrailingSlash: vi.fn().mockImplementation(url => url),
  createJsonErrorResponseHandler: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic/internal', async () => {
  const originalModule = await vi.importActual('@ai-sdk/anthropic/internal');
  return {
    ...originalModule,
    AnthropicMessagesLanguageModel: vi.fn(),
  };
});

describe('google-vertex-anthropic-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a language model with default settings', () => {
    const provider = createVertexAnthropic({
      project: 'test-project',
      location: 'test-location',
    });
    provider('test-model-id');

    // Assert that the model constructor was called with the correct arguments
    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      {},
      expect.objectContaining({
        baseURL: expect.stringContaining(
          '/projects/test-project/locations/test-location/publishers/anthropic/models',
        ),
        provider: 'vertex.anthropic.messages',
        headers: expect.any(Object),
        buildRequestUrl: expect.any(Function),
        transformRequestBody: expect.any(Function),
      }),
    );
  });

  it('should throw an error when using new keyword', () => {
    const provider = createVertexAnthropic({ project: 'test-project' });

    expect(() => new (provider as any)('test-model-id')).toThrow(
      'The Anthropic model function cannot be called with the new keyword.',
    );
  });

  it('should pass baseURL to the model when created', () => {
    const customBaseURL = 'https://custom-url.com';
    const provider = createVertexAnthropic({
      project: 'test-project',
      baseURL: customBaseURL,
    });
    provider('test-model-id');

    // Assert that the constructor was called with the correct baseURL
    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      expect.anything(), // modelId
      expect.anything(), // settings
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });

  it('should throw NoSuchModelError for textEmbeddingModel', () => {
    const provider = createVertexAnthropic({ project: 'test-project' });

    expect(() => provider.textEmbeddingModel('invalid-model-id')).toThrow(
      NoSuchModelError,
    );
  });

  it('should include anthropicTools', () => {
    const provider = createVertexAnthropic({ project: 'test-project' });

    expect(provider.tools).toBe(anthropicTools);
  });

  it('should pass custom headers to the model constructor', () => {
    const customHeaders = { 'Custom-Header': 'custom-value' };
    const provider = createVertexAnthropic({
      project: 'test-project',
      headers: customHeaders,
    });
    provider('test-model-id');

    // Assert that the model constructor was called with the correct headers
    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      expect.anything(), // modelId
      expect.anything(), // settings
      expect.objectContaining({
        headers: customHeaders,
      }),
    );
  });
});
