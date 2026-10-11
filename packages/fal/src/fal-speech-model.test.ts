import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createFal } from './fal-provider';
import { FalSpeechModel } from './fal-speech-model';
import { describe, it, expect } from 'vitest';

const provider = createFal({ apiKey: 'test-api-key' });
const model = provider.speech('fal-ai/minimax/speech-02-hd');

const server = createTestServer({
  'https://fal.run/fal-ai/minimax/speech-02-hd': {},
  'https://fal.run/fal-ai/minimax/speech-02-turbo': {},
  'https://fal.run/fal-ai/dia-tts': {},
  'https://fal.media/files/test.mp3': {},
});

describe('FalSpeechModel.doGenerate', () => {
  function prepareResponses({
    jsonHeaders,
    audioHeaders,
    modelId = 'fal-ai/minimax/speech-02-hd',
  }: {
    jsonHeaders?: Record<string, string>;
    audioHeaders?: Record<string, string>;
    modelId?:
      | 'fal-ai/minimax/speech-02-hd'
      | 'fal-ai/minimax/speech-02-turbo'
      | 'fal-ai/dia-tts';
  } = {}) {
    const audioBuffer = new Uint8Array(100);
    server.urls[`https://fal.run/${modelId}`].response = {
      type: 'json-value',
      headers: {
        'content-type': 'application/json',
        ...jsonHeaders,
      },
      body: {
        audio: { url: 'https://fal.media/files/test.mp3' },
        duration_ms: 1234,
      },
    };
    server.urls['https://fal.media/files/test.mp3'].response = {
      type: 'binary',
      headers: {
        'content-type': 'audio/mp3',
        ...audioHeaders,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  it('should pass text and default output_format', async () => {
    prepareResponses();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      text: 'Hello from the AI SDK!',
      output_format: 'url',
    });
  });

  it.each([
    {
      modelId: 'fal-ai/minimax/speech-02-hd',
      options: { voice: 'Friendly_Person' },
      voiceSetting: { voice_id: 'Friendly_Person' },
    },
    {
      modelId: 'fal-ai/minimax/speech-02-hd',
      options: { speed: 1.5 },
      voiceSetting: { speed: 1.5 },
    },
    {
      modelId: 'fal-ai/minimax/speech-02-turbo',
      options: { voice: 'Friendly_Person', speed: 1.5 },
      voiceSetting: { voice_id: 'Friendly_Person', speed: 1.5 },
    },
  ] as const)(
    'should map standard voice and speed to $modelId voice_setting',
    async ({ modelId, options, voiceSetting }) => {
      prepareResponses({ modelId });

      const result = await provider.speech(modelId).doGenerate({
        text: 'Hello',
        ...options,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        text: 'Hello',
        output_format: 'url',
        voice_setting: voiceSetting,
      });
      expect(result.warnings).toStrictEqual([]);
    },
  );

  it('should let MiniMax provider voice settings override standard options', async () => {
    prepareResponses();

    await model.doGenerate({
      text: 'Hello',
      voice: 'Standard_Voice',
      speed: 1.5,
      providerOptions: {
        fal: {
          voice_setting: {
            voice_id: 'Provider_Voice',
            speed: 0.75,
            pitch: 2,
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      text: 'Hello',
      output_format: 'url',
      voice_setting: {
        voice_id: 'Provider_Voice',
        speed: 0.75,
        pitch: 2,
      },
    });
  });

  it('should keep standard voice and speed top-level for other models', async () => {
    prepareResponses({ modelId: 'fal-ai/dia-tts' });

    await provider.speech('fal-ai/dia-tts').doGenerate({
      text: 'Hello',
      voice: 'S1',
      speed: 1.5,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      text: 'Hello',
      output_format: 'url',
      voice: 'S1',
      speed: 1.5,
    });
  });

  it('should pass headers', async () => {
    prepareResponses();

    const provider = createFal({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.speech('fal-ai/minimax/speech-02-hd').doGenerate({
      text: 'Hello from the AI SDK!',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Key test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should return audio data', async () => {
    const audio = prepareResponses();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.audio).toStrictEqual(audio);
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareResponses({ jsonHeaders: { 'x-request-id': 'test-request-id' } });

    const testDate = new Date(0);
    const customModel = new FalSpeechModel('fal-ai/minimax/speech-02-hd', {
      provider: 'fal.speech',
      url: ({ path }) => path,
      headers: () => ({}),
      _internal: { currentDate: () => testDate },
    });

    const result = await customModel.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'fal-ai/minimax/speech-02-hd',
      headers: expect.objectContaining({ 'x-request-id': 'test-request-id' }),
    });
  });

  it('should include warnings for unsupported settings', async () => {
    prepareResponses();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
      language: 'en',
      // invalid outputFormat triggers a warning and defaults to url
      // (we still return audio via URL)
      outputFormat: 'wav',
    });

    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
