import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import {
  toUIMessageStream,
  convertModelMessages,
  LangSmithDeploymentTransport,
  type MessageFactories,
  type LangChainToolMessage,
  type LangChainAIMessage,
  type LangChainSystemMessage,
  type LangChainHumanMessage,
} from './langchain-adapter';
import { describe, it, expect, vi } from 'vitest';
import type { ModelMessage } from 'ai';

// Mock message factories for testing
const mockFactories: MessageFactories = {
  ToolMessage: params =>
    ({
      ...params,
      _type: 'ToolMessage',
    }) as LangChainToolMessage & { _type: string },
  AIMessage: params =>
    ({
      ...params,
      _type: 'AIMessage',
    }) as LangChainAIMessage & { _type: string },
  SystemMessage: params =>
    ({
      ...params,
      _type: 'SystemMessage',
    }) as LangChainSystemMessage & { _type: string },
  HumanMessage: params =>
    ({
      ...params,
      _type: 'HumanMessage',
    }) as LangChainHumanMessage & { _type: string },
};

describe('toUIMessageStream', () => {
  it('should emit start event on stream initialization', async () => {
    const inputStream = convertArrayToReadableStream([['values', {}]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result[0]).toEqual({ type: 'start' });
  });

  it('should handle text streaming from messages', async () => {
    const inputStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            id: 'msg-1',
            text: 'Hello',
            contentBlocks: [],
          },
        ],
      ],
      [
        'messages',
        [
          {
            id: 'msg-1',
            text: ' World',
            contentBlocks: [],
          },
        ],
      ],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "id": "msg-1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "msg-1",
          "type": "text-delta",
        },
        {
          "delta": " World",
          "id": "msg-1",
          "type": "text-delta",
        },
        {
          "id": "msg-1",
          "type": "text-end",
        },
      ]
    `);
  });

  it('should handle reasoning content blocks', async () => {
    const inputStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            id: 'msg-1',
            contentBlocks: [{ type: 'reasoning', reasoning: 'Thinking...' }],
          },
        ],
      ],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "id": "msg-1",
          "type": "reasoning-start",
        },
        {
          "delta": "Thinking...",
          "id": "msg-1",
          "type": "reasoning-delta",
        },
        {
          "id": "msg-1",
          "type": "reasoning-end",
        },
      ]
    `);
  });

  it('should handle tool call streaming', async () => {
    const inputStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            id: 'msg-1',
            tool_call_chunks: [
              { index: 0, id: 'call-1', name: 'get_weather', args: '{"loc' },
            ],
          },
        ],
      ],
      [
        'messages',
        [
          {
            id: 'msg-1',
            tool_call_chunks: [{ index: 0, args: 'ation": "NYC"}' }],
            tool_calls: [
              {
                type: 'tool_call',
                id: 'call-1',
                name: 'get_weather',
                args: { location: 'NYC' },
              },
            ],
          },
        ],
      ],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "toolCallId": "call-1",
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "inputTextDelta": "{"loc",
          "toolCallId": "call-1",
          "type": "tool-input-delta",
        },
        {
          "inputTextDelta": "ation": "NYC"}",
          "toolCallId": "call-1",
          "type": "tool-input-delta",
        },
        {
          "input": {
            "location": "NYC",
          },
          "toolCallId": "call-1",
          "toolName": "get_weather",
          "type": "tool-input-available",
        },
      ]
    `);
  });

  it('should handle tool message output', async () => {
    const inputStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            id: 'msg-1',
            tool_call_id: 'call-1',
            content: 'Sunny, 72°F',
          },
        ],
      ],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "output": "Sunny, 72°F",
          "toolCallId": "call-1",
          "type": "tool-output-available",
        },
      ]
    `);
  });

  it('should handle custom events', async () => {
    const inputStream = convertArrayToReadableStream([
      ['custom', { custom: 'data' }],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "data": {
            "custom": "data",
          },
          "transient": true,
          "type": "data-custom",
        },
      ]
    `);
  });

  it('should handle three-element arrays (with namespace)', async () => {
    const inputStream = convertArrayToReadableStream([
      ['namespace', 'custom', { data: 'value' }],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "data": {
            "data": "value",
          },
          "transient": true,
          "type": "data-custom",
        },
      ]
    `);
  });

  it('should error on non-array events', async () => {
    const inputStream = convertArrayToReadableStream([{ invalid: 'event' }]);

    await expect(
      convertReadableStreamToArray(toUIMessageStream(inputStream)),
    ).rejects.toThrow('Expected event to be an array');
  });

  it('should skip messages without id', async () => {
    const inputStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            text: 'No ID message',
            contentBlocks: [],
          },
        ],
      ],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should only have start, no text events
    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
      ]
    `);
  });
});

describe('convertModelMessages', () => {
  it('should convert system messages', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "SystemMessage",
          "content": "You are a helpful assistant.",
        },
      ]
    `);
  });

  it('should convert user messages with text content', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'user', content: 'Hello, world!' },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "HumanMessage",
          "content": "Hello, world!",
        },
      ]
    `);
  });

  it('should convert user messages with array content', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "HumanMessage",
          "content": [
            {
              "text": "Hello",
              "type": "text",
            },
          ],
        },
      ]
    `);
  });

  it('should convert user messages with image content', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            image: 'base64data',
            mediaType: 'image/png',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "HumanMessage",
          "content": [
            {
              "text": "What is this?",
              "type": "text",
            },
            {
              "data": "base64data",
              "mimeType": "image/png",
              "type": "image",
            },
          ],
        },
      ]
    `);
  });

  it('should convert user messages with file content', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Check this file' },
          {
            type: 'file',
            data: 'filedata',
            mediaType: 'application/pdf',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "HumanMessage",
          "content": [
            {
              "text": "Check this file",
              "type": "text",
            },
            {
              "data": "filedata",
              "mimeType": "application/pdf",
              "type": "file",
            },
          ],
        },
      ]
    `);
  });

  it('should convert assistant messages with text content', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'assistant', content: 'Hello, how can I help?' },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "AIMessage",
          "content": "Hello, how can I help?",
          "tool_calls": undefined,
        },
      ]
    `);
  });

  it('should convert assistant messages with tool calls', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            input: { location: 'NYC' },
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "AIMessage",
          "content": [
            {
              "args": {
                "location": "NYC",
              },
              "id": "call-1",
              "name": "get_weather",
              "type": "tool_call",
            },
          ],
          "tool_calls": [
            {
              "args": {
                "location": "NYC",
              },
              "id": "call-1",
              "name": "get_weather",
              "type": "tool_call",
            },
          ],
        },
      ]
    `);
  });

  it('should convert assistant messages with reasoning', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me think...' },
          { type: 'text', text: 'Here is my answer' },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "AIMessage",
          "content": [
            {
              "reasoning": "Let me think...",
              "type": "reasoning",
            },
            {
              "text": "Here is my answer",
              "type": "text",
            },
          ],
          "tool_calls": undefined,
        },
      ]
    `);
  });

  it('should convert tool messages with text output', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'text', value: 'Sunny, 72°F' },
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "ToolMessage",
          "content": "Sunny, 72°F",
          "name": "get_weather",
          "status": "success",
          "tool_call_id": "call-1",
        },
      ]
    `);
  });

  it('should convert tool messages with JSON output', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_data',
            output: { type: 'json', value: { temperature: 72, unit: 'F' } },
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "ToolMessage",
          "content": "{"temperature":72,"unit":"F"}",
          "name": "get_data",
          "status": "success",
          "tool_call_id": "call-1",
        },
      ]
    `);
  });

  it('should convert tool messages with error output', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'error-text', value: 'Location not found' },
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "ToolMessage",
          "content": "Location not found",
          "name": "get_weather",
          "status": "error",
          "tool_call_id": "call-1",
        },
      ]
    `);
  });

  it('should handle multiple messages in sequence', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi!' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const result = convertModelMessages(modelMessages, mockFactories);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "_type": "SystemMessage",
          "content": "You are helpful.",
        },
        {
          "_type": "HumanMessage",
          "content": "Hi!",
        },
        {
          "_type": "AIMessage",
          "content": "Hello!",
          "tool_calls": undefined,
        },
      ]
    `);
  });
});

describe('LangSmithDeploymentTransport', () => {
  it('should create transport with remote graph factory', () => {
    const mockRemoteGraph = vi.fn().mockReturnValue({
      stream: vi.fn(),
    });

    const transport = new LangSmithDeploymentTransport(
      { url: 'https://test.langsmith.app', apiKey: 'test-key' },
      mockRemoteGraph,
      mockFactories,
    );

    expect(transport).toBeDefined();
    expect(mockRemoteGraph).toHaveBeenCalledWith({
      url: 'https://test.langsmith.app',
      apiKey: 'test-key',
    });
  });

  it('should send messages and return UI stream', async () => {
    const mockStream = convertArrayToReadableStream([
      [
        'messages',
        [
          {
            id: 'msg-1',
            text: 'Hello',
            contentBlocks: [],
          },
        ],
      ],
      ['values', {}],
    ]);

    const mockRemoteGraph = vi.fn().mockReturnValue({
      stream: vi.fn().mockResolvedValue(mockStream),
    });

    const transport = new LangSmithDeploymentTransport(
      { url: 'https://test.langsmith.app' },
      mockRemoteGraph,
      mockFactories,
    );

    const resultStream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello!' }],
        },
      ],
      abortSignal: undefined,
    });

    const result = await convertReadableStreamToArray(resultStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "id": "msg-1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "msg-1",
          "type": "text-delta",
        },
        {
          "id": "msg-1",
          "type": "text-end",
        },
      ]
    `);
  });

  it('should throw error for reconnectToStream', async () => {
    const mockRemoteGraph = vi.fn().mockReturnValue({
      stream: vi.fn(),
    });

    const transport = new LangSmithDeploymentTransport(
      { url: 'https://test.langsmith.app' },
      mockRemoteGraph,
      mockFactories,
    );

    await expect(
      transport.reconnectToStream({ chatId: 'chat-1' }),
    ).rejects.toThrow('Method not implemented.');
  });
});
