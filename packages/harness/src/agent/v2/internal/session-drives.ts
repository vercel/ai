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
 * Outcome of an in-process session drive: `'ran'` when at least one pass
 * executed the harness, `'skipped'` when `startDrive()` found nothing to run
 * (for example, another process owns the session or the current turn awaits
 * tool approval responses).
 */
export type SessionDriveOutcome = 'ran' | 'skipped';

/**
 * In-process bookkeeping for a claimed session drive.
 */
type ActiveSessionDrive = {
  /**
   * Promise that settles when the active drive (including any follow-up passes
   * for prompts queued in this process) ends.
   */
  driveEnd?: Promise<SessionDriveOutcome>;

  /**
   * Whether another call in this process queued a prompt while this drive was
   * active, so the drive must re-check the log before releasing its claim.
   */
  hasQueuedWork: boolean;
};

/**
 * Returns the map of active drive claims for `world` in this process, created
 * on first use.
 */
function getClaimedDrives(options: {
  world: World;
}): Map<string, ActiveSessionDrive> {
  const holder = globalThis as {
    [STATE_KEY]?: WeakMap<World, Map<string, ActiveSessionDrive>>;
  };
  const drivesByWorld = (holder[STATE_KEY] ??= new WeakMap());
  let drives = drivesByWorld.get(options.world);
  if (drives == null) {
    drives = new Map();
    drivesByWorld.set(options.world, drives);
  }
  return drives;
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
  const drives = getClaimedDrives({ world: options.world });
  if (drives.has(options.session.runId)) return false;
  drives.set(options.session.runId, { hasQueuedWork: false });
  return true;
}

/**
 * Associates the active drive's completion promise with an existing in-process
 * claim so queued prompt calls in the same process can observe its end.
 */
export function attachSessionDrive(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Claimed session.
   */
  session: HarnessAgentSession;

  /**
   * Promise settling when the active drive finishes.
   */
  driveEnd: Promise<SessionDriveOutcome>;
}): void {
  const active = getClaimedDrives({ world: options.world }).get(
    options.session.runId,
  );
  if (active != null) active.driveEnd = options.driveEnd;
}

/**
 * Returns the completion promise of the session's active in-process drive, if
 * one is attached.
 */
export function getActiveSessionDrive(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session to inspect.
   */
  session: HarnessAgentSession;
}): Promise<SessionDriveOutcome> | undefined {
  return getClaimedDrives({ world: options.world }).get(options.session.runId)
    ?.driveEnd;
}

/**
 * Records that a prompt was queued in this process while the session's drive
 * is active, so the drive re-checks the log before releasing its claim.
 */
export function markSessionDriveQueuedWork(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session whose active drive should re-check for queued prompts.
   */
  session: HarnessAgentSession;
}): void {
  const active = getClaimedDrives({ world: options.world }).get(
    options.session.runId,
  );
  if (active != null) active.hasQueuedWork = true;
}

/**
 * Returns whether queued work was marked on the session's active drive since
 * the last check, clearing the flag.
 */
export function consumeSessionDriveQueuedWork(options: {
  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session whose active drive is finishing a pass.
   */
  session: HarnessAgentSession;
}): boolean {
  const active = getClaimedDrives({ world: options.world }).get(
    options.session.runId,
  );
  if (active == null || !active.hasQueuedWork) return false;
  active.hasQueuedWork = false;
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
  getClaimedDrives({ world: options.world }).delete(options.session.runId);
}
