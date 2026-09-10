'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_THROTTLE_MS = 50;
const EXPECTED_ASSISTANT_CHARACTERS = 1000;

type Result = {
  assistantCharacterCountAtReady: number;
  durationInMs: number;
  maximumDefaultSnapshotChanges: number;
  renderCount: number;
  snapshotChangeCount: number;
};

export function ThrottleReproduction({
  mode,
}: {
  mode: 'default' | 'unthrottled';
}) {
  const renderCount = useRef(0);
  renderCount.current += 1;

  const chatOptions =
    mode === 'default'
      ? {
          transport: new DefaultChatTransport({ api: '/api/chat/throttle' }),
        }
      : {
          transport: new DefaultChatTransport({ api: '/api/chat/throttle' }),
          throttle: 0,
        };

  const { error, messages, status, sendMessage } = useChat(chatOptions);

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

    // Re-render independently from useChat while the response streams to
    // verify unrelated renders cannot bypass the publication cadence.
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
      // Account for the leading update, terminal flush, user message, and
      // timer/commit boundary variance around the default throttle window.
      maximumDefaultSnapshotChanges:
        Math.ceil(durationInMs / DEFAULT_THROTTLE_MS) + 4,
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
    sendMessage({ text: `Run the ${mode} throttle reproduction` });
  };

  const passed =
    result != null &&
    result.assistantCharacterCountAtReady === EXPECTED_ASSISTANT_CHARACTERS &&
    (mode === 'default'
      ? result.snapshotChangeCount <= result.maximumDefaultSnapshotChanges
      : result.snapshotChangeCount > result.maximumDefaultSnapshotChanges);

  const testIdPrefix = mode === 'default' ? 'default' : 'unthrottled';

  return (
    <section className="mx-auto w-full max-w-3xl px-6">
      <h2 className="pb-2 text-xl font-bold text-gray-900">
        {mode === 'default'
          ? 'Default 50ms cadence'
          : 'Unthrottled with throttle: 0'}
      </h2>
      <p className="pb-4 text-sm text-gray-700">
        Streams 500 chunks while an unrelated timer re-renders the component.
        {mode === 'default'
          ? ' Message snapshots should stay within the default cadence.'
          : ' Message snapshots should be published more frequently than the default cadence.'}
      </p>

      <dl className="grid grid-cols-2 gap-2 pb-4 text-sm">
        <dt>Status</dt>
        <dd data-testid={`${testIdPrefix}-status`}>{status}</dd>
        <dt>React renders</dt>
        <dd data-testid={`${testIdPrefix}-render-count`}>
          {renderCount.current}
        </dd>
        <dt>Message snapshot changes</dt>
        <dd data-testid={`${testIdPrefix}-snapshot-change-count`}>
          {snapshotChangeCount.current}
        </dd>
        <dt>Assistant characters</dt>
        <dd data-testid={`${testIdPrefix}-assistant-character-count`}>
          {assistantText.length}
        </dd>
      </dl>

      {result != null && (
        <div
          className={`mb-4 rounded border p-3 ${
            passed
              ? 'border-green-600 bg-green-50 text-green-900'
              : 'border-red-600 bg-red-50 text-red-900'
          }`}
          data-testid={`${testIdPrefix}-result`}
        >
          <strong>{passed ? 'PASS' : 'FAIL'}</strong>: observed{' '}
          {result.snapshotChangeCount} message snapshot changes in{' '}
          {Math.round(result.durationInMs)}ms; the default-cadence threshold is{' '}
          {result.maximumDefaultSnapshotChanges}. Assistant characters when
          status became ready: {result.assistantCharacterCountAtReady}/
          {EXPECTED_ASSISTANT_CHARACTERS}. Total renders: {result.renderCount}.
        </div>
      )}

      {error != null && (
        <pre
          className="mb-4 whitespace-pre-wrap text-red-700"
          data-testid={`${testIdPrefix}-error`}
        >
          {error.message}
        </pre>
      )}

      <button
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        data-testid={`${testIdPrefix}-run-reproduction`}
        disabled={status !== 'ready' || startedAt.current != null}
        onClick={runReproduction}
        type="button"
      >
        Run {mode} reproduction
      </button>
    </section>
  );
}
