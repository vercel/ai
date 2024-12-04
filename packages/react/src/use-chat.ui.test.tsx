/* eslint-disable @next/next/no-img-element */
import { withTestServer } from '@ai-sdk/provider-utils/test';
import {
  formatDataStreamPart,
  generateId,
  getTextFromDataUrl,
  Message,
} from '@ai-sdk/ui-utils';
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  findByText,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useRef, useState } from 'react';
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

  const TestComponent = ({ id: idParam }: { id: string }) => {
    const [id, setId] = React.useState<string>(idParam);
    const { messages, append, error, data, isLoading, setData } = useChat({
      id,
      onFinish: (message, options) => {
        onFinishCalls.push({ message, options });
      },
    });

    return (
      <div>
        <div data-testid="loading">{isLoading.toString()}</div>
        {error && <div data-testid="error">{error.toString()}</div>}
        <div data-testid="data">{data != null ? JSON.stringify(data) : ''}</div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
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
    // use a random id to avoid conflicts:
    render(<TestComponent id={`first-id-${generateId()}`} />);
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
    'should set stream data',
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
    'should show error response when there is a server error',
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

  it(
    'should show error response when there is a streaming error',
    withTestServer(
      {
        type: 'stream-values',
        url: '/api/chat',
        content: ['3:"custom error message"\n'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('error');
        expect(screen.getByTestId('error')).toHaveTextContent(
          'Error: custom error message',
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
    const { messages, append } = useChat({
      streamProtocol: 'text',
      onFinish: (message, options) => {
        onFinishCalls.push({ message, options });
      },
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}-text-stream`} key={m.id}>
            <div data-testid={`message-${idx}-id`}>{m.id}</div>
            <div data-testid={`message-${idx}-role`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
            </div>
            <div data-testid={`message-${idx}-content`}>{m.content}</div>
          </div>
        ))}

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
    render(<TestComponent />);
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

        await screen.findByTestId('message-0-content');
        expect(screen.getByTestId('message-0-content')).toHaveTextContent('hi');

        await screen.findByTestId('message-1-content');
        expect(screen.getByTestId('message-1-content')).toHaveTextContent(
          'Hello, world.',
        );
      },
    ),
  );

  it(
    'should have stable message ids',
    withTestServer(
      { url: '/api/chat', type: 'controlled-stream' },
      async ({ streamController }) => {
        streamController.enqueue('He');

        await userEvent.click(screen.getByTestId('do-append-text-stream'));

        await screen.findByTestId('message-1-content');
        expect(screen.getByTestId('message-1-content')).toHaveTextContent('He');

        const id = screen.getByTestId('message-1-id').textContent;

        streamController.enqueue('llo');
        streamController.close();

        await screen.findByTestId('message-1-content');
        expect(screen.getByTestId('message-1-content')).toHaveTextContent(
          'Hello',
        );
        expect(screen.getByTestId('message-1-id').textContent).toBe(id);
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

describe('form actions', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat({ streamProtocol: 'text' });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <form onSubmit={handleSubmit}>
          <input
            value={input}
            placeholder="Send message..."
            onChange={handleInputChange}
            disabled={isLoading}
            data-testid="do-input"
          />
        </form>
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

  it(
    'should show streamed response using handleSubmit',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['Hello', ',', ' world', '.'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['How', ' can', ' I', ' help', ' you', '?'],
        },
      ],
      async () => {
        const firstInput = screen.getByTestId('do-input');
        await userEvent.type(firstInput, 'hi');
        await userEvent.keyboard('{Enter}');

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Hello, world.',
        );

        const secondInput = screen.getByTestId('do-input');
        await userEvent.type(secondInput, '{Enter}');

        expect(screen.queryByTestId('message-2')).not.toBeInTheDocument();
      },
    ),
  );
});

describe('form actions (with options)', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat({ streamProtocol: 'text' });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <form
          onSubmit={event => {
            handleSubmit(event, {
              allowEmptySubmit: true,
            });
          }}
        >
          <input
            value={input}
            placeholder="Send message..."
            onChange={handleInputChange}
            disabled={isLoading}
            data-testid="do-input"
          />
        </form>
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

  it(
    'allowEmptySubmit',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['Hello', ',', ' world', '.'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['How', ' can', ' I', ' help', ' you', '?'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['The', ' sky', ' is', ' blue', '.'],
        },
      ],
      async () => {
        const firstInput = screen.getByTestId('do-input');
        await userEvent.type(firstInput, 'hi');
        await userEvent.keyboard('{Enter}');

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Hello, world.',
        );

        const secondInput = screen.getByTestId('do-input');
        await userEvent.type(secondInput, '{Enter}');

        expect(screen.getByTestId('message-2')).toHaveTextContent(
          'AI: How can I help you?',
        );

        const thirdInput = screen.getByTestId('do-input');
        await userEvent.type(thirdInput, 'what color is the sky?');
        await userEvent.type(thirdInput, '{Enter}');

        expect(screen.getByTestId('message-3')).toHaveTextContent(
          'User: what color is the sky?',
        );

        await screen.findByTestId('message-4');
        expect(screen.getByTestId('message-4')).toHaveTextContent(
          'AI: The sky is blue.',
        );
      },
    ),
  );
});

describe('prepareRequestBody', () => {
  let bodyOptions: any;

  const TestComponent = () => {
    const { messages, append, isLoading } = useChat({
      experimental_prepareRequestBody(options) {
        bodyOptions = options;
        return 'test-request-body';
      },
    });

    return (
      <div>
        <div data-testid="loading">{isLoading.toString()}</div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <button
          data-testid="do-append"
          onClick={() => {
            append(
              { role: 'user', content: 'hi' },
              {
                data: { 'test-data-key': 'test-data-value' },
                body: { 'request-body-key': 'request-body-value' },
              },
            );
          }}
        />
      </div>
    );
  };

  beforeEach(() => {
    render(<TestComponent />);
  });

  afterEach(() => {
    bodyOptions = undefined;
    vi.restoreAllMocks();
    cleanup();
  });

  it(
    'should show streamed response',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        expect(bodyOptions).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'hi',
              id: expect.any(String),
              experimental_attachments: undefined,
              createdAt: expect.any(Date),
            },
          ],
          requestData: { 'test-data-key': 'test-data-value' },
          requestBody: { 'request-body-key': 'request-body-value' },
        });

        expect(await call(0).getRequestBodyJson()).toBe('test-request-body');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Hello, world.',
        );
      },
    ),
  );
});

describe('onToolCall', () => {
  const TestComponent = () => {
    const { messages, append } = useChat({
      async onToolCall({ toolCall }) {
        return `test-tool-response: ${toolCall.toolName} ${
          toolCall.toolCallId
        } ${JSON.stringify(toolCall.args)}`;
      },
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.toolInvocations?.map((toolInvocation, toolIdx) =>
              'result' in toolInvocation ? (
                <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                  {toolInvocation.result}
                </div>
              ) : null,
            )}
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

  it(
    "should invoke onToolCall when a tool call is received from the server's response",
    withTestServer(
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
      async () => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'test-tool-response: test-tool tool-call-0 {"testArg":"test-value"}',
        );
      },
    ),
  );
});

describe('tool invocations', () => {
  const TestComponent = () => {
    const { messages, append, addToolResult } = useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.toolInvocations?.map((toolInvocation, toolIdx) => {
              return (
                <>
                  <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                    {JSON.stringify(toolInvocation)}
                  </div>
                  {toolInvocation.state === 'call' && (
                    <button
                      data-testid={`add-result-${toolIdx}`}
                      onClick={() => {
                        addToolResult({
                          toolCallId: toolInvocation.toolCallId,
                          result: 'test-result',
                        });
                      }}
                    />
                  )}
                </>
              );
            })}
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
    let onToolCallInvoked = false;

    const TestComponent = () => {
      const { messages, append } = useChat({
        async onToolCall({ toolCall }) {
          onToolCallInvoked = true;

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
      });

      return (
        <div>
          {messages.map((m, idx) => (
            <div data-testid={`message-${idx}`} key={m.id}>
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
      onToolCallInvoked = false;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
    });

    it(
      'should automatically call api when tool call gets executed via onToolCall',
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
          {
            url: '/api/chat',
            type: 'stream-values',
            content: [formatDataStreamPart('text', 'final result')],
          },
        ],
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          expect(onToolCallInvoked).toBe(true);

          await screen.findByTestId('message-2');
          expect(screen.getByTestId('message-2')).toHaveTextContent(
            'final result',
          );
        },
      ),
    );
  });

  describe('two steps with error response', () => {
    let onToolCallCounter = 0;

    const TestComponent = () => {
      const { messages, append, error } = useChat({
        async onToolCall({ toolCall }) {
          onToolCallCounter++;
          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
      });

      return (
        <div>
          {error && <div data-testid="error">{error.toString()}</div>}

          {messages.map((m, idx) => (
            <div data-testid={`message-${idx}`} key={m.id}>
              {m.toolInvocations?.map((toolInvocation, toolIdx) =>
                'result' in toolInvocation ? (
                  <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                    {toolInvocation.result}
                  </div>
                ) : null,
              )}
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
      onToolCallCounter = 0;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      cleanup();
    });

    it(
      'should automatically call api when tool call gets executed via onToolCall',
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
          {
            url: '/api/chat',
            type: 'error',
            status: 400,
            content: 'call failure',
          },
        ],
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('error');
          expect(screen.getByTestId('error')).toHaveTextContent(
            'Error: call failure',
          );

          expect(onToolCallCounter).toBe(1);
        },
      ),
    );
  });
});

describe('file attachments with data url', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat();

    const [attachments, setAttachments] = useState<FileList | undefined>(
      undefined,
    );
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
            {m.experimental_attachments?.map(attachment => {
              if (attachment.contentType?.startsWith('image/')) {
                return (
                  <img
                    key={attachment.name}
                    src={attachment.url}
                    alt={attachment.name}
                    data-testid={`attachment-${idx}`}
                  />
                );
              } else if (attachment.contentType?.startsWith('text/')) {
                return (
                  <div key={attachment.name} data-testid={`attachment-${idx}`}>
                    {getTextFromDataUrl(attachment.url)}
                  </div>
                );
              }
            })}
          </div>
        ))}

        <form
          onSubmit={event => {
            handleSubmit(event, {
              experimental_attachments: attachments,
            });
            setAttachments(undefined);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
          data-testid="chat-form"
        >
          <input
            type="file"
            onChange={event => {
              if (event.target.files) {
                setAttachments(event.target.files);
              }
            }}
            multiple
            ref={fileInputRef}
            data-testid="file-input"
          />
          <input
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
            data-testid="message-input"
          />
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
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

  it(
    'should handle text file attachment and submission',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Response to message with text attachment"\n'],
      },
      async ({ call }) => {
        const file = new File(['test file content'], 'test.txt', {
          type: 'text/plain',
        });

        const fileInput = screen.getByTestId('file-input');
        await userEvent.upload(fileInput, file);

        const messageInput = screen.getByTestId('message-input');
        await userEvent.type(messageInput, 'Message with text attachment');

        const submitButton = screen.getByTestId('submit-button');
        await userEvent.click(submitButton);

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent(
          'User: Message with text attachment',
        );

        await screen.findByTestId('attachment-0');
        expect(screen.getByTestId('attachment-0')).toHaveTextContent(
          'test file content',
        );

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Response to message with text attachment',
        );

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'Message with text attachment',
              experimental_attachments: [
                {
                  name: 'test.txt',
                  contentType: 'text/plain',
                  url: 'data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=',
                },
              ],
            },
          ],
        });
      },
    ),
  );

  it(
    'should handle image file attachment and submission',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Response to message with image attachment"\n'],
      },
      async ({ call }) => {
        const file = new File(['test image content'], 'test.png', {
          type: 'image/png',
        });

        const fileInput = screen.getByTestId('file-input');
        await userEvent.upload(fileInput, file);

        const messageInput = screen.getByTestId('message-input');
        await userEvent.type(messageInput, 'Message with image attachment');

        const submitButton = screen.getByTestId('submit-button');
        await userEvent.click(submitButton);

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent(
          'User: Message with image attachment',
        );

        await screen.findByTestId('attachment-0');
        expect(screen.getByTestId('attachment-0')).toHaveAttribute(
          'src',
          expect.stringContaining('data:image/png;base64'),
        );

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Response to message with image attachment',
        );

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'Message with image attachment',
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
                },
              ],
            },
          ],
        });
      },
    ),
  );
});

describe('file attachments with url', () => {
  const TestComponent = () => {
    const { messages, handleSubmit, handleInputChange, isLoading, input } =
      useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
            {m.experimental_attachments?.map(attachment => {
              if (attachment.contentType?.startsWith('image/')) {
                return (
                  <img
                    key={attachment.name}
                    src={attachment.url}
                    alt={attachment.name}
                    data-testid={`attachment-${idx}`}
                  />
                );
              } else if (attachment.contentType?.startsWith('text/')) {
                return (
                  <div key={attachment.name} data-testid={`attachment-${idx}`}>
                    {Buffer.from(
                      attachment.url.split(',')[1],
                      'base64',
                    ).toString('utf-8')}
                  </div>
                );
              }
            })}
          </div>
        ))}

        <form
          onSubmit={event => {
            handleSubmit(event, {
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            });
          }}
          data-testid="chat-form"
        >
          <input
            value={input}
            onChange={handleInputChange}
            disabled={isLoading}
            data-testid="message-input"
          />
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
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

  it(
    'should handle image file attachment and submission',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Response to message with image attachment"\n'],
      },
      async ({ call }) => {
        const messageInput = screen.getByTestId('message-input');
        await userEvent.type(messageInput, 'Message with image attachment');

        const submitButton = screen.getByTestId('submit-button');
        await userEvent.click(submitButton);

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent(
          'User: Message with image attachment',
        );

        await screen.findByTestId('attachment-0');
        expect(screen.getByTestId('attachment-0')).toHaveAttribute(
          'src',
          expect.stringContaining('https://example.com/image.png'),
        );

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Response to message with image attachment',
        );

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'Message with image attachment',
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            },
          ],
        });
      },
    ),
  );
});

describe('attachments with empty submit', () => {
  const TestComponent = () => {
    const { messages, handleSubmit } = useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
            {m.experimental_attachments?.map(attachment => (
              <img
                key={attachment.name}
                src={attachment.url}
                alt={attachment.name}
                data-testid={`attachment-${idx}`}
              />
            ))}
          </div>
        ))}

        <form
          onSubmit={event => {
            handleSubmit(event, {
              allowEmptySubmit: true,
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            });
          }}
          data-testid="chat-form"
        >
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
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

  it(
    'should handle image file attachment and submission',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Response to message with image attachment"\n'],
      },
      async ({ call }) => {
        const submitButton = screen.getByTestId('submit-button');
        await userEvent.click(submitButton);

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User:');

        await screen.findByTestId('attachment-0');
        expect(screen.getByTestId('attachment-0')).toHaveAttribute(
          'src',
          expect.stringContaining('https://example.com/image.png'),
        );

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent('AI:');

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: '',
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            },
          ],
        });
      },
    ),
  );
});

describe('should append message with attachments', () => {
  const TestComponent = () => {
    const { messages, append } = useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
            {m.experimental_attachments?.map(attachment => (
              <img
                key={attachment.name}
                src={attachment.url}
                alt={attachment.name}
                data-testid={`attachment-${idx}`}
              />
            ))}
          </div>
        ))}

        <form
          onSubmit={event => {
            event.preventDefault();

            append(
              {
                role: 'user',
                content: 'Message with image attachment',
              },
              {
                experimental_attachments: [
                  {
                    name: 'test.png',
                    contentType: 'image/png',
                    url: 'https://example.com/image.png',
                  },
                ],
              },
            );
          }}
          data-testid="chat-form"
        >
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
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

  it(
    'should handle image file attachment and submission',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Response to message with image attachment"\n'],
      },
      async ({ call }) => {
        const submitButton = screen.getByTestId('submit-button');
        await userEvent.click(submitButton);

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent(
          'User: Message with image attachment',
        );

        await screen.findByTestId('attachment-0');
        expect(screen.getByTestId('attachment-0')).toHaveAttribute(
          'src',
          expect.stringContaining('https://example.com/image.png'),
        );

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent('AI:');

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'Message with image attachment',
              experimental_attachments: [
                {
                  name: 'test.png',
                  contentType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            },
          ],
        });
      },
    ),
  );
});

describe('reload', () => {
  const TestComponent = () => {
    const { messages, append, reload } = useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
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
    render(<TestComponent />);
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

describe('test sending additional fields during message submission', () => {
  const TestComponent = () => {
    const { messages, append } = useChat();

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.content}
          </div>
        ))}

        <button
          data-testid="do-append"
          onClick={() => {
            append({
              role: 'user',
              content: 'hi',
              annotations: ['this is an annotation'],
            });
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

  it(
    'annotations',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"first response"\n'],
        },
      ],
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          messages: [
            {
              role: 'user',
              content: 'hi',
              annotations: ['this is an annotation'],
            },
          ],
        });
      },
    ),
  );
});
