import { mockId } from '@ai-sdk/provider-utils/test';
import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
} from './chat';
import { DefaultChatTransport } from './default-chat-transport';
import { lastAssistantMessageIsCompleteWithApprovalResponses } from './last-assistant-message-is-complete-with-approval-responses';
import { lastAssistantMessageIsCompleteWithToolCalls } from './last-assistant-message-is-complete-with-tool-calls';
import type { UIMessage } from './ui-messages';

class TestChatState<
  UI_MESSAGE extends UIMessage,
> implements ChatState<UI_MESSAGE> {
  history: UI_MESSAGE[][] = [];

  status: ChatStatus = 'ready';
  messages: UI_MESSAGE[];
  error: Error | undefined = undefined;

  constructor(initialMessages: UI_MESSAGE[] = []) {
    this.messages = initialMessages;
    this.history.push(structuredClone(initialMessages));
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.messages = this.messages.concat(message);
    this.history.push(structuredClone(this.messages));
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
    this.history.push(structuredClone(this.messages));
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
    this.history.push(structuredClone(this.messages));
  };

  snapshot = <T>(value: T): T => value;
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new TestChatState(init.messages ?? []),
    });
  }

  get history() {
    return (this.state as TestChatState<UIMessage>).history;
  }
}

class TestChatWithState extends AbstractChat<UIMessage> {}

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  'http://localhost:3000/api/chat': {},
});

describe('Chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('send a simple message', () => {
    let chat: TestChat;
    let letOnFinishArgs: any[] = [];

    beforeEach(async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'start' }),
          formatChunk({ type: 'start-step' }),
          formatChunk({ type: 'text-start', id: 'text-1' }),
          formatChunk({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello',
          }),
          formatChunk({ type: 'text-delta', id: 'text-1', delta: ',' }),
          formatChunk({
            type: 'text-delta',
            id: 'text-1',
            delta: ' world',
          }),
          formatChunk({ type: 'text-delta', id: 'text-1', delta: '.' }),
          formatChunk({ type: 'text-end', id: 'text-1' }),
          formatChunk({ type: 'finish-step' }),
          formatChunk({
            type: 'finish',
            finishReason: 'stop',
          }),
        ],
      };

      const finishPromise = createResolvablePromise<void>();
      letOnFinishArgs = [];

      chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        onFinish: (...args) => {
          letOnFinishArgs = args;
          return finishPromise.resolve();
        },
      });

      chat.sendMessage({
        text: 'Hello, world!',
      });

      await finishPromise.promise;
    });

    it('should call onFinish with message and messages', async () => {
      expect(letOnFinishArgs).toMatchInlineSnapshot(`
        [
          {
            "finishReason": "stop",
            "isAbort": false,
            "isDisconnect": false,
            "isError": false,
            "message": {
              "id": "id-1",
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
                "id": "id-0",
                "metadata": undefined,
                "parts": [
                  {
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "id": "id-1",
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

    it('should send the messages to the API', async () => {
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(
        `
        {
          "id": "123",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "trigger": "submit-message",
        }
      `,
      );
    });

    it('should return the correct final messages', async () => {
      expect(chat.messages).toMatchInlineSnapshot(`
      [
        {
          "id": "id-0",
          "metadata": undefined,
          "parts": [
            {
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "user",
        },
        {
          "id": "id-1",
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
      ]
    `);
    });

    it('should update the messages during the streaming', async () => {
      expect(chat.history).toMatchInlineSnapshot(`
        [
          [],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello,",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
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
        ]
      `);
    });
  });

  describe('regenerate', () => {
    it('preserves a preceding assistant message', async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'start' }),
          formatChunk({ type: 'text-start', id: 'text-1' }),
          formatChunk({
            type: 'text-delta',
            id: 'text-1',
            delta: 'regenerated target',
          }),
          formatChunk({ type: 'text-end', id: 'text-1' }),
          formatChunk({ type: 'finish', finishReason: 'stop' }),
        ],
      };

      const initialMessages = [
        {
          id: 'user',
          role: 'user',
          parts: [{ type: 'text', text: 'prompt' }],
        },
        {
          id: 'assistant-parent',
          role: 'assistant',
          parts: [{ type: 'text', text: 'parent' }],
        },
        {
          id: 'assistant-target',
          role: 'assistant',
          parts: [{ type: 'text', text: 'target' }],
        },
      ] satisfies UIMessage[];
      const expectedRequestMessages = structuredClone(
        initialMessages.slice(0, 2),
      );
      const expectedAssistantParent = structuredClone(initialMessages[1]);

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        messages: initialMessages,
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
      });

      await chat.regenerate({ messageId: 'assistant-target' });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        trigger: 'regenerate-message',
        messageId: 'assistant-target',
        messages: expectedRequestMessages,
      });
      expect(chat.messages).toMatchObject([
        initialMessages[0],
        expectedAssistantParent,
        {
          id: 'id-0',
          role: 'assistant',
          parts: [{ type: 'text', text: 'regenerated target' }],
        },
      ]);
    });
  });

  describe('send handle a disconnected response stream', () => {
    let chat: TestChat;
    let letOnFinishArgs: any[] = [];

    beforeEach(async () => {
      const controller = new TestResponseController();

      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'controlled-stream',
        controller,
      };

      const finishPromise = createResolvablePromise<void>();
      letOnFinishArgs = [];

      chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        onFinish: (...args) => {
          letOnFinishArgs = args;
          return finishPromise.resolve();
        },
      });

      chat.sendMessage({
        text: 'Hello, world!',
      });

      controller.write(formatChunk({ type: 'start' }));
      controller.write(formatChunk({ type: 'start-step' }));
      controller.write(formatChunk({ type: 'text-start', id: 'text-1' }));
      controller.write(
        formatChunk({ type: 'text-delta', id: 'text-1', delta: 'Hello' }),
      );

      // wait until the stream is consumed before sending the error
      while ((chat.messages[1]?.parts[1] as any)?.text !== 'Hello') {
        await vi.advanceTimersByTimeAsync(0);
      }

      controller.error(new TypeError('fetch failed'));

      await finishPromise.promise;
    });

    it('should call onFinish with message and messages', async () => {
      expect(letOnFinishArgs).toMatchInlineSnapshot(`
        [
          {
            "finishReason": undefined,
            "isAbort": false,
            "isDisconnect": true,
            "isError": true,
            "message": {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello",
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
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "id": "id-1",
                "metadata": undefined,
                "parts": [
                  {
                    "type": "step-start",
                  },
                  {
                    "providerMetadata": undefined,
                    "state": "streaming",
                    "text": "Hello",
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

    it('should return the correct final messages', async () => {
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should update the messages during the streaming', async () => {
      expect(chat.history).toMatchInlineSnapshot(`
        [
          [],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
        ]
      `);
    });
  });

  describe('send handle a stop and an aborted response stream', () => {
    let chat: TestChat;
    let letOnFinishArgs: any[] = [];
    let isAborted = false;

    beforeEach(async () => {
      let controller: ReadableStreamDefaultController<UIMessageChunk>;
      const responseStream = new ReadableStream<UIMessageChunk>({
        start: controllerArg => {
          controller = controllerArg;

          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello',
          });
        },
      });

      const finishPromise = createResolvablePromise<void>();
      letOnFinishArgs = [];

      chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: {
          sendMessages: async options => {
            options.abortSignal?.addEventListener('abort', () => {
              isAborted = true;
              controller.error(new DOMException('Aborted', 'AbortError'));
            });
            return responseStream;
          },
          reconnectToStream: () => {
            throw new Error('not implemented');
          },
        },
        onFinish: (...args) => {
          letOnFinishArgs = args;
          return finishPromise.resolve();
        },
      });

      chat.sendMessage({
        text: 'Hello, world!',
      });

      // wait until the stream is consumed before sending the error
      while ((chat.messages[1]?.parts[1] as any)?.text !== 'Hello') {
        await vi.advanceTimersByTimeAsync(0);
      }

      await chat.stop();

      await finishPromise.promise;
    });

    it('should have been aborted', async () => {
      expect(isAborted).toBe(true);
    });

    it('should call onFinish with message and messages', async () => {
      expect(letOnFinishArgs).toMatchInlineSnapshot(`
        [
          {
            "finishReason": undefined,
            "isAbort": true,
            "isDisconnect": false,
            "isError": false,
            "message": {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello",
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
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "user",
              },
              {
                "id": "id-1",
                "metadata": undefined,
                "parts": [
                  {
                    "type": "step-start",
                  },
                  {
                    "providerMetadata": undefined,
                    "state": "streaming",
                    "text": "Hello",
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

    it('should return the correct final messages', async () => {
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should update the messages during the streaming', async () => {
      expect(chat.history).toMatchInlineSnapshot(`
        [
          [],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
          [
            {
              "id": "id-0",
              "metadata": undefined,
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ],
        ]
      `);
    });
  });

  it('should not send a message when stopped during message preparation', async () => {
    const sendMessages = vi.fn(async () => new ReadableStream());
    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages,
        reconnectToStream: () => {
          throw new Error('not implemented');
        },
      },
    });

    const sendPromise = chat.sendMessage({ text: 'Hello, world!' });
    await chat.stop();
    await sendPromise;

    expect(sendMessages).not.toHaveBeenCalled();
    expect(chat.messages).toEqual([]);
    expect(chat.status).toBe('ready');
  });

  it('should stop updating messages when a resumed stream is stopped', async () => {
    const nextChunk = createResolvablePromise<void>();
    let reconnectAbortSignal: AbortSignal | undefined;
    let isCancelled = false;

    const resumeStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'start-step' });
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: 'before stop',
        });
      },
      async pull(controller) {
        await nextChunk.promise;

        try {
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: ' after stop',
          });
          controller.close();
        } catch {
          // the stream was cancelled while the pull was pending
        }
      },
      cancel() {
        isCancelled = true;
      },
    });

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages: async () => new ReadableStream(),
        reconnectToStream: async options => {
          reconnectAbortSignal = options.abortSignal;
          return resumeStream;
        },
      },
      onFinish: () => {},
    });

    const resumePromise = chat.resumeStream();

    while ((chat.messages[0]?.parts[1] as any)?.text !== 'before stop') {
      await vi.advanceTimersByTimeAsync(0);
    }

    await chat.stop();
    nextChunk.resolve();
    await resumePromise;

    expect(reconnectAbortSignal?.aborted).toBe(true);
    expect(isCancelled).toBe(true);
    expect((chat.messages[0]?.parts[1] as any)?.text).toBe('before stop');
  });

  it('should stop a resumed stream while reconnection is pending', async () => {
    const reconnectResult =
      createResolvablePromise<ReadableStream<UIMessageChunk>>();
    let reconnectAbortSignal: AbortSignal | undefined;
    let isCancelled = false;

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages: async () => new ReadableStream(),
        reconnectToStream: async options => {
          reconnectAbortSignal = options.abortSignal;
          return reconnectResult.promise;
        },
      },
      onFinish: () => {},
    });

    const resumePromise = chat.resumeStream();

    expect(chat.status).toBe('ready');
    await chat.stop();
    expect(reconnectAbortSignal?.aborted).toBe(true);

    reconnectResult.resolve(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'after stop',
          });
        },
        cancel() {
          isCancelled = true;
        },
      }),
    );

    await resumePromise;

    expect(isCancelled).toBe(true);
    expect(chat.messages).toEqual([]);
    expect(chat.status).toBe('ready');
  });

  it('should only apply the latest overlapping resumed stream', async () => {
    const reconnectResults = [
      createResolvablePromise<ReadableStream<UIMessageChunk>>(),
      createResolvablePromise<ReadableStream<UIMessageChunk>>(),
    ];
    const reconnectAbortSignals: AbortSignal[] = [];
    let reconnectCount = 0;
    let firstStreamCancelled = false;

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages: async () => new ReadableStream(),
        reconnectToStream: async options => {
          reconnectAbortSignals.push(options.abortSignal!);
          return reconnectResults[reconnectCount++].promise;
        },
      },
      onFinish: () => {},
    });

    const firstResumePromise = chat.resumeStream();
    const secondResumePromise = chat.resumeStream();

    expect(reconnectAbortSignals[0].aborted).toBe(true);
    expect(reconnectAbortSignals[1].aborted).toBe(false);

    reconnectResults[0].resolve(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'stale',
          });
        },
        cancel() {
          firstStreamCancelled = true;
        },
      }),
    );
    reconnectResults[1].resolve(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'latest',
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.enqueue({ type: 'finish-step' });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
          controller.close();
        },
      }),
    );

    await Promise.all([firstResumePromise, secondResumePromise]);

    expect(firstStreamCancelled).toBe(true);
    expect(chat.messages).toHaveLength(1);
    expect((chat.messages[0].parts[1] as any).text).toBe('latest');
    expect(chat.status).toBe('ready');
  });

  it('should include the metadata of text message', async () => {
    server.urls['http://localhost:3000/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'start' }),
        formatChunk({ type: 'start-step' }),
        formatChunk({ type: 'text-start', id: 'text-1' }),
        formatChunk({
          type: 'text-delta',
          id: 'text-1',
          delta: 'Hello, world.',
        }),
        formatChunk({ type: 'text-end', id: 'text-1' }),
        formatChunk({ type: 'finish-step' }),
        formatChunk({
          type: 'finish',
          finishReason: 'stop',
        }),
      ],
    };

    const finishPromise = createResolvablePromise<void>();

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: new DefaultChatTransport({
        api: 'http://localhost:3000/api/chat',
      }),
      onFinish: () => finishPromise.resolve(),
    });

    chat.sendMessage({
      text: 'Hello, world!',
      metadata: { someData: true },
    });

    await finishPromise.promise;

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(
      `
      {
        "id": "123",
        "messages": [
          {
            "id": "id-0",
            "metadata": {
              "someData": true,
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        "trigger": "submit-message",
      }
    `,
    );

    expect(chat.messages).toMatchInlineSnapshot(`
      [
        {
          "id": "id-0",
          "metadata": {
            "someData": true,
          },
          "parts": [
            {
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "user",
        },
        {
          "id": "id-1",
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
      ]
    `);

    expect(chat.history).toMatchInlineSnapshot(`
      [
        [],
        [
          {
            "id": "id-0",
            "metadata": {
              "someData": true,
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": {
              "someData": true,
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": {
              "someData": true,
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": {
              "someData": true,
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
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
      ]
    `);
  });

  it('should replace an existing user message', async () => {
    server.urls['http://localhost:3000/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'start' }),
        formatChunk({ type: 'start-step' }),
        formatChunk({ type: 'text-start', id: 'text-1' }),
        formatChunk({
          type: 'text-delta',
          id: 'text-1',
          delta: 'Hello',
        }),
        formatChunk({ type: 'text-delta', id: 'text-1', delta: ',' }),
        formatChunk({
          type: 'text-delta',
          id: 'text-1',
          delta: ' world',
        }),
        formatChunk({ type: 'text-delta', id: 'text-1', delta: '.' }),
        formatChunk({ type: 'text-end', id: 'text-1' }),
        formatChunk({ type: 'finish-step' }),
        formatChunk({ type: 'finish' }),
      ],
    };

    const finishPromise = createResolvablePromise<void>();

    const chat = new TestChat({
      id: '123',
      generateId: mockId({ prefix: 'newid' }),
      transport: new DefaultChatTransport({
        api: 'http://localhost:3000/api/chat',
      }),
      onFinish: () => finishPromise.resolve(),
      messages: [
        {
          id: 'id-0',
          role: 'user',
          parts: [{ text: 'Hi!', type: 'text' }],
        },
        {
          id: 'id-1',
          role: 'assistant',
          parts: [{ text: 'How can I help you?', type: 'text', state: 'done' }],
        },
      ],
    });

    chat.sendMessage({
      text: 'Hello, world!',
      messageId: 'id-0',
    });

    await finishPromise.promise;

    expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(
      `
      {
        "id": "123",
        "messageId": "id-0",
        "messages": [
          {
            "id": "id-0",
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        "trigger": "submit-message",
      }
    `,
    );

    expect(chat.messages).toMatchInlineSnapshot(`
      [
        {
          "id": "id-0",
          "metadata": undefined,
          "parts": [
            {
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "user",
        },
        {
          "id": "newid-0",
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
      ]
    `);

    expect(chat.history).toMatchInlineSnapshot(`
      [
        [
          {
            "id": "id-0",
            "parts": [
              {
                "text": "Hi!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "parts": [
              {
                "state": "done",
                "text": "How can I help you?",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello,",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, world",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "streaming",
                "text": "Hello, world.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ],
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "newid-0",
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
      ]
    `);
  });

  it('should reject when onFinish throws', async () => {
    const onFinishError = new Error('onFinish failed');
    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages: async () =>
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({ type: 'start' });
              controller.enqueue({ type: 'start-step' });
              controller.enqueue({ type: 'finish-step' });
              controller.enqueue({ type: 'finish', finishReason: 'stop' });
              controller.close();
            },
          }),
        reconnectToStream: async () => null,
      },
      onFinish: () => {
        throw onFinishError;
      },
    });

    await expect(chat.sendMessage({ text: 'Hello, world!' })).rejects.toBe(
      onFinishError,
    );
    expect((chat as any).activeResponse).toBeUndefined();
  });

  it.each([
    {
      name: 'a message id',
      chunk: { type: 'start', messageId: 'response-id' } as const,
    },
    {
      name: 'message metadata',
      chunk: {
        type: 'start',
        messageMetadata: { model: 'test-model' },
      } as const,
    },
    {
      name: 'no message fields',
      chunk: { type: 'start' } as const,
    },
  ])(
    'should remain submitted after a start chunk with $name until content arrives',
    async ({ chunk }) => {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const startProcessed = createResolvablePromise<void>();
      const contentProcessed = createResolvablePromise<void>();
      const stream = new ReadableStream<UIMessageChunk>({
        start(streamController) {
          controller = streamController;
        },
      });

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: {
          sendMessages: async () => stream,
          reconnectToStream: async () => null,
        },
      });

      const sendPromise = chat.sendMessage({ text: 'Hello' });

      controller.enqueue(chunk);
      controller.enqueue({
        get type() {
          startProcessed.resolve();
          return 'start-step' as const;
        },
      });

      await startProcessed.promise;

      expect(chat.status).toBe('submitted');

      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({
        get type() {
          contentProcessed.resolve();
          return 'start-step' as const;
        },
      });

      await contentProcessed.promise;

      expect(chat.status).toBe('streaming');

      controller.enqueue({ type: 'text-end', id: 'text-1' });
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
      controller.close();

      await sendPromise;
    },
  );

  it('should handle error parts', async () => {
    server.urls['http://localhost:3000/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'start' }),
        formatChunk({ type: 'error', errorText: 'test-error' }),
      ],
    };

    const errorPromise = createResolvablePromise<void>();

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: new DefaultChatTransport({
        api: 'http://localhost:3000/api/chat',
      }),
      onError: () => errorPromise.resolve(),
    });

    chat.sendMessage({
      text: 'Hello, world!',
    });

    await errorPromise.promise;

    expect(chat.error).toMatchInlineSnapshot(`[Error: test-error]`);
    expect(chat.status).toBe('error');
  });

  it('should not copy the previous assistant message when resuming a stream', async () => {
    const state = new TestChatState<UIMessage>([
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What was the previous result?' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'The previous result was 42.' }],
      },
    ]);
    state.snapshot = <T>(value: T): T => structuredClone(value);

    const chat = new TestChatWithState({
      id: '123',
      state,
      generateId: mockId(),
      transport: {
        sendMessages: async () => {
          throw new Error('not implemented');
        },
        reconnectToStream: async () =>
          new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({
                type: 'start',
                messageId: 'assistant-2',
              });
              controller.enqueue({ type: 'text-start', id: 'text-1' });
              controller.enqueue({
                type: 'text-delta',
                id: 'text-1',
                delta: 'The resumed result is 43.',
              });
              controller.enqueue({ type: 'text-end', id: 'text-1' });
              controller.enqueue({ type: 'finish' });
              controller.close();
            },
          }),
      },
    });

    await chat.resumeStream();

    expect(chat.messages).toMatchInlineSnapshot(`
      [
        {
          "id": "user-1",
          "parts": [
            {
              "text": "What was the previous result?",
              "type": "text",
            },
          ],
          "role": "user",
        },
        {
          "id": "assistant-1",
          "parts": [
            {
              "text": "The previous result was 42.",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
        {
          "id": "assistant-2",
          "metadata": undefined,
          "parts": [
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "The resumed result is 43.",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should not throw to console when an overlapped request clears activeResponse before resume-stream finishes', async () => {
    let resumeController!: ReadableStreamDefaultController<UIMessageChunk>;
    const resumeStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        resumeController = controller;
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'start-step' });
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: 'resumed',
        });
      },
    });

    const submitStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'start-step' });
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({
          type: 'text-delta',
          id: 'text-1',
          delta: 'submitted',
        });
        controller.enqueue({ type: 'text-end', id: 'text-1' });
        controller.enqueue({ type: 'finish-step' });
        controller.enqueue({ type: 'finish', finishReason: 'stop' });
        controller.close();
      },
    });

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const chat = new TestChat({
      id: '123',
      generateId: mockId(),
      transport: {
        sendMessages: async () => submitStream,
        reconnectToStream: async () => resumeStream,
      },
      onFinish: () => {},
    });

    let resumeSettled = false;
    const resumePromise = chat.resumeStream().finally(() => {
      resumeSettled = true;
    });

    while ((chat.messages[0]?.parts[1] as any)?.text !== 'resumed') {
      await vi.advanceTimersByTimeAsync(0);
    }

    expect(resumeSettled).toBe(false);

    await chat.sendMessage({ text: 'Hello, world!' });

    expect((chat as any).activeResponse).toBeUndefined();

    resumeController.enqueue({ type: 'text-end', id: 'text-1' });
    resumeController.enqueue({ type: 'finish-step' });
    resumeController.enqueue({ type: 'finish', finishReason: 'stop' });
    resumeController.close();
    await resumePromise;

    try {
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  describe('sendAutomaticallyWhen', () => {
    it('should delay tool output submission until the stream is finished', async () => {
      const controller1 = new TestResponseController();

      server.urls['http://localhost:3000/api/chat'].response = [
        { type: 'controlled-stream', controller: controller1 },
        { type: 'stream-chunks', chunks: [formatChunk({ type: 'start' })] },
      ];

      const toolCallPromise = createResolvablePromise<void>();
      const submitMessagePromise = createResolvablePromise<void>();
      let callCount = 0;

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: () => callCount < 2,
        onToolCall: () => toolCallPromise.resolve(),
        onFinish: () => {
          callCount++;
        },
      });

      chat
        .sendMessage({
          text: 'Hello, world!',
        })
        .then(() => {
          submitMessagePromise.resolve();
        });

      // start stream
      controller1.write(formatChunk({ type: 'start' }));
      controller1.write(formatChunk({ type: 'start-step' }));

      // tool call
      controller1.write(
        formatChunk({
          type: 'tool-input-available',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          input: { testArg: 'test-value' },
        }),
      );

      await toolCallPromise.promise;

      // user submits the tool output
      await chat.addToolOutput({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "type": "tool-test-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      // should not have called the API yet
      expect(server.calls.length).toBe(1);

      // finish stream
      controller1.write(formatChunk({ type: 'finish-step' }));
      controller1.write(
        formatChunk({
          type: 'finish',
          finishReason: 'stop',
        }),
      );

      await controller1.close();

      await submitMessagePromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-output",
                  "state": "output-available",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);
    });

    it('should send message when a tool output is submitted', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      // user submits the tool output
      await chat.addToolOutput({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "type": "tool-test-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      await onFinishPromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-output",
                  "state": "output-available",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);
    });

    it('should send message when a tool error result is submitted', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      // user submits the tool output
      await chat.addToolOutput({
        state: 'output-error',
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        errorText: 'test-error',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": "test-error",
                "input": {
                  "testArg": "test-value",
                },
                "output": undefined,
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-error",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "type": "tool-test-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      await onFinishPromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": "test-error",
                  "input": {
                    "testArg": "test-value",
                  },
                  "state": "output-error",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);
    });

    it('should send message when a dynamic tool output is submitted', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              dynamic: true,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({ type: 'text-start', id: 'id-1' }),
            formatChunk({
              type: 'text-delta',
              id: 'id-1',
              delta: 'test-delta',
            }),
            formatChunk({ type: 'text-end', id: 'id-1' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({
              type: 'finish',
              finishReason: 'stop',
            }),
          ],
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      // user submits the tool output
      await chat.addToolOutput({
        state: 'output-available',
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "toolName": "test-tool",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      await onFinishPromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-output",
                  "state": "output-available",
                  "toolCallId": "tool-call-0",
                  "toolName": "test-tool",
                  "type": "dynamic-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);

      // UI should show the response
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "toolName": "test-tool",
                "type": "dynamic-tool",
              },
              {
                "type": "step-start",
              },
              {
                "providerMetadata": undefined,
                "state": "done",
                "text": "test-delta",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should not send message when the server responded with an error', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              dynamic: true,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'error',
          status: 500,
          body: 'Internal Server Error',
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      // user submits the tool output
      await chat.addToolOutput({
        state: 'output-available',
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "toolName": "test-tool",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      await onFinishPromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-output",
                  "state": "output-available",
                  "toolCallId": "tool-call-0",
                  "toolName": "test-tool",
                  "type": "dynamic-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);

      // UI should not show the response
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "toolName": "test-tool",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      // UI should be in error state
      expect(chat.status).toBe('error');
      expect(chat.error).toMatchInlineSnapshot(
        `[Error: Internal Server Error]`,
      );
    });

    it('should not send message when sendAutomaticallyWhen returns false via promise', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
      ];

      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: () => Promise.resolve(false),
        onFinish: () => {
          onFinishPromise.resolve();
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      await onFinishPromise.promise;

      // user submits the tool output
      await chat.addToolOutput({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "type": "tool-test-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      // should not have made a 2nd call since sendAutomaticallyWhen returns false
      expect(server.calls.length).toBe(1);
    });
  });

  describe('clearError', () => {
    it('should clear the error and set the status to ready', async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'start' }),
          formatChunk({ type: 'error', errorText: 'test-error' }),
        ],
      };

      const errorPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        onError: () => errorPromise.resolve(),
      });

      chat.sendMessage({
        text: 'Hello, world!',
      });

      await errorPromise.promise;

      expect(chat.error).toMatchInlineSnapshot(`[Error: test-error]`);
      expect(chat.status).toBe('error');

      chat.clearError();

      expect(chat.error).toBeUndefined();
      expect(chat.status).toBe('ready');
    });
  });

  describe('addToolOutput options forwarding', () => {
    it('should forward options to makeRequest when auto-sending', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              dynamic: true,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      await chat.addToolOutput({
        state: 'output-available',
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
        options: {
          headers: { 'x-custom': 'test-value' },
          body: { extra: 'data' },
        },
      });

      await onFinishPromise.promise;

      expect(server.calls.length).toBe(2);
      expect(server.calls[1].requestHeaders['x-custom']).toBe('test-value');
      expect(await server.calls[1].requestBodyJson).toMatchObject({
        extra: 'data',
      });
    });
  });

  describe('addToolApprovalResponse options forwarding', () => {
    it('should forward options to makeRequest when auto-sending', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-output-available',
              toolCallId: 'call-1',
              output: { temperature: 72, weather: 'sunny' },
            }),
            formatChunk({ type: 'text-start', id: 'txt-1' }),
            formatChunk({
              type: 'text-delta',
              id: 'txt-1',
              delta: 'The weather in Tokyo is sunny.',
            }),
            formatChunk({ type: 'text-end', id: 'txt-1' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({
              type: 'finish',
              finishReason: 'stop',
            }),
          ],
        },
      ];

      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId({ prefix: 'newid' }),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        messages: [
          {
            id: 'id-0',
            role: 'user',
            parts: [{ text: 'What is the weather in Tokyo?', type: 'text' }],
          },
          {
            id: 'id-1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-weather',
                toolCallId: 'call-1',
                state: 'approval-requested',
                input: { city: 'Tokyo' },
                approval: { id: 'approval-1' },
              },
            ],
          },
        ],
        sendAutomaticallyWhen:
          lastAssistantMessageIsCompleteWithApprovalResponses,
        onFinish: () => {
          onFinishPromise.resolve();
        },
      });

      await chat.addToolApprovalResponse({
        id: 'approval-1',
        approved: true,
        options: {
          headers: { 'x-custom': 'test-value' },
          body: { extra: 'data' },
        },
      });

      await onFinishPromise.promise;

      expect(server.calls.length).toBe(1);
      expect(server.calls[0].requestHeaders['x-custom']).toBe('test-value');
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        extra: 'data',
      });
    });
  });

  describe('addToolApprovalResponse', () => {
    it('should preserve signed approval metadata when recording the response', async () => {
      const chat = new TestChat({
        id: '123',
        generateId: mockId({ prefix: 'newid' }),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        messages: [
          {
            id: 'id-0',
            role: 'user',
            parts: [{ text: 'What is the weather in Tokyo?', type: 'text' }],
          },
          {
            id: 'id-1',
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-weather',
                toolCallId: 'call-1',
                state: 'approval-requested',
                input: { city: 'Tokyo' },
                approval: {
                  id: 'approval-1',
                  isAutomatic: false,
                  requestReason: 'requires operator review',
                  signature: 'signed-approval-envelope',
                },
              },
            ],
          },
        ],
      });

      await chat.addToolApprovalResponse({
        id: 'approval-1',
        approved: true,
        reason: 'looks good',
      });

      expect(chat.messages[1].parts[1]).toMatchObject({
        state: 'approval-responded',
        approval: {
          id: 'approval-1',
          approved: true,
          requestReason: 'requires operator review',
          reason: 'looks good',
          isAutomatic: false,
          signature: 'signed-approval-envelope',
        },
      });
    });

    describe('approved', () => {
      let chat: TestChat;

      beforeEach(async () => {
        chat = new TestChat({
          id: '123',
          generateId: mockId({ prefix: 'newid' }),
          transport: new DefaultChatTransport({
            api: 'http://localhost:3000/api/chat',
          }),
          messages: [
            {
              id: 'id-0',
              role: 'user',
              parts: [{ text: 'What is the weather in Tokyo?', type: 'text' }],
            },
            {
              id: 'id-1',
              role: 'assistant',
              parts: [
                { type: 'step-start' },
                {
                  type: 'tool-weather',
                  toolCallId: 'call-1',
                  state: 'approval-requested',
                  input: { city: 'Tokyo' },
                  approval: { id: 'approval-1' },
                },
              ],
            },
          ],
        });

        await chat.addToolApprovalResponse({
          id: 'approval-1',
          approved: true,
        });
      });

      it('should update tool invocation to show the approval response', () => {
        expect(chat.messages).toMatchInlineSnapshot(`
          [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "What is the weather in Tokyo?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "approval-1",
                    "reason": undefined,
                  },
                  "input": {
                    "city": "Tokyo",
                  },
                  "state": "approval-responded",
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });

    describe('approved with automatic sending', () => {
      let chat: TestChat;
      const onFinishPromise = createResolvablePromise<void>();

      beforeEach(async () => {
        server.urls['http://localhost:3000/api/chat'].response = [
          {
            type: 'stream-chunks',
            chunks: [
              formatChunk({ type: 'start' }),
              formatChunk({ type: 'start-step' }),
              formatChunk({
                type: 'tool-output-available',
                toolCallId: 'call-1',
                output: { temperature: 72, weather: 'sunny' },
              }),
              formatChunk({ type: 'text-start', id: 'txt-1' }),
              formatChunk({
                type: 'text-delta',
                id: 'txt-1',
                delta: 'The weather in Tokyo is sunny.',
              }),
              formatChunk({ type: 'text-end', id: 'txt-1' }),
              formatChunk({ type: 'finish-step' }),
              formatChunk({
                type: 'finish',
                finishReason: 'stop',
              }),
            ],
          },
        ];

        chat = new TestChat({
          id: '123',
          generateId: mockId({ prefix: 'newid' }),
          transport: new DefaultChatTransport({
            api: 'http://localhost:3000/api/chat',
          }),
          messages: [
            {
              id: 'id-0',
              role: 'user',
              parts: [{ text: 'What is the weather in Tokyo?', type: 'text' }],
            },
            {
              id: 'id-1',
              role: 'assistant',
              parts: [
                { type: 'step-start' },
                {
                  type: 'tool-weather',
                  toolCallId: 'call-1',
                  state: 'approval-requested',
                  input: { city: 'Tokyo' },
                  approval: { id: 'approval-1' },
                },
              ],
            },
          ],
          sendAutomaticallyWhen:
            lastAssistantMessageIsCompleteWithApprovalResponses,
          onFinish: () => {
            onFinishPromise.resolve();
          },
        });

        await chat.addToolApprovalResponse({
          id: 'approval-1',
          approved: true,
        });

        await onFinishPromise.promise;
      });

      it('should update tool invocation to show the approval response', () => {
        expect(chat.messages).toMatchInlineSnapshot(`
          [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "What is the weather in Tokyo?",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "approval-1",
                    "reason": undefined,
                  },
                  "errorText": undefined,
                  "input": {
                    "city": "Tokyo",
                  },
                  "output": {
                    "temperature": 72,
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "The weather in Tokyo is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });
  });

  describe('addToolResult', () => {
    it('should send message when a tool result is submitted', async () => {
      server.urls['http://localhost:3000/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({
              type: 'tool-input-available',
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              input: { testArg: 'test-value' },
            }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [
            formatChunk({ type: 'start' }),
            formatChunk({ type: 'start-step' }),
            formatChunk({ type: 'finish-step' }),
            formatChunk({ type: 'finish' }),
          ],
        },
      ];

      let callCount = 0;
      const onFinishPromise = createResolvablePromise<void>();

      const chat = new TestChat({
        id: '123',
        generateId: mockId(),
        transport: new DefaultChatTransport({
          api: 'http://localhost:3000/api/chat',
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        onFinish: () => {
          callCount++;
          if (callCount === 2) {
            onFinishPromise.resolve();
          }
        },
      });

      await chat.sendMessage({
        text: 'Hello, world!',
      });

      // user submits the tool output
      await chat.addToolResult({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-output',
      });

      // UI should show the tool output
      expect(chat.messages).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "metadata": undefined,
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "id": "id-1",
            "metadata": undefined,
            "parts": [
              {
                "type": "step-start",
              },
              {
                "errorText": undefined,
                "input": {
                  "testArg": "test-value",
                },
                "output": "test-output",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
                "title": undefined,
                "toolCallId": "tool-call-0",
                "type": "tool-test-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);

      await onFinishPromise.promise;

      // 2nd call should happen after the stream is finished
      expect(server.calls.length).toBe(2);

      // check details of the 2nd call
      expect(await server.calls[1].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "123",
          "messageId": "id-1",
          "messages": [
            {
              "id": "id-0",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
            {
              "id": "id-1",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-output",
                  "state": "output-available",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                },
              ],
              "role": "assistant",
            },
          ],
          "trigger": "submit-message",
        }
      `);
    });
  });
});
