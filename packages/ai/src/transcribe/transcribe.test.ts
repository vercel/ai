import {
  JSONValue,
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vitest } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockTranscriptionModelV2 } from '../test/mock-transcription-model-v2';
import { transcribe } from './transcribe';

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
  warnings?: TranscriptionModelV2CallWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, Record<string, JSONValue>>;
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

    let capturedArgs!: Parameters<TranscriptionModelV2['doGenerate']>[0];

    await transcribe({
      model: new MockTranscriptionModelV2({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleTranscript,
          });
        },
      }),
      audio: audioData,
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    const {
      audio: capturedAudio,
      mediaType: capturedMediaType,
      abortSignal: capturedAbortSignal,
      providerOptions,
      headers: rawHeaders,
    } = capturedArgs;

    const headers: Record<string, string | undefined> = rawHeaders ?? {};
    const headersWithoutUA = Object.fromEntries(
      Object.entries(headers).filter(
        ([key, value]) => key.toLowerCase() !== 'user-agent' && value !== undefined,
      ),
    ) as Record<string, string>;

    expect({
      audio: capturedAudio,
      mediaType: capturedMediaType,
      providerOptions,
      abortSignal: capturedAbortSignal,
    }).toStrictEqual({
      audio: audioData,
      mediaType: 'audio/wav',
      providerOptions: {},
      abortSignal,
    });

    expect(headersWithoutUA).toStrictEqual({
      'custom-request-header': 'request-header-value',
    });

    expect(typeof headers['user-agent']).toBe('string');
  });

  it('should return warnings', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV2({
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
    const expectedWarnings: TranscriptionModelV2CallWarning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported-setting',
        setting: 'mediaType',
        details: 'MediaType parameter not supported',
      },
    ];

    await transcribe({
      model: new MockTranscriptionModelV2({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            warnings: expectedWarnings,
          }),
      }),
      audio: audioData,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith(expectedWarnings);
  });

  it('should call logWarnings with empty array when no warnings are present', async () => {
    await transcribe({
      model: new MockTranscriptionModelV2({
        doGenerate: async () =>
          createMockResponse({
            ...sampleTranscript,
            warnings: [], // no warnings
          }),
      }),
      audio: audioData,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith([]);
  });

  it('should return the transcript', async () => {
    const result = await transcribe({
      model: new MockTranscriptionModelV2({
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
          model: new MockTranscriptionModelV2({
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
          model: new MockTranscriptionModelV2({
            doGenerate: async () =>
              createMockResponse({
                text: '',
                segments: [],
                language: 'en',
                durationInSeconds: 0,
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
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
            },
          },
        ],
      });
    });
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await transcribe({
      model: new MockTranscriptionModelV2({
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
});
