import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  commonTool,
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1DebugConfig,
  type HarnessV1BuiltinTool,
  type HarnessV1ContinueTurnState,
  type HarnessV1CredentialForwarding,
  type HarnessV1Prompt,
  type HarnessV1PromptControl,
  type HarnessV1PortEndpoint,
  type HarnessV1ResumeSessionState,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PermissionMode,
  type HarnessV1Session,
  type HarnessV1Skill,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import {
  applyCredentialForwarding,
  classifyDiskLog,
  createBridgeToken,
  createSandboxCredentialEnvironment,
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
  type Experimental_SandboxProcess,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { z } from 'zod/v4';
import {
  CODEX_BOOTSTRAP_DIR as BOOTSTRAP_DIR,
  getCodexBootstrap,
} from './codex-bootstrap';
import {
  CODEX_CREDENTIAL_ENVIRONMENT_VARIABLES,
  createCodexRequestTransformations,
  DEFAULT_OPENAI_BASE_URL,
  resolveCodexAuthenticationMode,
  resolveCodexEnv,
  type CodexAuthenticationMode,
} from './codex-auth';
import {
  outboundMessageSchema,
  type InboundMessage,
  type OutboundMessage,
} from './codex-bridge-protocol';
import { CLI_SHIM_FILENAME } from './bridge/cli-relay';
import { VERSION } from './version';

type CodexChannel = SandboxChannel<OutboundMessage, InboundMessage>;
type CodexRespawnStrategy = 'replay' | 'rerun';

/*
 * This intentionally is not the latest Codex model. Newer GPT-5.6 models use
 * Responses Lite, which does not expose their code-mode tools as callable
 * through the custom model provider used by the harness. Keep GPT-5.5 as the
 * default until the upstream bug is resolved:
 * https://github.com/openai/codex/issues/31894
 *
 * Passing the model explicitly keeps the runtime behavior deterministic and
 * the telemetry (`gen_ai.request.model`) accurate.
 */
const DEFAULT_CODEX_MODEL = 'gpt-5.5';

/**
 * Value to use in User-Agent and `x-client-app` headers.
 */
const CODEX_CLIENT_APP = `ai-sdk/harness-codex/${VERSION}`;

export type CodexHarnessSettings = {
  readonly auth?: CodexAuthenticationMode;
  /**
   * Customizes each credential value before it is forwarded into a sandbox
   * process. This does not restrict which credentials the harness adapter can
   * discover, read, or otherwise access in the host process.
   */
  readonly credentialForwarding?: HarnessV1CredentialForwarding;
  /**
   * Additional configuration passed through to Codex as-is. Codex config keys
   * typically use snake_case and must be provided in that form. Values managed
   * by this adapter take precedence over conflicting entries.
   */
  readonly codexConfig?: Record<string, unknown>;
  /**
   * MCP server definitions keyed by server name. Each definition uses the
   * underlying runtime's native MCP server configuration format.
   */
  readonly mcpServers?: Record<string, unknown>;
  /**
   * OpenAI model id the underlying `codex` CLI should use. Leaving this unset
   * pins the adapter default (`DEFAULT_CODEX_MODEL`).
   *
   * @deprecated Use `model` on `HarnessAgent` instead.
   */
  readonly model?: string;
  /**
   * Reasoning effort for reasoning-capable models. Leaving this unset
   * defers to the CLI's default.
   */
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /**
   * When `true`, allow the underlying runtime to use live web search.
   */
  readonly webSearch?: boolean;
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
 * Every native tool the Codex CLI can invoke as a model-callable tool,
 * declared as a `ToolSet` keyed by what the bridge emits as `toolName` on
 * the wire (`commonName ?? nativeName`). Schemas reflect the `ThreadItem`
 * union in `@openai/codex-sdk`'s `dist/index.d.ts`.
 *
 * Codex's other native operations (`apply_patch`, todo planning) surface
 * only as side-effect events (`file_change`, `todo_list`) and are not
 * model-callable tools — they don't appear here.
 */
const CODEX_BUILTIN_TOOLS = {
  bash: commonTool('bash', {
    nativeName: 'shell',
    toolUseKind: 'bash',
    description: 'Execute a shell command',
    inputSchema: z.object({ command: z.string() }),
  }),
  webSearch: commonTool('webSearch', {
    nativeName: 'web_search',
    toolUseKind: 'readonly',
    description: 'Search the web',
    inputSchema: z.object({ query: z.string() }),
  }),
} as const satisfies Record<string, HarnessV1BuiltinTool<any, any>>;

/**
 * Live bridge coordinates returned by `doDetach()` and `doSuspendTurn()`. A
 * future process uses them to reopen a socket to the still-running bridge
 * (`attach`) instead of re-spawning it. Absent on a `doStop()` payload.
 */
const codexBridgeCoordsSchema = z.object({
  port: z.number(),
  token: z.string(),
  lastSeenEventId: z.number(),
  sandboxId: z.string().optional(),
});

/**
 * Schema for the adapter-specific lifecycle `data` payload Codex produces.
 * `threadId` is what `codex.resumeThread(...)` requires for the replay/rerun
 * rungs; the sandbox lookup is handled separately via
 * `provider.resumeSession({ sessionId })`. `bridge` carries live coordinates
 * for cross-process `attach` (present on `doDetach()` and `doSuspendTurn()`
 * payloads).
 */
const codexResumeStateSchema = z.object({
  threadId: z.string().optional(),
  turnConfigurationFingerprint: z.string().optional(),
  bridge: codexBridgeCoordsSchema.optional(),
  sandboxCredentialEnvironment: z.record(z.string(), z.string()).optional(),
});

type CodexBridgeCoords = z.infer<typeof codexBridgeCoordsSchema>;

export function createCodex(
  settings: CodexHarnessSettings = {},
): HarnessV1<typeof CODEX_BUILTIN_TOOLS> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'codex',
    builtinTools: CODEX_BUILTIN_TOOLS,
    supportsBuiltinToolApprovals: false,
    lifecycleStateSchema: codexResumeStateSchema,
    getBootstrap: getCodexBootstrap,
    doStart: async startOpts => {
      const model = settings.model ?? DEFAULT_CODEX_MODEL;
      if (startOpts.builtinToolFiltering != null) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'codex' does not support built-in tool filtering controls.",
          harnessId: 'codex',
        });
      }
      if (
        startOpts.permissionMode != null &&
        startOpts.permissionMode !== 'allow-all'
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'codex' does not support built-in tool approval requests; use permissionMode: 'allow-all'.",
          harnessId: 'codex',
        });
      }
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
          harnessId: 'codex',
          message:
            'The codex harness cannot use `mintBridgeToken` with a sandbox session that does not expose an id.',
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
              threadId?: unknown;
              turnConfigurationFingerprint?: unknown;
              bridge?: CodexBridgeCoords;
              sandboxCredentialEnvironment?: Record<string, string>;
            })
          : undefined;
      const resumeThreadId = resumeData?.threadId;
      const resumeThreadIdString =
        typeof resumeThreadId === 'string' && resumeThreadId.length > 0
          ? resumeThreadId
          : undefined;
      const turnConfigurationFingerprint =
        typeof resumeData?.turnConfigurationFingerprint === 'string'
          ? resumeData.turnConfigurationFingerprint
          : undefined;
      const coords = resumeData?.bridge;
      const authenticationMode = resolveCodexAuthenticationMode(settings.auth);
      const resolvedAuthEnvironment = resolveCodexEnv(settings.auth);
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
              CODEX_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          }));
        sandboxAuthEnvironment = {
          ...resolvedAuthEnvironment,
          ...sandboxCredentialEnvironment,
        };
        const requestTransformations = createCodexRequestTransformations({
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
        if (
          requestTransformations.length > 0 &&
          authenticationMode === 'direct' &&
          resolvedAuthEnvironment.OPENAI_BASE_URL == null
        ) {
          /*
           * Vercel Sandbox request transformations apply only to HTTP traffic.
           * Materializing Codex's standard OpenAI URL makes the bridge select
           * its custom provider, where WebSockets are disabled, while keeping
           * the non-brokered path on Codex's built-in OpenAI provider.
           */
          sandboxAuthEnvironment.OPENAI_BASE_URL = DEFAULT_OPENAI_BASE_URL;
        }
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
      const sessionDataDir = `${defaultWorkingDirectory}/.agent-runs/${startOpts.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const cliShimDir = `${sessionDataDir}/codex`;
      const cliShimPath = `${cliShimDir}/${CLI_SHIM_FILENAME}`;
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
        harnessId: 'codex',
        sessionId: startOpts.sessionId,
      });

      /*
       * Rung 1 — ATTACH. With live coordinates, reopen a socket to the
       * still-running bridge. Parked between-turn sessions just attach and wait
       * for the next `start`; suspended in-flight turns request replay of
       * everything past the persisted cursor. No spawn, no fresh token. If the
       * bridge is gone the open throws and we fall through to a spawn-based
       * recovery.
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
          const attachChannel: CodexChannel = new SandboxChannel({
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
            cliShimPath,
            // The live bridge was spawned by another process; no process handle.
            proc: undefined,
            model,
            reasoningEffort: settings.reasoningEffort,
            webSearch: settings.webSearch,
            codexConfig: settings.codexConfig,
            mcpServers: settings.mcpServers,
            headers: startOpts.headers,
            resumeThreadId: resumeThreadIdString,
            isResume: true,
            seedResumeThreadOnFirstPrompt: false,
            rerunContinue: false,
            bridgePort: coords.port,
            bridgeToken: coords.token,
            sandboxId,
            sandboxCredentialEnvironment,
            debug: startOpts.observability?.debug,
            permissionMode: startOpts.permissionMode,
            sandbox: toolSafeSandboxSession,
            sandboxHomeDir,
            turnConfigurationFingerprint,
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
       * via `codex.resumeThread(threadId)` when attach is unavailable.
       */
      let respawnStrategy: CodexRespawnStrategy | undefined = isResume
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
              CODEX_CREDENTIAL_ENVIRONMENT_VARIABLES,
            credentialForwarding: settings.credentialForwarding,
          });
      if (!credentialsBrokered) {
        warnCredentialBrokeringUnavailable({
          environment: resolvedAuthEnvironment,
          forwardedEnvironment: forwardedAuthEnvironment,
          credentialEnvironmentVariables:
            CODEX_CREDENTIAL_ENVIRONMENT_VARIABLES,
        });
      }
      const env = {
        ...forwardedAuthEnvironment,
        AI_SDK_HARNESS_CLIENT_APP: CODEX_CLIENT_APP,
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
        bridgeType: 'codex',
        abortSignal: startOpts.abortSignal,
      });

      const proc = await toolSafeSandboxSession.spawn({
        command: `node ${shellQuote(`${bootstrapDir}/bridge.mjs`)} --workdir ${shellQuote(workDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --cli-shim-dir ${shellQuote(cliShimDir)}`,
        env,
        abortSignal: startOpts.abortSignal,
      });
      const stderrTail: string[] = [];
      const bridgeStderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: 'codex',
        collectTail: stderrTail,
      });

      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: 'codex',
        timeoutMs,
        abortSignal: startOpts.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'codex bridge did not become ready in time.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'codex bridge exited before becoming ready.',
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

      const channel: CodexChannel = new SandboxChannel({
        connect: () => openWebSocket(bridgeEndpoint),
        outboundSchema: outboundMessageSchema,
        onDiagnostic,
        onBridgeError,
        // In replay mode the respawned bridge reloaded the finished turn from
        // disk; seed the cursor and resume so it streams the tail (incl.
        // `finish`).
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
        cliShimPath,
        proc,
        model,
        reasoningEffort: settings.reasoningEffort,
        webSearch: settings.webSearch,
        codexConfig: settings.codexConfig,
        mcpServers: settings.mcpServers,
        headers: startOpts.headers,
        resumeThreadId: resumeThreadIdString,
        isResume: respawnStrategy !== undefined,
        seedResumeThreadOnFirstPrompt: respawnStrategy !== undefined,
        rerunContinue: respawnStrategy === 'rerun',
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
        sandboxCredentialEnvironment,
        debug: startOpts.observability?.debug,
        permissionMode: startOpts.permissionMode,
        sandbox: toolSafeSandboxSession,
        sandboxHomeDir,
        turnConfigurationFingerprint,
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
    harnessId: 'codex',
    message:
      'The codex harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or pass `createCodex({ port })`.',
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
      harnessId: 'codex',
      message:
        'The codex harness requires an explicit `port` when using a basic sandbox session.',
    });
  }
  if (portEndpoint == null) {
    throw new HarnessCapabilityUnsupportedError({
      harnessId: 'codex',
      message:
        'The codex harness requires an explicit `portEndpoint` when using a basic sandbox session.',
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
    harnessId: 'codex',
    message:
      'The codex harness requires an explicit `portEndpoint` when using a basic sandbox session.',
  });
}

async function writeCodexSkills({
  sandbox,
  sandboxHomeDir,
  skills,
  abortSignal,
}: {
  sandbox: SandboxSession;
  sandboxHomeDir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<WriteSkillsResult> {
  const rootDir = path.posix.join(sandboxHomeDir, '.agents', 'skills');
  return writeHarnessSkills({
    sandbox,
    rootDir,
    skills,
    abortSignal,
    invalidSkillNameMessage: ({ name }) => `Invalid Codex skill name: ${name}`,
    invalidSkillFilePathMessage: ({ skillName, filePath }) =>
      `Invalid Codex skill file path for ${skillName}: ${filePath}`,
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
  cliShimPath,
  proc,
  model,
  reasoningEffort,
  webSearch,
  codexConfig,
  mcpServers,
  headers,
  resumeThreadId,
  isResume,
  seedResumeThreadOnFirstPrompt,
  rerunContinue,
  bridgePort,
  bridgeToken,
  sandboxId,
  sandboxCredentialEnvironment,
  debug,
  permissionMode,
  sandbox,
  sandboxHomeDir,
  turnConfigurationFingerprint,
}: {
  sessionId: string;
  channel: CodexChannel;
  cliShimPath: string;
  /** Undefined on `attach` — the live bridge was spawned by another process. */
  proc: Experimental_SandboxProcess | undefined;
  model: string | undefined;
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  webSearch: boolean | undefined;
  codexConfig: Record<string, unknown> | undefined;
  mcpServers: Record<string, unknown> | undefined;
  headers: Readonly<Record<string, string>> | undefined;
  resumeThreadId: string | undefined;
  isResume: boolean;
  seedResumeThreadOnFirstPrompt: boolean;
  rerunContinue: boolean;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string | undefined;
  sandboxCredentialEnvironment: Record<string, string> | undefined;
  debug: HarnessV1DebugConfig | undefined;
  permissionMode: HarnessV1PermissionMode | undefined;
  sandbox: SandboxSession;
  sandboxHomeDir: string;
  turnConfigurationFingerprint: string | undefined;
}): HarnessV1Session {
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  /*
   * Send the persisted threadId on the first prompt only when the bridge was
   * respawned (rerun/replay) so it takes the `codex.resumeThread(...)` branch.
   * An `attach`ed bridge already holds its threadState in memory and continues
   * on its own, so it needs no seed.
   */
  let pendingResumeThreadId = seedResumeThreadOnFirstPrompt
    ? resumeThreadId
    : undefined;
  /*
   * Host-tool relay guidance is prepended to the first user message of a fresh
   * session only. A resumed session (attach/replay/rerun) already carried it in
   * its original first message (preserved in the persisted thread), so it
   * starts "applied".
   */
  let initialPromptGuidanceApplied = isResume;

  /*
   * Latest codex thread id, cached from the bridge's `bridge-thread`
   * announcements. Seeded from lifecycle state so `doDetach()` and `doStop()`
   * can include a thread id even before this process has run a turn.
   */
  let latestThreadId = resumeThreadId;
  let latestTurnConfigurationFingerprint = turnConfigurationFingerprint;
  channel.on('bridge-thread', msg => {
    latestThreadId = msg.threadId;
  });

  const synchronizeTurnConfiguration = async ({
    skills,
    instructions,
    tools,
    abortSignal,
  }: {
    skills: ReadonlyArray<HarnessV1Skill>;
    instructions: string | undefined;
    tools: ReadonlyArray<{
      name: string;
      description?: string;
      inputSchema: unknown;
    }>;
    abortSignal?: AbortSignal;
  }): Promise<{ restartThread: boolean }> => {
    const skillsResult = await writeCodexSkills({
      sandbox,
      sandboxHomeDir,
      skills,
      abortSignal,
    });
    const nextFingerprint = fingerprintCodexTurnConfiguration({
      instructions,
      tools,
    });
    const restartThread =
      latestThreadId != null &&
      (skillsResult.changed ||
        (latestTurnConfigurationFingerprint != null &&
          latestTurnConfigurationFingerprint !== nextFingerprint));
    latestTurnConfigurationFingerprint = nextFingerprint;
    if (restartThread) {
      /*
       * `codex exec resume` retains the native thread's original developer
       * instructions and skill catalog. A fresh native thread is therefore
       * required for replacement semantics. Host-tool guidance is framed
       * again because that guidance also belongs to the new native thread.
       */
      initialPromptGuidanceApplied = false;
      pendingResumeThreadId = undefined;
    }
    return { restartThread };
  };

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
  }): {
    control: HarnessV1PromptControl;
    sendStart: (send: () => void) => void;
  } => {
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
      settleError(new Error('codex bridge closed before the turn finished.'));
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

    const control: HarnessV1PromptControl = {
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
          reason: input.reason,
        });
      },
      done,
    };

    return {
      control,
      sendStart: send => {
        /*
         * Codex can complete short turns without using tools. Deferring the
         * start frame gives the harness runner one event-loop turn to finish
         * wiring the prompt control and stream output before Codex can settle.
         */
        const timer = setTimeout(() => {
          if (isSettled) return;
          try {
            send();
          } catch (err) {
            settleError(err);
          }
        }, 0);
        timer.unref?.();
      },
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
            "Harness 'codex' requires a JSON schema for structured output.",
          harnessId: 'codex',
        });
      }
      const tools = (promptOpts.tools ?? []).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      const { restartThread } = await synchronizeTurnConfiguration({
        skills: promptOpts.skills,
        instructions: promptOpts.instructions,
        tools,
        abortSignal: promptOpts.abortSignal,
      });
      const turn = wireTurn({
        emit: promptOpts.emit,
        abortSignal: promptOpts.abortSignal,
      });

      let promptText = extractUserText(promptOpts.prompt);
      if (!initialPromptGuidanceApplied) {
        promptText = frameInitialPromptGuidance({
          toolUsageBlock:
            tools.length > 0
              ? composeToolUsageInstructions({
                  tools,
                  cliShimPath,
                })
              : undefined,
          userText: promptText,
        });
      }
      initialPromptGuidanceApplied = true;

      const startMessage = {
        type: 'start' as const,
        prompt: promptText,
        tools,
        ...(promptOpts.responseFormat == null
          ? {}
          : { responseFormat: promptOpts.responseFormat }),
        ...(promptOpts.instructions
          ? { instructions: promptOpts.instructions }
          : {}),
        model: promptOpts.model ?? model,
        reasoningEffort,
        webSearch,
        ...(codexConfig == null ? {} : { codexConfig }),
        ...(mcpServers == null ? {} : { mcpServers }),
        ...(headers == null ? {} : { headers }),
        ...(permissionMode ? { permissionMode } : {}),
        ...(pendingResumeThreadId
          ? { resumeThreadId: pendingResumeThreadId }
          : {}),
        ...(restartThread ? { restartThread: true } : {}),
        ...(debug ? { debug } : {}),
      };
      pendingResumeThreadId = undefined;
      turn.sendStart(() => channel.send(startMessage));

      return turn.control;
    },
    doContinueTurn: async continueOpts => {
      if (
        continueOpts.responseFormat?.type === 'json' &&
        continueOpts.responseFormat.schema == null
      ) {
        throw new HarnessCapabilityUnsupportedError({
          message:
            "Harness 'codex' requires a JSON schema for structured output.",
          harnessId: 'codex',
        });
      }
      const tools = (continueOpts.tools ?? []).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      const { restartThread } = await synchronizeTurnConfiguration({
        skills: continueOpts.skills,
        instructions: continueOpts.instructions,
        tools,
        abortSignal: continueOpts.abortSignal,
      });
      const turn = wireTurn({
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
       * re-drive codex's own thread via `resumeThreadId`. Lossy — work in flight
       * at the suspension is recomputed. This is the rare bridge-died
       * fallback; the common slice path is `attach`.
       */
      if (rerunContinue) {
        const threadId = pendingResumeThreadId ?? latestThreadId;
        pendingResumeThreadId = undefined;
        turn.sendStart(() =>
          channel.send({
            type: 'start' as const,
            /*
             * A continuation nudge rather than an empty prompt: `resumeThreadId`
             * rehydrates the prior thread, and this is the new user turn that
             * drives it forward. Keeping it non-empty avoids handing the runtime
             * an empty user message (and mirrors the claude-code adapter, where an
             * empty text block trips the Anthropic API's `cache_control` rule).
             */
            prompt: 'Continue.',
            tools,
            ...(continueOpts.responseFormat == null
              ? {}
              : { responseFormat: continueOpts.responseFormat }),
            ...(continueOpts.instructions
              ? { instructions: continueOpts.instructions }
              : {}),
            model: continueOpts.model ?? model,
            reasoningEffort,
            webSearch,
            ...(codexConfig == null ? {} : { codexConfig }),
            ...(mcpServers == null ? {} : { mcpServers }),
            ...(headers == null ? {} : { headers }),
            ...(permissionMode ? { permissionMode } : {}),
            ...(threadId ? { resumeThreadId: threadId } : {}),
            ...(restartThread ? { restartThread: true } : {}),
            ...(debug ? { debug } : {}),
          }),
        );
      }

      return turn.control;
    },
    doCompact: async () => {
      /*
       * Codex compacts its context automatically inside the core turn loop
       * (~90% of the model context window), but the `codex exec` transport this
       * adapter drives exposes no manual compaction trigger and emits no
       * compaction event. Manual `compact()` is therefore unsupported; Codex's
       * own auto-compaction continues to run regardless.
       */
      throw new HarnessCapabilityUnsupportedError({
        message:
          "Harness 'codex' does not support manual compaction; Codex auto-compacts its context internally.",
        harnessId: 'codex',
      });
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `codex session ${sessionId} is already stopped; cannot detach.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      const payload: HarnessV1ResumeSessionState = {
        type: 'resume-session',
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestThreadId ? { threadId: latestThreadId } : {}),
          ...(latestTurnConfigurationFingerprint
            ? {
                turnConfigurationFingerprint:
                  latestTurnConfigurationFingerprint,
              }
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
          `codex session ${sessionId} is already stopped; cannot stop.`,
        );
      }
      stopped = true;
      /*
       * If the bridge's channel already closed (e.g. mid-turn WS drop)
       * there is no one to acknowledge a `stop` message. Synthesize an empty
       * payload — the workdir is still captured by the sandbox snapshot
       * during the subsequent `sandboxSession.stop()`, so the next turn can
       * resume the filesystem state. The trade-off: we lose
       * `threadId`, so the codex CLI starts a fresh thread on the
       * preserved workdir rather than resuming the prior conversation
       * inside Codex's runtime. Ability to continue beats throwing.
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
                  `codex session ${sessionId} did not reply to stop within 5s.`,
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
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          ...lifecycleData,
          ...(latestTurnConfigurationFingerprint
            ? {
                turnConfigurationFingerprint:
                  latestTurnConfigurationFingerprint,
              }
            : {}),
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
          `codex session ${sessionId} is stopped; cannot suspend.`,
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
        harnessId: 'codex',
        specificationVersion: 'harness-v1',
        data: {
          ...(latestThreadId ? { threadId: latestThreadId } : {}),
          ...(latestTurnConfigurationFingerprint
            ? {
                turnConfigurationFingerprint:
                  latestTurnConfigurationFingerprint,
              }
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

function fingerprintCodexTurnConfiguration({
  instructions,
  tools,
}: {
  instructions: string | undefined;
  tools: ReadonlyArray<{
    name: string;
    description?: string;
    inputSchema: unknown;
  }>;
}): string {
  return createHash('sha256')
    .update(JSON.stringify({ instructions: instructions ?? null, tools }))
    .digest('hex');
}

/*
 * Frame host-tool relay guidance and the user's text so Codex treats the
 * prepended block as operating guidance rather than user prose. Applied only
 * to the first user message of a fresh session.
 */
function frameInitialPromptGuidance({
  toolUsageBlock,
  userText,
}: {
  toolUsageBlock: string | undefined;
  userText: string;
}): string {
  const blocks: string[] = [];
  if (toolUsageBlock) blocks.push(toolUsageBlock);
  if (blocks.length === 0) return userText;
  return `${blocks.join('\n\n')}\n\n<user-message>\n${userText}\n</user-message>`;
}

function composeToolUsageInstructions({
  tools,
  cliShimPath,
}: {
  tools: ReadonlyArray<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  cliShimPath: string;
}): string {
  const lines: string[] = [
    '<host-tool-instructions>',
    'You have access to the following host-provided tools. To use one, run the following command via your built-in `bash` tool:',
    '',
    `  node ${cliShimPath} <toolName> '<jsonInput>'`,
    '',
    'The script prints the JSON result to stdout. Do not invent another way to call these tools — only this CLI invocation will work. Pass the JSON input as a single-quoted argument.',
    'For every user request that depends on a host-provided tool, run a separate CLI invocation for each needed tool call in the current turn before answering. Do not reuse previous tool results, and do not say you used a host tool unless the command has completed in the current turn.',
    '',
  ];
  for (const toolSpec of tools) {
    lines.push(
      `- **${toolSpec.name}**${toolSpec.description ? ': ' + toolSpec.description : ''}`,
    );
    lines.push(
      `  - Input schema: \`${JSON.stringify(toolSpec.inputSchema ?? {})}\``,
    );
  }
  lines.push('</host-tool-instructions>');
  return lines.join('\n');
}

/*
 * Reduce a `HarnessV1Prompt` to the plain user text the bridge forwards
 * to the Codex SDK. File and image parts on the message are not yet
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
        harnessId: 'codex',
        message: `The codex harness does not yet support user message parts of type '${part.type}'. Pass a string or a user message whose content contains only text parts.`,
      });
    }
    parts.push(part.text);
  }
  return parts.join('\n\n');
}
