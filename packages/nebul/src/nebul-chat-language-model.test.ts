import { describe, expect, it, vi } from 'vitest';
import { createNebul } from './nebul-provider';

describe('NebulChatLanguageModel', () => {
  it('passes expected configuration to chat completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'mistralai/Mistral-7B-Instruct-v0.3',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello World',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 9,
            completion_tokens: 12,
            total_tokens: 21,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const model = createNebul({ apiKey: 'test-key', fetch: fetchMock })(
      'mistralai/Mistral-7B-Instruct-v0.3',
    );

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });

    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello World' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.inference.nebul.io/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
      }),
    );
  });
});
