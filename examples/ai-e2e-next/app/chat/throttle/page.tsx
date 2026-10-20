'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

const THROTTLE_MS = 50;
const EXPECTED_ASSISTANT_CHARACTERS = 1000;

type Result = {
  assistantCharacterCountAtReady: number;
  durationInMs: number;
  maximumExpectedSnapshotChanges: number;
  renderCount: number;
  snapshotChangeCount: number;
};

export default function Chat() {
  const renderCount = useRef(0);
  renderCount.current += 1;

  const { error, messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat/throttle' }),
    throttle: THROTTLE_MS,
  });

  const previousMessages = useRef(messages);
  const snapshotChangeCount = useRef(0);
  if (previousMessages.current !== messages) {
    previousMessages.current = messages;
    snapshotChangeCount.current += 1;
  }

  const [result, setResult] = useState<Result>();
  const [, forceUnrelatedRender] = useState(0);
  const startedAt = useRef<number>();

  const assistantMessages = messages.filter(
    message => message.role === 'assistant',
  );
  const latestAssistantMessage =
    assistantMessages[assistantMessages.length - 1];
  const assistantText = (latestAssistantMessage?.parts ?? [])
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  useEffect(() => {
    if (status !== 'submitted' && status !== 'streaming') {
      return;
    }

    // Re-render independently from useChat while the response streams. Before
    // the fix for #6166, these renders read the always-current messages array
    // from getSnapshot and bypass the throttled subscription.
    const interval = setInterval(() => {
      forceUnrelatedRender(count => count + 1);
    }, 0);

    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (startedAt.current == null || status !== 'ready') {
      return;
    }

    const durationInMs = performance.now() - startedAt.current;
    setResult({
      assistantCharacterCountAtReady: assistantText.length,
      durationInMs,
      // Account for the leading update, trailing update, user message, and
      // timer/commit boundary variance around the throttle window.
      maximumExpectedSnapshotChanges: Math.ceil(durationInMs / THROTTLE_MS) + 4,
      renderCount: renderCount.current,
      snapshotChangeCount: snapshotChangeCount.current,
    });
    startedAt.current = undefined;
  }, [assistantText.length, status]);

  const runReproduction = () => {
    previousMessages.current = messages;
    renderCount.current = 0;
    snapshotChangeCount.current = 0;
    setResult(undefined);
    startedAt.current = performance.now();
    sendMessage({ text: 'Run the throttle snapshot reproduction' });
  };

  const passed =
    result != null &&
    result.snapshotChangeCount <= result.maximumExpectedSnapshotChanges &&
    result.assistantCharacterCountAtReady === EXPECTED_ASSISTANT_CHARACTERS;

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h4 className="pb-4 text-xl font-bold text-gray-900 md:text-xl">
        useChat throttle snapshot reproduction
      </h4>
      <p className="pb-4 text-sm text-gray-700">
        Streams 500 chunks with a 50ms throttle while an unrelated timer
        re-renders the component. Message snapshots should only change within
        the throttle cadence.
      </p>

      <dl className="grid grid-cols-2 gap-2 pb-4 text-sm">
        <dt>Status</dt>
        <dd data-testid="status">{status}</dd>
        <dt>React renders</dt>
        <dd data-testid="render-count">{renderCount.current}</dd>
        <dt>Message snapshot changes</dt>
        <dd data-testid="snapshot-change-count">
          {snapshotChangeCount.current}
        </dd>
        <dt>Assistant characters</dt>
        <dd data-testid="assistant-character-count">{assistantText.length}</dd>
      </dl>

      {result != null && (
        <div
          className={`mb-4 rounded border p-3 ${
            passed
              ? 'border-green-600 bg-green-50 text-green-900'
              : 'border-red-600 bg-red-50 text-red-900'
          }`}
          data-testid="result"
        >
          <strong>{passed ? 'PASS' : 'FAIL'}</strong>: observed{' '}
          {result.snapshotChangeCount} message snapshot changes in{' '}
          {Math.round(result.durationInMs)}ms; expected at most{' '}
          {result.maximumExpectedSnapshotChanges} with a {THROTTLE_MS}ms
          throttle. Assistant characters when status became ready:{' '}
          {result.assistantCharacterCountAtReady}/
          {EXPECTED_ASSISTANT_CHARACTERS}. Total renders: {result.renderCount}.
        </div>
      )}

      {error != null && (
        <pre
          className="mb-4 whitespace-pre-wrap text-red-700"
          data-testid="error"
        >
          {error.message}
        </pre>
      )}

      <button
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        data-testid="run-reproduction"
        disabled={status !== 'ready' || startedAt.current != null}
        onClick={runReproduction}
        type="button"
      >
        Run reproduction
      </button>
    </div>
  );
}
