import {
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import {
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { createMiniMax } from './minimax-provider';
import {
  isMiniMaxM31OrLater,
  MiniMaxM31LanguageModel,
} from './minimax-m31-language-model';
import type { MiniMaxLanguageModelOptions } from './minimax-chat-options';

const modelId = 'MiniMax-M3.1-Flash';
const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createFixture(includeReasoning = true) {
  const requests: Record<string, unknown>[] = [];
  const usage = {
    input_tokens: 5,
    output_tokens: 8,
    cache_creation_input_tokens: 3,
    cache_read_input_tokens: 7,
  };
  const fetch: FetchFunction = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    if (body.stream) {
      const events = [
        {
          type: 'message_start',
          message: {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: modelId,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage,
          },
        },
        ...(includeReasoning
          ? [
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'thinking', thinking: '' },
              },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'thinking_delta', thinking: 'Reasoning' },
              },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'signature_delta', signature: 'sig_test' },
              },
              { type: 'content_block_stop', index: 0 },
            ]
          : []),
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'Answer' },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage,
        },
        { type: 'message_stop' },
      ];
      return new Response(
        events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    return new Response(
      JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: modelId,
        content: [
          ...(includeReasoning
            ? [
                {
                  type: 'thinking',
                  thinking: 'Reasoning',
                  signature: 'sig_test',
                },
              ]
            : []),
          { type: 'text', text: 'Answer' },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage,
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  return {
    fetch,
    provider: createMiniMax({ apiKey: 'test', fetch }),
    requests,
  };
}

async function readStream(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const reader = stream.getReader();
  const parts: LanguageModelV4StreamPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe('MiniMax M3.1 and later', () => {
  it('preserves M3.1 behavior after workflow deserialization', async () => {
    const { fetch, requests } = createFixture();
    const model = MiniMaxM31LanguageModel[WORKFLOW_DESERIALIZE]({
      modelId,
      config: {
        provider: 'minimax.messages',
        baseURL: 'https://api.minimax.io/anthropic/v1',
        headers: {},
        fetch,
      },
    });
    await model.doGenerate({ prompt, reasoning: 'xhigh' });
    expect(requests[0]).toMatchObject({
      max_tokens: 131072,
      output_config: { effort: 'xhigh' },
    });
  });

  it.each([
    'MiniMax-M3.1-Flash',
    'MiniMax-M3.1',
    'minimax-m3.2',
    'MiniMax-M3.10',
    'MiniMax-M4',
    'MiniMax-M4.0-Flash',
  ])('recognizes %s numerically', id => {
    expect(isMiniMaxM31OrLater(id)).toBe(true);
  });
  it.each([
    'MiniMax-M3',
    'minimax-m3.0',
    'minimax-m3-highspeed',
    'MiniMax-M2.7',
    'MiniMax-H3',
    'other-m4',
    'minimax-m3.1invalid',
  ])('does not select older or unrelated models: %s', id => {
    expect(isMiniMaxM31OrLater(id)).toBe(false);
  });

  for (const mode of ['generate', 'stream'] as const) {
    it.each(['low', 'medium', 'high', 'xhigh', 'max', 'minimal'])(
      `${mode}: sends effort %s without a thinking budget`,
      async effort => {
        const { provider, requests } = createFixture();
        const options = { prompt, providerOptions: { minimax: { effort } } };
        if (mode === 'generate') {
          const result = await provider(modelId).doGenerate(options);
          expect(result.content).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: 'reasoning', text: 'Reasoning' }),
              expect.objectContaining({ type: 'text', text: 'Answer' }),
            ]),
          );
          expect(result.warnings).toEqual([]);
        } else {
          const result = await provider(modelId).doStream(options);
          const parts = await readStream(result.stream);
          expect(parts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: 'reasoning-delta',
                delta: 'Reasoning',
              }),
              expect.objectContaining({ type: 'text-delta', delta: 'Answer' }),
            ]),
          );
          expect(parts.find(part => part.type === 'stream-start')).toEqual({
            type: 'stream-start',
            warnings: [],
          });
          expect(parts.some(part => part.type === 'error')).toBe(false);
        }
        expect(requests[0]).toMatchObject({
          model: modelId,
          max_tokens: 131072,
          output_config: { effort: effort === 'minimal' ? 'low' : effort },
        });
        expect(requests[0]).not.toHaveProperty('thinking');
      },
    );

    it(`${mode}: leaves omitted effort at the provider default`, async () => {
      const { provider, requests } = createFixture(false);
      if (mode === 'generate') {
        const result = await provider(modelId).doGenerate({ prompt });
        expect(result.content).toEqual([
          expect.objectContaining({ type: 'text', text: 'Answer' }),
        ]);
      } else {
        const result = await provider(modelId).doStream({ prompt });
        const parts = await readStream(result.stream);
        expect(
          parts.some(
            part => part.type === 'reasoning-delta' || part.type === 'error',
          ),
        ).toBe(false);
      }
      expect(requests[0]).not.toHaveProperty('output_config');
      expect(requests[0]).not.toHaveProperty('thinking');
    });

    it(`${mode}: caps the output budget and reports a warning`, async () => {
      const { provider, requests } = createFixture();
      const options = { prompt, maxOutputTokens: 600000 };
      if (mode === 'generate') {
        const result = await provider(modelId).doGenerate(options);
        expect(result.warnings).toEqual([
          expect.objectContaining({ feature: 'maxOutputTokens' }),
        ]);
      } else {
        const result = await provider(modelId).doStream(options);
        const start = (await readStream(result.stream)).find(
          part => part.type === 'stream-start',
        );
        expect(start).toEqual({
          type: 'stream-start',
          warnings: [expect.objectContaining({ feature: 'maxOutputTokens' })],
        });
      }
      expect(requests[0]?.max_tokens).toBe(524288);
    });

    it(`${mode}: preserves explicit provider settings, tools and cache control`, async () => {
      const { provider, requests } = createFixture();
      const options: LanguageModelV4CallOptions = {
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                providerOptions: {
                  anthropic: { cacheControl: { type: 'ephemeral' } },
                },
              },
            ],
          },
        ],
        maxOutputTokens: 20000,
        providerOptions: {
          anthropic: { effort: 'low', thinking: { type: 'adaptive' } },
          minimax: { effort: 'max' } satisfies MiniMaxLanguageModelOptions,
        },
        tools: [
          {
            type: 'function',
            name: 'lookup',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'auto' },
      };
      if (mode === 'generate') await provider(modelId).doGenerate(options);
      else await readStream((await provider(modelId).doStream(options)).stream);
      expect(requests[0]).toMatchObject({
        max_tokens: 20000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'max' },
        tools: [expect.objectContaining({ name: 'lookup' })],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
      });
    });

    it(`${mode}: preserves image input at the output-budget boundary`, async () => {
      const { provider, requests } = createFixture();
      const options: LanguageModelV4CallOptions = {
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
              },
            ],
          },
        ],
        maxOutputTokens: 524288,
        providerOptions: { minimax: { effort: 'high' } },
      };
      if (mode === 'generate') {
        expect((await provider(modelId).doGenerate(options)).warnings).toEqual(
          [],
        );
      } else {
        const parts = await readStream(
          (await provider(modelId).doStream(options)).stream,
        );
        expect(parts.find(part => part.type === 'stream-start')).toEqual({
          type: 'stream-start',
          warnings: [],
        });
      }
      expect(requests[0]).toMatchObject({
        max_tokens: 524288,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'AQID',
                },
              },
            ],
          },
        ],
      });
    });

    it.each(['disabled', 'enabled'])(
      `${mode}: rejects unsupported thinking %s before fetching`,
      async type => {
        const { provider, requests } = createFixture();
        const options = {
          prompt,
          providerOptions: { minimax: { thinking: { type } } },
        };
        const result =
          mode === 'generate'
            ? provider(modelId).doGenerate(options)
            : provider(modelId).doStream(options);
        await expect(result).rejects.toThrow('only supports adaptive thinking');
        expect(requests).toEqual([]);
      },
    );

    it.each(['none', 'invalid'])(
      `${mode}: rejects invalid provider effort %s`,
      async effort => {
        const { provider, requests } = createFixture();
        const options = { prompt, providerOptions: { minimax: { effort } } };
        const result =
          mode === 'generate'
            ? provider(modelId).doGenerate(options)
            : provider(modelId).doStream(options);
        await expect(result).rejects.toThrow();
        expect(requests).toEqual([]);
      },
    );

    it(`${mode}: does not apply Flash output limits to a future model`, async () => {
      const { provider, requests } = createFixture();
      const options = {
        prompt,
        maxOutputTokens: 600000,
        providerOptions: { minimax: { effort: 'xhigh' } },
      };
      if (mode === 'generate') await provider('MiniMax-M4').doGenerate(options);
      else
        await readStream(
          (await provider('MiniMax-M4').doStream(options)).stream,
        );
      expect(requests[0]).toMatchObject({
        model: 'MiniMax-M4',
        max_tokens: 600000,
        output_config: { effort: 'xhigh' },
      });
    });
  }

  for (const mode of ['generate', 'stream'] as const) {
    it.each(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
      `${mode}: maps top-level reasoning %s to effort`,
      async reasoning => {
        const { provider, requests } = createFixture();
        const options = { prompt, reasoning };
        if (mode === 'generate') await provider(modelId).doGenerate(options);
        else
          await readStream((await provider(modelId).doStream(options)).stream);
        expect(requests[0]).toMatchObject({
          output_config: {
            effort: reasoning === 'minimal' ? 'low' : reasoning,
          },
        });
        expect(requests[0]).not.toHaveProperty('thinking');
      },
    );
    it(`${mode}: rejects top-level reasoning none`, async () => {
      const { provider, requests } = createFixture();
      const options = { prompt, reasoning: 'none' as const };
      const result =
        mode === 'generate'
          ? provider(modelId).doGenerate(options)
          : provider(modelId).doStream(options);
      await expect(result).rejects.toThrow('reasoning cannot be disabled');
      expect(requests).toEqual([]);
    });
    it(`${mode}: provider effort takes precedence over top-level reasoning`, async () => {
      const { provider, requests } = createFixture();
      const options = {
        prompt,
        reasoning: 'low' as const,
        providerOptions: { minimax: { effort: 'max' } },
      };
      if (mode === 'generate') await provider(modelId).doGenerate(options);
      else await readStream((await provider(modelId).doStream(options)).stream);
      expect(requests[0]).toMatchObject({ output_config: { effort: 'max' } });
    });
  }
});

describe('older MiniMax model compatibility', () => {
  for (const mode of ['generate', 'stream'] as const) {
    it.each([
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2.7-highspeed',
      'minimax-m2.5',
      'minimax-m2.5-highspeed',
      'minimax-m2.1',
      'minimax-m2.1-highspeed',
      'minimax-m2',
    ])(`${mode}: preserves %s wire behavior`, async id => {
      for (const thinking of [
        undefined,
        { type: 'adaptive' },
        { type: 'disabled' },
      ]) {
        const { provider, fetch, requests } = createFixture();
        const reference = new AnthropicLanguageModel(id, {
          provider: 'minimax.messages',
          baseURL: 'https://api.minimax.io/anthropic/v1',
          headers: {},
          fetch,
        });
        const options = { prompt, providerOptions: { minimax: { thinking } } };
        if (mode === 'generate') {
          const actual = await provider(id).doGenerate(options);
          const expected = await reference.doGenerate(options);
          expect(actual.content).toEqual(expected.content);
          expect(actual.usage).toEqual(expected.usage);
          expect(actual.warnings).toEqual(expected.warnings);
        } else {
          const actual = await readStream(
            (await provider(id).doStream(options)).stream,
          );
          const expected = await readStream(
            (await reference.doStream(options)).stream,
          );
          expect(actual).toEqual(expected);
        }
        expect(requests[0]).toEqual(requests[1]);
      }
    });
  }
});
