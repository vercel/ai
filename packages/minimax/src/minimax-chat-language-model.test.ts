import type {
  LanguageModelV4CallOptions,
  LanguageModelV4FilePart,
  LanguageModelV4Prompt,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  minimaxLanguageModelOptions,
  type MiniMaxLanguageModelOptions,
  type MiniMaxCacheControlOptions,
} from './minimax-chat-language-model-options';
import { createMiniMax } from './minimax-provider';
import { MiniMaxChatLanguageModel } from './minimax-chat-language-model';

// MiniMax-specific behavior: the provider delegates to the Anthropic message
// protocol, so `thinking` must flow through the `minimax` provider-options
// namespace to the request, and the response `thinking` block must surface as
// an AI SDK reasoning part

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMiniMax({ apiKey: 'test-api-key' });
const url = 'https://api.minimax.io/anthropic/v1/messages';

describe('MiniMax reasoning', () => {
  const server = createTestServer({
    'https://api.minimax.io/anthropic/v1/messages': {},
  });

  describe('M3.1 Flash top-level reasoning', () => {
    beforeEach(() => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'json-value',
        body: {
          type: 'message',
          content: [{ type: 'text', text: 'Hello!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 4, output_tokens: 10 },
        },
      };
    });

    it.each([
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'xhigh'],
      ['max', 'max'],
      ['none', 'low'],
    ] as const)('maps %s to effort %s', async (reasoning, effort) => {
      const result = await provider('minimax-m3.1-flash').doGenerate({
        prompt: TEST_PROMPT,
        reasoning,
        maxOutputTokens: 16384,
        temperature: 1,
        topP: 0.95,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        output_config: { effort },
        max_tokens: 16384,
        temperature: 1,
        top_p: 0.95,
      });
      expect(body.thinking).toBeUndefined();
      if (reasoning === 'minimal' || reasoning === 'none') {
        expect(result.warnings).toEqual([
          expect.objectContaining({
            type: 'compatibility',
            feature: 'reasoning',
            details: expect.stringContaining('low'),
          }),
        ]);
      } else {
        expect(result.warnings).toEqual([]);
      }
    });

    it.each([undefined, 'provider-default'] as const)(
      'preserves the server default for %s',
      async reasoning => {
        await provider('minimax-m3.1-flash').doGenerate({
          prompt: TEST_PROMPT,
          reasoning,
          maxOutputTokens: 16384,
        });

        const body = await server.calls[0].requestBodyJson;
        expect(body.output_config).toBeUndefined();
        expect(body.thinking).toBeUndefined();
      },
    );

    it.each(['minimax', 'anthropic'])(
      'preserves explicit %s effort over top-level reasoning',
      async namespace => {
        const result = await provider('minimax-m3.1-flash').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
          maxOutputTokens: 16384,
          providerOptions: { [namespace]: { effort: 'max' } },
        });

        const body = await server.calls[0].requestBodyJson;
        expect(body.output_config).toEqual({ effort: 'max' });
        expect(body.thinking).toBeUndefined();
        expect(result.warnings).toEqual([]);
      },
    );

    it('recognizes the canonical mixed-case model ID', async () => {
      await provider('MiniMax-M3.1-Flash').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
        maxOutputTokens: 16384,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'MiniMax-M3.1-Flash',
        output_config: { effort: 'high' },
      });
    });

    it('preserves MiniMax reasoning handling after workflow serialization', async () => {
      const model = provider('minimax-m3.1-flash') as MiniMaxChatLanguageModel;
      const serialized = MiniMaxChatLanguageModel[WORKFLOW_SERIALIZE](model);
      const restored = MiniMaxChatLanguageModel[WORKFLOW_DESERIALIZE]({
        modelId: serialized.modelId,
        config: {
          ...serialized.config,
          provider: model.provider,
          baseURL: 'https://api.minimax.io/anthropic/v1',
        },
      });

      await restored.doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
        maxOutputTokens: 16384,
      });

      expect(restored).toBeInstanceOf(MiniMaxChatLanguageModel);
      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toEqual({ effort: 'high' });
      expect(body.thinking).toBeUndefined();
    });

    it('does not change reasoning handling for M3', async () => {
      await provider('minimax-m3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'none',
        maxOutputTokens: 16384,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.output_config).toBeUndefined();
    });

    it('maps reasoning and reports fallback warnings when streaming', async () => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          'data: {"type":"message_start","message":{"id":"msg_flash","model":"minimax-m3.1-flash","usage":{"input_tokens":4,"output_tokens":0}}}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":0}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ],
      };

      const result = await provider('minimax-m3.1-flash').doStream({
        prompt: TEST_PROMPT,
        reasoning: 'none',
        maxOutputTokens: 16384,
      });

      const parts = await convertReadableStreamToArray(result.stream);
      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toEqual({ effort: 'low' });
      expect(body.thinking).toBeUndefined();
      expect(parts).toContainEqual({
        type: 'stream-start',
        warnings: [
          expect.objectContaining({
            type: 'compatibility',
            feature: 'reasoning',
          }),
        ],
      });
      expect(parts.some(part => part.type === 'error')).toBe(false);
    });
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'sends M3.1 Flash effort %s through the public MiniMax options',
    async effort => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'json-value',
        body: {
          id: 'msg_minimax_effort',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'minimax-m3.1-flash',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 10 },
        },
      };

      const options = { effort } satisfies MiniMaxLanguageModelOptions;

      await provider('minimax-m3.1-flash').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          minimax: minimaxLanguageModelOptions.parse(options),
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'minimax-m3.1-flash',
        output_config: { effort },
      });
    },
  );

  it('sends thinking via the minimax provider option and returns a reasoning part', async () => {
    server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
      type: 'json-value',
      body: {
        id: 'msg_minimax_reasoning',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Counting the letters...',
            signature: 'sig_123',
          },
          { type: 'text', text: 'There are 3 "r"s.' },
        ],
        model: 'minimax-m3',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 30 },
      },
    };

    const result = await provider('minimax-m3').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        minimax: {
          thinking: { type: 'adaptive' },
        },
      },
    });

    // The thinking option flows to the request under the Anthropic contract.
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'minimax-m3',
      thinking: { type: 'adaptive' },
    });

    // The thinking block surfaces as a reasoning part, ahead of the text part.
    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'reasoning',
        text: 'Counting the letters...',
      }),
      expect.objectContaining({ type: 'text', text: 'There are 3 "r"s.' }),
    ]);
  });
});

describe('MiniMax M3.1 Flash media input', () => {
  const model = provider('minimax-m3.1-flash');
  const server = createTestServer({ [url]: {} });

  beforeEach(() => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        type: 'message',
        content: [{ type: 'text', text: 'A cat.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 3 },
      },
    };
  });

  async function generate(file: LanguageModelV4FilePart) {
    return model.doGenerate({
      maxOutputTokens: 1000,
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Describe.' }, file] },
      ],
    });
  }

  it.each([
    {
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      source: { type: 'base64', media_type: 'video/mp4', data: 'AQID' },
    },
    {
      data: { type: 'data', data: 'AQID' },
      source: { type: 'base64', media_type: 'video/mp4', data: 'AQID' },
    },
    {
      data: { type: 'url', url: new URL('https://example.com/video.mp4') },
      source: { type: 'url', url: 'https://example.com/video.mp4' },
    },
    {
      data: { type: 'reference', reference: { minimax: '123' } },
      source: { type: 'url', url: 'mm_file://123' },
    },
    {
      data: { type: 'reference', reference: { minimax: 'mm_file://123' } },
      source: { type: 'url', url: 'mm_file://123' },
    },
  ] satisfies Array<{ data: LanguageModelV4FilePart['data']; source: object }>)(
    'converts video $data.type sources',
    async ({ data, source }) => {
      const result = await generate({
        type: 'file',
        mediaType: 'video/mp4',
        data,
        providerOptions: { minimax: { fps: 1 } },
      });
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe.' },
            { type: 'video', source: { ...source, fps: 1 } },
          ],
        },
      ];
      expect(await server.calls[0].requestBodyJson).toMatchObject({ messages });
      expect(result.request?.body).toMatchObject({ messages });
      expect(result.content).toContainEqual({ type: 'text', text: 'A cat.' });
      expect(server.calls[0].requestHeaders['anthropic-beta']).toBeUndefined();
    },
  );

  it.each(['low', 'default', 'high'] as const)(
    'forwards image detail %s',
    async detail => {
      await generate({
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'AQID' },
        providerOptions: { minimax: { detail } },
      });
      expect(
        (await server.calls[0].requestBodyJson).messages[0].content[1],
      ).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'AQID',
          detail,
        },
      });
    },
  );

  it('forwards image URLs and leaves detail at the server default when omitted', async () => {
    await generate({
      type: 'file',
      mediaType: 'image/png',
      data: { type: 'url', url: new URL('https://example.com/image.png') },
    });
    expect(
      (await server.calls[0].requestBodyJson).messages[0].content[1],
    ).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://example.com/image.png' },
    });
  });

  it('leaves fps at the server default when omitted', async () => {
    await generate({
      type: 'file',
      mediaType: 'video/mp4',
      data: { type: 'data', data: 'AQID' },
    });
    expect(
      (await server.calls[0].requestBodyJson).messages[0].content[1].source,
    ).not.toHaveProperty('fps');
  });

  it.each([0.2, 5])('accepts boundary fps %s', async fps => {
    await generate({
      type: 'file',
      mediaType: 'video/mp4',
      data: { type: 'data', data: 'AQID' },
      providerOptions: { minimax: { fps } },
    });
    expect(
      (await server.calls[0].requestBodyJson).messages[0].content[1].source.fps,
    ).toBe(fps);
  });

  it.each([0, 0.1, 5.1, '1'])(
    'rejects invalid fps %s before sending',
    async fps => {
      await expect(
        generate({
          type: 'file',
          mediaType: 'video/mp4',
          data: { type: 'data', data: 'AQID' },
          providerOptions: { minimax: { fps } },
        }),
      ).rejects.toThrow();
      expect(server.calls).toHaveLength(0);
    },
  );

  it('rejects unsupported image detail', async () => {
    await expect(
      generate({
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'AQID' },
        providerOptions: { minimax: { detail: 'auto' } },
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it('requires a MiniMax file reference', async () => {
    await expect(
      generate({
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'reference', reference: { anthropic: 'file_123' } },
      }),
    ).rejects.toMatchObject({ name: 'AI_NoSuchProviderReferenceError' });
    expect(server.calls).toHaveLength(0);
  });

  it('keeps media in order across merged user messages and preserves reasoning options', async () => {
    await model.doGenerate({
      maxOutputTokens: 1000,
      reasoning: 'high',
      prompt: [
        { role: 'system', content: 'Analyze the media.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'AQID' },
              providerOptions: { minimax: { detail: 'high' } },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'reference', reference: { minimax: '456' } },
              providerOptions: { minimax: { fps: 2 } },
            },
            { type: 'text', text: 'Last' },
          ],
        },
      ],
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'First' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'AQID',
          detail: 'high',
        },
      },
      { type: 'video', source: { type: 'url', url: 'mm_file://456', fps: 2 } },
      { type: 'text', text: 'Last' },
    ]);
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(body.system).toEqual([{ type: 'text', text: 'Analyze the media.' }]);
  });

  it('keeps media separate across concurrent calls on the same model', async () => {
    await Promise.all(
      ['first', 'second'].map(id =>
        generate({
          type: 'file',
          mediaType: 'video/mp4',
          data: { type: 'reference', reference: { minimax: id } },
        }),
      ),
    );
    const bodies = await Promise.all(
      server.calls.map(call => call.requestBodyJson),
    );
    expect(
      bodies.map(body => body.messages[0].content[1].source.url).sort(),
    ).toEqual(['mm_file://first', 'mm_file://second']);
  });

  it('sends video when streaming and exposes the actual request body', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"type":"message_start","message":{"id":"msg_media","model":"minimax-m3.1-flash","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":0}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ],
    };
    const result = await model.doStream({
      maxOutputTokens: 1000,
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'data', data: 'AQID' },
              providerOptions: { minimax: { fps: 1 } },
            },
          ],
        },
      ],
    });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.some(part => part.type === 'error')).toBe(false);
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'video',
            source: {
              type: 'base64',
              media_type: 'video/mp4',
              data: 'AQID',
              fps: 1,
            },
          },
        ],
      },
    ];
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      stream: true,
      messages,
    });
    expect(result.request?.body).toMatchObject({ messages });
  });

  it('advertises native image/video URLs for M3.1 but not M3', () => {
    expect(model.supportedUrls).toEqual({
      'image/*': [/^https?:\/\//],
      'video/*': [/^https?:\/\//],
    });
    expect(provider('MiniMax-M3.1-Flash').supportedUrls).toEqual(
      model.supportedUrls,
    );
    expect(provider('minimax-m3').supportedUrls).toEqual({});
  });

  it('preserves media conversion after workflow serialization', async () => {
    const serialized = MiniMaxChatLanguageModel[WORKFLOW_SERIALIZE](
      model as MiniMaxChatLanguageModel,
    );
    const restored = MiniMaxChatLanguageModel[WORKFLOW_DESERIALIZE]({
      modelId: serialized.modelId,
      config: {
        ...serialized.config,
        provider: model.provider,
        baseURL: 'https://api.minimax.io/anthropic/v1',
      },
    });

    await restored.doGenerate({
      maxOutputTokens: 1000,
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'reference', reference: { minimax: '123' } },
              providerOptions: { minimax: { fps: 1 } },
            },
          ],
        },
      ],
    });

    expect((await server.calls[0].requestBodyJson).messages[0].content).toEqual(
      [
        {
          type: 'video',
          source: { type: 'url', url: 'mm_file://123', fps: 1 },
        },
      ],
    );
  });

  it('does not enable video input for M3', async () => {
    await expect(
      provider('minimax-m3').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'video/mp4',
                data: { type: 'data', data: 'AQID' },
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ name: 'AI_UnsupportedFunctionalityError' });
    expect(server.calls).toHaveLength(0);
  });
});

describe.each(['generate', 'stream'] as const)(
  'MiniMax chat options (%s)',
  mode => {
    const server = createTestServer({ [url]: {} });

    async function call(
      options: Partial<LanguageModelV4CallOptions> = {},
      modelId = 'minimax-m3.1-flash',
    ) {
      const model = provider(modelId);
      const callOptions: LanguageModelV4CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        maxOutputTokens: 1000,
        ...options,
      };
      let warnings: SharedV4Warning[];

      if (mode === 'generate') {
        server.urls[url].response = {
          type: 'json-value',
          body: {
            type: 'message',
            content: [{ type: 'text', text: 'Hello!' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 3 },
          },
        };
        const result = await model.doGenerate(callOptions);
        warnings = result.warnings;
      } else {
        server.urls[url].response = {
          type: 'stream-chunks',
          chunks: [
            'data: {"type":"message_start","message":{"id":"msg_sampling","model":"minimax-m3.1-flash","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
            'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":0}}\n\n',
            'data: {"type":"message_stop"}\n\n',
          ],
        };
        const result = await model.doStream(callOptions);
        const parts = await convertReadableStreamToArray(result.stream);
        expect(parts.some(part => part.type === 'error')).toBe(false);
        const start = parts.find(part => part.type === 'stream-start');
        expect(start).toBeDefined();
        warnings = start!.warnings;
      }

      return { body: await server.calls[0].requestBodyJson, warnings };
    }

    describe('M3.1 and later model versions', () => {
      it.each([
        'minimax-m3.1',
        'MiniMax-M3.1-Flash-Preview',
        'minimax-m3.1.1',
        'minimax-m3.2',
        'minimax-m3.10-flash',
        'minimax-m3.123-flash',
        'minimax-m4',
        'MiniMax-M4.0-Highspeed',
        'minimax-m10',
      ])(
        'applies reasoning, sampling, media, and caching capabilities to %s',
        async modelId => {
          const { body, warnings } = await call(
            {
              reasoning: 'high',
              temperature: 2,
              topP: 0.9,
              providerOptions: { minimax: { thinking: { type: 'adaptive' } } },
              prompt: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Reference.',
                      providerOptions: {
                        minimax: { cacheControl: { type: 'ephemeral' } },
                      },
                    },
                    {
                      type: 'file',
                      mediaType: 'image/png',
                      data: {
                        type: 'url',
                        url: new URL('https://example.com/image.png'),
                      },
                      providerOptions: { minimax: { detail: 'high' } },
                    },
                    {
                      type: 'file',
                      mediaType: 'video/mp4',
                      data: {
                        type: 'reference',
                        reference: { minimax: '123' },
                      },
                      providerOptions: { minimax: { fps: 1 } },
                    },
                  ],
                },
              ],
            },
            modelId,
          );
          expect(body).toMatchObject({
            model: modelId,
            temperature: 2,
            top_p: 0.9,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          });
          expect(body.messages[0].content).toEqual([
            {
              type: 'text',
              text: 'Reference.',
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'image',
              source: {
                type: 'url',
                url: 'https://example.com/image.png',
                detail: 'high',
              },
            },
            {
              type: 'video',
              source: { type: 'url', url: 'mm_file://123', fps: 1 },
            },
          ]);
          expect(provider(modelId).supportedUrls).toEqual({
            'image/*': [/^https?:\/\//],
            'video/*': [/^https?:\/\//],
          });
          expect(warnings).toEqual([]);
        },
      );

      it.each(['minimax-m3.2', 'minimax-m4'])(
        'maps reasoning none to low effort for %s',
        async modelId => {
          const { body, warnings } = await call({ reasoning: 'none' }, modelId);
          expect(body.output_config).toEqual({ effort: 'low' });
          expect(body.thinking).toBeUndefined();
          expect(warnings).toEqual([
            expect.objectContaining({
              type: 'compatibility',
              feature: 'reasoning',
            }),
          ]);
        },
      );

      it.each([
        'minimax-m3',
        'minimax-m3.0-flash',
        'minimax-m2.99',
        'custom-model',
        'other-minimax-m4',
        'minimax-m3.1oops',
        'minimax-m4oops',
      ])(
        'does not opt older or unrecognized model IDs into the new capabilities: %s',
        async modelId => {
          const { body, warnings } = await call(
            {
              temperature: 1.5,
              prompt: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Reference.',
                      providerOptions: {
                        minimax: { cacheControl: { type: 'ephemeral' } },
                      },
                    },
                  ],
                },
              ],
            },
            modelId,
          );
          expect(body.temperature).toBe(1);
          expect(body.messages[0].content[0]).not.toHaveProperty(
            'cache_control',
          );
          expect(provider(modelId).supportedUrls).toEqual({});
          expect(warnings).toEqual([
            expect.objectContaining({ feature: 'temperature' }),
          ]);
        },
      );
    });

    describe('prompt caching', () => {
      const cacheOptions = {
        cacheControl: { type: 'ephemeral' },
      } satisfies MiniMaxCacheControlOptions;

      it('forwards cache control on system messages and individual text blocks', async () => {
        const prompt: LanguageModelV4Prompt = [
          {
            role: 'system',
            content: 'Stable instructions.',
            providerOptions: { minimax: cacheOptions },
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Stable reference.',
                providerOptions: { minimax: cacheOptions },
              },
              { type: 'text', text: 'Changing question.' },
            ],
          },
        ];
        const original = structuredClone(prompt);
        const { body, warnings } = await call({ prompt });

        expect(body.system).toEqual([
          {
            type: 'text',
            text: 'Stable instructions.',
            cache_control: { type: 'ephemeral' },
          },
        ]);
        expect(body.messages[0].content).toEqual([
          {
            type: 'text',
            text: 'Stable reference.',
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: 'Changing question.' },
        ]);
        expect(warnings).toEqual([]);
        expect(prompt).toEqual(original);
      });

      it('applies message cache control to the final block', async () => {
        const { body, warnings } = await call({
          prompt: [
            {
              role: 'user',
              providerOptions: { minimax: cacheOptions },
              content: [
                { type: 'text', text: 'First.' },
                { type: 'text', text: 'Last.' },
              ],
            },
          ],
        });
        expect(body.messages[0].content).toEqual([
          { type: 'text', text: 'First.' },
          { type: 'text', text: 'Last.', cache_control: { type: 'ephemeral' } },
        ]);
        expect(warnings).toEqual([]);
      });

      it.each(['cacheControl', 'cache_control'])(
        'prefers minimax.%s over the anthropic namespace',
        async key => {
          const { body, warnings } = await call({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Reference.',
                    providerOptions: {
                      minimax: { [key]: { type: 'ephemeral' } },
                      anthropic: {
                        cacheControl: { type: 'ephemeral', ttl: '1h' },
                      },
                    },
                  },
                ],
              },
            ],
          });
          expect(body.messages[0].content[0].cache_control).toEqual({
            type: 'ephemeral',
          });
          expect(warnings).toEqual([]);
        },
      );

      it.each(['cacheControl', 'cache_control'])(
        'falls back to anthropic.%s when minimax has no cache setting',
        async key => {
          const { body, warnings } = await call({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Reference.',
                    providerOptions: {
                      minimax: {},
                      anthropic: { [key]: { type: 'ephemeral' } },
                    },
                  },
                ],
              },
            ],
          });
          expect(body.messages[0].content[0].cache_control).toEqual({
            type: 'ephemeral',
          });
          expect(warnings).toEqual([]);
        },
      );

      it('counts one breakpoint per block across both namespaces', async () => {
        const { body, warnings } = await call({
          prompt: [
            {
              role: 'user',
              content: Array.from({ length: 5 }, (_, index) => ({
                type: 'text',
                text: `Reference ${index}.`,
                providerOptions: {
                  minimax: cacheOptions,
                  anthropic: cacheOptions,
                },
              })),
            },
          ],
        });
        expect(
          body.messages[0].content.map(
            (part: { cache_control?: unknown }) => part.cache_control,
          ),
        ).toEqual([
          { type: 'ephemeral' },
          { type: 'ephemeral' },
          { type: 'ephemeral' },
          { type: 'ephemeral' },
          undefined,
        ]);
        expect(warnings).toEqual([
          expect.objectContaining({ feature: 'cacheControl breakpoint limit' }),
        ]);
      });

      it('does not add cache control when no marker is supplied', async () => {
        const { body, warnings } = await call();
        expect(body.messages[0].content[0]).not.toHaveProperty('cache_control');
        expect(warnings).toEqual([]);
      });

      it.each(['minimax-m3', 'MiniMax-M2.7'])(
        'keeps the existing cache namespace behavior for %s',
        async modelId => {
          const { body, warnings } = await call(
            {
              prompt: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'MiniMax marker.',
                      providerOptions: { minimax: cacheOptions },
                    },
                    {
                      type: 'text',
                      text: 'Anthropic marker.',
                      providerOptions: { anthropic: cacheOptions },
                    },
                  ],
                },
              ],
            },
            modelId,
          );
          expect(body.messages[0].content).toEqual([
            { type: 'text', text: 'MiniMax marker.' },
            {
              type: 'text',
              text: 'Anthropic marker.',
              cache_control: { type: 'ephemeral' },
            },
          ]);
          expect(warnings).toEqual([]);
        },
      );
    });

    describe('sampling', () => {
      it.each([0, 0.5, 1.5, 2])(
        'preserves temperature %s and topP with default thinking',
        async temperature => {
          const { body, warnings } = await call({ temperature, topP: 0.9 });
          expect(body).toMatchObject({ temperature, top_p: 0.9 });
          expect(warnings).toEqual([]);
        },
      );

      it.each(['minimax', 'anthropic'])(
        'preserves sampling with explicit adaptive thinking in %s options',
        async namespace => {
          const { body, warnings } = await call({
            temperature: 1.5,
            topP: 0.9,
            providerOptions: {
              [namespace]: { thinking: { type: 'adaptive' } },
            },
          });
          expect(body).toMatchObject({
            temperature: 1.5,
            top_p: 0.9,
            thinking: { type: 'adaptive' },
          });
          expect(warnings).toEqual([]);
        },
      );

      it('preserves sampling with top-level reasoning and the canonical model ID', async () => {
        const { body, warnings } = await call(
          { temperature: 2, topP: 0.8, reasoning: 'high' },
          'MiniMax-M3.1-Flash',
        );
        expect(body).toMatchObject({
          temperature: 2,
          top_p: 0.8,
          output_config: { effort: 'high' },
        });
        expect(warnings).toEqual([]);
      });

      it('leaves omitted sampling parameters unset with adaptive thinking', async () => {
        const { body, warnings } = await call({
          providerOptions: { minimax: { thinking: { type: 'adaptive' } } },
        });
        expect(body.temperature).toBeUndefined();
        expect(body.top_p).toBeUndefined();
        expect(warnings).toEqual([]);
      });

      it.each([
        { temperature: -0.5, expected: 0 },
        { temperature: 2.5, expected: 2 },
      ])(
        'clamps temperature $temperature to $expected',
        async ({ temperature, expected }) => {
          const { body, warnings } = await call({
            temperature,
            topP: 0.9,
            providerOptions: { minimax: { thinking: { type: 'adaptive' } } },
          });
          expect(body).toMatchObject({ temperature: expected, top_p: 0.9 });
          expect(warnings).toEqual([
            {
              type: 'unsupported',
              feature: 'temperature',
              details: expect.stringContaining('minimax'),
            },
          ]);
        },
      );

      it.each(['minimax-m3', 'MiniMax-M2.7'])(
        'preserves existing sampling behavior for %s',
        async modelId => {
          const { body, warnings } = await call({ temperature: 1.5 }, modelId);
          expect(body.temperature).toBe(1);
          expect(warnings).toContainEqual(
            expect.objectContaining({ feature: 'temperature' }),
          );
        },
      );

      it.each(['minimax-m3', 'MiniMax-M2.7'])(
        'preserves sampling restrictions with adaptive thinking for %s',
        async modelId => {
          const { body, warnings } = await call(
            {
              temperature: 0.5,
              topP: 0.9,
              providerOptions: { minimax: { thinking: { type: 'adaptive' } } },
            },
            modelId,
          );
          expect(body.temperature).toBeUndefined();
          expect(body.top_p).toBeUndefined();
          expect(
            warnings.map(warning => 'feature' in warning && warning.feature),
          ).toEqual(['temperature', 'topP']);
        },
      );
    });
  },
);
