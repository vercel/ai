import type { ReplayRuntimeIdentity } from './http-fixture';

/**
 * Assemble a `ReplayRuntimeIdentity` from the values observed on a live run.
 *
 * Unlike the original (which derived workdir/sandbox-name/proxy-url from a fixed
 * formula keyed off `sessionId`), the AI SDK provider decides the sandbox name
 * and working directory, and the proxy URL carries a random per-session token —
 * so the volatile values are supplied explicitly by the interceptor that owns
 * the live sandbox, not predicted here.
 */
export function buildReplayRuntimeIdentity(
  args: ReplayRuntimeIdentity,
): ReplayRuntimeIdentity {
  return { ...args };
}
