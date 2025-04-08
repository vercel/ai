/* eslint-disable @next/next/no-img-element */
import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import {
  formatDataStreamPart,
  generateId,
  getTextFromDataUrl,
  Message,
} from '@ai-sdk/ui-utils';
import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect, useRef, useState } from 'react';
import { setupTestComponent } from './setup-test-component';
import { useChat } from './use-chat';

const server = createTestServer({
  '/api/chat': {},
});

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

  setupTestComponent(
    ({ id: idParam }: { id: string }) => {
      const [id, setId] = React.useState<string>(idParam);
      const {
        messages,
        append,
        error,
        data,
        status,
        setData,
        id: idKey,
      } = useChat({
        id,
        onFinish: (message, options) => {
          onFinishCalls.push({ message, options });
        },
      });

      return (
        <div>
          <div data-testid="id">{idKey}</div>
          <div data-testid="status">{status.toString()}</div>
          {error && <div data-testid="error">{error.toString()}</div>}
          <div data-testid="data">
            {data != null ? JSON.stringify(data) : ''}
          </div>
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
    },
    {
      // use a random id to avoid conflicts:
      init: TestComponent => <TestComponent id={`first-id-${generateId()}`} />,
    },
  );

  beforeEach(() => {
    onFinishCalls = [];
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should set stream data', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('data');
    expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
  });

  describe('setData', () => {
    it('should set data', async () => {
      await userEvent.click(screen.getByTestId('do-set-data'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"set"}]');
    });

    it('should clear data', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

      await userEvent.click(screen.getByTestId('do-clear-data'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('');
    });
  });

  it('should show error response when there is a server error', async () => {
    server.urls['/api/chat'].response = {
      type: 'error',
      status: 404,
      body: 'Not found',
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });

  it('should show error response when there is a streaming error', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['3:"custom error message"\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Error: custom error message',
    );
  });

  describe('status', () => {
    it('should show status', async () => {
      const controller = new TestResponseController();

      server.urls['/api/chat'].response = {
        type: 'controlled-stream',
        controller,
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('submitted');
      });

      controller.write('0:"Hello"\n');

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('streaming');
      });

      controller.close();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
    });

    it('should set status to error when there is a server error', async () => {
      server.urls['/api/chat'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('error');
      });
    });
  });

  it('should invoke onFinish when the stream finishes', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(formatDataStreamPart('text', 'Hello'));
    controller.write(formatDataStreamPart('text', ','));
    controller.write(formatDataStreamPart('text', ' world'));
    controller.write(formatDataStreamPart('text', '.'));
    controller.write(
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { completionTokens: 1, promptTokens: 3 },
      }),
    );

    controller.close();

    await screen.findByTestId('message-1');

    expect(onFinishCalls).toStrictEqual([
      {
        message: {
          id: expect.any(String),
          createdAt: expect.any(Date),
          role: 'assistant',
          content: 'Hello, world.',
          parts: [{ text: 'Hello, world.', type: 'text' }],
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
  });

  describe('id', () => {
    it('send the id to the server', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      };

      await userEvent.click(screen.getByTestId('do-append'));

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        id: screen.getByTestId('id').textContent,
        messages: [
          {
            role: 'user',
            content: 'hi',
            parts: [{ text: 'hi', type: 'text' }],
          },
        ],
      });
    });

    it('should clear out messages when the id changes', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      };

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

  setupTestComponent(() => {
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
  });

  beforeEach(() => {
    onFinishCalls = [];
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.click(screen.getByTestId('do-append-text-stream'));

    await screen.findByTestId('message-0-content');
    expect(screen.getByTestId('message-0-content')).toHaveTextContent('hi');

    await screen.findByTestId('message-1-content');
    expect(screen.getByTestId('message-1-content')).toHaveTextContent(
      'Hello, world.',
    );
  });

  it('should have stable message ids', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-append-text-stream'));

    controller.write('He');

    await screen.findByTestId('message-1-content');
    expect(screen.getByTestId('message-1-content')).toHaveTextContent('He');

    const id = screen.getByTestId('message-1-id').textContent;

    controller.write('llo');
    controller.close();

    await screen.findByTestId('message-1-content');
    expect(screen.getByTestId('message-1-content')).toHaveTextContent('Hello');
    expect(screen.getByTestId('message-1-id').textContent).toBe(id);
  });

  it('should invoke onFinish when the stream finishes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.click(screen.getByTestId('do-append-text-stream'));

    await screen.findByTestId('message-1-text-stream');

    expect(onFinishCalls).toStrictEqual([
      {
        message: {
          id: expect.any(String),
          createdAt: expect.any(Date),
          role: 'assistant',
          content: 'Hello, world.',
          parts: [{ text: 'Hello, world.', type: 'text' }],
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
  });
});

describe('form actions', () => {
  setupTestComponent(() => {
    const { messages, handleSubmit, handleInputChange, status, input } =
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
            disabled={status !== 'ready'}
            data-testid="do-input"
          />
        </form>
      </div>
    );
  });

  it('should show streamed response using handleSubmit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'],
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'],
      },
    ];

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
  });
});

describe('form actions (with options)', () => {
  setupTestComponent(() => {
    const { messages, handleSubmit, handleInputChange, status, input } =
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
            disabled={status !== 'ready'}
            data-testid="do-input"
          />
        </form>
      </div>
    );
  });

  it('allowEmptySubmit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'],
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'],
      },
      {
        type: 'stream-chunks',
        chunks: ['The', ' sky', ' is', ' blue', '.'],
      },
    ];

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

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent('User:');

    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'AI: How can I help you?',
    );

    const thirdInput = screen.getByTestId('do-input');
    await userEvent.type(thirdInput, 'what color is the sky?');
    await userEvent.type(thirdInput, '{Enter}');

    expect(screen.getByTestId('message-4')).toHaveTextContent(
      'User: what color is the sky?',
    );

    await screen.findByTestId('message-5');
    expect(screen.getByTestId('message-5')).toHaveTextContent(
      'AI: The sky is blue.',
    );
  });
});

describe('prepareRequestBody', () => {
  let bodyOptions: any;

  setupTestComponent(() => {
    const { messages, append, status } = useChat({
      experimental_prepareRequestBody(options) {
        bodyOptions = options;
        return 'test-request-body';
      },
    });

    return (
      <div>
        <div data-testid="status">{status.toString()}</div>
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
  });

  afterEach(() => {
    bodyOptions = undefined;
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(bodyOptions).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'hi',
          id: expect.any(String),
          experimental_attachments: undefined,
          createdAt: expect.any(Date),
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
      requestData: { 'test-data-key': 'test-data-value' },
      requestBody: { 'request-body-key': 'request-body-value' },
    });

    expect(await server.calls[0].requestBodyJson).toBe('test-request-body');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });
});

describe('onToolCall', () => {
  let resolve: () => void;
  let toolCallPromise: Promise<void>;

  setupTestComponent(() => {
    const { messages, append } = useChat({
      async onToolCall({ toolCall }) {
        await toolCallPromise;
        return `test-tool-response: ${toolCall.toolName} ${
          toolCall.toolCallId
        } ${JSON.stringify(toolCall.args)}`;
      },
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.toolInvocations?.map((toolInvocation, toolIdx) => (
              <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                {JSON.stringify(toolInvocation)}
              </div>
            ))}
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
  });

  beforeEach(() => {
    toolCallPromise = new Promise(resolveArg => {
      resolve = resolveArg;
    });
  });

  it("should invoke onToolCall when a tool call is received from the server's response", async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      `{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}`,
    );

    resolve();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        `{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-tool-response: test-tool tool-call-0 {\\"testArg\\":\\"test-value\\"}"}`,
      );
    });
  });
});

describe('tool invocations', () => {
  setupTestComponent(() => {
    const { messages, append, addToolResult } = useChat({
      maxSteps: 5,
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.toolInvocations?.map((toolInvocation, toolIdx) => {
              return (
                <div key={toolIdx}>
                  <div data-testid={`tool-invocation-${toolIdx}`}>
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
                </div>
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
  });

  it('should display partial tool call, tool call, and tool result', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool"}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: '{"testArg":"t',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"t"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: 'est-value"}}',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });
  });

  it('should display tool call and tool result (when there is no tool call streaming)', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });
  });

  it('should update tool call to result when addToolResult is called', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    await userEvent.click(screen.getByTestId('add-result-0'));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });
  });

  it('should delay tool result submission until the stream is finished', async () => {
    const controller1 = new TestResponseController();
    const controller2 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
      { type: 'controlled-stream', controller: controller2 },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    // start stream
    controller1.write(
      formatDataStreamPart('start_step', {
        messageId: '1234',
      }),
    );

    // tool call
    controller1.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    // user submits the tool result
    await userEvent.click(screen.getByTestId('add-result-0'));

    // UI should show the tool result
    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });

    // should not have called the API yet
    expect(server.calls.length).toBe(1);

    // finish stream
    controller1.write(
      formatDataStreamPart('finish_step', {
        isContinued: false,
        finishReason: 'tool-calls',
      }),
    );
    controller1.write(
      formatDataStreamPart('finish_message', {
        finishReason: 'tool-calls',
      }),
    );

    await controller1.close();

    // 2nd call should happen after the stream is finished
    await waitFor(() => {
      expect(server.calls.length).toBe(2);
    });
  });
});

describe('maxSteps', () => {
  describe('two steps with automatic tool call', () => {
    let onToolCallInvoked = false;

    setupTestComponent(() => {
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
    });

    beforeEach(() => {
      onToolCallInvoked = false;
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      server.urls['/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [formatDataStreamPart('text', 'final result')],
        },
      ];

      await userEvent.click(screen.getByTestId('do-append'));

      expect(onToolCallInvoked).toBe(true);

      await screen.findByTestId('message-1');
      expect(screen.getByTestId('message-1')).toHaveTextContent('final result');
    });
  });

  describe('two steps with error response', () => {
    let onToolCallCounter = 0;

    setupTestComponent(() => {
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
    });

    beforeEach(() => {
      onToolCallCounter = 0;
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      server.urls['/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
        {
          type: 'error',
          status: 400,
          body: 'call failure',
        },
      ];

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('error');
      expect(screen.getByTestId('error')).toHaveTextContent(
        'Error: call failure',
      );

      expect(onToolCallCounter).toBe(1);
    });
  });
});

describe('file attachments with data url', () => {
  setupTestComponent(() => {
    const { messages, handleSubmit, handleInputChange, status, input } =
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
            disabled={status !== 'ready'}
            data-testid="message-input"
          />
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
      </div>
    );
  });

  it('should handle text file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with text attachment"\n'],
    };

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
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
          parts: [{ text: 'Message with text attachment', type: 'text' }],
        },
      ],
    });
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
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
          parts: [{ text: 'Message with image attachment', type: 'text' }],
        },
      ],
    });
  });
});

describe('file attachments with url', () => {
  setupTestComponent(() => {
    const { messages, handleSubmit, handleInputChange, status, input } =
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
            disabled={status !== 'ready'}
            data-testid="message-input"
          />
          <button type="submit" data-testid="submit-button">
            Send
          </button>
        </form>
      </div>
    );
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
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
          parts: [{ text: 'Message with image attachment', type: 'text' }],
        },
      ],
    });
  });
});

describe('attachments with empty submit', () => {
  setupTestComponent(() => {
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
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
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
          parts: [{ text: '', type: 'text' }],
        },
      ],
    });
  });
});

describe('should append message with attachments', () => {
  setupTestComponent(() => {
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
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

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

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
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
          parts: [{ text: 'Message with image attachment', type: 'text' }],
        },
      ],
    });
  });
});

describe('reload', () => {
  setupTestComponent(() => {
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
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['0:"first response"\n'],
      },
      {
        type: 'stream-chunks',
        chunks: ['0:"second response"\n'],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');

    // setup done, click reload:
    await userEvent.click(screen.getByTestId('do-reload'));

    expect(await server.calls[1].requestBodyJson).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          content: 'hi',
          role: 'user',
          parts: [{ text: 'hi', type: 'text' }],
        },
      ],
      data: { 'test-data-key': 'test-data-value' },
      'request-body-key': 'request-body-value',
    });

    expect(server.calls[1].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'header-key': 'header-value',
    });

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: second response',
    );
  });
});

describe('test sending additional fields during message submission', () => {
  setupTestComponent(() => {
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
  });

  it('annotations', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"first response"\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'hi',
          annotations: ['this is an annotation'],
          parts: [{ text: 'hi', type: 'text' }],
        },
      ],
    });
  });
});

describe('initialMessages', () => {
  describe('stability', () => {
    let renderCount = 0;

    setupTestComponent(() => {
      renderCount++;
      const [derivedState, setDerivedState] = useState<string[]>([]);

      const { messages } = useChat({
        initialMessages: [
          {
            id: 'test-msg-1',
            content: 'Test message',
            role: 'user',
          },
          {
            id: 'test-msg-2',
            content: 'Test response',
            role: 'assistant',
          },
        ],
      });

      useEffect(() => {
        setDerivedState(messages.map(m => m.content));
      }, [messages]);

      if (renderCount > 10) {
        throw new Error('Excessive renders detected; likely an infinite loop!');
      }

      return (
        <div>
          <div data-testid="render-count">{renderCount}</div>
          <div data-testid="derived-state">{derivedState.join(', ')}</div>
          {messages.map(m => (
            <div key={m.id} data-testid={`message-${m.role}`}>
              {m.content}
            </div>
          ))}
        </div>
      );
    });

    beforeEach(() => {
      renderCount = 0;
    });

    it('should not cause infinite rerenders when initialMessages is defined and messages is a dependency of useEffect', async () => {
      // wait for initial render to complete
      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toHaveTextContent(
          'Test message',
        );
      });

      // confirm useEffect ran
      await waitFor(() => {
        expect(screen.getByTestId('derived-state')).toHaveTextContent(
          'Test message, Test response',
        );
      });

      const renderCount = parseInt(
        screen.getByTestId('render-count').textContent!,
      );

      expect(renderCount).toBe(2);
    });
  });

  describe('changing initial messages', () => {
    setupTestComponent(() => {
      const [initialMessages, setInitialMessages] = useState<Message[]>([
        {
          id: 'test-msg-1',
          content: 'Test message 1',
          role: 'user',
        },
      ]);

      const { messages } = useChat({
        initialMessages,
      });

      return (
        <div>
          <div data-testid="messages">
            {messages.map(m => m.content).join(', ')}
          </div>

          <button
            data-testid="do-update-initial-messages"
            onClick={() => {
              setInitialMessages([
                {
                  id: 'test-msg-2',
                  content: 'Test message 2',
                  role: 'user',
                },
              ]);
            }}
          />
        </div>
      );
    });

    it('should update messages when initialMessages changes', async () => {
      await waitFor(() => {
        expect(screen.getByTestId('messages')).toHaveTextContent(
          'Test message 1',
        );
      });

      await userEvent.click(screen.getByTestId('do-update-initial-messages'));

      await waitFor(() => {
        expect(screen.getByTestId('messages')).toHaveTextContent(
          'Test message 2',
        );
      });
    });
  });
});
