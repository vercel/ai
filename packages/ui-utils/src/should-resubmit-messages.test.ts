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

  it('should allow resubmission when maxSteps > 1 and there are tool invocations with results', () => {
    expect(
      shouldResubmitMessages({
        originalMaxToolInvocationStep: undefined,
        originalMessageCount: 1,
        maxSteps: 3,
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
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            parts: [
              {
                type: 'tool-invocation' as const,
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'tool1',
                  toolName: 'some-tool',
                  args: {},
                  result: 'some result',
                  step: 1,
                },
              },
            ],
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'tool1',
                toolName: 'some-tool',
                args: {},
                result: 'some result',
                step: 1,
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  // Scenario 2: Last message existence - when lastMessage is null/undefined
  // Scenario 2: Last message existence - when lastMessage exists
  // Scenario 3: New steps check - when messages.length <= originalMessageCount AND extractMaxToolInvocationStep matches
  // Scenario 3: New steps check - when messages.length > originalMessageCount
  // Scenario 3: New steps check - when extractMaxToolInvocationStep differs from originalMaxToolInvocationStep
  // Scenario 4: Next step possibility check - when isAssistantMessageWithCompletedToolCalls is true
  // Scenario 4: Next step possibility check - when message role is not 'assistant'
  // Scenario 4: Next step possibility check - when message has no tool invocation parts
  // Scenario 4: Next step possibility check - when message has tool invocations without results
  // Scenario 5: Text after tool invocation check - when isLastToolInvocationFollowedByText is true
  // Scenario 5: Text after tool invocation check - when last part is a tool invocation
  // Scenario 5: Text after tool invocation check - when last part is text
  // Scenario 5: Text after tool invocation check - with mixed text and tool invocation ordering
  // Scenario 6: Maximum steps limit check - when current step count < maxSteps
  // Scenario 6: Maximum steps limit check - when current step count >= maxSteps
  // Scenario 6: Maximum steps limit check - when current step count is undefined
  // Scenario 7: All conditions satisfied - should return true
  // Scenario 7: One condition failing - for each condition, should return false
});
