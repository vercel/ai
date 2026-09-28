import type { JSONObject, SpeechModelV4 } from '@ai-sdk/provider';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockSpeechModelV4 } from '../test/mock-speech-model-v4';
import type { Warning } from '../types/warning';
import { generateSpeech } from './generate-speech';
import {
  DefaultGeneratedAudioFile,
  type GeneratedAudioFile,
} from './generated-audio-file';
const audio = new Uint8Array([1, 2, 3, 4]); // Sample audio data
const testDate = new Date(2024, 0, 1);
const mockFile = new DefaultGeneratedAudioFile({
  data: audio,
  mediaType: 'audio/mp3',
});

const sampleText = 'This is a sample text to convert to speech.';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const createMockResponse = (options: {
  audio: GeneratedAudioFile;
  warnings?: Warning[];
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
  providerMetadata?: Record<string, JSONObject>;
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

    let capturedArgs!: Parameters<SpeechModelV4['doGenerate']>[0];

    await generateSpeech({
      model: new MockSpeechModelV4({
        doGenerate: async args => {
          capturedArgs = args;
          return createMockResponse({
            audio: mockFile,
          });
        },
      }),
      text: sampleText,
      voice: 'test-voice',
      headers: {
        'custom-request-header': 'request-header-value',
      },
      abortSignal,
    });

    expect(capturedArgs).toStrictEqual({
      text: sampleText,
      voice: 'test-voice',
      headers: {
        'custom-request-header': 'request-header-value',
        'user-agent': 'ai/0.0.0-test',
      },
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
      model: new MockSpeechModelV4({
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

  it('should call logWarnings with the correct warnings', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported',
        feature: 'voice',
        details: 'Voice parameter not supported',
      },
    ];

    await generateSpeech({
      model: new MockSpeechModelV4({
        doGenerate: async () =>
          createMockResponse({
            audio: mockFile,
            warnings: expectedWarnings,
          }),
      }),
      text: sampleText,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: expectedWarnings,
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should call logWarnings with empty array when no warnings are present', async () => {
    await generateSpeech({
      model: new MockSpeechModelV4({
        doGenerate: async () =>
          createMockResponse({
            audio: mockFile,
            warnings: [], // no warnings
          }),
      }),
      text: sampleText,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should return the audio data', async () => {
    const result = await generateSpeech({
      model: new MockSpeechModelV4({
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

  it('should return ADTS AAC audio with AAC metadata', async () => {
    const aacAudio = new DefaultGeneratedAudioFile({
      data: new Uint8Array([0xff, 0xf1, 0x50, 0x40]),
      mediaType: 'audio/aac',
    });

    const result = await generateSpeech({
      model: new MockSpeechModelV4({
        doGenerate: async () =>
          createMockResponse({
            audio: aacAudio,
          }),
      }),
      text: sampleText,
      outputFormat: 'aac',
    });

    expect(result.audio.mediaType).toBe('audio/aac');
    expect(result.audio.format).toBe('aac');
    expect(result.audio.uint8Array).toStrictEqual(aacAudio.uint8Array);
  });

  describe('audio metadata', () => {
    it.each([
      { label: 'Uint8Array', audio: new Uint8Array([1, 2, 3, 4]) },
      { label: 'base64', audio: 'AQIDBA==' },
    ])(
      'should identify headerless PCM returned as $label from the requested format',
      async ({ audio }) => {
        const result = await generateSpeech({
          model: new MockSpeechModelV4({
            doGenerate: async () => ({
              audio,
              warnings: [],
              response: {
                timestamp: testDate,
                modelId: 'test-model',
              },
            }),
          }),
          text: sampleText,
          outputFormat: 'pcm',
        });

        expect(result.audio).toMatchObject({
          format: 'pcm',
          mediaType: 'audio/pcm',
        });
      },
    );

    it.each([
      ['audio/l16', 'audio/l16'],
      ['mulaw', 'audio/mulaw'],
      ['audio/mulaw', 'audio/mulaw'],
      ['alaw', 'audio/alaw'],
      ['audio/alaw', 'audio/alaw'],
    ])(
      'should identify headerless %s audio',
      async (outputFormat, mediaType) => {
        const result = await generateSpeech({
          model: new MockSpeechModelV4({
            doGenerate: async () => ({
              audio,
              warnings: [],
              response: {
                timestamp: testDate,
                modelId: 'test-model',
                headers: { 'content-type': 'application/json' },
              },
            }),
          }),
          text: sampleText,
          outputFormat,
        });
        expect(result.audio.mediaType).toBe(mediaType);
      },
    );

    it('should identify headerless audio from the response content type', async () => {
      const result = await generateSpeech({
        model: new MockSpeechModelV4({
          doGenerate: async () => ({
            audio,
            warnings: [],
            response: {
              timestamp: testDate,
              modelId: 'test-model',
              headers: {
                'Content-Type': 'audio/pcm; rate=24000',
              },
            },
          }),
        }),
        text: sampleText,
      });

      expect(result.audio).toMatchObject({
        format: 'pcm',
        mediaType: 'audio/pcm',
      });
    });

    it('should prefer the detected format over response and request metadata', async () => {
      const wav = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      ]);

      const result = await generateSpeech({
        model: new MockSpeechModelV4({
          doGenerate: async () => ({
            audio: wav,
            warnings: [],
            response: {
              timestamp: testDate,
              modelId: 'test-model',
              headers: {
                'content-type': 'audio/pcm',
              },
            },
          }),
        }),
        text: sampleText,
        outputFormat: 'pcm',
      });

      expect(result.audio).toMatchObject({
        format: 'wav',
        mediaType: 'audio/wav',
      });
    });
  });

  describe('error handling', () => {
    it('should throw NoSpeechGeneratedError when no audio is returned', async () => {
      await expect(
        generateSpeech({
          model: new MockSpeechModelV4({
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
          model: new MockSpeechModelV4({
            doGenerate: async () =>
              createMockResponse({
                audio: new DefaultGeneratedAudioFile({
                  data: new Uint8Array(),
                  mediaType: 'audio/mp3',
                }),
                timestamp: testDate,
                headers: {
                  'custom-response-header': 'response-header-value',
                  'user-agent': 'ai/0.0.0-test',
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
              'user-agent': 'ai/0.0.0-test',
            },
          },
        ],
      });
    });
  });

  it('should return response metadata', async () => {
    const testHeaders = { 'x-test': 'value' };

    const result = await generateSpeech({
      model: new MockSpeechModelV4({
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
