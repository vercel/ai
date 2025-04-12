import {
  JSONValue,
  IsolationModelV1,
  IsolationModelV1CallWarning,
} from '@ai-sdk/provider';
import { MockIsolationModelV1 } from '../test/mock-isolation-model-v1';
import { isolateAudio } from './isolate-audio';
import { GeneratedAudioFile } from '../generate-speech';
import { DefaultGeneratedAudioFile } from '../generate-speech/generated-audio-file';

const mockInputData = new Uint8Array([1, 2, 3, 4]);
const testDate = new Date(2024, 0, 1);
const mockResult = new DefaultGeneratedAudioFile({
  data: new Uint8Array([1, 2, 3]),
  mimeType: 'audio/mp3',
});

const createMockResponse = (options: {
  audio: GeneratedAudioFile;
  warnings?: IsolationModelV1CallWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, Record<string, JSONValue>>;
}) => ({
  audio: options.audio.uint8Array,
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
            audio: mockResult,
          });
        },
      }),
      audio: mockInputData,
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      audio: mockInputData,
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
            audio: mockResult,
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
      audio: mockInputData,
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
            audio: mockResult,
          }),
      }),
      audio: mockInputData,
    });

    expect(result).toEqual({
      audio: mockResult,
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
    it('should throw NoSpeechGeneratedError when no audio is returned', async () => {
      await expect(
        isolateAudio({
          model: new MockIsolationModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: new DefaultGeneratedAudioFile({
                  data: new Uint8Array(),
                  mimeType: 'audio/mp3',
                }),
                timestamp: testDate,
              }),
          }),
          audio: mockInputData,
        }),
      ).rejects.toMatchObject({
        name: 'AI_NoSpeechGeneratedError',
        message: 'No speech audio generated.',
        responses: [
          {
            timestamp: testDate,
            modelId: expect.any(String),
          },
        ],
      });
    });
  });

  it('should include response headers in error when no audio generated', async () => {
    await expect(
      isolateAudio({
        model: new MockIsolationModelV1({
          doGenerate: async () =>
            createMockResponse({
              audio: new DefaultGeneratedAudioFile({
                data: new Uint8Array(),
                mimeType: 'audio/mp3',
              }),
              timestamp: testDate,
              headers: {
                'custom-response-header': 'response-header-value',
              },
            }),
        }),
        audio: mockInputData,
      }),
    ).rejects.toMatchObject({
      name: 'AI_NoSpeechGeneratedError',
      message: 'No speech audio generated.',
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

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await isolateAudio({
      model: new MockIsolationModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: new DefaultGeneratedAudioFile({
              data: mockInputData,
              mimeType: 'audio/mp3',
            }),
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      audio: mockInputData,
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
