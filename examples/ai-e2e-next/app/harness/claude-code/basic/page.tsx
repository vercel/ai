'use client';

import type { ClaudeCodeHarnessAgentMessage } from '@/agent/harness/claude-code-agent';
import { Response } from '@/components/ai-elements/response';
import ChatInput from '@/components/chat-input';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import HarnessBashView from '@/components/tool/harness-bash-view';
import HarnessFileToolView from '@/components/tool/harness-file-tool-view';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'harness-claude-code-basic-chat-id';

/*
 * Cross-process harness session resume demo.
 *
 * The chat id is stashed in localStorage so a page reload (or returning
 * to this route in a new tab) continues the same conversation. The
 * server route persists the harness `HarnessV1ResumeState` keyed by
 * chatId, so even if the Node process serving the next request is
 * different from the one that served the previous one, the conversation
 * picks up where it left off.
 */
export default function HarnessClaudeCodePage() {
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      setChatId(existing);
      return;
    }
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    setChatId(fresh);
  }, []);

  if (!chatId) {
    return null;
  }

  return (
    <Chat
      chatId={chatId}
      onReset={() => {
        window.localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    />
  );
}

function Chat({ chatId, onReset }: { chatId: string; onReset: () => void }) {
  const { error, status, sendMessage, messages, regenerate } =
    useChat<ClaudeCodeHarnessAgentMessage>({
      id: chatId,
      transport: new DefaultChatTransport({
        api: '/api/harness/claude-code/basic',
      }),
    });

  return (
    <div className="flex flex-col pt-12 pb-24 mx-auto w-full max-w-md stretch">
      <h1 className="mb-2 text-xl font-bold">Harness — Claude Code</h1>
      <p className="mb-4 text-xs text-gray-500">
        chat id: <code>{chatId}</code>
        <button type="button" className="ml-2 underline" onClick={onReset}>
          new session
        </button>
      </p>

      {messages.map(message => (
        <div key={message.id} className="mb-3">
          <strong>{message.role === 'user' ? 'You: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return <Response key={index}>{part.text}</Response>;
              }
              case 'reasoning': {
                return (
                  <Response
                    key={index}
                    className="italic text-gray-500 whitespace-pre-wrap"
                  >
                    {part.text}
                  </Response>
                );
              }
              case 'file':
              case 'reasoning-file': {
                if (part.mediaType.startsWith('image/')) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={index} src={part.url} alt="Generated image" />
                  );
                }
                return null;
              }
              case 'tool-bash': {
                return <HarnessBashView invocation={part} key={index} />;
              }
              case 'tool-read':
              case 'tool-write':
              case 'tool-edit': {
                return <HarnessFileToolView key={index} invocation={part} />;
              }
              case 'dynamic-tool': {
                return <DynamicToolView invocation={part} key={index} />;
              }
            }
          })}
        </div>
      ))}

      {status === 'submitted' && (
        <div
          aria-label="Loading"
          className="w-4 h-4 mb-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin"
        />
      )}

      {error && (
        <div className="mt-4">
          <div className="text-red-500 whitespace-pre-wrap break-words">
            {error.message || String(error)}
          </div>
          <button
            type="button"
            className="px-4 py-2 mt-4 text-blue-500 rounded-md border border-blue-500"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none"
      />

      <ChatInput status={status} onSubmit={text => sendMessage({ text })} />
    </div>
  );
}
