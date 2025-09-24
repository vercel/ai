import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { AbstractChat, ChatInit, ChatState, ChatStatus } from './chat';
import { UIMessage } from './ui-messages';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { DefaultChatTransport } from './default-chat-transport';
import { lastAssistantMessageIsCompleteWithToolCalls } from './last-assistant-message-is-complete-with-tool-calls';
import { describe, it, expect, beforeEach } from 'vitest';
import { delay } from '@ai-sdk/provider-utils';

class TestChatState<UI_MESSAGE extends UIMessage>
  implements ChatState<UI_MESSAGE>
{
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

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  'http://localhost:3000/api/chat': {},
});

describe('Chat', () => {
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
          formatChunk({ type: 'finish' }),
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
        await delay();
      }

      controller.error(new TypeError('fetch failed'));

      await finishPromise.promise;
    });

    it('should call onFinish with message and messages', async () => {
      expect(letOnFinishArgs).toMatchInlineSnapshot(`
        [
          {
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
        await delay();
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
        formatChunk({ type: 'finish' }),
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

  describe('sendAutomaticallyWhen', () => {
    it('should delay tool result submission until the stream is finished', async () => {
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

      // user submits the tool result
      await chat.addToolResult({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      });

      // UI should show the tool result
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
                "output": "test-result",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
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
      controller1.write(formatChunk({ type: 'finish' }));

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
                  "output": "test-result",
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

      // user submits the tool result
      await chat.addToolResult({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      });

      // UI should show the tool result
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
                "output": "test-result",
                "preliminary": undefined,
                "providerExecuted": undefined,
                "rawInput": undefined,
                "state": "output-available",
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
                  "output": "test-result",
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

    it('should send message when a dynamic tool result is submitted', async () => {
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

      // user submits the tool result
      await chat.addToolResult({
        tool: 'test-tool',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      });

      // UI should show the tool result
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
                "output": "test-result",
                "preliminary": undefined,
                "state": "output-available",
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
                  "output": "test-result",
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
});
