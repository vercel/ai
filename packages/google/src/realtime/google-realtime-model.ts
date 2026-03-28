import {
  RealtimeModelV4,
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ClientSecretOptions,
  RealtimeModelV4ClientSecretResult,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import {
  GoogleRealtimeEventMapper,
  buildGoogleSessionConfig,
} from './google-realtime-event-mapper';

const WS_BASE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const AUTH_TOKENS_URL =
  'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';

export type GoogleRealtimeModelConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class GoogleRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider: string;
  readonly modelId: string;

  private readonly config: GoogleRealtimeModelConfig;
  private readonly mapper = new GoogleRealtimeEventMapper();

  constructor(modelId: string, config: GoogleRealtimeModelConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  async doCreateClientSecret(
    options: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    const fetchFn = this.config.fetch ?? fetch;
    const headers = this.config.headers();
    const apiKey = headers['x-goog-api-key'];

    if (!apiKey) {
      throw new Error(
        'Google Generative AI API key is required for realtime token creation.',
      );
    }

    const expireTime = new Date(
      Date.now() + (options.expiresAfterSeconds ?? 300) * 1000,
    ).toISOString();

    const setupPayload = buildGoogleSessionConfig(
      options.sessionConfig as RealtimeModelV4SessionConfig | undefined,
      this.modelId,
    );

    const response = await fetchFn(
      `${AUTH_TOKENS_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uses: 0,
          expireTime,
          bidiGenerateContentSetup: setupPayload,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Google realtime auth token request failed: ${response.status} ${text}`,
      );
    }

    const data = (await response.json()) as {
      name: string;
      expireTime?: string;
    };

    return {
      token: data.name,
      url: WS_BASE_URL,
      expiresAt: data.expireTime
        ? Math.floor(new Date(data.expireTime).getTime() / 1000)
        : undefined,
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: `${options.url}?access_token=${encodeURIComponent(options.token)}`,
    };
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    return this.mapper.parseServerEvent(raw);
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    return this.mapper.serializeClientEvent(event, this.modelId);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
  ): Record<string, unknown> {
    return buildGoogleSessionConfig(config, this.modelId);
  }
}
