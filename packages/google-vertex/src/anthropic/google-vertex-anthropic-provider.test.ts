import {
  createVertexAnthropic,
  vertexAnthropicTools,
} from './google-vertex-anthropic-provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import { vi, describe, beforeEach, it, expect } from 'vitest';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', () => ({
  loadOptionalSetting: vi
    .fn()
    .mockImplementation(({ settingValue }) => settingValue),
  withoutTrailingSlash: vi.fn().mockImplementation(url => url),
  createJsonErrorResponseHandler: vi.fn(),
  createProviderToolFactory: vi.fn(),
  createProviderToolFactoryWithOutputSchema: vi.fn(),
  lazySchema: vi.fn(),
  zodSchema: vi.fn(),
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
        supportsNativeStructuredOutput: false,
        supportsStrictTools: false,
      }),
    );
  });

  describe('transformRequestBody', () => {
    function getTransformRequestBody() {
      const provider = createVertexAnthropic({
        project: 'test-project',
        location: 'test-location',
      });
      provider('test-model-id');
      const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
        .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
      return constructorCall[1].transformRequestBody!;
    }

    it('should remove model and add anthropic_version', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result).toEqual({
        max_tokens: 4096,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        anthropic_version: 'vertex-2023-10-16',
      });
      expect(result).not.toHaveProperty('model');
    });

    it('should move top-level cache_control to message before last user message', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        cache_control: { type: 'ephemeral' },
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'System context' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Got it' }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Latest question' }],
          },
        ],
      });

      expect(result).not.toHaveProperty('cache_control');
      // cache_control should be on the assistant message (before last user)
      expect(result.messages[1].content[0].cache_control).toEqual({
        type: 'ephemeral',
      });
      // Other messages should not have cache_control
      expect(result.messages[0].content[0].cache_control).toBeUndefined();
      expect(result.messages[2].content[0].cache_control).toBeUndefined();
    });

    it('should preserve cache_control ttl when moving to message level', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        cache_control: { type: 'ephemeral', ttl: '1h' },
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Context' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Ok' }] },
          { role: 'user', content: [{ type: 'text', text: 'Question' }] },
        ],
      });

      expect(result.messages[1].content[0].cache_control).toEqual({
        type: 'ephemeral',
        ttl: '1h',
      });
    });

    it('should fall back to system message when only one user message', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        cache_control: { type: 'ephemeral' },
        system: [{ type: 'text', text: 'You are a helpful assistant' }],
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result).not.toHaveProperty('cache_control');
      expect(result.system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should not overwrite existing message-level cache_control', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        cache_control: { type: 'ephemeral' },
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Context' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Ok',
                cache_control: { type: 'ephemeral', ttl: '5m' },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Question' }],
          },
        ],
      });

      // Should NOT overwrite the existing cache_control
      expect(result.messages[1].content[0].cache_control).toEqual({
        type: 'ephemeral',
        ttl: '5m',
      });
    });

    it('should not overwrite existing system-level cache_control', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        cache_control: { type: 'ephemeral' },
        system: [
          {
            type: 'text',
            text: 'You are helpful',
            cache_control: { type: 'ephemeral', ttl: '5m' },
          },
        ],
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result.system[0].cache_control).toEqual({
        type: 'ephemeral',
        ttl: '5m',
      });
    });

    it('should pass through request without cache_control unchanged', () => {
      const transform = getTransformRequestBody();
      const result = transform({
        model: 'claude-3-5-sonnet-v2@20241022',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result).not.toHaveProperty('cache_control');
      expect(result.messages[0].content[0]).not.toHaveProperty('cache_control');
    });
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

    expect(() => provider.embeddingModel('invalid-model-id')).toThrow(
      NoSuchModelError,
    );
  });

  it('should include vertexAnthropicTools (subset of anthropicTools)', () => {
    const provider = createVertexAnthropic({ project: 'test-project' });

    expect(provider.tools).toBe(vertexAnthropicTools);
    expect(provider.tools).toHaveProperty('bash_20241022');
    expect(provider.tools).toHaveProperty('bash_20250124');
    expect(provider.tools).toHaveProperty('textEditor_20241022');
    expect(provider.tools).toHaveProperty('textEditor_20250124');
    expect(provider.tools).toHaveProperty('textEditor_20250429');
    expect(provider.tools).toHaveProperty('textEditor_20250728');
    expect(provider.tools).toHaveProperty('computer_20241022');
    expect(provider.tools).toHaveProperty('webSearch_20250305');
    expect(provider.tools).toHaveProperty('toolSearchRegex_20251119');
    expect(provider.tools).toHaveProperty('toolSearchBm25_20251119');
    expect(provider.tools).not.toHaveProperty('codeExecution_20250825');
    expect(provider.tools).not.toHaveProperty('codeExecution_20260120');
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

  it('should support combining tools with structured outputs (inherited from Anthropic)', () => {
    const provider = createVertexAnthropic({
      project: 'test-project',
      location: 'us-east5',
    });

    // Create a model instance
    const model = provider('claude-3-5-sonnet-v2@20241022');

    // Verify the model was created using AnthropicMessagesLanguageModel
    // which already supports combining tools with structured outputs
    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'claude-3-5-sonnet-v2@20241022',
      expect.objectContaining({
        provider: 'vertex.anthropic.messages',
      }),
    );
  });
});
