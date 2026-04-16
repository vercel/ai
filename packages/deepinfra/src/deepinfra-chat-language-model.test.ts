import { describe, it, expect, vi } from 'vitest';
import { DeepInfraChatLanguageModel } from './deepinfra-chat-language-model';

describe('DeepInfraChatLanguageModel', () => {
  describe('usage calculation', () => {
    it('should fix incorrect completion_tokens when reasoning_tokens > completion_tokens', async () => {
      const responseBody = {
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-2-9b-it',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 19,
          completion_tokens: 84,
          total_tokens: 1184,
          prompt_tokens_details: null,
          completion_tokens_details: {
            reasoning_tokens: 1081,
          },
        },
      };

      const model = new DeepInfraChatLanguageModel('google/gemma-2-9b-it', {
        provider: 'deepinfra.chat',
        url: () => 'https://api.deepinfra.com/v1/openai/chat/completions',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: async () => JSON.stringify(responseBody),
          json: async () => responseBody,
        }) as any,
      });

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Test prompt' }],
          },
        ],
      });

      expect(result.usage.outputTokens).toBe(1165);
      expect(result.usage.reasoningTokens).toBe(1081);
      expect(result.usage.totalTokens).toBe(2265);
    });

    it('should not modify usage when completion_tokens includes reasoning_tokens', async () => {
      const responseBody = {
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 475,
          total_tokens: 493,
          prompt_tokens_details: null,
        },
      };

      const model = new DeepInfraChatLanguageModel(
        'mistralai/Mixtral-8x7B-Instruct-v0.1',
        {
          provider: 'deepinfra.chat',
          url: () => 'https://api.deepinfra.com/v1/openai/chat/completions',
          headers: () => ({ Authorization: 'Bearer test-key' }),
          fetch: vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify(responseBody),
            json: async () => responseBody,
          }) as any,
        },
      );

      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Test prompt' }],
          },
        ],
      });

      expect(result.usage.outputTokens).toBe(475);
      expect(result.usage.totalTokens).toBe(493);
    });
  });
});
