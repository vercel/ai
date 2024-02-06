'use client';

import { useChat } from 'ai/react';
import { useEffect, useState } from 'react';
import { Message } from 'ai';
import { InkeepOnFinalMetadata, InkeepRecordsCited } from 'ai/streams';

export default function Chat() {
  /**
   * you can also put the chat session id in search params e.g. ?chatSessionId=123
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

  // SET THE INKEEP CHAT SESSION ID FROM THE CHAT DATA
  useEffect(() => {
    // get the onFinalMetadata item from the global data
    const onFinalMetadataItem = data?.find(
      item =>
        typeof item === 'object' && item !== null && 'onFinalMetadata' in item,
    ) as { onFinalMetadata: InkeepOnFinalMetadata } | undefined;

    // get the chatSessionId from the onFinalMetadata item
    const chatSessionId = onFinalMetadataItem?.onFinalMetadata?.chat_session_id;

    setChatSessionId(chatSessionId);
  }, [data]);

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => {
        return (
          <div key={m.id} className="whitespace-pre-wrap">
            <br />
            <strong>{m.role === 'user' ? 'User: ' : 'AI: '}</strong>
            {m.content}
            <Citations annotations={m.annotations} />
          </div>
        );
      })}

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

interface CitationsProps {
  annotations: Message['annotations'];
}

const Citations = ({ annotations }: CitationsProps) => {
  // get the records_cited annotation of the message
  const recordsCitedAnnotation = annotations?.find(
    item =>
      typeof item === 'object' && item !== null && 'records_cited' in item,
  ) as { records_cited: InkeepRecordsCited } | undefined;

  // get the citations from the records_cited annotation
  const citations = recordsCitedAnnotation?.records_cited?.citations;

  return (
    citations && (
      <>
        {annotations && annotations.length > 0 && (
          <div>
            <br />
            {'---SOURCES USED---'}
            <br />
            <div>
              {citations.map((citation, citationIndex) => (
                <p key={citationIndex}>
                  {citationIndex + 1}.{' '}
                  <a target="_blank" href={citation.record.url || ''}>
                    {citation.record.title}
                  </a>
                </p>
              ))}
            </div>
          </div>
        )}
      </>
    )
  );
};
