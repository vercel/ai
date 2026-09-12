import {
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  createOpenAILiveServerEventParser,
  parseOpenAILiveServerEvent,
  serializeOpenAILiveClientEvent,
} from './openai-live-event-mapper';
import type { OpenAIRealtimeModelLiveId } from './openai-realtime-model-live-options';
import { buildOpenAILiveSessionConfig } from './openai-live-session-config';

export type OpenAIRealtimeModelLiveConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
};

export class OpenAIRealtimeModelLive implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly capabilities = {
    conversation: 'continuous',
    transports: ['websocket'],
    connections: ['server-websocket'],
    startup: 'session-start',
    finalization: 'session-close',
  } as const;

  constructor(
    readonly modelId: OpenAIRealtimeModelLiveId,
    private readonly config: OpenAIRealtimeModelLiveConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  getServerWebSocketConfig(): { url: string; headers: Record<string, string> } {
    const url = new URL(`${this.config.baseURL}/live/sessions`);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.config.headers())) {
      if (value !== undefined) headers[key] = value;
    }
    return { url: url.toString(), headers };
  }

  parseServerEvent(raw: unknown) {
    return parseOpenAILiveServerEvent(raw);
  }

  createServerEventParser() {
    return createOpenAILiveServerEventParser();
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    return serializeOpenAILiveClientEvent(event, this.modelId);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
  ): Record<string, unknown> {
    return buildOpenAILiveSessionConfig(config, this.modelId);
  }
}
