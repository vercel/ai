import type { SerializableValue } from '@ai-sdk/provider';
import { generateId } from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import { parseToolEffect } from './create-execute-tool-functions';
import type { HarnessAgentLog, HarnessAgentLogDrive } from './create-log';
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
   * ID of the queue job whose delivery runs the drive, if a queue job
   * started it. A later delivery of the same queue job proves the drive is
   * gone, since the queue only redelivers a queue job once its previous
   * handler lost it.
   */
  readonly queueJobId?: string;

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
 * Steps, decided from the log after one refresh:
 *
 * 1. Abandoned attempts are the latest accepted attempts of each effect key
 *    without an end. If there are any, the drive that may still run
 *    them is the one of the latest `drive-start`, and it must provably be
 *    gone. A `drive-crash` proves that at once, but a drive that crashed
 *    for real records none, so without one, any of these proves it from the
 *    drive's `drive-start`: its deadline passed, this drive runs under a
 *    delivery of the same queue job (which the queue only redelivers once
 *    its previous handler lost it), or its process is gone. Without
 *    any proof (including when there is no `drive-start`), this returns
 *    `false`. Attributing the attempts to the latest drive assumes one
 *    drive at a time.
 * 2. Without abandoned attempts, an unfinished current turn, or an
 *    undelivered `prompt` submission that has not started a turn, there is
 *    nothing to drive and this returns `false`.
 * 3. The drive's `drive-start` is appended (ID `drive-start:${driveId}`),
 *    with the drive's identity as its data.
 * 4. Each abandoned attempt gets an `effect-end` with an `interrupted` output
 *    and its last committed partial, if any. It is retryable if its replay
 *    policy is `safe`, or if it is a tool call attempt (key `tool:...`)
 *    without a `tool-execution-start` event, which provably never ran its
 *    tool.
 * 5. If the current turn is unfinished, its stream is repaired: its `start`
 *    part and its latest `finish-step` part are written under their log keys
 *    if no record with that key is in the stream (a crash between the log
 *    append and the stream write loses the part), and a `retract` part
 *    lists the turn's latest attempts whose output is a retryable
 *    interruption, since a retry replaces their output. A non-retryable
 *    interruption's output stays, matching the partial output the harness
 *    receives. Each of the turn's tool calls whose latest attempt is a
 *    non-retryable interruption gets an error `tool-result` part under the
 *    key `tool-interrupted:${startId}`, unless the stream has it already:
 *    the tool does not run again, so no other part ends the call. A
 *    finished turn is not repaired.
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
  await log.refresh();

  const abandoned = log.getEffects().filter(attempt => attempt.end == null);
  if (
    abandoned.length > 0 &&
    !isDriveGone({
      drive: log.getLatestDrive(),
      queueJobId: driveIdentity.queueJobId,
    })
  ) {
    return false;
  }

  const turn = log.getCurrentTurn();
  const turnUnfinished = turn != null && turn.finish == null;
  const promptWaiting = hasWaitingPrompt({ log });
  if (abandoned.length === 0 && !turnUnfinished && !promptWaiting) {
    return false;
  }

  await log.append({
    type: 'drive-start',
    id: `drive-start:${driveIdentity.driveId}`,
    data: driveIdentity,
  });

  for (const { start, progress } of abandoned) {
    const retryable =
      start.data.replay === 'safe' ||
      (parseToolEffect(start.data) != null &&
        !log.hasToolExecutionStart({ startId: start.id }));
    const output: HarnessV2EffectOutput = progress
      ? { type: 'interrupted', retryable, partial: progress.data.partial }
      : { type: 'interrupted', retryable };
    await log.append({
      type: 'effect-end',
      id: generateId(),
      data: { startId: start.id, output },
    });
  }

  if (turn == null || !turnUnfinished) return true;
  const { turnId } = turn.start.data;

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

  const turnAttempts = log.getEffects({ turnId });
  const retracted = turnAttempts
    .filter(attempt => {
      const output = attempt.end?.data.output;
      return output?.type === 'interrupted' && output.retryable;
    })
    .map(attempt => attempt.start.id);
  if (retracted.length > 0) writer.retract({ startIds: retracted });

  const latestFinishStep = turn.steps.at(-1);
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

  for (const { start, end } of turnAttempts) {
    const output = end?.data.output;
    const toolEffect = parseToolEffect(start.data);
    const key = `tool-interrupted:${start.id}`;
    if (
      toolEffect == null ||
      output?.type !== 'interrupted' ||
      output.retryable ||
      keys.has(key)
    ) {
      continue;
    }
    writer.emit({
      part: {
        type: 'tool-result',
        toolCallId: toolEffect.toolCallId,
        toolName: toolEffect.toolName,
        result: describeInterruptedToolCall({
          toolName: toolEffect.toolName,
          partial: output.partial,
        }),
        isError: true,
      },
      key,
    });
  }

  return true;
}

/**
 * Returns whether the log has an undelivered `prompt` submission that has not
 * started a turn. A prompt whose turn started counts as started even if no
 * effect delivered it, e.g. when its turn failed before its first effect
 * start committed.
 */
export function hasWaitingPrompt(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;
}): boolean {
  const { log } = options;
  const startedPrompts = new Set(
    log
      .getTurns()
      .flatMap(turn => turn.submissions.map(submission => submission.id)),
  );
  return log
    .getUndeliveredSubmissions()
    .some(
      submission =>
        submission.data.type === 'prompt' && !startedPrompts.has(submission.id),
    );
}

/**
 * Describes a tool call that a crashed drive interrupted, as the error
 * result of its `tool-result` part. Includes the call's last partial output,
 * if any, since that is all that is known about what the call did.
 */
function describeInterruptedToolCall(options: {
  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * Last partial output of the call, as recorded by `executeHostTool()` or
   * `executeBuiltinTool()`.
   */
  partial?: SerializableValue;
}): string {
  const { toolName, partial } = options;
  const message = `The ${toolName} call was interrupted before it finished.`;
  if (partial == null || typeof partial !== 'object' || !('raw' in partial)) {
    return message;
  }
  return `${message}\nPartial output before the interruption:\n${JSON.stringify(partial.raw)}`;
}

/**
 * Returns whether the drive with the given identity is provably gone,
 * checking its recorded crash first and then what the drive's identity
 * recorded. Returns `false` without a drive.
 */
function isDriveGone(options: {
  /**
   * Latest drive of the session.
   */
  drive?: HarnessAgentLogDrive;

  /**
   * ID of the queue job whose delivery runs the current drive.
   */
  queueJobId?: string;
}): boolean {
  const { queueJobId } = options;
  if (options.drive == null) return false;
  if (options.drive.crash != null) return true;
  const drive = options.drive.start.data;
  return (
    (drive.deadline != null && drive.deadline <= Date.now()) ||
    (queueJobId != null && drive.queueJobId === queueJobId) ||
    (drive.process != null &&
      isDriveProcessGone({ driveId: drive.driveId, process: drive.process }))
  );
}
