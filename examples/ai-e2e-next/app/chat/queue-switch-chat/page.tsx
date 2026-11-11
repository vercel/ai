'use client';

import { useChat, type UIMessage } from '@ai-sdk/react';
import type { ChatTransport, UIMessageChunk } from 'ai';
import { useRef, useState } from 'react';

type Workspace = 'a' | 'b';

function getText(message: UIMessage) {
  return message.parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('');
}

export default function QueueSwitchChat() {
  const [workspace, setWorkspace] = useState<Workspace>('a');
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const [text, setText] = useState('');
  const finishToolCall = useRef<() => void>(undefined);

  // each workspace has its own transport. it records what it receives and
  // answers with a client-side tool call that stays open until it is stopped:
  const transport: ChatTransport<UIMessage> = {
    sendMessages: async ({ chatId, messages, abortSignal }) => {
      setRequestLog(log => [
        ...log,
        `workspace ${workspace} transport received chat ${chatId}: ${messages
          .map(message => `${message.role}: ${getText(message)}`)
          .join(' | ')}`,
      ]);

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({ type: 'start-step' });
          controller.enqueue({
            type: 'tool-input-available',
            toolCallId: `call-${Date.now()}`,
            toolName: 'confirm',
            input: {},
          });
          abortSignal?.addEventListener('abort', () => controller.close());
        },
      });
    },
    reconnectToStream: async () => null,
  };

  const {
    status,
    messages,
    experimental_queuedMessages,
    sendMessage,
    experimental_sendQueuedMessageNow,
  } = useChat({
    id: workspace,
    transport,
    experimental_queue: true,
    // a slow client-side tool, e.g. waiting for the user to confirm:
    onToolCall: () =>
      new Promise<void>(resolve => {
        finishToolCall.current = resolve;
      }),
  });

  return (
    <div className="flex flex-col py-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-4 text-xl font-bold">
        Switching chats while a queued message is sent now
      </h1>
      <ol className="mb-6 text-sm list-decimal list-inside text-gray-600">
        <li>Send a message in workspace A.</li>
        <li>Queue a follow-up and click &quot;Send now&quot;.</li>
        <li>Switch to workspace B.</li>
        <li>Finish the tool call.</li>
      </ol>

      <div className="flex gap-2 items-center mb-4">
        <span>
          Workspace: <strong>{workspace.toUpperCase()}</strong> ({status})
        </span>
        <button
          type="button"
          className="px-3 py-1 rounded border border-gray-300"
          onClick={() => setWorkspace('b')}
        >
          Switch to workspace B
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded border border-gray-300"
          onClick={() => finishToolCall.current?.()}
        >
          Finish tool call
        </button>
      </div>

      {messages.map(message => (
        <div key={message.id} className="mb-2 whitespace-pre-wrap">
          <strong>{message.role === 'user' ? 'User: ' : 'AI: '}</strong>
          {message.role === 'user' ? getText(message) : '(calling a tool)'}
        </div>
      ))}

      {experimental_queuedMessages.map(message => (
        <div
          key={message.id}
          className="flex gap-2 items-center p-2 mb-2 text-sm rounded border border-dashed border-gray-300"
        >
          <span className="flex-1">Queued: {getText(message)}</span>
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={() => experimental_sendQueuedMessageNow(message.id)}
          >
            Send now
          </button>
        </div>
      ))}

      <form
        className="flex gap-2 mt-2"
        onSubmit={event => {
          event.preventDefault();
          if (text.trim() === '') return;
          sendMessage({ text });
          setText('');
        }}
      >
        <input
          className="flex-1 p-2 rounded border border-gray-300"
          placeholder="Type a message..."
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <button
          type="submit"
          className="px-3 py-2 rounded border border-gray-300"
        >
          Send
        </button>
      </form>

      <h2 className="mt-8 mb-2 font-bold">Requests</h2>
      <ul data-testid="request-log" className="text-sm">
        {requestLog.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
