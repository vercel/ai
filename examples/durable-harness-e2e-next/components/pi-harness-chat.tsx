'use client';

import type { PiHarnessAgentMessage } from '@/agent/pi/basic';
import { Response } from '@/components/ai-elements/response';
import { useChatId } from '@/components/chat-id-provider';
import ChatInput from '@/components/chat-input';
import DynamicToolView from '@/components/tool/dynamic-tool-view';
import HarnessBashToolView from '@/components/tool/harness-bash-tool-view';
import HarnessFileToolView from '@/components/tool/harness-file-tool-view';
import HarnessToolView from '@/components/tool/harness-tool-view';
import {
  isStoredAgentSession,
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
} from 'ai';
import { useEffect, useState } from 'react';

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
 * Converts the output of a Pi built-in tool (the content Pi shows the model)
 * to the plain text the tool views render.
 */
function toOutputText(output: unknown): unknown {
  if (
    typeof output !== 'object' ||
    output == null ||
    !Array.isArray((output as { content?: unknown }).content)
  ) {
    return output;
  }
  return (
    output as { content: Array<{ type?: string; text?: unknown }> }
  ).content
    .filter(item => item.type === 'text')
    .map(item => String(item.text ?? ''))
    .join('\n');
}

export default function PiHarnessChat({
  apiRoute,
  exampleLabel,
}: {
  apiRoute: string;
  exampleLabel: string;
}) {
  const { chatId, resetChatId } = useChatId();
  const [crashMessage, setCrashMessage] = useState<string | undefined>();
  const [restored] = useState(() =>
    readStoredChatState<PiHarnessAgentMessage>({ chatId }),
  );
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
    useChat<PiHarnessAgentMessage>({
      id: chatId,
      messages: initialMessages,
      transport: new DefaultChatTransport({
        api: apiRoute,
        /*
         * The agent session is created when the chat's first prompt is sent,
         * and kept in session storage for every later prompt.
         */
        body: async () => {
          const stored = readStoredAgentSession({ chatId });
          if (stored != null) return { session: stored };

          const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId }),
          });
          if (!response.ok) {
            throw new Error(
              `Failed to create a session: ${response.status} ${await response.text()}`,
            );
          }
          const session: unknown = await response.json();
          if (!isStoredAgentSession(session)) {
            throw new Error('Failed to create a session: invalid response.');
          }
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
      const response = await fetch('/api/crash', {
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
      <h1 className="mb-2 text-xl font-bold">Pi — {exampleLabel}</h1>
      <p className="mb-4 text-xs text-gray-500">
        chat id: <code>{chatId}</code>
        <button type="button" className="ml-2 underline" onClick={resetChatId}>
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

      {crashMessage && (
        <p role="alert" className="mb-4 text-sm text-red-500">
          {crashMessage}
        </p>
      )}

      {messages.map(message => (
        <div key={message.id} className="mb-3">
          <strong>{message.role === 'user' ? 'You: ' : 'AI: '}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return (
                  <Response key={index} className="mb-2">
                    {part.text}
                  </Response>
                );
              }
              case 'reasoning': {
                return (
                  <Response
                    key={index}
                    className="italic text-gray-500 whitespace-pre-wrap mb-2"
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
                    <img
                      key={index}
                      src={part.url}
                      alt="Image attachment"
                      className="mb-2 max-w-full max-h-64 rounded"
                    />
                  );
                }
                return null;
              }
              case 'tool-bash': {
                return (
                  <HarnessBashToolView
                    invocation={
                      part.state === 'output-available'
                        ? { ...part, output: toOutputText(part.output) }
                        : part
                    }
                    key={index}
                  />
                );
              }
              case 'tool-read':
              case 'tool-write':
              case 'tool-edit': {
                return <HarnessFileToolView key={index} invocation={part} />;
              }
              case 'tool-find':
              case 'tool-grep':
              case 'tool-ls': {
                return (
                  <HarnessToolView
                    key={index}
                    toolName={
                      part.type === 'tool-find'
                        ? 'glob'
                        : part.type.replace(/^tool-/, '')
                    }
                    toolArg={
                      typeof part.input === 'object' && part.input != null
                        ? ((part.input as { pattern?: string; path?: string })
                            .pattern ??
                          (part.input as { pattern?: string; path?: string })
                            .path ??
                          '')
                        : ''
                    }
                    state={part.state}
                    output={
                      part.state === 'output-available'
                        ? toOutputText(part.output)
                        : undefined
                    }
                  />
                );
              }
              case 'tool-badMarker':
              case 'tool-addNote': {
                return (
                  <HarnessToolView
                    key={index}
                    toolName={part.type.replace(/^tool-/, '')}
                    input={part.input}
                    state={part.state}
                    output={
                      part.state === 'output-available'
                        ? part.output
                        : undefined
                    }
                    errorText={
                      part.state === 'output-error' ? part.errorText : undefined
                    }
                  />
                );
              }
              case 'dynamic-tool': {
                // Pi already emits Write tool calls, so we don't need to surface these dynamic fileChange events, which effectively show the same thing.
                if (part.toolName === 'fileChange') {
                  return null;
                }
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
        onSubmit={parts => sendMessage({ parts })}
      />
    </div>
  );
}
