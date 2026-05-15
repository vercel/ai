import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { TextStreamChatTransport } from './text-stream-chat-transport';

const server = createTestServer({
  'http://localhost/api/chat': {},
});

describe('TextStreamChatTransport', () => {
  it('should not request event streams by default', async () => {
    server.urls['http://localhost/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    const transport = new TextStreamChatTransport({
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

    expect(server.calls[0].requestHeaders.accept).toBeUndefined();
    expect(server.calls[0].requestHeaders['content-type']).toBe(
      'application/json',
    );
  });
});
