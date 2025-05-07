import { describe, expect, it } from 'vitest';
import { appendResponseMessages } from './append-response-messages';

describe('appendResponseMessages', () => {
  describe('after user message', () => {
    it('appends assistant messages with text content', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'Hello!' }],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: 'This is a response from the assistant.',
            id: '123',
          },
        ],
        _internal: { currentDate: () => new Date(789) },
      });

      expect(result).toMatchSnapshot();
    });

    it('appends assistant messages with mixed complex reasoning and text', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'Hello!' }],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'reasoning part',
                providerOptions: { testProvider: { signature: 'sig-1' } },
              },
              {
                type: 'reasoning',
                text: 'redacted part',
                providerOptions: { testProvider: { isRedacted: true } },
              },
              { type: 'text', text: 'text response' },
              {
                type: 'reasoning',
                text: 'reasoning part 2',
                providerOptions: { testProvider: { signature: 'sig-2' } },
              },
              { type: 'text', text: 'text response 2' },
            ],
            id: '123',
          },
        ],
        _internal: { currentDate: () => new Date(789) },
      });

      expect(result).toMatchSnapshot();
    });

    it('appends assistant messages with generated files', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'Generate an image of a cat' }],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
              },
            ],
            id: '123',
          },
        ],
        _internal: { currentDate: () => new Date(789) },
      });

      expect(result).toMatchSnapshot();
    });

    it('handles tool calls and marks them as "call" initially', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
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
            id: '123',
          },
        ],
        _internal: { currentDate: () => new Date(789) },
      });

      expect(result).toMatchSnapshot();
    });

    it('adds chain of assistant messages and tool results', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'some-tool',
                toolCallId: 'call-1',
                args: { query: 'some query' },
              },
            ],
            id: '2',
          },
          {
            role: 'tool',
            id: '3',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'some-tool',
                result: { answer: 'Tool result data' },
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'some-tool',
                toolCallId: 'call-2',
                args: { query: 'another query' },
              },
            ],
            id: '4',
          },
          {
            role: 'tool',
            id: '5',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-2',
                toolName: 'some-tool',
                result: { answer: 'another result' },
              },
            ],
          },
          {
            role: 'assistant',
            content: 'response',
            id: '6',
          },
        ],
        _internal: { currentDate: () => new Date(789) },
      });

      expect(result).toMatchSnapshot();
    });

    it('throws an error if a tool result follows a user message', () => {
      expect(() =>
        appendResponseMessages({
          messages: [
            {
              role: 'user',
              id: '1',
              createdAt: new Date(),
              parts: [{ type: 'text', text: 'User message' }],
            },
          ],
          responseMessages: [
            {
              role: 'tool',
              id: '3',
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

  describe('after assistant message', () => {
    it('adds assistant text response', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
          },
          {
            role: 'assistant',
            id: '2',
            createdAt: new Date(456),
            parts: [
              {
                type: 'tool-invocation',
                toolInvocation: {
                  toolCallId: 'call-1',
                  toolName: 'some-tool',
                  state: 'result',
                  args: { query: 'some query' },
                  result: { answer: 'Tool result data' },
                  step: 0,
                },
              },
            ],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: 'This is a response from the assistant.',
            id: '123',
          },
        ],
        _internal: {
          currentDate: () => new Date(789),
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('adds assistant tool call response', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
          },
          {
            role: 'assistant',
            id: '2',
            createdAt: new Date(456),
            parts: [
              {
                type: 'tool-invocation',
                toolInvocation: {
                  toolCallId: 'call-1',
                  toolName: 'some-tool',
                  state: 'result',
                  args: { query: 'some query' },
                  result: { answer: 'Tool result data' },
                  step: 0,
                },
              },
            ],
          },
        ],
        responseMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolName: 'some-tool',
                toolCallId: 'call-2',
                args: { query: 'another query' },
              },
            ],
            id: '123',
          },
        ],
        _internal: {
          currentDate: () => new Date(789),
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('adds tool results to the previously invoked tool calls', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
          },
          {
            role: 'assistant',
            id: '2',
            createdAt: new Date(456),
            parts: [
              {
                type: 'tool-invocation',
                toolInvocation: {
                  toolCallId: 'call-1',
                  toolName: 'some-tool',
                  state: 'call',
                  args: { query: 'some query' },
                  step: 0,
                },
              },
            ],
          },
        ],
        responseMessages: [
          {
            role: 'tool',
            id: '3',
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
        _internal: {
          currentDate: () => new Date(789),
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('appends assistant messages with mixed complex reasoning and text', () => {
      const result = appendResponseMessages({
        messages: [
          {
            role: 'user',
            id: '1',
            createdAt: new Date(123),
            parts: [{ type: 'text', text: 'User wants a tool invocation' }],
          },
          {
            role: 'assistant',
            id: '2',
            createdAt: new Date(456),
            parts: [
              {
                type: 'text',
                text: 'Placeholder text',
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  toolCallId: 'call-1',
                  toolName: 'some-tool',
                  state: 'call',
                  args: { query: 'some query' },
                  step: 0,
                },
              },
            ],
          },
        ],
        responseMessages: [
          {
            role: 'tool',
            id: '3',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'some-tool',
                result: { answer: 'Tool result data' },
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'reasoning part',
                providerOptions: {
                  testProvider: {
                    signature: 'sig-1',
                  },
                },
              },
              { type: 'text', text: 'text response' },
              {
                type: 'reasoning',
                text: 'reasoning part 2',
                providerOptions: {
                  testProvider: {
                    signature: 'sig-2',
                  },
                },
              },
              { type: 'text', text: 'text response 2' },
            ],
            id: '123',
          },
        ],
        _internal: {
          currentDate: () => new Date(789),
        },
      });

      expect(result).toMatchSnapshot();
    });
  });
});
