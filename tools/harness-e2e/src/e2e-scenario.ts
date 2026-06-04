import { randomUUID } from 'node:crypto';
import type { HarnessV1, HarnessV1SandboxProvider } from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { ToolSet } from 'ai';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import {
  fixturePath,
  leaseSessionPorts,
  resolveGatewayCredential,
  resolveRunMode,
  type RunMode,
} from './e2e-shared';
import { startHostFetchInterception } from './interception/host-fetch-interceptor';
import { startProxyInterception } from './interception/proxy-interceptor';
import { getReplayAdapter } from './replay-adapters';

const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const SANDBOX_RUNTIME = 'node24';

export interface ScenarioContext {
  agent: HarnessAgent<HarnessV1, ToolSet>;
  session: HarnessAgentSession;
  mode: RunMode;
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
  opts: {
    adapterName: string;
    scenario: string;
    tools?: ToolSet;
    instructions?: string;
    abortSignal?: AbortSignal;
  },
  fn: (ctx: ScenarioContext) => Promise<void>,
): Promise<void> {
  const mode = resolveRunMode(opts.adapterName, opts.scenario);
  if (mode === 'skip') {
    throw new Error(
      `Scenario "${opts.scenario}" for "${opts.adapterName}" is not runnable in this mode; ` +
        `gate the test with shouldRunScenario(...).`,
    );
  }

  const adapter = getReplayAdapter(opts.adapterName);
  const fixture = fixturePath(opts.adapterName, opts.scenario);
  const sessionId = `e2e-${opts.scenario}-${opts.adapterName}-${randomUUID()}`;
  const harness = adapter.createHarness(resolveGatewayCredential(mode));

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
    });
    provider = createVercelSandbox({
      runtime: SANDBOX_RUNTIME,
      timeout: SANDBOX_TIMEOUT_MS,
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
  const session = await agent.createSession({
    sessionId,
    ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  });

  try {
    await fn({ agent, session, mode });
  } finally {
    await Promise.resolve(session.close()).catch(() => {});
    if (onComplete) await onComplete().catch(() => {});
    for (const step of teardown.reverse()) {
      await Promise.resolve(step()).catch(() => {});
    }
  }
}
