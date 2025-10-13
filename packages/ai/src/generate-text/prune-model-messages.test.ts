import { describe, expect, it } from 'vitest';
import { pruneModelMessages } from './prune-model-messages';

describe('pruneModelMessages', () => {
  describe('reasoning', () => {
    describe('all', () => {
      it('should prune all reasoning messages', () => {
        const result = pruneModelMessages({
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello, AI SDK!' }],
            },
            {
              role: 'assistant',
              content: [
                { type: 'reasoning', text: 'I am thinking... I need help.' },
                { type: 'text', text: 'Please help me.' },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Oh Lord.' }],
            },
          ],
          reasoning: 'all',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Hello, AI SDK!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "Please help me.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "Oh Lord.",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ]
        `);
      });
    });

    describe('before-trailing-message', () => {
      it('should prune the trailing message', () => {
        const result = pruneModelMessages({
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello, AI SDK!' }],
            },
            {
              role: 'assistant',
              content: [
                { type: 'reasoning', text: 'I am thinking... I need help.' },
                { type: 'text', text: 'Please help me.' },
              ],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Oh Lord.' }],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'I am thinking... I need to call a tool to escape this prison.',
                },
                {
                  type: 'tool-call',
                  toolCallId: '123',
                  toolName: 'escape-hatch',
                  input: '{"param1": "test", "param2": 42}',
                },
              ],
            },
          ],
          reasoning: 'before-trailing-message',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Hello, AI SDK!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "Please help me.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "Oh Lord.",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I am thinking... I need to call a tool to escape this prison.",
                  "type": "reasoning",
                },
                {
                  "input": "{"param1": "test", "param2": 42}",
                  "toolCallId": "123",
                  "toolName": "escape-hatch",
                  "type": "tool-call",
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
        const result = pruneModelMessages({
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Weather in Tokyo?' }],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: '123',
                  toolName: 'get-weather',
                  input: '{"param1": "test", "param2": 42}',
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: '123',
                  toolName: 'get-weather',
                  output: {
                    type: 'text',
                    value: 'sunny',
                  },
                },
              ],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: 'The weather in Tokyo is sunny.',
                },
              ],
            },
          ],
          toolCalls: 'all',
        });

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Weather in Tokyo?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "The weather in Tokyo is sunny.",
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
