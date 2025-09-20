import { describe, it, expect, vi } from 'vitest';
import { createGroq } from './groq-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

describe('user-agent', () => {
  it('should include groq version in user-agent header for chat model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          object: 'chat.completion',
          created: 1717326371,
          model: 'gemma2-9b-it',
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
          usage: {
            prompt_tokens: 4,
            completion_tokens: 3,
            total_tokens: 7,
          },
        }),
      ),
    );

    const provider = createGroq({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await provider('gemma2-9b-it').doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['user-agent']).toContain('ai-sdk/groq/0.0.0-test');
  });

  it('should include groq version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'Hello, World!',
          x_groq: {
            id: 'test-id',
          },
        }),
      ),
    );

    const provider = createGroq({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const audioData = new Uint8Array([0, 1, 2, 3, 4]);

    await provider.transcription('whisper-large-v3-turbo').doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
    });

    expect(mockFetch).toHaveBeenCalled();

    const fetchCallArgs = mockFetch.mock.calls[0];
    const requestInit = fetchCallArgs[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;

    expect(headers['user-agent']).toContain('ai-sdk/groq/0.0.0-test');
  });
});
