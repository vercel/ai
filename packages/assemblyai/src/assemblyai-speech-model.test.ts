import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createAssemblyAI } from './assemblyai-provider';
import { AssemblyAISpeechModel } from './assemblyai-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createAssemblyAI({ apiKey: 'test-api-key' });
const model = provider.speech('assemblyai-tts-1');

const server = createTestServer({
  'https://tts.us.assemblyai.com/v1/speech': {},
});

describe('AssemblyAISpeechModel', () => {
  function prepareAudioResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls['https://tts.us.assemblyai.com/v1/speech'].response = {
      type: 'binary',
      headers: {
        'content-type': 'audio/mpeg',
        ...headers,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  describe('doGenerate', () => {
    it('should send a buffered mp3 request by default', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({ text: 'Hello, world!' });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello, world!',
        model_id: 'assemblyai-tts-1',
        encoding: 'mp3',
        stream: false,
      });
      expect(result.warnings).toEqual([]);
    });

    it('should pass the API key, custom headers, and user agent', async () => {
      prepareAudioResponse();

      await createAssemblyAI({
        apiKey: 'test-api-key',
        headers: { 'Custom-Provider-Header': 'provider-header-value' },
      })
        .speech('assemblyai-tts-1')
        .doGenerate({
          text: 'Hello, world!',
          headers: { 'Custom-Request-Header': 'request-header-value' },
        });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'test-api-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        'ai-sdk/assemblyai/0.0.0-test',
      );
    });

    it('should send the voice and translate the language code', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hola, mundo!',
        voice: 'aai-kyla',
        language: 'es',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        voice_id: 'aai-kyla',
        language: 'spanish',
      });
    });

    it('should accept a full language name', async () => {
      prepareAudioResponse();

      await model.doGenerate({ text: 'Bonjour', language: 'French' });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        language: 'french',
      });
    });

    it.each([
      ['wav', { encoding: 'pcm_s16le', container: 'wav' }],
      ['pcm', { encoding: 'pcm_s16le', container: 'raw' }],
      ['mulaw', { encoding: 'pcm_mulaw', container: 'raw', sample_rate: 8000 }],
      ['alaw', { encoding: 'pcm_alaw', container: 'raw', sample_rate: 8000 }],
    ])('should map the %s output format', async (outputFormat, expected) => {
      prepareAudioResponse();

      await model.doGenerate({ text: 'Hello, world!', outputFormat });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello, world!',
        model_id: 'assemblyai-tts-1',
        stream: false,
        ...expected,
      });
    });

    it('should fall back to mp3 for an unknown output format', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'opus',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        encoding: 'mp3',
      });
      expect(result.warnings).toEqual([
        {
          type: 'unsupported',
          feature: 'outputFormat',
          details:
            'Unknown output format "opus". Falling back to mp3. Use providerOptions.assemblyai to configure encoding, container, and sampleRate directly.',
        },
      ]);
    });

    it('should apply provider options over the output format', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'mulaw',
        providerOptions: {
          assemblyai: { encoding: 'pcm_s16le', sampleRate: 16000 },
        },
      });

      // The mulaw container and 8 kHz rate do not carry over to pcm_s16le.
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello, world!',
        model_id: 'assemblyai-tts-1',
        encoding: 'pcm_s16le',
        sample_rate: 16000,
        stream: false,
      });
    });

    it('should send the bit rate for mp3 output', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: { assemblyai: { bitRate: 128000 } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        encoding: 'mp3',
        bit_rate: 128000,
      });
    });

    it('should ignore options that do not fit the encoding', async () => {
      prepareAudioResponse();

      const mp3Result = await model.doGenerate({
        text: 'Hello, world!',
        providerOptions: { assemblyai: { container: 'wav' } },
      });
      const wavResult = await model.doGenerate({
        text: 'Hello, world!',
        outputFormat: 'wav',
        providerOptions: { assemblyai: { bitRate: 64000 } },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'container',
      );
      expect(await server.calls[1].requestBodyJson).not.toHaveProperty(
        'bit_rate',
      );
      expect([...mp3Result.warnings, ...wavResult.warnings]).toEqual([
        {
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.container',
          details:
            'AssemblyAI MP3 output has no container. The container option was ignored.',
        },
        {
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.bitRate',
          details:
            'AssemblyAI only accepts a bit rate for MP3 output. The bitRate option was ignored.',
        },
      ]);
    });

    it('should warn on unsupported language, speed, and instructions', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        language: 'ja',
        speed: 1.2,
        instructions: 'Speak slowly',
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).not.toHaveProperty('language');
      expect(body).not.toHaveProperty('speed');
      expect(result.warnings.map(warning => warning.type)).toEqual([
        'unsupported',
        'unsupported',
        'unsupported',
      ]);
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'language',
        details:
          'AssemblyAI text-to-speech does not support language "ja" (supported: de, en, es, fr, it, pt). The language option was ignored.',
      });
    });

    it('should omit automatic language detection with a warning', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        language: 'auto',
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'language',
      );
      expect(result.warnings).toEqual([
        {
          type: 'unsupported',
          feature: 'language',
          details:
            'AssemblyAI text-to-speech does not detect the language. The voice speaks its own language.',
        },
      ]);
    });

    it('should not warn for the default speed', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        speed: 1,
      });

      expect(result.warnings).toEqual([]);
    });

    it('should return the audio and response metadata', async () => {
      const audio = prepareAudioResponse({
        headers: {
          'x-request-id': 'test-request-id',
          'x-tts-model': 'assemblyai-tts-1',
          'x-tts-voice-id': 'aai-kyla',
          'x-tts-language': 'english',
          'x-tts-encoding': 'mp3',
          'x-tts-sample-rate': '24000',
          'x-tts-audio-duration-ms': '3200',
          'x-tts-billed-characters': '13',
        },
      });

      const testDate = new Date(0);
      const customModel = new AssemblyAISpeechModel('assemblyai-tts-1', {
        provider: 'test-provider',
        url: () => 'https://tts.us.assemblyai.com/v1/speech',
        headers: () => ({}),
        _internal: { currentDate: () => testDate },
      });

      const result = await customModel.doGenerate({ text: 'Hello, world!' });

      expect(result.audio).toStrictEqual(audio);
      expect(result.providerMetadata).toStrictEqual({
        assemblyai: {
          requestId: 'test-request-id',
          model: 'assemblyai-tts-1',
          voiceId: 'aai-kyla',
          language: 'english',
          encoding: 'mp3',
          sampleRate: 24000,
          audioDurationMs: 3200,
          billedCharacters: 13,
        },
      });
      expect(result.response).toMatchObject({
        timestamp: testDate,
        modelId: 'assemblyai-tts-1',
      });
    });

    it('should surface API errors', async () => {
      server.urls['https://tts.us.assemblyai.com/v1/speech'].response = {
        type: 'error',
        status: 422,
        body: JSON.stringify({
          code: 'voice_not_found',
          message: 'voice_id: no voice with this ID or slug',
          param: 'voice_id',
          request_id: 'test-request-id',
          errors: null,
          retryable: false,
          retry_after_seconds: null,
          error: 'voice_id: no voice with this ID or slug',
        }),
      };

      const error = await model
        .doGenerate({ text: 'Hello, world!', voice: 'missing' })
        .then(
          () => {
            throw new Error('expected doGenerate to reject');
          },
          e => e,
        );

      expect(APICallError.isInstance(error)).toBe(true);
      expect((error as APICallError).message).toBe(
        'voice_id: no voice with this ID or slug',
      );
      expect((error as APICallError).statusCode).toBe(422);
    });
  });
});
