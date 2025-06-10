/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
import {
  createTestServer,
  mockId,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DefaultChatTransport,
  getToolInvocations,
  TextStreamChatTransport,
  UIMessage,
  UIMessageStreamPart,
} from 'ai';
import React, { act, useEffect, useRef, useState } from 'react';
import { setupTestComponent } from './setup-test-component';
import { useChat } from './use-chat';

function formatStreamPart(part: UIMessageStreamPart) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/chat': {},
});

describe('data protocol stream', () => {
  let onFinishCalls: Array<{ message: UIMessage }> = [];

  setupTestComponent(
    ({ id: idParam }: { id: string }) => {
      const [id, setId] = React.useState<string>(idParam);
      const {
        messages,
        sendMessage,
        error,
        status,
        id: idKey,
      } = useChat({
        id,
        onFinish: options => {
          onFinishCalls.push(options);
        },
        generateId: mockId(),
      });

      return (
        <div>
          <div data-testid="id">{idKey}</div>
          <div data-testid="status">{status.toString()}</div>
          {error && <div data-testid="error">{error.toString()}</div>}
          <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>
          <button
            data-testid="do-send"
            onClick={() => {
              sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
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
    },
    {
      // use a random id to avoid conflicts:
      init: TestComponent => <TestComponent id={`first-${mockId()()}`} />,
    },
  );

  beforeEach(() => {
    onFinishCalls = [];
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'text', text: 'Hello' }),
        formatStreamPart({ type: 'text', text: ',' }),
        formatStreamPart({ type: 'text', text: ' world' }),
        formatStreamPart({ type: 'text', text: '.' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          parts: [
            {
              text: 'hi',
              type: 'text',
            },
          ],
          id: 'id-0',
        },
        {
          id: 'id-1',
          role: 'assistant',
          metadata: {},
          parts: [
            {
              type: 'text',
              text: 'Hello, world.',
            },
          ],
        },
      ]);
    });
  });

  it('should show user message immediately', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          parts: [
            {
              text: 'hi',
              type: 'text',
            },
          ],
          id: 'id-0',
        },
      ]);
    });
  });

  it('should show error response when there is a server error', async () => {
    server.urls['/api/chat'].response = {
      type: 'error',
      status: 404,
      body: 'Not found',
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });

  it('should show error response when there is a streaming error', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'error', errorText: 'custom error message' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

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

      await userEvent.click(screen.getByTestId('do-send'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('submitted');
      });

      controller.write(formatStreamPart({ type: 'text', text: 'Hello' }));

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

      await userEvent.click(screen.getByTestId('do-send'));

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

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(formatStreamPart({ type: 'text', text: 'Hello' }));
    controller.write(formatStreamPart({ type: 'text', text: ',' }));
    controller.write(formatStreamPart({ type: 'text', text: ' world' }));
    controller.write(formatStreamPart({ type: 'text', text: '.' }));
    controller.write(
      formatStreamPart({
        type: 'finish',
        metadata: {
          example: 'metadata',
        },
      }),
    );

    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          parts: [
            {
              text: 'hi',
              type: 'text',
            },
          ],
          id: 'id-0',
        },
        {
          id: 'id-1',
          role: 'assistant',
          metadata: {
            example: 'metadata',
          },
          parts: [
            {
              type: 'text',
              text: 'Hello, world.',
            },
          ],
        },
      ]);
    });

    expect(onFinishCalls).toMatchInlineSnapshot(`
      [
        {
          "message": {
            "id": "id-1",
            "metadata": {
              "example": "metadata",
            },
            "parts": [
              {
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        },
      ]
    `);
  });

  describe('id', () => {
    it('send the id to the server', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text', text: 'Hello' }),
          formatStreamPart({ type: 'text', text: ',' }),
          formatStreamPart({ type: 'text', text: ' world' }),
          formatStreamPart({ type: 'text', text: '.' }),
        ],
      };

      await userEvent.click(screen.getByTestId('do-send'));

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "first-id-0",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "hi",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
        }
      `);
    });

    it('should clear out messages when the id changes', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text', text: 'Hello' }),
          formatStreamPart({ type: 'text', text: ',' }),
          formatStreamPart({ type: 'text', text: ' world' }),
          formatStreamPart({ type: 'text', text: '.' }),
        ],
      };

      await userEvent.click(screen.getByTestId('do-send'));

      await waitFor(() => {
        expect(
          JSON.parse(screen.getByTestId('messages').textContent ?? ''),
        ).toStrictEqual([
          {
            id: expect.any(String),
            parts: [
              {
                text: 'hi',
                type: 'text',
              },
            ],
            role: 'user',
          },
          {
            id: 'id-1',
            metadata: {},
            parts: [
              {
                text: 'Hello, world.',
                type: 'text',
              },
            ],
            role: 'assistant',
          },
        ]);
      });
      await userEvent.click(screen.getByTestId('do-change-id'));

      expect(screen.queryByTestId('message-0')).not.toBeInTheDocument();
    });
  });
});

describe('text stream', () => {
  let onFinishCalls: Array<{ message: UIMessage }> = [];

  setupTestComponent(() => {
    const { messages, sendMessage } = useChat({
      onFinish: options => {
        onFinishCalls.push(options);
      },
      generateId: mockId(),
      transport: new TextStreamChatTransport({
        api: '/api/chat',
      }),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}-text-stream`} key={m.id}>
            <div data-testid={`message-${idx}-id`}>{m.id}</div>
            <div data-testid={`message-${idx}-role`}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
            </div>
            <div data-testid={`message-${idx}-content`}>
              {m.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({
              role: 'user',
              parts: [{ text: 'hi', type: 'text' }],
            });
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

    await userEvent.click(screen.getByTestId('do-send'));

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

    await userEvent.click(screen.getByTestId('do-send'));

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

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-1-text-stream');

    expect(onFinishCalls).toMatchInlineSnapshot(`
      [
        {
          "message": {
            "id": "id-2",
            "metadata": {},
            "parts": [
              {
                "type": "step-start",
              },
              {
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        },
      ]
    `);
  });
});

describe('prepareChatRequest', () => {
  let options: any;

  setupTestComponent(() => {
    const { messages, sendMessage, status } = useChat({
      transport: new DefaultChatTransport({
        body: { 'body-key': 'body-value' },
        headers: { 'header-key': 'header-value' },
        prepareRequest(optionsArg) {
          options = optionsArg;
          return {
            body: { 'request-body-key': 'request-body-value' },
            headers: { 'header-key': 'header-value' },
          };
        },
      }),
      generateId: mockId(),
    });

    return (
      <div>
        <div data-testid="status">{status.toString()}</div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage(
              {
                parts: [{ text: 'hi', type: 'text' }],
              },
              {
                body: { 'request-body-key': 'request-body-value' },
                headers: { 'request-header-key': 'request-header-value' },
                metadata: { 'request-metadata-key': 'request-metadata-value' },
              },
            );
          }}
        />
      </div>
    );
  });

  afterEach(() => {
    options = undefined;
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'text', text: 'Hello' }),
        formatStreamPart({ type: 'text', text: ',' }),
        formatStreamPart({ type: 'text', text: ' world' }),
        formatStreamPart({ type: 'text', text: '.' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(options).toMatchInlineSnapshot(`
      {
        "body": {
          "body-key": "body-value",
          "request-body-key": "request-body-value",
        },
        "credentials": undefined,
        "headers": {
          "header-key": "header-value",
          "request-header-key": "request-header-value",
        },
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "text": "hi",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        "requestMetadata": {
          "request-metadata-key": "request-metadata-value",
        },
      }
    `);

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "request-body-key": "request-body-value",
      }
    `);
    expect(server.calls[0].requestHeaders).toMatchInlineSnapshot(`
      {
        "content-type": "application/json",
        "header-key": "header-value",
      }
    `);

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
    const { messages, sendMessage } = useChat({
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
            {getToolInvocations(m).map((toolInvocation, toolIdx) => (
              <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                {JSON.stringify(toolInvocation)}
              </div>
            ))}
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({
              parts: [{ text: 'hi', type: 'text' }],
            });
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
        formatStreamPart({
          type: 'tool-call',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-1');
    expect(
      JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
    ).toStrictEqual({
      state: 'call',
      args: { testArg: 'test-value' },
      toolCallId: 'tool-call-0',
      toolName: 'test-tool',
    });

    resolve();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result:
          'test-tool-response: test-tool tool-call-0 {"testArg":"test-value"}',
      });
    });
  });
});

describe('tool invocations', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, addToolResult } = useChat({
      maxSteps: 5,
      generateId: mockId(),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {getToolInvocations(m).map((toolInvocation, toolIdx) => {
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
            {m.role === 'assistant' && (
              <div data-testid={`message-${idx}-text`}>
                {m.parts
                  .map(part => (part.type === 'text' ? part.text : ''))
                  .join('')}
              </div>
            )}
          </div>
        ))}

        <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({
              parts: [{ text: 'hi', type: 'text' }],
            });
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

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(
      formatStreamPart({
        type: 'tool-call-streaming-start',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'partial-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-call-delta',
        toolCallId: 'tool-call-0',
        argsTextDelta: '{"testArg":"t',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'partial-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 't' },
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-call-delta',
        toolCallId: 'tool-call-0',
        argsTextDelta: 'est-value"}}',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'partial-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'call',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-result',
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result: 'test-result',
      });
    });
  });

  it('should display tool call and tool result (when there is no tool call streaming)', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(
      formatStreamPart({
        type: 'tool-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'call',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-result',
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result: 'test-result',
      });
    });
  });

  it('should update tool call to result when addToolResult is called', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(formatStreamPart({ type: 'start' }));
    controller.write(formatStreamPart({ type: 'start-step' }));
    controller.write(
      formatStreamPart({
        type: 'tool-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'call',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    await userEvent.click(screen.getByTestId('add-result-0'));

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result: 'test-result',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'text',
        text: 'more text',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-1',
          parts: [
            {
              text: 'hi',
              type: 'text',
            },
          ],
          role: 'user',
        },
        {
          id: 'id-2',
          metadata: {},
          parts: [
            {
              type: 'step-start',
            },
            {
              toolInvocation: {
                args: {
                  testArg: 'test-value',
                },
                result: 'test-result',
                state: 'result',
                toolCallId: 'tool-call-0',
                toolName: 'test-tool',
              },
              type: 'tool-invocation',
            },
            {
              text: 'more text',
              type: 'text',
            },
          ],
          role: 'assistant',
        },
      ]);
    });
  });

  it('should delay tool result submission until the stream is finished', async () => {
    const controller1 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
    ];

    await userEvent.click(screen.getByTestId('do-send'));

    // start stream
    controller1.write(formatStreamPart({ type: 'start' }));
    controller1.write(formatStreamPart({ type: 'start-step' }));

    // tool call
    controller1.write(
      formatStreamPart({
        type: 'tool-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'call',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    // user submits the tool result
    await userEvent.click(screen.getByTestId('add-result-0'));

    // UI should show the tool result
    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result: 'test-result',
      });
    });

    // should not have called the API yet
    expect(server.calls.length).toBe(1);

    // finish stream
    controller1.write(formatStreamPart({ type: 'finish-step' }));
    controller1.write(formatStreamPart({ type: 'finish' }));

    await controller1.close();

    // 2nd call should happen after the stream is finished
    await waitFor(() => {
      expect(server.calls.length).toBe(2);
    });
  });

  it('should trigger request when all tool calls are completed', async () => {
    const controller1 = new TestResponseController();
    const controller2 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
      { type: 'controlled-stream', controller: controller2 },
    ];

    await userEvent.click(screen.getByTestId('do-send'));

    // start stream
    controller1.write(formatStreamPart({ type: 'start' }));
    controller1.write(formatStreamPart({ type: 'start-step' }));

    // tool call
    controller1.write(
      formatStreamPart({
        type: 'tool-call',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    // finish stream
    controller1.write(formatStreamPart({ type: 'finish-step' }));
    controller1.write(formatStreamPart({ type: 'finish' }));
    await controller1.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'call',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      });
    });

    // user submits the tool result
    await userEvent.click(screen.getByTestId('add-result-0'));

    // UI should show the tool result
    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'result',
        args: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        result: 'test-result',
      });
    });

    // should trigger second request w/ tool result
    expect(server.calls.length).toBe(2);

    controller2.write(formatStreamPart({ type: 'start' }));
    controller2.write(formatStreamPart({ type: 'start-step' }));

    controller2.write(formatStreamPart({ type: 'text', text: 'final result' }));

    controller2.write(formatStreamPart({ type: 'finish-step' }));
    controller2.write(formatStreamPart({ type: 'finish' }));

    await controller2.close();

    // chunks from second request should show up in UI
    await waitFor(() => {
      expect(screen.getByTestId('message-1-text')).toHaveTextContent(
        'final result',
      );
    });
  });
});

describe('maxSteps', () => {
  describe('two steps with automatic tool call', () => {
    let onToolCallInvoked = false;

    setupTestComponent(() => {
      const { messages, sendMessage } = useChat({
        async onToolCall({ toolCall }) {
          onToolCallInvoked = true;

          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        generateId: mockId(),
        maxSteps: 5,
      });

      return (
        <div>
          {messages.map((m, idx) => (
            <div data-testid={`message-${idx}`} key={m.id}>
              {m.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          ))}

          <button
            data-testid="do-send"
            onClick={() => {
              sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
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
            formatStreamPart({
              type: 'tool-call',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [formatStreamPart({ type: 'text', text: 'final result' })],
        },
      ];

      await userEvent.click(screen.getByTestId('do-send'));

      expect(onToolCallInvoked).toBe(true);

      await screen.findByTestId('message-1');
      expect(screen.getByTestId('message-1')).toHaveTextContent('final result');
    });
  });

  describe('two steps with error response', () => {
    let onToolCallCounter = 0;

    setupTestComponent(() => {
      const { messages, sendMessage, error } = useChat({
        async onToolCall({ toolCall }) {
          onToolCallCounter++;
          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        generateId: mockId(),
        maxSteps: 5,
      });

      return (
        <div>
          {error && <div data-testid="error">{error.toString()}</div>}

          {messages.map((m, idx) => (
            <div data-testid={`message-${idx}`} key={m.id}>
              {getToolInvocations(m).map((toolInvocation, toolIdx) =>
                'result' in toolInvocation ? (
                  <div key={toolIdx} data-testid={`tool-invocation-${toolIdx}`}>
                    {toolInvocation.result}
                  </div>
                ) : null,
              )}
            </div>
          ))}

          <button
            data-testid="do-send"
            onClick={() => {
              sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
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
            formatStreamPart({
              type: 'tool-call',
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

      await userEvent.click(screen.getByTestId('do-send'));

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(
          'Error: call failure',
        );
      });

      expect(onToolCallCounter).toBe(1);
    });
  });
});

describe('file attachments with data url', () => {
  setupTestComponent(() => {
    const { messages, status, sendMessage } = useChat({
      generateId: mockId(),
    });

    const [files, setFiles] = useState<FileList | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState('');

    return (
      <div>
        <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>

        <form
          onSubmit={() => {
            sendMessage({ text: input, files });
            setFiles(undefined);
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
                setFiles(event.target.files);
              }
            }}
            multiple
            ref={fileInputRef}
            data-testid="file-input"
          />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
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
      chunks: [
        formatStreamPart({
          type: 'text',
          text: 'Response to message with text attachment',
        }),
      ],
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

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-1',
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'text/plain',
              filename: 'test.txt',
              url: 'data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=',
            },
            {
              type: 'text',
              text: 'Message with text attachment',
            },
          ],
        },
        {
          id: 'id-2',
          metadata: {},
          parts: [
            {
              text: 'Response to message with text attachment',
              type: 'text',
            },
          ],
          role: 'assistant',
        },
      ]);
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "filename": "test.txt",
                "mediaType": "text/plain",
                "type": "file",
                "url": "data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=",
              },
              {
                "text": "Message with text attachment",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text',
          text: 'Response to message with image attachment',
        }),
      ],
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

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          id: 'id-1',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              filename: 'test.png',
              url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
            },
            {
              type: 'text',
              text: 'Message with image attachment',
            },
          ],
        },
        {
          role: 'assistant',
          id: 'id-2',
          metadata: {},
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
            },
          ],
        },
      ]);
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "filename": "test.png",
                "mediaType": "image/png",
                "type": "file",
                "url": "data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50",
              },
              {
                "text": "Message with image attachment",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });
});

describe('file attachments with url', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, status } = useChat({
      generateId: mockId(),
    });

    const [input, setInput] = useState('');

    return (
      <div>
        <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>

        <form
          onSubmit={() => {
            sendMessage({
              text: input,
              files: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            });
          }}
          data-testid="chat-form"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
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
      chunks: [
        formatStreamPart({
          type: 'text',
          text: 'Response to message with image attachment',
        }),
      ],
    };

    const messageInput = screen.getByTestId('message-input');
    await userEvent.type(messageInput, 'Message with image attachment');

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          id: 'id-1',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              url: 'https://example.com/image.png',
            },
            {
              type: 'text',
              text: 'Message with image attachment',
            },
          ],
        },
        {
          role: 'assistant',
          id: 'id-2',
          metadata: {},
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
            },
          ],
        },
      ]);
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "mediaType": "image/png",
                "type": "file",
                "url": "https://example.com/image.png",
              },
              {
                "text": "Message with image attachment",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });
});

describe('attachments with empty submit', () => {
  setupTestComponent(() => {
    const { messages, sendMessage } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>

        <form
          onSubmit={() => {
            sendMessage({
              files: [
                {
                  type: 'file',
                  filename: 'test.png',
                  mediaType: 'image/png',
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
      chunks: [
        formatStreamPart({
          type: 'text',
          text: 'Response to message with image attachment',
        }),
      ],
    };

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-1',
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              filename: 'test.png',
              url: 'https://example.com/image.png',
            },
          ],
        },
        {
          id: 'id-2',
          role: 'assistant',
          metadata: {},
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
            },
          ],
        },
      ]);
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "filename": "test.png",
                "mediaType": "image/png",
                "type": "file",
                "url": "https://example.com/image.png",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });
});

describe('should send message with attachments', () => {
  setupTestComponent(() => {
    const { messages, sendMessage } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>

        <form
          onSubmit={event => {
            event.preventDefault();

            sendMessage({
              parts: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  url: 'https://example.com/image.png',
                },
                {
                  type: 'text',
                  text: 'Message with image attachment',
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
      chunks: [
        formatStreamPart({
          type: 'text',
          text: 'Response to message with image attachment',
        }),
      ],
    };

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-1',
          parts: [
            {
              mediaType: 'image/png',
              type: 'file',
              url: 'https://example.com/image.png',
            },
            {
              text: 'Message with image attachment',
              type: 'text',
            },
          ],
          role: 'user',
        },
        {
          id: 'id-2',
          metadata: {},
          parts: [
            {
              text: 'Response to message with image attachment',
              type: 'text',
            },
          ],
          role: 'assistant',
        },
      ]);
    });

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "mediaType": "image/png",
                "type": "file",
                "url": "https://example.com/image.png",
              },
              {
                "text": "Message with image attachment",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });
});

describe('reload', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, reload } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
          }}
        />

        <button
          data-testid="do-reload"
          onClick={() => {
            reload({
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
        chunks: [formatStreamPart({ type: 'text', text: 'first response' })],
      },
      {
        type: 'stream-chunks',
        chunks: [formatStreamPart({ type: 'text', text: 'second response' })],
      },
    ];

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');

    // setup done, click reload:
    await userEvent.click(screen.getByTestId('do-reload'));

    expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "parts": [
              {
                "text": "hi",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        "request-body-key": "request-body-value",
      }
    `);

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
    const { messages, sendMessage } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({
              role: 'user',
              metadata: { test: 'example' },
              parts: [{ text: 'hi', type: 'text' }],
            });
          }}
        />
      </div>
    );
  });

  it('should send metadata with the message', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [formatStreamPart({ type: 'text', text: 'first response' })],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
      {
        "id": "id-0",
        "messages": [
          {
            "id": "id-1",
            "metadata": {
              "test": "example",
            },
            "parts": [
              {
                "text": "hi",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
      }
    `);
  });
});

describe('resume ongoing stream and return assistant message', () => {
  const controller = new TestResponseController();

  setupTestComponent(
    () => {
      const { messages, status, experimental_resume } = useChat({
        id: '123',
        messages: [
          {
            id: 'msg_123',
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
          },
        ],
        generateId: mockId(),
      });

      useEffect(() => {
        experimental_resume();

        // We want to disable the exhaustive deps rule here because we only want to run this effect once
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return (
        <div>
          {messages.map((m, idx) => (
            <div data-testid={`message-${idx}`} key={m.id}>
              {m.role === 'user' ? 'User: ' : 'AI: '}
              {m.parts
                .map(part => (part.type === 'text' ? part.text : ''))
                .join('')}
            </div>
          ))}

          <div data-testid="status">{status}</div>
        </div>
      );
    },
    {
      init: TestComponent => {
        server.urls['/api/chat'].response = {
          type: 'controlled-stream',
          controller,
        };

        return <TestComponent />;
      },
    },
  );

  it('construct messages from resumed stream', async () => {
    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('submitted');
    });

    controller.write(formatStreamPart({ type: 'text', text: 'Hello' }));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('streaming');
    });

    controller.write(formatStreamPart({ type: 'text', text: ',' }));
    controller.write(formatStreamPart({ type: 'text', text: ' world' }));
    controller.write(formatStreamPart({ type: 'text', text: '.' }));

    controller.close();

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');

      expect(server.calls.length).toBeGreaterThan(0);
      const mostRecentCall = server.calls[0];

      const { requestMethod, requestUrl } = mostRecentCall;
      expect(requestMethod).toBe('GET');
      expect(requestUrl).toBe('http://localhost:3000/api/chat?id=123');
    });
  });
});

describe('stop', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, stop, status } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </div>
        ))}

        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({
              role: 'user',
              parts: [{ text: 'hi', type: 'text' }],
            });
          }}
        />

        <button data-testid="do-stop" onClick={stop} />

        <p data-testid="status">{status}</p>
      </div>
    );
  });

  it('should show stop response', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(formatStreamPart({ type: 'text', text: 'Hello' }));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
      expect(screen.getByTestId('status')).toHaveTextContent('streaming');
    });

    await userEvent.click(screen.getByTestId('do-stop'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });

    await expect(
      controller.write(formatStreamPart({ type: 'text', text: ', world!' })),
    ).rejects.toThrow();

    await expect(controller.close()).rejects.toThrow();

    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
  });
});

describe('experimental_throttle', () => {
  const throttleMs = 50;

  setupTestComponent(() => {
    const { messages, sendMessage, status } = useChat({
      experimental_throttle: throttleMs,
      generateId: mockId(),
    });

    return (
      <div>
        <div data-testid="status">{status.toString()}</div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.role === 'user' ? 'User: ' : 'AI: '}
            {m.parts
              .map(part => (part.type === 'text' ? part.text : ''))
              .join('')}
          </div>
        ))}
        <button
          data-testid="do-send"
          onClick={() => {
            sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
          }}
        />
      </div>
    );
  });

  it('should throttle UI updates when experimental_throttle is set', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    vi.useFakeTimers();

    controller.write(formatStreamPart({ type: 'text', text: 'Hel' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(throttleMs + 10);
    });

    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hel');

    controller.write(formatStreamPart({ type: 'text', text: 'lo' }));
    controller.write(formatStreamPart({ type: 'text', text: ' Th' }));
    controller.write(formatStreamPart({ type: 'text', text: 'ere' }));

    expect(screen.getByTestId('message-1')).not.toHaveTextContent(
      'AI: Hello There',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(throttleMs + 10);
    });

    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello There',
    );

    vi.useRealTimers();
  });
});
