import { formatStreamPart } from '@ai-sdk/ui-utils';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, findByText, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAssistant } from './use-assistant';

describe('stream data stream', () => {
  const TestComponent = () => {
    const { status, messages, error, append } = useAssistant({
      api: '/api/assistant',
    });

    return (
      <div>
        <div data-testid="status">{status}</div>
        {error && <div data-testid="error">{error.toString()}</div>}
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={idx}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <button
          data-testid="do-append"
          onClick={() => {
            append({ role: 'user', content: 'hi' });
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

  it('should show streamed response', async () => {
    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: [
        formatStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm0',
        }),
        formatStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    // check that correct information was sent to the server:
    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        threadId: null,
        message: 'hi',
      }),
    );
  });

  it('should show error response', async () => {
    mockFetchError({ statusCode: 500, errorMessage: 'Internal Error' });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Error: Internal Error',
    );
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      let finishGeneration: ((value?: unknown) => void) | undefined;
      const finishGenerationPromise = new Promise(resolve => {
        finishGeneration = resolve;
      });

      mockFetchDataStreamWithGenerator({
        url: 'https://example.com/api/chat',
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

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('status');
      expect(screen.getByTestId('status')).toHaveTextContent('in_progress');

      finishGeneration?.();

      await findByText(await screen.findByTestId('status'), 'awaiting_message');
      expect(screen.getByTestId('status')).toHaveTextContent(
        'awaiting_message',
      );
    });
  });
});

describe('thread management', () => {
  const TestComponent = () => {
    const { status, messages, error, append, setThreadId, threadId } =
      useAssistant({
        api: '/api/assistant',
      });

    return (
      <div>
        <div data-testid="status">{status}</div>
        <div data-testid="thread-id">{threadId || 'undefined'}</div>
        {error && <div data-testid="error">{error.toString()}</div>}
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={idx}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <button
          data-testid="do-append"
          onClick={() => {
            append({ role: 'user', content: 'hi' });
          }}
        />
        <button
          data-testid="do-new-thread"
          onClick={() => {
            setThreadId(undefined);
          }}
        />
        <button
          data-testid="do-thread-3"
          onClick={() => {
            setThreadId('t3');
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

  it('create new thread', async () => {
    await screen.findByTestId('thread-id');
    expect(screen.getByTestId('thread-id')).toHaveTextContent('undefined');
  });

  it('should show streamed response', async () => {
    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: [
        formatStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm0',
        }),
        formatStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t0');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    // check that correct information was sent to the server:
    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        threadId: null,
        message: 'hi',
      }),
    );
  });

  it('should switch to new thread on setting undefined threadId', async () => {
    await userEvent.click(screen.getByTestId('do-new-thread'));

    expect(screen.queryByTestId('message-0')).toBeNull();
    expect(screen.queryByTestId('message-1')).toBeNull();

    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: [
        formatStreamPart('assistant_control_data', {
          threadId: 't1',
          messageId: 'm0',
        }),
        formatStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t1');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    // check that correct information was sent to the server:
    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        threadId: null,
        message: 'hi',
      }),
    );
  });

  it('should switch to thread on setting previously created threadId', async () => {
    await userEvent.click(screen.getByTestId('do-thread-3'));

    expect(screen.queryByTestId('message-0')).toBeNull();
    expect(screen.queryByTestId('message-1')).toBeNull();

    const { requestBody } = mockFetchDataStream({
      url: 'https://example.com/api/assistant',
      chunks: [
        formatStreamPart('assistant_control_data', {
          threadId: 't3',
          messageId: 'm0',
        }),
        formatStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t3');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    // check that correct information was sent to the server:
    expect(await requestBody).toStrictEqual(
      JSON.stringify({
        threadId: 't3',
        message: 'hi',
      }),
    );
  });
});
