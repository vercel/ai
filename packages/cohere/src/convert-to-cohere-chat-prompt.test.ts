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
        message: 'Calling a tool',
        role: 'CHATBOT',
        tool_calls: [
          {
            name: 'tool-1',
            parameters: { test: 'This is a tool message' },
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
        role: 'TOOL',
        tool_results: [
          {
            call: {
              name: 'tool-1',
              parameters: {},
            },
            outputs: [{ test: 'This is a tool message' }],
          },
        ],
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
        role: 'TOOL',
        tool_results: [
          {
            call: {
              name: 'tool-1',
              parameters: {},
            },
            outputs: [{ test: 'This is a tool message' }],
          },
          {
            call: {
              name: 'tool-2',
              parameters: {},
            },
            outputs: [{ something: 'else' }],
          },
        ],
      },
    ]);
  });
});
