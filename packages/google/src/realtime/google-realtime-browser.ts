import {
  RealtimeModelV4,
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ClientSecretResult,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  GoogleRealtimeEventMapper,
  buildGoogleSessionConfig,
} from './google-realtime-event-mapper';

export type GoogleRealtimeModelId = string;

/**
 * Browser-safe Google realtime model. Only provides event mapping
 * and session config building — no API key required.
 *
 * Use `doCreateClientSecret` only on the server side via the full
 * `google.realtime()` model.
 */
class GoogleRealtimeBrowserModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'google.realtime';
  readonly modelId: string;

  private readonly mapper = new GoogleRealtimeEventMapper();

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doCreateClientSecret(): Promise<RealtimeModelV4ClientSecretResult> {
    throw new Error(
      'doCreateClientSecret is not available in the browser. ' +
        'Use the server-side google.realtime() model with generateRealtimeToken() instead.',
    );
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

/**
 * Creates a browser-safe Google realtime model for use with `useRealtime`.
 * No API key is required — this model only handles event mapping.
 *
 * @example
 * ```ts
 * import { googleRealtime } from '@ai-sdk/google/realtime';
 *
 * const { connect } = useRealtime({
 *   model: googleRealtime('gemini-2.0-flash-live-001'),
 *   api: { token: '/api/token', tools: '/api/tools' },
 * });
 * ```
 */
export function googleRealtime(
  modelId: GoogleRealtimeModelId,
): RealtimeModelV4 {
  return new GoogleRealtimeBrowserModel(modelId);
}
