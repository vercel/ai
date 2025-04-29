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

  it('should handle message with content', () => {
    expect(
      getMessageParts({
        content: 'Test content',
        role: 'assistant',
      }),
    ).toEqual([{ type: 'text', text: 'Test content' }]);
  });
});
