import {
  isAssistantMessageWithCompletedToolCalls,
  shouldResubmitMessages,
} from './should-resubmit-messages';

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
});

describe('isAssistantMessageWithCompletedToolCalls', () => {
  it('should return false if the last step of a multi-step sequency only has text', () => {
    expect(
      isAssistantMessageWithCompletedToolCalls({
        id: '1',
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              step: 1,
              toolCallId: 'call_CuEdmzpx4ZldCkg5SVr3ikLz',
              toolName: 'getLocation',
              args: {},
              result: 'New York',
            },
          },
          { type: 'step-start' },
          {
            type: 'text',
            text: 'The current weather in New York is windy.',
          },
        ],
      }),
    ).toBe(false);
  });

  it('should return true when there is a text part after the last tool result in the last step', () => {
    expect(
      isAssistantMessageWithCompletedToolCalls({
        id: '1',
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              step: 2,
              toolCallId: 'call_6iy0GxZ9R4VDI5MKohXxV48y',
              toolName: 'getWeatherInformation',
              args: {
                city: 'New York',
              },
              result: 'windy',
            },
          },
          {
            type: 'text',
            text: 'The current weather in New York is windy.',
          },
        ],
      }),
    ).toBe(true);
  });
});
