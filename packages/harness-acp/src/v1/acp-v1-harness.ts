import { createHash, randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import {
  HarnessCapabilityUnsupportedError,
  harnessV1DiagnosticFromBridgeFrame,
  type HarnessV1,
  type HarnessV1DebugConfig,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
  type HarnessV1PromptControl,
  type HarnessV1Session,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import {
  createBridgeErrorHandler,
  createBridgeStartupError,
  classifyDiskLog,
  drainBridgeProcessStream,
  forwardBridgeProcessStream,
  markBridgeStarting,
  maskSandboxCredentials,
  resolveSandboxHomeDir,
  SandboxChannel,
  shellQuote,
  warnCredentialBrokeringUnavailable,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import {
  asSchema,
  type Experimental_SandboxProcess,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import {
  createACPAuthenticationProfileIdentity,
  resolveACPProviderAuthentication,
  resolveACPProviderAuthenticationCompatibility,
  type ACPAuthenticationProfileIdentity,
  type ACPClientApp,
} from '../acp-auth';
import type { ACPToolCall } from '../acp-tool-call';
import {
  createACPV1Implementation,
  createImplementationIdentity,
  resolveImplementationEnvironment,
  validateACPV1Implementation,
} from './implementation';
import { createACPBootstrap } from './acp-bootstrap';
import {
  outboundMessageSchema,
  type ACPBuiltinToolMapping,
  type ACPColdSessionState,
  type ACPTurnStartConfig,
  type InboundMessage,
  type OutboundMessage,
  type StartMessage,
} from './acp-v1-bridge-protocol';
import { createACPBridgeEnvironment } from './bridge/acp-v1-bridge-environment';
import { resolveACPLaunchEnvironment } from './bridge/protocol-configuration';
import {
  createACPColdSessionState,
  createACPTurnStartConfig,
} from './acp-v1-turn-start-config';
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
  ACPInstructionMapping,
  ACPOutputSchemaMapping,
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

const HARNESS_ID_REGEXP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      readonly turnStartConfig: ACPTurnStartConfig;
      readonly acpSessionId: string;
    }
  | {
      readonly mode: 'cold-restore';
      readonly turnStartConfig: ACPTurnStartConfig;
      readonly acpSessionId: string;
    };

export function createACPV1<TBuiltinTools extends ToolSet = {}>({
  settings,
  builtinTools,
  port: portOverride,
  startupTimeoutMs,
  clientApp,
  lifecycleStateSchema,
}: {
  settings: ACPV1Settings;
  builtinTools: TBuiltinTools;
  port?: number;
  startupTimeoutMs?: number;
  clientApp: ACPClientApp;
  lifecycleStateSchema: NonNullable<
    HarnessV1<TBuiltinTools>['lifecycleStateSchema']
  >;
}): HarnessV1<TBuiltinTools> {
  if (
    (settings.credentialEnv == null) !==
    (settings.credentialBrokering == null)
  ) {
    throw new Error(
      'ACP credentialEnv and credentialBrokering must be configured together.',
    );
  }
  if (
    settings.mcpServers != null &&
    Object.prototype.hasOwnProperty.call(
      settings.mcpServers,
      'ai-sdk-harness-tools',
    )
  ) {
    throw new Error(
      'ACP MCP server name "ai-sdk-harness-tools" is reserved for HarnessAgent tools.',
    );
  }
  if (!HARNESS_ID_REGEXP.test(settings.harnessId)) {
    throw new Error(
      `ACP harnessId must be a stable kebab-case identifier; received ${JSON.stringify(settings.harnessId)}.`,
    );
  }
  const implementation = createACPV1Implementation({ settings });
  validateACPV1Implementation(implementation);
  const bootstrap = createACPBootstrap({
    harnessId: settings.harnessId,
    implementation,
  });
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
    getBootstrap: bootstrap.getBootstrap,
    doStart: async startOptions => {
      if (startOptions.builtinToolFiltering != null) {
        throw unsupported({
          harnessId: settings.harnessId,
          message:
            'ACP built-in tool filtering is not available in this initial ACP v1 implementation.',
        });
      }
      const permissionMode = startOptions.permissionMode ?? 'allow-all';
      const env = { ...process.env };
      const providerAuthenticationCompatibility =
        resolveACPProviderAuthenticationCompatibility({
          auth: settings.auth,
          providerAuthentication: settings.providerAuthentication,
          env,
        });
      const implementationIdentity = createImplementationIdentity({
        harnessId: settings.harnessId,
        acpVersion: 'v1',
        implementation,
        clientApp,
        providerAuthentication: providerAuthenticationCompatibility,
        permissionModeMapping: settings.permissionModeMapping,
      });
      const authenticationProfile = createACPAuthenticationProfileIdentity({
        authentication: settings.authentication,
        providerAuthenticationCompatibility,
      });

      const resolvedProviderAuthentication = resolveACPProviderAuthentication({
        auth: {
          mode: settings.auth,
          providerAuthentication: settings.providerAuthentication,
          clientApp,
        },
        env,
        compatibility: providerAuthenticationCompatibility,
      });
      const sandboxSession = startOptions.sandboxSession;
      const implementationEnvironment = resolveImplementationEnvironment({
        implementation,
        env,
      });
      let sandboxImplementationEnvironment = implementationEnvironment;
      let sandboxProviderAuthenticationEnvironment =
        resolvedProviderAuthentication.env;
      let sandboxProviderEnvironment: Record<string, string> | undefined;

      if (
        settings.credentialBrokering != null &&
        sandboxSession.addRequestTransformations != null
      ) {
        const providerEnvironment = resolveProviderEnvironment({
          resolvedProviderAuthentication,
          clientApp,
        });
        const credentialEnvironmentVariables = [
          ...new Set([
            ...(settings.credentialEnv ?? []),
            'AI_GATEWAY_API_KEY',
            'VERCEL_OIDC_TOKEN',
          ]),
        ];
        const requestTransformations = settings.credentialBrokering({
          env: {
            ...implementationEnvironment,
            ...providerEnvironment,
          },
        });
        if (requestTransformations.length > 0) {
          await sandboxSession.addRequestTransformations(
            requestTransformations,
          );
        }
        sandboxImplementationEnvironment = maskSandboxCredentials({
          environment: implementationEnvironment,
          credentialEnvironmentVariables,
        });

        /*
         * Gateway profiles are resolved on the host twice: real values feed
         * the transformation callback, while the bridge receives only a
         * structurally equivalent environment with credential placeholders.
         * Resolving the profile inside the sandbox would require serializing
         * the Gateway credential into the bridge process environment.
         */
        sandboxProviderEnvironment = maskSandboxCredentials({
          environment: resolveProviderEnvironment({
            resolvedProviderAuthentication,
            clientApp,
            gatewayApiKey: 'AI_GATEWAY_API_KEY',
          }),
          credentialEnvironmentVariables,
        });
        sandboxProviderAuthenticationEnvironment = Object.fromEntries(
          Object.entries(resolvedProviderAuthentication.env).filter(
            ([key]) =>
              key !== 'AI_SDK_ACP_GATEWAY_API_KEY' &&
              key !== 'AI_SDK_ACP_GATEWAY_BASE_URL',
          ),
        );
      } else if (settings.credentialBrokering != null) {
        warnCredentialBrokeringUnavailable();
      }
      const sandbox = sandboxSession.restricted();
      const resolvedBridgeDir = posix.resolve(
        sandboxSession.defaultWorkingDirectory,
        bootstrap.bootstrapDir,
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
            const endpoint = await sandboxSession.getPortEndpoint({
              port: coords.port,
              protocol: 'ws',
            });
            const attachEndpoint = withBridgeToken({
              endpoint,
              token: coords.token,
            });
            const attachChannel: ACPChannel = new SandboxChannel({
              connect: () => openWebSocket(attachEndpoint),
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
              instructionMapping: settings.instructionMapping,
              outputSchemaMapping: settings.outputSchemaMapping,
              debug: startOptions.observability?.debug,
              implementationIdentity,
              authenticationProfile,
              builtinTools: builtinToolCatalog,
              permissionMode,
              permissionModeMapping,
              mcpServers: settings.mcpServers,
              isMcpToolCall: settings.isMcpToolCall,
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
              turnStartConfig: lifecycleData.turnStartConfig,
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
                const turnStartConfig = lifecycleData.turnStartConfig;
                const acpSessionId = lifecycleData.acpSessionId;
                if (turnStartConfig == null || acpSessionId == null) {
                  throw unsupported({
                    harnessId: settings.harnessId,
                    message:
                      'ACP process-loss recovery is unavailable because the lifecycle state does not contain the persisted turn start configuration and ACP session identifier.',
                    cause: error,
                  });
                }
                validateACPTurnStartConfig({
                  turnStartConfig,
                  authenticationProfile,
                  sessionMeta: settings.session?.meta,
                  instructionMapping: settings.instructionMapping,
                  outputSchemaMapping: settings.outputSchemaMapping,
                  builtinTools: builtinToolCatalog,
                  permissionModeMapping,
                  mcpServers: settings.mcpServers,
                });
                respawnStrategy = {
                  mode: 'lossy-rerun',
                  reason: 'event log not replayable',
                  turnStartConfig,
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
          const turnStartConfig = validateACPColdSessionConfiguration({
            coldSession,
            modelId: settings.modelId,
            permissionMode,
            authenticationProfile,
            sessionMeta: settings.session?.meta,
            instructionMapping: settings.instructionMapping,
            outputSchemaMapping: settings.outputSchemaMapping,
            builtinTools: builtinToolCatalog,
            permissionModeMapping,
            mcpServers: settings.mcpServers,
            debug: startOptions.observability?.debug,
          });
          respawnStrategy = {
            mode: 'cold-restore',
            turnStartConfig,
            acpSessionId,
          };
        }
      }

      const port = resolveBridgePort({
        sandboxSession,
        override: portOverride,
        harnessId: settings.harnessId,
      });
      const token =
        settings.mintBridgeToken == null
          ? randomBytes(32).toString('hex')
          : settings.mintBridgeToken(sandboxSession.id);
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
          ...sandboxImplementationEnvironment,
          ...createACPBridgeEnvironment({
            authentication: settings.authentication,
            providerAuthentication:
              resolvedProviderAuthentication.providerAuthentication,
            providerEnvironment: sandboxProviderEnvironment,
            sessionMeta: settings.session?.meta,
          }),
          ...sandboxProviderAuthenticationEnvironment,
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

      const endpoint = await sandboxSession.getPortEndpoint({
        port: boundPort,
        protocol: 'ws',
      });
      const bridgeEndpoint = withBridgeToken({ endpoint, token });
      const channel: ACPChannel = new SandboxChannel({
        connect: () => openWebSocket(bridgeEndpoint),
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
              ...(settings.instructionMapping == null
                ? {}
                : { instructionMapping: settings.instructionMapping }),
              ...(settings.mcpServers == null
                ? {}
                : { mcpServers: settings.mcpServers }),
              tools: respawnStrategy.turnStartConfig.tools,
              turnStartConfig: respawnStrategy.turnStartConfig,
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
        instructionMapping: settings.instructionMapping,
        outputSchemaMapping: settings.outputSchemaMapping,
        debug: startOptions.observability?.debug,
        implementationIdentity,
        authenticationProfile,
        builtinTools: builtinToolCatalog,
        permissionMode,
        permissionModeMapping,
        mcpServers: settings.mcpServers,
        isMcpToolCall: settings.isMcpToolCall,
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
        turnStartConfig:
          respawnStrategy?.mode === 'lossy-rerun' ||
          respawnStrategy?.mode === 'cold-restore'
            ? respawnStrategy.turnStartConfig
            : lifecycleData?.turnStartConfig,
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

function resolveProviderEnvironment({
  resolvedProviderAuthentication,
  clientApp,
  gatewayApiKey,
}: {
  resolvedProviderAuthentication: ReturnType<
    typeof resolveACPProviderAuthentication
  >;
  clientApp: ACPClientApp;
  gatewayApiKey?: string;
}): Record<string, string> {
  if (
    resolvedProviderAuthentication.providerAuthentication?.type !== 'ai-gateway'
  ) {
    return {};
  }
  return resolveACPLaunchEnvironment({
    providerAuthentication:
      resolvedProviderAuthentication.providerAuthentication,
    gateway: {
      apiKey:
        gatewayApiKey ??
        requireResolvedEnvironmentValue({
          environment: resolvedProviderAuthentication.env,
          name: 'AI_SDK_ACP_GATEWAY_API_KEY',
        }),
      baseUrl: requireResolvedEnvironmentValue({
        environment: resolvedProviderAuthentication.env,
        name: 'AI_SDK_ACP_GATEWAY_BASE_URL',
      }),
      clientAppName: clientApp.name,
      clientAppVersion: clientApp.version,
    },
  });
}

function requireResolvedEnvironmentValue({
  environment,
  name,
}: {
  environment: Readonly<Record<string, string>>;
  name: string;
}): string {
  const value = environment[name];
  if (value == null) {
    throw new Error(`ACP resolved environment value ${name} is unavailable.`);
  }
  return value;
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
    const onError = (error: Error) => {
      ws.off('open', onOpen);
      reject(error);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
}

function withBridgeToken({
  endpoint,
  token,
}: {
  endpoint: HarnessV1PortEndpoint;
  token: string;
}): HarnessV1PortEndpoint {
  const bridgeUrl = new URL(endpoint.url);
  bridgeUrl.searchParams.set('agent_bridge_token', token);
  return { ...endpoint, url: bridgeUrl.toString() };
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
  instructionMapping,
  outputSchemaMapping,
  debug,
  implementationIdentity,
  authenticationProfile,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  mcpServers,
  isMcpToolCall,
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
  turnStartConfig: turnStartConfigAtStart,
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
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  debug: HarnessV1DebugConfig | undefined;
  implementationIdentity: string;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  permissionModeMapping: StartMessage['permissionModeMapping'];
  mcpServers: Record<string, unknown> | undefined;
  isMcpToolCall: ((toolCall: ACPToolCall) => boolean) | undefined;
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
  turnStartConfig: ACPTurnStartConfig | undefined;
  recoveryStatus: ACPLifecycleData['recovery'];
  restoration: ACPLifecycleData['restoration'];
  replayOnly: boolean;
  lossyRerun: boolean;
}): HarnessV1Session {
  let stopped = false;
  let turnInFlight = turnInFlightAtStart;
  let initialGuidanceApplied = initialGuidanceAppliedAtStart;
  let latestACPSessionId = acpSessionIdAtStart;
  let latestTurnStartConfig = turnStartConfigAtStart;

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
    const dynamicToolCalls = new Map<string, boolean>();
    const toolCallClassificationErrors = new Map<string, unknown>();
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
      'tool-approval-request',
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
    subscriptions.push(
      channel.on('acp-tool-call-candidate', event => {
        try {
          dynamicToolCalls.set(
            event.toolCall.toolCallId,
            isMcpToolCall?.(event.toolCall) === true,
          );
        } catch (error) {
          toolCallClassificationErrors.set(event.toolCall.toolCallId, error);
        }
      }),
    );
    subscriptions.push(
      channel.on('tool-call', event => {
        if (toolCallClassificationErrors.has(event.toolCallId)) {
          const error = toolCallClassificationErrors.get(event.toolCallId);
          closeForwardedBlock();
          forward({ type: 'error', error });
          try {
            channel.send({ type: 'abort' });
          } catch {}
          settle({ error });
          return;
        }
        forward(
          dynamicToolCalls.get(event.toolCallId) === true
            ? { ...event, dynamic: true }
            : event,
        );
      }),
    );
    subscriptions.push(
      channel.on('tool-result', event => {
        const dynamic = dynamicToolCalls.get(event.toolCallId) === true;
        dynamicToolCalls.delete(event.toolCallId);
        toolCallClassificationErrors.delete(event.toolCallId);
        forward(dynamic ? { ...event, dynamic: true } : event);
      }),
    );
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
    includeTurnStartConfig = true,
  }: {
    bridge?: ACPLifecycleData['bridge'];
    includeTurnStartConfig?: boolean;
  }): ACPLifecycleData => ({
    implementationIdentity,
    authenticationProfile,
    ...(latestACPSessionId == null ? {} : { acpSessionId: latestACPSessionId }),
    ...(bridge == null ? {} : { bridge }),
    ...(latestTurnStartConfig == null
      ? {}
      : {
          coldSession: createACPColdSessionState({
            turnStartConfig: latestTurnStartConfig,
            modelId,
          }),
        }),
    ...(!includeTurnStartConfig || latestTurnStartConfig == null
      ? {}
      : { turnStartConfig: latestTurnStartConfig }),
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
      if (options.responseFormat?.type === 'json') {
        if (options.responseFormat.schema == null) {
          throw unsupported({
            harnessId,
            message: `${harnessId} requires a JSON schema for structured output.`,
          });
        }
        if (outputSchemaMapping == null) {
          throw unsupported({
            harnessId,
            message: `${harnessId} does not support structured output through ACP.`,
          });
        }
      }
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
      const turnStartConfig = createACPTurnStartConfig({
        prompt,
        tools: options.tools ?? [],
        builtinTools,
        permissionMode,
        permissionModeMapping,
        mcpServers,
        debug,
        authenticationProfile,
        sessionMeta,
        instructionMapping,
        responseFormat: options.responseFormat,
        outputSchemaMapping,
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
                  instructions:
                    instructionMapping == null
                      ? options.instructions
                      : undefined,
                  skills: skillCatalog,
                }),
            ...(instructionMapping == null
              ? {}
              : {
                  instructionMapping,
                  ...(options.instructions == null
                    ? {}
                    : { instructions: options.instructions }),
                }),
            debug,
            builtinTools,
            permissionMode,
            permissionModeMapping,
            ...(options.responseFormat == null
              ? {}
              : { responseFormat: options.responseFormat }),
            ...(turnStartConfig.outputSchemaMapping == null
              ? {}
              : { outputSchemaMapping: turnStartConfig.outputSchemaMapping }),
            ...(mcpServers == null ? {} : { mcpServers }),
            tools: options.tools == null ? undefined : turnStartConfig.tools,
            turnStartConfig,
          });
          latestTurnStartConfig = turnStartConfig;
          initialGuidanceApplied = true;
        },
      });
      return control;
    },
    doContinueTurn: async options => {
      if (options.responseFormat?.type === 'json') {
        if (options.responseFormat.schema == null) {
          throw unsupported({
            harnessId,
            message: `${harnessId} requires a JSON schema for structured output.`,
          });
        }
        if (outputSchemaMapping == null) {
          throw unsupported({
            harnessId,
            message: `${harnessId} does not support structured output through ACP.`,
          });
        }
      }
      if (!turnInFlight) {
        throw new Error(`${harnessId} has no in-flight ACP turn to continue.`);
      }
      if (lossyRerun) {
        if (latestTurnStartConfig == null || latestACPSessionId == null) {
          throw new Error(
            `${harnessId} cannot perform lossy ACP rerun without persisted start configuration and an ACP session identifier.`,
          );
        }
        assertRecoveryToolCatalog({
          persisted: latestTurnStartConfig.tools,
          current: options.tools ?? [],
        });
      }
      return wireTurn({
        emit: options.emit,
        abortSignal: options.abortSignal,
        start: () => {
          if (!lossyRerun) return;
          const turnStartConfig = latestTurnStartConfig!;
          channel.send({
            type: 'start',
            prompt: turnStartConfig.prompt,
            debug: turnStartConfig.debug,
            builtinTools: turnStartConfig.builtinTools,
            permissionMode: turnStartConfig.permissionMode,
            permissionModeMapping: turnStartConfig.permissionModeMapping,
            ...(turnStartConfig.responseFormat == null
              ? {}
              : { responseFormat: turnStartConfig.responseFormat }),
            ...(turnStartConfig.outputSchemaMapping == null
              ? {}
              : { outputSchemaMapping: turnStartConfig.outputSchemaMapping }),
            ...(instructionMapping == null
              ? {}
              : {
                  instructionMapping,
                  ...(options.instructions == null
                    ? {}
                    : { instructions: options.instructions }),
                }),
            ...(mcpServers == null ? {} : { mcpServers }),
            tools: turnStartConfig.tools,
            turnStartConfig,
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
      const data = createLifecycleData({ includeTurnStartConfig: false });
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
    isPermissionModeMappingValue({ value: value?.['allow-reads'] }) &&
    isPermissionModeMappingValue({ value: value?.['allow-edits'] }) &&
    isPermissionModeMappingValue({ value: value?.['allow-all'] })
  );
}

function isPermissionModeMappingValue({
  value,
}: {
  value: ACPPermissionModeTarget | null | undefined;
}): boolean {
  return value === null || isPermissionModeTarget({ value });
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
}): ReadonlyArray<ACPBuiltinToolMapping> {
  return Object.entries(builtinTools).map(([toolName, tool]) => {
    const nativeName =
      tool != null &&
      typeof tool === 'object' &&
      'nativeName' in tool &&
      typeof tool.nativeName === 'string'
        ? tool.nativeName
        : undefined;
    let inputSchema: ACPBuiltinToolMapping['inputSchema'];
    if (
      tool != null &&
      typeof tool === 'object' &&
      'inputSchema' in tool &&
      tool.inputSchema != null
    ) {
      try {
        inputSchema = asSchema(
          tool.inputSchema as Parameters<typeof asSchema>[0],
        ).jsonSchema as ACPBuiltinToolMapping['inputSchema'];
      } catch {}
    }
    return {
      toolName,
      ...(nativeName == null ? {} : { nativeName }),
      ...(inputSchema == null ? {} : { inputSchema }),
    };
  });
}

function validateACPTurnStartConfig({
  turnStartConfig,
  authenticationProfile,
  sessionMeta,
  instructionMapping,
  outputSchemaMapping,
  builtinTools,
  permissionModeMapping,
  mcpServers,
}: {
  turnStartConfig: ACPTurnStartConfig;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  permissionModeMapping: ACPPermissionModeMapping | undefined;
  mcpServers: Record<string, unknown> | undefined;
}): void {
  const current = createACPTurnStartConfig({
    prompt: turnStartConfig.prompt,
    tools: turnStartConfig.tools,
    builtinTools,
    permissionMode: turnStartConfig.permissionMode,
    permissionModeMapping,
    mcpServers,
    debug: turnStartConfig.debug,
    authenticationProfile,
    sessionMeta,
    instructionMapping,
    responseFormat: turnStartConfig.responseFormat,
    outputSchemaMapping,
  });
  if (
    current.configurationFingerprint !==
    turnStartConfig.configurationFingerprint
  ) {
    throw new Error(
      'The persisted ACP turn start configuration is incompatible with the current non-secret start configuration.',
    );
  }
}

function validateACPColdSessionConfiguration({
  coldSession,
  modelId,
  permissionMode,
  authenticationProfile,
  sessionMeta,
  instructionMapping,
  outputSchemaMapping,
  builtinTools,
  permissionModeMapping,
  mcpServers,
  debug,
}: {
  coldSession: ACPColdSessionState;
  modelId: string | undefined;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  permissionModeMapping: ACPPermissionModeMapping | undefined;
  mcpServers: Record<string, unknown> | undefined;
  debug: HarnessV1DebugConfig | undefined;
}): ACPTurnStartConfig {
  const current = createACPTurnStartConfig({
    prompt: [],
    tools: coldSession.tools,
    builtinTools,
    permissionMode,
    permissionModeMapping,
    mcpServers,
    debug,
    authenticationProfile,
    sessionMeta,
    instructionMapping,
    responseFormat: coldSession.responseFormat,
    outputSchemaMapping,
  });
  if (
    current.configurationFingerprint !== coldSession.configurationFingerprint ||
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
  persisted: ReadonlyArray<HarnessV1ToolSpec>;
  current: ReadonlyArray<HarnessV1ToolSpec>;
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
