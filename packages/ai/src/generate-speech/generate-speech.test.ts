import {
  JSONValue,
  SpeechModelV2,
  SpeechModelV2CallWarning,
} from '@ai-sdk/provider';
import { MockSpeechModelV2 } from '../test/mock-speech-model-v2';
import { generateSpeech } from './generate-speech';
import {
  GeneratedAudioFile,
  DefaultGeneratedAudioFile,
} from './generated-audio-file';

const audio = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);
const mockFile = new DefaultGeneratedAudioFile({
  data: audio,
  mediaType: 'audio/mp3',
});

const sampleText = 'This is a sample text to convert to speech.';

const createMockResponse = (options: {
  audio: GeneratedAudioFile;
  warnings?: SpeechModelV2CallWarning[];
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

describe('generateSpeech', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<SpeechModelV2['doGenerate']>[0];

    await generateSpeech({
      model: new MockSpeechModelV2({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            audio: mockFile,
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
      outputFormat: undefined,
      instructions: undefined,
      speed: undefined,
      language: undefined,
    });
  });

  it('should return warnings', async () => {
    const result = await generateSpeech({
      model: new MockSpeechModelV2({
        doGenerate: async () =>
          createMockResponse({
            audio: mockFile,
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
    const result = await generateSpeech({
      model: new MockSpeechModelV2({
        doGenerate: async () =>
          createMockResponse({
            audio: mockFile,
          }),
      }),
      text: sampleText,
    });

    expect(result).toEqual({
      audio: mockFile,
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
        generateSpeech({
          model: new MockSpeechModelV2({
            doGenerate: async () =>
              createMockResponse({
                audio: new DefaultGeneratedAudioFile({
                  data: new Uint8Array(),
                  mediaType: 'audio/mp3',
                }),
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
        generateSpeech({
          model: new MockSpeechModelV2({
            doGenerate: async () =>
              createMockResponse({
                audio: new DefaultGeneratedAudioFile({
                  data: new Uint8Array(),
                  mediaType: 'audio/mp3',
                }),
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

    const result = await generateSpeech({
      model: new MockSpeechModelV2({
        doGenerate: async () =>
          createMockResponse({
            audio: mockFile,
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
