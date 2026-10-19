import type { LanguageModelV4FilePart } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMiniMax } from './minimax-provider';
import { MiniMaxChatLanguageModel } from './minimax-chat-language-model';

const provider = createMiniMax({ apiKey: 'test-key' });
const model = provider('minimax-m3.1-flash');
const url = 'https://api.minimax.io/anthropic/v1/messages';

describe('MiniMax M3.1 Flash media input', () => {
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

  it('advertises native image/video URLs only for Flash', () => {
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

  it('does not enable video input for other model IDs', async () => {
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
