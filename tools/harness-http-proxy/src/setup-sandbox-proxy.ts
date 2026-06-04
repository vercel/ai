import { randomUUID } from 'node:crypto';
import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { withBridgeProxyEnv } from './bridge-proxy-env';
import { installAndStartProxy } from './install-proxy';
import { ProxyChannel } from './proxy-channel';
import {
  type ConnectHandler,
  type HttpHandler,
  resolveHttpHandler,
} from './proxy-handler';

/** System trust anchor the Go proxy writes its CA to (matches the binary). */
const CERT_PATH = '/etc/pki/ca-trust/source/anchors/vc-proxy-ca.pem';
const DEFAULT_PROXY_PORT = 41007;

type CreateSandboxParams = NonNullable<Parameters<typeof Sandbox.create>[0]>;

export interface ProxiedSandbox {
  /** Provider wrapping the prepared sandbox — pass to `HarnessAgent`. */
  provider: HarnessV1SandboxProvider;
  /** Stable session id; reuse as the `HarnessAgent` session id. */
  sessionId: string;
  /** Bridge WS port leased by the harness session. */
  bridgePort: number;
  /** Proxy WS port the host channel is connected on. */
  proxyWsPort: number;
  /** Close the proxy channel, stop the proxy process, and stop the sandbox. */
  stop: () => Promise<void>;
}

/**
 * Stand up a Vercel sandbox with the in-sandbox MITM proxy wired to a host-side
 * `httpHandler`, and return a provider ready to hand to `HarnessAgent`.
 *
 * This composes only existing surfaces — a privileged in-sandbox install/start,
 * the wrap-existing-sandbox provider path, and a `spawn`-env overlay
 * (`withBridgeProxyEnv`) that injects the proxy env into the bridge launch only
 * — so no harness or adapter change is needed. The proxy env is deliberately
 * NOT set at sandbox-create time: the harness bootstrap (CLI install) runs over
 * a clean network, and only the bridge process and the agent CLI it spawns are
 * proxied. The agent CLI's HTTPS is MITM'd by the proxy and surfaced to
 * `httpHandler` (record/replay); leave it undefined for live passthrough.
 *
 * With `networkPolicy: 'deny-all'`, a replay run is provably offline: the CLI
 * reaches only the localhost proxy, which serves the recording host-side.
 */
export async function createProxiedSandbox(opts: {
  sessionId?: string;
  bridgePort: number;
  proxyWsPort: number;
  httpHandler?: HttpHandler;
  connectHandler?: ConnectHandler;
  proxyPort?: number;
  /** Extra `Sandbox.create` params (networkPolicy, source, timeout, env, …). */
  createParams?: Partial<CreateSandboxParams>;
  signal?: AbortSignal;
}): Promise<ProxiedSandbox> {
  const sessionId = opts.sessionId ?? randomUUID();
  const proxyPort = opts.proxyPort ?? DEFAULT_PROXY_PORT;
  const sessionToken = randomUUID();
  const signal = opts.signal;

  const proxyUrl = `http://${sessionId}:${sessionToken}@127.0.0.1:${proxyPort}`;
  const proxyEnv: Record<string, string> = {
    HTTP_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    NODE_EXTRA_CA_CERTS: CERT_PATH,
    SSL_CERT_FILE: CERT_PATH,
    REQUESTS_CA_BUNDLE: CERT_PATH,
    CURL_CA_BUNDLE: CERT_PATH,
    CODEX_CA_CERTIFICATE: CERT_PATH,
  };

  const createParams = opts.createParams ?? {};
  const ports = dedupePorts([
    opts.bridgePort,
    opts.proxyWsPort,
    ...((createParams.ports as number[] | undefined) ?? []),
  ]);

  const sandbox = await Sandbox.create({
    ...createParams,
    ports,
    ...(signal !== undefined ? { signal } : {}),
  } as CreateSandboxParams);

  const channel = new ProxyChannel();
  let running: Awaited<ReturnType<typeof installAndStartProxy>> | undefined;
  try {
    running = await installAndStartProxy({
      sandbox,
      proxyWsPort: opts.proxyWsPort,
      proxyPort,
      ...(signal !== undefined ? { signal } : {}),
    });
    await channel.connect(running.wsUrl);
    await channel.register({
      sessionId,
      token: sessionToken,
      proxyPort,
      httpHandler: resolveHttpHandler(opts.httpHandler),
      ...(opts.connectHandler !== undefined
        ? { connectHandler: opts.connectHandler }
        : {}),
    });
  } catch (error) {
    await channel.close().catch(() => {});
    await running?.stopServer().catch(() => {});
    await sandbox.stop().catch(() => {});
    throw error;
  }

  const startedProxy = running;
  const provider = withBridgeProxyEnv(
    createVercelSandbox({
      sandbox,
      bridgePorts: [opts.bridgePort],
    }),
    proxyEnv,
  );

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await channel.close().catch(() => {});
    await startedProxy.stopServer().catch(() => {});
    await sandbox.stop().catch(() => {});
  };

  return {
    provider,
    sessionId,
    bridgePort: opts.bridgePort,
    proxyWsPort: opts.proxyWsPort,
    stop,
  };
}

function dedupePorts(ports: number[]): number[] {
  return [...new Set(ports)];
}
