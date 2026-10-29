import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.speech('eleven_multilingual_v2');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/text-to-speech/*': {},
  'https://api.elevenlabs.io/v1/text-to-dialogue': {},
  'https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps': {},
});

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

    it.each([undefined, false])(
      'preserves binary audio when withTimestamps is %s',
      async withTimestamps => {
        const audio = prepareAudioResponse();
        const result = await model.doGenerate({
          text: 'Hi',
          providerOptions: { elevenlabs: { withTimestamps } },
        });

        expect(result.audio).toStrictEqual(audio);
        expect(result.providerMetadata).toBeUndefined();
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
        elevenlabs: {},
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
                voice_segments: [
                  {
                    voice_id: 'test-voice',
                    start_time_seconds: 0,
                    end_time_seconds: 0.4,
                    character_start_index: 0,
                    character_end_index: 2,
                    dialogue_input_index: 0,
                  },
                ],
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
        expect(
          result.providerMetadata?.elevenlabs?.voiceSegments,
        ).toStrictEqual(
          withTimestamps
            ? [
                {
                  voiceId: 'test-voice',
                  startTimeSeconds: 0,
                  endTimeSeconds: 0.4,
                  characterStartIndex: 0,
                  characterEndIndex: 2,
                  dialogueInputIndex: 0,
                },
              ]
            : undefined,
        );
      },
    );

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
        `ai-sdk/elevenlabs/0.0.0-test`,
      );
    });
  });
});
