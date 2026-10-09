import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { render } from 'svelte/server';
import ChatResume from './tests/chat-resume.svelte';
import { expect, it, vi } from 'vitest';

it('should not resume a stream during server-side rendering', () => {
  const reconnectToStream = vi.fn(async () => null);
  const transport = {
    sendMessages: async () => new ReadableStream<UIMessageChunk>(),
    reconnectToStream,
  } satisfies ChatTransport<UIMessage>;

  render(ChatResume, {
    props: {
      options: {
        id: 'chat-id',
        resume: true,
        transport,
      },
    },
  });

  expect(reconnectToStream).not.toHaveBeenCalled();
});
