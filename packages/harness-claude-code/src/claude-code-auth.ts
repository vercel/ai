import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
} from '@ai-sdk/harness/utils';

export const CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createClaudeCodeRequestTransformations(
  env: Record<string, string>,
  auth: ClaudeCodeResolvedAuthenticationMode,
): HarnessV1RequestTransformation[] {
  const headers: Record<string, string> = {};
  if (env.ANTHROPIC_API_KEY) {
    headers['x-api-key'] = env.ANTHROPIC_API_KEY;
  }
  if (env.ANTHROPIC_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${env.ANTHROPIC_AUTH_TOKEN}`;
  }
  return Object.keys(headers).length === 0
    ? []
    : [
        createCredentialRequestTransformation({
          baseUrl:
            auth === 'ai-gateway'
              ? env.ANTHROPIC_BASE_URL
              : (env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'),
          headers,
        }),
      ];
}

export type ClaudeCodeResolvedAuthenticationMode = 'direct' | 'ai-gateway';

export type ClaudeCodeAuthenticationMode =
  | ClaudeCodeResolvedAuthenticationMode
  | 'auto';

/**
 * @deprecated Passing an object to auth options is deprecated. Use a `ClaudeCodeAuthenticationMode` string value ("auto" | "direct" | "ai-gateway") instead, and pass credentials via environment variables.
 */
export type LegacyClaudeCodeAuthOptions = {
  readonly anthropic?: {
    readonly apiKey?: string;
    readonly authToken?: string;
    readonly baseUrl?: string;
  };
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
};

export type ClaudeCodeAuthOptions =
  | ClaudeCodeAuthenticationMode
  | LegacyClaudeCodeAuthOptions;

/**
 * Resolve the environment-variable blob the bridge needs to authenticate
 * with Anthropic (directly or via the Vercel AI Gateway). Precedence:
 *
 *   1. Explicit `auth.anthropic` — pin to direct Anthropic auth.
 *   2. Explicit `auth.gateway` — pin to gateway-routed auth.
 *   3. Auto-detect from the host process env: gateway first
 *      (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`), then direct
 *      (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`).
 */
export type ResolveClaudeCodeEnvOptions = {
  /**
   * Returns an API key from a custom source (e.g. a password manager).
   * Used as the last-resort fallback in the auto-detect branch when no
   * static env vars or explicit auth are configured. Defaults to running
   * the `apiKeyHelper` command from `~/.claude/settings.json`, matching
   * the `claude` CLI's own behaviour.
   */
  readApiKeyHelper?: () => string | undefined;
};

export function resolveClaudeCodeEnv(
  auth: ClaudeCodeAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
  options: ResolveClaudeCodeEnvOptions = {},
): Record<string, string> {
  const normalizedAuth = normalizeClaudeCodeAuthToLegacyAuth(auth);

  const readApiKey = options.readApiKeyHelper ?? readApiKeyHelper;
  if (normalizedAuth?.anthropic) {
    return pickAnthropic({
      explicit: normalizedAuth.anthropic,
      processEnv,
      readApiKey,
    });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env: processEnv });
  if (normalizedAuth?.gateway) {
    return pickGateway({
      explicit: normalizedAuth.gateway,
      gatewayAuthFromEnv,
    });
  }
  if (gatewayAuthFromEnv.apiKey) {
    return pickGateway({
      explicit: {},
      gatewayAuthFromEnv,
    });
  }

  return pickAnthropic({ processEnv, readApiKey });
}

export function resolveClaudeCodeAuthenticationMode(
  auth: ClaudeCodeAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): ClaudeCodeResolvedAuthenticationMode {
  if (auth === 'direct' || (typeof auth !== 'string' && auth?.anthropic)) {
    return 'direct';
  }
  if (auth === 'ai-gateway' || (typeof auth !== 'string' && auth?.gateway)) {
    return 'ai-gateway';
  }
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'ai-gateway'
    : 'direct';
}

function normalizeClaudeCodeAuthToLegacyAuth(
  auth: ClaudeCodeAuthOptions | undefined,
): LegacyClaudeCodeAuthOptions | undefined {
  if (auth == null || auth === 'auto') {
    return undefined;
  }
  if (typeof auth === 'string') {
    switch (auth) {
      case 'direct':
        return { anthropic: {} };
      case 'ai-gateway':
        return { gateway: {} };
      default:
        return undefined;
    }
  }

  console.warn(
    '[claude-code] Passing an object to auth options is deprecated. Use a string mode ("auto" | "direct" | "ai-gateway") instead, and pass credentials via environment variables.',
  );
  return auth;
}

function pickAnthropic({
  explicit,
  processEnv,
  readApiKey,
}: {
  explicit?: NonNullable<LegacyClaudeCodeAuthOptions['anthropic']>;
  processEnv: Record<string, string | undefined>;
  readApiKey: () => string | undefined;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const helperKey = explicit ? undefined : readApiKey();
  const apiKey = explicit?.apiKey ?? processEnv.ANTHROPIC_API_KEY ?? helperKey;
  const authToken =
    explicit?.authToken ?? processEnv.ANTHROPIC_AUTH_TOKEN ?? helperKey;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  const baseUrl = explicit?.baseUrl ?? processEnv.ANTHROPIC_BASE_URL;
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}

/**
 * Read the `apiKeyHelper` setting from `~/.claude/settings.json` and run
 * it. The `claude` CLI uses this hook to fetch credentials from password
 * managers and similar tools; mirroring it here lets users with that
 * setup run the harness without having to set `ANTHROPIC_API_KEY`
 * explicitly.
 */
function readApiKeyHelper(): string | undefined {
  const home = homedir();
  if (!home) return undefined;
  let raw: string;
  try {
    raw = readFileSync(join(home, '.claude', 'settings.json'), 'utf8');
  } catch {
    return undefined;
  }
  let settings: { apiKeyHelper?: unknown };
  try {
    settings = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const command = settings.apiKeyHelper;
  if (typeof command !== 'string' || command.length === 0) return undefined;
  try {
    const output = execFileSync('sh', ['-c', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function pickGateway({
  explicit,
  gatewayAuthFromEnv,
}: {
  explicit: NonNullable<LegacyClaudeCodeAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  const baseUrl = explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl;
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}
