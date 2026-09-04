import {
  HARNESS_V1_BUILTIN_TOOLS,
  commonTool,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1CredentialForwarding,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { createACP, type ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { VERSION } from './version';
import { grokBuildAskUserQuestions } from './grok-build-question-tool';

declare const __GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON__: string;
declare const __GROK_BUILD_IMPLEMENTATION_PNPM_LOCK_YAML__: string;
declare const __GROK_BUILD_IMPLEMENTATION_PNPM_WORKSPACE_YAML__: string;

const GROK_BUILD_CLIENT_APP = `ai-sdk/harness-grok-build/${VERSION}`;
const GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON =
  __GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON__;
const GROK_BUILD_IMPLEMENTATION_PNPM_LOCK =
  __GROK_BUILD_IMPLEMENTATION_PNPM_LOCK_YAML__;
const GROK_BUILD_IMPLEMENTATION_PNPM_WORKSPACE =
  __GROK_BUILD_IMPLEMENTATION_PNPM_WORKSPACE_YAML__;

export type GrokBuildAuthenticationMode = ACPAuthenticationMode;

export type GrokBuildHarnessSettings = {
  /**
   * Selects direct xAI or AI Gateway authentication. Defaults to automatic
   * environment-based selection.
   */
  readonly auth?: GrokBuildAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Grok model id selected through Grok Build configuration. Leaving this
   * unset uses the default model.
   *
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
  /**
   * Reasoning effort for reasoning-capable models. Leaving this unset defers
   * to Grok Build's default.
   */
  readonly reasoningEffort?:
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';
  /**
   * Overrides the sandbox port used by the ACP bridge.
   */
  readonly port?: number;
  /**
   * Override the host endpoint used to connect to the sandbox bridge. Required
   * together with `port` when using a basic sandbox session.
   */
  readonly portEndpoint?: HarnessV1PortEndpoint;
  /**
   * Maximum milliseconds to wait for the ACP bridge to start.
   */
  readonly startupTimeoutMs?: number;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: (sandboxId: string) => string;
};

/*
 * Tool names and inputs were captured from the model request produced by
 * @xai-official/grok 0.2.111, the version used by the pinned Grok Build ACP
 * implementation.
 */
const GROK_BUILD_BUILTIN_TOOLS = {
  askUserQuestions: HARNESS_V1_BUILTIN_TOOLS.askUserQuestions,
  bash: commonTool('bash', {
    nativeName: 'run_terminal_command',
    toolUseKind: 'bash',
    inputSchema: z.looseObject({
      command: z.string(),
      timeout: z.number().int().min(0).max(36_000_000).nullable().optional(),
      description: z.string().optional(),
      background: z.boolean().optional(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'search_replace',
    toolUseKind: 'edit',
    inputSchema: z.looseObject({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      pattern: z.string(),
      path: z.string().nullable().optional(),
      glob: z.string().nullable().optional(),
      '-B': z.number().int().optional(),
      '-A': z.number().int().optional(),
      '-C': z.number().int().optional(),
      '-i': z.boolean().optional(),
      type: z.string().nullable().optional(),
      head_limit: z.number().int().optional(),
      multiline: z.boolean().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      query: z.string(),
      allowed_domains: z.array(z.string()).nullable().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    inputSchema: z.looseObject({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  read_file: {
    ...tool({
      inputSchema: z.looseObject({
        target_file: z.string(),
        offset: z.number().int().optional(),
        limit: z.number().int().optional(),
        pages: z.string().nullable().optional(),
        format: z.string().nullable().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  list_dir: {
    ...tool({
      inputSchema: z.looseObject({
        target_directory: z.string(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  kill_command_or_subagent: tool({
    inputSchema: z.looseObject({
      task_id: z.string(),
    }),
  }),
  todo_write: tool({
    inputSchema: z.looseObject({
      merge: z.boolean().optional(),
      todos: z.array(
        z.looseObject({
          id: z.string(),
          content: z.string().nullable().optional(),
          status: z
            .enum(['pending', 'in_progress', 'completed', 'cancelled'])
            .nullable()
            .optional(),
        }),
      ),
    }),
  }),
  get_command_or_subagent_output: {
    ...tool({
      inputSchema: z.looseObject({
        task_ids: z.array(z.string()).optional(),
        timeout_ms: z.number().int().nonnegative().nullable().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  spawn_subagent: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      description: z.string(),
      subagent_type: z.string().optional(),
      background: z.boolean().optional(),
      capability_mode: z
        .enum(['read-only', 'read-write', 'execute', 'all'])
        .nullable()
        .optional(),
      isolation: z.enum(['none', 'worktree']).nullable().optional(),
      resume_from: z.string().nullable().optional(),
      cwd: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
    }),
  }),
  scheduler_create: tool({
    inputSchema: z.looseObject({
      task_id: z.string().nullable().optional(),
      interval: z.string().nullable().optional(),
      prompt: z.string().nullable().optional(),
      durable: z.boolean().nullable().optional(),
      foreground: z.boolean().nullable().optional(),
      fire_immediately: z.boolean().optional(),
    }),
  }),
  scheduler_delete: tool({
    inputSchema: z.looseObject({ id: z.string() }),
  }),
  scheduler_list: {
    ...tool({ inputSchema: z.looseObject({}) }),
    toolUseKind: 'readonly',
  },
  monitor: tool({
    inputSchema: z.looseObject({
      command: z.string(),
      description: z.string(),
      timeout_ms: z.number().int().nonnegative().nullable().optional(),
      persistent: z.boolean().optional(),
    }),
  }),
  search_tool: {
    ...tool({
      inputSchema: z.looseObject({
        query: z.string(),
        limit: z.number().int().min(0).max(255).nullable().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  use_tool: tool({
    inputSchema: z.looseObject({
      tool_name: z.string(),
      tool_input: z.looseObject({}),
    }),
  }),
  workflow: tool({
    inputSchema: z.looseObject({
      agent_budget: z.number().int().min(1).max(1024).nullable().optional(),
      name: z.string().nullable().optional(),
      script: z.string().nullable().optional(),
      script_path: z.string().nullable().optional(),
      args: z.unknown().optional(),
      resume_from_run_id: z.string().nullable().optional(),
      validate_only: z.boolean().optional(),
    }),
  }),
  enter_plan_mode: tool({ inputSchema: z.looseObject({}) }),
  exit_plan_mode: tool({ inputSchema: z.looseObject({}) }),
  image_gen: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      aspect_ratio: z.string().optional(),
    }),
  }),
  image_edit: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      image: z.array(z.string()),
      aspect_ratio: z.string().optional(),
    }),
  }),
  image_to_video: tool({
    inputSchema: z.looseObject({
      prompt: z.string().nullable().optional(),
      image: z.string(),
      duration: z.number().int().nonnegative().nullable().optional(),
      resolution_name: z.string().optional(),
    }),
  }),
  reference_to_video: tool({
    inputSchema: z.looseObject({
      prompt: z.string(),
      images: z.array(z.string()),
      aspect_ratio: z.string(),
      duration: z.number().int().nonnegative().nullable().optional(),
      resolution_name: z.string().optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export function createGrokBuild(
  settings: GrokBuildHarnessSettings = {},
): HarnessV1<typeof GROK_BUILD_BUILTIN_TOOLS> {
  const clientAppSegments = GROK_BUILD_CLIENT_APP.split('/');
  const clientAppVersion = clientAppSegments.pop()!;
  return createACP({
    auth: settings.auth,
    credentialForwarding: settings.credentialForwarding,
    modelId: settings.model,
    port: settings.port,
    portEndpoint: settings.portEndpoint,
    startupTimeoutMs: settings.startupTimeoutMs,
    mcpServers: settings.mcpServers,
    modelMapping: {
      type: 'session-model',
      path: 'modelId',
    },
    isMcpToolCall: toolCall => {
      const metadata = toolCall._meta?.['x.ai/tool'];
      return isRecord(metadata) && metadata.namespace === 'mcp';
    },
    mintBridgeToken: settings.mintBridgeToken,
    version: 'v1',
    harnessId: 'grok-build',
    builtinTools: GROK_BUILD_BUILTIN_TOOLS,
    askUserQuestions: grokBuildAskUserQuestions,
    clientApp: {
      name: clientAppSegments.join('/'),
      version: clientAppVersion,
    },
    source: {
      type: 'npm-locked',
      packageJson: GROK_BUILD_IMPLEMENTATION_PACKAGE_JSON,
      pnpmLockYaml: GROK_BUILD_IMPLEMENTATION_PNPM_LOCK,
      pnpmWorkspaceYaml: GROK_BUILD_IMPLEMENTATION_PNPM_WORKSPACE,
    },
    executable: 'grok',
    args: [
      'agent',
      ...(settings.reasoningEffort == null
        ? []
        : ['--reasoning-effort', settings.reasoningEffort]),
      'stdio',
    ],
    credentialEnv: ['XAI_API_KEY'],
    credentialBrokering: ({ env, sandboxEnv, headers }) => {
      if (!env.XAI_API_KEY || !sandboxEnv?.XAI_API_KEY) return [];
      return [
        createCredentialRequestTransformation({
          matchUrl: env.GROK_XAI_API_BASE_URL ?? 'https://api.x.ai/v1',
          matchHeaders: {
            Authorization: `Bearer ${sandboxEnv.XAI_API_KEY}`,
          },
          transformHeaders: {
            ...headers,
            Authorization: `Bearer ${env.XAI_API_KEY}`,
          },
        }),
      ];
    },
    instructionMapping: {
      type: 'session-meta',
      path: ['rules'],
    },
    outputSchemaMapping: {
      type: 'session-prompt-meta',
      path: ['outputSchema'],
    },
    providerAuthentication: {
      gateway: {
        env: {
          GROK_CLIENT_NAME: { $source: 'client-app-name' },
          GROK_CLIENT_VERSION: { $source: 'client-app-version' },
          XAI_API_KEY: { $source: 'gateway-api-key' },
          GROK_XAI_API_BASE_URL: {
            $source: 'gateway-base-url',
            ensureSuffix: '/v1',
          },
          GROK_MODELS_BASE_URL: {
            $source: 'gateway-base-url',
            ensureSuffix: '/v1',
          },
        },
      },
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
