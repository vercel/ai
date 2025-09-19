import { describe, it, expect, vi } from 'vitest';
import { createDeepgram } from './deepgram-provider';
import { DeepgramTranscriptionModel } from './deepgram-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./deepgram-transcription-model', () => ({
  DeepgramTranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include deepgram version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: 'Hello, World!',
                    confidence: 0.99,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );

    const provider = createDeepgram({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription('nova-3');

    const constructorCall = vi.mocked(DeepgramTranscriptionModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/deepgram/0.0.0-test');
  });
});
