import { describe, expect, it, vi } from 'vitest';
import type { SpeechModelV4 } from '@ai-sdk/provider';
import { createGradium } from './index';

const FAKE_AUDIO = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"

type Captured = { url?: string; init?: RequestInit };

type GenerateSpeechOptions = Parameters<SpeechModelV4['doGenerate']>[0] & {
  model: SpeechModelV4;
};

async function generateSpeech({ model, ...options }: GenerateSpeechOptions) {
  return model.doGenerate(options);
}

function fakeFetch(captured: Captured, response?: Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return (
      response ??
      new Response(FAKE_AUDIO, {
        status: 200,
        headers: { 'content-type': 'audio/wav' },
      })
    );
  }) as unknown as typeof fetch;
}

function bodyOf(captured: Captured): Record<string, unknown> {
  return JSON.parse(captured.init!.body as string);
}

function jsonConfigOf(captured: Captured): Record<string, unknown> {
  return JSON.parse(bodyOf(captured).json_config as string);
}

function b64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('GradiumSpeechModel', () => {
  it('sends a well-formed POST to the unified TTS endpoint', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    const { audio } = await generateSpeech({
      model: gradium.speech('default'),
      text: 'Hello from Gradium.',
      voice: 'YTpq7expH9539ERJ',
    });

    expect(captured.url).toBe('https://api.gradium.ai/api/post/speech/tts');
    expect(
      (captured.init!.headers as Record<string, string>)['x-api-key'],
    ).toBe('test-key');

    expect(bodyOf(captured)).toMatchObject({
      text: 'Hello from Gradium.',
      voice_id: 'YTpq7expH9539ERJ',
      output_format: 'wav',
      only_audio: true,
    });

    expect(audio.slice(0, 4)).toEqual(FAKE_AUDIO);
  });

  it('also exposes speechModel(modelId) per ProviderV4', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    const model = gradium.speechModel!('default');
    expect(model.specificationVersion).toBe('v4');

    await generateSpeech({ model, text: 'via speechModel' });
    expect(bodyOf(captured).text).toBe('via speechModel');
  });

  it('baseURL overrides default and strips trailing slash', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example.com/gradium/',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({ model: gradium.speech(), text: 'proxy' });

    expect(captured.url).toBe(
      'https://proxy.example.com/gradium/post/speech/tts',
    );
  });

  it('merges custom headers with the api-key header', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      headers: { 'x-team': 'voice-platform' },
      fetch: fakeFetch(captured),
    });

    await generateSpeech({ model: gradium.speech(), text: 'headers' });

    const headers = captured.init!.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['x-team']).toBe('voice-platform');
  });

  it('falls back to the default voice when none is supplied', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({ model: gradium.speech(), text: 'no voice' });

    expect(bodyOf(captured).voice_id).toBe('YTpq7expH9539ERJ');
  });

  it('forwards providerOptions.gradium.voiceId and rewriteRules', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'Bonjour le monde.',
      providerOptions: {
        gradium: { voiceId: 'custom-clone-id', rewriteRules: 'fr' },
      },
    });

    const body = bodyOf(captured);
    expect(body.voice_id).toBe('custom-clone-id');
    expect(JSON.parse(body.json_config as string)).toEqual({
      rewrite_rules: 'fr',
    });
  });

  it('maps top-level speed into json_config.padding_bonus', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'speedy',
      speed: 1.25,
    });

    const body = bodyOf(captured);
    expect(typeof body.json_config).toBe('string');
    expect(JSON.parse(body.json_config as string)).toEqual({
      padding_bonus: -0.25,
    });
  });

  it('maps cfgCoef into json_config.cfg_coef', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'coefficient',
      providerOptions: { gradium: { cfgCoef: 2.4 } },
    });

    expect(jsonConfigOf(captured)).toEqual({ cfg_coef: 2.4 });
  });

  it('maps typed Gradium TTS options into json_config', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'advanced',
      providerOptions: {
        gradium: {
          paddingBonus: -1.2,
          temperature: 0.35,
          pronunciationDictionary: 'dict_123',
          rewriteRules: 'custom_rule',
        },
      },
    });

    expect(jsonConfigOf(captured)).toEqual({
      padding_bonus: -1.2,
      temp: 0.35,
      pronunciation_dictionary: 'dict_123',
      rewrite_rules: 'custom_rule',
    });
  });

  it('warns when jsonConfig conflicts with mapped options', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    const { warnings } = await generateSpeech({
      model: gradium.speech(),
      text: 'conflict',
      speed: 1.1,
      providerOptions: {
        gradium: {
          jsonConfig: '{"padding_bonus": -1.2}',
          cfgCoef: 2.0,
          rewriteRules: 'fr',
        },
      },
    });

    expect(bodyOf(captured).json_config).toBe('{"padding_bonus": -1.2}');
    expect(warnings.some(w => w.type === 'other')).toBe(true);
  });

  it('emits an unsupported warning for free-form instructions', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch({}),
    });

    const { warnings } = await generateSpeech({
      model: gradium.speech(),
      text: 'with instructions',
      instructions: 'Speak in a warm, slow tone.',
    });

    expect(
      warnings.some(
        w => w.type === 'unsupported' && w.feature === 'instructions',
      ),
    ).toBe(true);
  });

  it('warns when an unsupported output format is requested', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch({}),
    });

    const { warnings } = await generateSpeech({
      model: gradium.speech(),
      text: 'mp3 fallback',
      outputFormat: 'mp3',
    });

    expect(
      warnings.some(
        w => w.type === 'unsupported' && w.feature === 'outputFormat',
      ),
    ).toBe(true);
  });

  it('passes through Gradium-specific output formats via providerOptions', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'telephony',
      providerOptions: { gradium: { outputFormat: 'ulaw_8000' } },
    });

    expect(bodyOf(captured).output_format).toBe('ulaw_8000');
  });

  it('forwards language as json_config.rewrite_rules when none is set', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'Bonjour',
      language: 'fr',
    });

    expect(jsonConfigOf(captured).rewrite_rules).toBe('fr');
  });

  it('does not overwrite explicit rewriteRules when language is also given', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech(),
      text: 'Bonjour',
      language: 'fr',
      providerOptions: { gradium: { rewriteRules: 'custom_rule' } },
    });

    expect(jsonConfigOf(captured).rewrite_rules).toBe('custom_rule');
  });

  it('parses providerOptions.gradium.onlyAudio = false JSON messages into audio', async () => {
    const captured: Captured = {};
    const first = new Uint8Array([0x52, 0x49]);
    const second = new Uint8Array([0x46, 0x46]);
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        captured,
        new Response(
          [
            JSON.stringify({
              type: 'text',
              text: 'Hello',
              start_s: 0.1,
              stop_s: 0.3,
            }),
            JSON.stringify({ type: 'audio', audio: b64(first) }),
            '',
            JSON.stringify({ type: 'audio', audio: b64(second) }),
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
        ),
      ),
    });

    const { audio } = await generateSpeech({
      model: gradium.speech(),
      text: 'json mode',
      providerOptions: { gradium: { onlyAudio: false } },
    });

    expect(bodyOf(captured).only_audio).toBe(false);
    expect(audio).toEqual(FAKE_AUDIO);
  });

  it('surfaces provider metadata for onlyAudio = false', async () => {
    const model = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        {},
        new Response(
          [
            JSON.stringify({
              type: 'text',
              text: 'Hello',
              start_s: 0.1,
              stop_s: 0.3,
            }),
            JSON.stringify({ type: 'audio', audio: b64(FAKE_AUDIO) }),
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
        ),
      ),
    }).speech('default');

    const result = await model.doGenerate({
      text: 'json mode',
      providerOptions: { gradium: { onlyAudio: false } },
    });

    expect(result.audio).toEqual(FAKE_AUDIO);
    expect(result.providerMetadata?.gradium).toMatchObject({
      messageCount: 2,
      text: [{ text: 'Hello', startSecond: 0.1, endSecond: 0.3 }],
    });
  });

  it('surfaces onlyAudio = false JSON error messages', async () => {
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(
        {},
        new Response(
          JSON.stringify({ type: 'error', message: 'synthesis failed' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    });

    await expect(
      generateSpeech({
        model: gradium.speech(),
        text: 'json error',
        providerOptions: { gradium: { onlyAudio: false } },
      }),
    ).rejects.toThrow(/synthesis failed/);
  });

  it('sends model_name when modelId is not "default"', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({
      model: gradium.speech('experimental-v2'),
      text: 'pick a model',
    });

    expect(bodyOf(captured).model_name).toBe('experimental-v2');
  });

  it('omits model_name for the "default" modelId', async () => {
    const captured: Captured = {};
    const gradium = createGradium({
      apiKey: 'test-key',
      fetch: fakeFetch(captured),
    });

    await generateSpeech({ model: gradium.speech('default'), text: 'd' });

    expect('model_name' in bodyOf(captured)).toBe(false);
  });

  it('uses GRADIUM_API_KEY env var when no apiKey is passed', async () => {
    const previous = process.env.GRADIUM_API_KEY;
    process.env.GRADIUM_API_KEY = 'env-key';
    try {
      const captured: Captured = {};
      const gradium = createGradium({ fetch: fakeFetch(captured) });

      await generateSpeech({ model: gradium.speech(), text: 'env' });

      expect(
        (captured.init!.headers as Record<string, string>)['x-api-key'],
      ).toBe('env-key');
    } finally {
      if (previous === undefined) delete process.env.GRADIUM_API_KEY;
      else process.env.GRADIUM_API_KEY = previous;
    }
  });
});
