import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/call-tool' }),
    maxSteps: 2,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 p-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <strong>{`${message.role}: `}</strong>

            {message.parts.map((part, index) => {
              switch (part.type) {
                case 'text':
                  return <div key={index}>{part.text}</div>;
                case 'tool-invocation': {
                  return (
                    <div key={index}>
                      {JSON.stringify(part.toolInvocation.args)}
                    </div>
                  );
                }
              }
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
        className="fixed bottom-0 w-full p-2"
      >
        <input
          value={input}
          placeholder="Send message..."
          onChange={e => setInput(e.target.value)}
          className="w-full p-2 bg-zinc-100"
        />
      </form>
    </div>
  );
}
