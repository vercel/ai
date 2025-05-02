import { createTestServer } from '@ai-sdk/provider-utils/test';
import { DeepgramTranscriptionModel } from './deepgram-transcription-model';
import { createDeepgram } from './deepgram-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createDeepgram({ apiKey: 'test-api-key' });
const model = provider.transcription('nova-3');

const server = createTestServer({
  'https://api.deepgram.com/v1/listen': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.deepgram.com/v1/listen'].response = {
      type: 'json-value',
      headers,
      body: {
        metadata: {
          transaction_key: 'deprecated',
          request_id: '2479c8c8-8185-40ac-9ac6-f0874419f793',
          sha256:
            '154e291ecfa8be6ab8343560bcc109008fa7853eb5372533e8efdefc9b504c33',
          created: '2024-02-06T19:56:16.180Z',
          duration: 25.933313,
          channels: 1,
          models: ['30089e05-99d1-4376-b32e-c263170674af'],
          model_info: {
            '30089e05-99d1-4376-b32e-c263170674af': {
              name: '2-general-nova',
              version: '2024-01-09.29447',
              arch: 'nova-3',
            },
          },
        },
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'Hello world!',
                  confidence: 0.99902344,
                  words: [
                    {
                      word: 'hello',
                      start: 0.08,
                      end: 0.32,
                      confidence: 0.9975586,
                      punctuated_word: 'Hello.',
                    },
                    {
                      word: 'world',
                      start: 0.32,
                      end: 0.79999995,
                      confidence: 0.9921875,
                      punctuated_word: 'World',
                    },
                  ],
                  paragraphs: {
                    transcript: 'Hello world!',
                    paragraphs: [
                      {
                        sentences: [
                          {
                            text: 'Hello world!',
                            start: 0.08,
                            end: 0.32,
                          },
                        ],
                        num_words: 2,
                        start: 0.08,
                        end: 0.79999995,
                      },
                    ],
                  },
                },
              ],
            },
          ],
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

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({});
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createDeepgram({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('nova-3').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Token test-api-key',
      'content-type': 'audio/wav',
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
    const customModel = new DeepgramTranscriptionModel('nova-3', {
      provider: 'test-provider',
      url: () => 'https://api.deepgram.com/v1/listen',
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
      modelId: 'nova-3',
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
    const customModel = new DeepgramTranscriptionModel('nova-3', {
      provider: 'test-provider',
      url: () => 'https://api.deepgram.com/v1/listen',
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
    expect(result.response.modelId).toBe('nova-3');
  });
});
