import {
  createACP,
  type ACPAuthenticationMode,
  type ACPPermissionModeMapping,
  type ACPSource,
} from '@ai-sdk/harness-acp';
import { commonTool, type HarnessV1PortEndpoint } from '@ai-sdk/harness';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { codexACPAskUserQuestions } from './codex-acp-question-tool';

const webSearchActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('search'),
    query: z.string().optional(),
    queries: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('open_page'),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal('find_in_page'),
    url: z.string().optional(),
    pattern: z.string().optional(),
  }),
  z.object({ type: z.literal('other') }),
]);

const CODEX_ACP_EXECUTABLE = 'codex-acp';

const CODEX_ACP_SOURCE = {
  type: 'npm-simple',
  packageName: '@agentclientprotocol/codex-acp',
  packageVersion: '1.1.4',
} as const satisfies ACPSource;

const CODEX_ACP_BUILTIN_TOOLS = {
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    inputSchema: z.object({
      type: z.literal('webSearch').optional(),
      id: z.string().optional(),
      query: z.string(),
      action: webSearchActionSchema.nullable().optional(),
    }),
  }),
} as const;

const CODEX_ACP_PERMISSION_MODE_MAPPING = {
  'allow-reads': null,
  'allow-edits': null,
  'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
} as const satisfies ACPPermissionModeMapping;

const codexConfigSchema = z.object({
  model_provider: z.string().optional(),
  model_providers: z
    .record(
      z.object({
        base_url: z.string().optional(),
      }),
    )
    .optional(),
});

export type CodexACPHarnessSettings = {
  auth?: ACPAuthenticationMode;
  mcpServers?: Record<string, unknown>;
  mintBridgeToken?: (sandboxId: string) => string;
  port?: number;
  portEndpoint?: HarnessV1PortEndpoint;
  reasoningEffort?: 'low' | 'medium' | 'high';
  webSearch?: boolean;
  source?: ACPSource;
};

export function createCodexACP({
  auth = 'auto',
  mcpServers,
  mintBridgeToken,
  port,
  portEndpoint,
  reasoningEffort,
  webSearch,
  source = CODEX_ACP_SOURCE,
}: CodexACPHarnessSettings = {}) {
  const codexConfig = resolveCodexACPConfig({
    serializedConfig: process.env.CODEX_CONFIG,
    reasoningEffort,
    webSearch,
  });

  return createACP({
    harnessId: 'codex-acp',
    auth,
    mcpServers,
    isMcpToolCall: toolCall => toolCall._meta?.is_mcp_tool_call === true,
    askUserQuestions: codexACPAskUserQuestions,
    clientCapabilities: {
      elicitation: { form: {} },
    },
    mintBridgeToken,
    port,
    portEndpoint,
    source,
    executable: CODEX_ACP_EXECUTABLE,
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    forwardEnv: [],
    credentialEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    credentialBrokering: ({ env, sandboxEnv }) => {
      const environmentVariableName = env.CODEX_API_KEY
        ? 'CODEX_API_KEY'
        : 'OPENAI_API_KEY';
      const credential = env[environmentVariableName];
      const sandboxCredential = sandboxEnv?.[environmentVariableName];
      if (!credential || !sandboxCredential) return [];
      return [
        createCredentialRequestTransformation({
          matchUrl: resolveCodexACPBaseUrl({ env }),
          matchHeaders: {
            Authorization: `Bearer ${sandboxCredential}`,
          },
          transformHeaders: { Authorization: `Bearer ${credential}` },
        }),
      ];
    },
    instructionMapping: {
      type: 'launch-env-json',
      variable: 'CODEX_CONFIG',
      path: ['developer_instructions'],
    },
    env: {
      CODEX_CONFIG: JSON.stringify(codexConfig),
    },
    builtinTools: CODEX_ACP_BUILTIN_TOOLS,
    permissionModeMapping: CODEX_ACP_PERMISSION_MODE_MAPPING,
    authentication: {
      methodId: 'api-key',
    },
    providerAuthentication: {
      gateway: {
        env: {
          CODEX_API_KEY: { $source: 'gateway-api-key' },
          MODEL_PROVIDER: 'ai_gateway',
          CODEX_CONFIG: {
            features: { default_mode_request_user_input: true },
            ...(webSearch ? { web_search: 'live' } : {}),
            ...(reasoningEffort
              ? {
                  model_reasoning_effort: reasoningEffort,
                  model_reasoning_summary: 'detailed',
                }
              : {}),
            model: 'openai/gpt-5.6-sol',
            model_provider: 'ai_gateway',
            model_providers: {
              ai_gateway: {
                name: 'AI Gateway',
                base_url: {
                  $source: 'gateway-base-url',
                  ensureSuffix: '/v1',
                },
                env_key: 'CODEX_API_KEY',
                wire_api: 'responses',
                supports_websockets: false,
                http_headers: {
                  'User-Agent': { $source: 'client-app' },
                  'x-client-app': { $source: 'client-app' },
                },
              },
            },
            model_supports_reasoning_summaries: true,
            preferred_auth_method: 'apikey',
          },
        },
      },
    },
  });
}

function resolveCodexACPConfig({
  serializedConfig,
  reasoningEffort,
  webSearch,
}: {
  serializedConfig: string | undefined;
  reasoningEffort: CodexACPHarnessSettings['reasoningEffort'];
  webSearch: boolean | undefined;
}): Record<string, unknown> {
  const parsedConfig =
    serializedConfig == null
      ? undefined
      : z.record(z.unknown()).safeParse(secureJsonParse(serializedConfig));
  const config = parsedConfig?.success ? parsedConfig.data : {};
  const parsedFeatures = z.record(z.boolean()).safeParse(config.features);

  return {
    ...config,
    features: {
      ...(parsedFeatures.success ? parsedFeatures.data : {}),
      default_mode_request_user_input: true,
    },
    ...(webSearch ? { web_search: 'live' } : {}),
    ...(reasoningEffort
      ? {
          model_reasoning_effort: reasoningEffort,
          model_reasoning_summary: 'detailed',
        }
      : {}),
  };
}

function resolveCodexACPBaseUrl({
  env,
}: {
  env: Readonly<Record<string, string>>;
}): string {
  const config = env.CODEX_CONFIG;
  if (config != null) {
    try {
      const result = codexConfigSchema.safeParse(secureJsonParse(config));
      if (result.success && result.data.model_provider != null) {
        const baseUrl =
          result.data.model_providers?.[result.data.model_provider]?.base_url;
        if (baseUrl != null) return baseUrl;
      }
    } catch {}
  }
  return 'https://api.openai.com/v1';
}
