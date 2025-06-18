import { createTestServer, mockId } from '@ai-sdk/provider-utils/test';
import { DefaultChatTransport, UIMessageStreamPart } from '..';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { AbstractChat, ChatInit, ChatState, ChatStatus } from './chat';
import { UIMessage } from './ui-messages';

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

function formatStreamPart(part: UIMessageStreamPart) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  'http://localhost:3000/api/chat': {},
});

describe('chat', () => {
  describe('sendMessage', () => {
    it('should send a simple message', async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'start' }),
          formatStreamPart({ type: 'start-step' }),
          formatStreamPart({ type: 'text', text: 'Hello' }),
          formatStreamPart({ type: 'text', text: ',' }),
          formatStreamPart({ type: 'text', text: ' world' }),
          formatStreamPart({ type: 'text', text: '.' }),
          formatStreamPart({ type: 'finish-step' }),
          formatStreamPart({ type: 'finish' }),
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
      });

      await finishPromise.promise;

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
          "trigger": "submit-user-message",
        }
      `,
      );

      expect(chat.messages).toMatchInlineSnapshot(`
        [
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
            "metadata": undefined,
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
        ]
      `);

      expect(chat.history).toMatchInlineSnapshot(`
        [
          [],
          [
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
          [
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
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
          formatStreamPart({ type: 'start' }),
          formatStreamPart({ type: 'start-step' }),
          formatStreamPart({ type: 'text', text: 'Hello' }),
          formatStreamPart({ type: 'text', text: ',' }),
          formatStreamPart({ type: 'text', text: ' world' }),
          formatStreamPart({ type: 'text', text: '.' }),
          formatStreamPart({ type: 'finish-step' }),
          formatStreamPart({ type: 'finish' }),
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
            parts: [{ text: 'How can I help you?', type: 'text' }],
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
          "trigger": "submit-user-message",
        }
      `,
      );

      expect(chat.messages).toMatchInlineSnapshot(`
        [
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
            "id": "newid-0",
            "metadata": undefined,
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
});
