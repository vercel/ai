import { describe, it, expect, vi } from 'vitest';
import { createTogetherAI } from './togetherai-provider';
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
  it('should include togetherai version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'meta-llama/Llama-2-7b-chat-hf',
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

    const provider = createTogetherAI({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('meta-llama/Llama-2-7b-chat-hf');

    const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/togetherai/0.0.0-test');
  });

  it('should include togetherai version in user-agent header for embedding model', async () => {
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
          model: 'togethercomputer/m2-bert-80M-8k-retrieval',
          usage: {
            prompt_tokens: 1,
            total_tokens: 1,
          },
        }),
      ),
    );

    const provider = createTogetherAI({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.textEmbeddingModel(
      'togethercomputer/m2-bert-80M-8k-retrieval',
    );

    const constructorCall = vi.mocked(OpenAICompatibleEmbeddingModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/togetherai/0.0.0-test');
  });
});
