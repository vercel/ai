import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

export type GrokBuildAuthOptions = {
  readonly xai?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
};

/**
 * Resolve the environment-variable blob the bridge needs to authenticate the
 * `grok` CLI (directly with xAI, or via the Vercel AI Gateway). Precedence:
 *   1. Explicit `auth.xai` — pin to direct xAI auth.
 *   2. Explicit `auth.gateway` — pin to gateway-routed auth.
 *   3. Auto-detect: gateway first (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`),
 *      then direct (`XAI_API_KEY`).
 */
export function resolveGrokBuildEnv(
  auth: GrokBuildAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (auth?.xai) {
    return pickXai(auth.xai, processEnv);
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env: processEnv });
  if (auth?.gateway) {
    return pickGateway(auth.gateway, gatewayAuthFromEnv);
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({}, gatewayAuthFromEnv);
  }

  return pickXai({}, processEnv);
}

// Translate the resolved auth blob into the env vars the grok CLI reads.
export function toGrokCliEnv(
  resolved: Record<string, string>,
): Record<string, string> {
  const isGateway = resolved.AI_GATEWAY_API_KEY != null;
  if (isGateway) {
    const env: Record<string, string> = {};
    const key = resolved.AI_GATEWAY_API_KEY;
    const baseUrl = resolved.AI_GATEWAY_BASE_URL ?? resolved.XAI_BASE_URL;
    if (key) env.GROK_CODE_XAI_API_KEY = key;
    // grok's GROK_MODELS_BASE_URL must point at the gateway's `/v1` endpoint.
    if (baseUrl) env.GROK_MODELS_BASE_URL = toGatewayV1BaseUrl(baseUrl);
    return env;
  }
  const env: Record<string, string> = {};
  if (resolved.XAI_API_KEY) env.XAI_API_KEY = resolved.XAI_API_KEY;
  if (resolved.XAI_BASE_URL) env.XAI_BASE_URL = resolved.XAI_BASE_URL;
  return env;
}

function toGatewayV1BaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function pickXai(
  explicit: NonNullable<GrokBuildAuthOptions['xai']>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = explicit.apiKey ?? processEnv.XAI_API_KEY;
  if (apiKey) env.XAI_API_KEY = apiKey;
  const baseUrl = explicit.baseUrl ?? processEnv.XAI_BASE_URL;
  if (baseUrl) env.XAI_BASE_URL = baseUrl;
  return env;
}

function pickGateway(
  explicit: NonNullable<GrokBuildAuthOptions['gateway']>,
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>,
): Record<string, string> {
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  const baseUrl = explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl;
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.XAI_API_KEY = apiKey;
  }
  // Always forward the gateway base URL (mirrors claude-code-auth).
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.XAI_BASE_URL = baseUrl;
  return env;
}
