'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatInput from '@/component/chat-input';
import { WeatherWithApprovalAgentUIMessage } from '@/agent/weather-with-approval-agent';
import WeatherWithApprovalView from '@/component/weather-with-approval-view';

export default function TestToolApproval() {
  const { status, sendMessage, messages } =
    useChat<WeatherWithApprovalAgentUIMessage>({
      transport: new DefaultChatTransport({ api: '/api/chat-tool-approval' }),
    });

  console.log(structuredClone(messages));

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">Tool Approval Test</h1>

      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-weather':
                return (
                  <WeatherWithApprovalView
                    key={index}
                    invocation={part}
                    sendApprovalResponse={() => {
                      console.log('sendApprovalResponse');
                    }}
                  />
                );
            }
          })}
        </div>
      ))}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
