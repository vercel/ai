'use client';

import { Response } from '@/components/ai-elements/response';
import { useChatId } from '@/components/chat-id-provider';
import ChatInput from '@/components/chat-input';
import NewSessionDialog from '@/components/new-session-dialog';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import HarnessToolView from '@/components/tool/harness-tool-view';
import ToolApprovalControls from '@/components/tool/tool-approval-controls';
import { createAgentSession } from '@/lib/create-agent-session';
import { getHarnessLabel } from '@/lib/harness';
import {
  readStoredAgentSession,
  writeStoredAgentSession,
} from '@/lib/stored-agent-session';
import {
  readStoredChatState,
  writeStoredChatState,
  type QueuedPrompt,
} from '@/lib/stored-chat-state';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getStaticToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type FileUIPart,
  type TextUIPart,
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
 * Counts the `steering-message` parts in an assistant message.
 */
function countSteeringMessages(parts: UIMessage['parts']): number {
  let count = 0;
  for (const part of parts) {
    if (part.type === 'steering-message') {
      count++;
    }
  }
  return count;
}

/**
 * Chat with the agent session of the current browser tab, on the harness
 * the session runs on. Each agent configuration has its own routes under
 * `/api/harness/<harness>/<configuration>`.
 */
export default function HarnessChat<MESSAGE extends UIMessage>({
  exampleLabel,
  PartView,
}: {
  exampleLabel: string;
  PartView: ComponentType<{ part: MESSAGE['parts'][number] }>;
}) {
  const { chatId, harness, configuration } = useChatId();
  const apiBase = `/api/harness/${harness}/${configuration}`;
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | undefined>();
  const [restored] = useState(() => readStoredChatState<MESSAGE>({ chatId }));
  /*
   * An API response that was in progress before a reload is read again from
   * its start via `readStream()`, so its partial assistant message is dropped
   * here and replaced by the reconnected stream replay.
   */
  const [initialMessages] = useState(() => {
    if (restored == null) return [];
    const { messages, turnInProgress } = restored;
    return turnInProgress && messages.at(-1)?.role === 'assistant'
      ? messages.slice(0, -1)
      : messages;
  });
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>(
    () => restored?.queuedPrompts ?? [],
  );
  const [resumePending, setResumePending] = useState(
    restored?.turnInProgress ?? false,
  );
  const {
    error,
    status,
    sendMessage,
    messages,
    regenerate,
    resumeStream,
    addToolApprovalResponse,
  } = useChat<MESSAGE>({
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
        let session = readStoredAgentSession({ chatId });
        if (session == null) {
          session = await createAgentSession({
            harness,
            chatId,
            configuration,
          });
          writeStoredAgentSession({ chatId, session });
        }
        const { sessionId, sandboxId, runId } = session;
        return { session: { sessionId, sandboxId, runId } };
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
    /*
     * Tool approval responses go back to the server with the chat's next
     * request, as a trailing tool message, which continues the turn that
     * waits for them.
     */
    sendAutomaticallyWhen: options =>
      lastAssistantMessageIsCompleteWithToolCalls(options) ||
      lastAssistantMessageIsCompleteWithApprovalResponses(options),
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
    if (queuedPrompts.length === 0) return;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== 'assistant') return;

    const steeringCount = countSteeringMessages(lastMessage.parts);
    const hasDelivered = queuedPrompts.some(
      item => steeringCount > item.queuedAtSteeringCount || !turnInProgress,
    );
    if (!hasDelivered) return;

    setQueuedPrompts(current =>
      current.filter(
        item => steeringCount <= item.queuedAtSteeringCount && turnInProgress,
      ),
    );
  }, [messages, queuedPrompts, turnInProgress]);

  useEffect(() => {
    writeStoredChatState({
      chatId,
      state: { messages, turnInProgress, queuedPrompts },
    });
  }, [chatId, messages, turnInProgress, queuedPrompts]);

  async function crash() {
    setAlertMessage(undefined);
    const stored = readStoredAgentSession({ chatId });
    if (stored == null) {
      setAlertMessage('No current drive to crash');
      return;
    }
    try {
      const response = await fetch(`${apiBase}/crash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: stored.runId }),
      });
      if (!response.ok) {
        setAlertMessage(
          (await response.text()) || `Crash failed: ${response.status}`,
        );
      }
    } catch (crashError) {
      setAlertMessage(
        crashError instanceof Error ? crashError.message : String(crashError),
      );
    }
  }

  /*
   * Cancels the session's running turn. The turn's stream then ends like
   * any finished turn, once the drive running it noticed the cancel.
   */
  async function cancel() {
    setAlertMessage(undefined);
    const stored = readStoredAgentSession({ chatId });
    if (stored == null) {
      setAlertMessage('No running turn to cancel');
      return;
    }
    try {
      const response = await fetch(`${apiBase}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: stored.runId }),
      });
      if (!response.ok) {
        setAlertMessage(
          (await response.text()) || `Cancel failed: ${response.status}`,
        );
      }
    } catch (cancelError) {
      setAlertMessage(
        cancelError instanceof Error
          ? cancelError.message
          : String(cancelError),
      );
    }
  }

  /*
   * Queues a follow-up prompt into the running session. The server commits the
   * prompt submission before returning headers; the active chat stream
   * continues past the current turn into the follow-up turn, so the secondary
   * response body is cancelled once accepted.
   */
  async function queue(parts: Array<TextUIPart | FileUIPart>) {
    setAlertMessage(undefined);
    const stored = readStoredAgentSession({ chatId });
    if (stored == null) {
      setAlertMessage('No active session to queue into');
      return;
    }
    const lastMessage = messages.at(-1);
    const currentSteeringCount =
      lastMessage?.role === 'assistant'
        ? countSteeringMessages(lastMessage.parts)
        : 0;
    const queuedPrompt: QueuedPrompt = {
      id: crypto.randomUUID(),
      parts,
      queuedAtSteeringCount: currentSteeringCount,
    };
    setQueuedPrompts(current => [...current, queuedPrompt]);
    try {
      const { sessionId, sandboxId, runId } = stored;
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: chatId,
          session: { sessionId, sandboxId, runId },
          messages: [
            {
              id: queuedPrompt.id,
              role: 'user',
              parts,
            },
          ],
        }),
      });
      if (!response.ok) {
        setQueuedPrompts(current =>
          current.filter(item => item.id !== queuedPrompt.id),
        );
        setAlertMessage(
          (await response.text()) || `Queue failed: ${response.status}`,
        );
        return;
      }
      void response.body?.cancel();
    } catch (queueError) {
      setQueuedPrompts(current =>
        current.filter(item => item.id !== queuedPrompt.id),
      );
      setAlertMessage(
        queueError instanceof Error ? queueError.message : String(queueError),
      );
    }
  }

  function steer() {
    setAlertMessage('Steer is not implemented yet.');
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

      {alertMessage && (
        <p role="alert" className="mb-4 text-sm text-red-500">
          {alertMessage}
        </p>
      )}

      {messages.map(message => (
        <div key={message.id} className="mb-3">
          <strong>{message.role === 'user' ? 'You: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => (
            <div key={index}>
              <PartView part={part} />
              <ToolApprovalControls
                part={part}
                addToolApprovalResponse={addToolApprovalResponse}
              />
            </div>
          ))}
        </div>
      ))}

      {queuedPrompts.map(queued => (
        <div
          key={queued.id}
          data-queued-prompt="true"
          className="mb-3 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-gray-600"
        >
          <div className="mb-1 flex items-center gap-2">
            <strong>You: </strong>
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">
              Queued
            </span>
          </div>
          {queued.parts.map((part, index) => (
            <div key={index}>
              <PartView part={part as MESSAGE['parts'][number]} />
            </div>
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
        cancel={() => void cancel()}
        onQueue={parts => queue(parts)}
        onSteer={() => steer()}
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
 * reasoning, images and dynamic tools. Static tools without a specialized
 * view use a generic tool view. Returns `null` for any other part.
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
    case 'steering-message': {
      return (
        <div
          data-delivered-prompt="true"
          className="p-2 my-3 bg-gray-50 rounded border border-gray-200"
        >
          <strong>You: </strong>
          {part.parts.map((content, index) => (
            <div key={index}>
              <CommonPartView part={content} />
            </div>
          ))}
        </div>
      );
    }
    default: {
      if (isStaticToolUIPart(part)) {
        return (
          <HarnessToolView
            toolName={getStaticToolName(part)}
            input={part.input}
            state={part.state}
            output={part.state === 'output-available' ? part.output : undefined}
            errorText={
              part.state === 'output-error' ? part.errorText : undefined
            }
            approval={part.approval}
          />
        );
      }
      return null;
    }
  }
}
