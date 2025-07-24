import { createTestServer, mockId } from '@ai-sdk/provider-utils/test';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import {
  AbstractChat,
  ChatInit,
  ChatState,
  ChatStatus,
  isAssistantMessageWithCompletedToolCalls,
} from './chat';
import { UIMessage } from './ui-messages';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { DefaultChatTransport } from './default-chat-transport';

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

function formatStreamPart(part: UIMessageChunk) {
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
          formatStreamPart({ type: 'text-start', id: 'text-1' }),
          formatStreamPart({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello',
          }),
          formatStreamPart({ type: 'text-delta', id: 'text-1', delta: ',' }),
          formatStreamPart({
            type: 'text-delta',
            id: 'text-1',
            delta: ' world',
          }),
          formatStreamPart({ type: 'text-delta', id: 'text-1', delta: '.' }),
          formatStreamPart({ type: 'text-end', id: 'text-1' }),
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

    it('should include the metadata of text message', async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'start' }),
          formatStreamPart({ type: 'start-step' }),
          formatStreamPart({ type: 'text-start', id: 'text-1' }),
          formatStreamPart({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello, world.',
          }),
          formatStreamPart({ type: 'text-end', id: 'text-1' }),
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
          formatStreamPart({ type: 'start' }),
          formatStreamPart({ type: 'start-step' }),
          formatStreamPart({ type: 'text-start', id: 'text-1' }),
          formatStreamPart({
            type: 'text-delta',
            id: 'text-1',
            delta: 'Hello',
          }),
          formatStreamPart({ type: 'text-delta', id: 'text-1', delta: ',' }),
          formatStreamPart({
            type: 'text-delta',
            id: 'text-1',
            delta: ' world',
          }),
          formatStreamPart({ type: 'text-delta', id: 'text-1', delta: '.' }),
          formatStreamPart({ type: 'text-end', id: 'text-1' }),
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
            parts: [
              { text: 'How can I help you?', type: 'text', state: 'done' },
            ],
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
  });
});

describe('isAssistantMessageWithCompletedToolCalls', () => {
  it('should return false if the last step of a multi-step sequency only has text', () => {
    expect(
      isAssistantMessageWithCompletedToolCalls({
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getLocation',
            toolCallId: 'call_CuEdmzpx4ZldCkg5SVr3ikLz',
            state: 'output-available',
            input: {},
            output: 'New York',
          },
          { type: 'step-start' },
          {
            type: 'text',
            text: 'The current weather in New York is windy.',
            state: 'done',
          },
        ],
      }),
    ).toBe(false);
  });

  it('should return true when there is a text part after the last tool result in the last step', () => {
    expect(
      isAssistantMessageWithCompletedToolCalls({
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getWeatherInformation',
            toolCallId: 'call_6iy0GxZ9R4VDI5MKohXxV48y',
            state: 'output-available',
            input: {
              city: 'New York',
            },
            output: 'windy',
          },
          {
            type: 'text',
            text: 'The current weather in New York is windy.',
            state: 'done',
          },
        ],
      }),
    ).toBe(true);
  });
});
