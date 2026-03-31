import {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import {
  ElevenLabsRealtimeEventMapper,
  buildElevenLabsSessionConfig,
} from './elevenlabs-realtime-event-mapper';

const WS_BASE_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';
const SIGNED_URL_ENDPOINT =
  'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url';

export type ElevenLabsRealtimeModelConfig = {
  provider: string;
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
    const fetchFn = this.config.fetch ?? fetch;
    const headers = this.config.headers();
    const apiKey = headers['xi-api-key'];

    if (!apiKey) {
      throw new Error(
        'ElevenLabs API key is required for realtime conversation.',
      );
    }

    const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(this.modelId)}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ElevenLabs signed URL request failed: ${response.status} ${text}`,
      );
    }

    const data = (await response.json()) as { signed_url: string };

    return {
      token: data.signed_url,
      url: data.signed_url,
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    if (options.url.startsWith('wss://')) {
      return { url: options.url };
    }
    return {
      url: `${WS_BASE_URL}?agent_id=${encodeURIComponent(this.modelId)}`,
    };
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    return this.mapper.parseServerEvent(raw);
  }

  /**
   * Returns a pong response for ping events, or null for everything else.
   */
  getAutoResponse(raw: unknown): unknown | null {
    return this.mapper.getAutoResponse(raw);
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    return this.mapper.serializeClientEvent(event);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
  ): Record<string, unknown> {
    return buildElevenLabsSessionConfig(config);
  }
}
