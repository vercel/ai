import { createTestServer } from '@ai-sdk/provider-utils/test';
import { OpenAITranscriptionModel } from './openai-transcription-model';
import { createOpenAI } from './openai-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.transcription('whisper-1');

const server = createTestServer({
  'https://api.openai.com/v1/audio/transcriptions': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      headers,
      body: {
        transcript: {
          text: 'Hello from the Vercel AI SDK!',
          segments: [
            {
              text: 'Hello',
              startSecond: 0,
              endSecond: 5,
            },
            {
              text: 'from',
              startSecond: 5,
              endSecond: 10,
            },
            {
              text: 'the',
              startSecond: 10,
              endSecond: 15,
            },
            {
              text: 'Vercel',
              startSecond: 15,
              endSecond: 20,
            },
            {
              text: 'AI',
              startSecond: 20,
              endSecond: 25,
            },
            {
              text: 'SDK',
              startSecond: 25,
              endSecond: 30,
            },
            {
              text: '!',
              startSecond: 30,
              endSecond: 35,
            },
          ],
          durationInSeconds: 35,
          language: 'en',
          mime_type: 'audio/mp3',
        },
        providerMetadata: {
          'test-provider': 'test-value',
        },
      },
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model: 'whisper-1',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('whisper-1').doGenerate({
      audio: audioData,
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
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
    });

    expect(result.transcript.text).toBe('Hello from the Vercel AI SDK!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new OpenAITranscriptionModel(
      'whisper-1',
      {
        provider: 'test-provider',
        url: () => 'https://api.openai.com/v1/audio/transcriptions',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      },
    );

    const result = await customModel.doGenerate({
      audio: audioData,
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'whisper-1',
      headers: {
        'content-length': '510',
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareJsonResponse();
    const beforeDate = new Date();

    const result = await model.doGenerate({
      audio: audioData,
    });

    const afterDate = new Date();

    expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeDate.getTime(),
    );
    expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
      afterDate.getTime(),
    );
    expect(result.response.modelId).toBe('whisper-1');
  });
});
