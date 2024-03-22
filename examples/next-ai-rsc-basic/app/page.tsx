'use client';

import { useState } from 'react';
import { useUIState, useActions } from 'ai/rsc';
import type { AI } from './action';

export default function Page() {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useUIState<typeof AI>();
  const { submitUserMessage } = useActions<typeof AI>();

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>{message.display}</div>
      ))}

      <form
        onSubmit={async e => {
          e.preventDefault();

          setMessages(currentMessages => [
            ...currentMessages,
            { id: Date.now(), display: <div>{inputValue}</div> },
          ]);

          const responseMessage = await submitUserMessage(inputValue);
          setMessages(currentMessages => [...currentMessages, responseMessage]);
          setInputValue('');
        }}
      >
        <input
          placeholder="Send a message..."
          value={inputValue}
          onChange={event => {
            setInputValue(event.target.value);
          }}
        />
      </form>
    </div>
  );
}
