import { convertToOpenAICompatibleChatMessages } from './convert-to-openai-compatible-chat-messages';

describe('user messages', () => {
  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert messages with image parts', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image',
            image: new Uint8Array([0, 1, 2, 3]),
            mimeType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toEqual([
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

  it('should handle URL-based images', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: new URL('https://example.com/image.jpg'),
            mimeType: 'image/jpeg',
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
});

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            args: { foo: 'bar123' },
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
            result: { oof: '321rab' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
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
});

describe('metadata merging', () => {
  it('should merge system message metadata', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        providerMetadata: {
          openaiCompatible: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
    ]);

    expect(result).toEqual([
      {
        role: 'system',
        content: 'You are a helpful assistant.',
        cacheControl: { type: 'ephemeral' },
      },
    ]);
  });

  it('should merge user message content metadata', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello',
            providerMetadata: {
              openaiCompatible: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: 'Hello',
        cacheControl: { type: 'ephemeral' },
      },
    ]);
  });

  it('should merge metadata at multiple levels', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        providerMetadata: {
          openaiCompatible: {
            messageLevel: true,
          },
        },
        content: [
          {
            type: 'text',
            text: 'Hello',
            providerMetadata: {
              openaiCompatible: {
                contentLevel: true,
              },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        messageLevel: true,
        content: 'Hello',
        contentLevel: true,
      },
    ]);
  });

  it('should handle tool calls with metadata', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'calculator',
            args: { x: 1, y: 2 },
            providerMetadata: {
              openaiCompatible: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: JSON.stringify({ x: 1, y: 2 }),
            },
            cacheControl: { type: 'ephemeral' },
          },
        ],
      },
    ]);
  });

  it('should handle image content with metadata', async () => {
    const imageUrl = new URL('https://example.com/image.jpg');
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: imageUrl,
            mimeType: 'image/jpeg',
            providerMetadata: {
              openaiCompatible: {
                cacheControl: { type: 'ephemeral' },
              },
            },
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
            image_url: { url: imageUrl.toString() },
            cacheControl: { type: 'ephemeral' },
          },
        ],
      },
    ]);
  });

  it('should preserve non-openaiCompatible metadata', async () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'system',
        content: 'Hello',
        providerMetadata: {
          someOtherProvider: {
            shouldBeIgnored: true,
          },
        },
      },
    ]);

    expect(result).toEqual([
      {
        role: 'system',
        content: 'Hello',
        providerMetadata: {
          someOtherProvider: {
            shouldBeIgnored: true,
          },
        },
      },
    ]);
  });
});

describe('complex part-level transformations', () => {
  it('should handle a user message with multiple content parts (text + image)', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello from part 1',
            providerMetadata: {
              openaiCompatible: { sentiment: 'positive' },
              leftoverKey: { foo: 'some leftover data' },
            },
          },
          {
            type: 'image',
            image: new Uint8Array([0, 1, 2, 3]),
            mimeType: 'image/png',
            providerMetadata: {
              openaiCompatible: { alt_text: 'A sample image' },
            },
          },
        ],
        providerMetadata: {
          openaiCompatible: { priority: 'high' },
        },
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        priority: 'high', // hoisted from message-level providerMetadata
        content: [
          {
            type: 'text',
            text: 'Hello from part 1',
            sentiment: 'positive', // hoisted from part-level openaiCompatible
            providerMetadata: {
              leftoverKey: { foo: 'some leftover data' },
            },
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,AAECAw==',
            },
            alt_text: 'A sample image',
          },
        ],
      },
    ]);
  });

  it('should handle a user message with multiple text parts (flattening disabled)', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ]);

    // Because there are multiple text parts, the converter won't flatten them
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ]);
  });

  it('should handle an assistant message with text plus multiple tool calls', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking that now...' },
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'searchTool',
            args: { query: 'Weather' },
            providerMetadata: {
              openaiCompatible: { function_call_reason: 'user request' },
            },
          },
          { type: 'text', text: 'Almost there...' },
          {
            type: 'tool-call',
            toolCallId: 'call2',
            toolName: 'mapsTool',
            args: { location: 'Paris' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Checking that now...Almost there...',
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: {
              name: 'searchTool',
              arguments: JSON.stringify({ query: 'Weather' }),
            },
            function_call_reason: 'user request',
          },
          {
            id: 'call2',
            type: 'function',
            function: {
              name: 'mapsTool',
              arguments: JSON.stringify({ location: 'Paris' }),
            },
          },
        ],
      },
    ]);
  });

  it('should handle a single tool role message with multiple tool-result parts', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'tool',
        providerMetadata: {
          openaiCompatible: { responseTier: 'detailed' },
        },
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call123',
            toolName: 'calculator',
            result: { stepOne: 'data chunk 1' },
          },
          {
            type: 'tool-result',
            toolCallId: 'call123',
            toolName: 'calculator',
            providerMetadata: {
              openaiCompatible: { partial: true },
            },
            result: { stepTwo: 'data chunk 2' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call123',
        content: JSON.stringify({ stepOne: 'data chunk 1' }),
        responseTier: 'detailed',
      },
      {
        role: 'tool',
        tool_call_id: 'call123',
        content: JSON.stringify({ stepTwo: 'data chunk 2' }),
        partial: true,
        responseTier: 'detailed',
      },
    ]);
  });
});

describe('additional permutations tests', () => {
  it('should handle multiple content parts with multiple metadata layers', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'user',
        providerMetadata: {
          openaiCompatible: { messageLevel: 'global-metadata' },
          leftoverForMessage: { x: 123 },
        },
        content: [
          {
            type: 'text',
            text: 'Part A',
            providerMetadata: {
              openaiCompatible: { textPartLevel: 'localized' },
              leftoverForText: { info: 'text leftover' },
            },
          },
          {
            type: 'image',
            image: new Uint8Array([9, 8, 7, 6]),
            mimeType: 'image/png',
            providerMetadata: {
              openaiCompatible: { imagePartLevel: 'image-data' },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        messageLevel: 'global-metadata',
        content: [
          {
            type: 'text',
            text: 'Part A',
            textPartLevel: 'localized',
            providerMetadata: {
              leftoverForText: { info: 'text leftover' },
            },
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,CQgHBg==',
            },
            imagePartLevel: 'image-data',
          },
        ],
        providerMetadata: {
          leftoverForMessage: { x: 123 },
        },
      },
    ]);
  });

  it('should handle different tool metadata vs. message-level metadata', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'assistant',
        providerMetadata: {
          openaiCompatible: { globalPriority: 'high' },
        },
        content: [
          { type: 'text', text: 'Initiating tool calls...' },
          {
            type: 'tool-call',
            toolCallId: 'callXYZ',
            toolName: 'awesomeTool',
            args: { param: 'someValue' },
            providerMetadata: {
              openaiCompatible: {
                toolPriority: 'critical',
              },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        globalPriority: 'high',
        content: 'Initiating tool calls...',
        tool_calls: [
          {
            id: 'callXYZ',
            type: 'function',
            function: {
              name: 'awesomeTool',
              arguments: JSON.stringify({ param: 'someValue' }),
            },
            toolPriority: 'critical',
          },
        ],
      },
    ]);
  });

  it('should handle metadata collisions and overwrites in tool calls', () => {
    const result = convertToOpenAICompatibleChatMessages([
      {
        role: 'assistant',
        providerMetadata: {
          openaiCompatible: {
            cacheControl: { type: 'default' },
            sharedKey: 'assistantLevel',
          },
        },
        content: [
          {
            type: 'tool-call',
            toolCallId: 'collisionToolCall',
            toolName: 'collider',
            args: { num: 42 },
            providerMetadata: {
              openaiCompatible: {
                cacheControl: { type: 'ephemeral' }, // overwrites top-level
                sharedKey: 'toolLevel',
              },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        cacheControl: { type: 'default' },
        sharedKey: 'assistantLevel',
        content: '',
        tool_calls: [
          {
            id: 'collisionToolCall',
            type: 'function',
            function: {
              name: 'collider',
              arguments: JSON.stringify({ num: 42 }),
            },
            cacheControl: { type: 'ephemeral' },
            sharedKey: 'toolLevel',
          },
        ],
      },
    ]);
  });
});
