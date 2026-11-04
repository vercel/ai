import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { createGateway } from './gateway-provider';

const regions = ['au', 'eu', 'us'] as const;
const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function jsonFetch(body: unknown) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    Response.json(body),
  );
}

describe('regional hosting', () => {
  it.each(regions)(
    'uses the %s endpoint for every model and batch client',
    region => {
      const gateway = createGateway({ regionalHosting: region });
      const models = [
        gateway('test-model'),
        gateway.chat('test-model'),
        gateway.languageModel('test-model'),
        gateway.embedding('test-model'),
        gateway.embeddingModel('test-model'),
        gateway.textEmbeddingModel('test-model'),
        gateway.image('test-model'),
        gateway.imageModel('test-model'),
        gateway.video('test-model'),
        gateway.videoModel('test-model'),
        gateway.reranking('test-model'),
        gateway.rerankingModel('test-model'),
        gateway.decision('test-model'),
        gateway.decisionModel('test-model'),
        gateway.speech('test-model'),
        gateway.speechModel('test-model'),
        gateway.transcription('test-model'),
        gateway.transcriptionModel('test-model'),
        gateway.experimental_speech('test-model'),
        gateway.experimental_transcription('test-model'),
        gateway.experimental_realtime('test-model'),
        gateway.experimental_batch(),
      ];

      for (const model of models) {
        expect(model).toMatchObject({
          config: { baseURL: `https://${region}.ai-gateway.vercel.sh/v4/ai` },
        });
      }
    },
  );

  it('preserves the global default and custom base URLs', () => {
    expect(createGateway()('test-model')).toMatchObject({
      config: { baseURL: 'https://ai-gateway.vercel.sh/v4/ai' },
    });
    expect(
      createGateway({ baseURL: 'https://example.com/custom/' })('test-model'),
    ).toMatchObject({ config: { baseURL: 'https://example.com/custom' } });
  });

  it.each([
    'https://eu.ai-gateway.vercel.sh/v4/ai',
    'https://example.com/v4/ai',
    '',
  ])('rejects baseURL with regionalHosting, including %j', baseURL => {
    expect(() => createGateway({ baseURL, regionalHosting: 'eu' })).toThrow(
      'baseURL and regionalHosting cannot be used together.',
    );
  });

  it.each(['ap', 'EU', '', 'toString', '__proto__', null, 42, {}, ['eu']])(
    'rejects unsupported runtime regionalHosting input %j',
    regionalHosting => {
      expect(() =>
        createGateway({ regionalHosting: regionalHosting as never }),
      ).toThrow('regionalHosting must be one of: au, eu, us.');
    },
  );

  it.each(regions)(
    'uses the %s origin for metadata and credits',
    async region => {
      const fetch = jsonFetch({ models: [], balance: '0', total_used: '0' });
      const gateway = createGateway({
        regionalHosting: region,
        apiKey: 'test-key',
        fetch,
      });

      await gateway.getAvailableModels();
      await gateway.getCredits();

      expect(fetch.mock.calls.map(([url]) => url.toString())).toEqual([
        `https://${region}.ai-gateway.vercel.sh/v4/ai/config`,
        `https://${region}.ai-gateway.vercel.sh/v1/credits`,
      ]);
    },
  );

  it.each(regions)(
    'does not inject request options for the %s endpoint',
    async region => {
      const fetch = jsonFetch({});
      const gateway = createGateway({
        regionalHosting: region,
        apiKey: 'test-key',
        fetch,
      });

      await gateway('test-model').doGenerate({ prompt });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(
        `https://${region}.ai-gateway.vercel.sh/v4/ai/language-model`,
      );
      expect(JSON.parse(init?.body as string)).toEqual({ prompt });
    },
  );

  it.each(regions)(
    'sends provider-executed tools through the %s endpoint without synthesizing inference options',
    async region => {
      const fetch = jsonFetch({});
      const gateway = createGateway({
        regionalHosting: region,
        apiKey: 'test-key',
        fetch,
      });
      const { type, id, args } = gateway.tools.parallelSearch({ mode: 'fast' });
      const tools = [{ type, id, args, name: 'search' }];
      const providerOptions = { gateway: { regionalHosting: region } };

      await gateway('test-model').doGenerate({
        prompt,
        providerOptions,
        tools,
      });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(
        `https://${region}.ai-gateway.vercel.sh/v4/ai/language-model`,
      );
      expect(JSON.parse(init?.body as string)).toEqual({
        prompt,
        providerOptions,
        tools,
      });
    },
  );

  describe.each(['doGenerate', 'doStream'] as const)('%s', method => {
    it.each([
      'au',
      'eu',
      'us',
      { region: 'eu' },
      { region: 'au', pinInference: true },
      { region: 'us', pinInference: false },
    ])(
      'forwards %j without rewriting the URL or inferenceRegion',
      async regionalHosting => {
        const fetch = vi.fn(
          async (_input: string | URL | Request, _init?: RequestInit) =>
            method === 'doGenerate'
              ? Response.json({})
              : new Response(
                  'data: {"type":"text-delta","id":"1","delta":"Hello"}\n\n',
                  {
                    headers: { 'content-type': 'text/event-stream' },
                  },
                ),
        );
        const gateway = createGateway({
          apiKey: 'test-key',
          baseURL: 'https://example.com/v4/ai',
          fetch,
        });
        const providerOptions = {
          gateway: { regionalHosting, inferenceRegion: { geoRegion: 'us' } },
        };

        const result = await gateway('test-model')[method]({
          prompt,
          providerOptions,
        });
        if ('stream' in result) {
          await convertReadableStreamToArray(result.stream);
        }

        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('https://example.com/v4/ai/language-model');
        expect(JSON.parse(init?.body as string)).toEqual({
          prompt,
          providerOptions,
        });
      },
    );
  });

  const serverOnlyIt = typeof globalThis.window === 'undefined' ? it : it.skip;
  serverOnlyIt.each(regions)(
    'uses the %s origin for token minting and WebSocket URLs',
    async region => {
      const fetch = jsonFetch({ token: 'vcst_test' });
      const gateway = createGateway({
        regionalHosting: region,
        apiKey: 'test-key',
        fetch,
      });
      const surfaces = [
        [gateway.experimental_realtime, 'realtime-model'],
        [gateway.experimental_speech, 'speech-model'],
        [gateway.experimental_transcription, 'transcription-model'],
      ] as const;

      for (const [surface, path] of surfaces) {
        const { url } = await surface.getToken({ model: 'test-model' });
        expect(url).toBe(
          `wss://${region}.ai-gateway.vercel.sh/v4/ai/${path}?ai-model-id=test-model`,
        );
      }
      expect(fetch.mock.calls.map(([url]) => url.toString())).toEqual(
        Array(3).fill(
          `https://${region}.ai-gateway.vercel.sh/v1/realtime/client-secrets`,
        ),
      );
    },
  );
});
