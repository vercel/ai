import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import type { HarnessAgentStorageEncryption } from './create-storage-encryption';
import {
  decodeStreamRecords,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';
import type { SessionDriveOutcome } from './session-drives';

/**
 * Reads the records of one response from the session's World stream, which
 * holds every turn of the session, and returns them as a stream.
 *
 * Reading starts at the chunk `startIndex`. With `startTurnId`, records
 * before that turn's `start-turn` record (keyed `turn-start:${startTurnId}`)
 * are dropped; with `startSubmissionId`, records before the `start-turn`
 * record whose `submissionIds` include `startSubmissionId` are dropped. That
 * record and every record after it are delivered. How reading ends depends on
 * `driveEnd`:
 *
 * - With `driveEnd` resolving to `'ran'`, the stream belongs to one drive:
 *   once `driveEnd` resolved, reading continues up to the World stream's end
 *   at that moment and then closes. If `driveEnd` rejects, the stream errors
 *   with its reason. The drive flushes its writer before it settles, and every
 *   chunk of the World stream ends with a blank line; counting those lines is
 *   how the reader knows it reached that end.
 * - Without `driveEnd`, or when `driveEnd` resolves to `'skipped'` (because
 *   another drive owns the session or the current turn awaits tool approval
 *   responses), the stream follows the session across drives: `yield` records
 *   are dropped, and the stream closes right after the effective `settle`
 *   record. The chunks up to the World stream's end when reading starts are
 *   its history: a `settle` record in the history that other delivered records
 *   follow is superseded and dropped, and one that ends the history is
 *   delivered once the history was read. After the history, the first `settle`
 *   record is effective.
 *
 * Either way, the stream closes as soon as `abortSignal` fired, when the
 * World stream ends, or when it is cancelled. Reading never affects a drive.
 */
export function readResponseRecordStream(options: {
  encryption: HarnessAgentStorageEncryption;
  /**
   * World that stores the session's stream.
   */
  world: World;

  /**
   * Session whose stream is read.
   */
  session: HarnessAgentSession;

  /**
   * Index of the first World stream chunk to read.
   */
  startIndex: number;

  /**
   * ID of the turn whose `start-turn` record the response starts at, if
   * records before it are not part of the response.
   */
  startTurnId?: string;

  /**
   * ID of the `prompt` submission whose turn's `start-turn` record the
   * response starts at, if records before it are not part of the response.
   */
  startSubmissionId?: string;

  /**
   * Ends reading early.
   */
  abortSignal?: AbortSignal;

  /**
   * Settles once the drive that writes the response ended. Omit it to follow
   * the session until it settled; resolving to `'skipped'` also transitions to
   * following the session until it settled.
   */
  driveEnd?: Promise<SessionDriveOutcome>;
}): ReadableStream<HarnessAgentStreamPartRecord> {
  const {
    world,
    session,
    startTurnId,
    startSubmissionId,
    startIndex,
    abortSignal,
    driveEnd,
    encryption,
  } = options;
  const { runId } = session;
  const streamName = session.getStreamName();
  const startKey =
    startTurnId == null ? undefined : `turn-start:${startTurnId}`;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let ended = false;
  let onAbort = (): void => {};

  /**
   * Returns whether reading ended. `ended` is set by callbacks (the drive's
   * end, the abort signal, cancellation), so loops check it through this
   * function after every await.
   */
  const isEnded = (): boolean => ended;

  /**
   * Marks reading as ended and stops reading the World stream.
   */
  const release = (): void => {
    ended = true;
    abortSignal?.removeEventListener('abort', onAbort);
    void reader?.cancel().catch(() => {});
  };

  return new ReadableStream<HarnessAgentStreamPartRecord>({
    start(controller) {
      let lastChunk = startIndex - 1;
      let tailIndex: number | undefined;
      let historyTail: number | undefined;
      let heldSettle: HarnessAgentStreamPartRecord | undefined;
      let following = driveEnd == null;
      let deliveredSettle = false;
      let started = startKey == null && startSubmissionId == null;

      /**
       * Closes the stream, once.
       */
      const close = (): void => {
        if (ended) return;
        release();
        controller.close();
      };

      /**
       * Errors the stream, once.
       */
      const fail = (error: unknown): void => {
        if (ended) return;
        release();
        controller.error(error);
      };

      /**
       * Closes the stream once the drive settled and every chunk written
       * before that was read.
       */
      const closeIfDrained = (): void => {
        if (tailIndex != null && lastChunk >= tailIndex) close();
      };

      /**
       * Delivers a held `settle` record once the history was read, and
       * closes the stream after it.
       */
      const releaseHistory = (): void => {
        if (
          heldSettle == null ||
          historyTail == null ||
          lastChunk < historyTail
        ) {
          return;
        }
        controller.enqueue(heldSettle);
        heldSettle = undefined;
        close();
      };

      /**
       * Delivers a record of the response, dropping records before its start
       * and, when following the session, `yield` records. When following the
       * session, a `settle` record in the history is held until it is known
       * whether later records supersede it, and the stream closes after the
       * effective `settle` record.
       */
      const deliver = (record: HarnessAgentStreamPartRecord): void => {
        if (!started) {
          if (startKey != null) {
            if (record.key !== startKey) return;
          } else if (startSubmissionId != null) {
            if (
              record.part.type !== 'start-turn' ||
              !record.part.submissionIds?.includes(startSubmissionId)
            ) {
              return;
            }
          }
          started = true;
        }
        if (!following) {
          if (record.part.type === 'settle') deliveredSettle = true;
          controller.enqueue(record);
          return;
        }
        if (record.part.type === 'yield') return;
        if (record.part.type === 'settle') {
          if (historyTail != null && lastChunk < historyTail) {
            heldSettle = record;
            return;
          }
          controller.enqueue(record);
          close();
          return;
        }
        heldSettle = undefined;
        controller.enqueue(record);
      };

      if (abortSignal != null) {
        if (abortSignal.aborted) {
          close();
          return;
        }
        onAbort = close;
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      void driveEnd
        ?.then(async outcome => {
          if (outcome === 'skipped') {
            following = true;
            if (deliveredSettle) close();
            return;
          }
          tailIndex = (await world.streams.getInfo(runId, streamName))
            .tailIndex;
          closeIfDrained();
        })
        .catch(fail);

      void (async () => {
        if (driveEnd == null) {
          historyTail = (await world.streams.getInfo(runId, streamName))
            .tailIndex;
        }
        const stream = await world.streams.get(runId, streamName, startIndex);
        reader = stream.getReader();
        if (isEnded()) {
          void reader.cancel().catch(() => {});
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        while (!isEnded()) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (
            let index = buffer.indexOf('\n');
            index !== -1 && !isEnded();
            index = buffer.indexOf('\n')
          ) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (line === '') {
              lastChunk++;
              closeIfDrained();
              releaseHistory();
              continue;
            }
            for (const record of await decodeStreamRecords({
              text: line,
              encryption,
            })) {
              if (!isEnded()) deliver(record);
            }
          }
        }
        if (!isEnded() && buffer.length > 0) {
          throw new Error('HarnessAgentStream: truncated storage frame.');
        }
        close();
      })().catch(fail);
    },

    cancel() {
      release();
    },
  });
}

/**
 * Finds the `turnId` of the first turn in the session's latest API response by
 * scanning the session's World stream.
 *
 * A `start-turn` record begins a new API response when it is the first turn in
 * the stream or follows a `settle` record with no intervening output (meaning
 * the previous response settled before this turn started). A `start-turn` with
 * no preceding `settle` continues the same multi-turn API response, so the
 * response's starting turn stays unchanged. A tool-approval continuation writes
 * non-`start-turn` records after the approval pause's `settle`, which clears
 * the settled state and keeps the response anchored at the turn that requested
 * approval.
 *
 * Falls back to `latestTurnId` when the stream has not recorded `latestTurnId`
 * yet (for example after a crash between `turn-start` in the log and its stream
 * write) and either no response exists in the stream or the latest recorded
 * response already settled.
 */
export async function findLatestResponseStartTurnId(options: {
  /**
   * Storage encryption for the session's stream.
   */
  encryption: HarnessAgentStorageEncryption;

  /**
   * World that stores the session's stream.
   */
  world: World;

  /**
   * Session whose stream is scanned.
   */
  session: HarnessAgentSession;

  /**
   * Turn ID of the session's latest turn from the log, used as fallback if its
   * `start-turn` record has not been written to the stream yet.
   */
  latestTurnId: string;
}): Promise<string> {
  const { encryption, world, session, latestTurnId } = options;
  const { runId } = session;
  const streamName = session.getStreamName();
  const decoder = new TextDecoder();

  let responseStartTurnId: string | undefined;
  let settled = false;
  const seenTurnIds = new Set<string>();
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
        if (record.part.type === 'settle') {
          settled = true;
          continue;
        }
        if (record.part.type === 'yield') {
          continue;
        }
        if (
          record.part.type === 'start-turn' &&
          record.key?.startsWith('turn-start:')
        ) {
          const turnId = record.key.slice('turn-start:'.length);
          seenTurnIds.add(turnId);
          if (responseStartTurnId == null || settled) {
            responseStartTurnId = turnId;
          }
          settled = false;
          continue;
        }
        settled = false;
      }
    }
    if (!page.hasMore || page.cursor == null) break;
    cursor = page.cursor;
  }

  if (
    responseStartTurnId == null ||
    (settled && !seenTurnIds.has(latestTurnId))
  ) {
    return latestTurnId;
  }
  return responseStartTurnId;
}
