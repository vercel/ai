import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAzure,
  type AzureOpenAIProviderSettings,
} from './azure-openai-provider';
import type { AzureSpeechModelOptions } from './azure-speech-model-options';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

const audio = new Uint8Array([0xff, 0xf3, 0x44, 0xc4]);

function setup(
  settings: AzureOpenAIProviderSettings = {},
  response: () => Response = () =>
    new Response(audio, { headers: { 'content-type': 'audio/mpeg' } }),
) {
  const fetch = vi.fn<FetchFunction>(async () => response());
  const provider = createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-key',
    ...settings,
    fetch,
  });
  const request = () => {
    const [url, init] = fetch.mock.calls.at(-1)!;
    return {
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body as string,
    };
  };
  return { provider, fetch, request };
}

const ssml = (voice: string, content: string, locale = 'en-US') =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${locale}"><voice name="${voice}">${content}</voice></speak>`;

const speechUrl =
  'https://test-resource.cognitiveservices.azure.com/tts/cognitiveservices/v1';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('API routing', () => {
  it.each([
    ['mai-voice-2-flash', undefined, 'speech', 'MAI-Voice-2-Flash'],
    ['MAI-Voice-2-Flash', undefined, 'speech', 'MAI-Voice-2-Flash'],
    ['mai-voice-2', undefined, 'speech', 'MAI-Voice-2'],
    ['MaI-vOiCe-2', undefined, 'speech', 'MAI-Voice-2'],
    ['tts-1', undefined, 'openai'],
    ['mai-voice-2-custom', undefined, 'openai'],
    ['constructor', undefined, 'openai'],
    ['mai-voice-2', 'openai', 'openai'],
    ['custom-voice-model', 'speech', 'speech', 'custom-voice-model'],
  ] as const)(
    'routes %s with api=%s to %s',
    async (id, api, expected, suffix?: string) => {
      const { provider, request } = setup();
      await provider.speech(id).doGenerate({
        text: 'Hello',
        providerOptions: { azure: { ...(api && { api }) } },
      });
      if (expected === 'speech') {
        expect(request().url).toBe(speechUrl);
        expect(request().body).toBe(ssml(`en-US-Harper:${suffix}`, 'Hello'));
      } else {
        expect(request().url).toBe(
          'https://test-resource.openai.azure.com/openai/v1/audio/speech?api-version=v1',
        );
        expect(JSON.parse(request().body).model).toBe(id);
      }
    },
  );

  it('resolves the API again for each call to the same model', async () => {
    const { provider, request } = setup();
    const model = provider.speech('mai-voice-2');
    await model.doGenerate({ text: 'Hi' });
    expect(request().url).toBe(speechUrl);
    await model.doGenerate({
      text: 'Hi',
      providerOptions: { azure: { api: 'openai' } },
    });
    expect(request().url).toContain('/audio/speech');
  });

  it('exposes speechModel as an alias of speech', async () => {
    const { provider, request } = setup();
    await provider.speechModel('mai-voice-2').doGenerate({ text: 'Hello' });
    expect(request().url).toBe(speechUrl);
  });

  it('warns about Speech-only options on the OpenAI API', async () => {
    const { provider } = setup();
    const result = await provider.speech('tts-1').doGenerate({
      text: 'Hello',
      providerOptions: { azure: { style: 'excited', styleDegree: 1.5 } },
    });
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'providerOptions.azure.style',
        details: 'This option requires the Azure Speech API.',
      },
      {
        type: 'unsupported',
        feature: 'providerOptions.azure.styleDegree',
        details: 'This option requires the Azure Speech API.',
      },
    ]);
  });

  it.each([
    { emotion: 'happy' },
    { api: 'invalid' },
    { style: '' },
    { styleDegree: 0 },
    { styleDegree: 2.5 },
  ])('rejects invalid options %j before fetching', async azure => {
    const { provider, fetch } = setup();
    await expect(
      provider.speech('mai-voice-2').doGenerate({
        text: 'Hello',
        providerOptions: { azure },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Speech requests', () => {
  it('sends SSML with the default voice, mp3 format, and subscription key', async () => {
    const { provider, request } = setup();
    const result = await provider
      .speech('mai-voice-2-flash')
      .doGenerate({ text: 'Hello world.' });

    const { headers, body } = request();
    expect(body).toBe(ssml('en-US-Harper:MAI-Voice-2-Flash', 'Hello world.'));
    expect(headers.get('content-type')).toBe('application/ssml+xml');
    expect(headers.get('x-microsoft-outputformat')).toBe(
      'audio-24khz-160kbitrate-mono-mp3',
    );
    expect(headers.get('ocp-apim-subscription-key')).toBe('test-key');
    expect(headers.get('api-key')).toBeNull();
    expect(headers.get('user-agent')).toContain('ai-sdk/azure/0.0.0-test');
    expect(result).toMatchObject({
      audio,
      warnings: [],
      request: { body },
      response: {
        modelId: 'mai-voice-2-flash',
        headers: { 'content-type': 'audio/mpeg' },
      },
    });
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('appends the model to the voice and uses its locale', async () => {
    const { provider, request } = setup();
    await provider
      .speech('mai-voice-2')
      .doGenerate({ text: 'Hallo.', voice: 'de-DE-Mia' });
    expect(request().body).toBe(
      ssml('de-DE-Mia:MAI-Voice-2', 'Hallo.', 'de-DE'),
    );
  });

  it('passes a full voice name through unchanged', async () => {
    const { provider, request } = setup();
    await provider
      .speech('mai-voice-2')
      .doGenerate({ text: 'Hi', voice: 'es-MX-Valeria:MAI-Voice-2-Flash' });
    expect(request().body).toBe(
      ssml('es-MX-Valeria:MAI-Voice-2-Flash', 'Hi', 'es-MX'),
    );
  });

  it('escapes text and attribute values', async () => {
    const { provider, request } = setup();
    await provider.speech('mai-voice-2').doGenerate({
      text: `Tom & Jerry <3 "quotes" 'apos'`,
      voice: 'en-US-Harper"><evil',
      providerOptions: { azure: { style: 'a"b' } },
    });
    expect(request().body).toBe(
      ssml(
        'en-US-Harper&quot;&gt;&lt;evil:MAI-Voice-2',
        '<mstts:express-as style="a&quot;b">Tom &amp; Jerry &lt;3 &quot;quotes&quot; &apos;apos&apos;</mstts:express-as>',
      ),
    );
  });

  it('maps style, styleDegree, and speed to express-as and prosody', async () => {
    const { provider, request } = setup();
    const result = await provider.speech('mai-voice-2').doGenerate({
      text: 'We won!',
      speed: 1.25,
      providerOptions: {
        azure: {
          style: 'excited',
          styleDegree: 1.5,
        } satisfies AzureSpeechModelOptions,
      },
    });
    expect(request().body).toBe(
      ssml(
        'en-US-Harper:MAI-Voice-2',
        '<mstts:express-as style="excited" styledegree="1.5"><prosody rate="1.25">We won!</prosody></mstts:express-as>',
      ),
    );
    expect(result.warnings).toEqual([]);
  });

  it('warns and ignores styleDegree without style', async () => {
    const { provider, request } = setup();
    const result = await provider.speech('mai-voice-2').doGenerate({
      text: 'Hi',
      providerOptions: { azure: { styleDegree: 1.5 } },
    });
    expect(request().body).toBe(ssml('en-US-Harper:MAI-Voice-2', 'Hi'));
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'providerOptions.azure.styleDegree',
        details: 'styleDegree requires style.',
      },
    ]);
  });

  it.each([
    ['mp3', 'audio-24khz-160kbitrate-mono-mp3'],
    ['wav', 'riff-24khz-16bit-mono-pcm'],
    ['pcm', 'raw-24khz-16bit-mono-pcm'],
    ['opus', 'ogg-24khz-16bit-mono-opus'],
    ['WAV', 'riff-24khz-16bit-mono-pcm'],
    ['audio-48khz-192kbitrate-mono-mp3', 'audio-48khz-192kbitrate-mono-mp3'],
    ['raw-8khz-8bit-mono-mulaw', 'raw-8khz-8bit-mono-mulaw'],
  ])('maps output format %s to %s', async (outputFormat, expected) => {
    const { provider, request } = setup();
    const result = await provider
      .speech('mai-voice-2')
      .doGenerate({ text: 'Hi', outputFormat });
    expect(request().headers.get('x-microsoft-outputformat')).toBe(expected);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to mp3 with a warning for unsupported formats', async () => {
    const { provider, request } = setup();
    const result = await provider
      .speech('mai-voice-2')
      .doGenerate({ text: 'Hi', outputFormat: 'flac' });
    expect(request().headers.get('x-microsoft-outputformat')).toBe(
      'audio-24khz-160kbitrate-mono-mp3',
    );
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'outputFormat',
        details: 'Unsupported output format: flac. Using mp3 instead.',
      },
    ]);
  });

  it('warns about unsupported instructions', async () => {
    const { provider } = setup();
    const result = await provider.speech('mai-voice-2').doGenerate({
      text: 'Hi',
      instructions: 'Speak slowly',
    });
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'instructions',
        details: 'Use providerOptions.azure.style to control speaking style.',
      },
    ]);
  });

  it('does not apply Azure OpenAI URL settings to Speech requests', async () => {
    const { provider, request } = setup({
      baseURL: 'https://proxy.example/openai',
      apiVersion: '2025-01-01',
      useDeploymentBasedUrls: true,
    });
    await provider.speech('mai-voice-2').doGenerate({ text: 'Hi' });
    expect(request().url).toBe(speechUrl);
  });

  it('honors speechBaseURL and per-request headers', async () => {
    const { provider, request } = setup({
      resourceName: undefined,
      speechBaseURL: 'https://eastus.api.cognitive.microsoft.com/',
      headers: { 'x-custom': 'provider' },
    });
    await provider.speech('mai-voice-2').doGenerate({
      text: 'Hi',
      headers: { 'x-custom': 'call' },
    });
    expect(request().url).toBe(
      'https://eastus.api.cognitive.microsoft.com/tts/cognitiveservices/v1',
    );
    expect(request().headers.get('x-custom')).toBe('call');
  });

  it('uses the Entra token instead of the key', async () => {
    const { provider, request } = setup({
      apiKey: undefined,
      tokenProvider: async () => 'entra-token',
    });
    await provider.speech('mai-voice-2').doGenerate({ text: 'Hi' });
    expect(request().headers.get('authorization')).toBe('Bearer entra-token');
    expect(request().headers.get('ocp-apim-subscription-key')).toBeNull();
  });
});

describe('language', () => {
  it.each([
    ['mai-voice-2', 'de', 'de-DE-Mia:MAI-Voice-2', 'de-DE'],
    ['mai-voice-2-flash', 'es', 'es-MX-Valeria:MAI-Voice-2-Flash', 'es-MX'],
    ['mai-voice-2', 'pt', 'pt-BR-Luana:MAI-Voice-2', 'pt-BR'],
    ['mai-voice-2', 'zh', 'zh-CN-Mei:MAI-Voice-2', 'zh-CN'],
    ['mai-voice-2', 'en', 'en-US-Harper:MAI-Voice-2', 'en-US'],
    ['mai-voice-2', 'FR', 'fr-FR-Soleil:MAI-Voice-2', 'fr-FR'],
    ['mai-voice-2', 'ko-KR', 'ko-KR-Haena:MAI-Voice-2', 'ko-KR'],
  ])(
    'uses the %s default voice for language %s',
    async (id, language, voice, locale) => {
      const { provider, request } = setup();
      const result = await provider
        .speech(id)
        .doGenerate({ text: 'Hi', language });
      expect(request().body).toBe(ssml(voice, 'Hi', locale));
      expect(result.warnings).toEqual([]);
    },
  );

  it.each([
    ['ja', 'No default MAI voice for language "ja". en-US-Harper was used.'],
    [
      'constructor',
      'No default MAI voice for language "constructor". en-US-Harper was used.',
    ],
    [
      'auto',
      'Automatic language detection is not supported. en-US-Harper was used.',
    ],
  ])(
    'falls back to en-US-Harper with a warning for %s',
    async (language, details) => {
      const { provider, request } = setup();
      const result = await provider
        .speech('mai-voice-2')
        .doGenerate({ text: 'Hi', language });
      expect(request().body).toBe(ssml('en-US-Harper:MAI-Voice-2', 'Hi'));
      expect(result.warnings).toEqual([
        { type: 'unsupported', feature: 'language', details },
      ]);
    },
  );

  it.each(['de', 'de-AT', 'auto'])(
    'keeps an explicit voice without a warning for language %s',
    async language => {
      const { provider, request } = setup();
      const result = await provider
        .speech('mai-voice-2')
        .doGenerate({ text: 'Hallo', voice: 'de-DE-Klaus', language });
      expect(request().body).toBe(
        ssml('de-DE-Klaus:MAI-Voice-2', 'Hallo', 'de-DE'),
      );
      expect(result.warnings).toEqual([]);
    },
  );

  it('keeps an explicit voice and warns when the language conflicts', async () => {
    const { provider, request } = setup();
    const result = await provider
      .speech('mai-voice-2')
      .doGenerate({ text: 'Hi', voice: 'en-US-Ethan', language: 'de' });
    expect(request().body).toBe(ssml('en-US-Ethan:MAI-Voice-2', 'Hi'));
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'language',
        details:
          'The voice en-US-Ethan selects the language. Language "de" was ignored.',
      },
    ]);
  });
});

describe('Speech errors', () => {
  it('explains empty 400 responses', async () => {
    const { provider } = setup({}, () => new Response(null, { status: 400 }));
    const error = await Promise.resolve(
      provider.speech('mai-voice-2').doGenerate({ text: 'Hi' }),
    ).catch((error: unknown) => error);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      statusCode: 400,
      isRetryable: false,
      message:
        'Azure Speech request failed with status 400. Check the voice name, style, and output format.',
    });
  });

  it('uses JSON error messages', async () => {
    const { provider } = setup({}, () =>
      Response.json(
        { error: { code: '401', message: 'Access denied' } },
        { status: 401 },
      ),
    );
    await expect(
      provider.speech('mai-voice-2').doGenerate({ text: 'Hi' }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Access denied' });
  });

  it.each([
    'upstream connect error or disconnect/reset before headers. reset reason: connection termination',
    'unavailable',
  ])('keeps 502 responses retryable (%s)', async body => {
    const { provider } = setup({}, () => new Response(body, { status: 502 }));
    await expect(
      provider.speech('mai-voice-2').doGenerate({ text: 'Hi' }),
    ).rejects.toMatchObject({
      statusCode: 502,
      isRetryable: true,
      message: 'Azure Speech request failed with status 502.',
      responseBody: body,
    });
  });

  it.each([429, 503])('keeps HTTP %s retryable', async status => {
    const { provider } = setup(
      {},
      () => new Response('unavailable', { status }),
    );
    await expect(
      provider.speech('mai-voice-2').doGenerate({ text: 'Hi' }),
    ).rejects.toMatchObject({ statusCode: status, isRetryable: true });
  });
});
