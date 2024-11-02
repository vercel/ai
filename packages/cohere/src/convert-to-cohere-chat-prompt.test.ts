import { convertToCohereChatPrompt } from './convert-to-cohere-chat-prompt';

describe('tool messages', () => {
  it('should convert a tool call into a cohere chatbot message', async () => {
    const result = convertToCohereChatPrompt([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Calling a tool',
          },
          {
            type: 'tool-call',
            toolName: 'tool-1',
            toolCallId: 'tool-call-1',
            args: { test: 'This is a tool message' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        content: 'Calling a tool',
        role: 'assistant',
        tool_calls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: {
              name: 'tool-1',
              arguments: JSON.stringify({ test: 'This is a tool message' }),
            },
          },
        ],
      },
    ]);
  });

  it('should convert a single tool result into a cohere tool message', async () => {
    const result = convertToCohereChatPrompt([
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

    expect(result).toEqual([
      {
        role: 'tool',
        content: JSON.stringify({ test: 'This is a tool message' }),
        tool_call_id: 'tool-call-1',
      },
    ]);
  });

  it('should convert multiple tool results into a cohere tool message', async () => {
    const result = convertToCohereChatPrompt([
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

    expect(result).toEqual([
      {
        role: 'tool',
        content: JSON.stringify({ test: 'This is a tool message' }),
        tool_call_id: 'tool-call-1',
      },
      {
        role: 'tool',
        content: JSON.stringify({ something: 'else' }),
        tool_call_id: 'tool-call-2',
      },
    ]);
  });
});
