import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { mockId } from '@ai-sdk/provider-utils/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessageChunk } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { Chat } from './chat.react';
import { useChat } from './use-chat';

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/chat': {},
});

describe('issue #8597: useChat onData with a shared Chat instance', () => {
  afterEach(() => {
    cleanup();
  });

  it('forwards transient data parts to the useChat onData callback when a shared Chat is supplied', async () => {
    const chatLevelOnDataCalls: unknown[] = [];
    const hookLevelOnDataCalls: unknown[] = [];

    const sharedChat = new Chat({
      generateId: mockId(),
      onData: data => {
        chatLevelOnDataCalls.push(data);
      },
    });

    function TestComponent() {
      const { sendMessage } = useChat({
        chat: sharedChat,
        // Issue #8597: this callback was previously ignored when `chat` was
        // supplied, even though transient data was received by the Chat itself.
        onData: data => {
          hookLevelOnDataCalls.push(data);
        },
      });

      return (
        <button
          data-testid="send"
          onClick={() => {
            sendMessage({ parts: [{ type: 'text', text: 'hello' }] });
          }}
        >
          send
        </button>
      );
    }

    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'start' }),
        formatChunk({
          type: 'data-test',
          data: 'transient-data-from-server',
          transient: true,
        }),
        formatChunk({ type: 'finish' }),
      ],
    };

    render(<TestComponent />);

    await userEvent.click(screen.getByTestId('send'));

    await waitFor(() => {
      expect(chatLevelOnDataCalls).toStrictEqual([
        {
          type: 'data-test',
          data: 'transient-data-from-server',
          transient: true,
        },
      ]);
    });

    expect(hookLevelOnDataCalls).toStrictEqual([
      {
        type: 'data-test',
        data: 'transient-data-from-server',
        transient: true,
      },
    ]);
  });

  it('forwards data parts to every useChat hook sharing the same Chat instance', async () => {
    const firstHookCalls: unknown[] = [];
    const secondHookCalls: unknown[] = [];

    const sharedChat = new Chat({
      generateId: mockId(),
    });

    function TestComponent() {
      const { sendMessage } = useChat({
        chat: sharedChat,
        onData: data => {
          firstHookCalls.push(data);
        },
      });

      useChat({
        chat: sharedChat,
        onData: data => {
          secondHookCalls.push(data);
        },
      });

      return (
        <button
          data-testid="send"
          onClick={() => {
            sendMessage({ parts: [{ type: 'text', text: 'hello' }] });
          }}
        >
          send
        </button>
      );
    }

    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'start' }),
        // a persisted (non-transient) data part
        formatChunk({ type: 'data-test', data: 'persisted-data' }),
        formatChunk({ type: 'finish' }),
      ],
    };

    render(<TestComponent />);

    await userEvent.click(screen.getByTestId('send'));

    const expected = [{ type: 'data-test', data: 'persisted-data' }];

    await waitFor(() => {
      expect(firstHookCalls).toStrictEqual(expected);
    });
    expect(secondHookCalls).toStrictEqual(expected);
  });
});
