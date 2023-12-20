'use client';

import { useChat } from 'ai/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useHandleEvents from './utils/useHandleEvents';
import { InkeepRecordsCitedData, OnFinalInkeepMetadata } from 'ai';

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

  const inkeepEventHandlers = useMemo(
    () => ({
      onFinalMetadata: (metadata: OnFinalInkeepMetadata) => {
        setChatSessionId(metadata.chat_session_id);
      },
      // onRecordsCited: (records: InkeepRecordsCitedData) => {
      //   // console.log(records); // list of records used in the conversation
      // },
    }),
    [setChatSessionId],
  );

  useHandleEvents(data, inkeepEventHandlers);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
          {m.data?.toString()}
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
