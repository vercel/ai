import { createHash } from 'node:crypto';
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
  type HarnessV1Skill,
  type HarnessV1StreamPart,
  type HarnessV1ToolSpec,
} from '@ai-sdk/harness';
import { HarnessBridgeCapabilityUnsupportedError } from '@ai-sdk/harness/bridge';
import {
  applyCredentialForwarding,
  createBridgeToken,
  createBridgeErrorHandler,
  createBridgeStartupError,
  createSandboxCredentialEnvironment,
  classifyDiskLog,
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
} from '@ai-sdk/harness/utils';
import {
  asSchema,
  type Experimental_SandboxProcess,
  type Experimental_SandboxSession as SandboxSession,
  type ToolResultPart,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import {
  createACPAuthenticationProfileIdentity,
  resolveACPAuthenticationEnvironment,
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
import { createACPBootstrap } from './acp-v1-bootstrap';
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
  validateACPLifecycleCompatibility,
  type ACPLifecycleData,
} from './acp-v1-lifecycle';
import {
  convertHarnessPromptToACPTextBlocks,
  prependACPInstructionGuidance,
} from './acp-v1-prompt';
import type {
  ACPAskUserQuestionsSettings,
  ACPInstructionMapping,
  ACPModelMapping,
  ACPOutputSchemaMapping,
  ACPPermissionModeMapping,
  ACPPermissionModeTarget,
  ACPProfileValue,
  ACPSerializableValue,
  ACPV1Settings,
} from './acp-v1-settings';
import {
  materializeACPSkills,
  resolveACPPrivateSessionDirectory,
  resolveACPSkillsDirectory,
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
  portEndpoint: portEndpointOverride,
  startupTimeoutMs,
  clientApp,
  lifecycleStateSchema,
}: {
  settings: ACPV1Settings;
  builtinTools: TBuiltinTools;
  port?: number;
  portEndpoint?: HarnessV1PortEndpoint;
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
      const authenticationEnvironment = resolveACPAuthenticationEnvironment({
        auth: settings.auth,
        env,
      });
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
        clientCapabilities: settings.clientCapabilities,
        modelMapping: settings.modelMapping,
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
      const toolSafeSandboxSession =
        getRestrictedSandboxSession(sandboxSession);
      const sandboxId = 'id' in sandboxSession ? sandboxSession.id : undefined;
      validateBasicSandboxSettings({
        sandboxSession,
        port: portOverride,
        portEndpoint: portEndpointOverride,
        harnessId: settings.harnessId,
      });
      if (settings.mintBridgeToken != null && sandboxId == null) {
        throw unsupported({
          harnessId: settings.harnessId,
          message: `The ${settings.harnessId} ACP harness cannot use \`mintBridgeToken\` with a sandbox session that does not expose an id.`,
        });
      }
      const defaultWorkingDirectory =
        await resolveSandboxDefaultWorkingDirectory({
          sandboxSession,
          abortSignal: startOptions.abortSignal,
        });
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
          sandboxId,
        });
      }
      const implementationEnvironment = resolveImplementationEnvironment({
        implementation,
        env,
        credentialEnv: authenticationEnvironment,
      });
      let sandboxImplementationEnvironment = implementationEnvironment;
      let sandboxProviderAuthenticationEnvironment =
        resolvedProviderAuthentication.env;
      let sandboxProviderEnvironment: Record<string, string> | undefined;
      const credentialEnvironmentVariables = [
        ...new Set([
          ...(settings.credentialEnv ?? []),
          'AI_GATEWAY_API_KEY',
          'VERCEL_OIDC_TOKEN',
        ]),
      ];
      const credentialForwardingEnvironmentVariables = [
        ...new Set([
          ...credentialEnvironmentVariables,
          ...resolveACPProviderCredentialEnvironmentVariables({
            providerAuthentication:
              resolvedProviderAuthentication.providerAuthentication,
          }),
        ]),
      ];
      let sandboxCredentialEnvironment:
        | Readonly<Record<string, string>>
        | undefined;

      if (
        settings.credentialBrokering != null &&
        'addRequestTransformations' in sandboxSession &&
        sandboxSession.addRequestTransformations != null
      ) {
        const providerEnvironment = resolveProviderEnvironment({
          resolvedProviderAuthentication,
          clientApp,
        });
        const brokeringEnvironment = {
          ...implementationEnvironment,
          ...providerEnvironment,
        };
        sandboxCredentialEnvironment =
          lifecycleData?.sandboxCredentialEnvironment ??
          (await createSandboxCredentialEnvironment({
            environment: brokeringEnvironment,
            credentialEnvironmentVariables:
              credentialForwardingEnvironmentVariables,
            credentialForwarding: settings.credentialForwarding,
          }));
        sandboxImplementationEnvironment = {
          ...brokeringEnvironment,
          ...sandboxCredentialEnvironment,
        };
        const requestTransformations = settings.credentialBrokering({
          env: brokeringEnvironment,
          sandboxEnv: sandboxImplementationEnvironment,
          ...(startOptions.headers == null
            ? {}
            : { headers: startOptions.headers }),
        });
        if (requestTransformations.length > 0) {
          await sandboxSession.addRequestTransformations(
            requestTransformations,
          );
        }
        sandboxProviderEnvironment =
          resolvedProviderAuthentication.providerAuthentication?.type ===
          'ai-gateway'
            ? {}
            : undefined;
      }
      if (
        settings.credentialForwarding != null &&
        sandboxProviderEnvironment == null &&
        resolvedProviderAuthentication.providerAuthentication?.type ===
          'ai-gateway'
      ) {
        sandboxProviderEnvironment = resolveProviderEnvironment({
          resolvedProviderAuthentication,
          clientApp,
        });
      }
      if (sandboxProviderEnvironment != null) {
        sandboxImplementationEnvironment = {
          ...sandboxImplementationEnvironment,
          ...sandboxProviderEnvironment,
        };
        sandboxProviderAuthenticationEnvironment = Object.fromEntries(
          Object.entries(resolvedProviderAuthentication.env).filter(
            ([key]) =>
              key !== 'AI_SDK_ACP_GATEWAY_API_KEY' &&
              key !== 'AI_SDK_ACP_GATEWAY_BASE_URL',
          ),
        );
      }
      const resolvedBridgeDir = posix.resolve(
        defaultWorkingDirectory,
        bootstrap.bootstrapDir,
      );
      const resolvedImplementationDir = `${resolvedBridgeDir}/implementation`;
      const workDir = startOptions.sessionWorkDir;
      const sandboxHomeDir = await resolveSandboxHomeDir({
        sandbox: toolSafeSandboxSession,
        abortSignal: startOptions.abortSignal,
      });
      const privateSessionDir = resolveACPPrivateSessionDirectory({
        sandboxHomeDir,
        sessionWorkDir: workDir,
        harnessId: settings.harnessId,
        sessionId: startOptions.sessionId,
      });
      const skillsDirectory = resolveACPSkillsDirectory({
        implementationHomeDir:
          implementation.source.type === 'install-command'
            ? `${resolvedImplementationDir}/home`
            : sandboxHomeDir,
        skillsDirectory: settings.skillsDirectory,
        sessionWorkDir: workDir,
      });
      const bridgeStateDir = `${privateSessionDir}/bridge`;
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
            const endpoint = await resolveBridgeEndpoint({
              sandboxSession,
              override: portEndpointOverride,
              port: coords.port,
              harnessId: settings.harnessId,
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
              modelMapping: settings.modelMapping,
              defaultModelId: settings.modelId,
              sessionMeta: settings.session?.meta,
              instructionMapping: settings.instructionMapping,
              outputSchemaMapping: settings.outputSchemaMapping,
              askUserQuestions: settings.askUserQuestions,
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
              instructionsFingerprint: lifecycleData.instructionsFingerprint,
              sandbox: toolSafeSandboxSession,
              sessionWorkDir: workDir,
              skillsDirectory,
              acpSessionId: lifecycleData.acpSessionId,
              bridgePort: coords.port,
              bridgeToken: coords.token,
              sandboxId,
              isResume: true,
              turnInFlight: isContinue,
              bridgeStateDir,
              turnStartConfig: lifecycleData.turnStartConfig,
              recoveryStatus: lifecycleData.recovery,
              restoration: lifecycleData.restoration,
              sandboxCredentialEnvironment,
              replayOnly: false,
              lossyRerun: false,
            });
          } catch (error) {
            if (isContinue) {
              const eventLog = await Promise.resolve(
                toolSafeSandboxSession.readTextFile({
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
                  modelMapping: settings.modelMapping,
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
            permissionMode,
            authenticationProfile,
            sessionMeta: settings.session?.meta,
            instructionMapping: settings.instructionMapping,
            outputSchemaMapping: settings.outputSchemaMapping,
            modelMapping: settings.modelMapping,
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

      const forwardedImplementationEnvironment =
        sandboxCredentialEnvironment == null
          ? await applyCredentialForwarding({
              environment: sandboxImplementationEnvironment,
              credentialEnvironmentVariables:
                credentialForwardingEnvironmentVariables,
              credentialForwarding: settings.credentialForwarding,
            })
          : sandboxImplementationEnvironment;
      if (
        settings.credentialBrokering != null &&
        sandboxCredentialEnvironment == null
      ) {
        warnCredentialBrokeringUnavailable({
          environment: {
            ...sandboxImplementationEnvironment,
            ...resolvedProviderAuthentication.env,
          },
          forwardedEnvironment: {
            ...forwardedImplementationEnvironment,
            ...sandboxProviderAuthenticationEnvironment,
          },
          credentialEnvironmentVariables: [
            ...credentialForwardingEnvironmentVariables,
            'AI_SDK_ACP_GATEWAY_API_KEY',
          ],
        });
      }
      const port = resolveBridgePort({
        sandboxSession,
        override: portOverride,
        harnessId: settings.harnessId,
      });
      const token =
        settings.mintBridgeToken == null
          ? createBridgeToken()
          : settings.mintBridgeToken(sandboxId!);
      await toolSafeSandboxSession.run({
        command: `mkdir -p ${shellQuote(workDir)} ${shellQuote(bridgeStateDir)}`,
        abortSignal: startOptions.abortSignal,
      });
      await markBridgeStarting({
        sandbox: toolSafeSandboxSession,
        bridgeStateDir,
        bridgeType: settings.harnessId,
        abortSignal: startOptions.abortSignal,
      });

      const proc = await toolSafeSandboxSession.spawn({
        command:
          `node ${shellQuote(`${resolvedBridgeDir}/bridge.mjs`)}` +
          ` --workdir ${shellQuote(workDir)}` +
          ` --bridge-state-dir ${shellQuote(bridgeStateDir)}` +
          ` --implementation-dir ${shellQuote(resolvedImplementationDir)}` +
          ` --bridge-type ${shellQuote(settings.harnessId)}`,
        env: {
          ...forwardedImplementationEnvironment,
          ...createACPBridgeEnvironment({
            authentication: settings.authentication,
            providerAuthentication:
              resolvedProviderAuthentication.providerAuthentication,
            providerEnvironment:
              sandboxProviderEnvironment == null ? undefined : {},
            sessionMeta: settings.session?.meta,
            clientCapabilities: settings.clientCapabilities,
            askUserQuestionsRequestMethod:
              settings.askUserQuestions?.requestMethod,
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
        sandbox: toolSafeSandboxSession,
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

      const endpoint = await resolveBridgeEndpoint({
        sandboxSession,
        override: portEndpointOverride,
        port: boundPort,
        harnessId: settings.harnessId,
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
        modelMapping: settings.modelMapping,
        defaultModelId: settings.modelId,
        sessionMeta: settings.session?.meta,
        instructionMapping: settings.instructionMapping,
        outputSchemaMapping: settings.outputSchemaMapping,
        askUserQuestions: settings.askUserQuestions,
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
        instructionsFingerprint: lifecycleData?.instructionsFingerprint,
        sandbox: toolSafeSandboxSession,
        sessionWorkDir: workDir,
        skillsDirectory,
        acpSessionId: lifecycleData?.acpSessionId,
        bridgePort: boundPort,
        bridgeToken: token,
        sandboxId,
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
        sandboxCredentialEnvironment,
        replayOnly: respawnStrategy?.mode === 'disk-replay',
        lossyRerun: respawnStrategy?.mode === 'lossy-rerun',
      });
    },
  };
}

function resolveProviderEnvironment({
  resolvedProviderAuthentication,
  clientApp,
}: {
  resolvedProviderAuthentication: ReturnType<
    typeof resolveACPProviderAuthentication
  >;
  clientApp: ACPClientApp;
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
      apiKey: requireResolvedEnvironmentValue({
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

function resolveACPProviderCredentialEnvironmentVariables({
  providerAuthentication,
}: {
  providerAuthentication: ReturnType<
    typeof resolveACPProviderAuthentication
  >['providerAuthentication'];
}): string[] {
  if (providerAuthentication?.type !== 'ai-gateway') return [];

  return Object.entries(providerAuthentication.env)
    .filter(([, value]) => containsACPProviderCredential({ value }))
    .map(([name]) => name);
}

function containsACPProviderCredential({
  value,
}: {
  value: ACPProfileValue;
}): boolean {
  if (Array.isArray(value)) {
    return value.some(item => containsACPProviderCredential({ value: item }));
  }
  if (value == null || typeof value !== 'object') return false;
  if ('$source' in value) {
    return (
      value.$source === 'gateway-api-key' ||
      value.$source === 'gateway-authorization'
    );
  }
  return Object.values(value).some(item =>
    containsACPProviderCredential({ value: item }),
  );
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
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  override: number | undefined;
  harnessId: string;
}): number {
  if (override !== undefined) return override;
  if ('ports' in sandboxSession && sandboxSession.ports.length > 0) {
    return sandboxSession.ports[0];
  }
  throw unsupported({
    harnessId,
    message:
      `The ${harnessId} ACP harness needs a TCP port exposed by the sandbox. ` +
      'Create the sandbox with `ports: [<port>]` or configure the harness `port`.',
  });
}

function validateBasicSandboxSettings({
  sandboxSession,
  port,
  portEndpoint,
  harnessId,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  port: number | undefined;
  portEndpoint: HarnessV1PortEndpoint | undefined;
  harnessId: string;
}): void {
  if ('getPortEndpoint' in sandboxSession) return;
  if (port == null) {
    throw unsupported({
      harnessId,
      message: `The ${harnessId} ACP harness requires an explicit \`port\` when using a basic sandbox session.`,
    });
  }
  if (portEndpoint == null) {
    throw unsupported({
      harnessId,
      message: `The ${harnessId} ACP harness requires an explicit \`portEndpoint\` when using a basic sandbox session.`,
    });
  }
}

async function resolveBridgeEndpoint({
  sandboxSession,
  override,
  port,
  harnessId,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  override: HarnessV1PortEndpoint | undefined;
  port: number;
  harnessId: string;
}): Promise<HarnessV1PortEndpoint> {
  if (override != null) return override;
  if ('getPortEndpoint' in sandboxSession) {
    return sandboxSession.getPortEndpoint({ port, protocol: 'ws' });
  }
  throw unsupported({
    harnessId,
    message: `The ${harnessId} ACP harness requires an explicit \`portEndpoint\` when using a basic sandbox session.`,
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
  modelMapping,
  defaultModelId,
  sessionMeta,
  instructionMapping,
  outputSchemaMapping,
  askUserQuestions,
  debug,
  implementationIdentity,
  authenticationProfile,
  builtinTools,
  permissionMode,
  permissionModeMapping,
  mcpServers,
  isMcpToolCall,
  initialGuidanceApplied: initialGuidanceAppliedAtStart,
  instructionsFingerprint: instructionsFingerprintAtStart,
  sandbox,
  sessionWorkDir,
  skillsDirectory,
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
  sandboxCredentialEnvironment,
  replayOnly,
  lossyRerun,
}: {
  sessionId: string;
  harnessId: string;
  channel: ACPChannel;
  proc: Experimental_SandboxProcess | undefined;
  modelMapping: ACPModelMapping;
  defaultModelId: string | undefined;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  askUserQuestions: ACPAskUserQuestionsSettings | undefined;
  debug: HarnessV1DebugConfig | undefined;
  implementationIdentity: string;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  permissionModeMapping: StartMessage['permissionModeMapping'];
  mcpServers: Record<string, unknown> | undefined;
  isMcpToolCall: ((toolCall: ACPToolCall) => boolean) | undefined;
  initialGuidanceApplied: boolean;
  instructionsFingerprint: string | undefined;
  sandbox: SandboxSession;
  sessionWorkDir: string;
  skillsDirectory: string;
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
  sandboxCredentialEnvironment: Readonly<Record<string, string>> | undefined;
  replayOnly: boolean;
  lossyRerun: boolean;
}): HarnessV1Session {
  let stopped = false;
  let turnInFlight = turnInFlightAtStart;
  let initialGuidanceApplied = initialGuidanceAppliedAtStart;
  let instructionsFingerprint = instructionsFingerprintAtStart;
  let latestACPSessionId = acpSessionIdAtStart;
  let latestTurnStartConfig = turnStartConfigAtStart;
  const bufferedQuestionResults = new Map<
    string,
    {
      readonly output: unknown;
      readonly isError?: boolean;
      readonly toolResult: ToolResultPart;
    }
  >();

  const markTurnFinished = () => {
    turnInFlight = false;
  };
  channel.on('bridge-thread', event => {
    latestACPSessionId = event.threadId;
  });
  // A resumed continuation replays its buffered events after the new session
  // is created. Let `wireTurn` consume those events so it can forward a
  // terminal replay instead of rejecting the continuation before it starts.
  if (!turnInFlightAtStart) {
    channel.on('finish', markTurnFinished);
    channel.on('error', markTurnFinished);
    channel.onClose(markTurnFinished);
  }

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
    const activeQuestionRequests = new Map<
      string,
      {
        readonly requestId: string;
        readonly nativeRequest: unknown;
      }
    >();
    const questionToolCallIdsByRequestId = new Map<string, string>();
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
          const suppress =
            askUserQuestions?.isNativeToolCall?.({
              nativeToolCall: event.toolCall,
            }) === true;
          dynamicToolCalls.set(
            event.toolCall.toolCallId,
            isMcpToolCall?.(event.toolCall) === true,
          );
          channel.send({
            type: 'tool-result',
            toolCallId: event.requestId,
            output: { suppress },
          });
        } catch (error) {
          toolCallClassificationErrors.set(event.toolCall.toolCallId, error);
          channel.send({
            type: 'tool-result',
            toolCallId: event.requestId,
            output: { suppress: false },
          });
        }
      }),
    );
    subscriptions.push(
      channel.on('acp-question-request', event => {
        if (askUserQuestions == null) {
          channel.send({
            type: 'tool-result',
            toolCallId: event.requestId,
            output: { type: 'unhandled' },
          });
          return;
        }
        try {
          const nativeToolCall = askUserQuestions.fromNativeRequest({
            nativeRequest: event.nativeRequest,
            nativeToolCall: event.nativeToolCall,
          });
          if (nativeToolCall == null) {
            channel.send({
              type: 'tool-result',
              toolCallId: event.requestId,
              output: { type: 'unhandled' },
            });
            return;
          }
          if (
            nativeToolCall.toolName !== 'askUserQuestions' ||
            nativeToolCall.providerExecuted !== false
          ) {
            throw new Error(
              `${harnessId} ACP askUserQuestions.fromNativeRequest must return a client-executed askUserQuestions tool call.`,
            );
          }

          const toolCall = withNativeQuestionRequest({
            harnessId,
            nativeRequest: event.nativeRequest,
            toolCall: nativeToolCall,
          });
          const bufferedResult = takeBufferedQuestionResult({
            bufferedQuestionResults,
            toolCallId: toolCall.toolCallId,
            nativeRequest: event.nativeRequest,
            matchesNativeRequest: askUserQuestions.matchesNativeRequest,
            harnessId,
          });
          activeQuestionRequests.set(toolCall.toolCallId, {
            requestId: event.requestId,
            nativeRequest: event.nativeRequest,
          });
          questionToolCallIdsByRequestId.set(
            event.requestId,
            toolCall.toolCallId,
          );
          channel.send({
            type: 'tool-result',
            toolCallId: event.requestId,
            output: {
              type: 'handled',
              toolCallId: toolCall.toolCallId,
            },
          });

          if (bufferedResult == null) {
            forward(toolCall);
            return;
          }
          channel.send({
            type: 'tool-result',
            toolCallId: toolCall.toolCallId,
            output: askUserQuestions.toNativeResponse({
              nativeRequest: event.nativeRequest,
              toolResult: bufferedResult.toolResult,
            }),
            isError: bufferedResult.isError,
            toolResult: bufferedResult.toolResult,
          });
        } catch (error) {
          closeForwardedBlock();
          forward({ type: 'error', error });
          try {
            channel.send({ type: 'abort' });
          } catch {}
          settle({ error });
        }
      }),
    );
    subscriptions.push(
      channel.on('acp-question-resolved', event => {
        const toolCallId = questionToolCallIdsByRequestId.get(event.requestId);
        if (toolCallId != null) {
          activeQuestionRequests.delete(toolCallId);
          questionToolCallIdsByRequestId.delete(event.requestId);
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
        markTurnFinished();
        closeForwardedBlock();
        forward(event);
        settle(abortRequested ? { error: abortError } : {});
      }),
    );
    subscriptions.push(
      channel.on('error', event => {
        markTurnFinished();
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
      markTurnFinished();
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
        if (
          askUserQuestions != null &&
          input.toolResult?.toolName === 'askUserQuestions'
        ) {
          const activeRequest = activeQuestionRequests.get(input.toolCallId);
          if (activeRequest == null) {
            const previousNativeRequest =
              input.toolResult.providerOptions?.[harnessId]?.nativeRequest;
            if (!lossyRerun && previousNativeRequest !== undefined) {
              channel.send({
                type: 'tool-result',
                toolCallId: input.toolCallId,
                output: askUserQuestions.toNativeResponse({
                  nativeRequest: previousNativeRequest,
                  toolResult: input.toolResult,
                }),
                isError: input.isError,
                toolResult: input.toolResult,
              });
              return;
            }
            bufferedQuestionResults.set(input.toolCallId, {
              output: input.output,
              ...(input.isError == null ? {} : { isError: input.isError }),
              toolResult: input.toolResult,
            });
            return;
          }
          channel.send({
            type: 'tool-result',
            toolCallId: input.toolCallId,
            output: askUserQuestions.toNativeResponse({
              nativeRequest: activeRequest.nativeRequest,
              toolResult: input.toolResult,
            }),
            isError: input.isError,
            toolResult: input.toolResult,
          });
          return;
        }
        channel.send({
          type: 'tool-result',
          toolCallId: input.toolCallId,
          output: input.output,
          isError: input.isError,
          toolResult: input.toolResult,
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
    ...(sandboxCredentialEnvironment == null
      ? {}
      : { sandboxCredentialEnvironment }),
    ...(latestACPSessionId == null ? {} : { acpSessionId: latestACPSessionId }),
    ...(bridge == null ? {} : { bridge }),
    ...(latestTurnStartConfig == null
      ? {}
      : {
          coldSession: createACPColdSessionState({
            turnStartConfig: latestTurnStartConfig,
          }),
        }),
    ...(!includeTurnStartConfig || latestTurnStartConfig == null
      ? {}
      : { turnStartConfig: latestTurnStartConfig }),
    ...(recoveryStatus == null ? {} : { recovery: recoveryStatus }),
    ...(restoration == null ? {} : { restoration }),
    initialGuidanceApplied,
    ...(instructionsFingerprint == null ? {} : { instructionsFingerprint }),
    skillsDirectory,
  });

  const synchronizeSkills = async ({
    skills,
    abortSignal,
  }: {
    skills: ReadonlyArray<HarnessV1Skill>;
    abortSignal?: AbortSignal;
  }): Promise<void> => {
    await materializeACPSkills({
      sandbox,
      rootDir: skillsDirectory,
      sessionWorkDir,
      skills,
      abortSignal,
    });
  };

  return {
    sessionId,
    isResume,
    doPromptTurn: async options => {
      await synchronizeSkills({
        skills: options.skills,
        abortSignal: options.abortSignal,
      });
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
      const model = options.model ?? defaultModelId;
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
        model,
        modelMapping,
      });
      const nextInstructionsFingerprint = fingerprintValue({
        value: options.instructions ?? null,
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
            prompt:
              instructionsFingerprint !== nextInstructionsFingerprint &&
              (instructionMapping == null || initialGuidanceApplied)
                ? prependACPInstructionGuidance({
                    prompt,
                    instructions: options.instructions,
                  })
                : prompt,
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
            ...(model == null ? {} : { model, modelMapping }),
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
          instructionsFingerprint = nextInstructionsFingerprint;
        },
      });
      return control;
    },
    doContinueTurn: async options => {
      await synchronizeSkills({
        skills: options.skills,
        abortSignal: options.abortSignal,
      });
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
            ...(turnStartConfig.model == null
              ? {}
              : {
                  model: turnStartConfig.model,
                  modelMapping: turnStartConfig.modelMapping,
                }),
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

function withNativeQuestionRequest({
  harnessId,
  nativeRequest,
  toolCall,
}: {
  harnessId: string;
  nativeRequest: unknown;
  toolCall: Extract<HarnessV1StreamPart, { type: 'tool-call' }>;
}): Extract<HarnessV1StreamPart, { type: 'tool-call' }> {
  const harnessMetadata = toolCall.providerMetadata?.[harnessId];
  return {
    ...toolCall,
    providerMetadata: {
      ...toolCall.providerMetadata,
      [harnessId]: {
        ...(harnessMetadata ?? {}),
        nativeRequest,
      } as NonNullable<
        Extract<HarnessV1StreamPart, { type: 'tool-call' }>['providerMetadata']
      >[string],
    },
  };
}

function takeBufferedQuestionResult({
  bufferedQuestionResults,
  toolCallId,
  nativeRequest,
  matchesNativeRequest,
  harnessId,
}: {
  bufferedQuestionResults: Map<
    string,
    {
      readonly output: unknown;
      readonly isError?: boolean;
      readonly toolResult: ToolResultPart;
    }
  >;
  toolCallId: string;
  nativeRequest: unknown;
  matchesNativeRequest:
    | ACPAskUserQuestionsSettings['matchesNativeRequest']
    | undefined;
  harnessId: string;
}):
  | {
      readonly output: unknown;
      readonly isError?: boolean;
      readonly toolResult: ToolResultPart;
    }
  | undefined {
  const exact = bufferedQuestionResults.get(toolCallId);
  if (exact != null) {
    bufferedQuestionResults.delete(toolCallId);
    return exact;
  }
  if (matchesNativeRequest == null) return undefined;
  for (const [bufferedToolCallId, buffered] of bufferedQuestionResults) {
    const previousNativeRequest =
      buffered.toolResult.providerOptions?.[harnessId]?.nativeRequest;
    if (
      previousNativeRequest !== undefined &&
      matchesNativeRequest({ previousNativeRequest, nativeRequest })
    ) {
      bufferedQuestionResults.delete(bufferedToolCallId);
      return buffered;
    }
  }
  return undefined;
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
    const title =
      tool != null &&
      typeof tool === 'object' &&
      'title' in tool &&
      typeof tool.title === 'string'
        ? tool.title
        : undefined;
    const toolUseKind =
      tool != null &&
      typeof tool === 'object' &&
      'toolUseKind' in tool &&
      (tool.toolUseKind === 'readonly' ||
        tool.toolUseKind === 'edit' ||
        tool.toolUseKind === 'bash')
        ? tool.toolUseKind
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
      ...(title == null ? {} : { title }),
      ...(toolUseKind == null ? {} : { toolUseKind }),
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
  modelMapping,
  builtinTools,
  permissionModeMapping,
  mcpServers,
}: {
  turnStartConfig: ACPTurnStartConfig;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  modelMapping: ACPModelMapping;
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
    model: turnStartConfig.model,
    modelMapping,
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
  permissionMode,
  authenticationProfile,
  sessionMeta,
  instructionMapping,
  outputSchemaMapping,
  modelMapping,
  builtinTools,
  permissionModeMapping,
  mcpServers,
  debug,
}: {
  coldSession: ACPColdSessionState;
  permissionMode: NonNullable<StartMessage['permissionMode']>;
  authenticationProfile: ACPAuthenticationProfileIdentity;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  outputSchemaMapping: ACPOutputSchemaMapping | undefined;
  modelMapping: ACPModelMapping;
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
    model: undefined,
    modelMapping,
  });
  if (
    current.configurationFingerprint !== coldSession.configurationFingerprint ||
    coldSession.permissionMode !== permissionMode
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
