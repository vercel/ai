import { formatStreamPart } from '@ai-sdk/ui-utils';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
} from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, findByText, render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import TestChatAssistantStreamComponent from './test/components/TestChatAssistantStreamComponent.vue';

describe('stream data stream', () => {
  // Render the TestChatAssistantStreamComponent before each test
  beforeEach(() => {
    render(TestChatAssistantStreamComponent);
  })

  // Cleanup after each test
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  })

  it('should show streamed response', async () => {
    // Mock the fetch data stream
    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: [
        // Format the stream part
        formatStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm0',
        }),
        formatStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // Text parts
        '0:"Hello"\n',
        '0:", world"\n',
        '0:"."\n',
      ],
    });

    // Click the button
    await userEvent.click(screen.getByTestId('do-append'));

    // Find the message-0 element
    await screen.findByTestId('message-0');
    // Expect the message-0 element to have the text content 'User: hi'
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    // Find the message-1 element
    await screen.findByTestId('message-1');
    // Expect the message-1 element to have the text content 'AI: Hello, world.'
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello, world.');

    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        message: 'hi',
        threadId: null,
      }),
    );
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      let finishGeneration: ((value?: unknown) => void) | undefined;
      
      const finishGenerationPromise = new Promise(resolve => {
        finishGeneration = resolve;
      });
        
      // Mock the fetch data stream with generator
      mockFetchDataStreamWithGenerator({
        url: 'https://example.com/api/assistant',
        chunkGenerator: (async function* generate() {
          const encoder = new TextEncoder();

          yield encoder.encode(
            formatStreamPart('assistant_control_data', {
              threadId: 't0',
              messageId: 'm1',
            }),
          );

          yield encoder.encode(
            formatStreamPart('assistant_message', {
              id: 'm1',
              role: 'assistant',
              content: [{ type: 'text', text: { value: '' } }],
            }),
          );

          yield encoder.encode('0:"Hello"\n');

          await finishGenerationPromise;
        })(),
      });

      // Click the button
      await userEvent.click(screen.getByTestId('do-append'));

      // Find the loading element and expect it to be in progress
      await screen.findByTestId('status');
      expect(screen.getByTestId('status')).toHaveTextContent('in_progress');

      // Resolve the finishGenerationPromise
      finishGeneration?.();

      // Find the loading element and expect it to be awaiting a message
      await findByText(await screen.findByTestId('status'), 'awaiting_message');
      expect(screen.getByTestId('status')).toHaveTextContent('awaiting_message');
    });
  })
})