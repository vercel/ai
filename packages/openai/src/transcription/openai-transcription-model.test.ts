import { createTestServer } from '@ai-sdk/provider-utils/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createOpenAI } from '../openai-provider';
import { OpenAITranscriptionModel } from './openai-transcription-model';

const audioData = await readFile(
  path.join(__dirname, 'transcription-test.mp3'),
);
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
        task: 'transcribe',
        text: 'Hello from the Vercel AI SDK!',
        words: [
          {
            word: 'Hello',
            start: 0,
            end: 5,
          },
          {
            word: 'from',
            start: 5,
            end: 10,
          },
          {
            word: 'the',
            start: 10,
            end: 15,
          },
          {
            word: 'Vercel',
            start: 15,
            end: 20,
          },
          {
            word: 'AI',
            start: 20,
            end: 25,
          },
          {
            word: 'SDK',
            start: 25,
            end: 30,
          },
          {
            word: '!',
            start: 30,
            end: 35,
          },
        ],
        durationInSeconds: 35,
        language: 'en',
        _request_id: 'req_1234',
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
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello from the Vercel AI SDK!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new OpenAITranscriptionModel('whisper-1', {
      provider: 'test-provider',
      url: () => 'https://api.openai.com/v1/audio/transcriptions',
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
      modelId: 'whisper-1',
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
    const customModel = new OpenAITranscriptionModel('whisper-1', {
      provider: 'test-provider',
      url: () => 'https://api.openai.com/v1/audio/transcriptions',
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
    expect(result.response.modelId).toBe('whisper-1');
  });

  it('should work when no words, language, or duration are returned', async () => {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        text: 'Hello from the Vercel AI SDK!',
        _request_id: 'req_1234',
      },
    };

    const testDate = new Date(0);
    const customModel = new OpenAITranscriptionModel('whisper-1', {
      provider: 'test-provider',
      url: () => 'https://api.openai.com/v1/audio/transcriptions',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "durationInSeconds": undefined,
        "language": undefined,
        "response": {
          "body": {
            "_request_id": "req_1234",
            "task": "transcribe",
            "text": "Hello from the Vercel AI SDK!",
          },
          "headers": {
            "content-length": "85",
            "content-type": "application/json",
          },
          "modelId": "whisper-1",
          "timestamp": 1970-01-01T00:00:00.000Z,
        },
        "segments": [],
        "text": "Hello from the Vercel AI SDK!",
        "warnings": [],
      }
    `);
  });
});
