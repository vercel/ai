import { convertToGroqChatMessages } from './convert-to-groq-chat-messages';

describe('user messages', () => {
  it('should convert messages with image parts', async () => {
    const result = convertToGroqChatMessages([
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

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hello",
              "type": "text",
            },
            {
              "image_url": {
                "url": "data:image/png;base64,AAECAw==",
              },
              "type": "image_url",
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should convert messages with image parts from Uint8Array', async () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'file',
            data: new Uint8Array([0, 1, 2, 3]),
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hi",
              "type": "text",
            },
            {
              "image_url": {
                "url": "data:image/png;base64,AAECAw==",
              },
              "type": "image_url",
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello",
          "role": "user",
        },
      ]
    `);
  });
});

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToGroqChatMessages([
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
      [
        {
          "content": "",
          "reasoning": "",
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
      ]
    `);
  });

  it('should send reasoning if present', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'I think the tool will return the correct value.',
          },
          {
            type: 'tool-call',
            input: { foo: 'bar123' },
            toolCallId: 'quux',
            toolName: 'thwomp',
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "reasoning": "I think the tool will return the correct value.",
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
      ]
    `);
  });
});
