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
  createProviderDefinedToolFactory: vi.fn(),
  createProviderDefinedToolFactoryWithOutputSchema: vi.fn(),
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
      expect.objectContaining({
        headers: customHeaders,
      }),
    );
  });

  it('should create a Google Vertex Anthropic provider instance with custom settings', () => {
    const customProvider = createVertexAnthropic({
      project: 'custom-project',
      location: 'custom-location',
      baseURL: 'https://custom.base.url',
      headers: { 'Custom-Header': 'value' },
    });

    expect(customProvider).toBeDefined();
    expect(typeof customProvider).toBe('function');
    expect(customProvider.languageModel).toBeDefined();
  });

  it('should not support URL sources to force base64 conversion', () => {
    const provider = createVertexAnthropic();
    provider('test-model-id');

    // Assert that the model constructor was called with supportedUrls function
    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        supportedUrls: expect.any(Function),
      }),
    );

    // Get the actual config passed to the constructor
    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    // Verify that supportedUrls returns empty object to force base64 conversion
    expect(config.supportedUrls?.()).toEqual({});
  });

  it('should use correct URL for global location', () => {
    const provider = createVertexAnthropic({
      project: 'test-project',
      location: 'global',
    });
    provider('test-model-id');

    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        baseURL:
          'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/anthropic/models',
        provider: 'vertex.anthropic.messages',
      }),
    );
  });

  it('should use region-prefixed URL for non-global locations', () => {
    const provider = createVertexAnthropic({
      project: 'test-project',
      location: 'us-east5',
    });
    provider('test-model-id');

    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'test-model-id',
      expect.objectContaining({
        baseURL:
          'https://us-east5-aiplatform.googleapis.com/v1/projects/test-project/locations/us-east5/publishers/anthropic/models',
        provider: 'vertex.anthropic.messages',
      }),
    );
  });
});
