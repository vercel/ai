import { HarnessError, type HarnessV1JSONValue } from '@ai-sdk/harness';
import {
  type FileEntry,
  migrateSessionEntries,
} from '@earendil-works/pi-coding-agent';
import {
  piSessionEntriesSchema,
  type PiSessionEntries,
} from './pi-lifecycle-state';

/**
 * Caller-provided append-only log for harness sessions, such as an object
 * store, a database table or a stream. With a session storage, the harness
 * appends each lifecycle state's new session entries to the log as one part,
 * and the lifecycle state holds only a pointer to where the session ends.
 * Parts are never changed or deleted. A regenerated turn, a retried step or a
 * second turn resumed from the same state appends a new branch, and the
 * pointer in each lifecycle state selects its own branch. The storage moves
 * JSON values; the harness decides what a part holds and checks it when it
 * is read.
 */
export interface PiSessionStorage {
  /**
   * Appends one part to the log of a session.
   */
  append(options: {
    sessionId: string;
    data: HarnessV1JSONValue;
    abortSignal?: AbortSignal;
  }): PromiseLike<void>;

  /**
   * Reads every part of the log of a session, in the order they were
   * appended.
   */
  read(options: {
    sessionId: string;
    abortSignal?: AbortSignal;
  }): PromiseLike<ReadonlyArray<HarnessV1JSONValue>>;
}

/**
 * Pi's `migrateSessionEntries` reads the version from the first header only,
 * so each part is migrated behind its own header before the parts are joined.
 */
export async function readSessionEntries({
  storage,
  sessionId,
  abortSignal,
}: {
  storage: PiSessionStorage;
  sessionId: string;
  abortSignal?: AbortSignal;
}): Promise<PiSessionEntries | undefined> {
  const values = await storage.read({ sessionId, abortSignal });
  const parts = values.map((value, index) => {
    const result = piSessionEntriesSchema.safeParse(structuredClone(value));
    if (!result.success) {
      throw new HarnessError({
        message: `Part ${index} of the Pi session "${sessionId}" is not a Pi session.`,
        cause: result.error,
      });
    }
    migrateSessionEntries(result.data as unknown as FileEntry[]);
    return result.data;
  });
  const [first, ...rest] = parts;
  if (first == null) return undefined;
  return [...first, ...rest.flatMap(([, ...entries]) => entries)];
}
