import {
  UnsupportedFunctionalityError,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  type Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
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
import type { OpenAILiveModelId } from './openai-live-options';
import { buildOpenAILiveSessionConfig } from './openai-live-session-config';

export type OpenAILiveModelConfig = {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

const webRTCSessionSchema = z.object({
  session: z.object({ id: z.string().min(1) }),
  transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1) }),
});

export class OpenAILiveModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly capabilities = {
    conversation: 'continuous',
    transports: ['websocket', 'webrtc'],
  } as const;

  constructor(
    readonly modelId: OpenAILiveModelId,
    private readonly config: OpenAILiveModelConfig,
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

  async doCreateClientSecret(
    _options: RealtimeModelV4ClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    throw new UnsupportedFunctionalityError({
      functionality:
        'OpenAI Live ephemeral tokens; use server WebSocket headers or doCreateWebRTCSession SDP exchange',
    });
  }

  getWebSocketConfig(_options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    throw new UnsupportedFunctionalityError({
      functionality:
        'OpenAI Live browser WebSocket tokens; use getServerWebSocketConfig on the server or doCreateWebRTCSession SDP exchange',
    });
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
