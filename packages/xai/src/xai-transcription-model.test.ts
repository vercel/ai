import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createXai } from './xai-provider';
import { XaiTranscriptionModel } from './xai-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = new Uint8Array([1, 2, 3, 4]);
const provider = createXai({ apiKey: 'test-api-key' });
const model = provider.transcription();
const url = 'https://api.x.ai/v1/stt';

const server = createTestServer({
  [url]: {},
});

function prepareJsonResponse(headers?: Record<string, string>) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body: {
      text: 'Hello from the AI SDK!',
      language: 'en',
      duration: 2.5,
      words: [
        {
          text: 'Hello',
          start: 0,
          end: 1,
        },
        {
          text: 'from the AI SDK!',
          start: 1,
          end: 2.5,
        },
      ],
    },
  };
}

describe('XaiTranscriptionModel', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('xai.transcription');
    expect(model.modelId).toBe('');
    expect(model.specificationVersion).toBe('v4');
  });
});

describe('doGenerate', () => {
  it('should send a multipart request with the audio file', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body!.file).toBeInstanceOf(File);
    expect((body!.file as File).name).toBe('audio.wav');
    expect((body!.file as File).type).toBe('audio/wav');
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
  });

  it('should map provider options onto xAI request fields', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/pcm',
      providerOptions: {
        xai: {
          audioFormat: 'pcm',
          sampleRate: 16000,
          language: 'en',
          format: true,
          multichannel: true,
          channels: 2,
          diarize: true,
          keyterm: ['AI SDK', 'Grok'],
          fillerWords: true,
        },
      },
    });

    const body = await server.calls[0].requestBodyMultipart;
    expect(body).toMatchObject({
      audio_format: 'pcm',
      sample_rate: '16000',
      language: 'en',
      format: 'true',
      multichannel: 'true',
      channels: '2',
      diarize: 'true',
      keyterm: 'Grok',
      filler_words: 'true',
    });
  });

  it('should append file after all other multipart fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'Hello from the AI SDK!',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const customModel = new XaiTranscriptionModel('', {
      provider: 'xai.transcription',
      baseURL: 'https://api.x.ai/v1',
      headers: () => ({ Authorization: 'Bearer test-api-key' }),
      fetch: fetchMock as unknown as typeof fetch,
    });

    await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/pcm',
      providerOptions: {
        xai: {
          audioFormat: 'pcm',
          sampleRate: 16000,
          language: 'en',
          format: true,
          multichannel: true,
          channels: 2,
          diarize: true,
          keyterm: ['AI SDK', 'Grok'],
          fillerWords: true,
        },
      },
    });

    const request = fetchMock.mock.calls[0][1];
    const body = request.body as FormData;
    expect(Array.from(body.keys())).toEqual([
      'audio_format',
      'sample_rate',
      'language',
      'format',
      'multichannel',
      'channels',
      'diarize',
      'filler_words',
      'keyterm',
      'keyterm',
      'file',
    ]);
  });

  it('should pass headers and the xAI user agent', async () => {
    prepareJsonResponse();

    const customProvider = createXai({
      apiKey: 'test-api-key',
      headers: { 'Custom-Provider-Header': 'provider-header-value' },
    });

    await customProvider.transcription().doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: { 'Custom-Request-Header': 'request-header-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': expect.stringMatching(
        /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
      ),
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/xai/0.0.0-test');
  });

  it('should extract text, segments, language, and duration', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result).toMatchObject({
      text: 'Hello from the AI SDK!',
      language: 'en',
      durationInSeconds: 2.5,
      segments: [
        {
          text: 'Hello',
          startSecond: 0,
          endSecond: 1,
        },
        {
          text: 'from the AI SDK!',
          startSecond: 1,
          endSecond: 2.5,
        },
      ],
      warnings: [],
    });
  });

  it('should include response timestamp, model id, and headers', async () => {
    prepareJsonResponse({
      'x-request-id': 'test-request-id',
      'x-ratelimit-remaining': '123',
    });
    const testDate = new Date(0);
    const customModel = new XaiTranscriptionModel('', {
      provider: 'xai.transcription',
      baseURL: 'https://api.x.ai/v1',
      headers: () => ({ Authorization: 'Bearer test-api-key' }),
      _internal: { currentDate: () => testDate },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: '',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should handle missing words, duration, and empty language', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        text: 'Hello from the AI SDK!',
        language: '',
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result).toMatchObject({
      text: 'Hello from the AI SDK!',
      language: undefined,
      durationInSeconds: undefined,
      segments: [],
      warnings: [],
    });
  });
});
