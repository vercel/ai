import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';

function convertMessages(prompt: LanguageModelV3Prompt) {
  return convertToMoonshotAIChatMessages({ prompt }).messages;
}

describe('message names', () => {
  it('should serialize names for system, user, and assistant messages', () => {
    const result = convertToMoonshotAIChatMessages({
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

  it('should ignore a name on a tool message with an unsupported warning', () => {
    const result = convertToMoonshotAIChatMessages({
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

  it('should reject a non-string name', () => {
    expect(() =>
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: { moonshotai: { name: 123 } },
          },
        ],
      }),
    ).toThrow('invalid moonshotai provider options');
  });

  it('should serialize a name from a custom provider options namespace', () => {
    const result = convertToMoonshotAIChatMessages({
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
  it('should serialize partial true on the final assistant message', () => {
    const result = convertToMoonshotAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Continue the prefix.' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The sky is' }],
          providerOptions: {
            moonshotai: { name: 'writer', partial: true },
          },
        },
      ],
    });

    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'The sky is',
      name: 'writer',
      partial: true,
      tool_calls: undefined,
    });
  });

  it('should reject partial true on a non-assistant message', () => {
    expect(() =>
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue.' }],
            providerOptions: { moonshotai: { partial: true } },
          },
        ],
      }),
    ).toThrow(
      'Moonshot AI Partial Mode requires `partial: true` on an assistant message.',
    );
  });

  it('should reject partial true on a non-final assistant message', () => {
    expect(() =>
      convertToMoonshotAIChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The sky is' }],
            providerOptions: { moonshotai: { partial: true } },
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Continue.' }],
          },
        ],
      }),
    ).toThrow(
      'Moonshot AI Partial Mode requires the partial assistant message to be the final message.',
    );
  });

  it('should reject Partial Mode with JSON object response format', () => {
    expect(() =>
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
    ).toThrow(
      'Moonshot AI Partial Mode cannot be combined with JSON object response format.',
    );
  });

  it('should allow Partial Mode with JSON schema response format', () => {
    const result = convertToMoonshotAIChatMessages({
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

  it('should convert a text-only user message to string content', () => {
    const result = convertMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert image data parts to image_url data URIs', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'file',
            data: new Uint8Array([0, 1, 2, 3]),
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
    mediaType => {
      const result = convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
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

  it('should pass through image URLs', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: new URL('https://example.com/image.jpg'),
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

  it('should convert video data parts to video_url data URIs', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video' },
          {
            type: 'file',
            data: new Uint8Array([0, 1, 2, 3]),
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
    mediaType => {
      const result = convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
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

  it('should pass through video URLs', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: new URL('https://example.com/video.mp4'),
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

  it('should pass through ms:// file references from the Files API', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: new URL('ms://file-abc123'),
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

  it('should decode text/* file parts into text parts', () => {
    const result = convertMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from('hello markdown').toString('base64'),
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
    mediaType => {
      expect(() =>
        convertMessages([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new Uint8Array([0, 1, 2, 3]),
                mediaType,
              },
            ],
          },
        ]),
      ).toThrow(
        `'file part media type ${mediaType}' functionality not supported`,
      );
    },
  );

  it('should throw for audio file parts (rejected by the API)', () => {
    expect(() =>
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'audio/mp3',
            },
          ],
        },
      ]),
    ).toThrow("'file part media type audio/mp3' functionality not supported");
  });

  it('should throw for PDF file parts (rejected by the API)', () => {
    expect(() =>
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/pdf',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file part media type application/pdf' functionality not supported",
    );
  });

  it('should throw for unsupported file types', () => {
    expect(() =>
      convertMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'application/zip',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file part media type application/zip' functionality not supported",
    );
  });
});

describe('system messages', () => {
  it('should pass system messages through', () => {
    const result = convertMessages([
      { role: 'system', content: 'You are Kimi.' },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'You are Kimi.' }]);
  });
});

describe('assistant messages', () => {
  it('should emit reasoning_content for reasoning parts', () => {
    const result = convertMessages([
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

  it('should convert tool calls and set content to null when there is no text', () => {
    const result = convertMessages([
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

  it('should keep text content when text and tool calls are present', () => {
    const result = convertMessages([
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
  it('should convert text tool results to tool messages', () => {
    const result = convertMessages([
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

  it('should stringify json tool results', () => {
    const result = convertMessages([
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
