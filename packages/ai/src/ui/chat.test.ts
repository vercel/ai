import { createTestServer, mockId } from '@ai-sdk/provider-utils/test';
import { DefaultChatTransport, UIMessageStreamPart } from '..';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { AbstractChat, ChatInit, ChatState, ChatStatus } from './chat';
import { UIMessage } from './ui-messages';

class TestChatState<UI_MESSAGE extends UIMessage>
  implements ChatState<UI_MESSAGE>
{
  status: ChatStatus = 'ready';
  messages: UI_MESSAGE[];
  error: Error | undefined = undefined;

  constructor(initialMessages: UI_MESSAGE[] = []) {
    this.messages = initialMessages;
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => value;
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new TestChatState(),
    });
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
    it('should send a message', async () => {
      server.urls['http://localhost:3000/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'start' }),
          formatStreamPart({ type: 'text', text: 'Hello' }),
          formatStreamPart({ type: 'text', text: ',' }),
          formatStreamPart({ type: 'text', text: ' world' }),
          formatStreamPart({ type: 'text', text: '.' }),
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
                "text": "Hello, world.",
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
