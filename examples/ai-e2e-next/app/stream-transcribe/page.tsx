'use client';

import { parseJSON } from '@ai-sdk/provider-utils';
import { useEffect, useRef, useState } from 'react';
import { startMicrophone } from './microphone';

export default function TranscriptionPage() {
  const [status, setStatus] = useState('Ready');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const socket = useRef<WebSocket>();
  const microphone = useRef<() => Promise<void>>();

  useEffect(
    () => () => {
      socket.current?.close();
      void microphone.current?.();
    },
    [],
  );

  async function start() {
    setStatus('Connecting');
    setText('');
    setError('');
    const ws = new WebSocket('ws://localhost:3002');
    socket.current = ws;
    ws.onmessage = async event => {
      const message = (await parseJSON({ text: event.data })) as {
        type: string;
        text: string;
      };
      if (message.type === 'delta')
        setText(previous => previous + message.text);
      if (message.type === 'done') setText(message.text);
      if (message.type === 'error') setError(message.text);
    };
    ws.onclose = () => {
      void microphone.current?.();
      setStatus('Ready');
    };
    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () =>
          reject(
            new Error('Could not connect. Start pnpm dev:transcribe first.'),
          );
      });
      const stop = await startMicrophone(chunk => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
      });
      // The connection may close while the browser asks for mic permission.
      if (ws.readyState !== WebSocket.OPEN) {
        await stop();
        return;
      }
      microphone.current = stop;
      setStatus('Listening');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      ws.close();
      setStatus('Ready');
    }
  }

  async function stop() {
    setStatus('Finishing');
    await microphone.current?.();
    microphone.current = undefined;
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send('stop');
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Live transcription</h1>
      <p>Start the microphone and speak. Your words appear here as you talk.</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={status === 'Connecting' || status === 'Finishing'}
          onClick={() => void (status === 'Listening' ? stop() : start())}
        >
          {status === 'Listening' ? 'Stop microphone' : 'Start microphone'}
        </button>
        <span role="status">{status}</span>
      </div>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <p
        aria-live="polite"
        className="min-h-40 whitespace-pre-wrap rounded border p-4"
      >
        {text || 'Waiting for speech…'}
      </p>
    </main>
  );
}
