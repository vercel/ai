import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createFal } from './fal-provider';
import { FalTranscriptionModel } from './fal-transcription-model';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createFal({ apiKey: 'test-api-key' });
const model = provider.transcription('wizper');

const server = createTestServer({
  'https://queue.fal.run/fal-ai/wizper': {},
  'https://queue.fal.run/fal-ai/wizper/requests/test-id': {},
  'https://queue.fal.run/fal-ai/wizper/requests/abc%2F..%2F..%2Finternal': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
    type: 'json-value',
    headers,
    body: JSON.parse(
      fs.readFileSync('src/__fixtures__/fal-transcription-queue.json', 'utf8'),
    ),
  };
  server.urls['https://queue.fal.run/fal-ai/wizper/requests/test-id'].response =
    {
      type: 'json-value',
      headers,
      body: JSON.parse(
        fs.readFileSync(
          'src/__fixtures__/fal-transcription-result.json',
          'utf8',
        ),
      ),
    };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should encode the request ID as a single URL path segment', async () => {
      const requestId = 'abc/../../internal';

      server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
        type: 'json-value',
        body: {
          status: 'IN_QUEUE',
          request_id: requestId,
          response_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}/result`,
          status_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}`,
          cancel_url: `https://queue.fal.run/fal-ai/wizper/requests/${requestId}/cancel`,
          logs: null,
          metrics: {},
          queue_position: 0,
        },
      };
      server.urls[
        'https://queue.fal.run/fal-ai/wizper/requests/abc%2F..%2F..%2Finternal'
      ].response = {
        type: 'json-value',
        body: {
          text: 'Hello from the Versal AISDK.',
          chunks: [
            { timestamp: [0, 2.508], text: 'Hello from the Versal AISDK.' },
          ],
          languages: ['en'],
        },
      };

      await model.doGenerate({ audio: audioData, mediaType: 'audio/wav' });

      expect(server.calls[1].requestUrl).toBe(
        `https://queue.fal.run/fal-ai/wizper/requests/${encodeURIComponent(
          requestId,
        )}`,
      );
    });

    it('should pass the model', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        audio_url: expect.stringMatching(/^data:audio\//),
        task: 'transcribe',
        diarize: true,
        chunk_level: 'word',
      });
    });

    it('should pass headers', async () => {
      const provider = createFal({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.transcription('wizper').doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Key test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should extract the transcription text', async () => {
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toMatchInlineSnapshot(
        `"Hello from the Versal AISDK."`,
      );
    });
  });

  describe('response headers', () => {
    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      });

      const testDate = new Date(0);
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
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
      const customModel = new FalTranscriptionModel('wizper', {
        provider: 'test-provider',
        url: ({ path }) => path,
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
      expect(result.response.modelId).toBe('wizper');
    });
  });
});
