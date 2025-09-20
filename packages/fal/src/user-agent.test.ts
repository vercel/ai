import { describe, it, expect, vi } from 'vitest';
import { createFal } from './fal-provider';
import { FalImageModel } from './fal-image-model';
import { FalTranscriptionModel } from './fal-transcription-model';
import { FalSpeechModel } from './fal-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./fal-image-model', () => ({
  FalImageModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

vi.mock('./fal-transcription-model', () => ({
  FalTranscriptionModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

vi.mock('./fal-speech-model', () => ({
  FalSpeechModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include fal version in user-agent header for image model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'completed',
          output: ['https://example.com/image.jpg'],
        }),
      ),
    );

    const provider = createFal({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.image('fal-ai/flux/schnell');

    const constructorCall = vi.mocked(FalImageModel).mock.calls[0];
    const config = constructorCall[1];
    const headers =
      typeof config.headers === 'function'
        ? config.headers()
        : config.headers || {};

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/fal/0.0.0-test',
    );
  });

  it('should include fal version in user-agent header for transcription model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'test-id',
          status: 'completed',
          output: {
            text: 'Hello, World!',
          },
        }),
      ),
    );

    const provider = createFal({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.transcription('fal-ai/whisper');

    const constructorCall = vi.mocked(FalTranscriptionModel).mock.calls[0];
    const config = constructorCall[1];
    const headers =
      typeof config.headers === 'function'
        ? config.headers()
        : config.headers || {};

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/fal/0.0.0-test',
    );
  });

  it('should include fal version in user-agent header for speech model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );

    const provider = createFal({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.speech('fal-ai/tts');

    const constructorCall = vi.mocked(FalSpeechModel).mock.calls[0];
    const config = constructorCall[1];
    const headers =
      typeof config.headers === 'function'
        ? config.headers()
        : config.headers || {};

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/fal/0.0.0-test',
    );
  });
});
