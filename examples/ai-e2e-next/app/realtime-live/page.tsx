'use client';

import {
  openai,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
  type Experimental_OpenAIRealtimeModelLiveUpdateOptions as OpenAIRealtimeModelLiveUpdateOptions,
} from '@ai-sdk/openai';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { useMemo, useRef, useState } from 'react';

// Keep the model stable: changing model/config identity replaces the session.
const model = openai.experimental_live('gpt-live-1');

export default function LivePage() {
  const [transport, setTransport] = useState('websocket');
  const [endpoint, setEndpoint] = useState('ws://localhost:4318/live');
  const [mode, setMode] = useState('responses');
  const [instructions, setInstructions] = useState(
    'Be a concise, friendly English-speaking assistant. Accept corrections naturally. Delegate questions that need tools or current information.',
  );
  const [context, setContext] = useState('');
  const [channel, setChannel] = useState<
    'commentary' | 'thinking' | 'instructions'
  >('commentary');
  const [delegationId, setDelegationId] = useState('');
  const [backendInput, setBackendInput] = useState(
    'What is the current UTC time? Use get_time.',
  );
  const [error, setError] = useState('');
  const evidence = useRef<unknown[]>([]);
  const sessionConfig = useMemo(
    () => ({
      instructions,
      providerOptions: {
        openai: {
          delegation:
            mode === 'responses'
              ? {
                  type: 'responses',
                  responses: {
                    model: 'gpt-5.6-luna',
                    instructions:
                      'Use get_time for the current UTC time. Use web search for current facts. Return concise results for speech.',
                    tools: [
                      { type: 'web_search' },
                      {
                        type: 'function',
                        name: 'get_time',
                        description: 'Read the current UTC time.',
                        parameters: {
                          type: 'object',
                          properties: {},
                          required: [],
                          additionalProperties: false,
                        },
                        strict: true,
                      },
                    ],
                    toolChoice: 'auto',
                  },
                }
              : { type: 'client' },
        } satisfies OpenAIRealtimeModelLiveOptions,
      },
    }),
    [instructions, mode],
  );
  const rt = useRealtime({
    model,
    autoContinueTools: true,
    api:
      transport === 'websocket'
        ? { websocket: endpoint }
        : { session: '/api/realtime-live' },
    sessionConfig,
    maxEvents: 200,
    onError: event => setError(event.message),
    onEvent: event => {
      // Retain event metadata without accumulating raw audio in the example UI.
      evidence.current.push(
        event.type === 'audio-chunk'
          ? { type: event.type, bytesBase64: event.delta.length }
          : event,
      );
      if (evidence.current.length > 4000) evidence.current.shift();
    },
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === 'get_time')
        return { utc: new Date().toISOString() };
      return undefined;
    },
  });
  const active =
    rt.status === 'connecting' ||
    rt.status === 'connected' ||
    rt.status === 'closing';
  const ready = rt.status === 'connected';
  const run = (action: () => void | Promise<unknown>) => {
    setError('');
    try {
      void Promise.resolve(action()).catch(error => setError(String(error)));
    } catch (error) {
      setError(String(error));
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { session: rt.session, events: evidence.current },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'live-session.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-5">
      <h1 className="text-2xl font-semibold">AI SDK Live — useRealtime</h1>
      <p>
        WebSocket relay by default; optional browser-direct WebRTC with HTTP
        session setup.
      </p>
      <div className="flex gap-3 flex-wrap">
        <label>
          Transport{' '}
          <select
            id="transport"
            value={transport}
            disabled={active}
            onChange={event => setTransport(event.target.value)}
          >
            <option value="websocket">WebSocket (relay)</option>
            <option value="webrtc">WebRTC (direct OpenAI)</option>
          </select>
        </label>
        <label>
          Delegation{' '}
          <select
            id="mode"
            value={mode}
            disabled={active}
            onChange={event => setMode(event.target.value)}
          >
            <option value="responses">Responses + tools</option>
            <option value="client">Client (manual context)</option>
          </select>
        </label>
      </div>
      {transport === 'websocket' && (
        <label>
          Relay URL{' '}
          <input
            id="endpoint"
            value={endpoint}
            disabled={active}
            onChange={event => setEndpoint(event.target.value)}
          />
        </label>
      )}
      <label>
        Instructions{' '}
        <textarea
          id="instructions"
          value={instructions}
          disabled={active}
          onChange={event => setInstructions(event.target.value)}
          rows={3}
        />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button
          id="connect"
          disabled={active}
          onClick={() =>
            run(() => {
              evidence.current = [];
              setDelegationId('');
              return rt.connect();
            })
          }
        >
          Connect microphone
        </button>
        <button
          id="close"
          disabled={!ready}
          onClick={() => run(() => rt.close())}
        >
          End &amp; collect final usage
        </button>
        <button id="drop" disabled={!active} onClick={() => rt.disconnect()}>
          Drop connection
        </button>
        <button
          id="mute"
          disabled={!ready}
          onClick={() =>
            run(() =>
              rt.sendEvent({
                type: rt.session?.isInputMuted
                  ? 'input-audio-unmute'
                  : 'input-audio-mute',
              }),
            )
          }
        >
          {rt.session?.isInputMuted ? 'Unmute input' : 'Mute input'}
        </button>
        <button
          id="resume"
          disabled={!ready}
          onClick={() => run(() => rt.resumePlayback())}
        >
          Resume playback
        </button>
        <button
          id="greet"
          disabled={!ready}
          onClick={() =>
            run(() =>
              rt.sendEvent({
                type: 'context-append',
                providerOptions: { openai: { channel: 'instructions' } },
                delegationId: null,
                content:
                  'Immediately greet the caller in English without waiting for them to speak, then pause and listen.',
              }),
            )
          }
        >
          Greet now
        </button>
        <button id="download" onClick={download}>
          Download evidence
        </button>
        <button
          id="stop-capture"
          disabled={!ready}
          onClick={() => rt.stopAudioCapture()}
        >
          Stop local capture
        </button>
        <button
          id="resume-capture"
          disabled={!ready}
          onClick={() => run(() => rt.resumeAudioCapture())}
        >
          Resume local capture
        </button>
      </div>
      <p id="status">
        {rt.status}
        {rt.session?.sessionId ? ` · ${rt.session.sessionId}` : ''}
      </p>
      <p id="usage">
        Voice seconds: {rt.session?.usage?.seconds ?? '—'} · finalization:{' '}
        {rt.session?.finalization ?? 'not started'}
        {rt.session?.terminationReason
          ? ` · ${rt.session.terminationReason}`
          : ''}
      </p>
      <p id="playback">
        Capturing: {String(rt.isCapturing)} · Playing: {String(rt.isPlaying)}
      </p>
      {error && (
        <p id="error" role="alert">
          {error}
        </p>
      )}
      <section>
        <h2>Caption fragments</h2>
        <div id="captions">
          {rt.session?.transcripts.map((fragment, index) => (
            <div
              key={index}
              className={fragment.speaker}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              <small>
                {fragment.speaker} · {fragment.startMs}–{fragment.endMs} ms
              </small>
              <div>{fragment.delta}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Context / client delegation result</h2>
        <select
          value={channel}
          onChange={event => setChannel(event.target.value as typeof channel)}
        >
          <option value="commentary">Commentary (factual result)</option>
          <option value="thinking">Thinking (context)</option>
          <option value="instructions">Instructions (trusted behavior)</option>
        </select>
        <select
          value={delegationId}
          onChange={event => setDelegationId(event.target.value)}
        >
          <option value="">Session-wide</option>
          {rt.session?.delegations
            .filter(item => item.target === 'client')
            .map(item => (
              <option key={item.delegationId} value={item.delegationId}>
                {item.delegationId}
              </option>
            ))}
        </select>
        <textarea
          id="context"
          value={context}
          onChange={event => setContext(event.target.value)}
        />
        <button
          disabled={!ready || !context}
          onClick={() =>
            run(() =>
              rt.sendEvent({
                type: 'context-append',
                providerOptions: { openai: { channel } },
                content: context,
                delegationId: delegationId || null,
              }),
            )
          }
        >
          Append context
        </button>
        <p>
          Acceptance does not confirm that a result was spoken. Client mode
          leaves task execution to your application.
        </p>
      </section>
      {mode === 'responses' && (
        <section>
          <h2>Backend text input</h2>
          <button
            id="update-backend"
            disabled={!ready}
            onClick={() =>
              run(() =>
                rt.sendEvent({
                  type: 'session-update',
                  eventId: crypto.randomUUID(),
                  config: {
                    providerOptions: {
                      openai: {
                        delegation: {
                          responses: {
                            instructions: null,
                            maxOutputTokens: null,
                            parallelToolCalls: null,
                            reasoning: null,
                            serviceTier: null,
                            text: null,
                          },
                        },
                      } satisfies OpenAIRealtimeModelLiveUpdateOptions,
                    },
                  },
                }),
              )
            }
          >
            Clear backend overrides
          </button>
          <p>
            The WebRTC example policy deliberately denies this update command;
            WebSocket sessions can use it.
          </p>
          <input
            id="backend-input"
            value={backendInput}
            onChange={event => setBackendInput(event.target.value)}
          />
          <button
            id="backend-send"
            disabled={!ready}
            onClick={() => run(() => rt.sendTextMessage(backendInput))}
          >
            Send to backend
          </button>
          <pre id="backend-usage">
            {JSON.stringify(
              rt.session?.backendUsage?.map(event => ({
                responseId: event.responseId,
                usage: event.usage,
              })),
              null,
              2,
            )}
          </pre>
        </section>
      )}
      <details>
        <summary>Recent events</summary>
        <pre id="events">
          {JSON.stringify(
            rt.events.filter(event => event.type !== 'audio-chunk').slice(-30),
            null,
            2,
          )}
        </pre>
      </details>
    </main>
  );
}
