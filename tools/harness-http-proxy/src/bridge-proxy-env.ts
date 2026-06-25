import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';

type SandboxSession = ReturnType<HarnessV1NetworkSandboxSession['restricted']>;
type SpawnArgs = Parameters<SandboxSession['spawn']>[0];

/**
 * Wrap a sandbox provider so the proxy env is merged into the bridge-launch
 * `spawn` env only — never the sandbox create-time env, and never `run` /
 * file-IO calls.
 *
 * This is what scopes the in-sandbox MITM proxy to the agent: the harness
 * bootstrap (CLI install) and every recipe step run through `run`, which is
 * left untouched, so they hit the network directly and install cleanly. The
 * bridge process is launched through the restricted session's `spawn` — the
 * only `spawn` call site in any bridge adapter — and the agent CLI inherits
 * that env, so its LLM HTTP is the only traffic the proxy intercepts.
 *
 * The overlay rides entirely on the existing V1 surface (the network sandbox
 * session the provider already hands to `HarnessAgent`), so no harness or
 * adapter code changes.
 *
 * Invariant this depends on: `spawn` is used exclusively to launch the bridge.
 * If a future bridge adapter spawned a non-bridge process, that process's
 * traffic would also be routed through the proxy — benign (captured like any
 * other exchange), but worth knowing.
 *
 * The adapter's own env (`BRIDGE_*`, gateway/Anthropic auth) is spread last so
 * it always wins on any key collision.
 */
export function withBridgeProxyEnv(
  provider: HarnessV1SandboxProvider,
  bridgeProxyEnv: Record<string, string>,
): HarnessV1SandboxProvider {
  const spawnHandler =
    (target: { spawn: SandboxSession['spawn'] }) => (args: SpawnArgs) =>
      target.spawn({
        ...args,
        env: { ...bridgeProxyEnv, ...args.env },
      });

  const wrapSession = (session: SandboxSession): SandboxSession =>
    new Proxy(session, {
      get(target, prop) {
        if (prop === 'spawn') {
          return spawnHandler(target);
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  const wrapNetworkSession = (
    sandboxSession: HarnessV1NetworkSandboxSession,
  ): HarnessV1NetworkSandboxSession =>
    new Proxy(sandboxSession, {
      get(target, prop) {
        // Adapters launch the bridge via `restricted().spawn`; tools also
        // receive the restricted view. Inject the proxy env into both.
        if (prop === 'restricted') {
          return () => wrapSession(target.restricted());
        }
        // Defensive: the network sandbox session itself exposes `spawn`.
        if (prop === 'spawn') {
          return spawnHandler(target);
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'create') {
        return async (
          opts?: Parameters<HarnessV1SandboxProvider['create']>[0],
        ) => wrapNetworkSession(await target.create(opts));
      }
      if (prop === 'resume') {
        const resume = target.resume;
        if (resume == null) return undefined;
        return async (
          opts: Parameters<NonNullable<HarnessV1SandboxProvider['resume']>>[0],
        ) => wrapNetworkSession(await resume.call(target, opts));
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
