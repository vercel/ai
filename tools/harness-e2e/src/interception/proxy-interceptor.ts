import { createProxiedSandbox, type HttpHandler } from 'harness-http-proxy';
import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import type { ReplayRuntimeIdentity } from '../http-fixture';
import {
  createRecordingHandler,
  createReplayHandler,
} from '../record-replay-handler';

const DEFAULT_PROXY_PORT = 41007;

export type InterceptionMode = 'record' | 'replay';

export interface ProxyInterception {
  /** Provider to hand to `HarnessAgent` (proxy env scoped to the bridge spawn). */
  provider: HarnessV1SandboxProvider;
  /** Session id the proxy registered; reuse as the `HarnessAgent` session id. */
  sessionId: string;
  /**
   * Volatile per-run identity. Only `sessionId` is meaningful: the Vercel
   * sandbox name and the workdir/bridge paths all embed it, and placeholder
   * replacement substitutes the sessionId substring anywhere it appears — so
   * fixtureizing it transitively redacts those paths. Sandbox-path *matching*
   * on replay is handled by the normalize layer.
   */
  identity: ReplayRuntimeIdentity;
  /** Record mode: write the redaction-audited fixture. Replay mode: no-op. */
  save: () => Promise<void>;
  /** Close the proxy channel, stop the proxy process, and stop the sandbox. */
  stop: () => Promise<void>;
}

/**
 * Stand up a proxied sandbox whose in-sandbox model HTTP is recorded to (or
 * replayed from) `fixturePath` via the production fixture engine. The proxy is
 * scoped to the bridge spawn, so the harness bootstrap installs the CLI over a
 * clean network; only the agent's LLM HTTP is intercepted.
 *
 * For the bridge-backed adapters (claude-code, codex). Pi runs the model on the
 * host and uses the host-fetch interceptor instead.
 */
export async function startProxyInterception(opts: {
  adapterName: string;
  scenario: string;
  fixturePath: string;
  mode: InterceptionMode;
  bridgePort: number;
  proxyWsPort: number;
  sessionId: string;
  proxyPort?: number;
  createParams?: Parameters<typeof createProxiedSandbox>[0]['createParams'];
  signal?: AbortSignal;
}): Promise<ProxyInterception> {
  const proxyPort = opts.proxyPort ?? DEFAULT_PROXY_PORT;

  const identity: ReplayRuntimeIdentity = {
    adapterName: opts.adapterName,
    scenario: opts.scenario,
    fixtureKey: `e2e-${opts.scenario}-${opts.adapterName}`,
    sessionId: opts.sessionId,
    sandboxName: '',
    workDir: '',
    bridgeDir: '',
    proxyUrl: `http://${opts.sessionId}@127.0.0.1:${proxyPort}`,
  };

  let httpHandler: HttpHandler;
  let save: () => Promise<void>;
  if (opts.mode === 'record') {
    const recorder = createRecordingHandler(
      opts.fixturePath,
      `${opts.adapterName} ${opts.scenario}`,
      identity,
    );
    httpHandler = recorder.handler;
    save = recorder.save;
  } else {
    const replay = createReplayHandler(opts.fixturePath, identity);
    httpHandler = replay.handler;
    save = async () => {};
  }

  const proxied = await createProxiedSandbox({
    sessionId: opts.sessionId,
    bridgePort: opts.bridgePort,
    proxyWsPort: opts.proxyWsPort,
    proxyPort,
    httpHandler,
    ...(opts.createParams !== undefined
      ? { createParams: opts.createParams }
      : {}),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  });

  return {
    provider: proxied.provider,
    sessionId: proxied.sessionId,
    identity,
    save,
    stop: proxied.stop,
  };
}
