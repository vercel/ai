import { describe, expect, it } from 'vitest';
import { pruneMessages } from './prune-messages';
import type { ModelMessage } from '@ai-sdk/provider-utils';

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
    ],
  },
  {
    role: 'tool',
    content: [
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
              ],
              "role": "assistant",
            },
            {
              "content": [
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
              ],
              "role": "assistant",
            },
            {
              "content": [
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
    describe('consecutive reasoning parts', () => {
      describe.each([
        'all',
        'before-last-message',
        'before-last-2-messages',
      ] as const)('%s', toolCalls => {
        it.each([2, 3])('should prune all %i reasoning summaries', count => {
          const messages: ModelMessage[] = [
            {
              role: 'assistant',
              content: [
                ...Array.from({ length: count }, (_, index) => ({
                  type: 'reasoning' as const,
                  text: `summary ${index}`,
                  providerOptions: { openai: { itemId: 'rs_1' } },
                })),
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'remove-me',
                  input: {},
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'remove-me',
                  output: { type: 'text', value: 'Tool result.' },
                },
              ],
            },
            { role: 'user', content: 'Continue.' },
            { role: 'assistant', content: 'Final answer.' },
          ];

          expect(pruneMessages({ messages, toolCalls })).toEqual(
            messages.slice(2),
          );
        });
      });

      it.each(['remove', 'keep'] as const)(
        'should prune consecutive reasoning parts with emptyMessages: %s',
        emptyMessages => {
          const messages: ModelMessage[] = [
            {
              role: 'assistant',
              content: [
                { type: 'reasoning', text: 'Call the tool.' },
                { type: 'reasoning', text: 'Use the result.' },
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'remove-me',
                  input: {},
                },
              ],
            },
          ];

          expect(
            pruneMessages({ messages, toolCalls: 'all', emptyMessages }),
          ).toEqual(
            emptyMessages === 'keep'
              ? [{ role: 'assistant', content: [] }]
              : [],
          );
        },
      );

      it('should keep the reasoning group for a retained tool during selective pruning', () => {
        const removedReasoning = [
          {
            type: 'reasoning' as const,
            text: 'Removed summary 0.',
            providerOptions: { openai: { itemId: 'rs_removed' } },
          },
          {
            type: 'reasoning' as const,
            text: 'Removed summary 1.',
            providerOptions: { openai: { itemId: 'rs_removed' } },
          },
        ];
        const retainedContent = [
          {
            type: 'reasoning' as const,
            text: 'Retained summary 0.',
            providerOptions: { openai: { itemId: 'rs_kept' } },
          },
          {
            type: 'reasoning' as const,
            text: 'Retained summary 1.',
            providerOptions: { openai: { itemId: 'rs_kept' } },
          },
          {
            type: 'tool-call' as const,
            toolCallId: 'call-kept',
            toolName: 'keep-me',
            input: {},
          },
        ];

        expect(
          pruneMessages({
            messages: [
              {
                role: 'assistant',
                content: [
                  ...removedReasoning,
                  {
                    type: 'tool-call',
                    toolCallId: 'call-removed',
                    toolName: 'remove-me',
                    input: {},
                  },
                  ...retainedContent,
                ],
              },
            ],
            toolCalls: [{ type: 'all', tools: ['remove-me'] }],
          }),
        ).toEqual([{ role: 'assistant', content: retainedContent }]);
      });

      it('should retain the entire reasoning group when text follows a pruned tool call', () => {
        const reasoning = [
          { type: 'reasoning' as const, text: 'First summary.' },
          { type: 'reasoning' as const, text: 'Second summary.' },
        ];
        const text = { type: 'text' as const, text: 'Retained answer.' };

        expect(
          pruneMessages({
            messages: [
              {
                role: 'assistant',
                content: [
                  ...reasoning,
                  {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'remove-me',
                    input: {},
                  },
                  text,
                ],
              },
            ],
            toolCalls: 'all',
          }),
        ).toEqual([{ role: 'assistant', content: [...reasoning, text] }]);
      });

      it('should retain a reasoning group without following content', () => {
        const messages: ModelMessage[] = [
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'First summary.' },
              { type: 'reasoning', text: 'Second summary.' },
            ],
          },
        ];

        expect(pruneMessages({ messages, toolCalls: 'all' })).toEqual(messages);
      });
    });

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

      it('should prune reasoning whose following tool content was pruned', () => {
        const messages: ModelMessage[] = [
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'Call the first tool.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'remove-me',
                input: {},
              },
              {
                type: 'reasoning',
                text: 'Call the second tool.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-2',
                toolName: 'remove-me',
                input: {},
              },
            ],
          },
        ];

        expect(
          pruneMessages({
            messages,
            toolCalls: 'all',
          }),
        ).toEqual([]);
        expect(
          pruneMessages({
            messages,
            toolCalls: 'all',
            emptyMessages: 'keep',
          }),
        ).toEqual([{ role: 'assistant', content: [] }]);
      });

      it('should retain reasoning followed by kept content', () => {
        const messages: ModelMessage[] = [
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'Only explains the removed tool.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-removed',
                toolName: 'remove-me',
                input: {},
              },
              {
                type: 'reasoning',
                text: 'Explains the retained tool.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-kept',
                toolName: 'keep-me',
                input: {},
              },
              {
                type: 'reasoning',
                text: 'Explains the retained text.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-before-text',
                toolName: 'remove-me',
                input: {},
              },
              {
                type: 'text',
                text: 'Retained answer.',
              },
            ],
          },
        ];

        expect(
          pruneMessages({
            messages,
            toolCalls: [{ type: 'all', tools: ['remove-me'] }],
          }),
        ).toEqual([
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'Explains the retained tool.',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-kept',
                toolName: 'keep-me',
                input: {},
              },
              {
                type: 'reasoning',
                text: 'Explains the retained text.',
              },
              {
                type: 'text',
                text: 'Retained answer.',
              },
            ],
          },
        ]);
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
              ],
              "role": "assistant",
            },
            {
              "content": [
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
              ],
              "role": "assistant",
            },
            {
              "content": [
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
