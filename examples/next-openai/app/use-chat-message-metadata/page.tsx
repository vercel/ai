'use client';

import ChatInput from '@/components/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';
import { ExampleMetadata } from '../api/use-chat-message-metadata/example-metadata-schema';

type MyMessage = UIMessage<ExampleMetadata>;

export default function Chat() {
  const { error, status, sendMessage, messages, regenerate, stop } =
    useChat<MyMessage>({
      transport: new DefaultChatTransport({
        api: '/api/use-chat-message-metadata',
      }),
    });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.metadata?.createdAt && (
            <div>
              Created at:{' '}
              {new Date(message.metadata.createdAt).toLocaleString()}
            </div>
          )}
          {message.metadata?.duration && (
            <div>Duration: {message.metadata.duration}ms</div>
          )}
          {message.metadata?.model && (
            <div>Model: {message.metadata.model}</div>
          )}
          {message.metadata?.totalTokens && (
            <div>Total tokens: {message.metadata.totalTokens}</div>
          )}
          {message.metadata?.finishReason && (
            <div>Finish reason: {message.metadata.finishReason}</div>
          )}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mt-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
