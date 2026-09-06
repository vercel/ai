import {
  commonTool,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1CredentialForwarding,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import { createACP, type ACPAuthenticationMode } from '@ai-sdk/harness-acp';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { VERSION } from './version';

const CURSOR_CLIENT_APP = `ai-sdk/harness-cursor/${VERSION}`;

export type CursorHarnessSettings = {
  /**
   * Declares the provider authentication configured in Cursor, or supplies an
   * isolated environment for Cursor CLI authentication. The adapter cannot
   * change provider routing and warns for explicit routing modes.
   */
  readonly auth?: ACPAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Cursor model id selected through ACP. Unset preserves Cursor's default.
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
 * Tool variants, display titles, ACP kinds, and raw input projections were
 * captured from the official Cursor CLI 2026.08.11-e8db854 ACP implementation.
 * `mcpToolCall` is dynamic and `truncatedToolCall` is a transport sentinel, so
 * neither is exposed as a built-in.
 */
const CURSOR_BUILTIN_TOOLS = {
  bash: {
    ...commonTool('bash', {
      nativeName: 'shellToolCall',
      toolUseKind: 'bash',
      inputSchema: z.looseObject({ command: z.string() }),
    }),
    title: 'Terminal',
  },
  delete: {
    ...tool({
      title: 'Delete',
      inputSchema: z.looseObject({ path: z.string() }),
    }),
    nativeName: 'deleteToolCall',
    toolUseKind: 'edit',
  },
  glob: {
    ...commonTool('glob', {
      nativeName: 'globToolCall',
      toolUseKind: 'readonly',
      inputSchema: z.looseObject({ pattern: z.string() }),
    }),
    title: 'Find',
  },
  grep: {
    ...commonTool('grep', {
      nativeName: 'grepToolCall',
      toolUseKind: 'readonly',
      inputSchema: z.looseObject({
        pattern: z.string(),
        path: z.string().optional(),
      }),
    }),
    title: 'grep',
  },
  read: {
    ...tool({
      title: 'Read',
      inputSchema: z.looseObject({ path: z.string() }),
    }),
    nativeName: 'readToolCall',
    toolUseKind: 'readonly',
  },
  updateTodos: {
    ...tool({
      title: 'Update TODOs',
      inputSchema: z.looseObject({
        _toolName: z.literal('updateTodos'),
        todos: z
          .array(
            z.looseObject({
              id: z.string(),
              content: z.string(),
              status: z.string(),
            }),
          )
          .optional(),
      }),
    }),
    nativeName: 'updateTodosToolCall',
  },
  readTodos: {
    ...tool({
      title: 'Read TODOs',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'readTodosToolCall',
    toolUseKind: 'readonly',
  },
  edit: {
    ...tool({
      title: 'Edit',
      inputSchema: z.looseObject({ path: z.string() }),
    }),
    nativeName: 'editToolCall',
    toolUseKind: 'edit',
  },
  ls: {
    ...tool({
      title: 'List',
      inputSchema: z.looseObject({ path: z.string() }),
    }),
    nativeName: 'lsToolCall',
    toolUseKind: 'readonly',
  },
  readLints: {
    ...tool({
      title: 'Read Lints',
      inputSchema: z.looseObject({ paths: z.array(z.string()) }),
    }),
    nativeName: 'readLintsToolCall',
    toolUseKind: 'readonly',
  },
  semanticSearch: {
    ...tool({
      title: 'Codebase Search',
      inputSchema: z.looseObject({ query: z.string() }),
    }),
    nativeName: 'semSearchToolCall',
    toolUseKind: 'readonly',
  },
  createPlan: {
    ...tool({
      title: 'Create Plan',
      inputSchema: z.looseObject({
        _toolName: z.literal('createPlan'),
        name: z.string().optional(),
        plan: z.string().optional(),
      }),
    }),
    nativeName: 'createPlanToolCall',
  },
  webSearch: {
    ...tool({
      title: 'Web Search',
      inputSchema: z.looseObject({ searchTerm: z.string() }),
    }),
    nativeName: 'webSearchToolCall',
    toolUseKind: 'readonly',
  },
  task: {
    ...tool({
      title: 'Task',
      inputSchema: z.looseObject({
        _toolName: z.literal('task'),
        prompt: z.string().optional(),
        description: z.string().optional(),
        subagentType: z.unknown().optional(),
      }),
    }),
    nativeName: 'taskToolCall',
  },
  listMcpResources: {
    ...tool({
      title: 'List MCP Resources',
      inputSchema: z.looseObject({ server: z.string().optional() }),
    }),
    nativeName: 'listMcpResourcesToolCall',
    toolUseKind: 'readonly',
  },
  readMcpResource: {
    ...tool({
      title: 'Fetch MCP Resource',
      inputSchema: z.looseObject({
        server: z.string().optional(),
        uri: z.string().optional(),
        downloadPath: z.string().optional(),
      }),
    }),
    nativeName: 'readMcpResourceToolCall',
    toolUseKind: 'readonly',
  },
  applyAgentDiff: {
    ...tool({
      title: 'Apply Agent Diff',
      inputSchema: z.looseObject({ path: z.string().optional() }),
    }),
    nativeName: 'applyAgentDiffToolCall',
    toolUseKind: 'edit',
  },
  fetch: {
    ...tool({
      title: 'Fetch',
      inputSchema: z.looseObject({ url: z.string() }),
    }),
    nativeName: 'fetchToolCall',
    toolUseKind: 'readonly',
  },
  switchMode: {
    ...tool({
      title: 'Switch Mode',
      inputSchema: z.looseObject({
        targetModeId: z.string(),
        explanation: z.string().optional(),
      }),
    }),
    nativeName: 'switchModeToolCall',
  },
  generateImage: {
    ...tool({
      title: 'Generate Image',
      inputSchema: z.looseObject({
        _toolName: z.literal('generateImage'),
        description: z.string().optional(),
        filename: z.string().optional(),
      }),
    }),
    nativeName: 'generateImageToolCall',
  },
  recordScreen: {
    ...tool({
      title: 'Record Screen',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'recordScreenToolCall',
  },
  computerUse: {
    ...tool({
      title: 'Computer Use',
      inputSchema: z.looseObject({
        action: z.string().optional(),
        coordinate: z.unknown().optional(),
        text: z.string().optional(),
      }),
    }),
    nativeName: 'computerUseToolCall',
    toolUseKind: 'bash',
  },
  writeShellStdin: {
    ...tool({
      title: 'Write to stdin',
      inputSchema: z.looseObject({
        shellId: z.number().optional(),
        chars: z.string().optional(),
      }),
    }),
    nativeName: 'writeShellStdinToolCall',
    toolUseKind: 'bash',
  },
  reflect: {
    ...tool({
      title: 'Reflect',
      inputSchema: z.looseObject({ reflection: z.string().optional() }),
    }),
    nativeName: 'reflectToolCall',
    toolUseKind: 'readonly',
  },
  setupVmEnvironment: {
    ...tool({
      title: 'Setup VM Environment',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'setupVmEnvironmentToolCall',
    toolUseKind: 'bash',
  },
  replaceEnv: {
    ...tool({
      title: 'Replace Environment',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'replaceEnvToolCall',
    toolUseKind: 'bash',
  },
  startGrindExecution: {
    ...tool({
      title: 'Start Grind Execution',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'startGrindExecutionToolCall',
    toolUseKind: 'bash',
  },
  startGrindPlanning: {
    ...tool({
      title: 'Start Grind Planning',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'startGrindPlanningToolCall',
    toolUseKind: 'readonly',
  },
  webFetch: {
    ...tool({
      title: 'Web Fetch',
      inputSchema: z.looseObject({ url: z.string() }),
    }),
    nativeName: 'webFetchToolCall',
    toolUseKind: 'readonly',
  },
  reportBugfixResults: {
    ...tool({
      title: 'Report Bugfix Results',
      inputSchema: z.looseObject({}),
    }),
    nativeName: 'reportBugfixResultsToolCall',
  },
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

export function createCursor(
  settings: CursorHarnessSettings = {},
): HarnessV1<typeof CURSOR_BUILTIN_TOOLS> {
  const clientAppSegments = CURSOR_CLIENT_APP.split('/');
  const clientAppVersion = clientAppSegments.pop()!;

  if (settings.auth === 'direct' || settings.auth === 'ai-gateway') {
    warnCursorAuthenticationConfiguration({ auth: settings.auth });
  }

  return createACP({
    auth: typeof settings.auth === 'string' ? undefined : settings.auth,
    credentialForwarding: settings.credentialForwarding,
    modelId: settings.model,
    port: settings.port,
    portEndpoint: settings.portEndpoint,
    startupTimeoutMs: settings.startupTimeoutMs,
    mcpServers: settings.mcpServers,
    isMcpToolCall: toolCall => {
      const rawInput = toolCall.rawInput;
      return (
        isRecord(rawInput) &&
        typeof rawInput.providerIdentifier === 'string' &&
        typeof rawInput.toolName === 'string' &&
        isRecord(rawInput.args)
      );
    },
    mintBridgeToken: settings.mintBridgeToken,
    version: 'v1',
    harnessId: 'cursor',
    builtinTools: CURSOR_BUILTIN_TOOLS,
    clientApp: {
      name: clientAppSegments.join('/'),
      version: clientAppVersion,
    },
    source: {
      type: 'install-command',
      command: 'curl https://cursor.com/install -fsS | bash',
    },
    executable: 'agent',
    args: ['--disable-auto-update', 'acp'],
    modelMapping: {
      type: 'session-config-option',
      path: 'model',
    },
    clientCapabilities: {
      _meta: { parameterizedModelPicker: true },
    },
    credentialEnv: ['CURSOR_API_KEY'],
    credentialBrokering: ({ env, sandboxEnv, headers }) => {
      const transformations = [];
      if (env.CURSOR_API_KEY && sandboxEnv?.CURSOR_API_KEY) {
        transformations.push({
          match: {
            host: 'api2.cursor.sh',
            path: { exact: '/auth/exchange_user_api_key' },
            method: ['POST'],
            headers: [
              {
                key: { exact: 'Authorization' },
                value: {
                  exact: `Bearer ${sandboxEnv.CURSOR_API_KEY}`,
                },
              },
            ],
          },
          transform: {
            headers: {
              Authorization: `Bearer ${env.CURSOR_API_KEY}`,
            },
          },
        });
      }
      if (headers != null) {
        transformations.push({
          match:
            settings.auth === 'ai-gateway'
              ? {
                  host: 'ai-gateway.vercel.sh',
                  path: { startsWith: '/cursor/v1' },
                }
              : { host: 'api2.cursor.sh' },
          transform: { headers },
        });
      }
      return transformations;
    },
  });
}

function warnCursorAuthenticationConfiguration({
  auth,
}: {
  auth: Exclude<ACPAuthenticationMode, 'auto'>;
}): void {
  const detail =
    auth === 'ai-gateway'
      ? "Configure an AI Gateway API key as Cursor's OpenAI API key and set Override OpenAI Base URL to https://ai-gateway.vercel.sh/cursor/v1."
      : 'Configure Cursor to use its direct model-provider routing.';
  console.warn(
    `[cursor] auth: ${JSON.stringify(auth)} cannot configure Cursor provider authentication. ${detail} CURSOR_API_KEY is still required for Cursor CLI authentication.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
