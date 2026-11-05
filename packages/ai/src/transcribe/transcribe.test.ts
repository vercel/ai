import {
  APICallError,
  type JSONObject,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest,
  vi,
} from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockTranscriptionModelV4 } from '../test/mock-transcription-model-v4';
import { transcribe } from './transcribe';
import type {
  TranscriptionEndEvent,
  TranscriptionStartEvent,
} from './transcription-events';
import type { Warning } from '../types/warning';
import { VERSION } from '../version';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const audioData = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);

const sampleTranscript = {
  text: 'This is a sample transcript.',
  segments: [
    {
      startSecond: 0,
      endSecond: 2.5,
      text: 'This is a',
    },
    {
      startSecond: 2.5,
      endSecond: 4.0,
      text: 'sample transcript.',
    },
  ],
  language: 'en',
  durationInSeconds: 4.0,
};

const createMockResponse = (options: {
  text: string;
  segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  language?: string;
  durationInSeconds?: number;
  warnings?: Warning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, JSONObject>;
}) => ({
  text: options.text,
  segments: options.segments,
  language: options.language,
  durationInSeconds: options.durationInSeconds,
  warnings: options.warnings ?? [],
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
  providerMetadata: options.providerMetadata ?? {},
});

describe('transcribe', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
  });

  it.each(['http:', 'https:'])(
    'passes %s audio URLs directly to capable models with accurate telemetry',
    async protocol => {
      const url = new URL(`${protocol}//example.com/large-audio.mp3`);
      const events: Array<{ byteLength?: number; mediaType?: string }> = [];
      const doGenerate = vi.fn();
      const doGenerateFromUrl = vi.fn(async () =>
        createMockResponse(sampleTranscript),
      );
      const controller = new AbortController();
      const result = await transcribe({
        model: new MockTranscriptionModelV4({ doGenerate, doGenerateFromUrl }),
        audio: url,
        maxRetries: 0,
        abortSignal: controller.signal,
        headers: { 'custom-header': 'value' },
        providerOptions: { groq: { language: 'en' } },
        timestampGranularities: ['word', 'segment'],
        telemetry: {
          integrations: {
            onStart: event => {
              if ('audio' in event) events.push(event.audio);
            },
            onEnd: event => {
              if ('audio' in event) events.push(event.audio);
            },
          },
        },
      });
      expect(result.text).toBe(sampleTranscript.text);
      expect(doGenerate).not.toHaveBeenCalled();
      expect(doGenerateFromUrl).toHaveBeenCalledWith({
        audio: url,
        abortSignal: controller.signal,
        headers: expect.objectContaining({ 'custom-header': 'value' }),
        providerOptions: { groq: { language: 'en' } },
        timestampGranularities: ['word', 'segment'],
      });
      expect(events).toEqual([
        { byteLength: undefined, mediaType: undefined },
        { byteLength: undefined, mediaType: undefined },
      ]);
    },
  );

  it('retries native URL calls without switching to file upload', async () => {
    const audio = new URL('https://example.com/audio.mp3');
    const doGenerate = vi.fn();
    const doGenerateFromUrl = vi
      .fn()
      .mockRejectedValueOnce(
        new APICallError({
          message: 'Retry this request',
          url: 'https://example.com/transcriptions',
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: { 'retry-after-ms': '0' },
          isRetryable: true,
        }),
      )
      .mockResolvedValue(createMockResponse(sampleTranscript));
    const result = await transcribe({
      model: new MockTranscriptionModelV4({ doGenerate, doGenerateFromUrl }),
      audio,
      maxRetries: 1,
    });
    expect(result.text).toBe(sampleTranscript.text);
    expect(doGenerateFromUrl).toHaveBeenCalledTimes(2);
    expect(doGenerateFromUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ audio }),
    );
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it('downloads locally when native URL transcription is declined and retries only the file call', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(audioData, {
        headers: { 'content-type': 'Audio/MPEG; charset=binary' },
      }),
    );
    globalThis.fetch = fetchMock;
    const doGenerateFromUrl = vi.fn(async () => undefined);
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(
        new APICallError({
          message: 'Retry file',
          url: 'https://example.com/transcriptions',
          requestBodyValues: {},
          statusCode: 429,
          responseHeaders: { 'retry-after-ms': '0' },
        }),
      )
      .mockResolvedValue(createMockResponse(sampleTranscript));
    const onEnd = vi.fn();
    const controller = new AbortController();
    try {
      const result = await transcribe({
        model: new MockTranscriptionModelV4({ doGenerate, doGenerateFromUrl }),
        audio: new URL('https://example.com/redirect'),
        maxRetries: 1,
        abortSignal: controller.signal,
        timestampGranularities: [],
        telemetry: { integrations: { onEnd } },
      });
      expect(result.text).toBe(sampleTranscript.text);
      expect(doGenerateFromUrl).toHaveBeenCalledOnce();
      expect(doGenerateFromUrl).toHaveBeenCalledWith(
        expect.objectContaining({ timestampGranularities: [] }),
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
      expect(doGenerate).toHaveBeenCalledTimes(2);
      expect(doGenerate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          audio: audioData,
          mediaType: 'audio/mpeg',
          timestampGranularities: [],
        }),
      );
      expect(onEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: { byteLength: audioData.byteLength, mediaType: 'audio/mpeg' },
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('emits a correlated error when native URL transcription fails', async () => {
    const error = new Error('Provider could not fetch audio');
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();
    await expect(
      transcribe({
        model: new MockTranscriptionModelV4({
          doGenerateFromUrl: async () => {
            throw error;
          },
        }),
        audio: new URL('https://example.com/audio.mp3'),
        maxRetries: 0,
        telemetry: { integrations: { onStart, onEnd, onError } },
        _internal: { generateCallId: () => 'url-error' },
      }),
    ).rejects.toBe(error);
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'url-error' }),
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'url-error', error }),
    );
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('preserves explicit custom downloads even for URL-capable models', async () => {
    const download = vi.fn(async () => ({
      data: audioData,
      mediaType: 'audio/mpeg',
    }));
    const doGenerateFromUrl = vi.fn();
    const doGenerate = vi.fn(async () => createMockResponse(sampleTranscript));
    await transcribe({
      model: new MockTranscriptionModelV4({ doGenerate, doGenerateFromUrl }),
      audio: new URL('https://example.com/audio.mp3'),
      download,
    });
    expect(download).toHaveBeenCalledOnce();
    expect(doGenerateFromUrl).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ audio: audioData, mediaType: 'audio/mpeg' }),
    );
  });

  it('continues sending bytes to file transcription for URL-capable models', async () => {
    const doGenerateFromUrl = vi.fn();
    const doGenerate = vi.fn(async () => createMockResponse(sampleTranscript));
    await transcribe({
      model: new MockTranscriptionModelV4({ doGenerate, doGenerateFromUrl }),
      audio: audioData,
    });
    expect(doGenerateFromUrl).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ audio: audioData }),
    );
  });

  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: audioData,
      headers: {
        'custom-request-header': 'request-header-value',
      },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'custom-request-header': 'request-header-value',
        'user-agent': 'ai/0.0.0-test',
      },
      abortSignal,
      providerOptions: {},
    });
  });

  it('should pass timestampGranularities to the model', async () => {
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: audioData,
      timestampGranularities: ['word', 'segment'],
    });

    expect(capturedArgs.timestampGranularities).toEqual(['word', 'segment']);
  });

  it('should preserve an empty timestampGranularities request', async () => {
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse(sampleTranscript);
        },
      }),
      audio: audioData,
      timestampGranularities: [],
    });

    expect(capturedArgs.timestampGranularities).toEqual([]);
  });

  it('should detect MP4 audio with an ftyp box', async () => {
    const mp4AudioData = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x1c, // box size
      0x66,
      0x74,
      0x79,
      0x70, // "ftyp"
      0x4d,
      0x34,
      0x41,
      0x20, // "M4A "
    ]);
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: mp4AudioData,
    });

    expect(capturedArgs.mediaType).toMatchInlineSnapshot(`"audio/mp4"`);
  });

  it('should detect ADTS AAC audio', async () => {
    const aacAudioData = new Uint8Array([0xff, 0xf1, 0x50, 0x40]);
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: aacAudioData,
    });

    expect(capturedArgs.mediaType).toBe('audio/aac');
  });

  it('should preserve downloaded media type in provider arguments and telemetry', async () => {
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];
    const events: Array<{ type: string; event: unknown }> = [];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: new URL('https://example.com/audio'),
      download: async () => ({
        data: audioData,
        mediaType: 'audio/mpeg',
      }),
      telemetry: {
        integrations: {
          onStart: event => {
            if (event.operationId === 'ai.transcribe') {
              events.push({ type: 'start', event });
            }
          },
          onEnd: event => {
            const transcriptionEvent = event as TranscriptionEndEvent;
            if (transcriptionEvent.operationId === 'ai.transcribe') {
              events.push({ type: 'end', event: transcriptionEvent });
            }
          },
        },
      },
      _internal: { generateCallId: () => 'call-url' },
    });

    expect(capturedArgs.mediaType).toBe('audio/mpeg');
    expect(events).toMatchObject([
      {
        type: 'start',
        event: {
          callId: 'call-url',
          audio: { byteLength: 4, mediaType: 'audio/mpeg' },
        },
      },
      {
        type: 'end',
        event: {
          callId: 'call-url',
          audio: { byteLength: 4, mediaType: 'audio/mpeg' },
        },
      },
    ]);
  });

  it.each([
    'application/octet-stream',
    'application/octet-stream; charset=binary',
    'Application/Octet-Stream',
    'binary/octet-stream',
    'text/plain',
    'audio/*',
  ])(
    'should detect downloaded audio when media type is %s',
    async downloadedMediaType => {
      const aacAudioData = new Uint8Array([0xff, 0xf1, 0x50, 0x40]);
      let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

      await transcribe({
        model: new MockTranscriptionModelV4({
          doGenerate: async args => {
            capturedArgs = args;
            return createMockResponse({
              ...sampleTranscript,
            });
          },
        }),
        audio: new URL('https://example.com/audio'),
        download: async () => ({
          data: aacAudioData,
          mediaType: downloadedMediaType,
        }),
      });

      expect(capturedArgs.mediaType).toBe('audio/aac');
    },
  );

  it('should normalize downloaded audio media type with parameters', async () => {
    let capturedArgs!: Parameters<TranscriptionModelV4['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: new URL('https://example.com/audio'),
      download: async () => ({
        data: audioData,
        mediaType: 'Audio/MPEG; charset=binary',
      }),
    });

    expect(capturedArgs.mediaType).toBe('audio/mpeg');
  });

  it('should return warnings', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            warnings: [
              {
                type: 'other',
                message: 'Setting is not supported',
              },
            ],
            providerMetadata: {
              'test-provider': {
                'test-key': 'test-value',
              },
            },
          }),
      }),
      audio: audioData,
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ]);
  });

  it('should call logWarnings with the correct warnings', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported',
        feature: 'mediaType',
        details: 'MediaType parameter not supported',
      },
    ];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            warnings: expectedWarnings,
          }),
      }),
      audio: audioData,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: expectedWarnings,
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should call logWarnings with empty array when no warnings are present', async () => {
    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            warnings: [], // no warnings
          }),
      }),
      audio: audioData,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should return the transcript', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
          }),
      }),
      audio: audioData,
    });

    expect(result).toEqual({
      ...sampleTranscript,
      warnings: [],
      responses: [
        {
          timestamp: expect.any(Date),
          modelId: 'test-model-id',
          headers: {},
        },
      ],
      providerMetadata: {},
      words: undefined,
    });
    expect(result.words).toBeUndefined();
  });

  it.each([
    { timestampGranularities: undefined },
    { timestampGranularities: [] },
    { timestampGranularities: ['word'] },
  ] as const)(
    'should return provider word timings with $timestampGranularities',
    async ({ timestampGranularities }) => {
      const words = [
        { text: 'Hello', startSecond: 0, endSecond: 0.4 },
        { text: 'world', startSecond: 0.4, endSecond: 1 },
      ];
      const result = await transcribe({
        model: new MockTranscriptionModelV4({
          doGenerate: async () => ({
            ...createMockResponse({
              ...sampleTranscript,
            }),
            words,
          }),
        }),
        audio: audioData,
        timestampGranularities:
          timestampGranularities == null
            ? undefined
            : [...timestampGranularities],
      });

      expect(result.segments).toEqual(sampleTranscript.segments);
      expect(result.words).toEqual(words);
    },
  );

  it('should preserve an empty array of provider word timings', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () => ({
          ...createMockResponse(sampleTranscript),
          words: [],
        }),
      }),
      audio: audioData,
    });

    expect(result.words).toEqual([]);
  });

  it('should preserve word-level segments returned by the provider', async () => {
    const segments = [
      { text: 'Hello', startSecond: 0, endSecond: 0.4 },
      { text: 'world', startSecond: 0.4, endSecond: 1 },
    ];
    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({ ...sampleTranscript, segments }),
      }),
      audio: audioData,
    });

    expect(result.segments).toEqual(segments);
    expect(result.words).toBeUndefined();
  });

  it('should return an empty transcript', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            text: '',
            segments: [],
            language: 'en',
            durationInSeconds: 0,
          }),
      }),
      audio: audioData,
    });

    expect(result.text).toBe('');
    expect(result.segments).toEqual([]);
  });

  describe('error handling', () => {
    it('should emit a correlated start and error when downloading URL audio fails', async () => {
      const error = new Error('download failed');
      const events: unknown[] = [];

      await expect(
        transcribe({
          model: new MockTranscriptionModelV4(),
          audio: new URL('https://example.com/audio'),
          timestampGranularities: ['word'],
          download: async () => {
            throw error;
          },
          telemetry: {
            integrations: {
              onStart: event => {
                const transcriptionEvent = event as TranscriptionStartEvent;
                if (transcriptionEvent.operationId === 'ai.transcribe') {
                  events.push({
                    type: 'start',
                    callId: transcriptionEvent.callId,
                    audio: transcriptionEvent.audio,
                    timestampGranularities:
                      transcriptionEvent.timestampGranularities,
                  });
                }
              },
              onError: event => {
                const errorEvent = event as {
                  callId: string;
                  error: unknown;
                };
                events.push({ type: 'error', ...errorEvent });
              },
            },
          },
          _internal: { generateCallId: () => 'call-download-error' },
        }),
      ).rejects.toBe(error);

      expect(events).toEqual([
        {
          type: 'start',
          callId: 'call-download-error',
          audio: { byteLength: undefined, mediaType: undefined },
          timestampGranularities: ['word'],
        },
        {
          type: 'error',
          aiVersion: VERSION,
          callId: 'call-download-error',
          error,
        },
      ]);
    });

    it('should emit a correlated start and error when inline audio conversion fails', async () => {
      const events: unknown[] = [];

      await expect(
        transcribe({
          model: new MockTranscriptionModelV4(),
          audio: 'not-valid-base64!',
          telemetry: {
            integrations: {
              onStart: event => {
                const transcriptionEvent = event as TranscriptionStartEvent;
                if (transcriptionEvent.operationId === 'ai.transcribe') {
                  events.push({
                    type: 'start',
                    callId: transcriptionEvent.callId,
                    audio: transcriptionEvent.audio,
                  });
                }
              },
              onError: event => {
                const errorEvent = event as {
                  callId: string;
                  error: unknown;
                };
                events.push({ type: 'error', ...errorEvent });
              },
            },
          },
          _internal: { generateCallId: () => 'call-conversion-error' },
        }),
      ).rejects.toMatchObject({
        name: 'AI_InvalidDataContentError',
      });

      expect(events).toMatchObject([
        {
          type: 'start',
          callId: 'call-conversion-error',
          audio: { byteLength: undefined, mediaType: undefined },
        },
        {
          type: 'error',
          callId: 'call-conversion-error',
          error: { name: 'AI_InvalidDataContentError' },
        },
      ]);
    });

    it('should throw NoTranscriptGeneratedError when no transcript is returned', async () => {
      await expect(
        transcribe({
          model: new MockTranscriptionModelV4({
            doGenerate: async () =>
              createMockResponse({
                text: undefined as unknown as string,
                segments: [],
                language: 'en',
                durationInSeconds: 0,
                timestamp: testDate,
              }),
          }),
          audio: audioData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoTranscriptGeneratedError',
        message: 'No transcript generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });

    it('should include response headers in error when no transcript generated', async () => {
      await expect(
        transcribe({
          model: new MockTranscriptionModelV4({
            doGenerate: async () =>
              createMockResponse({
                text: undefined as unknown as string,
                segments: [],
                language: 'en',
                durationInSeconds: 0,
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                  'user-agent': 'ai/0.0.0-test',
                },
              }),
          }),
          audio: audioData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoTranscriptGeneratedError',
        message: 'No transcript generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
            headers: {
              'custom-response-header': 'response-header-value',
              'user-agent': 'ai/0.0.0-test',
            },
          },
        ],
      });
    });
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      audio: audioData,
    });

    expect(result.responses).toStrictEqual([
      {
        timestamp: testDate,
        modelId: 'test-model',
        headers: testHeaders,
      },
    ]);
  });

  it('should emit telemetry start and end events with audio metadata', async () => {
    const events: Array<{ type: string; event: unknown }> = [];

    await transcribe({
      model: new MockTranscriptionModelV4({
        doGenerate: async () => ({
          ...createMockResponse({
            ...sampleTranscript,
            timestamp: testDate,
            providerMetadata: { mock: { traceId: 'trace-1' } },
          }),
          usage: { inputTokens: 12 },
        }),
      }),
      audio: audioData,
      telemetry: {
        functionId: 'transcribe-audio',
        recordInputs: false,
        integrations: {
          onStart: event => {
            if (event.operationId === 'ai.transcribe') {
              events.push({ type: 'start', event });
            }
          },
          onEnd: event => {
            const transcriptionEvent = event as TranscriptionEndEvent;
            if (transcriptionEvent.operationId === 'ai.transcribe') {
              events.push({ type: 'end', event: transcriptionEvent });
            }
          },
        },
      },
      _internal: { generateCallId: () => 'call-1' },
    });

    expect(events).toMatchObject([
      {
        type: 'start',
        event: {
          callId: 'call-1',
          operationId: 'ai.transcribe',
          provider: 'mock-provider',
          modelId: 'mock-model-id',
          audio: { byteLength: 4, mediaType: 'audio/wav' },
          functionId: 'transcribe-audio',
          recordInputs: false,
        },
      },
      {
        type: 'end',
        event: {
          callId: 'call-1',
          operationId: 'ai.transcribe',
          text: sampleTranscript.text,
          audio: { byteLength: 4, mediaType: 'audio/wav' },
          usage: { inputTokens: 12 },
          providerMetadata: undefined,
          functionId: 'transcribe-audio',
        },
      },
    ]);
  });

  it.each([
    { timestampGranularities: undefined },
    { timestampGranularities: [] },
    { timestampGranularities: ['word', 'segment'] },
  ] as const)(
    'should include timestampGranularities $timestampGranularities in start telemetry',
    async ({ timestampGranularities }) => {
      const events: TranscriptionStartEvent[] = [];

      await transcribe({
        model: new MockTranscriptionModelV4({
          doGenerate: async () => createMockResponse(sampleTranscript),
        }),
        audio: audioData,
        timestampGranularities:
          timestampGranularities == null
            ? undefined
            : [...timestampGranularities],
        telemetry: {
          integrations: {
            onStart: event => {
              const transcriptionEvent = event as TranscriptionStartEvent;
              if (transcriptionEvent.operationId === 'ai.transcribe') {
                events.push(transcriptionEvent);
              }
            },
          },
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].timestampGranularities).toEqual(timestampGranularities);
    },
  );

  it.each([
    { words: undefined },
    { words: [] },
    { words: [{ text: 'Hello', startSecond: 0, endSecond: 0.4 }] },
  ])(
    'should include provider words $words in end telemetry',
    async ({ words }) => {
      const events: TranscriptionEndEvent[] = [];

      const result = await transcribe({
        model: new MockTranscriptionModelV4({
          doGenerate: async () => ({
            ...createMockResponse(sampleTranscript),
            ...(words === undefined ? {} : { words }),
          }),
        }),
        audio: audioData,
        telemetry: {
          integrations: {
            onEnd: event => {
              const transcriptionEvent = event as TranscriptionEndEvent;
              if (transcriptionEvent.operationId === 'ai.transcribe') {
                events.push(transcriptionEvent);
              }
            },
          },
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].words).toEqual(words);
      expect(result.words).toEqual(words);
    },
  );

  it('should emit a telemetry error event when transcription fails', async () => {
    const error = new Error('transcription failed');
    const onError = vi.fn();

    await expect(
      transcribe({
        model: new MockTranscriptionModelV4({
          doGenerate: async () => {
            throw error;
          },
        }),
        audio: audioData,
        maxRetries: 0,
        telemetry: { integrations: { onError } },
        _internal: { generateCallId: () => 'call-1' },
      }),
    ).rejects.toBe(error);

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      aiVersion: VERSION,
      callId: 'call-1',
      error,
    });
  });
});
