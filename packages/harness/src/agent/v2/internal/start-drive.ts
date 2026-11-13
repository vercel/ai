import type { SerializableValue } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import type { HarnessAgentLog, HarnessAgentLogEvent } from './create-log';
import {
  decodeStreamRecords,
  type HarnessAgentStreamPart,
  type HarnessAgentStreamWriter,
} from './create-stream-writer';
import {
  isDriveProcessGone,
  type HarnessAgentDriveProcess,
} from './drive-process';

/**
 * Log event of the given type.
 */
type LogEventOf<TYPE extends HarnessAgentLogEvent['type']> = Extract<
  HarnessAgentLogEvent,
  {
    /**
     * Type of the event.
     */
    type: TYPE;
  }
>;

/**
 * Identity of a drive, recorded on its `drive-start`: what tells the drive
 * apart from others, and what proves later that it is gone.
 */
export type HarnessAgentDriveIdentity = {
  /**
   * Identifier of the drive.
   */
  readonly driveId: string;

  /**
   * Runtime deadline of the drive's process in epoch milliseconds, if the
   * World reports one. Once it passed, the drive is gone.
   */
  readonly deadline?: number;

  /**
   * ID of the World queue message whose delivery runs the drive, if a queue
   * message started it. A later delivery of the same message proves the
   * drive is gone, since the queue only redelivers a message once its
   * previous handler lost it.
   */
  readonly queueMessageId?: string;

  /**
   * OS process that runs the drive, where it can be identified. Once that
   * process is gone, the drive is gone.
   */
  readonly process?: HarnessAgentDriveProcess;
};

/**
 * Starts a drive of a session: recovers what an earlier drive left behind,
 * appends the drive's `drive-start` event, and returns whether the drive
 * should run the harness. Returns `false` without changing the session when
 * it must not drive.
 *
 * Steps, decided from one read of the log:
 *
 * 1. Abandoned attempts are the latest `effect-start` of each effect key
 *    without an `effect-end`. If there are any, the drive that may still run
 *    them is the one of the latest `drive-start`, and it must provably be
 *    gone. A `drive-crash` proves that at once, but a drive that crashed
 *    for real records none, so without one, any of these proves it from the
 *    drive's `drive-start`: its deadline passed, this drive runs under a
 *    delivery of the same queue message (which the queue only redelivers
 *    once its previous handler lost it), or its process is gone. Without
 *    any proof (including when there is no `drive-start`), this returns
 *    `false`. Attribution by log position assumes one drive at a time.
 * 2. Without abandoned attempts, an unfinished latest turn, or a `prompt`
 *    submission that has not started its turn, there is nothing to drive and
 *    this returns `false`.
 * 3. The drive's `drive-start` is appended (ID `drive-start:${driveId}`),
 *    with the drive's identity as its data.
 * 4. Each abandoned attempt gets an `effect-end` with an `interrupted` output
 *    and its last committed partial, if any. It is retryable if its replay
 *    policy is `safe`, or if it is a tool call attempt (key `tool:...`)
 *    without a `tool-execution-start` event, which provably never ran its
 *    tool.
 * 5. If the latest turn is unfinished, its stream is repaired: its `start`
 *    part and its latest `finish-step` part are written under their log keys
 *    if no record with that key is in the stream (a crash between the log
 *    append and the stream write loses the part), and a `retract` part
 *    lists the turn's latest attempts whose output is a retryable
 *    interruption, since a retry replaces their output. A non-retryable
 *    interruption's output stays, matching the partial output the harness
 *    receives. A finished turn is not repaired.
 */
export async function startDrive(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;

  /**
   * Writer for the session's stream, owned by the drive.
   */
  writer: HarnessAgentStreamWriter;

  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session to drive.
   */
  session: HarnessAgentSession;

  /**
   * Identity of the drive.
   */
  driveIdentity: HarnessAgentDriveIdentity;
}): Promise<boolean> {
  const { log, writer, world, session, driveIdentity } = options;
  const { events } = await log.read();

  const latestStarts = new Map<string, LogEventOf<'effect-start'>>();
  const outputs = new Map<string, HarnessV2EffectOutput>();
  const partials = new Map<string, SerializableValue>();
  const executed = new Set<string>();
  const crashedDrives = new Set<string>();
  const startedTurns = new Set<string>();
  const finishedTurns = new Set<string>();
  const prompts: string[] = [];
  const startPositions = new Map<string, number>();
  let latestDrive: LogEventOf<'drive-start'> | undefined;
  let turnId: string | undefined;
  let turnPosition = -1;
  let latestFinishStep: LogEventOf<'finish-step'> | undefined;

  for (const [position, event] of events.entries()) {
    switch (event.type) {
      case 'submission':
        if (event.data.type === 'prompt') prompts.push(event.id);
        break;
      case 'turn-start':
        startedTurns.add(event.data.turnId);
        turnId = event.data.turnId;
        turnPosition = position;
        latestFinishStep = undefined;
        break;
      case 'finish-step':
        if (event.data.turnId === turnId) latestFinishStep = event;
        break;
      case 'finish-turn':
        finishedTurns.add(event.data.turnId);
        break;
      case 'effect-start':
        latestStarts.set(event.data.key, event);
        startPositions.set(event.id, position);
        break;
      case 'effect-progress':
        partials.set(event.data.startId, event.data.partial);
        break;
      case 'effect-end':
        if (!outputs.has(event.data.startId)) {
          outputs.set(event.data.startId, event.data.output);
        }
        break;
      case 'tool-execution-start':
        executed.add(event.data.startId);
        break;
      case 'drive-start':
        latestDrive = event;
        break;
      case 'drive-crash':
        crashedDrives.add(event.data.driveId);
        break;
      default:
    }
  }

  const abandoned = [...latestStarts.values()].filter(
    start => !outputs.has(start.id),
  );
  if (
    abandoned.length > 0 &&
    !isDriveGone({
      drive: latestDrive?.data,
      crashedDrives,
      queueMessageId: driveIdentity.queueMessageId,
    })
  ) {
    return false;
  }

  const turnUnfinished = turnId != null && !finishedTurns.has(turnId);
  const promptWaiting = prompts.some(prompt => !startedTurns.has(prompt));
  if (abandoned.length === 0 && !turnUnfinished && !promptWaiting) {
    return false;
  }

  await log.append({
    type: 'drive-start',
    id: `drive-start:${driveIdentity.driveId}`,
    data: driveIdentity,
  });

  for (const start of abandoned) {
    const retryable =
      start.data.replay === 'safe' ||
      (start.data.key.startsWith('tool:') && !executed.has(start.id));
    const output: HarnessV2EffectOutput = partials.has(start.id)
      ? { type: 'interrupted', retryable, partial: partials.get(start.id) }
      : { type: 'interrupted', retryable };
    await log.append({
      type: 'effect-end',
      id: generateId(),
      data: { startId: start.id, output },
    });
    outputs.set(start.id, output);
  }

  if (turnId == null || !turnUnfinished) return true;

  const keys = new Set<string>();
  const { runId } = session;
  const streamName = session.getStreamName();
  const decoder = new TextDecoder();
  let cursor: string | undefined;
  for (;;) {
    const page = await world.streams.getChunks(runId, streamName, {
      limit: 1000,
      cursor,
    });
    for (const chunk of page.data) {
      for (const record of await decodeStreamRecords({
        text: decoder.decode(chunk.data),
      })) {
        if (record.key != null) keys.add(record.key);
      }
    }
    if (!page.hasMore || page.cursor == null) break;
    cursor = page.cursor;
  }

  const startKey = `turn-start:${turnId}`;
  if (!keys.has(startKey)) {
    writer.emit({ part: { type: 'start' }, key: startKey });
  }

  const retracted = [...latestStarts.values()]
    .filter(start => {
      const output = outputs.get(start.id);
      return (
        (startPositions.get(start.id) ?? -1) > turnPosition &&
        output?.type === 'interrupted' &&
        output.retryable
      );
    })
    .map(start => start.id);
  if (retracted.length > 0) writer.retract({ startIds: retracted });

  if (latestFinishStep != null && !keys.has(latestFinishStep.id)) {
    const part: Extract<HarnessAgentStreamPart, { type: 'finish-step' }> = {
      type: 'finish-step',
      finishReason: latestFinishStep.data.finishReason,
      usage: latestFinishStep.data.usage,
    };
    if (latestFinishStep.data.harnessMetadata != null) {
      part.harnessMetadata = latestFinishStep.data.harnessMetadata;
    }
    writer.emit({ part, key: latestFinishStep.id });
  }

  return true;
}

/**
 * Returns whether the drive with the given identity is provably gone,
 * checking the synthetic `drive-crash` record first and then what the
 * drive's identity recorded. Returns `false` without a drive.
 */
function isDriveGone(options: {
  /**
   * Identity of the session's latest drive, from its `drive-start`.
   */
  drive?: HarnessAgentDriveIdentity;

  /**
   * IDs of the drives that recorded a `drive-crash`.
   */
  crashedDrives: Set<string>;

  /**
   * ID of the World queue message whose delivery runs the current drive.
   */
  queueMessageId?: string;
}): boolean {
  const { drive, crashedDrives, queueMessageId } = options;
  if (drive == null) return false;
  return (
    crashedDrives.has(drive.driveId) ||
    (drive.deadline != null && drive.deadline <= Date.now()) ||
    (queueMessageId != null && drive.queueMessageId === queueMessageId) ||
    (drive.process != null &&
      isDriveProcessGone({ driveId: drive.driveId, process: drive.process }))
  );
}
