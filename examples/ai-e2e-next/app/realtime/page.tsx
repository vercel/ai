'use client';

import { elevenLabs } from '@ai-sdk/elevenlabs';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { experimental_useRealtime } from '@ai-sdk/react';
import { xai } from '@ai-sdk/xai';
import {
  Activity,
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  PhoneOff,
  Plug,
  Send,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  LiveWaveform,
  type WaveformState,
} from '@/components/ui/live-waveform';
import { VoiceButton } from '@/components/ui/voice-button';
import { cn } from '@/lib/utils';

type Provider = 'openai' | 'google' | 'xai' | 'elevenlabs';
type VoiceOption = { id: string; label: string };

type ProviderConfig = {
  label: string;
  description: string;
  defaultModel: string;
  staticVoices: VoiceOption[];
  createModel: (
    modelId: string,
  ) => ReturnType<typeof openai.experimental_realtime>;
  usesAgentConfiguration?: boolean;
  sessionConfigOverrides?: Record<string, unknown>;
};

const toVoiceOptions = (names: string[]): VoiceOption[] =>
  names.map(name => ({ id: name, label: name }));

const PROVIDER_CONFIG: Record<Provider, ProviderConfig> = {
  openai: {
    label: 'OpenAI',
    description: 'Realtime speech and tool calling',
    defaultModel: 'gpt-realtime',
    staticVoices: toVoiceOptions([
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
    ]),
    createModel: modelId => openai.experimental_realtime(modelId),
  },
  google: {
    label: 'Google',
    description: 'Gemini Live audio sessions',
    defaultModel: 'gemini-3.1-flash-live-preview',
    staticVoices: toVoiceOptions(['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']),
    createModel: modelId => google.experimental_realtime(modelId),
    sessionConfigOverrides: {
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    },
  },
  xai: {
    label: 'xAI',
    description: 'Grok voice conversations',
    defaultModel: 'grok-voice-latest',
    staticVoices: toVoiceOptions(['ara', 'eve', 'leo', 'rex', 'sal']),
    createModel: modelId => xai.experimental_realtime(modelId),
  },
  elevenlabs: {
    label: 'ElevenLabs',
    description: 'ElevenAgents with registered client tools',
    defaultModel: 'configured-agent',
    staticVoices: [],
    createModel: modelId => elevenLabs.experimental_realtime(modelId),
    usesAgentConfiguration: true,
    sessionConfigOverrides: {
      inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
      outputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    },
  },
};

const QUICK_PROMPTS = [
  {
    label: 'Weather in Paris',
    prompt: 'What is the weather in Paris? Use getWeather.',
  },
  {
    label: 'Roll a die',
    prompt: 'Roll a six-sided die using rollDice.',
  },
];

const STATUS_STYLES: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  disconnected: {
    label: 'Disconnected',
    dot: 'bg-zinc-400',
    text: 'text-zinc-600',
  },
  connecting: {
    label: 'Connecting',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
  },
  connected: {
    label: 'Connected',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
  },
  error: {
    label: 'Connection error',
    dot: 'bg-red-500',
    text: 'text-red-700',
  },
};

export default function RealtimePage() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [voice, setVoice] = useState(
    PROVIDER_CONFIG.openai.staticVoices[0]?.id ?? '',
  );

  const config = PROVIDER_CONFIG[provider];
  const currentVoices = config.staticVoices;

  const handleProviderChange = (nextProvider: Provider) => {
    setProvider(nextProvider);
    setVoice(PROVIDER_CONFIG[nextProvider].staticVoices[0]?.id ?? '');
  };

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
              <AudioLines className="size-4" aria-hidden />
              AI SDK Realtime
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
              Voice agent playground
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Test audio, text, client tools, and normalized provider events.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono">
              experimental_useRealtime
            </span>
            <span className="rounded-md border border-zinc-200 bg-white px-2 py-1">
              2 tool handlers
            </span>
          </div>
        </header>

        <section className="mb-4 grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-zinc-700">
            Provider
            <select
              value={provider}
              onChange={event =>
                handleProviderChange(event.target.value as Provider)
              }
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-950 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {Object.entries(PROVIDER_CONFIG).map(([key, providerConfig]) => (
                <option key={key} value={key}>
                  {providerConfig.label}
                </option>
              ))}
            </select>
            <span className="font-normal text-zinc-500">
              {config.description}
            </span>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-zinc-700">
            Voice
            <select
              value={voice}
              onChange={event => setVoice(event.target.value)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal text-zinc-950 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {currentVoices.length === 0 ? (
                <option value="">Agent default</option>
              ) : (
                currentVoices.map(voiceOption => (
                  <option key={voiceOption.id} value={voiceOption.id}>
                    {voiceOption.label}
                  </option>
                ))
              )}
            </select>
            <span className="font-normal text-zinc-500">
              {currentVoices.length === 0
                ? 'Managed by the configured agent'
                : 'Applied when the session starts'}
            </span>
          </label>

          <div className="flex h-10 items-center rounded-md bg-zinc-100 px-3 font-mono text-xs text-zinc-600 sm:max-w-56">
            <span className="truncate" title={config.defaultModel}>
              {config.defaultModel}
            </span>
          </div>
        </section>

        <RealtimeChat
          key={`${provider}-${voice}`}
          provider={provider}
          voice={voice}
        />
      </div>
    </main>
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const config = PROVIDER_CONFIG[provider];
  const model = useMemo(
    () => config.createModel(config.defaultModel),
    [config],
  );
  const sessionConfig = useMemo(
    () => ({
      ...(config.usesAgentConfiguration
        ? {}
        : {
            instructions:
              'You are a helpful assistant. Be concise. ' +
              'You have access to tools for weather and dice rolling.',
            inputAudioTranscription: {},
            ...(voice ? { voice } : {}),
            turnDetection: { type: 'server-vad' as const },
          }),
      ...config.sessionConfigOverrides,
    }),
    [voice, config],
  );

  const {
    status,
    messages,
    events,
    isCapturing,
    isPlaying,
    connect,
    disconnect,
    sendTextMessage,
    startAudioCapture,
    stopAudioCapture,
    stopPlayback,
  } = experimental_useRealtime({
    model,
    api: {
      token: `/api/realtime/setup?provider=${provider}`,
    },
    sessionConfig,
    onEvent: event => {
      if (event.type !== 'audio-delta') {
        console.log(`[realtime:${provider}] ${event.type}`, event);
      }
    },
    onToolCall: async ({ toolCall }) => {
      switch (toolCall.toolName) {
        case 'getWeather': {
          const response = await fetch('/api/realtime/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toolCall.args),
          });
          if (!response.ok) throw new Error('Weather lookup failed');
          return response.json();
        }
        case 'rollDice': {
          const response = await fetch('/api/realtime/roll-dice', {
            method: 'POST',
          });
          if (!response.ok) throw new Error('Dice roll failed');
          return response.json();
        }
      }
    },
    onError: error => {
      setErrorMessage(error.message);
      console.error(`[realtime:${provider}] error:`, error.message);
    },
  });

  const visibleEvents = events.filter(event => event.type !== 'audio-delta');
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.disconnected;
  const connected = status === 'connected';
  const waveformState: WaveformState =
    status === 'connecting'
      ? 'connecting'
      : isCapturing
        ? 'listening'
        : isPlaying
          ? 'speaking'
          : 'idle';
  const activityLabel =
    status === 'connecting'
      ? 'Starting session'
      : isCapturing
        ? 'Listening'
        : isPlaying
          ? 'Agent speaking'
          : connected
            ? 'Ready for input'
            : 'Session idle';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleEvents.length]);

  const handleConnection = async () => {
    setErrorMessage(null);
    if (connected) {
      if (isCapturing) stopAudioCapture();
      if (isPlaying) stopPlayback();
      disconnect();
      return;
    }
    await connect();
  };

  const toggleMic = async () => {
    setErrorMessage(null);
    if (isCapturing) {
      stopAudioCapture();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      startAudioCapture(stream);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Microphone access failed',
      );
    }
  };

  const handleSendText = (event: FormEvent) => {
    event.preventDefault();
    const text = textInput.trim();
    if (!text || !connected) return;
    sendTextMessage(text);
    setTextInput('');
  };

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3">
        <span className={cn('size-2 rounded-full', statusStyle.dot)} />
        <span className={cn('text-xs font-semibold', statusStyle.text)}>
          {statusStyle.label}
        </span>
        <span className="text-xs text-zinc-400">/</span>
        <span className="text-xs text-zinc-500">{activityLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEvents(value => !value)}
            aria-expanded={showEvents}
          >
            <Terminal className="size-3.5" />
            Events {visibleEvents.length}
            {showEvents ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant={connected ? 'outline' : 'default'}
            onClick={handleConnection}
            disabled={status === 'connecting'}
          >
            {status === 'connecting' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : connected ? (
              <PhoneOff className="size-3.5" />
            ) : (
              <Plug className="size-3.5" />
            )}
            {status === 'connecting'
              ? 'Connecting'
              : connected
                ? 'Disconnect'
                : 'Connect'}
          </Button>
        </div>
      </header>

      {provider === 'elevenlabs' && (
        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Register <code className="font-semibold">getWeather</code> and{' '}
            <code className="font-semibold">rollDice</code> as client tools on
            the ElevenLabs agent. Names and parameter schemas are
            case-sensitive.
          </p>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
        >
          <XCircle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="font-semibold hover:text-red-950"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className={cn(
          'grid min-h-[600px]',
          showEvents && 'lg:grid-cols-[1fr_320px]',
        )}
      >
        <div className="flex min-w-0 flex-col">
          <div className="border-b border-zinc-200 bg-zinc-50/70 px-5 py-5">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <div className="flex h-14 w-36 items-center justify-center rounded-md border border-zinc-200 bg-white px-3">
                <LiveWaveform state={waveformState} className="w-full" />
              </div>
              <div className="text-center sm:text-left">
                <div className="text-sm font-semibold text-zinc-900">
                  {activityLabel}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {connected
                    ? 'Speak naturally or send a text message.'
                    : 'Connect to start a realtime session.'}
                </div>
              </div>
              {connected && (
                <div className="flex items-center gap-2 sm:ml-3">
                  <VoiceButton active={isCapturing} onPress={toggleMic} />
                  {isPlaying && (
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={stopPlayback}
                      title="Stop audio playback"
                    >
                      <Pause className="size-4" />
                      <span className="sr-only">Stop audio playback</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-[360px] overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                  <AudioLines className="size-5" />
                </span>
                <h2 className="text-sm font-semibold text-zinc-900">
                  {connected ? 'Start the conversation' : 'No active session'}
                </h2>
                <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                  {connected
                    ? 'Try voice, type a message, or trigger one of the example tools.'
                    : 'Choose a provider and connect to inspect its realtime behavior.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map(message => (
                  <article
                    key={message.id}
                    className={cn(
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-6 sm:max-w-[72%]',
                        message.role === 'user'
                          ? 'bg-zinc-950 text-white'
                          : 'border border-zinc-200 bg-zinc-50 text-zinc-900',
                      )}
                    >
                      <div className="mb-1 text-[10px] font-semibold uppercase text-current opacity-55">
                        {message.role === 'user' ? 'You' : config.label}
                      </div>
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return (
                            <span key={index} className="whitespace-pre-wrap">
                              {part.text}
                              {part.state === 'streaming' && (
                                <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current opacity-50" />
                              )}
                            </span>
                          );
                        }

                        if (part.type === 'dynamic-tool') {
                          const pending =
                            part.state === 'input-streaming' ||
                            part.state === 'input-available';
                          return (
                            <div
                              key={index}
                              className="mt-2 rounded-md border border-zinc-300/70 bg-white/90 p-2.5 text-zinc-800"
                            >
                              <div className="flex items-center gap-2 text-xs font-semibold">
                                {pending ? (
                                  <Loader2 className="size-3.5 animate-spin text-amber-600" />
                                ) : (
                                  <Check className="size-3.5 text-emerald-600" />
                                )}
                                <span>{part.toolName || 'Client tool'}</span>
                                <span className="ml-auto text-[10px] font-medium uppercase text-zinc-400">
                                  {pending ? 'Running' : 'Complete'}
                                </span>
                              </div>
                              {part.state === 'input-available' && (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-500">
                                  {JSON.stringify(part.input, null, 2)}
                                </pre>
                              )}
                              {part.state === 'output-available' && (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-600">
                                  {JSON.stringify(part.output, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="mt-auto border-t border-zinc-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map(item => (
                <Button
                  key={item.label}
                  size="sm"
                  variant="secondary"
                  disabled={!connected}
                  onClick={() => sendTextMessage(item.prompt)}
                >
                  <Wrench className="size-3" />
                  {item.label}
                </Button>
              ))}
            </div>
            <form onSubmit={handleSendText} className="flex items-center gap-2">
              <input
                value={textInput}
                disabled={!connected}
                onChange={event => setTextInput(event.target.value)}
                placeholder={
                  connected ? 'Type a message...' : 'Connect to send a message'
                }
                className="h-11 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3.5 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400"
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={!connected || !textInput.trim()}
                title="Send message"
              >
                <Send className="size-4" />
                <span className="sr-only">Send message</span>
              </Button>
            </form>
          </div>
        </div>

        {showEvents && (
          <aside className="min-w-0 border-t border-zinc-200 bg-zinc-950 text-zinc-100 lg:border-t-0 lg:border-l">
            <div className="flex h-11 items-center gap-2 border-b border-zinc-800 px-3 font-mono text-[11px] uppercase text-zinc-400">
              <Activity className="size-3.5" />
              Normalized events
            </div>
            <div className="h-[555px] overflow-y-auto p-2">
              {visibleEvents.length === 0 ? (
                <div className="px-3 py-8 text-center font-mono text-xs text-zinc-600">
                  Events will appear here.
                </div>
              ) : (
                visibleEvents.map((event, index) => {
                  const expanded = expandedEvent === index;
                  const label =
                    event.type === 'custom'
                      ? `custom (${event.rawType})`
                      : event.type;
                  return (
                    <div key={index} className="mb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEvent(expanded ? null : index)
                        }
                        aria-expanded={expanded}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[11px] transition hover:bg-zinc-900',
                          expanded && 'bg-zinc-900',
                        )}
                      >
                        <span className="w-6 text-zinc-600">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'truncate text-zinc-300',
                            event.type.includes('function') &&
                              'text-violet-300',
                            event.type.includes('text') && 'text-emerald-300',
                            event.type.includes('audio') && 'text-sky-300',
                            event.type === 'error' && 'text-red-300',
                          )}
                        >
                          {label}
                        </span>
                        {expanded ? (
                          <ChevronUp className="ml-auto size-3" />
                        ) : (
                          <ChevronDown className="ml-auto size-3" />
                        )}
                      </button>
                      {expanded && (
                        <pre className="mx-1 mt-1 max-h-64 overflow-auto rounded bg-black p-3 font-mono text-[10px] leading-5 text-zinc-400">
                          {JSON.stringify(event, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={eventsEndRef} />
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
