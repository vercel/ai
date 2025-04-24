import { BedrockReasoningMetadata } from './bedrock-chat-language-model';
import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';

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

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { text: 'Hello' },
          {
            document: {
              format: 'pdf',
              name: expect.any(String),
              source: {
                bytes: 'AAECAw==',
              },
            },
          },
        ],
      },
    ]);
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
            result: { value: 42 },
            content: [{ type: 'text', text: 'The result is 42' }],
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
            result: undefined,
            content: [
              {
                type: 'image',
                data: 'base64data',
                mediaType: 'image/jpeg',
              },
            ],
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
              result: undefined,
              content: [
                {
                  type: 'image',
                  data: 'base64data',
                  mediaType: 'image/webp', // unsupported format
                },
              ],
            },
          ],
        },
      ]),
    ).rejects.toThrow('Unsupported image format: webp');
  });

  it('should throw error for missing mime type in tool result image content', async () => {
    await expect(
      convertToBedrockChatMessages([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-123',
              toolName: 'image-generator',
              result: undefined,
              content: [
                {
                  type: 'image',
                  data: 'base64data',
                  // missing mediaType
                },
              ],
            },
          ],
        },
      ]),
    ).rejects.toThrow(
      'Image mime type is required in tool result part content',
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
            result: { value: 42 },
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
