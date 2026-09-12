import {
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import {
  createJsonResponseHandler,
  postJsonToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { openaiFailedResponseHandler } from '../openai-error';
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
  fetch?: FetchFunction;
};

const webRTCSessionSchema = z.object({
  session: z.object({ id: z.string().min(1) }),
  transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1) }),
});

export class OpenAIRealtimeModelLive implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly capabilities = {
    conversation: 'continuous',
    transports: ['websocket', 'webrtc'],
    connections: ['server-websocket', 'webrtc'],
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

  getWebRTCConfig(): { dataChannelLabel: string } {
    return { dataChannelLabel: 'oai-events' };
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

  async doCreateWebRTCSession({
    sdp,
    sessionConfig = {},
    abortSignal,
  }: {
    sdp: string;
    sessionConfig?: RealtimeModelV4SessionConfig;
    abortSignal?: AbortSignal;
  }): Promise<{ sessionId: string; sdp: string }> {
    const session = buildOpenAILiveSessionConfig(
      sessionConfig,
      this.modelId,
      'webrtc',
    );
    const { value } = await postJsonToApi({
      url: `${this.config.baseURL}/live/sessions`,
      headers: this.config.headers(),
      body: {
        session,
        transport: { type: 'webrtc', sdp: z.string().min(1).parse(sdp) },
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(webRTCSessionSchema),
      abortSignal,
      fetch: this.config.fetch,
    });
    return { sessionId: value.session.id, sdp: value.transport.sdp };
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
