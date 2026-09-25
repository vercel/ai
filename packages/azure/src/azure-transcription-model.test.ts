import { OpenAITranscriptionModel } from '@ai-sdk/openai/internal';
import {
  APICallError,
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAzure,
  type AzureOpenAIProviderSettings,
} from './azure-openai-provider';
import type { AzureTranscriptionModelOptions } from './azure-transcription-model-options';
import type { AzureTranscriptionProviderMetadata } from './azure-transcription-provider-metadata';

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(`src/__fixtures__/${name}.json`, 'utf8'));
}

const input = { audio: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' };
const response = {
  durationMilliseconds: 2000,
  combinedPhrases: [{ text: 'Hello world.' }],
  phrases: [
    {
      text: 'Hello world.',
      offsetMilliseconds: 40,
      durationMilliseconds: 1500,
      locale: 'en-US',
      speaker: 1,
      confidence: 0.9,
      words: [
        { text: 'Hello', offsetMilliseconds: 40, durationMilliseconds: 400 },
      ],
    },
  ],
};

function setup(
  settings: AzureOpenAIProviderSettings = {},
  body: unknown = response,
) {
  const fetch = vi.fn<FetchFunction>(async url =>
    Response.json(
      String(url).includes('/audio/transcriptions') ? { text: 'OpenAI' } : body,
    ),
  );
  const provider = createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-key',
    ...settings,
    fetch,
  });
  return {
    provider,
    fetch,
    request: () => {
      const [url, init] = fetch.mock.calls.at(-1)!;
      return {
        url: String(url),
        headers: new Headers(init?.headers),
        body: init?.body as FormData,
        signal: init?.signal,
      };
    },
    definition: () =>
      JSON.parse(
        (fetch.mock.calls.at(-1)![1]!.body as FormData).get(
          'definition',
        ) as string,
      ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('API routing', () => {
  it.each([
    ['mai-transcribe-2', undefined, 'speech'],
    ['MAI-Transcribe-2', undefined, 'speech'],
    ['MaI-TrAnScRiBe-2', undefined, 'speech'],
    ['mai-transcribe-2-custom', undefined, 'openai'],
    ['whisper-1', undefined, 'openai'],
    ['custom-deployment', undefined, 'openai'],
    ['mai-transcribe-2', 'openai', 'openai'],
    ['Future-Speech-Model', 'speech', 'speech'],
    ['mai-transcribe-2', 'speech', 'speech'],
  ] as const)('routes %s with api=%s to %s', async (id, api, expected) => {
    const { provider, request, definition } = setup();
    await provider.transcription(id).doGenerate({
      ...input,
      providerOptions: { azure: { ...(api && { api }) } },
    });
    expect(request().url).toContain(
      expected === 'speech' ? '/speechtotext/' : '/audio/transcriptions',
    );
    if (expected === 'speech') {
      expect(definition().enhancedMode).toMatchObject({
        enabled: true,
        model:
          id.toLowerCase() === 'mai-transcribe-2' ? 'MAI-Transcribe-2' : id,
      });
    } else {
      expect(request().body.get('model')).toBe(id);
    }
  });

  it('resolves the API again for each call to the same model', async () => {
    const { provider, request } = setup();
    const model = provider.transcription('mai-transcribe-2');
    await model.doGenerate(input);
    expect(request().url).toContain('/speechtotext/');
    await model.doGenerate({
      ...input,
      providerOptions: { azure: { api: 'openai' } },
    });
    expect(request().url).toContain('/audio/transcriptions');
    await model.doGenerate(input);
    expect(request().url).toContain('/speechtotext/');
  });

  it('preserves OpenAI options and warns about Speech-only options', async () => {
    const { provider, request } = setup();
    const result = await provider.transcription('whisper-1').doGenerate({
      ...input,
      providerOptions: {
        openai: { language: 'en', prompt: 'Names' },
        azure: { api: 'openai', timestamps: 'word' },
      },
    });
    expect(request().body.get('language')).toBe('en');
    expect(request().body.get('prompt')).toBe('Names');
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'providerOptions.azure.timestamps',
        details: 'This option requires the Azure Speech API.',
      },
    ]);
  });

  it.each([
    { api: 'invalid' },
    { timestamps: 'invalid' },
    { locales: ['en', 'de'] },
    { transcribeStyle: 'invalid' },
    { diarization: { enabled: 'yes' } },
  ])('rejects invalid options %j before fetching', async azure => {
    const { provider, fetch } = setup();
    await expect(
      provider
        .transcription('mai-transcribe-2')
        .doGenerate({ ...input, providerOptions: { azure } }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Speech requests', () => {
  it.each([input.audio, 'AQID'])(
    'sends audio and the required model definition',
    async audio => {
      const { provider, request, definition } = setup();
      await provider
        .transcription('mai-transcribe-2')
        .doGenerate({ ...input, audio });
      expect(request().url).toBe(
        'https://test-resource.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15',
      );
      expect(request().headers.get('Ocp-Apim-Subscription-Key')).toBe(
        'test-key',
      );
      expect(request().headers.has('api-key')).toBe(false);
      expect(request().headers.get('user-agent')).toContain('ai-sdk/azure/');
      expect(definition()).toEqual({
        enhancedMode: {
          enabled: true,
          model: 'MAI-Transcribe-2',
          modelOptions: { timestamps: 'segment' },
        },
      });
      const file = request().body.get('audio') as File;
      expect(file.name).toBe('audio.wav');
      expect(file.type).toBe('audio/wav');
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(input.audio);
    },
  );

  it.each(['word', 'segment', 'none'] as const)(
    'serializes all options with %s timestamps',
    async timestamps => {
      const { provider, definition } = setup();
      const azure = {
        timestamps,
        transcribeStyle: 'clean',
        locales: ['en'],
        diarization: { enabled: true },
        phraseList: { phrases: ['Vercel'] },
      } satisfies AzureTranscriptionModelOptions;
      await provider
        .transcription('mai-transcribe-2')
        .doGenerate({ ...input, providerOptions: { azure } });
      expect(definition()).toEqual({
        enhancedMode: {
          enabled: true,
          model: 'MAI-Transcribe-2',
          modelOptions: { timestamps, transcribeStyle: 'clean' },
        },
        locales: ['en'],
        diarization: { enabled: true },
        phraseList: { phrases: ['Vercel'] },
      });
    },
  );

  it('loads resource and key from the existing environment variables', async () => {
    vi.stubEnv('AZURE_RESOURCE_NAME', 'environment-resource');
    vi.stubEnv('AZURE_API_KEY', 'environment-key');
    const { provider, request } = setup({
      resourceName: undefined,
      apiKey: undefined,
    });
    await provider.transcription('mai-transcribe-2').doGenerate(input);
    expect(request().url).toContain(
      'https://environment-resource.cognitiveservices.azure.com/',
    );
    expect(request().headers.get('Ocp-Apim-Subscription-Key')).toBe(
      'environment-key',
    );
  });

  it('honors endpoint, API version, headers, and abort overrides', async () => {
    const { provider, request } = setup({
      baseURL: 'https://proxy.example/speech/',
      apiVersion: 'custom',
      useDeploymentBasedUrls: true,
      headers: { 'x-custom': 'provider' },
    });
    const controller = new AbortController();
    await provider.transcription('mai-transcribe-2').doGenerate({
      ...input,
      headers: { 'x-custom': 'call' },
      abortSignal: controller.signal,
    });
    expect(request().url).toBe(
      'https://proxy.example/speech/speechtotext/transcriptions:transcribe?api-version=custom',
    );
    expect(request().headers.get('x-custom')).toBe('call');
    expect(request().signal).toBe(controller.signal);
  });

  it('gets a fresh bearer token for each request', async () => {
    const tokenProvider = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const { provider, request } = setup({ apiKey: undefined, tokenProvider });
    const model = provider.transcription('mai-transcribe-2');
    await model.doGenerate(input);
    expect(request().headers.get('authorization')).toBe('Bearer first');
    expect(request().headers.has('Ocp-Apim-Subscription-Key')).toBe(false);
    await model.doGenerate(input);
    expect(request().headers.get('authorization')).toBe('Bearer second');
  });

  it('does not replace an explicitly supplied bearer token', async () => {
    const tokenProvider = vi.fn();
    const { provider, request } = setup({ apiKey: undefined, tokenProvider });
    await provider
      .transcription('mai-transcribe-2')
      .doGenerate({ ...input, headers: { Authorization: 'Bearer custom' } });
    expect(request().headers.get('authorization')).toBe('Bearer custom');
    expect(tokenProvider).not.toHaveBeenCalled();
  });
});

describe('Speech responses', () => {
  it('normalizes results and preserves speaker, word, locale, and confidence metadata', async () => {
    const { provider } = setup();
    const result = await provider
      .transcription('mai-transcribe-2')
      .doGenerate(input);
    expect(result).toMatchObject({
      text: 'Hello world.',
      durationInSeconds: 2,
      language: 'en',
      segments: [{ text: 'Hello world.', startSecond: 0.04, endSecond: 1.54 }],
      providerMetadata: { azure: { phrases: response.phrases } },
      warnings: [],
      response: { modelId: 'mai-transcribe-2', body: response },
    });
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it.each([undefined, null])(
    'accepts missing or null timestamps (%s)',
    async missing => {
      const { provider } = setup(
        {},
        {
          ...response,
          durationMilliseconds: missing,
          phrases: [
            {
              text: 'Hello world.',
              locale: 'en-US',
              offsetMilliseconds: missing,
              durationMilliseconds: missing,
              words: missing,
              speaker: missing,
            },
          ],
        },
      );
      const result = await provider
        .transcription('mai-transcribe-2')
        .doGenerate({
          ...input,
          providerOptions: { azure: { timestamps: 'none' } },
        });
      expect(result.text).toBe('Hello world.');
      expect(result.segments).toEqual([]);
      expect(result.durationInSeconds).toBeUndefined();
    },
  );

  it('accepts empty transcripts and absent phrases', async () => {
    const { provider } = setup({}, { combinedPhrases: [], phrases: null });
    expect(
      await provider.transcription('mai-transcribe-2').doGenerate(input),
    ).toMatchObject({ text: '', segments: [], language: undefined });
  });

  it.each([
    [['en-US', 'en-GB'], 'en'],
    [['en-US', 'de-DE'], undefined],
    [['fil'], undefined],
  ])('handles phrase locales %j', async (locales, expected) => {
    const { provider } = setup(
      {},
      {
        ...response,
        phrases: (locales as string[]).map(locale => ({
          text: 'text',
          locale,
        })),
      },
    );
    expect(
      (await provider.transcription('mai-transcribe-2').doGenerate(input))
        .language,
    ).toBe(expected);
  });

  it.each([400, 429, 500])(
    'returns structured API errors for HTTP %s',
    async status => {
      const { provider, fetch } = setup();
      fetch.mockResolvedValueOnce(
        Response.json(
          { error: { code: 'InvalidRequest', message: 'Bad audio' } },
          { status, headers: { 'x-request-id': 'request-1' } },
        ),
      );
      await expect(
        provider.transcription('mai-transcribe-2').doGenerate(input),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'Bad audio',
        statusCode: status,
        isRetryable: status !== 400,
        responseHeaders: { 'x-request-id': 'request-1' },
      });
    },
  );

  it('preserves non-JSON error bodies', async () => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    await expect(
      provider.transcription('mai-transcribe-2').doGenerate(input),
    ).rejects.toMatchObject({ responseBody: 'Unavailable', statusCode: 503 });
  });

  it('reads the top-level error message documented by the Speech REST API', async () => {
    const { provider, fetch } = setup();
    fetch.mockResolvedValueOnce(
      Response.json(
        { code: 'InvalidRequest', message: 'Bad audio' },
        { status: 400 },
      ),
    );
    await expect(
      provider.transcription('mai-transcribe-2').doGenerate(input),
    ).rejects.toMatchObject({ message: 'Bad audio', statusCode: 400 });
  });

  it('rejects malformed success responses', async () => {
    const { provider } = setup({}, { unrelated: true });
    await expect(
      provider.transcription('mai-transcribe-2').doGenerate(input),
    ).rejects.toBeInstanceOf(APICallError);
  });

  it('preserves abort errors', async () => {
    const { provider, fetch } = setup();
    const error = new DOMException('Aborted', 'AbortError');
    fetch.mockRejectedValueOnce(error);
    await expect(
      provider.transcription('mai-transcribe-2').doGenerate(input),
    ).rejects.toBe(error);
  });
});

describe('streaming and serialization', () => {
  it('delegates OpenAI streaming without changing call options', async () => {
    const { provider } = setup();
    const result = { stream: new ReadableStream() };
    const stream = vi
      .spyOn(OpenAITranscriptionModel.prototype, 'doStream')
      .mockResolvedValue(result);
    const options = {
      audio: new ReadableStream<Uint8Array>(),
      inputAudioFormat: { type: 'audio/pcm' as const, rate: 24000 },
      providerOptions: { azure: { api: 'openai' }, openai: { language: 'en' } },
    };
    expect(
      await provider.transcription('mai-transcribe-2').doStream!(options),
    ).toBe(result);
    expect(stream).toHaveBeenCalledWith(options);
  });

  it('rejects Speech streaming before sending audio', async () => {
    const { provider, fetch } = setup();
    await expect(
      provider.transcription('mai-transcribe-2').doStream!({
        audio: new ReadableStream(),
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('restores request-time routing after a workflow serialization round trip', async () => {
    const { provider, fetch, request } = setup({
      baseURL: 'https://proxy.example',
      apiVersion: 'custom',
    });
    const model = provider.transcription('mai-transcribe-2');
    const constructor = model.constructor as unknown as {
      [WORKFLOW_SERIALIZE](model: TranscriptionModelV4): {
        modelId: string;
        config: AzureOpenAIProviderSettings;
      };
      [WORKFLOW_DESERIALIZE](value: {
        modelId: string;
        config: AzureOpenAIProviderSettings;
      }): TranscriptionModelV4;
    };
    const serialized = constructor[WORKFLOW_SERIALIZE](model);
    expect(serialized.config.fetch).toBeUndefined();
    const restored = constructor[WORKFLOW_DESERIALIZE]({
      ...serialized,
      config: { ...serialized.config, fetch },
    });
    await restored.doGenerate(input);
    expect(request().url).toBe(
      'https://proxy.example/speechtotext/transcriptions:transcribe?api-version=custom',
    );
    await restored.doGenerate({
      ...input,
      providerOptions: { azure: { api: 'openai' } },
    });
    expect(request().url).toBe('https://proxy.example/audio/transcriptions');
  });
});

describe('recorded MAI-Transcribe-2 responses', () => {
  it('maps diarized word-level results into segments and metadata', async () => {
    const body = loadFixture(
      'azure-speech-mai-transcribe-2-word-diarization.1',
    );
    const { provider } = setup({}, body);
    const result = await provider.transcription('mai-transcribe-2').doGenerate({
      ...input,
      providerOptions: {
        azure: { timestamps: 'word', diarization: { enabled: true } },
      },
    });
    expect(result.text).toBe(body.combinedPhrases[0].text);
    expect(result.language).toBe('en');
    expect(result.durationInSeconds).toBe(17.579);
    expect(result.segments).toEqual([
      {
        text: 'Um, so, uh, did you finish the quarterly report for Versal yet?',
        startSecond: 0.12,
        endSecond: 4.32,
      },
      {
        text: 'Yeah, I, uh, I sent it over this morning. It covers the AI gateway numbers.',
        startSecond: 4.48,
        endSecond: 9.439,
      },
      {
        text: 'Great. Uh, can you, like, add the transcription pricing too?',
        startSecond: 9.68,
        endSecond: 13.8,
      },
      {
        text: "Sure. I'll, um, update it by Friday.",
        startSecond: 14.04,
        endSecond: 17.159,
      },
    ]);
    const phrases = (
      result.providerMetadata as AzureTranscriptionProviderMetadata
    ).azure.phrases;
    expect(phrases.map(phrase => phrase.speaker)).toEqual([0, 1, 0, 1]);
    expect(phrases[0].words?.[0]).toEqual({
      text: 'Um,',
      offsetMilliseconds: 120,
      durationMilliseconds: 220,
    });
  });

  it('maps a timestamps=none result to one segment spanning the audio', async () => {
    const { provider } = setup(
      {},
      loadFixture('azure-speech-mai-transcribe-2-no-timestamps.1'),
    );
    const result = await provider.transcription('mai-transcribe-2').doGenerate({
      ...input,
      providerOptions: { azure: { timestamps: 'none' } },
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      startSecond: 0,
      endSecond: 17.579,
    });
  });
});

describe('provider', () => {
  it('exposes transcriptionModel as an alias of transcription', async () => {
    const { provider, request } = setup();
    await provider.transcriptionModel('mai-transcribe-2').doGenerate(input);
    expect(request().url).toContain('/speechtotext/');
  });
});
