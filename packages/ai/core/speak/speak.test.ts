import { JSONValue, SpeechModelV1, SpeechWarning } from '@ai-sdk/provider';
import { MockSpeechModelV1 } from '../test/mock-speech-model-v1';
import { speak } from './speak';

const audioData = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);

const sampleText = 'This is a sample text to convert to speech.';

const createMockResponse = (options: {
  audio?: Uint8Array;
  contentType?: string;
  warnings?: SpeechWarning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, Record<string, JSONValue>>;
}) => ({
  audio: options.audio,
  contentType: options.contentType ?? 'audio/mp3',
  warnings: options.warnings ?? [],
  response: {
    timestamp: options.timestamp ?? new Date(),
    modelId: options.modelId ?? 'test-model-id',
    headers: options.headers ?? {},
  },
  providerMetadata: options.providerMetadata ?? {},
});

describe('speak', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<SpeechModelV1['doGenerate']>[0];

    await speak({
      model: new MockSpeechModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            audio: audioData,
          });
        },
      }),
      text: sampleText,
      voice: 'test-voice',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      text: sampleText,
      voice: 'test-voice',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
      providerOptions: {},
    });
  });

  it('should return warnings', async () => {
    const result = await speak({
      model: new MockSpeechModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: audioData,
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
      text: sampleText,
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ]);
  });

  it('should return the audio data', async () => {
    const result = await speak({
      model: new MockSpeechModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: audioData,
            contentType: 'audio/mp3',
          }),
      }),
      text: sampleText,
    });

    expect(result).toEqual({
      audioData,
      contentType: 'audio/mp3',
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
        speak({
          model: new MockSpeechModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: undefined,
                timestamp: testDate,
              }),
          }),
          text: sampleText,
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

    it('should include response headers in error when no audio generated', async () => {
      await expect(
        speak({
          model: new MockSpeechModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: undefined,
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                },
              }),
          }),
          text: sampleText,
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
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await speak({
      model: new MockSpeechModelV1({
        doGenerate: async () =>
          createMockResponse({
            audio: audioData,
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      text: sampleText,
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
