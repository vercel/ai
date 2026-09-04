import { posix } from 'node:path';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1ContinueTurnState,
  type HarnessV1CredentialForwarding,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1PortEndpoint,
  type HarnessV1ResumeSessionState,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  applyCredentialForwarding,
  createBridgeToken,
  createSandboxCredentialEnvironment,
  markBridgeStarting,
  createBridgeErrorHandler,
  createBridgeStartupError,
  drainBridgeProcessStream,
  forwardBridgeProcessStream,
  getRestrictedSandboxSession,
  resolveSandboxDefaultWorkingDirectory,
  resolveSandboxHomeDir,
  SandboxChannel,
  shellQuote,
  warnCredentialBrokeringUnavailable,
  waitForBridgeReady,
  withBridgeToken,
  writeSkills as writeHarnessSkills,
  type WriteSkillsResult,
} from '@ai-sdk/harness/utils';
import {
  tool,
  type Experimental_SandboxProcess,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import {
  DEEPAGENTS_BOOTSTRAP_DIR as BOOTSTRAP_DIR,
  getDeepAgentsBootstrap,
} from './deepagents-bootstrap';
import {
  createDeepAgentsRequestTransformations,
  DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES,
  resolveDeepAgentsAuthenticationMode,
  resolveDeepAgentsEnv,
  type DeepAgentsAuthenticationMode,
} from './deepagents-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './deepagents-bridge-protocol';
import { VERSION } from './version';

type DeepAgentsChannel = SandboxChannel<OutboundMessage, InboundMessage>;

/**
 * Value to use in User-Agent and `x-client-app` headers.
 */
const DEEPAGENTS_CLIENT_APP = `ai-sdk/harness-deepagents/${VERSION}`;

export type DeepAgentsThinkingConfig =
  | {
      readonly type: 'adaptive';
      readonly display?: 'summarized' | 'omitted';
    }
  | {
      readonly type: 'enabled';
      readonly budget_tokens: number;
      readonly display?: 'summarized' | 'omitted';
    }
  | {
      readonly type: 'disabled';
    };

// Skills source subpath, written under $HOME (out of the work dir so it can't clash with code cloned into the work dir) and also discovered from <workDir> for repo-provided skills.
const SKILLS_SOURCE_PATH = '/.agents/skills';

export type DeepAgentsHarnessSettings = {
  readonly auth?: DeepAgentsAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Model id for the DeepAgents runtime, e.g. `claude-sonnet-4` (converted to
   * `provider:model`).
   *
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
  /**
   * Controls Anthropic extended thinking for the Deep Agents model. Unset
   * preserves the Deep Agents runtime default.
   */
  readonly thinking?: DeepAgentsThinkingConfig;
  /**
   * Controls how much effort Claude applies when adaptive thinking is enabled.
   * Unset uses the LangChain Anthropic client default.
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Bridge port override; defaults to the sandbox's first declared port. */
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
  /**
   * Maximum LangGraph super-steps per turn before it errors.
   * When omitted, the Deep Agents default applies.
   */
  readonly recursionLimit?: number;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
};

// Every model-callable DeepAgents built-in, keyed by what the bridge emits (commonName ?? nativeName); all must be listed or AI SDK throws AI_NoSuchToolError.
const DEEPAGENTS_BUILTIN_TOOLS = {
  read: commonTool('read', {
    nativeName: 'read_file',
    toolUseKind: 'readonly',
    description: 'Read file contents',
    inputSchema: z.object({ file_path: z.string() }),
  }),
  write: commonTool('write', {
    nativeName: 'write_file',
    toolUseKind: 'edit',
    description: 'Create a file',
    inputSchema: z.object({ file_path: z.string(), content: z.string() }),
  }),
  edit: commonTool('edit', {
    nativeName: 'edit_file',
    toolUseKind: 'edit',
    description: 'Perform exact string replacements in a file',
    inputSchema: z.object({
      file_path: z.string(),
      old_string: z.string(),
      new_string: z.string(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'execute',
    toolUseKind: 'bash',
    description: 'Run a shell command',
    inputSchema: z.object({ command: z.string() }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search file contents',
    inputSchema: z.object({ pattern: z.string() }),
  }),
  glob: commonTool('glob', {
    nativeName: 'glob',
    toolUseKind: 'readonly',
    description: 'Find files matching a glob pattern',
    inputSchema: z.object({ pattern: z.string() }),
  }),
  // No common-name equivalent — keyed by native name.
  ls: tool({
    description: 'List files in a directory',
    inputSchema: z.object({ path: z.string().optional() }),
  }),
  task: tool({
    description: 'Spawn a subagent to handle a delegated task',
    inputSchema: z.object({
      description: z.string().optional(),
      subagent_type: z.string().optional(),
    }),
  }),
  write_todos: tool({
    description: 'Manage a structured todo list',
    inputSchema: z.object({ todos: z.array(z.unknown()).optional() }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

// Live bridge coordinates returned by doDetach/doSuspendTurn so a later process can reattach.
const deepAgentsBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});
const deepAgentsResumeStateSchema = z.object({
  bridge: deepAgentsBridgeCoordsSchema.optional(),
  sandboxCredentialEnvironment: z.record(z.string(), z.string()).optional(),
});
type DeepAgentsBridgeCoords = z.infer<typeof deepAgentsBridgeCoordsSchema>;

export function createDeepAgents(
  settings: DeepAgentsHarnessSettings = {},
): HarnessV1<typeof DEEPAGENTS_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'deepagents',
    builtinTools: DEEPAGENTS_BUILTIN_TOOLS,
    // Built-in tool approvals are gated in-bridge via DeepAgents' interruptOn (HITL) middleware.
    supportsBuiltinToolApprovals: true,
    lifecycleStateSchema: deepAgentsResumeStateSchema,
    getBootstrap: getDeepAgentsBootstrap,
    doStart: async startOpts => {
      const permissionMode = startOpts.permissionMode;
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
          harnessId: 'deepagents',
          message:
            'The deepagents harness cannot use `mintBridgeToken` with a sandbox session that does not expose an id.',
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
      const resumeData =
        isResume && typeof lifecycleState?.data === 'object'
          ? (lifecycleState.data as {
              bridge?: DeepAgentsBridgeCoords;
              sandboxCredentialEnvironment?: Record<string, string>;
            })
          : undefined;
      const coords = resumeData?.bridge;
      const authenticationMode = resolveDeepAgentsAuthenticationMode({
        auth: settings.auth,
      });
      const resolvedAuthEnvironment = resolveDeepAgentsEnv({
        auth: settings.auth,
      });
      let sandboxAuthEnvironment = resolvedAuthEnvironment;
      let sandboxCredentialEnvironment: Record<string, string> | undefined;
      let credentialsBrokered = false;
      if (
        'addRequestTransformations' in sandboxSession &&
        sandboxSession.addRequestTransformations != null
      ) {
        sandboxCredentialEnvironment =
          resumeData?.sandboxCredentialEnvironment ??
          (await createSandboxCredentialEnvironment({
            environment: resolvedAuthEnvironment,
            credentialEnvironmentVariables:
              DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          }));
        sandboxAuthEnvironment = {
          ...resolvedAuthEnvironment,
          ...sandboxCredentialEnvironment,
        };
        const requestTransformations = createDeepAgentsRequestTransformations({
          env: resolvedAuthEnvironment,
          sandboxEnv: sandboxAuthEnvironment,
          auth: authenticationMode,
        });
        if (requestTransformations.length > 0) {
          await sandboxSession.addRequestTransformations(
            requestTransformations,
          );
        }
        credentialsBrokered = true;
      }
      const bootstrapDir = posix.resolve(
        defaultWorkingDirectory,
        BOOTSTRAP_DIR,
      );

      const workDir = startOpts.sessionWorkDir;
      /*
       * Deep Agents discovers repository skills under the working directory.
       * Harness-provided skills use an absolute home-directory path listed
       * last, so they take precedence when names collide.
       */
      const homeDir = await resolveSandboxHomeDir({
        sandbox: toolSafeSandboxSession,
        abortSignal: startOpts.abortSignal,
      });
      const homeSkillsRoot = `${homeDir}${SKILLS_SOURCE_PATH}`;
      const skillsPaths = [`${workDir}${SKILLS_SOURCE_PATH}`, homeSkillsRoot];
      const sessionDataDir = `${defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;

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
        harnessId: 'deepagents',
        sessionId: startOpts.sessionId,
      });

      // Attach to the still-running bridge (continueFrom replays past the cursor); on failure fall through to a fresh spawn.
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
          const attachChannel: DeepAgentsChannel = new SandboxChannel({
            connect: () => openWebSocket(attachEndpoint),
            outboundSchema: outboundMessageSchema,
            initialLastSeenEventId: coords.lastSeenEventId,
            onDiagnostic,
            onBridgeError,
          });
          await attachChannel.open(isContinue ? { resume: true } : undefined);
          return createSession({
            sessionId: startOpts.sessionId,
            channel: attachChannel,
            proc: undefined,
            model: settings.model,
            thinking: settings.thinking,
            effort: settings.effort,
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            sandboxCredentialEnvironment,
            isResume: true,
            sandbox: toolSafeSandboxSession,
            homeSkillsRoot,
            skillsPaths,
            permissionMode,
            builtinToolFiltering: startOpts.builtinToolFiltering,
            recursionLimit: settings.recursionLimit,
            mcpServers: settings.mcpServers,
            headers: startOpts.headers,
          });
        } catch {
          // Bridge no longer reachable — recover by respawning below.
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

      const forwardedAuthEnvironment = credentialsBrokered
        ? sandboxAuthEnvironment
        : await applyCredentialForwarding({
            environment: sandboxAuthEnvironment,
            credentialEnvironmentVariables:
              DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          });
      if (!credentialsBrokered) {
        warnCredentialBrokeringUnavailable({
          environment: resolvedAuthEnvironment,
          forwardedEnvironment: forwardedAuthEnvironment,
          credentialEnvironmentVariables:
            DEEPAGENTS_CREDENTIAL_ENVIRONMENT_VARIABLES,
        });
      }
      const env = {
        ...forwardedAuthEnvironment,
        AI_SDK_HARNESS_CLIENT_APP: DEEPAGENTS_CLIENT_APP,
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
      };

      await toolSafeSandboxSession.run({
        command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
        abortSignal: startOpts.abortSignal,
      });

      await markBridgeStarting({
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'deepagents',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await toolSafeSandboxSession.spawn({
        command: `node ${shellQuote(`${bootstrapDir}/bridge.mjs`)} --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --bootstrap-dir ${shellQuote(bootstrapDir)}${isResume ? ' --resume true' : ''}`,
        env,
        abortSignal: startOpts.abortSignal,
      });
      const stderrTail: string[] = [];
      const bridgeStderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: 'deepagents',
        collectTail: stderrTail,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'deepagents',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'deepagents bridge did not become ready in time.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'deepagents bridge exited before becoming ready.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
      });
      void drainBridgeProcessStream(proc.stdout);

      const endpoint = await resolveBridgeEndpoint({
        sandboxSession,
        override: settings.portEndpoint,
        port: boundPort,
      });
      const bridgeEndpoint = withBridgeToken({ endpoint, token });

      const channel: DeepAgentsChannel = new SandboxChannel({
        connect: () => openWebSocket(bridgeEndpoint),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        onBridgeError,
      });
      await channel.open();

      return createSession({
        sessionId: startOpts.sessionId,
        channel,
        proc,
        model: settings.model,
        thinking: settings.thinking,
        effort: settings.effort,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        sandboxCredentialEnvironment,
        isResume,
        sandbox: toolSafeSandboxSession,
        homeSkillsRoot,
        skillsPaths,
        permissionMode,
        builtinToolFiltering: startOpts.builtinToolFiltering,
        recursionLimit: settings.recursionLimit,
        mcpServers: settings.mcpServers,
        headers: startOpts.headers,
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
    harnessId: 'deepagents',
    message:
      'The deepagents harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createDeepAgents({ port })`.',
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
      harnessId: 'deepagents',
      message:
        'The deepagents harness requires an explicit `port` when using a basic sandbox session.',
    });
  }
  if (portEndpoint == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'deepagents',
      message:
        'The deepagents harness requires an explicit `portEndpoint` when using a basic sandbox session.',
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
    harnessId: 'deepagents',
    message:
      'The deepagents harness requires an explicit `portEndpoint` when using a basic sandbox session.',
  });
}

// Materialize each skill as a native deepagents `<name>/SKILL.md` folder (+ attached files) under the given root, so skills load on demand and file references resolve.
async function writeSkills({
  sandbox,
  root,
  skills,
  abortSignal,
}: {
  sandbox: SandboxSession;
  root: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<WriteSkillsResult> {
  /*
   * DeepAgents requires each `SKILL.md` frontmatter name to match the parent
   * directory name, so keep the stricter lowercase skill-name policy here.
   */
  return writeHarnessSkills({
    sandbox,
    rootDir: root,
    skills,
    abortSignal,
    skillNamePattern: /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/,
    invalidSkillNameMessage: ({ name }) =>
      `Invalid deepagents skill name '${name}': must be lowercase alphanumeric with hyphens, 1-64 chars.`,
    filePathMode: 'strip-leading-slashes',
    invalidSkillFilePathMessage: ({ skillName, filePath }) =>
      `Invalid skill file path for '${skillName}': ${filePath}`,
  });
}

function openWebSocket({
  url,
  headers,
}: HarnessV1PortEndpoint): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: headers == null ? undefined : { ...headers },
    });
    const onOpen = () => {
      ws.off('error', onError);
      resolve(ws);
    };
    const onError = (err: Error) => {
      ws.off('open', onOpen);
      reject(err);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function createSession({
  sessionId,
  channel,
  proc,
  model,
  thinking,
  effort,
  bridgePort,
  bridgeToken,
  sandboxId,
  sandboxCredentialEnvironment,
  isResume,
  sandbox,
  homeSkillsRoot,
  skillsPaths,
  permissionMode,
  builtinToolFiltering,
  recursionLimit,
  mcpServers,
  headers,
}: {
  sessionId: string;
  channel: DeepAgentsChannel;
  // Undefined on attach — the live bridge was spawned by another process.
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  thinking: DeepAgentsThinkingConfig | undefined;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string | undefined;
  sandboxCredentialEnvironment: Record<string, string> | undefined;
  isResume: boolean;
  sandbox: SandboxSession;
  homeSkillsRoot: string;
  skillsPaths?: string[];
  permissionMode?: HarnessV1PermissionMode;
  builtinToolFiltering?: HarnessV1BuiltinToolFiltering;
  recursionLimit?: number;
  mcpServers?: Record<string, unknown>;
  headers?: Readonly<Record<string, string>>;
}): HarnessV1Session {
  let stopped = false;

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

    const unsubs: Array<() => void> = [];
    const forward = (event: HarnessV1StreamPart) => {
      try {
        turnOpts.emit(event);
      } catch {}
    };

    const eventTypes = [
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-call',
      'tool-approval-request',
      'tool-result',
      'file-change',
      'finish-step',
      'raw',
    ] as const;
    let isSettled = false;
    const settleSuccess = () => {
      if (isSettled) return;
      isSettled = true;
      for (const u of unsubs) u();
      pendingResolve!();
    };
    const settleError = (err: unknown) => {
      if (isSettled) return;
      isSettled = true;
      for (const u of unsubs) u();
      pendingReject!(err);
    };

    for (const type of eventTypes) {
      unsubs.push(channel.on(type, msg => forward(msg)));
    }
    unsubs.push(
      channel.on('finish', msg => {
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

    // A `'suspended'` close is a graceful slice-boundary freeze (suspend/detach keep the bridge alive for continuation); end the turn cleanly. Any other close is an unexpected bridge failure.
    const onClose = (_code: number, reason: string) => {
      if (isSettled) return;
      if (reason === 'suspended') {
        settleSuccess();
        return;
      }
      settleError(
        new Error('deepagents bridge closed before the turn finished.'),
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
        turnOpts.abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    return {
      submitToolResult: async input => {
        channel.send({
          type: 'tool-result',
          toolCallId: input.toolCallId,
          output: input.output,
          isError: input.isError,
        });
      },
      submitToolApproval: async input => {
        channel.send({
          type: 'tool-approval-response',
          approvalId: input.approvalId,
          approved: input.approved,
          ...(input.reason != null ? { reason: input.reason } : {}),
        });
      },
      done,
    };
  };

  const unsupported = (capability: string): never => {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'deepagents',
      message: `Harness 'deepagents' does not support ${capability} yet.`,
    });
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
            "Harness 'deepagents' requires a JSON schema for structured output.",
          harnessId: 'deepagents',
        });
      }
      const skillWriteResult = await writeSkills({
        sandbox,
        root: homeSkillsRoot,
        skills: promptOpts.skills,
        abortSignal: promptOpts.abortSignal,
      });
      const control = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });

      channel.send({
        type: 'start',
        prompt: extractUserText(promptOpts.prompt),
        ...(promptOpts.instructions
          ? { instructions: promptOpts.instructions }
          : {}),
        tools: (promptOpts.tools ?? []).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        ...(promptOpts.responseFormat == null
          ? {}
          : { responseFormat: promptOpts.responseFormat }),
        ...((promptOpts.model ?? model)
          ? { model: promptOpts.model ?? model }
          : {}),
        ...(thinking ? { thinking } : {}),
        ...(effort ? { effort } : {}),
        ...(skillsPaths?.length ? { skillsPaths } : {}),
        skillsChanged: skillWriteResult.changed,
        ...(permissionMode ? { permissionMode } : {}),
        ...(builtinToolFiltering ? { builtinToolFiltering } : {}),
        ...(recursionLimit != null ? { recursionLimit } : {}),
        ...(mcpServers == null ? {} : { mcpServers }),
        ...(headers == null ? {} : { headers }),
      });

      return control;
    },
    doContinueTurn: async continueOpts => {
      if (
        continueOpts.responseFormat?.type === 'json' &&
        continueOpts.responseFormat.schema == null
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'deepagents' requires a JSON schema for structured output.",
          harnessId: 'deepagents',
        });
      }
      // Attach/replay: doStart opened with `{ resume: true }` so the bridge replays past the cursor; no `start` is sent (that would clear the replay log).
      return wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      // Freeze the active turn at the cursor, leaving the bridge running so the next slice replays the tail.
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ContinueTurnState = {
        type: 'continue-turn',
        harnessId: 'deepagents',
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
        },
      };
      return payload;
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      // Park between turns: close the host socket but leave the bridge running for a later reattach via these coords.
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'deepagents',
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
        },
      };
      return payload;
    },
    doCompact: async () => unsupported('manual compaction'),
    doStop: async () => {
      if (stopped) {
        throw new Error(
          `deepagents session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      await teardown({ channel, proc, operation: 'stop' });
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'deepagents',
        specificationVersion: 'harness-v1',
        data:
          sandboxCredentialEnvironment == null
            ? {}
            : { sandboxCredentialEnvironment },
      };
      return payload;
    },
    doDestroy: async () => {
      if (stopped) return;
      stopped = true;
      await teardown({ channel, proc, operation: 'destroy' });
    },
  };
}

async function teardown({
  channel,
  proc,
  operation,
}: {
  channel: DeepAgentsChannel;
  proc: Experimental_SandboxProcess | undefined;
  operation: 'stop' | 'destroy';
}): Promise<void> {
  channel.beginClose();
  try {
    if (!channel.isClosed()) {
      channel.send({ type: operation });
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
}

// Reduce the prompt to plain user text; non-text parts are unsupported.
function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'deepagents',
        message: `The deepagents harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
