import type { JSONObject, TranscriptionModelV4 } from '@ai-sdk/provider';
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
import type { TranscriptionEndEvent } from './transcription-events';
import type { Warning } from '../types/warning';

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
    });
  });

  describe('error handling', () => {
    it('should throw NoTranscriptGeneratedError when no transcript is returned', async () => {
      await expect(
        transcribe({
          model: new MockTranscriptionModelV4({
            doGenerate: async () =>
              createMockResponse({
                text: '',
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
                text: '',
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
          providerMetadata: { mock: { traceId: 'trace-1' } },
          functionId: 'transcribe-audio',
        },
      },
    ]);
  });

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
      callId: 'call-1',
      error,
    });
  });
});
