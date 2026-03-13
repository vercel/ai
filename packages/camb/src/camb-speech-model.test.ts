import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createCamb } from './camb-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createCamb({ apiKey: 'test-api-key' });
const model = provider.speech('mars-pro');

const server = createTestServer({
  'https://client.camb.ai/apis/tts-stream': {},
});

describe('CambSpeechModel', () => {
  function prepareAudioResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls['https://client.camb.ai/apis/tts-stream'].response = {
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
    it('should generate speech with required parameters', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: '1',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        voice_id: 1,
        speech_model: 'mars-pro',
      });
    });

    it('should handle speed parameter', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: '1',
        speed: 1.5,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        voice_id: 1,
        speech_model: 'mars-pro',
        speed: 1.5,
      });
    });

    it('should warn about unsupported instructions parameter', async () => {
      prepareAudioResponse();

      const result = await model.doGenerate({
        text: 'Hello, world!',
        voice: '1',
        instructions: 'Speak slowly',
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "CAMB AI speech models do not support instructions. Instructions parameter was ignored.",
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
        voice: '1',
        providerOptions: {
          camb: {
            language: 'en-us',
            gender: 'female',
            age: 30,
            accent: 'british',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        text: 'Hello, world!',
        voice_id: 1,
        speech_model: 'mars-pro',
        language: 'en-us',
        gender: 'female',
        age: 30,
        accent: 'british',
      });
    });

    it('should include user-agent header', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: '1',
      });

      expect(server.calls[0].requestUserAgent).toContain(
        'ai-sdk/camb/0.0.0-test',
      );
    });

    it('should include x-api-key header', async () => {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello, world!',
        voice: '1',
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'x-api-key': 'test-api-key',
      });
    });
  });
});
