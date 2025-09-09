import { describe, it, expect } from 'vitest';
import { LanguageModelV2CallWarning } from '@ai-sdk/provider';
import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('assistant message content ordering', () => {
  it('should reorder mixed assistant content with text before tool calls', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 10 items' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              input: {
                message: 'generate 10 items',
              },
            },
            {
              type: 'text',
              text: 'I generated code for 10 items.',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              output: {
                type: 'json',
                value: {
                  code: 'export const code = () => [...]',
                  packageJson: '{}',
                },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 100 items' }],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    // Verify assistant message has reordered content: text before tool_use
    const assistantMsg = result.prompt.messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    
    const hasToolUse = assistantMsg!.content.some(c => c.type === 'tool_use');
    const hasText = assistantMsg!.content.some(c => c.type === 'text');
    
    if (hasToolUse && hasText) {
      const contentTypes = assistantMsg!.content.map(c => c.type);
      expect(contentTypes).toEqual(['text', 'tool_use']); // Text should appear before tool_use
    }
    
    expect(result.prompt.messages).toBeDefined();
    expect(assistantMsg!.content).toHaveLength(2);
  });
});

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
  it('should handle tool calls followed by tool results and user messages', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 10 items' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              input: {
                message: 'generate 10 items',
              },
            },
            {
              type: 'text',
              text: 'I generated code for 10 items.',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              output: {
                type: 'json',
                value: {
                  code: 'export const code = () => [...]',
                  packageJson: '{}',
                },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 100 items' }],
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
            content: [{ type: 'text', text: 'generate 10 items', cache_control: undefined }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I generated code for 10 items.',
                cache_control: undefined,
              },
              {
                type: 'tool_use',
                id: 'tool-example-123',
                name: 'json',
                input: {
                  message: 'generate 10 items',
                },
                cache_control: undefined,
              },
            ],
          },
          {
            role: 'user',
            content: [
              // Tool result must appear FIRST to satisfy Anthropic's validation
              {
                type: 'tool_result',
                tool_use_id: 'tool-example-123',
                is_error: undefined,
                content: JSON.stringify({
                  code: 'export const code = () => [...]',
                  packageJson: '{}',
                }),
                cache_control: undefined,
              },
              {
                type: 'text',
                text: 'generate 100 items',
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

  it('should combine tool and user messages with tool_result first', async () => {
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
                cache_control: undefined,
              },
              {
                type: 'text',
                text: 'This is a user message',
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

  it('should place tool_result before user text in combined messages', async () => {
    // Ensures tool_result parts appear first in combined user messages
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 10 items' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              input: {
                message: 'generate 10 items',
              },
            },
            {
              type: 'text',
              text: 'I generated code for 10 items.',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool-example-123',
              toolName: 'json',
              output: {
                type: 'json',
                value: {
                  code: 'export const code = () => [...]',
                  packageJson: '{}',
                },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'generate 100 items' }],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    // The key fix: tool_result and user content are combined in a single message
    // but tool_result appears FIRST to satisfy Claude's validation requirements
    expect(result.prompt.messages).toHaveLength(3);
    expect(result.prompt.messages[0].role).toBe('user');
    expect(result.prompt.messages[1].role).toBe('assistant');
    expect(result.prompt.messages[2].role).toBe('user'); // combined tool_result + user message

    // Verify tool_result comes before user text in the combined message
    expect(result.prompt.messages[2].content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'tool-example-123',
        is_error: undefined,
        content: JSON.stringify({
          code: 'export const code = () => [...]',
          packageJson: '{}',
        }),
        cache_control: undefined,
      },
      {
        type: 'text',
        text: 'generate 100 items',
        cache_control: undefined,
      },
    ]);
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

  it('should place tool_result before user text in combined message', async () => {
    // Combines tool_result and user text in a single message (preserving role alternation)
    // but tool_result parts appear first, satisfying Claude's validation requirements

    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'analyze-tool',
              toolCallId: 'tool-call-123',
              output: {
                type: 'json',
                value: { analysis: 'Tool execution completed' },
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Thanks! Now please provide more details.' },
          ],
        },
      ],
      sendReasoning: true,
      warnings: [],
    });

    // Fixed behavior: still combines in single message, but tool_result comes first
    // This satisfies Claude's "tool_result immediately after tool_use" requirement
    expect(result).toEqual({
      prompt: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-call-123',
                is_error: undefined,
                content: JSON.stringify({
                  analysis: 'Tool execution completed',
                }),
              },
              {
                type: 'text',
                text: 'Thanks! Now please provide more details.',
              },
            ],
          },
        ],
        system: undefined,
      },
      betas: new Set(),
    });
  });

  it('should place multiple tool_result parts before user text in correct order', async () => {
    // Test multiple tool_use scenario: tool_result parts should appear first
    // and maintain the same order as their corresponding tool_use ids
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'search-tool',
              toolCallId: 'search-123',
              output: { type: 'text', value: 'Search result' },
            },
            {
              type: 'tool-result',
              toolName: 'analyze-tool',
              toolCallId: 'analyze-456',
              output: { type: 'json', value: { status: 'complete' } },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Great! What do you think about these results?',
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings: [],
    });

    expect(result.prompt.messages).toHaveLength(1);
    expect(result.prompt.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'search-123',
          content: 'Search result',
          is_error: undefined,
        },
        {
          type: 'tool_result',
          tool_use_id: 'analyze-456',
          content: JSON.stringify({ status: 'complete' }),
          is_error: undefined,
        },
        { type: 'text', text: 'Great! What do you think about these results?' },
      ],
    });
  });

  it('should place error tool_result parts before user text', async () => {
    // Test error tool results: should also appear first even when is_error: true
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'failing-tool',
              toolCallId: 'fail-789',
              output: { type: 'error-text', value: 'Tool execution failed' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'The tool failed. Can you try a different approach?',
            },
          ],
        },
      ],
      sendReasoning: false,
      warnings: [],
    });

    expect(result.prompt.messages).toHaveLength(1);
    expect(result.prompt.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'fail-789',
          content: 'Tool execution failed',
          is_error: true,
        },
        {
          type: 'text',
          text: 'The tool failed. Can you try a different approach?',
        },
      ],
    });
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

  it('should convert anthropic code_execution tool call and result parts', async () => {
    const warnings: LanguageModelV2CallWarning[] = [];
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              input: {
                code: 'print("Hello, world!")',
              },
              providerExecuted: true,
              toolCallId: 'srvtoolu_01XyZ1234567890',
              toolName: 'code_execution',
              type: 'tool-call',
            },
            {
              output: {
                type: 'json',
                value: {
                  type: 'code_execution_result',
                  stdout: 'Hello, world!',
                  stderr: '',
                  return_code: 0,
                },
              },
              toolCallId: 'srvtoolu_01XyZ1234567890',
              toolName: 'code_execution',
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
                  "id": "srvtoolu_01XyZ1234567890",
                  "input": {
                    "code": "print(\"Hello, world!\")",
                  },
                  "name": "code_execution",
                  "type": "server_tool_use",
                },
                {
                  "cache_control": undefined,
                  "content": {
                    "return_code": 0,
                    "stderr": "",
                    "stdout": "Hello, world!\",
                    "type": "code_execution_result",
                  },
                  "tool_use_id": "srvtoolu_01XyZ1234567890",
                  "type": "code_execution_tool_result",
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

describe('role: "tool" message handling edge cases', () => {
  describe('message block boundary cases', () => {
    it('should handle tool message immediately after system message', async () => {
      const warnings: LanguageModelV2CallWarning[] = [];
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Use this tool' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'test-123',
                toolName: 'json',
                input: { query: 'test' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'test-123',
                toolName: 'json',
                output: { type: 'json', value: { result: 'system boundary test' } },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'What happened?' }],
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
                    "text": "Use this tool",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "id": "test-123",
                    "input": {
                      "query": "test",
                    },
                    "name": "json",
                    "type": "tool_use",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "content": "{"result":"system boundary test"}",
                    "is_error": undefined,
                    "tool_use_id": "test-123",
                    "type": "tool_result",
                  },
                  {
                    "cache_control": undefined,
                    "text": "What happened?",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
            ],
            "system": [
              {
                "cache_control": undefined,
                "text": "You are a helpful assistant.",
                "type": "text",
              },
            ],
          },
        }
      `);
    });
  });

  describe('tool message ordering and combinations', () => {
    it('should handle consecutive role: "tool" messages', async () => {
      const warnings: LanguageModelV2CallWarning[] = [];
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Run multiple tools' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'tool-1',
                toolName: 'json',
                input: { query: 'first' },
              },
              {
                type: 'tool-call',
                toolCallId: 'tool-2',
                toolName: 'json',
                input: { query: 'second' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'tool-1',
                toolName: 'json',
                output: { type: 'json', value: { result: 'first' } },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'tool-2',
                toolName: 'json',
                output: { type: 'json', value: { result: 'second' } },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'What are the results?' }],
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
                    "text": "Run multiple tools",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "id": "tool-1",
                    "input": {
                      "query": "first",
                    },
                    "name": "json",
                    "type": "tool_use",
                  },
                  {
                    "cache_control": undefined,
                    "id": "tool-2",
                    "input": {
                      "query": "second",
                    },
                    "name": "json",
                    "type": "tool_use",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "content": "{"result":"first"}",
                    "is_error": undefined,
                    "tool_use_id": "tool-1",
                    "type": "tool_result",
                  },
                  {
                    "cache_control": undefined,
                    "content": "{"result":"second"}",
                    "is_error": undefined,
                    "tool_use_id": "tool-2",
                    "type": "tool_result",
                  },
                  {
                    "cache_control": undefined,
                    "text": "What are the results?",
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

    it('should handle orphaned tool message at conversation end', async () => {
      const warnings: LanguageModelV2CallWarning[] = [];
      const result = await convertToAnthropicMessagesPrompt({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Generate something' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'orphan-tool',
                toolName: 'json',
                input: { query: 'test' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'orphan-tool',
                toolName: 'json',
                output: { type: 'json', value: { data: 'orphaned' } },
              },
            ],
          },
          // No user message after tool - this is the "orphaned" case
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
                    "text": "Generate something",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "id": "orphan-tool",
                    "input": {
                      "query": "test",
                    },
                    "name": "json",
                    "type": "tool_use",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "cache_control": undefined,
                    "content": "{"data":"orphaned"}",
                    "is_error": undefined,
                    "tool_use_id": "orphan-tool",
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
});
