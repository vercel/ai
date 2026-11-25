'use client';

import {
  openai,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '@ai-sdk/openai';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { useMemo, useRef, useState } from 'react';

// Keep the model stable: changing model/config identity replaces the session.
const model = openai.experimental_realtime('gpt-live-1');

export default function LivePage() {
  const [transport, setTransport] = useState<'websocket' | 'webrtc'>(
    'websocket',
  );
  const [endpoint, setEndpoint] = useState('ws://localhost:4318/live');
  const [instructions, setInstructions] = useState(
    'Be a concise, friendly English-speaking assistant. Accept corrections naturally. Delegate questions that need tools or current information.',
  );
  const [context, setContext] = useState('');
  const [channel, setChannel] = useState<
    'commentary' | 'thinking' | 'instructions'
  >('commentary');
  const [delegationId, setDelegationId] = useState('');
  const [error, setError] = useState('');
  const evidence = useRef<unknown[]>([]);
  const sessionConfig = useMemo(
    () => ({
      instructions,
      providerOptions: {
        openai: {
          delegation: { type: 'client' },
        } satisfies OpenAIRealtimeModelLiveOptions,
      },
    }),
    [instructions],
  );
  const rt = useRealtime({
    model,
    api:
      transport === 'webrtc'
        ? { session: '/api/realtime-live' }
        : { websocket: endpoint },
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
  });
  const active =
    rt.status === 'connecting' ||
    rt.status === 'connected' ||
    rt.status === 'closing';
  const ready = rt.status === 'connected';
  const clientDelegations =
    rt.session?.delegations.filter(
      item =>
        item.target === 'client' ||
        (item.target == null && rt.session?.delegationMode === 'client'),
    ) ?? [];
  const selectedDelegation = clientDelegations.find(
    item => item.delegationId === delegationId,
  );
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
        Connect through an application-owned WebSocket relay or optional WebRTC.
        Your application handles client delegation and supplies context or
        results; the SDK does not execute an agent or tool loop for Live.
      </p>
      <label>
        Transport{' '}
        <select
          id="transport"
          value={transport}
          disabled={active}
          onChange={event =>
            setTransport(event.target.value as typeof transport)
          }
        >
          <option value="websocket">WebSocket relay</option>
          <option value="webrtc">WebRTC</option>
        </select>
      </label>
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
          {rt.session?.isInputMuted
            ? 'Unmute provider input'
            : 'Mute provider input'}
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
      <p>
        Stop local capture releases the SDK-owned microphone. Provider mute only
        changes remote audio processing after acknowledgment; it does not stop
        the microphone. Resume local capture may ask for microphone permission.
        WebRTC sends one audio track and negotiates its format through SDP; the
        server selects data-channel permissions.
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
        <p>
          Select a client delegation reported by this session, or append
          session-wide context. The application owns any text conversation,
          agent execution, and result validation.
        </p>
        <select
          aria-label="Context channel"
          value={channel}
          onChange={event => setChannel(event.target.value as typeof channel)}
        >
          <option value="commentary">Commentary (factual result)</option>
          <option value="thinking">Thinking (context)</option>
          <option value="instructions">Instructions (trusted behavior)</option>
        </select>
        <select
          aria-label="Client delegation"
          value={selectedDelegation?.delegationId ?? ''}
          onChange={event => setDelegationId(event.target.value)}
        >
          <option value="">Session-wide</option>
          {clientDelegations.map(item => (
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
                delegationId: selectedDelegation?.delegationId ?? null,
              }),
            )
          }
        >
          Append context
        </button>
        <p>
          A successful send only confirms local submission. Provider acceptance
          does not confirm that a result was spoken or heard. Only use the
          instructions channel for trusted application instructions.
        </p>
        <details>
          <summary>Client delegation metadata</summary>
          <pre id="delegations">
            {JSON.stringify(clientDelegations, null, 2)}
          </pre>
        </details>
      </section>
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
