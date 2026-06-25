import type { HttpHandler } from 'harness-http-proxy';
import type { ReplayRuntimeIdentity } from '../http-fixture';
import {
  createRecordingHandler,
  createReplayHandler,
} from '../record-replay-handler';
import type { InterceptionMode } from './proxy-interceptor';

/** Model host Pi talks to by default (the Vercel AI Gateway). */
const DEFAULT_INTERCEPT_HOSTS = ['ai-gateway.vercel.sh'];

export interface HostFetchInterception {
  /**
   * Volatile per-run identity. Only `sessionId` is meaningful (it is embedded in
   * the sandbox name and workdir paths, and placeholder replacement substitutes
   * it anywhere it appears); sandbox-path matching is handled by normalization.
   */
  identity: ReplayRuntimeIdentity;
  /** Record mode: write the redaction-audited fixture. Replay mode: no-op. */
  save: () => Promise<void>;
  /** Restore the original `globalThis.fetch`. Idempotent. */
  restore: () => void;
}

/**
 * Intercept Pi's host-side model HTTP by overriding `globalThis.fetch`. Pi runs
 * the model in-process via the `ai` package's gateway provider, which uses the
 * global `fetch` with the real gateway URL — so a scoped override records or
 * replays the model calls with the same fixture engine the proxy path uses, no
 * in-sandbox proxy needed.
 *
 * Only requests to `interceptHosts` are routed through the engine; everything
 * else passes through to the real `fetch`. Recording forwards via the captured
 * original `fetch`, so it never recurses back into this override.
 *
 * Process-global: Pi scenarios using this must run serially (no two concurrent
 * overrides of `globalThis.fetch` in one worker). Call `restore()` in a
 * `finally`.
 */
export function startHostFetchInterception(opts: {
  adapterName: string;
  scenario: string;
  fixturePath: string;
  mode: InterceptionMode;
  sessionId: string;
  interceptHosts?: string[];
  /**
   * Always-used handler bypassing record/replay (synthetic error / abort
   * scenarios — serves a canned response, never recorded).
   */
  syntheticHandler?: HttpHandler;
}): HostFetchInterception {
  const interceptHosts = opts.interceptHosts ?? DEFAULT_INTERCEPT_HOSTS;

  const identity: ReplayRuntimeIdentity = {
    adapterName: opts.adapterName,
    scenario: opts.scenario,
    fixtureKey: `e2e-${opts.scenario}-${opts.adapterName}`,
    sessionId: opts.sessionId,
    sandboxName: '',
    workDir: '',
    bridgeDir: '',
    proxyUrl: '',
  };

  const originalFetch = globalThis.fetch;

  let handler: (request: Request) => Promise<Response>;
  let save: () => Promise<void>;
  if (opts.syntheticHandler) {
    const synthetic = opts.syntheticHandler;
    handler = async request => synthetic(request);
    save = async () => {};
  } else if (opts.mode === 'record') {
    const recorder = createRecordingHandler(
      opts.fixturePath,
      `${opts.adapterName} ${opts.scenario}`,
      identity,
      { fetchImpl: originalFetch },
    );
    handler = recorder.handler;
    save = recorder.save;
  } else {
    const replay = createReplayHandler(opts.fixturePath, identity);
    handler = async request => replay.handler(request);
    save = async () => {};
  }

  const overridden: typeof globalThis.fetch = (input, init) => {
    let host: string;
    try {
      host = new URL(urlOf(input)).host;
    } catch {
      return originalFetch(input, init);
    }
    if (!interceptHosts.includes(host)) {
      return originalFetch(input, init);
    }
    return handler(new Request(input, init));
  };

  globalThis.fetch = overridden;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (globalThis.fetch === overridden) {
      globalThis.fetch = originalFetch;
    }
  };

  return { identity, save, restore };
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
