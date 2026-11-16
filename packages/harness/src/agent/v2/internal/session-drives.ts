import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';

/*
 * Tracks the sessions claimed for a drive in this process, so that only one
 * drive of a session runs in the process at a time. A `stream()`,
 * `generate()` or `drive()` call of a HarnessAgent claims the session as
 * soon as it accepts the call, before its drive starts, and releases it once
 * its drive ended. Calls that do not drive the session, like
 * `readStream()`, do not claim it.
 *
 * A claim only covers this process: it does not keep a drive in another
 * process from changing the session.
 *
 * A session is identified by the ID of the World run that holds it, which
 * is unique within its World, so the state is kept per World and, within
 * it, by run ID.
 *
 * The state is on `globalThis` under a registered symbol, since bundlers may
 * load several copies of this module into one process (e.g. one per Next.js
 * route), and a claim must be seen through every copy.
 */
const STATE_KEY = Symbol.for('@ai-sdk/harness//session-drives');

/**
 * Returns the IDs of the runs that hold the sessions of `world` claimed for
 * a drive in this process, created on first use.
 */
function getClaimedRunIds(options: { world: World }): Set<string> {
  const holder = globalThis as {
    [STATE_KEY]?: WeakMap<World, Set<string>>;
  };
  const runIdsByWorld = (holder[STATE_KEY] ??= new WeakMap());
  let runIds = runIdsByWorld.get(options.world);
  if (runIds == null) {
    runIds = new Set();
    runIdsByWorld.set(options.world, runIds);
  }
  return runIds;
}

/**
 * Claims the session for a drive in this process, from the moment a call
 * that drives it is accepted until that drive ended. Returns `false` without
 * changing anything if the session is already claimed in this process, i.e.
 * a drive of it is running or about to start here. Does not wait for the
 * claim to be released, and does not keep a drive in another process from
 * changing the session.
 */
export function claimSessionDrive(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session to claim.
   */
  session: HarnessAgentSession;
}): boolean {
  const runIds = getClaimedRunIds({ world: options.world });
  if (runIds.has(options.session.runId)) return false;
  runIds.add(options.session.runId);
  return true;
}

/**
 * Releases the session's claim in this process once its drive ended, or
 * once the call that claimed it failed before its drive started, so that
 * another drive of the session can start in this process.
 */
export function releaseSessionDrive(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session to release.
   */
  session: HarnessAgentSession;
}): void {
  getClaimedRunIds({ world: options.world }).delete(options.session.runId);
}
