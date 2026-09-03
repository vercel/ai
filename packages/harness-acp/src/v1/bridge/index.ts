import {
  HarnessBridgeCapabilityUnsupportedError,
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import * as acp from '@agentclientprotocol/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { argv, env as processEnv } from 'node:process';
import {
  ACP_BRIDGE_CONFIGURATION_ENV,
  readACPBridgeEnvironment,
} from './acp-v1-bridge-environment';
import type { ACPClientApp } from '../../acp-auth';
import type { StartMessage } from '../acp-v1-bridge-protocol';
import type { ACPAuthentication } from '../acp-v1-settings';
import type { ACPGatewayValues } from './profile-values';
import {
  assertACPAuthenticationMethod,
  createACPInitializeRequest,
  resolveACPLaunchEnvironment,
  validateACPProtocolVersion,
  type ACPInitializeResult,
} from './protocol-configuration';
import { captureACPStream, type ACPStreamCapture } from './acp-stream-capture';
import {
  createACPBridgeError,
  createACPInitializationDiagnostic,
} from './acp-diagnostics';
import { monitorACPAgentStderr } from './agent-stderr-monitor';
import { createEmitStreamEvent } from './create-emit-stream-event';
import { resolveACPInstructionConfiguration } from './instruction-mapping';
import {
  startHostToolRelay,
  type HostToolRelay,
  type HostToolRelayTurn,
} from './host-tool-relay';
import {
  promptAndRefreshInitialHostToolCatalog,
  refreshHostToolCatalog,
} from './refresh-host-tool-catalog';
import { createACPPermissionController } from './permission-controller';
import { configureACPPermissionMode } from './permission-mode';
import { configureACPModel } from './model-mapping';
import {
  assertACPResumeCapability,
  createACPRecoveredSession,
  createACPRecoveredSessionUpdates,
  type ACPActiveSession,
} from './recovered-session';
import {
  restoreACPBridgeSession,
  type ACPSessionRestorationMethod,
} from './session-lifecycle';

type ImplementationDescriptor = {
  readonly executablePath: string;
  readonly privateHome: boolean;
  readonly args: ReadonlyArray<string>;
  readonly envKeys: ReadonlyArray<string>;
};

const HOST_TOOL_MCP_SERVER_NAME = 'ai-sdk-harness-tools';
const CATALOG_REFRESH_TIMEOUT_MS = 10_000;

const args = parseArgs({ args: argv.slice(2) });
const workDir = requireArg({ value: args.workDir, name: '--workdir' });
const bridgeStateDir = requireArg({
  value: args.bridgeStateDir,
  name: '--bridge-state-dir',
});
const implementationDir = requireArg({
  value: args.implementationDir,
  name: '--implementation-dir',
});
const bridgeType = requireArg({
  value: args.bridgeType,
  name: '--bridge-type',
});
const implementation = await readImplementationDescriptor({
  path: `${implementationDir}/implementation.json`,
});
const bridgeConfiguration = await readACPBridgeEnvironment({ env: processEnv });

let child: ChildProcessWithoutNullStreams | undefined;
let agentResponseStreamFailure: Promise<never> | undefined;
let connection: acp.ClientConnection | undefined;
let session: ACPActiveSession | undefined;
let recoveredSessionUpdates:
  | ReturnType<typeof createACPRecoveredSessionUpdates>
  | undefined;
let recoveredSessionId: string | undefined;
let sessionConfigurationFingerprint: string | undefined;
let streamCapture: ACPStreamCapture | undefined;
let initializationDiagnostic: Record<string, unknown> | undefined;
let hostToolRelay: HostToolRelay | undefined;
let catalogRefreshError: HarnessBridgeCapabilityUnsupportedError | undefined;
let sessionConfigurationFailure: { readonly error: unknown } | undefined;
let historicalUpdatesSuppressed = false;
let coldRestorationMethod: ACPSessionRestorationMethod | undefined;
let activePermissionController:
  | ReturnType<typeof createACPPermissionController>
  | undefined;
let activeQuestionRequest:
  | {
      method: string;
      turn: BridgeTurn;
      emitStreamEvent: ReturnType<typeof createEmitStreamEvent>;
    }
  | undefined;

await runBridge<StartMessage>({
  bridgeType,
  bridgeStateDir,
  onStart: runTurn,
  onStop: () => (session == null ? {} : { sessionId: session.sessionId }),
  onExit: () => {
    let exited = false;
    const finish = () => {
      if (exited) return;
      exited = true;
      session?.dispose();
      connection?.close();
      child?.kill();
      process.exit(0);
    };
    if (hostToolRelay == null) {
      finish();
      return;
    }
    const timer = setTimeout(finish, 1000);
    timer.unref();
    void hostToolRelay.close().finally(() => {
      clearTimeout(timer);
      finish();
    });
  },
});

async function runTurn(start: StartMessage, turn: BridgeTurn): Promise<void> {
  let initialHostToolCatalogRefreshRequired: boolean;
  try {
    ({ initialHostToolCatalogRefreshRequired } = await ensureSession({
      start,
      turn,
    }));
  } catch (error) {
    if (HarnessBridgeCapabilityUnsupportedError.isInstance(error)) throw error;
    throw createACPBridgeError({
      stage: 'session initialization',
      cause: error,
    });
  }
  const activeSession = session;
  if (activeSession == null) {
    throw new Error('ACP session initialization did not produce a session.');
  }
  const activeAgentResponseStreamFailure = agentResponseStreamFailure;
  if (activeAgentResponseStreamFailure == null) {
    throw new Error(
      'ACP session initialization did not start stderr monitoring.',
    );
  }
  const activeHostToolRelay = hostToolRelay;
  if (activeHostToolRelay == null) {
    throw new Error('The host tool MCP relay is unavailable.');
  }
  if (start.recoveryMode?.type === 'lossy-rerun') {
    const marker = {
      type: 'acp-recovery',
      mode: 'lossy-rerun',
      reason: start.recoveryMode.reason,
    } as const;
    turn.emit({ type: 'raw', rawValue: marker });
    turn.bridgeLog({
      level: 'warn',
      subsystem: 'acp.recovery',
      message:
        'The ACP process was replaced; the original prompt is being rerun against the resumed ACP session.',
      attrs: marker,
    });
    turn.emitWarning({
      message:
        'ACP process-loss recovery is rerunning the interrupted prompt and may repeat work.',
    });
  }
  turn.emit({
    type: 'bridge-thread',
    threadId: activeSession.sessionId,
  });
  if (initializationDiagnostic != null) {
    turn.bridgeLog({
      level: 'info',
      subsystem: 'acp.protocol',
      message: 'ACP session initialized.',
      attrs: initializationDiagnostic,
    });
  }
  if (start.recoveryMode?.type === 'cold-restore') {
    const marker = {
      type: 'acp-session-restored',
      method: coldRestorationMethod,
    } as const;
    turn.emit({ type: 'raw', rawValue: marker });
    turn.bridgeLog({
      level: 'info',
      subsystem: 'acp.lifecycle',
      message: 'ACP session restored in a replacement bridge process.',
      attrs: marker,
    });
    turn.emit({
      type: 'finish',
      finishReason: {
        unified: 'stop',
        raw: 'acp-session-restored',
      },
      totalUsage: unknownUsage(),
    });
    return;
  }

  await configureACPModel({
    agent: connection!.agent,
    sessionId: activeSession.sessionId,
    model: start.model,
    mapping: start.modelMapping,
  });

  let rejectCancellationFailure!: (error: unknown) => void;
  const cancellationFailure = new Promise<never>((_, reject) => {
    rejectCancellationFailure = reject;
  });
  void cancellationFailure.catch(() => {});
  let cancellationRequested = false;
  let cancellationFailureError: Error | undefined;
  const cancel = async () => {
    if (cancellationRequested) return;
    cancellationRequested = true;
    activePermissionController?.cancelAll();
    try {
      if (connection == null) {
        throw new Error('ACP connection closed before cancellation.');
      }
      await connection.agent.notify(acp.methods.agent.session.cancel, {
        sessionId: activeSession.sessionId,
      });
    } catch (error) {
      cancellationFailureError = createACPBridgeError({
        stage: 'session cancellation',
        cause: error,
      });
      rejectCancellationFailure(cancellationFailureError);
    }
  };
  turn.emit({ type: 'stream-start' });
  const emitStreamEvent = createEmitStreamEvent({
    emit: event => turn.emit(event as BridgeEvent),
    emitToolCallCandidate: ({ toolCall }) => {
      const requestId = crypto.randomUUID();
      turn.emit({
        type: 'acp-tool-call-candidate',
        requestId,
        toolCall,
      });
      void turn.requestToolResult(requestId).then(result => {
        if (
          result.output != null &&
          typeof result.output === 'object' &&
          'suppress' in result.output &&
          result.output.suppress === true
        ) {
          emitStreamEvent.suppressToolCall({
            toolCallId: toolCall.toolCallId,
          });
        }
      });
    },
    builtinTools: start.builtinTools,
    hostToolServerName: HOST_TOOL_MCP_SERVER_NAME,
    hostTools: start.tools ?? [],
  });
  if (bridgeConfiguration.askUserQuestionsRequestMethod != null) {
    activeQuestionRequest = {
      method: bridgeConfiguration.askUserQuestionsRequestMethod,
      turn,
      emitStreamEvent,
    };
  }
  const permissionController = createACPPermissionController({
    turn,
    sessionId: activeSession.sessionId,
    permissionMode: start.permissionMode ?? 'allow-all',
    hasPermissionModeMapping: start.permissionModeMapping != null,
    emitToolCall: emitStreamEvent.permissionToolCall,
    claimHostToolPermission: emitStreamEvent.claimHostToolPermission,
  });
  activePermissionController = permissionController;
  const relayTurn: HostToolRelayTurn = {
    emitToolCall: emitStreamEvent.hostToolCall,
    emitToolResult: emitStreamEvent.hostToolResult,
    requestToolResult: toolCallId => turn.requestToolResult(toolCallId),
    registerCorrelationInvocation:
      emitStreamEvent.registerHostToolCorrelationInvocation,
    removeCorrelationInvocation:
      emitStreamEvent.removeHostToolCorrelationInvocation,
  };
  activeHostToolRelay.bindTurn({ turn: relayTurn });
  try {
    const promptMeta = createOutputSchemaPromptMeta({ start });
    const startPrompt = () =>
      promptActiveSession({
        session: activeSession,
        agent: connection!.agent,
        prompt: start.prompt,
        meta: promptMeta,
      });
    if (initialHostToolCatalogRefreshRequired) {
      try {
        await promptAndRefreshInitialHostToolCatalog({
          startPrompt,
          relay: activeHostToolRelay,
          tools: start.tools ?? [],
          harnessId: bridgeType,
          timeoutMs: CATALOG_REFRESH_TIMEOUT_MS,
        });
      } catch (error) {
        if (HarnessBridgeCapabilityUnsupportedError.isInstance(error)) {
          catalogRefreshError = error;
        }
        sessionConfigurationFailure = { error };
        throw error;
      }
    } else {
      void startPrompt();
    }
    if (turn.abortSignal.aborted) {
      await cancel();
    } else {
      turn.abortSignal.addEventListener('abort', () => void cancel(), {
        once: true,
      });
    }
    for (;;) {
      let message: acp.ActiveSessionMessage;
      try {
        message = await Promise.race([
          activeSession.nextUpdate(),
          cancellationFailure,
          activeAgentResponseStreamFailure,
        ]);
      } catch (error) {
        for (const rawValue of streamCapture?.drainRawValues() ?? []) {
          emitStreamEvent.raw({ rawValue });
        }
        emitStreamEvent.close();
        if (error === cancellationFailureError) throw error;
        throw createACPBridgeError({
          stage: 'prompt update stream',
          cause: error,
        });
      }
      if (message.kind === 'session_update') {
        const captured = streamCapture?.takeForUpdate({
          update: message.update,
        });
        for (const rawValue of captured?.precedingRawValues ?? []) {
          emitStreamEvent.raw({ rawValue });
        }
        emitStreamEvent.message({
          message,
          rawUpdate: captured?.rawUpdate,
        });
        continue;
      }
      for (const rawValue of streamCapture?.drainRawValues() ?? []) {
        emitStreamEvent.raw({ rawValue });
      }
      if (emitStreamEvent.message({ message })) return;
    }
  } finally {
    if (activeQuestionRequest?.turn === turn) {
      activeQuestionRequest = undefined;
    }
    permissionController.cancelAll();
    activePermissionController = undefined;
    activeHostToolRelay.unbindTurn({ turn: relayTurn });
  }
}

async function ensureSession({
  start,
  turn,
}: {
  start: StartMessage;
  turn: BridgeTurn;
}): Promise<{ initialHostToolCatalogRefreshRequired: boolean }> {
  if (sessionConfigurationFailure != null) {
    throw sessionConfigurationFailure.error;
  }
  const fingerprint = JSON.stringify({
    authentication: bridgeConfiguration.authentication,
    providerAuthentication: bridgeConfiguration.providerAuthentication,
    providerEnvironment: bridgeConfiguration.providerEnvironment,
    sessionMeta: bridgeConfiguration.sessionMeta,
    instructionMapping: start.instructionMapping,
    permissionMode: start.permissionMode,
    permissionModeMapping: start.permissionModeMapping,
    mcpServers: start.mcpServers,
  });
  if (session != null) {
    if (catalogRefreshError != null) throw catalogRefreshError;
    if (sessionConfigurationFingerprint !== fingerprint) {
      throw new Error(
        'ACP authentication and session profile settings cannot change after the ACP session has started.',
      );
    }
    const relay = hostToolRelay;
    if (relay == null) {
      throw new Error('The host tool MCP relay is unavailable.');
    }
    try {
      await refreshHostToolCatalog({
        relay,
        tools: start.tools ?? [],
        harnessId: bridgeType,
        timeoutMs: CATALOG_REFRESH_TIMEOUT_MS,
      });
    } catch (error) {
      if (HarnessBridgeCapabilityUnsupportedError.isInstance(error)) {
        catalogRefreshError = error;
      }
      throw error;
    }
    return { initialHostToolCatalogRefreshRequired: false };
  }

  const clientApp = resolveClientApp();
  const authentication = bridgeConfiguration.authentication;
  const launchEnv =
    bridgeConfiguration.providerEnvironment ??
    resolveACPLaunchEnvironment({
      providerAuthentication: bridgeConfiguration.providerAuthentication,
      gateway:
        bridgeConfiguration.providerAuthentication?.type === 'ai-gateway'
          ? resolveGatewayValues({ clientApp })
          : undefined,
    });
  const instructionConfiguration = await resolveACPInstructionConfiguration({
    instructions: start.instructions,
    instructionMapping: start.instructionMapping,
    sessionMeta: bridgeConfiguration.sessionMeta,
    environment: {
      ...createChildEnvironment({
        launchEnv,
        implementationDir,
        privateHome: implementation.privateHome,
      }),
    },
  });
  child = spawn(
    `${implementationDir}/${implementation.executablePath}`,
    [...implementation.args],
    {
      cwd: workDir,
      env: instructionConfiguration.environment,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  agentResponseStreamFailure = monitorACPAgentStderr({
    stderr: child.stderr,
    onStderrLine: line => {
      turn.bridgeLog({
        level: 'warn',
        subsystem: 'acp.agent.stderr',
        message: line,
      });
    },
  });

  const input = Writable.toWeb(child.stdin);
  const output = Readable.toWeb(child.stdout) as ReadableStream<
    Uint8Array<ArrayBufferLike>
  >;
  const capturedStream = captureACPStream({
    stream: acp.ndJsonStream(input, output),
  });
  streamCapture = capturedStream.capture;
  let client = acp
    .client({ name: clientApp.name })
    .onRequest(
      acp.methods.client.session.requestPermission,
      ({ params }) =>
        activePermissionController?.requestPermission(params) ?? {
          outcome: { outcome: 'cancelled' },
        },
    )
    .onNotification(acp.methods.client.session.update, ({ params }) => {
      if (params.sessionId !== recoveredSessionId) return;
      if (historicalUpdatesSuppressed) return;
      recoveredSessionUpdates?.enqueue({
        kind: 'session_update',
        notification: params,
        update: params.update,
      });
    });
  if (bridgeConfiguration.askUserQuestionsRequestMethod != null) {
    const method = bridgeConfiguration.askUserQuestionsRequestMethod;
    client = client.onRequest<unknown, unknown>(
      method,
      value => value,
      async ({ params }) => {
        const active = activeQuestionRequest;
        if (active == null || active.method !== method) {
          throw acp.RequestError.methodNotFound(method);
        }
        const requestId = crypto.randomUUID();
        const nativeToolCallId = getNativeQuestionToolCallId({ params });
        active.turn.emit({
          type: 'acp-question-request',
          requestId,
          nativeRequest: params,
          ...(nativeToolCallId == null
            ? {}
            : {
                nativeToolCall:
                  active.emitStreamEvent.getToolCall({
                    toolCallId: nativeToolCallId,
                  }) ?? undefined,
              }),
        });
        const result = await active.turn.requestToolResult(requestId);
        const classification = result.output as
          | { type: 'unhandled' }
          | { type: 'handled'; toolCallId: string }
          | undefined;
        if (classification?.type !== 'handled') {
          throw acp.RequestError.methodNotFound(method);
        }
        active.emitStreamEvent.suppressToolCall({
          toolCallId: nativeToolCallId ?? classification.toolCallId,
        });
        try {
          const nativeResult = await active.turn.requestToolResult(
            classification.toolCallId,
          );
          return nativeResult.output;
        } finally {
          active.turn.emit({
            type: 'acp-question-resolved',
            requestId,
          });
        }
      },
    );
  }
  connection = client.connect(capturedStream.stream);

  const initializeRequest = createACPInitializeRequest({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientApp,
    authentication,
    clientCapabilities: bridgeConfiguration.clientCapabilities,
    supportsBooleanSessionConfigOptions: Object.values(
      start.permissionModeMapping ?? {},
    ).some(
      target =>
        target?.type === 'session-config-option' &&
        typeof target.value === 'boolean',
    ),
  });
  const initialization = await connection.agent.request<
    acp.InitializeResponse,
    typeof initializeRequest
  >(acp.methods.agent.initialize, initializeRequest);
  validateACPProtocolVersion({
    requested: acp.PROTOCOL_VERSION,
    initialization,
  });

  if (authentication != null) {
    await authenticate({
      agent: connection.agent,
      initialization,
      authentication,
    });
  }
  const externalMcpServers = createExternalMcpServers({
    mcpServers: start.mcpServers,
    initialization,
  });
  const tools = start.tools ?? [];
  const catalogPath = `${bridgeStateDir}/host-tools.json`;
  await writeFile(catalogPath, JSON.stringify(tools), { mode: 0o600 });
  hostToolRelay = await startHostToolRelay({
    tools,
    serverName: HOST_TOOL_MCP_SERVER_NAME,
  });

  const mcpServers: acp.McpServer[] = [
    ...externalMcpServers,
    {
      name: HOST_TOOL_MCP_SERVER_NAME,
      command: process.execPath,
      args: [fileURLToPath(new URL('./host-tool-mcp.mjs', import.meta.url))],
      env: [
        {
          name: 'AI_SDK_ACP_HOST_TOOLS_FILE',
          value: catalogPath,
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_URL',
          value: hostToolRelay.url,
        },
        {
          name: 'AI_SDK_ACP_HOST_TOOL_RELAY_CREDENTIAL',
          value: hostToolRelay.credential,
        },
      ],
    },
  ];
  let createdSession: ACPActiveSession;
  if (start.recoveryMode?.type === 'lossy-rerun') {
    assertACPResumeCapability({ initialization, harnessId: bridgeType });
    recoveredSessionId = start.recoveryMode.acpSessionId;
    recoveredSessionUpdates = createACPRecoveredSessionUpdates();
    const resumeResponse = await connection.agent.request<
      acp.ResumeSessionResponse,
      acp.ResumeSessionRequest
    >(acp.methods.agent.session.resume, {
      sessionId: recoveredSessionId,
      cwd: workDir,
      mcpServers,
      ...(instructionConfiguration.sessionMeta == null
        ? {}
        : { _meta: instructionConfiguration.sessionMeta }),
    });
    createdSession = createACPRecoveredSession({
      agent: connection.agent,
      sessionId: recoveredSessionId,
      restorationResponse: resumeResponse,
      updates: recoveredSessionUpdates,
    });
  } else if (start.recoveryMode?.type === 'cold-restore') {
    recoveredSessionId = start.recoveryMode.acpSessionId;
    recoveredSessionUpdates = createACPRecoveredSessionUpdates();
    const restored = await restoreACPBridgeSession({
      agent: connection.agent,
      initialization,
      sessionId: recoveredSessionId,
      cwd: workDir,
      mcpServers,
      meta: instructionConfiguration.sessionMeta,
      harnessId: bridgeType,
      setHistoricalUpdatesSuppressed: ({ suppressed }) => {
        historicalUpdatesSuppressed = suppressed;
      },
      discardCapturedHistory: () => {
        streamCapture?.drainRawValues();
      },
    });
    coldRestorationMethod = restored.method;
    createdSession = createACPRecoveredSession({
      agent: connection.agent,
      sessionId: recoveredSessionId,
      restorationResponse: restored.response,
      updates: recoveredSessionUpdates,
    });
  } else {
    createdSession = await connection.agent
      .buildSession({
        cwd: workDir,
        mcpServers,
        ...(instructionConfiguration.sessionMeta == null
          ? {}
          : { _meta: instructionConfiguration.sessionMeta }),
      })
      .start();
  }
  try {
    if (start.permissionModeMapping != null) {
      await configureACPPermissionMode({
        agent: connection.agent,
        sessionId: createdSession.sessionId,
        sessionConfiguration: createdSession.newSessionResponse,
        permissionModeMapping: start.permissionModeMapping,
        permissionMode: start.permissionMode ?? 'allow-all',
        harnessId: bridgeType,
      });
    }
  } catch (error) {
    createdSession.dispose();
    if (HarnessBridgeCapabilityUnsupportedError.isInstance(error)) {
      catalogRefreshError = error;
    }
    sessionConfigurationFailure = { error };
    throw error;
  }
  session = createdSession;
  initializationDiagnostic = createACPInitializationDiagnostic({
    initialization,
    sessionId: createdSession.sessionId,
  });
  sessionConfigurationFingerprint = fingerprint;
  return { initialHostToolCatalogRefreshRequired: tools.length > 0 };
}

function getNativeQuestionToolCallId({
  params,
}: {
  params: unknown;
}): string | undefined {
  if (!isRecord(params)) return undefined;
  if (typeof params.toolCallId === 'string') return params.toolCallId;
  const nestedParams = params.params;
  return isRecord(nestedParams) && typeof nestedParams.toolCallId === 'string'
    ? nestedParams.toolCallId
    : undefined;
}

function createExternalMcpServers({
  mcpServers,
  initialization,
}: {
  mcpServers: Record<string, unknown> | undefined;
  initialization: acp.InitializeResponse;
}): acp.McpServer[] {
  if (mcpServers == null) return [];
  return Object.entries(mcpServers).map(([name, value]) => {
    if (!isRecord(value)) {
      throw new Error(
        `ACP MCP server ${JSON.stringify(name)} must be configured with an object value.`,
      );
    }
    if (value.type === 'acp') {
      throw new HarnessBridgeCapabilityUnsupportedError({
        harnessId: bridgeType,
        message:
          'ACP-transport MCP servers require client-side mcp/connect handling, which this harness does not provide.',
      });
    }
    const mcpCapabilities = initialization.agentCapabilities?.mcpCapabilities;
    if (
      (value.type === 'http' && mcpCapabilities?.http !== true) ||
      (value.type === 'sse' && mcpCapabilities?.sse !== true)
    ) {
      throw new HarnessBridgeCapabilityUnsupportedError({
        harnessId: bridgeType,
        message: `The ACP agent does not advertise support for ${value.type.toUpperCase()} MCP servers.`,
      });
    }
    return { ...value, name } as acp.McpServer;
  });
}

function unknownUsage() {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}

async function authenticate({
  agent,
  initialization,
  authentication,
}: {
  agent: acp.ClientContext;
  initialization: ACPInitializeResult;
  authentication: ACPAuthentication;
}): Promise<void> {
  assertACPAuthenticationMethod({
    initialization,
    methodId: authentication.methodId,
  });
  await agent.request(acp.methods.agent.authenticate, {
    methodId: authentication.methodId,
    ...(authentication.meta == null ? {} : { _meta: authentication.meta }),
  });
}

function resolveClientApp(): ACPClientApp {
  const name = processEnv.AI_SDK_ACP_CLIENT_APP_NAME;
  const version = processEnv.AI_SDK_ACP_CLIENT_APP_VERSION;
  if (name == null || version == null) {
    throw new Error('ACP client app values were not supplied to the bridge.');
  }
  return { name, version };
}

function resolveGatewayValues({
  clientApp,
}: {
  clientApp: ACPClientApp;
}): ACPGatewayValues {
  const apiKey = processEnv.AI_SDK_ACP_GATEWAY_API_KEY;
  const baseUrl = processEnv.AI_SDK_ACP_GATEWAY_BASE_URL;
  if (apiKey == null || baseUrl == null) {
    throw new Error(
      'AI Gateway profile values were not supplied to the ACP bridge.',
    );
  }
  return {
    apiKey,
    baseUrl,
    clientAppName: clientApp.name,
    clientAppVersion: clientApp.version,
  };
}

function createChildEnvironment({
  launchEnv,
  implementationDir,
  privateHome,
}: {
  launchEnv: Readonly<Record<string, string>>;
  implementationDir: string;
  privateHome: boolean;
}): NodeJS.ProcessEnv {
  const blocked = new Set([
    'BRIDGE_CHANNEL_TOKEN',
    'BRIDGE_WS_PORT',
    'AI_SDK_ACP_GATEWAY_API_KEY',
    'AI_SDK_ACP_GATEWAY_BASE_URL',
    'AI_SDK_ACP_CLIENT_APP_NAME',
    'AI_SDK_ACP_CLIENT_APP_VERSION',
    ACP_BRIDGE_CONFIGURATION_ENV,
  ]);
  const environment = {
    ...Object.fromEntries(
      Object.entries(processEnv).filter(
        ([key, value]) => !blocked.has(key) && value != null,
      ),
    ),
    ...launchEnv,
  };
  if (!privateHome) return environment;

  const home = `${implementationDir}/home`;
  const inheritedPath = environment.PATH;
  return {
    ...environment,
    HOME: home,
    PATH: [
      `${home}/.local/bin`,
      ...(inheritedPath == null || inheritedPath.length === 0
        ? []
        : [inheritedPath]),
    ].join(':'),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function createOutputSchemaPromptMeta({
  start,
}: {
  start: StartMessage;
}): Record<string, unknown> | undefined {
  if (
    start.responseFormat?.type !== 'json' ||
    start.responseFormat.schema == null ||
    start.outputSchemaMapping?.type !== 'session-prompt-meta'
  ) {
    return undefined;
  }
  const root: Record<string, unknown> = {};
  let target = root;
  const path = start.outputSchemaMapping.path;
  for (let index = 0; index < path.length - 1; index++) {
    const child: Record<string, unknown> = {};
    target[path[index]!] = child;
    target = child;
  }
  target[path[path.length - 1]!] = start.responseFormat.schema;
  return root;
}

function promptActiveSession({
  session,
  agent,
  prompt,
  meta,
}: {
  session: ACPActiveSession;
  agent: acp.ClientContext;
  prompt: Array<acp.ContentBlock>;
  meta: Record<string, unknown> | undefined;
}): Promise<acp.PromptResponse> {
  if (meta == null) return session.prompt(prompt);
  if (session.promptWithMeta != null) {
    return session.promptWithMeta({ prompt, meta });
  }
  const updates = (
    session as unknown as {
      updates?: {
        clearErrors(): void;
        enqueue(value: acp.ActiveSessionMessage): void;
        reject(error: unknown): void;
      };
    }
  ).updates;
  if (updates == null) {
    throw new Error(
      'The installed ACP SDK cannot send session prompt metadata while preserving streamed updates.',
    );
  }
  updates.clearErrors();
  const response = agent.request<acp.PromptResponse, acp.PromptRequest>(
    acp.methods.agent.session.prompt,
    {
      sessionId: session.sessionId,
      prompt,
      _meta: meta,
    },
  );
  void response.then(
    value => {
      updates.enqueue({
        kind: 'stop',
        response: value,
        stopReason: value.stopReason,
      });
    },
    error => updates.reject(error),
  );
  return response;
}

async function readImplementationDescriptor({
  path,
}: {
  path: string;
}): Promise<ImplementationDescriptor> {
  const text = await readFile(path, 'utf8');
  const value = await new Response(text, {
    headers: { 'content-type': 'application/json' },
  }).json();
  if (
    !isRecord(value) ||
    typeof value.executablePath !== 'string' ||
    typeof value.privateHome !== 'boolean' ||
    !Array.isArray(value.args) ||
    !value.args.every(item => typeof item === 'string') ||
    !Array.isArray(value.envKeys) ||
    !value.envKeys.every(item => typeof item === 'string')
  ) {
    throw new Error('Invalid ACP implementation descriptor.');
  }
  return {
    executablePath: value.executablePath,
    privateHome: value.privateHome,
    args: value.args as string[],
    envKeys: value.envKeys as string[],
  };
}

function parseArgs({ args }: { args: ReadonlyArray<string> }): {
  workDir?: string;
  bridgeStateDir?: string;
  implementationDir?: string;
  bridgeType?: string;
} {
  const result: {
    workDir?: string;
    bridgeStateDir?: string;
    implementationDir?: string;
    bridgeType?: string;
  } = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1];
    if (value == null) continue;
    if (args[index] === '--workdir') result.workDir = value;
    else if (args[index] === '--bridge-state-dir')
      result.bridgeStateDir = value;
    else if (args[index] === '--implementation-dir')
      result.implementationDir = value;
    else if (args[index] === '--bridge-type') result.bridgeType = value;
  }
  return result;
}

function requireArg({
  value,
  name,
}: {
  value: string | undefined;
  name: string;
}): string {
  if (value == null || value.length === 0) {
    throw new Error(`Missing ${name} argument.`);
  }
  return value;
}
