import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { createVertex } from './google-vertex-provider';
import { GoogleVertexSpeechModel } from './google-vertex-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const DEFAULT_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const CUSTOM_URL = 'https://custom-endpoint.com/v1/text:synthesize';

const server = createTestServer({
  [DEFAULT_URL]: {},
  [CUSTOM_URL]: {},
});

describe('GoogleVertexSpeechModel', () => {
  const mockConfig = {
    provider: 'google.vertex.speech',
    headers: () => ({}),
    baseURL: 'https://texttospeech.googleapis.com/v1',
  };

  const model = new GoogleVertexSpeechModel('gemini-2.5-flash-tts', mockConfig);

  function prepareAudioResponse({
    headers,
    audioContent = Buffer.from(new Uint8Array(100)).toString('base64'),
  }: {
    headers?: Record<string, string>;
    audioContent?: string;
  } = {}) {
    server.urls[DEFAULT_URL].response = {
      type: 'json-value',
      headers,
      body: {
        audioContent,
      },
    };
    return Buffer.from(audioContent, 'base64');
  }

  it('should pass the model and text', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      input: {
        text: 'Hello from the AI SDK!',
      },
      voice: {
        languageCode: 'en-US',
        modelName: 'gemini-2.5-flash-tts',
        name: 'Achernar',
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
      },
    });
  });

  it('should pass headers correctly', async () => {
    prepareAudioResponse();

    const provider = createVertex({
      project: 'test-project',
      location: 'us-central1',
      headers: {
        'X-Custom-Header': 'custom-value',
      },
    });

    await provider.speech('gemini-2.5-flash-tts').doGenerate({
      text: 'Hello from the AI SDK!',
      headers: {
        'X-Request-Header': 'request-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'x-request-header': 'request-value',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/google-vertex/0.0.0-test`,
    );
  });

  it('should pass voice and language options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      voice: 'Kore',
      language: 'en-US',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      input: {
        text: 'Hello from the AI SDK!',
      },
      voice: {
        languageCode: 'en-US',
        modelName: 'gemini-2.5-flash-tts',
        name: 'Kore',
      },
    });
  });

  it('should pass instructions as prompt', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the AI SDK!',
      instructions: 'Say this in a friendly and amused way',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      input: {
        text: 'Hello from the AI SDK!',
        prompt: 'Say this in a friendly and amused way',
      },
    });
  });

  it('should handle different audio formats', async () => {
    const formats = [
      { input: 'mp3', expected: 'MP3' },
      { input: 'wav', expected: 'LINEAR16' },
      { input: 'pcm', expected: 'LINEAR16' },
      { input: 'ogg', expected: 'OGG_OPUS' },
    ] as const;

    for (const format of formats) {
      prepareAudioResponse();

      await model.doGenerate({
        text: 'Hello from the AI SDK!',
        outputFormat: format.input,
      });

      const requestBody =
        await server.calls[server.calls.length - 1].requestBodyJson;
      expect(requestBody.audioConfig.audioEncoding).toBe(format.expected);
    }
  });

  it('should return audio data decoded from base64', async () => {
    const expectedAudio = prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.audio).toStrictEqual(expectedAudio);
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareAudioResponse({
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    const testDate = new Date(0);
    const customModel = new GoogleVertexSpeechModel('gemini-2.5-pro-tts', {
      ...mockConfig,
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'gemini-2.5-pro-tts',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
      },
    });
  });

  it('should handle multi-speaker voice config', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      providerOptions: {
        google: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speakerAlias: 'Speaker1',
                speakerId: 'Kore',
              },
              {
                speakerAlias: 'Speaker2',
                speakerId: 'Charon',
              },
            ],
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      voice: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speakerAlias: 'Speaker1',
              speakerId: 'Kore',
            },
            {
              speakerAlias: 'Speaker2',
              speakerId: 'Charon',
            },
          ],
        },
      },
    });
  });

  it('should handle multi-speaker markup', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'ignored when multiSpeakerMarkup is provided',
      instructions: 'Say this as a conversation between friends',
      providerOptions: {
        google: {
          multiSpeakerMarkup: {
            turns: [
              {
                speaker: 'Sam',
                text: 'Hi Bob, how are you?',
              },
              {
                speaker: 'Bob',
                text: 'I am doing well, and you?',
              },
            ],
          },
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      input: {
        multiSpeakerMarkup: {
          turns: [
            {
              speaker: 'Sam',
              text: 'Hi Bob, how are you?',
            },
            {
              speaker: 'Bob',
              text: 'I am doing well, and you?',
            },
          ],
        },
        prompt: 'Say this as a conversation between friends',
      },
    });
  });

  it('should add sample rate to audio config', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'mp3',
      providerOptions: {
        google: {
          sampleRateHertz: 48000,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 48000,
      },
    });
  });

  it('should warn for unsupported output formats', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'unsupported-format',
    });

    expect(result.warnings).toContainEqual({
      type: 'unsupported-setting',
      setting: 'outputFormat',
      details: expect.stringContaining('Unsupported output format'),
    });

    // Should still have audioEncoding set to default
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        audioEncoding: 'LINEAR16',
      },
    });
  });

  it('should pass speed parameter to audioConfig', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      speed: 1.5,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        speakingRate: 1.5,
      },
    });
  });

  it('should pass volumeGainDb from provider options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      providerOptions: {
        google: {
          volumeGainDb: -6.0,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        volumeGainDb: -6.0,
      },
    });
  });

  it('should pass speakingRate from provider options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      providerOptions: {
        google: {
          speakingRate: 2.0,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        speakingRate: 2.0,
      },
    });
  });

  it('should pass pitch from provider options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      providerOptions: {
        google: {
          pitch: 10.0,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        pitch: 10.0,
      },
    });
  });

  it('should use audioEncoding from provider options when outputFormat is not specified', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      providerOptions: {
        google: {
          audioEncoding: 'OGG_OPUS',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
      },
    });
  });

  it('should prioritize outputFormat over audioEncoding from provider options', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello!',
      outputFormat: 'mp3',
      providerOptions: {
        google: {
          audioEncoding: 'OGG_OPUS',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audioConfig: {
        audioEncoding: 'MP3',
      },
    });
  });

  it('should use custom baseURL when provided', async () => {
    server.urls[CUSTOM_URL].response = {
      type: 'json-value',
      body: {
        audioContent: Buffer.from(new Uint8Array(100)).toString('base64'),
      },
    };

    const modelWithCustomUrl = new GoogleVertexSpeechModel(
      'gemini-2.5-flash-tts',
      {
        provider: 'google.vertex.speech',
        headers: () => ({}),
        baseURL: 'https://custom-endpoint.com/v1',
      },
    );

    await modelWithCustomUrl.doGenerate({
      text: 'Hello from custom endpoint!',
    });

    expect(server.calls[0].requestUrl).toBe(CUSTOM_URL);
  });

  it('should use custom fetch when provided', async () => {
    const customFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audioContent: Buffer.from(new Uint8Array(100)).toString('base64'),
        }),
      ),
    );

    const modelWithCustomFetch = new GoogleVertexSpeechModel(
      'gemini-2.5-flash-tts',
      {
        provider: 'google.vertex.speech',
        headers: () => ({}),
        baseURL: 'https://custom-endpoint.com/v1',
        fetch: customFetch,
      },
    );

    await modelWithCustomFetch.doGenerate({
      text: 'Hello!',
    });

    expect(customFetch).toHaveBeenCalledWith(CUSTOM_URL, expect.any(Object));
  });
});
