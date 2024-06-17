import { formatStreamPart } from '@ai-sdk/ui-utils';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
} from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, findByText, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAssistant } from './use-assistant';
import { firstRun } from './test-samples/use-assistant';

describe('stream data stream', () => {
  const TestComponent = () => {
    const { status, messages, append, threadStatus } = useAssistant({
      api: '/api/assistant',
    });

    return (
      <div>
        <div data-testid="status">{status}</div>
        <div data-testid="thread-status">{threadStatus}</div>
        {messages.map((message, idx) => (
          <div data-testid={`message-${idx}`} key={message.id}>
            {message.role === 'user' ? 'User: ' : 'AI: '}
            {message.content}
          </div>
        ))}

        <button
          data-testid="do-append"
          onClick={() => {
            append({ role: 'user', content: 'hey!' });
          }}
        />
      </div>
    );
  };

  beforeEach(() => {
    render(<TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show final response', async () => {
    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: firstRun.map(part => formatStreamPart('assistant_event', part)),
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hey!');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello! How can I assist you today?',
    );

    // check that correct information was sent to the server:
    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        threadId: null,
        message: 'hey!',
      }),
    );
  });

  describe('should show thread status', () => {
    it('should show final event', async () => {
      let finishGeneration: ((value?: unknown) => void) | undefined;
      const finishGenerationPromise = new Promise(resolve => {
        finishGeneration = resolve;
      });

      mockFetchDataStreamWithGenerator({
        url: 'https://example.com/api/chat',
        chunkGenerator: (async function* generate() {
          const encoder = new TextEncoder();

          for (const streamPart of firstRun) {
            yield encoder.encode(
              formatStreamPart('assistant_event', streamPart),
            );
          }

          await finishGenerationPromise;
        })(),
      });

      await screen.findByTestId('thread-status');
      expect(screen.getByTestId('thread-status')).toHaveTextContent(
        'thread.idle',
      );

      await screen.findByTestId('status');
      expect(screen.getByTestId('status')).toHaveTextContent(
        'awaiting_message',
      );

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('status');
      expect(screen.getByTestId('status')).toHaveTextContent('in_progress');

      finishGeneration?.();

      await findByText(
        await screen.findByTestId('thread-status'),
        'thread.run.completed',
      );
      expect(screen.getByTestId('thread-status')).toHaveTextContent(
        'thread.run.completed',
      );

      await findByText(await screen.findByTestId('status'), 'awaiting_message');
      expect(screen.getByTestId('status')).toHaveTextContent(
        'awaiting_message',
      );
    });
  });
});
