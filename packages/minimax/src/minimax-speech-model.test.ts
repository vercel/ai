import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { MiniMaxSpeechModel } from './minimax-speech-model';

const modelId = 'speech-2.8-hd';
const baseURL = 'https://api.example.com';
const url = `${baseURL}/v1/t2a_v2`;

function createModel(currentDate?: () => Date) {
  return new MiniMaxSpeechModel(modelId, {
    provider: 'minimax.speech',
    baseURL,
    headers: () => ({ Authorization: 'Bearer test-api-key' }),
    _internal: { currentDate },
  });
}

const server = createTestServer({
  [url]: {},
});

function prepareResponse({
  audio = '494433',
  headers,
}: {
  audio?: string | null;
  headers?: Record<string, string>;
} = {}) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body: {
      data: { audio, status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    },
  };
}

describe('MiniMaxSpeechModel', () => {
  it('should expose correct provider and model information', () => {
    const model = createModel();

    expect(model.provider).toBe('minimax.speech');
    expect(model.modelId).toBe(modelId);
    expect(model.specificationVersion).toBe('v4');
  });

  it('should send a non-streaming request and request hex audio', async () => {
    prepareResponse();

    await createModel().doGenerate({
      text: 'Hello from the AI SDK!',
    });

    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: modelId,
      text: 'Hello from the AI SDK!',
      stream: false,
      output_format: 'hex',
      audio_setting: { format: 'mp3' },
    });
  });

  it('should map standard voice, speed, and audio format options', async () => {
    prepareResponse();

    await createModel().doGenerate({
      text: 'Hello!',
      voice: 'English_expressive_narrator',
      speed: 1.2,
      outputFormat: 'wav',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      voice_setting: {
        voice_id: 'English_expressive_narrator',
        speed: 1.2,
      },
      audio_setting: { format: 'wav' },
    });
  });

  it('should ignore voice settings when no voice is provided', async () => {
    prepareResponse();

    const result = await createModel().doGenerate({
      text: 'Hello!',
      speed: 1.2,
    });

    expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
      'voice_setting',
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'voice',
      }),
    );
  });

  it.each(['mp3', 'wav', 'flac', 'pcm'])(
    'should accept %s audio',
    async format => {
      prepareResponse();

      await createModel().doGenerate({ text: 'Hello!', outputFormat: format });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        audio_setting: { format },
      });
    },
  );

  it('should map provider-specific request fields', async () => {
    prepareResponse();

    await createModel().doGenerate({
      text: 'Hello!',
      voice: 'voice-id',
      providerOptions: {
        minimax: {
          voiceSetting: { volume: 1.5, pitch: 2, emotion: 'happy' },
          audioSetting: { sampleRate: 32000, bitrate: 128000, channel: 1 },
          pronunciationDictionary: { tone: ['AI/ay eye'] },
          languageBoost: 'English',
          voiceModify: {
            pitch: 5,
            intensity: -2,
            timbre: 3,
            soundEffect: 'spacious_echo',
          },
          subtitleEnable: true,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      voice_setting: {
        voice_id: 'voice-id',
        vol: 1.5,
        pitch: 2,
        emotion: 'happy',
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
      pronunciation_dict: { tone: ['AI/ay eye'] },
      language_boost: 'English',
      voice_modify: {
        pitch: 5,
        intensity: -2,
        timbre: 3,
        sound_effects: 'spacious_echo',
      },
      subtitle_enable: true,
    });
  });

  it('should warn and use mp3 for an unsupported output format', async () => {
    prepareResponse();

    const result = await createModel().doGenerate({
      text: 'Hello!',
      outputFormat: 'aac',
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      audio_setting: { format: 'mp3' },
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'outputFormat',
      }),
    );
  });

  it('should decode the hex response into audio bytes', async () => {
    prepareResponse({ audio: '494433' });

    const result = await createModel().doGenerate({ text: 'Hello!' });

    expect(result.audio).toStrictEqual(Uint8Array.from([0x49, 0x44, 0x33]));
  });

  it('should include response data with timestamp, model id, and headers', async () => {
    prepareResponse({ headers: { 'x-request-id': 'test-request-id' } });
    const testDate = new Date(0);

    const result = await createModel(() => testDate).doGenerate({
      text: 'Hello!',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId,
      headers: expect.objectContaining({
        'x-request-id': 'test-request-id',
      }),
      body: {
        data: { audio: '494433', status: 2 },
        base_resp: { status_code: 0, status_msg: 'success' },
      },
    });
  });

  it('should reject a successful response without audio', async () => {
    prepareResponse({ audio: null });

    await expect(
      createModel().doGenerate({ text: 'Hello!' }),
    ).rejects.toMatchObject({
      name: 'MINIMAX_SPEECH_RESPONSE_MISSING_AUDIO',
    });
  });
});
