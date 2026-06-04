import { randomUUID } from 'node:crypto';
import type {
  HarnessV1,
  HarnessV1ProviderSettings,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { ToolSet } from 'ai';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { HttpHandler } from 'harness-http-proxy';
import {
  fixturePath,
  type GatewayCredential,
  leaseSessionPorts,
  resolveGatewayCredential,
  resolveRunMode,
  type RunMode,
} from './e2e-shared';
import { startHostFetchInterception } from './interception/host-fetch-interceptor';
import {
  type InterceptionMode,
  startProxyInterception,
} from './interception/proxy-interceptor';
import { getReplayAdapter } from './replay-adapters';

const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const SANDBOX_RUNTIME = 'node24';

/**
 * Extra harness settings shallow-merged over the adapter's pinned model/auth.
 * Either a static object (`{ thinking: 'adaptive' }`) or a function of the
 * resolved gateway credential — pi's `customEnv` scenario needs the latter, as
 * its auth carries the (real on record / dummy on replay) credential.
 */
export type HarnessSettingsOverride =
  | Record<string, unknown>
  | ((credential: GatewayCredential) => Record<string, unknown>);

/**
 * The tool-safe sandbox surface the provider `setup` hook hands back (file I/O,
 * exec, spawn). Derived from the hook's own signature so it tracks the harness
 * type without us re-importing the underlying provider-utils alias.
 */
type CapturedSandbox = Parameters<
  NonNullable<HarnessV1ProviderSettings['setup']>
>[0]['session'];

export interface ScenarioContext {
  agent: HarnessAgent<HarnessV1, ToolSet>;
  session: HarnessAgentSession;
  mode: RunMode;
  /**
   * Tool-safe sandbox surface, present only when `captureSandbox` was set.
   * Captured via the provider `setup` hook (which runs before the bridge
   * spawn), so it is available for the whole `fn` body.
   */
  sandbox?: CapturedSandbox;
  /** The session's working directory, present only when `captureSandbox` was set. */
  sandboxWorkDir?: string;
}

/** Options shared by the single- and two-session scenario runners. */
export interface ScenarioBuildOptions {
  adapterName: string;
  scenario: string;
  tools?: ToolSet;
  instructions?: string;
  abortSignal?: AbortSignal;
  /** Adapter-specific settings (thinking, reasoningEffort, pi customEnv). */
  harnessSettings?: HarnessSettingsOverride;
  /** Capture the sandbox session + workDir into the `ScenarioContext`. */
  captureSandbox?: boolean;
  /** Always-used handler bypassing fixtures (synthetic error / abort scenarios). */
  syntheticHandler?: HttpHandler;
}

interface PreparedScenario {
  mode: RunMode;
  sessionId: string;
  agent: HarnessAgent<HarnessV1, ToolSet>;
  /** Record-mode fixture save (single call after all sessions complete). */
  onComplete?: () => Promise<void>;
  teardown: Array<() => Promise<void> | void>;
  getSandbox: () => CapturedSandbox | undefined;
  getSandboxWorkDir: () => string | undefined;
}

/**
 * Resolve the run mode, build the pinned harness, stand up the interception
 * path (proxy / host-fetch / live), and construct the agent — everything up to
 * but not including session creation. Shared by both runners so the
 * interception wiring lives in one place.
 */
async function prepareScenario(
  opts: ScenarioBuildOptions,
): Promise<PreparedScenario> {
  // Synthetic scenarios serve a canned error and never touch a fixture, so they
  // bypass fixture-based mode resolution and run in a credential-free replay.
  const mode: RunMode = opts.syntheticHandler
    ? 'replay'
    : (() => {
        const resolved = resolveRunMode(opts.adapterName, opts.scenario);
        if (resolved === 'skip') {
          throw new Error(
            `Scenario "${opts.scenario}" for "${opts.adapterName}" is not runnable in this mode; ` +
              `gate the test with shouldRunScenario(...).`,
          );
        }
        return resolved;
      })();

  const adapter = getReplayAdapter(opts.adapterName);
  const fixture = fixturePath(opts.adapterName, opts.scenario);
  const sessionId = `e2e-${opts.scenario}-${opts.adapterName}-${randomUUID()}`;
  const credential = resolveGatewayCredential(mode);
  const overrides =
    typeof opts.harnessSettings === 'function'
      ? opts.harnessSettings(credential)
      : opts.harnessSettings;
  const harness = adapter.createHarness(credential, overrides);

  let capturedSandbox: CapturedSandbox | undefined;
  let capturedWorkDir: string | undefined;
  const setup: HarnessV1ProviderSettings['setup'] | undefined =
    opts.captureSandbox
      ? async ({ session: sandboxSession, sessionWorkDir }) => {
          capturedSandbox = sandboxSession;
          capturedWorkDir = sessionWorkDir;
        }
      : undefined;

  let provider: HarnessV1SandboxProvider;
  let onComplete: (() => Promise<void>) | undefined;
  const teardown: Array<() => Promise<void> | void> = [];

  if (mode === 'live') {
    const ports =
      adapter.interception === 'proxy' ? [leaseSessionPorts().bridgePort] : [];
    provider = createVercelSandbox({
      runtime: SANDBOX_RUNTIME,
      timeout: SANDBOX_TIMEOUT_MS,
      ...(ports.length > 0 ? { ports } : {}),
      ...(setup !== undefined ? { setup } : {}),
    });
  } else if (adapter.interception === 'proxy') {
    const { bridgePort, proxyWsPort } = leaseSessionPorts();
    const interception = await startProxyInterception({
      adapterName: opts.adapterName,
      scenario: opts.scenario,
      fixturePath: fixture,
      mode,
      bridgePort,
      proxyWsPort,
      sessionId,
      createParams: { runtime: SANDBOX_RUNTIME, timeout: SANDBOX_TIMEOUT_MS },
      ...(setup !== undefined ? { setup } : {}),
      ...(opts.syntheticHandler
        ? { syntheticHandler: opts.syntheticHandler }
        : {}),
      ...(opts.abortSignal ? { signal: opts.abortSignal } : {}),
    });
    provider = interception.provider;
    if (mode === 'record') onComplete = interception.save;
    teardown.push(interception.stop);
  } else {
    const interception = startHostFetchInterception({
      adapterName: opts.adapterName,
      scenario: opts.scenario,
      fixturePath: fixture,
      mode,
      sessionId,
      ...(adapter.interceptHosts
        ? { interceptHosts: [...adapter.interceptHosts] }
        : {}),
      ...(opts.syntheticHandler
        ? { syntheticHandler: opts.syntheticHandler }
        : {}),
    });
    provider = createVercelSandbox({
      runtime: SANDBOX_RUNTIME,
      timeout: SANDBOX_TIMEOUT_MS,
      ...(setup !== undefined ? { setup } : {}),
    });
    if (mode === 'record') onComplete = interception.save;
    teardown.push(() => interception.restore());
  }

  const agent = new HarnessAgent({
    harness,
    sandbox: provider,
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.instructions ? { instructions: opts.instructions } : {}),
  });

  return {
    mode,
    sessionId,
    agent,
    ...(onComplete !== undefined ? { onComplete } : {}),
    teardown,
    getSandbox: () => capturedSandbox,
    getSandboxWorkDir: () => capturedWorkDir,
  };
}

async function runTeardown(prepared: PreparedScenario): Promise<void> {
  if (prepared.onComplete) await prepared.onComplete().catch(() => {});
  for (const step of prepared.teardown.reverse()) {
    await Promise.resolve(step()).catch(() => {});
  }
}

function buildContext(
  prepared: PreparedScenario,
  session: HarnessAgentSession,
): ScenarioContext {
  const sandbox = prepared.getSandbox();
  const sandboxWorkDir = prepared.getSandboxWorkDir();
  return {
    agent: prepared.agent,
    session,
    mode: prepared.mode,
    ...(sandbox !== undefined ? { sandbox } : {}),
    ...(sandboxWorkDir !== undefined ? { sandboxWorkDir } : {}),
  };
}

/**
 * Run one scenario end-to-end against a real adapter, with its model HTTP
 * recorded to / replayed from the scenario's fixture.
 *
 * - claude-code / codex: the in-sandbox MITM proxy intercepts the bridge's LLM
 *   HTTP (the harness bootstrap installs the CLI over a clean network).
 * - pi: the model runs on the host, so a scoped `globalThis.fetch` override
 *   intercepts it; the sandbox is still used for filesystem/shell.
 * - live mode: no interception — a plain sandbox and the real network.
 *
 * Gate the calling `it(...)` with `shouldRunScenario(adapter, scenario)`; this
 * throws if invoked for a non-runnable combination.
 */
export async function withReplayScenarioAgent(
  opts: ScenarioBuildOptions,
  fn: (ctx: ScenarioContext) => Promise<void>,
): Promise<void> {
  const prepared = await prepareScenario(opts);
  const session = await prepared.agent.createSession({
    sessionId: prepared.sessionId,
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  try {
    await fn(buildContext(prepared, session));
  } finally {
    await Promise.resolve(session.close()).catch(() => {});
    await runTeardown(prepared);
  }
}

/**
 * Two-session persistence runner. Holds one interception (one sandbox + proxy)
 * alive across both sessions: the first session runs, then `detach()` captures
 * its resume state, and a second session resumes the same named sandbox with
 * that state. The fixture (record mode) accumulates both turns; it is saved
 * once after the second session.
 *
 * Because the proxied/host sandbox is caller-owned (`ownsLifecycle: false`),
 * `detach()` does not stop it — the proxy stays up and the resumed session
 * reattaches to the same live sandbox, so filesystem state written in the first
 * session is visible in the second.
 */
export async function withReplayPersistenceAgents(
  opts: ScenarioBuildOptions,
  first: (ctx: ScenarioContext) => Promise<void>,
  second: (ctx: ScenarioContext) => Promise<void>,
): Promise<void> {
  const prepared = await prepareScenario(opts);
  let firstSession: HarnessAgentSession | undefined;
  let secondSession: HarnessAgentSession | undefined;

  try {
    firstSession = await prepared.agent.createSession({
      sessionId: prepared.sessionId,
    });
    await first(buildContext(prepared, firstSession));

    const resumeState = await firstSession.detach();
    firstSession = undefined;

    secondSession = await prepared.agent.createSession({
      sessionId: prepared.sessionId,
      resumeFrom: resumeState,
    });
    await second(buildContext(prepared, secondSession));
  } finally {
    if (secondSession) {
      await Promise.resolve(secondSession.close()).catch(() => {});
    }
    if (firstSession) {
      await Promise.resolve(firstSession.close()).catch(() => {});
    }
    await runTeardown(prepared);
  }
}

export interface SharedSandboxContext {
  mode: RunMode;
  /** Spin up another agent bound to the one shared, proxied sandbox. */
  makeAgent: () => HarnessAgent<HarnessV1, ToolSet>;
  /** Tool-safe surface of the shared sandbox (captured on first session). */
  getSandbox: () => CapturedSandbox | undefined;
  /** Working directory of the first captured session. */
  getSandboxWorkDir: () => string | undefined;
}

/**
 * Shared-sandbox runner (proxy adapters only). Stands up one caller-owned,
 * proxied sandbox with a bridge-port pool, then hands the test a factory to
 * create multiple agents on it. All agents share one provider instance so the
 * bridge-port leasing coordinates (each session leases a distinct port), and
 * all route their LLM HTTP through the single shared proxy/handler/fixture.
 */
export async function withReplaySharedSandbox(
  opts: {
    adapterName: string;
    scenario: string;
    tools?: ToolSet;
    bridgePoolSize?: number;
  },
  fn: (ctx: SharedSandboxContext) => Promise<void>,
): Promise<void> {
  const mode = resolveRunMode(opts.adapterName, opts.scenario);
  if (mode === 'skip') {
    throw new Error(
      `Scenario "${opts.scenario}" for "${opts.adapterName}" is not runnable in this mode; ` +
        `gate the test with shouldRunScenario(...).`,
    );
  }

  const adapter = getReplayAdapter(opts.adapterName);
  if (adapter.interception !== 'proxy') {
    throw new Error(
      `withReplaySharedSandbox is proxy-only; "${opts.adapterName}" uses ${adapter.interception}.`,
    );
  }

  // Shared-sandbox always rides the proxy; LIVE collapses to a fresh recording.
  const interceptionMode: InterceptionMode =
    mode === 'replay' ? 'replay' : 'record';
  const harness = adapter.createHarness(resolveGatewayCredential(mode));
  const fixture = fixturePath(opts.adapterName, opts.scenario);
  const sessionId = `e2e-${opts.scenario}-${opts.adapterName}-${randomUUID()}`;

  const poolSize = opts.bridgePoolSize ?? 2;
  const pairs = Array.from({ length: poolSize }, () => leaseSessionPorts());
  const bridgePorts = pairs.map(pair => pair.bridgePort);
  const proxyWsPort = pairs[0].proxyWsPort;

  let capturedSandbox: CapturedSandbox | undefined;
  let capturedWorkDir: string | undefined;
  const setup: HarnessV1ProviderSettings['setup'] = async ({
    session: sandboxSession,
    sessionWorkDir,
  }) => {
    if (capturedSandbox == null) {
      capturedSandbox = sandboxSession;
      capturedWorkDir = sessionWorkDir;
    }
  };

  const interception = await startProxyInterception({
    adapterName: opts.adapterName,
    scenario: opts.scenario,
    fixturePath: fixture,
    mode: interceptionMode,
    bridgePort: bridgePorts[0],
    bridgePorts,
    proxyWsPort,
    sessionId,
    createParams: { runtime: SANDBOX_RUNTIME, timeout: SANDBOX_TIMEOUT_MS },
    setup,
  });

  const makeAgent = () =>
    new HarnessAgent({
      harness,
      sandbox: interception.provider,
      ...(opts.tools ? { tools: opts.tools } : {}),
    });

  try {
    await fn({
      mode,
      makeAgent,
      getSandbox: () => capturedSandbox,
      getSandboxWorkDir: () => capturedWorkDir,
    });
  } finally {
    if (interceptionMode === 'record')
      await interception.save().catch(() => {});
    await interception.stop().catch(() => {});
  }
}
