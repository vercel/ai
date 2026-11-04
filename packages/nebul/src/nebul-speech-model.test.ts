import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { createNebul } from './nebul-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createNebul({ apiKey: 'test-api-key' });
const model = provider.speechModel('some-speech-model');

const server = createTestServer({
  'https://api.inference.nebul.io/v1/audio/speech': {},
});

describe('doGenerate', () => {
  function prepareAudioResponse({
    headers,
    format = 'mp3',
  }: {
    headers?: Record<string, string>;
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  } = {}) {
    const audioBuffer = new Uint8Array(100); // Mock audio data
    server.urls['https://api.inference.nebul.io/v1/audio/speech'].response = {
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
      model: 'some-speech-model',
      input: 'Hello from the AI SDK!',
    });
  });

  it('should apply default voice and response format', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'some-speech-model',
      input: 'Hello from the AI SDK!',
      voice: 'alloy',
      response_format: 'mp3',
    });
  });

  it('should pass headers', async () => {
    prepareAudioResponse();

    const providerWithHeaders = createNebul({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await providerWithHeaders.speechModel('some-speech-model').doGenerate({
      text: 'Hello from the AI SDK!',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/nebul/0.0.0-test',
    );
  });

  it('should pass options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      voice: 'nova',
      outputFormat: 'opus',
      speed: 1.5,
      instructions: 'Speak in a calm voice.',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'some-speech-model',
      input: 'Hello from the AI SDK!',
      voice: 'nova',
      speed: 1.5,
      instructions: 'Speak in a calm voice.',
      response_format: 'opus',
    });
  });

  it('should return the audio bytes', async () => {
    const audioData = prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.audio).toEqual(audioData);
  });

  it('should warn about unsupported output formats', async () => {
    prepareAudioResponse({ format: 'mp3' });

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'unknown-format' as any,
    });

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'outputFormat',
        details:
          'Unsupported output format: unknown-format. Using mp3 instead.',
      },
    ]);

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      response_format: 'mp3',
    });
  });

  it('should warn about unsupported language parameter', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      language: 'en',
    });

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'language',
        details:
          'Nebul speech models do not support language selection. Language parameter "en" was ignored.',
      },
    ]);
  });
});
