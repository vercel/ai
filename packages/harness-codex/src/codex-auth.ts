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

export type CodexAuthenticationMode = HarnessV1Authentication;

/**
 * Resolve the environment-variable blob the codex bridge needs. Precedence:
 *
 *   1. An explicit authentication mode pins the selected route.
 *   2. Auto-detect from the host process env: gateway first
 *      (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`), then `CODEX_API_KEY` /
 *      `OPENAI_API_KEY`.
 */
export function resolveCodexEnv(
  auth: CodexAuthenticationMode | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(auth);
  const authenticationEnvironment = suppliedEnvironment ? auth : processEnv;
  if (auth === 'direct') {
    return pickOpenAI({ processEnv: authenticationEnvironment });
  }

  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });
  if (auth === 'ai-gateway' || gatewayAuthFromEnv.apiKey) {
    return pickGateway({ gatewayAuthFromEnv });
  }
  return pickOpenAI({ processEnv: authenticationEnvironment });
}

export function resolveCodexAuthenticationMode(
  auth: CodexAuthenticationMode | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): CodexResolvedAuthenticationMode {
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

function pickOpenAI({
  processEnv,
}: {
  processEnv: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  const apiKey = processEnv.OPENAI_API_KEY ?? processEnv.CODEX_API_KEY;
  if (apiKey) env.CODEX_API_KEY = apiKey;
  const baseUrl = processEnv.OPENAI_BASE_URL;
  if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
  const organization = processEnv.OPENAI_ORGANIZATION;
  if (organization) env.OPENAI_ORGANIZATION = organization;
  const project = processEnv.OPENAI_PROJECT;
  if (project) env.OPENAI_PROJECT = project;
  return env;
}

function pickGateway({
  gatewayAuthFromEnv,
}: {
  gatewayAuthFromEnv: ReturnType<typeof getAiGatewayAuthFromEnv>;
}): Record<string, string> {
  const apiKey = gatewayAuthFromEnv.apiKey;
  const baseUrl = toCodexGatewayBaseUrl(gatewayAuthFromEnv.baseUrl);
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
