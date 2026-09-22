import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  HttpChatTransport,
  type HttpChatTransportInitOptions,
} from './http-chat-transport';
import type { UIMessage } from './ui-messages';
import { describe, it, expect } from 'vitest';

class MockHttpChatTransport extends HttpChatTransport<UIMessage> {
  constructor(options: HttpChatTransportInitOptions<UIMessage> = {}) {
    super(options);
  }
  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
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
        trigger: 'submit-message',
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
          "trigger": "submit-message",
        }
      `);
    });

    it('should include the body in the request when a function is provided', async () => {
      server.urls['http://localhost/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [],
      };

      const transport = new MockHttpChatTransport({
        api: 'http://localhost/api/chat',
        body: () => ({ someData: true }),
      });

      await transport.sendMessages({
        chatId: 'c123',
        messageId: 'm123',
        trigger: 'submit-message',
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
          "trigger": "submit-message",
        }
      `);
    });
  });

  describe('headers', () => {
    it('should include headers in the request by default', async () => {
      server.urls['http://localhost/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [],
      };

      const transport = new MockHttpChatTransport({
        api: 'http://localhost/api/chat',
        headers: { 'X-Test-Header': 'test-value' },
      });

      await transport.sendMessages({
        chatId: 'c123',
        messageId: 'm123',
        trigger: 'submit-message',
        messages: [
          {
            id: 'm123',
            role: 'user',
            parts: [{ text: 'Hello, world!', type: 'text' }],
          },
        ],
        abortSignal: new AbortController().signal,
      });

      expect(server.calls[0].requestHeaders['x-test-header']).toBe(
        'test-value',
      );
    });

    it('should include headers in the request when a function is provided', async () => {
      server.urls['http://localhost/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [],
      };

      const transport = new MockHttpChatTransport({
        api: 'http://localhost/api/chat',
        headers: () => ({ 'X-Test-Header': 'test-value-fn' }),
      });

      await transport.sendMessages({
        chatId: 'c123',
        messageId: 'm123',
        trigger: 'submit-message',
        messages: [
          {
            id: 'm123',
            role: 'user',
            parts: [{ text: 'Hello, world!', type: 'text' }],
          },
        ],
        abortSignal: new AbortController().signal,
      });

      expect(server.calls[0].requestHeaders['x-test-header']).toBe(
        'test-value-fn',
      );
    });

    it.each([
      {
        name: 'constructor headers',
        createTransport: () =>
          new MockHttpChatTransport({
            api: 'http://localhost/api/chat',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }),
        requestHeaders: undefined,
      },
      {
        name: 'per-request headers',
        createTransport: () =>
          new MockHttpChatTransport({
            api: 'http://localhost/api/chat',
          }),
        requestHeaders: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
      {
        name: 'prepared request headers',
        createTransport: () =>
          new MockHttpChatTransport({
            api: 'http://localhost/api/chat',
            prepareSendMessagesRequest: () => ({
              body: {},
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
              },
            }),
          }),
        requestHeaders: undefined,
      },
    ])('should use custom content type from $name once', async testCase => {
      server.urls['http://localhost/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [],
      };

      await testCase.createTransport().sendMessages({
        chatId: 'c123',
        messageId: 'm123',
        trigger: 'submit-message',
        messages: [],
        abortSignal: new AbortController().signal,
        headers: testCase.requestHeaders,
      });

      expect(server.calls[0].requestHeaders['content-type']).toBe(
        'application/json; charset=utf-8',
      );
    });
  });

  describe('reconnectToStream', () => {
    it('should pass the abort signal to fetch', async () => {
      const abortController = new AbortController();
      let receivedAbortSignal: AbortSignal | null | undefined;

      const transport = new MockHttpChatTransport({
        api: 'http://localhost/api/chat',
        fetch: async (_input, init) => {
          receivedAbortSignal = init?.signal;
          return new Response(null, { status: 204 });
        },
      });

      await transport.reconnectToStream({
        chatId: 'c123',
        abortSignal: abortController.signal,
      });

      expect(receivedAbortSignal).toBe(abortController.signal);
    });
  });
});
