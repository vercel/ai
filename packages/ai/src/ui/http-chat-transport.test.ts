import { APICallError, EmptyResponseBodyError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  HttpChatTransport,
  type HttpChatTransportInitOptions,
} from './http-chat-transport';
import type { UIMessage } from './ui-messages';

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
    it('should throw APICallError when sending messages returns a non-OK response', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () => new Response(null, { status: 502 }),
      });

      const error = await transport
        .sendMessages({
          chatId: 'c123',
          messageId: 'm123',
          trigger: 'submit-message',
          messages: [],
          abortSignal: new AbortController().signal,
        })
        .catch(error => error);

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_APICallError',
        message: 'Failed to fetch the chat response.',
        url: '/api/chat',
        requestBodyValues: undefined,
        statusCode: 502,
        responseBody: '',
        isRetryable: true,
      });
    });

    it('should throw EmptyResponseBodyError when sending messages returns no body', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () => new Response(null),
      });

      const error = await transport
        .sendMessages({
          chatId: 'c123',
          messageId: 'm123',
          trigger: 'submit-message',
          messages: [],
          abortSignal: new AbortController().signal,
        })
        .catch(error => error);

      expect(EmptyResponseBodyError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_EmptyResponseBodyError',
        message: 'The response body is empty.',
      });
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

    it('should throw APICallError for a non-OK response', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () =>
          new Response('Reconnect failed', {
            status: 409,
          }),
      });

      const error = await transport
        .reconnectToStream({
          chatId: 'c123',
          abortSignal: new AbortController().signal,
        })
        .catch(error => error);

      expect(APICallError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_APICallError',
        message: 'Reconnect failed',
        url: '/api/chat/c123/stream',
        requestBodyValues: undefined,
        statusCode: 409,
        responseBody: 'Reconnect failed',
        isRetryable: true,
      });
    });

    it('should throw EmptyResponseBodyError when reconnecting returns no body', async () => {
      const transport = new MockHttpChatTransport({
        fetch: async () => new Response(null),
      });

      const error = await transport
        .reconnectToStream({
          chatId: 'c123',
          abortSignal: new AbortController().signal,
        })
        .catch(error => error);

      expect(EmptyResponseBodyError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        name: 'AI_EmptyResponseBodyError',
        message: 'The response body is empty.',
      });
    });
  });
});
