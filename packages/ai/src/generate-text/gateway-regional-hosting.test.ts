import { gateway } from '@ai-sdk/gateway';
import type {
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from './generate-text';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

type TextOptions = Pick<
  Parameters<typeof generateText>[0],
  | 'model'
  | 'maxRetries'
  | 'providerOptions'
  | 'tools'
  | 'stopWhen'
  | 'maxOutputTokens'
  | 'temperature'
> & { prompt: string };

const modelId = 'openai/gpt-5';
const directModel = gateway(modelId);
const regions = ['au', 'eu', 'us'] as const;
const globalUrl = 'https://ai-gateway.vercel.sh/v4/ai/language-model';
const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function createResponse(init?: RequestInit, toolCall = false): Response {
  const content: LanguageModelV4Content[] = toolCall
    ? [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'lookup',
          input: '{"city":"Paris"}',
        },
      ]
    : [{ type: 'text', text: 'Hello from Gateway' }];
  const finishReason = toolCall
    ? ({ unified: 'tool-calls', raw: 'tool_calls' } as const)
    : ({ unified: 'stop', raw: 'stop' } as const);

  if (
    new Headers(init?.headers).get('ai-language-model-streaming') === 'true'
  ) {
    const parts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      ...(toolCall
        ? [
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: '{"city":"Paris"}',
            },
          ]
        : [
            { type: 'text-start' as const, id: 'text-1' },
            {
              type: 'text-delta' as const,
              id: 'text-1',
              delta: 'Hello from Gateway',
            },
            { type: 'text-end' as const, id: 'text-1' },
          ]),
      { type: 'finish', usage, finishReason },
    ];

    return new Response(
      parts.map(part => `data: ${JSON.stringify(part)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  }

  return new Response(
    JSON.stringify({ content, finishReason, usage, warnings: [] }),
    { headers: { 'content-type': 'application/json' } },
  );
}

async function runText(
  api: 'generateText' | 'streamText',
  options: TextOptions,
) {
  if (api === 'generateText') {
    return generateText(options);
  }

  const result = streamText(options);
  const chunks: string[] = [];
  for await (const chunk of result.textStream) {
    chunks.push(chunk);
  }
  return { text: chunks.join(''), steps: await result.steps };
}

describe('Gateway per-call regional hosting through core text APIs', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    fetch.mockImplementation(async (_input, init) => createResponse(init));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', undefined);
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function requests() {
    return fetch.mock.calls.map(([url, init]) => ({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    }));
  }

  describe.each(['generateText', 'streamText'] as const)('%s', api => {
    describe.each([
      { name: 'string model', model: modelId },
      { name: 'direct global gateway model', model: directModel },
    ])('$name', ({ model }) => {
      it.each(regions)(
        'uses the %s host and removes only the client-side regional option',
        async regionalHosting => {
          const providerOptions = {
            gateway: {
              regionalHosting,
              order: ['openai'],
              models: ['anthropic/claude-sonnet-4.5'],
              tags: ['regional-hosting-test'],
              user: 'test-user',
              customServiceOption: { enabled: true },
            },
            openai: { store: false },
          };
          const originalOptions = structuredClone(providerOptions);

          const result = await runText(api, {
            model,
            prompt: 'Hello',
            maxOutputTokens: 32,
            temperature: 0.4,
            maxRetries: 0,
            providerOptions,
          });

          expect(result.text).toBe('Hello from Gateway');
          expect(fetch).toHaveBeenCalledOnce();
          const [request] = requests();
          expect(request.url).toBe(
            `https://${regionalHosting}.ai-gateway.vercel.sh/v4/ai/language-model`,
          );
          expect(request.headers.get('authorization')).toBe(
            'Bearer test-api-key',
          );
          expect(request.headers.get('ai-language-model-id')).toBe(modelId);
          expect(request.headers.get('ai-language-model-streaming')).toBe(
            String(api === 'streamText'),
          );
          expect(request.body).toEqual({
            maxOutputTokens: 32,
            temperature: 0.4,
            prompt: [
              { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
            ],
            providerOptions: {
              gateway: {
                order: ['openai'],
                models: ['anthropic/claude-sonnet-4.5'],
                tags: ['regional-hosting-test'],
                user: 'test-user',
                customServiceOption: { enabled: true },
              },
              openai: { store: false },
            },
            toolChoice: { type: 'auto' },
            ...(api === 'streamText'
              ? { includeRawChunks: false }
              : { headers: { 'user-agent': expect.any(String) } }),
          });
          expect(request.body.providerOptions.gateway).not.toHaveProperty(
            'inferenceRegion',
          );
          expect(providerOptions).toEqual(originalOptions);
        },
      );

      it('preserves an explicit inference region without pinning it to the hosting region', async () => {
        await runText(api, {
          model,
          prompt: 'Hello',
          maxRetries: 0,
          providerOptions: {
            gateway: {
              regionalHosting: 'au',
              inferenceRegion: { geoRegion: 'us' },
              zeroDataRetention: true,
            },
          },
        });

        const [request] = requests();
        expect(request.url).toBe(
          'https://au.ai-gateway.vercel.sh/v4/ai/language-model',
        );
        expect(request.body.providerOptions).toEqual({
          gateway: {
            inferenceRegion: { geoRegion: 'us' },
            zeroDataRetention: true,
          },
        });
      });

      it('keeps concurrent regions isolated and leaves subsequent global requests unchanged', async () => {
        const pendingResponses: Array<() => void> = [];
        fetch.mockImplementation(
          (_input, init) =>
            new Promise(resolve => {
              pendingResponses.push(() => resolve(createResponse(init)));
              if (pendingResponses.length === regions.length) {
                for (const respond of pendingResponses.toReversed()) {
                  respond();
                }
              }
            }),
        );

        const results = await Promise.all(
          regions.map(regionalHosting =>
            runText(api, {
              model,
              prompt: regionalHosting,
              maxRetries: 0,
              providerOptions: {
                gateway: { regionalHosting, user: regionalHosting },
              },
            }),
          ),
        );

        expect(results.map(result => result.text)).toEqual(
          regions.map(() => 'Hello from Gateway'),
        );
        expect(requests().map(({ url, body }) => ({ url, body }))).toEqual(
          regions.map(region => ({
            url: `https://${region}.ai-gateway.vercel.sh/v4/ai/language-model`,
            body: {
              prompt: [
                { role: 'user', content: [{ type: 'text', text: region }] },
              ],
              providerOptions: { gateway: { user: region } },
              toolChoice: { type: 'auto' },
              ...(api === 'streamText'
                ? { includeRawChunks: false }
                : { headers: { 'user-agent': expect.any(String) } }),
            },
          })),
        );

        fetch.mockImplementation(async (_input, init) => createResponse(init));
        await runText(api, { model, prompt: 'Global', maxRetries: 0 });
        expect(requests().map(request => request.url)).toEqual([
          ...regions.map(
            region =>
              `https://${region}.ai-gateway.vercel.sh/v4/ai/language-model`,
          ),
          globalUrl,
        ]);
        expect(requests()[3].body).not.toHaveProperty('providerOptions');
      });

      it('uses the same regional endpoint and stripped options on retry', async () => {
        fetch.mockImplementationOnce(async () => {
          return new Response(JSON.stringify({ error: 'Try again' }), {
            status: 503,
            headers: {
              'content-type': 'application/json',
              'retry-after-ms': '0',
            },
          });
        });

        const result = await runText(api, {
          model,
          prompt: 'Hello',
          maxRetries: 1,
          providerOptions: {
            gateway: { regionalHosting: 'eu', user: 'retry' },
          },
        });

        expect(result.text).toBe('Hello from Gateway');
        expect(requests().map(request => request.url)).toEqual([
          'https://eu.ai-gateway.vercel.sh/v4/ai/language-model',
          'https://eu.ai-gateway.vercel.sh/v4/ai/language-model',
        ]);
        expect(requests()[0].body).toEqual(requests()[1].body);
        expect(requests()[1].body.providerOptions).toEqual({
          gateway: { user: 'retry' },
        });
      });

      it('retains regional hosting through an executed tool and the next model step', async () => {
        fetch.mockImplementationOnce(async (_input, init) =>
          createResponse(init, true),
        );
        const execute = vi.fn(async ({ city }: { city: string }) => ({ city }));

        const result = await runText(api, {
          model,
          prompt: 'Look up Paris',
          maxRetries: 0,
          stopWhen: isStepCount(2),
          tools: {
            lookup: {
              inputSchema: jsonSchema<{ city: string }>({
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              }),
              execute,
            },
          },
          providerOptions: {
            gateway: { regionalHosting: 'us', tags: ['multi-step'] },
          },
        });

        expect(result.text).toBe('Hello from Gateway');
        expect(result.steps).toHaveLength(2);
        expect(execute).toHaveBeenCalledOnce();
        expect(execute.mock.calls[0][0]).toEqual({ city: 'Paris' });
        expect(requests().map(request => request.url)).toEqual([
          'https://us.ai-gateway.vercel.sh/v4/ai/language-model',
          'https://us.ai-gateway.vercel.sh/v4/ai/language-model',
        ]);
        for (const request of requests()) {
          expect(request.body.providerOptions).toEqual({
            gateway: { tags: ['multi-step'] },
          });
        }
        expect(requests()[1].body.prompt).toEqual([
          { role: 'user', content: [{ type: 'text', text: 'Look up Paris' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'lookup',
                input: { city: 'Paris' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'lookup',
                output: { type: 'json', value: { city: 'Paris' } },
              },
            ],
          },
        ]);
      });
    });
  });
});
