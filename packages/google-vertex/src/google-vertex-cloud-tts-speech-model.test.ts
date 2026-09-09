import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { GoogleVertexCloudTTSSpeechModel } from './google-vertex-cloud-tts-speech-model';
import { createGoogleVertex } from './google-vertex-provider-base';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createGoogleVertex({
  project: 'test-project',
  location: 'us-central1',
});
const model = provider.speech('chirp-3-hd');

// 8 bytes of audio; base64 -> 'AQIDBAUGBwg='.
const audioBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const AUDIO_BASE64 = 'AQIDBAUGBwg=';

const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const server = createTestServer({
  [url]: {},
});

function prepareJsonResponse({
  headers,
}: {
  headers?: Record<string, string>;
} = {}) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body: { audioContent: AUDIO_BASE64 },
  };
}

describe('doGenerate', () => {
  it('should target the Cloud Text-to-Speech synthesize endpoint', async () => {
    prepareJsonResponse();

    await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(server.calls[0].requestUrl).toBe(url);
  });

  it('should send text, a default voice and LINEAR16 audio config', async () => {
    prepareJsonResponse();

    await model.doGenerate({ text: 'Hello from the AI SDK!' });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: { text: 'Hello from the AI SDK!' },
      voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Kore' },
      audioConfig: { audioEncoding: 'LINEAR16' },
    });
  });

  it('should compose the voice name from language and voice', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      text: 'Hallo!',
      voice: 'Aoede',
      language: 'de-DE',
    });

    expect((await server.calls[0].requestBodyJson).voice).toStrictEqual({
      languageCode: 'de-DE',
      name: 'de-DE-Chirp3-HD-Aoede',
    });
  });

  it('should pass a fully-qualified Chirp 3: HD voice name through verbatim', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      text: 'Bonjour !',
      voice: 'fr-FR-Chirp3-HD-Charon',
    });

    expect((await server.calls[0].requestBodyJson).voice).toStrictEqual({
      languageCode: 'fr-FR',
      name: 'fr-FR-Chirp3-HD-Charon',
    });
  });

  it('should default the language for a Chirp 3: HD voice name without a locale prefix', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      text: 'Hello!',
      voice: 'Chirp3-HD-Kore',
    });

    expect((await server.calls[0].requestBodyJson).voice).toStrictEqual({
      languageCode: 'en-US',
      name: 'Chirp3-HD-Kore',
    });
  });

  it('should prefer an explicit language over the voice-name locale', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      text: 'Hello!',
      voice: 'en-AU-Chirp3-HD-Kore',
      language: 'en-GB',
    });

    expect((await server.calls[0].requestBodyJson).voice).toStrictEqual({
      languageCode: 'en-GB',
      name: 'en-AU-Chirp3-HD-Kore',
    });
  });

  it('should decode the base64 audio content', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ text: 'Hello!' });

    expect(result.audio).toStrictEqual(audioBytes);
    expect(result.providerMetadata).toStrictEqual({
      google: { mimeType: 'audio/wav' },
    });
  });

  it('should map speed to speakingRate', async () => {
    prepareJsonResponse();

    await model.doGenerate({ text: 'Hello!', speed: 1.5 });

    expect((await server.calls[0].requestBodyJson).audioConfig).toStrictEqual({
      audioEncoding: 'LINEAR16',
      speakingRate: 1.5,
    });
  });

  it('should warn about unsupported instructions', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Hello!',
      instructions: 'Speak slowly.',
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'instructions' }),
    ]);
  });

  it('should warn about unsupported output formats', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'mp3',
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'outputFormat' }),
    ]);
  });

  it('should not warn for the wav output format', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'wav',
    });

    expect(result.warnings).toEqual([]);
  });

  it('should return empty audio when the response has no audio content', async () => {
    server.urls[url].response = { type: 'json-value', body: {} };

    const result = await model.doGenerate({ text: 'Hello!' });

    expect(result.audio).toStrictEqual(new Uint8Array(0));
  });

  it('should pass headers and user agent', async () => {
    prepareJsonResponse();

    const providerWithHeaders = createGoogleVertex({
      project: 'test-project',
      location: 'us-central1',
      headers: { 'Custom-Provider-Header': 'provider-header-value' },
    });

    await providerWithHeaders.speech('chirp-3-hd').doGenerate({
      text: 'Hello!',
      headers: { 'Custom-Request-Header': 'request-header-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/google-vertex/0.0.0-test',
    );
  });

  it('should include response data with timestamp, modelId, headers and raw body', async () => {
    prepareJsonResponse({ headers: { 'x-request-id': 'test-request-id' } });

    const testDate = new Date(0);
    const customModel = new GoogleVertexCloudTTSSpeechModel('chirp-3-hd', {
      provider: 'google.vertex.speech',
      headers: () => ({}),
      _internal: { currentDate: () => testDate },
    });

    const result = await customModel.doGenerate({ text: 'Hello!' });

    expect(result.response.timestamp.getTime()).toBe(testDate.getTime());
    expect(result.response.modelId).toBe('chirp-3-hd');
    expect(result.response.headers?.['x-request-id']).toBe('test-request-id');
    expect(result.response.body).toStrictEqual({
      audioContent: AUDIO_BASE64,
    });
  });

  it('should include the request body', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({ text: 'Hello!' });

    expect(result.request?.body).toBe(
      JSON.stringify({
        input: { text: 'Hello!' },
        voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Kore' },
        audioConfig: { audioEncoding: 'LINEAR16' },
      }),
    );
  });

  it('should throw an API call error for error responses', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          code: 400,
          message: 'Voice not found.',
          status: 'INVALID_ARGUMENT',
        },
      }),
    };

    await expect(model.doGenerate({ text: 'Hello!' })).rejects.toThrow(
      'Voice not found.',
    );
  });
});
