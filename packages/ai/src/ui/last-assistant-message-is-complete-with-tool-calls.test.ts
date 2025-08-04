import { lastAssistantMessageIsCompleteWithToolCalls } from './last-assistant-message-is-complete-with-tool-calls';

describe('lastAssistantMessageIsCompleteWithToolCalls', () => {
  it('should return false if the last step of a multi-step sequency only has text', () => {
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [
          {
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
                state: 'done',
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('should return true when there is a text part after the last tool result in the last step', () => {
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [
          {
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
                state: 'done',
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});


describe('lastAssistantMessageIsCompleteWithToolCalls', () => {
  it('should return false if the last step of a multi-step dynamic tool call only has text', () => {
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'dynamic-tool',
                toolName: 'getWeatherInformation',
                toolCallId: 'call_CuEdmzpx4ZldCkg5SVr3ikLz',
                state: 'output-available',
                input: {},
                output: 'New York',
              },
              { type: 'step-start' },
              {
                type: 'text',
                text: 'The current weather in New York is windy.',
                state: 'done',
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('should return true when there is a text part after the last dynamic tool result in the last step', () => {
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'dynamic-tool',
                toolName: 'getWeatherInformation',
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
                state: 'done',
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });
});