import { convertToXaiChatMessages } from './convert-to-xai-chat-messages';

describe('convertToXaiChatMessages', () => {
  it('should convert simple text messages', () => {
    const { messages, warnings } = convertToXaiChatMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(warnings).toEqual([]);
    expect(messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert system messages', () => {
    const { messages, warnings } = convertToXaiChatMessages([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);

    expect(warnings).toEqual([]);
    expect(messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);
  });

  it('should convert assistant messages', () => {
    const { messages, warnings } = convertToXaiChatMessages([
      { role: 'assistant', content: [{ type: 'text', text: 'Hello there!' }] },
    ]);

    expect(warnings).toEqual([]);
    expect(messages).toEqual([
      { role: 'assistant', content: 'Hello there!', tool_calls: undefined },
    ]);
  });

  it('should convert tool calls and tool responses', () => {
    const { messages, warnings } = convertToXaiChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_123',
            toolName: 'weather',
            args: { location: 'Paris' },
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
            result: { temperature: 20 },
          },
        ],
      },
    ]);

    expect(warnings).toEqual([]);
    expect(messages).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"location":"Paris"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_123',
        content: '{"temperature":20}',
      },
    ]);
  });
});
