'use client';

import { mistral } from '@ai-sdk/mistral';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { useState } from 'react';
import { rollDiceInputSchema } from './tools';

const model = mistral.experimental_realtime('mistral-small-latest');

export default function MistralRealtimePage() {
  const [error, setError] = useState('');
  const realtime = useRealtime({
    model,
    api: { provider: '/api/mistral-realtime' },
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName !== 'rollDice') {
        return { error: `Unknown tool: ${toolCall.toolName}` };
      }

      const input = rollDiceInputSchema.safeParse(toolCall.args);
      if (!input.success) {
        return {
          error: 'The number of sides must be an integer between 2 and 100.',
        };
      }

      const { sides } = input.data;
      return { sides, result: Math.floor(Math.random() * sides) + 1 };
    },
    onError: error => setError(error.message),
  });
  const active =
    realtime.status === 'connecting' ||
    realtime.status === 'connected' ||
    realtime.status === 'closing';

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Talk to Mistral</h1>
      <p>
        Start a conversation, allow microphone access, and speak. Mistral will
        respond out loud. Use headphones to avoid feedback.
      </p>
      <p>
        Try saying “Roll a 20-sided die.” The tool call and result will appear
        below.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={active}
          onClick={() => void run(() => realtime.connect())}
        >
          Start conversation
        </button>
        <button
          type="button"
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={!active || realtime.status === 'closing'}
          onClick={() => void run(() => realtime.close())}
        >
          Stop
        </button>
        {realtime.status === 'connected' ? (
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => void run(() => realtime.resumePlayback())}
          >
            Enable audio
          </button>
        ) : null}
      </div>

      <p role="status">
        {realtime.status}
        {realtime.isCapturing ? ' · Microphone on' : ''}
        {realtime.isPlaying ? ' · Playing audio' : ''}
      </p>
      {realtime.status === 'connected' ? (
        <p className="text-sm text-gray-600">
          If your browser blocks playback, click Enable audio.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      ) : null}

      <section aria-label="Transcript" className="space-y-4">
        {realtime.messages.map(message => (
          <div key={message.id}>
            <strong>{message.role === 'user' ? 'You' : 'Mistral'}</strong>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }

              if (part.type === 'dynamic-tool') {
                return (
                  <div
                    key={part.toolCallId}
                    className="my-2 space-y-2 rounded border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong>
                        Tool: {part.toolName || 'Receiving call…'}
                      </strong>
                      <span>
                        {part.state === 'output-available'
                          ? 'Completed'
                          : part.state === 'output-error'
                            ? 'Failed'
                            : 'Running…'}
                      </span>
                    </div>
                    <dl className="space-y-1">
                      <dt className="font-medium">Arguments</dt>
                      <dd>
                        <pre className="overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(part.input ?? {}, null, 2)}
                        </pre>
                      </dd>
                      {part.state === 'output-available' ? (
                        <>
                          <dt className="font-medium">Result</dt>
                          <dd>
                            <pre className="overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(part.output, null, 2)}
                            </pre>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    {part.state === 'output-error' ? (
                      <p className="text-red-600">{part.errorText}</p>
                    ) : null}
                  </div>
                );
              }

              return null;
            })}
          </div>
        ))}
      </section>
    </main>
  );
}
