import { describe, expect, it, vi } from 'vitest';
import { DefaultChatTransport } from './default-chat-transport';

const encoder = new TextEncoder();

describe('DefaultChatTransport', () => {
  it('finishes and releases the response body at the DONE marker', async () => {
    const cancel = vi.fn();
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"start"}\n\n' +
              'data: {"type":"finish"}\n\n' +
              'data: [DONE]\n\n' +
              'data: {"type":"start","messageId":"late"}\n\n',
          ),
        );
      },
      cancel,
    });
    const transport = new DefaultChatTransport({
      fetch: async () =>
        new Response(responseBody, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    });

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-1',
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });
    const reader = stream.getReader();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: { type: 'start' },
    });
    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: { type: 'finish' },
    });
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
