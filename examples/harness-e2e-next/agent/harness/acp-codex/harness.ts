import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createACP,
  type ACPPermissionModeMapping,
  type ACPResolveHostToolCall,
} from '@ai-sdk/harness-acp';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { codexACPBuiltinTools } from './builtin-tools';

const harnessId = 'acp-codex';
const bridgeDirectory = path.join(
  process.cwd(),
  'agent',
  'harness',
  'acp-codex',
  'bridge',
);

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

/*
 * codex-acp reports MCP tool calls with a `{ server, tool, arguments }` raw
 * input, so host tool calls are identified by the harness-owned server name.
 */
const resolveCodexACPHostToolCall: ACPResolveHostToolCall = ({
  toolCall,
  serverName,
  toolNames,
}) => {
  const rawInput = toolCall.rawInput;
  if (
    !isRecord(rawInput) ||
    rawInput.server !== serverName ||
    typeof rawInput.tool !== 'string' ||
    !toolNames.includes(rawInput.tool) ||
    !isRecord(rawInput.arguments)
  ) {
    return undefined;
  }
  return { toolName: rawInput.tool, input: rawInput.arguments };
};

export const codexACPHarness = createACP({
  harnessId,
  builtinTools: codexACPBuiltinTools,
  resolveHostToolCall: resolveCodexACPHostToolCall,
  isMcpToolCall: toolCall => toolCall._meta?.is_mcp_tool_call === true,
  source: {
    type: 'npm-locked',
    packageJson: readFileSync(
      path.join(bridgeDirectory, 'package.json'),
      'utf8',
    ),
    pnpmLockYaml: readFileSync(
      path.join(bridgeDirectory, 'pnpm-lock.yaml'),
      'utf8',
    ),
  },
  executable: 'codex-acp',
  modelMapping: {
    type: 'session-config-option',
    path: 'model',
  },
  forwardEnv: ['CODEX_CONFIG'],
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
  permissionModeMapping: {
    'allow-reads': null,
    'allow-edits': null,
    'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
  } as const satisfies ACPPermissionModeMapping,
  authentication: {
    methodId: 'api-key',
  },
  providerAuthentication: {
    gateway: {
      env: {
        CODEX_API_KEY: { $source: 'gateway-api-key' },
        CODEX_CONFIG: {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
