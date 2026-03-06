import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createCambai } from './cambai-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createCambai({ apiKey: 'test-api-key' });
const model = provider.speech('mars-pro');

const server = createTestServer({
  'https://client.camb.ai/apis/tts-stream': {},
});

describe('CambaiSpeechModel', () => {
  function prepareAudioResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls['https://client.camb.ai/apis/tts-stream'].response = {
      type: 'binary',
      headers: {
        'content-type': 'audio/wav',
        ...headers,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  describe('doGenerate', () => {
    it('should generate speech with required parameters', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: '147320',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        voice_id: 147320,
        language: 'en-us',
        speech_model: 'mars-pro',
      });
    });

    it('should use default voice when not specified', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello!',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        voice_id: 147320,
      });
    });

    it('should handle language parameter', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hola, mundo!',
        voice: '147320',
        language: 'es-mx',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hola, mundo!',
        language: 'es-mx',
      });
    });

    it('should handle outputFormat parameter', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello!',
        voice: '147320',
        outputFormat: 'wav',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        output_configuration: {
          format: 'wav',
        },
      });
    });

    it('should warn about unsupported speed parameter', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello!',
        voice: '147320',
        speed: 1.5,
      });

      expect(result.warnings).toEqual([
        {
          type: 'unsupported',
          feature: 'speed',
          details:
            'Camb.ai speech models do not support the speed parameter. Use inferenceOptions via providerOptions instead.',
        },
      ]);
    });

    it('should pass instructions for mars-instruct model', async () => {
      prepareAudioResponse();
      const instructModel = provider.speech('mars-instruct');

      await instructModel.doGenerate({
        text: 'Hello!',
        voice: '147320',
        instructions: 'Speak in a cheerful tone',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        user_instructions: 'Speak in a cheerful tone',
        speech_model: 'mars-instruct',
      });
    });

    it('should warn about instructions for non-instruct models', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello!',
        voice: '147320',
        instructions: 'Speak in a cheerful tone',
      });

      expect(result.warnings).toEqual([
        expect.objectContaining({
          type: 'unsupported',
          feature: 'instructions',
        }),
      ]);
    });

    it('should pass provider-specific options', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello!',
        voice: '147320',
        providerOptions: {
          cambai: {
            inferenceOptions: {
              stability: 0.7,
              temperature: 1.2,
            },
            voiceSettings: {
              maintainSourceAccent: true,
            },
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        inference_options: {
          stability: 0.7,
          temperature: 1.2,
        },
        voice_settings: {
          maintain_source_accent: true,
        },
      });
    });

    it('should throw on invalid voice ID', async () => {
      prepareAudioResponse();

      await expect(
        model.doGenerate({
          text: 'Hello!',
          voice: 'invalid-voice',
        }),
      ).rejects.toThrow('Invalid voice ID');
    });

    it('should include user-agent header', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello!',
        voice: '147320',
      });

      expect(server.calls[0].requestUserAgent).toContain(
        'ai-sdk/cambai/0.0.0-test',
      );
    });
  });
});
