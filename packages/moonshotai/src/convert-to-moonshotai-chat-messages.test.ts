import {
  InvalidPromptError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';

async function convertMessages(prompt: LanguageModelV4Prompt) {
  return (
    await convertToMoonshotAIChatMessages({
      prompt,
    })
  ).messages;
}

describe('message names', () => {
  it('should serialize names for system, user, and assistant messages', async () => {
    const result = await convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: { moonshotai: { name: 'guide' } },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Describe this image.' }],
          providerOptions: { moonshotai: { name: 'alice' } },
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I will inspect it.' }],
          providerOptions: { moonshotai: { name: 'vision_assistant' } },
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          name: 'guide',
        },
        {
          role: 'user',
          content: 'Describe this image.',
          name: 'alice',
        },
        {
          role: 'assistant',
          content: 'I will inspect it.',
          name: 'vision_assistant',
          tool_calls: undefined,
        },
      ],
      warnings: [],
    });
  });

  it('should ignore a name on a tool message with an unsupported warning', async () => {
    const result = await convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'weather',
              output: { type: 'text', value: 'sunny' },
            },
          ],
          providerOptions: { moonshotai: { name: 'weather_tool' } },
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'tool',
          tool_call_id: 'call-1',
          content: 'sunny',
        },
      ],
      warnings: [
        {
          type: 'unsupported',
          feature: 'message name on tool messages',
        },
      ],
    });
  });

  it('should reject a non-string name', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: { moonshotai: { name: 123 } },
          },
        ],
      }),
    ).rejects.toThrow('invalid moonshotai provider options');
  });

  it('should serialize a name from a custom provider options namespace', async () => {
    const result = await convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerOptions: { custom: { name: 'alice' } },
        },
      ],
      providerOptionsName: 'custom',
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: 'Hello',
        name: 'alice',
      },
    ]);
  });
});

describe('Partial Mode', () => {
  it('should serialize partial true on the final assistant message', async () => {
    const result = await convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Return a JSON object.' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: '{' }],
          providerOptions: {
            moonshotai: { name: 'prefix', partial: true },
          },
        },
      ],
    });

    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: '{',
      name: 'prefix',
      partial: true,
      tool_calls: undefined,
    });
  });

  it('should reject partial true on a non-assistant message', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue.' }],
            providerOptions: { moonshotai: { partial: true } },
          },
        ],
      }),
    ).rejects.toSatisfy(InvalidPromptError.isInstance);
  });

  it('should reject partial true on a non-final assistant message', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: { moonshotai: { partial: true } },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue.' }],
          },
        ],
      }),
    ).rejects.toSatisfy(InvalidPromptError.isInstance);
  });

  it('should reject Partial Mode with JSON object response format', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: '{' }],
            providerOptions: { moonshotai: { partial: true } },
          },
        ],
        responseFormat: { type: 'json_object' },
      }),
    ).rejects.toSatisfy(InvalidPromptError.isInstance);
  });

  it('should allow Partial Mode with JSON schema response format', async () => {
    const result = await convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '{' }],
          providerOptions: { moonshotai: { partial: true } },
        },
      ],
      responseFormat: { type: 'json_schema' },
    });

    expect(result.messages[0]).toMatchObject({ partial: true });
  });
});

describe('user messages', () => {
  const supportedImageMediaTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/heic',
    'image/heif',
  ];

  const supportedVideoMediaTypes = [
    'video/mp4',
    'video/mpeg',
    'video/mov',
    'video/avi',
    'video/x-flv',
    'video/mpg',
    'video/webm',
    'video/wmv',
    'video/3gpp',
  ];

  it('should convert a text-only user message to string content', async () => {
    const result = await convertMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert image data parts to image_url data URIs', async () => {
    const result = await convertMessages([
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

  it.each(supportedImageMediaTypes)(
    'should accept supported image media type %s',
    async mediaType => {
      const result = await convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
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
              image_url: { url: `data:${mediaType};base64,AAECAw==` },
            },
          ],
        },
      ]);
    },
  );

  it('should pass through image URLs', async () => {
    const result = await convertMessages([
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
    const result = await convertMessages([
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

  it.each(supportedVideoMediaTypes)(
    'should accept supported video media type %s',
    async mediaType => {
      const result = await convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
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
              video_url: { url: `data:${mediaType};base64,AAECAw==` },
            },
          ],
        },
      ]);
    },
  );

  it('should pass through video URLs', async () => {
    const result = await convertMessages([
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
    const result = await convertMessages([
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

  it.each([
    {
      mediaType: 'image',
      content: {
        type: 'image_url',
        image_url: { url: 'ms://file-image' },
      },
    },
    {
      mediaType: 'video',
      content: {
        type: 'video_url',
        video_url: { url: 'ms://file-video' },
      },
    },
  ] as const)(
    'should pass through ms:// file references with top-level $mediaType media types',
    async ({ mediaType, content }) => {
      const result = await convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'url' as const,
                url: new URL(`ms://file-${mediaType}`),
              },
              mediaType,
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [content],
        },
      ]);
    },
  );

  it('should decode text/* file parts into text parts', async () => {
    const result = await convertMessages([
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

  it.each(['image/svg+xml', 'image/tiff', 'video/quicktime'])(
    'should throw for unsupported multimodal media type %s',
    async mediaType => {
      await expect(
        convertMessages([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: {
                  type: 'data' as const,
                  data: new Uint8Array([0, 1, 2, 3]),
                },
                mediaType,
              },
            ],
          },
        ]),
      ).rejects.toThrow(
        `'file part media type ${mediaType}' functionality not supported`,
      );
    },
  );

  it('should throw for audio file parts (rejected by the API)', async () => {
    await expect(
      convertMessages([
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

  it('should throw for PDF file parts (rejected by the API)', async () => {
    await expect(
      convertMessages([
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
      convertMessages([
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
      reference: 'ms://image-file-123',
      expected: {
        type: 'image_url',
        image_url: { url: 'ms://image-file-123' },
      },
    },
    {
      mediaType: 'video/mp4',
      reference: 'ms://video-file-123',
      expected: {
        type: 'video_url',
        video_url: { url: 'ms://video-file-123' },
      },
    },
  ])(
    'should convert $mediaType Moonshot provider references',
    async ({ mediaType, reference, expected }) => {
      const result = await convertMessages([
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
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [expected],
        },
      ]);
    },
  );

  it('should throw for foreign provider references', async () => {
    await expect(
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { openai: 'ms://image-file-123' },
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).rejects.toThrow("No provider reference found for provider 'moonshotai'");
  });

  it('should throw for Moonshot provider references without an ms:// URL', async () => {
    await expect(
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { moonshotai: 'https://example.com/image.png' },
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      "'Moonshot file provider references without an ms:// URL' functionality not supported",
    );
  });

  it('should throw for Moonshot provider references with unsupported media types', async () => {
    await expect(
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { moonshotai: 'ms://document-file-123' },
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

  it('should convert text file data to text parts', async () => {
    const result = await convertMessages([
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
    ]);

    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ]);
  });
});

describe('system messages', () => {
  it('should pass system messages through', async () => {
    const result = await convertMessages([
      { role: 'system', content: 'You are Kimi.' },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'You are Kimi.' }]);
  });

  it('should serialize and normalize K3 dynamic tools without content', async () => {
    const result = await convertToMoonshotAIChatMessages({
      modelId: 'kimi-k3',
      prompt: [
        {
          role: 'system',
          content: '',
          providerOptions: {
            moonshotai: {
              tools: [
                {
                  type: 'function',
                  name: 'locate',
                  description: 'Locate coordinates',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      coordinates: {
                        type: 'array',
                        items: [{ type: 'number' }, { type: 'number' }],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'system',
          tools: [
            {
              type: 'function',
              function: {
                name: 'locate',
                description: 'Locate coordinates',
                parameters: {
                  type: 'object',
                  properties: {
                    coordinates: {
                      type: 'array',
                      prefixItems: [{ type: 'number' }, { type: 'number' }],
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      warnings: [],
    });
  });

  it('should omit dynamic tools and warn for known non-K3 models', async () => {
    const result = await convertToMoonshotAIChatMessages({
      modelId: 'kimi-k2.6',
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Start' }] },
        {
          role: 'system',
          content: '',
          providerOptions: {
            moonshotai: {
              tools: [
                {
                  type: 'function',
                  name: 'calculator',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          },
        },
      ],
    });

    expect(result).toEqual({
      messages: [{ role: 'user', content: 'Start' }],
      warnings: [
        {
          type: 'unsupported',
          feature: 'dynamic tool loading for model "kimi-k2.6"',
          details:
            'Moonshot documents dynamic tool loading only for Kimi K3. The dynamic system message has been omitted.',
        },
      ],
    });
  });

  it('should preserve dynamic tools for unknown custom models', async () => {
    const result = await convertToMoonshotAIChatMessages({
      modelId: 'custom-model',
      prompt: [
        {
          role: 'system',
          content: '',
          providerOptions: {
            moonshotai: {
              tools: [
                {
                  type: 'function',
                  name: 'calculator',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            },
          },
        },
      ],
    });

    expect(result.warnings).toEqual([]);
    expect(result.messages[0]).toMatchObject({
      role: 'system',
      tools: [{ function: { name: 'calculator' } }],
    });
  });

  it('should preserve an ordinary system message when tools is empty', async () => {
    const result = await convertToMoonshotAIChatMessages({
      modelId: 'kimi-k3',
      prompt: [
        {
          role: 'system',
          content: 'You are Kimi.',
          providerOptions: { moonshotai: { tools: [] } },
        },
      ],
    });

    expect(result).toEqual({
      messages: [{ role: 'system', content: 'You are Kimi.' }],
      warnings: [],
    });
  });

  it('should reject incomplete dynamic tool definitions', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        modelId: 'kimi-k3',
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: undefined,
                  },
                ],
              },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'providerOptions',
      message: 'invalid moonshotai provider options',
    });
  });

  it('should reject content alongside dynamic tools', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        modelId: 'kimi-k3',
        prompt: [
          {
            role: 'system',
            content: 'Do not send this.',
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(
      'A Moonshot dynamic-tool system message must use empty content because the API forbids content alongside tools.',
    );
  });

  it('should reject dynamic tools on non-system messages', async () => {
    await expect(
      convertToMoonshotAIChatMessages({
        modelId: 'kimi-k3',
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              moonshotai: {
                tools: [
                  {
                    type: 'function',
                    name: 'calculator',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(
      'Moonshot dynamic tools must be configured on a system message.',
    );
  });
});

describe('assistant messages', () => {
  it('should emit reasoning_content for reasoning parts', async () => {
    const result = await convertMessages([
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
    const result = await convertMessages([
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
    const result = await convertMessages([
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
    const result = await convertMessages([
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
    const result = await convertMessages([
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
