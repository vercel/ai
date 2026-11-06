import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { InferenceCoopTranscriptionModel } from './inference-coop-transcription-model';
import { createInferenceCoop } from './inference-coop-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.wav'));
const provider = createInferenceCoop({ apiKey: 'test-api-key' });
const model = provider.transcription('tinfoil/whisper-large-v3-turbo');

const server = createTestServer({
  'https://gateway.inference.coop/v1/audio/transcriptions': {},
});

// Structure captured from the gateway (2026-11): `duration` arrives as a
// string and `words` is null on the default response.
function prepareJsonResponse({
  headers,
}: {
  headers?: Record<string, string>;
} = {}) {
  server.urls[
    'https://gateway.inference.coop/v1/audio/transcriptions'
  ].response = {
    type: 'json-value',
    headers,
    body: {
      text: ' Hello from the cooperative.',
      usage: null,
      language: 'en',
      duration: '1.4666875',
      words: null,
      segments: [
        {
          id: 0,
          avg_logprob: -0.3261231322373663,
          compression_ratio: 0.7777777777777778,
          end: 1.16,
          no_speech_prob: null,
          seek: 0,
          start: 0,
          temperature: 0,
          text: ' Hello from the cooperative.',
          tokens: [2425, 490, 264, 31772, 13],
        },
      ],
    },
  };
}

describe('InferenceCoopTranscriptionModel', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('inference-coop.transcription');
    expect(model.modelId).toBe('tinfoil/whisper-large-v3-turbo');
    expect(model.specificationVersion).toBe('v4');
  });
});

describe('doGenerate', () => {
  it('should pass the model and audio file', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model: 'tinfoil/whisper-large-v3-turbo',
    });
  });

  it('should pass provider options as form fields', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        'inference-coop': {
          language: 'en',
          prompt: 'cooperative',
          temperature: 0.5,
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      language: 'en',
      prompt: 'cooperative',
      temperature: '0.5',
    });
  });

  it('should pass headers and the co-op user agent', async () => {
    prepareJsonResponse();

    const customProvider = createInferenceCoop({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await customProvider
      .transcription('tinfoil/whisper-large-v3-turbo')
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
      'ai-sdk-inference-coop/0.0.0-test',
    );
  });

  it('should extract text, language, duration, and segments', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe(' Hello from the cooperative.');
    expect(result.language).toBe('en');
    expect(result.durationInSeconds).toBe(1.4666875);
    expect(result.segments).toEqual([
      {
        text: ' Hello from the cooperative.',
        startSecond: 0,
        endSecond: 1.16,
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('should fall back to words when segments are null', async () => {
    server.urls[
      'https://gateway.inference.coop/v1/audio/transcriptions'
    ].response = {
      type: 'json-value',
      body: {
        text: ' Hello from the cooperative.',
        usage: null,
        language: 'en',
        duration: 2,
        words: [
          { word: 'Hello', start: 0, end: 1 },
          { word: 'world', start: 1, end: 2 },
        ],
        segments: null,
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.segments).toEqual([
      { text: 'Hello', startSecond: 0, endSecond: 1 },
      { text: 'world', startSecond: 1, endSecond: 2 },
    ]);
    expect(result.durationInSeconds).toBe(2);
  });

  it('should include response timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    const testDate = new Date(0);
    const customModel = new InferenceCoopTranscriptionModel(
      'tinfoil/whisper-large-v3-turbo',
      {
        provider: 'inference-coop.transcription',
        baseURL: 'https://gateway.inference.coop/v1',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      },
    );

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'tinfoil/whisper-large-v3-turbo',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
      },
    });
  });

  it('should handle API errors', async () => {
    server.urls[
      'https://gateway.inference.coop/v1/audio/transcriptions'
    ].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'Invalid model name passed in model=nonexistent/model.',
          type: 'invalid_request_error',
        },
      }),
    };

    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      }),
    ).rejects.toMatchObject({
      message: 'Invalid model name passed in model=nonexistent/model.',
      statusCode: 400,
    });
  });
});
