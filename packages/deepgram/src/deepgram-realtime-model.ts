import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  type Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  type Experimental_RealtimeModelV4ServerConnection as RealtimeModelV4ServerConnection,
  type Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  type Experimental_RealtimeModelV4SessionIntent as RealtimeModelV4SessionIntent,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  lazySchema,
  parseJSON,
  parseProviderOptions,
  removeUndefinedEntries,
  resolve,
  resolveWith,
  zodSchema,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  DEEPGRAM_REALTIME_DEFAULT_THINK,
  deepgramRealtimeModelOptionsSchema,
  type DeepgramRealtimeModelId,
} from './deepgram-realtime-model-options';

export type DeepgramRealtimeModelConfig = {
  provider: string;
  /** REST base URL, used to mint short-lived tokens. */
  baseURL: string;
  /** Voice Agent WebSocket URL. */
  webSocketURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

type DeepgramAgentMessage = {
  type?: string;
  request_id?: string;
  role?: string;
  content?: string;
  description?: string;
  code?: string;
  functions?: Array<{
    id?: string;
    name?: string;
    arguments?: string;
    client_side?: boolean;
  }>;
};

/**
 * Realtime model for Deepgram's Voice Agent API: one WebSocket that carries
 * audio in and audio out, with Deepgram running speech-to-text, an LLM, and
 * text-to-speech in between.
 */
export class DeepgramRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  // Agent audio arrives as binary frames, so the socket must be owned by code
  // that passes them to the parser. The AI SDK browser runtime reads every
  // incoming frame as JSON, so its client-secret connection is not advertised.
  readonly capabilities = {
    conversation: 'turn-based',
    transports: ['websocket'],
    connections: ['server-websocket'],
  } as const;
  readonly provider: string;
  readonly modelId: DeepgramRealtimeModelId;

  private readonly config: DeepgramRealtimeModelConfig;
  private readonly mapper = new DeepgramRealtimeEventMapper();
  // Deepgram accepts `Settings` once per connection and closes the socket on a
  // second one, so later session updates must become `Update*` messages.
  private settingsSent = false;

  constructor(
    modelId: DeepgramRealtimeModelId,
    config: DeepgramRealtimeModelConfig,
  ) {
    if (modelId !== 'voice-agent') {
      throw new InvalidArgumentError({
        argument: 'modelId',
        message:
          `Unsupported Deepgram realtime model ID "${modelId}". ` +
          `The supported model ID is "voice-agent".`,
      });
    }

    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  async doCreateClientSecret(
    options: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    const ttl = options.expiresAfterSeconds;
    if (ttl != null && !(ttl >= 1 && ttl <= 3600)) {
      throw new InvalidArgumentError({
        argument: 'expiresAfterSeconds',
        message:
          'Deepgram temporary tokens must expire between 1 and 3600 seconds.',
      });
    }

    const fetchFn = this.config.fetch ?? fetch;
    const response = await fetchFn(`${this.config.baseURL}/v1/auth/grant`, {
      method: 'POST',
      headers: {
        ...removeUndefinedEntries(await resolve(this.config.headers)),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ttl != null ? { ttl_seconds: ttl } : {}),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Deepgram realtime client secret request failed: ${response.status} ${text}`,
      );
    }

    const grant = await parseJSON({ text, schema: grantResponseSchema });
    const issuedAt =
      (this.config._internal?.currentDate?.() ?? new Date()).getTime() / 1000;

    return {
      token: grant.access_token,
      url: this.config.webSocketURL,
      ...(grant.expires_in != null
        ? { expiresAt: Math.floor(issuedAt + grant.expires_in) }
        : {}),
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols: string[];
  } {
    this.settingsSent = false;
    // Browsers cannot set handshake headers, so the token travels as a
    // subprotocol. Never put credentials in the URL.
    return { url: options.url, protocols: ['bearer', options.token] };
  }

  getServerWebSocketConfig(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }):
    | RealtimeModelV4ServerConnection
    | PromiseLike<RealtimeModelV4ServerConnection> {
    assertConversationIntent(options);
    this.settingsSent = false;
    return resolveWith(this.config.headers, resolved => {
      const headers = removeUndefinedEntries(resolved);
      const credentials = new Headers(headers)
        .get('authorization')
        ?.match(/^(Token|Bearer) (\S+)$/i);
      return {
        url: this.config.webSocketURL,
        headers,
        // Runtimes whose WebSocket cannot set handshake headers authenticate
        // with the same credential as a subprotocol.
        ...(credentials != null
          ? { protocols: [credentials[1].toLowerCase(), credentials[2]] }
          : {}),
      };
    });
  }

  /**
   * Maps one WebSocket message to normalized events. Pass text frames as
   * parsed JSON and binary frames (agent audio) as `ArrayBuffer` or a typed
   * array.
   */
  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    return this.mapper.parseServerEvent(raw);
  }

  createServerEventParser(): ReturnType<
    NonNullable<RealtimeModelV4['createServerEventParser']>
  > {
    // A caller that opens its own socket may never ask for a WebSocket config,
    // so a new parser also marks the start of a connection.
    this.settingsSent = false;
    const mapper = new DeepgramRealtimeEventMapper();
    return raw => mapper.parseServerEvent(raw);
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): ReturnType<RealtimeModelV4['serializeClientEvent']> {
    assertConversationIntent(options);

    switch (event.type) {
      case 'session-update': {
        if (this.settingsSent) {
          return buildDeepgramSessionUpdate(event.config);
        }
        this.settingsSent = true;
        return buildDeepgramSettings(event.config).catch(error => {
          this.settingsSent = false;
          throw error;
        });
      }

      case 'input-audio-append':
        return convertBase64ToUint8Array(event.audio);

      case 'input-audio-commit':
        return { type: 'ForceEndTurn' };

      case 'conversation-item-create': {
        const item = event.item;
        switch (item.type) {
          case 'text-message':
            return { type: 'InjectUserMessage', content: item.text };
          case 'function-call-output':
            if (item.name == null) {
              throw new InvalidArgumentError({
                argument: 'item.name',
                message:
                  'Deepgram Voice Agent function call outputs require the function name.',
              });
            }
            return {
              type: 'FunctionCallResponse',
              id: item.callId,
              name: item.name,
              content: item.output,
            };
        }
        // The agent only takes audio as a live stream, not as a finished clip.
        return null;
      }

      // The agent replies on its own after each user turn, function result, or
      // injected message, and exposes no buffer, truncation, or cancel control.
      default:
        return null;
    }
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): Promise<Record<string, unknown>> {
    assertConversationIntent(options);
    return buildDeepgramSettings(config);
  }
}

class DeepgramRealtimeEventMapper {
  private turnCounter = 0;
  private inputCounter = 0;
  private responseOpen = false;
  private hasAudio = false;
  private transcript = '';

  private get responseId(): string {
    return `deepgram-resp-${this.turnCounter}`;
  }

  private get itemId(): string {
    return `deepgram-item-${this.turnCounter}`;
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
      const bytes =
        raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      const events = this.beginResponse(raw);
      this.hasAudio = true;
      events.push({
        type: 'audio-delta',
        responseId: this.responseId,
        itemId: this.itemId,
        delta: convertUint8ArrayToBase64(bytes),
        raw,
      });
      return unwrap(events);
    }

    const message = (raw ?? {}) as DeepgramAgentMessage;

    switch (message.type) {
      case 'Welcome':
        return {
          type: 'session-created',
          sessionId: message.request_id,
          raw,
        };

      case 'SettingsApplied':
      case 'PromptUpdated':
      case 'SpeakUpdated':
        return { type: 'session-updated', raw };

      case 'UserStartedSpeaking':
        // The user interrupts whatever the agent was saying. Ending the
        // response here marks it cancelled; the `AgentAudioDone` that Deepgram
        // sends next then finds no open response.
        return unwrap([
          { type: 'speech-started', raw },
          ...this.endResponse('cancelled', raw),
        ]);

      case 'ConversationText': {
        const content = message.content ?? '';
        if (message.role === 'user') {
          return {
            type: 'input-transcription-completed',
            itemId: `deepgram-input-${++this.inputCounter}`,
            transcript: content,
            raw,
          };
        }
        if (message.role !== 'assistant' || content === '') break;

        // Deepgram sends the agent's text one sentence at a time.
        const events = this.beginResponse(raw);
        const delta = this.transcript === '' ? content : ` ${content}`;
        this.transcript += delta;
        events.push({
          type: 'audio-transcript-delta',
          responseId: this.responseId,
          itemId: this.itemId,
          delta,
          raw,
        });
        return unwrap(events);
      }

      case 'FunctionCallRequest': {
        // Deepgram runs `client_side: false` functions itself.
        const calls = (message.functions ?? []).filter(
          call =>
            call.client_side !== false && call.id != null && call.name != null,
        );
        if (calls.length === 0) break;

        const events = this.beginResponse(raw);
        for (const call of calls) {
          const args = call.arguments ?? '{}';
          events.push(
            {
              type: 'function-call-arguments-delta',
              responseId: this.responseId,
              itemId: this.itemId,
              callId: call.id!,
              delta: args,
              raw,
            },
            {
              type: 'function-call-arguments-done',
              responseId: this.responseId,
              itemId: this.itemId,
              callId: call.id!,
              name: call.name!,
              arguments: args,
              raw,
            },
          );
        }
        return unwrap(events);
      }

      case 'AgentAudioDone': {
        if (!this.responseOpen) break;
        return unwrap(this.endResponse('completed', raw));
      }

      case 'Error':
        return {
          type: 'error',
          message: message.description ?? 'Unknown Deepgram Voice Agent error',
          code: message.code,
          raw,
        };
    }

    return { type: 'custom', rawType: message.type ?? 'unknown', raw };
  }

  private beginResponse(raw: unknown): RealtimeModelV4ServerEvent[] {
    if (this.responseOpen) return [];
    this.responseOpen = true;
    this.turnCounter++;
    return [{ type: 'response-created', responseId: this.responseId, raw }];
  }

  private endResponse(
    status: string,
    raw: unknown,
  ): RealtimeModelV4ServerEvent[] {
    if (!this.responseOpen) return [];

    const ids = { responseId: this.responseId, itemId: this.itemId };
    const events: RealtimeModelV4ServerEvent[] = [];
    if (this.hasAudio) {
      events.push({ type: 'audio-done', ...ids, raw });
    }
    if (this.transcript !== '') {
      events.push({
        type: 'audio-transcript-done',
        ...ids,
        transcript: this.transcript,
        raw,
      });
    }
    events.push({
      type: 'response-done',
      responseId: this.responseId,
      status,
      raw,
    });

    this.responseOpen = false;
    this.hasAudio = false;
    this.transcript = '';
    return events;
  }
}

function unwrap(
  events: RealtimeModelV4ServerEvent[],
): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
  return events.length === 1 ? events[0] : events;
}

function assertConversationIntent(options?: {
  intent?: RealtimeModelV4SessionIntent;
}): void {
  if (options?.intent != null && options.intent !== 'conversation') {
    throw new Error(
      `Deepgram realtime does not support the '${options.intent}' session intent.`,
    );
  }
}

async function buildDeepgramSettings(
  config: RealtimeModelV4SessionConfig,
): Promise<Record<string, unknown>> {
  if (
    config.outputModalities != null &&
    !config.outputModalities.includes('audio')
  ) {
    throw new UnsupportedFunctionalityError({
      functionality: 'Deepgram Voice Agent outputModalities without audio',
    });
  }

  const options = await parseProviderOptions({
    provider: 'deepgram',
    providerOptions: config.providerOptions,
    schema: deepgramRealtimeModelOptionsSchema,
  });

  // Deepgram rejects a prompt or functions without an explicit LLM, so one is
  // always sent.
  const think = options?.think ?? DEEPGRAM_REALTIME_DEFAULT_THINK;
  const listenModel =
    config.inputAudioTranscription?.model ?? 'flux-general-en';
  const language = config.inputAudioTranscription?.language;
  const isFlux = listenModel.startsWith('flux-');
  const manualTurns =
    config.turnDetection === null || config.turnDetection?.type === 'disabled';
  const silenceDurationMs = config.turnDetection?.silenceDurationMs;

  if (!isFlux && (manualTurns || options?.eotThreshold != null)) {
    throw new UnsupportedFunctionalityError({
      functionality: `Deepgram Voice Agent turn detection settings for the non-Flux listen model ${listenModel}`,
    });
  }

  const listenProvider = isFlux
    ? {
        type: 'deepgram',
        version: 'v2',
        model: listenModel,
        ...(language != null &&
          listenModel === 'flux-general-multi' && {
            language_hints: [language],
          }),
        // Flux detects the end of a turn with a model, not a silence timer.
        // The timer is only its backstop and still applies when natural
        // detection is suppressed, so manual turns raise it to the maximum.
        ...(manualTurns
          ? { eot_threshold: 1, eot_timeout_ms: 60_000 }
          : {
              ...(options?.eotThreshold != null && {
                eot_threshold: options.eotThreshold,
              }),
              ...(silenceDurationMs != null && {
                // Deepgram rejects values outside 500-60000 ms.
                eot_timeout_ms: Math.min(
                  60_000,
                  Math.max(500, Math.round(silenceDurationMs)),
                ),
              }),
            }),
      }
    : {
        type: 'deepgram',
        model: listenModel,
        ...(language != null && { language }),
      };

  return {
    type: 'Settings',
    audio: {
      input: mapAudioFormat(config.inputAudioFormat, 'inputAudioFormat'),
      output: {
        ...mapAudioFormat(config.outputAudioFormat, 'outputAudioFormat'),
        container: 'none',
      },
    },
    agent: {
      listen: { provider: listenProvider },
      think: {
        provider: { type: think.provider, model: think.model },
        ...(config.instructions != null && { prompt: config.instructions }),
        ...(config.tools != null &&
          config.tools.length > 0 && {
            functions: config.tools.map(tool => ({
              name: tool.name,
              ...(tool.description != null && {
                description: tool.description,
              }),
              parameters: tool.parameters,
            })),
          }),
      },
      // Without `speak`, Deepgram uses its default Flux voice.
      ...(config.voice != null && { speak: buildDeepgramSpeak(config.voice) }),
      ...(options?.greeting != null && { greeting: options.greeting }),
    },
  };
}

function buildDeepgramSessionUpdate(
  config: RealtimeModelV4SessionConfig,
): Record<string, unknown> | null {
  for (const [key, value] of Object.entries(config)) {
    if (value != null && key !== 'voice' && key !== 'instructions') {
      throw new UnsupportedFunctionalityError({
        functionality: `Deepgram Voice Agent live update of ${key}`,
      });
    }
  }
  if (config.voice != null && config.instructions != null) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'Deepgram Voice Agent live update of voice and instructions in one event',
    });
  }

  if (config.voice != null) {
    return { type: 'UpdateSpeak', speak: buildDeepgramSpeak(config.voice) };
  }
  if (config.instructions != null) {
    // Deepgram appends this text to the current prompt; it does not replace it.
    return { type: 'UpdatePrompt', prompt: config.instructions };
  }
  return null;
}

function buildDeepgramSpeak(voice: string): Record<string, unknown> {
  return {
    provider: {
      type: 'deepgram',
      // Flux voices are served on v2; Aura voices on the default v1.
      ...(voice.startsWith('flux-') && { version: 'v2' }),
      model: voice,
    },
  };
}

function mapAudioFormat(
  format: RealtimeModelV4SessionConfig['inputAudioFormat'],
  argument: string,
): { encoding: string; sample_rate: number } {
  switch (format?.type) {
    case undefined:
    case 'audio/pcm':
      return { encoding: 'linear16', sample_rate: format?.rate ?? 24000 };
    case 'audio/pcmu':
      return { encoding: 'mulaw', sample_rate: format.rate ?? 8000 };
    case 'audio/pcma':
      return { encoding: 'alaw', sample_rate: format.rate ?? 8000 };
    default:
      throw new InvalidArgumentError({
        argument,
        message: `Unsupported Deepgram realtime audio format: ${format?.type}`,
      });
  }
}

const grantResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      access_token: z.string().min(1),
      expires_in: z.number().nullish(),
    }),
  ),
);
