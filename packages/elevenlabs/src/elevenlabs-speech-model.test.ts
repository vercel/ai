import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';
import type { ElevenLabsSpeechModel } from './elevenlabs-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.speech('eleven_multilingual_v2');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/text-to-speech/*': {},
  'https://api.elevenlabs.io/v1/music': {},
  'https://api.elevenlabs.io/v1/music/detailed': {},
  'https://api.elevenlabs.io/v1/sound-generation': {},
  'https://api.elevenlabs.io/v1/text-to-dialogue': {},
  'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps': {},
});

function prepareGenerationResponse(
  url:
    | 'https://api.elevenlabs.io/v1/music'
    | 'https://api.elevenlabs.io/v1/sound-generation'
    | 'https://api.elevenlabs.io/v1/text-to-dialogue',
) {
  const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
  server.urls[url].response = {
    type: 'binary',
    headers: { 'content-type': 'audio/mpeg' },
    body: Buffer.from(audio),
  };
  return audio;
}

const alignment = {
  characters: ['H', 'i'],
  character_start_times_seconds: [0, 0.123456789],
  character_end_times_seconds: [0.123456789, 0.4],
};

const alignmentMetadata = {
  characters: ['H', 'i'],
  characterStartTimesSeconds: [0, 0.123456789],
  characterEndTimesSeconds: [0.123456789, 0.4],
};

describe('ElevenLabsSpeechModel', () => {
  function prepareAudioResponse({
    headers,
    format = 'mp3',
  }: {
    headers?: Record<string, string>;
    format?: string;
  } = {}) {
    const audioBuffer = new Uint8Array(100); // Mock audio data
    server.urls['https://api.elevenlabs.io/v1/text-to-speech/*'].response = {
      type: 'binary',
      headers: {
        'content-type': `audio/${format}`,
        ...headers,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  describe('doGenerate', () => {
    it.each([undefined, false])(
      'preserves binary audio when withTimestamps is %s',
      async withTimestamps => {
        const audio = prepareAudioResponse();
        const result = await model.doGenerate({
          text: 'Hi',
          providerOptions: { elevenlabs: { withTimestamps } },
        });

        expect(result.audio).toStrictEqual(audio);
        expect(result.providerMetadata).toStrictEqual({
          elevenlabs: { outputFormat: 'mp3_44100_128' },
        });
        expect(server.calls[0].requestUrl).toBe(
          'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128',
        );
      },
    );

    it('returns timestamped audio and metadata from Text to Speech', async () => {
      const modelId = 'eleven_multilingual_v2';
      const body = {
        audio_base64: 'AQID',
        alignment,
        normalized_alignment: alignment,
      };
      server.urls['https://api.elevenlabs.io/v1/text-to-speech/*'].response = {
        type: 'json-value',
        headers: { 'request-id': 'tts-request' },
        body,
      };

      const result = await provider.speech(modelId).doGenerate({
        text: 'Hi',
        voice: 'test-voice',
        outputFormat: 'pcm_24000',
        headers: { 'custom-header': 'custom-value' },
        providerOptions: {
          elevenlabs: { withTimestamps: true, seed: 0, enableLogging: false },
        },
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/text-to-speech/test-voice/with-timestamps?output_format=pcm_24000&enable_logging=false',
      );
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hi',
        model_id: modelId,
        seed: 0,
      });
      expect(server.calls[0].requestHeaders).toMatchObject({
        'custom-header': 'custom-value',
      });
      expect(result.audio).toStrictEqual(new Uint8Array([1, 2, 3]));
      expect(result.providerMetadata).toStrictEqual({
        elevenlabs: {
          outputFormat: 'pcm_24000',
          alignment: alignmentMetadata,
          normalizedAlignment: alignmentMetadata,
        },
      });
      expect(result.response.headers?.['request-id']).toBe('tts-request');
      expect(result.response.body).toStrictEqual(body);
    });

    it.each([
      {},
      { alignment: null, normalized_alignment: null, voice_segments: null },
    ])('accepts absent or null timestamp metadata: %j', async metadata => {
      server.urls['https://api.elevenlabs.io/v1/text-to-speech/*'].response = {
        type: 'json-value',
        body: { audio_base64: 'AQID', ...metadata },
      };
      const result = await model.doGenerate({
        text: 'Hi',
        providerOptions: { elevenlabs: { withTimestamps: true } },
      });
      expect(result.audio).toStrictEqual(new Uint8Array([1, 2, 3]));
      expect(result.providerMetadata).toStrictEqual({
        elevenlabs: { outputFormat: 'mp3_44100_128' },
      });
    });

    it('preserves empty audio and alignment arrays', async () => {
      server.urls['https://api.elevenlabs.io/v1/text-to-speech/*'].response = {
        type: 'json-value',
        body: {
          audio_base64: '',
          alignment: {
            characters: [],
            character_start_times_seconds: [],
            character_end_times_seconds: [],
          },
        },
      };
      const result = await model.doGenerate({
        text: 'Hi',
        providerOptions: { elevenlabs: { withTimestamps: true } },
      });
      expect(result.audio).toStrictEqual(new Uint8Array(0));
      expect(result.providerMetadata).toStrictEqual({
        elevenlabs: {
          outputFormat: 'mp3_44100_128',
          alignment: {
            characters: [],
            characterStartTimesSeconds: [],
            characterEndTimesSeconds: [],
          },
        },
      });
    });

    it.each([undefined, true])(
      'routes eleven_v4 to Text to Dialogue with withTimestamps=%s',
      async withTimestamps => {
        const url =
          `https://api.elevenlabs.io/v1/text-to-dialogue${withTimestamps ? '/with-timestamps' : ''}` as const;
        server.urls[url].response = withTimestamps
          ? {
              type: 'json-value',
              body: {
                audio_base64: 'AQID',
                alignment,
                normalized_alignment: alignment,
              },
            }
          : { type: 'binary', body: Buffer.from([1, 2, 3]) };

        const result = await provider.speech('eleven_v4').doGenerate({
          text: 'Hi',
          voice: 'test-voice',
          outputFormat: 'mp3_192',
          providerOptions: {
            elevenlabs: {
              withTimestamps,
              voiceSettings: { stability: 0, similarityBoost: 0.75 },
            },
          },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${url}?output_format=mp3_44100_192`,
        );
        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          inputs: [{ text: 'Hi', voice_id: 'test-voice' }],
          model_id: 'eleven_v4',
          settings: { stability: 0, similarity: 0.75 },
        });
        expect(result.audio).toStrictEqual(new Uint8Array([1, 2, 3]));
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it('returns timestamps and voice segments for explicit dialogue inputs', async () => {
      const modelId = 'eleven_v4';
      server.urls[
        'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps'
      ].response = {
        type: 'json-value',
        body: {
          audio_base64: 'AQID',
          alignment,
          normalized_alignment: alignment,
          voice_segments: ['first-voice', 'second-voice'].map(
            (voice_id, index) => ({
              voice_id,
              start_time_seconds: index * 0.2,
              end_time_seconds: (index + 1) * 0.2,
              character_start_index: index,
              character_end_index: index + 1,
              dialogue_input_index: index,
            }),
          ),
        },
      };
      const result = await provider.speech(modelId).doGenerate({
        text: '',
        providerOptions: {
          elevenlabs: {
            withTimestamps: true,
            inputs: [
              { text: 'H', voiceId: 'first-voice' },
              { text: 'i', voiceId: 'second-voice' },
            ],
          },
        },
      });
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model_id: modelId,
        inputs: [
          { text: 'H', voice_id: 'first-voice' },
          { text: 'i', voice_id: 'second-voice' },
        ],
      });
      expect(result.audio).toStrictEqual(new Uint8Array([1, 2, 3]));
      expect(result.warnings).toStrictEqual([]);
      expect(result.providerMetadata?.elevenlabs?.voiceSegments).toStrictEqual([
        {
          voiceId: 'first-voice',
          startTimeSeconds: 0,
          endTimeSeconds: 0.2,
          characterStartIndex: 0,
          characterEndIndex: 1,
          dialogueInputIndex: 0,
        },
        {
          voiceId: 'second-voice',
          startTimeSeconds: 0.2,
          endTimeSeconds: 0.4,
          characterStartIndex: 1,
          characterEndIndex: 2,
          dialogueInputIndex: 1,
        },
      ]);
    });

    it.each([
      [
        'eleven_text_to_sound_v2',
        'https://api.elevenlabs.io/v1/sound-generation',
      ],
    ] as const)(
      'warns about timestamps for %s without changing its endpoint',
      async (modelId, url) => {
        const audio = prepareGenerationResponse(url);
        const result = await provider.speech(modelId).doGenerate({
          text: 'A short sound.',
          providerOptions: { elevenlabs: { withTimestamps: true } },
        });
        expect(server.calls[0].requestUrl).toBe(
          `${url}?output_format=mp3_44100_128`,
        );
        expect(result.audio).toStrictEqual(audio);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            type: 'unsupported',
            feature: 'providerOptions.elevenlabs.withTimestamps',
          }),
        );
      },
    );

    it('returns lyric timestamps and audio from music generation', async () => {
      const modelId = 'music_v2_5';
      const nativeMetadata = {
        words_timestamps: [{ word: 'Hello', start_ms: 200, end_ms: 500 }],
      };
      server.urls['https://api.elevenlabs.io/v1/music/detailed'].response = {
        type: 'binary',
        headers: { 'content-type': 'multipart/mixed; boundary=music' },
        body: Buffer.concat([
          Buffer.from(
            `--music\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(nativeMetadata)}\r\n--music\r\nContent-Type: audio/mpeg\r\n\r\n`,
          ),
          Buffer.from([255, 0, 128, 1, 2, 3]),
          Buffer.from('\r\n--music--\r\n'),
        ]),
      };
      const result = await provider.speech(modelId).doGenerate({
        text: 'A short song.',
        providerOptions: {
          elevenlabs: { withTimestamps: true, musicLengthMs: 3000 },
        },
      });
      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/music/detailed?output_format=mp3_44100_128',
      );
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt: 'A short song.',
        model_id: modelId,
        music_length_ms: 3000,
        with_timestamps: true,
      });
      expect(result.audio).toStrictEqual(
        new Uint8Array([255, 0, 128, 1, 2, 3]),
      );
      expect(result.providerMetadata).toStrictEqual({
        elevenlabs: {
          outputFormat: 'mp3_44100_128',
          requestedDurationMs: 3000,
          wordTimestamps: [{ word: 'Hello', startMs: 200, endMs: 500 }],
        },
      });
      expect(result.response.body).toStrictEqual(nativeMetadata);
      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn about and ignore streaming-only options', async () => {
      prepareAudioResponse();
      const result = await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: { elevenlabs: { streaming: { autoMode: true } } },
      });
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'providerOptions.elevenlabs.streaming',
        }),
      );
      expect(server.calls[0].requestUrlSearchParams.get('auto_mode')).toBe(
        null,
      );
    });

    it('should warn about and ignore dialogue options', async () => {
      prepareAudioResponse();
      const result = await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: { elevenlabs: { dialogue: { voices: ['a'] } } },
      });
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'providerOptions.elevenlabs.dialogue',
        }),
      );
    });

    it('should generate speech with required parameters', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        model_id: 'eleven_multilingual_v2',
      });

      // Check output_format is in query params
      expect(server.calls[0].requestUrl).toContain(
        'output_format=mp3_44100_128',
      );
    });

    it('should handle custom output format', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
        outputFormat: 'pcm_44100',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        model_id: 'eleven_multilingual_v2',
      });

      // Check output_format is in query params
      expect(server.calls[0].requestUrl).toContain('output_format=pcm_44100');
    });

    it.each([
      ['wav', 'wav_44100'],
      ['wav_24000', 'wav_24000'],
    ])(
      'should map HTTP output format %s to %s',
      async (outputFormat, nativeFormat) => {
        const audio = prepareAudioResponse({ format: 'wav' });

        const result = await model.doGenerate({
          text: 'Hello, world!',
          outputFormat,
        });

        expect(
          server.calls[0].requestUrlSearchParams.get('output_format'),
        ).toBe(nativeFormat);
        expect(result.audio).toEqual(audio);
        expect(result.providerMetadata?.elevenlabs.outputFormat).toBe(
          nativeFormat,
        );
      },
    );

    it('should handle language parameter', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hola, mundo!',
        voice: 'test-voice-id',
        language: 'es',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hola, mundo!',
        model_id: 'eleven_multilingual_v2',
        language_code: 'es',
      });

      // Check output_format is in query params
      expect(server.calls[0].requestUrl).toContain(
        'output_format=mp3_44100_128',
      );
    });

    it('should handle speed parameter in voice settings', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
        speed: 1.5,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          speed: 1.5,
        },
      });
    });

    it('should warn about unsupported instructions parameter', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
        instructions: 'Speak slowly',
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "ElevenLabs speech models do not support instructions. Instructions parameter was ignored.",
            "feature": "instructions",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('should pass provider-specific options', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
        providerOptions: {
          elevenlabs: {
            voiceSettings: {
              stability: 0.5,
              similarityBoost: 0.75,
            },
            seed: 123,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
        seed: 123,
      });

      // Check output_format is in query params
      expect(server.calls[0].requestUrl).toContain(
        'output_format=mp3_44100_128',
      );
    });

    it('should include user-agent header', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-voice-id',
      });

      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk-elevenlabs/0.0.0-test`,
      );
    });

    it('should report the output format in provider metadata', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'pcm_24000',
      });

      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'pcm_24000' },
      });
    });

    it.each([
      {
        voice: 'test-voice-id',
        url: 'https://api.elevenlabs.io/v1/text-to-speech/test-voice-id?output_format=mp3_44100_128',
      },
      {
        voice: undefined,
        url: 'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128',
      },
    ])(
      'should send the full text-to-speech request for voice $voice',
      async ({ voice, url }) => {
        prepareAudioResponse();

        await model.doGenerate({ text: 'Hello, world!', voice });

        expect(server.calls[0].requestUrl).toBe(url);
        expect(await server.calls[0].requestBodyJson).toEqual({
          text: 'Hello, world!',
          model_id: 'eleven_multilingual_v2',
        });
      },
    );

    it('should surface the ElevenLabs error message and code', async () => {
      server.urls['https://api.elevenlabs.io/v1/text-to-speech/*'].response = {
        type: 'error',
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          detail: {
            type: 'not_found',
            code: 'voice_not_found',
            message: "A voice with voice_id 'missing-voice' was not found.",
            status: 'voice_not_found',
            request_id: 'req_test_speech',
          },
        }),
      };

      const result = model.doGenerate({
        text: 'Hello, world!',
        voice: 'missing-voice',
      });

      await expect(result).rejects.toBeInstanceOf(APICallError);
      await expect(result).rejects.toMatchObject({
        message:
          "A voice with voice_id 'missing-voice' was not found. (voice_not_found)",
        statusCode: 404,
        data: { detail: { request_id: 'req_test_speech' } },
      });
    });
  });

  describe('native output formats', () => {
    it.each([
      {
        modelId: 'music_v2_5',
        url: 'https://api.elevenlabs.io/v1/music',
        providerOptions: {},
      },
      {
        modelId: 'eleven_text_to_sound_v2',
        url: 'https://api.elevenlabs.io/v1/sound-generation',
        providerOptions: {},
      },
      {
        modelId: 'eleven_v3',
        url: 'https://api.elevenlabs.io/v1/text-to-dialogue',
        providerOptions: {
          inputs: [{ text: 'Hello', voiceId: 'voice-a' }],
        },
      },
    ] as const)(
      'should normalize WAV for $modelId',
      async ({ modelId, url, providerOptions }) => {
        const audio = prepareGenerationResponse(url);

        const result = await provider.speech(modelId).doGenerate({
          text: 'Hello',
          outputFormat: 'wav',
          providerOptions: { elevenlabs: providerOptions },
        });

        expect(
          server.calls[0].requestUrlSearchParams.get('output_format'),
        ).toBe('wav_44100');
        expect(result.audio).toEqual(audio);
        expect(result.providerMetadata?.elevenlabs.outputFormat).toBe(
          'wav_44100',
        );
      },
    );

    it.each([
      {
        modelId: 'music_v2_5',
        url: 'https://api.elevenlabs.io/v1/music',
        outputFormat: 'auto',
        providerOptions: {},
      },
      {
        modelId: 'eleven_text_to_sound_v2',
        url: 'https://api.elevenlabs.io/v1/sound-generation',
        outputFormat: 'wav_24000',
        providerOptions: {},
      },
      {
        modelId: 'eleven_v3',
        url: 'https://api.elevenlabs.io/v1/text-to-dialogue',
        outputFormat: 'wav_22050',
        providerOptions: {
          inputs: [{ text: 'Knock knock', voiceId: 'voice-a' }],
        },
      },
    ] as const)(
      'should pass $outputFormat through to $modelId',
      async ({ modelId, url, outputFormat, providerOptions }) => {
        prepareGenerationResponse(url);

        const result = await provider.speech(modelId).doGenerate({
          text: 'Hello',
          outputFormat,
          providerOptions: { elevenlabs: providerOptions },
        });

        expect(server.calls[0].requestUrl).toBe(
          `${url}?output_format=${outputFormat}`,
        );
        expect(result.providerMetadata?.elevenlabs.outputFormat).toBe(
          outputFormat,
        );
      },
    );
  });

  describe('dialogue', () => {
    const dialogueModel = provider.speech('eleven_v3');
    const inputs = [
      { text: 'Knock knock', voiceId: 'voice-a' },
      { text: 'Who is there?', voiceId: 'voice-b' },
    ];

    it('should generate dialogue from inputs', async () => {
      const audio = prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/text-to-dialogue',
      );

      const result = await dialogueModel.doGenerate({
        text: 'Knock knock',
        language: 'en',
        outputFormat: 'mp3_22050_32',
        providerOptions: {
          elevenlabs: {
            inputs,
            voiceSettings: { stability: 0.4, similarityBoost: 0.8 },
            nextText: 'Lettuce.',
            seed: 3,
          },
        },
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_22050_32',
      );
      expect(await server.calls[0].requestBodyJson).toEqual({
        inputs: [
          { text: 'Knock knock', voice_id: 'voice-a' },
          { text: 'Who is there?', voice_id: 'voice-b' },
        ],
        model_id: 'eleven_v3',
        language_code: 'en',
        settings: { stability: 0.4, similarity: 0.8 },
        future_text: 'Lettuce.',
        seed: 3,
      });
      expect(result.audio).toEqual(audio);
      expect(result.warnings).toEqual([
        {
          type: 'other',
          message:
            'ElevenLabs dialogue uses providerOptions.elevenlabs.inputs; the text prompt was ignored.',
        },
      ]);
      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'mp3_22050_32' },
      });
    });

    it('should not warn about an empty text prompt', async () => {
      prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/text-to-dialogue',
      );

      const result = await dialogueModel.doGenerate({
        text: '',
        providerOptions: { elevenlabs: { inputs } },
      });

      expect(result.warnings).toEqual([]);
    });

    it('should not warn about an empty text prompt beside a composition plan', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');

      const result = await provider.speech('music_v2_5').doGenerate({
        text: '',
        providerOptions: { elevenlabs: { compositionPlan: { chunks: [] } } },
      });

      expect(result.warnings).toEqual([]);
      expect(await server.calls[0].requestBodyJson).toEqual({
        composition_plan: { chunks: [] },
        model_id: 'music_v2_5',
      });
    });

    it('should warn about and ignore options dialogue does not take', async () => {
      prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/text-to-dialogue',
      );

      const result = await dialogueModel.doGenerate({
        text: 'x',
        voice: 'voice-a',
        speed: 1.1,
        providerOptions: {
          elevenlabs: {
            inputs,
            voiceSettings: { style: 0.2 },
            durationSeconds: 2,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'settings',
      );
      expect(
        result.warnings.map(warning => 'feature' in warning && warning.feature),
      ).toEqual([
        'providerOptions.elevenlabs.durationSeconds',
        false,
        'speed',
        'voice',
        'providerOptions.elevenlabs.voiceSettings.style',
      ]);
    });

    it('should require a dialogue model', async () => {
      await expect(
        model.doGenerate({
          text: 'x',
          providerOptions: { elevenlabs: { inputs } },
        }),
      ).rejects.toThrow(
        'ElevenLabs dialogue requires an eleven_v3 or eleven_v4 model; eleven_multilingual_v2 is not one.',
      );
      expect(server.calls).toHaveLength(0);
    });

    it('should warn when inputs are sent to a music model', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');

      const result = await provider.speech('music_v2').doGenerate({
        text: 'Lo-fi beat',
        providerOptions: { elevenlabs: { inputs } },
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          feature: 'providerOptions.elevenlabs.inputs',
        }),
      );
    });
  });

  describe('music models', () => {
    const musicModel = provider.speech('music_v2_5');

    it('should compose music from the text prompt', async () => {
      const audio = prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/music',
      );

      const result = await musicModel.doGenerate({
        text: 'An upbeat synthwave intro',
        outputFormat: 'mp3_22050_32',
        providerOptions: {
          elevenlabs: {
            musicLengthMs: 10000,
            forceInstrumental: true,
            enableLogging: false,
          },
        },
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/music?output_format=mp3_22050_32&enable_logging=false',
      );
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt: 'An upbeat synthwave intro',
        model_id: 'music_v2_5',
        music_length_ms: 10000,
        force_instrumental: true,
      });
      expect(result.audio).toEqual(audio);
      expect(result.warnings).toEqual([]);
      expect(result.providerMetadata).toEqual({
        elevenlabs: {
          outputFormat: 'mp3_22050_32',
          requestedDurationMs: 10000,
        },
      });
    });

    it('should default the output format and leave the length to the model', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');

      const result = await musicModel.doGenerate({ text: 'Lo-fi beat' });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
      );
      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt: 'Lo-fi beat',
        model_id: 'music_v2_5',
      });
      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'mp3_44100_128' },
      });
    });

    it('should warn about and ignore speech-only and sound effects options', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');

      const result = await musicModel.doGenerate({
        text: 'Lo-fi beat',
        voice: 'test-voice-id',
        speed: 1.2,
        language: 'en',
        instructions: 'Make it calm',
        providerOptions: {
          elevenlabs: {
            voiceSettings: { stability: 0.5 },
            durationSeconds: 2,
            loop: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        prompt: 'Lo-fi beat',
        model_id: 'music_v2_5',
      });
      expect(
        result.warnings.map(warning => 'feature' in warning && warning.feature),
      ).toEqual([
        'instructions',
        'language',
        'speed',
        'voice',
        'providerOptions.elevenlabs.voiceSettings',
        'providerOptions.elevenlabs.durationSeconds',
        'providerOptions.elevenlabs.loop',
      ]);
    });

    it('should send a composition plan in place of the prompt', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');
      const compositionPlan = {
        chunks: [
          { text: '[Intro]', duration_ms: 4000, positive_styles: ['ambient'] },
          { song_id: 'song-1', range: { start_ms: 1000, end_ms: 3500 } },
        ],
      };

      const result = await musicModel.doGenerate({
        text: 'ignored',
        providerOptions: { elevenlabs: { compositionPlan, seed: 7 } },
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        composition_plan: compositionPlan,
        model_id: 'music_v2_5',
        seed: 7,
      });
      expect(result.warnings).toEqual([
        {
          type: 'other',
          message:
            'ElevenLabs music uses providerOptions.elevenlabs.compositionPlan; the text prompt was ignored.',
        },
      ]);
      expect(result.providerMetadata).toEqual({
        elevenlabs: {
          outputFormat: 'mp3_44100_128',
          requestedDurationMs: 6500,
        },
      });
    });

    it('should sum music_v1 composition plan sections', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');
      const section = {
        section_name: 'Verse',
        positive_local_styles: ['driving'],
        negative_local_styles: [],
        lines: ['Hello'],
      };
      const compositionPlan = {
        positive_global_styles: ['rock'],
        negative_global_styles: [],
        sections: [
          { ...section, duration_ms: 3000 },
          { ...section, duration_ms: 5000 },
        ],
      };

      const result = await provider.speech('music_v1').doGenerate({
        text: 'ignored',
        providerOptions: { elevenlabs: { compositionPlan } },
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        composition_plan: compositionPlan,
        model_id: 'music_v1',
      });
      expect(result.providerMetadata?.elevenlabs.requestedDurationMs).toBe(
        8000,
      );
    });

    it('should omit the requested duration for an empty plan', async () => {
      prepareGenerationResponse('https://api.elevenlabs.io/v1/music');

      const result = await musicModel.doGenerate({
        text: 'ignored',
        providerOptions: { elevenlabs: { compositionPlan: { chunks: [] } } },
      });

      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'mp3_44100_128' },
      });
    });

    it('should reject a plan chunk without a length', async () => {
      await expect(
        musicModel.doGenerate({
          text: 'ignored',
          providerOptions: {
            elevenlabs: {
              compositionPlan: { chunks: [{ text: '[Intro]' }] },
            },
          },
        }),
      ).rejects.toThrow();
      expect(server.calls).toHaveLength(0);
    });

    it.each([
      { option: 'musicLengthMs', value: 5000 },
      { option: 'forceInstrumental', value: false },
    ])(
      'should reject $option: $value combined with a composition plan',
      async ({ option, value }) => {
        await expect(
          musicModel.doGenerate({
            text: 'ignored',
            providerOptions: {
              elevenlabs: { compositionPlan: { chunks: [] }, [option]: value },
            },
          }),
        ).rejects.toThrow(
          `ElevenLabs music ${option} cannot be combined with compositionPlan.`,
        );
        expect(server.calls).toHaveLength(0);
      },
    );

    it('should reject an out-of-range music length', async () => {
      await expect(
        musicModel.doGenerate({
          text: 'Lo-fi beat',
          providerOptions: { elevenlabs: { musicLengthMs: 1000 } },
        }),
      ).rejects.toThrow();
      expect(server.calls).toHaveLength(0);
    });
  });

  it.each(['music_v2_5', 'eleven_text_to_sound_v2'])(
    'should reject streaming with %s and cancel the text stream',
    async modelId => {
      const cancel = vi.fn();
      const text = new ReadableStream({ cancel });

      await expect(
        (provider.speech(modelId) as ElevenLabsSpeechModel).doStream({ text }),
      ).rejects.toThrow(
        `ElevenLabs ${modelId} does not support streaming; use generateSpeech instead.`,
      );
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  describe('sound effects models', () => {
    const soundEffectsModel = provider.speech('eleven_text_to_sound_v2');

    it('should generate a sound effect from the text', async () => {
      const audio = prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/sound-generation',
      );

      const result = await soundEffectsModel.doGenerate({
        text: 'Glass shattering',
        outputFormat: 'pcm_24000',
        providerOptions: {
          elevenlabs: { durationSeconds: 2, promptInfluence: 0.6, loop: true },
        },
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000',
      );
      expect(await server.calls[0].requestBodyJson).toEqual({
        text: 'Glass shattering',
        model_id: 'eleven_text_to_sound_v2',
        duration_seconds: 2,
        prompt_influence: 0.6,
        loop: true,
      });
      expect(result.audio).toEqual(audio);
      expect(result.warnings).toEqual([]);
      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'pcm_24000', requestedDurationMs: 2000 },
      });
    });

    it('should leave the duration to the model when omitted', async () => {
      prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/sound-generation',
      );

      const result = await soundEffectsModel.doGenerate({ text: 'Door creak' });

      expect(await server.calls[0].requestBodyJson).toEqual({
        text: 'Door creak',
        model_id: 'eleven_text_to_sound_v2',
      });
      expect(result.providerMetadata).toEqual({
        elevenlabs: { outputFormat: 'mp3_44100_128' },
      });
    });

    it('should warn about and ignore music and speech-only options', async () => {
      prepareGenerationResponse(
        'https://api.elevenlabs.io/v1/sound-generation',
      );

      const result = await soundEffectsModel.doGenerate({
        text: 'Door creak',
        providerOptions: {
          elevenlabs: {
            musicLengthMs: 5000,
            seed: 1,
            previousText: 'x',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toEqual({
        text: 'Door creak',
        model_id: 'eleven_text_to_sound_v2',
      });
      expect(
        result.warnings.map(warning => 'feature' in warning && warning.feature),
      ).toEqual([
        'providerOptions.elevenlabs.previousText',
        'providerOptions.elevenlabs.musicLengthMs',
        'providerOptions.elevenlabs.seed',
      ]);
    });
  });
});
