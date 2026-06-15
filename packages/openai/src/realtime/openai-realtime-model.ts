import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeModelV4ServerConnection as RealtimeModelV4ServerConnection,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  Experimental_RealtimeModelV4SessionIntent as RealtimeModelV4SessionIntent,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  buildOpenAISessionConfig,
  parseOpenAIRealtimeServerEvent,
  serializeOpenAIRealtimeClientEvent,
} from './openai-realtime-event-mapper';

export type OpenAIRealtimeModelConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class OpenAIRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider: string;
  readonly modelId: string;

  private readonly config: OpenAIRealtimeModelConfig;

  constructor(modelId: string, config: OpenAIRealtimeModelConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  async doCreateClientSecret(
    options: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    const fetchFn = this.config.fetch ?? fetch;
    const url = `${this.config.baseURL}/realtime/client_secrets`;

    const session =
      options.sessionConfig != null
        ? buildOpenAISessionConfig(options.sessionConfig, this.modelId)
        : { type: 'realtime', model: this.modelId };

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        ...this.config.headers(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session,
        ...(options.expiresAfterSeconds != null
          ? {
              // `anchor` is required by the client secrets endpoint; without it
              // the request fails with "Missing required parameter:
              // 'expires_after.anchor'".
              expires_after: {
                anchor: 'created_at',
                seconds: options.expiresAfterSeconds,
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `OpenAI realtime client secret request failed: ${response.status} ${text}`,
      );
    }

    const data = (await response.json()) as {
      value: string;
      expires_at?: number;
    };

    return {
      token: data.value,
      url: `wss://${new URL(this.config.baseURL).host}/v1/realtime?model=${encodeURIComponent(this.modelId)}`,
      expiresAt: data.expires_at,
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
      protocols: ['realtime', `openai-insecure-api-key.${options.token}`],
    };
  }

  getServerConnection(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }): RealtimeModelV4ServerConnection {
    return {
      url: buildServerUrl(
        this.config.baseURL,
        this.modelId,
        options?.intent ?? 'conversation',
      ),
      headers: definedHeaders(this.config.headers()),
    };
  }

  parseServerEvent(raw: unknown): RealtimeModelV4ServerEvent {
    return parseOpenAIRealtimeServerEvent(raw);
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    return serializeOpenAIRealtimeClientEvent(event, this.modelId);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
  ): Record<string, unknown> {
    return buildOpenAISessionConfig(config, this.modelId);
  }
}

/**
 * Builds the upstream realtime WebSocket URL for a server-initiated connection.
 *
 * The OpenAI realtime endpoint varies by intent:
 *  - conversation:  `/realtime?model=<id>`
 *  - transcription: `/realtime?intent=transcription` (no model; the
 *      transcription model is set in the client's `session.update` — a `?model=`
 *      here would open a voice session instead)
 *  - translation:   `/realtime/translations?model=<id>`
 */
function buildServerUrl(
  baseURL: string,
  modelId: string,
  intent: RealtimeModelV4SessionIntent,
): string {
  const url = new URL(baseURL);
  const protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  const base = `${protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;

  switch (intent) {
    case 'transcription':
      return `${base}/realtime?intent=transcription`;
    case 'translation':
      return `${base}/realtime/translations?model=${encodeURIComponent(modelId)}`;
    default:
      return `${base}/realtime?model=${encodeURIComponent(modelId)}`;
  }
}

/** Drop headers with `undefined` values so the result is a `Record<string, string>`. */
function definedHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) {
      result[key] = value;
    }
  }
  return result;
}
