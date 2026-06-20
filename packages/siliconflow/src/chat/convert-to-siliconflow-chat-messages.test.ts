import { convertToSiliconFlowChatMessages } from './convert-to-siliconflow-chat-messages';
import { describe, it, expect } from 'vitest';

describe('convertToSiliconFlowChatMessages', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        responseFormat: undefined,
      });

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

    it('should warn about unsupported file parts', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                data: {
                  type: 'data' as const,
                  data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                },
                mediaType: 'image/png',
              },
            ],
          },
        ],
        responseFormat: undefined,
      });

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

  describe('system messages', () => {
    it('should convert system messages', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
          },
        ],
        responseFormat: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "You are a helpful assistant.",
              "role": "system",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });

  describe('assistant messages', () => {
    it('should convert assistant text messages', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
        ],
        responseFormat: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello!",
              "role": "assistant",
              "tool_calls": undefined,
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should convert tool call messages', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'get_weather',
                input: { location: 'Paris' },
              },
            ],
          },
        ],
        responseFormat: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"location":"Paris"}",
                    "name": "get_weather",
                  },
                  "id": "call_1",
                  "type": "function",
                },
              ],
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should skip reasoning parts', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'thinking...' },
              { type: 'text', text: 'Answer' },
            ],
          },
        ],
        responseFormat: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Answer",
              "role": "assistant",
              "tool_calls": undefined,
            },
          ],
          "warnings": [],
        }
      `);
    });
  });

  describe('tool messages', () => {
    it('should convert tool result messages', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                output: { type: 'text', value: 'Sunny' },
              },
            ],
          },
        ],
        responseFormat: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Sunny",
              "role": "tool",
              "tool_call_id": "call_1",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });

  describe('response format', () => {
    it('should inject JSON response format as system message', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        responseFormat: { type: 'json' },
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Return JSON.",
              "role": "system",
            },
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should inject JSON schema as system message', () => {
      const result = convertToSiliconFlowChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      });

      expect(result.messages[0].content).toContain('Return JSON');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].feature).toBe('responseFormat JSON schema');
    });
  });
});
