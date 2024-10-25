import { z } from 'zod';
import { toResponseMessages } from './to-response-messages';

it('should return an assistant message with text when no tool calls or results', () => {
  const result = toResponseMessages({
    text: 'Hello, world!',
    tools: {
      testTool: {
        description: 'A test tool',
        parameters: z.object({}),
      },
    },
    toolCalls: [],
    toolResults: [],
  });

  expect(result).toEqual([
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello, world!' }],
    },
  ]);
});

it('should include tool calls in the assistant message', () => {
  const result = toResponseMessages({
    text: 'Using a tool',
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
  });

  expect(result).toEqual([
    {
      role: 'assistant',
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
  });

  expect(result).toEqual([
    {
      role: 'assistant',
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
    tools: {
      testTool: {
        description: 'A test tool',
        parameters: z.object({}),
      },
    },
    toolCalls: [],
    toolResults: [],
  });

  expect(result).toEqual([
    {
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
    },
  ]);
});

it('should handle multipart tool results', () => {
  const result = toResponseMessages({
    text: 'multipart tool result',
    tools: {
      testTool: {
        description: 'A test tool',
        parameters: z.object({}),
        supportsMultipartResults: true,
        execute: async () => [
          { type: 'text', text: 'Text result' },
          { type: 'image', data: 'image-base64', mimeType: 'image/png' },
        ],
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
        result: [
          { type: 'text', text: 'Text result' },
          { type: 'image', data: 'image-base64', mimeType: 'image/png' },
        ],
        args: {},
      },
    ],
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
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: '123',
          toolName: 'testTool',
          result: [
            { type: 'text', text: 'Text result' },
            { type: 'image', data: 'image-base64', mimeType: 'image/png' },
          ],
          content: [
            { type: 'text', text: 'Text result' },
            { type: 'image', data: 'image-base64', mimeType: 'image/png' },
          ],
        },
      ],
    },
  ]);
});
