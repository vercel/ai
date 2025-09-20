import { describe, it, expect, vi } from 'vitest';
import { createGladia } from './gladia-provider';
import { GladiaTranscriptionModel } from './gladia-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./gladia-transcription-model', () => ({
  GladiaTranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include gladia version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          result: {
            transcription: {
              full_transcript: 'Hello, World!',
            },
          },
        }),
      ),
    );

    const provider = createGladia({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription();

    const constructorCall = vi.mocked(GladiaTranscriptionModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/gladia/0.0.0-test');
  });
});
