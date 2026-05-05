'use client';

import { useChat } from '@ai-sdk/react';
import ChatInput from '@/component/chat-input';
import type { BrowserUseAgentUIMessage } from '@/agent/browser-use-agent';
import BrowserTaskView from '@/component/browser-task-view';

export default function Chat() {
  const { status, sendMessage, messages } = useChat<BrowserUseAgentUIMessage>();

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      {messages?.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;

              case 'step-start':
                return index > 0 ? (
                  <div key={index} className="text-gray-500">
                    <hr className="my-2 border-gray-300" />
                  </div>
                ) : null;

              case 'tool-runBrowserTask': {
                return <BrowserTaskView key={index} invocation={part} />;
              }
            }
          })}
          <br />
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
