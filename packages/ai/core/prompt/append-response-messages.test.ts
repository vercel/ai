import { describe, expect, it } from 'vitest';
import { appendResponseMessages } from './append-response-messages';

describe('appendResponseMessages', () => {
  it('appends assistant messages with text content', () => {
    const result = appendResponseMessages({
      messages: [
        {
          role: 'user',
          id: '1',
          content: 'Hello!',
          createdAt: new Date(123),
        },
      ],
      responseMessages: [
        {
          role: 'assistant',
          content: 'This is a response from the assistant.',
        },
      ],
    });

    expect(result).toStrictEqual([
      {
        role: 'user',
        id: '1',
        content: 'Hello!',
        createdAt: new Date(123),
      },
      {
        role: 'assistant',
        content: 'This is a response from the assistant.',
        id: expect.any(String),
        createdAt: expect.any(Date),
        toolInvocations: [],
      },
    ]);
  });

  it('throws an error if AI response contains a system or user role', () => {
    expect(() =>
      appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            content: 'Hello!',
            createdAt: new Date(123),
          },
        ],
        responseMessages: [
          {
            role: 'system',
            content: 'System message goes here.',
          },
        ],
      }),
    ).toThrowError(
      'AI response must not contain system or user messages: system',
    );
  });

  it('handles tool calls and marks them as "call" initially', () => {
    const result = appendResponseMessages({
      messages: [
        {
          role: 'user',
          id: '1',
          content: 'User wants a tool invocation',
          createdAt: new Date(123),
        },
      ],
      responseMessages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Processing tool call...' },
            {
              type: 'tool-call',
              toolName: 'some-tool',
              toolCallId: 'call-1',
              args: { query: 'some query' },
            },
          ],
        },
      ],
    });

    expect(result).toStrictEqual([
      {
        role: 'user',
        id: '1',
        content: 'User wants a tool invocation',
        createdAt: new Date(123),
      },
      {
        role: 'assistant',
        content: 'Processing tool call...',
        id: expect.any(String),
        createdAt: expect.any(Date),
        toolInvocations: [
          {
            type: 'tool-call',
            state: 'call',
            toolCallId: 'call-1',
            toolName: 'some-tool',
            args: { query: 'some query' },
          },
        ],
      },
    ]);
  });

  it('adds tool results to the previously invoked tool calls (assistant message)', () => {
    const result = appendResponseMessages({
      messages: [
        {
          role: 'user',
          id: '1',
          content: 'User wants a tool invocation',
          createdAt: new Date(123),
        },
        {
          role: 'assistant',
          id: '2',
          content: 'Placeholder text',
          createdAt: new Date(456),
          toolInvocations: [
            {
              toolCallId: 'call-1',
              toolName: 'some-tool',
              state: 'call',
              args: { query: 'some query' },
            },
          ],
        },
      ],
      responseMessages: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'some-tool',
              result: { answer: 'Tool result data' },
            },
          ],
        },
      ],
    });

    expect(result).toStrictEqual([
      {
        role: 'user',
        id: '1',
        content: 'User wants a tool invocation',
        createdAt: new Date(123),
      },
      {
        role: 'assistant',
        content: 'Placeholder text',
        id: '2',
        createdAt: new Date(456),
        toolInvocations: [
          {
            state: 'result',
            toolCallId: 'call-1',
            toolName: 'some-tool',
            args: { query: 'some query' },
            result: { answer: 'Tool result data' },
          },
        ],
      },
    ]);
  });

  it('throws an error if a tool result follows a non-assistant message', () => {
    expect(() =>
      appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            content: 'User message',
            createdAt: new Date(),
          },
        ],
        responseMessages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'some-tool',
                result: { answer: 'Should fail' },
              },
            ],
          },
        ],
      }),
    ).toThrowError('Tool result must follow an assistant message: user');
  });
});
