import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import {
  createBridgeStartupError,
  drainBridgeProcessStream,
  forwardBridgeProcessStream,
  getRestrictedSandboxSession,
  markBridgeStarting,
  resolveSandboxDefaultWorkingDirectory,
  SandboxChannel,
  shellQuote,
  waitForBridgeReady,
} from '@ai-sdk/harness/utils';
import type { ConnectOptions, LaunchOptions } from '@1jehuang/jcode-sdk';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { WebSocket } from 'ws';
import { JCODE_BOOTSTRAP_DIR, getJcodeBootstrap } from './jcode-bootstrap';
import {
  jcodeBridgeOutboundMessageSchema,
  type JcodeBridgeOutboundMessage,
  type JcodeBridgeStartMessage,
} from './jcode-bridge-protocol';
import {
  createJcodeBridgeSession,
  type JcodeBridgeChannel,
} from './jcode-bridge-session';
import {
  launchJcodeClient,
  takeParkedJcodeClient,
  type JcodeClientFactory,
} from './jcode-client';
import { jcodeResumeDataSchema } from './jcode-resume-state';
import { createJcodeSession } from './jcode-session';
import { VERSION } from './version';

export interface JcodeHarnessSettings {
  /**
   * Explicitly run Jcode on the adapter host instead of inside the supplied
   * sandbox. Experimental and unsafe for remote or untrusted workspaces.
   */
  readonly experimentalHostExecution?: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly jcodeHome?: string;
  readonly inheritLogins?: boolean;
  readonly binary?: string;
  /** Environment forwarded to the in-sandbox bridge, including API keys or gateway auth. */
  readonly env?: Readonly<Record<string, string>>;
  readonly startupTimeoutMs?: number;
  readonly inheritStderr?: boolean;
  /** Override the bridge port. Defaults to the first port exposed by the sandbox. */
  readonly port?: number;
  /** Host endpoint for a basic sandbox session. Required together with `port`. */
  readonly portEndpoint?: HarnessV1PortEndpoint;
  /** Creates the bridge token. Defaults to a random 32-byte hexadecimal token. */
  readonly mintBridgeToken?: (sandboxId: string) => string;
  /** Dependency-injection seam for conformance tests and custom host runtimes. */
  readonly clientFactory?: JcodeClientFactory;
}

export function createJcode(
  settings: JcodeHarnessSettings = {},
): HarnessV1<Record<string, never>> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'jcode',
    builtinTools: {},
    supportsBuiltinToolApprovals: false,
    supportsBuiltinToolFiltering: false,
    lifecycleStateSchema: jcodeResumeDataSchema,
    getBootstrap: getJcodeBootstrap,
    async doStart(options) {
      if (options.builtinToolFiltering != null) {
        throw unsupported('built-in tool filtering is not supported');
      }
      if (settings.experimentalHostExecution) {
        return startHostSession(settings, options);
      }

      const sandboxSession = options.sandboxSession;
      validateBasicSandboxSettings({
        sandboxSession,
        port: settings.port,
        portEndpoint: settings.portEndpoint,
      });
      const sandboxId = 'id' in sandboxSession ? sandboxSession.id : undefined;
      if (settings.mintBridgeToken && !sandboxId) {
        throw unsupported(
          '`mintBridgeToken` requires a sandbox session that exposes an id',
        );
      }
      const sandbox = getRestrictedSandboxSession(sandboxSession);
      const defaultWorkingDirectory =
        await resolveSandboxDefaultWorkingDirectory({
          sandboxSession,
          abortSignal: options.abortSignal,
        });
      const resumeData = (options.continueFrom ?? options.resumeFrom)?.data
        ? jcodeResumeDataSchema.parse(
            (options.continueFrom ?? options.resumeFrom)!.data,
          )
        : undefined;
      if (options.continueFrom) {
        throw unsupported('turn continuation is not supported yet');
      }

      const bootstrapDir = path.posix.resolve(
        defaultWorkingDirectory,
        JCODE_BOOTSTRAP_DIR,
      );
      const sessionDataDir = `${defaultWorkingDirectory}/.agent-runs/${options.sessionId}`;
      const bridgeStateDir = `${sessionDataDir}/bridge`;
      const jcodeHome =
        resumeData?.jcodeHome ??
        settings.jcodeHome ??
        `${sessionDataDir}/jcode-home`;
      const port = resolveBridgePort({
        sandboxSession,
        override: settings.port,
      });
      const token = settings.mintBridgeToken
        ? settings.mintBridgeToken(sandboxId!)
        : randomBytes(32).toString('hex');

      await sandbox.run({
        command: `mkdir -p ${shellQuote(options.sessionWorkDir)} ${shellQuote(bridgeStateDir)} ${shellQuote(jcodeHome)}`,
        abortSignal: options.abortSignal,
      });
      await markBridgeStarting({
        sandbox,
        bridgeStateDir,
        bridgeType: 'jcode',
        abortSignal: options.abortSignal,
      });

      const proc = await sandbox.spawn({
        command: `node ${shellQuote(`${bootstrapDir}/bridge.mjs`)} --workdir ${shellQuote(options.sessionWorkDir)} --bridge-state-dir ${shellQuote(bridgeStateDir)} --jcode-home ${shellQuote(jcodeHome)}`,
        env: {
          ...settings.env,
          BRIDGE_CHANNEL_TOKEN: token,
          BRIDGE_WS_PORT: String(port),
        },
        abortSignal: options.abortSignal,
      });
      const stderrTail: string[] = [];
      const stderrDone = forwardBridgeProcessStream({
        stream: proc.stderr,
        streamName: 'stderr',
        source: 'jcode',
        collectTail: stderrTail,
      });
      const { port: boundPort } = await waitForBridgeReady({
        proc,
        sandbox,
        bridgeStateDir,
        bridgeType: 'jcode',
        timeoutMs: settings.startupTimeoutMs ?? 120_000,
        abortSignal: options.abortSignal,
        createTimeoutError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'jcode bridge did not become ready in time.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone,
          }),
        createExitError: ({ proc, stdoutTail }) =>
          createBridgeStartupError({
            message: 'jcode bridge exited before becoming ready.',
            proc,
            stdoutTail,
            stderrTail,
            stderrDone,
          }),
      });
      void drainBridgeProcessStream(proc.stdout);

      const endpoint = await resolveBridgeEndpoint({
        sandboxSession,
        override: settings.portEndpoint,
        port: boundPort,
      });
      const channel: JcodeBridgeChannel = new SandboxChannel<
        JcodeBridgeOutboundMessage,
        | JcodeBridgeStartMessage
        | { type: 'abort' }
        | { type: 'stop' }
        | { type: 'destroy' }
      >({
        connect: () => openWebSocket(withBridgeToken({ endpoint, token })),
        outboundSchema: jcodeBridgeOutboundMessageSchema,
      });
      await channel.open();

      return createJcodeBridgeSession({
        sessionId: options.sessionId,
        channel,
        proc,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        resumeJcodeSessionId: resumeData?.jcodeSessionId,
        jcodeHome,
      });
    },
  };
}

async function startHostSession(
  settings: JcodeHarnessSettings,
  options: Parameters<ReturnType<typeof createJcode>['doStart']>[0],
) {
  const lifecycle = options.continueFrom ?? options.resumeFrom;
  if (options.continueFrom) {
    throw unsupported('turn continuation is not supported yet');
  }
  const resumeData = lifecycle?.data
    ? jcodeResumeDataSchema.parse(lifecycle.data)
    : undefined;
  const launchOptions: LaunchOptions & ConnectOptions = {
    workingDir: options.sessionWorkDir,
    ...((resumeData?.jcodeHome ?? settings.jcodeHome)
      ? { jcodeHome: resumeData?.jcodeHome ?? settings.jcodeHome }
      : {}),
    ...(settings.inheritLogins == null
      ? {}
      : { inheritLogins: settings.inheritLogins }),
    ...(settings.binary ? { binary: settings.binary } : {}),
    ...(settings.env ? { env: { ...settings.env } } : {}),
    ...(settings.startupTimeoutMs == null
      ? {}
      : { startupTimeoutMs: settings.startupTimeoutMs }),
    ...(settings.inheritStderr == null
      ? {}
      : { inheritStderr: settings.inheritStderr }),
    clientName: `ai-sdk/harness-jcode/${VERSION}`,
  };
  const client =
    (resumeData?.jcodeSessionId
      ? takeParkedJcodeClient(resumeData.jcodeSessionId)
      : undefined) ??
    (await (settings.clientFactory ?? launchJcodeClient)(launchOptions));
  return createJcodeSession({
    client,
    sessionId: options.sessionId,
    sessionWorkDir: options.sessionWorkDir,
    resumeJcodeSessionId: resumeData?.jcodeSessionId,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    abortSignal: options.abortSignal,
  });
}

function resolveBridgePort({
  sandboxSession,
  override,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | Experimental_SandboxSession;
  override?: number;
}): number {
  if (override != null) return override;
  if ('ports' in sandboxSession && sandboxSession.ports.length > 0) {
    return sandboxSession.ports[0];
  }
  throw unsupported(
    'a TCP port must be exposed by the sandbox or configured with `port`',
  );
}

function validateBasicSandboxSettings({
  sandboxSession,
  port,
  portEndpoint,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | Experimental_SandboxSession;
  port?: number;
  portEndpoint?: HarnessV1PortEndpoint;
}) {
  if ('getPortEndpoint' in sandboxSession) return;
  if (port == null || portEndpoint == null) {
    throw unsupported(
      'basic sandbox sessions require explicit `port` and `portEndpoint` settings',
    );
  }
}

async function resolveBridgeEndpoint({
  sandboxSession,
  override,
  port,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | Experimental_SandboxSession;
  override?: HarnessV1PortEndpoint;
  port: number;
}): Promise<HarnessV1PortEndpoint> {
  if (override) return override;
  if ('getPortEndpoint' in sandboxSession) {
    return sandboxSession.getPortEndpoint({ port, protocol: 'ws' });
  }
  throw unsupported(
    'basic sandbox sessions require an explicit `portEndpoint`',
  );
}

function withBridgeToken({
  endpoint,
  token,
}: {
  endpoint: HarnessV1PortEndpoint;
  token: string;
}): HarnessV1PortEndpoint {
  const url = new URL(endpoint.url);
  url.searchParams.set('token', token);
  return { ...endpoint, url: url.toString() };
}

function openWebSocket(endpoint: HarnessV1PortEndpoint): Promise<WebSocket> {
  const socket = new WebSocket(endpoint.url, { headers: endpoint.headers });
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function unsupported(message: string): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    harnessId: 'jcode',
    message: `jcode: ${message}`,
  });
}
