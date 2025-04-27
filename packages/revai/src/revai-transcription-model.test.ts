import { createTestServer } from '@ai-sdk/provider-utils/test';
import { RevaiTranscriptionModel } from './revai-transcription-model';
import { createRevai } from './revai-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createRevai({ apiKey: 'test-api-key' });
const model = provider.transcription('machine');

const server = createTestServer({
  'https://api.rev.ai/speechtotext/v1/jobs': {},
  'https://api.rev.ai/speechtotext/v1/jobs/test-id': {},
  'https://api.rev.ai/speechtotext/v1/jobs/test-id/transcript': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.rev.ai/speechtotext/v1/jobs'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        status: 'in_progress',
        language: 'en',
        created_on: '2018-05-05T23:23:22.29Z',
        transcriber: 'machine',
      },
    };
    server.urls['https://api.rev.ai/speechtotext/v1/jobs/test-id'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        status: 'transcribed',
        language: 'en',
        created_on: '2018-05-05T23:23:22.29Z',
        transcriber: 'machine',
      },
    };
    server.urls[
      'https://api.rev.ai/speechtotext/v1/jobs/test-id/transcript'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        monologues: [
          {
            speaker: 1,
            elements: [
              {
                type: 'text',
                value: 'Hello',
                ts: 0.5,
                end_ts: 1.5,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'World',
                ts: 1.75,
                end_ts: 2.85,
                confidence: 0.8,
              },
              {
                type: 'punct',
                value: '.',
              },
            ],
          },
          {
            speaker: 2,
            elements: [
              {
                type: 'text',
                value: 'monologues',
                ts: 3,
                end_ts: 3.5,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'are',
                ts: 3.6,
                end_ts: 3.9,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'a',
                ts: 4,
                end_ts: 4.3,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'block',
                ts: 4.5,
                end_ts: 5.5,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'of',
                ts: 5.75,
                end_ts: 6.14,
                confidence: 1,
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'unknown',
                value: '<inaudible>',
              },
              {
                type: 'punct',
                value: ' ',
              },
              {
                type: 'text',
                value: 'text',
                ts: 6.5,
                end_ts: 7.78,
                confidence: 1,
              },
              {
                type: 'punct',
                value: '.',
              },
            ],
          },
        ],
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
      media: expect.any(File),
      config: '{"transcriber":"machine"}',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createRevai({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('machine').doGenerate({
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
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe(
      'Hello World. monologues are a block of <inaudible> text.',
    );
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new RevaiTranscriptionModel('machine', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.rev.ai${path}`,
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
      modelId: 'machine',
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
    const customModel = new RevaiTranscriptionModel('machine', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.rev.ai${path}`,
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
    expect(result.response.modelId).toBe('machine');
  });
});
