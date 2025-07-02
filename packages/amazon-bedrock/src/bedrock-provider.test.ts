import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createAmazonBedrock } from './bedrock-provider';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import { BedrockImageModel } from './bedrock-image-model';

// Add type assertions for the mocked classes
const BedrockChatLanguageModelMock =
  BedrockChatLanguageModel as unknown as Mock;
const BedrockEmbeddingModelMock = BedrockEmbeddingModel as unknown as Mock;
const BedrockImageModelMock = BedrockImageModel as unknown as Mock;

vi.mock('./bedrock-chat-language-model', () => ({
  BedrockChatLanguageModel: vi.fn(),
}));

vi.mock('./bedrock-embedding-model', () => ({
  BedrockEmbeddingModel: vi.fn(),
}));

vi.mock('./bedrock-image-model', () => ({
  BedrockImageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadSetting: vi.fn().mockImplementation(({ settingValue }) => 'us-east-1'),
  withoutTrailingSlash: vi.fn(url => url),
  generateId: vi.fn().mockReturnValue('mock-id'),
}));

describe('AmazonBedrockProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAmazonBedrock', () => {
    it('should create a provider instance with default options', () => {
      const provider = createAmazonBedrock();
      const model = provider('anthropic.claude-v2');

      const constructorCall = BedrockChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('anthropic.claude-v2');
      expect(constructorCall[1].headers).toEqual({});
      expect(constructorCall[1].baseUrl()).toBe(
        'https://bedrock-runtime.us-east-1.amazonaws.com',
      );
    });

    it('should create a provider instance with custom options', () => {
      const customHeaders = { 'Custom-Header': 'value' };
      const options = {
        region: 'eu-west-1',
        baseURL: 'https://custom.url',
        headers: customHeaders,
      };

      const provider = createAmazonBedrock(options);
      provider('anthropic.claude-v2');

      const constructorCall = BedrockChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[1].headers).toEqual(customHeaders);
      expect(constructorCall[1].baseUrl()).toBe('https://custom.url');
    });

    it('should accept a credentialProvider in options', () => {
      const mockCredentialProvider = vi.fn().mockResolvedValue({
        accessKeyId: 'dynamic-access-key',
        secretAccessKey: 'dynamic-secret-key',
        sessionToken: 'dynamic-session-token',
      });

      const provider = createAmazonBedrock({
        credentialProvider: mockCredentialProvider,
      });

      provider('anthropic.claude-v2');

      const constructorCall = BedrockChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('anthropic.claude-v2');
      expect(constructorCall[1].headers).toEqual({});
      expect(constructorCall[1].baseUrl()).toBe(
        'https://bedrock-runtime.us-east-1.amazonaws.com',
      );
    });

    it('should prioritize credentialProvider over static credentials', () => {
      const mockCredentialProvider = vi.fn().mockResolvedValue({
        accessKeyId: 'dynamic-access-key',
        secretAccessKey: 'dynamic-secret-key',
        sessionToken: 'dynamic-session-token',
      });

      const provider = createAmazonBedrock({
        accessKeyId: 'static-access-key',
        secretAccessKey: 'static-secret-key',
        sessionToken: 'static-session-token',
        credentialProvider: mockCredentialProvider,
      });

      provider('anthropic.claude-v2');
      const constructorCall = BedrockChatLanguageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe('anthropic.claude-v2');
    });

    it('should pass headers to embedding model', () => {
      const customHeaders = { 'Custom-Header': 'value' };
      const provider = createAmazonBedrock({
        headers: customHeaders,
      });

      provider.embedding('amazon.titan-embed-text-v1');

      const constructorCall = BedrockEmbeddingModelMock.mock.calls[0];
      expect(constructorCall[1].headers).toEqual(customHeaders);
    });

    it('should throw error when called with new keyword', () => {
      const provider = createAmazonBedrock();
      expect(() => {
        new (provider as any)();
      }).toThrow(
        'The Amazon Bedrock model function cannot be called with the new keyword.',
      );
    });
  });

  describe('provider methods', () => {
    it('should create an embedding model', () => {
      const provider = createAmazonBedrock();
      const modelId = 'amazon.titan-embed-text-v1';

      const model = provider.embedding(modelId);

      const constructorCall = BedrockEmbeddingModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe(modelId);
      expect(model).toBeInstanceOf(BedrockEmbeddingModel);
    });

    it('should create an image model', () => {
      const provider = createAmazonBedrock();
      const modelId = 'amazon.titan-image-generator';

      const model = provider.image(modelId);

      const constructorCall = BedrockImageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe(modelId);
      expect(model).toBeInstanceOf(BedrockImageModel);
    });

    it('should create an image model via imageModel method', () => {
      const provider = createAmazonBedrock();
      const modelId = 'amazon.titan-image-generator';

      const model = provider.imageModel(modelId);

      const constructorCall = BedrockImageModelMock.mock.calls[0];
      expect(constructorCall[0]).toBe(modelId);
      expect(model).toBeInstanceOf(BedrockImageModel);
    });
  });
});
