'use client';

import { Message } from 'ai/react';
import { useChat } from 'ai/react';
import { ChatRequest, FunctionCallHandler, nanoid } from 'ai';

function useAssistant() {
  const call = async () => {
    await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: ['Hello'] }),
    });
  };

  return { threadId: undefined, messages: [], call };
}

export default function Chat() {
  const { messages, call } = useAssistant();

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <form onSubmit={() => {}}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          // value={'current input'}
          placeholder="Say something..."
          onChange={() => {
            call();
          }}
        />
      </form>
    </div>
  );
}
