import { LanguageModelV1CallWarning } from '@ai-sdk/provider';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('system messages', () => {
  it('should convert a single system message into an anthropic system message', async () => {
    const result = convertToAnthropicMessagesPrompt({
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
    const result = convertToAnthropicMessagesPrompt({
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
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new URL('https://example.com/image.png'),
              mimeType: 'image/png',
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
                  type: 'base64',
                  media_type: 'image/png',
                  // Base64 encoded data of https://example.com/image.png
                  data: "PCFkb2N0eXBlIGh0bWw+CjxodG1sPgo8aGVhZD4KICAgIDx0aXRsZT5FeGFtcGxlIERvbWFpbjwvdGl0bGU+CgogICAgPG1ldGEgY2hhcnNldD0idXRmLTgiIC8+CiAgICA8bWV0YSBodHRwLWVxdWl2PSJDb250ZW50LXR5cGUiIGNvbnRlbnQ9InRleHQvaHRtbDsgY2hhcnNldD11dGYtOCIgLz4KICAgIDxtZXRhIG5hbWU9InZpZXdwb3J0IiBjb250ZW50PSJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MSIgLz4KICAgIDxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+CiAgICBib2R5IHsKICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZjBmMGYyOwogICAgICAgIG1hcmdpbjogMDsKICAgICAgICBwYWRkaW5nOiAwOwogICAgICAgIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBzeXN0ZW0tdWksIEJsaW5rTWFjU3lzdGVtRm9udCwgIlNlZ29lIFVJIiwgIk9wZW4gU2FucyIsICJIZWx2ZXRpY2EgTmV1ZSIsIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgICAgCiAgICB9CiAgICBkaXYgewogICAgICAgIHdpZHRoOiA2MDBweDsKICAgICAgICBtYXJnaW46IDVlbSBhdXRvOwogICAgICAgIHBhZGRpbmc6IDJlbTsKICAgICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmRmZGZmOwogICAgICAgIGJvcmRlci1yYWRpdXM6IDAuNWVtOwogICAgICAgIGJveC1zaGFkb3c6IDJweCAzcHggN3B4IDJweCByZ2JhKDAsMCwwLDAuMDIpOwogICAgfQogICAgYTpsaW5rLCBhOnZpc2l0ZWQgewogICAgICAgIGNvbG9yOiAjMzg0ODhmOwogICAgICAgIHRleHQtZGVjb3JhdGlvbjogbm9uZTsKICAgIH0KICAgIEBtZWRpYSAobWF4LXdpZHRoOiA3MDBweCkgewogICAgICAgIGRpdiB7CiAgICAgICAgICAgIG1hcmdpbjogMCBhdXRvOwogICAgICAgICAgICB3aWR0aDogYXV0bzsKICAgICAgICB9CiAgICB9CiAgICA8L3N0eWxlPiAgICAKPC9oZWFkPgoKPGJvZHk+CjxkaXY+CiAgICA8aDE+RXhhbXBsZSBEb21haW48L2gxPgogICAgPHA+VGhpcyBkb21haW4gaXMgZm9yIHVzZSBpbiBpbGx1c3RyYXRpdmUgZXhhbXBsZXMgaW4gZG9jdW1lbnRzLiBZb3UgbWF5IHVzZSB0aGlzCiAgICBkb21haW4gaW4gbGl0ZXJhdHVyZSB3aXRob3V0IHByaW9yIGNvb3JkaW5hdGlvbiBvciBhc2tpbmcgZm9yIHBlcm1pc3Npb24uPC9wPgogICAgPHA+PGEgaHJlZj0iaHR0cHM6Ly93d3cuaWFuYS5vcmcvZG9tYWlucy9leGFtcGxlIj5Nb3JlIGluZm9ybWF0aW9uLi4uPC9hPjwvcD4KPC9kaXY+CjwvYm9keT4KPC9odG1sPgo="
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
        sendReasoning: true,
        warnings: [],
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
        sendReasoning: true,
        warnings: [],
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
    const result = convertToAnthropicMessagesPrompt({
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
    const warnings: LanguageModelV1CallWarning[] = [];
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
              signature: 'test-signature',
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

  it('should convert reasoning parts without signature into thinking parts when sendReasoning is true', async () => {
    const warnings: LanguageModelV1CallWarning[] = [];
    const result = convertToAnthropicMessagesPrompt({
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

  it('should omit assistant message reasoning parts with signature when sendReasoning is false', async () => {
    const warnings: LanguageModelV1CallWarning[] = [];
    const result = convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'I need to count the number of "r"s in the word "strawberry".',
              signature: 'test-signature',
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
    const warnings: LanguageModelV1CallWarning[] = [];
    const result = convertToAnthropicMessagesPrompt({
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
