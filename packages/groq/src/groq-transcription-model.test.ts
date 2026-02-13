import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GroqTranscriptionModel } from './groq-transcription-model';
import { createGroq } from './groq-provider';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createGroq({ apiKey: 'test-api-key' });
const model = provider.transcription('whisper-large-v3-turbo');

const server = createTestServer({
  'https://api.groq.com/openai/v1/audio/transcriptions': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://api.groq.com/openai/v1/audio/transcriptions'].response =
    {
      type: 'json-value',
      headers,
      body: JSON.parse(
        fs.readFileSync('src/__fixtures__/groq-transcription.json', 'utf8'),
      ),
    };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyMultipart).toMatchObject({
        model: 'whisper-large-v3-turbo',
      });
    });

    it('should pass headers', async () => {
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
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `" Hello from the Versal AISDK."`,
      );
    });

    it('should correctly pass provider options when they are an array', async () => {
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
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
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

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('response metadata', () => {
    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonFixtureResponse();

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
  });
});
