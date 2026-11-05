import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { InvalidArgumentError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { createGladia } from './gladia-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

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
                speaker: 0,
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
              {
                language: 'en',
                start: 3,
                end: 4,
                confidence: 0.9,
                channel: 1,
                speaker: 'speaker-1',
                words: [
                  {
                    word: 'Today',
                    start: 3,
                    end: 4,
                    confidence: 0.9,
                  },
                ],
                text: 'Today.',
              },
            ],
          },
        },
      },
    };
  }

  // Prepare the default successful response and override parts of the job
  // result or the job body. The response object is mutated in place so the
  // test server keeps its `json-value` shape.
  function prepareResponse(
    resultOverrides: Record<string, unknown> = {},
    bodyOverrides: Record<string, unknown> = {},
  ) {
    prepareJsonResponse();

    const response = server.urls[
      'https://api.gladia.io/v2/transcription/test-id'
    ].response as unknown as { body: Record<string, unknown> };

    Object.assign(response.body, bodyOverrides);

    if (response.body.result != null) {
      Object.assign(
        response.body.result as Record<string, unknown>,
        resultOverrides,
      );
    }
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
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/gladia/0.0.0-test`,
    );
  });

  it('should extract the transcription text', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Smoke from hundreds of wildfires.');
  });

  it('should preserve utterance metadata in provider metadata', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    const gladiaMetadata = result.providerMetadata?.gladia;
    expect(gladiaMetadata).toBeDefined();
    const metadataUtterances = (
      gladiaMetadata as {
        result: {
          transcription: {
            utterances: Record<string, unknown>[];
          };
        };
      }
    ).result.transcription.utterances;

    expect(metadataUtterances[0]).toMatchObject({
      speaker: 0,
      confidence: 0.95,
      language: 'en',
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
    });
    expect(metadataUtterances[1]).toMatchObject({
      speaker: 'speaker-1',
    });
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
  it('should preserve audio intelligence results in provider metadata', async () => {
    prepareResponse({
      metadata: {
        audio_duration: 60,
        number_of_distinct_channels: 1,
        billing_time: 36.74,
        transcription_time: 12.5,
      },
      transcription: {
        full_transcript: 'Smoke from hundreds of wildfires.',
        languages: ['en'],
        utterances: [
          {
            start: 0,
            end: 3,
            text: 'Smoke from hundreds of wildfires.',
          },
        ],
        sentences: [
          {
            sentence: 'Smoke from hundreds of wildfires.',
            start: 0,
            end: 3,
            words: [],
          },
        ],
        subtitles: [
          {
            format: 'srt',
            subtitles: '1\n00:00:00.000 --> 00:00:03.000\nSmoke',
          },
        ],
      },
      translation: {
        success: true,
        is_empty: false,
        exec_time: 2.4,
        error: null,
        results: [
          {
            languages: ['fr'],
            full_transcript: 'Fumée de centaines de feux de forêt.',
            utterances: [
              {
                start: 0,
                end: 3,
                text: 'Fumée de centaines de feux de forêt.',
                language: 'fr',
                channel: 0,
                confidence: 0.9,
                words: [],
              },
            ],
          },
        ],
      },
      summarization: {
        success: true,
        is_empty: false,
        exec_time: 1.2,
        error: null,
        results: 'A summary of the transcription.',
      },
      named_entity_recognition: {
        success: true,
        is_empty: false,
        exec_time: 0.5,
        error: null,
        results: [
          {
            entity_type: 'MISC',
            text: 'wildfires',
            start: 1.02,
            end: 1.48,
          },
        ],
      },
      sentiment_analysis: {
        success: true,
        is_empty: false,
        exec_time: 0.6,
        error: null,
        results: [
          {
            text: 'Smoke from hundreds of wildfires.',
            sentiment: 'neutral',
            emotion: 'interest',
            start: 0,
            end: 3,
            channel: 0,
          },
        ],
      },
      audio_to_llm: {
        success: true,
        is_empty: false,
        exec_time: 3.1,
        error: null,
        results: [
          {
            results: {
              model: 'openai/gpt-5.4-nano',
              prompt: 'What is this about?',
              response: 'Wildfires.',
            },
          },
        ],
      },
      sentences: {
        success: true,
        is_empty: false,
        exec_time: 0.4,
        error: null,
        results: [
          {
            sentence: 'Smoke from hundreds of wildfires.',
            start: 0,
            end: 3,
            words: [],
          },
        ],
      },
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.providerMetadata?.gladia).toMatchObject({
      result: {
        metadata: {
          audio_duration: 60,
          number_of_distinct_channels: 1,
          billing_time: 36.74,
          transcription_time: 12.5,
        },
        transcription: {
          subtitles: [
            {
              format: 'srt',
              subtitles: '1\n00:00:00.000 --> 00:00:03.000\nSmoke',
            },
          ],
          sentences: [
            {
              sentence: 'Smoke from hundreds of wildfires.',
            },
          ],
        },
        translation: {
          results: [
            {
              languages: ['fr'],
              full_transcript: 'Fumée de centaines de feux de forêt.',
              utterances: [
                expect.objectContaining({
                  text: 'Fumée de centaines de feux de forêt.',
                  channel: 0,
                }),
              ],
            },
          ],
        },
        summarization: {
          results: 'A summary of the transcription.',
        },
        named_entity_recognition: {
          results: [
            {
              entity_type: 'MISC',
              text: 'wildfires',
              start: 1.02,
              end: 1.48,
            },
          ],
        },
        sentiment_analysis: {
          results: [
            expect.objectContaining({
              sentiment: 'neutral',
              emotion: 'interest',
            }),
          ],
        },
        audio_to_llm: {
          results: [
            {
              results: {
                model: 'openai/gpt-5.4-nano',
                prompt: 'What is this about?',
                response: 'Wildfires.',
              },
            },
          ],
        },
        sentences: {
          results: [
            {
              sentence: 'Smoke from hundreds of wildfires.',
            },
          ],
        },
      },
    });
  });

  it('should pass through add-ons that do not match the documented shape', async () => {
    const sentences = [
      'Smoke from hundreds of wildfires.',
      'It spread quickly.',
    ];
    const entities = [{ entity_type: 'MISC', start: 1.02, end: 1.48 }];

    prepareResponse({
      named_entity_recognition: {
        success: true,
        is_empty: false,
        exec_time: 0.5,
        error: { status_code: 500, message: 'Upstream failure' },
        results: entities,
      },
      sentences: {
        success: true,
        is_empty: false,
        exec_time: 0.4,
        error: null,
        results: sentences,
      },
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Smoke from hundreds of wildfires.');
    expect(result.providerMetadata?.gladia).toMatchObject({
      result: {
        named_entity_recognition: {
          error: { status_code: 500, message: 'Upstream failure' },
          results: entities,
        },
        sentences: {
          results: sentences,
        },
      },
    });
  });

  it('should preserve audio-to-LLM item fields in provider metadata', async () => {
    const audioToLlmResults = [
      {
        prompt: 'What is this about?',
        response: 'Wildfires.',
        success: true,
        is_empty: false,
        exec_time: 1.4,
        error: null,
      },
      {
        prompt: 'Who is speaking?',
        response: null,
        success: false,
        is_empty: true,
        exec_time: 0.2,
        error: {
          status_code: 400,
          exception: 'BadRequest',
          message: 'Prompt rejected',
        },
      },
    ];

    prepareResponse({
      audio_to_llm: {
        success: true,
        is_empty: false,
        exec_time: 1.6,
        error: null,
        results: audioToLlmResults,
      },
    });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.providerMetadata?.gladia).toMatchObject({
      result: {
        audio_to_llm: {
          results: audioToLlmResults,
        },
      },
    });
  });

  it('should include the Gladia error code in the error message', async () => {
    prepareResponse({}, { status: 'error', error_code: 400, result: null });

    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      }),
    ).rejects.toThrow('Transcription job failed with error code 400');
  });

  it('should keep polling queued and processing jobs until the job is done', async () => {
    prepareJsonResponse();

    let pollCount = 0;
    server.urls['https://api.gladia.io/v2/transcription/test-id'].response =
      () => {
        pollCount++;
        return pollCount === 1
          ? { type: 'json-value', body: { status: 'queued' } }
          : pollCount === 2
            ? { type: 'json-value', body: { status: 'processing' } }
            : {
                type: 'json-value',
                body: {
                  status: 'done',
                  result: {
                    metadata: { audio_duration: 60 },
                    transcription: {
                      full_transcript: 'Smoke from hundreds of wildfires.',
                      languages: ['en'],
                      utterances: [
                        {
                          start: 0,
                          end: 3,
                          text: 'Smoke from hundreds of wildfires.',
                        },
                      ],
                    },
                  },
                },
              };
      };

    const fastProvider = createGladia({
      apiKey: 'test-api-key',
      pollIntervalMs: 10,
    });

    const result = await fastProvider.transcription().doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Smoke from hundreds of wildfires.');
    expect(pollCount).toBe(3);
  });

  it('should not send polling settings to the Gladia API', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {
        gladia: {
          pollIntervalMs: 1,
          pollTimeoutMs: 1000,
        },
      },
    });

    const requestBody = await server.calls[1].requestBodyJson;
    expect(requestBody).not.toHaveProperty('pollIntervalMs');
    expect(requestBody).not.toHaveProperty('pollTimeoutMs');
  });

  it('should throw TranscriptionJobPollingTimedOut after the configured pollTimeoutMs', async () => {
    prepareJsonResponse();

    // Advance a mocked clock instead of waiting for real time so the test does
    // not depend on machine speed.
    let now = 0;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pollCount = 0;

    server.urls['https://api.gladia.io/v2/transcription/test-id'].response =
      () => {
        pollCount++;
        now += 15;
        return { type: 'json-value', body: { status: 'processing' } };
      };

    try {
      const shortTimeoutProvider = createGladia({
        apiKey: 'test-api-key',
        pollTimeoutMs: 20,
        pollIntervalMs: 1,
      });

      await expect(
        shortTimeoutProvider.transcription().doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
        }),
      ).rejects.toMatchObject({
        name: 'TranscriptionJobPollingTimedOut',
        message: 'Transcription job polling timed out after 20 ms',
      });

      expect(pollCount).toBe(2);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('should resolve polling settings from providerOptions.gladia before provider settings', async () => {
    prepareJsonResponse();

    // Advance a mocked clock instead of waiting for real time so the test does
    // not depend on machine speed.
    let now = 0;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pollCount = 0;

    server.urls['https://api.gladia.io/v2/transcription/test-id'].response =
      () => {
        pollCount++;
        now += 12;
        return { type: 'json-value', body: { status: 'processing' } };
      };

    try {
      const slowProvider = createGladia({
        apiKey: 'test-api-key',
        pollIntervalMs: 600_000,
        pollTimeoutMs: 600_000,
      });

      await expect(
        slowProvider.transcription().doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
          providerOptions: {
            gladia: {
              pollIntervalMs: 1,
              pollTimeoutMs: 20,
            },
          },
        }),
      ).rejects.toMatchObject({
        name: 'TranscriptionJobPollingTimedOut',
        message: 'Transcription job polling timed out after 20 ms',
      });

      expect(pollCount).toBe(2);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('should throw InvalidArgumentError for invalid per-call polling settings', async () => {
    prepareJsonResponse();

    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        providerOptions: {
          gladia: {
            pollTimeoutMs: 0,
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('should stop before the first poll when the signal is already aborted', async () => {
    prepareJsonResponse();

    const reason = new DOMException('The operation timed out.', 'TimeoutError');
    const controller = new AbortController();
    controller.abort(reason);

    // The custom fetch ignores the abort signal so the request would still
    // succeed if the polling loop did not check it.
    const abortIgnoringProvider = createGladia({
      apiKey: 'test-api-key',
      fetch: fetchWithoutAbortSignal,
    });

    await expect(
      abortIgnoringProvider.transcription().doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);

    expect(
      server.calls.filter(
        call =>
          call.requestUrl === 'https://api.gladia.io/v2/transcription/test-id',
      ),
    ).toHaveLength(0);
  });

  it('should cancel the wait between polls when the signal is aborted', async () => {
    prepareJsonResponse();

    const controller = new AbortController();
    let pollCount = 0;

    server.urls['https://api.gladia.io/v2/transcription/test-id'].response =
      () => {
        pollCount++;
        controller.abort();
        return { type: 'json-value', body: { status: 'processing' } };
      };

    // Ignore the abort signal so the response still arrives and the abort
    // happens while the loop waits for the next poll.
    const abortIgnoringProvider = createGladia({
      apiKey: 'test-api-key',
      fetch: fetchWithoutAbortSignal,
    });

    await expect(
      abortIgnoringProvider.transcription().doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
        abortSignal: controller.signal,
        providerOptions: {
          gladia: {
            pollIntervalMs: 600_000,
          },
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(pollCount).toBe(1);
  });
});

const fetchWithoutAbortSignal: FetchFunction = (input, init) => {
  const { signal: _signal, ...rest } = init ?? {};
  return globalThis.fetch(input, rest);
};

describe('polling settings validation', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects pollIntervalMs = %s',
    value => {
      expect(() =>
        createGladia({ apiKey: 'test-api-key', pollIntervalMs: value }),
      ).toThrow(InvalidArgumentError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects pollTimeoutMs = %s',
    value => {
      expect(() =>
        createGladia({ apiKey: 'test-api-key', pollTimeoutMs: value }),
      ).toThrow(InvalidArgumentError);
    },
  );
});
