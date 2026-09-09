import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GroqTranscriptionModel } from './groq-transcription-model';
import { createGroq } from './groq-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const textResponse = JSON.parse(
  await readFile(
    path.join(__dirname, '__fixtures__/groq-transcription-text.json'),
    'utf8',
  ),
) as {
  headers: Record<string, string>;
  body: string;
};
const provider = createGroq({ apiKey: 'test-api-key' });
const model = provider.transcription('whisper-large-v3-turbo');

const server = createTestServer({
  'https://api.groq.com/openai/v1/audio/transcriptions': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls[
      'https://api.groq.com/openai/v1/audio/transcriptions'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        task: 'transcribe',
        language: 'English',
        duration: 2.5,
        text: 'Hello world!',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 2.48,
            text: 'Hello world!',
            tokens: [50365, 2425, 490, 264],
            temperature: 0,
            avg_logprob: -0.29010406,
            compression_ratio: 0.7777778,
            no_speech_prob: 0.032802984,
          },
        ],
        x_groq: { id: 'req_01jrh9nn61f24rydqq1r4b3yg5' },
      },
    };
  }

  it('should pass the model', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model: 'whisper-large-v3-turbo',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createGroq({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('whisper-large-v3-turbo').doGenerate({
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
      `ai-sdk/groq/0.0.0-test`,
    );
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello world!');
  });

  it('should extract a plain-text transcription response', async () => {
    server.urls[
      'https://api.groq.com/openai/v1/audio/transcriptions'
    ].response = {
      type: 'binary',
      headers: textResponse.headers,
      body: Buffer.from(textResponse.body),
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        groq: {
          responseFormat: 'text',
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      response_format: 'text',
    });
    expect(result.text).toBe(textResponse.body);
    expect(result.response.body).toBe(textResponse.body);
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new GroqTranscriptionModel('whisper-large-v3-turbo', {
      provider: 'test-provider',
      url: () => 'https://api.groq.com/openai/v1/audio/transcriptions',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'whisper-large-v3-turbo',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareJsonResponse();

    const testDate = new Date(0);
    const customModel = new GroqTranscriptionModel('whisper-large-v3-turbo', {
      provider: 'test-provider',
      url: () => 'https://api.groq.com/openai/v1/audio/transcriptions',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response.timestamp.getTime()).toEqual(testDate.getTime());
    expect(result.response.modelId).toBe('whisper-large-v3-turbo');
  });

  it('should correctly pass provider options when they are an array', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        groq: {
          timestampGranularities: ['segment'],
          responseFormat: 'verbose_json',
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      'timestamp_granularities[]': 'segment',
      response_format: 'verbose_json',
    });
  });

  it('should fallback to words when segments are not available', async () => {
    server.urls[
      'https://api.groq.com/openai/v1/audio/transcriptions'
    ].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        language: 'English',
        duration: 2,
        text: 'Hello world',
        segments: null,
        words: [
          {
            word: 'Hello',
            start: 0,
            end: 1,
          },
          {
            word: 'world',
            start: 1,
            end: 2,
          },
        ],
        x_groq: { id: 'req_01jrh9nn61f24rydqq1r4b3yg5' },
      },
    };

    const result = await provider.transcription('whisper-large-v3').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        groq: {
          language: 'en',
          responseFormat: 'verbose_json',
          timestampGranularities: ['word'],
        },
      },
    });

    expect(result.segments).toEqual([
      {
        text: 'Hello',
        startSecond: 0,
        endSecond: 1,
      },
      {
        text: 'world',
        startSecond: 1,
        endSecond: 2,
      },
    ]);
  });
});
