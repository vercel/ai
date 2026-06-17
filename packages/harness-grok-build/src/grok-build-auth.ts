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
  // Always forward the gateway base URL (mirrors claude-code-auth); the gateway
  // helper always returns a non-empty default.
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.XAI_BASE_URL = baseUrl;
  return env;
}
