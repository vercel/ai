import { convertToMistralChatMessages } from './convert-to-mistral-chat-messages';

describe('user messages', () => {
  it('should convert messages with image parts', async () => {
    const result = convertToMistralChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            data: 'AAECAw==',
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toMatchSnapshot();
  });

  it('should convert messages with PDF file parts using URL', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please analyze this document' },
          {
            type: 'file',
            data: new URL('https://example.com/document.pdf'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ]);

    expect(result).toMatchSnapshot();
  });
});

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            input: { key: 'arg-value' },
            toolCallId: 'tool-call-id-1',
            toolName: 'tool-1',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-id-1',
            toolName: 'tool-1',
            output: { type: 'json', value: { key: 'result-value' } },
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "prefix": undefined,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{"key":"arg-value"}",
                "name": "tool-1",
              },
              "id": "tool-call-id-1",
              "type": "function",
            },
          ],
        },
        {
          "content": "{"key":"result-value"}",
          "name": "tool-1",
          "role": "tool",
          "tool_call_id": "tool-call-id-1",
        },
      ]
    `);
  });

  it('should handle text output format', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            input: { query: 'test' },
            toolCallId: 'tool-call-id-2',
            toolName: 'text-tool',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-id-2',
            toolName: 'text-tool',
            output: { type: 'text', value: 'This is a text response' },
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "prefix": undefined,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{"query":"test"}",
                "name": "text-tool",
              },
              "id": "tool-call-id-2",
              "type": "function",
            },
          ],
        },
        {
          "content": "This is a text response",
          "name": "text-tool",
          "role": "tool",
          "tool_call_id": "tool-call-id-2",
        },
      ]
    `);
  });

  it('should handle content output format', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            input: { query: 'generate image' },
            toolCallId: 'tool-call-id-3',
            toolName: 'image-tool',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-id-3',
            toolName: 'image-tool',
            output: {
              type: 'content',
              value: [
                { type: 'text', text: 'Here is the result:' },
                { type: 'media', data: 'base64data', mediaType: 'image/png' },
              ],
            },
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "prefix": undefined,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{"query":"generate image"}",
                "name": "image-tool",
              },
              "id": "tool-call-id-3",
              "type": "function",
            },
          ],
        },
        {
          "content": "[{"type":"text","text":"Here is the result:"},{"type":"media","data":"base64data","mediaType":"image/png"}]",
          "name": "image-tool",
          "role": "tool",
          "tool_call_id": "tool-call-id-3",
        },
      ]
    `);
  });

  it('should handle error output format', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            input: { query: 'test' },
            toolCallId: 'tool-call-id-4',
            toolName: 'error-tool',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-id-4',
            toolName: 'error-tool',
            output: { type: 'error-text', value: 'Invalid input provided' },
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "prefix": undefined,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{"query":"test"}",
                "name": "error-tool",
              },
              "id": "tool-call-id-4",
              "type": "function",
            },
          ],
        },
        {
          "content": "Invalid input provided",
          "name": "error-tool",
          "role": "tool",
          "tool_call_id": "tool-call-id-4",
        },
      ]
    `);
  });
});

describe('assistant messages', () => {
  it('should add prefix true to trailing assistant messages', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
      },
    ]);

    expect(result).toMatchSnapshot();
  });
});
