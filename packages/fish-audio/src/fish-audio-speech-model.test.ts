import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createFishAudio } from './fish-audio-provider';
import { FishAudioSpeechModel } from './fish-audio-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createFishAudio({ apiKey: 'test-api-key' });
const model = provider.speech('s1');

const server = createTestServer({
  'https://api.fish.audio/v1/tts': {},
});

describe('FishAudioSpeechModel', () => {
  function prepareAudioResponse({
    headers,
    format = 'mp3',
  }: {
    headers?: Record<string, string>;
    format?: string;
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls['https://api.fish.audio/v1/tts'].response = {
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
    it('should generate speech with required parameters', async () => {
      prepareAudioResponse();

      await model.doGenerate({ text: 'Hello, world!' });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello, world!',
        format: 'mp3',
      });
    });

    it('should send the model id as the `model` header', async () => {
      prepareAudioResponse();

      await provider.speech('s2.1-pro').doGenerate({ text: 'Hello, world!' });

      expect(server.calls[0].requestHeaders.model).toBe('s2.1-pro');
    });

    it('should pass the api key as a bearer token', async () => {
      prepareAudioResponse();

      await model.doGenerate({ text: 'Hello, world!' });

      expect(server.calls[0].requestHeaders.authorization).toBe(
        'Bearer test-api-key',
      );
    });

    it('should map voice to reference_id', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'test-reference-id',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        reference_id: 'test-reference-id',
      });
    });

    it('should let providerOptions.referenceId override voice', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: 'ignored-voice',
        providerOptions: {
          fishAudio: { referenceId: ['speaker-a', 'speaker-b'] },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        reference_id: ['speaker-a', 'speaker-b'],
      });
    });

    it('should map supported output formats', async () => {
      for (const format of ['wav', 'pcm', 'mp3', 'opus']) {
        prepareAudioResponse();

        const result = await model.doGenerate({
          text: 'Hello, world!',
          outputFormat: format,
        });

        expect(await server.calls.at(-1)?.requestBodyJson).toMatchObject({
          format,
        });
        expect(result.warnings).toStrictEqual([]);
      }
    });

    it('should warn and fall back to mp3 for an unsupported output format', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'flac',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        format: 'mp3',
      });
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'outputFormat',
          details:
            'Fish Audio does not support the output format "flac". Falling back to mp3. Supported formats are wav, pcm, mp3, opus.',
        },
      ]);
    });

    it('should map speed to prosody.speed', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        speed: 1.5,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        prosody: { speed: 1.5 },
      });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn for an out-of-range speed', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        speed: 3,
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'prosody',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'speed',
          details:
            'Fish Audio speed must be between 0.5 and 2. The speed option was ignored.',
        },
      ]);
    });

    it('should merge volume and normalizeLoudness into prosody', async () => {
      prepareAudioResponse();

      const s2 = provider.speech('s2-pro');
      const result = await s2.doGenerate({
        text: 'Hello, world!',
        speed: 1.2,
        providerOptions: {
          fishAudio: { volume: -3, normalizeLoudness: false },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        prosody: { speed: 1.2, volume: -3, normalize_loudness: false },
      });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should send normalizeLoudness for the s2.1-pro model', async () => {
      prepareAudioResponse();

      const result = await provider.speech('s2.1-pro').doGenerate({
        text: 'Hello, world!',
        providerOptions: { fishAudio: { normalizeLoudness: true } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        prosody: { normalize_loudness: true },
      });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn and drop normalizeLoudness on s1, which ignores it', async () => {
      prepareAudioResponse();

      const result = await provider.speech('s1').doGenerate({
        text: 'Hello, world!',
        providerOptions: { fishAudio: { normalizeLoudness: true } },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'prosody',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'providerOptions.fishAudio.normalizeLoudness',
          details:
            'Fish Audio ignores normalizeLoudness on s1. It is supported by the S2 family (s2-pro, s2.1-pro).',
        },
      ]);
    });

    it('should warn for language and instructions', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        language: 'en',
        instructions: 'Speak slowly',
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'language',
          details:
            'Fish Audio infers the language from the input text and the selected voice, and has no language parameter. The language option was ignored.',
        },
        {
          type: 'unsupported',
          feature: 'instructions',
          details:
            'Fish Audio does not support instructions. The instructions option was ignored.',
        },
      ]);
    });

    it('should pass through provider options', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: {
          fishAudio: {
            sampleRate: 44_100,
            mp3Bitrate: 192,
            latency: 'balanced',
            temperature: 0.5,
            topP: 0.9,
            chunkLength: 200,
            minChunkLength: 20,
            normalize: false,
            maxNewTokens: 2048,
            repetitionPenalty: 1.5,
            conditionOnPreviousChunks: false,
            earlyStopThreshold: 0.8,
            features: ['quality-guard'],
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello, world!',
        format: 'mp3',
        sample_rate: 44_100,
        mp3_bitrate: 192,
        latency: 'balanced',
        temperature: 0.5,
        top_p: 0.9,
        chunk_length: 200,
        min_chunk_length: 20,
        normalize: false,
        max_new_tokens: 2048,
        repetition_penalty: 1.5,
        condition_on_previous_chunks: false,
        early_stop_threshold: 0.8,
        features: ['quality-guard'],
      });
    });

    it('should warn when mp3Bitrate is used with a non-mp3 format', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'opus',
        providerOptions: { fishAudio: { mp3Bitrate: 192 } },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'mp3_bitrate',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'providerOptions.fishAudio.mp3Bitrate',
          details:
            'mp3Bitrate only applies to mp3 output. The option was ignored for opus output.',
        },
      ]);
    });

    it('should warn when opusBitrate is used with a non-opus format', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: { fishAudio: { opusBitrate: 48_000 } },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'opus_bitrate',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'providerOptions.fishAudio.opusBitrate',
          details:
            'opusBitrate only applies to opus output. The option was ignored for mp3 output.',
        },
      ]);
    });

    it('should send opus_bitrate for opus output', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'opus',
        providerOptions: { fishAudio: { opusBitrate: -1000 } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        format: 'opus',
        opus_bitrate: -1000,
      });
      expect(result.warnings).toStrictEqual([]);
    });

    it('should return the audio and response metadata', async () => {
      const audio = prepareAudioResponse({
        headers: { 'x-request-id': 'test-request-id' },
      });
      const testDate = new Date(2024, 0, 1);

      const customModel = new FishAudioSpeechModel('s1', {
        provider: 'fish-audio.speech',
        url: ({ path }) => `https://api.fish.audio${path}`,
        headers: () => ({ Authorization: 'Bearer test-api-key' }),
        _internal: { currentDate: () => testDate },
      });

      const result = await customModel.doGenerate({ text: 'Hello, world!' });

      expect(result.audio).toStrictEqual(audio);
      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('s1');
      expect(result.response.headers).toMatchObject({
        'x-request-id': 'test-request-id',
      });
      expect(result.request?.body).toBe(
        JSON.stringify({ text: 'Hello, world!', format: 'mp3' }),
      );
    });

    it('should include a user agent suffix', async () => {
      prepareAudioResponse();

      await model.doGenerate({ text: 'Hello, world!' });

      expect(server.calls[0].requestUserAgent).toContain(
        'ai-sdk/fish-audio/0.0.0-test',
      );
    });

    it('should surface API errors', async () => {
      server.urls['https://api.fish.audio/v1/tts'].response = {
        type: 'error',
        status: 402,
        body: JSON.stringify({
          status: 402,
          message: 'No payment -- see charging schemes',
        }),
      };

      await expect(model.doGenerate({ text: 'Hello, world!' })).rejects.toThrow(
        'No payment -- see charging schemes',
      );
    });
  });
});
