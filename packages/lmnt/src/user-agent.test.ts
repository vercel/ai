import { describe, it, expect, vi } from 'vitest';
import { createLMNT } from './lmnt-provider';
import { LMNTSpeechModel } from './lmnt-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('./lmnt-speech-model', () => ({
  LMNTSpeechModel: vi.fn().mockImplementation(() => ({
    doGenerate: vi.fn(),
  })),
}));

describe('user-agent', () => {
  it('should include lmnt version in user-agent header for speech model', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );

    const provider = createLMNT({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    const model = provider.speech('aurora');

    const constructorCall = vi.mocked(LMNTSpeechModel).mock.calls[0];
    const config = constructorCall[1];
    const headers =
      typeof config.headers === 'function'
        ? config.headers()
        : config.headers || {};

    expect((headers as Record<string, string>)['user-agent']).toContain(
      'ai-sdk/lmnt/0.0.0-test',
    );
  });
});
