'use client';

<<<<<<< HEAD
import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const {
    error,
    input,
    status,
    handleInputChange,
    handleSubmit,
    messages,
    reload,
    stop,
  } = useChat({
    api: '/mcp/chat',
    onFinish(_message, { usage, finishReason }) {
      console.log('Usage', usage);
      console.log('FinishReason', finishReason);
    },
=======
import ChatInput from '@/component/chat-input';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function Chat() {
  const { error, status, sendMessage, messages, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/mcp/chat' }),
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(m => (
        <div key={m.id} className="whitespace-pre-wrap">
          {m.role === 'user' ? 'User: ' : 'AI: '}
<<<<<<< HEAD
          {m.content}
=======
          {m.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')}
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
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
<<<<<<< HEAD
            onClick={() => reload()}
=======
            onClick={() => regenerate()}
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
          >
            Retry
          </button>
        </div>
      )}

<<<<<<< HEAD
      <form onSubmit={handleSubmit}>
        <input
          className="fixed bottom-0 w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl"
          value={input}
          placeholder="Ask me a basic arithmetic problem"
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
      </form>
=======
      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
    </div>
  );
}
