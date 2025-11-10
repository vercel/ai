/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @next/next/no-img-element */
import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { mockId } from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DefaultChatTransport,
  FinishReason,
  isToolUIPart,
  TextStreamChatTransport,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import React, { act, useRef, useState } from 'react';
import { Chat } from './chat.react';
import { setupTestComponent } from './setup-test-component';
import { useChat } from './use-chat';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/chat': {},
  '/api/chat/123/stream': {},
});

describe('initial messages', () => {
  setupTestComponent(
    ({ id: idParam }: { id: string }) => {
      const [id, setId] = React.useState<string>(idParam);
      const {
        messages,
        status,
        id: idKey,
      } = useChat({
        id,
        messages: [
          {
            id: 'id-0',
            role: 'user',
            parts: [{ text: 'hi', type: 'text' }],
          },
        ],
      });

      return (
        <div>
          <div data-testid="id">{idKey}</div>
          <div data-testid="status">{status.toString()}</div>
          <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>
        </div>
      );
    },
    {
      // use a random id to avoid conflicts:
      init: TestComponent => <TestComponent id={`first-${mockId()()}`} />,
    },
  );

  it('should show initial messages', async () => {
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
});

describe('data protocol stream', () => {
  let onFinishCalls: Array<{
    message: UIMessage;
    messages: UIMessage[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: FinishReason;
  }> = [];

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
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
        formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              type: 'text',
              text: 'Hello, world.',
              state: 'done',
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
        formatChunk({ type: 'error', errorText: 'custom error message' }),
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

      controller.write(formatChunk({ type: 'text-start', id: '0' }));
      controller.write(
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
      );
      controller.write(formatChunk({ type: 'text-end', id: '0' }));

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

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
    );
    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: ',' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
    );
    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: '.' }));
    controller.write(formatChunk({ type: 'text-end', id: '0' }));
    controller.write(
      formatChunk({
        type: 'finish',
        finishReason: 'stop',
        messageMetadata: {
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
              state: 'done',
            },
          ],
        },
      ]);
    });

    expect(onFinishCalls).toMatchInlineSnapshot(`
      [
        {
          "finishReason": "stop",
          "isAbort": false,
          "isDisconnect": false,
          "isError": false,
          "message": {
            "id": "id-1",
            "metadata": {
              "example": "metadata",
            },
            "parts": [
              {
                "providerMetadata": undefined,
                "state": "done",
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          "messages": [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "hi",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": {
                "example": "metadata",
              },
              "parts": [
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
        },
      ]
    `);
  });

  describe('id', () => {
    it('send the id to the server', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'text-start', id: '0' }),
          formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
          formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
          formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
          formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
          formatChunk({ type: 'text-end', id: '0' }),
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
          "trigger": "submit-message",
        }
      `);
    });
  });
});

describe('text stream', () => {
  let onFinishCalls: Array<{
    message: UIMessage;
    messages: UIMessage[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: FinishReason;
  }> = [];

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
          "finishReason": undefined,
          "isAbort": false,
          "isDisconnect": false,
          "isError": false,
          "message": {
            "id": "id-2",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "done",
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          "messages": [
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "text": "hi",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-2",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
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
        prepareSendMessagesRequest(optionsArg) {
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
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
        formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
        formatChunk({ type: 'text-end', id: '0' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(options).toMatchInlineSnapshot(`
      {
        "api": "/api/chat",
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
        "messageId": undefined,
        "messages": [
          {
            "id": "id-1",
            "metadata": undefined,
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
        "trigger": "submit-message",
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
    const { messages, sendMessage, addToolOutput } = useChat({
      async onToolCall({ toolCall }) {
        await toolCallPromise;
        addToolOutput({
          tool: 'test-tool',
          toolCallId: toolCall.toolCallId,
          output: `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.input)}`,
        });
      },
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.parts.filter(isToolUIPart).map((toolPart, toolIdx) => (
              <div key={toolIdx} data-testid={`tool-${toolIdx}`}>
                {JSON.stringify(toolPart)}
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
        formatChunk({
          type: 'tool-input-available',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          input: { testArg: 'test-value' },
        }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-1');
    expect(
      JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
    ).toStrictEqual({
      state: 'input-available',
      input: { testArg: 'test-value' },
      toolCallId: 'tool-call-0',
      type: 'tool-test-tool',
    });

    resolve();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'output-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        output:
          'test-tool-response: test-tool tool-call-0 {"testArg":"test-value"}',
      });
    });
  });
});

describe('tool invocations', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, addToolOutput } = useChat({
      generateId: mockId(),
    });

    return (
      <div>
        {messages.map((m, idx) => (
          <div data-testid={`message-${idx}`} key={m.id}>
            {m.parts.filter(isToolUIPart).map((toolPart, toolIdx) => {
              return (
                <div key={toolIdx}>
                  <div data-testid={`tool-invocation-${toolIdx}`}>
                    {JSON.stringify(toolPart)}
                  </div>
                  {toolPart.state === 'input-available' && (
                    <button
                      data-testid={`add-result-${toolIdx}`}
                      onClick={() => {
                        addToolOutput({
                          tool: 'test-tool',
                          toolCallId: toolPart.toolCallId,
                          output: 'test-result',
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
      formatChunk({
        type: 'tool-input-start',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-streaming',
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    controller.write(
      formatChunk({
        type: 'tool-input-delta',
        toolCallId: 'tool-call-0',
        inputTextDelta: '{"testArg":"t',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-streaming',
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        input: { testArg: 't' },
      });
    });

    controller.write(
      formatChunk({
        type: 'tool-input-delta',
        toolCallId: 'tool-call-0',
        inputTextDelta: 'est-value"}}',
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-streaming',
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        input: { testArg: 'test-value' },
      });
    });

    controller.write(
      formatChunk({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    controller.write(
      formatChunk({
        type: 'tool-output-available',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'output-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        output: 'test-result',
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
      formatChunk({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    controller.write(
      formatChunk({
        type: 'tool-output-available',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'output-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        output: 'test-result',
      });
    });
  });

  it('should update tool call to result when addToolOutput is called', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-send'));

    controller.write(formatChunk({ type: 'start' }));
    controller.write(formatChunk({ type: 'start-step' }));
    controller.write(
      formatChunk({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    await userEvent.click(screen.getByTestId('add-result-0'));

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'output-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        output: 'test-result',
      });
    });

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({
        type: 'text-delta',
        id: '0',
        delta: 'more text',
      }),
    );
    controller.write(formatChunk({ type: 'text-end', id: '0' }));
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
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool-test-tool',
              toolCallId: 'tool-call-0',
              input: { testArg: 'test-value' },
              output: 'test-result',
              state: 'output-available',
            },
            {
              text: 'more text',
              type: 'text',
              state: 'done',
            },
          ],
          role: 'assistant',
        },
      ]);
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
        formatChunk({
          type: 'text-start',
          id: '0',
        }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with text attachment',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              text: 'Response to message with text attachment',
              type: 'text',
              state: 'done',
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
        "trigger": "submit-message",
      }
    `);
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({
          type: 'text-start',
          id: '0',
        }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
              state: 'done',
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
        "trigger": "submit-message",
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
        formatChunk({
          type: 'text-start',
          id: '0',
        }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
              state: 'done',
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
        "trigger": "submit-message",
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
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
              state: 'done',
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
        "trigger": "submit-message",
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
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              state: 'done',
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
        "trigger": "submit-message",
      }
    `);
  });
});

describe('regenerate', () => {
  setupTestComponent(() => {
    const { messages, sendMessage, regenerate } = useChat({
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
          data-testid="do-regenerate"
          onClick={() => {
            regenerate({
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
        chunks: [
          formatChunk({ type: 'text-start', id: '0' }),
          formatChunk({
            type: 'text-delta',
            id: '0',
            delta: 'first response',
          }),
          formatChunk({ type: 'text-end', id: '0' }),
        ],
      },
      {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'text-start', id: '0' }),
          formatChunk({
            type: 'text-delta',
            id: '0',
            delta: 'second response',
          }),
          formatChunk({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-send'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');

    // setup done, click reload:
    await userEvent.click(screen.getByTestId('do-regenerate'));

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
        "trigger": "regenerate-message",
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
    type Message = UIMessage<{ test: string }>;

    const { messages, sendMessage } = useChat<Message>({
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
      chunks: [
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({
          type: 'text-delta',
          id: '0',
          delta: 'first response',
        }),
        formatChunk({ type: 'text-end', id: '0' }),
      ],
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
        "trigger": "submit-message",
      }
    `);
  });
});

describe('resume ongoing stream and return assistant message', () => {
  const controller = new TestResponseController();

  setupTestComponent(
    () => {
      const { messages, status } = useChat({
        id: '123',
        messages: [
          {
            id: 'msg_123',
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
          },
        ],
        generateId: mockId(),
        resume: true,
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

          <div data-testid="status">{status}</div>
        </div>
      );
    },
    {
      init: TestComponent => {
        server.urls['/api/chat/123/stream'].response = {
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

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('streaming');
    });

    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: ',' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
    );
    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: '.' }));
    controller.write(formatChunk({ type: 'text-end', id: '0' }));

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
      expect(requestUrl).toBe('http://localhost:3000/api/chat/123/stream');
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

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
      expect(screen.getByTestId('status')).toHaveTextContent('streaming');
    });

    await userEvent.click(screen.getByTestId('do-stop'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
    });

    await expect(
      controller.write(
        formatChunk({ type: 'text-delta', id: '0', delta: ', world!' }),
      ),
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

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'Hel' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(throttleMs + 10);
    });

    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hel');

    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: 'lo' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: ' Th' }),
    );
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'ere' }),
    );
    controller.write(formatChunk({ type: 'text-end', id: '0' }));

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

describe('id changes', () => {
  setupTestComponent(
    () => {
      const [id, setId] = React.useState<string>('initial-id');

      const {
        messages,
        sendMessage,
        error,
        status,
        id: idKey,
      } = useChat({
        id,
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
      init: TestComponent => <TestComponent />,
    },
  );

  it('should update chat instance when the id changes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
        formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              text: 'Hello, world.',
              type: 'text',
              state: 'done',
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

describe('chat instance changes', () => {
  setupTestComponent(
    () => {
      const [chat, setChat] = React.useState<Chat<UIMessage>>(
        new Chat({
          id: 'initial-id',
          generateId: mockId(),
        }),
      );

      const {
        messages,
        sendMessage,
        error,
        status,
        id: idKey,
      } = useChat({
        chat,
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
            data-testid="do-change-chat"
            onClick={() => {
              setChat(
                new Chat({
                  id: 'second-id',
                  generateId: mockId(),
                }),
              );
            }}
          />
        </div>
      );
    },
    {
      init: TestComponent => <TestComponent />,
    },
  );

  it('should update chat instance when the id changes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
        formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
        formatChunk({ type: 'text-end', id: '0' }),
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
          parts: [
            {
              text: 'Hello, world.',
              type: 'text',
              state: 'done',
            },
          ],
          role: 'assistant',
        },
      ]);
    });
    await userEvent.click(screen.getByTestId('do-change-chat'));

    expect(screen.queryByTestId('message-0')).not.toBeInTheDocument();
  });
});

describe('streaming with id change from undefined to defined', () => {
  setupTestComponent(
    () => {
      const [id, setId] = React.useState<string | undefined>(undefined);
      const { messages, sendMessage, status } = useChat({
        id,
        generateId: mockId(),
      });

      return (
        <div>
          <div data-testid="status">{status.toString()}</div>
          <div data-testid="messages">{JSON.stringify(messages, null, 2)}</div>
          <button
            data-testid="change-id"
            onClick={() => {
              setId('chat-123');
            }}
          />
          <button
            data-testid="send-message"
            onClick={() => {
              sendMessage({ parts: [{ text: 'hi', type: 'text' }] });
            }}
          />
        </div>
      );
    },
    {
      init: TestComponent => <TestComponent />,
    },
  );

  it('should handle streaming correctly when id changes from undefined to defined', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    // First, change the ID from undefined to 'chat-123'
    await userEvent.click(screen.getByTestId('change-id'));

    // Then send a message
    await userEvent.click(screen.getByTestId('send-message'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('submitted');
    });

    controller.write(formatChunk({ type: 'text-start', id: '0' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
    );

    // Verify streaming is working - text should appear immediately
    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Hello',
            }),
          ]),
        }),
      );
    });

    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: ',' }));
    controller.write(
      formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
    );
    controller.write(formatChunk({ type: 'text-delta', id: '0', delta: '.' }));
    controller.write(formatChunk({ type: 'text-end', id: '0' }));
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Hello, world.',
              state: 'done',
            }),
          ]),
        }),
      );
    });
  });
});
