import {
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
  type Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  type Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  type Experimental_RealtimeModelV4SessionIntent as RealtimeModelV4SessionIntent,
} from '@ai-sdk/provider';
import {
  resolveWith,
  resolve,
  lazySchema,
  zodSchema,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { openaiFailedResponseHandler } from '../openai-error';
import { openaiLiveRealtimeCapabilities } from '../openai-model-catalog';
import {
  createOpenAILiveServerEventParser,
  parseOpenAILiveServerEvent,
  serializeOpenAILiveClientEvent,
} from './openai-live-event-mapper';
import type { OpenAIRealtimeModelLiveId } from './openai-realtime-model-live-options';
import { buildOpenAILiveSessionConfig } from './openai-live-session-config';
import type { OpenAIRealtimeModelConfig } from '../realtime/openai-realtime-model';

export type OpenAIRealtimeModelLiveConfig = OpenAIRealtimeModelConfig;

const webRTCSessionSchema = lazySchema(() =>
  zodSchema(
    z.object({
      session: z.object({ id: z.string().min(1) }),
      transport: z.object({
        type: z.literal('webrtc'),
        sdp: z.string().min(1),
      }),
    }),
  ),
);

export class OpenAIRealtimeModelLive implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly capabilities = openaiLiveRealtimeCapabilities;

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

  getServerWebSocketConfig(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }) {
    this.assertConversationIntent(options);
    return resolveWith(this.config.headers, configHeaders => {
      const url = new URL(`${this.config.baseURL}/live/sessions`);
      url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(configHeaders)) {
        if (value !== undefined) headers[key] = value;
      }
      return { url: url.toString(), headers };
    });
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
      headers: await resolve(this.config.headers),
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

  private assertConversationIntent(options?: {
    intent?: RealtimeModelV4SessionIntent;
  }): void {
    if (options?.intent != null && options.intent !== 'conversation')
      throw new Error(
        `OpenAI Live session intent '${options.intent}' is not supported.`,
      );
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): unknown {
    this.assertConversationIntent(options);
    return serializeOpenAILiveClientEvent(event, this.modelId);
  }

  buildSessionConfig(
    config: RealtimeModelV4SessionConfig,
    options?: { intent?: RealtimeModelV4SessionIntent },
  ): Record<string, unknown> {
    this.assertConversationIntent(options);
    return buildOpenAILiveSessionConfig(config, this.modelId);
  }
}
