import { cleanup, render, screen } from '@testing-library/react';
import React, { act, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chat } from './chat.react';
import { useChat } from './use-chat';

const message = (id: string, text: string) => ({
  id,
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

describe('useChat with externally provided Chat instances', () => {
  afterEach(cleanup);

  it('resubscribes message updates when the chat instance changes but the id stays the same', () => {
    const firstChat = new Chat({
      id: 'same-chat-id',
      messages: [message('first', 'first chat')],
    });

    const secondChat = new Chat({
      id: 'same-chat-id',
      messages: [message('second', 'second chat')],
    });

    let replaceWithSecondChat!: () => void;
    let updateFirstChat!: () => void;
    let updateSecondChat!: () => void;

    function TestComponent() {
      const [chat, setChat] = useState(firstChat);
      const { messages } = useChat({ chat });

      replaceWithSecondChat = () => setChat(secondChat);
      updateFirstChat = () => {
        firstChat.messages = [
          ...firstChat.messages,
          message('first-update', 'first chat update'),
        ];
      };
      updateSecondChat = () => {
        secondChat.messages = [
          ...secondChat.messages,
          message('second-update', 'second chat update'),
        ];
      };

      return (
        <div data-testid="messages">
          {messages.map(message => message.parts[0].text).join(',')}
        </div>
      );
    }

    render(<TestComponent />);

    expect(screen.getByTestId('messages')).toHaveTextContent('first chat');

    act(() => {
      replaceWithSecondChat();
    });

    expect(screen.getByTestId('messages')).toHaveTextContent('second chat');

    act(() => {
      updateSecondChat();
    });

    expect(screen.getByTestId('messages')).toHaveTextContent(
      'second chat update',
    );

    act(() => {
      updateFirstChat();
    });

    expect(screen.getByTestId('messages')).not.toHaveTextContent(
      'first chat update',
    );
  });
});
