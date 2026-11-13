import type { World } from '@workflow/world';
import type { HarnessAgentSession } from '../harness-agent-session';
import {
  decodeStreamRecords,
  type HarnessAgentStreamPartRecord,
} from './create-stream-writer';

/**
 * Reads the records of one turn from the session's World stream, which holds
 * every turn of the session, and returns them as a stream.
 *
 * Reading starts at the chunk `startIndex`. Records before the turn's `start`
 * record (keyed `turn-start:${turnId}`) are dropped; that record and every
 * record after it are delivered. How reading ends depends on `driveEnd`:
 *
 * - With `driveEnd`, the stream belongs to one drive: once `driveEnd`
 *   resolved, reading continues up to the World stream's end at that moment
 *   and then closes. If `driveEnd` rejects, the stream errors with its
 *   reason. The drive flushes its writer before it settles, and every chunk
 *   of the World stream ends with a blank line; counting those lines is how
 *   the reader knows it reached that end.
 * - Without `driveEnd`, the stream follows the turn across drives: `yield`
 *   records are dropped, and the stream closes right after the turn's
 *   `finish` record (keyed `finish-turn:${turnId}`).
 *
 * Either way, the stream closes as soon as `abortSignal` fired, when the
 * World stream ends, or when it is cancelled. Reading never affects a drive.
 */
export function readTurnRecordStream(options: {
  /**
   * World that stores the session's stream.
   */
  world: World;

  /**
   * Session whose stream is read.
   */
  session: HarnessAgentSession;

  /**
   * ID of the turn whose records are delivered.
   */
  turnId: string;

  /**
   * Index of the first World stream chunk to read.
   */
  startIndex: number;

  /**
   * Ends reading early.
   */
  abortSignal?: AbortSignal;

  /**
   * Settles once the drive that writes the turn ended. Omit it to follow the
   * turn until it finished.
   */
  driveEnd?: Promise<void>;
}): ReadableStream<HarnessAgentStreamPartRecord> {
  const { world, session, turnId, startIndex, abortSignal, driveEnd } = options;
  const { runId } = session;
  const streamName = session.getStreamName();
  const startKey = `turn-start:${turnId}`;
  const finishKey = `finish-turn:${turnId}`;

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
      let started = false;

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
       * Delivers a record of the turn, dropping records before its start
       * and, when following the turn, `yield` records. Closes after the
       * turn's finish when following the turn.
       */
      const deliver = (record: HarnessAgentStreamPartRecord): void => {
        if (!started) {
          if (record.key !== startKey) return;
          started = true;
        }
        if (driveEnd == null && record.part.type === 'yield') return;
        controller.enqueue(record);
        if (driveEnd == null && record.key === finishKey) close();
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
        ?.then(async () => {
          tailIndex = (await world.streams.getInfo(runId, streamName))
            .tailIndex;
          closeIfDrained();
        })
        .catch(fail);

      void (async () => {
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
              continue;
            }
            for (const record of await decodeStreamRecords({ text: line })) {
              if (!isEnded()) deliver(record);
            }
          }
        }
        close();
      })().catch(fail);
    },

    cancel() {
      release();
    },
  });
}
