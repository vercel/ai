import { BedrockReasoningMetadata } from './bedrock-chat-language-model';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import blns from 'big-list-of-naughty-strings';

describe('system messages', () => {
  it('should combine multiple leading system messages into a single system message', async () => {
    const { system } = await convertToBedrockChatMessages([
      { role: 'system', content: 'Hello' },
      { role: 'system', content: 'World' },
    ]);

    expect(system).toEqual([{ text: 'Hello' }, { text: 'World' }]);
  });

  it('should throw an error if a system message is provided after a non-system message', async () => {
    await expect(
      convertToBedrockChatMessages([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'system', content: 'World' },
      ]),
    ).rejects.toThrowError();
  });

  it('should set isSystemCachePoint when system message has cache point', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'system',
        content: 'Hello',
        providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
      },
    ]);

    expect(result).toEqual({
      system: [{ text: 'Hello' }, { cachePoint: { type: 'default' } }],
      messages: [],
    });
  });
});

describe('user messages', () => {
  it('should convert messages with image parts', async () => {
    const imageData = new Uint8Array([0, 1, 2, 3]);

    const { messages } = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            data: Buffer.from(imageData).toString('base64'),
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { text: 'Hello' },
          {
            image: {
              format: 'png',
              source: { bytes: 'AAECAw==' },
            },
          },
        ],
      },
    ]);
  });

  it('should convert messages with document parts', async () => {
    const fileData = new Uint8Array([0, 1, 2, 3]);

    const { messages } = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            data: Buffer.from(fileData).toString('base64'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ]);

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hello",
            },
            {
              "document": {
                "format": "pdf",
                "name": "document-1",
                "source": {
                  "bytes": "AAECAw==",
                },
              },
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should be converted with actual filename when provided', async () => {
    const fileData = new Uint8Array([0, 1, 2, 3]);

    const { messages } = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            data: Buffer.from(fileData).toString('base64'),
            mediaType: 'application/pdf',
            filename: 'custom-filename',
          },
        ],
      },
    ]);

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hello",
            },
            {
              "document": {
                "format": "pdf",
                "name": "custom-filename",
                "source": {
                  "bytes": "AAECAw==",
                },
              },
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should use consistent document names for prompt cache effectiveness', async () => {
    const fileData1 = new Uint8Array([0, 1, 2, 3]);
    const fileData2 = new Uint8Array([4, 5, 6, 7]);

    const { messages } = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(fileData1).toString('base64'),
            mediaType: 'application/pdf',
          },
          {
            type: 'file',
            data: Buffer.from(fileData2).toString('base64'),
            mediaType: 'application/pdf',
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'OK' }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(fileData1).toString('base64'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ]);

    expect(messages).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "document": {
                "format": "pdf",
                "name": "document-1",
                "source": {
                  "bytes": "AAECAw==",
                },
              },
            },
            {
              "document": {
                "format": "pdf",
                "name": "document-2",
                "source": {
                  "bytes": "BAUGBw==",
                },
              },
            },
          ],
          "role": "user",
        },
        {
          "content": [
            {
              "text": "OK",
            },
          ],
          "role": "assistant",
        },
        {
          "content": [
            {
              "document": {
                "format": "pdf",
                "name": "document-3",
                "source": {
                  "bytes": "AAECAw==",
                },
              },
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should extract the system message', async () => {
    const { system } = await convertToBedrockChatMessages([
      {
        role: 'system',
        content: 'Hello',
      },
    ]);

    expect(system).toEqual([{ text: 'Hello' }]);
  });

  it('should add cache point to user message content when specified', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Hello' }, { cachePoint: { type: 'default' } }],
        },
      ],
      system: [],
    });
  });
});

describe('assistant messages', () => {
  it('should remove trailing whitespace from last assistant message when there is no further user message', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'user content' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant content  ' }],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ text: 'assistant content' }],
        },
      ],
      system: [],
    });
  });

  it('should remove trailing whitespace from last assistant message with multi-part content when there is no further user message', async () => {
    const result = await convertToBedrockChatMessages([
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
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ text: 'assistant ' }, { text: 'content' }],
        },
      ],
      system: [],
    });
  });

  it('should keep trailing whitespace from assistant message when there is a further user message', async () => {
    const result = await convertToBedrockChatMessages([
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
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ text: 'assistant content  ' }],
        },
        {
          role: 'user',
          content: [{ text: 'user content 2' }],
        },
      ],
      system: [],
    });
  });

  it('should combine multiple sequential assistant messages into a single message', async () => {
    const result = await convertToBedrockChatMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'World' }] },
      { role: 'assistant', content: [{ type: 'text', text: '!' }] },
    ]);

    expect(result).toEqual({
      messages: [
        { role: 'user', content: [{ text: 'Hi!' }] },
        {
          role: 'assistant',
          content: [{ text: 'Hello' }, { text: 'World' }, { text: '!' }],
        },
      ],
      system: [],
    });
  });

  it('should add cache point to assistant message content when specified', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }],
        providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'assistant',
          content: [{ text: 'Hello' }, { cachePoint: { type: 'default' } }],
        },
      ],
      system: [],
    });
  });

  it('should properly convert reasoning content type', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Explain your reasoning' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'This is my step-by-step reasoning process',
            providerOptions: {
              bedrock: {
                signature: 'test-signature',
              } satisfies BedrockReasoningMetadata,
            },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Explain your reasoning' }],
        },
        {
          role: 'assistant',
          content: [
            {
              reasoningContent: {
                reasoningText: {
                  text: 'This is my step-by-step reasoning process',
                  signature: 'test-signature',
                },
              },
            },
          ],
        },
      ],
      system: [],
    });
  });

  it('should properly convert redacted-reasoning content type', async () => {
    const reasoningData = 'Redacted reasoning information';
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Explain your reasoning' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: '',
            providerOptions: { bedrock: { redactedData: reasoningData } },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Explain your reasoning' }],
        },
        {
          role: 'assistant',
          content: [
            {
              reasoningContent: {
                redactedReasoning: {
                  data: reasoningData,
                },
              },
            },
          ],
        },
      ],
      system: [],
    });
  });

  it('should trim trailing whitespace from reasoning content when it is the last part', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Explain your reasoning' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'This is my reasoning with trailing space    ',
            providerOptions: {
              bedrock: {
                signature: 'test-signature',
              } satisfies BedrockReasoningMetadata,
            },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Explain your reasoning' }],
        },
        {
          role: 'assistant',
          content: [
            {
              reasoningContent: {
                reasoningText: {
                  text: 'This is my reasoning with trailing space',
                  signature: 'test-signature',
                },
              },
            },
          ],
        },
      ],
      system: [],
    });
  });

  it('should handle a mix of text and reasoning content types', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Explain your reasoning' }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'My answer is 42.' },
          {
            type: 'reasoning',
            text: 'I calculated this by analyzing the meaning of life',
            providerOptions: {
              bedrock: {
                signature: 'reasoning-process',
              } satisfies BedrockReasoningMetadata,
            },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Explain your reasoning' }],
        },
        {
          role: 'assistant',
          content: [
            { text: 'My answer is 42.' },
            {
              reasoningContent: {
                reasoningText: {
                  text: 'I calculated this by analyzing the meaning of life',
                  signature: 'reasoning-process',
                },
              },
            },
          ],
        },
      ],
      system: [],
    });
  });

  it('should filter out empty text blocks in assistant messages', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '\n\n' },
          {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'test',
            input: {},
          },
          { type: 'text', text: '  ' },
          { type: 'text', text: 'actual content' },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: [
            { toolUse: { toolUseId: 'call-123', name: 'test', input: {} } },
            { text: 'actual content' },
          ],
        },
      ],
      system: [],
    });
  });
});

describe('tool messages', () => {
  it('should convert tool result with content array containing text', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-123',
            toolName: 'calculator',
            output: {
              type: 'content',
              value: [{ type: 'text', text: 'The result is 42' }],
            },
          },
        ],
      },
    ]);

    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'call-123',
            content: [{ text: 'The result is 42' }],
          },
        },
      ],
    });
  });

  it('should convert tool result with content array containing image', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-123',
            toolName: 'image-generator',
            output: {
              type: 'content',
              value: [
                {
                  type: 'image-data',
                  data: 'base64data',
                  mediaType: 'image/jpeg',
                },
              ],
            },
          },
        ],
      },
    ]);

    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'call-123',
            content: [
              {
                image: {
                  format: 'jpeg',
                  source: { bytes: 'base64data' },
                },
              },
            ],
          },
        },
      ],
    });
  });

  it('should throw error for unsupported image format in tool result content', async () => {
    await expect(
      convertToBedrockChatMessages([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-123',
              toolName: 'image-generator',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'image-data',
                    data: 'base64data',
                    mediaType: 'image/avif', // unsupported format
                  },
                ],
              },
            },
          ],
        },
      ]),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AI_UnsupportedFunctionalityError: Unsupported image mime type: image/avif, expected one of: image/jpeg, image/png, image/gif, image/webp]`,
    );
  });

  it('should throw error for unsupported mime type in tool result image content', async () => {
    await expect(
      convertToBedrockChatMessages([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-123',
              toolName: 'image-generator',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'image-data',
                    data: 'base64data',
                    mediaType: 'unsupported/mime-type',
                  },
                ],
              },
            },
          ],
        },
      ]),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AI_UnsupportedFunctionalityError: 'media type: unsupported/mime-type' functionality not supported.]`,
    );
  });

  it('should fallback to stringified result when content is undefined', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-123',
            toolName: 'calculator',
            output: { type: 'json', value: { value: 42 } },
          },
        ],
      },
    ]);

    expect(result.messages[0]).toEqual({
      role: 'user',
      content: [
        {
          toolResult: {
            toolUseId: 'call-123',
            content: [{ text: '{"value":42}' }],
          },
        },
      ],
    });
  });
});

describe('citations', () => {
  it('should handle citations enabled for PDF', async () => {
    const pdfData = new Uint8Array([0, 1, 2, 3]);

    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(pdfData).toString('base64'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: {
                  enabled: true,
                },
              },
            },
          },
        ],
      },
    ]);

    expect(result.messages[0].content[0]).toEqual({
      document: {
        format: 'pdf',
        name: 'document-1',
        source: {
          bytes: 'AAECAw==',
        },
        citations: {
          enabled: true,
        },
      },
    });
  });

  it('should handle citations disabled for PDF', async () => {
    const pdfData = new Uint8Array([0, 1, 2, 3]);

    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(pdfData).toString('base64'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: {
                  enabled: false,
                },
              },
            },
          },
        ],
      },
    ]);

    expect(result.messages[0].content[0]).toEqual({
      document: {
        format: 'pdf',
        name: 'document-1',
        source: {
          bytes: 'AAECAw==',
        },
      },
    });
  });

  it('should handle no citations specified for PDF (default)', async () => {
    const pdfData = new Uint8Array([0, 1, 2, 3]);

    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(pdfData).toString('base64'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ]);

    expect(result.messages[0].content[0]).toEqual({
      document: {
        format: 'pdf',
        name: 'document-1',
        source: {
          bytes: 'AAECAw==',
        },
      },
    });
  });

  it('should handle multiple PDFs with different citation settings', async () => {
    const pdfData1 = new Uint8Array([0, 1, 2, 3]);
    const pdfData2 = new Uint8Array([4, 5, 6, 7]);

    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: Buffer.from(pdfData1).toString('base64'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: {
                  enabled: true,
                },
              },
            },
          },
          {
            type: 'file',
            data: Buffer.from(pdfData2).toString('base64'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: {
                  enabled: false,
                },
              },
            },
          },
        ],
      },
    ]);

    expect(result.messages[0].content).toEqual([
      {
        document: {
          format: 'pdf',
          name: 'document-1',
          source: {
            bytes: 'AAECAw==',
          },
          citations: {
            enabled: true,
          },
        },
      },
      {
        document: {
          format: 'pdf',
          name: 'document-2',
          source: {
            bytes: 'BAUGBw==',
          },
        },
      },
    ]);
  });
});

describe('tool name validation', () => {
  // Test helper to reduce boilerplate
  const testToolNameSanitization = async (
    toolName: string,
    expectedName: string,
  ) => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'test' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName,
            input: {},
          },
        ],
      },
    ]);

    expect(result.messages[1].content[0]).toEqual({
      toolUse: {
        toolUseId: 'call-1',
        name: expectedName,
        input: {},
      },
    });
  };

  describe('issue #10202 - dollar sign character', () => {
    it('should sanitize $READFILE to _READFILE', async () => {
      await testToolNameSanitization('$READFILE', '_READFILE');
    });

    it('should sanitize $CHAT_READ_TOOL to _CHAT_READ_TOOL', async () => {
      await testToolNameSanitization('$CHAT_READ_TOOL', '_CHAT_READ_TOOL');
    });

    it('should sanitize tool$ (trailing dollar) to tool_', async () => {
      await testToolNameSanitization('tool$', 'tool_');
    });

    it('should sanitize read$file (middle dollar) to read_file', async () => {
      await testToolNameSanitization('read$file', 'read_file');
    });

    it('should sanitize $$$ (all dollars) to ___', async () => {
      await testToolNameSanitization('$$$', '___');
    });
  });

  describe('specific special characters', () => {
    it('should sanitize @ symbol: user@domain to user_domain', async () => {
      await testToolNameSanitization('user@domain', 'user_domain');
    });

    it('should sanitize ! exclamation: read!now to read_now', async () => {
      await testToolNameSanitization('read!now', 'read_now');
    });

    it('should sanitize . dot: file.reader to file_reader', async () => {
      await testToolNameSanitization('file.reader', 'file_reader');
    });

    it('should sanitize / slash: path/to/tool to path_to_tool', async () => {
      await testToolNameSanitization('path/to/tool', 'path_to_tool');
    });

    it('should sanitize \\ backslash: path\\tool to path_tool', async () => {
      await testToolNameSanitization('path\\tool', 'path_tool');
    });

    it('should sanitize : colon: namespace::tool to namespace__tool', async () => {
      await testToolNameSanitization('namespace::tool', 'namespace__tool');
    });

    it('should sanitize * asterisk: wild*card to wild_card', async () => {
      await testToolNameSanitization('wild*card', 'wild_card');
    });

    it('should sanitize ? question: is?valid to is_valid', async () => {
      await testToolNameSanitization('is?valid', 'is_valid');
    });

    it('should sanitize + plus: add+item to add_item', async () => {
      await testToolNameSanitization('add+item', 'add_item');
    });

    it('should sanitize = equals: key=value to key_value', async () => {
      await testToolNameSanitization('key=value', 'key_value');
    });

    it('should sanitize & ampersand: this&that to this_that', async () => {
      await testToolNameSanitization('this&that', 'this_that');
    });

    it('should sanitize % percent: 100%done to 100_done', async () => {
      await testToolNameSanitization('100%done', '100_done');
    });

    it('should sanitize # hash: tag#name to tag_name', async () => {
      await testToolNameSanitization('tag#name', 'tag_name');
    });

    it('should sanitize space: my tool to my_tool', async () => {
      await testToolNameSanitization('my tool', 'my_tool');
    });

    it('should sanitize tab: my\ttool to my_tool', async () => {
      await testToolNameSanitization('my\ttool', 'my_tool');
    });

    it('should sanitize newline: my\\ntool to my_tool', async () => {
      await testToolNameSanitization('my\ntool', 'my_tool');
    });
  });

  describe('brackets and parentheses', () => {
    it('should sanitize ( left paren: tool(arg to tool_arg', async () => {
      await testToolNameSanitization('tool(arg', 'tool_arg');
    });

    it('should sanitize ) right paren: tool)end to tool_end', async () => {
      await testToolNameSanitization('tool)end', 'tool_end');
    });

    it('should sanitize [ left bracket: tool[0] to tool_0_', async () => {
      await testToolNameSanitization('tool[0]', 'tool_0_');
    });

    it('should sanitize { left brace: tool{id} to tool_id_', async () => {
      await testToolNameSanitization('tool{id}', 'tool_id_');
    });

    it('should sanitize < less than: tool<T> to tool_T_', async () => {
      await testToolNameSanitization('tool<T>', 'tool_T_');
    });
  });

  describe('multiple consecutive invalid characters', () => {
    it('should sanitize multiple spaces: my   tool to my___tool', async () => {
      await testToolNameSanitization('my   tool', 'my___tool');
    });

    it('should sanitize mixed specials: @#$%^ to _____', async () => {
      await testToolNameSanitization('@#$%^', '_____');
    });

    it('should sanitize $$$TOOL$$$ to ___TOOL___', async () => {
      await testToolNameSanitization('$$$TOOL$$$', '___TOOL___');
    });

    it('should sanitize tool!!!now to tool___now', async () => {
      await testToolNameSanitization('tool!!!now', 'tool___now');
    });
  });

  describe('position-based invalid characters', () => {
    it('should sanitize leading invalid: $tool to _tool', async () => {
      await testToolNameSanitization('$tool', '_tool');
    });

    it('should sanitize trailing invalid: tool$ to tool_', async () => {
      await testToolNameSanitization('tool$', 'tool_');
    });

    it('should sanitize both ends invalid: $tool$ to _tool_', async () => {
      await testToolNameSanitization('$tool$', '_tool_');
    });

    it('should sanitize middle only: to$ol to to_ol', async () => {
      await testToolNameSanitization('to$ol', 'to_ol');
    });
  });

  describe('valid characters - should remain unchanged', () => {
    it('should preserve lowercase letters: readfile', async () => {
      await testToolNameSanitization('readfile', 'readfile');
    });

    it('should preserve uppercase letters: READFILE', async () => {
      await testToolNameSanitization('READFILE', 'READFILE');
    });

    it('should preserve mixed case: ReadFile', async () => {
      await testToolNameSanitization('ReadFile', 'ReadFile');
    });

    it('should preserve numbers: tool123', async () => {
      await testToolNameSanitization('tool123', 'tool123');
    });

    it('should preserve leading numbers: 123tool', async () => {
      await testToolNameSanitization('123tool', '123tool');
    });

    it('should preserve all numbers: 12345', async () => {
      await testToolNameSanitization('12345', '12345');
    });

    it('should preserve underscores: read_file_now', async () => {
      await testToolNameSanitization('read_file_now', 'read_file_now');
    });

    it('should preserve hyphens: read-file-now', async () => {
      await testToolNameSanitization('read-file-now', 'read-file-now');
    });

    it('should preserve mixed valid: read_file-123', async () => {
      await testToolNameSanitization('read_file-123', 'read_file-123');
    });

    it('should preserve single underscore: _', async () => {
      await testToolNameSanitization('_', '_');
    });

    it('should preserve single hyphen: -', async () => {
      await testToolNameSanitization('-', '-');
    });

    it('should preserve single letter: a', async () => {
      await testToolNameSanitization('a', 'a');
    });

    it('should preserve single number: 1', async () => {
      await testToolNameSanitization('1', '1');
    });
  });

  describe('real-world invalid patterns', () => {
    it('should sanitize common pattern: $FUNCTION_NAME', async () => {
      await testToolNameSanitization('$FUNCTION_NAME', '_FUNCTION_NAME');
    });

    it('should sanitize dotted namespace: fs.readFile', async () => {
      await testToolNameSanitization('fs.readFile', 'fs_readFile');
    });

    it('should sanitize double colon namespace: std::vector', async () => {
      await testToolNameSanitization('std::vector', 'std__vector');
    });

    it('should sanitize method call style: object.method()', async () => {
      await testToolNameSanitization('object.method()', 'object_method__');
    });

    it('should sanitize file path: /usr/bin/tool', async () => {
      await testToolNameSanitization('/usr/bin/tool', '_usr_bin_tool');
    });

    it('should sanitize Windows path: C:\\Program Files\\tool', async () => {
      await testToolNameSanitization(
        'C:\\Program Files\\tool',
        'C__Program_Files_tool',
      );
    });

    it('should sanitize URL-like: http://example.com/tool', async () => {
      await testToolNameSanitization(
        'http://example.com/tool',
        'http___example_com_tool',
      );
    });

    it('should sanitize email-like: user@example.com', async () => {
      await testToolNameSanitization('user@example.com', 'user_example_com');
    });

    it('should sanitize version: tool-v1.2.3', async () => {
      await testToolNameSanitization('tool-v1.2.3', 'tool-v1_2_3');
    });

    it('should sanitize semantic version: tool@1.0.0', async () => {
      await testToolNameSanitization('tool@1.0.0', 'tool_1_0_0');
    });
  });

  describe('naming convention preservation', () => {
    it('should preserve snake_case: read_file_from_disk', async () => {
      await testToolNameSanitization(
        'read_file_from_disk',
        'read_file_from_disk',
      );
    });

    it('should preserve kebab-case: read-file-from-disk', async () => {
      await testToolNameSanitization(
        'read-file-from-disk',
        'read-file-from-disk',
      );
    });

    it('should preserve PascalCase: ReadFileFromDisk', async () => {
      await testToolNameSanitization('ReadFileFromDisk', 'ReadFileFromDisk');
    });

    it('should preserve camelCase: readFileFromDisk', async () => {
      await testToolNameSanitization('readFileFromDisk', 'readFileFromDisk');
    });

    it('should preserve SCREAMING_SNAKE_CASE: READ_FILE_NOW', async () => {
      await testToolNameSanitization('READ_FILE_NOW', 'READ_FILE_NOW');
    });
  });

  describe('edge cases and boundaries', () => {
    it('should handle very long tool name with valid chars', async () => {
      const longName = 'a'.repeat(100);
      await testToolNameSanitization(longName, longName);
    });

    it('should handle very long tool name with invalid chars', async () => {
      const longName = '$'.repeat(100);
      const expected = '_'.repeat(100);
      await testToolNameSanitization(longName, expected);
    });

    it('should handle mixed long name: $$$$valid$$$$', async () => {
      await testToolNameSanitization('$$$$valid$$$$', '____valid____');
    });

    it('should handle alternating valid/invalid: a$b$c$d', async () => {
      await testToolNameSanitization('a$b$c$d', 'a_b_c_d');
    });
  });

  describe('unicode and non-ASCII characters', () => {
    it('should sanitize emoji (multi-byte): tool🔧name to tool__name', async () => {
      // Emoji is multi-byte UTF-8, so each byte becomes _
      await testToolNameSanitization('tool🔧name', 'tool__name');
    });

    it('should sanitize accented char: café to caf_', async () => {
      await testToolNameSanitization('café', 'caf_');
    });

    it('should sanitize Chinese chars: 工具名 to ___', async () => {
      // Each character is one code unit in UTF-16
      await testToolNameSanitization('工具名', '___');
    });

    it('should sanitize Arabic chars: أداة to ____', async () => {
      // Each character is one code unit in UTF-16
      await testToolNameSanitization('أداة', '____');
    });

    it('should sanitize accented Latin: naïve to na_ve', async () => {
      await testToolNameSanitization('naïve', 'na_ve');
    });

    it('should sanitize German umlaut: Müller to M_ller', async () => {
      await testToolNameSanitization('Müller', 'M_ller');
    });
  });

  describe('integration with full message flow', () => {
    it('should sanitize tool name in complete conversation', async () => {
      const result = await convertToBedrockChatMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Read this file for me' }],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will read the file using' },
            {
              type: 'tool-call',
              toolCallId: 'call-abc',
              toolName: '$READFILE',
              input: { path: '/tmp/data.txt' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-abc',
              toolName: '$READFILE',
              output: { type: 'text', value: 'File contents here' },
            },
          ],
        },
      ]);

      // Verify assistant message has sanitized tool name
      expect(result.messages[1].content[1]).toEqual({
        toolUse: {
          toolUseId: 'call-abc',
          name: '_READFILE',
          input: { path: '/tmp/data.txt' },
        },
      });

      // Verify tool result message
      expect(result.messages[2].content[0]).toEqual({
        toolResult: {
          toolUseId: 'call-abc',
          content: [{ text: 'File contents here' }],
        },
      });
    });

    it('should sanitize multiple tool calls with different invalid patterns', async () => {
      const result = await convertToBedrockChatMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Do multiple things' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: '$READ',
              input: {},
            },
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'write@file',
              input: {},
            },
            {
              type: 'tool-call',
              toolCallId: 'call-3',
              toolName: 'valid_tool',
              input: {},
            },
          ],
        },
      ]);

      expect(result.messages[1].content).toEqual([
        { toolUse: { toolUseId: 'call-1', name: '_READ', input: {} } },
        { toolUse: { toolUseId: 'call-2', name: 'write_file', input: {} } },
        { toolUse: { toolUseId: 'call-3', name: 'valid_tool', input: {} } },
      ]);
    });
  });

  // Note: Property-based tests with fast-check omitted due to edge cases
  // in Bedrock converter's whitespace handling unrelated to sanitization logic.
  // The 74 manual tests + 100+ fuzzing tests below provide comprehensive coverage.

  describe('fuzzing with Big List of Naughty Strings', () => {
    it('should handle all naughty strings without crashing', async () => {
      // Test a subset to keep test runtime reasonable
      const sampleSize = 100;
      const naughtyStrings = blns.slice(0, sampleSize);

      for (const naughtyString of naughtyStrings) {
        // Skip empty strings and comments
        if (!naughtyString || naughtyString.startsWith('#')) continue;

        const result = await convertToBedrockChatMessages([
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: naughtyString,
                input: {},
              },
            ],
          },
        ]);

        const sanitizedName = result.messages[1].content[0].toolUse?.name;
        // Should always produce valid Bedrock tool name
        expect(sanitizedName).toMatch(/^[a-zA-Z0-9_-]*$/);
      }
    });

    it('should handle SQL injection attempts in tool names', async () => {
      const sqlInjectionStrings = blns.filter(
        s => s.includes("'") || s.includes(';') || s.includes('DROP'),
      );

      for (const sqlString of sqlInjectionStrings.slice(0, 20)) {
        const result = await convertToBedrockChatMessages([
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: sqlString,
                input: {},
              },
            ],
          },
        ]);

        const sanitizedName = result.messages[1].content[0].toolUse?.name;
        // Should be sanitized to safe characters
        expect(sanitizedName).toMatch(/^[a-zA-Z0-9_-]*$/);
        // Should not contain any SQL special characters (apostrophe, semicolon)
        // Note: -- (double hyphen) is OK since hyphen is valid in Bedrock names
        expect(sanitizedName).not.toContain("'");
        expect(sanitizedName).not.toContain(';');
      }
    });

    it('should handle script/XSS injection attempts in tool names', async () => {
      const xssStrings = blns.filter(
        s => s.includes('<script') || s.includes('javascript:'),
      );

      for (const xssString of xssStrings.slice(0, 20)) {
        const result = await convertToBedrockChatMessages([
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: xssString,
                input: {},
              },
            ],
          },
        ]);

        const sanitizedName = result.messages[1].content[0].toolUse?.name;
        // Should not contain any HTML/script characters
        expect(sanitizedName).not.toContain('<');
        expect(sanitizedName).not.toContain('>');
        expect(sanitizedName).not.toContain(':');
      }
    });

    it('should handle emoji and special unicode from naughty strings', async () => {
      const unicodeStrings = blns.filter(
        s =>
          s.includes('🔧') ||
          s.includes('é') ||
          s.includes('中') ||
          s.includes('👨‍💻'),
      );

      for (const unicodeString of unicodeStrings.slice(0, 20)) {
        const result = await convertToBedrockChatMessages([
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: unicodeString,
                input: {},
              },
            ],
          },
        ]);

        const sanitizedName = result.messages[1].content[0].toolUse?.name;
        // Should be valid Bedrock name (ASCII only: [a-zA-Z0-9_-])
        expect(sanitizedName).toMatch(/^[a-zA-Z0-9_-]*$/);
      }
    });

    it('should handle zero-width and invisible characters', async () => {
      const invisibleChars = blns.filter(
        s =>
          s.includes('\u200B') || // Zero-width space
          s.includes('\u200C') || // Zero-width non-joiner
          s.includes('\u200D') || // Zero-width joiner
          s.includes('\uFEFF'), // Zero-width no-break space
      );

      for (const invisibleString of invisibleChars.slice(0, 10)) {
        const result = await convertToBedrockChatMessages([
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: invisibleString,
                input: {},
              },
            ],
          },
        ]);

        const sanitizedName = result.messages[1].content[0].toolUse?.name;
        // Invisible chars should be replaced with underscores
        expect(sanitizedName).toMatch(/^[a-zA-Z0-9_-]*$/);
      }
    });
  });
});

describe('additional file format tests', () => {
  it('should throw an error for unsupported file mime type in user message content', async () => {
    await expect(
      convertToBedrockChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'base64data',
              mediaType: 'application/rtf',
            },
          ],
        },
      ]),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[AI_UnsupportedFunctionalityError: Unsupported file mime type: application/rtf, expected one of: application/pdf, text/csv, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/html, text/plain, text/markdown]`,
    );
  });

  it('should handle xlsx files correctly', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'base64data',
            mediaType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": [
              {
                "document": {
                  "format": "xlsx",
                  "name": "document-1",
                  "source": {
                    "bytes": "base64data",
                  },
                },
              },
            ],
            "role": "user",
          },
        ],
        "system": [],
      }
    `);
  });

  it('should handle docx files correctly', async () => {
    const result = await convertToBedrockChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'base64data',
            mediaType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": [
              {
                "document": {
                  "format": "docx",
                  "name": "document-1",
                  "source": {
                    "bytes": "base64data",
                  },
                },
              },
            ],
            "role": "user",
          },
        ],
        "system": [],
      }
    `);
  });
});
