import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';

/**
 * Subprotocol marker offered on every Gateway realtime WebSocket handshake so
 * the Gateway can echo a negotiated subprotocol on the 101 response.
 */
export const GATEWAY_REALTIME_SUBPROTOCOL = 'ai-gateway-realtime';

/**
 * Subprotocol prefix that carries the Gateway auth token. The browser
 * `WebSocket` API cannot set request headers, so the bearer token is smuggled
 * through the `Sec-WebSocket-Protocol` handshake — the same workaround OpenAI
 * uses for `openai-insecure-api-key.<token>`. The Gateway decodes this back
 * into an `Authorization` header before authenticating the upgrade.
 */
export const GATEWAY_AUTH_SUBPROTOCOL_PREFIX = 'ai-gateway-auth.';

export type GatewayRealtimeModelConfig = {
  provider: string;
  baseURL: string;
  /**
   * Resolves the Gateway auth token used to authenticate the WebSocket upgrade
   * (API key or Vercel OIDC token).
   */
  getAuthToken: () => PromiseLike<{
    token: string;
    authMethod: 'api-key' | 'oidc';
  }>;
};

/**
 * Realtime model backed by the AI Gateway.
 *
 * The Gateway normalizes realtime exactly like it normalizes every other
 * modality: the client speaks the normalized AI SDK realtime protocol and the
 * Gateway translates to and from the upstream provider server-side. This model
 * is therefore a thin identity codec over that normalized protocol — only the
 * connection and authentication are Gateway-specific.
 */
export class GatewayRealtimeModel implements RealtimeModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider: string;
  readonly modelId: string;

  private readonly config: GatewayRealtimeModelConfig;

  constructor(modelId: string, config: GatewayRealtimeModelConfig) {
    this.modelId = modelId;
    this.provider = config.provider;
    this.config = config;
  }

  /**
   * Unlike providers with a dedicated ephemeral-secret endpoint (e.g. OpenAI),
   * the Gateway has no client-secret mint: the returned token is the Gateway
   * auth token and the WebSocket upgrade is authenticated directly. The
   * `RealtimeModelV4ClientSecretOptions` are therefore intentionally unused —
   * `sessionConfig` is applied later via the normalized `session-update` event,
   * and `expiresAfterSeconds` has no Gateway-side equivalent. Do not forward
   * them here expecting an effect.
   */
  async doCreateClientSecret(): Promise<RealtimeModelV4ClientSecretResult> {
    const { token } = await this.config.getAuthToken();
    return {
      token,
      url: toGatewayRealtimeUrl(this.config.baseURL, this.modelId),
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
      protocols: [
        GATEWAY_REALTIME_SUBPROTOCOL,
        `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}${options.token}`,
      ],
    };
  }

  parseServerEvent(raw: unknown): RealtimeModelV4ServerEvent {
    // The Gateway emits normalized AI SDK realtime events, so no
    // provider-specific mapping is needed on the client.
    return raw as RealtimeModelV4ServerEvent;
  }

  serializeClientEvent(event: RealtimeModelV4ClientEvent): unknown {
    // The Gateway accepts normalized AI SDK realtime events directly.
    return event;
  }

  buildSessionConfig(config: RealtimeModelV4SessionConfig): unknown {
    // The session config is already normalized; the Gateway maps it to the
    // upstream provider's session payload server-side.
    return config;
  }
}

/**
 * Build the Gateway realtime WebSocket URL. The HTTP(S) base URL is upgraded to
 * WS(S) and the model id rides the `?model=` query — the only browser-settable
 * channel besides subprotocols, and (unlike a subprotocol token) slash-safe for
 * qualified ids such as `openai/gpt-realtime`.
 */
function toGatewayRealtimeUrl(baseURL: string, modelId: string): string {
  const url = new URL(`${baseURL.replace(/^http/, 'ws')}/realtime-model`);
  url.searchParams.set('model', modelId);
  return url.toString();
}
