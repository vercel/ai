import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { InvalidArgumentError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { GladiaTranscriptionModel } from './gladia-transcription-model';
import { createGladia } from './gladia-provider';
import { readFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createGladia({ apiKey: 'test-api-key' });
const model = provider.transcription();

const uploadFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-upload.json', 'utf8'),
);
const initiateFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-initiate.json', 'utf8'),
);
const resultFixture = JSON.parse(
  fs.readFileSync('src/__fixtures__/gladia-result.json', 'utf8'),
);

const server = createTestServer({
  'https://api.gladia.io/v2/upload': {
    response: {
      type: 'json-value',
      body: uploadFixture,
    },
  },
  'https://api.gladia.io/v2/pre-recorded': {},
  [initiateFixture.result_url]: {},
  'https://cdn.evil.example/v2/pre-recorded/result': {},
});

function prepareJsonFixtureResponse(headers?: Record<string, string>) {
  server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
    type: 'json-value',
    headers,
    body: initiateFixture,
  };
  server.urls[initiateFixture.result_url].response = {
    type: 'json-value',
    headers,
    body: resultFixture,
  };
}

describe('doGenerate', () => {
  describe('transcription', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should pass audio_url to pre-recorded endpoint', async () => {
      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(await server.calls[1].requestBodyJson).toMatchObject({
        audio_url: uploadFixture.audio_url,
      });
    });

    it('does not send the API key when the result URL is on a foreign origin', async () => {
      const foreignResultUrl =
        'https://cdn.evil.example/v2/pre-recorded/result';
      server.urls['https://api.gladia.io/v2/pre-recorded'].response = {
        type: 'json-value',
        body: { ...initiateFixture, result_url: foreignResultUrl },
      };
      server.urls[foreignResultUrl].response = {
        type: 'json-value',
        body: resultFixture,
      };

      await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      const pollCall = server.calls.find(
        call => call.requestUrl === foreignResultUrl,
      );
      expect(pollCall).toBeDefined();
      expect(pollCall!.requestHeaders['x-gladia-key']).toBeUndefined();
    });

    it('should pass headers', async () => {
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
      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toBe(
        resultFixture.result.transcription.full_transcript,
      );
    });

    it('should preserve utterance metadata in provider metadata', async () => {
      const utterances = resultFixture.result.transcription.utterances.map(
        (utterance: Record<string, unknown>, index: number) => ({
          ...utterance,
          speaker: index === 0 ? 0 : `speaker-${index}`,
        }),
      );
      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          result: {
            ...resultFixture.result,
            transcription: {
              ...resultFixture.result.transcription,
              utterances,
            },
          },
        },
      };

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
        confidence: utterances[0].confidence,
        language: utterances[0].language,
        words: utterances[0].words,
      });
      expect(metadataUtterances[1]).toMatchObject({
        speaker: 'speaker-1',
      });
    });

    it('should preserve audio intelligence results in provider metadata', async () => {
      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          result: {
            ...resultFixture.result,
            metadata: {
              ...resultFixture.result.metadata,
              number_of_distinct_channels: 1,
              billing_time: 36.74,
              transcription_time: 12.5,
            },
            transcription: {
              ...resultFixture.result.transcription,
              sentences: [
                {
                  sentence: 'Galileo was an American robotic space program.',
                  start: 0.14,
                  end: 5.341,
                  words: [],
                },
              ],
              subtitles: [
                {
                  format: 'srt',
                  subtitles: '1\n00:00:00.140 --> 00:00:05.341\nGalileo',
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
                  full_transcript: 'Galilée était un programme spatial.',
                  utterances: [
                    {
                      start: 0.14,
                      end: 5.341,
                      text: 'Galilée était un programme spatial.',
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
                  entity_type: 'ORIGIN',
                  text: 'American',
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
                  text: 'Galileo was an American robotic space program.',
                  sentiment: 'neutral',
                  emotion: 'interest',
                  start: 0.14,
                  end: 5.341,
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
                    response: 'A space program.',
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
                  sentence: 'Galileo was an American robotic space program.',
                  start: 0.14,
                  end: 5.341,
                  words: [],
                },
              ],
            },
          },
        },
      };

      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.providerMetadata?.gladia).toMatchObject({
        result: {
          metadata: {
            audio_duration: 36.74,
            number_of_distinct_channels: 1,
            billing_time: 36.74,
            transcription_time: 12.5,
          },
          transcription: {
            subtitles: [
              {
                format: 'srt',
                subtitles: '1\n00:00:00.140 --> 00:00:05.341\nGalileo',
              },
            ],
            sentences: [
              {
                sentence: 'Galileo was an American robotic space program.',
              },
            ],
          },
          translation: {
            results: [
              {
                languages: ['fr'],
                full_transcript: 'Galilée était un programme spatial.',
                utterances: [
                  expect.objectContaining({
                    text: 'Galilée était un programme spatial.',
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
                entity_type: 'ORIGIN',
                text: 'American',
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
                  response: 'A space program.',
                },
              },
            ],
          },
          sentences: {
            results: [
              {
                sentence: 'Galileo was an American robotic space program.',
              },
            ],
          },
        },
      });
    });

    it('should pass through add-ons that do not match the documented shape', async () => {
      const sentences = [
        'Galileo was an American robotic space program.',
        'It studied the planet Jupiter.',
      ];
      const entities = [{ entity_type: 'ORIGIN', start: 1.02, end: 1.48 }];

      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          result: {
            ...resultFixture.result,
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
          },
        },
      };

      const result = await model.doGenerate({
        audio: audioData,
        mediaType: 'audio/wav',
      });

      expect(result.text).toBe(
        resultFixture.result.transcription.full_transcript,
      );
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
          response: 'A space program.',
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

      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          result: {
            ...resultFixture.result,
            audio_to_llm: {
              success: true,
              is_empty: false,
              exec_time: 1.6,
              error: null,
              results: audioToLlmResults,
            },
          },
        },
      };

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
      server.urls[initiateFixture.result_url].response = {
        type: 'json-value',
        body: {
          ...resultFixture,
          status: 'error',
          error_code: 400,
          result: null,
        },
      };

      await expect(
        model.doGenerate({
          audio: audioData,
          mediaType: 'audio/wav',
        }),
      ).rejects.toThrow('Transcription job failed with error code 400');
    });

    it('should generate full response', async () => {
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

      expect(result).toMatchSnapshot({
        providerMetadata: expect.anything(),
      });
    });
  });

  describe('response headers', () => {
    beforeEach(() =>
      prepareJsonFixtureResponse({
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      }),
    );

    it('should include response headers', async () => {
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
  });

  describe('response metadata', () => {
    beforeEach(() => prepareJsonFixtureResponse());

    it('should include timestamp and modelId', async () => {
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
});

describe('polling', () => {
  beforeEach(() => prepareJsonFixtureResponse());

  it('polls queued and processing jobs until the job is done', async () => {
    let pollCount = 0;
    server.urls[initiateFixture.result_url].response = () => {
      pollCount++;
      return pollCount === 1
        ? { type: 'json-value', body: { status: 'queued' } }
        : pollCount === 2
          ? { type: 'json-value', body: { status: 'processing' } }
          : { type: 'json-value', body: resultFixture };
    };

    const fastProvider = createGladia({
      apiKey: 'test-api-key',
      pollIntervalMs: 10,
    });

    const result = await fastProvider.transcription().doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
    });

    expect(result.text).toBe(
      resultFixture.result.transcription.full_transcript,
    );
    expect(pollCount).toBe(3);
  });

  it('does not send polling settings to the Gladia API', async () => {
    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mp3',
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

  it('throws TranscriptionJobPollingTimedOut after the configured pollTimeoutMs', async () => {
    // Advance a mocked clock instead of waiting for real time so the test does
    // not depend on machine speed.
    let now = 0;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pollCount = 0;

    server.urls[initiateFixture.result_url].response = () => {
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
          mediaType: 'audio/mp3',
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

  it('resolves polling settings from providerOptions.gladia before provider settings', async () => {
    // Advance a mocked clock instead of waiting for real time so the test does
    // not depend on machine speed.
    let now = 0;
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pollCount = 0;

    server.urls[initiateFixture.result_url].response = () => {
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
          mediaType: 'audio/mp3',
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

  it('throws InvalidArgumentError for invalid per-call polling settings', async () => {
    await expect(
      model.doGenerate({
        audio: audioData,
        mediaType: 'audio/mp3',
        providerOptions: {
          gladia: {
            pollTimeoutMs: 0,
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('stops before the first poll when the signal is already aborted', async () => {
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
        mediaType: 'audio/mp3',
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(reason);

    expect(
      server.calls.filter(
        call => call.requestUrl === initiateFixture.result_url,
      ),
    ).toHaveLength(0);
  });

  it('cancels the wait between polls when the signal is aborted', async () => {
    const controller = new AbortController();
    let pollCount = 0;

    server.urls[initiateFixture.result_url].response = () => {
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
        mediaType: 'audio/mp3',
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
