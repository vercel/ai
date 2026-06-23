import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4ClientSecretOptions as RealtimeModelV4ClientSecretOptions,
  Experimental_RealtimeModelV4ClientSecretResult as RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeFactoryV4GetTokenResult as RealtimeFactoryV4GetTokenResult,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { getGatewayRealtimeProtocols } from './gateway-realtime-auth';
import type { GatewayRealtimeModelId } from './gateway-realtime-model-settings';
import type { GatewayProviderOptions } from './gateway-provider-options';

export type GatewayRealtimePinnedProviderOptions = Pick<
  GatewayProviderOptions,
  'quotaEntityId' | 'tags' | 'user'
>;

export type GatewayRealtimeClientSecretOptions =
  RealtimeModelV4ClientSecretOptions & {
    /**
     * Browser origins allowed to redeem the client secret. When set, a
     * WebSocket upgrade without a matching Origin header is rejected.
     */
    allowedOrigins?: string[];
  };

export type GatewayRealtimeFactoryGetTokenOptions = {
  model: GatewayRealtimeModelId;
} & GatewayRealtimeClientSecretOptions;

export interface GatewayRealtimeFactory {
  (modelId: GatewayRealtimeModelId): RealtimeModelV4;

  getToken(
    options: GatewayRealtimeFactoryGetTokenOptions,
  ): Promise<RealtimeFactoryV4GetTokenResult>;
}

export type GatewayRealtimeModelConfig = {
  provider: string;
  baseURL: string;
  teamIdOrSlug?: string;
  /**
   * Mints a short-lived client secret (`vcst_`) for this model via the
   * Gateway's `/v1/realtime/client-secrets` endpoint. Implemented by the
   * provider because minting requires the long-lived Gateway credential
   * (API key / OIDC) and must run server-side.
   */
  createClientSecret: (params: {
    modelId: string;
    expiresAfterSeconds?: number;
    allowedOrigins?: string[];
    gatewayOptions?: GatewayRealtimePinnedProviderOptions;
  }) => PromiseLike<{ token: string; expiresAt?: number }>;
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
   * Mints a single-use, short-lived client secret (`vcst_`) the browser uses to
   * open the realtime WebSocket without ever holding the long-lived Gateway
   * credential. The customer's server calls this (via
   * `gateway.experimental_realtime.getToken`) and hands the returned token to
   * the browser, which connects with it through the `ai-gateway-auth.<token>`
   * subprotocol. `expiresAfterSeconds`, `allowedOrigins`, and the safe Gateway
   * options from `sessionConfig` are sealed into the token by the mint
   * endpoint. Credentials are deliberately excluded from this flow.
   */
  async doCreateClientSecret(
    options?: GatewayRealtimeClientSecretOptions,
  ): Promise<RealtimeModelV4ClientSecretResult> {
    const gatewayOptions = getPinnedGatewayOptions(options?.sessionConfig);
    const secret = await this.config.createClientSecret({
      modelId: this.modelId,
      ...(options?.expiresAfterSeconds != null && {
        expiresAfterSeconds: options.expiresAfterSeconds,
      }),
      ...(options?.allowedOrigins != null && {
        allowedOrigins: options.allowedOrigins,
      }),
      ...(gatewayOptions != null && { gatewayOptions }),
    });
    return {
      token: secret.token,
      url: toGatewayRealtimeUrl(this.config.baseURL, this.modelId),
      ...(secret.expiresAt != null && { expiresAt: secret.expiresAt }),
    };
  }

  getWebSocketConfig(options: { token: string; url: string }): {
    url: string;
    protocols?: string[];
  } {
    return {
      url: options.url,
      protocols: getGatewayRealtimeProtocols(options.token, {
        teamIdOrSlug: this.config.teamIdOrSlug,
      }),
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

function getPinnedGatewayOptions(
  sessionConfig: RealtimeModelV4SessionConfig | undefined,
): GatewayRealtimePinnedProviderOptions | undefined {
  const gatewayOptions = sessionConfig?.providerOptions?.gateway;
  if (gatewayOptions == null) {
    return undefined;
  }
  if (typeof gatewayOptions !== 'object' || Array.isArray(gatewayOptions)) {
    throw new Error('providerOptions.gateway must be an object.');
  }
  const options = gatewayOptions as Record<string, unknown>;
  if ('byok' in options && options.byok !== undefined) {
    throw new Error(
      'Request-scoped BYOK credentials cannot be used with Gateway realtime client secrets. Configure BYOK credentials in the AI Gateway instead of sending them through a browser session.',
    );
  }

  const pinned: Record<string, unknown> = {};
  for (const key of ['quotaEntityId', 'tags', 'user'] as const) {
    if (key in options && options[key] !== undefined) {
      pinned[key] = options[key];
    }
  }

  return Object.keys(pinned).length > 0
    ? (pinned as GatewayRealtimePinnedProviderOptions)
    : undefined;
}

/**
 * Build the Gateway realtime WebSocket URL. The HTTP(S) base URL is upgraded to
 * WS(S) and the model id rides the `?ai-model-id=` query — the WS transport of
 * the `ai-model-id` header the HTTP routes use, since a browser `WebSocket`
 * cannot set headers. The model id is passed through verbatim; the Gateway owns
 * resolution (including the bare → `openai/` qualification), exactly like the
 * non-realtime routes. The query is slash-safe for qualified ids such as
 * `openai/gpt-realtime-2`.
 */
function toGatewayRealtimeUrl(baseURL: string, modelId: string): string {
  const url = new URL(`${baseURL.replace(/^http/, 'ws')}/realtime-model`);
  url.searchParams.set('ai-model-id', modelId);
  return url.toString();
}
