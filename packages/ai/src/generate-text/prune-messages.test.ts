import { describe, expect, it } from 'vitest';
import { pruneMessages } from './prune-messages';
import { ModelMessage } from '@ai-sdk/provider-utils';

const messagesFixture1: ModelMessage[] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Weather in Tokyo and Busan?' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'I need to get the weather in Tokyo and Busan.',
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get-weather-tool-1',
        input: '{"city": "Tokyo"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'get-weather-tool-2',
        input: '{"city": "Busan"}',
      },
      {
        type: 'tool-approval-request',
        toolCallId: 'call-2',
        approvalId: 'approval-1',
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'get-weather-tool-1',
        output: {
          type: 'text',
          value: 'sunny',
        },
      },
      {
        type: 'tool-result',
        toolCallId: 'call-2',
        toolName: 'get-weather-tool-2',
        output: {
          type: 'error-text',
          value: 'Error: Fetching weather data failed',
        },
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'I have got the weather in Tokyo and Busan.',
      },
      {
        type: 'text',
        text: 'The weather in Tokyo is sunny. I could not get the weather in Busan.',
      },
    ],
  },
];

const messagesFixture2: ModelMessage[] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Weather in Tokyo and Busan?' }],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'reasoning',
        text: 'I need to get the weather in Tokyo and Busan.',
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get-weather-tool-1',
        input: '{"city": "Tokyo"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'get-weather-tool-2',
        input: '{"city": "Busan"}',
      },
      {
        type: 'tool-approval-request',
        toolCallId: 'call-1',
        approvalId: 'approval-1',
      },
    ],
  },
];

describe('pruneMessages', () => {
  describe('reasoning', () => {
    describe('all', () => {
      it('should prune all reasoning parts', () => {
        const result = pruneMessages({
          messages: messagesFixture1,
          reasoning: 'all',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "input": "{"city": "Tokyo"}",
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-call",
                },
                {
                  "input": "{"city": "Busan"}",
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-call",
                },
                {
                  "approvalId": "approval-1",
                  "toolCallId": "call-2",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "approvalId": "approval-1",
                  "approved": true,
                  "type": "tool-approval-response",
                },
                {
                  "output": {
                    "type": "text",
                    "value": "sunny",
                  },
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-result",
                },
                {
                  "output": {
                    "type": "error-text",
                    "value": "Error: Fetching weather data failed",
                  },
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
            {
              "content": [
                {
                  "text": "The weather in Tokyo is sunny. I could not get the weather in Busan.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('before-trailing-message', () => {
      it('should prune the trailing message', () => {
        const result = pruneMessages({
          messages: messagesFixture1,
          reasoning: 'before-last-message',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "input": "{"city": "Tokyo"}",
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-call",
                },
                {
                  "input": "{"city": "Busan"}",
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-call",
                },
                {
                  "approvalId": "approval-1",
                  "toolCallId": "call-2",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "approvalId": "approval-1",
                  "approved": true,
                  "type": "tool-approval-response",
                },
                {
                  "output": {
                    "type": "text",
                    "value": "sunny",
                  },
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-result",
                },
                {
                  "output": {
                    "type": "error-text",
                    "value": "Error: Fetching weather data failed",
                  },
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
            {
              "content": [
                {
                  "text": "I have got the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in Tokyo is sunny. I could not get the weather in Busan.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });
  });

  describe('toolCalls', () => {
    describe('all', () => {
      it('should prune all tool calls, results, errors, and approvals', () => {
        const result = pruneMessages({
          messages: messagesFixture1,
          toolCalls: 'all',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I need to get the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "I have got the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in Tokyo is sunny. I could not get the weather in Busan.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('before-last-message', () => {
      it('should prune tool calls before last message', () => {
        const result = pruneMessages({
          messages: messagesFixture2,
          toolCalls: 'before-last-message',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I need to get the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "input": "{"city": "Tokyo"}",
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-call",
                },
                {
                  "input": "{"city": "Busan"}",
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-call",
                },
                {
                  "approvalId": "approval-1",
                  "toolCallId": "call-1",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('before-last-2-messages', () => {
      it('should prune all tool calls, results, errors, and approvals', () => {
        const result = pruneMessages({
          messages: messagesFixture1,
          toolCalls: 'before-last-2-messages',
        });

        // there is backwards tracing from the included tool results to ensure
        // that the tool calls are included and there are no unassociated tool
        // result or approvals
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I need to get the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "input": "{"city": "Tokyo"}",
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-call",
                },
                {
                  "input": "{"city": "Busan"}",
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-call",
                },
                {
                  "approvalId": "approval-1",
                  "toolCallId": "call-2",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "approvalId": "approval-1",
                  "approved": true,
                  "type": "tool-approval-response",
                },
                {
                  "output": {
                    "type": "text",
                    "value": "sunny",
                  },
                  "toolCallId": "call-1",
                  "toolName": "get-weather-tool-1",
                  "type": "tool-result",
                },
                {
                  "output": {
                    "type": "error-text",
                    "value": "Error: Fetching weather data failed",
                  },
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
            {
              "content": [
                {
                  "text": "I have got the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in Tokyo is sunny. I could not get the weather in Busan.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('two tool settings', () => {
      it('should prune all tool calls, results, errors, and approvals', () => {
        const result = pruneMessages({
          messages: messagesFixture1,
          toolCalls: [
            { type: 'all', tools: ['get-weather-tool-1'] },
            { type: 'before-last-2-messages', tools: ['get-weather-tool-2'] },
          ],
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo and Busan?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I need to get the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "input": "{"city": "Busan"}",
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-call",
                },
                {
                  "approvalId": "approval-1",
                  "toolCallId": "call-2",
                  "type": "tool-approval-request",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "approvalId": "approval-1",
                  "approved": true,
                  "type": "tool-approval-response",
                },
                {
                  "output": {
                    "type": "error-text",
                    "value": "Error: Fetching weather data failed",
                  },
                  "toolCallId": "call-2",
                  "toolName": "get-weather-tool-2",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
            {
              "content": [
                {
                  "text": "I have got the weather in Tokyo and Busan.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in Tokyo is sunny. I could not get the weather in Busan.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });
  });
});
