import {
  commonTool,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1CredentialForwarding,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import {
  createCredentialRequestTransformation,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';
import { createACP, type ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { VERSION } from './version';

const FX_CLIENT_APP = `ai-sdk/harness-fx/${VERSION}`;
const DEFAULT_AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

export type FxAuthenticationMode = ACPAuthenticationMode;

function sanitizeFxMcpToolNameSegment(value: string): string {
  if (value.length === 0) return 'server';

  let result = '';
  for (const byte of new TextEncoder().encode(value)) {
    result +=
      (byte >= 48 && byte <= 57) ||
      (byte >= 65 && byte <= 90) ||
      (byte >= 97 && byte <= 122) ||
      byte === 45 ||
      byte === 95
        ? String.fromCharCode(byte)
        : '_';
  }
  return result;
}

export type FxHarnessSettings = {
  /**
   * Selects direct or AI Gateway authentication. Both routes use AI Gateway
   * because fx does not connect to model providers directly. Pass an
   * authentication environment to supply credentials programmatically, or
   * omit it for automatic host-environment selection.
   */
  readonly auth?: FxAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Model id selected through ACP. Unset preserves fx's default.
   *
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
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
   * MCP server definitions keyed by server name. Each definition uses fx's
   * native ACP MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: (sandboxId: string) => string;
};

const terminalShellSchema = z.looseObject({
  kind: z.enum(['user_login', 'executable']),
  path: z.string().optional(),
  clean_start: z.boolean().optional(),
});

const terminalReturnSchema = z.looseObject({
  kind: z.enum(['started', 'exit', 'quiet', 'match']),
  duration_ms: z.number().int().positive().optional(),
  pattern: z.string().optional(),
});

const terminalDimensionsSchema = z.looseObject({
  rows: z.number().int().min(1).max(4096),
  columns: z.number().int().min(1).max(4096),
});

const terminalMonitorConditionSchema = z.looseObject({
  kind: z.enum([
    'process_exit',
    'exit_code',
    'signal',
    'output_contains',
    'output_matches',
    'output_quiet',
    'screen_matches',
    'tcp_ready',
    'http_ready',
    'path_exists',
    'path_changed',
    'path_size',
    'custom_probe',
  ]),
  pattern: z.string().optional(),
  duration_ms: z.number().int().min(10).max(86_400_000).optional(),
  exit_code: z.number().int().optional(),
  signal: z
    .enum(['hangup', 'interrupt', 'quit', 'terminate', 'kill'])
    .optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  path: z.string().optional(),
  minimum_bytes: z.number().int().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
});

const terminalMonitorDefinitionSchema = z.looseObject({
  condition: terminalMonitorConditionSchema,
  check_interval_ms: z.number().int().min(10).max(86_400_000).optional(),
  notify: z.looseObject({
    kind: z.enum([
      'on_match',
      'on_state_change',
      'on_exit',
      'every_check',
      'every_n_checks',
      'interval',
    ]),
    count: z.number().int().positive().optional(),
    interval_ms: z.number().int().min(10).max(86_400_000).optional(),
  }),
  lifetime: z.looseObject({
    kind: z.enum(['until_match', 'until_session_end', 'duration']),
    duration_ms: z.number().int().min(1).max(31_536_000_000).optional(),
  }),
});

const terminalRequestSchema = z.looseObject({
  action: z.enum([
    'exec',
    'start',
    'read',
    'screen',
    'write',
    'wait',
    'monitor',
    'inspect',
    'list',
    'resize',
    'signal',
    'close',
  ]),
  session_id: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  command: z.string().max(65_536).nullable().optional(),
  profile: z.enum(['clean', 'user']).nullable().optional(),
  shell: terminalShellSchema.nullable().optional(),
  backend: z.enum(['native', 'tmux']).nullable().optional(),
  return_when: terminalReturnSchema.nullable().optional(),
  wait_ceiling_ms: z.number().int().positive().nullable().optional(),
  dimensions: terminalDimensionsSchema.nullable().optional(),
  initial_monitors: z
    .array(terminalMonitorDefinitionSchema)
    .max(32)
    .nullable()
    .optional(),
  cursor_segment: z.number().int().positive().nullable().optional(),
  cursor_offset: z.number().int().nullable().optional(),
  after_event_id: z.number().int().nullable().optional(),
  acknowledge_event_id: z.number().int().positive().nullable().optional(),
  max_events: z.number().int().min(1).max(256).nullable().optional(),
  write: z
    .looseObject({
      kind: z.enum(['text', 'keys', 'controls', 'paste']),
      text: z.string().optional(),
      keys: z
        .array(
          z.enum([
            'enter',
            'tab',
            'escape',
            'backspace',
            'delete',
            'insert',
            'arrow_up',
            'arrow_down',
            'arrow_left',
            'arrow_right',
            'home',
            'end',
            'page_up',
            'page_down',
          ]),
        )
        .optional(),
      controls: z.array(z.number().int()).optional(),
    })
    .nullable()
    .optional(),
  lease: z.enum(['acquire', 'use', 'release', 'revoke']).nullable().optional(),
  monitor: z
    .looseObject({
      kind: z.enum(['add', 'update', 'pause', 'resume', 'remove']),
      monitor_id: z.string().optional(),
      definition: terminalMonitorDefinitionSchema.optional(),
    })
    .nullable()
    .optional(),
  task_id: z.string().nullable().optional(),
  workspace_root: z.string().nullable().optional(),
  rows: z.number().int().min(1).max(4096).nullable().optional(),
  columns: z.number().int().min(1).max(4096).nullable().optional(),
  signal: z
    .enum(['hangup', 'interrupt', 'quit', 'terminate', 'kill'])
    .nullable()
    .optional(),
  close_policy: z.enum(['graceful', 'force']).nullable().optional(),
});

const subagentNotificationsSchema = z.looseObject({
  terminal: z
    .looseObject({
      completed: z.boolean().optional(),
      failed: z.boolean().optional(),
      cancelled: z.boolean().optional(),
    })
    .optional(),
  milestones: z.array(z.string()).max(32).optional(),
  report_interval_ms: z.number().int().positive().optional(),
  report_duration_ms: z.number().int().positive().optional(),
  stop_conditions: z
    .array(z.enum(['terminal', 'duration_elapsed']))
    .max(8)
    .optional(),
});

const FX_BUILTIN_TOOLS = {
  glob: commonTool('glob', {
    nativeName: 'glob_files',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      pattern: z.string(),
      path: z.string().optional(),
      mode: z.enum(['matches', 'count']).optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep_files',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      pattern: z.string(),
      path: z.string().optional(),
      include: z.string().optional(),
      case_insensitive: z.boolean().optional(),
      mode: z.enum(['matches', 'files_with_matches', 'count']).optional(),
      head_limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      context_lines: z.number().int().nonnegative().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    inputSchema: z.looseObject({
      query: z.string().min(2),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),
  list_files: {
    ...tool({
      inputSchema: z.looseObject({ path: z.string().optional() }),
    }),
    toolUseKind: 'readonly',
  },
  read_file: {
    ...tool({
      inputSchema: z.looseObject({
        path: z.string(),
        start_line: z.number().int().positive().optional(),
        line_count: z.number().int().positive().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  write_file: {
    ...tool({
      inputSchema: z.looseObject({
        path: z.string(),
        content: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  edit_file: {
    ...tool({
      inputSchema: z.looseObject({
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  delete_file: {
    ...tool({ inputSchema: z.looseObject({ path: z.string() }) }),
    toolUseKind: 'edit',
  },
  rename_file: {
    ...tool({
      inputSchema: z.looseObject({
        old_path: z.string(),
        new_path: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  copy_file: {
    ...tool({
      inputSchema: z.looseObject({
        source: z.string(),
        destination: z.string(),
      }),
    }),
    toolUseKind: 'edit',
  },
  create_folder: {
    ...tool({ inputSchema: z.looseObject({ path: z.string() }) }),
    toolUseKind: 'edit',
  },
  file_info: {
    ...tool({ inputSchema: z.looseObject({ path: z.string() }) }),
    toolUseKind: 'readonly',
  },
  memory: tool({
    inputSchema: z.looseObject({
      action: z.enum(['save', 'list', 'clear']),
      fact: z.string().optional(),
    }),
  }),
  semantic_search: {
    ...tool({
      inputSchema: z.looseObject({
        query: z.string(),
        path: z.string().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  open_file: tool({
    inputSchema: z.looseObject({ path: z.string() }),
  }),
  web_fetch: {
    ...tool({ inputSchema: z.looseObject({ url: z.string() }) }),
    toolUseKind: 'readonly',
  },
  terminal: {
    ...tool({
      inputSchema: terminalRequestSchema,
    }),
    toolUseKind: 'bash',
  },
  skill: {
    ...tool({
      inputSchema: z.looseObject({
        name: z.string(),
        location: z.string().optional(),
        resource: z.string().optional(),
        offset: z.number().int().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  install_skill: {
    ...tool({
      inputSchema: z.looseObject({
        source: z.string(),
        skill: z.string().optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  subagent: tool({
    inputSchema: z.looseObject({
      command: z.looseObject({
        create: z
          .looseObject({
            name: z.string().min(1).max(128),
            mode: z.enum(['one_off', 'persistent']),
            prompt: z.string().min(1).max(65_536).optional(),
            model: z.string().min(1).max(256).optional(),
            effort: z.string().min(1).max(64).optional(),
            permission_mode: z.enum(['ask', 'auto', 'yolo']).optional(),
            notifications: subagentNotificationsSchema.optional(),
          })
          .optional(),
        inspect: z
          .looseObject({
            id: z.string().min(1),
            sections: z
              .array(
                z.enum([
                  'status',
                  'messages',
                  'tool_activity',
                  'events',
                  'configuration',
                  'relationship',
                ]),
              )
              .min(1)
              .max(6),
            cursor: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(100).optional(),
            wait: z
              .looseObject({
                until: z.literal('settled'),
                after_generation: z.number().int().nonnegative().optional(),
                timeout_ms: z.number().int().min(1).max(60_000),
              })
              .optional(),
          })
          .optional(),
        message: z
          .looseObject({
            send: z
              .looseObject({
                id: z.string().min(1),
                content: z.string().min(1).max(65_536),
              })
              .optional(),
            milestone: z
              .looseObject({ name: z.string().min(1).max(128) })
              .optional(),
          })
          .optional(),
        relationship: z
          .looseObject({
            action: z.enum(['attach', 'detach', 'reparent']),
            id: z.string().min(1),
            parent_id: z.string().min(1).optional(),
          })
          .optional(),
        configure: z
          .looseObject({
            id: z.string().min(1),
            name: z.string().min(1).max(128).optional(),
            model: z.string().min(1).max(256).optional(),
            effort: z.string().min(1).max(64).optional(),
            permission_mode: z.enum(['ask', 'auto', 'yolo']).optional(),
            notifications: subagentNotificationsSchema.optional(),
          })
          .optional(),
        lifecycle: z
          .looseObject({
            id: z.string().min(1),
            action: z.enum(['cancel', 'resume', 'close', 'reopen']),
          })
          .optional(),
      }),
    }),
  }),
  mcp_search_tools: {
    ...tool({
      inputSchema: z.looseObject({
        query: z.string(),
        limit: z.number().int().positive().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  mcp_select_tool: {
    ...tool({ inputSchema: z.looseObject({ name: z.string() }) }),
    toolUseKind: 'readonly',
  },
  mcp_features: {
    ...tool({
      inputSchema: z.looseObject({
        action: z.enum([
          'resource_list',
          'resource_templates',
          'resource_read',
          'prompt_list',
          'prompt_get',
          'prompt_complete',
          'resource_complete',
        ]),
        server: z.string(),
        uri: z.string().optional(),
        uri_template: z.string().optional(),
        prompt: z.string().optional(),
        argument: z.string().optional(),
        value: z.string().optional(),
        arguments: z.record(z.string(), z.string()).optional(),
        context: z.record(z.string(), z.string()).optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  ask_user_question: tool({
    inputSchema: z.looseObject({
      questions: z
        .array(
          z.looseObject({
            question: z.string(),
            options: z
              .array(
                z.looseObject({
                  label: z.string(),
                  description: z.string().optional(),
                }),
              )
              .min(2)
              .max(6),
          }),
        )
        .min(1)
        .max(4),
      permission_request_id: z.string().length(64).optional(),
    }),
  }),
  vision: tool({
    inputSchema: z.looseObject({
      image_ids: z.array(z.number().int()).min(1).optional(),
      paths: z.array(z.string()).min(1).optional(),
      focus: z.string().min(1),
    }),
  }),
  read_tool_result: {
    ...tool({
      inputSchema: z.looseObject({
        handle: z.string(),
        start_byte: z.number().int().positive().optional(),
        byte_count: z.number().int().positive().optional(),
        query: z.string().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export function createFx(
  settings: FxHarnessSettings = {},
): HarnessV1<typeof FX_BUILTIN_TOOLS> {
  const clientAppSegments = FX_CLIENT_APP.split('/');
  const clientAppVersion = clientAppSegments.pop()!;
  const suppliedAuthenticationEnvironment = isHarnessAuthenticationEnvironment(
    settings.auth,
  );
  const mcpToolTitlePrefixes = Object.keys(settings.mcpServers ?? {}).map(
    serverName => `mcp_${sanitizeFxMcpToolNameSegment(serverName)}_`,
  );

  return createACP({
    auth: settings.auth,
    credentialForwarding: settings.credentialForwarding,
    modelId: settings.model,
    port: settings.port,
    portEndpoint: settings.portEndpoint,
    startupTimeoutMs: settings.startupTimeoutMs,
    mcpServers: settings.mcpServers,
    isMcpToolCall: toolCall =>
      mcpToolTitlePrefixes.some(prefix => toolCall.title.startsWith(prefix)),
    mintBridgeToken: settings.mintBridgeToken,
    version: 'v1',
    harnessId: 'fx',
    builtinTools: FX_BUILTIN_TOOLS,
    clientApp: {
      name: clientAppSegments.join('/'),
      version: clientAppVersion,
    },
    source: {
      type: 'install-command',
      command: 'curl -fsSL https://fx.sh/setup.sh | bash',
    },
    executable: 'fx',
    args: ['acp'],
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    credentialEnv: ['VERCEL_OIDC_TOKEN', 'AI_GATEWAY_API_KEY'],
    credentialBrokering: ({ env, sandboxEnv, headers }) => {
      const environmentVariableName = suppliedAuthenticationEnvironment
        ? env.AI_GATEWAY_API_KEY
          ? 'AI_GATEWAY_API_KEY'
          : 'VERCEL_OIDC_TOKEN'
        : env.VERCEL_OIDC_TOKEN
          ? 'VERCEL_OIDC_TOKEN'
          : 'AI_GATEWAY_API_KEY';
      const credential = env[environmentVariableName];
      const sandboxCredential = sandboxEnv?.[environmentVariableName];
      if (!credential || !sandboxCredential) return [];
      return [
        createCredentialRequestTransformation({
          matchUrl: env.AI_GATEWAY_BASE_URL ?? DEFAULT_AI_GATEWAY_BASE_URL,
          matchHeaders: {
            Authorization: `Bearer ${sandboxCredential}`,
          },
          transformHeaders: {
            ...headers,
            Authorization: `Bearer ${credential}`,
            'x-client-app': FX_CLIENT_APP,
          },
        }),
      ];
    },
    providerAuthentication: {
      gateway: {
        env: {
          AI_GATEWAY_API_KEY: { $source: 'gateway-api-key' },
          AI_GATEWAY_BASE_URL: { $source: 'gateway-base-url' },
        },
      },
    },
    permissionModeMapping: {
      'allow-reads': { type: 'session-mode', modeId: 'ask' },
      'allow-edits': { type: 'session-mode', modeId: 'ask' },
      'allow-all': { type: 'session-mode', modeId: 'code' },
    },
  });
}
