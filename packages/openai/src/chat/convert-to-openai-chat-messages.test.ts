import type { LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { describe, it, expect } from 'vitest';

describe('system messages', () => {
  it('should forward system messages', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
    });

    expect(result.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);
  });

  it('should convert system messages to developer messages when requested', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      systemMessageMode: 'developer',
    });

    expect(result.messages).toEqual([
      { role: 'developer', content: 'You are a helpful assistant.' },
    ]);
  });

  it('should add a prompt cache breakpoint to a system message', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            openai: { promptCacheBreakpoint: { mode: 'explicit' } },
          },
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'You are a helpful assistant.',
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
      },
    ]);
  });

  it('should remove system messages when requested', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      systemMessageMode: 'remove',
    });

    expect(result.messages).toEqual([]);
  });
});

describe('user messages', () => {
  it('should convert messages with only a text part to a string content', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should add prompt cache breakpoints to supported content blocks', async () => {
    const promptCacheBreakpoint = { mode: 'explicit' } as const;
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello',
              providerOptions: { openai: { promptCacheBreakpoint } },
            },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('https://example.com/image.png'),
              },
              providerOptions: { openai: { promptCacheBreakpoint } },
            },
            {
              type: 'file',
              mediaType: 'audio/wav',
              data: { type: 'data', data: 'AAECAw==' },
              providerOptions: { openai: { promptCacheBreakpoint } },
            },
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: {
                type: 'reference',
                reference: { openai: 'file-pdf-123' },
              },
              providerOptions: { openai: { promptCacheBreakpoint } },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello',
            prompt_cache_breakpoint: promptCacheBreakpoint,
          },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png' },
            prompt_cache_breakpoint: promptCacheBreakpoint,
          },
          {
            type: 'input_audio',
            input_audio: { data: 'AAECAw==', format: 'wav' },
            prompt_cache_breakpoint: promptCacheBreakpoint,
          },
          {
            type: 'file',
            file: { file_id: 'file-pdf-123' },
            prompt_cache_breakpoint: promptCacheBreakpoint,
          },
        ],
      },
    ]);
  });

  it('should convert messages with image parts', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'data' as const,
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it('should convert messages with Uint8Array image parts to data URLs', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,/9j/4A==' },
          },
        ],
      },
    ]);
  });

  it('should add image detail when specified through extension', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'data' as const,
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              },
              providerOptions: {
                openai: {
                  imageDetail: 'low',
                },
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,AAECAw==',
              detail: 'low',
            },
          },
        ],
      },
    ]);
  });

  describe('file parts', () => {
    it('should throw for unsupported mime types', async () => {
      await expect(
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: { type: 'data' as const, data: 'AAECAw==' },
                  mediaType: 'application/something',
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow('file part media type application/something');
    });

    it('should throw for URL data', async () => {
      await expect(
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: {
                    type: 'url' as const,
                    url: new URL('https://example.com/foo.wav'),
                  },
                  mediaType: 'audio/wav',
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow('audio file parts with URLs');
    });

    it('should add audio content for audio/wav file parts', async () => {
      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'data' as const, data: 'AAECAw==' },
                mediaType: 'audio/wav',
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'wav' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mpeg file parts', async () => {
      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'data' as const, data: 'AAECAw==' },
                mediaType: 'audio/mpeg',
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mp3 file parts', async () => {
      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'data' as const, data: 'AAECAw==' },
                mediaType: 'audio/mp3', // not official but sometimes used
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should convert messages with PDF file parts', async () => {
      const base64Data = 'AQIDBAU='; // Base64 encoding of pdfData

      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: { type: 'data' as const, data: base64Data },
                filename: 'document.pdf',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should convert messages with binary PDF file parts', async () => {
      const data = Uint8Array.from([1, 2, 3, 4, 5]);

      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: { type: 'data' as const, data },
                filename: 'document.pdf',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should convert messages with PDF file parts using provider reference', async () => {
      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: {
                  type: 'reference' as const,
                  reference: { openai: 'file-pdf-12345' },
                },
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_id: 'file-pdf-12345',
              },
            },
          ],
        },
      ]);
    });

    it('should convert messages with image parts using provider reference', async () => {
      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: {
                  type: 'reference' as const,
                  reference: { openai: 'file-img-12345' },
                },
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_id: 'file-img-12345',
              },
            },
          ],
        },
      ]);
    });

    it('should throw when provider reference does not contain openai', async () => {
      await expect(
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: {
                    type: 'reference' as const,
                    reference: { anthropic: 'file-xyz' },
                  },
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(
        "No provider reference found for provider 'openai'. Available providers: anthropic",
      );
    });

    it('should use default filename for PDF file parts when not provided', async () => {
      const base64Data = 'AQIDBAU=';

      const result = await convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: { type: 'data' as const, data: base64Data },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'part-0.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should throw error for unsupported file types', async () => {
      const base64Data = 'AQIDBAU=';

      await expect(
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'text/plain',
                  data: { type: 'data' as const, data: base64Data },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        }),
      ).rejects.toThrow('file part media type text/plain');
    });

    it('should throw error for file URLs', async () => {
      await expect(
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: {
                    type: 'url' as const,
                    url: new URL('https://example.com/document.pdf'),
                  },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        }),
      ).rejects.toThrow('PDF file parts with URLs');
    });

    describe('top-level-only media type resolution', () => {
      const pngBase64 = 'iVBORw0KGgo=';

      it('detects image subtype from inline bytes for top-level "image"', async () => {
        const result = await convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image',
                  data: { type: 'data' as const, data: pngBase64 },
                },
              ],
            },
          ],
        });
        expect((result.messages[0]!.content as unknown[])[0]).toEqual({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${pngBase64}`,
            detail: undefined,
          },
        });
      });

      it('normalizes image/* wildcard via detection', async () => {
        const result = await convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/*',
                  data: { type: 'data' as const, data: pngBase64 },
                },
              ],
            },
          ],
        });
        expect((result.messages[0]!.content as unknown[])[0]).toEqual({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${pngBase64}`,
            detail: undefined,
          },
        });
      });

      it('passes through URL source for top-level-only image (provider accepts raw URL)', async () => {
        const result = await convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image',
                  data: {
                    type: 'url' as const,
                    url: new URL('https://example.com/x.png'),
                  },
                },
              ],
            },
          ],
        });
        expect((result.messages[0]!.content as unknown[])[0]).toEqual({
          type: 'image_url',
          image_url: {
            url: 'https://example.com/x.png',
            detail: undefined,
          },
        });
      });

      it('throws for top-level-only application (PDF requires full resolution) with URL source', async () => {
        await expect(
          convertToOpenAIChatMessages({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    mediaType: 'application',
                    data: {
                      type: 'url' as const,
                      url: new URL('https://example.com/x.pdf'),
                    },
                  },
                ],
              },
            ],
          }),
        ).rejects.toThrow(
          /media type "application".*not passed as inline bytes/,
        );
      });

      it('preserves full image/png pass-through', async () => {
        const result = await convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data' as const, data: pngBase64 },
                },
              ],
            },
          ],
        });
        expect((result.messages[0]!.content as unknown[])[0]).toEqual({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${pngBase64}`,
            detail: undefined,
          },
        });
      });
    });
  });
});

describe('tool calls', () => {
  it('should add a prompt cache breakpoint to assistant text content', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Cached assistant content',
              providerOptions: {
                openai: { promptCacheBreakpoint: { mode: 'explicit' } },
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Cached assistant content',
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
        tool_calls: undefined,
      },
    ]);
  });

  it('should add a prompt cache breakpoint to tool text content', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'cached-tool',
              toolName: 'cached-tool',
              output: {
                type: 'text',
                value: 'Cached tool content',
                providerOptions: {
                  openai: { promptCacheBreakpoint: { mode: 'explicit' } },
                },
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'text',
            text: 'Cached tool content',
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
        tool_call_id: 'cached-tool',
      },
    ]);
  });

  it('should stringify arguments to tool calls', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: { foo: 'bar123' },
              toolCallId: 'quux',
              toolName: 'thwomp',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'quux',
              toolName: 'thwomp',
              output: { type: 'json', value: { oof: '321rab' } },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            type: 'function',
            id: 'quux',
            function: {
              name: 'thwomp',
              arguments: JSON.stringify({ foo: 'bar123' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({ oof: '321rab' }),
        tool_call_id: 'quux',
      },
    ]);
  });

  it('should preserve pre-serialized string tool arguments', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: '{"city":"Tokyo"}',
              toolCallId: 'call-1',
              toolName: 'getWeather',
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            type: 'function',
            id: 'call-1',
            function: {
              name: 'getWeather',
              arguments: '{"city":"Tokyo"}',
            },
          },
        ],
      },
    ]);
  });

  it('should serialize BigInt and circular structures in tool arguments without crashing', async () => {
    const circularArgs: Record<string, unknown> = { count: 9007199254740993n };
    circularArgs.self = circularArgs;

    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: circularArgs,
              toolCallId: 'call-2',
              toolName: 'computeStats',
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            type: 'function',
            id: 'call-2',
            function: {
              name: 'computeStats',
              arguments: '{"count":"9007199254740993","self":"[Circular]"}',
            },
          },
        ],
      },
    ]);
  });

  it('should send empty string content for assistant messages with no tool calls', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
        },
      ],
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "role": "assistant",
          "tool_calls": undefined,
        },
      ]
    `);
  });

  it('should default missing tool call input to an empty object', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'quux',
              toolName: 'thwomp',
              input: undefined,
            },
          ],
        },
      ],
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": null,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{}",
                "name": "thwomp",
              },
              "id": "quux",
              "type": "function",
            },
          ],
        },
      ]
    `);
  });

  it('should normalize malformed tool call input and preserve the tool error semantics', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'quux',
              toolName: 'thwomp',
              input: '{"foo":"bar"',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'quux',
              toolName: 'thwomp',
              output: {
                type: 'error-text',
                value: 'Invalid input: JSON parsing failed',
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": null,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{}",
                "name": "thwomp",
              },
              "id": "quux",
              "type": "function",
            },
          ],
        },
        {
          "content": "{"error":"Invalid input: JSON parsing failed"}",
          "role": "tool",
          "tool_call_id": "quux",
        },
      ]
    `);
  });

  it.each([
    {
      output: { type: 'error-text', value: 'E42' },
      expected: '{"error":"E42"}',
    },
    {
      output: { type: 'error-json', value: { code: 'E42' } },
      expected: '{"error":{"code":"E42"}}',
    },
  ] satisfies Array<{
    output: LanguageModelV4ToolResultOutput;
    expected: string;
  }>)('should wrap tool errors $output', async ({ output, expected }) => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'error-tool',
              toolName: 'deploy',
              output,
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      { role: 'tool', tool_call_id: 'error-tool', content: expected },
    ]);
  });

  it('should handle different tool output types', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'text-tool',
              toolName: 'text-tool',
              output: { type: 'text', value: 'Hello world' },
            },
            {
              type: 'tool-result',
              toolCallId: 'error-tool',
              toolName: 'error-tool',
              output: { type: 'error-text', value: 'Something went wrong' },
            },
          ],
        },
      ],
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello world",
          "role": "tool",
          "tool_call_id": "text-tool",
        },
        {
          "content": "{"error":"Something went wrong"}",
          "role": "tool",
          "tool_call_id": "error-tool",
        },
      ]
    `);
  });
});

it('preserves shared tool argument objects while replacing real cycles', async () => {
  const shared = { value: 42 };
  const input: Record<string, unknown> = { a: shared, b: shared };
  input.self = input;
  const result = await convertToOpenAIChatMessages({
    prompt: [
      {
        role: 'assistant' as const,
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: 'call_shared',
            toolName: 'inspect',
            input,
          },
        ],
      },
    ],
  });
  expect((result.messages[0] as any).tool_calls[0].function.arguments).toBe(
    '{"a":{"value":42},"b":{"value":42},"self":"[Circular]"}',
  );
});

it('serializes tool results with BigInt and real cycles', async () => {
  const value: any = { count: 42n };
  value.self = value;
  const result = await convertToOpenAIChatMessages({
    prompt: [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'inspect',
            output: { type: 'json', value },
          },
        ],
      },
    ],
  });
  expect((result.messages[0] as any).content).toBe(
    '{"count":"42","self":"[Circular]"}',
  );
});

describe('message names', () => {
  it('preserves names on plain user and assistant messages', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerOptions: { openai: { name: 'alice' } },
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
          providerOptions: { openai: { name: 'bot' } },
        },
      ],
    });
    expect(result.messages).toEqual([
      { role: 'user', content: 'Hello', name: 'alice' },
      { role: 'assistant', content: 'Hi', name: 'bot', tool_calls: undefined },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('preserves names on user parts and assistant tool-only messages', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ' there' },
          ],
          providerOptions: { openai: { name: 'alice' } },
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'lookup',
              input: {},
            },
          ],
          providerOptions: { openai: { name: 'bot' } },
        },
      ],
    });
    expect(result.messages[0]).toEqual({
      role: 'user',
      name: 'alice',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' there' },
      ],
    });
    expect(result.messages[1]).toEqual({
      role: 'assistant',
      name: 'bot',
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    });
  });

  it.each(['system', 'developer'] as const)(
    'preserves names and cache breakpoints in %s mode',
    async systemMessageMode => {
      const result = await convertToOpenAIChatMessages({
        systemMessageMode,
        prompt: [
          {
            role: 'system',
            content: 'Be helpful',
            providerOptions: {
              openai: {
                name: 'instructions',
                promptCacheBreakpoint: { mode: 'explicit' },
              },
            },
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hi',
                providerOptions: {
                  openai: { promptCacheBreakpoint: { mode: 'explicit' } },
                },
              },
            ],
            providerOptions: { openai: { name: 'bot' } },
          },
        ],
      });
      expect(result.messages).toEqual([
        {
          role: systemMessageMode,
          name: 'instructions',
          content: [
            {
              type: 'text',
              text: 'Be helpful',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
        },
        {
          role: 'assistant',
          name: 'bot',
          content: [
            {
              type: 'text',
              text: 'Hi',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
          tool_calls: undefined,
        },
      ]);
    },
  );

  it('removes named system messages in remove mode', async () => {
    const result = await convertToOpenAIChatMessages({
      systemMessageMode: 'remove',
      prompt: [
        {
          role: 'system',
          content: 'Be helpful',
          providerOptions: { openai: { name: 'instructions' } },
        },
      ],
    });
    expect(result.messages).toEqual([]);
    expect(result.warnings).toEqual([
      { type: 'other', message: 'system messages are removed for this model' },
    ]);
  });

  it('warns and omits names on tool messages', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'tool',
          providerOptions: { openai: { name: 'ignored' } },
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'lookup',
              output: { type: 'text', value: 'result' },
            },
          ],
        },
      ],
    });
    expect(result.messages).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: 'result' },
    ]);
    expect(result.warnings).toEqual([
      { type: 'unsupported', feature: 'message name on tool messages' },
    ]);
  });

  it.each([null, 42, true, {}, []])('rejects invalid names: %j', async name => {
    await expect(
      convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: { openai: { name } },
          },
        ],
      }),
    ).rejects.toThrow('invalid openai provider options');
  });

  it('ignores names from unrelated namespaces and content parts', async () => {
    const result = await convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello',
              providerOptions: { openai: { name: 'part-name' } },
            },
          ],
          providerOptions: { other: { name: 'other-name' } },
        },
      ],
    });
    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });
});

describe('configured namespace', () => {
  it('resolves request fields independently across message and part namespaces', async () => {
    const { messages } = await convertToOpenAIChatMessages({
      providerOptionsName: 'azure',
      prompt: [
        {
          role: 'user',
          providerOptions: {
            openai: { name: 'fallback' },
            azure: { name: 'host' },
          },
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL('https://example.com/image.png'),
              },
              providerOptions: {
                openai: {
                  imageDetail: 'low',
                  promptCacheBreakpoint: { mode: 'explicit' },
                },
                azure: { imageDetail: 'high' },
              },
            },
          ],
        },
      ],
    });
    expect(messages).toEqual([
      {
        role: 'user',
        name: 'host',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.png', detail: 'high' },
            prompt_cache_breakpoint: { mode: 'explicit' },
          },
        ],
      },
    ]);
  });
});
