import { describe, expect, it } from 'vitest';
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';

describe('user messages', () => {
  it('should convert a text-only user message to string content', async () => {
    const result = await convertToMoonshotAIChatMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert image data parts to image_url data URIs', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1, 2, 3]) },
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it.each([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/heic',
    'image/heif',
  ])('should accept the supported image media type %s', async mediaType => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1]) },
            mediaType,
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,AAE=` },
          },
        ],
      },
    ]);
  });

  it('should pass through image URLs', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'url' as const,
              url: new URL('https://example.com/image.jpg'),
            },
            mediaType: 'image/*',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.jpg' },
          },
        ],
      },
    ]);
  });

  it('should convert video data parts to video_url data URIs', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video' },
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1, 2, 3]) },
            mediaType: 'video/mp4',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video' },
          {
            type: 'video_url',
            video_url: { url: 'data:video/mp4;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it.each([
    'video/mp4',
    'video/mpeg',
    'video/mov',
    'video/avi',
    'video/x-flv',
    'video/mpg',
    'video/webm',
    'video/wmv',
    'video/3gpp',
  ])('should accept the supported video media type %s', async mediaType => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1]) },
            mediaType,
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: `data:${mediaType};base64,AAE=` },
          },
        ],
      },
    ]);
  });

  it('should pass through video URLs', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'url' as const,
              url: new URL('https://example.com/video.mp4'),
            },
            mediaType: 'video/*',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: 'https://example.com/video.mp4' },
          },
        ],
      },
    ]);
  });

  it('should pass through ms:// file references from the Files API', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'url' as const,
              url: new URL('ms://file-abc123'),
            },
            mediaType: 'video/mp4',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: 'ms://file-abc123' },
          },
        ],
      },
    ]);
  });

  it('should decode text/* file parts into text parts', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'data' as const,
              data: Buffer.from('hello markdown').toString('base64'),
            },
            mediaType: 'text/markdown',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello markdown' }] },
    ]);
  });

  it('should throw for audio file parts (rejected by the API)', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'audio/mp3',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type audio/mp3' functionality not supported",
    );
  });

  it('should throw for unsupported image media types', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'image/svg+xml',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type image/svg+xml' functionality not supported",
    );
  });

  it('should throw for unsupported video media types', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'video/ogg',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type video/ogg' functionality not supported",
    );
  });

  it('should throw for PDF file parts (rejected by the API)', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'application/pdf',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type application/pdf' functionality not supported",
    );
  });

  it('should throw for unsupported file types', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'application/zip',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type application/zip' functionality not supported",
    );
  });

  it.each([
    {
      mediaType: 'image/png',
      reference: 'file-image-123',
      expected: {
        type: 'image_url',
        image_url: { url: 'ms://file-image-123' },
      },
    },
    {
      mediaType: 'video/*',
      reference: 'ms://file-video-123',
      expected: {
        type: 'video_url',
        video_url: { url: 'ms://file-video-123' },
      },
    },
  ])(
    'should convert $mediaType provider references to native URLs',
    async ({ mediaType, reference, expected }) => {
      expect(
        await convertToMoonshotAIChatMessages([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: {
                  type: 'reference' as const,
                  reference: { moonshotai: reference },
                },
                mediaType,
              },
            ],
          },
        ]),
      ).toEqual([{ role: 'user', content: [expected] }]);
    },
  );

  it('should throw for foreign provider references', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { openai: 'file-123' },
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "No provider reference found for provider 'moonshotai'. Available providers: openai",
    );
  });

  it('should throw for provider references with unsupported media types', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { moonshotai: 'file-123' },
              },
              mediaType: 'application/pdf',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'file part media type application/pdf' functionality not supported",
    );
  });

  it('should convert text file parts to text content', async () => {
    expect(
      await convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'text' as const, text: 'hello' },
              mediaType: 'text/plain',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ]);
  });
});

describe('system messages', () => {
  it('should pass system messages through', async () => {
    const result = await convertToMoonshotAIChatMessages([
      { role: 'system', content: 'You are Kimi.' },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'You are Kimi.' }]);
  });
});

describe('message names', () => {
  it('should serialize names for system, user, and assistant messages', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'system',
        content: 'You are Kimi.',
        providerOptions: { moonshotai: { name: 'guide' } },
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        providerOptions: { moonshotai: { name: 'alice' } },
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
        providerOptions: { moonshotai: { name: 'helper' } },
      },
    ]);

    expect(result).toEqual([
      { role: 'system', content: 'You are Kimi.', name: 'guide' },
      { role: 'user', content: 'Hello', name: 'alice' },
      {
        role: 'assistant',
        content: 'Hi',
        name: 'helper',
        tool_calls: undefined,
      },
    ]);
  });

  it('should reject invalid names through provider option parsing', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerOptions: { moonshotai: { name: 123 } },
        },
      ]),
    ).rejects.toThrow('invalid moonshotai provider options');
  });

  it('should reject names on tool messages', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'tool',
          content: [],
          providerOptions: { moonshotai: { name: 'tool' } },
        },
      ]),
    ).rejects.toThrow(
      "'message names on tool messages' functionality not supported",
    );
  });
});

describe('assistant messages', () => {
  it('should serialize partial true on the final assistant message', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Return a JSON object.' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: '{' }],
        providerOptions: { moonshotai: { partial: true } },
      },
    ]);

    expect(result.at(-1)).toEqual({
      role: 'assistant',
      content: '{',
      partial: true,
      tool_calls: undefined,
    });
  });

  it('should reject partial on a non-final assistant message', async () => {
    await expect(
      convertToMoonshotAIChatMessages([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'prefix' }],
          providerOptions: { moonshotai: { partial: true } },
        },
        { role: 'user', content: [{ type: 'text', text: 'continue' }] },
      ]),
    ).rejects.toThrow(
      'Moonshot Partial Mode requires the partial assistant message to be the final message.',
    );
  });

  it('should reject partial with a JSON response format', async () => {
    await expect(
      convertToMoonshotAIChatMessages(
        [
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: { moonshotai: { partial: true } },
          },
        ],
        { type: 'json' },
      ),
    ).rejects.toThrow(
      'Moonshot Partial Mode cannot be combined with a JSON response format.',
    );
  });

  it('should emit reasoning_content for reasoning parts', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me think.' },
          { type: 'text', text: 'The answer.' },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'The answer.',
        reasoning_content: 'Let me think.',
        tool_calls: undefined,
      },
    ]);
  });

  it('should convert tool calls and set content to null when there is no text', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            input: { city: 'Paris' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
          },
        ],
      },
    ]);
  });

  it('should keep text content when text and tool calls are present', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'get_weather',
            input: { city: 'Berlin' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Berlin"}' },
          },
        ],
      },
    ]);
  });
});

describe('tool messages', () => {
  it('should convert text tool results to tool messages', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'text', value: 'sunny' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: 'sunny' },
    ]);
  });

  it('should stringify json tool results', async () => {
    const result = await convertToMoonshotAIChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'json', value: { temp: 20 } },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: '{"temp":20}' },
    ]);
  });
});
