import type {
  HarnessAuthenticationEnvironment,
  HarnessV1RequestTransformation,
  HarnessV1RequestTransformationSources,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';

const DEFAULT_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const CODEX_CREDENTIAL_ENVIRONMENT_VARIABLES = [
  'AI_GATEWAY_API_KEY',
  'CODEX_API_KEY',
] as const;

export function createCodexRequestTransformations({
  env: environment,
  sandboxEnv: sandboxEnvironment,
  auth: authenticationMode,
}: HarnessV1RequestTransformationSources<CodexResolvedAuthenticationMode>): HarnessV1RequestTransformation[] {
  if (!environment.CODEX_API_KEY || !sandboxEnvironment.CODEX_API_KEY) {
    return [];
  }
  return [
    createCredentialRequestTransformation({
      matchUrl:
        environment.OPENAI_BASE_URL ??
        (authenticationMode === 'ai-gateway'
          ? DEFAULT_AI_GATEWAY_BASE_URL
          : DEFAULT_OPENAI_BASE_URL),
      matchHeaders: {
        Authorization: `Bearer ${sandboxEnvironment.CODEX_API_KEY}`,
      },
      transformHeaders: {
        Authorization: `Bearer ${environment.CODEX_API_KEY}`,
      },
    }),
  ];
}

export type CodexResolvedAuthenticationMode = 'direct' | 'ai-gateway';

export type CodexAuthenticationMode = CodexResolvedAuthenticationMode | 'auto';

/**
 * @deprecated Passing an object to auth options is deprecated. Use a `CodexAuthenticationMode` string value ("auto" | "direct" | "ai-gateway") instead, and pass credentials via environment variables.
 */
export type LegacyCodexAuthOptions = {
  readonly openaiCompatible?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly modelProviderName?: string;
    readonly queryParamsJson?: string;
  };
  readonly openai?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
    readonly organization?: string;
    readonly project?: string;
  };
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
};

export type CodexAuthOptions =
  | CodexAuthenticationMode
  | HarnessAuthenticationEnvironment
  | LegacyCodexAuthOptions;

/**
 * Resolve the environment-variable blob the codex bridge needs. Precedence:
 *
 *   1. Explicit `auth.openaiCompatible` — pin to a custom OpenAI-compatible endpoint.
 *   2. Explicit `auth.openai` — pin to direct OpenAI auth.
 *   3. Explicit `auth.gateway` — pin to Vercel AI Gateway.
 *   4. Auto-detect from the host process env: gateway first
 *      (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`), then `CODEX_API_KEY` /
 *      `OPENAI_API_KEY`.
 */
export function resolveCodexEnv(
  auth: CodexAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;
  const normalizedAuth = suppliedEnvironment
    ? undefined
    : normalizeCodexAuthToLegacyAuth(auth);

  if (normalizedAuth?.openaiCompatible) {
    return pickOpenAICompatible(
      normalizedAuth.openaiCompatible,
      authenticationEnvironment,
    );
  }
  if (normalizedAuth?.openai) {
    return pickOpenAI({
      explicit: normalizedAuth.openai,
      processEnv: authenticationEnvironment,
    });
  }
  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
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
  return pickOpenAI({ processEnv: authenticationEnvironment });
}

export function resolveCodexAuthenticationMode(
  auth: CodexAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): CodexResolvedAuthenticationMode {
  if (isHarnessAuthenticationEnvironment(auth)) {
    return getAiGatewayAuthFromEnv({ env: auth }).apiKey
      ? 'ai-gateway'
      : 'direct';
  }
  if (typeof auth !== 'string' && auth?.openaiCompatible) {
    return 'direct';
  }
  if (auth === 'direct' || (typeof auth !== 'string' && auth?.openai)) {
    return 'direct';
  }
  if (auth === 'ai-gateway' || (typeof auth !== 'string' && auth?.gateway)) {
    return 'ai-gateway';
  }
  return getAiGatewayAuthFromEnv({ env: processEnv }).apiKey
    ? 'ai-gateway'
    : 'direct';
}

function normalizeCodexAuthToLegacyAuth(
  auth: CodexAuthOptions | undefined,
): LegacyCodexAuthOptions | undefined {
  if (auth == null || auth === 'auto') {
    return undefined;
  }
  if (typeof auth === 'string') {
    switch (auth) {
      case 'direct':
        return { openai: {} };
      case 'ai-gateway':
        return { gateway: {} };
      default:
        return undefined;
    }
  }

  console.warn(
    '[codex] Passing an object to auth options is deprecated. Use a string mode ("auto" | "direct" | "ai-gateway") instead, and pass credentials via environment variables.',
  );
  return auth;
}

function pickOpenAICompatible(
  explicit: NonNullable<LegacyCodexAuthOptions['openaiCompatible']>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey =
    explicit.apiKey ?? processEnv.OPENAI_API_KEY ?? processEnv.CODEX_API_KEY;
  if (apiKey) env.CODEX_API_KEY = apiKey;
  if (explicit.baseUrl) env.OPENAI_BASE_URL = explicit.baseUrl;
  if (explicit.modelProviderName)
    env.CODEX_MODEL_PROVIDER_NAME = explicit.modelProviderName;
  if (explicit.queryParamsJson)
    env.OPENAI_QUERY_PARAMS_JSON = explicit.queryParamsJson;
  return env;
}

function pickOpenAI({
  explicit,
  processEnv,
}: {
  explicit?: NonNullable<LegacyCodexAuthOptions['openai']>;
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey =
    explicit?.apiKey ?? processEnv.OPENAI_API_KEY ?? processEnv.CODEX_API_KEY;
  if (apiKey) env.CODEX_API_KEY = apiKey;
  const baseUrl = explicit?.baseUrl ?? processEnv.OPENAI_BASE_URL;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  const organization = explicit?.organization ?? processEnv.OPENAI_ORGANIZATION;
  if (organization) env.OPENAI_ORGANIZATION = organization;
  const project = explicit?.project ?? processEnv.OPENAI_PROJECT;
  if (project) env.OPENAI_PROJECT = project;
  return env;
}

function pickGateway({
  explicit,
  gatewayAuthFromEnv,
}: {
  explicit: NonNullable<LegacyCodexAuthOptions['gateway']>;
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = explicit.apiKey ?? gatewayAuthFromEnv.apiKey;
  const baseUrl = toCodexGatewayBaseUrl(
    explicit.baseUrl ?? gatewayAuthFromEnv.baseUrl,
  );
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.CODEX_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  env.OPENAI_BASE_URL = baseUrl;
  return env;
}

function toCodexGatewayBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}
