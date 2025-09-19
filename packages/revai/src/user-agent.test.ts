import { describe, it, expect, vi } from 'vitest';
import { createRevai } from './revai-provider';
import { RevaiTranscriptionModel } from './revai-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./revai-transcription-model', () => ({
  RevaiTranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include revai version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'completed',
          results: {
            transcripts: [
              {
                text: 'Hello, World!',
              },
            ],
          },
        }),
      ),
    );

    const provider = createRevai({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription('machine');

    const constructorCall = vi.mocked(RevaiTranscriptionModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/revai/0.0.0-test');
  });
});
