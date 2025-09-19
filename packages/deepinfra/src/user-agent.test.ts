import { describe, it, expect, vi } from 'vitest';
import { createDeepInfra } from './deepinfra-provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { DeepInfraImageModel } from './deepinfra-image-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
  OpenAICompatibleCompletionLanguageModel: vi.fn(),
  OpenAICompatibleEmbeddingModel: vi.fn(),
}));

vi.mock('./deepinfra-image-model', () => ({
  DeepInfraImageModel: vi.fn(),
}));

describe('user-agent', () => {
  it('should include deepinfra version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          model: 'deepinfra-model-id',
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

    const provider = createDeepInfra({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider('deepinfra-model-id');

    // Extract the OpenAICompatibleChatLanguageModel constructor call
    const constructorCall = vi.mocked(OpenAICompatibleChatLanguageModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/deepinfra/0.0.0-test');
  });
});
