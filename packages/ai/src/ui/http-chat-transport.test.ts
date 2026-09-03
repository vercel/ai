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
  });

  describe('error response', () => {
    it('should use a fallback message when sending messages returns an empty error body', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () => new Response(null, { status: 502 }),
      });

      await expect(
        transport.sendMessages({
          chatId: 'c123',
          messageId: 'm123',
          trigger: 'submit-message',
          messages: [],
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow('Failed to fetch the chat response.');
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

    it('should use a fallback message for an empty error body', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () => new Response(null, { status: 502 }),
      });

      await expect(
        transport.reconnectToStream({
          chatId: 'c123',
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow('Failed to fetch the chat response.');
    });
  });
});
