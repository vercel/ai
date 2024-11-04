import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('system messages', () => {
  it('should convert a single system message into an anthropic system message', async () => {
    const result = convertToAnthropicMessagesPrompt({
      prompt: [{ role: 'system', content: 'This is a system message' }],
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        { role: 'system', content: 'This is a system message' },
        { role: 'system', content: 'This is another system message' },
      ],
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            },
          ],
        },
      ],
      cacheControl: false,
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

  it('should add PDF file parts', async () => {
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64PDFdata',
              mimeType: 'application/pdf',
            },
          ],
        },
      ],
      cacheControl: false,
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

  it('should throw error for non-PDF file types', async () => {
    expect(() =>
      convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64data',
                mimeType: 'text/plain',
              },
            ],
          },
        ],
        cacheControl: false,
      }),
    ).toThrow('Non-PDF files in user messages');
  });

  it('should throw error for URL-based file parts', async () => {
    expect(() =>
      convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64data',
                mimeType: 'text/plain',
              },
            ],
          },
        ],
        cacheControl: false,
      }),
    ).toThrow('Non-PDF files in user messages');
  });
});

describe('tool messages', () => {
  it('should convert a single tool result into an anthropic user message', async () => {
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              result: { test: 'This is a tool message' },
            },
          ],
        },
      ],
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              result: { test: 'This is a tool message' },
            },
            {
              type: 'tool-result',
              toolName: 'tool-2',
              toolCallId: 'tool-call-2',
              result: { something: 'else' },
            },
          ],
        },
      ],
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              result: { test: 'This is a tool message' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'This is a user message' }],
        },
      ],
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'image-generator',
              toolCallId: 'image-gen-1',
              result: 'Image generated successfully',
              content: [
                {
                  type: 'text',
                  text: 'Image generated successfully',
                },
                {
                  type: 'image',
                  data: 'AAECAw==',
                  mimeType: 'image/png',
                },
              ],
            },
          ],
        },
      ],
      cacheControl: false,
    });

    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'image-gen-1',
                is_error: undefined,
                content: [
                  { type: 'text', text: 'Image generated successfully' },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      data: 'AAECAw==',
                      media_type: 'image/png',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      betas: new Set(),
    });
  });
});

describe('assistant messages', () => {
  it('should remove trailing whitespace from last assistant message when there is no further user message', async () => {
    const result = convertToAnthropicMessagesPrompt({
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
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
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
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
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
      cacheControl: false,
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'World' }] },
        { role: 'assistant', content: [{ type: 'text', text: '!' }] },
      ],
      cacheControl: false,
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
});

describe('cache control', () => {
  describe('system message', () => {
    it('should set cache_control on system message with message cache control', async () => {
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'system',
            content: 'system message',
            providerMetadata: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'test',
                providerMetadata: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
            providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'test',
                providerMetadata: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'test-id',
                toolName: 'test-tool',
                args: { some: 'arg' },
                providerMetadata: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'user-content' }] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'part1' },
              { type: 'text', text: 'part2' },
            ],
            providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'test',
                result: { test: 'test' },
                providerMetadata: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        cacheControl: true,
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
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'part1',
                result: { test: 'part1' },
              },
              {
                type: 'tool-result',
                toolName: 'test',
                toolCallId: 'part2',
                result: { test: 'part2' },
              },
            ],
            providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
        cacheControl: true,
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

  describe('disabled cache control', () => {
    it('should not set cache_control on messages', async () => {
      const result = convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'test',
                providerMetadata: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' },
                  },
                },
              },
            ],
          },
        ],
        cacheControl: false,
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
                  cache_control: undefined,
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
