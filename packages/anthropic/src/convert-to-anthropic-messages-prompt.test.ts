import { LanguageModelV2CallWarning } from '@ai-sdk/provider';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('system messages', () => {
  it('should convert a single system message into an anthropic system message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [{ role: 'system', content: 'This is a system message' }],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [],
        system: [{ type: 'text', text: 'This is a system message' }],
      },
      betas: new Set(),
    });
  });

  it('should convert multiple system messages into an anthropic system message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        { role: 'system', content: 'This is a system message' },
        { role: 'system', content: 'This is another system message' },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [],
        system: [
          { type: 'text', text: 'This is a system message' },
          { type: 'text', text: 'This is another system message' },
        ],
      },
      betas: new Set(),
    });
  });
});

describe('user messages', () => {
  it('should add image parts for UInt8Array images', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'AAECAw==',
              mediaType: 'image/png',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  data: 'AAECAw==',
                  media_type: 'image/png',
                  type: 'base64',
                },
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should add image parts for URL images', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.png'),
              mediaType: 'image/*',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: 'https://example.com/image.png',
                },
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should add PDF file parts for base64 PDFs', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata',
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: 'base64PDFdata',
                },
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(['pdfs-2024-09-25']),
    });
  });

  it('should add PDF file parts for URL PDFs', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/document.pdf'),
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'url',
                  url: 'https://example.com/document.pdf',
                },
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(['pdfs-2024-09-25']),
    });
  });

  it('should add text file parts for text/plain documents', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: Buffer.from('sample text content', 'utf-8').toString(
                'base64',
              ),
              mediaType: 'text/plain',
              filename: 'sample.txt',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'text',
                  media_type: 'text/plain',
                  data: 'sample text content',
                },
                title: 'sample.txt',
                cache_control: undefined,
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should throw error for unsupported file types', async () => {
    await expect(
      convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64data',
                mediaType: 'video/mp4',
              },
            ],
          },
        ],
        sendReasoning: true,
        warnings: [],
      }),
    ).rejects.toThrow('media type: video/mp4');
  });
});

describe('tool messages', () => {
  it('should convert a single tool result into an anthropic user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              output: {
                type: 'json',
                value: { test: 'This is a tool message' },
              },
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-call-1',
                is_error: undefined,
                content: JSON.stringify({ test: 'This is a tool message' }),
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should convert multiple tool results into an anthropic user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              output: {
                type: 'json',
                value: { test: 'This is a tool message' },
              },
            },
            {
              type: 'tool-result',
              toolName: 'tool-2',
              toolCallId: 'tool-call-2',
              output: { type: 'json', value: { something: 'else' } },
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-call-1',
                is_error: undefined,
                content: JSON.stringify({ test: 'This is a tool message' }),
              },
              {
                type: 'tool_result',
                tool_use_id: 'tool-call-2',
                is_error: undefined,
                content: JSON.stringify({ something: 'else' }),
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should combine user and tool messages', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              output: {
                type: 'json',
                value: { test: 'This is a tool message' },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'This is a user message' }],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-call-1',
                is_error: undefined,
                content: JSON.stringify({ test: 'This is a tool message' }),
              },
              { type: 'text', text: 'This is a user message' },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should handle tool result with content parts', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'image-generator',
              toolCallId: 'image-gen-1',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'text',
                    text: 'Image generated successfully',
                  },
                  {
                    type: 'media',
                    data: 'AAECAw==',
                    mediaType: 'image/png',
                  },
                ],
              },
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {},
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "content": [
                    {
                      "cache_control": undefined,
                      "text": "Image generated successfully",
                      "type": "text",
                    },
                    {
                      "cache_control": undefined,
                      "source": {
                        "data": "AAECAw==",
                        "media_type": "image/png",
                        "type": "base64",
                      },
                      "type": "image",
                    },
                  ],
                  "is_error": undefined,
                  "tool_use_id": "image-gen-1",
                  "type": "tool_result",
                },
              ],
              "role": "user",
            },
          ],
          "system": undefined,
        },
      }
    `);
  });
});

describe('assistant messages', () => {
  it('should remove trailing whitespace from last assistant message when there is no further user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant content  ' }],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'user content' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'assistant content' }],
          },
        ],
      },
      betas: new Set(),
    });
  });

  it('should remove trailing whitespace from last assistant message with multi-part content when there is no further user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'assistant ' },
            { type: 'text', text: 'content  ' },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'user content' }],
          },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'assistant ' },
              { type: 'text', text: 'content' },
            ],
          },
        ],
      },
      betas: new Set(),
    });
  });

  it('should keep trailing whitespace from assistant message when there is a further user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant content  ' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content 2' }],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'user content' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'assistant content  ' }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'user content 2' }],
          },
        ],
      },
      betas: new Set(),
    });
  });

  it('should combine multiple sequential assistant messages into a single message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'World' }] },
        { role: 'assistant', content: [{ type: 'text', text: '!' }] },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: 'World' },
              { type: 'text', text: '!' },
            ],
          },
        ],
      },
      betas: new Set(),
    });
  });

  it('should convert assistant message reasoning parts with signature into thinking parts when sendReasoning is true', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
              providerOptions: {
                anthropic: {
                  signature: 'test-signature',
                },
              },
            },
            {
              type: 'text',
              text: 'The word "strawberry" has 2 "r"s.',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings,
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking:
                  'I need to count the number of "r"s in the word "strawberry".',
                signature: 'test-signature',
              },
              {
                type: 'text',
                text: 'The word "strawberry" has 2 "r"s.',
              },
            ],
          },
        ],
      },
      betas: new Set(),
    });
    expect(warnings).toEqual([]);
  });

  it('should ignore reasoning parts without signature into thinking parts when sendReasoning is true', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
            },
            {
              type: 'text',
              text: 'The word "strawberry" has 2 "r"s.',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {},
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "text": "The word "strawberry" has 2 "r"s.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          "system": undefined,
        },
      }
    `);
    expect(warnings).toMatchInlineSnapshot(`
      [
        {
          "message": "unsupported reasoning metadata",
          "type": "other",
        },
      ]
    `);
  });

  it('should omit assistant message reasoning parts with signature when sendReasoning is false', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
              providerOptions: {
                anthropic: {
                  signature: 'test-signature',
                },
              },
            },
            {
              type: 'text',
              text: 'The word "strawberry" has 2 "r"s.',
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings,
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'The word "strawberry" has 2 "r"s.',
              },
            ],
          },
        ],
      },
      betas: new Set(),
    });
    expect(warnings).toEqual([
      {
        type: 'other',
        message: 'sending reasoning content is disabled for this model',
      },
    ]);
  });

  it('should omit reasoning parts without signature when sendReasoning is false', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
            },
            {
              type: 'text',
              text: 'The word "strawberry" has 2 "r"s.',
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings,
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'The word "strawberry" has 2 "r"s.',
              },
            ],
          },
        ],
      },
      betas: new Set(),
    });
    expect(warnings).toEqual([
      {
        type: 'other',
        message: 'sending reasoning content is disabled for this model',
      },
    ]);
  });

  it('should convert anthropic web_search tool call and result parts', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              input: {
                query: 'San Francisco major news events June 22 2025',
              },
              providerExecuted: true,
              toolCallId: 'srvtoolu_011cNtbtzFARKPcAcp7w4nh9',
              toolName: 'web_search',
              type: 'tool-call',
            },
            {
              output: {
                type: 'json',
                value: [
                  {
                    url: 'https://patch.com/california/san-francisco/calendar',
                    title: 'San Francisco Calendar',
                    pageAge: null,
                    encryptedContent: 'encrypted-content',
                    type: 'event',
                  },
                ],
              },
              toolCallId: 'srvtoolu_011cNtbtzFARKPcAcp7w4nh9',
              toolName: 'web_search',
              type: 'tool-result',
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {},
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "id": "srvtoolu_011cNtbtzFARKPcAcp7w4nh9",
                  "input": {
                    "query": "San Francisco major news events June 22 2025",
                  },
                  "name": "web_search",
                  "type": "server_tool_use",
                },
                {
                  "cache_control": undefined,
                  "content": [
                    {
                      "encrypted_content": "encrypted-content",
                      "page_age": null,
                      "title": "San Francisco Calendar",
                      "type": "event",
                      "url": "https://patch.com/california/san-francisco/calendar",
                    },
                  ],
                  "tool_use_id": "srvtoolu_011cNtbtzFARKPcAcp7w4nh9",
                  "type": "web_search_tool_result",
                },
              ],
              "role": "assistant",
            },
          ],
          "system": undefined,
        },
      }
    `);
    expect(warnings).toMatchInlineSnapshot(`[]`);
  });
});

describe('cache control', () => {
  describe('system message', () => {
    it('should set cache_control on system message with message cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'system',
            content: 'system message',
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [],
          system: [
            {
              type: 'text',
              text: 'system message',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
        betas: new Set(),
      });
    });
  });

  describe('user message', () => {
    it('should set cache_control on user message part with part cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'test',
                providerOptions: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'test',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });

    it('should set cache_control on last user message part with message cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'part1',
                  cache_control: undefined,
                },
                {
                  type: 'text',
                  text: 'part2',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });
  });

  describe('assistant message', () => {
    it('should set cache_control on assistant message text part with part cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'test',
                providerOptions: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'test',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });

    it('should set cache_control on assistant tool call part with part cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'test-id',
                toolName: 'test-tool',
                input: { some: 'arg' },
                providerOptions: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  name: 'test-tool',
                  id: 'test-id',
                  input: { some: 'arg' },
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });

    it('should set cache_control on last assistant message part with message cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'part1',
                  cache_control: undefined,
                },
                {
                  type: 'text',
                  text: 'part2',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });
  });

  describe('tool message', () => {
    it('should set cache_control on tool result message part with part cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'test',
                output: { type: 'json', value: { test: 'test' } },
                providerOptions: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  content: '{"test":"test"}',
                  is_error: undefined,
                  tool_use_id: 'test',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });

    it('should set cache_control on last tool result message part with message cache control', async () => {
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'part1',
                output: { type: 'json', value: { test: 'part1' } },
              },
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'part2',
                output: { type: 'json', value: { test: 'part2' } },
              },
            ],
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        sendReasoning: true,
        warnings: [],
      });

      expect(result).toEqual({
        prompt: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'part1',
                  content: '{"test":"part1"}',
                  is_error: undefined,
                  cache_control: undefined,
                },
                {
                  type: 'tool_result',
                  tool_use_id: 'part2',
                  content: '{"test":"part2"}',
                  is_error: undefined,
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        betas: new Set(),
      });
    });
  });
});

describe('citations', () => {
  it('should not include citations by default', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata',
              mediaType: 'application/pdf',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {
          "pdfs-2024-09-25",
        },
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "source": {
                    "data": "base64PDFdata",
                    "media_type": "application/pdf",
                    "type": "base64",
                  },
                  "title": undefined,
                  "type": "document",
                },
              ],
              "role": "user",
            },
          ],
          "system": undefined,
        },
      }
    `);
  });

  it('should include citations when enabled on file part', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata',
              mediaType: 'application/pdf',
              providerOptions: {
                anthropic: {
                  citations: { enabled: true },
                },
              },
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {
          "pdfs-2024-09-25",
        },
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "citations": {
                    "enabled": true,
                  },
                  "source": {
                    "data": "base64PDFdata",
                    "media_type": "application/pdf",
                    "type": "base64",
                  },
                  "title": undefined,
                  "type": "document",
                },
              ],
              "role": "user",
            },
          ],
          "system": undefined,
        },
      }
    `);
  });

  it('should include custom title and context when provided', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata',
              mediaType: 'application/pdf',
              filename: 'original-name.pdf',
              providerOptions: {
                anthropic: {
                  title: 'Custom Document Title',
                  context: 'This is metadata about the document',
                  citations: { enabled: true },
                },
              },
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {
          "pdfs-2024-09-25",
        },
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "citations": {
                    "enabled": true,
                  },
                  "context": "This is metadata about the document",
                  "source": {
                    "data": "base64PDFdata",
                    "media_type": "application/pdf",
                    "type": "base64",
                  },
                  "title": "Custom Document Title",
                  "type": "document",
                },
              ],
              "role": "user",
            },
          ],
          "system": undefined,
        },
      }
    `);
  });

  it('should handle multiple documents with consistent citation settings', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata1',
              mediaType: 'application/pdf',
              filename: 'doc1.pdf',
              providerOptions: {
                anthropic: {
                  citations: { enabled: true },
                  title: 'Custom Title 1',
                },
              },
            },
            {
              type: 'file',
              data: 'base64PDFdata2',
              mediaType: 'application/pdf',
              filename: 'doc2.pdf',
              providerOptions: {
                anthropic: {
                  citations: { enabled: true },
                  title: 'Custom Title 2',
                  context: 'Additional context for document 2',
                },
              },
            },
            {
              type: 'text',
              text: 'Analyze both documents',
            },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "betas": Set {
          "pdfs-2024-09-25",
        },
        "prompt": {
          "messages": [
            {
              "content": [
                {
                  "cache_control": undefined,
                  "citations": {
                    "enabled": true,
                  },
                  "source": {
                    "data": "base64PDFdata1",
                    "media_type": "application/pdf",
                    "type": "base64",
                  },
                  "title": "Custom Title 1",
                  "type": "document",
                },
                {
                  "cache_control": undefined,
                  "citations": {
                    "enabled": true,
                  },
                  "context": "Additional context for document 2",
                  "source": {
                    "data": "base64PDFdata2",
                    "media_type": "application/pdf",
                    "type": "base64",
                  },
                  "title": "Custom Title 2",
                  "type": "document",
                },
                {
                  "cache_control": undefined,
                  "text": "Analyze both documents",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "system": undefined,
        },
      }
    `);
  });
});
