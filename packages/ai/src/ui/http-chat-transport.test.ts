import { createTestServer } from '@ai-sdk/provider-utils/test';
import { UIMessageStreamPart } from '../ui-message-stream/ui-message-stream-parts';
import {
  HttpChatTransport,
  HttpChatTransportInitOptions,
} from './http-chat-transport';
import { UIMessage } from './ui-messages';

class MockHttpChatTransport extends HttpChatTransport<UIMessage> {
  constructor(options: HttpChatTransportInitOptions<UIMessage> = {}) {
    super(options);
  }
  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageStreamPart> {
    return new ReadableStream();
  }
}

const server = createTestServer({
  'http://localhost/api/chat': {},
});

describe('HttpChatTransport', () => {
  describe('body', () => {
    it('should include the body in the request by default', async () => {
      server.urls['http://localhost/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [],
      };

      const transport = new MockHttpChatTransport({
        api: 'http://localhost/api/chat',
        body: { someData: true },
      });

      await transport.sendMessages({
        chatId: 'c123',
        messageId: 'm123',
        trigger: 'submit-user-message',
        messages: [
          {
            id: 'm123',
            role: 'user',
            parts: [{ text: 'Hello, world!', type: 'text' }],
          },
        ],
        abortSignal: new AbortController().signal,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "id": "c123",
          "messageId": "m123",
          "messages": [
            {
              "id": "m123",
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ],
          "someData": true,
          "trigger": "submit-user-message",
        }
      `);
    });
  });
});
