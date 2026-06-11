export type CodexAuthOptions = {
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

/**
 * Resolve the environment-variable blob the codex bridge needs. Precedence:
 *
 *   1. Explicit `auth.openaiCompatible` — pin to a custom OpenAI-compatible endpoint.
 *   2. Explicit `auth.openai` — pin to direct OpenAI auth.
 *   3. Explicit `auth.gateway` — pin to Vercel AI Gateway.
 *   4. Auto-detect from the host process env: gateway first
 *      (`AI_GATEWAY_API_KEY`), then `CODEX_API_KEY` / `OPENAI_API_KEY`.
 */
export function resolveCodexEnv(
  auth: CodexAuthOptions | undefined,
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (auth?.openaiCompatible) {
    return pickOpenAICompatible(auth.openaiCompatible, processEnv);
  }
  if (auth?.openai) {
    return pickOpenAI({ explicit: auth.openai, processEnv });
  }
  if (auth?.gateway) {
    return pickGateway(auth.gateway, processEnv);
  }
  if (processEnv.AI_GATEWAY_API_KEY) {
    return pickGateway({}, processEnv);
  }
  return pickOpenAI({ processEnv });
}

function pickOpenAICompatible(
  explicit: NonNullable<CodexAuthOptions['openaiCompatible']>,
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
  explicit?: NonNullable<CodexAuthOptions['openai']>;
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

function pickGateway(
  explicit: NonNullable<CodexAuthOptions['gateway']>,
  processEnv: Record<string, string | undefined>,
): Record<string, string> {
  const apiKey = explicit.apiKey ?? processEnv.AI_GATEWAY_API_KEY;
  const baseUrl =
    explicit.baseUrl ??
    processEnv.AI_GATEWAY_BASE_URL ??
    'https://ai-gateway.vercel.sh/v1';
  const env: Record<string, string> = {};
  if (apiKey) {
    env.AI_GATEWAY_API_KEY = apiKey;
    env.CODEX_API_KEY = apiKey;
  }
  env.AI_GATEWAY_BASE_URL = baseUrl;
  return env;
}
