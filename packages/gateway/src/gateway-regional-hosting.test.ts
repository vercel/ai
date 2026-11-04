import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  createGateway,
  type GatewayProviderSettings,
} from './gateway-provider';
import { GatewayLanguageModel } from './gateway-language-model';
import { GatewayRealtimeModel } from './gateway-realtime-model';
import { rejectRegionalHosting } from './gateway-regional-hosting';

const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function mockFetch() {
  return vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    if (
      new Headers(init?.headers).get('ai-language-model-streaming') === 'true'
    ) {
      return new Response('data: {"type":"stream-start","warnings":[]}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return Response.json({ warnings: [] });
  });
}

describe('regional hosting', () => {
  describe.each(['doGenerate', 'doStream'] as const)('%s', method => {
    it.each(['au', 'eu', 'us'] as const)(
      'selects the exact %s endpoint and removes only the client option',
      async regionalHosting => {
        const fetch = mockFetch();
        const model = createGateway({ apiKey: 'test-key', fetch })(
          'test/model',
        );
        const providerOptions = {
          gateway: {
            regionalHosting,
            inferenceRegion: { geoRegion: 'us' },
            order: ['openai'],
            futureOption: { keep: true },
          },
          openai: { reasoningEffort: 'low' },
        };
        const original = structuredClone(providerOptions);

        const result = await model[method]({ prompt, providerOptions });

        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch.mock.calls[0][0]).toBe(
          `https://${regionalHosting}.ai-gateway.vercel.sh/v4/ai/language-model`,
        );
        const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
        expect(body).toEqual({
          prompt,
          providerOptions: {
            gateway: {
              inferenceRegion: { geoRegion: 'us' },
              order: ['openai'],
              futureOption: { keep: true },
            },
            openai: { reasoningEffort: 'low' },
          },
        });
        expect(result.request?.body).toEqual(body);
        expect(providerOptions).toEqual(original);
      },
    );

    it('overrides a constructor default without changing subsequent calls', async () => {
      const fetch = mockFetch();
      const model = createGateway({
        apiKey: 'test-key',
        fetch,
        regionalHosting: 'eu',
      })('test/model');
      await model[method]({
        prompt,
        providerOptions: { gateway: { regionalHosting: 'au' } },
      });
      await model[method]({ prompt });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://au.ai-gateway.vercel.sh/v4/ai/language-model',
        'https://eu.ai-gateway.vercel.sh/v4/ai/language-model',
      ]);
      expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
        prompt,
      });
    });

    it.each([
      'https://proxy.example/v4/ai',
      'https://ai-gateway.vercel.sh/v4/ai',
      'https://eu.ai-gateway.vercel.sh/v4/ai/',
    ])(
      'rejects per-call routing with explicit baseURL %s before auth or fetch',
      async baseURL => {
        const fetch = mockFetch();
        const apiKey = vi.fn(() => 'test-key');
        const model = createGateway({ apiKey, baseURL, fetch })('test/model');
        await expect(
          model[method]({
            prompt,
            providerOptions: { gateway: { regionalHosting: 'eu' } },
          }),
        ).rejects.toBeInstanceOf(InvalidArgumentError);
        expect(apiKey).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it.each([
      'EU',
      '',
      'ap',
      '__proto__',
      null,
      1,
      [],
      { region: 'eu' },
      { region: 'eu', pinInference: true },
    ])(
      'rejects unsupported per-call value %j before auth or fetch',
      async regionalHosting => {
        const fetch = mockFetch();
        const apiKey = vi.fn(() => 'test-key');
        const model = createGateway({ apiKey, fetch })('test/model');
        await expect(
          model[method]({
            prompt,
            providerOptions: { gateway: { regionalHosting } },
          }),
        ).rejects.toBeInstanceOf(InvalidArgumentError);
        expect(apiKey).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  });

  it.each(['au', 'eu', 'us'] as const)(
    'uses the constructor %s endpoint for helpers and models',
    async regionalHosting => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json({ balance: '10', total_used: '0' }));
      const provider = createGateway({
        apiKey: 'test-key',
        regionalHosting,
        fetch,
      });
      await provider.getCredits();
      expect(fetch.mock.calls[0][0]).toBe(
        `https://${regionalHosting}.ai-gateway.vercel.sh/v1/credits`,
      );
    },
  );

  it.each(['EU', '', 'ap', '__proto__', null, 1, [], { region: 'eu' }])(
    'rejects unsupported constructor value %j',
    regionalHosting => {
      expect(() =>
        createGateway({
          regionalHosting:
            regionalHosting as GatewayProviderSettings['regionalHosting'],
        }),
      ).toThrow(InvalidArgumentError);
    },
  );

  it('rejects constructor baseURL plus region', () => {
    expect(() =>
      createGateway({
        baseURL: 'https://ai-gateway.vercel.sh/v4/ai',
        regionalHosting: 'eu',
      }),
    ).toThrow(InvalidArgumentError);
  });

  it.each([
    'https://proxy.example/v4/ai',
    'https://ai-gateway.vercel.sh/v4/ai',
  ])(
    'rejects a per-call override for legacy workflow config without endpoint provenance: %s',
    async baseURL => {
      const fetch = mockFetch();
      const model = GatewayLanguageModel[WORKFLOW_DESERIALIZE]({
        modelId: 'test/model',
        config: {
          provider: 'gateway',
          baseURL,
          headers: {},
          o11yHeaders: {},
          fetch,
        },
      });
      await expect(
        model.doGenerate({
          prompt,
          providerOptions: { gateway: { regionalHosting: 'eu' } },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(fetch).not.toHaveBeenCalled();
      await model.doGenerate({ prompt });
      expect(fetch.mock.calls[0][0]).toBe(`${baseURL}/language-model`);
    },
  );

  it('retains the explicit baseURL conflict after workflow serialization', async () => {
    const model = new GatewayLanguageModel('test/model', {
      provider: 'gateway',
      baseURL: 'https://proxy.example/v4/ai',
      hasExplicitBaseURL: true,
      headers: {},
      o11yHeaders: {},
    });
    const serialized = GatewayLanguageModel[WORKFLOW_SERIALIZE](model);
    expect(serialized.config.hasExplicitBaseURL).toBe(true);
    const restored = GatewayLanguageModel[WORKFLOW_DESERIALIZE](
      serialized as unknown as Parameters<
        (typeof GatewayLanguageModel)[typeof WORKFLOW_DESERIALIZE]
      >[0],
    );
    await expect(
      restored.doGenerate({
        prompt,
        providerOptions: { gateway: { regionalHosting: 'eu' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });
});

describe('unsupported per-call regional hosting', () => {
  it('treats undefined as an omitted optional setting', () => {
    expect(() =>
      rejectRegionalHosting({ gateway: { regionalHosting: undefined } }),
    ).not.toThrow();
    expect(() =>
      rejectRegionalHosting({ gateway: { regionalHosting: null } }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  const providerOptions = { gateway: { regionalHosting: 'eu' } };
  const videoOptions = {
    prompt: 'Hello',
    n: 1,
    aspectRatio: undefined,
    resolution: undefined,
    duration: undefined,
    fps: undefined,
    seed: undefined,
    image: undefined,
    frameImages: undefined,
    inputReferences: undefined,
    generateAudio: undefined,
    providerOptions,
  };
  const cases = [
    [
      'embedding',
      (p: ReturnType<typeof createGateway>) =>
        p
          .embedding('test/model')
          .doEmbed({ values: ['Hello'], providerOptions }),
    ],
    [
      'image',
      (p: ReturnType<typeof createGateway>) =>
        p.image('test/model').doGenerate({
          prompt: 'Hello',
          n: 1,
          size: undefined,
          files: undefined,
          mask: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions,
        }),
    ],
    [
      'reranking',
      (p: ReturnType<typeof createGateway>) =>
        p.reranking('test/model').doRerank({
          query: 'Hello',
          documents: { type: 'text', values: ['Hello'] },
          topN: undefined,
          providerOptions,
        }),
    ],
    [
      'decision',
      (p: ReturnType<typeof createGateway>) =>
        p
          .decision('test/model')
          .doDecide({ state: [], questions: {}, providerOptions }),
    ],
    [
      'speech',
      (p: ReturnType<typeof createGateway>) =>
        p.speech('test/model').doGenerate({ text: 'Hello', providerOptions }),
    ],
    [
      'transcription',
      (p: ReturnType<typeof createGateway>) =>
        p.transcription('test/model').doGenerate({
          audio: new Uint8Array(),
          mediaType: 'audio/wav',
          providerOptions,
        }),
    ],
    [
      'video generate',
      (p: ReturnType<typeof createGateway>) =>
        p.video('test/model').doGenerate?.(videoOptions),
    ],
    [
      'video start',
      (p: ReturnType<typeof createGateway>) =>
        p.video('test/model').doStart?.(videoOptions),
    ],
    [
      'batch start',
      (p: ReturnType<typeof createGateway>) =>
        p.experimental_batch().doStartBatch({ requests: [], providerOptions }),
    ],
    [
      'batch item',
      (p: ReturnType<typeof createGateway>) =>
        p.experimental_batch().doStartBatch({
          requests: [
            {
              id: '1',
              type: 'text',
              modelId: 'test/model',
              options: { prompt, providerOptions },
            },
          ],
        }),
    ],
    [
      'batch status',
      (p: ReturnType<typeof createGateway>) =>
        p
          .experimental_batch()
          .doGetBatchStatus({ batchId: '1', providerOptions }),
    ],
    [
      'batch results',
      (p: ReturnType<typeof createGateway>) =>
        p
          .experimental_batch()
          .doGetBatchResults({ batchId: '1', providerOptions }),
    ],
    [
      'batch cancel',
      (p: ReturnType<typeof createGateway>) =>
        p
          .experimental_batch()
          .doCancelBatch?.({ batchId: '1', providerOptions }),
    ],
    [
      'speech stream',
      (p: ReturnType<typeof createGateway>) =>
        p
          .experimental_speech('test/model')
          .doStream({ text: new ReadableStream(), providerOptions }),
    ],
    [
      'transcription stream',
      (p: ReturnType<typeof createGateway>) =>
        p.transcription('test/model').doStream?.({
          audio: new ReadableStream(),
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          providerOptions,
        }),
    ],
  ] as const;

  it.each(cases)(
    'rejects %s before authentication or network',
    async (_name, run) => {
      const fetch = mockFetch();
      const apiKey = vi.fn(() => 'test-key');
      await expect(
        run(createGateway({ apiKey, fetch })),
      ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
      expect(apiKey).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['session-start', 'session-update', 'context-append'] as const)(
    'rejects a realtime %s hint before serializing its frame',
    type => {
      const model = new GatewayRealtimeModel('test/model', {
        provider: 'gateway.realtime',
        baseURL: 'https://ai-gateway.vercel.sh/v4/ai',
        createClientSecret: vi.fn(),
      });
      const hintedEvent =
        type === 'context-append'
          ? { type, content: 'Hello', delegationId: null, providerOptions }
          : { type, config: { providerOptions } };
      expect(() => model.serializeClientEvent(hintedEvent)).toThrow(
        UnsupportedFunctionalityError,
      );
      const otherOptions = { openai: { temperature: 0.2 } };
      const event =
        type === 'context-append'
          ? {
              type,
              content: 'Hello',
              delegationId: null,
              providerOptions: otherOptions,
            }
          : { type, config: { providerOptions: otherOptions } };
      expect(model.serializeClientEvent(event)).toBe(event);
    },
  );

  it('rejects realtime token config before minting and late session hints before serialization', async () => {
    const createClientSecret = vi.fn();
    const model = new GatewayRealtimeModel('test/model', {
      provider: 'gateway.realtime',
      baseURL: 'https://ai-gateway.vercel.sh/v4/ai',
      createClientSecret,
    });
    const sessionConfig = { providerOptions };
    await expect(
      model.doCreateClientSecret({ sessionConfig }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(createClientSecret).not.toHaveBeenCalled();
    expect(() => model.buildSessionConfig(sessionConfig)).toThrow(
      UnsupportedFunctionalityError,
    );
    expect(() =>
      model.serializeClientEvent({
        type: 'session-update',
        config: sessionConfig,
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
