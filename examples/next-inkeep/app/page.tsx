'use client';

import { OnFinalPayloadInkeep } from 'ai';
import { useChat } from 'ai/react';
import { useEffect, useState } from 'react';

export function isOnFinalPayloadInkeep(
  value: any,
): value is { onFinalPayload: OnFinalPayloadInkeep } {
  return (
    typeof value === 'object' && value !== null && 'onFinalPayload' in value
  );
}

export default function Chat() {
  /**
   * you can also put the chat session id in search params e.g. ?chat_session_id=123
   * or path params like /chat/123 depending on your use case
   */
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(
    undefined,
  );

  const { messages, input, handleInputChange, handleSubmit, data } = useChat({
    body: {
      chat_session_id: chatSessionId,
    },
  });

  // when data representing the final payload is received, update the chat session id
  useEffect(() => {
    if (data && data.length > 0) {
      const lastData = data[data.length - 1];
      if (isOnFinalPayloadInkeep(lastData)) {
        setChatSessionId(lastData.onFinalPayload.chat_session_id);
      }
    }
  }, [data?.length]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}
