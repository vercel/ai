import { createBedrockAnthropic } from './bedrock-anthropic-provider';
import { NoSuchModelError } from '@ai-sdk/provider';
import {
  AnthropicMessagesLanguageModel,
  anthropicTools,
} from '@ai-sdk/anthropic/internal';
import { vi, describe, beforeEach, it, expect } from 'vitest';

vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    loadOptionalSetting: vi.fn().mockImplementation(({ settingValue }) => {
      if (settingValue === undefined) return undefined;
      return settingValue;
    }),
    loadSetting: vi.fn().mockImplementation(({ settingValue, settingName }) => {
      if (settingValue) return settingValue;
      if (settingName === 'region') return 'us-east-1';
      if (settingName === 'accessKeyId') return 'mock-access-key';
      if (settingName === 'secretAccessKey') return 'mock-secret-key';
      return settingValue;
    }),
    withoutTrailingSlash: vi.fn().mockImplementation(url => url),
    withUserAgentSuffix: vi.fn().mockImplementation((headers, suffix) => ({
      ...headers,
      'user-agent': suffix,
    })),
    resolve: vi.fn().mockImplementation(async value => {
      if (typeof value === 'function') return value();
      return value;
    }),
  };
});

vi.mock('@ai-sdk/anthropic/internal', async () => {
  const originalModule = await vi.importActual('@ai-sdk/anthropic/internal');
  return {
    ...originalModule,
    AnthropicMessagesLanguageModel: vi.fn(),
  };
});

vi.mock('../bedrock-sigv4-fetch', () => ({
  createSigV4FetchFunction: vi.fn().mockReturnValue(vi.fn()),
  createApiKeyFetchFunction: vi.fn().mockReturnValue(vi.fn()),
}));

describe('bedrock-anthropic-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a language model with default settings', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('anthropic.claude-3-5-sonnet-20241022-v2:0');

    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      expect.objectContaining({
        baseURL: expect.stringContaining('bedrock-runtime'),
        provider: 'bedrock.anthropic.messages',
        headers: expect.any(Function),
        buildRequestUrl: expect.any(Function),
        transformRequestBody: expect.any(Function),
        supportedUrls: expect.any(Function),
      }),
    );
  });

  it('should throw an error when using new keyword', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(() => new (provider as any)('test-model-id')).toThrow(
      'The Bedrock Anthropic model function cannot be called with the new keyword.',
    );
  });

  it('should pass custom baseURL to the model when created', () => {
    const customBaseURL = 'https://custom-bedrock.amazonaws.com';
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      baseURL: customBaseURL,
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        baseURL: customBaseURL,
      }),
    );
  });

  it('should throw NoSuchModelError for textEmbeddingModel', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(() => provider.textEmbeddingModel('invalid-model-id')).toThrow(
      NoSuchModelError,
    );
  });

  it('should throw NoSuchModelError for imageModel', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(() => provider.imageModel('invalid-model-id')).toThrow(
      NoSuchModelError,
    );
  });

  it('should include anthropicTools', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(provider.tools).toBe(anthropicTools);
  });

  it('should pass custom headers wrapped in a function with user-agent suffix', async () => {
    const customHeaders = { 'Custom-Header': 'custom-value' };
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      headers: customHeaders,
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    expect(AnthropicMessagesLanguageModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.any(Function),
      }),
    );

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    expect(config.headers).toEqual(expect.any(Function));
    const resolvedHeaders = await (config.headers as Function)();
    expect(resolvedHeaders).toMatchObject(customHeaders);
    expect(resolvedHeaders['user-agent']).toContain('ai-sdk/amazon-bedrock/');
  });

  it('should build correct URL for non-streaming requests', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('anthropic.claude-3-sonnet-20240229-v1:0');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const url = config.buildRequestUrl?.(
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      false,
    );
    expect(url).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1%3A0/invoke',
    );
  });

  it('should build correct URL for streaming requests', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('anthropic.claude-3-sonnet-20240229-v1:0');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const url = config.buildRequestUrl?.(
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
    );
    expect(url).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-sonnet-20240229-v1%3A0/invoke-with-response-stream',
    );
  });

  it('should transform request body to add anthropic_version and remove model', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
    });

    expect(transformedBody).toEqual({
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      anthropic_version: 'bedrock-2023-05-31',
    });
    expect(transformedBody).not.toHaveProperty('model');
  });

  it('should strip stream parameter from request body', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      stream: true,
    });

    expect(transformedBody).not.toHaveProperty('stream');
    expect(transformedBody).toHaveProperty('anthropic_version');
  });

  it('should strip disable_parallel_tool_use from tool_choice', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      tool_choice: {
        type: 'auto',
        disable_parallel_tool_use: true,
      },
    });

    expect(transformedBody?.tool_choice).toEqual({ type: 'auto' });
    expect(transformedBody?.tool_choice).not.toHaveProperty(
      'disable_parallel_tool_use',
    );
  });

  it('should preserve tool_choice name when present', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      tool_choice: {
        type: 'tool',
        name: 'my_tool',
        disable_parallel_tool_use: true,
      },
    });

    expect(transformedBody?.tool_choice).toEqual({
      type: 'tool',
      name: 'my_tool',
    });
  });

  it('should map old tool versions to Bedrock-supported versions', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      tools: [
        { type: 'bash_20241022', name: 'bash' },
        { type: 'text_editor_20241022', name: 'str_replace_editor' },
        { type: 'computer_20241022', name: 'computer' },
      ],
    });

    expect(transformedBody?.tools).toEqual([
      { type: 'bash_20250124', name: 'bash' },
      { type: 'text_editor_20250728', name: 'str_replace_based_edit_tool' },
      { type: 'computer_20250124', name: 'computer' },
    ]);
  });

  it('should add anthropic_beta when computer use tools are detected', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      tools: [{ type: 'bash_20250124', name: 'bash' }],
    });

    expect(transformedBody?.anthropic_beta).toContain(
      'computer-use-2025-01-24',
    );
  });

  it('should not add anthropic_beta when no computer use tools are present', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const transformedBody = config.transformRequestBody?.({
      model: 'test-model-id',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 1024,
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          input_schema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(transformedBody?.anthropic_beta).toBeUndefined();
  });

  it('should not support URL sources to force base64 conversion', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('test-model-id');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    expect(config.supportedUrls?.()).toEqual({});
  });

  it('should have correct specificationVersion', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect((provider as any).specificationVersion).toBe('v2');
  });

  it('should provide languageModel as alias', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });

    expect(provider.languageModel).toBeDefined();
    expect(typeof provider.languageModel).toBe('function');
  });

  it('should handle models with us. prefix for inference profiles', () => {
    const provider = createBedrockAnthropic({
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
    });
    provider('us.anthropic.claude-3-5-sonnet-20240620-v1:0');

    const constructorCall = vi.mocked(AnthropicMessagesLanguageModel).mock
      .calls[vi.mocked(AnthropicMessagesLanguageModel).mock.calls.length - 1];
    const config = constructorCall[1];

    const url = config.buildRequestUrl?.(
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      false,
    );
    expect(url).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-3-5-sonnet-20240620-v1%3A0/invoke',
    );
  });
});
