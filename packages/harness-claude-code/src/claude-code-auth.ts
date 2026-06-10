import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ClaudeCodeAuthOptions = {
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

/**
 * Resolve the environment-variable blob the bridge needs to authenticate
 * with Anthropic (directly or via the Vercel AI Gateway). Precedence:
 *
 *   1. Explicit `auth.anthropic` — pin to direct Anthropic auth.
 *   2. Explicit `auth.gateway` — pin to gateway-routed auth.
 *   3. Auto-detect from the host process env: gateway first
 *      (`AI_GATEWAY_API_KEY`), then direct (`ANTHROPIC_API_KEY` /
 *      `ANTHROPIC_AUTH_TOKEN`).
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
  const readApiKey = options.readApiKeyHelper ?? readApiKeyHelper;
  if (auth?.anthropic) {
    return pickAnthropic({ explicit: auth.anthropic, processEnv, readApiKey });
  }
  if (auth?.gateway) {
    return pickGateway(auth.gateway, processEnv);
  }
  if (processEnv.AI_GATEWAY_API_KEY) {
    return pickGateway({}, processEnv);
  }
  return pickAnthropic({ processEnv, readApiKey });
}

function pickAnthropic({
  explicit,
  processEnv,
  readApiKey,
}: {
  explicit?: NonNullable<ClaudeCodeAuthOptions['anthropic']>;
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

function pickGateway(
  explicit: NonNullable<ClaudeCodeAuthOptions['gateway']>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const apiKey = explicit.apiKey ?? processEnv.AI_GATEWAY_API_KEY;
  const baseUrl =
    explicit.baseUrl ??
    processEnv.AI_GATEWAY_BASE_URL ??
    'https://ai-gateway.vercel.sh';
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.ANTHROPIC_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.ANTHROPIC_BASE_URL = baseUrl;
  return env;
}
