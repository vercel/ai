import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('system messages', () => {
  it('should convert a single system message into an anthropic system message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      { role: 'system', content: 'This is a system message' },
    ]);

    expect(result).toEqual({
      messages: [],
      system: 'This is a system message',
    });
  });

  it('should convert multiple system messages into an anthropic system message separated by a newline', async () => {
    const result = convertToAnthropicMessagesPrompt([
      { role: 'system', content: 'This is a system message' },
      { role: 'system', content: 'This is another system message' },
    ]);

    expect(result).toEqual({
      messages: [],
      system: 'This is a system message\nThis is another system message',
    });
  });
});

describe('user messages', () => {
  it('should add image parts for UInt8Array images', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: new Uint8Array([0, 1, 2, 3]),
            mimeType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                data: 'AAECAw==',
                media_type: 'image/png',
                type: 'base64',
              },
            },
          ],
        },
      ],
      system: undefined,
    });
  });
});

describe('tool messages', () => {
  it('should convert a single tool result into an anthropic user message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'tool-1',
            toolCallId: 'tool-call-1',
            result: { test: 'This is a tool message' },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-1',
              is_error: undefined,
              content: JSON.stringify({ test: 'This is a tool message' }),
            },
          ],
        },
      ],
      system: undefined,
    });
  });

  it('should convert multiple tool results into an anthropic user message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'tool-1',
            toolCallId: 'tool-call-1',
            result: { test: 'This is a tool message' },
          },
          {
            type: 'tool-result',
            toolName: 'tool-2',
            toolCallId: 'tool-call-2',
            result: { something: 'else' },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-1',
              is_error: undefined,
              content: JSON.stringify({ test: 'This is a tool message' }),
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-2',
              is_error: undefined,
              content: JSON.stringify({ something: 'else' }),
            },
          ],
        },
      ],
      system: undefined,
    });
  });

  it('should combine user and tool messages', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'tool-1',
            toolCallId: 'tool-call-1',
            result: { test: 'This is a tool message' },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'This is a user message' }],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-1',
              is_error: undefined,
              content: JSON.stringify({ test: 'This is a tool message' }),
            },
            { type: 'text', text: 'This is a user message' },
          ],
        },
      ],
      system: undefined,
    });
  });
});

describe('assistant messages', () => {
  it('should remove trailing whitespace from last assistant message when there is no further user message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'user',
        content: [{ type: 'text', text: 'user content' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant content  ' }],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant content' }],
        },
      ],
      system: undefined,
    });
  });

  it('should keep trailing whitespace from assistant message when there is a further user message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      {
        role: 'user',
        content: [{ type: 'text', text: 'user content' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant content  ' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'user content 2' }],
      },
    ]);

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant content  ' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'user content 2' }],
        },
      ],
      system: undefined,
    });
  });

  it('should combine multiple sequential assistant messages into a single message', async () => {
    const result = convertToAnthropicMessagesPrompt([
      { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'World' }] },
      { role: 'assistant', content: [{ type: 'text', text: '!' }] },
    ]);

    expect(result).toEqual({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hi!' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
            { type: 'text', text: '!' },
          ],
        },
      ],
      system: undefined,
    });
  });
});
