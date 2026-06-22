import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createMistral } from './mistral-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createMistral({ apiKey: 'test-api-key' });
const model = provider.speech('voxtral-mini-tts-2506');

const server = createTestServer({
  'https://api.mistral.ai/v1/audio/speech': {},
});

describe('doGenerate', () => {
  function prepareAudioResponse({
    headers,
    format = 'mp3',
  }: {
    headers?: Record<string, string>;
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls['https://api.mistral.ai/v1/audio/speech'].response = {
      type: 'binary',
      headers: {
        'content-type': `audio/${format}`,
        ...headers,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  it('should pass the model and text', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'voxtral-mini-tts-2506',
      input: 'Hello from the AI SDK!',
    });
  });

  it('should pass voice and format', async () => {
    prepareAudioResponse({ format: 'mp3' });

    await model.doGenerate({
      text: 'Hello!',
      voice: 'coeur_de_lion',
      outputFormat: 'mp3',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'voxtral-mini-tts-2506',
      input: 'Hello!',
      voice: 'coeur_de_lion',
      response_format: 'mp3',
    });
  });

  it('should warn on unsupported output format', async () => {
    prepareAudioResponse();

    const { warnings } = await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'hex',
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'outputFormat',
      }),
    );
  });

  it('should warn on unsupported speed', async () => {
    prepareAudioResponse();

    const { warnings } = await model.doGenerate({
      text: 'Hello!',
      speed: 1.5,
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'speed',
      }),
    );
  });

  it('should warn on unsupported language', async () => {
    prepareAudioResponse();

    const { warnings } = await model.doGenerate({
      text: 'Hello!',
      language: 'fr',
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'language',
      }),
    );
  });

  it('should return audio data', async () => {
    const audio = prepareAudioResponse({ format: 'mp3' });

    const result = await model.doGenerate({ text: 'Hello!' });

    expect(result.audio).toBeInstanceOf(Uint8Array);
    expect(result.audio).toEqual(audio);
  });

  it('should pass headers', async () => {
    prepareAudioResponse();

    const customProvider = createMistral({
      apiKey: 'test-api-key',
      headers: { 'Custom-Provider-Header': 'provider-value' },
    });

    await customProvider.speech('voxtral-mini-tts-2506').doGenerate({
      text: 'Hello!',
      headers: { 'Custom-Request-Header': 'request-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'custom-provider-header': 'provider-value',
      'custom-request-header': 'request-value',
    });
  });
});
