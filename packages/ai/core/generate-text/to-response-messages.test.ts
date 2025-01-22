import { z } from 'zod';
import { mockValues } from '../test/mock-values';
import { tool } from '../tool';
import { toResponseMessages } from './to-response-messages';

describe('toResponseMessages', () => {
  it('should return an assistant message with text when no tool calls or results', () => {
    const result = toResponseMessages({
      text: 'Hello, world!',
      reasoning: undefined,
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

  it('should return an assistant message with reasoning and text', () => {
    const result = toResponseMessages({
      text: 'Hello, world!',
      reasoning: 'Feeling clever',
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
          { type: 'reasoning', text: 'Feeling clever' },
          { type: 'text', text: 'Hello, world!' },
        ],
      },
    ]);
  });

  it('should include tool calls in the assistant message', () => {
    const result = toResponseMessages({
      text: 'Using a tool',
      reasoning: 'Feeling clever',
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
            type: 'reasoning',
            text: 'Feeling clever',
          },
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
      reasoning: 'Feeling clever',
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
            type: 'reasoning',
            text: 'Feeling clever',
          },
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
      reasoning: undefined,
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
        content: [{ type: 'text', text: '' }],
        id: 'msg-123',
      },
    ]);
  });

  it('should handle multipart tool results', () => {
    const result = toResponseMessages({
      text: 'multipart tool result',
      reasoning: undefined,
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
});
