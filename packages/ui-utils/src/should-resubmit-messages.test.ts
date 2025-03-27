import { shouldResubmitMessages } from './should-resubmit-messages';

describe('shouldResubmitMessages', () => {
  it('should return false when maxSteps <= 1', () => {
    expect(
      shouldResubmitMessages({
        originalMaxToolInvocationStep: undefined,
        originalMessageCount: 1,
        maxSteps: 1,
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            createdAt: new Date(),
            parts: [{ type: 'text', text: 'Hello' }],
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Hello',
            createdAt: new Date(),
            parts: [{ type: 'text', text: 'Hello' }],
          },
        ],
      }),
    ).toBe(false);
  });
});
