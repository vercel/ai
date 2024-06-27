/** @jsxImportSource solid-js */
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from '@ai-sdk/ui-utils/test';
import { cleanup, findByText, render, screen } from '@solidjs/testing-library';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { For, createSignal } from 'solid-js';
import { useChat } from './use-chat';
import { formatStreamPart } from '@ai-sdk/ui-utils';

describe('stream data stream', () => {
  const TestComponent = () => {
    const [id, setId] = createSignal('first-id');
    const { messages, append, error, data, isLoading } = useChat(() => ({
      id: id(),
    }));

    return (
      <div>
        <div data-testid="loading">{isLoading().toString()}</div>
        <div data-testid="error">{error()?.toString()}</div>
        <div data-testid="data">{JSON.stringify(data())}</div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          )}
        </For>
        <button
          data-testid="do-append"
          onClick={() => {
            append({ role: 'user', content: 'hi' });
          }}
        />
        <button
          data-testid="do-change-id"
          onClick={() => {
            setId('second-id');
          }}
        />
      </div>
    );
  };

  beforeEach(() => {
    render(() => <TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should show streamed response with data', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('data');
    expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
  });

  it('should show error response', async () => {
    mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
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
          yield encoder.encode('0:"Hello"\n');
          await finishGenerationPromise;
        })(),
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      finishGeneration?.();

      await findByText(await screen.findByTestId('loading'), 'false');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should reset loading state on error', async () => {
      mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });

  describe('id', () => {
    it('should clear out messages when the id changes', async () => {
      mockFetchDataStream({
        url: 'https://example.com/api/chat',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('message-1');
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        'AI: Hello, world.',
      );

      await userEvent.click(screen.getByTestId('do-change-id'));

      expect(screen.queryByTestId('message-0')).not.toBeInTheDocument();
    });
  });
});

describe('text stream', () => {
  const TestComponent = () => {
    const { messages, append } = useChat(() => ({
      streamMode: 'text',
    }));

    return (
      <div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}-text-stream`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          )}
        </For>

        <button
          data-testid="do-append-text-stream"
          onClick={() => {
            append({ role: 'user', content: 'hi' });
          }}
        />
      </div>
    );
  };

  beforeEach(() => {
    render(() => <TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'],
    });

    await userEvent.click(screen.getByTestId('do-append-text-stream'));

    await screen.findByTestId('message-0-text-stream');
    expect(screen.getByTestId('message-0-text-stream')).toHaveTextContent(
      'User: hi',
    );

    await screen.findByTestId('message-1-text-stream');
    expect(screen.getByTestId('message-1-text-stream')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });
});

describe('onToolCall', () => {
  const TestComponent = () => {
    const { messages, append } = useChat(() => ({
      async onToolCall({ toolCall }) {
        return `test-tool-response: ${toolCall.toolName} ${
          toolCall.toolCallId
        } ${JSON.stringify(toolCall.args)}`;
      },
    }));

    return (
      <div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}`}>
              <For each={m.toolInvocations ?? []}>
                {(toolInvocation, toolIdx) =>
                  'result' in toolInvocation ? (
                    <div data-testid={`tool-invocation-${toolIdx()}`}>
                      {toolInvocation.result}
                    </div>
                  ) : null
                }
              </For>
            </div>
          )}
        </For>

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
    render(() => <TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("should invoke onToolCall when a tool call is received from the server's response", async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: [
        formatStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'test-tool-response: test-tool tool-call-0 {"testArg":"test-value"}',
    );
  });
});

describe('maxToolRoundtrips', () => {
  describe('single automatic tool roundtrip', () => {
    const TestComponent = () => {
      const { messages, append } = useChat(() => ({
        async onToolCall({ toolCall }) {
          mockFetchDataStream({
            url: 'https://example.com/api/chat',
            chunks: [formatStreamPart('text', 'final result')],
          });

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxToolRoundtrips: 5,
      }));

      return (
        <div>
          <For each={messages()}>
            {(m, idx) => (
              <div data-testid={`message-${idx()}`}>{m.content}</div>
            )}
          </For>

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
      render(() => <TestComponent />);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      mockFetchDataStream({
        url: 'https://example.com/api/chat',
        chunks: [
          formatStreamPart('tool_call', {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          }),
        ],
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('message-2');
      expect(screen.getByTestId('message-2')).toHaveTextContent('final result');
    });
  });

  describe('single roundtrip with error response', () => {
    const TestComponent = () => {
      const { messages, append, error } = useChat(() => ({
        async onToolCall({ toolCall }) {
          mockFetchDataStream({
            url: 'https://example.com/api/chat',
            chunks: [formatStreamPart('error', 'some failure')],
            maxCalls: 1,
          });

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxToolRoundtrips: 5,
      }));

      return (
        <div>
          <div data-testid="error">{error()?.toString()}</div>

          <For each={messages()}>
            {(m, idx) => (
              <div data-testid={`message-${idx()}`}>
                <For each={m.toolInvocations ?? []}>
                  {(toolInvocation, toolIdx) =>
                    'result' in toolInvocation ? (
                      <div data-testid={`tool-invocation-${toolIdx()}`}>
                        {toolInvocation.result}
                      </div>
                    ) : null
                  }
                </For>
              </div>
            )}
          </For>

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
      render(() => <TestComponent />);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      mockFetchDataStream({
        url: 'https://example.com/api/chat',
        chunks: [
          formatStreamPart('tool_call', {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          }),
        ],
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('error');
      expect(screen.getByTestId('error')).toHaveTextContent(
        'Error: Too many calls',
      );
    });
  });
});
