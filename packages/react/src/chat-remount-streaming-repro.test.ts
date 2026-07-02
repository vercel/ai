import { mockId } from '@ai-sdk/provider-utils/test';
import type { ChatTransport, UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { Chat } from './chat.react';

const waitUntil = async (condition: () => boolean) => {
  for (let i = 0; i < 50; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  throw new Error('condition not met');
};

describe('Chat streaming subscription remount repro', () => {
  it('notifies a throttled message subscriber that registers while a stream is already active', async () => {
    let streamController!: ReadableStreamDefaultController<UIMessageChunk>;

    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        streamController = controller;
      },
    });

    const transport: ChatTransport = {
      sendMessages: vi.fn(async () => stream),
      reconnectToStream: vi.fn(),
    };

    const chat = new Chat({
      generateId: mockId(),
      transport,
    });

    const sendPromise = chat.sendMessage({ text: 'hi' });

    await waitUntil(() => chat.status === 'submitted');

    streamController.enqueue({ type: 'text-start', id: '0' });
    streamController.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });

    await waitUntil(
      () =>
        chat.status === 'streaming' &&
        chat.messages.some(message =>
          message.parts.some(
            part => part.type === 'text' && part.text === 'Hello',
          ),
        ),
    );
    // Allow the writes that made the stream active to settle before registering
    // the new "remounted" subscriber, so any notification must come from
    // subscription catch-up rather than a still-in-flight prior chunk.
    await new Promise(resolve => setTimeout(resolve, 0));

    // This models useChat remounting with experimental_throttle while the
    // external Chat instance is already streaming. The new subscriber needs an
    // immediate catch-up notification; otherwise React can remain stale until
    // some unrelated render happens.
    const onChange = vi.fn();
    const unsubscribe = chat['~registerMessagesCallback'](onChange, 150);

    await new Promise(resolve => setTimeout(resolve, 0));
    const callsAfterSubscribe = onChange.mock.calls.length;

    unsubscribe();
    streamController.enqueue({ type: 'text-end', id: '0' });
    streamController.close();
    await sendPromise;

    expect(callsAfterSubscribe).toBe(1);
  });
});
