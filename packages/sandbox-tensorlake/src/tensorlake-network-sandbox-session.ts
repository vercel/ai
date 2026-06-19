import { type HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox, TcpTunnel } from 'tensorlake';
import {
  TENSORLAKE_DEFAULT_WORKING_DIRECTORY,
  TensorlakeSandboxSession,
} from './tensorlake-sandbox-session';

/**
 * Default port the harness bridge binds inside the sandbox. The harness reads
 * {@link TensorlakeNetworkSandboxSession.ports} to choose where to run its
 * WebSocket bridge (e.g. the claude-code bridge); it must be non-empty or the
 * harness has nowhere to bind. A dedicated high port avoids colliding with a
 * user's application ports. `9501` is reserved by Tensorlake, so it is avoided.
 */
export const TENSORLAKE_DEFAULT_BRIDGE_PORT = 41923;

/**
 * `HarnessV1NetworkSandboxSession` backed by a `tensorlake` `Sandbox`. The
 * provider's `createSession()` returns one of these. It extends
 * {@link TensorlakeSandboxSession} with the infra surface (ports, lifecycle,
 * port URLs). It owns the sandbox's lifecycle only when the provider created
 * it; when the provider was given an existing sandbox, `stop()` and `destroy()`
 * are no-ops (caller retains ownership).
 *
 * ## Port access via authenticated tunnels
 *
 * Tensorlake's public ingress (`https://<port>-<id>.sandbox.tensorlake.ai`)
 * requires a Tensorlake credential (`Authorization: Bearer …`) on every
 * request, which the harness cannot supply — it connects to the URL from
 * `getPortUrl` carrying only its own bridge token. So `getPortUrl` instead
 * opens a `tensorlake` TCP tunnel (an authenticated WebSocket the SDK secures
 * with the API key) and returns a `127.0.0.1` URL on the host. The harness
 * connects to localhost; the tunnel forwards to the in-sandbox port. Tunnels
 * are cached per remote port and closed when the session stops.
 *
 * Tensorlake cannot change outbound egress on a running sandbox — egress is
 * fixed at create time (`allowInternetAccess`/`allowOut`/`denyOut`) — so this
 * session intentionally omits `setNetworkPolicy`.
 */
export class TensorlakeNetworkSandboxSession
  extends TensorlakeSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  private readonly ownsLifecycle: boolean;
  private readonly resumable: boolean;
  private advertisedPorts: number[];
  private readonly tunnels = new Map<number, Promise<TcpTunnel>>();

  constructor(input: {
    sandbox: Sandbox;
    ownsLifecycle: boolean;
    ports?: ReadonlyArray<number>;
    workingDirectory?: string;
    /**
     * Whether `stop()` should suspend (preserving state for a later
     * `resumeSession`) rather than terminate. Defaults to whether the sandbox
     * is named, since only named sandboxes support suspend/resume. Pass
     * explicitly when the local handle's name is not yet populated — e.g. after
     * `Sandbox.connect()`, which returns a handle whose `name` is `null` until a
     * later server round-trip backfills it.
     */
    resumable?: boolean;
  }) {
    super(input.sandbox);
    this.ownsLifecycle = input.ownsLifecycle;
    this.resumable = input.resumable ?? input.sandbox.name != null;
    this.id = input.sandbox.sandboxId;
    // Advertise the bridge port first so a harness that picks `ports[0]` binds
    // its bridge to the dedicated port rather than a user application port.
    const extra = (input.ports ?? []).filter(
      port => port !== TENSORLAKE_DEFAULT_BRIDGE_PORT,
    );
    this.advertisedPorts = [TENSORLAKE_DEFAULT_BRIDGE_PORT, ...extra];
    this.defaultWorkingDirectory =
      input.workingDirectory ?? TENSORLAKE_DEFAULT_WORKING_DIRECTORY;
  }

  get ports(): ReadonlyArray<number> {
    return this.advertisedPorts;
  }

  restricted(): SandboxSession {
    return new TensorlakeSandboxSession(this.sandbox);
  }

  getPortUrl = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    const tunnel = await this.openTunnel(options.port);
    const protocol = options.protocol ?? 'http';
    // The tunnel is a raw TCP forward bound on localhost, so the URL targets
    // the local listener; the requested scheme is preserved end-to-end (the
    // bridge speaks plain `ws`).
    return `${protocol}://${tunnel.localHost}:${tunnel.localPort}`;
  };

  setPorts = async (ports: ReadonlyArray<number>): Promise<void> => {
    const extra = ports.filter(port => port !== TENSORLAKE_DEFAULT_BRIDGE_PORT);
    this.advertisedPorts = [TENSORLAKE_DEFAULT_BRIDGE_PORT, ...extra];
  };

  stop = async (): Promise<void> => {
    await this.closeTunnels();
    if (!this.ownsLifecycle) return;
    // Named sandboxes support suspend/resume; suspending preserves state for a
    // later `resumeSession`. Ephemeral (unnamed) sandboxes can only be
    // terminated.
    if (this.resumable) {
      await this.sandbox.suspend().catch(() => {});
    } else {
      await this.sandbox.terminate().catch(() => {});
    }
  };

  destroy = async (): Promise<void> => {
    await this.closeTunnels();
    if (!this.ownsLifecycle) return;
    await this.sandbox.terminate().catch(() => {});
  };

  /**
   * Open (or reuse) an authenticated TCP tunnel to a port inside the sandbox.
   * Cached per remote port so repeated `getPortUrl` calls (e.g. bridge
   * reconnects) share one local listener.
   */
  private openTunnel(port: number): Promise<TcpTunnel> {
    let tunnel = this.tunnels.get(port);
    if (tunnel == null) {
      // `localPort: 0` binds an ephemeral local port, avoiding collisions when
      // several sandboxes are tunneled from the same host.
      tunnel = this.sandbox.createTunnel(port, { localPort: 0 });
      this.tunnels.set(port, tunnel);
    }
    return tunnel;
  }

  private async closeTunnels(): Promise<void> {
    const pending = [...this.tunnels.values()];
    this.tunnels.clear();
    await Promise.all(
      pending.map(tunnel => tunnel.then(t => t.close()).catch(() => {})),
    );
  }
}
