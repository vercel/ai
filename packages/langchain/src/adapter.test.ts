import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import {
  toUIMessageStream,
  toBaseMessages,
  convertModelMessages,
} from './adapter';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ModelMessage, UIMessage } from 'ai';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  LANGGRAPH_RESPONSE_1,
  LANGGRAPH_RESPONSE_2,
  REACT_AGENT_TOOL_CALLING,
} from './__fixtures__/langgraph';

describe('toUIMessageStream', () => {
  it('should emit start event on stream initialization', async () => {
    const inputStream = convertArrayToReadableStream([['values', {}]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result[0]).toEqual({ type: 'start' });
  });

  it('should handle text streaming from messages', async () => {
    // Create actual AIMessageChunk instances
    const chunk1 = new AIMessage({ content: 'Hello', id: 'msg-1' });
    const chunk2 = new AIMessage({ content: ' World', id: 'msg-1' });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk1]],
      ['messages', [chunk2]],
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
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle tool message output', async () => {
    const toolMsg = new ToolMessage({
      tool_call_id: 'call-1',
      content: 'Sunny, 72°F',
    });
    toolMsg.id = 'msg-1';

    const inputStream = convertArrayToReadableStream([
      ['messages', [toolMsg]],
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
        {
          "type": "finish",
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
          "id": undefined,
          "transient": true,
          "type": "data-custom",
        },
        {
          "type": "finish",
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
          "id": undefined,
          "transient": true,
          "type": "data-custom",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle non-array events as model stream', async () => {
    // Non-array events are treated as model stream chunks (AIMessageChunk)
    // This tests that the auto-detection works correctly
    const chunk = new AIMessageChunk({
      content: 'Hello from model',
      id: 'test-1',
    });
    const inputStream = convertArrayToReadableStream([chunk]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "id": "test-1",
          "type": "text-start",
        },
        {
          "delta": "Hello from model",
          "id": "test-1",
          "type": "text-delta",
        },
        {
          "id": "test-1",
          "type": "text-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should skip messages without id', async () => {
    const msg = new AIMessage({ content: 'No ID message' });

    const inputStream = convertArrayToReadableStream([
      ['messages', [msg]],
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
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle plain objects from RemoteGraph API (type: ai)', async () => {
    // Simulate deserialized JSON from RemoteGraph API (not class instances)
    const plainMsg = {
      content: 'Hello from RemoteGraph',
      id: 'chatcmpl-123',
      type: 'ai',
      tool_call_chunks: [],
    };

    const inputStream = convertArrayToReadableStream([
      ['messages', [plainMsg]],
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
          "id": "chatcmpl-123",
          "type": "text-start",
        },
        {
          "delta": "Hello from RemoteGraph",
          "id": "chatcmpl-123",
          "type": "text-delta",
        },
        {
          "id": "chatcmpl-123",
          "type": "text-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle plain objects from RemoteGraph API (type: tool)', async () => {
    // Simulate deserialized JSON from RemoteGraph API (not class instances)
    const plainToolMsg = {
      content: 'Tool result here',
      id: 'tool-msg-123',
      type: 'tool',
      tool_call_id: 'call-abc',
    };

    const inputStream = convertArrayToReadableStream([
      ['messages', [plainToolMsg]],
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
          "output": "Tool result here",
          "toolCallId": "call-abc",
          "type": "tool-output-available",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle tool calls that appear only in values event', async () => {
    // Simulate a case where tool calls appear in values but weren't streamed in messages
    const valuesData = {
      messages: [
        {
          content: '',
          id: 'ai-msg-1',
          type: 'ai',
          tool_calls: [
            {
              id: 'call-123',
              name: 'get_weather',
              args: { city: 'SF' },
            },
          ],
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "dynamic": true,
          "toolCallId": "call-123",
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "dynamic": true,
          "input": {
            "city": "SF",
          },
          "toolCallId": "call-123",
          "toolName": "get_weather",
          "type": "tool-input-available",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle tool calls in additional_kwargs format from values event', async () => {
    // Simulate OpenAI format tool calls in additional_kwargs
    const valuesData = {
      messages: [
        {
          content: '',
          id: 'ai-msg-1',
          type: 'ai',
          additional_kwargs: {
            tool_calls: [
              {
                id: 'call-456',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "type": "start",
        },
        {
          "dynamic": true,
          "toolCallId": "call-456",
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "dynamic": true,
          "input": {
            "city": "NYC",
          },
          "toolCallId": "call-456",
          "toolName": "get_weather",
          "type": "tool-input-available",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should not duplicate tool calls when streamed and in values', async () => {
    // Simulate a tool call that is streamed in messages and also appears in values
    // This is the typical case from RemoteGraph API
    const streamedChunk = {
      content: '',
      id: 'ai-msg-1',
      type: 'ai',
      tool_call_chunks: [
        {
          id: 'call-789',
          name: 'get_weather',
          args: '{"city":"LA"}',
          index: 0,
        },
      ],
    };

    const valuesData = {
      messages: [
        {
          content: '',
          id: 'ai-msg-1',
          type: 'ai',
          tool_calls: [
            {
              id: 'call-789',
              name: 'get_weather',
              args: { city: 'LA' },
            },
          ],
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([
      ['messages', [streamedChunk]],
      ['values', valuesData],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should only have one tool call event, not two
    const toolCallEvents = result.filter(
      (e: { type: string }) =>
        e.type === 'tool-input-start' || e.type === 'tool-input-available',
    );
    expect(toolCallEvents).toHaveLength(1);
    expect(toolCallEvents[0]).toEqual({
      type: 'tool-input-start',
      toolCallId: 'call-789',
      toolName: 'get_weather',
      dynamic: true,
    });
  });

  it('should skip tool call chunks without id and use values instead', async () => {
    // Simulate a case where streaming chunks don't have an id (common with RemoteGraph)
    // The tool call should only be emitted from values, not from streaming
    const streamedChunkWithoutId = {
      content: '',
      id: 'ai-msg-1',
      type: 'ai',
      tool_call_chunks: [
        {
          // No id in chunk - should be skipped
          name: 'get_weather',
          args: '{"city":"LA"}',
          index: 0,
        },
      ],
    };

    const valuesData = {
      messages: [
        {
          content: '',
          id: 'ai-msg-1',
          type: 'ai',
          tool_calls: [
            {
              id: 'call-real-id',
              name: 'get_weather',
              args: { city: 'LA' },
            },
          ],
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([
      ['messages', [streamedChunkWithoutId]],
      ['values', valuesData],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should have tool-input-start followed by tool-input-available from values
    const toolCallEvents = result.filter(
      (e: { type: string }) =>
        e.type === 'tool-input-start' || e.type === 'tool-input-available',
    );
    expect(toolCallEvents).toHaveLength(2);
    expect(toolCallEvents[0]).toEqual({
      type: 'tool-input-start',
      toolCallId: 'call-real-id',
      toolName: 'get_weather',
      dynamic: true,
    });
    expect(toolCallEvents[1]).toEqual({
      type: 'tool-input-available',
      toolCallId: 'call-real-id',
      toolName: 'get_weather',
      input: { city: 'LA' },
      dynamic: true,
    });
  });

  it('should handle reasoning content from contentBlocks', async () => {
    // Create an AIMessageChunk with contentBlocks containing reasoning
    const chunk = new AIMessageChunk({ id: 'msg-reason', content: '' });
    // Simulate contentBlocks with reasoning (as the customer does with Object.defineProperty)
    Object.defineProperty(chunk, 'contentBlocks', {
      get: () => [
        { type: 'reasoning', reasoning: 'Let me think about this...' },
      ],
    });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk]],
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
          "id": "msg-reason",
          "type": "reasoning-start",
        },
        {
          "delta": "Let me think about this...",
          "id": "msg-reason",
          "type": "reasoning-delta",
        },
        {
          "id": "msg-reason",
          "type": "reasoning-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle thinking content from contentBlocks (Anthropic-style)', async () => {
    // Create an AIMessageChunk with contentBlocks containing thinking (Anthropic-style)
    const chunk = new AIMessageChunk({ id: 'msg-think', content: '' });
    Object.defineProperty(chunk, 'contentBlocks', {
      get: () => [
        {
          type: 'thinking',
          thinking: 'First, I need to analyze...',
          signature: 'abc123',
        },
      ],
    });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk]],
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
          "id": "msg-think",
          "type": "reasoning-start",
        },
        {
          "delta": "First, I need to analyze...",
          "id": "msg-think",
          "type": "reasoning-delta",
        },
        {
          "id": "msg-think",
          "type": "reasoning-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle multiple reasoning chunks in sequence', async () => {
    const chunk1 = new AIMessageChunk({ id: 'msg-reason', content: '' });
    Object.defineProperty(chunk1, 'contentBlocks', {
      get: () => [{ type: 'reasoning', reasoning: 'First...' }],
    });

    const chunk2 = new AIMessageChunk({ id: 'msg-reason', content: '' });
    Object.defineProperty(chunk2, 'contentBlocks', {
      get: () => [{ type: 'reasoning', reasoning: 'Second...' }],
    });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk1]],
      ['messages', [chunk2]],
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
          "id": "msg-reason",
          "type": "reasoning-start",
        },
        {
          "delta": "First...",
          "id": "msg-reason",
          "type": "reasoning-delta",
        },
        {
          "delta": "Second...",
          "id": "msg-reason",
          "type": "reasoning-delta",
        },
        {
          "id": "msg-reason",
          "type": "reasoning-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle reasoning followed by text content', async () => {
    // Reasoning chunk
    const reasoningChunk = new AIMessageChunk({ id: 'msg-1', content: '' });
    Object.defineProperty(reasoningChunk, 'contentBlocks', {
      get: () => [{ type: 'reasoning', reasoning: 'Thinking about this...' }],
    });

    // Text chunk
    const textChunk = new AIMessageChunk({
      id: 'msg-1',
      content: 'Here is my answer.',
    });

    const inputStream = convertArrayToReadableStream([
      ['messages', [reasoningChunk]],
      ['messages', [textChunk]],
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
          "delta": "Thinking about this...",
          "id": "msg-1",
          "type": "reasoning-delta",
        },
        {
          "id": "msg-1",
          "type": "text-start",
        },
        {
          "delta": "Here is my answer.",
          "id": "msg-1",
          "type": "text-delta",
        },
        {
          "id": "msg-1",
          "type": "text-end",
        },
        {
          "id": "msg-1",
          "type": "reasoning-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle reasoning with tool calls', async () => {
    // Reasoning before tool call
    const reasoningChunk = new AIMessageChunk({ id: 'msg-1', content: '' });
    Object.defineProperty(reasoningChunk, 'contentBlocks', {
      get: () => [
        { type: 'reasoning', reasoning: 'I need to search for this...' },
      ],
    });

    // Tool call chunk
    const toolCallChunk = {
      content: '',
      id: 'msg-1',
      type: 'ai',
      tool_call_chunks: [
        {
          id: 'call-123',
          name: 'search',
          args: '{"query":"test"}',
          index: 0,
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([
      ['messages', [reasoningChunk]],
      ['messages', [toolCallChunk]],
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
          "delta": "I need to search for this...",
          "id": "msg-1",
          "type": "reasoning-delta",
        },
        {
          "dynamic": true,
          "toolCallId": "call-123",
          "toolName": "search",
          "type": "tool-input-start",
        },
        {
          "inputTextDelta": "{"query":"test"}",
          "toolCallId": "call-123",
          "type": "tool-input-delta",
        },
        {
          "id": "msg-1",
          "type": "reasoning-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle model stream with reasoning contentBlocks', async () => {
    // Non-array events are treated as model stream chunks (AIMessageChunk)
    const reasoningChunk = new AIMessageChunk({
      content: '',
      id: 'test-1',
    });
    Object.defineProperty(reasoningChunk, 'contentBlocks', {
      get: () => [{ type: 'reasoning', reasoning: 'Thinking...' }],
    });

    const textChunk = new AIMessageChunk({
      content: 'Hello!',
      id: 'test-1',
    });

    const inputStream = convertArrayToReadableStream([
      reasoningChunk,
      textChunk,
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
          "id": "test-1",
          "type": "reasoning-start",
        },
        {
          "delta": "Thinking...",
          "id": "test-1",
          "type": "reasoning-delta",
        },
        {
          "id": "test-1",
          "type": "reasoning-end",
        },
        {
          "id": "test-1",
          "type": "text-start",
        },
        {
          "delta": "Hello!",
          "id": "test-1",
          "type": "text-delta",
        },
        {
          "id": "test-1",
          "type": "text-end",
        },
        {
          "type": "finish",
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

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[0].content).toBe('You are a helpful assistant.');
  });

  it('should convert user messages with text content', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'user', content: 'Hello, world!' },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toBe('Hello, world!');
  });

  it('should convert user messages with array content', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toBe('Hello');
  });

  it('should convert user messages with image content (URL)', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          {
            type: 'image',
            image: 'https://example.com/image.jpg',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.jpg' },
      },
    ]);
  });

  it('should convert user messages with image content (base64)', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          {
            type: 'image',
            image: 'iVBORw0KGgoAAAANSUhEUgAAAAE',
            mediaType: 'image/png',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE' },
      },
    ]);
  });

  it('should convert user messages with image content (data URL)', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this.' },
          {
            type: 'image',
            image: 'data:image/png;base64,abc123',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Describe this.' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abc123' },
      },
    ]);
  });

  it('should convert user messages with file content (URL)', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this document.' },
          {
            type: 'file',
            data: 'https://example.com/document.pdf',
            mediaType: 'application/pdf',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Summarize this document.' },
      {
        type: 'file',
        url: 'https://example.com/document.pdf',
        mimeType: 'application/pdf',
        filename: 'file.pdf',
      },
    ]);
  });

  it('should convert user messages with file content (base64)', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this file?' },
          {
            type: 'file',
            data: 'JVBERi0xLjQK',
            mediaType: 'application/pdf',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'What is in this file?' },
      {
        type: 'file',
        data: 'JVBERi0xLjQK',
        mimeType: 'application/pdf',
        filename: 'file.pdf',
      },
    ]);
  });

  it('should convert user messages with mixed multimodal content', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Compare these:' },
          {
            type: 'image',
            image: 'https://example.com/image1.jpg',
          },
          { type: 'text', text: 'And this document:' },
          {
            type: 'file',
            data: 'https://example.com/doc.pdf',
            mediaType: 'application/pdf',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Compare these:' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image1.jpg' },
      },
      { type: 'text', text: 'And this document:' },
      {
        type: 'file',
        url: 'https://example.com/doc.pdf',
        mimeType: 'application/pdf',
        filename: 'file.pdf',
      },
    ]);
  });

  it('should convert user messages with URL object for image', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            image: new URL('https://example.com/image.png'),
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'What is this?' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png' },
      },
    ]);
  });

  it('should convert image files (file type with image mediaType) using image_url format', () => {
    const modelMessages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this photo.' },
          {
            type: 'file',
            data: 'https://example.com/photo.jpg',
            mediaType: 'image/jpeg',
          },
        ],
      },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Describe this photo.' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/photo.jpg' },
      },
    ]);
  });

  it('should convert assistant messages with text content', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'assistant', content: 'Hello, how can I help?' },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[0].content).toBe('Hello, how can I help?');
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

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AIMessage);
    const aiMsg = result[0] as AIMessage;
    expect(aiMsg.tool_calls).toHaveLength(1);
    expect(aiMsg.tool_calls?.[0]).toEqual({
      id: 'call-1',
      name: 'get_weather',
      args: { location: 'NYC' },
    });
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

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(ToolMessage);
    const toolMsg = result[0] as ToolMessage;
    expect(toolMsg.tool_call_id).toBe('call-1');
    expect(toolMsg.content).toBe('Sunny, 72°F');
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

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(ToolMessage);
    const toolMsg = result[0] as ToolMessage;
    expect(toolMsg.content).toBe('{"temperature":72,"unit":"F"}');
  });

  it('should handle multiple messages in sequence', () => {
    const modelMessages: ModelMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi!' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const result = convertModelMessages(modelMessages);

    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[1]).toBeInstanceOf(HumanMessage);
    expect(result[2]).toBeInstanceOf(AIMessage);
  });
});

describe('toBaseMessages', () => {
  it('should convert UIMessages to LangChain BaseMessages', async () => {
    const uiMessages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello!' }],
      },
      {
        id: 'msg-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi there!' }],
      },
    ];

    const result = await toBaseMessages(uiMessages);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[1]).toBeInstanceOf(AIMessage);
  });

  it('should handle system messages', async () => {
    const uiMessages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'system',
        parts: [{ type: 'text', text: 'Be helpful.' }],
      },
    ];

    const result = await toBaseMessages(uiMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[0].content).toBe('Be helpful.');
  });

  it('should handle user messages with files', async () => {
    const uiMessages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', text: 'What is in this image?' },
          {
            type: 'file',
            url: 'data:image/png;base64,abc123',
            mediaType: 'image/png',
          },
        ],
      },
    ];

    const result = await toBaseMessages(uiMessages);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    // Image files are converted to OpenAI's image_url format
    expect(result[0].content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abc123' },
      },
    ]);
  });
});

describe('toUIMessageStream', () => {
  it('should NOT emit tool events for historical tool calls that have ToolMessage responses', async () => {
    // Simulate a values event containing message history with a completed tool call
    // This is what happens in multi-turn conversations with tool usage
    const historicalToolCallId = 'call_HISTORICAL_123';

    const valuesData = {
      messages: [
        // Historical: user message
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: { id: 'human-1', content: 'do maths with 123' },
        },
        // Historical: AI message with tool call (ALREADY COMPLETED in previous turn)
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: {
            id: 'ai-1',
            content: '',
            tool_calls: [
              { id: historicalToolCallId, name: 'maths', args: { input: 123 } },
            ],
          },
        },
        // Historical: tool result - this indicates the tool call is complete
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            id: 'tool-1',
            tool_call_id: historicalToolCallId,
            content: '{"result": "15.5"}',
          },
        },
        // Historical: AI response
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: { id: 'ai-2', content: 'The result is 15.5' },
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // The historical tool call should NOT be emitted since it has a ToolMessage response
    const toolInputStartEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-start',
    );
    const toolInputAvailableEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-available',
    );

    expect(toolInputStartEvents).toHaveLength(0);
    expect(toolInputAvailableEvents).toHaveLength(0);
  });

  it('should emit tool events for new tool calls that do NOT have ToolMessage responses', async () => {
    // Simulate a values event with a new tool call that hasn't been responded to yet
    const newToolCallId = 'call_NEW_456';

    const valuesData = {
      messages: [
        // User message
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: { id: 'human-1', content: 'do maths with 456' },
        },
        // NEW: AI message with tool call (NOT YET COMPLETED)
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: {
            id: 'ai-1',
            content: '',
            tool_calls: [
              { id: newToolCallId, name: 'maths', args: { input: 456 } },
            ],
          },
        },
        // No ToolMessage for this tool call - it's new and pending
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // The new tool call SHOULD be emitted since it has no ToolMessage response
    const toolInputStartEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-start',
    );
    const toolInputAvailableEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-available',
    );

    expect(toolInputStartEvents).toHaveLength(1);
    expect(toolInputStartEvents[0]).toMatchObject({
      type: 'tool-input-start',
      toolCallId: newToolCallId,
      toolName: 'maths',
    });

    expect(toolInputAvailableEvents).toHaveLength(1);
    expect(toolInputAvailableEvents[0]).toMatchObject({
      type: 'tool-input-available',
      toolCallId: newToolCallId,
      toolName: 'maths',
      input: { input: 456 },
    });
  });

  it('should correctly handle mixed historical and new tool calls in same values event', async () => {
    // This is the critical multi-turn scenario that caused the bug
    const historicalToolCallId = 'call_HISTORICAL_789';
    const currentToolCallId = 'call_CURRENT_999';

    const valuesData = {
      messages: [
        // === TURN 1 (historical, completed) ===
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: { id: 'human-1', content: 'do maths with 123' },
        },
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: {
            id: 'ai-1',
            content: '',
            tool_calls: [
              {
                id: historicalToolCallId,
                name: 'maths',
                args: { input: 123 },
              },
            ],
          },
        },
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'ToolMessage'],
          kwargs: {
            id: 'tool-1',
            tool_call_id: historicalToolCallId,
            content: '{"result": "15.5"}',
          },
        },
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: { id: 'ai-2', content: 'The result is 15.5' },
        },
        // === TURN 2 (current, new tool call) ===
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'HumanMessage'],
          kwargs: { id: 'human-2', content: 'do it again with 999' },
        },
        {
          type: 'constructor',
          id: ['langchain_core', 'messages', 'AIMessage'],
          kwargs: {
            id: 'ai-3',
            content: '',
            tool_calls: [
              { id: currentToolCallId, name: 'maths', args: { input: 999 } },
            ],
          },
        },
        // No ToolMessage for currentToolCallId - it's the current pending tool call
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Only the CURRENT tool call should be emitted
    const toolInputStartEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-start',
    );
    const toolInputAvailableEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-available',
    );

    // Should have exactly 1 tool call (the current one), not 2
    expect(toolInputStartEvents).toHaveLength(1);
    expect(toolInputStartEvents[0]).toMatchObject({
      toolCallId: currentToolCallId,
      toolName: 'maths',
    });

    expect(toolInputAvailableEvents).toHaveLength(1);
    expect(toolInputAvailableEvents[0]).toMatchObject({
      toolCallId: currentToolCallId,
      input: { input: 999 },
    });

    // Verify historical tool call was NOT emitted
    const historicalEvents = result.filter(
      e => 'toolCallId' in e && e.toolCallId === historicalToolCallId,
    );
    expect(historicalEvents).toHaveLength(0);
  });

  it('should handle plain object format (RemoteGraph API) for historical tool calls', async () => {
    // Test with plain object format instead of serialized LangChain format
    const historicalToolCallId = 'call_PLAIN_HISTORICAL';
    const currentToolCallId = 'call_PLAIN_CURRENT';

    const valuesData = {
      messages: [
        // Historical tool call with response (plain object format)
        {
          id: 'ai-1',
          type: 'ai',
          content: '',
          tool_calls: [
            { id: historicalToolCallId, name: 'search', args: { q: 'test' } },
          ],
        },
        {
          id: 'tool-1',
          type: 'tool',
          tool_call_id: historicalToolCallId,
          content: 'Search results...',
        },
        // Current tool call without response
        {
          id: 'ai-2',
          type: 'ai',
          content: '',
          tool_calls: [
            { id: currentToolCallId, name: 'search', args: { q: 'new' } },
          ],
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    const toolInputStartEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-start',
    );

    // Only current tool call should be emitted
    expect(toolInputStartEvents).toHaveLength(1);
    expect(toolInputStartEvents[0]).toMatchObject({
      toolCallId: currentToolCallId,
    });
  });

  it('should handle multiple historical tool calls in same message', async () => {
    // Test when a single AI message has multiple tool calls, all completed
    const toolCall1 = 'call_MULTI_1';
    const toolCall2 = 'call_MULTI_2';
    const currentToolCall = 'call_MULTI_CURRENT';

    const valuesData = {
      messages: [
        // AI message with 2 tool calls
        {
          id: 'ai-1',
          type: 'ai',
          content: '',
          tool_calls: [
            { id: toolCall1, name: 'tool_a', args: { a: 1 } },
            { id: toolCall2, name: 'tool_b', args: { b: 2 } },
          ],
        },
        // Both tool responses
        {
          id: 'tool-1',
          type: 'tool',
          tool_call_id: toolCall1,
          content: 'Result A',
        },
        {
          id: 'tool-2',
          type: 'tool',
          tool_call_id: toolCall2,
          content: 'Result B',
        },
        // New tool call
        {
          id: 'ai-2',
          type: 'ai',
          content: '',
          tool_calls: [{ id: currentToolCall, name: 'tool_c', args: { c: 3 } }],
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    const toolInputStartEvents = result.filter(
      (e: { type: string }) => e.type === 'tool-input-start',
    );

    // Only the current tool call should be emitted
    expect(toolInputStartEvents).toHaveLength(1);
    expect(toolInputStartEvents[0]).toMatchObject({
      toolCallId: currentToolCall,
    });
  });
});

describe('toUIMessageStream with streamEvents', () => {
  it('should detect and handle streamEvents format', async () => {
    // Simulate streamEvents output from agent.streamEvents()
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_start',
        data: { input: 'Hello' },
      },
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            id: 'stream-msg-1',
            content: 'Hello',
          },
        },
      },
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            id: 'stream-msg-1',
            content: ' World',
          },
        },
      },
      {
        event: 'on_chat_model_end',
        data: {
          output: {
            id: 'stream-msg-1',
            content: 'Hello World',
          },
        },
      },
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
          "id": "stream-msg-1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "stream-msg-1",
          "type": "text-delta",
        },
        {
          "delta": " World",
          "id": "stream-msg-1",
          "type": "text-delta",
        },
        {
          "id": "stream-msg-1",
          "type": "text-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle streamEvents with tool calls', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_start',
        data: { input: 'What is the weather?' },
      },
      {
        event: 'on_tool_start',
        data: {
          run_id: 'tool-call-123',
          name: 'get_weather',
          inputs: { city: 'SF' },
        },
      },
      {
        event: 'on_tool_end',
        data: {
          run_id: 'tool-call-123',
          output: 'Sunny, 72°F',
        },
      },
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
          "dynamic": true,
          "toolCallId": "tool-call-123",
          "toolName": "get_weather",
          "type": "tool-input-start",
        },
        {
          "output": "Sunny, 72°F",
          "toolCallId": "tool-call-123",
          "type": "tool-output-available",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle streamEvents with reasoning content', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            id: 'reasoning-msg-1',
            content: '',
            contentBlocks: [
              { type: 'reasoning', reasoning: 'Let me think...' },
            ],
          },
        },
      },
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            id: 'reasoning-msg-1',
            content: 'Here is my answer.',
          },
        },
      },
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
          "id": "reasoning-msg-1",
          "type": "reasoning-start",
        },
        {
          "delta": "Let me think...",
          "id": "reasoning-msg-1",
          "type": "reasoning-delta",
        },
        {
          "id": "reasoning-msg-1",
          "type": "reasoning-end",
        },
        {
          "id": "reasoning-msg-1",
          "type": "text-start",
        },
        {
          "delta": "Here is my answer.",
          "id": "reasoning-msg-1",
          "type": "text-delta",
        },
        {
          "id": "reasoning-msg-1",
          "type": "text-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });

  it('should handle streamEvents with array content', async () => {
    // Test content as array of text blocks (common in some providers)
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: {
          chunk: {
            id: 'array-msg-1',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ' from array' },
            ],
          },
        },
      },
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
          "id": "array-msg-1",
          "type": "text-start",
        },
        {
          "delta": "Hello from array",
          "id": "array-msg-1",
          "type": "text-delta",
        },
        {
          "id": "array-msg-1",
          "type": "text-end",
        },
        {
          "type": "finish",
        },
      ]
    `);
  });
});

describe('toUIMessageStream LangGraph finish events', () => {
  it('should emit finish event for LangGraph streams', async () => {
    const valuesData = {
      messages: [
        {
          id: 'ai-1',
          type: 'ai',
          content: 'Hello!',
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should have finish event at the end
    const finishEvents = result.filter(
      (e: { type: string }) => e.type === 'finish',
    );
    expect(finishEvents).toHaveLength(1);
    expect(result[result.length - 1]).toEqual({ type: 'finish' });
  });

  it('should emit finish-step and finish events for LangGraph streams with steps', async () => {
    const chunk = new AIMessageChunk({ content: 'Hello', id: 'msg-1' });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk, { langgraph_step: 0 }]],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should have both start-step and finish-step
    const startStepEvents = result.filter(
      (e: { type: string }) => e.type === 'start-step',
    );
    const finishStepEvents = result.filter(
      (e: { type: string }) => e.type === 'finish-step',
    );
    const finishEvents = result.filter(
      (e: { type: string }) => e.type === 'finish',
    );

    expect(startStepEvents).toHaveLength(1);
    expect(finishStepEvents).toHaveLength(1);
    expect(finishEvents).toHaveLength(1);

    // finish-step should come before finish
    const finishStepIndex = result.findIndex(
      (e: { type: string }) => e.type === 'finish-step',
    );
    const finishIndex = result.findIndex(
      (e: { type: string }) => e.type === 'finish',
    );
    expect(finishStepIndex).toBeLessThan(finishIndex);
  });

  it('should emit multiple finish-step events when steps change', async () => {
    const chunk1 = new AIMessageChunk({ content: 'Step 0', id: 'msg-1' });
    const chunk2 = new AIMessageChunk({ content: 'Step 1', id: 'msg-2' });

    const inputStream = convertArrayToReadableStream([
      ['messages', [chunk1, { langgraph_step: 0 }]],
      ['messages', [chunk2, { langgraph_step: 1 }]],
      ['values', {}],
    ]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should have 2 start-step events (one for each step)
    // Should have 2 finish-step events (one when changing to step 1, one at stream end)
    const startStepEvents = result.filter(
      (e: { type: string }) => e.type === 'start-step',
    );
    const finishStepEvents = result.filter(
      (e: { type: string }) => e.type === 'finish-step',
    );

    expect(startStepEvents).toHaveLength(2);
    expect(finishStepEvents).toHaveLength(2);
  });

  it('should not emit finish-step if no step was started', async () => {
    const valuesData = {
      messages: [
        {
          id: 'ai-1',
          type: 'ai',
          content: 'Hello!',
        },
      ],
    };

    const inputStream = convertArrayToReadableStream([['values', valuesData]]);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Should NOT have finish-step (no step was started)
    const finishStepEvents = result.filter(
      (e: { type: string }) => e.type === 'finish-step',
    );
    expect(finishStepEvents).toHaveLength(0);

    // But should still have finish
    const finishEvents = result.filter(
      (e: { type: string }) => e.type === 'finish',
    );
    expect(finishEvents).toHaveLength(1);
  });
});

describe('toUIMessageStream with LangGraph HITL fixture', () => {
  beforeEach(() => {
    // Mock Date.now() to make generated HITL IDs deterministic for snapshots
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly transform first request (before approval)', async () => {
    const inputStream = convertArrayToReadableStream(LANGGRAPH_RESPONSE_1);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Use file snapshot to avoid stack overflow with large results
    await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      './__snapshots__/langgraph-hitl-request-1.json',
    );
  });

  it('should correctly transform second request (after approval)', async () => {
    const inputStream = convertArrayToReadableStream(LANGGRAPH_RESPONSE_2);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Use file snapshot to avoid stack overflow with large results
    await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      './__snapshots__/langgraph-hitl-request-2.json',
    );
  });

  it('should correctly transform reasoning and tool calls', async () => {
    const inputStream = convertArrayToReadableStream(REACT_AGENT_TOOL_CALLING);

    const result = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    // Use file snapshot to avoid stack overflow with large results
    await expect(JSON.stringify(result, null, 2)).toMatchFileSnapshot(
      './__snapshots__/react-agent-tool-calling.json',
    );
  });
});
