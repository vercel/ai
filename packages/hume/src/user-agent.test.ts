import { describe, it, expect, vi } from 'vitest';
import { createHume } from './hume-provider';
import { HumeSpeechModel } from './hume-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./hume-speech-model', () => ({
  HumeSpeechModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include hume version in user-agent header for speech model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );

    const provider = createHume({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.speech();

    const constructorCall = vi.mocked(HumeSpeechModel).mock.calls[0];
    const config = constructorCall[1];
    const headers =
      typeof config.headers === 'function'
        ? config.headers()
        : config.headers || {};

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/hume/0.0.0-test',
    );
  });
});
