import { getMessageParts } from './get-message-parts';

describe('getMessageParts', () => {
  it('should handle message with parts already defined', () => {
    expect(
      getMessageParts({
        role: 'assistant',
        content: 'Test content',
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'reasoning', reasoning: 'Because' },
        ],
      }),
    ).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', reasoning: 'Because' },
    ]);
  });

  it('should handle message with tool invocations', () => {
    expect(
      getMessageParts({
        role: 'assistant',
        content: '',
        toolInvocations: [
          {
            state: 'call',
            toolCallId: 'test-call-id',
            toolName: 'test-tool',
            args: { input: 'test-input' },
          },
        ],
      }),
    ).toEqual([
      {
        type: 'tool-invocation',
        toolInvocation: {
          state: 'call',
          toolCallId: 'test-call-id',
          toolName: 'test-tool',
          args: { input: 'test-input' },
        },
      },
    ]);
  });

  it('should handle message with content', () => {
    expect(
      getMessageParts({
        content: 'Test content',
        role: 'assistant',
      }),
    ).toEqual([{ type: 'text', text: 'Test content' }]);
  });

  it('should handle message with multiple properties', () => {
    expect(
      getMessageParts({
        role: 'assistant',
        content: 'Test content',
        toolInvocations: [
          {
            state: 'call',
            toolCallId: 'test-call-id',
            toolName: 'test-tool',
            args: { input: 'test-input' },
          },
        ],
      }),
    ).toEqual([
      {
        type: 'tool-invocation',
        toolInvocation: {
          state: 'call',
          toolCallId: 'test-call-id',
          toolName: 'test-tool',
          args: { input: 'test-input' },
        },
      },
      { type: 'text', text: 'Test content' },
    ]);
  });
});
