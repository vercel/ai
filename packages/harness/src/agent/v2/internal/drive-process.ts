import { generateId } from '@ai-sdk/provider-utils';

/**
 * OS process that runs a drive, recorded on its `drive-start`. Recovery uses
 * it to prove that a drive which left attempts unfinished is gone, without
 * any record written by the drive itself.
 */
export type HarnessAgentDriveProcess = {
  /**
   * `process.pid` of the process.
   */
  readonly pid: number;

  /**
   * Random ID minted once per process start. Tells this process apart from
   * any later process, including one that reuses the pid.
   */
  readonly bootId: string;

  /**
   * Host name of the machine the process runs on. A process on another host
   * is never judged.
   */
  readonly hostname: string;

  /**
   * Start time of the process in epoch milliseconds, compared with the start
   * time the OS reports for the pid to detect pid reuse.
   */
  readonly startedAt: number;
};

/**
 * Process-wide state, kept on `globalThis` under a registered symbol, since
 * bundlers may load several copies of this module into one process (e.g. one
 * per Next.js route), and they must all agree on the process's identity and
 * on the drives running in it.
 */
type DriveProcessState = {
  /**
   * Whether this process's identity was determined, so that it is
   * determined only once, including when it cannot be identified.
   */
  identified: boolean;

  /**
   * Identity of this process, if it can be identified.
   */
  identity?: HarnessAgentDriveProcess;

  /**
   * IDs of the drives that run in this process.
   */
  runningDriveIds: Set<string>;
};

const STATE_KEY = Symbol.for('ai-sdk.harness-agent.drive-process');

/**
 * Tolerance for comparing a recorded process start time with the one
 * derived from the OS, which reports elapsed time in whole seconds.
 */
const START_TIME_TOLERANCE_MS = 3000;

/**
 * Returns Node's `process`, read from `globalThis` so that this module loads
 * in runtimes without it. Its members may still be missing in runtimes that
 * only emulate parts of it.
 */
function getNodeProcess(): Partial<NodeJS.Process> | undefined {
  return (globalThis as { process?: Partial<NodeJS.Process> }).process;
}

/**
 * Returns the process-wide state, created on first use.
 */
function getState(): DriveProcessState {
  const holder = globalThis as { [STATE_KEY]?: DriveProcessState };
  holder[STATE_KEY] ??= { identified: false, runningDriveIds: new Set() };
  return holder[STATE_KEY];
}

/**
 * Returns the identity of this process, computed once per process, or
 * `undefined` where processes cannot be identified and checked: outside
 * Node, and on Vercel, where a function instance's process cannot be checked
 * from another instance and recovery relies on queue redelivery and the
 * runtime deadline instead.
 */
export function getDriveProcess(): HarnessAgentDriveProcess | undefined {
  const state = getState();
  if (state.identified) return state.identity;
  state.identified = true;

  const nodeProcess = getNodeProcess();
  const os = nodeProcess?.getBuiltinModule?.('node:os');
  if (
    nodeProcess?.env?.VERCEL ||
    typeof nodeProcess?.pid !== 'number' ||
    typeof nodeProcess.uptime !== 'function' ||
    os == null
  ) {
    return undefined;
  }

  state.identity = {
    pid: nodeProcess.pid,
    bootId: generateId(),
    hostname: os.hostname(),
    startedAt: Math.round(Date.now() - nodeProcess.uptime() * 1000),
  };
  return state.identity;
}

/**
 * Registers a drive as running in this process until the returned function
 * is called.
 */
export function trackRunningDrive(options: {
  /**
   * Identifier of the drive.
   */
  driveId: string;
}): () => void {
  const { runningDriveIds } = getState();
  runningDriveIds.add(options.driveId);
  return () => {
    runningDriveIds.delete(options.driveId);
  };
}

/**
 * Returns whether the drive recorded with the given process is provably
 * gone because its process is. Returns `false` whenever that cannot be told
 * for certain, since a live drive must never be taken for gone:
 *
 * - This process cannot be identified, or the drive ran on another host.
 * - The drive ran in this very process (same `bootId`): it is gone unless it
 *   is still running here.
 * - Otherwise its process is gone if its pid is free, belongs to a zombie, or
 *   now belongs to a process that started at another time (a reused pid).
 */
export function isDriveProcessGone(options: {
  /**
   * Identifier of the drive.
   */
  driveId: string;

  /**
   * Process recorded on the drive's `drive-start`.
   */
  process: HarnessAgentDriveProcess;
}): boolean {
  const { driveId, process: driveProcess } = options;
  const self = getDriveProcess();
  if (self == null || driveProcess.hostname !== self.hostname) return false;
  if (driveProcess.bootId === self.bootId) {
    return !getState().runningDriveIds.has(driveId);
  }
  return isProcessGone({ process: driveProcess });
}

/**
 * Returns whether a process with the given pid exists, including a zombie.
 * A process that exists but cannot be signaled by this one counts as alive.
 */
function isAlive(options: {
  /**
   * Pid of the process.
   */
  pid: number;
}): boolean {
  try {
    getNodeProcess()?.kill?.(options.pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: unknown }).code === 'EPERM';
  }
}

/**
 * Parses an elapsed time as `ps` reports it (`[[dd-]hh:]mm:ss`) into
 * seconds.
 */
function parseElapsedSeconds(options: {
  /**
   * Elapsed time as `ps` reports it.
   */
  elapsed: string;
}): number {
  const [days, clock] = options.elapsed.includes('-')
    ? options.elapsed.split('-')
    : ['0', options.elapsed];
  const parts = clock.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [hours, minutes, seconds] = parts;
  return Number(days) * 86_400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Returns whether the recorded process is gone, as the OS reports it at
 * this moment: its pid is free, belongs to a zombie, or belongs to a
 * process that started at another time. Returns `false` if that cannot be
 * told, e.g. because `ps` is unavailable.
 */
function isProcessGone(options: {
  /**
   * Recorded process.
   */
  process: HarnessAgentDriveProcess;
}): boolean {
  const { pid, startedAt } = options.process;
  if (!isAlive({ pid })) return true;

  const childProcess =
    getNodeProcess()?.getBuiltinModule?.('node:child_process');
  if (childProcess == null) return false;

  let output: string;
  try {
    output = childProcess
      .execFileSync('ps', ['-o', 'stat=,etime=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 2000,
      })
      .trim();
  } catch {
    /*
     * `ps` exits with an error for a pid that is gone by now, but also when
     * it is unavailable, so only a failed liveness check counts as gone.
     */
    return !isAlive({ pid });
  }
  if (output === '') return true;

  const [state = '', elapsed = ''] = output.split(/\s+/);
  if (state.startsWith('Z')) return true;
  const pidStartedAt = Date.now() - parseElapsedSeconds({ elapsed }) * 1000;
  return Math.abs(pidStartedAt - startedAt) > START_TIME_TOLERANCE_MS;
}
