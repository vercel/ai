import { convertToMistralChatMessages } from './convert-to-mistral-chat-messages';

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToMistralChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            args: { key: 'arg-value' },
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
            result: { key: 'result-value' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            type: 'function',
            id: 'tool-call-id-1',
            function: {
              name: 'tool-1',
              arguments: JSON.stringify({ key: 'arg-value' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({ key: 'result-value' }),
        name: 'tool-1',
        tool_call_id: 'tool-call-id-1',
      },
    ]);
  });
});
