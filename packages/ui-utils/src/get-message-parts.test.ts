import { getMessageParts } from './get-message-parts';

describe('getMessageParts', () => {
  it('should handle message with parts already defined', () => {
    expect(
      getMessageParts({
        role: 'assistant',
        content: 'Test content',
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'reasoning', reasoning: 'Because', details: [] },
        ],
      }),
    ).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'reasoning', reasoning: 'Because', details: [] },
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

  it('should handle message with reasoning', () => {
    expect(
      getMessageParts({
        role: 'assistant',
        content: 'Test content',
        reasoning: 'Test reasoning',
      }),
    ).toEqual([
      {
        type: 'reasoning',
        reasoning: 'Test reasoning',
        details: [{ type: 'text', text: 'Test reasoning' }],
      },
      { type: 'text', text: 'Test content' },
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
        reasoning: 'Test reasoning',
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
      {
        type: 'reasoning',
        reasoning: 'Test reasoning',
        details: [{ type: 'text', text: 'Test reasoning' }],
      },
      { type: 'text', text: 'Test content' },
    ]);
  });
});
