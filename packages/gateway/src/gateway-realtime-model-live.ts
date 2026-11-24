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
import { removeUndefinedEntries } from '@ai-sdk/provider-utils';
import { getGatewayRealtimeProtocols } from './gateway-realtime-auth';

export type GatewayRealtimeModelLiveConfig = {
  provider: string;
  baseURL: string;
  teamIdOrSlug?: string;
  getHeaders: () => Promise<Record<string, string | undefined>>;
  /** Mints a Live-bound client secret (`vcst_`) server-side. */
  createClientSecret: (params: {
    modelId: string;
    expiresAfterSeconds?: number;
    routeKind: 'live';
  }) => PromiseLike<{ token: string; expiresAt?: number }>;
};

const supportedOpenAILiveOptions = new Set([
  'delegation',
  'input',
  'store',
  'voice',
]);
const contextChannels = new Set(['commentary', 'instructions', 'thinking']);

const supportedSessionSettings = new Set([
  'instructions',
  'voice',
  'inputAudioFormat',
  'outputAudioFormat',
  'providerOptions',
]);

/**
 * Live model backed by the AI Gateway.
 *
 * Live is a continuous conversation API: one `session-start` opens the
 * session, PCM audio streams in both directions, and `session-close` ends it
 * with final usage. The client speaks the Gateway's normalized Live protocol
 * on `/v4/ai/live-model`, and the Gateway runs the provider mapping
 * server-side, so server events arrive already normalized.
 */
export class GatewayRealtimeModelLive implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly capabilities = {
    conversation: 'continuous',
    transports: ['websocket'],
    connections: ['client-secret-websocket', 'server-websocket'],
    startup: 'session-start',
    finalization: 'session-close',
  } as const;
  readonly provider: string;
  readonly modelId: string;

  private readonly config: GatewayRealtimeModelLiveConfig;

  constructor(modelId: string, config: GatewayRealtimeModelLiveConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  /**
   * Mints a short-lived client secret bound to this Live model. The browser
   * opens the Live WebSocket with it through the `ai-gateway-auth.<token>`
   * subprotocol; the session configuration is sent later in `session-start`.
   */
  async doCreateClientSecret(
    options?: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    const secret = await this.config.createClientSecret({
      modelId: this.modelId,
      routeKind: 'live',
      ...(options?.expiresAfterSeconds != null && {
        expiresAfterSeconds: options.expiresAfterSeconds,
      }),
    });
    return {
      token: secret.token,
      url: toGatewayLiveUrl(this.config.baseURL, this.modelId),
      ...(secret.expiresAt != null && { expiresAt: secret.expiresAt }),
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
      protocols: getGatewayRealtimeProtocols(options.token, {
        teamIdOrSlug: this.config.teamIdOrSlug,
      }),
    };
  }

  async getServerWebSocketConfig(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }): Promise<RealtimeModelV4ServerConnection> {
    this.assertConversationIntent(options);

    return {
      url: toGatewayLiveUrl(this.config.baseURL, this.modelId),
      headers: removeUndefinedEntries(await this.config.getHeaders()),
    };
  }

  parseServerEvent(raw: unknown): RealtimeModelV4ServerEvent {
    if (
      raw == null ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      typeof (raw as { type?: unknown }).type !== 'string'
    ) {
      return {
        type: 'error',
        code: 'invalid_server_event',
        message: 'Invalid AI Gateway Live server event.',
        raw,
      };
    }
    // Gateway-originated errors carry no provider payload; keep the frame as `raw`.
    if ((raw as { type: string }).type === 'error' && !('raw' in raw)) {
      return { ...(raw as object), raw } as RealtimeModelV4ServerEvent;
    }
    return raw as RealtimeModelV4ServerEvent;
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): unknown {
    this.assertConversationIntent(options);
    const eventId =
      'eventId' in event && event.eventId != null
        ? { eventId: event.eventId }
        : {};

    switch (event.type) {
      case 'session-start':
        return {
          type: 'session-start',
          modelId: this.modelId,
          config: this.buildSessionConfig(event.config),
          ...eventId,
        };
      case 'session-close':
      case 'input-audio-mute':
      case 'input-audio-unmute':
        return { type: event.type, ...eventId };
      case 'input-audio-append':
        return { type: 'input-audio-append', audio: event.audio, ...eventId };
      case 'context-append':
        validateContextOptions(event.providerOptions);
        return {
          type: 'context-append',
          content: event.content,
          delegationId: event.delegationId,
          ...(event.providerOptions != null && {
            providerOptions: event.providerOptions,
          }),
          ...eventId,
        };
      default:
        throw new UnsupportedFunctionalityError({
          functionality: `AI Gateway Live client event: ${event.type}`,
        });
    }
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): RealtimeModelV4SessionConfig {
    this.assertConversationIntent(options);
    for (const [key, value] of Object.entries(config)) {
      if (value != null && !supportedSessionSettings.has(key)) {
        throw new UnsupportedFunctionalityError({
          functionality: `AI Gateway Live session setting: ${key}`,
        });
      }
    }

    validateSessionProviderOptions(config.providerOptions);

    const input = config.inputAudioFormat;
    const output = config.outputAudioFormat;
    for (const [argument, format] of [
      ['inputAudioFormat', input],
      ['outputAudioFormat', output],
    ] as const) {
      if (format != null && !isSupportedAudioFormat(format)) {
        throw new UnsupportedFunctionalityError({
          functionality: `AI Gateway Live ${argument} ${format.type} at ${format.rate ?? 'an unspecified'} Hz; use audio/pcm at 16000 or 24000 Hz, or audio/pcma or audio/pcmu at 8000 Hz`,
        });
      }
    }
    if (
      input != null &&
      output != null &&
      (input.type !== output.type || input.rate !== output.rate)
    ) {
      throw new InvalidArgumentError({
        argument: 'outputAudioFormat',
        message:
          'AI Gateway Live requires the same input and output audio format.',
      });
    }

    return removeUndefinedEntries(
      config as Record<string, unknown>,
    ) as RealtimeModelV4SessionConfig;
  }

  private assertConversationIntent(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }): void {
    if (options?.intent != null && options.intent !== 'conversation') {
      throw new Error(
        `AI Gateway Live does not support the '${options.intent}' session intent.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Gateway options stay service-owned; OpenAI Live options are WebSocket-only. */
function validateSessionProviderOptions(providerOptions: unknown): void {
  if (providerOptions == null) return;
  if (!isRecord(providerOptions))
    throw new InvalidArgumentError({
      argument: 'providerOptions',
      message: 'providerOptions must be an object.',
    });
  for (const [namespace, options] of Object.entries(providerOptions)) {
    if (options === undefined) continue;
    if (namespace !== 'gateway' && namespace !== 'openai')
      throw new UnsupportedFunctionalityError({
        functionality: `AI Gateway Live provider options namespace: ${namespace}`,
      });
    if (!isRecord(options))
      throw new InvalidArgumentError({
        argument: `providerOptions.${namespace}`,
        message: `providerOptions.${namespace} must be an object.`,
      });
  }
  const openai = providerOptions.openai;
  if (!isRecord(openai)) return;
  for (const [key, value] of Object.entries(openai)) {
    if (value === undefined) continue;
    if (!supportedOpenAILiveOptions.has(key))
      throw new UnsupportedFunctionalityError({
        functionality: `AI Gateway Live OpenAI option: ${key}`,
      });
    if (
      key === 'delegation' &&
      value !== null &&
      !(hasExactKeys(value, ['type']) && value.type === 'client')
    )
      throw new UnsupportedFunctionalityError({
        functionality:
          'AI Gateway Live delegation other than { type: "client" } or null',
      });
    if (!isValidOpenAILiveOption(key, value))
      throw new InvalidArgumentError({
        argument: `providerOptions.openai.${key}`,
        message: openaiLiveOptionMessages[key],
      });
  }
}

const openaiLiveOptionMessages: Record<string, string> = {
  delegation: 'delegation must be { type: "client" } or null.',
  input:
    'input must be at most 128 messages, each { type: "message", role, content: [{ type, text }] }.',
  store: 'store must be a boolean.',
  voice: 'voice must be { id: string } with a nonempty id.',
};

function isValidOpenAILiveOption(key: string, value: unknown): boolean {
  switch (key) {
    case 'delegation':
      return true;
    case 'store':
      return typeof value === 'boolean';
    case 'voice':
      return (
        hasExactKeys(value, ['id']) &&
        typeof value.id === 'string' &&
        value.id.length > 0
      );
    case 'input':
      return (
        Array.isArray(value) &&
        value.length <= 128 &&
        // Array.from visits holes, which `every` would skip.
        Array.from(value).every(isInputMessage)
      );
    default:
      return false;
  }
}

function isInputMessage(message: unknown): boolean {
  if (
    !hasExactKeys(message, ['type', 'role', 'content']) ||
    message.type !== 'message' ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  )
    return false;
  const [part] = message.content;
  if (!hasExactKeys(part, ['type', 'text']) || typeof part.text !== 'string')
    return false;
  return message.role === 'assistant'
    ? part.type === 'text' || part.type === 'output_text'
    : (message.role === 'developer' || message.role === 'user') &&
        part.type === 'input_text';
}

function hasExactKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const present = Object.keys(value).filter(key => value[key] !== undefined);
  return (
    present.length === keys.length && keys.every(key => present.includes(key))
  );
}

function validateContextOptions(providerOptions: unknown): void {
  if (providerOptions == null) return;
  const valid =
    isRecord(providerOptions) &&
    Object.entries(providerOptions).every(
      ([namespace, options]) =>
        options === undefined ||
        (namespace === 'openai' &&
          isRecord(options) &&
          Object.entries(options).every(
            ([key, value]) =>
              value === undefined ||
              (key === 'channel' &&
                typeof value === 'string' &&
                contextChannels.has(value)),
          )),
    );
  if (!valid)
    throw new UnsupportedFunctionalityError({
      functionality:
        'AI Gateway Live context options other than openai.channel commentary, instructions, or thinking',
    });
}

function isSupportedAudioFormat(format: {
  type: string;
  rate?: number;
}): boolean {
  return format.type === 'audio/pcm'
    ? format.rate === 16000 || format.rate === 24000
    : (format.type === 'audio/pcma' || format.type === 'audio/pcmu') &&
        format.rate === 8000;
}

/** Live WebSocket URL; the model id rides `?ai-model-id=` like the realtime route. */
function toGatewayLiveUrl(baseURL: string, modelId: string): string {
  const url = new URL(`${baseURL.replace(/^http/, 'ws')}/live-model`);
  url.searchParams.set('ai-model-id', modelId);
  return url.toString();
}
