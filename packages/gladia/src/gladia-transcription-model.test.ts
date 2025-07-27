import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { createGladia } from './gladia-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createGladia({ apiKey: 'test-api-key' });
const model = provider.transcription();

const server = createTestServer({
  'https://api.gladia.io/v2/upload': {
    response: {
      type: 'json-value',
      body: {
        audio_url: 'https://storage.gladia.io/mock-upload-url',
        audio_metadata: {
          id: 'test-id',
          filename: 'test-file.mp3',
          extension: 'mp3',
          size: 1024,
          audio_duration: 60,
          number_of_channels: 2,
        },
      },
    },
  },
  'https://api.gladia.io/v2/pre-recorded': {},
  'https://api.gladia.io/v2/transcription/test-id': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    // No need to set the upload response here as it's already set in the server creation
    server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        result_url: 'https://api.gladia.io/v2/transcription/test-id',
      },
    };
    server.urls['https://api.gladia.io/v2/transcription/test-id'].response = {
      type: 'json-value',
      headers,
      body: {
        id: '45463597-20b7-4af7-b3b3-f5fb778203ab',
        request_id: 'G-45463597',
        version: 2,
        status: 'done',
        created_at: '2023-12-28T09:04:17.210Z',
        completed_at: '2023-12-28T09:04:37.210Z',
        custom_metadata: {},
        error_code: null,
        kind: 'pre-recorded',
        file: {
          id: 'test-id',
          filename: 'test-file.mp3',
          source: 'upload',
          audio_duration: 60,
          number_of_channels: 2,
        },
        request_params: {
          audio_url: 'https://storage.gladia.io/mock-upload-url',
        },
        result: {
          metadata: {
            audio_duration: 60,
            number_of_distinct_channels: 2,
            billing_time: 60,
            transcription_time: 20,
          },
          transcription: {
            full_transcript: 'Smoke from hundreds of wildfires.',
            languages: ['en'],
            utterances: [
              {
                language: 'en',
                start: 0,
                end: 3,
                confidence: 0.95,
                channel: 1,
                speaker: 1,
                words: [
                  {
                    word: 'Smoke',
                    start: 0,
                    end: 1,
                    confidence: 0.95,
                  },
                  {
                    word: 'from',
                    start: 1,
                    end: 2,
                    confidence: 0.95,
                  },
                  {
                    word: 'hundreds',
                    start: 2,
                    end: 3,
                    confidence: 0.95,
                  },
                ],
                text: 'Smoke from hundreds of wildfires.',
              },
            ],
          },
        },
      },
    };
  }

  it('should pass the model', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[1].requestBodyJson).toMatchObject({
      audio_url: 'https://storage.gladia.io/mock-upload-url',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createGladia({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription().doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[1].requestHeaders).toMatchObject({
      'x-gladia-key': 'test-api-key',
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

    expect(result.text).toBe('Smoke from hundreds of wildfires.');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new GladiaTranscriptionModel('default', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.gladia.io${path}`,
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
      modelId: 'default',
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
    const customModel = new GladiaTranscriptionModel('default', {
      provider: 'test-provider',
      url: ({ path }) => `https://api.gladia.io${path}`,
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
    expect(result.response.modelId).toBe('default');
  });
});
