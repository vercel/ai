import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAmazonBedrock } from './bedrock-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const mockConfigs: any[] = [];

vi.mock('./bedrock-chat-language-model', () => ({
  BedrockChatLanguageModel: vi.fn().mockImplementation((modelId, config) => {
    mockConfigs.push({ type: 'chat', modelId, config });
    return {
      doGenerate: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        finishReason: 'stop',
        usage: {},
        warnings: [],
      }),
    };
  }),
}));

vi.mock('./bedrock-embedding-model', () => ({
  BedrockEmbeddingModel: vi.fn().mockImplementation((modelId, config) => {
    mockConfigs.push({ type: 'embedding', modelId, config });
    return {
      doEmbed: vi.fn().mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
        usage: {},
      }),
    };
  }),
}));

vi.mock('./bedrock-image-model', () => ({
  BedrockImageModel: vi.fn().mockImplementation((modelId, config) => {
    mockConfigs.push({ type: 'image', modelId, config });
    return {
      doGenerate: vi.fn().mockResolvedValue({
        images: ['base64-image'],
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'test-model',
          headers: {},
        },
      }),
    };
  }),
}));

vi.mock('./bedrock-sigv4-fetch', () => ({
  createSigV4FetchFunction: vi.fn().mockReturnValue(vi.fn()),
  createApiKeyFetchFunction: vi.fn().mockReturnValue(vi.fn()),
}));

describe('user-agent', () => {
  beforeEach(() => {
    mockConfigs.length = 0;
  });

  it('should include amazon-bedrock version in user-agent header for chat models', async () => {
    const provider = createAmazonBedrock({
      region: 'us-east-1',
    });

    provider('anthropic.claude-v2');

    expect(mockConfigs).toHaveLength(1);
    expect(mockConfigs[0].type).toBe('chat');
    expect(mockConfigs[0].modelId).toBe('anthropic.claude-v2');

    const headers = mockConfigs[0].config.headers();
    expect(headers['user-agent']).toStrictEqual(
      'ai-sdk/amazon-bedrock/0.0.0-test',
    );
  });

  it('should include amazon-bedrock version in user-agent header for embedding models', async () => {
    const provider = createAmazonBedrock({
      region: 'us-east-1',
    });

    provider.embedding('amazon.titan-embed-text-v1');

    expect(mockConfigs).toHaveLength(1);
    expect(mockConfigs[0].type).toBe('embedding');
    expect(mockConfigs[0].modelId).toBe('amazon.titan-embed-text-v1');

    const headers = mockConfigs[0].config.headers();
    expect(headers['user-agent']).toStrictEqual(
      'ai-sdk/amazon-bedrock/0.0.0-test',
    );
  });

  it('should include amazon-bedrock version in user-agent header for image models', async () => {
    const provider = createAmazonBedrock({
      region: 'us-east-1',
    });

    provider.image('amazon.titan-image-generator');

    expect(mockConfigs).toHaveLength(1);
    expect(mockConfigs[0].type).toBe('image');
    expect(mockConfigs[0].modelId).toBe('amazon.titan-image-generator');

    const headers = mockConfigs[0].config.headers();
    expect(headers['user-agent']).toStrictEqual(
      'ai-sdk/amazon-bedrock/0.0.0-test',
    );
  });
});
