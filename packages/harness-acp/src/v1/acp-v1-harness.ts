import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1Bootstrap,
  type HarnessV1DebugConfig,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptControl,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import {
  createBridgeErrorHandler,
  createBridgeStartupError,
  classifyDiskLog,
  drainBridgeProcessStream,
  forwardBridgeProcessStream,
  markBridgeStarting,
  resolveSandboxHomeDir,
  SandboxChannel,
  shellQuote,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import {
  type Experimental_SandboxProcess,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import {
  resolveACPProviderAuthentication,
  type ACPAuthenticationProfileIdentity,
  type ACPClientApp,
  type ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import {
  createImplementationDescriptor,
  createImplementationInstallCommand,
  createImplementationManifest,
  getImplementationLockfile,
  resolveImplementationEnvironment,
  validateACPV1Settings,
} from './acquisition';
import {
  outboundMessageSchema,
  type ACPColdSessionState,
  type ACPRecoveryStart,
  type InboundMessage,
  type OutboundMessage,
  type StartMessage,
} from './acp-v1-bridge-protocol';
import { createACPBridgeEnvironment } from './acp-v1-bridge-environment';
import {
  createACPColdSessionState,
  createACPRecoveryStart,
} from './acp-v1-recovery';
import {
  resolveACPInitialGuidanceApplied,
  shouldMaterializeACPSkills,
  validateACPLifecycleCompatibility,
  type ACPLifecycleData,
} from './acp-v1-lifecycle';
import {
  convertHarnessPromptToACPTextBlocks,
  prependACPInitialGuidance,
  type ACPSkillCatalogEntry,
} from './acp-v1-prompt';
import type {
  ACPPermissionModeMapping,
  ACPPermissionModeTarget,
  ACPSerializableValue,
  ACPV1Settings,
} from './acp-v1-settings';
import {
  createACPSkillsFingerprint,
  materializeACPSkills,
  resolveACPPrivateSessionDirectory,
} from './acp-v1-skills';

type ACPChannel = SandboxChannel<OutboundMessage, InboundMessage>;

type ACPRespawnStrategy =
  | {
      readonly mode: 'disk-replay';
      readonly reason: string;
      readonly afterSeq: number;
    }
  | {
      readonly mode: 'lossy-rerun';
      readonly reason: string;
      readonly recoveryStart: ACPRecoveryStart;
      readonly acpSessionId: string;
    }
  | {
      readonly mode: 'cold-restore';
      readonly recoveryStart: ACPRecoveryStart;
      readonly acpSessionId: string;
    };

export function createACPV1<TBuiltinTools extends ToolSet = {}>({
  settings,
  builtinTools,
  port: portOverride,
  startupTimeoutMs,
  clientApp,
  implementationIdentity,
  authenticationProfile,
  providerAuthenticationCompatibility,
  lifecycleStateSchema,
}: {
  settings: ACPV1Settings;
  builtinTools: TBuiltinTools;
  port?: number;
  startupTimeoutMs?: number;
  clientApp: ACPClientApp;
  implementationIdentity: string;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
  lifecycleStateSchema: NonNullable<
    HarnessV1<TBuiltinTools>['lifecycleStateSchema']
  >;
}): HarnessV1<TBuiltinTools> {
  validateACPV1Settings({
    harnessId: settings.harnessId,
    implementation: settings.implementation,
  });

  const clientAppValue = `${clientApp.name}/${clientApp.version}`;

  const BOOTSTRAP_DIR = `.harness-bootstrap/${settings.harnessId}`;

  let cachedBootstrap: HarnessV1Bootstrap | undefined;
  const permissionModeMapping = isCompletePermissionModeMapping({
    value: settings.permissionModeMapping,
  })
    ? settings.permissionModeMapping
    : undefined;

  return {
    specificationVersion: 'harness-v1',
    harnessId: settings.harnessId,
    builtinTools,
    supportsBuiltinToolApprovals: true,
    supportsBuiltinToolFiltering: false,
    lifecycleStateSchema,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [bridgePackage, bridgeLock, bridge, hostToolMCP] =
        await Promise.all([
          readBridgeAsset({ name: 'package.json' }),
          readBridgeAsset({ name: 'pnpm-lock.yaml' }),
          readBridgeAsset({ name: 'index.mjs' }),
          readBridgeAsset({ name: 'host-tool-mcp.mjs' }),
        ]);
      const implementationLock = getImplementationLockfile({
        implementation: settings.implementation,
      });
      cachedBootstrap = {
        harnessId: settings.harnessId,
        bootstrapDir: BOOTSTRAP_DIR,
        files: [
          {
            path: `${BOOTSTRAP_DIR}/package.json`,
            content: bridgePackage,
          },
          {
            path: `${BOOTSTRAP_DIR}/pnpm-lock.yaml`,
            content: bridgeLock,
          },
          { path: `${BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
          {
            path: `${BOOTSTRAP_DIR}/host-tool-mcp.mjs`,
            content: hostToolMCP,
          },
          {
            path: `${BOOTSTRAP_DIR}/implementation/package.json`,
            content: createImplementationManifest({
              implementation: settings.implementation,
            }),
          },
          {
            path: `${BOOTSTRAP_DIR}/implementation/implementation.json`,
            content: createImplementationDescriptor({
              implementation: settings.implementation,
              implementationIdentity,
            }),
          },
          ...(implementationLock == null
            ? []
            : [
                {
                  path: `${BOOTSTRAP_DIR}/implementation/pnpm-lock.yaml`,
                  content: implementationLock,
                },
              ]),
        ],
        commands: [
          {
            command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
          },
          {
            command: createImplementationInstallCommand({
              implementationDir: 'implementation',
              storeDir: '../.pnpm-store',
              implementation: settings.implementation,
            }),
          },
        ],
      };
      return cachedBootstrap;
    },
    doStart: async startOptions => {
      if (startOptions.builtinToolFiltering != null) {
        throw unsupported({
          harnessId: settings.harnessId,
          message:
            'ACP built-in tool filtering is not available in this initial ACP v1 implementation.',
        });
      }
      const permissionMode = startOptions.permissionMode ?? 'allow-all';

      const resolvedProviderAuthentication = resolveACPProviderAuthentication({
        auth: {
          mode: settings.auth,
          providerAuthentication: settings.providerAuthentication,
          clientApp,
        },
        env: process.env,
        compatibility: providerAuthenticationCompatibility,
      });
      const sandboxSession = startOptions.sandboxSession;
      const sandbox = sandboxSession.restricted();
      const resolvedBridgeDir = posix.resolve(
        sandboxSession.defaultWorkingDirectory,
        BOOTSTRAP_DIR,
      );
      const resolvedImplementationDir = `${resolvedBridgeDir}/implementation`;
      const workDir = startOptions.sessionWorkDir;
      const sandboxHomeDir = await resolveSandboxHomeDir({
        sandbox,
        abortSignal: startOptions.abortSignal,
      });
      const privateSessionDir = resolveACPPrivateSessionDirectory({
        sandboxHomeDir,
        sessionWorkDir: workDir,
        harnessId: settings.harnessId,
        sessionId: startOptions.sessionId,
      });
      const bridgeStateDir = `${privateSessionDir}/bridge`;
      const continueFrom =
        startOptions.continueFrom ?? startOptions.resumeFrom?.continueFrom;
      const lifecycleState = continueFrom ?? startOptions.resumeFrom;
      const isContinue = continueFrom != null;
      const isResume = lifecycleState != null;
      const lifecycleData =
        lifecycleState != null
          ? (lifecycleState.data as unknown as ACPLifecycleData)
          : undefined;
      if (lifecycleData != null && lifecycleState != null) {
        validateACPLifecycleCompatibility({
          harnessId: settings.harnessId,
          lifecycleHarnessId: lifecycleState.harnessId,
          implementationIdentity,
          authenticationProfile,
          lifecycleData,
          sandboxId: sandboxSession.id,
        });
      }
      const skills = startOptions.skills ?? [];
      const skillsFingerprint = createACPSkillsFingerprint({ skills });
      const shouldMaterializeSkills = shouldMaterializeACPSkills({
        isResume,
        lifecycleState: lifecycleData,
        skillsFingerprint,
      });
      let skillCatalog: ReadonlyArray<ACPSkillCatalogEntry> = [];
      if (skills.length > 0) {
        skillCatalog = (
          await materializeACPSkills({
            sandbox,
            sandboxHomeDir,
            sessionWorkDir: workDir,
            harnessId: settings.harnessId,
            sessionId: startOptions.sessionId,
            skills,
            shouldMaterialize: shouldMaterializeSkills,
            abortSignal: startOptions.abortSignal,
          })
        ).catalog;
      }
      const report = startOptions.observability?.report;
      const onDiagnostic = report
        ? (frame: Parameters<typeof harnessV1DiagnosticFromBridgeFrame>[0]) =>
            report(
              harnessV1DiagnosticFromBridgeFrame(frame, {
                sessionId: startOptions.sessionId,
                timestamp: Date.now(),
              }),
            )
        : undefined;
      const onBridgeError = createBridgeErrorHandler({
        harnessId: settings.harnessId,
        sessionId: startOptions.sessionId,
      });
      const builtinToolCatalog = serializeBuiltinTools({ builtinTools });
      let respawnStrategy: ACPRespawnStrategy | undefined;

      if (isResume) {
        if (lifecycleData == null) {
          throw new Error('ACP lifecycle state data is missing.');
        }
        const coords = lifecycleData.bridge;
        if (coords == null && isContinue) {
          throw unsupported({
            harnessId: settings.harnessId,
            message:
              'ACP continuation state does not contain bridge coordinates required for replay or process-loss rerun.',
          });
        }
        if (coords != null) {
          try {
            const attachUrl =
              (await sandboxSession.getPortUrl({
                port: coords.port,
                protocol: 'ws',
              })) + `?agent_bridge_token=${encodeURIComponent(coords.token)}`;
            const attachChannel: ACPChannel = new SandboxChannel({
              connect: () => openWebSocket({ url: attachUrl }),
              outboundSchema: outboundMessageSchema,
              initialLastSeenEventId: coords.lastSeenEventId,
              onDiagnostic,
              onBridgeError,
            });
            await attachChannel.open(isContinue ? { resume: true } : undefined);
            return createSession({
              sessionId: startOptions.sessionId,
              harnessId: settings.harnessId,
              channel: attachChannel,
              proc: undefined,
              modelId: settings.modelId,
              sessionMeta: settings.session?.meta,
              debug: startOptions.observability?.debug,
              implementationIdentity,
              authenticationProfile,
              providerAuthenticationCompatibility,
              clientApp: clientAppValue,
              builtinTools: builtinToolCatalog,
              permissionMode,
              permissionModeMapping,
              initialGuidanceApplied: resolveACPInitialGuidanceApplied({
                isResume: true,
                lifecycleState: lifecycleData,
              }),
              skillCatalog,
              skillsFingerprint,
              acpSessionId: lifecycleData.acpSessionId,
              bridgePort: coords.port,
              bridgeToken: coords.token,
              sandboxId: sandboxSession.id,
              isResume: true,
              turnInFlight: isContinue,
              bridgeStateDir,
              recoveryStart: lifecycleData.recoveryStart,
              recoveryStatus: lifecycleData.recovery,
              restoration: lifecycleData.restoration,
              replayOnly: false,
              lossyRerun: false,
            });
          } catch (error) {
            if (isContinue) {
              const eventLog = await Promise.resolve(
                sandbox.readTextFile({
                  path: `${bridgeStateDir}/event-log.ndjson`,
                  abortSignal: startOptions.abortSignal,
                }),
              );
              const recoveryMode = await classifyDiskLog(eventLog);
              if (recoveryMode === 'replay') {
                respawnStrategy = {
                  mode: 'disk-replay',
                  reason: 'completed coherent event log',
                  afterSeq: coords.lastSeenEventId,
                };
              } else {
                const recoveryStart = lifecycleData.recoveryStart;
                const acpSessionId = lifecycleData.acpSessionId;
                if (recoveryStart == null || acpSessionId == null) {
                  throw unsupported({
                    harnessId: settings.harnessId,
                    message:
                      'ACP process-loss recovery is unavailable because the lifecycle state does not contain the persisted recovery start and ACP session identifier.',
                    cause: error,
                  });
                }
                validateACPRecoveryConfiguration({
                  recoveryStart,
                  authenticationProfile,
                  providerAuthenticationCompatibility,
                  clientApp: clientAppValue,
                  sessionMeta: settings.session?.meta,
                  builtinTools: builtinToolCatalog,
                  permissionModeMapping,
                });
                respawnStrategy = {
                  mode: 'lossy-rerun',
                  reason: 'event log not replayable',
                  recoveryStart,
                  acpSessionId,
                };
              }
            }
          }
        }
        if (!isContinue) {
          const coldSession = lifecycleData.coldSession;
          const acpSessionId = lifecycleData.acpSessionId;
          if (coldSession == null || acpSessionId == null) {
            throw unsupported({
              harnessId: settings.harnessId,
              message:
                'Cold ACP session restoration requires persisted cold-session configuration and an ACP session identifier.',
            });
          }
          const recoveryStart = validateACPColdSessionConfiguration({
            coldSession,
            modelId: settings.modelId,
            permissionMode,
            authenticationProfile,
            providerAuthenticationCompatibility,
            clientApp: clientAppValue,
            sessionMeta: settings.session?.meta,
            builtinTools: builtinToolCatalog,
            permissionModeMapping,
            debug: startOptions.observability?.debug,
          });
          respawnStrategy = {
            mode: 'cold-restore',
            recoveryStart,
            acpSessionId,
          };
        }
      }

      const port = resolveBridgePort({
        sandboxSession,
        override: portOverride,
        harnessId: settings.harnessId,
      });
      const token = randomBytes(32).toString('hex');
      await sandbox.run({
        command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
        abortSignal: startOptions.abortSignal,
      });
      await markBridgeStarting({
        sandbox,
        bridgeStateDir,
        bridgeType: settings.harnessId,
        abortSignal: startOptions.abortSignal,
      });

      const proc = await sandbox.spawn({
        command:
          `node ${shellQuote(`${resolvedBridgeDir}/bridge.mjs`)}` +
          ` --workdir ${shellQuote(workDir)}` +
          ` --bridge-state-dir ${shellQuote(bridgeStateDir)}` +
          ` --implementation-dir ${shellQuote(resolvedImplementationDir)}` +
          ` --bridge-type ${shellQuote(settings.harnessId)}`,
        env: {
          ...resolveImplementationEnvironment({
            implementation: settings.implementation,
            env: process.env,
          }),
          ...createACPBridgeEnvironment({
            authentication: settings.authentication,
            providerAuthentication:
              resolvedProviderAuthentication.providerAuthentication,
            sessionMeta: settings.session?.meta,
          }),
          ...resolvedProviderAuthentication.env,
          BRIDGE_CHANNEL_TOKEN: token,
          BRIDGE_WS_PORT: String(port),
          ...(respawnStrategy?.mode === 'disk-replay'
            ? {
                BRIDGE_REPLAY_FROM_DISK: '1',
              }
            : {}),
        },
        abortSignal: startOptions.abortSignal,
      });
      const stderrTail: string[] = [];
      const bridgeStderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: settings.harnessId,
        collectTail: stderrTail,
      });
      const timeoutMs = startupTimeoutMs ?? 120_000;
      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox,
        bridgeStateDir,
        bridgeType: settings.harnessId,
        timeoutMs,
        abortSignal: startOptions.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: `${settings.harnessId} ACP bridge did not become ready in time.`,
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: `${settings.harnessId} ACP bridge exited before becoming ready.`,
            proc,
            stdoutTail,
            stderrTail,
            stderrDone: bridgeStderrDone,
          }),
      });
      void drainBridgeProcessStream(proc.stdout);

      const wsUrl =
        (await sandboxSession.getPortUrl({
          port: boundPort,
          protocol: 'ws',
        })) + `?agent_bridge_token=${encodeURIComponent(token)}`;
      const channel: ACPChannel = new SandboxChannel({
        connect: () => openWebSocket({ url: wsUrl }),
        outboundSchema: outboundMessageSchema,
        ...(respawnStrategy?.mode === 'disk-replay'
          ? { initialLastSeenEventId: respawnStrategy.afterSeq }
          : {}),
        onDiagnostic,
        onBridgeError,
      });
      await channel.open(
        respawnStrategy?.mode === 'disk-replay' ? { resume: true } : undefined,
      );
      let coldRestoration: 'resume' | 'load' | undefined;
      if (respawnStrategy?.mode === 'cold-restore') {
        try {
          coldRestoration = await restoreColdACPSession({
            channel,
            harnessId: settings.harnessId,
            start: {
              type: 'start',
              prompt: [],
              debug: startOptions.observability?.debug,
              builtinTools: builtinToolCatalog,
              permissionMode,
              permissionModeMapping,
              tools: respawnStrategy.recoveryStart.tools,
              recovery: respawnStrategy.recoveryStart,
              recoveryMode: {
                type: 'cold-restore',
                acpSessionId: respawnStrategy.acpSessionId,
              },
            },
          });
        } catch (error) {
          channel.beginClose();
          try {
            if (!channel.isClosed()) {
              channel.send({ type: 'destroy' });
            }
          } catch {}
          try {
            await proc.kill();
          } catch {}
          channel.close();
          throw error;
        }
      }

      return createSession({
        sessionId: startOptions.sessionId,
        harnessId: settings.harnessId,
        channel,
        proc,
        modelId: settings.modelId,
        sessionMeta: settings.session?.meta,
        debug: startOptions.observability?.debug,
        implementationIdentity,
        authenticationProfile,
        providerAuthenticationCompatibility,
        clientApp: clientAppValue,
        builtinTools: builtinToolCatalog,
        permissionMode,
        permissionModeMapping,
        initialGuidanceApplied: resolveACPInitialGuidanceApplied({
          isResume,
          lifecycleState: lifecycleData,
        }),
        skillCatalog,
        skillsFingerprint,
        acpSessionId: lifecycleData?.acpSessionId,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId: sandboxSession.id,
        isResume,
        turnInFlight:
          respawnStrategy?.mode === 'disk-replay' ||
          respawnStrategy?.mode === 'lossy-rerun',
        bridgeStateDir,
        recoveryStart:
          respawnStrategy?.mode === 'lossy-rerun' ||
          respawnStrategy?.mode === 'cold-restore'
            ? respawnStrategy.recoveryStart
            : lifecycleData?.recoveryStart,
        recoveryStatus:
          respawnStrategy?.mode === 'disk-replay' ||
          respawnStrategy?.mode === 'lossy-rerun'
            ? {
                mode: respawnStrategy.mode,
                reason: respawnStrategy.reason,
              }
            : undefined,
        restoration:
          coldRestoration == null
            ? lifecycleData?.restoration
            : { method: coldRestoration },
        replayOnly: respawnStrategy?.mode === 'disk-replay',
        lossyRerun: respawnStrategy?.mode === 'lossy-rerun',
      });
    },
  };
}

async function readBridgeAsset({ name }: { name: string }): Promise<string> {
  const candidates = resolveBridgeAssetCandidates({
    name,
    moduleUrl: import.meta.url,
  });
  let lastError: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`ACP bridge asset not found: ${name}`);
}

export function resolveBridgeAssetCandidates({
  name,
  moduleUrl,
}: {
  name: string;
  moduleUrl: string | URL;
}): URL[] {
  return [
    new URL(`./bridge/${name}`, moduleUrl),
    new URL(`../bridge/${name}`, moduleUrl),
  ];
}

function resolveBridgePort({
  sandboxSession,
  override,
  harnessId,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession;
  override: number | undefined;
  harnessId: string;
}): number {
  if (override !== undefined) return override;
  if (sandboxSession.ports.length > 0) return sandboxSession.ports[0];
  throw unsupported({
    harnessId,
    message:
      `The ${harnessId} ACP harness needs a TCP port exposed by the sandbox. ` +
      'Create the sandbox with `ports: [<port>]` or configure the harness `port`.',
  });
}

function openWebSocket({ url }: { url: string }): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const onOpen = () => {
      ws.off('error', onError);
      resolve(ws);
    };
    const onError = (error: Error) => {
      ws.off('open', onOpen);
      reject(error);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function restoreColdACPSession({
  channel,
  harnessId,
  start,
}: {
  channel: ACPChannel;
  harnessId: string;
  start: StartMessage;
}): Promise<'resume' | 'load'> {
  return new Promise<{
    method?: 'resume' | 'load';
    error?: unknown;
  }>(complete => {
    let restorationMethod: 'resume' | 'load' | undefined;
    let settled = false;
    const subscriptions: Array<() => void> = [];
    const cleanup = () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
    const settle = ({
      method,
      error,
    }: {
      method?: 'resume' | 'load';
      error?: unknown;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      complete({
        ...(method == null ? {} : { method }),
        ...(error === undefined ? {} : { error }),
      });
    };
    subscriptions.push(
      channel.on('raw', event => {
        const rawValue = event.rawValue;
        if (
          isRecord(rawValue) &&
          rawValue.type === 'acp-session-restored' &&
          (rawValue.method === 'resume' || rawValue.method === 'load')
        ) {
          restorationMethod = rawValue.method;
        }
      }),
    );
    subscriptions.push(
      channel.on('finish', () => {
        settle({ method: restorationMethod });
      }),
    );
    subscriptions.push(
      channel.on('error', event => {
        settle({
          error: deserializeBridgeError({
            error: event.error,
            harnessId,
          }),
        });
      }),
    );
    channel.onClose((_code, reason) => {
      settle({
        error: new Error(
          `${harnessId} ACP bridge closed during cold restoration: ${reason}`,
        ),
      });
    });
    try {
      channel.send(start);
    } catch (error) {
      settle({ error });
    }
  }).then(result => {
    if (result.error !== undefined) throw result.error;
    if (result.method == null) {
      throw new Error(
        `${harnessId} ACP cold restoration completed without identifying the negotiated method.`,
      );
    }
    return result.method;
  });
}

function createSession({
  sessionId,
  harnessId,
  channel,
  proc,
  modelId,
  sessionMeta,
  debug,
  implementationIdentity,
  authenticationProfile,
  providerAuthenticationCompatibility,
  clientApp,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  initialGuidanceApplied: initialGuidanceAppliedAtStart,
  skillCatalog,
  skillsFingerprint,
  acpSessionId: acpSessionIdAtStart,
  bridgePort,
  bridgeToken,
  sandboxId,
  isResume,
  turnInFlight: turnInFlightAtStart,
  bridgeStateDir,
  recoveryStart: recoveryStartAtStart,
  recoveryStatus,
  restoration,
  replayOnly,
  lossyRerun,
}: {
  sessionId: string;
  harnessId: string;
  channel: ACPChannel;
  proc: Experimental_SandboxProcess | undefined;
  modelId: string | undefined;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  debug: HarnessV1DebugConfig | undefined;
  implementationIdentity: string;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
  clientApp: string;
  builtinTools: StartMessage['builtinTools'];
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  permissionModeMapping: StartMessage['permissionModeMapping'];
  initialGuidanceApplied: boolean;
  skillCatalog: ReadonlyArray<ACPSkillCatalogEntry>;
  skillsFingerprint: string;
  acpSessionId: string | undefined;
  bridgePort: number;
  bridgeToken: string;
  sandboxId: string | undefined;
  isResume: boolean;
  turnInFlight: boolean;
  bridgeStateDir: string;
  recoveryStart: ACPRecoveryStart | undefined;
  recoveryStatus: ACPLifecycleData['recovery'];
  restoration: ACPLifecycleData['restoration'];
  replayOnly: boolean;
  lossyRerun: boolean;
}): HarnessV1Session {
  let stopped = false;
  let turnInFlight = turnInFlightAtStart;
  let initialGuidanceApplied = initialGuidanceAppliedAtStart;
  let latestACPSessionId = acpSessionIdAtStart;
  let latestRecoveryStart = recoveryStartAtStart;

  const markTurnFinished = () => {
    turnInFlight = false;
  };
  channel.on('bridge-thread', event => {
    latestACPSessionId = event.threadId;
  });
  channel.on('finish', markTurnFinished);
  channel.on('error', markTurnFinished);
  channel.onClose(markTurnFinished);

  const wireTurn = ({
    emit,
    abortSignal,
    start,
  }: {
    emit: (event: HarnessV1StreamPart) => void;
    abortSignal?: AbortSignal;
    start: () => void;
  }): HarnessV1PromptControl => {
    let resolveDone: (() => void) | undefined;
    let rejectDone: ((error: unknown) => void) | undefined;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    let settled = false;
    let abortRequested = false;
    let abortError: unknown;
    let abortListenerAttached = false;
    let openBlock:
      | { readonly type: 'text' | 'reasoning'; readonly id: string }
      | undefined;
    const subscriptions: Array<() => void> = [];
    const forward = (event: HarnessV1StreamPart) => {
      if (event.type === 'text-start' || event.type === 'reasoning-start') {
        openBlock = {
          type: event.type === 'text-start' ? 'text' : 'reasoning',
          id: event.id,
        };
      } else if (
        (event.type === 'text-end' || event.type === 'reasoning-end') &&
        openBlock?.id === event.id
      ) {
        openBlock = undefined;
      }
      try {
        emit(event);
      } catch {}
    };
    const closeForwardedBlock = () => {
      if (openBlock == null) return;
      const block = openBlock;
      openBlock = undefined;
      forward({
        type: block.type === 'text' ? 'text-end' : 'reasoning-end',
        id: block.id,
      });
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
    const cleanup = () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      if (abortListenerAttached) {
        abortSignal?.removeEventListener('abort', onAbort);
      }
    };
    const settle = ({ error }: { error?: unknown }) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolveDone!();
      else rejectDone!(error);
    };
    const onAbort = () => {
      if (settled || abortRequested) return;
      abortRequested = true;
      abortError =
        abortSignal?.reason ?? new DOMException('Aborted', 'AbortError');
      try {
        channel.send({ type: 'abort' });
      } catch {
        settle({ error: abortError });
      }
    };
    for (const type of eventTypes) {
      subscriptions.push(channel.on(type, event => forward(event)));
    }
    subscriptions.push(
      channel.on('finish', event => {
        closeForwardedBlock();
        forward(event);
        settle(abortRequested ? { error: abortError } : {});
      }),
    );
    subscriptions.push(
      channel.on('error', event => {
        closeForwardedBlock();
        const error = deserializeBridgeError({
          error: event.error,
          harnessId,
        });
        forward({ ...event, error });
        settle({ error });
      }),
    );
    channel.onClose((_code, reason) => {
      if (reason === 'suspended') {
        settle({});
        return;
      }
      closeForwardedBlock();
      settle({
        error:
          abortRequested && abortError !== undefined
            ? abortError
            : new Error(`${harnessId} ACP bridge closed before turn end.`),
      });
    });
    try {
      start();
    } catch (error) {
      settled = true;
      cleanup();
      throw error;
    }
    if (abortSignal?.aborted) onAbort();
    else if (abortSignal != null) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
      abortListenerAttached = true;
    }
    return {
      submitToolApproval: async input => {
        channel.send({
          type: 'tool-approval-response',
          approvalId: input.approvalId,
          approved: input.approved,
          reason: input.reason,
        });
      },
      submitToolResult: async input => {
        channel.send({
          type: 'tool-result',
          toolCallId: input.toolCallId,
          output: input.output,
          isError: input.isError,
        });
      },
      done,
    };
  };

  const terminateBridge = async ({
    command,
  }: {
    command: 'stop' | 'destroy';
  }) => {
    if (stopped) return;
    stopped = true;
    channel.beginClose();
    const channelClosed = new Promise<void>(resolve => {
      channel.onClose(() => resolve());
    });
    try {
      if (!channel.isClosed()) {
        channel.send({ type: command });
      }
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        proc == null ? channelClosed : proc.wait(),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, 5000);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer != null) clearTimeout(timer);
      try {
        await proc?.kill();
      } catch {}
      channel.close();
    }
  };

  const createLifecycleData = ({
    bridge,
    includeRecoveryStart = true,
  }: {
    bridge?: ACPLifecycleData['bridge'];
    includeRecoveryStart?: boolean;
  }): ACPLifecycleData => ({
    implementationIdentity,
    authenticationProfile,
    ...(latestACPSessionId == null ? {} : { acpSessionId: latestACPSessionId }),
    ...(bridge == null ? {} : { bridge }),
    ...(latestRecoveryStart == null
      ? {}
      : {
          coldSession: createACPColdSessionState({
            recoveryStart: latestRecoveryStart,
            modelId,
          }),
        }),
    ...(!includeRecoveryStart || latestRecoveryStart == null
      ? {}
      : { recoveryStart: latestRecoveryStart }),
    ...(recoveryStatus == null ? {} : { recovery: recoveryStatus }),
    ...(restoration == null ? {} : { restoration }),
    initialGuidanceApplied,
    skillsMaterialized: true,
    skillsFingerprint,
  });

  return {
    sessionId,
    isResume,
    ...(modelId == null ? {} : { modelId }),
    doPromptTurn: async options => {
      if (replayOnly) {
        throw new Error(
          `${harnessId} recovered this turn through disk replay only and has no restored ACP process for a subsequent prompt.`,
        );
      }
      if (options.abortSignal?.aborted) {
        throw (
          options.abortSignal.reason ??
          new DOMException('Aborted', 'AbortError')
        );
      }
      const prompt = convertHarnessPromptToACPTextBlocks({
        prompt: options.prompt,
        harnessId,
      });
      const recoveryStart = createACPRecoveryStart({
        prompt,
        tools: options.tools ?? [],
        builtinTools,
        permissionMode,
        permissionModeMapping,
        debug,
        authenticationProfile,
        providerAuthenticationCompatibility,
        clientApp,
        sessionMeta,
      });
      const control = wireTurn({
        emit: options.emit,
        abortSignal: options.abortSignal,
        start: () => {
          if (turnInFlight) {
            throw new Error(
              `${harnessId} cannot start a new ACP prompt while a turn is in flight.`,
            );
          }
          turnInFlight = true;
          channel.send({
            type: 'start',
            prompt: initialGuidanceApplied
              ? prompt
              : prependACPInitialGuidance({
                  prompt,
                  instructions: options.instructions,
                  skills: skillCatalog,
                }),
            debug,
            builtinTools,
            permissionMode,
            permissionModeMapping,
            tools: options.tools == null ? undefined : [...options.tools],
            recovery: recoveryStart,
          });
          latestRecoveryStart = recoveryStart;
          initialGuidanceApplied = true;
        },
      });
      return control;
    },
    doContinueTurn: async options => {
      if (!turnInFlight) {
        throw new Error(`${harnessId} has no in-flight ACP turn to continue.`);
      }
      if (lossyRerun) {
        if (latestRecoveryStart == null || latestACPSessionId == null) {
          throw new Error(
            `${harnessId} cannot perform lossy ACP rerun without persisted start configuration and an ACP session identifier.`,
          );
        }
        assertRecoveryToolCatalog({
          persisted: latestRecoveryStart.tools,
          current: options.tools ?? [],
        });
      }
      return wireTurn({
        emit: options.emit,
        abortSignal: options.abortSignal,
        start: () => {
          if (!lossyRerun) return;
          const recoveryStart = latestRecoveryStart!;
          channel.send({
            type: 'start',
            prompt: recoveryStart.prompt,
            debug: recoveryStart.debug,
            builtinTools: recoveryStart.builtinTools,
            permissionMode: recoveryStart.permissionMode,
            permissionModeMapping: recoveryStart.permissionModeMapping,
            tools: recoveryStart.tools,
            recovery: recoveryStart,
            recoveryMode: {
              type: 'lossy-rerun',
              acpSessionId: latestACPSessionId!,
              reason: recoveryStatus?.reason ?? 'bridge process loss',
            },
          });
        },
      });
    },
    doCompact: async () => {
      throw unsupported({
        harnessId,
        message: 'ACP v1 does not define manual session compaction.',
      });
    },
    doSuspendTurn: async () => {
      if (stopped) {
        throw new Error(
          `${harnessId} ACP session ${sessionId} is stopped; cannot suspend.`,
        );
      }
      if (!turnInFlight) {
        throw new Error(
          `${harnessId} ACP session ${sessionId} has no in-flight turn to suspend.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'continue-turn',
        harnessId,
        specificationVersion: 'harness-v1',
        data: createLifecycleData({
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            ...(sandboxId == null ? {} : { sandboxId }),
            stateDir: bridgeStateDir,
          },
        }),
      };
    },
    doDetach: async () => {
      if (stopped) {
        throw new Error(
          `${harnessId} ACP session ${sessionId} is stopped; cannot detach.`,
        );
      }
      if (turnInFlight) {
        throw new Error(
          `${harnessId} ACP session ${sessionId} has an in-flight turn; suspend it instead.`,
        );
      }
      stopped = true;
      const lastSeenEventId = await channel.suspend();
      return {
        type: 'resume-session',
        harnessId,
        specificationVersion: 'harness-v1',
        data: createLifecycleData({
          bridge: {
            port: bridgePort,
            token: bridgeToken,
            lastSeenEventId,
            ...(sandboxId == null ? {} : { sandboxId }),
            stateDir: bridgeStateDir,
          },
        }),
      };
    },
    doStop: async () => {
      const data = createLifecycleData({ includeRecoveryStart: false });
      await terminateBridge({ command: 'stop' });
      return {
        type: 'resume-session',
        harnessId,
        specificationVersion: 'harness-v1',
        data,
      };
    },
    doDestroy: async () => {
      await terminateBridge({ command: 'destroy' });
    },
  };
}

function isCompletePermissionModeMapping({
  value,
}: {
  value: ACPPermissionModeMapping | undefined;
}): boolean {
  return (
    isPermissionModeTarget({ value: value?.['allow-reads'] }) &&
    isPermissionModeTarget({ value: value?.['allow-edits'] }) &&
    isPermissionModeTarget({ value: value?.['allow-all'] })
  );
}

function isPermissionModeTarget({
  value,
}: {
  value: ACPPermissionModeTarget | undefined;
}): boolean {
  if (value?.type === 'session-mode') {
    return typeof value.modeId === 'string';
  }
  return (
    value?.type === 'session-config-option' &&
    typeof value.configId === 'string' &&
    (typeof value.value === 'string' || typeof value.value === 'boolean')
  );
}

export function serializeBuiltinTools({
  builtinTools,
}: {
  builtinTools: ToolSet;
}): StartMessage['builtinTools'] {
  return Object.entries(builtinTools).map(([toolName, tool]) => {
    const nativeName =
      tool != null &&
      typeof tool === 'object' &&
      'nativeName' in tool &&
      typeof tool.nativeName === 'string'
        ? tool.nativeName
        : undefined;
    return {
      toolName,
      ...(nativeName == null ? {} : { nativeName }),
    };
  });
}

function validateACPRecoveryConfiguration({
  recoveryStart,
  authenticationProfile,
  providerAuthenticationCompatibility,
  clientApp,
  sessionMeta,
  builtinTools,
  permissionModeMapping,
}: {
  recoveryStart: ACPRecoveryStart;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
  clientApp: string;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  builtinTools: StartMessage['builtinTools'];
  permissionModeMapping: ACPPermissionModeMapping | undefined;
}): void {
  const current = createACPRecoveryStart({
    prompt: recoveryStart.prompt,
    tools: recoveryStart.tools,
    builtinTools,
    permissionMode: recoveryStart.permissionMode,
    permissionModeMapping,
    debug: recoveryStart.debug,
    authenticationProfile,
    providerAuthenticationCompatibility,
    clientApp,
    sessionMeta,
  });
  if (
    current.configurationFingerprint !==
      recoveryStart.configurationFingerprint ||
    fingerprintValue({ value: current.providerProfile }) !==
      fingerprintValue({ value: recoveryStart.providerProfile })
  ) {
    throw new Error(
      'ACP recovery state is incompatible with the current non-secret start configuration.',
    );
  }
}

function validateACPColdSessionConfiguration({
  coldSession,
  modelId,
  permissionMode,
  authenticationProfile,
  providerAuthenticationCompatibility,
  clientApp,
  sessionMeta,
  builtinTools,
  permissionModeMapping,
  debug,
}: {
  coldSession: ACPColdSessionState;
  modelId: string | undefined;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  providerAuthenticationCompatibility:
    | ACPProviderAuthenticationCompatibility
    | undefined;
  clientApp: string;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  builtinTools: StartMessage['builtinTools'];
  permissionModeMapping: ACPPermissionModeMapping | undefined;
  debug: HarnessV1DebugConfig | undefined;
}): ACPRecoveryStart {
  const current = createACPRecoveryStart({
    prompt: [],
    tools: coldSession.tools,
    builtinTools,
    permissionMode,
    permissionModeMapping,
    debug,
    authenticationProfile,
    providerAuthenticationCompatibility,
    clientApp,
    sessionMeta,
  });
  if (
    current.configurationFingerprint !== coldSession.configurationFingerprint ||
    fingerprintValue({ value: current.providerProfile }) !==
      fingerprintValue({ value: coldSession.providerProfile }) ||
    coldSession.permissionMode !== permissionMode ||
    coldSession.modelId !== modelId
  ) {
    throw new Error(
      'ACP cold-session state is incompatible with the current non-secret session configuration.',
    );
  }
  return current;
}

function assertRecoveryToolCatalog({
  persisted,
  current,
}: {
  persisted: ReadonlyArray<NonNullable<StartMessage['tools']>[number]>;
  current: ReadonlyArray<NonNullable<StartMessage['tools']>[number]>;
}): void {
  if (
    fingerprintValue({ value: persisted }) !==
    fingerprintValue({ value: current })
  ) {
    throw new Error(
      'ACP lossy rerun requires the same active host tool catalog as the original turn.',
    );
  }
}

function fingerprintValue({ value }: { value: unknown }): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unsupported({
  harnessId,
  message,
  cause,
}: {
  harnessId: string;
  message: string;
  cause?: unknown;
}): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId,
    message,
    cause,
  });
}

function deserializeBridgeError({
  error,
  harnessId,
}: {
  error: unknown;
  harnessId: string;
}): unknown {
  if (HarnessBridgeCapabilityUnsupportedError.isInstance(error)) {
    return unsupported({ harnessId, message: error.message });
  }
  return error;
}
