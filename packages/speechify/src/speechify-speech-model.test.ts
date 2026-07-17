import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { SpeechifySpeechModel } from './speechify-speech-model';
import { createSpeechify } from './speechify-provider';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createSpeechify({ apiKey: 'test-api-key' });
const model = provider.speech('simba-3.2');

const audioBase64 = convertUint8ArrayToBase64(new Uint8Array([1, 2, 3, 4]));

const server = createTestServer({
  'https://api.sws.speechify.com/v1/audio/speech': {},
});

describe('doGenerate', () => {
  function prepareAudioResponse({
    headers,
    audio_format = 'mp3',
    speech_marks = { type: 'word', start: 0, end: 5 },
    billable_characters_count = 12,
  }: {
    headers?: Record<string, string>;
    audio_format?: string;
    speech_marks?: unknown;
    billable_characters_count?: number;
  } = {}) {
    server.urls['https://api.sws.speechify.com/v1/audio/speech'].response = {
      type: 'json-value',
      headers,
      body: {
        audio_data: audioBase64,
        audio_format,
        speech_marks,
        billable_characters_count,
      },
    };
  }

  it('should pass the model, text and default voice', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      input: 'Hello from the AI SDK!',
      voice_id: 'geffen_32',
      model: 'simba-3.2',
    });
  });

  it('should pass headers and authorization', async () => {
    prepareAudioResponse();

    const provider = createSpeechify({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.speech('simba-3.2').doGenerate({
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
      `ai-sdk/speechify/0.0.0-test`,
    );
  });

  it('should pass the voice and language', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      voice: 'custom-voice',
      language: 'en',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      input: 'Hello from the AI SDK!',
      voice_id: 'custom-voice',
      model: 'simba-3.2',
      language: 'en',
    });
  });

  it('should map a simple output format to audio_format', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'wav',
    });

    const body = await server.calls[0].requestBodyJson;
    expect(body.audio_format).toBe('wav');
    expect(body.output_format).toBeUndefined();
  });

  it('should pass a codec output format through as output_format', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'ulaw_8000',
    });

    const body = await server.calls[0].requestBodyJson;
    expect(body.output_format).toBe('ulaw_8000');
    expect(body.audio_format).toBeUndefined();
  });

  it('should warn on an unsupported output format', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      outputFormat: 'flac',
    });

    const body = await server.calls[0].requestBodyJson;
    expect(body.audio_format).toBeUndefined();
    expect(body.output_format).toBeUndefined();
    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'outputFormat',
      details: expect.stringContaining('flac'),
    });
  });

  it('should wrap text in SSML prosody when speed is set', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello',
      speed: 1.5,
    });

    expect((await server.calls[0].requestBodyJson).input).toBe(
      '<speak><prosody rate="150%">Hello</prosody></speak>',
    );
  });

  it('should pass SSML input through unchanged and warn when speed is also set', async () => {
    prepareAudioResponse();

    const ssml = '<speak>Already SSML</speak>';
    const result = await model.doGenerate({
      text: ssml,
      speed: 2,
    });

    expect((await server.calls[0].requestBodyJson).input).toBe(ssml);
    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'speed',
      details: expect.any(String),
    });
  });

  it('should map provider options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      providerOptions: {
        speechify: {
          outputFormat: 'mp3_24000_128',
          loudnessNormalization: true,
          textNormalization: false,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      output_format: 'mp3_24000_128',
      options: {
        loudness_normalization: true,
        text_normalization: false,
      },
    });
  });

  it('should send SSML unchanged when the ssml provider option is set', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: '<speak>hi</speak>',
      speed: 1.2,
      providerOptions: {
        speechify: {
          ssml: true,
        },
      },
    });

    expect((await server.calls[0].requestBodyJson).input).toBe(
      '<speak>hi</speak>',
    );
  });

  it('should warn when instructions are provided', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      instructions: 'Speak slowly',
    });

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'instructions',
      details: expect.any(String),
    });
  });

  it('should return the base64 audio data', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.audio).toStrictEqual(audioBase64);
  });

  it('should expose speech marks and billable characters in provider metadata', async () => {
    prepareAudioResponse({
      audio_format: 'mp3',
      speech_marks: { type: 'word', start: 0, end: 4, value: 'Hi' },
      billable_characters_count: 2,
    });

    const result = await model.doGenerate({
      text: 'Hi',
    });

    expect(result.providerMetadata?.speechify).toStrictEqual({
      audioFormat: 'mp3',
      billableCharactersCount: 2,
      speechMarks: { type: 'word', start: 0, end: 4, value: 'Hi' },
    });
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareAudioResponse({
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    const testDate = new Date(0);
    const customModel = new SpeechifySpeechModel('simba-3.2', {
      provider: 'test-provider',
      url: () => 'https://api.sws.speechify.com/v1/audio/speech',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'simba-3.2',
      headers: {
        'x-request-id': 'test-request-id',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.response.timestamp.getTime()).toBeGreaterThan(0);
    expect(result.response.modelId).toBe('simba-3.2');
  });

  it('should not include warnings for a plain generation', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.warnings).toEqual([]);
  });
});
