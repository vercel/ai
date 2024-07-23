import { Message, useAssistant } from 'ai/react';
import { useEffect, useState } from 'react';

export default function Page() {
  const {
    status,
    messages,
    input,
    submitMessage,
    handleInputChange,
    threadId,
    setThreadId,
  } = useAssistant({ api: '/api/assistant' });

  const [threads, setThreads] = useState<string[]>([
    'thread_wFjFAc6llmI2DaVvaRs6en0z',
    'thread_o1KXo6qCtb12A5GaVCx1X5YL',
    'thread_jrANWD0rR4QWoIV5Lxq6YFrD',
  ]);

  useEffect(() => {
    if (threadId !== undefined) {
      if (!threads.includes(threadId)) {
        setThreads([...threads, threadId]);
      }
    }
  }, [threadId, threads]);

  return (
    <div className="flex flex-row" style={{ height: '100dvh' }}>
      <div className="w-56 flex-shrink-0 flex flex-col gap-1 bg-zinc-100 p-2">
        <div
          className={`py-1 px-2 text-zinc-900 hover:bg-zinc-300 cursor-pointer rounded-md ${
            threadId === undefined ? 'bg-zinc-300 p-1' : ''
          }`}
          onClick={() => {
            setThreadId(undefined);
          }}
        >
          new thread
        </div>

        {threads.map((thread, index) => (
          <div
            key={thread}
            className={`py-1 px-2 text-zinc-900 hover:bg-zinc-300 cursor-pointer rounded-md ${
              threadId === thread ? 'bg-zinc-300' : ''
            }`}
            onClick={() => {
              setThreadId(thread);
            }}
          >
            thread {index + 1}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 w-full relative">
        <div className="p-2">status: {status}</div>

        <div className="flex flex-col p-2 gap-2">
          {messages.map((message: Message) => (
            <div key={message.id} className="flex flex-row gap-2">
              <div className="w-24 text-zinc-500">{`${message.role}: `}</div>
              <div className="w-full">{message.content}</div>
            </div>
          ))}
        </div>

        <form onSubmit={submitMessage} className="absolute bottom-0 p-2 w-full">
          <input
            className="bg-zinc-100 w-full p-2 rounded-md"
            placeholder="Send message..."
            value={input}
            onChange={handleInputChange}
            disabled={status !== 'awaiting_message'}
          />
        </form>
      </div>
    </div>
  );
}
