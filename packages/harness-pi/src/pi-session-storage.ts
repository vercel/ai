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
 * Caller-provided append-only storage for harness sessions, such as an object
 * store or a log. With a session storage, the lifecycle state holds the ids of
 * the appended parts of a session instead of the session itself, so it stays
 * small however long the session grows. Parts are never changed or deleted;
 * a part whose id no lifecycle state lists, such as one appended by a step
 * that crashed, is never read. The storage moves JSON values; the harness
 * decides what a part holds and checks it when it is read.
 */
export interface SessionStorage {
  /**
   * Appends one part of a session and returns its id.
   */
  append(options: {
    sessionId: string;
    data: HarnessV1JSONValue;
  }): PromiseLike<string>;

  /**
   * Reads the parts with the given ids, in the same order.
   */
  read(options: {
    sessionId: string;
    ids: ReadonlyArray<string>;
  }): PromiseLike<ReadonlyArray<HarnessV1JSONValue>>;
}

/**
 * Pi's `migrateSessionEntries` reads the version from the first header only,
 * so each part is migrated behind its own header before the parts are joined.
 */
export async function readSessionEntries({
  storage,
  sessionId,
  ids,
}: {
  storage: SessionStorage;
  sessionId: string;
  ids: ReadonlyArray<string>;
}): Promise<PiSessionEntries> {
  const data = await storage.read({ sessionId, ids });
  if (data.length !== ids.length) {
    throw new HarnessError({
      message: `The session storage returned ${data.length} parts for ${ids.length} ids.`,
    });
  }
  const parts = data.map((value, index) => {
    const result = piSessionEntriesSchema.safeParse(value);
    if (!result.success) {
      throw new HarnessError({
        message: `The Pi session part "${ids[index]}" is not a Pi session.`,
        cause: result.error,
      });
    }
    const part: FileEntry[] = structuredClone([...result.data]);
    migrateSessionEntries(part);
    return part as [FileEntry, ...FileEntry[]];
  });
  const [first, ...rest] = parts;
  return [
    ...first!,
    ...rest.flatMap(([, ...entries]) => entries),
  ] as PiSessionEntries;
}
