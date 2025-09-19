import { describe, it, expect, vi } from 'vitest';
import { createFireworks } from './fireworks-provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
  OpenAICompatibleEmbeddingModel: vi.fn().mockImplementation(() => ({
    doEmbed: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include fireworks version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'fireworks-model-id',
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

    const provider = createFireworks({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('accounts/fireworks/models/llama-v3p1-8b-instruct');

    const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/fireworks/0.0.0-test');
  });

  it('should include fireworks version in user-agent header for embedding model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [
            {
              object: 'embedding',
              index: 0,
              embedding: [0.1, 0.2, 0.3],
            },
          ],
          model: 'nomic-ai/nomic-embed-text-v1.5',
          usage: {
            prompt_tokens: 1,
            total_tokens: 1,
          },
        }),
      ),
    );

    const provider = createFireworks({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.textEmbeddingModel('nomic-ai/nomic-embed-text-v1.5');

    const constructorCall = vi.mocked(OpenAICompatibleEmbeddingModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/fireworks/0.0.0-test');
  });
});
