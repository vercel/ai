import { describe, it, expect, vi } from 'vitest';
import { createXai } from './xai-provider';
import { XaiChatLanguageModel } from './xai-chat-language-model';
import { OpenAICompatibleImageModel } from '@ai-sdk/openai-compatible';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./xai-chat-language-model', () => ({
  XaiChatLanguageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleImageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include xai version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'grok-beta',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello, World!',
              },
              finish_reason: 'stop',
              index: 0,
            },
          ],
        }),
      ),
    );

    const provider = createXai({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('grok-beta');

    const constructorCall = vi.mocked(XaiChatLanguageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/xai/0.0.0-test');
  });

  it('should include xai version in user-agent header for image model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'images',
          data: [
            {
              url: 'https://example.com/image.jpg',
            },
          ],
        }),
      ),
    );

    const provider = createXai({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.image('grok-vision-beta');

    const constructorCall = vi.mocked(OpenAICompatibleImageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/xai/0.0.0-test');
  });
});
