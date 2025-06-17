import {
  JSONValue,
  VoiceChangerModelV1,
  VoiceChangerModelV1CallWarning,
} from '@ai-sdk/provider';
import { MockVoiceChangerModelV1 } from '../test/mock-voice-changer-model-v1';
import { changeVoice } from './change-voice';
import { DefaultGeneratedAudioFile } from '../generate-speech/generated-audio-file';

const audioData = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);

const sampleVoiceChange = {
  audio: new Uint8Array([5, 6, 7, 8]), // Changed audio data
};

const mockFile = new DefaultGeneratedAudioFile({
  data: new Uint8Array([5, 6, 7, 8]),
  mimeType: 'audio/wav',
});

const createMockResponse = (options: {
  audio: Uint8Array;
  warnings?: VoiceChangerModelV1CallWarning[];
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

describe('changeVoice', () => {
  it('should send args to doGenerate', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    let capturedArgs!: Parameters<VoiceChangerModelV1['doGenerate']>[0];

    await changeVoice({
      model: new MockVoiceChangerModelV1({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            ...sampleVoiceChange,
          });
        },
      }),
      audio: audioData,
      voice: 'test-voice-id',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      audio: audioData,
      voice: 'test-voice-id',
      mediaType: 'audio/wav',
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
      providerOptions: {},
    });
  });

  it('should return warnings', async () => {
    const result = await changeVoice({
      model: new MockVoiceChangerModelV1({
        doGenerate: async () =>
          createMockResponse({
            ...sampleVoiceChange,
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
      voice: 'test-voice-id',
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ]);
  });

  it('should return the changed audio', async () => {
    const result = await changeVoice({
      model: new MockVoiceChangerModelV1({
        doGenerate: async () =>
          createMockResponse({
            ...sampleVoiceChange,
          }),
      }),
      audio: audioData,
      voice: 'test-voice-id',
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
        changeVoice({
          model: new MockVoiceChangerModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: new Uint8Array(),
                timestamp: testDate,
              }),
          }),
          audio: audioData,
          voice: 'test-voice-id',
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
        changeVoice({
          model: new MockVoiceChangerModelV1({
            doGenerate: async () =>
              createMockResponse({
                audio: new Uint8Array(),
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                },
              }),
          }),
          audio: audioData,
          voice: 'test-voice-id',
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

    const result = await changeVoice({
      model: new MockVoiceChangerModelV1({
        doGenerate: async () =>
          createMockResponse({
            ...sampleVoiceChange,
            timestamp: testDate,
            modelId: 'test-model',
            headers: testHeaders,
          }),
      }),
      audio: audioData,
      voice: 'test-voice-id',
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
