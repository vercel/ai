import { mockId } from '@ai-sdk/provider-utils/test';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Chat } from './chat.react';
import { useChat } from './use-chat';

function streamFromChunks(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('issue #8597', () => {
  it('calls useChat onData when a shared Chat receives a transient data part', async () => {
    const chatOnDataCalls: unknown[] = [];
    const useChatOnDataCalls: unknown[] = [];

    const transport: ChatTransport<UIMessage> = {
      sendMessages: async () =>
        streamFromChunks([
          { type: 'start', messageId: 'assistant-0' },
          { type: 'start-step' },
          {
            type: 'data-test',
            data: 'transient payload',
            transient: true,
          },
          { type: 'finish-step' },
          { type: 'finish' },
        ]),
      reconnectToStream: async () => null,
    };

    const sharedChat = new Chat({
      id: 'shared-chat',
      generateId: mockId(),
      transport,
      onData: data => {
        chatOnDataCalls.push(data);
      },
    });

    function TestComponent() {
      const { sendMessage, status } = useChat({
        chat: sharedChat,
        // Reproduction for issue #8597: this hook-level callback is expected to
        // observe transient data parts even when a shared Chat instance is used.
        onData: data => {
          useChatOnDataCalls.push(data);
        },
      } as Parameters<typeof useChat>[0]);

      return (
        <>
          <div data-testid="status">{status}</div>
          <button
            data-testid="send"
            onClick={() => {
              sendMessage({ text: 'hello' });
            }}
          />
        </>
      );
    }

    render(<TestComponent />);

    await userEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(chatOnDataCalls).toStrictEqual([
        {
          type: 'data-test',
          data: 'transient payload',
          transient: true,
        },
      ]);
    });

    expect(useChatOnDataCalls).toStrictEqual([
      {
        type: 'data-test',
        data: 'transient payload',
        transient: true,
      },
    ]);
  });
});
