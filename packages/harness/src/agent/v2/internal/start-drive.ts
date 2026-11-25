import type { SerializableValue } from '@ai-sdk/provider';
import { generateId, type ToolSet } from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import type { HarnessAgentStorageEncryption } from './create-storage-encryption';
import type { HarnessV2EffectOutput } from '../../../v2/harness-v2-effect';
import type { HarnessV2BuiltinToolSet } from '../../../v2/harness-v2-builtin-tool';
import {
  isDynamicToolCall,
  parseToolEffect,
} from './create-execute-tool-functions';
import type {
  HarnessAgentLog,
  HarnessAgentLogDrive,
  HarnessAgentLogTurn,
} from './create-log';
import {
  decodeStreamRecords,
  type HarnessAgentStreamPart,
  type HarnessAgentStreamWriter,
} from './create-stream-writer';
import {
  isDriveProcessGone,
  type HarnessAgentDriveProcess,
} from './drive-process';
import {
  createToolApprovalRequestPart,
  isPendingToolApproval,
} from './tool-approval';

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
 * 2. Without abandoned attempts, a settled session (see `isSessionSettled()`)
 *    has nothing to drive and this returns `false`. If its current turn
 *    waits for tool approval responses, its stream is checked first: when
 *    the `tool-approval-request` part of a pending approval is missing
 *    (a crash between the log append and the stream write loses it), or no
 *    `settle` part follows the last of those parts, the drive appends its
 *    `drive-start`, repairs the turn's stream like in step 5, writes the
 *    missing approval request parts and a `settle` part, and still returns
 *    `false`, since the harness has nothing to run.
 * 3. The drive's `drive-start` is appended (ID `drive-start:${driveId}`),
 *    with the drive's identity as its data.
 * 4. Each abandoned attempt gets an `effect-end` with an `interrupted` output
 *    and its last committed partial, if any. It is retryable if its replay
 *    policy is `safe`, or if it is a tool call attempt (key `tool:...`)
 *    without a `tool-execution-start` event, which provably never ran its
 *    tool.
 * 5. If the current turn is unfinished, its stream is repaired: its `start-turn`
 *    part and its latest `finish-step` part are written under their log keys
 *    if no record with that key is in the stream (a crash between the log
 *    append and the stream write loses the part), and a `retract` part
 *    lists the turn's latest attempts whose output is a retryable
 *    interruption, since a retry replaces their output. A non-retryable
 *    interruption's output stays, matching the partial output the harness
 *    receives. Each of the turn's tool calls whose latest attempt is a
 *    non-retryable interruption gets a `tool-error` part under the
 *    key `tool-interrupted:${startId}`, unless the stream has it already:
 *    the tool does not run again, so no other part ends the call. A
 *    finished turn is not repaired.
 */
export async function startDrive(options: {
  encryption: HarnessAgentStorageEncryption;
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

  /**
   * The agent's tools, used to recreate tool parts lost from the stream.
   */
  tools: ToolSet;

  /**
   * The harness's built-in tools, used to recreate tool parts lost from the
   * stream.
   */
  builtinTools: HarnessV2BuiltinToolSet;
}): Promise<boolean> {
  const {
    log,
    writer,
    world,
    session,
    driveIdentity,
    encryption,
    tools,
    builtinTools,
  } = options;
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
  if (abandoned.length === 0 && isSessionSettled({ log })) {
    if (turn == null || !turnUnfinished) return false;
    const records = await readStreamKeys({ encryption, world, session });
    const pending = log
      .getToolApprovals({ turnId: turn.start.data.turnId })
      .filter(isPendingToolApproval);
    const requestPositions = pending.map(approval =>
      records.positions.get(approval.request.id),
    );
    const repair =
      requestPositions.some(position => position == null) ||
      requestPositions.some(position => position! > records.lastSettle);
    if (!repair) return false;

    await log.append({
      type: 'drive-start',
      id: `drive-start:${driveIdentity.driveId}`,
      data: driveIdentity,
    });
    repairTurnStream({
      log,
      writer,
      turn,
      keys: records.positions,
      tools,
      builtinTools,
    });
    for (const approval of pending) {
      if (records.positions.has(approval.request.id)) continue;
      writer.emit({
        part: createToolApprovalRequestPart({
          request: approval.request.data,
          tools,
        }),
        key: approval.request.id,
      });
    }
    writer.unsafeEmit({ type: 'settle' });
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
  const records = await readStreamKeys({ encryption, world, session });
  repairTurnStream({
    log,
    writer,
    turn,
    keys: records.positions,
    tools,
    builtinTools,
  });
  return true;
}

/**
 * Keys of a session's stream records and where they are, read from the
 * whole stream.
 */
type StreamKeys = {
  /**
   * Index of the first record with each key, counting every record of the
   * stream.
   */
  positions: Map<string, number>;

  /**
   * Index of the last `settle` record, or `-1` if there is none.
   */
  lastSettle: number;
};

/**
 * Reads every record of a session's stream and returns where its keyed
 * records and its last `settle` record are.
 */
async function readStreamKeys(options: {
  encryption: HarnessAgentStorageEncryption;

  /**
   * World that stores the session.
   */
  world: World;

  /**
   * Session whose stream is read.
   */
  session: HarnessAgentSession;
}): Promise<StreamKeys> {
  const { encryption, world, session } = options;
  const positions = new Map<string, number>();
  let lastSettle = -1;
  let index = 0;
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
        encryption,
        text: decoder.decode(chunk.data),
      })) {
        if (record.key != null && !positions.has(record.key)) {
          positions.set(record.key, index);
        }
        if (record.part.type === 'settle') lastSettle = index;
        index++;
      }
    }
    if (!page.hasMore || page.cursor == null) break;
    cursor = page.cursor;
  }
  return { positions, lastSettle };
}

/**
 * Repairs the stream of an unfinished turn (step 5 of `startDrive()`): writes
 * its missing `start-turn` and latest `finish-step` parts, retracts the
 * output of its retryable interruptions, and ends its tool calls that were
 * interrupted without a retry.
 */
function repairTurnStream(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;

  /**
   * Writer for the session's stream, owned by the drive.
   */
  writer: HarnessAgentStreamWriter;

  /**
   * The unfinished turn.
   */
  turn: HarnessAgentLogTurn;

  /**
   * Keys of the records already in the stream.
   */
  keys: ReadonlyMap<string, number>;

  /**
   * The agent's tools.
   */
  tools: ToolSet;

  /**
   * The harness's built-in tools.
   */
  builtinTools: HarnessV2BuiltinToolSet;
}): void {
  const { log, writer, turn, keys, tools, builtinTools } = options;
  const { turnId } = turn.start.data;

  const startKey = `turn-start:${turnId}`;
  if (!keys.has(startKey)) {
    writer.emit({ part: { type: 'start-turn' }, key: startKey });
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
    const { toolCallId, toolName } = toolEffect;
    const error = describeInterruptedToolCall({
      toolName,
      partial: output.partial,
    });
    /*
     * Built-in tools are executed by the harness runtime, so their calls are
     * provider-executed. A user tool cannot have the name of a built-in tool.
     */
    const toolCallFields = {
      toolCallId,
      toolName,
      input: start.data.input,
      ...(Object.hasOwn(builtinTools, toolName) && { providerExecuted: true }),
    };
    writer.emit({
      part: isDynamicToolCall({ toolName, tools, builtinTools })
        ? { type: 'tool-error', ...toolCallFields, error, dynamic: true }
        : { type: 'tool-error', ...toolCallFields, error },
      key,
    });
  }
}

/**
 * Returns whether the session's current turn waits for tool approval
 * responses: it is unfinished, no cancel waits for it, and at least one
 * approval requested during it has neither a response submission nor an
 * applied response. Such a turn has nothing to run until the responses
 * arrive.
 */
export function isAwaitingToolApproval(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;
}): boolean {
  const { log } = options;
  const turn = log.getCurrentTurn();
  if (turn == null || turn.finish != null) return false;
  if (
    log
      .getUndeliveredSubmissions()
      .some(submission => submission.data.type === 'cancel')
  ) {
    return false;
  }
  return log
    .getToolApprovals({ turnId: turn.start.data.turnId })
    .some(isPendingToolApproval);
}

/**
 * Returns whether the session has nothing left to drive for now: no prompt
 * waits to start a turn, and the current turn is absent, finished, or waits
 * for tool approval responses (see `isAwaitingToolApproval()`).
 */
export function isSessionSettled(options: {
  /**
   * Engine log of the session.
   */
  log: HarnessAgentLog;
}): boolean {
  const { log } = options;
  if (hasWaitingPrompt({ log })) return false;
  const turn = log.getCurrentTurn();
  return turn == null || turn.finish != null || isAwaitingToolApproval({ log });
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
  if (options.drive.crash != null || options.drive.error != null) return true;
  const drive = options.drive.start.data;
  return (
    (drive.deadline != null && drive.deadline <= Date.now()) ||
    (queueJobId != null && drive.queueJobId === queueJobId) ||
    (drive.process != null &&
      isDriveProcessGone({ driveId: drive.driveId, process: drive.process }))
  );
}
