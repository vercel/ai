import {
  createACP,
  type ACPAuthOptions,
  type ACPPermissionModeMapping,
  type ACPSource,
} from '@ai-sdk/harness-acp';
import { commonTool } from '@ai-sdk/harness';
import { z } from 'zod';

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

export function createCodexACP({
  auth = 'auto',
  webSearch,
  source = CODEX_ACP_SOURCE,
}: {
  auth?: ACPAuthOptions;
  webSearch?: boolean;
  source?: ACPSource;
} = {}) {
  return createACP({
    harnessId: 'codex-acp',
    auth,
    source,
    executable: CODEX_ACP_EXECUTABLE,
    forwardEnv: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    ...(webSearch
      ? {
          env: {
            CODEX_CONFIG: JSON.stringify({ web_search: 'live' }),
          },
        }
      : {}),
    builtinTools: CODEX_ACP_BUILTIN_TOOLS,
    permissionModeMapping: CODEX_ACP_PERMISSION_MODE_MAPPING,
    authentication: {
      methodId: 'api-key',
    },
    providerAuthentication: {
      gateway: {
        env: {
          CODEX_API_KEY: { $source: 'gateway-api-key' },
          CODEX_CONFIG: {
            ...(webSearch ? { web_search: 'live' } : {}),
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
