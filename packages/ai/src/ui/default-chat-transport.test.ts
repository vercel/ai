import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { DefaultChatTransport } from './default-chat-transport';

const server = createTestServer({
  'http://localhost/api/chat': {},
  'http://localhost/api/chat/c123/stream': {},
});

describe('DefaultChatTransport', () => {
  it('should request UI message streams by default', async () => {
    server.urls['http://localhost/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    const transport = new DefaultChatTransport({
      api: 'http://localhost/api/chat',
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

    expect(server.calls[0].requestHeaders.accept).toBe('text/event-stream');
    expect(server.calls[0].requestHeaders['content-type']).toBe(
      'application/json',
    );
  });

  it('should request UI message streams for reconnects', async () => {
    server.urls['http://localhost/api/chat/c123/stream'].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    const transport = new DefaultChatTransport({
      api: 'http://localhost/api/chat',
    });

    await transport.reconnectToStream({
      chatId: 'c123',
    });

    expect(server.calls[0].requestHeaders.accept).toBe('text/event-stream');
  });

  it('should allow overriding the accept header', async () => {
    server.urls['http://localhost/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    const transport = new DefaultChatTransport({
      api: 'http://localhost/api/chat',
      headers: { Accept: 'application/x-ndjson' },
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

    expect(server.calls[0].requestHeaders.accept).toBe('application/x-ndjson');
  });
});
