import { describe, it, expect, vi } from 'vitest';
import { createAssemblyAI } from './assemblyai-provider';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./assemblyai-transcription-model', () => ({
  AssemblyAITranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include assemblyai version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'completed',
          text: 'Hello, World!',
        }),
      ),
    );

    const provider = createAssemblyAI({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription('best');

    const constructorCall = vi.mocked(AssemblyAITranscriptionModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/assemblyai/0.0.0-test');
  });
});
