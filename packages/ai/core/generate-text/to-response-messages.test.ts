import { z } from 'zod';
import { mockValues } from '../test/mock-values';
import { tool } from '../tool';
import { toResponseMessages } from './to-response-messages';

describe('toResponseMessages', () => {
  it('should return an assistant message with text when no tool calls or results', () => {
    const result = toResponseMessages({
      text: 'Hello, world!',
      images: [],
      reasoning: [],
      tools: {
        testTool: {
          description: 'A test tool',
          parameters: z.object({}),
        },
      },
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    ]);
  });

  it('should include tool calls in the assistant message', () => {
    const result = toResponseMessages({
      text: 'Using a tool',
      images: [],
      reasoning: [],
      tools: {
        testTool: {
          description: 'A test tool',
          parameters: z.object({}),
        },
      },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          args: {},
        },
      ],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'text', text: 'Using a tool' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            args: {},
          },
        ],
      },
    ]);
  });

  it('should include tool results as a separate message', () => {
    const result = toResponseMessages({
      text: 'Tool used',
      images: [],
      reasoning: [],
      tools: {
        testTool: {
          description: 'A test tool',
          parameters: z.object({}),
          execute: async () => 'Tool result',
        },
      },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          args: {},
        },
      ],
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: '123',
          toolName: 'testTool',
          result: 'Tool result',
          args: {},
        },
      ],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'text', text: 'Tool used' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            args: {},
          },
        ],
      },
      {
        role: 'tool',
        id: 'msg-345',
        content: [
          {
            type: 'tool-result',
            toolCallId: '123',
            toolName: 'testTool',
            result: 'Tool result',
          },
        ],
      },
    ]);
  });

  it('should handle undefined text', () => {
    const result = toResponseMessages({
      text: undefined,
      images: [],
      reasoning: [],
      tools: {},
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: '' }],
        id: 'msg-123',
      },
    ]);
  });

  it('should include reasoning array with redacted reasoning in the assistant message', () => {
    const result = toResponseMessages({
      text: 'Final text',
      images: [],
      reasoning: [
        { type: 'redacted', data: 'redacted-data' },
        { type: 'text', text: 'Thinking text', signature: 'sig' },
      ],
      tools: {},
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'redacted-reasoning', data: 'redacted-data' },
          { type: 'reasoning', text: 'Thinking text', signature: 'sig' },
          { type: 'text', text: 'Final text' },
        ],
      },
    ]);
  });

  it('should handle multipart tool results', () => {
    const result = toResponseMessages({
      text: 'multipart tool result',
      images: [],
      reasoning: [],
      tools: {
        testTool: tool({
          description: 'A test tool',
          parameters: z.object({}),
          execute: async () => 'image-base64',
          experimental_toToolResultContent(result) {
            return [{ type: 'image', data: result, mimeType: 'image/png' }];
          },
        }),
      },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          args: {},
        },
      ],
      toolResults: [
        {
          type: 'tool-result',
          toolCallId: '123',
          toolName: 'testTool',
          args: {},
          result: 'image-base64',
        },
      ],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'multipart tool result' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            args: {},
          },
        ],
        id: 'msg-123',
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '123',
            toolName: 'testTool',
            result: [
              { type: 'image', data: 'image-base64', mimeType: 'image/png' },
            ],
            experimental_content: [
              { type: 'image', data: 'image-base64', mimeType: 'image/png' },
            ],
          },
        ],
        id: 'msg-345',
      },
    ]);
  });

  it('should include images in the assistant message', () => {
    const result = toResponseMessages({
      text: 'Here is an image',
      images: ['image-data-1'],
      reasoning: [],
      tools: {},
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'image', image: 'image-data-1' },
          { type: 'text', text: 'Here is an image' },
        ],
      },
    ]);
  });

  it('should handle multiple images in the assistant message', () => {
    const result = toResponseMessages({
      text: 'Here are multiple images',
      images: ['image-data-1', 'image-data-2'],
      reasoning: [],
      tools: {},
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'image', image: 'image-data-1' },
          { type: 'image', image: 'image-data-2' },
          { type: 'text', text: 'Here are multiple images' },
        ],
      },
    ]);
  });

  it('should handle Uint8Array images', () => {
    const imageData = new Uint8Array([1, 2, 3, 4]);
    const result = toResponseMessages({
      text: 'Here is a binary image',
      images: [imageData],
      reasoning: [],
      tools: {},
      toolCalls: [],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'image', image: imageData },
          { type: 'text', text: 'Here is a binary image' },
        ],
      },
    ]);
  });

  it('should include images, reasoning, and tool calls in the correct order', () => {
    const result = toResponseMessages({
      text: 'Combined response',
      images: ['image-data-1'],
      reasoning: [{ type: 'text', text: 'Thinking text', signature: 'sig' }],
      tools: {
        testTool: {
          description: 'A test tool',
          parameters: z.object({}),
        },
      },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          args: {},
        },
      ],
      toolResults: [],
      messageId: 'msg-123',
      generateMessageId: mockValues('msg-345'),
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        id: 'msg-123',
        content: [
          { type: 'reasoning', text: 'Thinking text', signature: 'sig' },
          { type: 'image', image: 'image-data-1' },
          { type: 'text', text: 'Combined response' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            args: {},
          },
        ],
      },
    ]);
  });
});
