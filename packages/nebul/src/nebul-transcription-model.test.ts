import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { createNebul } from './nebul-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

const provider = createNebul({ apiKey: 'test-api-key' });
const model = provider.transcriptionModel('some-transcription-model');

const server = createTestServer({
  'https://api.inference.nebul.io/v1/audio/transcriptions': {},
});

function prepareJsonResponse(body: Record<string, any>) {
  server.urls[
    'https://api.inference.nebul.io/v1/audio/transcriptions'
  ].response = {
    type: 'json-value',
    body,
  };
}

describe('doGenerate', () => {
  it('should pass the model, file, and default response format', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
    });

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body!.file).toBeInstanceOf(File);
    const { file: _, ...rest } = body!;
    expect(rest).toMatchObject({
      model: 'some-transcription-model',
      response_format: 'verbose_json',
    });
  });

  it('should pass the audio file with the correct extension', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
    });

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body!.file).toBeInstanceOf(File);
    expect(body!.file).toMatchObject({
      name: 'audio.mp3',
      type: 'audio/mpeg',
    });
  });

  it('should extract the transcription result', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
      language: 'english',
      duration: 2.5,
      segments: [{ text: 'Hello from the AI SDK!', start: 0, end: 2.5 }],
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello from the AI SDK!');
    expect(result.segments).toEqual([
      { text: 'Hello from the AI SDK!', startSecond: 0, endSecond: 2.5 },
    ]);
    expect(result.language).toBe('en');
    expect(result.durationInSeconds).toBe(2.5);
  });

  it('should fall back to word timestamps when segments are missing', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
      words: [
        { word: 'Hello', start: 0, end: 1 },
        { word: 'from the AI SDK!', start: 1, end: 2.5 },
      ],
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.segments).toEqual([
      { text: 'Hello', startSecond: 0, endSecond: 1 },
      { text: 'from the AI SDK!', startSecond: 1, endSecond: 2.5 },
    ]);
  });

  it('should keep unknown language names as-is', async () => {
    prepareJsonResponse({
      text: 'Hello',
      language: 'klingon',
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.language).toBe('klingon');
  });

  it('should pass provider options', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
    });

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        nebul: {
          responseFormat: 'json',
          language: 'en',
          prompt: 'This is a test.',
          temperature: 0.5,
        },
      },
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body!.file).toBeInstanceOf(File);
    const { file: _, ...rest } = body!;
    expect(rest).toMatchObject({
      model: 'some-transcription-model',
      response_format: 'json',
      language: 'en',
      prompt: 'This is a test.',
      temperature: '0.5',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
    });

    const providerWithHeaders = createNebul({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await providerWithHeaders
      .transcriptionModel('some-transcription-model')
      .doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': expect.stringMatching(
        /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
      ),
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/nebul/0.0.0-test',
    );
  });

  it('should handle base64 audio input', async () => {
    prepareJsonResponse({
      text: 'Hello from the AI SDK!',
    });

    // base64 of [0, 1, 2, 3, 4, 5, 6, 7]
    await model.doGenerate({
      audio: 'AAECAwQFBgc=',
      mediaType: 'audio/wav',
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body!.file).toBeInstanceOf(File);
    expect(body!.file).toMatchObject({
      name: 'audio.wav',
      type: 'audio/wav',
    });
  });
});
