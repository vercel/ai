/** @jsxImportSource solid-js */
import { withTestServer } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart, Message } from '@ai-sdk/ui-utils';
import { mockFetchDataStream } from '@ai-sdk/ui-utils/test';
import {
  cleanup,
  findByText,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { createSignal, For } from 'solid-js';
import { useChat } from './use-chat';

describe('data protocol stream', () => {
  let onFinishCalls: Array<{
    message: Message;
    options: {
      finishReason: string;
      usage: {
        completionTokens: number;
        promptTokens: number;
        totalTokens: number;
      };
    };
  }> = [];

  const TestComponent = () => {
    const [id, setId] = createSignal('first-id');
    const { messages, append, error, data, isLoading, setData } = useChat(
      () => ({
        id: id(),
        onFinish: (message, options) => {
          onFinishCalls.push({ message, options });
        },
      }),
    );

    return (
      <div>
        <div data-testid="loading">{isLoading().toString()}</div>
        <div data-testid="error">{error()?.toString()}</div>
        <div data-testid="data">
          {data() != null ? JSON.stringify(data()) : ''}
        </div>
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
        <button
          data-testid="do-set-data"
          onClick={() => {
            setData([{ t1: 'set' }]);
          }}
        />
        <button
          data-testid="do-clear-data"
          onClick={() => {
            setData(undefined);
          }}
        />
      </div>
    );
  };

  beforeEach(() => {
    render(() => <TestComponent />);
    onFinishCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    onFinishCalls = [];
  });

  it(
    'should show streamed response',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/chat',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Hello, world.',
        );
      },
    ),
  );

  it(
    'should show streamed response with data',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/chat',
        content: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('data');
        expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
      },
    ),
  );

  describe('setData', () => {
    it('should set data', async () => {
      await userEvent.click(screen.getByTestId('do-set-data'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"set"}]');
    });

    it(
      'should clear data',
      withTestServer(
        {
          type: 'stream-values',
          url: '/api/chat',
          content: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
        },
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('data');
          expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

          await userEvent.click(screen.getByTestId('do-clear-data'));

          await screen.findByTestId('data');
          expect(screen.getByTestId('data')).toHaveTextContent('');
        },
      ),
    );
  });

  it(
    'should show error response',
    withTestServer(
      { type: 'error', url: '/api/chat', status: 404, content: 'Not found' },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('error');
        expect(screen.getByTestId('error')).toHaveTextContent(
          'Error: Not found',
        );
      },
    ),
  );

  describe('loading state', () => {
    it(
      'should show loading state',
      withTestServer(
        { url: '/api/chat', type: 'controlled-stream' },
        async ({ streamController }) => {
          streamController.enqueue('0:"Hello"\n');

          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('loading');
          expect(screen.getByTestId('loading')).toHaveTextContent('true');

          streamController.close();

          await findByText(await screen.findByTestId('loading'), 'false');
          expect(screen.getByTestId('loading')).toHaveTextContent('false');
        },
      ),
    );

    it(
      'should reset loading state on error',
      withTestServer(
        { type: 'error', url: '/api/chat', status: 404, content: 'Not found' },
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('loading');
          expect(screen.getByTestId('loading')).toHaveTextContent('false');
        },
      ),
    );
  });

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: [
          formatDataStreamPart('text', 'Hello'),
          formatDataStreamPart('text', ','),
          formatDataStreamPart('text', ' world'),
          formatDataStreamPart('text', '.'),
          formatDataStreamPart('finish_message', {
            finishReason: 'stop',
            usage: { completionTokens: 1, promptTokens: 3 },
          }),
        ],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');

        expect(onFinishCalls).toStrictEqual([
          {
            message: {
              id: expect.any(String),
              createdAt: expect.any(Date),
              role: 'assistant',
              content: 'Hello, world.',
            },
            options: {
              finishReason: 'stop',
              usage: {
                completionTokens: 1,
                promptTokens: 3,
                totalTokens: 4,
              },
            },
          },
        ]);
      },
    ),
  );

  describe('id', () => {
    it(
      'should clear out messages when the id changes',
      withTestServer(
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
        },
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('message-1');
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            'AI: Hello, world.',
          );

          await userEvent.click(screen.getByTestId('do-change-id'));

          expect(screen.queryByTestId('message-0')).not.toBeInTheDocument();
        },
      ),
    );
  });
});

describe('text stream', () => {
  let onFinishCalls: Array<{
    message: Message;
    options: {
      finishReason: string;
      usage: {
        completionTokens: number;
        promptTokens: number;
        totalTokens: number;
      };
    };
  }> = [];

  const TestComponent = () => {
    const { messages, append } = useChat(() => ({
      streamProtocol: 'text',
      onFinish: (message, options) => {
        onFinishCalls.push({ message, options });
      },
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
    onFinishCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    onFinishCalls = [];
  });

  it(
    'should show streamed response',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['Hello', ',', ' world', '.'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append-text-stream'));

        await screen.findByTestId('message-0-text-stream');
        expect(screen.getByTestId('message-0-text-stream')).toHaveTextContent(
          'User: hi',
        );

        await screen.findByTestId('message-1-text-stream');
        expect(screen.getByTestId('message-1-text-stream')).toHaveTextContent(
          'AI: Hello, world.',
        );
      },
    ),
  );

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['Hello', ',', ' world', '.'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append-text-stream'));

        await screen.findByTestId('message-1-text-stream');

        expect(onFinishCalls).toStrictEqual([
          {
            message: {
              id: expect.any(String),
              createdAt: expect.any(Date),
              role: 'assistant',
              content: 'Hello, world.',
            },
            options: {
              finishReason: 'unknown',
              usage: {
                completionTokens: NaN,
                promptTokens: NaN,
                totalTokens: NaN,
              },
            },
          },
        ]);
      },
    ),
  );
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
        formatDataStreamPart('tool_call', {
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

describe('tool invocations', () => {
  const TestComponent = () => {
    const { messages, append, addToolResult } = useChat();
    return (
      <div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}`}>
              <For each={m.toolInvocations ?? []}>
                {(toolInvocation, toolIdx) => (
                  <>
                    <div data-testid={`tool-invocation-${toolIdx()}`}>
                      {JSON.stringify(toolInvocation)}
                    </div>
                    {toolInvocation.state === 'call' && (
                      <button
                        data-testid={`add-result-${toolIdx()}`}
                        onClick={() => {
                          addToolResult({
                            toolCallId: toolInvocation.toolCallId,
                            result: 'test-result',
                          });
                        }}
                      />
                    )}
                  </>
                )}
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

  it(
    'should display partial tool call, tool call, and tool result',
    withTestServer(
      { url: '/api/chat', type: 'controlled-stream' },
      async ({ streamController }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        streamController.enqueue(
          formatDataStreamPart('tool_call_streaming_start', {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"partial-call","toolCallId":"tool-call-0","toolName":"test-tool"}',
          );
        });

        streamController.enqueue(
          formatDataStreamPart('tool_call_delta', {
            toolCallId: 'tool-call-0',
            argsTextDelta: '{"testArg":"t',
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"partial-call","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"t"}}',
          );
        });

        streamController.enqueue(
          formatDataStreamPart('tool_call_delta', {
            toolCallId: 'tool-call-0',
            argsTextDelta: 'est-value"}}',
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"partial-call","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
          );
        });

        streamController.enqueue(
          formatDataStreamPart('tool_call', {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"call","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
          );
        });

        streamController.enqueue(
          formatDataStreamPart('tool_result', {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          }),
        );
        streamController.close();

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"result","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
          );
        });
      },
    ),
  );

  it(
    'should display partial tool call and tool result (when there is no tool call streaming)',
    withTestServer(
      { url: '/api/chat', type: 'controlled-stream' },
      async ({ streamController }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        streamController.enqueue(
          formatDataStreamPart('tool_call', {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"call","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
          );
        });

        streamController.enqueue(
          formatDataStreamPart('tool_result', {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          }),
        );
        streamController.close();

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"result","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
          );
        });
      },
    ),
  );

  it(
    'should update tool call to result when addToolResult is called',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
      ],
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"call","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
          );
        });

        await userEvent.click(screen.getByTestId('add-result-0'));

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            '{"state":"result","toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
          );
        });
      },
    ),
  );
});

describe('maxSteps', () => {
  describe('two steps with automatic tool call', () => {
    const TestComponent = () => {
      const { messages, append } = useChat(() => ({
        async onToolCall({ toolCall }) {
          mockFetchDataStream({
            url: 'https://example.com/api/chat',
            chunks: [formatDataStreamPart('text', 'final result')],
          });

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
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
          formatDataStreamPart('tool_call', {
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

  describe('two steps with error response', () => {
    const TestComponent = () => {
      const { messages, append, error } = useChat(() => ({
        async onToolCall({ toolCall }) {
          mockFetchDataStream({
            url: 'https://example.com/api/chat',
            chunks: [formatDataStreamPart('error', 'some failure')],
            maxCalls: 1,
          });

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
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
          formatDataStreamPart('tool_call', {
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

describe('form actions', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat();

    return (
      <div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          )}
        </For>

        <form onSubmit={handleSubmit}>
          <input
            value={input()}
            placeholder="Send message..."
            onInput={handleInputChange}
            disabled={isLoading()}
            data-testid="do-input"
          />
        </form>
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

  it('should show streamed response using handleSubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const input = screen.getByTestId('do-input');
    await userEvent.type(input, 'hi');
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('');

    // Wait for the user message to appear
    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    // Wait for the AI response to complete
    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');

    expect(screen.queryByTestId('message-2')).not.toBeInTheDocument();
  });
});

describe('form actions (with options)', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat();

    return (
      <div>
        <For each={messages()}>
          {(m, idx) => (
            <div data-testid={`message-${idx()}`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.content}
            </div>
          )}
        </For>

        <form
          onSubmit={event => {
            handleSubmit(event, {
              allowEmptySubmit: true,
            });
          }}
        >
          <input
            value={input()}
            placeholder="Send message..."
            onInput={handleInputChange}
            disabled={isLoading()}
            data-testid="do-input"
          />
        </form>
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

  it('allowEmptySubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const input = screen.getByTestId('do-input');
    await userEvent.type(input, 'hi');
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('');

    // Wait for the user message to appear
    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    // Wait for the AI response to complete
    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent(
      'AI: How can I help you?',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['The', ' sky', ' is', ' blue.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    await userEvent.type(input, 'what color is the sky?');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-3');
    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'User: what color is the sky?',
    );

    await screen.findByTestId('message-4');
    expect(screen.getByTestId('message-4')).toHaveTextContent(
      'AI: The sky is blue.',
    );
  });
});

describe('reload', () => {
  const TestComponent = () => {
    const { messages, append, reload } = useChat();

    return (
      <div>
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
          data-testid="do-reload"
          onClick={() => {
            reload({
              data: { 'test-data-key': 'test-data-value' },
              body: { 'request-body-key': 'request-body-value' },
              headers: { 'header-key': 'header-value' },
            });
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

  it(
    'should show streamed response',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"first response"\n'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"second response"\n'],
        },
      ],
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');

        // setup done, click reload:
        await userEvent.click(screen.getByTestId('do-reload'));

        expect(await call(1).getRequestBodyJson()).toStrictEqual({
          messages: [{ content: 'hi', role: 'user' }],
          data: { 'test-data-key': 'test-data-value' },
          'request-body-key': 'request-body-value',
        });

        expect(call(1).getRequestHeaders()).toStrictEqual({
          'content-type': 'application/json',
          'header-key': 'header-value',
        });

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: second response',
        );
      },
    ),
  );
});
