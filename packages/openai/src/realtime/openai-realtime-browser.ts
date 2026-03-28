import {
  RealtimeModelV4,
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ClientSecretResult,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  buildOpenAISessionConfig,
  parseOpenAIRealtimeServerEvent,
  serializeOpenAIRealtimeClientEvent,
} from './openai-realtime-event-mapper';

export type OpenAIRealtimeModelId = string;

/**
 * Browser-safe OpenAI realtime model. Only provides event mapping
 * and session config building — no API key required.
 *
 * Use `doCreateClientSecret` only on the server side via the full
 * `openai.realtime()` model.
 */
class OpenAIRealtimeBrowserModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'openai.realtime';
  readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doCreateClientSecret(): Promise<RealtimeModelV4ClientSecretResult> {
    throw new Error(
      'doCreateClientSecret is not available in the browser. ' +
        'Use the server-side openai.realtime() model with generateRealtimeToken() instead.',
    );
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
 * Creates a browser-safe OpenAI realtime model for use with `useRealtime`.
 * No API key is required — this model only handles event mapping.
 *
 * @example
 * ```ts
 * import { openaiRealtime } from '@ai-sdk/openai/realtime';
 *
 * const { connect } = useRealtime({
 *   model: openaiRealtime('gpt-4o-realtime'),
 *   api: { token: '/api/token', tools: '/api/tools' },
 * });
 * ```
 */
export function openaiRealtime(
  modelId: OpenAIRealtimeModelId,
): RealtimeModelV4 {
  return new OpenAIRealtimeBrowserModel(modelId);
}
