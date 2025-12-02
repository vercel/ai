import { convertToDeepSeekChatMessages } from './convert-to-deepseek-chat-messages';
import { describe, it, expect } from 'vitest';

describe('convertToDeepSeekChatMessages', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToDeepSeekChatMessages([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should warn about unsupported file parts', async () => {
      const result = convertToDeepSeekChatMessages([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'file',
              data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              mediaType: 'image/png',
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "warnings": [
            {
              "feature": "user message part type: file",
              "type": "unsupported",
            },
          ],
        }
      `);
    });
  });

  describe('tool calls', () => {
    it('should stringify arguments to tool calls', () => {
      const result = convertToDeepSeekChatMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: { foo: 'bar123' },
              toolCallId: 'quux',
              toolName: 'thwomp',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'quux',
              toolName: 'thwomp',
              output: { type: 'json', value: { oof: '321rab' } },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"foo":"bar123"}",
                    "name": "thwomp",
                  },
                  "id": "quux",
                  "type": "function",
                },
              ],
            },
            {
              "content": "{"oof":"321rab"}",
              "role": "tool",
              "tool_call_id": "quux",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should handle text output type in tool results', () => {
      const result = convertToDeepSeekChatMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              input: { query: 'weather' },
              toolCallId: 'call-1',
              toolName: 'getWeather',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              output: { type: 'text', value: 'It is sunny today' },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"query":"weather"}",
                    "name": "getWeather",
                  },
                  "id": "call-1",
                  "type": "function",
                },
              ],
            },
            {
              "content": "It is sunny today",
              "role": "tool",
              "tool_call_id": "call-1",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });
});
