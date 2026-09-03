import {
  commonTool,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1CredentialForwarding,
  type HarnessV1PortEndpoint,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import { createCredentialRequestTransformation } from '@ai-sdk/harness/utils';
import { createACP, type ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { VERSION } from './version';

declare const __GITHUB_COPILOT_IMPLEMENTATION_PACKAGE_JSON__: string;
declare const __GITHUB_COPILOT_IMPLEMENTATION_PNPM_LOCK_YAML__: string;
declare const __GITHUB_COPILOT_IMPLEMENTATION_PNPM_WORKSPACE_YAML__: string;

const GITHUB_COPILOT_CLIENT_APP = {
  name: 'ai-sdk/harness-github-copilot',
  version: VERSION,
} as const;
const GITHUB_COPILOT_IMPLEMENTATION_PACKAGE_JSON =
  __GITHUB_COPILOT_IMPLEMENTATION_PACKAGE_JSON__;
const GITHUB_COPILOT_IMPLEMENTATION_PNPM_LOCK =
  __GITHUB_COPILOT_IMPLEMENTATION_PNPM_LOCK_YAML__;
const GITHUB_COPILOT_IMPLEMENTATION_PNPM_WORKSPACE =
  __GITHUB_COPILOT_IMPLEMENTATION_PNPM_WORKSPACE_YAML__;

export type GitHubCopilotAuthenticationMode = ACPAuthenticationMode;

export type GitHubCopilotHarnessSettings = {
  readonly auth?: GitHubCopilotAuthenticationMode;
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  readonly reasoningEffort?:
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';
  readonly mcpServers?: Record<string, unknown>;
  readonly port?: number;
  readonly portEndpoint?: HarnessV1PortEndpoint;
  readonly startupTimeoutMs?: number;
  readonly mintBridgeToken?: (sandboxId: string) => string;
};

/*
 * This catalog reflects the stable, non-MCP tool surface emitted by GitHub
 * Copilot CLI 1.0.82. Loose object schemas preserve compatibility when the
 * CLI adds fields without changing the established inputs.
 */
const GITHUB_COPILOT_BUILTIN_TOOLS = {
  bash: {
    ...commonTool('bash', {
      nativeName: 'bash',
      toolUseKind: 'bash',
      inputSchema: z.looseObject({
        command: z.string(),
        description: z.string().optional(),
        shellId: z.string().optional(),
        mode: z.enum(['sync', 'async']).optional(),
        detach: z.boolean().optional(),
        initial_wait: z.number().optional(),
      }),
    }),
  },
  read_bash: {
    ...tool({
      title: 'Reading shell output',
      inputSchema: z.looseObject({
        shellId: z.string(),
        delay: z.number(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  stop_bash: {
    ...tool({
      title: 'Stopping shell session',
      inputSchema: z.looseObject({ shellId: z.string() }),
    }),
    toolUseKind: 'bash',
  },
  list_bash: {
    ...tool({
      title: 'list_bash',
      inputSchema: z.looseObject({}),
    }),
    toolUseKind: 'readonly',
  },
  view: {
    ...tool({
      title: 'Viewing ',
      inputSchema: z.looseObject({
        path: z.string(),
        view_range: z.array(z.number()).optional(),
        forceReadLargeFiles: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  create: {
    ...tool({
      title: 'Creating ',
      inputSchema: z.looseObject({
        path: z.string(),
        file_text: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  edit: {
    ...tool({
      title: 'Editing ',
      inputSchema: z.looseObject({
        path: z.string(),
        old_str: z.string().optional(),
        new_str: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  web_fetch: {
    ...tool({
      title: 'Fetching ',
      inputSchema: z.looseObject({
        url: z.string(),
        max_length: z.number().optional(),
        start_index: z.number().optional(),
        raw: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  skill: tool({
    title: 'Using skill: ',
    inputSchema: z.looseObject({ skill: z.string() }),
  }),
  sql: tool({
    inputSchema: z.looseObject({
      description: z.string(),
      query: z.string(),
      database: z.enum(['session', 'session_store']).optional(),
    }),
  }),
  read_agent: {
    ...tool({
      title: 'read_agent',
      inputSchema: z.looseObject({
        agent_id: z.string(),
        wait: z.boolean().optional(),
        timeout: z.number().optional(),
        since_turn: z.number().int().nonnegative().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  list_agents: {
    ...tool({
      title: 'list_agents',
      inputSchema: z.looseObject({
        include_completed: z.boolean().optional(),
        scope: z.enum(['siblings', 'children', 'all']).optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  write_agent: tool({
    title: 'write_agent',
    inputSchema: z.looseObject({
      message: z.string(),
      agent_id: z.string().optional(),
      agent_ids: z.array(z.string()).optional(),
      scope: z.enum(['siblings', 'children']).optional(),
    }),
  }),
  grep: {
    ...commonTool('grep', {
      nativeName: 'grep',
      toolUseKind: 'readonly',
      inputSchema: z.looseObject({
        pattern: z.string(),
        path: z.string().optional(),
        paths: z.array(z.string()).optional(),
        glob: z.string().optional(),
        output_mode: z
          .enum(['content', 'files_with_matches', 'count'])
          .optional(),
        case_insensitive: z.boolean().optional(),
        multiline: z.boolean().optional(),
        head_limit: z.number().optional(),
        context: z.number().optional(),
        before_context: z.number().optional(),
        after_context: z.number().optional(),
      }),
    }),
    title: 'Searching for ',
  },
  glob: {
    ...commonTool('glob', {
      nativeName: 'glob',
      toolUseKind: 'readonly',
      inputSchema: z.looseObject({
        pattern: z.string(),
        paths: z.array(z.string()).optional(),
      }),
    }),
    title: 'Finding files matching ',
  },
  task: tool({
    inputSchema: z.looseObject({
      name: z.string(),
      prompt: z.string(),
      agent_type: z.enum([
        'explore',
        'task',
        'general-purpose',
        'code-review',
        'research',
        'security-review',
      ]),
      description: z.string(),
      model: z.string().optional(),
      context_tier: z.enum(['default', 'long_context']).optional(),
      mode: z.enum(['sync', 'background']).optional(),
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export type GitHubCopilotBuiltinTools = typeof GITHUB_COPILOT_BUILTIN_TOOLS;

export function createGitHubCopilot(
  settings: GitHubCopilotHarnessSettings = {},
): HarnessV1<GitHubCopilotBuiltinTools> {
  const mcpToolTitlePrefixes = [
    'github-mcp-server-',
    ...Object.keys(settings.mcpServers ?? {}).map(name => `${name}-`),
  ];

  return createACP({
    version: 'v1',
    harnessId: 'github-copilot',
    clientApp: GITHUB_COPILOT_CLIENT_APP,
    source: {
      type: 'npm-locked',
      packageJson: GITHUB_COPILOT_IMPLEMENTATION_PACKAGE_JSON,
      pnpmLockYaml: GITHUB_COPILOT_IMPLEMENTATION_PNPM_LOCK,
      pnpmWorkspaceYaml: GITHUB_COPILOT_IMPLEMENTATION_PNPM_WORKSPACE,
    },
    executable: 'copilot',
    args: [
      '--acp',
      '--stdio',
      '--no-auto-update',
      ...(settings.reasoningEffort == null
        ? []
        : [`--reasoning-effort=${settings.reasoningEffort}`]),
    ],
    auth: settings.auth,
    forwardEnv: ['COPILOT_GH_HOST', 'GH_HOST'],
    credentialEnv: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'],
    credentialBrokering: ({ env, sandboxEnv }) => {
      const transformations: HarnessV1RequestTransformation[] = [];
      const githubHost = normalizeGitHubHost(
        env.COPILOT_GH_HOST ?? env.GH_HOST ?? 'github.com',
      );
      const githubHosts = [
        githubHost,
        `*.${githubHost}`,
        ...(githubHost === 'github.com'
          ? ['githubcopilot.com', '*.githubcopilot.com']
          : []),
      ];

      for (const host of githubHosts) {
        if (env.COPILOT_GITHUB_TOKEN && sandboxEnv?.COPILOT_GITHUB_TOKEN) {
          transformations.push(
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: {
                      exact: `Bearer ${sandboxEnv.COPILOT_GITHUB_TOKEN}`,
                    },
                  },
                ],
              },
              transform: {
                headers: {
                  Authorization: `Bearer ${env.COPILOT_GITHUB_TOKEN}`,
                },
              },
            },
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: {
                      exact: `token ${sandboxEnv.COPILOT_GITHUB_TOKEN}`,
                    },
                  },
                ],
              },
              transform: {
                headers: {
                  Authorization: `token ${env.COPILOT_GITHUB_TOKEN}`,
                },
              },
            },
          );
        }

        if (env.GH_TOKEN && sandboxEnv?.GH_TOKEN) {
          transformations.push(
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: { exact: `Bearer ${sandboxEnv.GH_TOKEN}` },
                  },
                ],
              },
              transform: {
                headers: { Authorization: `Bearer ${env.GH_TOKEN}` },
              },
            },
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: { exact: `token ${sandboxEnv.GH_TOKEN}` },
                  },
                ],
              },
              transform: {
                headers: { Authorization: `token ${env.GH_TOKEN}` },
              },
            },
          );
        }

        if (env.GITHUB_TOKEN && sandboxEnv?.GITHUB_TOKEN) {
          transformations.push(
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: { exact: `Bearer ${sandboxEnv.GITHUB_TOKEN}` },
                  },
                ],
              },
              transform: {
                headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}` },
              },
            },
            {
              match: {
                host,
                headers: [
                  {
                    key: { exact: 'Authorization' },
                    value: { exact: `token ${sandboxEnv.GITHUB_TOKEN}` },
                  },
                ],
              },
              transform: {
                headers: { Authorization: `token ${env.GITHUB_TOKEN}` },
              },
            },
          );
        }
      }

      const providerCredential = env.COPILOT_PROVIDER_API_KEY;
      const sandboxProviderCredential = sandboxEnv?.COPILOT_PROVIDER_API_KEY;
      const providerBaseUrl = env.COPILOT_PROVIDER_BASE_URL;
      if (providerCredential && sandboxProviderCredential && providerBaseUrl) {
        transformations.push(
          createCredentialRequestTransformation({
            matchUrl: providerBaseUrl,
            matchHeaders: {
              Authorization: `Bearer ${sandboxProviderCredential}`,
            },
            transformHeaders: {
              Authorization: `Bearer ${providerCredential}`,
            },
          }),
        );
      }

      return transformations;
    },
    credentialForwarding: settings.credentialForwarding,
    providerAuthentication: {
      gateway: {
        env: {
          COPILOT_PROVIDER_BASE_URL: {
            $source: 'gateway-base-url',
            ensureSuffix: '/v1',
          },
          COPILOT_PROVIDER_TYPE: 'openai',
          COPILOT_PROVIDER_API_KEY: {
            $source: 'gateway-api-key',
          },
          COPILOT_PROVIDER_WIRE_API: 'responses',
          COPILOT_MODEL: 'openai/gpt-5.5',
          COPILOT_PROVIDER_HEADERS: {
            $source: 'client-app',
            prefix: 'x-client-app: ',
          },
        },
      },
    },
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    skillsDirectory: '.copilot/skills',
    builtinTools: GITHUB_COPILOT_BUILTIN_TOOLS,
    mcpServers: settings.mcpServers,
    isMcpToolCall: toolCall =>
      mcpToolTitlePrefixes.some(prefix => toolCall.title.startsWith(prefix)),
    port: settings.port,
    portEndpoint: settings.portEndpoint,
    startupTimeoutMs: settings.startupTimeoutMs,
    mintBridgeToken: settings.mintBridgeToken,
  });
}

function normalizeGitHubHost(host: string): string {
  return new URL(host.includes('://') ? host : `https://${host}`).hostname;
}
