import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  HarnessV1Authentication,
  HarnessV1RequestTransformation,
  HarnessV1RequestTransformationSources,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';

export const CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

export function createClaudeCodeRequestTransformations({
  env: environment,
  sandboxEnv: sandboxEnvironment,
  auth: authenticationMode,
}: HarnessV1RequestTransformationSources<ClaudeCodeResolvedAuthenticationMode>): HarnessV1RequestTransformation[] {
  const matchUrl =
    authenticationMode === 'ai-gateway'
      ? environment.ANTHROPIC_BASE_URL
      : (environment.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com');
  const transformations: HarnessV1RequestTransformation[] = [];

  if (
    environment.ANTHROPIC_API_KEY != null &&
    sandboxEnvironment.ANTHROPIC_API_KEY != null
  ) {
    transformations.push(
      createCredentialRequestTransformation({
        matchUrl,
        matchHeaders: {
          'x-api-key': sandboxEnvironment.ANTHROPIC_API_KEY,
        },
        transformHeaders: {
          'x-api-key': environment.ANTHROPIC_API_KEY,
        },
      }),
    );
  }

  if (
    environment.ANTHROPIC_AUTH_TOKEN != null &&
    sandboxEnvironment.ANTHROPIC_AUTH_TOKEN != null
  ) {
    transformations.push(
      createCredentialRequestTransformation({
        matchUrl,
        matchHeaders: {
          Authorization: `Bearer ${sandboxEnvironment.ANTHROPIC_AUTH_TOKEN}`,
        },
        transformHeaders: {
          Authorization: `Bearer ${environment.ANTHROPIC_AUTH_TOKEN}`,
        },
      }),
    );
  }

  return transformations;
}

export type ClaudeCodeResolvedAuthenticationMode = 'direct' | 'ai-gateway';

export type ClaudeCodeAuthenticationMode = HarnessV1Authentication;

/**
 * Resolve the environment-variable blob the bridge needs to authenticate
 * with Anthropic (directly or via the Vercel AI Gateway). Precedence:
 *
 *   1. An explicit authentication mode pins the selected route.
 *   2. Auto-detect from the host process env: gateway first
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
  auth: ClaudeCodeAuthenticationMode | undefined,
  processEnv: Record<string, string | undefined> = process.env,
  options: ResolveClaudeCodeEnvOptions = {},
): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;

  const readApiKey =
    suppliedEnvironment || auth === 'direct'
      ? () => undefined
      : (options.readApiKeyHelper ?? readApiKeyHelper);
  if (auth === 'direct') {
    return pickAnthropic({
      processEnv: authenticationEnvironment,
      readApiKey,
    });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
  if (auth === 'ai-gateway' || gatewayAuthFromEnv.apiKey) {
    return pickGateway({ gatewayAuthFromEnv });
  }

  return pickAnthropic({
    processEnv: authenticationEnvironment,
    readApiKey,
  });
}

export function resolveClaudeCodeAuthenticationMode(
  auth: ClaudeCodeAuthenticationMode | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): ClaudeCodeResolvedAuthenticationMode {
  if (isHarnessAuthenticationEnvironment(auth)) {
    return getAiGatewayAuthFromEnv({ env: auth }).apiKey
      ? 'ai-gateway'
      : 'direct';
  }
  if (auth === 'direct') {
    return 'direct';
  }
  if (auth === 'ai-gateway') {
    return 'ai-gateway';
  }
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'ai-gateway'
    : 'direct';
}

function pickAnthropic({
  processEnv,
  readApiKey,
}: {
  processEnv: Record<string, string | undefined>;
  readApiKey: () => string | undefined;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const helperKey = readApiKey();
  const apiKey = processEnv.ANTHROPIC_API_KEY ?? helperKey;
  const authToken = processEnv.ANTHROPIC_AUTH_TOKEN ?? helperKey;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (authToken) env.ANTHROPIC_AUTH_TOKEN = authToken;
  const baseUrl = processEnv.ANTHROPIC_BASE_URL;
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
  gatewayAuthFromEnv,
}: {
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = gatewayAuthFromEnv.apiKey;
  const baseUrl = gatewayAuthFromEnv.baseUrl;
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}
