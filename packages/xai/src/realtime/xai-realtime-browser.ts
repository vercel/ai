import {
  RealtimeModelV4,
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ClientSecretResult,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  buildXaiSessionConfig,
  parseXaiRealtimeServerEvent,
  serializeXaiRealtimeClientEvent,
} from './xai-realtime-event-mapper';

export type XaiRealtimeModelId = string;

/**
 * Browser-safe xAI realtime model. Only provides event mapping
 * and session config building — no API key required.
 *
 * Use `doCreateClientSecret` only on the server side via the full
 * `xai.realtime()` model.
 */
class XaiRealtimeBrowserModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'xai.realtime';
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doCreateClientSecret(): Promise<RealtimeModelV4ClientSecretResult> {
    throw new Error(
      'doCreateClientSecret is not available in the browser. ' +
        'Use the server-side xai.realtime() model with generateRealtimeToken() instead.',
    );
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
      protocols: [`xai-client-secret.${options.token}`],
    };
  }

  parseServerEvent(raw: unknown): RealtimeModelV4ServerEvent {
    return parseXaiRealtimeServerEvent(raw);
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    return serializeXaiRealtimeClientEvent(event);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
  ): Record<string, unknown> {
    return buildXaiSessionConfig(config);
  }
}

/**
 * Creates a browser-safe xAI realtime model for use with `useRealtime`.
 * No API key is required — this model only handles event mapping.
 *
 * @example
 * ```ts
 * import { xaiRealtime } from '@ai-sdk/xai/realtime';
 *
 * const { connect } = useRealtime({
 *   model: xaiRealtime('grok-3'),
 *   api: { token: '/api/token', tools: '/api/tools' },
 * });
 * ```
 */
export function xaiRealtime(modelId: XaiRealtimeModelId): RealtimeModelV4 {
  return new XaiRealtimeBrowserModel(modelId);
}
