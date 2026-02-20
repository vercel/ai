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

const multiTurnToolCallMessagesFixture: ModelMessage[] = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'ask me a question',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'What can i help you with',
      },
      {
        type: 'tool-call',
        toolCallId: 'toolu_01P9s4havAQSjDmS4eWT1N2V',
        toolName: 'AskUserQuestion',
        input: {
          question: 'What would you like help with today?',
          options: ['Tool 1 Option 1', 'Tool 1 Option 2', 'Tool 1 Option 3'],
        },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'toolu_01P9s4havAQSjDmS4eWT1N2V',
        toolName: 'AskUserQuestion',
        output: { type: 'text', value: 'Something else' },
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'toolu_01TMAuwWKLmBoQtx7K88dxsQ',
        toolName: 'AskUserQuestion',
        input: {
          question: 'Ok what else?',
          options: ['Tool 2 Option 1', 'Tool 2 Option 2', 'Tool 2 Option 3'],
        },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'toolu_01TMAuwWKLmBoQtx7K88dxsQ',
        toolName: 'AskUserQuestion',
        output: {
          type: 'text',
          value: "Other - I'll describe it",
        },
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'What would you like to discuss or work on?',
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'never mind. lets end this conversation',
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'ok, have a nice day',
      },
    ],
  },
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'thank you',
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

      it('should prune tool calls and results from multi-turn conversation when last message has no tool calls', () => {
        const result = pruneMessages({
          messages: multiTurnToolCallMessagesFixture,
          toolCalls: 'before-last-message',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "ask me a question",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "What can i help you with",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "What would you like to discuss or work on?",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "never mind. lets end this conversation",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "ok, have a nice day",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "thank you",
                  "type": "text",
                },
              ],
              "role": "user",
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

    describe('caller.toolId dependencies', () => {
      it('should keep server_tool_use referenced by a kept tool-call via providerOptions caller.toolId', () => {
        const messages: ModelMessage[] = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Run code and query db' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'srvtoolu_01CodeExec',
                toolName: 'code_execution',
                input: '{"code":"print(1)"}',
                providerExecuted: true,
              },
              {
                type: 'tool-call',
                toolCallId: 'toolu_01Query',
                toolName: 'query_database',
                input: '{"sql":"SELECT 1"}',
                providerOptions: {
                  anthropic: {
                    caller: {
                      type: 'code_execution_20250825',
                      toolId: 'srvtoolu_01CodeExec',
                    },
                  },
                },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'srvtoolu_01CodeExec',
                toolName: 'code_execution',
                output: { type: 'text', value: '1' },
              },
              {
                type: 'tool-result',
                toolCallId: 'toolu_01Query',
                toolName: 'query_database',
                output: { type: 'text', value: 'result' },
              },
            ],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done' }],
          },
        ];

        const result = pruneMessages({
          messages,
          toolCalls: 'before-last-2-messages',
        });

        // Both tool calls and results should be kept because toolu_01Query
        // references srvtoolu_01CodeExec via caller.toolId
        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Run code and query db",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "input": "{"code":"print(1)"}",
                  "providerExecuted": true,
                  "toolCallId": "srvtoolu_01CodeExec",
                  "toolName": "code_execution",
                  "type": "tool-call",
                },
                {
                  "input": "{"sql":"SELECT 1"}",
                  "providerOptions": {
                    "anthropic": {
                      "caller": {
                        "toolId": "srvtoolu_01CodeExec",
                        "type": "code_execution_20250825",
                      },
                    },
                  },
                  "toolCallId": "toolu_01Query",
                  "toolName": "query_database",
                  "type": "tool-call",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "output": {
                    "type": "text",
                    "value": "1",
                  },
                  "toolCallId": "srvtoolu_01CodeExec",
                  "toolName": "code_execution",
                  "type": "tool-result",
                },
                {
                  "output": {
                    "type": "text",
                    "value": "result",
                  },
                  "toolCallId": "toolu_01Query",
                  "toolName": "query_database",
                  "type": "tool-result",
                },
              ],
              "role": "tool",
            },
            {
              "content": [
                {
                  "text": "Done",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should transitively trace caller.toolId chains', () => {
        const messages: ModelMessage[] = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'nested tool calls' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'srv_root',
                toolName: 'code_execution',
                input: '{}',
                providerExecuted: true,
              },
              {
                type: 'tool-call',
                toolCallId: 'srv_mid',
                toolName: 'intermediate_tool',
                input: '{}',
                providerOptions: {
                  anthropic: {
                    caller: {
                      type: 'code_execution_20250825',
                      toolId: 'srv_root',
                    },
                  },
                },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'srv_root',
                toolName: 'code_execution',
                output: { type: 'text', value: 'ok' },
              },
              {
                type: 'tool-result',
                toolCallId: 'srv_mid',
                toolName: 'intermediate_tool',
                output: { type: 'text', value: 'ok' },
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'toolu_leaf',
                toolName: 'leaf_tool',
                input: '{}',
                providerOptions: {
                  anthropic: {
                    caller: {
                      type: 'code_execution_20250825',
                      toolId: 'srv_mid',
                    },
                  },
                },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'toolu_leaf',
                toolName: 'leaf_tool',
                output: { type: 'text', value: 'leaf result' },
              },
            ],
          },
        ];

        const result = pruneMessages({
          messages,
          toolCalls: 'before-last-2-messages',
        });

        // toolu_leaf (kept) -> srv_mid -> srv_root: all should be kept
        const allToolCallIds = result.flatMap(m =>
          typeof m.content === 'string'
            ? []
            : m.content
                .filter(
                  (p): p is { type: 'tool-call'; toolCallId: string } =>
                    p.type === 'tool-call',
                )
                .map(p => p.toolCallId),
        );
        expect(allToolCallIds).toContain('srv_root');
        expect(allToolCallIds).toContain('srv_mid');
        expect(allToolCallIds).toContain('toolu_leaf');
      });

      it('should not affect pruning when no caller.toolId is present', () => {
        // This verifies backward compatibility
        const result = pruneMessages({
          messages: messagesFixture1,
          toolCalls: 'before-last-2-messages',
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
});
