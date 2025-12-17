import { describe, expect, it } from 'vitest';
import { convertToXaiResponsesInput } from './convert-to-xai-responses-input';

describe('convertToXaiResponsesInput', () => {
  describe('system messages', () => {
    it('should convert system messages', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [{ role: 'system', content: 'you are a helpful assistant' }],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "you are a helpful assistant",
            "role": "system",
          },
        ]
      `);
      expect(result.inputWarnings).toEqual([]);
    });
  });

  describe('user messages', () => {
    it('should convert single text part', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "hello",
            "role": "user",
          },
        ]
      `);
    });

    it('should concatenate multiple text parts', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "hello world",
            "role": "user",
          },
        ]
      `);
    });

    it('should warn about file parts', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'check this file' },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: new Uint8Array([1, 2, 3]),
              },
            ],
          },
        ],
      });

      expect(result.inputWarnings).toHaveLength(1);
    });
  });

  describe('assistant messages', () => {
    it('should convert text content', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "hi there",
            "id": undefined,
            "role": "assistant",
          },
        ]
      `);
    });

    it('should handle client-side tool-call parts', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'weather',
                input: { location: 'sf' },
              },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "arguments": "{"location":"sf"}",
            "call_id": "call_123",
            "id": "call_123",
            "name": "weather",
            "status": "completed",
            "type": "function_call",
          },
        ]
      `);
    });

    it('should handle client-side tool-call parts named like server-side tools', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_ws',
                toolName: 'web_search',
                input: { query: 'latest news' },
              },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "arguments": "{\"query\":\"latest news\"}",
            "call_id": "call_ws",
            "id": "call_ws",
            "name": "web_search",
            "status": "completed",
            "type": "function_call",
          },
        ]
      `);
    });

    it('should skip server-side tool-call parts', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'ws_123',
                toolName: 'web_search',
                input: {},
                providerExecuted: true,
              },
            ],
          },
        ],
      });

      expect(result.input).toEqual([]);
    });
  });

  describe('tool messages', () => {
    it('should convert tool-result to function_call_output with json', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'weather',
                output: {
                  type: 'json',
                  value: { temp: 72 },
                },
              },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": "{"temp":72}",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should handle text output', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'weather',
                output: {
                  type: 'text',
                  value: 'sunny, 72 degrees',
                },
              },
            ],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": "sunny, 72 degrees",
            "type": "function_call_output",
          },
        ]
      `);
    });
  });

  describe('multi-turn conversations', () => {
    it('should handle full conversation with client-side tool calls', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'whats the weather' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'weather',
                input: { location: 'sf' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'weather',
                output: {
                  type: 'json',
                  value: { temp: 72 },
                },
              },
            ],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'its 72 degrees' }],
          },
        ],
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "whats the weather",
            "role": "user",
          },
          {
            "arguments": "{"location":"sf"}",
            "call_id": "call_123",
            "id": "call_123",
            "name": "weather",
            "status": "completed",
            "type": "function_call",
          },
          {
            "call_id": "call_123",
            "output": "{"temp":72}",
            "type": "function_call_output",
          },
          {
            "content": "its 72 degrees",
            "id": undefined,
            "role": "assistant",
          },
        ]
      `);
    });

    it('should handle conversation with server-side tool calls and item references', async () => {
      const result = await convertToXaiResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'search for ai news' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'ws_123',
                toolName: 'web_search',
                input: {},
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_123',
                toolName: 'web_search',
                output: {
                  type: 'json',
                  value: {},
                },
              },
              { type: 'text', text: 'here are the results' },
            ],
          },
        ],
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": "search for ai news",
            "role": "user",
          },
          {
            "content": "here are the results",
            "id": undefined,
            "role": "assistant",
          },
        ]
      `);
    });
  });
});
