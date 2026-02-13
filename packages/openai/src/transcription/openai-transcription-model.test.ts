import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createOpenAI } from '../openai-provider';
import { OpenAITranscriptionModel } from './openai-transcription-model';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(
  path.join(__dirname, 'transcription-test.mp3'),
);
const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.transcription('whisper-1');

const server = createTestServer({
  'https://api.openai.com/v1/audio/transcriptions': {},
});

function prepareJsonFixtureResponse(
  filename: string,
  headers?: Record<string, string>,
) {
  server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync(
        `src/transcription/__fixtures__/${filename}.json`,
        'utf8',
      ),
    ),
  };
}

describe('doGenerate', () => {
  it('should pass the model', async () => {
    prepareJsonFixtureResponse('openai-transcription');

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model: 'whisper-1',
    });
  });

  it('should pass headers', async () => {
    prepareJsonFixtureResponse('openai-transcription');

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

    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/openai/0.0.0-test`,
    );
  });

  it('should extract the transcription text', async () => {
    prepareJsonFixtureResponse('openai-transcription');

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toMatchInlineSnapshot(
      `"Galileo was an American robotic space program that studied the planet Jupiter and its moons, as well as several other solar system bodies."`,
    );
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonFixtureResponse('openai-transcription', {
      'x-request-id': 'test-request-id',
      'x-ratelimit-remaining': '123',
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
    prepareJsonFixtureResponse('openai-transcription');

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

  it('should pass response_format when `providerOptions.openai.timestampGranularities` is set', async () => {
    prepareJsonFixtureResponse('openai-transcription');

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        openai: {
          timestampGranularities: ['word'],
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchInlineSnapshot(`
      {
        "file": File {
          Symbol(kHandle): Blob {},
          Symbol(kLength): 40169,
          Symbol(kType): "audio/wav",
        },
        "model": "whisper-1",
        "response_format": "verbose_json",
        "temperature": "0",
        "timestamp_granularities[]": "word",
      }
    `);
  });

  it('should not set pass response_format to "verbose_json" when model is "gpt-4o-transcribe"', async () => {
    prepareJsonFixtureResponse('openai-transcription');

    const model = provider.transcription('gpt-4o-transcribe');
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        openai: {
          timestampGranularities: ['word'],
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchInlineSnapshot(`
      {
        "file": File {
          Symbol(kHandle): Blob {},
          Symbol(kLength): 40169,
          Symbol(kType): "audio/wav",
        },
        "model": "gpt-4o-transcribe",
        "response_format": "json",
        "temperature": "0",
        "timestamp_granularities[]": "word",
      }
    `);
  });

  it('should pass timestamp_granularities when specified', async () => {
    prepareJsonFixtureResponse('openai-transcription');

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        openai: {
          timestampGranularities: ['segment'],
        },
      },
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchInlineSnapshot(`
      {
        "file": File {
          Symbol(kHandle): Blob {},
          Symbol(kLength): 40169,
          Symbol(kType): "audio/wav",
        },
        "model": "whisper-1",
        "response_format": "verbose_json",
        "temperature": "0",
        "timestamp_granularities[]": "segment",
      }
    `);
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

  it('should parse segments when provided in response', async () => {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        text: 'Hello world. How are you?',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 2.5,
            text: 'Hello world.',
            tokens: [1234, 5678],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.1,
          },
          {
            id: 1,
            seek: 250,
            start: 2.5,
            end: 5.0,
            text: ' How are you?',
            tokens: [9012, 3456],
            temperature: 0.0,
            avg_logprob: -0.6,
            compression_ratio: 1.1,
            no_speech_prob: 0.05,
          },
        ],
        language: 'en',
        duration: 5.0,
        _request_id: 'req_1234',
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        openai: {
          timestampGranularities: ['segment'],
        },
      },
    });

    expect(result.segments).toMatchInlineSnapshot(`
      [
        {
          "endSecond": 2.5,
          "startSecond": 0,
          "text": "Hello world.",
        },
        {
          "endSecond": 5,
          "startSecond": 2.5,
          "text": " How are you?",
        },
      ]
    `);
    expect(result.text).toBe('Hello world. How are you?');
    expect(result.durationInSeconds).toBe(5.0);
  });

  it('should fallback to words when segments are not available', async () => {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        text: 'Hello world',
        words: [
          {
            word: 'Hello',
            start: 0.0,
            end: 1.0,
          },
          {
            word: 'world',
            start: 1.0,
            end: 2.0,
          },
        ],
        language: 'en',
        duration: 2.0,
        _request_id: 'req_1234',
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        openai: {
          timestampGranularities: ['word'],
        },
      },
    });

    expect(result.segments).toMatchInlineSnapshot(`
      [
        {
          "endSecond": 1,
          "startSecond": 0,
          "text": "Hello",
        },
        {
          "endSecond": 2,
          "startSecond": 1,
          "text": "world",
        },
      ]
    `);
  });

  it('should handle empty segments array', async () => {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        text: 'Hello world',
        segments: [],
        language: 'en',
        duration: 2.0,
        _request_id: 'req_1234',
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.segments).toEqual([]);
    expect(result.text).toBe('Hello world');
  });

  it('should handle segments with missing optional fields', async () => {
    server.urls['https://api.openai.com/v1/audio/transcriptions'].response = {
      type: 'json-value',
      body: {
        task: 'transcribe',
        text: 'Test',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 1.0,
            text: 'Test',
            tokens: [1234],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
            no_speech_prob: 0.1,
          },
        ],
        _request_id: 'req_1234',
      },
    };

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.segments).toMatchInlineSnapshot(`
      [
        {
          "endSecond": 1,
          "startSecond": 0,
          "text": "Test",
        },
      ]
    `);
    expect(result.language).toBeUndefined();
    expect(result.durationInSeconds).toBeUndefined();
  });
});
