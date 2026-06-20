import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  ElevenLabsRealtimeEventMapper,
  buildElevenLabsSessionConfig,
} from './elevenlabs-realtime-event-mapper';

export type ElevenLabsRealtimeModelConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class ElevenLabsRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider: string;
  readonly modelId: string;

  private readonly config: ElevenLabsRealtimeModelConfig;
  private readonly mapper = new ElevenLabsRealtimeEventMapper();

  constructor(modelId: string, config: ElevenLabsRealtimeModelConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  async doCreateClientSecret(
    _options: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    // ElevenLabs fixes the signed URL lifetime and applies session settings
    // after the WebSocket connects, so client-secret options do not apply.
    const fetchFn = this.config.fetch ?? fetch;
    const url = new URL(
      `${this.config.baseURL}/v1/convai/conversation/get-signed-url`,
    );
    url.searchParams.set('agent_id', this.modelId);

    const response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: Object.fromEntries(
        Object.entries(this.config.headers()).filter(
          (entry): entry is [string, string] => entry[1] != null,
        ),
      ),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ElevenLabs realtime signed URL request failed: ${response.status} ${text}`,
      );
    }

    const data = (await response.json()) as { signed_url?: string };
    const signedUrl = data.signed_url;

    if (!signedUrl) {
      throw new Error(
        'ElevenLabs realtime signed URL request returned no signed_url.',
      );
    }

    return {
      // ElevenLabs authenticates the socket with the signed URL itself. The
      // token field is still required by the AI SDK realtime interface, so keep
      // the signed URL as the opaque secret and ignore it in getWebSocketConfig.
      token: signedUrl,
      url: signedUrl,
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
    };
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    return this.mapper.parseServerEvent(raw);
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
  ): ReturnType<RealtimeModelV4['serializeClientEvent']> {
    return this.mapper.serializeClientEvent(event);
  }

  buildSessionConfig(config: RealtimeModelV4SessionConfig): unknown {
    return buildElevenLabsSessionConfig(config);
  }

  getHealthCheckResponse(raw: unknown): unknown | null {
    return this.mapper.getHealthCheckResponse(raw);
  }
}
