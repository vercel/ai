import type { World } from '@workflow/world';

/**
 * Queue prefix of the drive queue. It has a namespace of its own (`harness`),
 * so its messages never reach the Workflow SDK's own consumer, which takes
 * `__wkf_workflow_` (or `__<WORKFLOW_QUEUE_NAMESPACE>_wkf_workflow_`).
 */
export const DRIVE_QUEUE_PREFIX = '__harness_wkf_workflow_';

/**
 * Queue name of every drive message.
 */
export const DRIVE_QUEUE_NAME = `${DRIVE_QUEUE_PREFIX}drive`;

/**
 * Seconds a backstop is delayed past the deadline of the drive it covers, so
 * that the drive's process is provably gone once it is delivered.
 */
const BACKSTOP_MARGIN_SECONDS = 5;

/**
 * Why a drive message was sent.
 *
 * - `backstop`: sent when a drive starts, delayed past its deadline.
 * - `recovery`: sent at startup for a session a dead process may have left
 *   unfinished.
 */
export type DriveQueueMessageReason = 'backstop' | 'recovery';

/**
 * A request for a background drive of one session. Fits the World's
 * `QueuePayload` (`{ runId: string; input?: unknown }`). The session is
 * rebuilt from its run, which holds the session's IDs.
 */
export type DriveQueueMessage = {
  runId: string;
  input: {
    kind: 'harness-drive';
    reason: DriveQueueMessageReason;
  };
};

/**
 * The parts of an agent that a background drive needs.
 */
export type DriveQueueAgent<SESSION> = {
  createSession(options: { runId: string }): Promise<SESSION>;
  drive(options: { session: SESSION; queueMessageId?: string }): Promise<void>;
};

/**
 * Returns whether a queue message is a drive message.
 */
export function isDriveQueueMessage(
  message: unknown,
): message is DriveQueueMessage {
  if (typeof message !== 'object' || message == null) return false;
  const { runId, input } = message as Record<string, unknown>;
  if (typeof runId !== 'string') return false;
  if (typeof input !== 'object' || input == null) return false;
  const { kind, reason } = input as Record<string, unknown>;
  return (
    kind === 'harness-drive' && (reason === 'backstop' || reason === 'recovery')
  );
}

async function sendDriveMessage({
  world,
  runId,
  reason,
  delaySeconds,
}: {
  world: World;
  runId: string;
  reason: DriveQueueMessageReason;
  delaySeconds?: number;
}): Promise<void> {
  const message: DriveQueueMessage = {
    runId,
    input: { kind: 'harness-drive', reason },
  };
  await world.queue(DRIVE_QUEUE_NAME, message, {
    ...(delaySeconds != null && { delaySeconds }),
  });
}

/**
 * Sends a backstop for a drive of the session that is about to start in
 * this process: a drive message delayed past the process's runtime
 * deadline. If the drive finished by then, the background drive finds
 * nothing to do; if it yielded or crashed, it continues the turn.
 *
 * Must be sent before the drive starts, so that a crash at any point of the
 * drive is covered. Returns `false` without sending anything if the World
 * reports no deadline (world-local), where a process restart recovers
 * sessions instead (see `recoverDrives`).
 */
export async function sendBackstop({
  world,
  runId,
}: {
  world: World;
  runId: string;
}): Promise<boolean> {
  const deadline = await world.getRuntimeDeadline?.();
  if (deadline == null) return false;
  const delaySeconds =
    Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / 1000)) +
    BACKSTOP_MARGIN_SECONDS;
  await sendDriveMessage({ world, runId, reason: 'backstop', delaySeconds });
  return true;
}

/**
 * Sends a drive message without delay for every pending or running session
 * run of the given workflow, so that sessions a dead process left
 * unfinished continue. Sessions with nothing to do end their drive at once.
 * Returns the number of messages sent.
 */
export async function recoverDrives({
  world,
  workflowName,
}: {
  world: World;
  workflowName: string;
}): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await world.runs.list({
      workflowName,
      status: ['pending', 'running'],
      resolveData: 'none',
      ...(cursor != null && { pagination: { cursor } }),
    });
    for (const run of page.data) {
      await sendDriveMessage({
        world,
        runId: run.runId,
        reason: 'recovery',
      });
      count++;
    }
    if (!page.hasMore || page.cursor == null) break;
    cursor = page.cursor;
  }
  return count;
}

/**
 * Runs the background drive a drive message asks for, under the message's
 * ID, so that a later delivery of the same message proves this drive gone.
 *
 * Before it drives, it sends a backstop for its own deadline: the queue
 * counts the message as handled once the drive returned, so nothing else
 * would continue a turn whose drive yielded at that deadline.
 */
export async function consumeDriveQueueMessage<SESSION>({
  world,
  agent,
  message,
  messageId,
}: {
  world: World;
  agent: DriveQueueAgent<SESSION>;
  message: unknown;
  messageId: string;
}): Promise<void> {
  if (!isDriveQueueMessage(message)) {
    console.warn('[drive-queue] ignoring an unknown message', { messageId });
    return;
  }
  const { runId, input } = message;
  console.log('[drive-queue] drive', {
    runId,
    reason: input.reason,
    messageId,
  });
  const session = await agent.createSession({ runId });
  await sendBackstop({ world, runId });
  await agent.drive({ session, queueMessageId: messageId });
}

/**
 * Creates the HTTP handler of the drive queue, for a route the World
 * delivers drive messages to (on Vercel, a Function subscribed to
 * `__harness_wkf_workflow_*`).
 */
export function createDriveQueueHandler<SESSION>({
  world,
  agent,
}: {
  world: World;
  agent: DriveQueueAgent<SESSION>;
}): (request: Request) => Promise<Response> {
  return world.createQueueHandler(DRIVE_QUEUE_PREFIX, (message, meta) =>
    consumeDriveQueueMessage({
      world,
      agent,
      message,
      messageId: meta.messageId,
    }),
  );
}
