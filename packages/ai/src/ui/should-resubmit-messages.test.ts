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
            parts: [{ type: 'text', text: 'Hello' }],
          },
          {
            id: '2',
            role: 'assistant',
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
            parts: [{ type: 'text', text: 'Hello' }],
          },
          {
            id: '2',
            role: 'assistant' as const,
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-getLocation',
                toolCallId: 'tool1',
                state: 'output-available',
                input: {},
                output: 'some result',
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
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getLocation',
            toolCallId: 'call_CuEdmzpx4ZldCkg5SVr3ikLz',
            state: 'output-available',
            input: {},
            output: 'New York',
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
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getWeatherInformation',
            toolCallId: 'call_6iy0GxZ9R4VDI5MKohXxV48y',
            state: 'output-available',
            input: {
              city: 'New York',
            },
            output: 'windy',
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
