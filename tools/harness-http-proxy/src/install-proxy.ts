import { randomUUID } from 'node:crypto';
import type { Sandbox } from '@vercel/sandbox';
import {
  getHostLinuxProxyArch,
  normalizeLinuxProxyArch,
  readProxyBinary,
} from './proxy-binary';

const SERVER_BIN_NAME = 'vc-http-proxy-server';
const INSTALLED_BIN_PATH = `/usr/local/bin/${SERVER_BIN_NAME}`;
const RUNTIME_DIR = '/tmp/vercel/http-proxy';
const CONFIG_PATH = `${RUNTIME_DIR}/config.json`;
const DEFAULT_PROXY_PORT = 41007;

export interface RunningProxy {
  /** localhost port the in-sandbox HTTP proxy listens on (CLI's HTTP_PROXY target). */
  proxyPort: number;
  /** Per-session auth token embedded in the HTTP_PROXY URL and the WS query. */
  token: string;
  /** `ws(s)://…/ws?token=…` URL the host `ProxyChannel` connects to. */
  wsUrl: string;
  /** Stop the proxy process and remove its config. Idempotent. */
  stopServer: () => Promise<void>;
}

/**
 * Installs (if needed) and starts the vendored Go MITM proxy inside a
 * `@vercel/sandbox` sandbox, returning the coordinates the host channel needs.
 *
 * This is the privileged analog of the original `SandboxChannel.attach`'s
 * install + spawn steps (`ws-proxy/channel.ts`): the proxy writes a CA into the
 * system trust store and installs to `/usr/local/bin`, so it must run with
 * `sudo` — which is why it operates on the raw sandbox, not the harness's
 * tool-safe session surface. The binary install is idempotent (skipped when the
 * binary is already present, e.g. baked into a snapshot).
 */
export async function installAndStartProxy(opts: {
  sandbox: Sandbox;
  proxyWsPort: number;
  proxyPort?: number;
  token?: string;
  arch?: string;
  signal?: AbortSignal;
}): Promise<RunningProxy> {
  const { sandbox, proxyWsPort } = opts;
  const proxyPort = opts.proxyPort ?? DEFAULT_PROXY_PORT;
  const token = opts.token ?? randomUUID();
  const signal = opts.signal;

  await ensureBinaryInstalled({ sandbox, arch: opts.arch, signal });

  const command = await sandbox.runCommand({
    cmd: INSTALLED_BIN_PATH,
    args: [
      `--ws-port=${proxyWsPort}`,
      `--proxy-port=${proxyPort}`,
      `--token=${token}`,
    ],
    sudo: true,
    detached: true,
    ...(signal !== undefined ? { signal } : {}),
  });

  const httpsUrl = sandbox.domain(proxyWsPort);
  const wsUrl = `${httpsUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/ws?token=${token}`;

  let stopped = false;
  const stopServer = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    try {
      await command.kill();
    } catch {
      // best-effort: fall back to pkill below
    }
    await sandbox
      .runCommand({
        cmd: 'bash',
        args: [
          '-lc',
          `pkill -x ${SERVER_BIN_NAME} >/dev/null 2>&1 || true; rm -f ${CONFIG_PATH} >/dev/null 2>&1 || true`,
        ],
        sudo: true,
      })
      .catch(() => {});
  };

  return { proxyPort, token, wsUrl, stopServer };
}

async function ensureBinaryInstalled(opts: {
  sandbox: Sandbox;
  arch?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { sandbox, signal } = opts;

  const check = await sandbox.runCommand({
    cmd: 'test',
    args: ['-x', INSTALLED_BIN_PATH],
    ...(signal !== undefined ? { signal } : {}),
  });
  if (check.exitCode === 0) return;

  const arch = await resolveGuestArch({ sandbox, override: opts.arch, signal });
  const content = readProxyBinary(arch);
  const staged = `${RUNTIME_DIR}/${SERVER_BIN_NAME}-${randomUUID()}`;

  await sandbox
    .runCommand({
      cmd: 'mkdir',
      args: ['-p', RUNTIME_DIR],
      ...(signal !== undefined ? { signal } : {}),
    })
    .catch(() => {});
  await sandbox.writeFiles(
    [{ path: staged, content }],
    signal !== undefined ? { signal } : undefined,
  );
  await sandbox.runCommand({
    cmd: 'bash',
    args: [
      '-c',
      `mv "${staged}" "${INSTALLED_BIN_PATH}"; chmod +x "${INSTALLED_BIN_PATH}"`,
    ],
    sudo: true,
    ...(signal !== undefined ? { signal } : {}),
  });
}

async function resolveGuestArch(opts: {
  sandbox: Sandbox;
  override?: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (opts.override) return opts.override;
  const result = await opts.sandbox
    .runCommand({
      cmd: 'uname',
      args: ['-m'],
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    })
    .catch(() => null);
  const raw = result != null ? await result.stdout() : '';
  return normalizeLinuxProxyArch(raw) ?? getHostLinuxProxyArch();
}

export { INSTALLED_BIN_PATH, CONFIG_PATH, RUNTIME_DIR };
