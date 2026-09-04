import { posix } from 'node:path';
import {
  commonTool,
  HARNESS_V1_BUILTIN_TOOLS,
  harnessV1DiagnosticFromBridgeFrame,
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1BuiltinTool,
  type HarnessV1ContinueTurnState,
  type HarnessV1CredentialForwarding,
  type HarnessV1DebugConfig,
  type HarnessV1PermissionMode,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1PortEndpoint,
  type HarnessV1ResumeSessionState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  applyCredentialForwarding,
  classifyDiskLog,
  createSandboxCredentialEnvironment,
  createBridgeToken,
  experimental_createBridgeUserMessageSubmitter,
  createBridgeErrorHandler,
  createBridgeStartupError,
  drainBridgeProcessStream,
  forwardBridgeProcessStream,
  getRestrictedSandboxSession,
  markBridgeStarting,
  resolveSandboxDefaultWorkingDirectory,
  resolveSandboxHomeDir,
  SandboxChannel,
  shellQuote,
  warnCredentialBrokeringUnavailable,
  waitForBridgeReady,
  withBridgeToken,
  writeSkills as writeHarnessSkills,
} from '@ai-sdk/harness/utils';
import {
  safeParseJSON,
  tool,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import {
  CLAUDE_CODE_BOOTSTRAP_DIR as BOOTSTRAP_DIR,
  getClaudeCodeBootstrap,
} from './claude-code-bootstrap';
import {
  CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
  createClaudeCodeRequestTransformations,
  resolveClaudeCodeAuthenticationMode,
  resolveClaudeCodeEnv,
  type ClaudeCodeAuthenticationMode,
} from './claude-code-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './claude-code-bridge-protocol';
import type { ClaudeCodeThinkingConfig } from './claude-code-thinking';
import { VERSION } from './version';

type ClaudeCodeChannel = SandboxChannel<OutboundMessage, InboundMessage>;
type ClaudeCodeRespawnStrategy = 'replay' | 'rerun';

/**
 * Value to use in User-Agent and `x-client-app` headers.
 */
const CLAUDE_CODE_CLIENT_APP = `ai-sdk/harness-claude-code/${VERSION}`;

export type ClaudeCodeHarnessSettings = {
  readonly auth?: ClaudeCodeAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  /**
   * Anthropic model id the underlying `claude` CLI should use. Leaving this
   * unset defers to the CLI's default.
   *
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
  /**
   * Hard cap on how many internal turns the CLI can take before yielding
   * back to the caller. Unset means the CLI's default.
   */
  readonly maxTurns?: number;
  /**
   * Environment variables for the Claude Code process. These values are
   * merged over the sandbox bridge process environment.
   */
  readonly env?: Readonly<Record<string, string>>;
  /**
   * Controls extended-thinking behavior and whether reasoning is summarized or
   * omitted. Defaults to `{ type: 'adaptive', display: 'summarized' }`.
   */
  readonly thinking?: ClaudeCodeThinkingConfig;
  /**
   * Controls how much effort Claude applies when adaptive thinking is enabled.
   * Unset uses the Claude Agent SDK default.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /**
   * Override the port the bridge binds inside the sandbox. By default the
   * adapter uses the first port the sandbox declares via `sandbox.ports`.
   * Only set this if the sandbox declares multiple ports and the first one
   * is reserved for something else.
   */
  readonly port?: number;
  /**
   * Override the host endpoint used to connect to the sandbox bridge. Required
   * together with `port` when using a basic sandbox session.
   */
  readonly portEndpoint?: HarnessV1PortEndpoint;
  /** Maximum milliseconds to wait for the bridge to advertise its port. Defaults to 120000. */
  readonly startupTimeoutMs?: number;
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: (sandboxId: string) => string;
};

/*
 * Every native tool the Claude Code CLI can invoke, declared as a `ToolSet`
 * keyed by what the bridge emits as `toolName` on the wire
 * (`commonName ?? nativeName`). Schemas are transcribed from the generated
 * `sdk-tools.d.ts` and the conditionally registered tool definitions in the
 * pinned Claude Code executable.
 *
 * `MCP` (the generic proxy tool inside the Claude Code SDK) is intentionally
 * omitted — the bridge filters out `mcp__harness-tools__*` tool names before
 * emitting them, and other MCP invocations come through with their own
 * server-tool names rather than the literal `'Mcp'` token.
 */
const listMcpResourcesInputSchema = z.object({
  server: z.string().optional(),
});

const readMcpResourceInputSchema = z.object({
  server: z.string(),
  uri: z.string(),
});

const structuredTeamMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shutdown_request'),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('shutdown_response'),
    request_id: z.string(),
    approve: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('plan_approval_response'),
    request_id: z.string(),
    approve: z.boolean(),
    feedback: z.string().optional(),
  }),
]);

const CLAUDE_CODE_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'Read',
    toolUseKind: 'readonly',
    description: 'Read file contents (text, image, PDF, notebook)',
    inputSchema: z.object({
      file_path: z.string(),
      offset: z.number().optional(),
      limit: z.number().optional(),
      pages: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'Write',
    toolUseKind: 'edit',
    description: 'Overwrite or create a file at an absolute path',
    inputSchema: z.object({
      file_path: z.string(),
      content: z.string(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'Edit',
    toolUseKind: 'edit',
    description: 'Edit a file by exact string replacement',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'Bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command, optionally in background',
    inputSchema: z.object({
      command: z.string(),
      timeout: z.number().optional(),
      description: z.string().optional(),
      run_in_background: z.boolean().optional(),
      dangerouslyDisableSandbox: z.boolean().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'Glob',
    toolUseKind: 'readonly',
    description: 'Fast file-pattern search using glob syntax',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'Grep',
    toolUseKind: 'readonly',
    description: 'Regex search over file contents via ripgrep',
    inputSchema: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      glob: z.string().optional(),
      output_mode: z
        .enum(['content', 'files_with_matches', 'count'])
        .optional(),
      '-B': z.number().optional(),
      '-A': z.number().optional(),
      '-C': z.number().optional(),
      context: z.number().optional(),
      '-n': z.boolean().optional(),
      '-i': z.boolean().optional(),
      '-o': z.boolean().optional(),
      type: z.string().optional(),
      head_limit: z.number().optional(),
      offset: z.number().optional(),
      multiline: z.boolean().optional(),
    }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'WebSearch',
    toolUseKind: 'readonly',
    description: 'Issue web search queries with optional domain filters',
    inputSchema: z.object({
      query: z.string(),
      allowed_domains: z.array(z.string()).optional(),
      blocked_domains: z.array(z.string()).optional(),
    }),
  }),

  WebFetch: tool({
    description: 'Fetch a URL and run a prompt against its content',
    inputSchema: z.object({
      url: z.string(),
      prompt: z.string(),
    }),
  }),
  NotebookEdit: tool({
    description: 'Edit, insert, or delete a Jupyter notebook cell',
    inputSchema: z.object({
      notebook_path: z.string(),
      new_source: z.string(),
      cell_id: z.string().optional(),
      cell_type: z.enum(['code', 'markdown']).optional(),
      edit_mode: z.enum(['replace', 'insert', 'delete']).optional(),
    }),
  }),
  TodoWrite: tool({
    description: 'Replace the session todo list',
    inputSchema: z.object({
      todos: z.array(
        z.object({
          content: z.string(),
          status: z.enum(['pending', 'in_progress', 'completed']),
          activeForm: z.string(),
        }),
      ),
    }),
  }),
  Agent: tool({
    description: 'Spawn a subagent with a task',
    inputSchema: z.object({
      description: z.string(),
      prompt: z.string(),
      subagent_type: z.string().optional(),
      model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
      run_in_background: z.boolean().optional(),
      name: z.string().optional(),
      team_name: z.string().optional(),
      mode: z
        .enum([
          'acceptEdits',
          'auto',
          'bypassPermissions',
          'default',
          'dontAsk',
          'plan',
        ])
        .optional(),
      isolation: z.literal('worktree').optional(),
    }),
  }),
  TaskCreate: tool({
    description: 'Create a task in the session-local task list',
    inputSchema: z.object({
      subject: z.string(),
      description: z.string(),
      activeForm: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  TaskGet: tool({
    description: 'Retrieve a task by id',
    inputSchema: z.object({ taskId: z.string() }),
  }),
  TaskUpdate: tool({
    description: 'Update fields of an existing task',
    inputSchema: z.object({
      taskId: z.string(),
      subject: z.string().optional(),
      description: z.string().optional(),
      activeForm: z.string().optional(),
      status: z
        .union([
          z.enum(['pending', 'in_progress', 'completed']),
          z.literal('deleted'),
        ])
        .optional(),
      addBlocks: z.array(z.string()).optional(),
      addBlockedBy: z.array(z.string()).optional(),
      owner: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  TaskList: tool({
    description: 'Return all tasks in the session-local task list',
    inputSchema: z.object({}),
  }),
  TaskStop: tool({
    description: 'Stop a running background task by id',
    inputSchema: z.object({
      task_id: z.string().optional(),
      shell_id: z.string().optional(),
    }),
  }),
  TaskOutput: tool({
    description: 'Poll for output from a background task',
    inputSchema: z.object({
      task_id: z.string(),
      block: z.boolean(),
      timeout: z.number(),
    }),
  }),
  Monitor: {
    ...tool({
      description: 'Run and monitor a shell command or WebSocket',
      inputSchema: z.object({
        description: z.string().optional(),
        timeout_ms: z.number().optional(),
        persistent: z.boolean().optional(),
        command: z.string().optional(),
        ws: z
          .object({
            url: z.string(),
            protocols: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    }),
    toolUseKind: 'bash',
  },
  ListMcpResources: {
    ...tool({
      description: 'List resources available from MCP servers',
      inputSchema: listMcpResourcesInputSchema,
    }),
    toolUseKind: 'readonly',
  },
  ListMcpResourcesTool: {
    ...tool({
      description: 'List resources available from MCP servers',
      inputSchema: listMcpResourcesInputSchema,
    }),
    toolUseKind: 'readonly',
  },
  ReadMcpResource: {
    ...tool({
      description: 'Read a specific MCP resource by URI',
      inputSchema: readMcpResourceInputSchema,
    }),
    toolUseKind: 'readonly',
  },
  ReadMcpResourceTool: {
    ...tool({
      description: 'Read a specific MCP resource by URI',
      inputSchema: readMcpResourceInputSchema,
    }),
    toolUseKind: 'readonly',
  },
  ReadMcpResourceDirTool: {
    ...tool({
      description: 'List direct children of an MCP directory resource',
      inputSchema: readMcpResourceInputSchema,
    }),
    toolUseKind: 'readonly',
  },
  RefreshMcpTools: {
    ...tool({
      description: 'Refresh tools from one or all connected MCP servers',
      inputSchema: z.object({ server: z.string().optional() }),
    }),
    toolUseKind: 'readonly',
  },
  ExitPlanMode: tool({
    description: 'Exit plan mode with optional permission approvals',
    inputSchema: z.looseObject({
      allowedPrompts: z
        .array(
          z.object({
            tool: z.literal('Bash'),
            prompt: z.string(),
          }),
        )
        .optional(),
    }),
  }),
  EnterPlanMode: {
    ...tool({
      description: 'Enter plan mode',
      inputSchema: z.object({}),
    }),
    toolUseKind: 'readonly',
  },
  EnterWorktree: tool({
    description: 'Create or enter an isolated git worktree',
    inputSchema: z.object({
      name: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  ExitWorktree: tool({
    description: 'Exit the current worktree session',
    inputSchema: z.object({
      action: z.enum(['keep', 'remove']),
      discard_changes: z.boolean().optional(),
    }),
  }),
  askUserQuestions: {
    ...HARNESS_V1_BUILTIN_TOOLS.askUserQuestions,
    nativeName: 'AskUserQuestion',
    toolUseKind: 'readonly',
  } as typeof HARNESS_V1_BUILTIN_TOOLS.askUserQuestions & {
    readonly nativeName: 'AskUserQuestion';
    readonly toolUseKind: 'readonly';
  },
  Skill: {
    ...tool({
      description: 'Activate a skill by name',
      inputSchema: z.object({
        skill: z.string(),
        args: z.string().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  ToolSearch: tool({
    description:
      'Search deferred MCP / catalog tools so the model can load them on demand',
    inputSchema: z.object({
      query: z.string(),
      max_results: z.number().optional(),
    }),
  }),
  Artifact: {
    ...tool({
      description: 'Publish or list claude.ai artifacts',
      inputSchema: z.object({
        action: z.enum(['publish', 'list']).optional(),
        file_path: z.string().optional(),
        favicon: z.string().optional(),
        limit: z.number().optional(),
        scope: z.enum(['mine', 'shared', 'all']).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        label: z.string().optional(),
        url: z.string().optional(),
        force: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  CronCreate: {
    ...tool({
      description: 'Schedule a recurring or one-shot prompt',
      inputSchema: z.object({
        cron: z.string(),
        prompt: z.string(),
        recurring: z.boolean().optional(),
        durable: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  CronDelete: {
    ...tool({
      description: 'Delete a scheduled prompt by id',
      inputSchema: z.object({ id: z.string() }),
    }),
    toolUseKind: 'edit',
  },
  CronList: {
    ...tool({
      description: 'List scheduled prompts for the current session',
      inputSchema: z.object({}),
    }),
    toolUseKind: 'readonly',
  },
  DesignSync: {
    ...tool({
      description: 'Read or update claude.ai Design projects',
      inputSchema: z.object({
        method: z.enum([
          'list_projects',
          'get_project',
          'list_files',
          'get_file',
          'finalize_plan',
          'write_files',
          'delete_files',
          'register_assets',
          'unregister_assets',
          'create_project',
          'report_validate',
        ]),
        projectId: z.string().optional(),
        path: z.string().optional(),
        writes: z.array(z.string()).max(256).optional(),
        deletes: z.array(z.string()).max(256).optional(),
        planId: z.string().optional(),
        files: z
          .array(
            z.object({
              path: z.string(),
              localPath: z.string().optional(),
              data: z.string().optional(),
              encoding: z.literal('base64').optional(),
              mimeType: z.string().optional(),
            }),
          )
          .max(256)
          .optional(),
        paths: z.array(z.string()).max(256).optional(),
        name: z.string().optional(),
        assets: z
          .array(
            z.object({
              name: z.string(),
              path: z.string(),
              subtitle: z.string().optional(),
              viewport: z
                .object({
                  width: z.number(),
                  height: z.number().optional(),
                })
                .optional(),
              group: z.string().optional(),
            }),
          )
          .max(256)
          .optional(),
        localDir: z.string().optional(),
        counts: z
          .object({
            total: z.number(),
            bad: z.number(),
            thin: z.number(),
            variantsIdentical: z.number(),
            iterations: z.number(),
          })
          .optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  LSP: {
    ...tool({
      description: 'Query a language server for code intelligence',
      inputSchema: z.object({
        operation: z.enum([
          'goToDefinition',
          'findReferences',
          'hover',
          'documentSymbol',
          'workspaceSymbol',
          'goToImplementation',
          'prepareCallHierarchy',
          'incomingCalls',
          'outgoingCalls',
        ]),
        filePath: z.string(),
        line: z.number().int().positive(),
        character: z.number().int().positive(),
        query: z.string().optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  PowerShell: {
    ...tool({
      description: 'Execute a PowerShell command, optionally in background',
      inputSchema: z.object({
        command: z.string(),
        timeout: z.number().optional(),
        description: z.string().optional(),
        run_in_background: z.boolean().optional(),
        dangerouslyDisableSandbox: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'bash',
  },
  PushNotification: {
    ...tool({
      description: 'Send a notification for proactive or scheduled work',
      inputSchema: z.object({
        message: z.string(),
        status: z.literal('proactive'),
      }),
    }),
    toolUseKind: 'edit',
  },
  RemoteTrigger: {
    ...tool({
      description: 'List, manage, or run a claude.ai Routine trigger',
      inputSchema: z.object({
        action: z.enum(['list', 'get', 'create', 'update', 'run']),
        trigger_id: z.string().optional(),
        body: z.record(z.string(), z.unknown()).optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  ReportFindings: {
    ...tool({
      description: 'Return verified code-review findings',
      inputSchema: z.object({
        level: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
        findings: z
          .array(
            z.object({
              file: z.string(),
              line: z.number().optional(),
              summary: z.string(),
              short_summary: z.string().optional(),
              failure_scenario: z.string(),
              category: z.string().optional(),
              verdict: z.enum(['CONFIRMED', 'PLAUSIBLE']).optional(),
              outcome: z
                .enum(['fixed', 'skipped', 'no_change_needed'])
                .optional(),
            }),
          )
          .max(32),
      }),
    }),
    toolUseKind: 'readonly',
  },
  ScheduleWakeup: {
    ...tool({
      description: 'Schedule or stop the next iteration of a dynamic loop',
      inputSchema: z.object({
        delaySeconds: z.number().optional(),
        reason: z.string().optional(),
        prompt: z.string().optional(),
        stop: z.boolean().optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  SendMessage: {
    ...tool({
      description: 'Send a plain-text or protocol message to another agent',
      inputSchema: z.object({
        to: z.string(),
        summary: z.string().max(200).optional(),
        message: z.union([z.string(), structuredTeamMessageSchema]),
      }),
    }),
    toolUseKind: 'edit',
  },
  SendUserFile: {
    ...tool({
      description: 'Send one or more files to the user',
      inputSchema: z.object({
        files: z.union([z.string(), z.array(z.string()).min(1)]),
        caption: z.string().optional(),
        status: z.enum(['normal', 'proactive']),
        display: z.enum(['render', 'attach']).optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  ShareOnboardingGuide: {
    ...tool({
      description: 'Create, update, inspect, or delete an onboarding guide',
      inputSchema: z.object({
        mode: z.enum(['check', 'update', 'create', 'delete']).optional(),
        short_code: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/)
          .optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
  WaitForMcpServers: {
    ...tool({
      description: 'Wait for MCP servers that are still connecting',
      inputSchema: z.object({
        servers: z.array(z.string()).optional(),
      }),
    }),
    toolUseKind: 'readonly',
  },
  Workflow: {
    ...tool({
      description: 'Run or resume a dynamic multi-agent workflow',
      inputSchema: z.object({
        script: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        title: z.string().optional(),
        args: z.record(z.string(), z.unknown()).optional(),
        scriptPath: z.string().optional(),
        resumeFromRunId: z.string().optional(),
      }),
    }),
    toolUseKind: 'edit',
  },
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

/**
 * Live bridge coordinates returned by `doDetach()` and `doSuspendTurn()`. A
 * future process uses them to reopen a socket to the still-running bridge
 * (`attach`) instead of re-spawning it. Absent on a `doStop()` payload.
 */
const claudeCodeBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});

/**
 * Schema for the adapter-specific portion of lifecycle state `data`.
 *
 * A `doStop()` payload is structurally empty (`{}`): the framework derives the
 * sandbox via `provider.resumeSession({ sessionId })`, and the Claude SDK's
 * `{ continue: true }` flag rehydrates the thread from the workdir. A
 * `doDetach()` payload additionally carries `bridge` coordinates for
 * cross-process `attach`. A loose object keeps both shapes valid.
 */
const claudeCodeResumeStateSchema = z.looseObject({
  bridge: claudeCodeBridgeCoordsSchema.optional(),
  sandboxCredentialEnvironment: z.record(z.string(), z.string()).optional(),
  /**
   * The exact Claude conversation to rehydrate on resume. Written by the
   * adapter on `doStop()`/`doDetach()`/`doSuspendTurn()` from the session id
   * the bridge observed, so a resume names the conversation instead of
   * relying on the SDK's `continue` flag — "most recent thread in this
   * workdir" — which silently picks the wrong one once a second thread
   * exists there. Hosts that captured the id themselves (it is surfaced as
   * `harnessMetadata['claude-code'].sessionId` on `finish` parts) may also
   * set it explicitly.
   */
  claudeSessionId: z.string().optional(),
});

type ClaudeCodeBridgeCoords = z.infer<typeof claudeCodeBridgeCoordsSchema>;

export function createClaudeCode(
  settings: ClaudeCodeHarnessSettings = {},
): HarnessV1<typeof CLAUDE_CODE_BUILTIN_TOOLS> {
  if (
    settings.mcpServers != null &&
    Object.prototype.hasOwnProperty.call(settings.mcpServers, 'harness-tools')
  ) {
    throw new Error(
      'Claude Code MCP server name "harness-tools" is reserved for HarnessAgent tools.',
    );
  }
  const thinking = settings.thinking ?? {
    type: 'adaptive',
    display: 'summarized',
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'claude-code',
    builtinTools: CLAUDE_CODE_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: true,
    supportsBuiltinToolFiltering: true,
    lifecycleStateSchema: claudeCodeResumeStateSchema,
    getBootstrap: getClaudeCodeBootstrap,
    doStart: async startOpts => {
      const sandboxSession = startOpts.sandboxSession;
      const toolSafeSandboxSession =
        getRestrictedSandboxSession(sandboxSession);
      const sandboxId = 'id' in sandboxSession ? sandboxSession.id : undefined;
      validateBasicSandboxSettings({
        sandboxSession,
        port: settings.port,
        portEndpoint: settings.portEndpoint,
      });
      if (settings.mintBridgeToken != null && sandboxId == null) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'claude-code',
          message:
            'The Claude Code harness cannot use `mintBridgeToken` with a sandbox session that does not expose an id.',
        });
      }
      const defaultWorkingDirectory =
        await resolveSandboxDefaultWorkingDirectory({
          sandboxSession,
          abortSignal: startOpts.abortSignal,
        });
      const lifecycleState = startOpts.continueFrom ?? startOpts.resumeFrom;
      const isResume = lifecycleState != null;
      const isContinue = startOpts.continueFrom != null;
      const resumeData = isResume
        ? (lifecycleState?.data as {
            bridge?: ClaudeCodeBridgeCoords;
            sandboxCredentialEnvironment?: Record<string, string>;
            claudeSessionId?: string;
          })
        : undefined;
      const coords = resumeData?.bridge;
      const authenticationMode = resolveClaudeCodeAuthenticationMode(
        settings.auth,
      );
      const resolvedAuthEnvironment = resolveClaudeCodeEnv(settings.auth);
      const claudeEnvironment = {
        ...resolvedAuthEnvironment,
        /*
         * The Claude Agent SDK does not expose arbitrary model-request
         * headers. It reads this environment variable and sends the value as
         * `x-client-app`, while also appending `client-app/<value>` to
         * `User-Agent`, so this is the attribution path for AI Gateway.
         */
        ...(resolvedAuthEnvironment.AI_GATEWAY_BASE_URL
          ? { CLAUDE_AGENT_SDK_CLIENT_APP: CLAUDE_CODE_CLIENT_APP }
          : {}),
        ...settings.env,
        ...(startOpts.headers != null
          ? {
              ANTHROPIC_CUSTOM_HEADERS: Object.entries(startOpts.headers)
                .map(([name, value]) => `${name}: ${value}`)
                .join('\n'),
            }
          : {}),
      };
      let sandboxClaudeEnvironment = claudeEnvironment;
      let sandboxCredentialEnvironment: Record<string, string> | undefined;
      if (
        'addRequestTransformations' in sandboxSession &&
        sandboxSession.addRequestTransformations != null
      ) {
        sandboxCredentialEnvironment =
          resumeData?.sandboxCredentialEnvironment ??
          (await createSandboxCredentialEnvironment({
            environment: claudeEnvironment,
            credentialEnvironmentVariables:
              CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          }));
        sandboxClaudeEnvironment = {
          ...claudeEnvironment,
          ...sandboxCredentialEnvironment,
        };
        const requestTransformations = createClaudeCodeRequestTransformations({
          env: claudeEnvironment,
          sandboxEnv: sandboxClaudeEnvironment,
          auth: authenticationMode,
        });
        if (requestTransformations.length > 0) {
          await sandboxSession.addRequestTransformations(
            requestTransformations,
          );
        }
      } else {
        sandboxClaudeEnvironment = await applyCredentialForwarding({
          environment: sandboxClaudeEnvironment,
          credentialEnvironmentVariables:
            CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
          credentialForwarding: settings.credentialForwarding,
        });
        warnCredentialBrokeringUnavailable({
          environment: claudeEnvironment,
          forwardedEnvironment: sandboxClaudeEnvironment,
          credentialEnvironmentVariables:
            CLAUDE_CODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
        });
      }
      const bootstrapDir = posix.resolve(
        defaultWorkingDirectory,
        BOOTSTRAP_DIR,
      );
      // The conversation the host wants back, when it is known. Absent on
      // state written before this field existed; those resumes fall back to
      // the `continue` flag as before.
      const resumeSessionId = resumeData?.claudeSessionId;

      const workDir = startOpts.sessionWorkDir;
      const sandboxHomeDir = await resolveSandboxHomeDir({
        sandbox: toolSafeSandboxSession,
        abortSignal: startOpts.abortSignal,
      });
      const sessionDataDir = `${defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;

      // Normalize each forwarded bridge diagnostics frame into the general
      // `HarnessV1Diagnostic` and report it. The adapter does no telemetry work
      // beyond this transport→emission mapping.
      const report = startOpts.observability?.report;
      const onDiagnostic = report
        ? (frame: Parameters<typeof harnessV1DiagnosticFromBridgeFrame>[0]) =>
            report(
              harnessV1DiagnosticFromBridgeFrame(frame, {
                sessionId: startOpts.sessionId,
                timestamp: Date.now(),
              }),
            )
        : undefined;
      const onBridgeError = createBridgeErrorHandler({
        harnessId: 'claude-code',
        sessionId: startOpts.sessionId,
      });
      let supportsUserMessageResponses = false;

      // Builds the `connect` thunk a `SandboxChannel` re-invokes on every
      // (re)connect: open the socket, then wait for `bridge-hello` so the
      // end-to-end link is proven live before any frame is sent.
      const buildConnect =
        (endpoint: HarnessV1PortEndpoint) => async (): Promise<WebSocket> => {
          return openBridgeWebSocket({
            endpoint,
            timeoutMs,
            onHello: supportsResponses => {
              supportsUserMessageResponses = supportsResponses;
            },
          });
        };

      /*
       * Rung 1 — ATTACH. When lifecycle state carries live bridge coordinates,
       * try to reopen a socket to the still-running bridge. Parked sessions wait
       * for the next `start`; suspended turns request replay of everything past
       * the persisted cursor. No spawn, no fresh token (the existing bridge
       * still authorises the persisted one). If the bridge is gone the open
       * throws and we fall through to a spawn-based recovery.
       */
      if (coords) {
        try {
          const endpoint = await resolveBridgeEndpoint({
            sandboxSession,
            override: settings.portEndpoint,
            port: coords.port,
          });
          const attachEndpoint = withBridgeToken({
            endpoint,
            token: coords.token,
          });
          const attachChannel: ClaudeCodeChannel = new SandboxChannel({
            connect: buildConnect(attachEndpoint),
            outboundSchema: outboundMessageSchema,
            initialLastSeenEventId: coords.lastSeenEventId,
            onDiagnostic,
            onBridgeError,
          });
          await attachChannel.open(isContinue ? { resume: true } : undefined);
          return createSession({
            sessionId: startOpts.sessionId,
            channel: attachChannel,
            ...(resumeSessionId ? { resumeSessionId } : {}),
            // The live bridge was spawned by another process; this one owns no
            // process handle. The session lifecycle method decides whether the
            // sandbox is left running, stopped, or destroyed.
            proc: undefined,
            model: settings.model,
            maxTurns: settings.maxTurns,
            env: sandboxClaudeEnvironment,
            thinking,
            effort: settings.effort,
            isResume: true,
            continueOnFirstPrompt: false,
            rerunContinue: false,
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            sandboxCredentialEnvironment,
            debug: startOpts.observability?.debug,
            permissionMode: startOpts.permissionMode,
            builtinToolFiltering: startOpts.builtinToolFiltering,
            sandbox: toolSafeSandboxSession,
            sandboxHomeDir,
            mcpServers: settings.mcpServers,
            supportsUserMessageResponses: () => supportsUserMessageResponses,
          });
        } catch {
          // Bridge no longer reachable — recover by respawning below.
        }
      }

      /*
       * Rungs 2/3 — REPLAY vs RERUN. Respawn the bridge. `replay` is only sound
       * for `continueFrom`: those coordinates include the cursor the on-disk
       * log is replayed *from*. `resumeFrom` is a between-turn resume; even when
       * it carries bridge coordinates, replaying the previous turn would
       * re-deliver stale events into the next turn. Those resumes always `rerun`
       * when attach is unavailable (the CLI continues its own thread from the
       * workdir snapshot via `continue: true`).
       */
      let respawnStrategy: ClaudeCodeRespawnStrategy | undefined = isResume
        ? 'rerun'
        : undefined;
      if (coords && isContinue) {
        const logRaw = await Promise.resolve(
          toolSafeSandboxSession.readTextFile({
            path: `${bridgeStateDir}/event-log.ndjson`,
            abortSignal: startOpts.abortSignal,
          }),
        ).catch(() => null);
        if ((await classifyDiskLog(logRaw)) === 'replay') {
          respawnStrategy = 'replay';
        }
      }

      const port = resolveBridgePort({
        sandboxSession,
        override: settings.port,
      });
      const token =
        settings.mintBridgeToken == null
          ? createBridgeToken()
          : settings.mintBridgeToken(sandboxId!);
      const env = {
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
        ...(respawnStrategy === 'replay'
          ? { BRIDGE_REPLAY_FROM_DISK: '1' }
          : {}),
      };

      /*
       * On a fresh start the workdir and bridge-state directory must be
       * created. The env is sent fresh on every spawn —
       * `BRIDGE_CHANNEL_TOKEN` rotates per start.
       */
      if (respawnStrategy === undefined) {
        await toolSafeSandboxSession.run({
          command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
          abortSignal: startOpts.abortSignal,
        });
      }

      await markBridgeStarting({
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'claude-code',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await toolSafeSandboxSession.spawn({
        command: `node ${shellQuote(`${bootstrapDir}/bridge.mjs`)} --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)}`,
        env,
        abortSignal: startOpts.abortSignal,
      });

      const bridgeStartupStderr: string[] = [];
      const bridgeStartupStderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: 'claude-code',
        collectTail: bridgeStartupStderr,
      });
      void bridgeStartupStderrDone;
      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'claude-code',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'claude-code bridge did not become ready in time.',
            proc,
            stdoutTail,
            stderrTail: bridgeStartupStderr,
            stderrDone: bridgeStartupStderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'claude-code bridge exited before becoming ready.',
            proc,
            stdoutTail,
            stderrTail: bridgeStartupStderr,
            stderrDone: bridgeStartupStderrDone,
          }),
      });
      void drainBridgeProcessStream(proc.stdout);

      const endpoint = await resolveBridgeEndpoint({
        sandboxSession,
        override: settings.portEndpoint,
        port: boundPort,
      });
      const bridgeEndpoint = withBridgeToken({ endpoint, token });

      const channel: ClaudeCodeChannel = new SandboxChannel({
        connect: buildConnect(bridgeEndpoint),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        onBridgeError,
        // In replay mode the respawned bridge reloaded the finished turn from
        // disk; seed the cursor and resume so it streams the tail (incl.
        // `finish`) rather than starting empty.
        ...(respawnStrategy === 'replay'
          ? { initialLastSeenEventId: coords?.lastSeenEventId ?? 0 }
          : {}),
      });
      await channel.open(
        respawnStrategy === 'replay' ? { resume: true } : undefined,
      );

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model: settings.model,
        maxTurns: settings.maxTurns,
        env: sandboxClaudeEnvironment,
        thinking,
        effort: settings.effort,
        isResume: respawnStrategy !== undefined,
        continueOnFirstPrompt: respawnStrategy !== undefined,
        ...(resumeSessionId ? { resumeSessionId } : {}),
        rerunContinue: respawnStrategy === 'rerun',
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        sandboxCredentialEnvironment,
        debug: startOpts.observability?.debug,
        permissionMode: startOpts.permissionMode,
        builtinToolFiltering: startOpts.builtinToolFiltering,
        sandbox: toolSafeSandboxSession,
        sandboxHomeDir,
        mcpServers: settings.mcpServers,
        supportsUserMessageResponses: () => supportsUserMessageResponses,
      });
    },
  };
}

function resolveBridgePort({
  sandboxSession,
  override,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  override: number | undefined;
}): number {
  if (override !== undefined) return override;
  if ('ports' in sandboxSession && sandboxSession.ports.length > 0) {
    return sandboxSession.ports[0];
  }
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'claude-code',
    message:
      'The claude-code harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createClaudeCode({ port })`.',
  });
}

function validateBasicSandboxSettings({
  sandboxSession,
  port,
  portEndpoint,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  port: number | undefined;
  portEndpoint: HarnessV1PortEndpoint | undefined;
}): void {
  if ('getPortEndpoint' in sandboxSession) return;
  if (port == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'claude-code',
      message:
        'The Claude Code harness requires an explicit `port` when using a basic sandbox session.',
    });
  }
  if (portEndpoint == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'claude-code',
      message:
        'The Claude Code harness requires an explicit `portEndpoint` when using a basic sandbox session.',
    });
  }
}

async function resolveBridgeEndpoint({
  sandboxSession,
  override,
  port,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  override: HarnessV1PortEndpoint | undefined;
  port: number;
}): Promise<HarnessV1PortEndpoint> {
  if (override != null) return override;
  if ('getPortEndpoint' in sandboxSession) {
    return sandboxSession.getPortEndpoint({ port, protocol: 'ws' });
  }
  throw new HarnessCapabilityUnsupportedError({
    harnessId: 'claude-code',
    message:
      'The Claude Code harness requires an explicit `portEndpoint` when using a basic sandbox session.',
  });
}

/**
 * Materialise skill files into
 * `$HOME/.claude/skills/<name>/SKILL.md`. The `claude` CLI
 * auto-discovers skills from that directory on startup, so the files have to
 * be in place before the bridge is spawned without mutating the session
 * workdir. Each file uses the YAML-frontmatter shape the CLI expects.
 */
async function writeClaudeCodeSkills({
  sandbox,
  homeDir,
  skills,
  abortSignal,
}: {
  sandbox: SandboxSession;
  homeDir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  await writeHarnessSkills({
    sandbox,
    rootDir: `${homeDir}/.claude/skills`,
    skills,
    abortSignal,
    invalidSkillNameMessage: ({ name }) =>
      `Invalid Claude Code skill name: ${name}`,
    invalidSkillFilePathMessage: ({ skillName, filePath }) =>
      `Invalid Claude Code skill file path for ${skillName}: ${filePath}`,
    trailingNewline: true,
  });
}

/**
 * Wait for the bridge's `bridge-hello` message to arrive on the freshly
 * opened WebSocket before any other host-side code touches it.
 *
 * Some sandbox runtimes (Vercel in particular) complete the WS upgrade
 * with the host long before the connection is actually forwarded to the
 * sandbox-side bridge. Anything sent in that gap is silently dropped —
 * including the `start` message we send next. The bridge emits
 * `bridge-hello` the instant it accepts the connection, so receiving it
 * is the only reliable evidence that the end-to-end link is live.
 */
function openWebSocketAndWaitForBridgeHello({
  endpoint,
  openTimeoutMs,
  getHelloTimeoutMs,
  onHello,
}: {
  endpoint: HarnessV1PortEndpoint;
  openTimeoutMs: number;
  getHelloTimeoutMs: () => number;
  onHello: (supportsUserMessageResponses: boolean) => void;
}): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(endpoint.url, {
      headers: endpoint.headers == null ? undefined : { ...endpoint.headers },
    });
    let opened = false;
    let sawBridgeHello = false;
    let settled = false;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let helloTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = ({
      keepTerminationListeners = false,
    }: {
      keepTerminationListeners?: boolean;
    } = {}) => {
      if (openTimer) clearTimeout(openTimer);
      if (helloTimer) clearTimeout(helloTimer);
      ws.off('open', onOpen);
      ws.off('message', onMessage);
      if (!keepTerminationListeners) {
        ws.off('close', onClose);
        ws.off('error', onError);
      }
    };
    const settle = (err?: unknown) => {
      if (settled) return;
      settled = true;
      if (err) {
        cleanup({ keepTerminationListeners: true });
        try {
          ws.terminate();
        } catch {
          cleanup();
        }
        reject(err);
      } else {
        cleanup();
        resolve(ws);
      }
    };
    const tryResolve = () => {
      if (opened && sawBridgeHello) settle();
    };
    const startHelloTimer = () => {
      if (helloTimer) return;
      const helloTimeoutMs = getHelloTimeoutMs();
      helloTimer = setTimeout(
        () =>
          settle(
            new Error(
              `claude-code bridge did not send bridge-hello within ${helloTimeoutMs}ms`,
            ),
          ),
        helloTimeoutMs,
      );
      helloTimer.unref?.();
    };
    const onOpen = () => {
      opened = true;
      if (openTimer) {
        clearTimeout(openTimer);
        openTimer = undefined;
      }
      startHelloTimer();
      tryResolve();
    };
    const onMessage = (raw: unknown) => {
      void (async () => {
        const parsed = await safeParseJSON({
          text: webSocketMessageToString(raw),
        });
        if (!parsed.success || settled) return;
        const value = parsed.value;
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          (value as { type?: unknown }).type === 'bridge-hello'
        ) {
          const capabilities = (
            value as {
              capabilities?: { experimental_userMessageResponses?: unknown };
            }
          ).capabilities;
          onHello(capabilities?.experimental_userMessageResponses === true);
          sawBridgeHello = true;
          tryResolve();
        }
      })();
    };
    const onClose = () => {
      settle(
        new Error('claude-code bridge closed before sending bridge-hello'),
      );
      cleanup();
    };
    const onError = (err: Error) => settle(err);
    openTimer = setTimeout(
      () =>
        settle(new Error(`WebSocket open timed out after ${openTimeoutMs}ms`)),
      openTimeoutMs,
    );
    openTimer.unref?.();
    ws.on('open', onOpen);
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

async function openBridgeWebSocket({
  endpoint,
  timeoutMs,
  onHello,
}: {
  endpoint: HarnessV1PortEndpoint;
  timeoutMs: number;
  onHello: (supportsUserMessageResponses: boolean) => void;
}): Promise<WebSocket> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt++;
    try {
      const remaining = Math.max(1, deadline - Date.now());
      return await openWebSocketAndWaitForBridgeHello({
        endpoint,
        openTimeoutMs: Math.min(10_000, remaining),
        getHelloTimeoutMs: () =>
          Math.min(5_000, Math.max(1, deadline - Date.now())),
        onHello,
      });
    } catch (err) {
      lastError = err;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(250 * attempt, 1_000, remaining));
    }
  }

  throw new Error(
    `claude-code bridge did not complete WebSocket handshake within ${timeoutMs}ms after ${attempt} attempt(s). Last error: ${formatUnknownError(lastError)}`,
  );
}

function webSocketMessageToString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
      'utf8',
    );
  }
  return String(raw);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createSession({
  sessionId,
  channel,
  proc,
  model,
  maxTurns,
  env,
  thinking,
  effort,
  isResume,
  continueOnFirstPrompt,
  resumeSessionId,
  rerunContinue,
  bridgePort,
  bridgeToken,
  sandboxId,
  sandboxCredentialEnvironment,
  debug,
  permissionMode,
  builtinToolFiltering,
  sandbox,
  sandboxHomeDir,
  mcpServers,
  supportsUserMessageResponses,
}: {
  sessionId: string;
  channel: ClaudeCodeChannel;
  /** Undefined on `attach` — the live bridge was spawned by another process. */
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  maxTurns: number | undefined;
  env: Readonly<Record<string, string>> | undefined;
  thinking: ClaudeCodeThinkingConfig;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  isResume: boolean;
  continueOnFirstPrompt: boolean;
  /**
   * Exact conversation to rehydrate whenever a fresh SDK query starts. Takes
   * precedence over the `continue` flag, which can only mean "most recent in
   * this workdir".
   */
  resumeSessionId?: string;
  rerunContinue: boolean;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string | undefined;
  sandboxCredentialEnvironment: Record<string, string> | undefined;
  debug: HarnessV1DebugConfig | undefined;
  permissionMode: HarnessV1PermissionMode | undefined;
  builtinToolFiltering: HarnessV1BuiltinToolFiltering | undefined;
  sandbox: SandboxSession;
  sandboxHomeDir: string;
  mcpServers: Record<string, unknown> | undefined;
  supportsUserMessageResponses: () => boolean;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  /*
   * Force the Claude SDK's `continue: true` on the first prompt only when the
   * bridge was respawned without an exact conversation id (rerun/replay): a
   * fresh bridge process treats its first turn as new, so it must be told to
   * rehydrate the workdir thread. Exact ids are sent independently of this
   * fallback on every fresh query.
   */
  let pendingResumeFlag = continueOnFirstPrompt;

  /*
   * The Claude conversation this session currently embodies. Seeded from the
   * resume state and updated from every `finish` part's metadata — each turn
   * may fork a new id, so the latest observation is the one a later
   * stop/detach must record for exact resume.
   */
  let lastClaudeSessionId = resumeSessionId;

  /*
   * Wire the channel into one turn's worth of events and return the control
   * surface. Shared by `doPromptTurn` (which sends a `start` afterwards) and
   * `doContinueTurn` (which attaches to an already-running/replayed turn, or sends
   * a rerun `start`). The only difference between the two entry points is the
   * `start` message, not the listener/abort/settle plumbing.
   */
  const wireTurn = (turnOpts: {
    emit: (event: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
  }): HarnessV1PromptControl => {
    let pendingResolve: (() => void) | undefined;
    let pendingReject: ((err: unknown) => void) | undefined;
    const done = new Promise<void>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });
    const userMessageSubmitter = supportsUserMessageResponses()
      ? experimental_createBridgeUserMessageSubmitter({
          send: message => channel.send(message),
          onResponse: listener => channel.on('user-message-response', listener),
          onReconnect: listener => channel.onReconnect(listener),
        })
      : undefined;
    const unsubs: Array<() => void> = [];
    const forward = (event: HarnessV1StreamPart) => {
      try {
        turnOpts.emit(event);
      } catch {}
    };

    let isSettled = false;
    const settleSuccess = () => {
      if (isSettled) return;
      isSettled = true;
      userMessageSubmitter?.close();
      for (const u of unsubs) u();
      pendingResolve!();
    };
    const settleError = (err: unknown) => {
      if (isSettled) return;
      isSettled = true;
      userMessageSubmitter?.close(err);
      for (const u of unsubs) u();
      pendingReject!(err);
    };

    const eventTypes = [
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'tool-approval-request',
      'tool-result',
      'finish-step',
      'raw',
    ] as const;
    for (const type of eventTypes) {
      unsubs.push(
        channel.on(type, msg => {
          forward(msg);
        }),
      );
    }
    unsubs.push(
      channel.on('finish', msg => {
        const metadata = (
          msg as {
            harnessMetadata?: { 'claude-code'?: { sessionId?: unknown } };
          }
        ).harnessMetadata?.['claude-code']?.sessionId;
        if (typeof metadata === 'string' && metadata.length > 0) {
          lastClaudeSessionId = metadata;
        }
        forward(msg);
        settleSuccess();
      }),
    );
    unsubs.push(
      channel.on('error', msg => {
        forward(msg);
        settleError(msg.error);
      }),
    );

    /*
     * A `'suspended'` close is a graceful slice-boundary freeze the host
     * initiated (`doSuspendTurn`): the turn keeps running in the bridge and its
     * tail is replayed to the next process, so wind this turn down cleanly
     * rather than failing it. Any other close mid-turn is an unexpected drop.
     */
    const onClose = (_code?: number, reason?: string) => {
      if (isSettled) return;
      if (reason === 'suspended') {
        settleSuccess();
        return;
      }
      settleError(
        new Error('claude-code bridge closed before the turn finished.'),
      );
    };
    channel.onClose(onClose);

    const onAbort = () => {
      if (isSettled) return;
      try {
        channel.send({ type: 'abort' });
      } catch {}
      settleError(
        turnOpts.abortSignal?.reason ??
          new DOMException('Aborted', 'AbortError'),
      );
    };
    if (turnOpts.abortSignal) {
      if (turnOpts.abortSignal.aborted) {
        onAbort();
      } else {
        turnOpts.abortSignal.addEventListener('abort', onAbort, {
          once: true,
        });
      }
    }

    return {
      submitToolResult: async input => {
        channel.send({
          type: 'tool-result',
          toolCallId: input.toolCallId,
          output: input.output,
          isError: input.isError,
          ...(input.toolResult !== undefined
            ? { toolResult: input.toolResult }
            : {}),
        });
      },
      submitToolApproval: async input => {
        channel.send({
          type: 'tool-approval-response',
          approvalId: input.approvalId,
          approved: input.approved,
          reason: input.reason,
        });
      },
      ...(userMessageSubmitter == null
        ? {}
        : {
            submitUserMessage: async (text: string) => {
              await userMessageSubmitter.submit(text);
            },
          }),
      done,
    };
  };

  return {
    sessionId,
    isResume,
    doPromptTurn: async promptOpts => {
      if (
        promptOpts.responseFormat?.type === 'json' &&
        promptOpts.responseFormat.schema == null
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'claude-code' requires a JSON schema for structured output.",
          harnessId: 'claude-code',
        });
      }
      await writeClaudeCodeSkills({
        sandbox,
        homeDir: sandboxHomeDir,
        skills: promptOpts.skills,
        abortSignal: promptOpts.abortSignal,
      });
      const control = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });

      /*
       * A signal that was already aborted has settled the turn inside
       * `wireTurn`. Sending `start` anyway would run a full unattended turn
       * in the bridge — consuming tokens and possibly acting on the
       * workspace — after the caller has already observed the abort.
       */
      if (promptOpts.abortSignal?.aborted) {
        return control;
      }

      const startMessage = {
        type: 'start' as const,
        prompt: extractUserText(promptOpts.prompt),
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        ...(promptOpts.responseFormat == null
          ? {}
          : { responseFormat: promptOpts.responseFormat }),
        ...(promptOpts.instructions
          ? { instructions: promptOpts.instructions }
          : {}),
        model: promptOpts.model ?? model,
        maxTurns,
        ...(env !== undefined ? { env } : {}),
        thinking,
        ...(effort !== undefined ? { effort } : {}),
        ...(promptOpts.skills.length > 0
          ? { skills: promptOpts.skills.map(skill => skill.name) }
          : {}),
        ...(mcpServers == null ? {} : { mcpServers }),
        ...(permissionMode ? { permissionMode } : {}),
        ...(builtinToolFiltering ? { builtinToolFiltering } : {}),
        ...(debug ? { debug } : {}),
        ...(lastClaudeSessionId
          ? { resumeSessionId: lastClaudeSessionId }
          : pendingResumeFlag
            ? { continue: true }
            : {}),
      };
      pendingResumeFlag = false;
      channel.send(startMessage);

      return control;
    },
    doContinueTurn: async continueOpts => {
      if (
        continueOpts.responseFormat?.type === 'json' &&
        continueOpts.responseFormat.schema == null
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'claude-code' requires a JSON schema for structured output.",
          harnessId: 'claude-code',
        });
      }
      await writeClaudeCodeSkills({
        sandbox,
        homeDir: sandboxHomeDir,
        skills: continueOpts.skills,
        abortSignal: continueOpts.abortSignal,
      });
      const control = wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });

      /*
       * attach / replay: the still-running (or disk-replayed) turn streams into
       * the wired listeners — `doStart` opened the channel with `{ resume: true }`
       * so the bridge replays everything past the persisted cursor (including a
       * `finish` if the turn ended during the gap). No `start` is sent: issuing
       * one would clear the bridge's replay log and begin a new turn. Lossless.
       *
       * rerun: the bridge was respawned with no in-flight turn to attach to, so
       * re-drive the runtime's own thread from the workdir snapshot via
       * `continue: true`. Lossy — work in flight at the suspension is
       * recomputed. This is the rare bridge-died fallback; the common slice path
       * is `attach`.
       */
      // Same as `doPromptTurn`: an already-aborted signal settled the turn in
      // `wireTurn`, so don't re-drive the thread nobody is waiting on.
      if (rerunContinue && !continueOpts.abortSignal?.aborted) {
        pendingResumeFlag = false;
        channel.send({
          type: 'start' as const,
          /*
           * A continuation nudge rather than an empty prompt: `continue: true`
           * rehydrates the prior thread, and this is the new user turn that
           * drives it forward. It must be non-empty — an empty text block is
           * rejected by the Anthropic API once the SDK stamps it with
           * `cache_control`.
           */
          prompt: 'Continue.',
          tools: (continueOpts.tools ?? []).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          ...(continueOpts.responseFormat == null
            ? {}
            : { responseFormat: continueOpts.responseFormat }),
          ...(continueOpts.instructions
            ? { instructions: continueOpts.instructions }
            : {}),
          model: continueOpts.model ?? model,
          maxTurns,
          ...(env !== undefined ? { env } : {}),
          thinking,
          ...(effort !== undefined ? { effort } : {}),
          ...(continueOpts.skills.length > 0
            ? { skills: continueOpts.skills.map(skill => skill.name) }
            : {}),
          ...(mcpServers == null ? {} : { mcpServers }),
          ...(permissionMode ? { permissionMode } : {}),
          ...(builtinToolFiltering ? { builtinToolFiltering } : {}),
          ...(debug ? { debug } : {}),
          ...(lastClaudeSessionId
            ? { resumeSessionId: lastClaudeSessionId }
            : { continue: true }),
        });
      }

      return control;
    },
    doCompact: async (customInstructions?: string) => {
      /*
       * Claude Code has no SDK/control method for compaction — the supported
       * trigger is the `/compact` slash command submitted as user input. Ride
       * the existing user-message rail; the bridge feeds it into the streaming
       * query input and Claude's native compaction handles the rest, emitting a
       * `compact_boundary` + `PostCompact` we observe as a `compaction` event.
       */
      const text =
        customInstructions && customInstructions.trim()
          ? `/compact ${customInstructions.trim()}`
          : '/compact';
      channel.send({ type: 'user-message', text });
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `claude-code session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {
          ...(sandboxCredentialEnvironment == null
            ? {}
            : { sandboxCredentialEnvironment }),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            ...(sandboxId == null ? {} : { sandboxId }),
          },
          ...(lastClaudeSessionId
            ? { claudeSessionId: lastClaudeSessionId }
            : {}),
        },
      };
      return payload;
    },
    doDestroy: async () => {
      if (stopped) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
        // Tell the channel we are tearing down so the bridge's post-shutdown
        // socket close finalises instead of triggering a reconnect.
        channel.beginClose();
        try {
          if (!channel.isClosed()) {
            channel.send({ type: 'destroy' });
          }
        } catch {}
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (proc) {
            await Promise.race([
              proc.wait(),
              new Promise<void>(resolve => {
                stopTimer = setTimeout(resolve, 5000);
                stopTimer.unref?.();
              }),
            ]);
          }
        } finally {
          if (stopTimer) clearTimeout(stopTimer);
          try {
            await proc?.kill();
          } catch {}
          channel.close();
        }
      })();
      return stopPromise;
    },
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `claude-code session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      /*
       * If the bridge's channel already closed (e.g. mid-turn WS drop)
       * there is no one to acknowledge a `stop` message. Synthesize an empty
       * payload — for Claude Code the resume state structurally is `{}`
       * (the conversation lives in the workdir, captured by the sandbox
       * snapshot during the subsequent `sandboxSession.stop()`), so we
       * lose nothing by skipping the round-trip.
       */
      // Tell the channel we are tearing down so the bridge's post-stop
      // socket close finalises instead of triggering a reconnect.
      channel.beginClose();
      const data: unknown = channel.isClosed()
        ? {}
        : await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              unsub();
              reject(
                new Error(
                  `claude-code session ${sessionId} did not reply to stop within 5s.`,
                ),
              );
            }, 5000);
            timer.unref?.();
            const unsub = channel.on('bridge-stop', msg => {
              clearTimeout(timer);
              unsub();
              resolve(msg.data);
            });
            try {
              channel.send({ type: 'stop' });
            } catch (err) {
              clearTimeout(timer);
              unsub();
              reject(err);
            }
          });

      // The bridge exits itself after sending bridge-stop. Give
      // it a moment, then ensure the process is reaped and the channel
      // closed.
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (proc) {
          await Promise.race([
            proc.wait(),
            new Promise<void>(resolve => {
              stopTimer = setTimeout(resolve, 5000);
              stopTimer.unref?.();
            }),
          ]);
        }
      } finally {
        if (stopTimer) clearTimeout(stopTimer);
        try {
          await proc?.kill();
        } catch {}
        channel.close();
      }

      const lifecycleData =
        data != null && typeof data === 'object' && !Array.isArray(data)
          ? { ...(data as Record<string, unknown>) }
          : {};
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        // The bridge's stop reply carries the session id it observed; the
        // adapter's own record backfills it when the reply predates the
        // field or the channel was already closed.
        data: {
          ...(lastClaudeSessionId
            ? { claudeSessionId: lastClaudeSessionId }
            : {}),
          ...lifecycleData,
          ...(sandboxCredentialEnvironment == null
            ? {}
            : { sandboxCredentialEnvironment }),
        } as HarnessV1ResumeSessionState['data'],
      };
      return payload;
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `claude-code session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      /*
       * Freeze the host at a precise cursor without stopping the active model
       * turn. `channel.suspend` stops processing inbound frames, drains what
       * was already dispatched, then closes the host socket with reason
       * `'suspended'`. The bridge keeps the turn running and accumulates events
       * past the cursor for the next slice to replay. The sandbox process is
       * deliberately left alive.
       */
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ContinueTurnState = {
        type: 'continue-turn',
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        data: {
          ...(sandboxCredentialEnvironment == null
            ? {}
            : { sandboxCredentialEnvironment }),
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            ...(sandboxId == null ? {} : { sandboxId }),
          },
          ...(lastClaudeSessionId
            ? { claudeSessionId: lastClaudeSessionId }
            : {}),
        },
      };
      return payload;
    },
  };
}

/*
 * Reduce a `HarnessV1Prompt` to the plain user text the bridge forwards
 * to the Claude SDK. File and image parts on the message are not yet
 * supported by the underlying runtime — throw rather than silently drop
 * them so callers learn about the gap instead of seeing mysteriously
 * truncated prompts.
 */
function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'claude-code',
        message: `The claude-code harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
