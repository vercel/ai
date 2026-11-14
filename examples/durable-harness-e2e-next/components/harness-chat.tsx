'use client';

import { Response } from '@/components/ai-elements/response';
import { useChatId } from '@/components/chat-id-provider';
import ChatInput from '@/components/chat-input';
import NewSessionDialog from '@/components/new-session-dialog';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import { createAgentSession } from '@/lib/create-agent-session';
import { getHarnessLabel } from '@/lib/harness';
import {
  readStoredAgentSession,
  writeStoredAgentSession,
} from '@/lib/stored-agent-session';
import {
  readStoredChatState,
  writeStoredChatState,
} from '@/lib/stored-chat-state';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import { useEffect, useState, type ComponentType } from 'react';

/**
 * Delay before reconnecting to a turn after its stream disconnected.
 */
const RECONNECT_DELAY_MS = 2000;

/**
 * Returns whether a chat error is a network disconnect, which the chat can
 * recover from by reconnecting to the turn (matching how `useChat` detects
 * resumable disconnects).
 */
function isDisconnectError(error: Error | undefined): boolean {
  if (error?.name !== 'TypeError') return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('fetch') ||
    message.includes('network') ||
    message === 'load failed'
  );
}

/**
 * Chat with the agent session of the current browser tab, on the harness
 * the session runs on. The harness's routes live under `/api/<harness>`.
 */
export default function HarnessChat<MESSAGE extends UIMessage>({
  exampleLabel,
  PartView,
}: {
  exampleLabel: string;
  PartView: ComponentType<{ part: MESSAGE['parts'][number] }>;
}) {
  const { chatId, harness } = useChatId();
  const apiBase = `/api/${harness}`;
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [crashMessage, setCrashMessage] = useState<string | undefined>();
  const [restored] = useState(() => readStoredChatState<MESSAGE>({ chatId }));
  /*
   * A turn that was in progress before a reload is read again from its
   * start, so its partial response is dropped here and replaced by the one
   * the reconnected stream replays.
   */
  const [initialMessages] = useState(() => {
    if (restored == null) return [];
    const { messages, turnInProgress } = restored;
    return turnInProgress && messages.at(-1)?.role === 'assistant'
      ? messages.slice(0, -1)
      : messages;
  });
  const [resumePending, setResumePending] = useState(
    restored?.turnInProgress ?? false,
  );
  const { error, status, sendMessage, messages, regenerate, resumeStream } =
    useChat<MESSAGE>({
      id: chatId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: `${apiBase}/chat`,
        /*
         * The agent session is usually created when the session is started
         * from the new session dialog. The first chat of a browser tab has
         * none yet, so it creates its session when its first prompt is sent.
         * Every later prompt reuses the session from session storage.
         */
        body: async () => {
          const stored = readStoredAgentSession({ chatId });
          if (stored != null) return { session: stored };

          const session = await createAgentSession({ harness, chatId });
          writeStoredAgentSession({ chatId, session });
          return { session };
        },
        /*
         * Reconnecting reads the session's latest turn from its start, so
         * the turn's output keeps appearing after the process that streamed
         * it crashed.
         */
        prepareReconnectToStreamRequest: ({ api, id }) => {
          const stored = readStoredAgentSession({ chatId });
          const params = new URLSearchParams(
            stored == null ? {} : { runId: stored.runId },
          );
          return {
            api: `${api}/${encodeURIComponent(id)}/stream?${params}`,
          };
        },
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

  /*
   * After a disconnect, e.g. because the server crashed, keep reconnecting
   * to the turn until the server is back. Each failed attempt sets a new
   * error, which schedules the next one.
   */
  const disconnected = status === 'error' && isDisconnectError(error);
  useEffect(() => {
    if (!disconnected) return;
    const timer = setTimeout(() => void resumeStream(), RECONNECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [disconnected, error, resumeStream]);

  /*
   * Reconnects once on mount to a turn that was in progress before a reload.
   * `resumePending` stays set until the reconnected stream ends, so that a
   * reload in between still finds the turn marked as in progress. A
   * reconnect that the effect's cleanup superseded (e.g. React's development
   * double mount, which also stops the chat's request) must not clear it,
   * since the reconnect replacing it may still wait for the server.
   */
  useEffect(() => {
    if (!resumePending) return;
    let superseded = false;
    void resumeStream().finally(() => {
      if (!superseded) setResumePending(false);
    });
    return () => {
      superseded = true;
    };
  }, []);

  const turnInProgress =
    resumePending ||
    disconnected ||
    status === 'submitted' ||
    status === 'streaming';
  useEffect(() => {
    writeStoredChatState({ chatId, state: { messages, turnInProgress } });
  }, [chatId, messages, turnInProgress]);

  async function crash() {
    setCrashMessage(undefined);
    const stored = readStoredAgentSession({ chatId });
    if (stored == null) {
      setCrashMessage('No current drive to crash');
      return;
    }
    try {
      const response = await fetch(`${apiBase}/crash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: stored.runId }),
      });
      if (!response.ok) {
        setCrashMessage(
          (await response.text()) || `Crash failed: ${response.status}`,
        );
      }
    } catch (crashError) {
      setCrashMessage(
        crashError instanceof Error ? crashError.message : String(crashError),
      );
    }
  }

  return (
    <div className="flex flex-col pt-12 pb-24 mx-auto w-full max-w-5xl stretch">
      <h1 className="mb-2 text-xl font-bold">
        {getHarnessLabel({ harness })} — {exampleLabel}
      </h1>
      <p className="mb-4 text-xs text-gray-500">
        chat id: <code>{chatId}</code>
        <button
          type="button"
          className="ml-2 underline"
          onClick={() => setNewSessionDialogOpen(true)}
        >
          new session
        </button>
        <button
          type="button"
          className="px-2 py-0.5 ml-2 text-red-600 rounded border border-red-600"
          onClick={() => void crash()}
        >
          Crash
        </button>
      </p>

      {newSessionDialogOpen && (
        <NewSessionDialog onClose={() => setNewSessionDialogOpen(false)} />
      )}

      {crashMessage && (
        <p role="alert" className="mb-4 text-sm text-red-500">
          {crashMessage}
        </p>
      )}

      {messages.map(message => (
        <div key={message.id} className="mb-3">
          <strong>{message.role === 'user' ? 'You: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => (
            <PartView key={index} part={part} />
          ))}
        </div>
      ))}

      {status === 'submitted' && (
        <div
          aria-label="Loading"
          className="w-4 h-4 mb-3 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin"
        />
      )}

      {disconnected && (
        <div className="mb-3 text-sm text-gray-500">
          Connection lost. Reconnecting…
        </div>
      )}

      {error && !disconnected && (
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

      <ChatInput
        status={status}
        maxWidth="5xl"
        onSubmit={parts =>
          /*
           * Text and file parts belong to every message type, which
           * TypeScript cannot prove for the generic message type.
           */
          sendMessage({ parts } as Parameters<typeof sendMessage>[0])
        }
      />
    </div>
  );
}

/**
 * Renders the message parts that look the same on every harness: text,
 * reasoning, images and dynamic tools. Returns `null` for any other part.
 */
export function CommonPartView({ part }: { part: UIMessage['parts'][number] }) {
  switch (part.type) {
    case 'text': {
      return <Response className="mb-2">{part.text}</Response>;
    }
    case 'reasoning': {
      return (
        <Response className="italic text-gray-500 whitespace-pre-wrap mb-2">
          {part.text}
        </Response>
      );
    }
    case 'file':
    case 'reasoning-file': {
      if (part.mediaType.startsWith('image/')) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={part.url}
            alt="Image attachment"
            className="mb-2 max-w-full max-h-64 rounded"
          />
        );
      }
      return null;
    }
    case 'dynamic-tool': {
      return <DynamicToolView invocation={part} />;
    }
    default: {
      return null;
    }
  }
}
