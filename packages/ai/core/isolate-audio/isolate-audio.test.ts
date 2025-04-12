import {
  JSONValue,
  IsolationModelV1,
  IsolationModelV1CallWarning,
  TranscriptionModelV1,
} from '@ai-sdk/provider';
import { MockIsolationModelV1 } from '../test/mock-isolation-model-v1';
import { isolateAudio } from './isolate-audio';
import { GeneratedAudioFile } from '../generate-speech';

const audioData = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);
const sampleResult = new Uint8Array([1, 2, 3]); // Sample audio data

const createMockResponse = (options: {
  audio: GeneratedAudioFile;
  warnings?: IsolationModelV1CallWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, Record<string, JSONValue>>;
}) => ({
  audio: options.audio,
  warnings: options.warnings ?? [],
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
  providerMetadata: options.providerMetadata ?? {},
});

describe('isolateAudio', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<IsolationModelV1['doGenerate']>[0];

    await isolateAudio({
      model: new MockIsolationModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            audio: sampleResult,
          });
        },
      }),
      audio: audioData,
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
      providerOptions: {},
    });
  });

  it('should return warnings', async () => {
    const result = await isolateAudio({
      model: new MockIsolationModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: sampleResult,
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

  it('should return the isolated audio', async () => {
    const result = await isolateAudio({
      model: new MockIsolationModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: sampleResult,
          }),
      }),
      audio: audioData,
    });

    expect(result).toEqual({
      audio: sampleResult,
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
    it('should throw NoIsolatedAudioError when no isolated audio is returned', async () => {
      await expect(
        isolateAudio({
          model: new MockIsolationModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: sampleResult,
                timestamp: testDate,
              }),
          }),
          audio: audioData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoIsolatedAudioError',
        message: 'No isolated audio returned.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });

    it('should include response headers in error when no isolated audio is returned', async () => {
      await expect(
        isolateAudio({
          model: new MockIsolationModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: sampleResult,
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

    const result = await isolateAudio({
      model: new MockIsolationModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: sampleResult,
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
