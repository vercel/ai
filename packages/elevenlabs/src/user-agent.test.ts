import { describe, it, expect, vi } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';
import { ElevenLabsTranscriptionModel } from './elevenlabs-transcription-model';
import { ElevenLabsSpeechModel } from './elevenlabs-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./elevenlabs-transcription-model', () => ({
  ElevenLabsTranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

vi.mock('./elevenlabs-speech-model', () => ({
  ElevenLabsSpeechModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include elevenlabs version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'Hello, World!',
        }),
      ),
    );

    const provider = createElevenLabs({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription('scribe_v1');

    const constructorCall = vi.mocked(ElevenLabsTranscriptionModel).mock
      .calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/elevenlabs/0.0.0-test');
  });

  it('should include elevenlabs version in user-agent header for speech model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: {
          'content-type': 'audio/mpeg',
        },
      }),
    );

    const provider = createElevenLabs({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.speech('eleven_turbo_v2');

    const constructorCall = vi.mocked(ElevenLabsSpeechModel).mock.calls[0];
    const config = constructorCall[1];
    const headers = config.headers();

    expect(headers['user-agent']).toContain('ai-sdk/elevenlabs/0.0.0-test');
  });
});
