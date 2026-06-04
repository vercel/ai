import type {
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
  HarnessV1SandboxSession,
} from '@ai-sdk/harness';

type SpawnArgs = Parameters<HarnessV1SandboxSession['spawn']>[0];

/**
 * Wrap a sandbox provider so the proxy env is merged into the bridge-launch
 * `spawn` env only — never the sandbox create-time env, and never `run` /
 * file-IO calls.
 *
 * This is what scopes the in-sandbox MITM proxy to the agent: the harness
 * bootstrap (CLI install) and every recipe step run through `session.run`,
 * which is left untouched, so they hit the network directly and install
 * cleanly. The bridge process is launched through `session.spawn` — the only
 * `spawn` call site in any bridge adapter — and the agent CLI inherits that
 * env, so its LLM HTTP is the only traffic the proxy intercepts.
 *
 * The overlay rides entirely on the existing V1 surface (the handle the tool
 * already hands to `HarnessAgent`), so no harness or adapter code changes.
 *
 * Invariant this depends on: `session.spawn` is used exclusively to launch the
 * bridge. If a future bridge adapter spawned a non-bridge process, that
 * process's traffic would also be routed through the proxy — benign (captured
 * like any other exchange), but worth knowing.
 *
 * The adapter's own env (`BRIDGE_*`, gateway/Anthropic auth) is spread last so
 * it always wins on any key collision.
 */
export function withBridgeProxyEnv(
  provider: HarnessV1SandboxProvider,
  bridgeProxyEnv: Record<string, string>,
): HarnessV1SandboxProvider {
  const wrapSession = (
    session: HarnessV1SandboxSession,
  ): HarnessV1SandboxSession =>
    new Proxy(session, {
      get(target, prop) {
        if (prop === 'spawn') {
          return (args: SpawnArgs) =>
            target.spawn({
              ...args,
              env: { ...bridgeProxyEnv, ...args.env },
            });
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  const wrapHandle = (handle: HarnessV1SandboxHandle): HarnessV1SandboxHandle =>
    new Proxy(handle, {
      get(target, prop) {
        if (prop === 'session') {
          return wrapSession(target.session);
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
        ) => wrapHandle(await target.create(opts));
      }
      if (prop === 'resume') {
        const resume = target.resume;
        if (resume == null) return undefined;
        return async (
          opts: Parameters<NonNullable<HarnessV1SandboxProvider['resume']>>[0],
        ) => wrapHandle(await resume.call(target, opts));
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
