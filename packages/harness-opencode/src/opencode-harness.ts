import path from 'node:path';
import {
  commonTool,
  HARNESS_V1_BUILTIN_TOOLS,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1BuiltinTool,
  type HarnessV1BuiltinToolFiltering,
  type HarnessV1ContinueTurnState,
  type HarnessV1CredentialForwarding,
  type HarnessV1DebugConfig,
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
  type WriteSkillsResult,
} from '@ai-sdk/harness/utils';
import {
  safeParseJSON,
  tool,
  type Experimental_SandboxProcess,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import {
  getOpenCodeBootstrap,
  OPENCODE_BOOTSTRAP_DIR as BOOTSTRAP_DIR,
} from './opencode-bootstrap';
import {
  createOpenCodeRequestTransformations,
  OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
  resolveOpenCodeAuthenticationMode,
  resolveOpenCodeEnv,
  splitOpenCodeModel,
  type OpenCodeAuthenticationMode,
} from './opencode-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './opencode-bridge-protocol';
import { VERSION } from './version';

type OpenCodeChannel = SandboxChannel<OutboundMessage, InboundMessage>;
type OpenCodeRespawnStrategy = 'replay' | 'rerun';

/**
 * Value to use in User-Agent and `x-client-app` headers.
 */
const OPENCODE_CLIENT_APP = `ai-sdk/harness-opencode/${VERSION}`;

export type OpenCodeHarnessSettings = {
  readonly auth?: OpenCodeAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Additional configuration passed through to OpenCode as-is. OpenCode
   * config keys must use their native names. Values managed by this adapter
   * take precedence over conflicting entries.
   */
  readonly openCodeConfig?: Record<string, unknown>;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  /**
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
  readonly provider?: string;
  /**
   * OpenCode reasoning/thinking variant for reasoning-capable models, e.g.
   * `'low'`, `'medium'`, `'high'`, or another model-supported OpenCode
   * variant.
   */
  readonly reasoningVariant?: string;
  readonly port?: number;
  /**
   * Override the host endpoint used to connect to the sandbox bridge. Required
   * together with `port` when using a basic sandbox session.
   */
  readonly portEndpoint?: HarnessV1PortEndpoint;
  readonly startupTimeoutMs?: number;
  /**
   * Creates the authentication token used by the sandbox bridge. Defaults to
   * a random 32-byte hexadecimal token.
   */
  readonly mintBridgeToken?: (sandboxId: string) => string;
};

const optionalStringRecord = z.record(z.string(), z.unknown()).optional();

const OPENCODE_BUILTIN_TOOLS = {
  askUserQuestions: {
    ...HARNESS_V1_BUILTIN_TOOLS.askUserQuestions,
    nativeName: 'question',
    toolUseKind: 'readonly',
  },
  read: commonTool('read', {
    nativeName: 'view',
    toolUseKind: 'readonly',
    description: 'Read file contents',
    inputSchema: z.looseObject({
      file_path: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  write: commonTool('write', {
    nativeName: 'write',
    toolUseKind: 'edit',
    description: 'Write content to a file',
    inputSchema: z.looseObject({
      file_path: z.string().optional(),
      path: z.string().optional(),
      content: z.string().optional(),
    }),
  }),
  edit: commonTool('edit', {
    nativeName: 'edit',
    toolUseKind: 'edit',
    description: 'Edit a file by replacing text',
    inputSchema: z.looseObject({
      file_path: z.string().optional(),
      path: z.string().optional(),
      old_string: z.string().optional(),
      new_string: z.string().optional(),
    }),
  }),
  bash: commonTool('bash', {
    nativeName: 'bash',
    toolUseKind: 'bash',
    description: 'Execute a shell command',
    inputSchema: z.looseObject({
      command: z.string().optional(),
    }),
  }),
  glob: commonTool('glob', {
    nativeName: 'glob',
    toolUseKind: 'readonly',
    description: 'Find files matching a glob pattern',
    inputSchema: z.looseObject({
      pattern: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  grep: commonTool('grep', {
    nativeName: 'grep',
    toolUseKind: 'readonly',
    description: 'Search file contents with regex',
    inputSchema: z.looseObject({
      pattern: z.string().optional(),
      path: z.string().optional(),
    }),
  }),
  ls: tool({
    description: 'List directory contents',
    inputSchema: z.looseObject({
      path: z.string().optional(),
    }),
  }),
  webfetch: tool({
    description: 'Fetch a URL',
    inputSchema: z.looseObject({
      url: z.string().optional(),
      prompt: z.string().optional(),
    }),
  }),
  skill: tool({
    description: 'Load an OpenCode skill by name',
    inputSchema: z.looseObject({
      name: z.string().optional(),
    }),
  }),
  todowrite: tool({
    description: 'Replace the OpenCode session todo list',
    inputSchema: z.looseObject({
      todos: z
        .array(
          z.looseObject({
            content: z.string().optional(),
            status: z.string().optional(),
            priority: z.string().optional(),
          }),
        )
        .optional(),
    }),
  }),
  agent: tool({
    description: 'Run an OpenCode subagent',
    inputSchema: z.looseObject({
      agent: z.string().optional(),
      prompt: z.string().optional(),
      description: z.string().optional(),
      metadata: optionalStringRecord,
    }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

const openCodeBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});

const openCodeResumeStateSchema = z.object({
  openCodeSessionId: z.string().optional(),
  bridge: openCodeBridgeCoordsSchema.optional(),
  sandboxCredentialEnvironment: z.record(z.string(), z.string()).optional(),
});

type OpenCodeBridgeCoords = z.infer<typeof openCodeBridgeCoordsSchema>;

export function createOpenCode(
  settings: OpenCodeHarnessSettings = {},
): HarnessV1<typeof OPENCODE_BUILTIN_TOOLS> {
  if (
    settings.mcpServers != null &&
    Object.prototype.hasOwnProperty.call(settings.mcpServers, 'harness-tools')
  ) {
    throw new Error(
      'OpenCode MCP server name "harness-tools" is reserved for HarnessAgent tools.',
    );
  }
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'opencode',
    builtinTools: OPENCODE_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: true,
    lifecycleStateSchema: openCodeResumeStateSchema,
    getBootstrap: getOpenCodeBootstrap,
    doStart: async startOpts => {
      const configuredModel = settings.model;
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
          harnessId: 'opencode',
          message:
            'The OpenCode harness cannot use `mintBridgeToken` with a sandbox session that does not expose an id.',
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
              openCodeSessionId?: unknown;
              bridge?: OpenCodeBridgeCoords;
              sandboxCredentialEnvironment?: Record<string, string>;
            })
          : undefined;
      const resumeSessionId =
        typeof resumeData?.openCodeSessionId === 'string' &&
        resumeData.openCodeSessionId.length > 0
          ? resumeData.openCodeSessionId
          : undefined;
      const coords = resumeData?.bridge;
      const authenticationMode = resolveOpenCodeAuthenticationMode({
        auth: settings.auth,
        model: configuredModel,
        provider: settings.provider,
      });
      const resolvedAuthEnvironment = resolveOpenCodeEnv({
        auth: settings.auth,
        model: configuredModel,
        provider: settings.provider,
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
              OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          }));
        sandboxAuthEnvironment = {
          ...resolvedAuthEnvironment,
          ...sandboxCredentialEnvironment,
        };
        const requestTransformations = createOpenCodeRequestTransformations({
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
      const bootstrapDir = path.posix.resolve(
        defaultWorkingDirectory,
        BOOTSTRAP_DIR,
      );
      const workDir = startOpts.sessionWorkDir;
      const sandboxHomeDir = await resolveSandboxHomeDir({
        sandbox: toolSafeSandboxSession,
        abortSignal: startOpts.abortSignal,
      });
      const skillsDir = path.posix.join(sandboxHomeDir, '.agents', 'skills');
      const sessionDataDir = `${defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const timeoutMs = settings.startupTimeoutMs ?? 120_000;
      const model = splitOpenCodeModel(
        configuredModel,
        settings.provider,
      ).model;

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
        harnessId: 'opencode',
        sessionId: startOpts.sessionId,
      });

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
          let supportsUserMessageResponses = false;
          const attachChannel: OpenCodeChannel = new SandboxChannel({
            connect: () =>
              openWebSocket({
                endpoint: attachEndpoint,
                helloTimeoutMs: Math.min(timeoutMs, 5_000),
                onHello: supported => {
                  supportsUserMessageResponses = supported;
                },
              }),
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
            model,
            provider: settings.provider,
            reasoningVariant: settings.reasoningVariant,
            openCodeConfig: settings.openCodeConfig,
            mcpServers: settings.mcpServers,
            headers: startOpts.headers,
            openCodeSessionId: resumeSessionId,
            isResume: true,
            seedResumeSessionOnFirstPrompt: false,
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
            supportsUserMessageResponses: () => supportsUserMessageResponses,
          });
        } catch {}
      }

      let respawnStrategy: OpenCodeRespawnStrategy | undefined = isResume
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
      const forwardedAuthEnvironment = credentialsBrokered
        ? sandboxAuthEnvironment
        : await applyCredentialForwarding({
            environment: sandboxAuthEnvironment,
            credentialEnvironmentVariables:
              OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          });
      if (!credentialsBrokered) {
        warnCredentialBrokeringUnavailable({
          environment: resolvedAuthEnvironment,
          forwardedEnvironment: forwardedAuthEnvironment,
          credentialEnvironmentVariables:
            OPENCODE_CREDENTIAL_ENVIRONMENT_VARIABLES,
        });
      }
      const env = {
        ...forwardedAuthEnvironment,
        AI_SDK_HARNESS_CLIENT_APP: OPENCODE_CLIENT_APP,
        BRIDGE_CHANNEL_TOKEN: token,
        BRIDGE_WS_PORT: String(port),
        ...(respawnStrategy === 'replay'
          ? { BRIDGE_REPLAY_FROM_DISK: '1' }
          : {}),
      };

      if (respawnStrategy === undefined) {
        await toolSafeSandboxSession.run({
          command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
          abortSignal: startOpts.abortSignal,
        });
      }

      await markBridgeStarting({
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'opencode',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await toolSafeSandboxSession.spawn({
        command: `node ${shellQuote(`${bootstrapDir}/bridge.mjs`)} --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --bootstrap-dir ${shellQuote(bootstrapDir)} --skills-dir ${shellQuote(skillsDir)}`,
        env,
        abortSignal: startOpts.abortSignal,
      });
      const stderrTail: string[] = [];
      const bridgeStderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: 'opencode',
        collectTail: stderrTail,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'opencode',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'OpenCode bridge did not become ready in time.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'OpenCode bridge exited before becoming ready.',
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
      let supportsUserMessageResponses = false;

      const channel: OpenCodeChannel = new SandboxChannel({
        connect: () =>
          openWebSocket({
            endpoint: bridgeEndpoint,
            helloTimeoutMs: Math.min(timeoutMs, 5_000),
            onHello: supported => {
              supportsUserMessageResponses = supported;
            },
          }),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        onBridgeError,
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
        model,
        provider: settings.provider,
        reasoningVariant: settings.reasoningVariant,
        openCodeConfig: settings.openCodeConfig,
        mcpServers: settings.mcpServers,
        headers: startOpts.headers,
        openCodeSessionId: resumeSessionId,
        isResume: respawnStrategy !== undefined,
        seedResumeSessionOnFirstPrompt: respawnStrategy !== undefined,
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
    harnessId: 'opencode',
    message:
      'The OpenCode harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createOpenCode({ port })`.',
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
      harnessId: 'opencode',
      message:
        'The OpenCode harness requires an explicit `port` when using a basic sandbox session.',
    });
  }
  if (portEndpoint == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'opencode',
      message:
        'The OpenCode harness requires an explicit `portEndpoint` when using a basic sandbox session.',
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
    harnessId: 'opencode',
    message:
      'The OpenCode harness requires an explicit `portEndpoint` when using a basic sandbox session.',
  });
}

async function writeOpenCodeSkills({
  sandbox,
  skills,
  homeDir,
  abortSignal,
}: {
  sandbox: SandboxSession;
  skills: ReadonlyArray<HarnessV1Skill>;
  homeDir: string;
  abortSignal?: AbortSignal;
}): Promise<WriteSkillsResult> {
  const skillsDir = path.posix.join(homeDir, '.agents', 'skills');
  return writeHarnessSkills({
    sandbox,
    rootDir: skillsDir,
    skills,
    abortSignal,
    invalidSkillNameMessage: ({ name }) =>
      `Invalid OpenCode skill name: ${name}`,
    invalidSkillFilePathMessage: ({ skillName, filePath }) =>
      `Invalid OpenCode skill file path for ${skillName}: ${filePath}`,
  });
}

function openWebSocket({
  endpoint,
  helloTimeoutMs,
  onHello,
}: {
  endpoint: HarnessV1PortEndpoint;
  helloTimeoutMs: number;
  onHello(supportsUserMessageResponses: boolean): void;
}): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint.url, {
      headers: endpoint.headers == null ? undefined : { ...endpoint.headers },
    });
    let opened = false;
    let receivedHello = false;
    let settled = false;
    const cleanup = () => {
      clearTimeout(helloTimer);
      ws.off('open', onOpen);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    };
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error == null) {
        resolve(ws);
      } else {
        reject(error);
      }
    };
    const tryResolve = () => {
      if (opened && receivedHello) settle();
    };
    const onOpen = () => {
      opened = true;
      tryResolve();
    };
    const onMessage = (raw: unknown) => {
      void (async () => {
        const parsed = await safeParseJSON({
          text: webSocketMessageToString(raw),
        });
        if (!parsed.success) return;
        const value = parsed.value;
        if (
          typeof value !== 'object' ||
          value == null ||
          Array.isArray(value) ||
          (value as { type?: unknown }).type !== 'bridge-hello'
        ) {
          return;
        }
        const capabilities = (
          value as {
            capabilities?: { experimental_userMessageResponses?: unknown };
          }
        ).capabilities;
        onHello(capabilities?.experimental_userMessageResponses === true);
        receivedHello = true;
        tryResolve();
      })();
    };
    const onClose = () =>
      settle(new Error('OpenCode bridge closed before sending bridge-hello.'));
    const onError = (err: Error) => {
      settle(err);
    };
    ws.on('open', onOpen);
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
    const helloTimer = setTimeout(
      () =>
        settle(
          new Error(
            `OpenCode bridge did not send bridge-hello within ${helloTimeoutMs}ms.`,
          ),
        ),
      helloTimeoutMs,
    );
    helloTimer.unref?.();
  });
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

function createSession({
  sessionId,
  channel,
  proc,
  model,
  provider,
  reasoningVariant,
  openCodeConfig,
  mcpServers,
  headers,
  openCodeSessionId,
  isResume,
  seedResumeSessionOnFirstPrompt,
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
  supportsUserMessageResponses,
}: {
  sessionId: string;
  channel: OpenCodeChannel;
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  provider: string | undefined;
  reasoningVariant: string | undefined;
  openCodeConfig: Record<string, unknown> | undefined;
  mcpServers: Record<string, unknown> | undefined;
  headers: Readonly<Record<string, string>> | undefined;
  openCodeSessionId: string | undefined;
  isResume: boolean;
  seedResumeSessionOnFirstPrompt: boolean;
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
  supportsUserMessageResponses: () => boolean;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  let latestOpenCodeSessionId = openCodeSessionId;
  let pendingResumeSessionId = seedResumeSessionOnFirstPrompt
    ? openCodeSessionId
    : undefined;
  let selectedModel = model;
  let activeTurn = false;
  const pendingCompactionParts: HarnessV1StreamPart[] = [];

  channel.on('bridge-thread', msg => {
    latestOpenCodeSessionId = msg.threadId;
  });
  const wireTurn = (turnOpts: {
    emit: (event: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
  }): HarnessV1PromptControl => {
    activeTurn = true;
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
      'compaction',
      'raw',
    ] as const;
    let isSettled = false;
    const settleSuccess = () => {
      if (isSettled) return;
      isSettled = true;
      activeTurn = false;
      userMessageSubmitter?.close();
      for (const u of unsubs) u();
      pendingResolve!();
    };
    const settleError = (err: unknown) => {
      if (isSettled) return;
      isSettled = true;
      activeTurn = false;
      userMessageSubmitter?.close(err);
      for (const u of unsubs) u();
      pendingReject!(err);
    };

    for (const type of eventTypes) {
      unsubs.push(
        channel.on(type, msg => {
          forward(msg);
        }),
      );
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

    const onClose = (_code?: number, reason?: string) => {
      if (isSettled) return;
      if (reason === 'suspended') {
        settleSuccess();
        return;
      }
      settleError(
        new Error('OpenCode bridge closed before the turn finished.'),
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

    while (pendingCompactionParts.length > 0) {
      forward(pendingCompactionParts.shift()!);
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

  const startBase = (turnModel: string | undefined) => ({
    model: turnModel,
    provider,
    ...(reasoningVariant ? { variant: reasoningVariant } : {}),
    ...(openCodeConfig == null ? {} : { openCodeConfig }),
    ...(mcpServers == null ? {} : { mcpServers }),
    ...(headers == null ? {} : { headers }),
    ...(permissionMode ? { permissionMode } : {}),
    ...(builtinToolFiltering ? { builtinToolFiltering } : {}),
    ...(pendingResumeSessionId
      ? { resumeSessionId: pendingResumeSessionId }
      : latestOpenCodeSessionId
        ? { resumeSessionId: latestOpenCodeSessionId }
        : {}),
    ...(debug ? { debug } : {}),
  });

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
            "Harness 'opencode' requires a JSON schema for structured output.",
          harnessId: 'opencode',
        });
      }
      const skillWriteResult = await writeOpenCodeSkills({
        sandbox,
        skills: promptOpts.skills,
        homeDir: sandboxHomeDir,
        abortSignal: promptOpts.abortSignal,
      });
      const control = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });
      const turnModel = promptOpts.model ?? selectedModel;
      if (turnModel) selectedModel = turnModel;
      channel.send({
        type: 'start',
        operation: 'prompt',
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
        skillsChanged: skillWriteResult.changed,
        ...startBase(turnModel),
      });
      pendingResumeSessionId = undefined;
      return control;
    },
    doContinueTurn: async continueOpts => {
      if (
        continueOpts.responseFormat?.type === 'json' &&
        continueOpts.responseFormat.schema == null
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'opencode' requires a JSON schema for structured output.",
          harnessId: 'opencode',
        });
      }
      const skillWriteResult = await writeOpenCodeSkills({
        sandbox,
        skills: continueOpts.skills,
        homeDir: sandboxHomeDir,
        abortSignal: continueOpts.abortSignal,
      });
      const control = wireTurn({
        emit: continueOpts.emit,
        abortSignal: continueOpts.abortSignal,
      });
      if (rerunContinue) {
        const turnModel = continueOpts.model ?? selectedModel;
        if (turnModel) selectedModel = turnModel;
        channel.send({
          type: 'start',
          operation: 'prompt',
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
          skillsChanged: skillWriteResult.changed,
          ...startBase(turnModel),
        });
        pendingResumeSessionId = undefined;
      }
      return control;
    },
    doCompact: async (customInstructions?: string) => {
      if (customInstructions?.trim()) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'opencode',
          message:
            "Harness 'opencode' supports native manual compaction, but OpenCode does not expose custom compaction instructions through the supported API.",
        });
      }
      if (activeTurn) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'opencode',
          message:
            "Harness 'opencode' supports manual compaction between turns; compacting during an active turn is not supported by the bridge transport.",
        });
      }
      await runCompactOperation({
        channel,
        model: selectedModel,
        provider,
        permissionMode,
        debug,
        openCodeConfig,
        mcpServers,
        headers,
        resumeSessionId: latestOpenCodeSessionId,
        onCompaction: part => pendingCompactionParts.push(part),
      });
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `OpenCode session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'resume-session',
        harnessId: 'opencode',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestOpenCodeSessionId
            ? { openCodeSessionId: latestOpenCodeSessionId }
            : {}),
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
    },
    doDestroy: async () => {
      if (stopped) return stopPromise;
      stopped = true;
      stopPromise = (async () => {
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
          `OpenCode session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      channel.beginClose();
      const data: unknown = channel.isClosed()
        ? {}
        : await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              unsub();
              reject(
                new Error(
                  `OpenCode session ${sessionId} did not reply to stop within 5s.`,
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
        harnessId: 'opencode',
        specificationVersion: 'harness-v1',
        data: {
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
          `OpenCode session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ContinueTurnState = {
        type: 'continue-turn',
        harnessId: 'opencode',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestOpenCodeSessionId
            ? { openCodeSessionId: latestOpenCodeSessionId }
            : {}),
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
  };
}

async function runCompactOperation({
  channel,
  model,
  provider,
  permissionMode,
  debug,
  openCodeConfig,
  mcpServers,
  headers,
  resumeSessionId,
  onCompaction,
}: {
  channel: OpenCodeChannel;
  model: string | undefined;
  provider: string | undefined;
  permissionMode: HarnessV1PermissionMode | undefined;
  debug: HarnessV1DebugConfig | undefined;
  openCodeConfig: Record<string, unknown> | undefined;
  mcpServers: Record<string, unknown> | undefined;
  headers: Readonly<Record<string, string>> | undefined;
  resumeSessionId: string | undefined;
  onCompaction: (part: HarnessV1StreamPart) => void;
}): Promise<void> {
  let pendingResolve: (() => void) | undefined;
  let pendingReject: ((err: unknown) => void) | undefined;
  const done = new Promise<void>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  });
  const unsubs = [
    channel.on('compaction', msg => onCompaction(msg)),
    channel.on('finish', () => {
      for (const u of unsubs) u();
      pendingResolve!();
    }),
    channel.on('error', msg => {
      for (const u of unsubs) u();
      pendingReject!(msg.error);
    }),
  ];
  channel.send({
    type: 'start',
    operation: 'compact',
    prompt: '',
    tools: [],
    model,
    provider,
    ...(openCodeConfig == null ? {} : { openCodeConfig }),
    ...(mcpServers == null ? {} : { mcpServers }),
    ...(headers == null ? {} : { headers }),
    ...(permissionMode ? { permissionMode } : {}),
    ...(resumeSessionId ? { resumeSessionId } : {}),
    ...(debug ? { debug } : {}),
  });
  await done;
}

function extractUserText(prompt: HarnessV1Prompt): string {
  if (typeof prompt === 'string') return prompt;
  const { content } = prompt;
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const part of content) {
    if (part.type !== 'text') {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: 'opencode',
        message: `The OpenCode harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
