import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createFal } from './fal-provider';
import { FalTranscriptionModel } from './fal-transcription-model';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createFal({ apiKey: 'test-api-key' });
const model = provider.transcription('wizper');

const server = createTestServer({
  'https://queue.fal.run/fal-ai/wizper': {},
  'https://queue.fal.run/fal-ai/wizper/requests/test-id': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://queue.fal.run/fal-ai/wizper'].response = {
      type: 'json-value',
      headers,
      body: {
        status: 'COMPLETED',
        request_id: 'test-id',
        response_url:
          'https://queue.fal.run/fal-ai/wizper/requests/test-id/result',
        status_url: 'https://queue.fal.run/fal-ai/wizper/requests/test-id',
        cancel_url:
          'https://queue.fal.run/fal-ai/wizper/requests/test-id/cancel',
        logs: null,
        metrics: {},
        queue_position: 0,
      },
    };
    server.urls[
      'https://queue.fal.run/fal-ai/wizper/requests/test-id'
    ].response = {
      type: 'json-value',
      headers,
      body: {
        text: 'Hello world!',
        chunks: [
          {
            text: 'Hello',
            timestamp: [0, 1],
            speaker: 'speaker_1',
          },
          {
            text: ' ',
            timestamp: [1, 2],
            speaker: 'speaker_1',
          },
          {
            text: 'world!',
            timestamp: [2, 3],
            speaker: 'speaker_1',
          },
        ],
        diarization_segments: [
          {
            speaker: 'speaker_1',
            timestamp: [0, 3],
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

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audio_url: expect.stringMatching(/^data:audio\//),
      task: 'transcribe',
      diarize: true,
      chunk_level: 'word',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

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
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello world!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
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

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'wizper',
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
