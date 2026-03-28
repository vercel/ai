'use client';

import { useRealtime } from '@ai-sdk/react';
import { openaiRealtime } from '@ai-sdk/openai/realtime';
import { xaiRealtime } from '@ai-sdk/xai/realtime';
import { useState, useRef, useEffect, useMemo } from 'react';

type Provider = 'openai' | 'xai';

const PROVIDER_CONFIG: Record<
  Provider,
  {
    label: string;
    defaultModel: string;
    voices: string[];
    createModel: (modelId: string) => ReturnType<typeof openaiRealtime>;
  }
> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-realtime-preview',
    voices: [
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'marin',
      'sage',
      'shimmer',
      'verse',
    ],
    createModel: modelId => openaiRealtime(modelId),
  },
  xai: {
    label: 'xAI',
    defaultModel: 'grok-3',
    voices: ['Eve', 'Ara', 'Rex', 'Sal', 'Leo'],
    createModel: modelId => xaiRealtime(modelId),
  },
};

export default function RealtimePage() {
  const [provider, setProvider] = useState<Provider>('xai');
  const [voice, setVoice] = useState(PROVIDER_CONFIG.xai.voices[0]);

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
    setVoice(PROVIDER_CONFIG[next].voices[0]);
  };

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '2rem auto',
        padding: '0 1rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
        Realtime Voice Chat
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        AI SDK Realtime API with tool calling — multi-provider
      </p>

      {/* ── Provider & voice selectors ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
          Provider
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
            style={{
              marginLeft: 8,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 13,
              background: 'white',
            }}
          >
            {Object.entries(PROVIDER_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
          Voice
          <select
            value={voice}
            onChange={e => setVoice(e.target.value)}
            style={{
              marginLeft: 8,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 13,
              background: 'white',
            }}
          >
            {PROVIDER_CONFIG[provider].voices.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <span
          style={{
            fontSize: 12,
            color: '#94a3b8',
            marginLeft: 'auto',
            fontFamily: 'monospace',
          }}
        >
          {PROVIDER_CONFIG[provider].defaultModel}
        </span>
      </div>

      <RealtimeChat
        key={`${provider}-${voice}`}
        provider={provider}
        voice={voice}
      />
    </div>
  );
}

function RealtimeChat({
  provider,
  voice,
}: {
  provider: Provider;
  voice: string;
}) {
  const [textInput, setTextInput] = useState('');
  const [showEvents, setShowEvents] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const config = PROVIDER_CONFIG[provider];
  const model = useMemo(
    () => config.createModel(config.defaultModel),
    [config],
  );

  const {
    status,
    transcript,
    events,
    isCapturing,
    isPlaying,
    connect,
    disconnect,
    sendTextMessage,
    startAudioCapture,
    stopAudioCapture,
    stopPlayback,
  } = useRealtime({
    model,
    api: {
      token: `/api/realtime/token?provider=${provider}`,
      tools: '/api/realtime/tools',
    },
    sessionConfig: {
      instructions:
        'You are a helpful assistant. Be concise. ' +
        'You have access to tools for weather and dice rolling.',
      voice,
      turnDetection: { type: 'server-vad' },
    },
    onEvent: event => {
      if (event.type !== 'audio-delta') {
        console.log(`[realtime:${provider}] ${event.type}`, event);
      }
    },
    onError: error => {
      console.error(`[realtime:${provider}] error:`, error.message);
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const toggleMic = async () => {
    if (isCapturing) {
      stopAudioCapture();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startAudioCapture(stream);
    } catch (err) {
      console.error('[realtime] mic access denied:', err);
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const text = textInput.trim();
    if (!text) return;
    sendTextMessage(text);
    setTextInput('');
  };

  const statusColor: Record<string, string> = {
    disconnected: '#94a3b8',
    connecting: '#f59e0b',
    connected: '#22c55e',
    error: '#ef4444',
  };

  return (
    <>
      {/* ── Connection bar ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: statusColor[status] ?? '#94a3b8',
            boxShadow: status === 'connected' ? '0 0 6px #22c55e' : 'none',
          }}
        />
        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
          {status.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={status === 'connected' ? disconnect : connect}
          disabled={status === 'connecting'}
          style={{
            padding: '6px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: 13,
            background: status === 'connected' ? '#fee2e2' : '#dbeafe',
            color: status === 'connected' ? '#dc2626' : '#2563eb',
          }}
        >
          {status === 'connected'
            ? 'Disconnect'
            : status === 'connecting'
              ? 'Connecting…'
              : 'Connect'}
        </button>
      </div>

      {/* ── Audio controls ─────────────────────────────────────── */}
      {status === 'connected' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={toggleMic}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 13,
              background: isCapturing ? '#fecaca' : '#d1fae5',
              color: isCapturing ? '#b91c1c' : '#065f46',
              animation: isCapturing ? 'pulse 1.5s infinite' : 'none',
            }}
          >
            {isCapturing ? '⏹ Stop Mic' : '🎙 Start Mic'}
          </button>
          {isPlaying && (
            <button
              onClick={stopPlayback}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                background: '#fef3c7',
                color: '#92400e',
              }}
            >
              ⏸ Stop Playback
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowEvents(v => !v)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 12,
              background: showEvents ? '#f1f5f9' : 'white',
              color: '#475569',
            }}
          >
            {showEvents ? 'Hide' : 'Show'} Events ({events.length})
          </button>
        </div>
      )}

      {/* ── Text input ─────────────────────────────────────────── */}
      {status === 'connected' && (
        <form
          onSubmit={handleSendText}
          style={{ display: 'flex', gap: 8, marginBottom: 20 }}
        >
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Type a message…"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 14,
              background: '#2563eb',
              color: 'white',
            }}
          >
            Send
          </button>
        </form>
      )}

      {/* ── Transcript ─────────────────────────────────────────── */}
      <div
        style={{
          minHeight: 200,
          maxHeight: 400,
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          background: 'white',
          marginBottom: 16,
        }}
      >
        {transcript.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
            {status === 'connected'
              ? 'Start talking or type a message…'
              : 'Connect to start a conversation'}
          </p>
        )}
        {transcript.map((entry, i) => (
          <div
            key={`${entry.id}-${i}`}
            style={{
              display: 'flex',
              justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                background: entry.role === 'user' ? '#2563eb' : '#f1f5f9',
                color: entry.role === 'user' ? 'white' : '#1e293b',
              }}
            >
              {entry.content}
              <div
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  opacity: 0.6,
                  color: entry.role === 'user' ? '#bfdbfe' : '#94a3b8',
                }}
              >
                {entry.type === 'audio-transcript' ? '🎤 voice' : '⌨️ text'}
              </div>
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* ── Event log ──────────────────────────────────────────── */}
      {showEvents && (
        <div
          style={{
            maxHeight: 350,
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            background: '#1e293b',
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: 8,
              fontFamily: 'monospace',
            }}
          >
            EVENT LOG ({events.length})
          </div>
          {events
            .filter(e => e.type !== 'audio-delta')
            .map((event, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <div
                  onClick={() =>
                    setExpandedEvent(expandedEvent === i ? null : i)
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color:
                      event.type === 'error'
                        ? '#fca5a5'
                        : event.type.includes('function')
                          ? '#a78bfa'
                          : event.type.includes('text')
                            ? '#86efac'
                            : event.type.includes('audio')
                              ? '#93c5fd'
                              : '#cbd5e1',
                    background: expandedEvent === i ? '#334155' : 'transparent',
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    {new Date().toLocaleTimeString('en', { hour12: false })}
                  </span>{' '}
                  {event.type}
                </div>
                {expandedEvent === i && (
                  <pre
                    style={{
                      padding: '8px 12px',
                      margin: '2px 0 6px',
                      borderRadius: 4,
                      background: '#0f172a',
                      color: '#e2e8f0',
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 200,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(event, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          <div ref={eventsEndRef} />
        </div>
      )}

      {/* ── Pulse animation ────────────────────────────────────── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
