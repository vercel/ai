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
import { createEmitStreamEvent } from './create-emit-stream-event';
import {
  startHostToolRelay,
  type HostToolRelay,
  type HostToolRelayTurn,
} from './host-tool-relay';
import { refreshHostToolCatalog } from './refresh-host-tool-catalog';
import { createACPPermissionController } from './permission-controller';
import { configureACPPermissionMode } from './permission-mode';
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
  readonly executable: string;
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
  try {
    await ensureSession({ start, turn });
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
    builtinTools: start.builtinTools,
    hostToolServerName: HOST_TOOL_MCP_SERVER_NAME,
    hostTools: start.tools ?? [],
  });
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
  hostToolRelay?.bindTurn({ turn: relayTurn });
  try {
    void activeSession.prompt(start.prompt);
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
    permissionController.cancelAll();
    activePermissionController = undefined;
    hostToolRelay?.unbindTurn({ turn: relayTurn });
  }
}

async function ensureSession({
  start,
  turn,
}: {
  start: StartMessage;
  turn: BridgeTurn;
}): Promise<void> {
  if (sessionConfigurationFailure != null) {
    throw sessionConfigurationFailure.error;
  }
  const fingerprint = JSON.stringify({
    authentication: bridgeConfiguration.authentication,
    providerAuthentication: bridgeConfiguration.providerAuthentication,
    sessionMeta: bridgeConfiguration.sessionMeta,
    permissionMode: start.permissionMode,
    permissionModeMapping: start.permissionModeMapping,
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
    return;
  }

  const clientApp = resolveClientApp();
  const gateway =
    bridgeConfiguration.providerAuthentication?.type === 'ai-gateway'
      ? resolveGatewayValues({ clientApp })
      : undefined;
  const authentication = bridgeConfiguration.authentication;
  const launchEnv = resolveACPLaunchEnvironment({
    providerAuthentication: bridgeConfiguration.providerAuthentication,
    gateway,
  });
  child = spawn(
    `${implementationDir}/node_modules/.bin/${implementation.executable}`,
    [...implementation.args],
    {
      cwd: workDir,
      env: createChildEnvironment({ launchEnv }),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  forwardAgentStderr({ child, turn });

  const input = Writable.toWeb(child.stdin);
  const output = Readable.toWeb(child.stdout) as ReadableStream<
    Uint8Array<ArrayBufferLike>
  >;
  const capturedStream = captureACPStream({
    stream: acp.ndJsonStream(input, output),
  });
  streamCapture = capturedStream.capture;
  connection = acp
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
    })
    .connect(capturedStream.stream);

  const initializeRequest = createACPInitializeRequest({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientApp,
    authentication,
    supportsBooleanSessionConfigOptions: Object.values(
      start.permissionModeMapping ?? {},
    ).some(
      target =>
        target.type === 'session-config-option' &&
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
  const tools = start.tools ?? [];
  const catalogPath = `${bridgeStateDir}/host-tools.json`;
  await writeFile(catalogPath, JSON.stringify(tools), { mode: 0o600 });
  hostToolRelay = await startHostToolRelay({
    tools,
    serverName: HOST_TOOL_MCP_SERVER_NAME,
  });

  const mcpServers: acp.McpServer[] = [
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
      ...(bridgeConfiguration.sessionMeta == null
        ? {}
        : { _meta: bridgeConfiguration.sessionMeta }),
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
      meta: bridgeConfiguration.sessionMeta,
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
        ...(bridgeConfiguration.sessionMeta == null
          ? {}
          : { _meta: bridgeConfiguration.sessionMeta }),
      })
      .start();
  }
  try {
    await refreshHostToolCatalog({
      relay: hostToolRelay,
      tools,
      harnessId: bridgeType,
      timeoutMs: CATALOG_REFRESH_TIMEOUT_MS,
    });
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
}: {
  launchEnv: Readonly<Record<string, string>>;
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
  return {
    ...Object.fromEntries(
      Object.entries(processEnv).filter(
        ([key, value]) => !blocked.has(key) && value != null,
      ),
    ),
    ...launchEnv,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function forwardAgentStderr({
  child,
  turn,
}: {
  child: ChildProcessWithoutNullStreams;
  turn: BridgeTurn;
}): void {
  void (async () => {
    child.stderr.setEncoding('utf8');
    let pending = '';
    for await (const chunk of child.stderr) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length === 0) continue;
        turn.bridgeLog({
          level: 'warn',
          subsystem: 'acp.agent.stderr',
          message: line,
        });
      }
    }
    if (pending.length > 0) {
      turn.bridgeLog({
        level: 'warn',
        subsystem: 'acp.agent.stderr',
        message: pending,
      });
    }
  })();
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
    typeof value.executable !== 'string' ||
    !Array.isArray(value.args) ||
    !value.args.every(item => typeof item === 'string') ||
    !Array.isArray(value.envKeys) ||
    !value.envKeys.every(item => typeof item === 'string')
  ) {
    throw new Error('Invalid ACP implementation descriptor.');
  }
  return {
    executable: value.executable,
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
